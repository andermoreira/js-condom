import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { protect } from '../../src/candidates/oss-baseline.js';
import { protect as protectOwnMinimal } from '../../src/candidates/own-minimal.js';
import { BASELINE_CONFIG } from '../../src/analysis/pilot.js';
import {
  extractExportedBindings,
  protectWithExportPreservation,
  restoreModuleExports,
  stripModuleExports,
} from '../../src/runner/esm-export-preserver.js';
import { runSubjectSemanticCase } from '../../src/runner/semantic-runner.js';
import { loadAndValidateCorpus } from '../../src/corpus/corpus.js';

function buildManifest() {
  return {
    budgets: {
      processTimeoutMs: 5_000,
      memoryBytes: 256 * 1024 * 1024,
      recovery: [],
    },
  };
}

describe('esm-export-preserver', () => {
  it('extracts exported binding names without order bias', () => {
    const source =
      'const internal = { mode: "bundle" };\nexport function getMode() { return internal.mode; }';
    assert.deepEqual(extractExportedBindings(source), ['getMode']);
  });

  it('restores exports by name after protection', () => {
    const source =
      'const internal = { mode: "bundle" };\nexport function getMode() { return internal.mode; }';
    const bindings = extractExportedBindings(source);
    const stripped = stripModuleExports(source);
    const protectedCode = protectOwnMinimal({
      sourceCode: stripped,
      canonicalSeed: 'pilot-seed-1',
      auxiliaryTransforms: [],
    }).code;
    const restored = restoreModuleExports(protectedCode, bindings);
    assert.match(restored, /export\s*\{\s*getMode\s*\}/);
    assert.doesNotMatch(restored, /export\s+const\s+internal/);
  });

  it('preserves oss-baseline class exports through obfuscation', async () => {
    const { bundle } = loadAndValidateCorpus();
    const caseEntry = bundle.official.cases.find((c) => c.caseId === 'official-classes-001');
    const result = protectWithExportPreservation(caseEntry.source, (input) =>
      protect({
        sourceCode: input,
        canonicalSeed: 'pilot-seed-1',
        config: BASELINE_CONFIG,
      }),
    );
    assert.match(result.code, /export\s*\{\s*Point\s*\}/);

    const semantic = await runSubjectSemanticCase({
      manifest: buildManifest(),
      experimentId: 'esm-export-test',
      caseEntry,
      subjectId: 'oss-baseline',
      seed: 'pilot-seed-1',
      sourceCode: result.code,
    });
    assert.equal(semantic.status, 'valid');
  });

  it('preserves modules-bundle exports for own-minimal', async () => {
    const { bundle } = loadAndValidateCorpus();
    const caseEntry = bundle.official.cases.find((c) => c.caseId === 'official-modules-bundle-002');
    const result = protectWithExportPreservation(caseEntry.source, (input) =>
      protectOwnMinimal({
        sourceCode: input,
        canonicalSeed: 'pilot-seed-1',
        auxiliaryTransforms: [],
      }),
    );
    assert.match(result.code, /export\s*\{\s*getMode\s*\}/);

    const semantic = await runSubjectSemanticCase({
      manifest: buildManifest(),
      experimentId: 'esm-export-test',
      caseEntry,
      subjectId: 'own-minimal',
      seed: 'pilot-seed-1',
      sourceCode: result.code,
    });
    assert.equal(semantic.status, 'valid');
  });

  it('preserves generator exports after protection', async () => {
    const { bundle } = loadAndValidateCorpus();
    const caseEntry = bundle.official.cases.find((c) => c.caseId === 'official-generators-001');
    const result = protectWithExportPreservation(caseEntry.source, (input) =>
      protectOwnMinimal({
        sourceCode: input,
        canonicalSeed: 'pilot-seed-1',
        auxiliaryTransforms: [],
      }),
    );
    assert.match(result.code, /export\s*\{\s*range\s*\}/);

    const semantic = await runSubjectSemanticCase({
      manifest: buildManifest(),
      experimentId: 'esm-export-test',
      caseEntry,
      subjectId: 'own-minimal',
      seed: 'pilot-seed-1',
      sourceCode: result.code,
    });
    assert.equal(semantic.status, 'valid');
  });
});
