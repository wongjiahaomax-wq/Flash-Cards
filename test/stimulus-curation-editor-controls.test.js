import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panelSource = readFileSync(
  new URL('../src/lib/components/case-editor/StimulusOriginalsPanel.svelte', import.meta.url),
  'utf8'
);
const editorSource = readFileSync(
  new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url),
  'utf8'
);
const roleRouteSource = readFileSync(
  new URL('../src/routes/admin/stimulus-roles/+server.js', import.meta.url),
  'utf8'
);
const supportingRouteSource = readFileSync(
  new URL('../src/routes/admin/stimulus-supporting/+server.js', import.meta.url),
  'utf8'
);

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} source @param {string} name */
function tags(source, name) {
  const found = [];
  const needle = `<${name}`;
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(needle, cursor);
    if (start < 0) break;
    const boundary = source[start + needle.length];
    if (boundary && !/[\s/>]/.test(boundary)) {
      cursor = start + needle.length;
      continue;
    }

    let quote = null;
    let braceDepth = 0;
    let end = start + needle.length;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (quote) {
        if (char === quote && source[end - 1] !== '\\') quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        continue;
      }
      if (char === '{') {
        braceDepth += 1;
        continue;
      }
      if (char === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (char === '>' && braceDepth === 0) break;
    }
    assert.ok(end < source.length, `Unclosed <${name}> tag.`);
    found.push(source.slice(start, end + 1));
    cursor = end + 1;
  }
  return found;
}

/** @param {string} tag @param {string} name */
function attribute(tag, name) {
  const escapedName = escapeRegExp(name);
  const quoted = new RegExp(`\\b${escapedName}\\s*=\\s*(['"])(.*?)\\1`, 's').exec(tag);
  if (quoted) return quoted[2];

  const startMatch = new RegExp(`\\b${escapedName}\\s*=\\s*\\{`).exec(tag);
  if (!startMatch) return null;
  const openBrace = startMatch.index + startMatch[0].lastIndexOf('{');
  let quote = null;
  let depth = 1;
  for (let cursor = openBrace + 1; cursor < tag.length; cursor += 1) {
    const char = tag[cursor];
    if (quote) {
      if (char === quote && tag[cursor - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return tag.slice(openBrace + 1, cursor).trim();
    }
  }
  return null;
}

/** @param {string | null} value @param {string} message @returns {string} */
function required(value, message) {
  assert.ok(value, message);
  return value;
}

/** @param {string} tag */
function classes(tag) {
  return (attribute(tag, 'class') ?? '').split(/\s+/).filter(Boolean);
}

/** @param {string} source @param {string} opening @param {string} name */
function elementBody(source, opening, name) {
  const start = source.indexOf(opening);
  assert.ok(start >= 0, `Missing <${name}> opening tag.`);
  const end = source.indexOf(`</${name}>`, start + opening.length);
  assert.ok(end >= 0, `Missing </${name}> closing tag.`);
  return source.slice(start + opening.length, end);
}

/** @param {string} source @param {string} action */
function formsByAction(source, action) {
  return tags(source, 'form')
    .filter((opening) => attribute(opening, 'action') === action)
    .map((opening) => ({ opening, body: elementBody(source, opening, 'form') }));
}

/** @param {string} source @param {string} action @param {string} className */
function formByClass(source, action, className) {
  const found = formsByAction(source, action).find(({ opening }) => classes(opening).includes(className));
  assert.ok(found, `Missing ${action} form with class ${className}.`);
  return found;
}

/** @param {string} source @param {string} name */
function inputByName(source, name) {
  return tags(source, 'input').find((input) => attribute(input, 'name') === name) ?? null;
}

/** @param {string} source @param {string} text */
function buttonByText(source, text) {
  const found = tags(source, 'button').find((opening) => elementBody(source, opening, 'button').trim() === text);
  assert.ok(found, `Missing button ${text}.`);
  return found;
}

/** @param {string} expression @param {Record<string, unknown>} scope */
function evaluateExpression(expression, scope) {
  return Function(...Object.keys(scope), `'use strict'; return (${expression});`)(...Object.values(scope));
}

/** @param {string} source @param {number} index */
function activeIfConditionsAt(source, index) {
  /** @type {(string | null)[]} */
  const stack = [];
  const tokens = /\{#if\s+([^}]+)\}|\{:else if\s+([^}]+)\}|\{:else\}|\{\/if\}/g;
  let match;
  while ((match = tokens.exec(source)) && match.index < index) {
    if (match[1]) stack.push(match[1].trim());
    else if (match[2]) {
      assert.ok(stack.length > 0, 'Encountered {:else if} without an active {#if}.');
      stack[stack.length - 1] = match[2].trim();
    } else if (match[0] === '{:else}') {
      assert.ok(stack.length > 0, 'Encountered {:else} without an active {#if}.');
      stack[stack.length - 1] = null;
    } else {
      stack.pop();
    }
  }
  return stack.filter((condition) => condition !== null);
}

/** @param {string} source */
function eachExpressions(source) {
  const expressions = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('{#each ', cursor);
    if (start < 0) break;
    const end = source.indexOf('}', start);
    assert.ok(end >= 0, 'Unclosed {#each} tag.');
    const raw = source.slice(start + '{#each '.length, end);
    const asIndex = raw.lastIndexOf(' as ');
    assert.ok(asIndex > 0, 'Malformed {#each} expression.');
    expressions.push(raw.slice(0, asIndex).trim());
    cursor = end + 1;
  }
  return expressions;
}

/** @param {string} source @param {string} intent */
function intentBlock(source, intent) {
  const header = new RegExp(`(?:if|else\\s+if)\\s*\\(\\s*intent\\s*===\\s*(['"])${escapeRegExp(intent)}\\1\\s*\\)\\s*\\{`).exec(source);
  assert.ok(header, `Missing ${intent} route branch.`);
  const openBrace = header.index + header[0].lastIndexOf('{');
  let quote = null;
  let depth = 1;
  for (let cursor = openBrace + 1; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (quote) {
      if (char === quote && source[cursor - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace + 1, cursor);
    }
  }
  throw new Error(`Unclosed ${intent} route branch.`);
}

/** @param {string} formBody @param {string} name */
function requiredInput(formBody, name) {
  return required(inputByName(formBody, name), `Missing ${name} field.`);
}

test('production Case editor exposes simple pair curation without requiring family-name authoring', () => {
  const renderedPanels = tags(editorSource, 'StimulusOriginalsPanel');
  assert.equal(renderedPanels.length, 1, 'Production Case editor should render one Stimulus curation panel.');
  const panelIndex = editorSource.indexOf(renderedPanels[0]);
  const previewCondition = required(
    activeIfConditionsAt(editorSource, panelIndex).find((condition) => condition.includes('previewMode')) ?? null,
    'Stimulus curation panel must remain production-only.'
  );
  assert.equal(evaluateExpression(previewCondition, { data: { previewMode: false } }), true);
  assert.equal(evaluateExpression(previewCondition, { data: { previewMode: true } }), false);

  const heading = tags(panelSource, 'h2').find((opening) => attribute(opening, 'id') === 'stimulus-curation-heading');
  assert.ok(heading, 'Stimulus curation must keep a labelled role heading.');
  assert.match(elementBody(panelSource, heading, 'h2'), /Original and Alternatives/);

  const assignment = formByClass(panelSource, '/admin/stimulus-roles', 'role-assignment');
  const assignmentCondition = required(
    activeIfConditionsAt(panelSource, panelSource.indexOf(assignment.opening))
      .find((condition) => condition.includes('activeGroups') && condition.includes('supportingAssets')) ?? null,
    'Simple pair assignment must remain gated by the eligible image state.'
  );
  assert.equal(evaluateExpression(assignmentCondition, { activeGroups: [], supportingAssets: [{}, {}] }), true);
  assert.equal(evaluateExpression(assignmentCondition, { activeGroups: [{}], supportingAssets: [{}, {}] }), false);
  assert.equal(evaluateExpression(assignmentCondition, { activeGroups: [], supportingAssets: [{}] }), false);

  assert.equal(attribute(requiredInput(assignment.body, 'intent'), 'value'), 'assign-pair');
  assert.equal(
    evaluateExpression(required(attribute(requiredInput(assignment.body, 'case_id'), 'value'), 'Missing Case ID value.'), { selectedCase: { case: { id: 'case-a' } } }),
    'case-a'
  );

  const original = requiredInput(assignment.body, 'original_asset_id');
  const alternative = requiredInput(assignment.body, 'alternative_asset_id');
  assert.equal(attribute(original, 'type'), 'radio');
  assert.equal(attribute(alternative, 'type'), 'radio');
  assert.equal(evaluateExpression(required(attribute(original, 'value'), 'Missing Original Asset value.'), { asset: { assetId: 'asset-a' } }), 'asset-a');
  assert.equal(evaluateExpression(required(attribute(alternative, 'value'), 'Missing Alternative Asset value.'), { asset: { assetId: 'asset-b' } }), 'asset-b');

  const originalBinding = required(attribute(original, 'bind:group'), 'Original radio must remain grouped.');
  const alternativeBinding = required(attribute(alternative, 'bind:group'), 'Alternative radio must remain grouped.');
  assert.notEqual(originalBinding, alternativeBinding);
  const originalDisabled = required(attribute(original, 'disabled'), 'Original choice must exclude the selected Alternative.');
  const alternativeDisabled = required(attribute(alternative, 'disabled'), 'Alternative choice must exclude the selected Original.');
  /** @type {Record<string, unknown>} */
  const originalConflict = { asset: { assetId: 'asset-a' } };
  originalConflict[alternativeBinding] = 'asset-a';
  /** @type {Record<string, unknown>} */
  const originalClear = { asset: { assetId: 'asset-a' } };
  originalClear[alternativeBinding] = 'asset-b';
  assert.equal(evaluateExpression(originalDisabled, originalConflict), true);
  assert.equal(evaluateExpression(originalDisabled, originalClear), false);
  /** @type {Record<string, unknown>} */
  const alternativeConflict = { asset: { assetId: 'asset-a' } };
  alternativeConflict[originalBinding] = 'asset-a';
  /** @type {Record<string, unknown>} */
  const alternativeClear = { asset: { assetId: 'asset-a' } };
  alternativeClear[originalBinding] = 'asset-b';
  assert.equal(evaluateExpression(alternativeDisabled, alternativeConflict), true);
  assert.equal(evaluateExpression(alternativeDisabled, alternativeClear), false);

  const save = buttonByText(assignment.body, 'Save roles');
  const saveDisabled = required(attribute(save, 'disabled'), 'Pair assignment must require both role choices.');
  /** @type {Record<string, unknown>} */
  const incompleteSelection = {};
  incompleteSelection[originalBinding] = 'asset-a';
  incompleteSelection[alternativeBinding] = '';
  /** @type {Record<string, unknown>} */
  const completeSelection = {};
  completeSelection[originalBinding] = 'asset-a';
  completeSelection[alternativeBinding] = 'asset-b';
  assert.equal(evaluateExpression(saveDisabled, incompleteSelection), true);
  assert.equal(evaluateExpression(saveDisabled, completeSelection), false);
  assert.equal(inputByName(assignment.body, 'set_name'), null, 'Simple role assignment must not require technical family naming.');

  const branch = intentBlock(roleRouteSource, 'assign-pair');
  assert.match(branch, /await\s+assignSimpleStimulusRoles\s*\(/);
  assert.match(branch, /caseId\s*,/);
  assert.match(branch, /originalAssetId:\s*formText\(formData,\s*['"]original_asset_id['"]\)/);
  assert.match(branch, /alternativeAssetId:\s*formText\(formData,\s*['"]alternative_asset_id['"]\)/);
});

test('curated image sets keep Original reassignment reachable through the canonical role route', () => {
  const curated = formByClass(panelSource, '/admin/stimulus-roles', 'existing-role-form');
  assert.equal(attribute(requiredInput(curated.body, 'intent'), 'value'), 'set-original');
  assert.equal(
    evaluateExpression(required(attribute(requiredInput(curated.body, 'case_id'), 'value'), 'Missing curated Case ID value.'), { selectedCase: { case: { id: 'case-a' } } }),
    'case-a'
  );
  assert.equal(
    evaluateExpression(required(attribute(requiredInput(curated.body, 'group_id'), 'value'), 'Missing curated group value.'), { group: { id: 'group-a' } }),
    'group-a'
  );

  const option = requiredInput(curated.body, 'option_id');
  assert.equal(attribute(option, 'type'), 'radio');
  assert.equal(evaluateExpression(required(attribute(option, 'value'), 'Missing option ID value.'), { option: { id: 'option-a' } }), 'option-a');
  const checked = required(attribute(option, 'checked'), 'Current Original must remain selected in the role picker.');
  assert.equal(evaluateExpression(checked, { option: { id: 'option-a' }, group: { originalOptionId: 'option-a' } }), true);
  assert.equal(evaluateExpression(checked, { option: { id: 'option-b' }, group: { originalOptionId: 'option-a' } }), false);
  assert.match(curated.body, /Use as Original/);

  const branch = intentBlock(roleRouteSource, 'set-original');
  assert.match(
    branch,
    /await\s+setStimulusGroupOriginal\s*\(\s*db\s*,\s*caseId\s*,\s*formText\(formData,\s*['"]group_id['"]\)\s*,\s*formText\(formData,\s*['"]option_id['"]\)\s*\)/s
  );
  assert.match(roleRouteSource, /redirect\(303,\s*`\/admin\/cases\/\$\{encodeURIComponent\(caseId\)\}[^`]*#stimulus-curation`\)/);
});

test('Always shown images can return to the single active image set as Alternatives', () => {
  const addAlternative = formsByAction(panelSource, '/admin/stimulus-roles').find(({ body }) => {
    const intent = inputByName(body, 'intent');
    return intent ? attribute(intent, 'value') === 'add-alternative' : false;
  });
  assert.ok(addAlternative, 'Missing Always shown → Alternative role-correction form.');

  const condition = required(
    activeIfConditionsAt(panelSource, panelSource.indexOf(addAlternative.opening))
      .find((candidate) => candidate.includes('activeGroups.length')) ?? null,
    'Always shown → Alternative must remain limited to an unambiguous single active image set.'
  );
  assert.equal(evaluateExpression(condition, { activeGroups: [{}] }), true);
  assert.equal(evaluateExpression(condition, { activeGroups: [{}, {}] }), false);

  assert.equal(
    evaluateExpression(required(attribute(requiredInput(addAlternative.body, 'group_id'), 'value'), 'Missing Alternative target group.'), { activeGroups: [{ id: 'group-a' }] }),
    'group-a'
  );
  assert.equal(
    evaluateExpression(required(attribute(requiredInput(addAlternative.body, 'asset_id'), 'value'), 'Missing Alternative Asset ID.'), { asset: { assetId: 'asset-a' } }),
    'asset-a'
  );
  assert.match(addAlternative.body, />Make Alternative<\/button>/);

  const branch = intentBlock(roleRouteSource, 'add-alternative');
  assert.match(
    branch,
    /await\s+convertCaseAssetToStimulusOption\s*\(\s*db\s*,\s*formText\(formData,\s*['"]group_id['"]\)\s*,\s*formText\(formData,\s*['"]asset_id['"]\)\s*\)/s
  );
});

test('only non-Original options can move to Always shown through the canonical conversion route', () => {
  const moveButton = buttonByText(panelSource, 'Move to Always shown');
  const moveCondition = required(
    activeIfConditionsAt(panelSource, panelSource.indexOf(moveButton))
      .find((condition) => condition.includes('originalOptionId')) ?? null,
    'Move to Always shown must remain unavailable for the current Original.'
  );
  assert.equal(evaluateExpression(moveCondition, { option: { id: 'option-b' }, group: { originalOptionId: 'option-a' } }), true);
  assert.equal(evaluateExpression(moveCondition, { option: { id: 'option-a' }, group: { originalOptionId: 'option-a' } }), false);

  const supportingForm = formsByAction(panelSource, '/admin/stimulus-supporting')[0];
  assert.ok(supportingForm, 'Missing Alternative → Always shown conversion form.');
  assert.equal(
    evaluateExpression(required(attribute(requiredInput(supportingForm.body, 'case_id'), 'value'), 'Missing supporting Case ID.'), { selectedCase: { case: { id: 'case-a' } } }),
    'case-a'
  );
  assert.equal(
    evaluateExpression(required(attribute(requiredInput(supportingForm.body, 'option_id'), 'value'), 'Missing supporting option ID.'), { option: { id: 'option-b' } }),
    'option-b'
  );
  const buttonTarget = evaluateExpression(required(attribute(moveButton, 'form'), 'Move button must target its conversion form.'), { option: { id: 'option-b' } });
  const formTarget = evaluateExpression(required(attribute(supportingForm.opening, 'id'), 'Supporting form must expose a target ID.'), { option: { id: 'option-b' } });
  assert.equal(buttonTarget, formTarget);

  const filteredOptions = required(
    eachExpressions(panelSource).find((expression) => expression.includes('eligible.filter') && expression.includes('originalOptionId')) ?? null,
    'Supporting conversion forms must be generated only for non-Original options.'
  );
  const eligible = [{ id: 'option-a' }, { id: 'option-b' }, { id: 'option-c' }];
  assert.deepEqual(
    evaluateExpression(filteredOptions, { eligible, group: { originalOptionId: 'option-a' } }),
    [eligible[1], eligible[2]]
  );

  assert.match(
    supportingRouteSource,
    /result\s*=\s*await\s+convertStimulusOptionToSupporting\s*\(\s*createDb\(platform\.env\.DB\)\s*,\s*formText\(formData,\s*['"]option_id['"]\)\s*,\s*caseId\s*\)/s
  );
  assert.match(
    supportingRouteSource,
    /redirect\(303,\s*`\/admin\/cases\/\$\{encodeURIComponent\(result\.caseId\)\}[^`]*#stimulus-curation`\)/
  );
});
