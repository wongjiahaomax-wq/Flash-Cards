/**
 * Compatibility aliases for contextual System/Topic/Tag code.
 *
 * `schema.js` is the authoritative post-0015 Drizzle model. These aliases keep
 * the contextual modules explicit about the richer taxonomy/review semantics
 * without defining competing physical-table shapes.
 */
export {
  concepts as taxonomyConcepts,
  reviews as reviewsWithRouteProvenance
} from './schema.js';
