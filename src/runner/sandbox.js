import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import 'ses';

const __dirname = dirname(fileURLToPath(import.meta.url));

const NETWORK_PRELOAD_SOURCE = `function deny(label) {
  return () => {
    throw new Error('network_blocked:' + label);
  };
}

globalThis.fetch = deny('fetch');
globalThis.XMLHttpRequest = deny('XMLHttpRequest');
`;

const HARNESS_SOURCE = `import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(process.argv[2]);
const oracleUrl = pathToFileURL(process.argv[3]);
const behaviorId = process.argv[4];

const mod = await import(moduleUrl.href);
const { evaluateBehaviorOracle } = await import(oracleUrl.href);
const oracle = await evaluateBehaviorOracle(behaviorId, mod);

process.stdout.write(JSON.stringify({ type: 'oracle-result', oracle }) + '\\n');
`;

function memoryLimitMb(memoryBytes) {
  return Math.max(16, Math.floor(memoryBytes / (1024 * 1024)));
}

function buildSpawnArgs({ preloadPath, memoryBytes }) {
  const args = [
    `--max-old-space-size=${memoryLimitMb(memoryBytes)}`,
    '--no-warnings',
  ];

  if (preloadPath) {
    args.push('--import', preloadPath);
  }

  return args;
}

function terminateProcessTree(child) {
  if (!child.pid) {
    return;
  }

  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // Process already exited.
    }
  }
}

export async function runSnippetInCompartment(source, { timeoutMs = 1_000 } = {}) {
  const compartment = new globalThis.Compartment({
    globals: {
      console,
    },
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });

  try {
    const evaluation = compartment.evaluate(source);
    const result = await Promise.race([evaluation, timeoutPromise]);
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runModuleInSandbox({
  source,
  behaviorId,
  oracleEvaluatorPath,
  processTimeoutMs,
  memoryBytes,
  blockNetwork = true,
}) {
  const workDir = await mkdtemp(join(tmpdir(), 'js-protect-sandbox-'));
  const startedAt = Date.now();
  const casePath = join(workDir, 'case.mjs');
  const harnessPath = join(workDir, 'harness.mjs');
  const preloadPath = blockNetwork ? join(workDir, 'network-preload.mjs') : null;
  const markerPath = join(workDir, 'sandbox-marker.txt');

  await writeFile(casePath, source, 'utf8');
  await writeFile(harnessPath, HARNESS_SOURCE, 'utf8');
  await writeFile(markerPath, 'marker', 'utf8');

  if (preloadPath) {
    await writeFile(preloadPath, NETWORK_PRELOAD_SOURCE, 'utf8');
  }

  const execArgv = buildSpawnArgs({ preloadPath, memoryBytes });
  const child = spawn(
    process.execPath,
    [...execArgv, harnessPath, casePath, oracleEvaluatorPath, behaviorId],
    {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    },
  );

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    terminateProcessTree(child);
  }, processTimeoutMs);

  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  clearTimeout(timeoutId);

  let markerStillExists = false;
  try {
    await readFile(markerPath, 'utf8');
    markerStillExists = true;
  } catch {
    markerStillExists = false;
  }

  await rm(workDir, { recursive: true, force: true });

  let workDirRemoved = true;
  try {
    await readFile(markerPath, 'utf8');
    workDirRemoved = false;
  } catch {
    workDirRemoved = true;
  }

  const durationMs = Date.now() - startedAt;
  const memoryLimited =
    stderr.includes('heap out of memory') ||
    stderr.includes('Allocation failed') ||
    stderr.includes('JavaScript heap out of memory');

  let oracle = null;
  const oracleLine = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{'));

  if (oracleLine) {
    try {
      const payload = JSON.parse(oracleLine);
      oracle = payload.oracle ?? null;
    } catch {
      oracle = null;
    }
  }

  return {
    stdout,
    stderr,
    exitCode,
    durationMs,
    timedOut,
    memoryLimited,
    oracle,
    workDir,
    workDirRemoved,
    markerStillExists,
  };
}

export function getOracleEvaluatorPath() {
  return join(__dirname, 'semantic-runner.js');
}

export function toFileUrl(filePath) {
  return pathToFileURL(filePath).href;
}
