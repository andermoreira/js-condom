import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadAndValidateCorpus } from '../../src/corpus/corpus.js';
import { protectCandidate } from '../../src/runner/official-matrix.js';
import { computeOfficialBlindingHashes } from '../../src/runner/official-blinding.js';

describe('official-blinding', () => {
  it('computes hashes that match pre-evaluation registry for frozen manifest', () => {
    const manifest = JSON.parse(
      readFileSync('experiments/official/manifest.json', 'utf8'),
    );
    const { bundle } = loadAndValidateCorpus();
    const hashes = computeOfficialBlindingHashes({
      manifest,
      cases: bundle.official.cases,
      protectCandidate,
      rngSeed: manifest.blinding?.rngSeed ?? 42,
    });

    assert.equal(hashes.mappingArtifactHash, manifest.blinding.mappingArtifactHash);
    assert.equal(hashes.evaluatorViewHash, manifest.blinding.evaluatorViewHash);
  });
});
