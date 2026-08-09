import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ollama } from 'ollama';
import { getOracleEvaluatorPath, runModuleInSandbox } from '../runner/sandbox.js';
import { createEmbeddedArtifact } from '../runner/semantic-runner.js';
import { hashCanonicalPayload } from './blinding.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_EVALUATOR_CONFIG_PATH = join(__dirname, '../../experiments/llm/evaluator.json');
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function resolveDeps(deps = {}) {
  return {
    chat: deps.chat ?? null,
    now: deps.now ?? (() => Date.now()),
    runModuleInSandbox: deps.runModuleInSandbox ?? runModuleInSandbox,
    evaluateRecoveredOracle: deps.evaluateRecoveredOracle ?? evaluateRecoveredOracle,
  };
}

export function assertLocalHostOnly(hostUrl) {
  let parsed;

  try {
    parsed = new URL(hostUrl);
  } catch {
    throw new Error('remote_endpoint_blocked: invalid host URL');
  }

  if (parsed.protocol !== 'http:') {
    throw new Error(`remote_endpoint_blocked: only http:// local endpoints are allowed (${hostUrl})`);
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`remote_endpoint_blocked: host must be local (${hostUrl})`);
  }
}

function validateEvaluatorConfig(config) {
  if (!config?.runtime?.host) {
    throw new Error('evaluator_config_invalid: runtime.host is required');
  }

  if (!config?.prompt?.template || !config?.prompt?.contextPolicy) {
    throw new Error('evaluator_config_invalid: prompt template and contextPolicy are required');
  }

  if (!config?.hashes?.promptHash || !config?.hashes?.contextHash) {
    throw new Error('evaluator_config_invalid: prompt and context hashes are required');
  }

  assertLocalHostOnly(config.runtime.host);

  const promptHash = hashCanonicalPayload(config.prompt.template);
  const contextHash = hashCanonicalPayload(config.prompt.contextPolicy);

  if (config.hashes.promptHash !== promptHash) {
    throw new Error('evaluator_config_invalid: promptHash mismatch');
  }

  if (config.hashes.contextHash !== contextHash) {
    throw new Error('evaluator_config_invalid: contextHash mismatch');
  }
}

export async function loadEvaluatorConfig(configPath = DEFAULT_EVALUATOR_CONFIG_PATH) {
  const raw = await readFile(configPath, 'utf8');
  const config = JSON.parse(raw);
  validateEvaluatorConfig(config);
  return config;
}

export function buildBlindLlmPromptView({
  blindArtifactId,
  objective,
  artifactContent,
  rubric,
}) {
  const view = {
    blindArtifactId,
    objective,
    artifact: {
      content: artifactContent,
      mediaType: 'application/javascript',
      encoding: 'utf8',
    },
    rubric,
  };

  return {
    view,
    hash: hashCanonicalPayload(view),
  };
}

function renderPromptTemplate(template, { objective, artifactContent }) {
  return template
    .replace('{{objective}}', objective)
    .replace('{{artifact}}', artifactContent);
}

export function extractRecoveredCode(responseText) {
  const fenced = responseText.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
  if (fenced) {
    return fenced[1].trim();
  }

  return responseText.trim();
}

function createDefaultChatClient(evaluatorConfig) {
  const client = new Ollama({ host: evaluatorConfig.runtime.host });
  return async ({ model, messages, options, signal }) =>
    client.chat({
      model,
      messages,
      options,
      stream: false,
      signal,
    });
}

function isRuntimeUnavailableError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('econnrefused') ||
    message.includes('fetch failed') ||
    message.includes('connect') ||
    message.includes('network')
  );
}

function buildEffort({
  wallClockMs,
  attempts,
  toolInvocations,
  promptCount,
  inputTokens,
  outputTokens,
}) {
  const effort = {
    wallClockMs,
    attempts,
    toolInvocations,
  };

  if (promptCount !== undefined) {
    effort.promptCount = promptCount;
  }

  if (inputTokens !== undefined) {
    effort.inputTokens = inputTokens;
  }

  if (outputTokens !== undefined) {
    effort.outputTokens = outputTokens;
  }

  return effort;
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

  const oracleMode = oracleId === 'oracle-behavior-human' ? 'human-rubric' : 'automated';

  return {
    passed: sandboxResult.oracle.passed === true,
    mode: oracleMode,
    diagnostics: sandboxResult.oracle.diagnostics ?? [],
  };
}

async function invokeLlmAttempt({
  evaluatorConfig,
  prompt,
  budget,
  deps,
  remainingMs,
}) {
  const chat = deps.chat ?? createDefaultChatClient(evaluatorConfig);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingMs);

  try {
    const response = await Promise.race([
      chat({
        model: evaluatorConfig.runtime.model,
        messages: [{ role: 'user', content: prompt }],
        options: evaluatorConfig.runtime.parameters,
        signal: controller.signal,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('recovery_timeout')), remainingMs);
      }),
    ]);

    const effortExtras = {};
    if (typeof response.prompt_eval_count === 'number') {
      effortExtras.inputTokens = response.prompt_eval_count;
    }

    if (typeof response.eval_count === 'number') {
      effortExtras.outputTokens = response.eval_count;
    }

    return {
      responseText: response.message?.content ?? '',
      effortExtras,
      toolInvocations: 1,
      promptCount: 1,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'recovery_timeout') {
      throw error;
    }

    if (isRuntimeUnavailableError(error)) {
      const unavailable = new Error('llm_runtime_unavailable');
      unavailable.cause = error;
      throw unavailable;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLlmRecoveryTrial({
  manifest,
  caseEntry,
  task,
  evaluatorConfig,
  blindArtifactId,
  sourceCode,
  trial,
  evaluatorId = 'eval-llm',
  budget,
  deps: inputDeps,
}) {
  const deps = resolveDeps(inputDeps);

  if (!evaluatorConfig) {
    return buildTrialResult({
      blindArtifactId,
      taskId: task.id,
      evaluatorId,
      trial,
      outcome: 'inconclusive',
      oracle: {
        id: task.oracleId,
        passed: null,
        mode: 'human-rubric',
      },
      effort: buildEffort({ wallClockMs: 0, attempts: 0, toolInvocations: 0 }),
      diagnostics: ['llm evaluator configuration is missing'],
    });
  }

  try {
    validateEvaluatorConfig(evaluatorConfig);
  } catch (error) {
    return buildTrialResult({
      blindArtifactId,
      taskId: task.id,
      evaluatorId,
      trial,
      outcome: 'inconclusive',
      oracle: {
        id: task.oracleId,
        passed: null,
        mode: 'human-rubric',
      },
      effort: buildEffort({ wallClockMs: 0, attempts: 0, toolInvocations: 0 }),
      diagnostics: [error instanceof Error ? error.message : String(error)],
    });
  }

  const blindView = buildBlindLlmPromptView({
    blindArtifactId,
    objective: task.objective,
    artifactContent: sourceCode,
    rubric: evaluatorConfig.rubric,
  });
  const prompt = renderPromptTemplate(evaluatorConfig.prompt.template, {
    objective: blindView.view.objective,
    artifactContent: blindView.view.artifact.content,
  });

  const startedAt = deps.now();
  let attempts = 0;
  let toolInvocations = 0;
  let promptCount = 0;
  let inputTokens;
  let outputTokens;
  const diagnostics = [];
  let lastRecoveredCode = null;
  let lastOracle = null;
  let lastOutcome = null;

  while (attempts < budget.maxAttempts && toolInvocations < budget.maxToolInvocations) {
    const elapsed = deps.now() - startedAt;
    const remainingMs = budget.wallClockMs - elapsed;

    if (remainingMs <= 0) {
      return buildTrialResult({
        blindArtifactId,
        taskId: task.id,
        evaluatorId,
        trial,
        outcome: 'timeout',
        oracle: {
          id: task.oracleId,
          passed: false,
          mode: 'human-rubric',
        },
        effort: buildEffort({
          wallClockMs: budget.wallClockMs,
          attempts,
          toolInvocations,
          promptCount: promptCount || undefined,
          inputTokens,
          outputTokens,
        }),
        recoveredCode: lastRecoveredCode,
        diagnostics: [
          ...diagnostics,
          `recovery exceeded wall-clock budget of ${budget.wallClockMs}ms`,
        ],
      });
    }

    if (budget.maxPrompts !== undefined && promptCount >= budget.maxPrompts) {
      return buildTrialResult({
        blindArtifactId,
        taskId: task.id,
        evaluatorId,
        trial,
        outcome: lastOutcome ?? 'failed',
        oracle: lastOracle ?? {
          id: task.oracleId,
          passed: false,
          mode: 'human-rubric',
        },
        effort: buildEffort({
          wallClockMs: Math.min(deps.now() - startedAt, budget.wallClockMs),
          attempts,
          toolInvocations,
          promptCount,
          inputTokens,
          outputTokens,
        }),
        recoveredCode: lastRecoveredCode,
        diagnostics: [...diagnostics, 'prompt budget exhausted'],
      });
    }

    attempts += 1;

    try {
      const attempt = await invokeLlmAttempt({
        evaluatorConfig,
        prompt,
        budget,
        deps,
        remainingMs,
      });

      toolInvocations += attempt.toolInvocations;
      promptCount += attempt.promptCount;

      if (attempt.effortExtras.inputTokens !== undefined) {
        inputTokens = (inputTokens ?? 0) + attempt.effortExtras.inputTokens;
      }

      if (attempt.effortExtras.outputTokens !== undefined) {
        outputTokens = (outputTokens ?? 0) + attempt.effortExtras.outputTokens;
      }

      if (
        budget.maxTotalTokens !== undefined &&
        inputTokens !== undefined &&
        outputTokens !== undefined &&
        inputTokens + outputTokens > budget.maxTotalTokens
      ) {
        return buildTrialResult({
          blindArtifactId,
          taskId: task.id,
          evaluatorId,
          trial,
          outcome: 'failed',
          oracle: {
            id: task.oracleId,
            passed: false,
            mode: 'human-rubric',
          },
          effort: buildEffort({
            wallClockMs: Math.min(deps.now() - startedAt, budget.wallClockMs),
            attempts,
            toolInvocations,
            promptCount,
            inputTokens,
            outputTokens,
          }),
          recoveredCode: lastRecoveredCode,
          diagnostics: [...diagnostics, 'token budget exhausted'],
        });
      }

      const recoveredCode = extractRecoveredCode(attempt.responseText);
      lastRecoveredCode = recoveredCode;

      const oracleResult = await deps.evaluateRecoveredOracle({
        manifest,
        caseEntry,
        recoveredCode,
        oracleId: task.oracleId,
        deps,
      });

      lastOracle = {
        id: task.oracleId,
        passed: oracleResult.passed === true,
        mode: oracleResult.mode ?? 'human-rubric',
      };
      lastOutcome = oracleResult.passed ? 'completed' : 'failed';
      diagnostics.push(...oracleResult.diagnostics);

      if (lastOutcome === 'completed') {
        return buildTrialResult({
          blindArtifactId,
          taskId: task.id,
          evaluatorId,
          trial,
          outcome: 'completed',
          oracle: lastOracle,
          effort: buildEffort({
            wallClockMs: Math.min(deps.now() - startedAt, budget.wallClockMs),
            attempts,
            toolInvocations,
            promptCount,
            inputTokens,
            outputTokens,
          }),
          recoveredCode,
          diagnostics,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message === 'llm_runtime_unavailable') {
        return buildTrialResult({
          blindArtifactId,
          taskId: task.id,
          evaluatorId,
          trial,
          outcome: 'inconclusive',
          oracle: {
            id: task.oracleId,
            passed: null,
            mode: 'human-rubric',
          },
          effort: buildEffort({
            wallClockMs: Math.min(deps.now() - startedAt, budget.wallClockMs),
            attempts,
            toolInvocations,
            promptCount: promptCount || undefined,
            inputTokens,
            outputTokens,
          }),
          recoveredCode: lastRecoveredCode,
          diagnostics: [...diagnostics, 'llm_runtime_unavailable'],
        });
      }

      if (message === 'recovery_timeout') {
        return buildTrialResult({
          blindArtifactId,
          taskId: task.id,
          evaluatorId,
          trial,
          outcome: 'timeout',
          oracle: {
            id: task.oracleId,
            passed: false,
            mode: 'human-rubric',
          },
          effort: buildEffort({
            wallClockMs: budget.wallClockMs,
            attempts,
            toolInvocations,
            promptCount: promptCount || undefined,
            inputTokens,
            outputTokens,
          }),
          recoveredCode: lastRecoveredCode,
          diagnostics: [
            ...diagnostics,
            `recovery exceeded wall-clock budget of ${budget.wallClockMs}ms`,
          ],
        });
      }

      return buildTrialResult({
        blindArtifactId,
        taskId: task.id,
        evaluatorId,
        trial,
        outcome: 'tool_error',
        oracle: {
          id: task.oracleId,
          passed: null,
          mode: 'human-rubric',
        },
        effort: buildEffort({
          wallClockMs: Math.min(deps.now() - startedAt, budget.wallClockMs),
          attempts,
          toolInvocations: toolInvocations + 1,
          promptCount: promptCount || undefined,
          inputTokens,
          outputTokens,
        }),
        recoveredCode: lastRecoveredCode,
        diagnostics: [...diagnostics, message],
      });
    }
  }

  return buildTrialResult({
    blindArtifactId,
    taskId: task.id,
    evaluatorId,
    trial,
    outcome: lastOutcome ?? 'failed',
    oracle: lastOracle ?? {
      id: task.oracleId,
      passed: false,
      mode: 'human-rubric',
    },
    effort: buildEffort({
      wallClockMs: Math.min(deps.now() - startedAt, budget.wallClockMs),
      attempts,
      toolInvocations,
      promptCount: promptCount || undefined,
      inputTokens,
      outputTokens,
    }),
    recoveredCode: lastRecoveredCode,
    diagnostics,
  });
}
