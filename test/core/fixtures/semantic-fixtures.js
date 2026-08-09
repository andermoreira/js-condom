import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FIXED_SEED = 'js-condom-semantic-fixture-seed';

export const REQUIRED_SUPPORTED_CATEGORIES = [
  'closures',
  'classes',
  'async-promises',
  'generators',
  'exceptions',
  'modules-esm',
  'modules-cjs',
  'strings-literals',
  'control-flow',
  'optional-chaining',
  'private-fields',
];

export const REQUIRED_HAZARD_CATEGORIES = ['eval', 'with', 'function-tostring'];

/** @typedef {Object} SupportedFixture
 * @property {string} id
 * @property {string} category
 * @property {boolean} supported
 * @property {string} source
 * @property {'cjs' | 'esm'} [moduleFormat]
 * @property {string} [expectedBehaviorId]
 * @property {(moduleExports: Record<string, unknown>) => Promise<{ passed: boolean; diagnostics: string[] }>} [runOracle]
 */

/** @typedef {Object} HazardFixture
 * @property {string} id
 * @property {string} category
 * @property {boolean} supported
 * @property {string} source
 * @property {string} expectedCode
 * @property {string} hazard
 */

/** @type {SupportedFixture[]} */
export const SUPPORTED_FIXTURES = [
  {
    id: 'closures-counter',
    category: 'closures',
    supported: true,
    source:
      'export function makeCounter(start = 0) {\n  let value = start;\n  return () => ++value;\n}\n',
    expectedBehaviorId: 'behavior-closure-counter',
  },
  {
    id: 'classes-point',
    category: 'classes',
    supported: true,
    source:
      'export class Point {\n  constructor(x, y) {\n    this.x = x;\n    this.y = y;\n  }\n  move(dx, dy) {\n    return new Point(this.x + dx, this.y + dy);\n  }\n}\n',
    expectedBehaviorId: 'behavior-class-point',
  },
  {
    id: 'async-delay',
    category: 'async-promises',
    supported: true,
    source:
      'export async function delay(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n',
    expectedBehaviorId: 'behavior-async-delay',
  },
  {
    id: 'generators-range',
    category: 'generators',
    supported: true,
    source:
      'export function* range(start, end) {\n  for (let i = start; i < end; i += 1) yield i;\n}\n',
    expectedBehaviorId: 'behavior-generator-range',
  },
  {
    id: 'exceptions-safe-parse',
    category: 'exceptions',
    supported: true,
    source:
      'export function safeParse(json) {\n  try {\n    return { ok: true, value: JSON.parse(json) };\n  } catch (error) {\n    return { ok: false, message: error.message };\n  }\n}\n',
    expectedBehaviorId: 'behavior-exception-safe-parse',
  },
  {
    id: 'modules-esm-constants',
    category: 'modules-esm',
    supported: true,
    source:
      'export const API_VERSION = 1;\nexport function isEnabled(flag) {\n  return flag === "on";\n}\n',
    expectedBehaviorId: 'behavior-module-constants',
  },
  {
    id: 'modules-cjs-add',
    category: 'modules-cjs',
    supported: true,
    moduleFormat: 'cjs',
    source: 'module.exports = {\n  add(a, b) {\n    return a + b;\n  },\n};\n',
    async runOracle(mod) {
      const exports = mod.default ?? mod;
      if (typeof exports.add !== 'function' || exports.add(2, 3) !== 5) {
        return {
          passed: false,
          diagnostics: [`expected add(2,3) to return 5 but got ${exports.add?.(2, 3)}`],
        };
      }
      return { passed: true, diagnostics: [] };
    },
  },
  {
    id: 'strings-template',
    category: 'strings-literals',
    supported: true,
    source:
      'export function greet(name) {\n  return `hello ${name.toUpperCase()}`;\n}\n',
    expectedBehaviorId: 'behavior-string-template',
  },
  {
    id: 'control-flow-fizzbuzz',
    category: 'control-flow',
    supported: true,
    source:
      'export function fizzbuzz(n) {\n  if (n % 15 === 0) return "fizzbuzz";\n  if (n % 3 === 0) return "fizz";\n  if (n % 5 === 0) return "buzz";\n  return String(n);\n}\n',
    expectedBehaviorId: 'behavior-control-fizzbuzz',
  },
  {
    id: 'optional-chaining-get-value',
    category: 'optional-chaining',
    supported: true,
    source:
      'export function getValue(obj) {\n  return obj?.value;\n}\n',
    async runOracle(mod) {
      if (mod.getValue({ value: 42 }) !== 42) {
        return { passed: false, diagnostics: ['getValue({ value: 42 }) should return 42'] };
      }
      if (mod.getValue(null) !== undefined) {
        return { passed: false, diagnostics: ['getValue(null) should return undefined'] };
      }
      return { passed: true, diagnostics: [] };
    },
  },
  {
    id: 'private-fields-secret',
    category: 'private-fields',
    supported: true,
    source:
      'export class Box {\n  #secret = 7;\n  getSecret() {\n    return this.#secret;\n  }\n}\n',
    async runOracle(mod) {
      const box = new mod.Box();
      if (box.getSecret() !== 7) {
        return {
          passed: false,
          diagnostics: [`expected getSecret() to return 7 but got ${box.getSecret()}`],
        };
      }
      return { passed: true, diagnostics: [] };
    },
  },
];

/** @type {HazardFixture[]} */
export const HAZARD_FIXTURES = [
  {
    id: 'eval-direct',
    category: 'eval',
    supported: false,
    source:
      'export function runDynamic(expression) {\n  return eval(expression);\n}\n',
    expectedCode: 'UNSUPPORTED_SYNTAX',
    hazard: 'direct-eval',
  },
  {
    id: 'with-statement',
    category: 'with',
    supported: false,
    source:
      'export function readLength(obj) {\n  with (obj) {\n    return length;\n  }\n}\n',
    expectedCode: 'UNSUPPORTED_SYNTAX',
    hazard: 'with-statement',
  },
  {
    id: 'function-tostring',
    category: 'function-tostring',
    supported: false,
    source:
      'export function dependsOnToString(fn) {\n  return fn.toString().includes("return value");\n}\n',
    expectedCode: 'SEMANTIC_HAZARD',
    hazard: 'function-prototype-tostring',
  },
];

export const SEMANTIC_FIXTURES = [...SUPPORTED_FIXTURES, ...HAZARD_FIXTURES];

function resolveModuleExtension(sourceCode, moduleFormat) {
  if (moduleFormat === 'cjs') {
    return '.cjs';
  }
  if (moduleFormat === 'esm') {
    return '.mjs';
  }
  if (/\bmodule\.exports\b/.test(sourceCode)) {
    return '.cjs';
  }
  return '.mjs';
}

export async function loadFixtureModule(sourceCode, { moduleFormat } = {}) {
  const extension = resolveModuleExtension(sourceCode, moduleFormat);
  const workDir = await mkdtemp(join(tmpdir(), 'js-condom-fixture-'));

  try {
    const filePath = join(workDir, `fixture${extension}`);
    await writeFile(filePath, sourceCode, 'utf8');
    return await import(pathToFileURL(filePath).href);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function assertFixtureMatrixIntegrity() {
  const ids = new Set();
  for (const fixture of SEMANTIC_FIXTURES) {
    if (ids.has(fixture.id)) {
      throw new Error(`duplicate fixture id: ${fixture.id}`);
    }
    ids.add(fixture.id);
  }

  for (const category of REQUIRED_SUPPORTED_CATEGORIES) {
    if (!SUPPORTED_FIXTURES.some((fixture) => fixture.category === category)) {
      throw new Error(`missing supported fixture for category: ${category}`);
    }
  }

  for (const category of REQUIRED_HAZARD_CATEGORIES) {
    if (!HAZARD_FIXTURES.some((fixture) => fixture.category === category)) {
      throw new Error(`missing hazard fixture for category: ${category}`);
    }
  }
}
