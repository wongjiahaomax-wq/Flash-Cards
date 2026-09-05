import fs from 'node:fs';
import process from 'node:process';

const WORKER_VERSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{40}$/i;
const RECORD_SCHEMA_VERSION = 1;
const RECORD_KIND = 'production-cutover-pre-fence';
const STUDY_PATH = '/study';
const SIGN_IN_PATH = '/sign-in?redirect=%2Fstudy';

/**
 * @typedef {object} StudyProbe
 * @property {boolean} healthy
 * @property {number | null} status
 * @property {string | null} location
 * @property {string | null} fence_header
 * @property {string} expected_location
 * @property {string[]} reasons
 */

/**
 * @typedef {object} RecoveryRecord
 * @property {number} schema_version
 * @property {string} kind
 * @property {string} worker_version_id
 * @property {boolean} verified_unfenced
 * @property {{ run_id: string, run_attempt: string, sha: string }} source
 * @property {string} captured_at
 * @property {{ base_url: string, study_path: string, status: number | null, location: string | null, fence_header: string | null, worker_version_before: string, worker_version_after: string }} verification
 */

/** @param {string} baseUrl */
function normalizeBaseUrl(baseUrl) {
	const url = new URL(baseUrl);
	url.pathname = '/';
	url.search = '';
	url.hash = '';
	return url.href.replace(/\/$/, '');
}

/** @param {string} baseUrl */
export function expectedStudyLocation(baseUrl) {
	return new URL(SIGN_IN_PATH, `${normalizeBaseUrl(baseUrl)}/`).href;
}

/**
 * @param {{ status: unknown, location: unknown, fenceHeader: unknown }} response
 * @param {string} baseUrl
 * @returns {StudyProbe}
 */
export function evaluateStudyResponse({ status, location, fenceHeader }, baseUrl) {
	const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
	const expectedLocation = expectedStudyLocation(normalizedBaseUrl);
	const normalizedFenceHeader = typeof fenceHeader === 'string' ? fenceHeader.trim() : '';
	const fenceActive = normalizedFenceHeader.toLowerCase() === 'active';
	const normalizedStatus = typeof status === 'number' ? status : null;

	let resolvedLocation = null;
	if (typeof location === 'string' && location.trim() !== '') {
		try {
			resolvedLocation = new URL(location, `${normalizedBaseUrl}/`).href;
		} catch {
			resolvedLocation = null;
		}
	}

	const healthy = normalizedStatus === 303 && resolvedLocation === expectedLocation && !fenceActive;
	/** @type {string[]} */
	const reasons = [];
	if (fenceActive) reasons.push('temporary learner-runtime fence header is active');
	if (normalizedStatus !== 303) reasons.push(`expected HTTP 303, received ${String(status)}`);
	if (resolvedLocation !== expectedLocation) {
		reasons.push(`expected redirect ${expectedLocation}, received ${resolvedLocation ?? '<missing-or-invalid>'}`);
	}

	return {
		healthy,
		status: normalizedStatus,
		location: resolvedLocation,
		fence_header: normalizedFenceHeader || null,
		expected_location: expectedLocation,
		reasons
	};
}

/**
 * @param {string} baseUrl
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<StudyProbe>}
 */
export async function probeStudy(baseUrl, fetchImpl = fetch) {
	const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
	const response = await fetchImpl(new URL(STUDY_PATH, `${normalizedBaseUrl}/`), {
		method: 'GET',
		redirect: 'manual',
		headers: {
			'cache-control': 'no-cache',
			pragma: 'no-cache'
		}
	});

	return evaluateStudyResponse(
		{
			status: response.status,
			location: response.headers.get('location'),
			fenceHeader: response.headers.get('x-learner-runtime-fence')
		},
		normalizedBaseUrl
	);
}

/** @param {unknown} value @param {string} label */
function requireWorkerVersion(value, label) {
	if (typeof value !== 'string' || !WORKER_VERSION_RE.test(value)) {
		throw new Error(`${label} is not a valid Worker version ID.`);
	}
	return value.toLowerCase();
}

/** @param {unknown} value */
function requireSha(value) {
	if (typeof value !== 'string' || !SHA_RE.test(value)) {
		throw new Error('source SHA must be a 40-character git SHA.');
	}
	return value.toLowerCase();
}

/** @param {unknown} value @param {string} label */
function requirePositiveIntegerString(value, label) {
	if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
		throw new Error(`${label} must be a positive integer string.`);
	}
	return value;
}

/** @param {unknown} probe @param {string} baseUrl @returns {StudyProbe} */
function assertStoredProbe(probe, baseUrl) {
	if (!probe || typeof probe !== 'object' || Array.isArray(probe)) throw new Error('study probe is missing.');
	const value = /** @type {Partial<StudyProbe>} */ (probe);
	const evaluated = evaluateStudyResponse(
		{
			status: value.status,
			location: value.location,
			fenceHeader: value.fence_header
		},
		baseUrl
	);
	if (!evaluated.healthy || value.healthy !== true) {
		throw new Error(`study probe does not prove an unfenced Production application: ${evaluated.reasons.join('; ')}`);
	}
	return evaluated;
}

/**
 * @param {{ versionBefore: string, versionAfter: string, probe: unknown, baseUrl: string, runId: string | number, runAttempt: string | number, sha: string, capturedAt?: string }} input
 * @returns {RecoveryRecord}
 */
export function buildRecoveryRecord({
	versionBefore,
	versionAfter,
	probe,
	baseUrl,
	runId,
	runAttempt,
	sha,
	capturedAt = new Date().toISOString()
}) {
	const before = requireWorkerVersion(versionBefore, 'version before probe');
	const after = requireWorkerVersion(versionAfter, 'version after probe');
	if (before !== after) {
		throw new Error(`Production Worker changed during unfenced verification (${before} -> ${after}); refusing recovery capture.`);
	}
	const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
	const evaluated = assertStoredProbe(probe, normalizedBaseUrl);
	const sourceRunId = requirePositiveIntegerString(String(runId), 'source run ID');
	const sourceRunAttempt = requirePositiveIntegerString(String(runAttempt), 'source run attempt');
	const sourceSha = requireSha(sha);
	if (Number.isNaN(Date.parse(capturedAt))) throw new Error('captured_at must be an ISO-compatible timestamp.');

	return {
		schema_version: RECORD_SCHEMA_VERSION,
		kind: RECORD_KIND,
		worker_version_id: before,
		verified_unfenced: true,
		source: {
			run_id: sourceRunId,
			run_attempt: sourceRunAttempt,
			sha: sourceSha
		},
		captured_at: capturedAt,
		verification: {
			base_url: normalizedBaseUrl,
			study_path: STUDY_PATH,
			status: evaluated.status,
			location: evaluated.location,
			fence_header: evaluated.fence_header,
			worker_version_before: before,
			worker_version_after: after
		}
	};
}

/**
 * @param {unknown} record
 * @param {{ baseUrl: string, runId: string | number, runAttempt: string | number, sha: string }} expected
 */
export function validateRecoveryRecord(record, { baseUrl, runId, runAttempt, sha }) {
	if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('recovery record must be a JSON object.');
	const value = /** @type {Partial<RecoveryRecord>} */ (record);
	if (value.schema_version !== RECORD_SCHEMA_VERSION) throw new Error('unsupported recovery record schema version.');
	if (value.kind !== RECORD_KIND) throw new Error('unexpected recovery record kind.');
	if (value.verified_unfenced !== true) throw new Error('recovery record is not positively verified as unfenced.');

	const version = requireWorkerVersion(value.worker_version_id, 'recovery Worker version');
	const expectedRunId = requirePositiveIntegerString(String(runId), 'expected source run ID');
	const expectedRunAttempt = requirePositiveIntegerString(String(runAttempt), 'expected source run attempt');
	const expectedSha = requireSha(sha);
	if (value.source?.run_id !== expectedRunId) throw new Error('recovery record source run ID does not match triggering deployment.');
	if (value.source?.run_attempt !== expectedRunAttempt) throw new Error('recovery record source run attempt does not match triggering deployment.');
	if (String(value.source?.sha ?? '').toLowerCase() !== expectedSha) throw new Error('recovery record source SHA does not match triggering deployment.');

	const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
	if (value.verification?.base_url !== normalizedBaseUrl) throw new Error('recovery record Production origin does not match expected origin.');
	if (value.verification?.study_path !== STUDY_PATH) throw new Error('recovery record does not verify /study.');
	if (String(value.verification?.worker_version_before ?? '').toLowerCase() !== version) {
		throw new Error('recovery record pre-probe Worker version does not match target.');
	}
	if (String(value.verification?.worker_version_after ?? '').toLowerCase() !== version) {
		throw new Error('recovery record post-probe Worker version does not match target.');
	}
	assertStoredProbe(
		{
			healthy: true,
			status: value.verification?.status,
			location: value.verification?.location,
			fence_header: value.verification?.fence_header
		},
		normalizedBaseUrl
	);
	if (typeof value.captured_at !== 'string' || Number.isNaN(Date.parse(value.captured_at))) {
		throw new Error('recovery record captured_at is invalid.');
	}
	return version;
}

/** @param {string[]} argv */
function parseArgs(argv) {
	const [command, ...rest] = argv;
	/** @type {Record<string, string>} */
	const options = {};
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
		const key = token.slice(2);
		const value = rest[index + 1];
		if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
		options[key] = value;
		index += 1;
	}
	return { command, options };
}

/** @param {Record<string, string>} options @param {string} key */
function requiredOption(options, key) {
	const value = options[key];
	if (typeof value !== 'string' || value === '') throw new Error(`Missing --${key}.`);
	return value;
}

async function main() {
	const { command, options } = parseArgs(process.argv.slice(2));
	if (command === 'probe') {
		const result = await probeStudy(requiredOption(options, 'base-url'));
		process.stdout.write(`${JSON.stringify(result)}\n`);
		if (!result.healthy) {
			console.error(`Production /study is not a verified unfenced application response: ${result.reasons.join('; ')}`);
			process.exitCode = 2;
		}
		return;
	}

	if (command === 'write-record') {
		const probe = JSON.parse(fs.readFileSync(requiredOption(options, 'probe-file'), 'utf8'));
		const record = buildRecoveryRecord({
			versionBefore: requiredOption(options, 'version-before'),
			versionAfter: requiredOption(options, 'version-after'),
			probe,
			baseUrl: requiredOption(options, 'base-url'),
			runId: requiredOption(options, 'run-id'),
			runAttempt: requiredOption(options, 'run-attempt'),
			sha: requiredOption(options, 'sha')
		});
		fs.writeFileSync(requiredOption(options, 'output'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
		process.stdout.write(`${record.worker_version_id}\n`);
		return;
	}

	if (command === 'verify-record') {
		const record = JSON.parse(fs.readFileSync(requiredOption(options, 'file'), 'utf8'));
		const version = validateRecoveryRecord(record, {
			baseUrl: requiredOption(options, 'base-url'),
			runId: requiredOption(options, 'run-id'),
			runAttempt: requiredOption(options, 'run-attempt'),
			sha: requiredOption(options, 'sha')
		});
		process.stdout.write(`${version}\n`);
		return;
	}

	throw new Error('Usage: production-fence-recovery.mjs <probe|write-record|verify-record> ...');
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(`production-fence-recovery: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	});
}
