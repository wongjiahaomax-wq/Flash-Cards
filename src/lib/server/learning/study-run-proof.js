const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const STUDY_RUN_PROOF_VERSION = 2;
export const CAPTURED_MEMBERSHIP_CHUNK_SIZE = 64;

export class StudyRunProofError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StudyRunProofError';
    this.code = code;
  }
}

function requireSecret(value) {
  if (typeof value !== 'string' || value.length < 32) {
    throw new StudyRunProofError('invalid-secret', 'Study run proof signing requires a server secret of at least 32 characters.');
  }
  return value;
}

function base64UrlEncode(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlDecode(value) {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new StudyRunProofError('invalid-token', 'Study run proof contains invalid base64url data.');
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new StudyRunProofError('invalid-token', 'Study run proof contains invalid base64url data.');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret) {
  const keyMaterial = await globalThis.crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(`flash-cards:study-run-proof:v${STUDY_RUN_PROOF_VERSION}\u0000${requireSecret(secret)}`)
  );
  return globalThis.crypto.subtle.importKey('raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sha256Base64Url(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

async function signPayload(payload, secret) {
  const payloadBytes = textEncoder.encode(JSON.stringify(payload));
  const signature = await globalThis.crypto.subtle.sign('HMAC', await hmacKey(secret), payloadBytes);
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyPayload(token, secret) {
  if (typeof token !== 'string') throw new StudyRunProofError('invalid-token', 'Study run proof must be a string.');
  const parts = token.split('.');
  if (parts.length !== 2) throw new StudyRunProofError('invalid-token', 'Study run proof has an invalid token shape.');
  const payloadBytes = base64UrlDecode(parts[0]);
  const signature = base64UrlDecode(parts[1]);
  const valid = await globalThis.crypto.subtle.verify('HMAC', await hmacKey(secret), signature, payloadBytes);
  if (!valid) throw new StudyRunProofError('invalid-signature', 'Study run proof signature is invalid.');
  try {
    const payload = JSON.parse(textDecoder.decode(payloadBytes));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('not an object');
    return payload;
  } catch {
    throw new StudyRunProofError('invalid-token', 'Study run proof payload is invalid.');
  }
}

/** Fingerprint the complete already-normalized canonical v2 runScope. */
export async function fingerprintStudyScope(scope) {
  if (!scope || !Array.isArray(scope.systems) || scope.systems.length === 0) {
    throw new StudyRunProofError('invalid-token', 'Study run scope is invalid.');
  }
  return sha256Base64Url(JSON.stringify({
    v: STUDY_RUN_PROOF_VERSION,
    systems: scope.systems.map((system) => system.mode === 'all'
      ? [system.systemId, 'all']
      : [system.systemId, 'routes', system.routes.map((route) => [route.routeType, route.routeId])])
  }));
}

export async function issueScheduledRunBoundaryToken(input) {
  const boundary = input.boundary;
  return signPayload({
    v: STUDY_RUN_PROOF_VERSION,
    t: 'run',
    u: boundary.userId,
    r: boundary.runId,
    n: boundary.runStartedAt,
    s: boundary.scopeFingerprint,
    g: boundary.generation,
    e: boundary.reviewSequenceEpoch,
    p: boundary.parameterRevision,
    sr: boundary.schedulerRevision,
    lv: boundary.schedulerLibraryVersion
  }, input.secret);
}

export async function verifyScheduledRunBoundaryToken(token, input) {
  const payload = await verifyPayload(token, input.secret);
  if (payload.v !== STUDY_RUN_PROOF_VERSION || payload.t !== 'run') {
    throw new StudyRunProofError('unsupported-version', 'Study run proof version or token type is unsupported.');
  }
  if (payload.u !== input.userId) throw new StudyRunProofError('wrong-owner', 'Study run proof belongs to another learner.');
  if (
    typeof payload.r !== 'string' || !payload.r || !Number.isFinite(payload.n)
    || typeof payload.s !== 'string' || !payload.s
    || !Number.isInteger(payload.g) || !Number.isInteger(payload.e) || !Number.isInteger(payload.p)
    || !Number.isInteger(payload.sr) || typeof payload.lv !== 'string' || !payload.lv
  ) {
    throw new StudyRunProofError('invalid-token', 'Study run proof boundary fields are invalid.');
  }
  return {
    userId: payload.u,
    runId: payload.r,
    runStartedAt: payload.n,
    scopeFingerprint: payload.s,
    generation: payload.g,
    reviewSequenceEpoch: payload.e,
    parameterRevision: payload.p,
    schedulerRevision: payload.sr,
    schedulerLibraryVersion: payload.lv
  };
}

export async function issueCapturedMembershipProofs(input) {
  const chunkSize = input.chunkSize ?? CAPTURED_MEMBERSHIP_CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new TypeError('Captured membership chunk size must be a positive integer.');
  const runBoundaryDigest = await sha256Base64Url(input.runToken);
  const tokens = [];
  for (let offset = 0; offset < input.entries.length; offset += chunkSize) {
    const chunk = input.entries.slice(offset, offset + chunkSize);
    const encodedEntries = input.queueClass === 'due'
      ? chunk.map((entry) => [entry.caseId, entry.stateRevision, entry.dueAt])
      : chunk.map((entry) => [entry.caseId]);
    tokens.push(await signPayload({
      v: STUDY_RUN_PROOF_VERSION,
      t: 'members',
      u: input.boundary.userId,
      r: input.boundary.runId,
      b: runBoundaryDigest,
      s: input.boundary.scopeFingerprint,
      q: input.queueClass,
      e: encodedEntries
    }, input.secret));
  }
  return tokens;
}

export async function verifyCapturedMembership(input) {
  const boundary = await verifyScheduledRunBoundaryToken(input.runToken, { secret: input.secret, userId: input.userId });
  const payload = await verifyPayload(input.membershipToken, input.secret);
  if (payload.v !== STUDY_RUN_PROOF_VERSION || payload.t !== 'members') {
    throw new StudyRunProofError('unsupported-version', 'Captured work proof version or token type is unsupported.');
  }
  if (payload.u !== input.userId) throw new StudyRunProofError('wrong-owner', 'Captured work proof belongs to another learner.');
  if (payload.r !== boundary.runId) throw new StudyRunProofError('wrong-run', 'Captured work proof belongs to another run.');
  if (payload.s !== boundary.scopeFingerprint) throw new StudyRunProofError('wrong-scope', 'Captured work proof belongs to another study scope.');
  if (payload.b !== await sha256Base64Url(input.runToken)) throw new StudyRunProofError('wrong-boundary', 'Captured work proof belongs to another run boundary.');
  if (payload.q !== input.queueClass) throw new StudyRunProofError('wrong-queue', 'Captured work proof belongs to another queue class.');
  if (!Array.isArray(payload.e)) throw new StudyRunProofError('invalid-token', 'Captured work proof entries are invalid.');
  const entry = payload.e.find((candidate) => Array.isArray(candidate) && candidate[0] === input.caseId);
  if (!entry) throw new StudyRunProofError('not-member', 'Case is not an authenticated member of this captured workload.');
  if (input.queueClass === 'due') {
    if (entry.length !== 3 || !Number.isInteger(entry[1]) || entry[1] < 1 || !Number.isFinite(entry[2])) {
      throw new StudyRunProofError('invalid-token', 'Captured Due membership metadata is invalid.');
    }
    return { queueClass: 'due', caseId: input.caseId, stateRevision: entry[1], dueAt: entry[2], boundary };
  }
  if (entry.length !== 1) throw new StudyRunProofError('invalid-token', 'Captured New membership metadata is invalid.');
  return { queueClass: 'new', caseId: input.caseId, boundary };
}

export async function issueScheduledRepeatOriginProof(input) {
  if (!input.caseId || !Number.isInteger(input.stateRevision) || input.stateRevision < 1 || !Number.isFinite(input.dueAt)) {
    throw new StudyRunProofError('invalid-token', 'Repeat origin metadata is invalid.');
  }
  return signPayload({
    v: STUDY_RUN_PROOF_VERSION,
    t: 'repeat',
    u: input.boundary.userId,
    r: input.boundary.runId,
    b: await sha256Base64Url(input.runToken),
    s: input.boundary.scopeFingerprint,
    c: input.caseId,
    x: input.stateRevision,
    d: input.dueAt
  }, input.secret);
}

export async function verifyScheduledRepeatOriginProof(input) {
  const boundary = await verifyScheduledRunBoundaryToken(input.runToken, { secret: input.secret, userId: input.userId });
  const payload = await verifyPayload(input.repeatToken, input.secret);
  if (payload.v !== STUDY_RUN_PROOF_VERSION || payload.t !== 'repeat') {
    throw new StudyRunProofError('unsupported-version', 'Repeat origin proof version or token type is unsupported.');
  }
  if (payload.u !== input.userId) throw new StudyRunProofError('wrong-owner', 'Repeat origin proof belongs to another learner.');
  if (payload.r !== boundary.runId) throw new StudyRunProofError('wrong-run', 'Repeat origin proof belongs to another run.');
  if (payload.s !== boundary.scopeFingerprint) throw new StudyRunProofError('wrong-scope', 'Repeat origin proof belongs to another study scope.');
  if (payload.b !== await sha256Base64Url(input.runToken)) throw new StudyRunProofError('wrong-boundary', 'Repeat origin proof belongs to another run boundary.');
  if (payload.c !== input.caseId) throw new StudyRunProofError('wrong-case', 'Repeat origin proof belongs to another Case.');
  if (!Number.isInteger(payload.x) || payload.x < 1 || !Number.isFinite(payload.d)) {
    throw new StudyRunProofError('invalid-token', 'Repeat origin proof metadata is invalid.');
  }
  return { queueClass: 'repeat', caseId: input.caseId, stateRevision: payload.x, dueAt: payload.d, boundary };
}
