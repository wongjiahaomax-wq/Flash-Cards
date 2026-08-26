import { and, eq, inArray, isNull } from 'drizzle-orm';

import { cases } from './schema.js';
import { caseTags, tags } from './tag-schema.js';
import { addCaseTag, removeCaseTag, TagInputError } from './tag-library.js';

export type StagedCaseTagChange = {
  caseId: unknown;
  tagId: unknown;
  operation: unknown;
  expectedAttached: unknown;
};

export type NormalizedStagedCaseTagChange = {
  caseId: string;
  tagId: string;
  operation: 'add' | 'remove';
  expectedAttached: boolean;
};

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new TagInputError(`${label} is required.`);
  return text;
}

function normalizeChanges(changes: StagedCaseTagChange[]): NormalizedStagedCaseTagChange[] {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 300) {
    throw new TagInputError('Staged Case Tag updates must contain between 1 and 300 Case/Tag changes.');
  }

  const normalized = changes.map((change) => {
    const operation = String(change?.operation ?? '').trim();
    if (operation !== 'add' && operation !== 'remove') {
      throw new TagInputError('Every staged Case Tag change must use add or remove.');
    }
    const normalizedOperation: NormalizedStagedCaseTagChange['operation'] = operation;
    if (typeof change?.expectedAttached !== 'boolean') {
      throw new TagInputError('Every staged Case Tag change must include its loaded membership for stale-state validation.');
    }
    if ((normalizedOperation === 'add') === change.expectedAttached) {
      throw new TagInputError('A staged Case Tag change must differ from its loaded membership.');
    }
    return {
      caseId: requiredText(change.caseId, 'Case'),
      tagId: requiredText(change.tagId, 'Tag'),
      operation: normalizedOperation,
      expectedAttached: change.expectedAttached
    };
  });

  const keys = normalized.map((change) => `${change.caseId}\u0000${change.tagId}`);
  if (new Set(keys).size !== keys.length) {
    throw new TagInputError('Each Case/Tag pair may appear only once in a staged Tag update.');
  }

  return normalized;
}

export async function validateStagedCaseTags(
  db: import('./index.js').LearningDb,
  changes: StagedCaseTagChange[]
) {
  const normalized = normalizeChanges(changes);
  const caseIds = [...new Set(normalized.map((change) => change.caseId))];
  const tagIds = [...new Set(normalized.map((change) => change.tagId))];
  const addTagIds = [...new Set(normalized.filter((change) => change.operation === 'add').map((change) => change.tagId))];

  const [caseRows, membershipRows, activeAddTags] = await Promise.all([
    db
      .select({ id: cases.id })
      .from(cases)
      .where(and(
        inArray(cases.id, caseIds),
        eq(cases.isActive, true),
        isNull(cases.previewSessionId)
      )),
    db
      .select({ caseId: caseTags.caseId, tagId: caseTags.tagId })
      .from(caseTags)
      .where(and(
        inArray(caseTags.caseId, caseIds),
        inArray(caseTags.tagId, tagIds)
      )),
    addTagIds.length
      ? db
          .select({ id: tags.id })
          .from(tags)
          .where(and(inArray(tags.id, addTagIds), eq(tags.isActive, true)))
      : Promise.resolve([])
  ]);

  const activeCaseIds = new Set(caseRows.map((row) => row.id));
  if (caseIds.some((caseId) => !activeCaseIds.has(caseId))) {
    throw new TagInputError(
      'Case classification changed since this workspace was loaded. Refresh and review the staged Case Tag changes.'
    );
  }

  const activeAddTagIds = new Set(activeAddTags.map((row) => row.id));
  if (addTagIds.some((tagId) => !activeAddTagIds.has(tagId))) {
    throw new TagInputError('The selected Tag is missing or inactive.');
  }

  const currentMembership = new Set(membershipRows.map((row) => `${row.caseId}\u0000${row.tagId}`));
  for (const change of normalized) {
    const attached = currentMembership.has(`${change.caseId}\u0000${change.tagId}`);
    if (attached !== change.expectedAttached) {
      throw new TagInputError(
        'Case Tag membership changed since this workspace was loaded. Refresh and review the staged Case Tag changes.'
      );
    }
  }

  return normalized;
}

export async function applyValidatedCaseTags(
  db: import('./index.js').LearningDb,
  changes: NormalizedStagedCaseTagChange[]
) {
  // These established domain mutations remain authoritative for Case/Tag
  // semantics. The full workspace preflights every staged domain before this
  // loop begins, but the later canonical writes are not one serializable
  // cross-domain transaction.
  for (const change of changes) {
    if (change.operation === 'add') {
      await addCaseTag(db, { caseId: change.caseId, tagId: change.tagId });
    } else {
      await removeCaseTag(db, { caseId: change.caseId, tagId: change.tagId });
    }
  }
}

export async function applyStagedCaseTags(
  db: import('./index.js').LearningDb,
  changes: StagedCaseTagChange[]
) {
  const normalized = await validateStagedCaseTags(db, changes);
  await applyValidatedCaseTags(db, normalized);
}
