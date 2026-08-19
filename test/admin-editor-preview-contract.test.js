import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminEditor = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const adminActions = readFileSync(new URL('../src/routes/admin/+page.server.js', import.meta.url), 'utf8');
const previewEditor = readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const previewRoute = readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
const previewWorkspace = readFileSync(new URL('../src/lib/server/db/preview-workspace.js', import.meta.url), 'utf8');

/** @param {string} source */
function editorActionNames(source) {
  return new Set([...source.matchAll(/\baction\s*=\s*["']\?\/([A-Za-z_$][\w$]*)["']/g)].map((match) => match[1]));
}

/** @param {string} source */
function adapterActionNames(source) {
  const actionsStart = source.indexOf('export const actions = {');
  assert.ok(actionsStart >= 0, 'Preview Case adapter must export named form actions.');
  return new Set(
    [...source.slice(actionsStart).matchAll(/^\s{2}([A-Za-z_$][\w$]*):\s*async\b/gm)].map((match) => match[1])
  );
}

/** @param {string} source */
function sharedEditorDataKeys(source) {
  return new Set([...source.matchAll(/\bdata\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]));
}

/** @param {string} source */
function loadPreviewCaseEditorSource(source) {
  const start = source.indexOf('export async function loadPreviewCaseEditor');
  assert.ok(start >= 0, 'Preview workspace must expose loadPreviewCaseEditor().');
  const nextExport = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, nextExport >= 0 ? nextExport : source.length);
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Preview renders the real production Case editor rather than a copied UI', () => {
  assert.match(
    previewEditor,
    /import\s+AdminCaseEditor\s+from\s+["']\.\.\/\.\.\/\.\.\/admin\/cases\/\[caseId\]\/\+page\.svelte["']/
  );
});

test('every named action used by the shared Admin Case editor has a Preview adapter action', () => {
  const requiredActions = editorActionNames(adminEditor);
  const previewActions = adapterActionNames(previewRoute);
  const missing = [...requiredActions].filter((name) => !previewActions.has(name)).sort();

  assert.ok(requiredActions.size > 0, 'The shared Case editor should expose named actions for this contract test.');
  assert.deepEqual(
    missing,
    [],
    `Preview adapter is missing shared-editor actions: ${missing.join(', ')}. Implement each action with Preview ownership checks, or explicitly block it with a named 403 action.`
  );
});

test('every top-level data key read by the shared Admin Case editor is supplied by the Preview loader', () => {
  const requiredDataKeys = sharedEditorDataKeys(adminEditor);
  const loaderSource = loadPreviewCaseEditorSource(previewWorkspace);
  const missing = [...requiredDataKeys].filter((key) => {
    const property = new RegExp(`\\b${escapeRegExp(key)}\\s*:`);
    return !property.test(loaderSource);
  }).sort();

  assert.ok(requiredDataKeys.size > 0, 'The shared Case editor should read server data for this contract test.');
  assert.deepEqual(
    missing,
    [],
    `Preview loader is missing shared-editor data: ${missing.join(', ')}. Extend loadPreviewCaseEditor() with a safe Preview implementation before changing the shared UI.`
  );
});

test('Case question move UX is wired to the dedicated Admin action', () => {
  assert.match(adminEditor, /Move to an exact image/);
  assert.match(adminEditor, /Move existing Case question here/);
  const moveForms = [...adminEditor.matchAll(/<form method="POST" action="\?\/moveCaseQuestionToStimulusOption"[\s\S]*?<\/form>/g)].map(
    (match) => match[0]
  );
  assert.equal(moveForms.length, 2, 'Both Case-question move entry points should submit to the dedicated action.');
  assert.ok(
    moveForms.some((form) => form.includes('name="prompt_id" value={question.questionPromptId}')),
    'The Case-question card move form must submit the current prompt_id.'
  );
  assert.ok(
    moveForms.some((form) => form.includes('name="prompt_id" required')),
    'The exact-image card move form must submit a selected prompt_id.'
  );
  assert.match(adminActions, /moveCaseQuestionToStimulusOption:/);
  assert.match(adminActions, /moveCaseQuestionToStimulusOption\(createDb\(platform\.env\.DB\)/);
});
