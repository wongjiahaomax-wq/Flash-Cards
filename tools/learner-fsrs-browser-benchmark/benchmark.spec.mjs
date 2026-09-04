import { expect, test } from '@playwright/test';

import {
  buildSyntheticScheduledStudyRunDescriptor
} from '../../scripts/learner-fsrs-run-benchmark.mjs';
import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION,
  createDefaultFsrsParameters,
  serializeFsrsParameters
} from '../../src/lib/server/learning/fsrs-scheduler.js';
import {
  MAX_SCHEDULED_STUDY_CASES,
  buildScheduledStudyRunDescriptor
} from '../../src/lib/server/learning/study-run-planner.js';
import {
  MAX_SCHEDULED_STUDY_ROUTES
} from '../../src/lib/server/learning/study-run-envelope.js';

const encoder = new TextEncoder();
const benchmarkNow = 1_788_307_200_000;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function syntheticUuid(lane, index) {
  return `${String(lane).padStart(8, '0')}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

async function buildWorstSupportedDescriptor() {
  const profile = {
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    parametersJson: serializeFsrsParameters(createDefaultFsrsParameters())
  };
  const candidates = Array.from({ length: MAX_SCHEDULED_STUDY_CASES }, (_, index) => ({
    id: syntheticUuid(1, index)
  }));
  const routes = Array.from({ length: MAX_SCHEDULED_STUDY_ROUTES }, (_, index) => ({
    routeType: /** @type {const} */ ('topic'),
    routeId: syntheticUuid(2, index)
  }));
  const states = candidates.map((candidate, index) => ({
    userId: syntheticUuid(4, 0),
    caseId: candidate.id,
    dueAt: new Date(benchmarkNow - (index * 60_000)),
    stability: 1 + (index % 30),
    difficulty: 5,
    state: 2,
    elapsedDays: 5,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 2,
    lapses: 0,
    lastReviewAt: new Date(benchmarkNow - (5 * 24 * 60 * 60 * 1000)),
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    stateRevision: 1 + (index % 7)
  }));

  return buildScheduledStudyRunDescriptor({
    userId: syntheticUuid(4, 0),
    runScope: {
      systems: [{
        systemId: syntheticUuid(3, 0),
        mode: 'routes',
        routes
      }]
    },
    candidates,
    profile,
    preferences: { scheduledOrder: 'due_first', expandedLearning: false },
    states,
    encounters: [],
    proofSecret: 'x'.repeat(64),
    now: benchmarkNow,
    rng: () => 0.5,
    runId: syntheticUuid(5, 0)
  });
}

test('Scheduled v2 descriptors fit the supported Chromium localStorage envelope', async ({ browser, page }) => {
  await page.route('http://fsrs-benchmark.test/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>FSRS browser benchmark</title>'
    });
  });
  await page.goto('http://fsrs-benchmark.test/');

  const workloads = [
    {
      name: 'representative',
      dueCount: 1_000,
      newCount: 4_000,
      routeCount: 3,
      build: () => buildSyntheticScheduledStudyRunDescriptor({ dueCount: 1_000, newCount: 4_000 })
    },
    {
      name: 'worst-supported-max-cases-max-routes',
      dueCount: MAX_SCHEDULED_STUDY_CASES,
      newCount: 0,
      routeCount: MAX_SCHEDULED_STUDY_ROUTES,
      build: buildWorstSupportedDescriptor
    }
  ];
  const measurements = [];

  for (const workload of workloads) {
    const descriptor = await workload.build();
    const serialized = JSON.stringify(descriptor);
    const measurement = await page.evaluate(({ key, value }) => {
      localStorage.clear();
      const writeTimes = [];
      const readTimes = [];
      const parseTimes = [];
      let parsed = null;

      for (let index = 0; index < 7; index += 1) {
        let started = performance.now();
        localStorage.setItem(key, value);
        writeTimes.push(performance.now() - started);

        started = performance.now();
        const restored = localStorage.getItem(key);
        readTimes.push(performance.now() - started);
        if (restored == null) throw new Error('localStorage read unexpectedly returned null.');

        started = performance.now();
        parsed = JSON.parse(restored);
        parseTimes.push(performance.now() - started);
      }

      localStorage.removeItem(key);
      const selectedSystems = parsed?.selectedScope?.systems ?? [];
      return {
        writeTimes,
        readTimes,
        parseTimes,
        duePosition: parsed?.duePosition,
        newPosition: parsed?.newPosition,
        capturedDueCount: parsed?.capturedDue?.length,
        capturedNewCount: parsed?.capturedNew?.length,
        selectedSystemCount: selectedSystems.length,
        selectedRouteCount: selectedSystems.reduce(
          (total, system) => total + (system?.mode === 'routes' && Array.isArray(system.routes) ? system.routes.length : 0),
          0
        )
      };
    }, { key: `fsrs-${workload.name}`, value: serialized });

    expect(measurement.duePosition).toBe(0);
    expect(measurement.newPosition).toBe(0);
    expect(measurement.capturedDueCount).toBe(workload.dueCount);
    expect(measurement.capturedNewCount).toBe(workload.newCount);
    expect(measurement.selectedSystemCount).toBeGreaterThan(0);
    expect(measurement.selectedRouteCount).toBe(workload.routeCount);

    measurements.push({
      name: workload.name,
      dueCount: workload.dueCount,
      newCount: workload.newCount,
      systemCount: measurement.selectedSystemCount,
      routeCount: workload.routeCount,
      responsePayloadUtf8Bytes: encoder.encode(serialized).byteLength,
      serializedCharacters: serialized.length,
      medianLocalStorageWriteMs: median(measurement.writeTimes),
      medianLocalStorageReadMs: median(measurement.readTimes),
      medianJsonParseMs: median(measurement.parseTimes)
    });
  }

  const quota = await page.evaluate(() => {
    localStorage.clear();
    const chunkCharacters = 128 * 1024;
    const chunk = 'q'.repeat(chunkCharacters);
    let storedCharacters = 0;
    let quotaErrorName = null;

    for (let index = 0; index < 128; index += 1) {
      try {
        localStorage.setItem(`quota-${index}`, chunk);
        storedCharacters += chunkCharacters;
      } catch (error) {
        quotaErrorName = error instanceof DOMException ? error.name : String(error);
        break;
      }
    }

    localStorage.clear();
    return { storedCharacters, quotaErrorName };
  });

  expect(quota.quotaErrorName).toBe('QuotaExceededError');
  const worstSupported = measurements.find((entry) => entry.name === 'worst-supported-max-cases-max-routes');
  expect(worstSupported).toBeTruthy();
  expect(quota.storedCharacters).toBeGreaterThan(worstSupported.serializedCharacters);

  console.log(`FSRS_BROWSER_BENCHMARK_JSON=${JSON.stringify({
    version: 2,
    browserVersion: browser.version(),
    supportedScheduledMaximum: {
      cases: MAX_SCHEDULED_STUDY_CASES,
      normalizedRoutes: MAX_SCHEDULED_STUDY_ROUTES
    },
    measurements,
    quotaProbe: {
      ...quota,
      approximateStoredUtf16BytesBeforeFailure: quota.storedCharacters * 2
    },
    interpretation: 'The application boundary is 20,000 selected Scheduled Cases plus at most 512 normalized Topic/Tag routes in the canonical v2 run scope. Chromium successfully persisted/restored the combined worst-supported descriptor using UUID-length Case and route identifiers. 20,001 Cases or 513 normalized routes are rejected before learner bootstrap/state reads. The quota probe records this runner/browser storage behavior and is not a cross-browser universal quota promise.'
  })}`);
});
