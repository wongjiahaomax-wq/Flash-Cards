import { pathToFileURL } from 'node:url';

import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION,
  createDefaultFsrsParameters,
  serializeFsrsParameters
} from '../src/lib/server/learning/fsrs-scheduler.js';
import {
  MAX_SCHEDULED_STUDY_CASES,
  buildScheduledStudyRunDescriptor
} from '../src/lib/server/learning/study-run-planner.js';
import { resolveSystemStudySelectionCandidates } from '../src/lib/server/learning/system-study-routes.ts';
import { CAPTURED_MEMBERSHIP_CHUNK_SIZE } from '../src/lib/server/learning/study-run-proof.js';

const encoder = new TextEncoder();
const BENCHMARK_SECRET = 'pr-b-benchmark-only-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const BENCHMARK_NOW = 1_788_307_200_000;

/** @param {string} value */
function bytes(value) {
  return encoder.encode(value).byteLength;
}

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** @param {number} index */
function caseId(index) {
  return `case-${String(index).padStart(6, '0')}`;
}

/** @param {number} dueCount @param {number} newCount */
function syntheticPlannerInput(dueCount, newCount) {
  const total = dueCount + newCount;
  const profile = {
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    parametersJson: serializeFsrsParameters(createDefaultFsrsParameters())
  };
  return {
    userId: 'learner-benchmark',
    systemId: 'system-benchmark',
    routes: [
      { routeType: /** @type {const} */ ('topic'), routeId: 'topic-a' },
      { routeType: /** @type {const} */ ('topic'), routeId: 'topic-b' },
      { routeType: /** @type {const} */ ('tag'), routeId: 'tag-a' }
    ],
    candidates: Array.from({ length: total }, (_, index) => ({ id: caseId(index) })),
    profile,
    preferences: { scheduledOrder: /** @type {const} */ ('due_first'), expandedLearning: false },
    states: Array.from({ length: dueCount }, (_, index) => ({
      userId: 'learner-benchmark',
      caseId: caseId(index),
      dueAt: new Date(BENCHMARK_NOW - (index * 60_000)),
      stability: 1 + (index % 30),
      difficulty: 5,
      state: 2,
      elapsedDays: 5,
      scheduledDays: 1,
      learningSteps: 0,
      reps: 2,
      lapses: 0,
      lastReviewAt: new Date(BENCHMARK_NOW - (5 * 24 * 60 * 60 * 1000)),
      generation: 1,
      reviewSequenceEpoch: 1,
      parameterRevision: 1,
      schedulerRevision: FSRS_SCHEDULER_REVISION,
      schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
      stateRevision: 1 + (index % 7)
    })),
    encounters: [],
    proofSecret: BENCHMARK_SECRET,
    now: BENCHMARK_NOW,
    rng: () => 0.5,
    runId: `run-benchmark-${dueCount}-${newCount}`
  };
}

/**
 * Build the same Scheduled descriptor shape used by production planning, using
 * synthetic candidates/state solely to make the benchmark deterministic.
 *
 * @param {{dueCount:number,newCount:number,chunkSize?:number}} input
 */
export async function buildSyntheticScheduledStudyRunDescriptor(input) {
  return buildScheduledStudyRunDescriptor({
    ...syntheticPlannerInput(input.dueCount, input.newCount),
    membershipChunkSize: input.chunkSize ?? CAPTURED_MEMBERSHIP_CHUNK_SIZE
  });
}

/** @param {number} caseCount */
function syntheticSelection(caseCount) {
  const topicCount = Math.min(20, Math.max(1, Math.ceil(caseCount / 100)));
  const tagCount = 4;
  const concepts = [
    { id: 'system-benchmark', name: 'Benchmark System', kind: 'system', parentId: null, isActive: true },
    ...Array.from({ length: topicCount }, (_, index) => ({
      id: `topic-${index}`,
      name: `Topic ${index}`,
      kind: 'topic',
      parentId: 'system-benchmark',
      isActive: true
    }))
  ];
  const caseTopicRows = Array.from({ length: caseCount }, (_, index) => ({
    id: caseId(index),
    title: `Case ${index}`,
    isActive: true,
    conceptId: `topic-${index % topicCount}`,
    role: 'primary'
  }));
  const systemTagRows = Array.from({ length: tagCount }, (_, index) => ({
    systemConceptId: 'system-benchmark',
    tagId: `tag-${index}`,
    tagName: `Tag ${index}`,
    displayOrder: index
  }));
  const caseTagRows = Array.from({ length: caseCount }, (_, index) => ({
    caseId: caseId(index),
    tagId: `tag-${index % tagCount}`,
    tagName: `Tag ${index % tagCount}`
  }));
  const routes = [
    ...Array.from({ length: topicCount }, (_, index) => ({
      routeType: /** @type {const} */ ('topic'),
      routeId: `topic-${index}`
    })),
    ...Array.from({ length: tagCount }, (_, index) => ({
      routeType: /** @type {const} */ ('tag'),
      routeId: `tag-${index}`
    }))
  ];
  return { concepts, caseTopicRows, caseTagRows, systemTagRows, routes };
}

/**
 * @param {{
 *   dueCount?:number,
 *   newCount?:number,
 *   chunkSize?:number,
 *   iterations?:number
 * }} [options]
 */
export async function runStudyRunDescriptorBenchmark(options = {}) {
  const dueCount = options.dueCount ?? 1_000;
  const newCount = options.newCount ?? 4_000;
  const chunkSize = options.chunkSize ?? CAPTURED_MEMBERSHIP_CHUNK_SIZE;
  const iterations = options.iterations ?? 10;
  const selection = syntheticSelection(dueCount + newCount);
  const selectionTimes = [];
  let resolvedCandidates = [];
  for (let index = 0; index < Math.max(1, Math.min(iterations, 5)); index += 1) {
    const started = performance.now();
    resolvedCandidates = resolveSystemStudySelectionCandidates({
      ...selection,
      systemId: 'system-benchmark',
      routes: selection.routes
    });
    selectionTimes.push(performance.now() - started);
  }

  const [chosen, perEntry] = await Promise.all([
    buildSyntheticScheduledStudyRunDescriptor({ dueCount, newCount, chunkSize }),
    buildSyntheticScheduledStudyRunDescriptor({ dueCount, newCount, chunkSize: 1 })
  ]);

  /** @param {Awaited<ReturnType<typeof buildSyntheticScheduledStudyRunDescriptor>>} descriptor */
  const measure = (descriptor) => {
    const serialized = JSON.stringify(descriptor);
    const stringifyTimes = [];
    const parseTimes = [];
    for (let index = 0; index < iterations; index += 1) {
      let started = performance.now();
      const value = JSON.stringify(descriptor);
      stringifyTimes.push(performance.now() - started);
      started = performance.now();
      JSON.parse(value);
      parseTimes.push(performance.now() - started);
    }
    const proofs = [...descriptor.membershipProofs.due, ...descriptor.membershipProofs.new];
    return {
      descriptorBytes: bytes(serialized),
      proofCount: proofs.length,
      proofBytes: proofs.reduce((total, token) => total + bytes(token), 0),
      maxSingleProofBytes: Math.max(0, ...proofs.map(bytes)),
      medianStringifyMs: median(stringifyTimes),
      medianParseMs: median(parseTimes)
    };
  };

  const chosenResult = measure(chosen);
  const perEntryResult = measure(perEntry);
  return {
    version: 2,
    representativeWorkload: {
      due: dueCount,
      new: newCount,
      total: dueCount + newCount
    },
    supportedScheduledMaximum: MAX_SCHEDULED_STUDY_CASES,
    chosenChunkSize: chunkSize,
    selectionResolver: {
      routeCount: selection.routes.length,
      candidateCount: resolvedCandidates.length,
      medianMs: median(selectionTimes)
    },
    chosen: chosenResult,
    perEntryCapability: perEntryResult,
    ratios: {
      descriptorBytesVsPerEntry: chosenResult.descriptorBytes / perEntryResult.descriptorBytes,
      proofBytesVsPerEntry: chosenResult.proofBytes / perEntryResult.proofBytes
    },
    interpretation: 'Node serialization companion benchmark. Real Chromium/localStorage evidence is owned by the dedicated learner FSRS browser benchmark workflow.'
  };
}

async function main() {
  console.log(JSON.stringify(await runStudyRunDescriptorBenchmark(), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
