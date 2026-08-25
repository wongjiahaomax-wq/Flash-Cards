import { eq } from 'drizzle-orm';

import { addCaseTag, createTag } from './tag-library.js';
import { tags } from './tag-schema.js';

/**
 * Create a new active global Tag and immediately attach it to an active
 * production Case. The two writes are treated as one authoring operation: if
 * the Case attachment fails after Tag creation, remove the newly created Tag
 * so the Case editor does not leave an unintended orphan behind.
 */
export async function createAndAddCaseTag(
  db: import('./index.js').LearningDb,
  input: { caseId: unknown; name: unknown }
) {
  const tag = await createTag(db, input.name);
  try {
    await addCaseTag(db, { caseId: input.caseId, tagId: tag.id });
  } catch (error) {
    try {
      await db.delete(tags).where(eq(tags.id, tag.id));
    } catch (cleanupError) {
      console.error('Unable to clean up the Tag created during a failed Case Tag operation.', cleanupError);
    }
    throw error;
  }
  return tag;
}
