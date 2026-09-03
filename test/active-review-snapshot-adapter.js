import { buildActiveReviewSnapshot } from '../src/lib/server/db/active-review-content.js';
import {
  listEligibleCases,
  listStudyConcepts
} from '../src/lib/server/db/learning.js';

export { listEligibleCases, listStudyConcepts };

/**
 * @typedef {{
 *   prompt:string,
 *   answer:string,
 *   sourceType:string,
 *   sourceConceptId:string|null,
 *   sourceStimulusGroupId:string|null,
 *   sourceStimulusOptionId:string|null,
 *   sourceAssetQuestionId:string|null,
 *   sourceSharedQuestionId:string|null,
 *   displayOrder:number
 * }} TestSnapshotQuestion
 */
/**
 * @typedef {{
 *   assetId:string,
 *   storageKey:string,
 *   caption:string|null,
 *   altText:string|null,
 *   stimulusGroupId:string|null,
 *   stimulusOptionId:string|null,
 *   displayOrder:number
 * }} TestSnapshotAsset
 */
/**
 * @typedef {{
 *   id:string,
 *   userId:string,
 *   caseId:string,
 *   primaryConceptId:string,
 *   studyConceptId:string,
 *   caseTitleSnapshot:string,
 *   vignetteSnapshotMd:string|null,
 *   questionPoolMode:'core'|'expanded',
 *   questions:TestSnapshotQuestion[],
 *   assets:TestSnapshotAsset[]
 * }} TestActiveReviewSnapshot
 */

/**
 * Test-only adapter for content tests that historically materialized a persisted
 * legacy Review solely to inspect its frozen learner snapshot. Production code
 * must not import this module. It writes no learner persistence of any kind.
 * @type {WeakMap<object, Map<string, TestActiveReviewSnapshot>>}
 */
const snapshotsByDb = new WeakMap();
let sequence = 0;

/** @param {object} db @returns {Map<string, TestActiveReviewSnapshot>} */
function snapshotStore(db) {
  let store = snapshotsByDb.get(db);
  if (!store) {
    store = new Map();
    snapshotsByDb.set(db, store);
  }
  return store;
}

/**
 * Materialize one immutable active-Review content snapshot without creating an
 * active Review row or touching FSRS/Free learner state.
 *
 * @param {{db:any,userId:string,conceptId:string,questionPoolMode:'core'|'expanded',rng?:()=>number}} input
 * @returns {Promise<string|null>}
 */
export async function startReview(input) {
  const rng = input.rng ?? Math.random;
  const candidates = await listEligibleCases(input.db, input.conceptId);
  if (!candidates.length) return null;
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(rng() * candidates.length)));
  const candidate = candidates[index];
  const snapshot = await buildActiveReviewSnapshot({
    db: input.db,
    caseId: candidate.id,
    studyConceptId: candidate.studyConceptId,
    contentMode: input.questionPoolMode === 'core' ? 'original' : 'expanded',
    rng
  });
  const id = `test-active-snapshot-${++sequence}`;
  snapshotStore(input.db).set(id, {
    id,
    userId: input.userId,
    caseId: candidate.id,
    primaryConceptId: candidate.primaryConceptId,
    studyConceptId: candidate.studyConceptId,
    caseTitleSnapshot: snapshot.case.title,
    vignetteSnapshotMd: snapshot.case.vignetteMd,
    questionPoolMode: input.questionPoolMode,
    questions: snapshot.questions.map((question) => ({
      prompt: question.promptSnapshotMd,
      answer: question.answerSnapshotMd,
      sourceType: question.sourceType,
      sourceConceptId: question.sourceConceptId,
      sourceStimulusGroupId: question.sourceStimulusGroupId,
      sourceStimulusOptionId: question.sourceStimulusOptionId,
      sourceAssetQuestionId: question.sourceAssetQuestionId,
      sourceSharedQuestionId: question.sourceSharedQuestionId,
      displayOrder: question.displayOrder
    })),
    assets: snapshot.assets.map((asset) => ({
      assetId: asset.assetId,
      storageKey: asset.storageKeySnapshot,
      caption: asset.captionSnapshotMd,
      altText: asset.altTextSnapshot,
      stimulusGroupId: asset.sourceStimulusGroupId,
      stimulusOptionId: asset.sourceStimulusOptionId,
      displayOrder: asset.displayOrder
    }))
  });
  return id;
}

/**
 * @param {object} db
 * @param {string} reviewId
 * @param {string} userId
 * @returns {Promise<TestActiveReviewSnapshot|null>}
 */
export async function getReview(db, reviewId, userId) {
  const snapshot = snapshotStore(db).get(reviewId) ?? null;
  return snapshot?.userId === userId ? snapshot : null;
}
