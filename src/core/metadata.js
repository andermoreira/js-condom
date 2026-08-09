import { createHash } from 'node:crypto';
import { buildConfigRecord, getToolVersion, serializeConfigRecord } from './config.js';

export function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function computeConfigSha256(configRecord) {
  return sha256Hex(serializeConfigRecord(configRecord));
}

export function buildProtectionMetadata({ sourceCode, outputCode, resolvedConfig }) {
  const configRecord = buildConfigRecord(resolvedConfig);

  return {
    toolVersion: getToolVersion(),
    engineVersion: resolvedConfig.engineVersion,
    presetVersion: resolvedConfig.presetVersion,
    seedUsed: resolvedConfig.seedUsed,
    inputSha256: sha256Hex(sourceCode),
    outputSha256: sha256Hex(outputCode),
    configSha256: computeConfigSha256(configRecord),
  };
}
