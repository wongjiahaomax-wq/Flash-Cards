import {
  applyValidatedCasePrimaryTopics,
  validateStagedCasePrimaryTopics,
  type StagedCasePrimaryTopicChange
} from './case-primary-topic-staging.ts';
import {
  applyValidatedCaseTags,
  validateStagedCaseTags,
  type StagedCaseTagChange
} from './case-tag-staging.ts';
import {
  applyValidatedTaxonomyHierarchy,
  validateStagedTaxonomyHierarchy,
  type StagedTaxonomyHierarchyChange
} from './taxonomy-hierarchy-staging.ts';
import { TaxonomyInputError } from './taxonomy-admin-write.ts';

export type StagedTaxonomyWorkspaceApply = {
  hierarchyChanges?: StagedTaxonomyHierarchyChange[];
  casePrimaryTopicChanges?: StagedCasePrimaryTopicChange[];
  caseTagChanges?: StagedCaseTagChange[];
};

export async function applyStagedTaxonomyWorkspace(
  db: import('./index.js').LearningDb,
  input: StagedTaxonomyWorkspaceApply
) {
  const hierarchyChanges = Array.isArray(input.hierarchyChanges) ? input.hierarchyChanges : [];
  const casePrimaryTopicChanges = Array.isArray(input.casePrimaryTopicChanges) ? input.casePrimaryTopicChanges : [];
  const caseTagChanges = Array.isArray(input.caseTagChanges) ? input.caseTagChanges : [];

  if (!hierarchyChanges.length && !casePrimaryTopicChanges.length && !caseTagChanges.length) {
    throw new TaxonomyInputError('Stage at least one taxonomy or Case classification change before applying.');
  }

  // Complete every current-state preflight before the first write. This catches
  // stale hierarchy, Primary Topic, Case/Tag membership, inactive Primary Topic
  // targets, and inactive Tag-add targets before canonical writes begin.
  const validatedHierarchy = hierarchyChanges.length
    ? await validateStagedTaxonomyHierarchy(db, hierarchyChanges)
    : [];
  const validatedCasePrimaryTopics = casePrimaryTopicChanges.length
    ? await validateStagedCasePrimaryTopics(db, casePrimaryTopicChanges)
    : [];
  const validatedCaseTags = caseTagChanges.length
    ? await validateStagedCaseTags(db, caseTagChanges)
    : [];

  // D1/Drizzle does not provide one serializable transaction across these
  // established mutation functions. The unified preflight is therefore the
  // strongest practical fail-before-write boundary; a narrow concurrent-change
  // or later operational-failure window remains and is documented in the UX plan.
  if (validatedHierarchy.length) {
    await applyValidatedTaxonomyHierarchy(db, validatedHierarchy);
  }
  if (validatedCasePrimaryTopics.length) {
    await applyValidatedCasePrimaryTopics(db, validatedCasePrimaryTopics);
  }
  if (validatedCaseTags.length) {
    await applyValidatedCaseTags(db, validatedCaseTags);
  }

  return {
    hierarchyCount: validatedHierarchy.length,
    casePrimaryTopicCount: validatedCasePrimaryTopics.length,
    caseTagCount: validatedCaseTags.length
  };
}
