import { loadCaseSource } from './learner-case-source.js';
import {
  QuestionPoolUnavailableError
} from '../learning/question-pool-mode.ts';
import { pickReviewQuestions } from '../learning/questions.js';

export const ACTIVE_REVIEW_SNAPSHOT_VERSION = 1;
export const MAX_ACTIVE_REVIEW_QUESTIONS = 256;
export const MAX_ACTIVE_REVIEW_ASSETS = 64;
export const MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES = 512 * 1024;

const encoder = new TextEncoder();

export class ActiveReviewContentError extends Error {
  /**
   * @param {'content-unavailable'|'snapshot-too-large'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ActiveReviewContentError';
    this.code = code;
  }
}

/** @param {Awaited<ReturnType<typeof loadCaseSource>> extends infer T ? Exclude<T, null> : never} source @param {'core'|'expanded'} questionPoolMode @param {() => number} rng */
function pickQuestions(source, questionPoolMode, rng) {
  try {
    const picked = pickReviewQuestions(source.questionPool, {
      rng,
      mode: /** @type {'automatic'|'all'|'fixed'} */ (source.case.questionSelectionMode),
      count: source.case.questionCount ?? 3,
      groupCoverage: source.groupCoverage
    });
    if (picked.length === 0) {
      throw new QuestionPoolUnavailableError(
        questionPoolMode === 'core'
          ? 'This case has no Original questions available.'
          : 'This case has no eligible questions available for Expanded Learning.'
      );
    }
    return picked;
  } catch (cause) {
    if (cause instanceof QuestionPoolUnavailableError) {
      throw new ActiveReviewContentError('content-unavailable', cause.message);
    }
    if (
      cause instanceof Error
      && (cause.message.startsWith('Stimulus Group ')
        || cause.message.includes('stimulus-specific question coverage'))
    ) {
      throw new ActiveReviewContentError(
        'content-unavailable',
        questionPoolMode === 'core'
          ? 'Original questions cannot satisfy this case’s stimulus-specific question requirement.'
          : 'Expanded Learning cannot satisfy this case’s stimulus-specific question requirement.'
      );
    }
    throw cause;
  }
}

/** @param {unknown} value */
export function activeReviewSnapshotBytes(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

/** @param {{case:any,questions:any[],assets:any[]}} snapshot */
export function assertActiveReviewSnapshotSupported(snapshot) {
  if (snapshot.questions.length > MAX_ACTIVE_REVIEW_QUESTIONS) {
    throw new ActiveReviewContentError(
      'snapshot-too-large',
      `This Review contains ${snapshot.questions.length} questions; the active Review limit is ${MAX_ACTIVE_REVIEW_QUESTIONS}.`
    );
  }
  if (snapshot.assets.length > MAX_ACTIVE_REVIEW_ASSETS) {
    throw new ActiveReviewContentError(
      'snapshot-too-large',
      `This Review contains ${snapshot.assets.length} learner assets; the active Review limit is ${MAX_ACTIVE_REVIEW_ASSETS}.`
    );
  }
  const bytes = activeReviewSnapshotBytes(snapshot);
  if (bytes > MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES) {
    throw new ActiveReviewContentError(
      'snapshot-too-large',
      `This Review freezes ${bytes.toLocaleString('en-US')} bytes of content; the active Review limit is ${MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES.toLocaleString('en-US')} bytes.`
    );
  }
  return bytes;
}

/**
 * Build the exact temporary learner snapshot before any learner progress for the
 * Review begins. The returned object is intentionally persistence-agnostic so
 * Part C can benchmark/validate the physical normalized representation.
 *
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   caseId:string,
 *   studyConceptId:string,
 *   contentMode:'original'|'expanded',
 *   rng?:()=>number
 * }} input
 */
export async function buildActiveReviewSnapshot(input) {
  const questionPoolMode = input.contentMode === 'original' ? 'core' : 'expanded';
  const rng = input.rng ?? Math.random;
  const source = await loadCaseSource(
    input.db,
    input.caseId,
    input.studyConceptId,
    questionPoolMode,
    rng
  );
  if (!source) {
    throw new ActiveReviewContentError(
      'content-unavailable',
      'The selected Case is no longer available for learner study.'
    );
  }

  const questions = pickQuestions(source, questionPoolMode, rng).map((question) => ({
    questionPromptId: question.questionPromptId,
    sourceType: question.sourceType,
    sourceConceptId: question.sourceConceptId,
    sourceStimulusGroupId: question.sourceStimulusGroupId,
    sourceStimulusOptionId: question.sourceStimulusOptionId,
    sourceAssetQuestionId: question.sourceAssetQuestionId ?? null,
    sourceSharedQuestionId: question.sourceSharedQuestionId,
    displayOrder: question.displayOrder,
    promptSnapshotMd: question.promptMd,
    answerSnapshotMd: question.answerMd
  }));
  const assets = source.assets.map((asset) => ({
    assetId: asset.assetId,
    displayOrder: asset.displayOrder,
    storageKeySnapshot: asset.storageKey,
    captionSnapshotMd: asset.captionMd,
    altTextSnapshot: asset.altText,
    sourceStimulusGroupId: asset.stimulusGroupId,
    sourceStimulusOptionId: asset.stimulusOptionId
  }));
  const snapshot = {
    version: ACTIVE_REVIEW_SNAPSHOT_VERSION,
    case: {
      id: source.case.id,
      title: source.case.title,
      vignetteMd: source.case.vignetteMd
    },
    questions,
    assets
  };
  const bytes = assertActiveReviewSnapshotSupported(snapshot);
  return { ...snapshot, bytes };
}
