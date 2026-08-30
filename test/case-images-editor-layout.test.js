import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const section = readFileSync(
  new URL('../src/lib/components/case-editor/CaseImagesSection.svelte', import.meta.url),
  'utf8'
);
const advanced = readFileSync(
  new URL('../src/lib/components/case-editor/CaseImagesAdvanced.svelte', import.meta.url),
  'utf8'
);

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} source @param {string} name */
function tags(source, name) {
  const found = [];
  let cursor = 0;
  const needle = `<${name}`;
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
      if (char === '"' || char === "'") {
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
  const quoted = new RegExp(`\\b${escapeRegExp(name)}=(['"])(.*?)\\1`, 's').exec(tag);
  if (quoted) return quoted[2];
  const expression = new RegExp(`\\b${escapeRegExp(name)}=\\{([\\s\\S]*?)\\}`).exec(tag);
  return expression?.[1].trim() ?? null;
}

/** @param {string} tag */
function classes(tag) {
  return (attribute(tag, 'class') ?? '').split(/\s+/).filter(Boolean);
}

/** @param {string} source @param {string} name @param {string} className */
function tagWithClass(source, name, className) {
  return tags(source, name).find((tag) => classes(tag).includes(className)) ?? null;
}

/** @param {string} source @param {string} opening @param {string} name */
function elementBody(source, opening, name) {
  const start = source.indexOf(opening);
  assert.ok(start >= 0, `Missing <${name}> opening tag.`);
  const end = source.indexOf(`</${name}>`, start + opening.length);
  assert.ok(end >= 0, `Missing </${name}> closing tag.`);
  return source.slice(start + opening.length, end);
}

/** @param {string} source @param {string} opening */
function eachBlock(source, opening) {
  const start = source.indexOf(opening);
  assert.ok(start >= 0, `Missing ${opening}.`);
  const openingEnd = source.indexOf('}', start);
  assert.ok(openingEnd >= 0, `Unclosed ${opening}.`);
  const token = /\{#each\b[^}]*\}|\{\/each\}/g;
  token.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = token.exec(source))) {
    if (match[0].startsWith('{#each')) depth += 1;
    else depth -= 1;
    if (depth === 0) return source.slice(openingEnd + 1, match.index);
  }
  throw new Error(`Unclosed ${opening}.`);
}

/** @param {string} branch @param {RegExp} construction @param {string} label */
function assertLinkedQaBranch(branch, construction, label) {
  assert.match(branch, construction, `${label} must construct its imageQuestions from the correct image context.`);
  const linked = tags(branch, 'div').filter((tag) => classes(tag).includes('image-questions'));
  assert.equal(linked.length, 1, `${label} must render exactly one linked Q&A container.`);
  assert.equal(attribute(linked[0], 'aria-label'), 'Questions linked to this image');
  assert.match(branch, /\{#if\s+imageQuestions\.length\s*>\s*0\}/, `${label} must gate its linked Q&A on its own imageQuestions.`);
  assert.match(branch, /\{#each\s+imageQuestions\s+as\s+question\b/, `${label} must render its own imageQuestions collection.`);
  assert.match(branch, /\{question\.scope\}/);
  assert.match(branch, /\{question\.promptMd\s*\|\|\s*['"]—['"]\}/);
  assert.match(branch, /\{question\.answerMd\s*\|\|\s*['"]—['"]\}/);
  assert.match(branch, />\s*Q\s*</);
  assert.match(branch, />\s*A\s*</);
}

/** @param {string} source @param {string} action */
function formByAction(source, action) {
  const opening = tags(source, 'form').find((tag) => attribute(tag, 'action') === action);
  assert.ok(opening, `Missing form action ${action}.`);
  return { opening, body: elementBody(source, opening, 'form') };
}

/** @param {string} source @param {string} property */
function propertyExpressions(source, property) {
  const expressions = [];
  const pattern = new RegExp(`\\b${escapeRegExp(property)}\\s*:`, 'g');
  let match;
  while ((match = pattern.exec(source))) {
    let cursor = match.index + match[0].length;
    let quote = null;
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    for (; cursor < source.length; cursor += 1) {
      const char = source[cursor];
      if (quote) {
        if (char === quote && source[cursor - 1] !== '\\') quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        continue;
      }
      if (char === '(') parenDepth += 1;
      else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (char === '[') bracketDepth += 1;
      else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      else if (char === '{') braceDepth += 1;
      else if (char === '}') {
        if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) break;
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (char === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
        break;
      }
    }
    expressions.push(source.slice(match.index + match[0].length, cursor).trim());
    pattern.lastIndex = cursor;
  }
  return expressions;
}

/** @param {string} expression @param {Record<string, unknown>} scope */
function evaluateExpression(expression, scope) {
  const names = Object.keys(scope);
  const values = Object.values(scope);
  return Function(...names, `'use strict'; return (${expression});`)(...values);
}

/** @param {string} source @param {string} token */
function containingExpression(source, token) {
  const expression = propertyExpressions(source, 'role').find((candidate) => candidate.includes(token));
  assert.ok(expression, `Missing role expression containing ${token}.`);
  return expression;
}

test('Case image overview maps learner-visible images to the intended role semantics', () => {
  const assignedRole = containingExpression(section, 'originalOptionId');
  assert.equal(evaluateExpression(assignedRole, { option: { id: 'option-a' }, group: { originalOptionId: 'option-a' } }), 'Original');
  assert.equal(evaluateExpression(assignedRole, { option: { id: 'option-b' }, group: { originalOptionId: 'option-a' } }), 'Alternative');

  const ordinaryRole = containingExpression(section, 'attachedImages');
  assert.equal(evaluateExpression(ordinaryRole, { activeGroups: [{}], attachedImages: [{}] }), 'Always shown');
  assert.equal(evaluateExpression(ordinaryRole, { activeGroups: [], attachedImages: [{}] }), 'Original');
  assert.equal(evaluateExpression(ordinaryRole, { activeGroups: [], attachedImages: [{}, {}] }), 'Needs role');

  const roleBodies = tags(section, 'span')
    .filter((tag) => classes(tag).includes('role-badge'))
    .map((tag) => elementBody(section, tag, 'span').trim());
  assert.ok(roleBodies.includes('{asset.role}'), 'Ordinary learner-visible images must render their derived role.');
  assert.ok(roleBodies.includes('{option.role}'), 'Image-set options must render their derived Original/Alternative role.');
});

test('Case image overview keeps learner-visible images and linked Q&A together', () => {
  const heading = tags(section, 'h2').find((tag) => attribute(tag, 'id') === 'case-images-heading');
  assert.ok(heading, 'Case image overview must keep a labelled Images heading.');
  const headingBody = elementBody(section, heading, 'h2');
  assert.match(headingBody, /\bImages\b/);
  assert.match(headingBody, /\{imageCount\}/);
  assert.match(section, /learner-visible image[\s\S]{0,120}linked Q&A/i);

  const ordinaryBranch = eachBlock(section, '{#each ordinaryImages as asset (asset.assetId)}');
  assertLinkedQaBranch(
    ordinaryBranch,
    /\{@const\s+imageQuestions\s*=\s*questionsForImage\(asset\)\}/,
    'Ordinary-image card branch'
  );
  const assignedBranch = eachBlock(section, '{#each assignedImages as option (option.id)}');
  assertLinkedQaBranch(
    assignedBranch,
    /\{@const\s+imageQuestions\s*=\s*questionsForImage\(option\s*,\s*option\.group\)\}/,
    'Assigned image-set option card branch'
  );

  for (const scope of ['Image-specific', 'Reusable', 'Shared across this image set']) {
    assert.match(section, new RegExp(`scope:\\s*['"]${escapeRegExp(scope)}['"]`), `Missing ${scope} preview scope.`);
  }
});

test('Advanced image management remains reachable from the production overview', () => {
  const button = tags(section, 'button').find((tag) => elementBody(section, tag, 'button').trim() === 'Advanced image management');
  assert.ok(button, 'Production overview must retain the Advanced image management entry point.');
  const handler = attribute(button, 'onclick');
  assert.ok(handler, 'Advanced image management entry point must remain interactive.');
  assert.match(section, new RegExp(`(?:async\\s+)?function\\s+${escapeRegExp(handler)}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?advancedOpen\\s*=\\s*true`));
});

test('Advanced image management keeps role-based image-set workflows reachable', () => {
  assert.match(advanced, /<h3>Always-shown Case images\b/);
  assert.match(advanced, /<h3>Image sets\b/);

  const start = formByAction(advanced, '?/startAlternativeSet');
  assert.match(start.body, /name="asset_id"/);
  assert.match(start.body, /name="set_name"/);
  assert.match(start.body, />Start image set with this Original<\/button>/);

  const add = formByAction(advanced, '?/addStimulusOption');
  assert.match(add.body, /name="asset_id"/);
  assert.match(add.body, /name="group_id"/);
  assert.match(add.body, /name="convert_fixed"\s+value="on"/);
  assert.match(add.body, />Add as Alternative<\/button>/);
});

test('production Advanced image management preserves one canonical images anchor across the handoff', () => {
  const overview = tagWithClass(section, 'section', 'image-overview');
  assert.ok(overview, 'Missing production Case image overview section.');
  const overviewId = attribute(overview, 'id');
  assert.ok(overviewId, 'Case image overview must participate in the canonical images anchor handoff.');
  assert.equal(evaluateExpression(overviewId, { advancedOpen: false }), 'images');
  assert.equal(evaluateExpression(overviewId, { advancedOpen: true }), undefined);

  const advancedRoot = tagWithClass(advanced, 'section', 'image-authoring');
  assert.ok(advancedRoot, 'Missing Advanced image authoring root.');
  assert.equal(attribute(advancedRoot, 'id'), 'images');

  assert.equal(tags(section, 'section').filter((tag) => attribute(tag, 'id') === 'images').length, 0, 'The production overview must not keep a second static #images anchor.');
  assert.equal(tags(advanced, 'section').filter((tag) => attribute(tag, 'id') === 'images').length, 1, 'Advanced image management must own exactly one static #images anchor.');

  const conditionalAdvanced = /\{#if\s+advancedOpen\}([\s\S]*?)\{\/if\}/.exec(section)?.[1] ?? '';
  assert.match(conditionalAdvanced, /<CaseImagesAdvanced\b/, 'Advanced editor must receive the anchor only while Advanced management is open.');
});
