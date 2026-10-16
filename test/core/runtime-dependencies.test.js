import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as acorn from 'acorn';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHIPPED_DIRS = ['src/core', 'src/cli'];

function packageNameOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function collectImportedPackages(dirs) {
  const packages = new Set();
  for (const dir of dirs) {
    for (const file of readdirSync(join(REPO_ROOT, dir), { recursive: true })) {
      if (!file.endsWith('.js')) {
        continue;
      }
      const ast = acorn.parse(readFileSync(join(REPO_ROOT, dir, file), 'utf8'), {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowHashBang: true,
      });
      for (const node of ast.body) {
        const specifier = node.source?.value;
        if (
          typeof specifier === 'string' &&
          !specifier.startsWith('.') &&
          !specifier.startsWith('node:')
        ) {
          packages.add(packageNameOf(specifier));
        }
      }
    }
  }
  return packages;
}

test('runtime dependencies are exactly the packages imported by core and cli', () => {
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const declared = Object.keys(packageJson.dependencies ?? {}).sort();
  const imported = [...collectImportedPackages(SHIPPED_DIRS)].sort();

  assert.deepEqual(declared, imported);
});

test('every package imported anywhere in src is declared in package.json', () => {
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const declared = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
  const undeclared = [...collectImportedPackages(['src'])].filter((name) => !declared.has(name));

  assert.deepEqual(undeclared, []);
});
