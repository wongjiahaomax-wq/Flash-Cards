import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION,
  createDefaultFsrsParameters,
  serializeFsrsParameters
} from '../src/lib/server/learning/fsrs-scheduler.js';
import {
  MAX_SCHEDULED_STUDY_CASES,
  buildFreeStudyRunDescriptor,
  buildScheduledStudyRunDescriptor
} from '../src/lib/server/learning/study-run-planner.js';
import {
  MAX_MULTI_SYSTEM_RAW_ROUTES,
  MAX_MULTI_SYSTEM_RAW_SYSTEMS,
  normalizeMultiSystemStudyRunScope,
  resolveMultiSystemStudySelectionCandidates
} from '../src/lib/server/learning/multi-system-study-scope.ts';

const SECRET = 'multi-system-v2-supported-envelope-benchmark-secret-0123456789';
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const MAX_BROWSER_DESCRIPTOR_BYTES = 4_500_000;
const MAX_RESOLUTION_MS = 5_000;
const MAX_PLANNING_MS = 5_000;
const encoder = new TextEncoder();

function bytes(value) {
  return encoder.encode(value).byteLength;
}
function systemId(index) {
  return `system-${String(index).padStart(3, '0')}`;
}
function topicId(systemIndex, topicIndex) {
  return `topic-${String(systemIndex).padStart(3, '0')}-${String(topicIndex).padStart(2, '0')}`;
}
function caseId(index) {
  return `case-${String(index).padStart(6, '0')}`;
}

function supportedEnvelopeFixture() {
  const systemCount = MAX_MULTI_SYSTEM_RAW_SYSTEMS;
  const routesPerSystem = MAX_MULTI_SYSTEM_RAW_ROUTES / systemCount;
  assert.equal(Number.isInteger(routesPerSystem), true);
  const concepts = [];
  const systems = [];
  for (let systemIndex = 0; systemIndex < systemCount; systemIndex += 1) {
    const id = systemId(systemIndex);
    concepts.push({ id, name: id, kind: 'system', parentId: null, isActive: true });
    const routes = [];
    for (let topicIndex = 0; topicIndex < routesPerSystem; topicIndex += 1) {
      const routeId = topicId(systemIndex, topicIndex);
      concepts.push({ id: routeId, name: routeId, kind: 'topic', parentId: id, isActive: true });
      routes.push({ routeType: 'topic', routeId });
    }
    systems.push({ systemId: id, mode: 'routes', routes });
  }

  const caseTopicRows = Array.from({ length: MAX_SCHEDULED_STUDY_CASES }, (_, index) => {
    const systemIndex = index % systemCount;
    const topicIndex = Math.floor(index / systemCount) % routesPerSystem;
    return {
      id: caseId(index),
      title: `Case ${index}`,
      vignetteMd: null,
      isActive: true,
      conceptId: topicId(systemIndex, topicIndex),
      role: 'primary'
    };
  });
  return { concepts, caseTopicRows, caseTagRows: [], systemTagRows: [], systems: systems.reverse() };
}

export async function runMultiSystemV2Benchmark() {
  const fixture = supportedEnvelopeFixture();
  let started = performance.now();
  const runScope = normalizeMultiSystemStudyRunScope(fixture);
  const normalizeMs = performance.now() - started;

  started = performance.now();
  const candidates = resolveMultiSystemStudySelectionCandidates({ ...fixture, runScope });
  const resolveMs = performance.now() - started;
  assert.equal(candidates.length, MAX_SCHEDULED_STUDY_CASES);

  const profile = {
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    parametersJson: serializeFsrsParameters(createDefaultFsrsParameters())
  };
  const preferences = { scheduledOrder: 'due_first', expandedLearning: false };

  started = performance.now();
  const scheduled = await buildScheduledStudyRunDescriptor({
    userId: 'multi-v2-benchmark-user',
    runScope,
    candidates,
    profile,
    preferences,
    states: [],
    encounters: [],
    proofSecret: SECRET,
    now: NOW,
    rng: () => 0.5,
    runId: 'multi-v2-benchmark-scheduled'
  });
  const scheduledPlanningMs = performance.now() - started;

  started = performance.now();
  const free = buildFreeStudyRunDescriptor({
    userId: 'multi-v2-benchmark-user',
    runScope,
    candidates,
    preferences,
    now: NOW,
    rng: () => 0.5,
    runId: 'multi-v2-benchmark-free'
  });
  const freePlanningMs = performance.now() - started;

  const scheduledJson = JSON.stringify(scheduled);
  const freeJson = JSON.stringify(free);
  const proofTokens = [...scheduled.membershipProofs.due, ...scheduled.membershipProofs.new];
  const result = {
    version: 2,
    supportedEnvelope: {
      systems: runScope.systems.length,
      normalizedRoutes: runScope.systems.reduce((total, system) => total + (system.mode === 'routes' ? system.routes.length : 0), 0),
      uniqueCases: candidates.length
    },
    timingsMs: {
      normalize: Number(normalizeMs.toFixed(2)),
      unionDeduplicateAndAttribute: Number(resolveMs.toFixed(2)),
      scheduledDescriptorAndProofs: Number(scheduledPlanningMs.toFixed(2)),
      freeBag: Number(freePlanningMs.toFixed(2))
    },
    browserEnvelope: {
      scheduledDescriptorBytes: bytes(scheduledJson),
      freeDescriptorBytes: bytes(freeJson),
      proofCount: proofTokens.length,
      proofBytes: proofTokens.reduce((total, token) => total + bytes(token), 0),
      largestProofBytes: Math.max(...proofTokens.map(bytes))
    },
    limits: {
      maxSystems: MAX_MULTI_SYSTEM_RAW_SYSTEMS,
      maxRoutes: MAX_MULTI_SYSTEM_RAW_ROUTES,
      maxCases: MAX_SCHEDULED_STUDY_CASES,
      maxBrowserDescriptorBytes: MAX_BROWSER_DESCRIPTOR_BYTES,
      maxResolutionMs: MAX_RESOLUTION_MS,
      maxPlanningMs: MAX_PLANNING_MS
    }
  };

  assert.ok(normalizeMs + resolveMs < MAX_RESOLUTION_MS, `v2 scope resolution exceeded ${MAX_RESOLUTION_MS}ms`);
  assert.ok(scheduledPlanningMs < MAX_PLANNING_MS, `Scheduled v2 planning exceeded ${MAX_PLANNING_MS}ms`);
  assert.ok(freePlanningMs < MAX_PLANNING_MS, `Free v2 planning exceeded ${MAX_PLANNING_MS}ms`);
  assert.ok(result.browserEnvelope.scheduledDescriptorBytes < MAX_BROWSER_DESCRIPTOR_BYTES, 'Scheduled descriptor exceeds supported browser envelope');
  assert.ok(result.browserEnvelope.freeDescriptorBytes < MAX_BROWSER_DESCRIPTOR_BYTES, 'Free descriptor exceeds supported browser envelope');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await runMultiSystemV2Benchmark(), null, 2));
}
