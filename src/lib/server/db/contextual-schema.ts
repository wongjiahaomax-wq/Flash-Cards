/**
 * Current-schema aliases for contextual System/Topic/Tag code.
 *
 * `schema.js` is the authoritative Drizzle model. These aliases keep the
 * contextual modules explicit about taxonomy/review semantics without defining
 * competing physical-table shapes.
 */
export {
  concepts as taxonomyConcepts,
  reviews as reviewsWithRouteProvenance
} from './schema.js';
