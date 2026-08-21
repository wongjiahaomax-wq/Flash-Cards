import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const editor = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');

test('Case editor exposes one shared Classic/Compact authoring tree', () => {
  assert.match(editor, /data-editor-layout=\{editorLayout\}/);
  assert.match(editor, /> Classic<\/label>/);
  assert.match(editor, /> Compact<\/label>/);
  assert.match(editor, /let editorLayout = \$state\('compact'\)/);
  assert.match(editor, /readCaseEditorLayout\(getCaseEditorStorage\(window\)\)/);
  assert.match(editor, /writeCaseEditorLayout\(getCaseEditorStorage\(window\), layout\)/);
  assert.doesNotMatch(editor, /readCaseEditorLayout\(window\.localStorage\)/);
  assert.doesNotMatch(editor, /writeCaseEditorLayout\(window\.localStorage,/);
  assert.doesNotMatch(editor, /ClassicCaseEditor|CompactCaseEditor/);
});

test('Compact Case questions use accessible scope disclosure and ordering controls', () => {
  assert.match(editor, /<details class="scope-change" open=\{editorLayout === 'classic'\}>/);
  assert.match(editor, /<summary>Change scope<\/summary>/);
  assert.match(editor, /class="scope-label">Applies to: <strong>This whole Case<\/strong>/);
  assert.match(editor, /aria-label="Move question up"/);
  assert.match(editor, /aria-label="Move question down"/);
});

test('Compact wide layout uses horizontal question fields and sticky section navigation only at the wide breakpoint', () => {
  assert.match(editor, /@media \(min-width: 1024px\)/);
  assert.match(editor, /data-editor-layout="compact"\] \.question-edit-form/);
  assert.match(editor, /grid-template-columns: minmax\(0, 2fr\) minmax\(0, 3fr\)/);
  assert.match(editor, /data-editor-layout="compact"\] \.section-nav \{ position: sticky;/);
  assert.match(editor, /scroll-margin-top: 4\.75rem/);
  assert.match(editor, /class="stack image-question-form"/);
});

test('layout switching is presentation-only and keeps the existing question forms mounted', () => {
  assert.match(editor, /function setEditorLayout\(layout\) \{\s*editorLayout = writeCaseEditorLayout/);
  assert.doesNotMatch(editor, /setEditorLayout[\s\S]{0,180}(goto\(|location\.|reload\()/);
  assert.match(editor, /id=\{`question-edit-\$\{question\.questionPromptId\}`\}/);
  assert.match(editor, /action="\?\/saveQuestion" class="stack question-edit-form"/);
});
