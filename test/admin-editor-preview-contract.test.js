import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const adminEditor = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const caseEditorComponentDirectory = new URL('../src/lib/components/case-editor/', import.meta.url);
const caseEditorComponents = readdirSync(caseEditorComponentDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.svelte'))
  .map((entry) => readFileSync(new URL(entry.name, caseEditorComponentDirectory), 'utf8'));
const sharedEditorSource = [adminEditor, ...caseEditorComponents].join('\n');
const previewEditor = readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const previewRoute = readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
const previewWorkspace = readFileSync(new URL('../src/lib/server/db/preview-workspace.js', import.meta.url), 'utf8');
const questionScopeRoute = readFileSync(new URL('../src/routes/admin/cases/[caseId]/question-scope/+server.js', import.meta.url), 'utf8');

/** @param {string} source */
function editorActionNames(source) {
  return new Set([...source.matchAll(/\baction\s*=\s*["']\?\/([A-Za-z_$][\w$]*)["']/g)].map((match) => match[1]));
}

/** @param {string} source */
function adapterActionNames(source) {
  const actionsStart = source.indexOf('export const actions = {');
  assert.ok(actionsStart >= 0, 'Preview Case adapter must export named form actions.');
  return new Set([...source.slice(actionsStart).matchAll(/^\s{2}([A-Za-z_$][\w$]*):\s*async\b/gm)].map((match) => match[1]));
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
  assert.match(previewEditor, /import\s+AdminCaseEditor\s+from\s+["']\.\.\/\.\.\/\.\.\/admin\/cases\/\[caseId\]\/\+page\.svelte["']/);
});

test('every named action used by the shared Admin Case editor has a Preview adapter action', () => {
  const requiredActions = editorActionNames(sharedEditorSource);
  const previewActions = adapterActionNames(previewRoute);
  const missing = [...requiredActions].filter((name) => !previewActions.has(name)).sort();

  assert.ok(requiredActions.size > 0, 'The shared Case editor should expose named actions for this contract test.');
  assert.deepEqual(missing, [], `Preview adapter is missing shared-editor actions: ${missing.join(', ')}. Implement each action with Preview ownership checks, or explicitly block it with a named 403 action.`);
});

test('every top-level data key read by the shared Admin Case editor is supplied by the Preview loader', () => {
  const requiredDataKeys = sharedEditorDataKeys(adminEditor);
  const loaderSource = loadPreviewCaseEditorSource(previewWorkspace);
  const missing = [...requiredDataKeys].filter((key) => {
    const property = new RegExp(`\\b${escapeRegExp(key)}\\s*:`);
    return !property.test(loaderSource);
  }).sort();

  assert.ok(requiredDataKeys.size > 0, 'The shared Case editor should read server data for this contract test.');
  assert.deepEqual(missing, [], `Preview loader is missing shared-editor data: ${missing.join(', ')}. Extend loadPreviewCaseEditor() with a safe Preview implementation before changing the shared UI.`);
});

test('shared Case editor preserves critical form field contracts after component extraction', () => {
  for (const name of [
    'case_id', 'concept_id', 'relationship_intent', 'title', 'vignette_md', 'question_selection_mode', 'question_count',
    'asset_id', 'group_id', 'option_id', 'target_group_id', 'prompt_md', 'answer_md', 'original_prompt_id',
    'scope', 'target', 'reusable_for_topic', 'direction', 'active'
  ]) {
    assert.match(sharedEditorSource, new RegExp(`\\bname=["']${escapeRegExp(name)}["']`), `Missing shared Case-editor form field: ${name}`);
  }
});

test('question scope UX exposes Case-wide and fixed/alternative stimulus targets without adding Preview production writes', () => {
  assert.match(sharedEditorSource, /Applies to:/);
  assert.match(sharedEditorSource, /This whole Case/);
  assert.match(sharedEditorSource, /A specific image \/ stimulus/);
  assert.match(sharedEditorSource, /value={`fixed:\$\{asset\.assetId\}`}/);
  assert.match(sharedEditorSource, /value={`option:\$\{option\.id\}`}/);
  assert.match(questionScopeRoute, /await moveCaseQuestionToStimulusTarget\(db,\s*\{/);
  assert.match(questionScopeRoute, /await saveQuestionAtScope\(db,\s*\{/);
  assert.doesNotMatch(previewRoute, /question-scope/);
  assert.match(sharedEditorSource, /previewMode \? '\?\/saveQuestion' : `\/admin\/cases\/\$\{selectedCase\.case\.id\}\/question-scope`/);
});

test('Preview Case editor does not expose a learner Study link on the Preview Worker', () => {
  assert.match(sharedEditorSource, /\{#if previewMode\}<span class="muted">Learner Study is unavailable in Preview Mode/);
  assert.match(sharedEditorSource, /\{#if previewMode\}<p class="muted">Learner Study is available on the production Worker only/);
});
