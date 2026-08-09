import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hashCanonicalPayload } from '../../src/recovery/blinding.js';
import {
  assertLocalHostOnly,
  buildBlindLlmPromptView,
  extractRecoveredCode,
  loadEvaluatorConfig,
  runLlmRecoveryTrial,
} from '../../src/recovery/llm-evaluator.js';

const CLOSURE_SOURCE =
  'export function makeCounter(start = 0) {\n  let value = start;\n  return () => ++value;\n}\n';

const VALID_CONFIG = {
  schemaVersion: 1,
  oq4Decision: {
    status: 'approved',
    decidedBy: 'andersonalves',
    decidedAt: '2026-08-09',
    summary: 'test config',
  },
  runtime: {
    kind: 'ollama',
    clientPackage: 'ollama',
    clientVersion: '0.6.3',
    host: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    modelVersion: 'llama3.2',
    parameters: {
      temperature: 0,
      num_predict: 2048,
    },
  },
  prompt: {
    template:
      'Objective:\n{{objective}}\n\nArtifact:\n{{artifact}}\n\nReturn fenced JavaScript only.',
    contextPolicy: {
      allowedSources: ['blind-artifact', 'task-objective', 'predefined-rubric'],
      forbiddenFields: ['subjectId', 'seed', 'engine', 'toolName', 'candidate'],
    },
  },
  rubric: {
    criteria: ['Recovered code is valid JavaScript.'],
  },
  hashes: {
    promptHash: hashCanonicalPayload(
      'Objective:\n{{objective}}\n\nArtifact:\n{{artifact}}\n\nReturn fenced JavaScript only.',
    ),
    contextHash: hashCanonicalPayload({
      allowedSources: ['blind-artifact', 'task-objective', 'predefined-rubric'],
      forbiddenFields: ['subjectId', 'seed', 'engine', 'toolName', 'candidate'],
    }),
  },
  availability: {
    status: 'requires-local-daemon',
    probeCommand: 'ollama list',
  },
};

function buildManifest() {
  return {
    budgets: {
      processTimeoutMs: 5_000,
      memoryBytes: 256 * 1024 * 1024,
    },
  };
}

function buildTask() {
  return {
    id: 'task-explain-behavior',
    objective: 'Produce recovered source that matches the case oracle.',
    oracleId: 'oracle-exports-recovered',
  };
}

function buildBudget(overrides = {}) {
  return {
    wallClockMs: 5_000,
    maxAttempts: 1,
    maxToolInvocations: 3,
    ...overrides,
  };
}

async function writeConfigFile(config) {
  const dir = await mkdtemp(join(tmpdir(), 'llm-evaluator-'));
  const path = join(dir, 'evaluator.json');
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8');
  return path;
}

test('buildBlindLlmPromptView excludes candidate, seed and engine identifiers', () => {
  const { view, hash } = buildBlindLlmPromptView({
    blindArtifactId: 'artifact-deadbeef',
    objective: 'Recover exported bindings with equivalent module behavior.',
    artifactContent: CLOSURE_SOURCE,
    rubric: VALID_CONFIG.rubric,
  });

  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /oss-baseline/);
  assert.doesNotMatch(serialized, /pilot-seed-1/);
  assert.doesNotMatch(serialized, /webcrack/);
  assert.doesNotMatch(serialized, /ollama/);
  assert.doesNotMatch(serialized, /subjectId/);
  assert.doesNotMatch(serialized, /seed/);
  assert.doesNotMatch(serialized, /engine/);
  assert.equal(view.blindArtifactId, 'artifact-deadbeef');
  assert.ok(hash.startsWith('sha256-'));
});

test('prompt and context hashes remain stable for frozen evaluator config', async () => {
  const config = await loadEvaluatorConfig();
  assert.equal(
    config.hashes.promptHash,
    hashCanonicalPayload(config.prompt.template),
  );
  assert.equal(
    config.hashes.contextHash,
    hashCanonicalPayload(config.prompt.contextPolicy),
  );
});

test('assertLocalHostOnly rejects remote and non-local endpoints', () => {
  assert.throws(
    () => assertLocalHostOnly('https://api.openai.com/v1'),
    /remote_endpoint_blocked/,
  );
  assert.throws(
    () => assertLocalHostOnly('http://192.168.1.10:11434'),
    /remote_endpoint_blocked/,
  );
  assert.throws(
    () => assertLocalHostOnly('http://example.com:11434'),
    /remote_endpoint_blocked/,
  );
  assert.doesNotThrow(() => assertLocalHostOnly('http://127.0.0.1:11434'));
  assert.doesNotThrow(() => assertLocalHostOnly('http://localhost:11434'));
});

test('loadEvaluatorConfig rejects remote host configuration', async () => {
  const remoteConfig = structuredClone(VALID_CONFIG);
  remoteConfig.runtime.host = 'https://api.openai.com/v1';
  const path = await writeConfigFile(remoteConfig);

  await assert.rejects(() => loadEvaluatorConfig(path), /remote_endpoint_blocked/);
});

test('loadEvaluatorConfig rejects incomplete configuration', async () => {
  const incomplete = structuredClone(VALID_CONFIG);
  delete incomplete.hashes.contextHash;
  const path = await writeConfigFile(incomplete);

  await assert.rejects(() => loadEvaluatorConfig(path), /evaluator_config_invalid/);
});

test('extractRecoveredCode reads fenced javascript blocks', () => {
  const recovered = extractRecoveredCode(
    'Here is the code:\n```javascript\nexport const x = 1;\n```',
  );
  assert.equal(recovered, 'export const x = 1;');
});

test('runLlmRecoveryTrial records outcome, oracle, effort and tokens from runtime', async () => {
  const trial = await runLlmRecoveryTrial({
    manifest: buildManifest(),
    caseEntry: {
      caseId: 'pilot-closures-001',
      expectedBehaviorId: 'behavior-closure-counter',
    },
    task: buildTask(),
    evaluatorConfig: VALID_CONFIG,
    blindArtifactId: 'artifact-001',
    sourceCode: CLOSURE_SOURCE,
    trial: 1,
    budget: buildBudget(),
    deps: {
      chat: async () => ({
        message: {
          content: `\`\`\`javascript\n${CLOSURE_SOURCE}\n\`\`\``,
        },
        prompt_eval_count: 120,
        eval_count: 45,
      }),
      evaluateRecoveredOracle: async () => ({
        passed: true,
        mode: 'automated',
        diagnostics: [],
      }),
    },
  });

  assert.equal(trial.outcome, 'completed');
  assert.equal(trial.oracle.passed, true);
  assert.equal(trial.effort.attempts, 1);
  assert.equal(trial.effort.toolInvocations, 1);
  assert.equal(trial.effort.promptCount, 1);
  assert.equal(trial.effort.inputTokens, 120);
  assert.equal(trial.effort.outputTokens, 45);
  assert.ok(trial.recoveredArtifact);
});

test('runLlmRecoveryTrial marks runtime unavailability as inconclusive', async () => {
  const trial = await runLlmRecoveryTrial({
    manifest: buildManifest(),
    caseEntry: {
      caseId: 'pilot-closures-001',
      expectedBehaviorId: 'behavior-closure-counter',
    },
    task: buildTask(),
    evaluatorConfig: VALID_CONFIG,
    blindArtifactId: 'artifact-002',
    sourceCode: CLOSURE_SOURCE,
    trial: 1,
    budget: buildBudget(),
    deps: {
      chat: async () => {
        const error = new Error('fetch failed');
        error.cause = { code: 'ECONNREFUSED' };
        throw error;
      },
    },
  });

  assert.equal(trial.outcome, 'inconclusive');
  assert.equal(trial.oracle.passed, null);
  assert.ok(trial.diagnostics.some((entry) => entry.includes('llm_runtime_unavailable')));
});

test('runLlmRecoveryTrial respects wall-clock timeout budget', async () => {
  const trial = await runLlmRecoveryTrial({
    manifest: buildManifest(),
    caseEntry: {
      caseId: 'pilot-closures-001',
      expectedBehaviorId: 'behavior-closure-counter',
    },
    task: buildTask(),
    evaluatorConfig: VALID_CONFIG,
    blindArtifactId: 'artifact-003',
    sourceCode: CLOSURE_SOURCE,
    trial: 1,
    budget: buildBudget({ wallClockMs: 30 }),
    deps: {
      chat: () => new Promise(() => {}),
    },
  });

  assert.equal(trial.outcome, 'timeout');
  assert.equal(trial.oracle.passed, false);
  assert.equal(trial.effort.wallClockMs, 30);
});

test('runLlmRecoveryTrial counts repeated attempts within configured budget', async () => {
  let calls = 0;

  const trial = await runLlmRecoveryTrial({
    manifest: buildManifest(),
    caseEntry: {
      caseId: 'pilot-closures-001',
      expectedBehaviorId: 'behavior-closure-counter',
    },
    task: buildTask(),
    evaluatorConfig: VALID_CONFIG,
    blindArtifactId: 'artifact-004',
    sourceCode: CLOSURE_SOURCE,
    trial: 1,
    budget: buildBudget({ maxAttempts: 2, maxToolInvocations: 2 }),
    deps: {
      chat: async () => {
        calls += 1;
        return {
          message: {
            content:
              calls === 1
                ? '```javascript\nexport function broken() { return 0; }\n```'
                : `\`\`\`javascript\n${CLOSURE_SOURCE}\n\`\`\``,
          },
          prompt_eval_count: 10,
          eval_count: 5,
        };
      },
      evaluateRecoveredOracle: async () => ({
        passed: calls === 2,
        mode: 'automated',
        diagnostics: calls === 1 ? ['oracle failed on first attempt'] : [],
      }),
    },
  });

  assert.equal(calls, 2);
  assert.equal(trial.outcome, 'completed');
  assert.equal(trial.effort.attempts, 2);
  assert.equal(trial.effort.toolInvocations, 2);
  assert.equal(trial.effort.promptCount, 2);
});
