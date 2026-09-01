import { Rating, createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';

export const FSRS_LIBRARY_VERSION = '5.4.2';
export const FSRS_SCHEDULER_REVISION = 1;

const ratingToLibrary = Object.freeze({
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy
});

/**
 * V1 keeps fuzz disabled so a transition computed from the same persisted state,
 * rating, parameters and timestamp is deterministic before the durable event
 * receipt exists. A later scheduler revision may introduce seeded fuzz.
 *
 * @param {Partial<import('ts-fsrs').FSRSParameters>} [overrides]
 */
export function createDefaultFsrsParameters(overrides = {}) {
  return generatorParameters({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
    ...overrides
  });
}

/** @param {ReturnType<typeof createDefaultFsrsParameters>} parameters */
export function serializeFsrsParameters(parameters) {
  return JSON.stringify(parameters);
}

/** @param {string} value */
export function deserializeFsrsParameters(value) {
  const parsed = JSON.parse(value);
  return generatorParameters(parsed);
}

/**
 * @typedef {object} PersistedFsrsCard
 * @property {number} dueAt
 * @property {number} stability
 * @property {number} difficulty
 * @property {number} state
 * @property {number} elapsedDays
 * @property {number} scheduledDays
 * @property {number} learningSteps
 * @property {number} reps
 * @property {number} lapses
 * @property {number|null} lastReviewAt
 */

/** @param {import('ts-fsrs').Card} card @returns {PersistedFsrsCard} */
export function serializeFsrsCard(card) {
  return {
    dueAt: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewAt: card.last_review?.getTime() ?? null
  };
}

/** @param {PersistedFsrsCard} card @returns {import('ts-fsrs').Card} */
export function deserializeFsrsCard(card) {
  return {
    due: new Date(card.dueAt),
    stability: card.stability,
    difficulty: card.difficulty,
    state: /** @type {import('ts-fsrs').State} */ (card.state),
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.lastReviewAt == null ? undefined : new Date(card.lastReviewAt)
  };
}

/** @param {Date|number|string} [now] @returns {PersistedFsrsCard} */
export function createInitialFsrsCard(now = new Date()) {
  return serializeFsrsCard(createEmptyCard(new Date(now)));
}

/** @param {import('ts-fsrs').ReviewLog} log */
function serializeReviewLog(log) {
  return {
    rating: log.rating,
    state: log.state,
    dueAt: log.due.getTime(),
    stability: log.stability,
    difficulty: log.difficulty,
    scheduledDays: log.scheduled_days,
    learningSteps: log.learning_steps,
    reviewedAt: log.review.getTime()
  };
}

/**
 * Pure scheduler transition. This module deliberately has no DB, auth, session,
 * route-selection or browser-state dependency.
 *
 * @param {{
 *   card: PersistedFsrsCard,
 *   rating: 'again'|'hard'|'good'|'easy',
 *   now: Date|number|string,
 *   parameters: ReturnType<typeof createDefaultFsrsParameters>
 * }} input
 */
export function scheduleFsrsReview(input) {
  const grade = ratingToLibrary[input.rating];
  if (grade == null) {
    throw new TypeError(`Unsupported FSRS rating: ${String(input.rating)}`);
  }

  const now = new Date(input.now);
  if (!Number.isFinite(now.getTime())) {
    throw new TypeError('FSRS transition requires a valid review timestamp.');
  }

  const scheduler = fsrs(input.parameters);
  const result = scheduler.next(deserializeFsrsCard(input.card), now, grade);
  const nextCard = serializeFsrsCard(result.card);

  return {
    card: nextCard,
    nextDueAt: nextCard.dueAt,
    log: serializeReviewLog(result.log),
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION
  };
}

/**
 * @param {PersistedFsrsCard} card
 * @param {Date|number|string} now
 * @param {ReturnType<typeof createDefaultFsrsParameters>} parameters
 */
export function getFsrsRetrievability(card, now, parameters) {
  const scheduler = fsrs(parameters);
  return scheduler.get_retrievability(deserializeFsrsCard(card), new Date(now), false);
}