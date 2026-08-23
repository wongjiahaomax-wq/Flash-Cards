import { and, desc, eq, inArray } from 'drizzle-orm';

import { previewSessions } from '../schema.js';

/** @typedef {import('../index.js').LearningDb} LearningDb */

export const PREVIEW_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function newId() {
  return crypto.randomUUID();
}

/** @param {LearningDb} db @param {string} userId */
export async function getLivePreviewSession(db, userId) {
  const rows = await db
    .select()
    .from(previewSessions)
    .where(and(eq(previewSessions.userId, userId), inArray(previewSessions.status, ['active', 'cleanup_required'])))
    .orderBy(desc(previewSessions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** @param {LearningDb} db @param {string} userId @param {number} [now] */
export async function createPreviewSession(db, userId, now = Date.now()) {
  const existing = await getLivePreviewSession(db, userId);
  if (existing) return existing;
  const id = newId();
  await db.insert(previewSessions).values({
    id,
    userId,
    status: 'active',
    expiresAt: new Date(now + PREVIEW_SESSION_TTL_MS),
    lastError: null
  });
  return (await getLivePreviewSession(db, userId)) ?? {
    id,
    userId,
    status: 'active',
    expiresAt: new Date(now + PREVIEW_SESSION_TTL_MS),
    lastError: null
  };
}
