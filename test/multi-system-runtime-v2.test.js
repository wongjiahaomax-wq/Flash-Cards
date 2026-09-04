import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MultiSystemStudyScopeError,
  assertRawMultiSystemStudyScopeInput,
  normalizeMultiSystemStudyRunScope,
  resolveMultiSystemStudySelectionCandidates
} from '../src/lib/server/learning/multi-system-study-scope.ts';
import {
  STUDY_RUN_PROOF_VERSION,
  fingerprintStudyScope,
  issueScheduledRunBoundaryToken,
  verifyScheduledRunBoundaryToken
} from '../src/lib/server/learning/study-run-proof.js';
import {
  LEARNER_STUDY_RUN_STORAGE_KEY,
  LEGACY_LEARNER_STUDY_RUN_STORAGE_KEY,
  readLearnerStudyRun
} from '../src/lib/learner-study-run-storage.js';
import { learnerStudyWriteFenceActive } from '../src/lib/server/learning/learner-study-runtime.js';
import {
  MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS,
  assertMultiSystemV2ZeroData
} from '../scripts/multi-system-v2-cutover-gate.mjs';

function fixture() {
  return {
    concepts: [
      { id: 'cardio', name: 'Cardio', kind: 'system', parentId: null, isActive: true },
      { id: 'cardio-topic', name: 'Cardio Topic', kind: 'topic', parentId: 'cardio', isActive: true },
      { id: 'metabolic', name: 'Metabolic', kind: 'system', parentId: null, isActive: true },
      { id: 'metabolic-topic', name: 'Metabolic Topic', kind: 'topic', parentId: 'metabolic', isActive: true },
      { id: 'other', name: 'Other', kind: 'system', parentId: null, isActive: true },
      { id: 'other-topic', name: 'Other Topic', kind: 'topic', parentId: 'other', isActive: true }
    ],
    caseTopicRows: [
      { id: 'cardio-native', title: 'Cardio native', conceptId: 'cardio-topic', role: 'primary', isActive: true },
      { id: 'cross', title: 'Cross tagged', conceptId: 'metabolic-topic', role: 'primary', isActive: true },
      { id: 'tag-only-attribution', title: 'Tag only', conceptId: 'other-topic', role: 'primary', isActive: true },
      { id: 'missing-active-primary', title: 'Missing active primary', conceptId: 'inactive-topic', role: 'primary', isActive: true }
    ],
    caseTagRows: [
      { caseId: 'cross', tagId: 'cross-tag', tagName: 'Cross Tag' },
      { caseId: 'tag-only-attribution', tagId: 'cross-tag', tagName: 'Cross Tag' },
      { caseId: 'tag-only-attribution', tagId: 'metabolic-tag', tagName: 'Metabolic Tag' },
      { caseId: 'missing-active-primary', tagId: 'cross-tag', tagName: 'Cross Tag' }
    ],
    systemTagRows: [
      { systemConceptId: 'cardio', tagId: 'cross-tag', tagName: 'Cross Tag', displayOrder: 0 },
      { systemConceptId: 'metabolic', tagId: 'metabolic-tag', tagName: 'Metabolic Tag', displayOrder: 0 }
    ]
  };
}

test('raw v2 scope rejects duplicate Systems and contradictory noncanonical all shapes before taxonomy resolution', () => {
  assert.throws(
    () => assertRawMultiSystemStudyScopeInput([
      { systemId: 'cardio', mode: 'all' },
      { systemId: 'cardio', mode: 'all' }
    ]),
    (error) => error instanceof MultiSystemStudyScopeError && error.code === 'duplicate-system'
  );
  assert.throws(
    () => assertRawMultiSystemStudyScopeInput([
      { systemId: 'cardio', mode: 'all', routes: [{ routeType: 'topic', routeId: 'cardio-topic' }] }
    ]),
    (error) => error instanceof MultiSystemStudyScopeError && error.code === 'invalid-scope'
  );
});

test('v2 normalization is deterministic across System order and route duplicates', () => {
  const input = fixture();
  const normalized = normalizeMultiSystemStudyRunScope({
    ...input,
    systems: [
      { systemId: 'metabolic', mode: 'all' },
      {
        systemId: 'cardio',
        mode: 'routes',
        routes: [
          { routeType: 'tag', routeId: 'cross-tag' },
          { routeType: 'topic', routeId: 'cardio-topic' },
          { routeType: 'tag', routeId: 'cross-tag' }
        ]
      }
    ]
  });
  assert.deepEqual(normalized, {
    systems: [
      {
        systemId: 'cardio', mode: 'routes', routes: [
          { routeType: 'topic', routeId: 'cardio-topic' },
          { routeType: 'tag', routeId: 'cross-tag' }
        ]
      },
      { systemId: 'metabolic', mode: 'all' }
    ]
  });
});

test('candidate union deduplicates globally and prefers selected native-primary System attribution', () => {
  const input = fixture();
  const runScope = normalizeMultiSystemStudyRunScope({
    ...input,
    systems: [
      { systemId: 'cardio', mode: 'routes', routes: [{ routeType: 'tag', routeId: 'cross-tag' }] },
      { systemId: 'metabolic', mode: 'all' }
    ]
  });
  const candidates = resolveMultiSystemStudySelectionCandidates({ ...input, runScope });
  const cross = candidates.find((candidate) => candidate.id === 'cross');
  assert.ok(cross);
  assert.equal(cross.attributionSystemId, 'metabolic');
  assert.deepEqual(cross.contributingSystemIds, ['cardio', 'metabolic']);
  assert.equal(candidates.filter((candidate) => candidate.id === 'cross').length, 1);
});

test('when no selected native System contributes, attribution falls back to stable contributing System ID order', () => {
  const input = fixture();
  const runScope = normalizeMultiSystemStudyRunScope({
    ...input,
    systems: [
      { systemId: 'metabolic', mode: 'routes', routes: [{ routeType: 'tag', routeId: 'metabolic-tag' }] },
      { systemId: 'cardio', mode: 'routes', routes: [{ routeType: 'tag', routeId: 'cross-tag' }] }
    ]
  });
  const candidate = resolveMultiSystemStudySelectionCandidates({ ...input, runScope })
    .find((item) => item.id === 'tag-only-attribution');
  assert.ok(candidate);
  assert.equal(candidate.attributionSystemId, 'cardio');
  assert.deepEqual(candidate.contributingSystemIds, ['cardio', 'metabolic']);
});

test('active-primary-Topic baseline remains required for curated Tag eligibility', () => {
  const input = fixture();
  const runScope = normalizeMultiSystemStudyRunScope({
    ...input,
    systems: [{ systemId: 'cardio', mode: 'routes', routes: [{ routeType: 'tag', routeId: 'cross-tag' }] }]
  });
  const ids = resolveMultiSystemStudySelectionCandidates({ ...input, runScope }).map((candidate) => candidate.id);
  assert.equal(ids.includes('missing-active-primary'), false);
});

test('Scheduled proof v2 binds the complete normalized runScope fingerprint', async () => {
  const first = { systems: [{ systemId: 'cardio', mode: 'all' }] };
  const second = { systems: [{ systemId: 'metabolic', mode: 'all' }] };
  const firstFingerprint = await fingerprintStudyScope(first);
  const secondFingerprint = await fingerprintStudyScope(second);
  assert.notEqual(firstFingerprint, secondFingerprint);
  assert.equal(STUDY_RUN_PROOF_VERSION, 2);

  const secret = 'multi-system-v2-proof-test-secret-0123456789abcdefghijklmnopqrstuvwxyz';
  const token = await issueScheduledRunBoundaryToken({
    secret,
    boundary: {
      userId: 'learner', runId: 'run', runStartedAt: 1, scopeFingerprint: firstFingerprint,
      generation: 1, reviewSequenceEpoch: 1, parameterRevision: 1, schedulerRevision: 1,
      schedulerLibraryVersion: 'test'
    }
  });
  const verified = await verifyScheduledRunBoundaryToken(token, { secret, userId: 'learner' });
  assert.equal(verified.scopeFingerprint, firstFingerprint);
});

test('learner browser v1 state is retired instead of reinterpreted', () => {
  /** @type {Map<string, string>} */
  const values = new Map([
    [LEGACY_LEARNER_STUDY_RUN_STORAGE_KEY, JSON.stringify({ version: 1 })]
  ]);
  /** @type {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void,removeItem:(key:string)=>void}} */
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }
  };
  assert.equal(readLearnerStudyRun(storage), null);
  assert.equal(values.has(LEGACY_LEARNER_STUDY_RUN_STORAGE_KEY), false);
  assert.equal(values.has(LEARNER_STUDY_RUN_STORAGE_KEY), false);
});

test('learner runtime fence is explicit and fail-closed at the shared access owner', () => {
  assert.equal(learnerStudyWriteFenceActive({ LEARNER_RUNTIME_WRITE_FENCE: 'true' }), true);
  assert.equal(learnerStudyWriteFenceActive({ LEARNER_RUNTIME_WRITE_FENCE: '1' }), true);
  assert.equal(learnerStudyWriteFenceActive({ LEARNER_RUNTIME_WRITE_FENCE: 'off' }), false);
});

test('zero-data gate has no pristine-profile exception', () => {
  const zero = Object.fromEntries(MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.map((table) => [table, 0]));
  assert.doesNotThrow(() => assertMultiSystemV2ZeroData(zero));
  assert.throws(
    () => assertMultiSystemV2ZeroData({ ...zero, learner_fsrs_profiles: 1 }),
    /learner_fsrs_profiles=1.*no pristine-profile exception/i
  );
});
