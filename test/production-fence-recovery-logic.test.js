import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildRecoveryRecord,
	evaluateStudyResponse,
	validateRecoveryRecord
} from '../scripts/production-fence-recovery.mjs';

const BASE_URL = 'https://flash-cards.mmed-fm-flashcardstest.workers.dev';
const VERSION = '0ac08060-18ae-4809-87ec-a5f14defd8ae';
const SHA = 'a4f481f95b6b4c487c0b8eeafa9c205c44aba599';

function healthyProbe() {
	return evaluateStudyResponse(
		{
			status: 303,
			location: '/sign-in?redirect=%2Fstudy',
			fenceHeader: null
		},
		BASE_URL
	);
}

function validRecord() {
	return buildRecoveryRecord({
		versionBefore: VERSION,
		versionAfter: VERSION,
		probe: healthyProbe(),
		baseUrl: BASE_URL,
		runId: '33749984574',
		runAttempt: '1',
		sha: SHA,
		capturedAt: '2026-09-03T11:31:30.163Z'
	});
}

test('exact unauthenticated /study application redirect is healthy', () => {
	const result = healthyProbe();
	assert.equal(result.healthy, true);
	assert.equal(result.status, 303);
	assert.equal(result.location, `${BASE_URL}/sign-in?redirect=%2Fstudy`);
	assert.equal(result.fence_header, null);
});

test('active learner-runtime fence is never healthy', () => {
	const result = evaluateStudyResponse(
		{ status: 503, location: null, fenceHeader: 'active' },
		BASE_URL
	);
	assert.equal(result.healthy, false);
	assert.match(result.reasons.join(' '), /fence header is active/i);
});

test('header absence alone is insufficient: generic Cloudflare 5xx fails', () => {
	for (const status of [500, 502, 503, 504]) {
		const result = evaluateStudyResponse({ status, location: null, fenceHeader: null }, BASE_URL);
		assert.equal(result.healthy, false, `HTTP ${status} must fail closed`);
	}
});

test('unrelated redirects and arbitrary 200 responses fail closed', () => {
	assert.equal(
		evaluateStudyResponse({ status: 303, location: '/login', fenceHeader: null }, BASE_URL).healthy,
		false
	);
	assert.equal(
		evaluateStudyResponse({ status: 200, location: null, fenceHeader: null }, BASE_URL).healthy,
		false
	);
});

test('normal unfenced capture binds stable Worker version to edge proof', () => {
	const record = validRecord();
	assert.equal(record.verified_unfenced, true);
	assert.equal(record.worker_version_id, VERSION);
	assert.equal(record.verification.worker_version_before, VERSION);
	assert.equal(record.verification.worker_version_after, VERSION);
	assert.equal(record.verification.status, 303);
	assert.equal(record.verification.location, `${BASE_URL}/sign-in?redirect=%2Fstudy`);

	assert.equal(
		validateRecoveryRecord(record, {
			baseUrl: BASE_URL,
			runId: '33749984574',
			runAttempt: '1',
			sha: SHA
		}),
		VERSION
	);
});

test('capture refuses a Worker version change across the edge probe', () => {
	assert.throws(
		() =>
			buildRecoveryRecord({
				versionBefore: VERSION,
				versionAfter: '11111111-2222-3333-4444-555555555555',
				probe: healthyProbe(),
				baseUrl: BASE_URL,
				runId: '33749984574',
				runAttempt: '1',
				sha: SHA
			}),
		/changed during unfenced verification/i
	);
});

test('capture refuses an already-fenced public Worker', () => {
	const fencedProbe = evaluateStudyResponse(
		{ status: 503, location: null, fenceHeader: 'active' },
		BASE_URL
	);
	assert.throws(
		() =>
			buildRecoveryRecord({
				versionBefore: VERSION,
				versionAfter: VERSION,
				probe: fencedProbe,
				baseUrl: BASE_URL,
				runId: '33749984574',
				runAttempt: '1',
				sha: SHA
			}),
		/does not prove an unfenced Production application/i
	);
});

test('recovery rejects legacy bare IDs and unverified or fenced metadata', () => {
	assert.throws(
		() =>
			validateRecoveryRecord(VERSION, {
				baseUrl: BASE_URL,
				runId: '33749984574',
				runAttempt: '1',
				sha: SHA
			}),
		/JSON object/i
	);

	const unverified = structuredClone(validRecord());
	unverified.verified_unfenced = false;
	assert.throws(
		() =>
			validateRecoveryRecord(unverified, {
				baseUrl: BASE_URL,
				runId: '33749984574',
				runAttempt: '1',
				sha: SHA
			}),
		/not positively verified/i
	);

	const fenced = structuredClone(validRecord());
	fenced.verification.status = 503;
	fenced.verification.location = null;
	fenced.verification.fence_header = 'active';
	assert.throws(
		() =>
			validateRecoveryRecord(fenced, {
				baseUrl: BASE_URL,
				runId: '33749984574',
				runAttempt: '1',
				sha: SHA
			}),
		/does not prove an unfenced Production application/i
	);
});

test('recovery rejects provenance mismatches', () => {
	const record = validRecord();
	assert.throws(
		() =>
			validateRecoveryRecord(record, {
				baseUrl: BASE_URL,
				runId: '999',
				runAttempt: '1',
				sha: SHA
			}),
		/source run ID does not match/i
	);
	assert.throws(
		() =>
			validateRecoveryRecord(record, {
				baseUrl: BASE_URL,
				runId: '33749984574',
				runAttempt: '1',
				sha: '1111111111111111111111111111111111111111'
			}),
		/source SHA does not match/i
	);
});
