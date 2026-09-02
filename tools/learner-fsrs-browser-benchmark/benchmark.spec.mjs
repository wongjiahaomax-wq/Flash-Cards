import { expect, test } from '@playwright/test';

import {
  buildSyntheticScheduledStudyRunDescriptor
} from '../../scripts/learner-fsrs-run-benchmark.mjs';
import {
  MAX_SCHEDULED_STUDY_CASES
} from '../../src/lib/server/learning/study-run-planner.js';

const encoder = new TextEncoder();

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

test('Scheduled descriptors fit the supported Chromium localStorage envelope', async ({ browser, page }) => {
  await page.route('http://fsrs-benchmark.test/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>FSRS browser benchmark</title>'
    });
  });
  await page.goto('http://fsrs-benchmark.test/');

  const workloads = [
    { name: 'representative', dueCount: 1_000, newCount: 4_000 },
    { name: 'worst-supported-all-due', dueCount: MAX_SCHEDULED_STUDY_CASES, newCount: 0 }
  ];
  const measurements = [];

  for (const workload of workloads) {
    const descriptor = await buildSyntheticScheduledStudyRunDescriptor(workload);
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
      return {
        writeTimes,
        readTimes,
        parseTimes,
        duePosition: parsed?.duePosition,
        newPosition: parsed?.newPosition,
        capturedDueCount: parsed?.capturedDue?.length,
        capturedNewCount: parsed?.capturedNew?.length
      };
    }, { key: `fsrs-${workload.name}`, value: serialized });

    expect(measurement.duePosition).toBe(0);
    expect(measurement.newPosition).toBe(0);
    expect(measurement.capturedDueCount).toBe(workload.dueCount);
    expect(measurement.capturedNewCount).toBe(workload.newCount);

    measurements.push({
      ...workload,
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
  const worstSupported = measurements.find((entry) => entry.name === 'worst-supported-all-due');
  expect(worstSupported).toBeTruthy();
  expect(quota.storedCharacters).toBeGreaterThan(worstSupported.serializedCharacters);

  console.log(`FSRS_BROWSER_BENCHMARK_JSON=${JSON.stringify({
    version: 1,
    browserVersion: browser.version(),
    supportedScheduledMaximum: MAX_SCHEDULED_STUDY_CASES,
    measurements,
    quotaProbe: {
      ...quota,
      approximateStoredUtf16BytesBeforeFailure: quota.storedCharacters * 2
    },
    interpretation: 'The application boundary is 20,000 selected Scheduled Cases. Chromium successfully persisted/restored the worst-supported all-Due descriptor; 20,001 is rejected by server planning before bootstrap/progress. The quota probe records this runner/browser storage behavior and is not a cross-browser universal quota promise.'
  })}`);
});
