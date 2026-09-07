import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const questions = readFileSync(new URL('../src/lib/components/case-editor/CaseQuestionsSection.svelte', import.meta.url), 'utf8');
const details = readFileSync(new URL('../src/lib/components/case-editor/CaseDetailsSection.svelte', import.meta.url), 'utf8');
const images = readFileSync(new URL('../src/lib/components/case-editor/CaseImagesAdvanced.svelte', import.meta.url), 'utf8');
const topics = readFileSync(new URL('../src/lib/components/case-editor/CaseTopicsSection.svelte', import.meta.url), 'utf8');
const imagesSection = readFileSync(new URL('../src/lib/components/case-editor/CaseImagesSection.svelte', import.meta.url), 'utf8');
const picker = readFileSync(new URL('../src/lib/components/case-editor/CaseImagePickerDialog.svelte', import.meta.url), 'utf8');
const reusable = readFileSync(new URL('../src/lib/components/ReusableImageQuestionManager.svelte', import.meta.url), 'utf8');
const mutation = readFileSync(new URL('../src/lib/case-editor-mutation.js', import.meta.url), 'utf8');
const coordinator = readFileSync(new URL('../src/lib/case-editor-coordinator.js', import.meta.url), 'utf8');
const imageSelection = readFileSync(new URL('../src/lib/admin-image-selection.js', import.meta.url), 'utf8');
const questionScope = readFileSync(new URL('../src/routes/admin/cases/[caseId]/question-scope/+server.js', import.meta.url), 'utf8');
const recoveryServer = readFileSync(new URL('../src/routes/admin/cases/[caseId]/recovery/+page.server.js', import.meta.url), 'utf8');
const recoveryPage = readFileSync(new URL('../src/routes/admin/cases/[caseId]/recovery/+page.svelte', import.meta.url), 'utf8');
const deactivate = readFileSync(new URL('../src/routes/admin/cases/[caseId]/deactivate/+server.js', import.meta.url), 'utf8');
const previewServer = readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
const caseTags = readFileSync(new URL('../src/routes/admin/cases/[caseId]/case-tags/+server.js', import.meta.url), 'utf8');
const moveOption = readFileSync(new URL('../src/routes/admin/cases/[caseId]/move-option/+server.js', import.meta.url), 'utf8');
const stimulusRoles = readFileSync(new URL('../src/routes/admin/stimulus-roles/+server.js', import.meta.url), 'utf8');
const stimulusSupporting = readFileSync(new URL('../src/routes/admin/stimulus-supporting/+server.js', import.meta.url), 'utf8');

test('question-scope uses native endpoint submission and carries bounded return context', () => {
  assert.match(page, /action\.startsWith\('\?\/'\)/);
  assert.doesNotMatch(page, /action\.includes\('\/cases\/'\)/);
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
  assert.match(questions, /questionRegistrations\.delete\(caseQuestionId\)/);
  assert.match(questions, /coordinator\?\.register\(`question:\$\{caseQuestionId\}`/);
  assert.match(questions, /name="case_question_id" value=\{question\.id\}/);
  assert.match(questions, /id=\{`question-edit-\$\{question\.id\}`\}/);
  assert.doesNotMatch(questions, /sameCaseEditorSnapshot\(candidate\.submitted/);
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
  assert.match(images, /use:coordinateForm=\{`option-question:\$\{option\.id\}:\$\{question\.id\}`\}/);
  assert.match(images, /use:coordinateForm=\{`group-question:\$\{group\.id\}:\$\{question\.id\}`\}/);
  assert.match(images, /group\.questions\.filter\(\(question\) => question\.isActive\) as question \(question\.id\)/);
  assert.match(images, /name="stimulus_question_id" value=\{question\.id\}/);
});

test('stimulus question coordinator keys survive prompt identity changes', () => {
  assert.match(mutation, /dataset\.caseEditorLogicalKey/);
  assert.match(mutation, /findSubmittedEditorForm\(form, key, logicalKey\)/);
  assert.match(mutation, /logicalKey = ''/);
});

test('successful enhanced submissions preserve unrelated drafts and reconcile the submitted form', () => {
  assert.match(mutation, /captureEditorFormDrafts\(successful \? submittedForm : null\)/);
  assert.match(mutation, /reconcileSubmittedEditorForm\(submittedForm, submittedKey, submittedLogicalKey, submittedSnapshot, currentSubmittedSnapshot, authoritativeSnapshot\)/);
  assert.match(mutation, /sameEditableFormSnapshot\(currentSnapshot, submittedSnapshot\)/);
  assert.match(mutation, /const authoritativeSnapshot = authoritativeCandidate \? captureEditableFormSnapshot\(authoritativeCandidate\) : null/);
  assert.doesNotMatch(mutation, /function reconcileSubmittedEditorForm[\s\S]{0,500}candidate\.reset/);
  assert.match(mutation, /pending = new Promise\(\(resolve\) => \{ resolvePending = resolve; \}\)/);
  assert.match(mutation, /if \(pending\) \{\s*cancel\(\);/);
  assert.match(mutation, /restoreEditorFormDrafts\(formDrafts\)/);
  assert.match(details, /stableCaseEditorEnhance\(view, formElement, \{ reconcileSubmittedDraft: true \}\)/);
  assert.match(questions, /stableCaseEditorEnhance\(captureCaseEditorView\(\), formElement, \{ reconcileSubmittedDraft: true \}\)/);
  assert.match(mutation, /postSuccessSnapshot/);
  assert.match(page, /rebaseline\(structuralKey, [\s\S]{0,120}postSuccessSnapshot/);
});

test('coordinated ordinary saves do not warn about themselves and enhanced cancellation blocks the post', () => {
  assert.match(page, /data-case-editor-enhanced/);
  assert.match(page, /caseEditorHasConflictingUnsavedWork\(formElement, draftCoordinator\)/);
  assert.match(page, /cancel\(\);/);
  assert.match(page, /hasAttribute\('data-case-editor-coordinated'\)/);
  assert.match(details, /caseEditorHasConflictingUnsavedWork\(formElement, coordinator\)/);
  assert.match(details, /cancel\(\);/);
  assert.match(questions, /caseEditorHasConflictingUnsavedWork\(formElement, coordinator\)/);
  assert.match(questions, /cancel\(\);/);
  assert.match(mutation, /isOrdinaryCaseEditorDraftForm/);
  assert.match(mutation, /coordinator\?\.dirtyCount\?\.\(submittedCoordinatorKey\)/);
});

test('picker links and reusable canonical answers retain coordinator and return context', () => {
  assert.match(imagesSection, /function imagePickerHref\(\)/);
  assert.match(imagesSection, /params\.set\('return_query', caseLibraryReturnQuery\)/);
  assert.match(images, /function imagePickerHref\(targetGroupId = ''\)/);
  assert.match(images, /params\.set\('target_group', targetGroupId\)/);
  assert.match(images, /name="return_query" value=\{caseLibraryReturnQuery\}.*name="intent" value="move"/);
  assert.match(page, /<CaseImagePickerDialog \{selectedCase\} imagePicker=\{data\.imagePicker\} \{editorBase\} coordinator=\{draftCoordinator\} caseLibraryReturnQuery=\{data\['caseLibraryReturnQuery'\]\} \/>/);
  assert.match(picker, /let \{ selectedCase, imagePicker, editorBase, coordinator = null, caseLibraryReturnQuery = '' \}/);
  assert.equal((picker.match(/name="return_query" value=\{caseLibraryReturnQuery\}/g) ?? []).length, 3);
  assert.match(picker, /id="case-image-picker-attach"/);
  assert.match(picker, /pickerAttachAssetIds\(pickerSelected\)/);
  assert.match(picker, /name="picker_selected"/);
  assert.match(reusable, /registerCaseEditorForm/);
  assert.match(reusable, /data-case-editor-coordinated use:coordinateForm=\{`reusable-answer:/);
});

test('active and inactive lifecycle transitions preserve bounded return context', () => {
  assert.match(recoveryServer, /status=case-restored/);
  assert.match(recoveryServer, /normalizeCaseLibraryReturnQuery\(formText\(formData, 'return_query'\)\)/);
  assert.match(deactivate, /status=case-deactivated/);
  assert.match(deactivate, /normalizeCaseLibraryReturnQuery/);
  assert.match(recoveryPage, /caseLibraryReturnHref\(data\.caseLibraryReturnQuery \|\| 'lifecycle=inactive'\)/);
  assert.match(recoveryPage, /Back to Cases/);
  assert.match(recoveryPage, /name="return_query" value=\{data\.caseLibraryReturnQuery\}/);
});

test('native dedicated Case-editor endpoints retain return context and are not generic enhanced', () => {
  for (const source of [caseTags, moveOption, stimulusRoles, stimulusSupporting]) {
    assert.match(source, /normalizeCaseLibraryReturnQuery/);
    assert.match(source, /request\.headers\.get\('referer'\)/);
    assert.match(source, /return_query/);
  }
  assert.match(previewServer, /function editorReturnQuery\(request, formData\)/);
  assert.match(previewServer, /normalizeCaseLibraryReturnQuery/);
  assert.match(previewServer, /caseRedirect\(caseId, 'case-saved', event\.request, formData/);
  for (const endpoint of ['/question-scope', '/case-tags', '/move-option', '/deactivate']) assert.match(page + questions + images + topics, new RegExp(endpoint.replace('/', '\\/')));
});

test('native submit leave protection is one-shot while internal enhancers own cancellation', () => {
  assert.match(page, /suppressNextBeforeUnload/);
  assert.match(page, /acceptedNativeSubmit/);
  assert.match(page, /!event\.defaultPrevented/);
  assert.match(page, /data-case-editor-internal/);
  assert.match(details, /data-case-editor-internal/);
  assert.match(questions, /data-case-editor-internal/);
});

test('grouped checkbox and radio drafts restore by captured control index', () => {
  assert.match(mutation, /map\(\(element, index\)/);
  assert.match(mutation, /index, name: element\.name, type: element\.type, checked/);
  assert.match(mutation, /form\.elements\[value\.index\]/);
});

test('selected structural upload files warn before an unrelated mutation can discard them', () => {
  assert.match(mutation, /formHasSelectedFile/);
  assert.match(mutation, /if \(form\.hasAttribute\('data-case-editor-structural-key'\)\) return formHasSelectedFile\(form\);/);
  assert.match(mutation, /element\.dispatchEvent\(new Event\('input'/);
});

test('reorder uses shared conflict cancellation and rejects stale or in-flight question identity', () => {
  assert.match(questions, /caseEditorHasConflictingUnsavedWork\(formElement, coordinator\)/);
  assert.match(questions, /canReorderCaseQuestion\(/);
  assert.match(questions, /stableCaseEditorEnhance\(captureCaseEditorView\(\), formElement\)/);
  assert.match(questions, /if \(!canReorderCaseQuestion/);
  assert.match(coordinator, /export function canReorderCaseQuestion/);
});

test('picker attach uses canonical staged IDs and participates in leave protection', () => {
  assert.match(picker, /data-case-editor-picker-dirty/);
  assert.match(picker, /pickerAttachAssetIds\(pickerSelected\)/);
  assert.match(picker, /use:enhance=\{enhancePickerAttach\}/);
  assert.match(picker, /if \(outcome\.ok\) pickerSelected = reconcileCasePickerAttachSelection/);
  assert.doesNotMatch(picker, /form="case-image-picker-attach" name="asset_id"/);
  assert.match(mutation, /data-case-editor-picker-dirty="true"/);
  assert.match(page, /hasCaseEditorPickerSelection\(\)/);
  assert.match(imageSelection, /export function pickerAttachAssetIds/);
});

test('default active Case Library editor links carry explicit lifecycle context', () => {
  const library = readFileSync(new URL('../src/routes/admin/cases/+page.svelte', import.meta.url), 'utf8');
  const state = readFileSync(new URL('../src/lib/admin-case-library-state.ts', import.meta.url), 'utf8');
  assert.match(library, /caseEditorReturnQuery\(currentQuery\(\), inactiveView \? 'inactive' : 'active'\)/);
  assert.match(state, /params\.set\('lifecycle', lifecycle\)/);
});

test('coordinated saved forms become visibly unsaved after a later edit and stale Save All results clear', () => {
  assert.match(mutation, /createCoordinatedFormSaveState/);
  assert.match(mutation, /status\.textContent = saveState\.complete\(ok\)/);
  const header = readFileSync(new URL('../src/lib/components/case-editor/CaseEditorHeader.svelte', import.meta.url), 'utf8');
  assert.match(header, /saveAllResultRevision/);
  assert.match(header, /shouldClearSaveAllResult/);
});

test('picker Attach locks competing controls and Search has one same-context navigation exemption', () => {
  assert.match(picker, /let attachPending = \$state\(false\)/);
  assert.match(picker, /disabled=\{attachPending\}/);
  assert.match(picker, /try \{/);
  assert.match(picker, /finally \{/);
  assert.match(page, /data-case-editor-picker-search/);
  assert.match(page, /pendingPickerSearchNavigation/);
  assert.match(page, /isSafeCasePickerSearchNavigation/);
  assert.match(page, /hasNonPickerUnsavedWork/);
});
