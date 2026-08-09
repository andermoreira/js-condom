import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { resolveProtectionConfig, validateProtectInput } from './config.js';
import { createPublicError } from './errors.js';
import {
  analyzeSemanticHazards,
  detectSourceType,
  validateProtectedSyntax,
} from './hazard-policy.js';
import { buildProtectionMetadata } from './metadata.js';

async function smokeLoadProtectedCode(sourceCode) {
  const sourceType = detectSourceType(sourceCode);
  const extension = sourceType === 'module' ? '.mjs' : '.cjs';
  const workDir = await mkdtemp(join(tmpdir(), 'js-condom-smoke-'));

  try {
    const filePath = join(workDir, `smoke${extension}`);
    await writeFile(filePath, sourceCode, 'utf8');
    await import(pathToFileURL(filePath).href);
  } catch (error) {
    throw createPublicError(
      'OUTPUT_CONFLICT',
      'protected code failed execution smoke test',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Protects JavaScript source code using the versioned preset.
 *
 * @param {string} sourceCode
 * @param {import('./config.js').ProtectOptions} [options]
 * @returns {Promise<import('./config.js').ProtectResult>}
 */
export async function protect(sourceCode, options = {}) {
  validateProtectInput(sourceCode);
  const resolvedConfig = resolveProtectionConfig(options);
  analyzeSemanticHazards(sourceCode);

  let outputCode;
  try {
    outputCode = JavaScriptObfuscator.obfuscate(sourceCode, {
      ...resolvedConfig.preset,
      seed: resolvedConfig.seedUsed,
    }).getObfuscatedCode();
  } catch (error) {
    throw createPublicError(
      'PROTECTION_FAILED',
      'javascript-obfuscator failed to protect input',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  validateProtectedSyntax(outputCode);
  await smokeLoadProtectedCode(outputCode);

  return {
    code: outputCode,
    metadata: buildProtectionMetadata({
      sourceCode,
      outputCode,
      resolvedConfig,
    }),
  };
}
