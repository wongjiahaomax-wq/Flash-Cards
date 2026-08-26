import { and, eq, inArray, isNull } from 'drizzle-orm';

import { cases } from './schema.js';
import { caseTags } from './tag-schema.js';
import { addCaseTag, removeCaseTag, TagInputError } from './tag-library.js';

export type StagedCaseTagChange = {
  caseId: unknown;
  tagId: unknown;
  operation: unknown;
  expectedAttached: unknown;
};

type NormalizedStagedCaseTagChange = {
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

export async function applyStagedCaseTags(
  db: import('./index.js').LearningDb,
  changes: StagedCaseTagChange[]
) {
  const normalized = normalizeChanges(changes);
  const caseIds = [...new Set(normalized.map((change) => change.caseId))];
  const tagIds = [...new Set(normalized.map((change) => change.tagId))];

  const [caseRows, membershipRows] = await Promise.all([
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
      ))
  ]);

  const activeCaseIds = new Set(caseRows.map((row) => row.id));
  if (caseIds.some((caseId) => !activeCaseIds.has(caseId))) {
    throw new TagInputError(
      'Case classification changed since this workspace was loaded. Refresh and review the staged Case Tag changes.'
    );
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

  // Delegate every mutation to the established Case Tag domain functions so
  // active-Tag/production-Case rules remain authoritative. The stale-state
  // read and these canonical writes are not one serializable transaction; the
  // workspace documentation intentionally keeps that boundary explicit.
  for (const change of normalized) {
    if (change.operation === 'add') {
      await addCaseTag(db, { caseId: change.caseId, tagId: change.tagId });
    } else {
      await removeCaseTag(db, { caseId: change.caseId, tagId: change.tagId });
    }
  }
}
