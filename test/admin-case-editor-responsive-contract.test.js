import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const editor = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../src/lib/components/case-editor/CaseEditorNavigation.svelte', import.meta.url), 'utf8');
const questions = readFileSync(new URL('../src/lib/components/case-editor/CaseQuestionsSection.svelte', import.meta.url), 'utf8');
const images = readFileSync(new URL('../src/lib/components/case-editor/CaseImagesSection.svelte', import.meta.url), 'utf8');

test('Case editor exposes one shared Classic/Compact authoring tree', () => {
  assert.match(editor, /data-editor-layout=\{editorLayout\}/);
  assert.match(navigation, /> Classic<\/label>/);
  assert.match(navigation, /> Compact<\/label>/);
  assert.match(editor, /let editorLayout = \$state\('compact'\)/);
  assert.match(editor, /readCaseEditorLayout\(getCaseEditorStorage\(window\)\)/);
  assert.match(editor, /writeCaseEditorLayout\(getCaseEditorStorage\(window\), layout\)/);
  assert.doesNotMatch(editor, /readCaseEditorLayout\(window\.localStorage\)/);
  assert.doesNotMatch(editor, /writeCaseEditorLayout\(window\.localStorage,/);
  assert.doesNotMatch(`${editor}\n${navigation}`, /ClassicCaseEditor|CompactCaseEditor/);
});

test('Compact Case questions keep scope and reorder controls together while preserving viewport scroll', () => {
  assert.match(questions, /<details class="scope-change scope-change-header">/);
  assert.match(questions, /<summary>Change scope<\/summary>/);
  assert.match(questions, /class="scope-badge">Whole Case<\/span>/);
  assert.match(questions, /<\/details>\s*\{\/if\}\s*<div class="question-order-actions">/);
  assert.match(questions, /aria-label="Move question up"/);
  assert.match(questions, /aria-label="Move question down"/);
  assert.match(questions, /use:enhance=\{preserveQuestionScroll\}/);
  assert.match(questions, /replaceState\(result\.location, \{\}\)/);
  assert.match(questions, /await invalidateAll\(\)/);
  assert.match(questions, /root\.style\.overflowAnchor = 'none'/);
  assert.match(questions, /window\.scrollTo\(scrollX, scrollY\)/);
  assert.doesNotMatch(questions, /window\.scrollBy\(/);
});

test('Compact Case question Prompt and Answer fields start at the same height', () => {
  assert.match(questions, /class="question-prompt-field">Prompt<textarea name="prompt_md" rows="3"/);
  assert.match(questions, /class="question-answer-field">Answer<textarea name="answer_md" rows="3"/);
});

test('Compact wide layout uses horizontal question fields and sticky section navigation only at the wide breakpoint', () => {
  assert.match(questions, /@media \(min-width: 1024px\)/);
  assert.match(questions, /data-editor-layout="compact"\]\) \.question-edit-form/);
  assert.match(questions, /grid-template-columns: minmax\(0, 2fr\) minmax\(0, 3fr\)/);
  assert.match(navigation, /@media \(min-width: 1024px\)/);
  assert.match(navigation, /data-editor-layout="compact"\]\) \.section-nav \{ position: sticky;/);
  assert.match(questions, /scroll-margin-top: 4\.75rem/);
  assert.match(images, /class="stack image-question-form"/);
});

test('layout switching is presentation-only and keeps the existing question forms mounted', () => {
  assert.match(editor, /function setEditorLayout\(layout\) \{\s*editorLayout = writeCaseEditorLayout/);
  assert.doesNotMatch(editor, /setEditorLayout[\s\S]{0,180}(goto\(|location\.|reload\()/);
  assert.match(questions, /id=\{`question-edit-\$\{question\.questionPromptId\}`\}/);
  assert.match(questions, /action="\?\/saveQuestion" class="question-edit-form"/);
});
