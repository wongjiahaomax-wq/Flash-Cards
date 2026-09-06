import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const questions = readFileSync(new URL('../src/lib/components/case-editor/CaseQuestionsSection.svelte', import.meta.url), 'utf8');
const images = readFileSync(new URL('../src/lib/components/case-editor/CaseImagesAdvanced.svelte', import.meta.url), 'utf8');
const imagesSection = readFileSync(new URL('../src/lib/components/case-editor/CaseImagesSection.svelte', import.meta.url), 'utf8');
const reusable = readFileSync(new URL('../src/lib/components/ReusableImageQuestionManager.svelte', import.meta.url), 'utf8');
const mutation = readFileSync(new URL('../src/lib/case-editor-mutation.js', import.meta.url), 'utf8');
const questionScope = readFileSync(new URL('../src/routes/admin/cases/[caseId]/question-scope/+server.js', import.meta.url), 'utf8');
const recoveryServer = readFileSync(new URL('../src/routes/admin/cases/[caseId]/recovery/+page.server.js', import.meta.url), 'utf8');
const recoveryPage = readFileSync(new URL('../src/routes/admin/cases/[caseId]/recovery/+page.svelte', import.meta.url), 'utf8');
const deactivate = readFileSync(new URL('../src/routes/admin/cases/[caseId]/deactivate/+server.js', import.meta.url), 'utf8');

test('question-scope uses native endpoint submission and carries bounded return context', () => {
  assert.match(page, /!action\.includes\('\/question-scope'\)/);
  assert.match(questionScope, /normalizeCaseLibraryReturnQuery/);
  assert.match(questionScope, /request\.headers\.get\('referer'\)/);
  assert.match(questionScope, /const returnQuery = editorReturnQuery\(request, formData\)/);
  assert.match(questionScope, /selectedCaseRedirect\(caseId, 'question-scope-updated', '#images', returnQuery\)/);
  assert.match(questionScope, /selectedCaseRedirect\(caseId, 'question-saved', hash, returnQuery\)/);
  assert.match(questions, /action=\{previewMode \? '\?\/saveQuestion' : `\/admin\/cases\/\$\{selectedCase\.case\.id\}\/question-scope`\}/);
  assert.match(questions, /action=\{`\/admin\/cases\/\$\{selectedCase\.case\.id\}\/question-scope`\}/);
});

test('live Case-question registration follows creation, Prompt identity changes, and removals', () => {
  assert.doesNotMatch(questions, /onMount\(/);
  assert.match(questions, /\$effect\(\(\) => \{\s*syncQuestionDrafts\(\)/);
  assert.match(questions, /questionRegistrations\.delete\(promptId\)/);
  assert.match(questions, /coordinator\?\.register\(`question:\$\{promptId\}`/);
  assert.match(questions, /const previousId = state\.authoritativeId/);
  assert.match(questions, /delete questionDrafts\[previousId\]/);
  assert.match(questions, /class="question-edit-form"/);
  assert.match(page, /form\.classList\.contains\('question-edit-form'\)/);
});

test('advanced image forms register with the shared coordinator after conditional mount', () => {
  assert.match(imagesSection, /coordinator=\{draftCoordinator\}|\{coordinator\}/);
  assert.match(images, /registerCaseEditorForm/);
  for (const key of ['caption:', 'option-caption:', 'option-question:', 'group-question:', 'group-settings:']) {
    assert.match(images, new RegExp(`use:coordinateForm=\{\`${key.replace(':', ':')}[^}]*\}`));
  }
  assert.match(page, /form\.hasAttribute\('data-case-editor-coordinated'\)/);
  assert.match(images, /data-case-editor-coordinated/);
});

test('successful enhanced submissions preserve unrelated drafts but reset the submitted form', () => {
  assert.match(mutation, /captureEditorFormDrafts\(successful \? submittedForm : null\)/);
  assert.match(mutation, /reconcileSubmittedEditorForm\(submittedForm, submittedKey, submittedSnapshot, currentSubmittedSnapshot\)/);
  assert.match(mutation, /sameEditableFormSnapshot\(currentSnapshot, submittedSnapshot\)/);
  assert.match(mutation, /pending = new Promise\(\(resolve\) => \{ resolvePending = resolve; \}\)/);
  assert.match(mutation, /if \(pending\) \{\s*cancel\(\);/);
  assert.match(mutation, /restoreEditorFormDrafts\(formDrafts\)/);
});

test('coordinated ordinary saves do not warn about themselves and enhanced cancellation blocks the post', () => {
  assert.match(page, /data-case-editor-enhanced/);
  assert.match(page, /caseEditorHasConflictingUnsavedWork\(formElement, draftCoordinator\)/);
  assert.match(page, /cancel\(\);/);
  assert.match(page, /hasAttribute\('data-case-editor-coordinated'\)/);
  assert.match(mutation, /isOrdinaryCaseEditorDraftForm/);
  assert.match(mutation, /coordinator\?\.dirtyCount\?\.\(submittedCoordinatorKey\)/);
});

test('picker links and reusable canonical answers retain coordinator and return context', () => {
  assert.match(imagesSection, /function imagePickerHref\(\)/);
  assert.match(imagesSection, /params\.set\('return_query', caseLibraryReturnQuery\)/);
  assert.match(images, /function imagePickerHref\(targetGroupId = ''\)/);
  assert.match(images, /params\.set\('target_group', targetGroupId\)/);
  assert.match(images, /name="return_query" value=\{caseLibraryReturnQuery\}.*name="intent" value="move"/);
  assert.match(reusable, /registerCaseEditorForm/);
  assert.match(reusable, /data-case-editor-coordinated use:coordinateForm=\{`reusable-answer:/);
});

test('active and inactive lifecycle transitions preserve bounded return context', () => {
  assert.match(recoveryServer, /status=case-restored/);
  assert.match(recoveryServer, /normalizeCaseLibraryReturnQuery\(formText\(formData, 'return_query'\)\)/);
  assert.match(deactivate, /status=case-deactivated/);
  assert.match(deactivate, /normalizeCaseLibraryReturnQuery/);
  assert.match(recoveryPage, /caseLibraryReturnHref\(data\.caseLibraryReturnQuery \|\| 'lifecycle=inactive'\)/);
  assert.match(recoveryPage, /name="return_query" value=\{data\.caseLibraryReturnQuery\}/);
});
