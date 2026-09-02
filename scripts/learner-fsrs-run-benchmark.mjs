import { pathToFileURL } from 'node:url';

import { resolveSystemStudySelectionCandidates } from '../src/lib/server/learning/system-study-routes.ts';
import {
  CAPTURED_MEMBERSHIP_CHUNK_SIZE,
  fingerprintStudyScope,
  issueCapturedMembershipProofs,
  issueScheduledRunBoundaryToken
} from '../src/lib/server/learning/study-run-proof.js';

const encoder = new TextEncoder();
const BENCHMARK_SECRET = 'pr-b-benchmark-only-secret-0123456789abcdefghijklmnopqrstuvwxyz';

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
function syntheticEntries(dueCount, newCount) {
  const due = Array.from({ length: dueCount }, (_, index) => ({
    caseId: caseId(index),
    stateRevision: 1 + (index % 7),
    dueAt: 1_788_307_200_000 - (index * 60_000)
  }));
  const fresh = Array.from({ length: newCount }, (_, index) => ({
    caseId: caseId(dueCount + index)
  }));
  return { due, fresh };
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
  const scope = {
    systemId: 'system-benchmark',
    routes: [
      { routeType: /** @type {const} */ ('topic'), routeId: 'topic-a' },
      { routeType: /** @type {const} */ ('topic'), routeId: 'topic-b' },
      { routeType: /** @type {const} */ ('tag'), routeId: 'tag-a' }
    ]
  };
  const scopeFingerprint = await fingerprintStudyScope(scope);
  const boundary = {
    userId: 'learner-benchmark',
    runId: 'run-benchmark',
    runStartedAt: 1_788_307_200_000,
    scopeFingerprint,
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: 1,
    schedulerLibraryVersion: '5.4.2'
  };
  const runToken = await issueScheduledRunBoundaryToken({
    secret: BENCHMARK_SECRET,
    boundary
  });
  const { due, fresh } = syntheticEntries(dueCount, newCount);

  const buildDescriptor = async (proofChunkSize) => {
    const [dueProofs, newProofs] = await Promise.all([
      issueCapturedMembershipProofs({
        secret: BENCHMARK_SECRET,
        runToken,
        boundary,
        queueClass: 'due',
        entries: due,
        chunkSize: proofChunkSize
      }),
      issueCapturedMembershipProofs({
        secret: BENCHMARK_SECRET,
        runToken,
        boundary,
        queueClass: 'new',
        entries: fresh,
        chunkSize: proofChunkSize
      })
    ]);
    return {
      version: 1,
      kind: 'scheduled',
      userId: boundary.userId,
      runId: boundary.runId,
      runStartedAt: boundary.runStartedAt,
      selectedScope: scope,
      scopeFingerprint,
      runBoundaryToken: runToken,
      schedulerBoundary: {
        generation: 1,
        reviewSequenceEpoch: 1,
        parameterRevision: 1,
        schedulerRevision: 1,
        schedulerLibraryVersion: '5.4.2'
      },
      scheduledOrder: 'due_first',
      expandedLearning: false,
      capturedDue: due.map((entry, index) => ({
        ...entry,
        proofIndex: Math.floor(index / proofChunkSize)
      })),
      capturedNew: fresh.map((entry, index) => ({
        ...entry,
        proofIndex: Math.floor(index / proofChunkSize)
      })),
      membershipProofs: {
        version: 1,
        chunkSize: proofChunkSize,
        due: dueProofs,
        new: newProofs
      },
      repeatEntries: [],
      completedCaseIds: [],
      consecutiveNewCompleted: 0,
      currentReviewId: null
    };
  };

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

  const chosen = await buildDescriptor(chunkSize);
  const perEntry = await buildDescriptor(1);

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
    version: 1,
    representativeWorkload: {
      due: dueCount,
      new: newCount,
      total: dueCount + newCount
    },
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
    interpretation: 'Node UTF-8 serialization benchmark; browser quota/engine limits must be assessed separately.'
  };
}

async function main() {
  console.log(JSON.stringify(await runStudyRunDescriptorBenchmark(), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
