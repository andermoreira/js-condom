import { createHash, randomBytes } from 'node:crypto';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function hashCanonicalPayload(payload) {
  const digest = createHash('sha256').update(stableStringify(payload), 'utf8').digest('hex');
  return `sha256-${digest}`;
}

export function createSeededRng(seed) {
  let state = seed >>> 0;

  return {
    next() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    },
    random() {
      return this.next() / 0x100000000;
    },
  };
}

function generateOpaqueId(rng, index) {
  if (rng) {
    return `artifact-${rng.next().toString(16).padStart(8, '0')}-${index}`;
  }

  return `artifact-${randomBytes(8).toString('hex')}`;
}

export function createBlindingRegistry({ artifacts, randomizeOrder = true, rng = null }) {
  const entries = artifacts.map((artifact, index) => ({
    blindArtifactId: generateOpaqueId(rng, index),
    caseId: artifact.caseId,
    subjectId: artifact.subjectId,
    seed: artifact.seed ?? null,
    sourceCode: artifact.sourceCode,
    recoveryTaskIds: [...(artifact.recoveryTaskIds ?? [])],
  }));

  return {
    entries,
    resultsLocked: false,
    revealed: false,
    randomizeOrder,
    rng,
  };
}

export function buildMappingArtifact(registry) {
  const mapping = Object.fromEntries(
    registry.entries.map((entry) => [
      entry.blindArtifactId,
      {
        caseId: entry.caseId,
        subjectId: entry.subjectId,
        seed: entry.seed,
      },
    ]),
  );

  return {
    mapping,
    hash: hashCanonicalPayload(mapping),
  };
}

export function buildEvaluatorView(registry, tasks) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const queue = [];

  for (const entry of registry.entries) {
    for (const taskId of entry.recoveryTaskIds) {
      const task = taskById.get(taskId);
      if (!task) {
        continue;
      }

      queue.push({
        blindArtifactId: entry.blindArtifactId,
        taskId: task.id,
        objective: task.objective,
        artifact: {
          content: entry.sourceCode,
          mediaType: 'application/javascript',
          encoding: 'utf8',
        },
      });
    }
  }

  return {
    queue,
    hash: hashCanonicalPayload(queue),
  };
}

export function shuffleEvaluationQueue(queue, rng) {
  const shuffled = [...queue];
  const random = rng ? () => rng.random() : Math.random;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function hashEvaluatorView(view) {
  return hashCanonicalPayload(view.queue ?? view);
}

export function lockResults(registry) {
  registry.resultsLocked = true;
}

export function revealMapping(registry) {
  if (!registry.resultsLocked) {
    throw new Error('mapping_reveal_blocked: results are not locked');
  }

  if (registry.revealed) {
    throw new Error('mapping_already_revealed');
  }

  registry.revealed = true;
  return buildMappingArtifact(registry);
}
