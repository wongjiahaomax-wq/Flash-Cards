import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const questions = readFileSync(new URL('../src/lib/components/case-editor/CaseQuestionsSection.svelte', import.meta.url), 'utf8');
const images = readFileSync(new URL('../src/lib/components/case-editor/CaseImagesAdvanced.svelte', import.meta.url), 'utf8');
const imagesSection = readFileSync(new URL('../src/lib/components/case-editor/CaseImagesSection.svelte', import.meta.url), 'utf8');
const mutation = readFileSync(new URL('../src/lib/case-editor-mutation.js', import.meta.url), 'utf8');
const questionScope = readFileSync(new URL('../src/routes/admin/cases/[caseId]/question-scope/+server.js', import.meta.url), 'utf8');

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
  assert.match(mutation, /resetSubmittedEditorForm\(submittedForm, submittedKey\)/);
  assert.match(mutation, /restoreEditorFormDrafts\(formDrafts\)/);
});
