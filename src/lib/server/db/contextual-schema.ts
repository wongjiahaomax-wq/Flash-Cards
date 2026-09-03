/**
 * Current-schema alias for contextual System/Topic/Tag code.
 *
 * `schema.js` is the authoritative current Drizzle model. Legacy persisted
 * learner Review tables are intentionally not exposed through current schema
 * aliases after the FSRS learner runtime cutover.
 */
export { concepts as taxonomyConcepts } from './schema.js';
