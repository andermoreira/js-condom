import { webcrack as defaultWebcrack } from 'webcrack';
import * as acorn from 'acorn';
import * as escodegen from 'escodegen';
import { getOracleEvaluatorPath, runModuleInSandbox } from '../runner/sandbox.js';
import {
  createEmbeddedArtifact,
  evaluateBehaviorOracle,
} from '../runner/semantic-runner.js';
import {
  buildEvaluatorView,
  buildMappingArtifact,
  createBlindingRegistry,
  lockResults,
  shuffleEvaluationQueue,
} from './blinding.js';

const IMPLEMENTED_EVALUATORS = new Set([
  'eval-webcrack',
  'eval-ast-compare',
  'eval-human-rubric',
]);

function pairKey(taskId, evaluatorId) {
  return `${taskId}:${evaluatorId}`;
}

function getRecoveryBudget(manifest, evaluatorId) {
  return manifest.budgets.recovery.find((entry) => entry.evaluatorId === evaluatorId) ?? null;
}

function getEvaluator(manifest, evaluatorId) {
  return manifest.evaluators.find((entry) => entry.id === evaluatorId) ?? null;
}

function getTask(manifest, taskId) {
  return manifest.recoveryTasks.find((entry) => entry.id === taskId) ?? null;
}

function resolveDeps(deps = {}) {
  return {
    webcrack: deps.webcrack ?? defaultWebcrack,
    runModuleInSandbox: deps.runModuleInSandbox ?? runModuleInSandbox,
    evaluateBehaviorOracle: deps.evaluateBehaviorOracle ?? evaluateBehaviorOracle,
    now: deps.now ?? (() => Date.now()),
  };
}

function buildTrialResult({
  blindArtifactId,
  taskId,
  evaluatorId,
  trial,
  outcome,
  oracle,
  effort,
  recoveredCode,
  diagnostics,
}) {
  const result = {
    blindArtifactId,
    taskId,
    evaluatorId,
    trial,
    outcome,
    oracle,
    effort,
    diagnostics: [...diagnostics],
  };

  if (recoveredCode !== undefined && recoveredCode !== null) {
    result.recoveredArtifact = createEmbeddedArtifact(recoveredCode);
  }

  return result;
}

async function evaluateRecoveredOracle({
  manifest,
  caseEntry,
  recoveredCode,
  oracleId,
  deps,
}) {
  const sandboxResult = await deps.runModuleInSandbox({
    source: recoveredCode,
    behaviorId: caseEntry.expectedBehaviorId,
    oracleEvaluatorPath: getOracleEvaluatorPath(),
    processTimeoutMs: manifest.budgets.processTimeoutMs,
    memoryBytes: manifest.budgets.memoryBytes,
    blockNetwork: true,
  });

  if (sandboxResult.timedOut) {
    return {
      passed: false,
      diagnostics: ['recovered artifact exceeded semantic sandbox timeout'],
    };
  }

  if (sandboxResult.exitCode !== 0 || !sandboxResult.oracle) {
    return {
      passed: false,
      diagnostics: [
        'recovered artifact failed semantic sandbox execution',
        ...(sandboxResult.stderr ? [sandboxResult.stderr.trim()] : []),
      ],
    };
  }

  const oracleMode =
    oracleId === 'oracle-behavior-human' ? 'human-rubric' : 'automated';

  return {
    passed: sandboxResult.oracle.passed === true,
    mode: oracleMode,
    diagnostics: sandboxResult.oracle.diagnostics ?? [],
  };
}

async function runWebcrackRecoveryAttempt({
  sourceCode,
  budget,
  manifest,
  caseEntry,
  task,
  deps,
  remainingMs,
}) {
  const startedAt = deps.now();
  let toolInvocations = 0;

  try {
    const result = await Promise.race([
      deps.webcrack(sourceCode, {
        deobfuscate: false,
        unpack: false,
        unminify: true,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('recovery_timeout')), remainingMs);
      }),
    ]);

    toolInvocations += 1;
    const recoveredCode = result.code;
    const oracleResult = await evaluateRecoveredOracle({
      manifest,
      caseEntry,
      recoveredCode,
      oracleId: task.oracleId,
      deps,
    });
    const wallClockMs = Math.min(deps.now() - startedAt, budget.wallClockMs);

    if (oracleResult.passed) {
      return {
        outcome: 'completed',
        oracle: {
          id: task.oracleId,
          passed: true,
          mode: oracleResult.mode ?? 'automated',
        },
        effort: {
          wallClockMs,
          attempts: 1,
          toolInvocations,
        },
        recoveredCode,
        diagnostics: [],
      };
    }

    return {
      outcome: 'failed',
      oracle: {
        id: task.oracleId,
        passed: false,
        mode: oracleResult.mode ?? 'automated',
      },
      effort: {
        wallClockMs,
        attempts: 1,
        toolInvocations,
      },
      recoveredCode,
      diagnostics: oracleResult.diagnostics,
    };
  } catch (error) {
    const wallClockMs = Math.min(deps.now() - startedAt, budget.wallClockMs);
    const message = error instanceof Error ? error.message : String(error);

    if (message === 'recovery_timeout') {
      return {
        outcome: 'timeout',
        oracle: {
          id: task.oracleId,
          passed: false,
          mode: 'automated',
        },
        effort: {
          wallClockMs: budget.wallClockMs,
          attempts: 1,
          toolInvocations,
        },
        diagnostics: [`recovery exceeded wall-clock budget of ${budget.wallClockMs}ms`],
      };
    }

    return {
      outcome: 'tool_error',
      oracle: {
        id: task.oracleId,
        passed: null,
        mode: 'automated',
      },
      effort: {
        wallClockMs,
        attempts: 1,
        toolInvocations: toolInvocations + 1,
      },
      diagnostics: [message],
    };
  }
}

async function runWebcrackRecovery({
  sourceCode,
  budget,
  manifest,
  caseEntry,
  task,
  deps,
}) {
  const startedAt = deps.now();
  let attempts = 0;
  let toolInvocations = 0;
  const diagnostics = [];
  let lastOutcome = null;
  let lastOracle = null;
  let lastEffort = null;
  let lastRecoveredCode = null;

  while (attempts < budget.maxAttempts && toolInvocations < budget.maxToolInvocations) {
    const elapsed = deps.now() - startedAt;
    const remainingMs = budget.wallClockMs - elapsed;

    if (remainingMs <= 0) {
      return {
        outcome: 'timeout',
        oracle: {
          id: task.oracleId,
          passed: false,
          mode: 'automated',
        },
        effort: {
          wallClockMs: budget.wallClockMs,
          attempts,
          toolInvocations,
        },
        recoveredCode: lastRecoveredCode,
        diagnostics: [
          ...diagnostics,
          `recovery exceeded wall-clock budget of ${budget.wallClockMs}ms`,
        ],
      };
    }

    attempts += 1;
    const attempt = await runWebcrackRecoveryAttempt({
      sourceCode,
      budget,
      manifest,
      caseEntry,
      task,
      deps,
      remainingMs,
    });

    toolInvocations += attempt.effort.toolInvocations;
    lastOutcome = attempt.outcome;
    lastOracle = attempt.oracle;
    lastEffort = {
      wallClockMs:
        attempt.outcome === 'timeout'
          ? budget.wallClockMs
          : Math.min(deps.now() - startedAt, budget.wallClockMs),
      attempts,
      toolInvocations,
    };
    lastRecoveredCode = attempt.recoveredCode ?? lastRecoveredCode;
    diagnostics.push(...attempt.diagnostics);

    if (attempt.outcome === 'completed') {
      return {
        outcome: attempt.outcome,
        oracle: attempt.oracle,
        effort: lastEffort,
        recoveredCode: attempt.recoveredCode,
        diagnostics,
      };
    }

    if (attempt.outcome === 'timeout' || attempt.outcome === 'tool_error') {
      return {
        outcome: attempt.outcome,
        oracle: attempt.oracle,
        effort: lastEffort,
        recoveredCode: lastRecoveredCode,
        diagnostics,
      };
    }
  }

  return {
    outcome: lastOutcome ?? 'failed',
    oracle: lastOracle ?? {
      id: task.oracleId,
      passed: false,
      mode: 'automated',
    },
    effort: lastEffort ?? {
      wallClockMs: Math.min(deps.now() - startedAt, budget.wallClockMs),
      attempts,
      toolInvocations,
    },
    recoveredCode: lastRecoveredCode,
    diagnostics,
  };
}

function parseModuleSource(sourceCode) {
  return acorn.parse(sourceCode, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  });
}

async function runAstCompareRecovery({
  sourceCode,
  budget,
  manifest,
  caseEntry,
  task,
  deps,
}) {
  const startedAt = deps.now();
  let toolInvocations = 0;

  try {
    let recoveredCode = sourceCode;
    try {
      recoveredCode = escodegen.generate(parseModuleSource(sourceCode));
      toolInvocations += 1;
    } catch {
      recoveredCode = sourceCode;
    }

    const oracleResult = await evaluateRecoveredOracle({
      manifest,
      caseEntry,
      recoveredCode,
      oracleId: task.oracleId,
      deps,
    });
    const wallClockMs = Math.min(deps.now() - startedAt, budget.wallClockMs);

    if (oracleResult.passed) {
      return {
        outcome: 'completed',
        oracle: {
          id: task.oracleId,
          passed: true,
          mode: oracleResult.mode ?? 'automated',
        },
        effort: {
          wallClockMs,
          attempts: 1,
          toolInvocations,
        },
        recoveredCode,
        diagnostics: [],
      };
    }

    return {
      outcome: 'failed',
      oracle: {
        id: task.oracleId,
        passed: false,
        mode: oracleResult.mode ?? 'automated',
      },
      effort: {
        wallClockMs,
        attempts: 1,
        toolInvocations,
      },
      recoveredCode,
      diagnostics: oracleResult.diagnostics,
    };
  } catch (error) {
    const wallClockMs = Math.min(deps.now() - startedAt, budget.wallClockMs);
    const message = error instanceof Error ? error.message : String(error);

    return {
      outcome: 'tool_error',
      oracle: {
        id: task.oracleId,
        passed: null,
        mode: 'automated',
      },
      effort: {
        wallClockMs,
        attempts: 1,
        toolInvocations,
      },
      diagnostics: [message],
    };
  }
}

async function runHumanRubricRecovery({
  sourceCode,
  manifest,
  caseEntry,
  task,
  deps,
}) {
  const oracleResult = await evaluateRecoveredOracle({
    manifest,
    caseEntry,
    recoveredCode: sourceCode,
    oracleId: task.oracleId,
    deps,
  });
  const passed = oracleResult.passed === true;

  return {
    outcome: passed ? 'completed' : 'failed',
    oracle: {
      id: task.oracleId,
      passed,
      mode: 'human-rubric',
    },
    effort: {
      wallClockMs: 0,
      attempts: 1,
      toolInvocations: 0,
    },
    recoveredCode: sourceCode,
    diagnostics: oracleResult.diagnostics,
  };
}

function buildInconclusiveTrial({ task, evaluator, diagnostics }) {
  return {
    outcome: 'inconclusive',
    oracle: {
      id: task.oracleId,
      passed: null,
      mode: evaluator.oracleMode,
    },
    effort: {
      wallClockMs: 0,
      attempts: 0,
      toolInvocations: 0,
    },
    diagnostics,
  };
}

export async function runRecoveryTrial({
  manifest,
  caseEntry,
  taskId,
  evaluatorId,
  blindArtifactId,
  sourceCode,
  trial,
  deps: inputDeps,
}) {
  const deps = resolveDeps(inputDeps);
  const task = getTask(manifest, taskId);
  const evaluator = getEvaluator(manifest, evaluatorId);
  const budget = getRecoveryBudget(manifest, evaluatorId);

  if (!task || !evaluator || !budget) {
    return buildTrialResult({
      blindArtifactId,
      taskId,
      evaluatorId,
      trial,
      outcome: 'inconclusive',
      oracle: {
        id: task?.oracleId ?? 'unknown',
        passed: null,
        mode: 'automated',
      },
      effort: { wallClockMs: 0, attempts: 0, toolInvocations: 0 },
      diagnostics: ['recovery configuration reference is missing from manifest'],
    });
  }

  if (!IMPLEMENTED_EVALUATORS.has(evaluatorId)) {
    const inconclusive = buildInconclusiveTrial({
      task,
      evaluator,
      diagnostics: [`evaluator_not_implemented: ${evaluatorId}`],
    });

    return buildTrialResult({
      blindArtifactId,
      taskId,
      evaluatorId,
      trial,
      ...inconclusive,
    });
  }

  const attempt =
    evaluatorId === 'eval-webcrack'
      ? await runWebcrackRecovery({
          sourceCode,
          budget,
          manifest,
          caseEntry,
          task,
          deps,
        })
      : evaluatorId === 'eval-ast-compare'
        ? await runAstCompareRecovery({
            sourceCode,
            budget,
            manifest,
            caseEntry,
            task,
            deps,
          })
        : await runHumanRubricRecovery({
            sourceCode,
            manifest,
            caseEntry,
            task,
            deps,
          });

  return buildTrialResult({
    blindArtifactId,
    taskId,
    evaluatorId,
    trial,
    ...attempt,
  });
}

function collectTaskEvaluatorPairs(manifest, cases) {
  const pairs = new Map();

  for (const caseEntry of cases) {
    if (caseEntry.supported === false) {
      continue;
    }

    for (const taskId of caseEntry.recoveryTaskIds ?? []) {
      const task = getTask(manifest, taskId);
      if (!task) {
        continue;
      }

      for (const evaluatorId of task.evaluatorIds) {
        pairs.set(pairKey(taskId, evaluatorId), { taskId, evaluatorId });
      }
    }
  }

  return [...pairs.values()];
}

export async function calibrateRecoveryPairs({
  manifest,
  cases,
  getControlSource,
  deps: inputDeps,
}) {
  const deps = resolveDeps(inputDeps);
  const pairs = collectTaskEvaluatorPairs(manifest, cases);
  const calibration = [];

  for (const { taskId, evaluatorId } of pairs) {
    const caseEntry = cases.find(
      (entry) => entry.supported !== false && entry.recoveryTaskIds?.includes(taskId),
    );

    if (!caseEntry) {
      continue;
    }

    const controlSource = getControlSource(caseEntry);
    const trial = await runRecoveryTrial({
      manifest,
      caseEntry,
      taskId,
      evaluatorId,
      blindArtifactId: 'calibration-control',
      sourceCode: controlSource,
      trial: 0,
      deps,
    });

    const valid = trial.outcome === 'completed' && trial.oracle.passed === true;
    calibration.push({
      taskId,
      evaluatorId,
      valid,
      controlTrial: trial,
      diagnostics: valid ? [] : [...trial.diagnostics, 'control calibration failed'],
    });
  }

  const invalidPairs = calibration.filter((entry) => !entry.valid).map((entry) => pairKey(entry.taskId, entry.evaluatorId));

  return {
    pairs: calibration,
    invalidPairs,
    invalidPairKeys: new Set(invalidPairs),
  };
}

function cellKey(caseId, subjectId, seed) {
  return `${caseId}:${subjectId}:${seed ?? 'null'}`;
}

export async function runRecoveryHarness({
  manifest,
  matrix,
  deps: inputDeps,
  rng = null,
}) {
  const deps = resolveDeps(inputDeps);
  const cases = matrix.cases ?? [];
  const calibration = await calibrateRecoveryPairs({
    manifest,
    cases,
    getControlSource: matrix.getControlSource,
    deps,
  });

  const artifacts = matrix.cells.map((cell) => ({
    caseId: cell.caseId,
    subjectId: cell.subjectId,
    seed: cell.seed ?? null,
    sourceCode: cell.sourceCode,
    recoveryTaskIds:
      cases.find((entry) => entry.caseId === cell.caseId)?.recoveryTaskIds ?? [],
  }));

  const registry = createBlindingRegistry({
    artifacts,
    randomizeOrder: manifest.blinding.randomizeEvaluationOrder,
    rng,
  });

  const evaluatorView = buildEvaluatorView(registry, manifest.recoveryTasks);
  const mappingArtifact = buildMappingArtifact(registry);
  const caseResults = new Map();

  for (const cell of matrix.cells) {
    const key = cellKey(cell.caseId, cell.subjectId, cell.seed);
    if (!caseResults.has(key)) {
      caseResults.set(key, {
        experimentId: matrix.experimentId,
        caseId: cell.caseId,
        subjectId: cell.subjectId,
        seed: cell.seed ?? null,
        recovery: [],
      });
    }
  }

  const queue = [];

  for (const entry of registry.entries) {
    const caseEntry = cases.find((candidate) => candidate.caseId === entry.caseId);
    if (!caseEntry || caseEntry.supported === false) {
      continue;
    }

    for (const taskId of entry.recoveryTaskIds) {
      const task = getTask(manifest, taskId);
      if (!task) {
        continue;
      }

      for (const evaluatorId of task.evaluatorIds) {
        const repetitions = manifest.sampling.repetitionsByEvaluator[evaluatorId] ?? 1;

        for (let trial = 1; trial <= repetitions; trial += 1) {
          queue.push({
            blindArtifactId: entry.blindArtifactId,
            caseId: entry.caseId,
            subjectId: entry.subjectId,
            seed: entry.seed,
            sourceCode: entry.sourceCode,
            taskId,
            evaluatorId,
            trial,
          });
        }
      }
    }
  }

  const executionQueue = manifest.blinding.randomizeEvaluationOrder
    ? shuffleEvaluationQueue(queue, rng)
    : queue;

  const trials = [];

  for (const item of executionQueue) {
    const caseEntry = cases.find((entry) => entry.caseId === item.caseId);
    const trial = await runRecoveryTrial({
      manifest,
      caseEntry,
      taskId: item.taskId,
      evaluatorId: item.evaluatorId,
      blindArtifactId: item.blindArtifactId,
      sourceCode: item.sourceCode,
      trial: item.trial,
      deps,
    });

    const pairInvalid = calibration.invalidPairKeys.has(pairKey(item.taskId, item.evaluatorId));
    const enrichedTrial = {
      ...trial,
      excludedFromResistanceDenominator:
        pairInvalid && item.subjectId !== 'unprotected-control',
    };

    trials.push(enrichedTrial);

    const resultKey = cellKey(item.caseId, item.subjectId, item.seed);
    const caseResult = caseResults.get(resultKey);
    if (caseResult) {
      caseResult.recovery.push(enrichedTrial);
    }
  }

  lockResults(registry);

  return {
    experimentId: matrix.experimentId,
    calibration,
    blinding: {
      registry,
      evaluatorView,
      mappingArtifactHash: mappingArtifact.hash,
      evaluatorViewHash: evaluatorView.hash,
    },
    executionQueue,
    trials,
    caseResults: [...caseResults.values()],
  };
}
