import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALLOWED_OBFUSCATOR_CONFIG_KEYS,
  CANONICAL_SEED_PROJECTION_ALGORITHM,
  CANDIDATE_ID,
  FORBIDDEN_CONFIG_KEYS,
  OssBaselineError,
  REQUIRED_OBFUSCATOR_CONFIG_KEYS,
  TOOL_NAME,
  getToolRecord,
  projectCanonicalSeed,
  protect,
} from '../../src/candidates/oss-baseline.js';

const SAMPLE_SOURCE = 'function add(a, b) { return a + b; }';

const EXPLICIT_CONFIG = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  stringArray: true,
  stringArrayShuffle: true,
  target: 'browser',
  unicodeEscapeSequence: false,
};

test('registers pinned tool version and integrity from lockfile', () => {
  const tool = getToolRecord();
  assert.equal(tool.name, TOOL_NAME);
  assert.equal(tool.version, '4.1.0');
  assert.equal(tool.source, 'npm');
  assert.match(tool.integrity, /^sha512-/);
  assert.equal(tool.command, 'npx javascript-obfuscator');
});

test('projects canonical seeds deterministically without silent collision for fixture seeds', () => {
  const first = projectCanonicalSeed('pilot-seed-1');
  const second = projectCanonicalSeed('pilot-seed-1');
  const other = projectCanonicalSeed('pilot-seed-2');

  assert.equal(first.projectionRecord, second.projectionRecord);
  assert.equal(first.algorithm, CANONICAL_SEED_PROJECTION_ALGORITHM);
  assert.match(first.projectionRecord, /^sha256-mod-2\*\*31:\d+$/);
  assert.notEqual(first.projectedSeed, other.projectedSeed);
});

test('rejects invalid canonical seeds and configs with diagnostics', () => {
  assert.throws(
    () => projectCanonicalSeed(''),
    (error) => error instanceof OssBaselineError && error.code === 'invalid_canonical_seed',
  );

  assert.throws(
    () =>
      protect({
        sourceCode: SAMPLE_SOURCE,
        canonicalSeed: 'seed-a',
        config: { ...EXPLICIT_CONFIG, seed: 42 },
      }),
    (error) => error instanceof OssBaselineError && error.code === 'forbidden_config_key',
  );

  assert.throws(
    () =>
      protect({
        sourceCode: SAMPLE_SOURCE,
        canonicalSeed: 'seed-a',
        config: { compact: true, unknownOption: true },
      }),
    (error) => error instanceof OssBaselineError && error.code === 'invalid_config',
  );

  assert.throws(
    () =>
      protect({
        sourceCode: '',
        canonicalSeed: 'seed-a',
        config: EXPLICIT_CONFIG,
      }),
    (error) => error instanceof OssBaselineError && error.code === 'invalid_input',
  );
});

test('requires every explicit obfuscator option and forbids parallel seed config', () => {
  for (const key of REQUIRED_OBFUSCATOR_CONFIG_KEYS) {
    const partial = { ...EXPLICIT_CONFIG };
    delete partial[key];
    assert.throws(
      () =>
        protect({
          sourceCode: SAMPLE_SOURCE,
          canonicalSeed: 'seed-a',
          config: partial,
        }),
      (error) => error instanceof OssBaselineError && error.code === 'missing_config_key',
    );
  }

  for (const key of FORBIDDEN_CONFIG_KEYS) {
    assert.equal(ALLOWED_OBFUSCATOR_CONFIG_KEYS.has(key), false);
  }
});

test('produces reproducible output and records config and projected seed in metadata', () => {
  const first = protect({
    sourceCode: SAMPLE_SOURCE,
    canonicalSeed: 'pilot-seed-1',
    config: EXPLICIT_CONFIG,
  });
  const second = protect({
    sourceCode: SAMPLE_SOURCE,
    canonicalSeed: 'pilot-seed-1',
    config: EXPLICIT_CONFIG,
  });
  const otherSeed = protect({
    sourceCode: SAMPLE_SOURCE,
    canonicalSeed: 'pilot-seed-2',
    config: EXPLICIT_CONFIG,
  });

  assert.equal(first.code, second.code);
  assert.notEqual(first.code, otherSeed.code);
  assert.equal(first.metadata.candidateId, CANDIDATE_ID);
  assert.equal(first.metadata.tool.version, '4.1.0');
  assert.deepEqual(first.metadata.config, EXPLICIT_CONFIG);
  assert.equal(first.metadata.canonicalSeed, 'pilot-seed-1');
  assert.equal(first.metadata.projectedSeed, projectCanonicalSeed('pilot-seed-1').projectedSeed);
  assert.equal(
    first.metadata.canonicalSeedProjection,
    projectCanonicalSeed('pilot-seed-1').projectionRecord,
  );
  assert.equal(first.metadata.obfuscatorOptions.seed, first.metadata.projectedSeed);
  assert.notEqual(first.metadata.obfuscatorOptions.seed, otherSeed.metadata.obfuscatorOptions.seed);
});
