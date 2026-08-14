import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.js';

/** @param {D1Database} d1Binding */
export function createDb(d1Binding) {
  if (!d1Binding) {
    throw new Error('A Cloudflare D1 binding is required.');
  }

  return drizzle(d1Binding, { schema });
}
