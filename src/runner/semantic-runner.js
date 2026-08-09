import { createHash } from 'node:crypto';
import { hashSource } from '../corpus/corpus.js';
import { getOracleEvaluatorPath, runModuleInSandbox } from './sandbox.js';

const ORACLE_RUNNERS = {
  'behavior-closure-counter': async (mod) => {
    const counter = mod.makeCounter(1);
    const first = counter();
    const second = counter();
    if (first !== 2 || second !== 3) {
      return {
        passed: false,
        diagnostics: [`expected counter values 2,3 but got ${first},${second}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-closure-adder': async (mod) => {
    const addFive = mod.makeAdder(5);
    const result = addFive(3);
    if (result !== 8) {
      return {
        passed: false,
        diagnostics: [`expected 8 but got ${result}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-class-point': async (mod) => {
    const moved = new mod.Point(1, 2).move(3, 4);
    if (moved.x !== 4 || moved.y !== 6) {
      return {
        passed: false,
        diagnostics: [`expected Point(4,6) but got (${moved.x},${moved.y})`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-class-stack': async (mod) => {
    const stack = new mod.Stack();
    stack.push(1);
    stack.push(2);
    const popped = stack.pop();
    if (popped !== 2) {
      return {
        passed: false,
        diagnostics: [`expected pop() to return 2 but got ${popped}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-async-delay': async (mod) => {
    const startedAt = Date.now();
    await mod.delay(10);
    const elapsed = Date.now() - startedAt;
    if (elapsed < 5) {
      return {
        passed: false,
        diagnostics: [`delay resolved too quickly (${elapsed}ms)`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-async-all': async (mod) => {
    const values = await mod.allValues([Promise.resolve(1), Promise.resolve(2)]);
    if (!Array.isArray(values) || values[0] !== 1 || values[1] !== 2) {
      return {
        passed: false,
        diagnostics: [`expected [1,2] but got ${JSON.stringify(values)}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-generator-range': async (mod) => {
    const values = [...mod.range(1, 4)];
    if (JSON.stringify(values) !== JSON.stringify([1, 2, 3])) {
      return {
        passed: false,
        diagnostics: [`expected [1,2,3] but got ${JSON.stringify(values)}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-generator-take': async (mod) => {
    const values = [...mod.take([10, 20, 30], 2)];
    if (JSON.stringify(values) !== JSON.stringify([10, 20])) {
      return {
        passed: false,
        diagnostics: [`expected [10,20] but got ${JSON.stringify(values)}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-exception-safe-parse': async (mod) => {
    const valid = mod.safeParse('{"ok":true}');
    const invalid = mod.safeParse('{');
    if (!valid.ok || valid.value.ok !== true) {
      return {
        passed: false,
        diagnostics: ['valid JSON input did not parse successfully'],
      };
    }
    if (invalid.ok !== false || typeof invalid.message !== 'string') {
      return {
        passed: false,
        diagnostics: ['invalid JSON input did not return ok:false'],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-exception-assert': async (mod) => {
    try {
      mod.assertPositive(-1);
      return {
        passed: false,
        diagnostics: ['assertPositive(-1) should throw'],
      };
    } catch (error) {
      if (!(error instanceof Error)) {
        return {
          passed: false,
          diagnostics: ['assertPositive(-1) threw a non-error value'],
        };
      }
    }

    const value = mod.assertPositive(3);
    if (value !== 3) {
      return {
        passed: false,
        diagnostics: [`assertPositive(3) should return 3 but got ${value}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-module-constants': async (mod) => {
    if (mod.API_VERSION !== 1 || mod.isEnabled('on') !== true || mod.isEnabled('off') !== false) {
      return {
        passed: false,
        diagnostics: ['module constants or isEnabled behavior diverged'],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-module-reexport': async (mod) => {
    if (mod.getMode() !== 'bundle') {
      return {
        passed: false,
        diagnostics: [`expected getMode() to return bundle but got ${mod.getMode()}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-string-template': async (mod) => {
    const greeting = mod.greet('ada');
    if (greeting !== 'hello ADA') {
      return {
        passed: false,
        diagnostics: [`expected "hello ADA" but got ${JSON.stringify(greeting)}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-string-quote': async (mod) => {
    const quoted = mod.quote(['a', 'b']);
    if (quoted !== '"a","b"') {
      return {
        passed: false,
        diagnostics: [`expected "\\"a\\",\\"b\\"" but got ${JSON.stringify(quoted)}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-control-fizzbuzz': async (mod) => {
    const samples = [
      [15, 'fizzbuzz'],
      [9, 'fizz'],
      [10, 'buzz'],
      [7, '7'],
    ];
    for (const [input, expected] of samples) {
      if (mod.fizzbuzz(input) !== expected) {
        return {
          passed: false,
          diagnostics: [`fizzbuzz(${input}) expected ${expected}`],
        };
      }
    }
    return { passed: true, diagnostics: [] };
  },
  'behavior-control-sum': async (mod) => {
    const total = mod.sumUntil(4);
    if (total !== 10) {
      return {
        passed: false,
        diagnostics: [`expected sumUntil(4) to return 10 but got ${total}`],
      };
    }
    return { passed: true, diagnostics: [] };
  },
};

export async function evaluateBehaviorOracle(behaviorId, moduleExports) {
  const runner = ORACLE_RUNNERS[behaviorId];
  if (!runner) {
    return {
      passed: null,
      diagnostics: [`unknown behavior oracle: ${behaviorId}`],
    };
  }

  return runner(moduleExports);
}

export function createEmbeddedArtifact(content, mediaType = 'application/javascript') {
  const digest = createHash('sha256').update(content, 'utf8').digest('hex');
  return {
    sha256: `sha256-${digest}`,
    mediaType,
    encoding: 'utf8',
    content,
  };
}

export function verifyEmbeddedArtifact(artifact) {
  return artifact.sha256 === hashSource(artifact.content);
}

function createLogEntry({
  experimentId,
  caseId,
  subjectId,
  seed,
  stage,
  status,
  message,
  durationMs,
}) {
  return {
    timestamp: new Date().toISOString(),
    experimentId,
    caseId,
    subjectId,
    seed,
    stage,
    durationMs,
    status,
    message,
  };
}

function classifySandboxFailure(sandboxResult) {
  if (sandboxResult.timedOut) {
    return 'timeout';
  }

  if (sandboxResult.memoryLimited) {
    return 'tool_error';
  }

  if (sandboxResult.exitCode !== 0 || !sandboxResult.oracle) {
    return 'tool_error';
  }

  return null;
}

function buildExecutionDiagnostics(sandboxResult) {
  const diagnostics = [];

  if (sandboxResult.timedOut) {
    diagnostics.push(`process exceeded budget after ${sandboxResult.durationMs}ms`);
  }

  if (sandboxResult.memoryLimited) {
    diagnostics.push('process exceeded memory budget');
  }

  if (sandboxResult.exitCode !== 0) {
    diagnostics.push(`process exited with code ${sandboxResult.exitCode}`);
  }

  if (sandboxResult.stderr.trim()) {
    diagnostics.push(sandboxResult.stderr.trim());
  }

  if (sandboxResult.oracle?.diagnostics?.length) {
    diagnostics.push(...sandboxResult.oracle.diagnostics);
  }

  return diagnostics;
}

export async function runSubjectSemanticCase({
  manifest,
  experimentId,
  caseEntry,
  subjectId,
  seed,
  sourceCode,
  artifactKey = 'subject',
}) {
  if (caseEntry.supported === false) {
    return {
      experimentId,
      caseId: caseEntry.caseId,
      subjectId,
      seed,
      status: 'inconclusive',
      semantic: {
        equivalent: false,
        diagnostics: [
          `unsupported case policy: ${caseEntry.expectedPolicy?.expectedOutcome ?? 'unknown'}`,
        ],
      },
      recovery: [],
      artifacts: {
        [artifactKey]: createEmbeddedArtifact(sourceCode),
      },
      logs: [
        createLogEntry({
          experimentId,
          caseId: caseEntry.caseId,
          subjectId,
          seed,
          stage: 'semantic',
          status: 'inconclusive',
          message: 'unsupported case skipped for semantic execution',
        }),
      ],
    };
  }

  const sandboxResult = await runModuleInSandbox({
    source: sourceCode,
    behaviorId: caseEntry.expectedBehaviorId,
    oracleEvaluatorPath: getOracleEvaluatorPath(),
    processTimeoutMs: manifest.budgets.processTimeoutMs,
    memoryBytes: manifest.budgets.memoryBytes,
    blockNetwork: true,
  });

  const artifact = createEmbeddedArtifact(sourceCode);
  const logs = [
    createLogEntry({
      experimentId,
      caseId: caseEntry.caseId,
      subjectId,
      seed,
      stage: 'semantic',
      status: 'running',
      message: 'sandbox execution completed',
      durationMs: sandboxResult.durationMs,
    }),
  ];

  const sandboxFailure = classifySandboxFailure(sandboxResult);
  if (sandboxFailure) {
    return {
      experimentId,
      caseId: caseEntry.caseId,
      subjectId,
      seed,
      status: sandboxFailure,
      semantic: {
        equivalent: false,
        diagnostics: buildExecutionDiagnostics(sandboxResult),
      },
      recovery: [],
      artifacts: {
        [artifactKey]: artifact,
        stdout: createEmbeddedArtifact(sandboxResult.stdout, 'text/plain'),
        stderr: createEmbeddedArtifact(sandboxResult.stderr, 'text/plain'),
      },
      logs: [
        ...logs,
        createLogEntry({
          experimentId,
          caseId: caseEntry.caseId,
          subjectId,
          seed,
          stage: 'semantic',
          status: sandboxFailure,
          message: 'sandbox failure preserved for audit',
          durationMs: sandboxResult.durationMs,
        }),
      ],
      execution: sandboxResult,
    };
  }

  const oraclePassed = sandboxResult.oracle.passed === true;
  const status = oraclePassed ? 'valid' : 'semantic_mismatch';

  return {
    experimentId,
    caseId: caseEntry.caseId,
    subjectId,
    seed,
    status,
    semantic: {
      equivalent: oraclePassed,
      diagnostics: oraclePassed ? [] : buildExecutionDiagnostics(sandboxResult),
    },
    recovery: [],
    artifacts: {
      [artifactKey]: artifact,
      stdout: createEmbeddedArtifact(sandboxResult.stdout, 'text/plain'),
      stderr: createEmbeddedArtifact(sandboxResult.stderr, 'text/plain'),
    },
    logs: [
      ...logs,
      createLogEntry({
        experimentId,
        caseId: caseEntry.caseId,
        subjectId,
        seed,
        stage: 'semantic',
        status,
        message: oraclePassed ? 'oracle passed' : 'oracle failed',
        durationMs: sandboxResult.durationMs,
      }),
    ],
    execution: sandboxResult,
  };
}

export async function compareSemanticSubjects({
  manifest,
  experimentId,
  caseEntry,
  subjectId,
  seed,
  controlSource,
  candidateSource,
}) {
  const control = await runSubjectSemanticCase({
    manifest,
    experimentId,
    caseEntry,
    subjectId: 'unprotected-control',
    seed: null,
    sourceCode: controlSource,
    artifactKey: 'control',
  });

  const candidate = await runSubjectSemanticCase({
    manifest,
    experimentId,
    caseEntry,
    subjectId,
    seed,
    sourceCode: candidateSource,
    artifactKey: 'candidate',
  });

  if (control.status !== 'valid') {
    return {
      control,
      candidate,
      comparison: {
        equivalent: false,
        diagnostics: [
          'control oracle did not pass; candidate comparison is inconclusive',
          ...control.semantic.diagnostics,
        ],
        status: 'inconclusive',
      },
    };
  }

  if (candidate.status === 'valid') {
    return {
      control,
      candidate,
      comparison: {
        equivalent: true,
        diagnostics: [],
        status: 'valid',
      },
    };
  }

  return {
    control,
    candidate,
    comparison: {
      equivalent: false,
      diagnostics: [
        'candidate diverged from control oracle',
        ...candidate.semantic.diagnostics,
      ],
      status: candidate.status === 'semantic_mismatch' ? 'semantic_mismatch' : candidate.status,
    },
  };
}
