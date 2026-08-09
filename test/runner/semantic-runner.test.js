import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { loadCorpus } from '../../src/corpus/corpus.js';
import { runModuleInSandbox, runSnippetInCompartment } from '../../src/runner/sandbox.js';
import {
  compareSemanticSubjects,
  createEmbeddedArtifact,
  runSubjectSemanticCase,
  verifyEmbeddedArtifact,
} from '../../src/runner/semantic-runner.js';

function buildManifest(overrides = {}) {
  return {
    budgets: {
      processTimeoutMs: 5_000,
      memoryBytes: 256 * 1024 * 1024,
      recovery: [],
    },
    ...overrides,
  };
}

const CLOSURE_CASE = {
  caseId: 'pilot-closures-001',
  category: 'closures',
  supported: true,
  expectedBehaviorId: 'behavior-closure-counter',
  semanticOracle: {
    id: 'oracle-pilot-closures-001',
    mode: 'automated',
  },
  source:
    'export function makeCounter(start = 0) {\n  let value = start;\n  return () => ++value;\n}\n',
};

test('embedded artifacts preserve verifiable sha256 hashes', () => {
  const artifact = createEmbeddedArtifact('export const value = 1;\n');
  assert.equal(verifyEmbeddedArtifact(artifact), true);
  assert.equal(artifact.encoding, 'utf8');
  assert.match(artifact.sha256, /^sha256-[a-f0-9]{64}$/);
});

test('runs supported corpus code in sandbox and marks valid results', async () => {
  const result = await runSubjectSemanticCase({
    manifest: buildManifest(),
    experimentId: 'semantic-test',
    caseEntry: CLOSURE_CASE,
    subjectId: 'unprotected-control',
    seed: null,
    sourceCode: CLOSURE_CASE.source,
  });

  assert.equal(result.status, 'valid');
  assert.equal(result.semantic.equivalent, true);
  assert.equal(verifyEmbeddedArtifact(result.artifacts.subject), true);
  assert.ok(result.logs.length >= 2);
  assert.equal(result.recovery.length, 0);
});

test('marks semantic mismatch without converting failures into success', async () => {
  const brokenSource = CLOSURE_CASE.source.replace('++value', '--value');
  const comparison = await compareSemanticSubjects({
    manifest: buildManifest(),
    experimentId: 'semantic-test',
    caseEntry: CLOSURE_CASE,
    subjectId: 'oss-baseline',
    seed: 'pilot-seed-1',
    controlSource: CLOSURE_CASE.source,
    candidateSource: brokenSource,
  });

  assert.equal(comparison.control.status, 'valid');
  assert.equal(comparison.candidate.status, 'semantic_mismatch');
  assert.equal(comparison.comparison.equivalent, false);
  assert.equal(comparison.comparison.status, 'semantic_mismatch');
  assert.ok(comparison.comparison.diagnostics.length > 0);
  assert.ok(comparison.candidate.semantic.diagnostics.length > 0);
});

test('blocks network access in sandboxed execution', async () => {
  const source = [
    'await fetch("http://127.0.0.1:9");',
    'export const API_VERSION = 1;',
    'export function isEnabled(flag) { return flag === "on"; }',
    '',
  ].join('\n');

  const sandboxResult = await runModuleInSandbox({
    source,
    behaviorId: 'behavior-module-constants',
    oracleEvaluatorPath: join(process.cwd(), 'src/runner/semantic-runner.js'),
    processTimeoutMs: 2_000,
    memoryBytes: 128 * 1024 * 1024,
    blockNetwork: true,
  });

  assert.notEqual(sandboxResult.exitCode, 0);
  assert.match(
    `${sandboxResult.stderr}\n${sandboxResult.stdout}`,
    /network_blocked:fetch/,
  );
});

test('discards sandbox filesystem after execution', async () => {
  const result = await runSubjectSemanticCase({
    manifest: buildManifest(),
    experimentId: 'semantic-test',
    caseEntry: CLOSURE_CASE,
    subjectId: 'unprotected-control',
    seed: null,
    sourceCode: CLOSURE_CASE.source,
  });

  assert.equal(result.execution.workDirRemoved, true);
});

test('enforces process timeout budget from manifest', async () => {
  const loopingCase = {
    ...CLOSURE_CASE,
    expectedBehaviorId: 'behavior-control-sum',
    source: 'export function sumUntil() { while (true) {} }\n',
  };

  const result = await runSubjectSemanticCase({
    manifest: buildManifest({
      budgets: {
        processTimeoutMs: 300,
        memoryBytes: 128 * 1024 * 1024,
        recovery: [],
      },
    }),
    experimentId: 'semantic-test',
    caseEntry: loopingCase,
    subjectId: 'oss-baseline',
    seed: 'pilot-seed-1',
    sourceCode: loopingCase.source,
  });

  assert.equal(result.status, 'timeout');
  assert.equal(result.semantic.equivalent, false);
  assert.ok(result.semantic.diagnostics.some((entry) => entry.includes('exceeded budget')));
});

test('enforces memory budget from manifest', async () => {
  const memoryCase = {
    ...CLOSURE_CASE,
    expectedBehaviorId: 'behavior-control-sum',
    source: [
      'export function sumUntil() {',
      '  const chunks = [];',
      '  while (chunks.length < 10_000) {',
      '    chunks.push(new Array(1_000_000).fill("x"));',
      '  }',
      '  return chunks.length;',
      '}',
      '',
    ].join('\n'),
  };

  const result = await runSubjectSemanticCase({
    manifest: buildManifest({
      budgets: {
        processTimeoutMs: 10_000,
        memoryBytes: 32 * 1024 * 1024,
        recovery: [],
      },
    }),
    experimentId: 'semantic-test',
    caseEntry: memoryCase,
    subjectId: 'oss-baseline',
    seed: 'pilot-seed-1',
    sourceCode: memoryCase.source,
  });

  assert.equal(result.status, 'tool_error');
  assert.equal(result.semantic.equivalent, false);
  assert.ok(
    result.semantic.diagnostics.some(
      (entry) => entry.includes('memory budget') || entry.includes('heap out of memory'),
    ),
  );
});

test('classifies invalid syntax as tool_error', async () => {
  const invalidCase = {
    ...CLOSURE_CASE,
    source: 'export function broken( {',
  };

  const result = await runSubjectSemanticCase({
    manifest: buildManifest(),
    experimentId: 'semantic-test',
    caseEntry: invalidCase,
    subjectId: 'oss-baseline',
    seed: 'pilot-seed-1',
    sourceCode: invalidCase.source,
  });

  assert.equal(result.status, 'tool_error');
  assert.equal(result.semantic.equivalent, false);
  assert.ok(result.artifacts.stderr.content.length > 0);
});

test('ses compartment blocks privileged globals in isolated snippets', async () => {
  const result = await runSnippetInCompartment('fetch("http://example.com")');
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('pilot corpus supported cases pass semantic oracle under default budgets', async () => {
  const bundle = loadCorpus();
  const manifest = buildManifest();

  for (const caseEntry of bundle.pilot.cases.filter((entry) => entry.supported)) {
    const result = await runSubjectSemanticCase({
      manifest,
      experimentId: 'pilot-semantic-smoke',
      caseEntry,
      subjectId: 'unprotected-control',
      seed: null,
      sourceCode: caseEntry.source,
    });

    assert.equal(
      result.status,
      'valid',
      `${caseEntry.caseId} failed: ${result.semantic.diagnostics.join('; ')}`,
    );
  }
});

test('removes sandbox workdir even when execution fails', async () => {
  const sandboxResult = await runModuleInSandbox({
    source: 'export const API_VERSION = 1;\n',
    behaviorId: 'behavior-unknown',
    oracleEvaluatorPath: join(process.cwd(), 'src/runner/semantic-runner.js'),
    processTimeoutMs: 2_000,
    memoryBytes: 128 * 1024 * 1024,
    blockNetwork: true,
  });

  assert.equal(sandboxResult.workDirRemoved, true);
});
