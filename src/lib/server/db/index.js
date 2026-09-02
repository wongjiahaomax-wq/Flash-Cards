import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.js';

/** @typedef {import('drizzle-orm/d1').DrizzleD1Database<typeof schema> & { $client: D1Database }} LearningDb */

/** @param {D1Database} d1Binding @returns {LearningDb} */
export function createDb(d1Binding) {
  if (!d1Binding) {
    throw new Error('A Cloudflare D1 binding is required.');
  }

  return /** @type {LearningDb} */ (drizzle(d1Binding, { schema }));
}
