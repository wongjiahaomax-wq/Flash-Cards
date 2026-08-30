import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const editor = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../src/lib/components/case-editor/CaseEditorNavigation.svelte', import.meta.url), 'utf8');
const questions = readFileSync(new URL('../src/lib/components/case-editor/CaseQuestionsSection.svelte', import.meta.url), 'utf8');
const images = readFileSync(new URL('../src/lib/components/case-editor/CaseImagesAdvanced.svelte', import.meta.url), 'utf8');
const imageReview = readFileSync(new URL('../src/lib/components/ImageQuestionReview.svelte', import.meta.url), 'utf8');

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} source @param {number} openingBrace */
function bracedBody(source, openingBrace) {
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return { body: source.slice(openingBrace + 1, index), end: index + 1 };
  }
  assert.fail('Unclosed source block.');
}

/** @param {string} source @param {string} name */
function callableBody(source, name) {
  const match = new RegExp(`(?:function\\s+${escapeRegExp(name)}\\s*\\([^)]*\\)|const\\s+${escapeRegExp(name)}\\s*=\\s*\\([^)]*\\)\\s*=>)\\s*\\{`).exec(source);
  assert.ok(match, `Missing callable ${name}.`);
  return bracedBody(source, source.indexOf('{', match.index)).body;
}

/** @param {string} source @param {string} callee */
function arrowCallbackBody(source, callee) {
  const match = new RegExp(`${escapeRegExp(callee)}\\s*\\(\\s*\\([^)]*\\)\\s*=>\\s*\\{`).exec(source);
  assert.ok(match, `Missing ${callee} arrow callback.`);
  return bracedBody(source, source.indexOf('{', match.index)).body;
}

/** @param {string} source */
function svelteIfBlocks(source) {
  const tokens = /\{#if\s+([^}]+)\}|\{\/if\}/g;
  const stack = [];
  const blocks = [];
  let match;
  while ((match = tokens.exec(source))) {
    if (match[1] !== undefined) {
      stack.push({ condition: match[1].trim(), bodyStart: tokens.lastIndex });
      continue;
    }
    const opening = stack.pop();
    assert.ok(opening, 'Unmatched Svelte {/if}.');
    blocks.push({ condition: opening.condition, body: source.slice(opening.bodyStart, match.index) });
  }
  assert.equal(stack.length, 0, 'Unclosed Svelte {#if}.');
  return blocks;
}

/** @param {string} source @param {string} tagName */
function tags(source, tagName) {
  const found = [];
  const startPattern = new RegExp(`<${escapeRegExp(tagName)}\\b`, 'g');
  let start;
  while ((start = startPattern.exec(source))) {
    let braceDepth = 0;
    let quote = null;
    for (let index = start.index; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === '\\') {
          index += 1;
          continue;
        }
        if (char === quote) quote = null;
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
        braceDepth -= 1;
        continue;
      }
      if (char === '>' && braceDepth === 0) {
        found.push(source.slice(start.index, index + 1));
        startPattern.lastIndex = index + 1;
        break;
      }
    }
  }
  return found;
}

/** @param {string} tag @param {string} name */
function attribute(tag, name) {
  return new RegExp(`\\b${escapeRegExp(name)}=["']([^"']*)["']`).exec(tag)?.[1] ?? null;
}

/** @param {string} tag */
function useAction(tag) {
  return /\buse:([A-Za-z_$][\w$]*)\b/.exec(tag)?.[1] ?? null;
}

/** @param {string} source @param {string} actionName */
function boundedAutoGrowLimit(source, actionName) {
  const declaration = new RegExp(`const\\s+${escapeRegExp(actionName)}\\s*=\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)\\s*=>\\s*\\{`).exec(source);
  assert.ok(declaration, `Missing textarea action ${actionName}.`);
  const nodeName = declaration[1];
  const body = bracedBody(source, source.indexOf('{', declaration.index)).body;
  const bound = new RegExp(`Math\\.min\\(\\s*${escapeRegExp(nodeName)}\\.scrollHeight\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`).exec(body);
  assert.ok(bound, `${actionName} must bound collapsed field growth.`);
  const limit = new RegExp(`\\bconst\\s+${escapeRegExp(bound[1])}\\s*=\\s*(\\d+(?:\\.\\d+)?)\\b`).exec(body);
  assert.ok(limit, `${actionName} must define a finite local growth limit.`);
  assert.match(body, /addEventListener\(['"]input['"]/);
  assert.match(body, /addEventListener\(['"]click['"]/);
  assert.match(body, /Expand answer/);
  assert.match(body, /Collapse answer/);
  assert.match(body, /aria-expanded/);
  return Number(limit[1]);
}

/** @param {string} source @param {string} className */
function formBodiesWithClass(source, className) {
  const forms = [];
  for (const opening of tags(source, 'form')) {
    const classList = (attribute(opening, 'class') ?? '').split(/\s+/);
    if (!classList.includes(className)) continue;
    const start = source.indexOf(opening);
    const end = source.indexOf('</form>', start + opening.length);
    assert.ok(end >= 0, `Unclosed ${className} form.`);
    forms.push(source.slice(start, end));
  }
  return forms;
}

/** @param {string} source @param {string} formClass */
function imageAutoGrowLimit(source, formClass) {
  const forms = formBodiesWithClass(source, formClass);
  assert.ok(forms.length > 0, `Missing ${formClass} image-question forms.`);
  const fields = forms.flatMap((form) => tags(form, 'textarea')).filter((tag) => {
    const name = attribute(tag, 'name');
    return name === 'prompt_md' || name === 'answer_md';
  });
  assert.ok(fields.some((tag) => attribute(tag, 'name') === 'prompt_md') && fields.some((tag) => attribute(tag, 'name') === 'answer_md'), 'Image Question UI must expose Prompt and Answer fields.');
  const actions = new Set(fields.map(useAction));
  assert.equal(actions.has(null), false, 'Every image Prompt/Answer field must use bounded auto-grow.');
  assert.equal(actions.size, 1, 'Image Prompt/Answer fields should share one bounded behavior in each component.');
  return boundedAutoGrowLimit(source, [...actions][0]);
}

/** @param {string} source */
function mediaBlocks(source) {
  const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '';
  const blocks = [];
  const media = /@media\s*(\([^)]*\))\s*\{/g;
  let match;
  while ((match = media.exec(style))) {
    const block = bracedBody(style, style.indexOf('{', match.index));
    blocks.push({ condition: match[1].replace(/\s+/g, ' ').trim(), body: block.body });
    media.lastIndex = block.end;
  }
  return blocks;
}

/** @param {string} source @param {string} selectorFragment */
function cssRule(source, selectorFragment) {
  let cursor = 0;
  while (cursor < source.length) {
    const openingBrace = source.indexOf('{', cursor);
    if (openingBrace < 0) break;
    const selector = source.slice(cursor, openingBrace).trim();
    const block = bracedBody(source, openingBrace);
    if (selector.includes(selectorFragment)) return { selector, body: block.body };
    cursor = block.end;
  }
  return null;
}

/** @param {string} body @param {string} property */
function declaration(body, property) {
  return new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;]+)`, 'm').exec(body)?.[1].trim() ?? null;
}

/** @param {string} value */
function trackCount(value) {
  let depth = 0;
  let count = 0;
  let inTrack = false;
  for (const char of `${value} `) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (inTrack) count += 1;
      inTrack = false;
    } else if (!/\s/.test(char)) {
      inTrack = true;
    }
  }
  return count;
}

test('Case editor exposes one shared Classic/Compact authoring tree', () => {
  assert.match(editor, /<div class="case-editor" data-editor-layout=\{editorLayout\}>/);
  const sharedComponents = [...editor.matchAll(/import\s+([A-Z][A-Za-z0-9_$]*)\s+from\s+['"]\$lib\/components\/case-editor\/[^'"]+['"]/g)].map((match) => match[1]);
  assert.ok(sharedComponents.length > 0, 'Case editor must use the shared case-editor component family.');
  for (const component of sharedComponents) {
    assert.equal(tags(editor, component).length, 1, `${component} must remain a single shared authoring node.`);
  }

  const layoutInputs = tags(navigation, 'input').filter((tag) => attribute(tag, 'name') === 'case_editor_layout');
  assert.deepEqual(layoutInputs.map((tag) => attribute(tag, 'value')).sort(), ['classic', 'compact']);
  assert.match(navigation, />\s*Classic\s*<\/label>/);
  assert.match(navigation, />\s*Compact\s*<\/label>/);
  for (const input of layoutInputs) {
    const value = attribute(input, 'value');
    assert.match(input, new RegExp(`onchange=\\{[^}]*onlayoutchange\\(['"]${escapeRegExp(value)}['"]\\)`));
  }

  const layoutBranches = svelteIfBlocks(editor).filter(({ condition }) => condition.includes('editorLayout'));
  for (const { body } of layoutBranches) {
    for (const component of sharedComponents) {
      assert.equal(tags(body, component).length, 0, `${component} must not be selected by Classic/Compact state.`);
    }
  }
});

test('Compact Case questions keep scope and reorder controls together while preserving viewport scroll', () => {
  const cardStart = questions.indexOf('<div class="card-heading">');
  const headerStart = questions.indexOf('<div class="header-actions">', cardStart);
  const editFormStart = questions.indexOf('<form id={`question-edit-', headerStart);
  assert.ok(cardStart >= 0 && headerStart > cardStart && editFormStart > headerStart, 'Existing question identity/actions must precede the edit form.');
  const cardHeading = questions.slice(cardStart, editFormStart);
  const header = questions.slice(headerStart, editFormStart);
  const scopeDisclosure = tags(header, 'details').find((tag) => {
    const classList = (attribute(tag, 'class') ?? '').split(/\s+/);
    return classList.includes('scope-change') && classList.includes('scope-change-header');
  });
  assert.ok(scopeDisclosure, 'Compact scope editing must remain reachable in the question header.');
  assert.match(cardHeading, /class="scope-badge">Whole Case<\/span>/);
  assert.match(header, /<summary>Change scope<\/summary>/);
  assert.match(header, /class="question-order-actions"/);
  assert.match(header, /aria-label="Move question up"/);
  assert.match(header, /aria-label="Move question down"/);

  const reorderForms = tags(header, 'form').filter((tag) => attribute(tag, 'action') === '?/reorderQuestion');
  assert.equal(reorderForms.length, 2);
  const actions = new Set(reorderForms.map(useAction));
  assert.equal(actions.has(null), false, 'Reorder controls must remain progressively enhanced.');
  assert.equal(actions.size, 1, 'Both reorder directions must share viewport-preserving behavior.');

  const behavior = callableBody(questions, [...actions][0]);
  assert.match(behavior, /const\s+scrollX\s*=\s*window\.scrollX/);
  assert.match(behavior, /const\s+scrollY\s*=\s*window\.scrollY/);
  assert.match(behavior, /replaceState\s*\(/);
  assert.match(behavior, /await\s+invalidateAll\s*\(/);
  assert.match(behavior, /overflowAnchor\s*=\s*['"]none['"]/);
  assert.match(behavior, /window\.scrollTo\(\s*scrollX\s*,\s*scrollY\s*\)/);
  assert.doesNotMatch(behavior, /window\.scrollBy\s*\(|\bgoto\s*\(|\.reload\s*\(|window\.location/);
});

test('Case question Prompt and Answer fields start comparably and long Answers expand without becoming unbounded', () => {
  const formStart = questions.indexOf('<form id={`question-edit-');
  const formEnd = questions.indexOf('</form>', formStart);
  const form = questions.slice(formStart, formEnd);
  const prompt = tags(form, 'textarea').find((tag) => attribute(tag, 'name') === 'prompt_md');
  const answer = tags(form, 'textarea').find((tag) => attribute(tag, 'name') === 'answer_md');
  assert.ok(prompt && answer);
  assert.equal(attribute(prompt, 'rows'), attribute(answer, 'rows'), 'Prompt and Answer must start with comparable editing space.');
  const answerAction = useAction(answer);
  assert.ok(answerAction, 'Long Case Answers must use bounded auto-grow.');
  boundedAutoGrowLimit(questions, answerAction);
});

test('Image-specific Prompt and Answer fields use a smaller contextual bounded auto-grow behavior', () => {
  const mainAnswer = tags(questions, 'textarea').find((tag) => attribute(tag, 'name') === 'answer_md' && useAction(tag));
  assert.ok(mainAnswer);
  const mainLimit = boundedAutoGrowLimit(questions, useAction(mainAnswer));
  assert.ok(imageAutoGrowLimit(images, 'image-question-form') < mainLimit);
  assert.ok(imageAutoGrowLimit(imageReview, 'qa-row') < mainLimit);

  const imageForms = tags(images, 'form').filter((tag) => /(?:^|\s)image-question-form(?:\s|$)/.test(attribute(tag, 'class') ?? ''));
  assert.ok(imageForms.length > 0);
  for (const form of imageForms) {
    assert.ok((attribute(form, 'class') ?? '').split(/\s+/).includes('stack'), 'Image Question forms must stay vertically composed without depending on class ordering.');
  }
});

test('Compact question editing is horizontal with sticky navigation when wide and reflows when narrow', () => {
  const wideQuestions = mediaBlocks(questions).find((block) => {
    const rule = cssRule(block.body, '.question-edit-form');
    return /min-width/.test(block.condition) && rule?.selector.includes('data-editor-layout="compact"') && declaration(rule.body, 'grid-template-columns');
  });
  assert.ok(wideQuestions, 'Missing wide Compact question layout.');
  const wideRule = cssRule(wideQuestions.body, '.question-edit-form');
  assert.ok(wideRule && trackCount(declaration(wideRule.body, 'grid-template-columns')) >= 2, 'Wide Prompt/Answer editing must use separate horizontal tracks.');
  const promptRule = cssRule(wideQuestions.body, '.question-prompt-field');
  const answerRule = cssRule(wideQuestions.body, '.question-answer-field');
  assert.ok(promptRule && answerRule);
  assert.notEqual(declaration(promptRule.body, 'grid-column'), declaration(answerRule.body, 'grid-column'));
  const anchorRule = cssRule(wideQuestions.body, '#questions');
  assert.ok(anchorRule && Number.parseFloat(declaration(anchorRule.body, 'scroll-margin-top')) > 0, 'Sticky navigation needs nonzero question anchor clearance.');

  const wideNavigation = mediaBlocks(navigation).find((block) => {
    const rule = cssRule(block.body, '.section-nav');
    return /min-width/.test(block.condition) && rule?.selector.includes('data-editor-layout="compact"') && declaration(rule.body, 'position') === 'sticky';
  });
  assert.ok(wideNavigation, 'Missing wide Compact sticky navigation.');
  assert.equal(wideNavigation.condition, wideQuestions.condition, 'Question columns and sticky navigation must use the same wide viewport class.');

  const narrowQuestions = mediaBlocks(questions).find((block) => {
    const rule = cssRule(block.body, '.question-edit-form');
    return /max-width/.test(block.condition) && rule && declaration(rule.body, 'grid-template-columns');
  });
  assert.ok(narrowQuestions, 'Missing narrow Case Question reflow.');
  assert.equal(trackCount(declaration(cssRule(narrowQuestions.body, '.question-edit-form').body, 'grid-template-columns')), 1);
});

test('layout switching is presentation-only and keeps existing question forms mounted', () => {
  assert.match(editor, /from\s+['"]\$lib\/admin-case-editor-layout\.js['"]/);
  const mountBody = arrowCallbackBody(editor, 'onMount');
  assert.match(mountBody, /\breadCaseEditorLayout\s*\(/);
  assert.match(mountBody, /\bgetCaseEditorStorage\s*\(/);

  const navigationTag = tags(editor, 'CaseEditorNavigation')[0];
  const handlerName = /onlayoutchange=\{([A-Za-z_$][\w$]*)\}/.exec(navigationTag)?.[1];
  assert.ok(handlerName, 'Case editor navigation must reach one in-place layout handler.');
  const switchBody = callableBody(editor, handlerName);
  assert.match(switchBody, /\beditorLayout\s*=/);
  assert.match(switchBody, /\bwriteCaseEditorLayout\s*\(/);
  assert.match(switchBody, /\bgetCaseEditorStorage\s*\(/);
  assert.doesNotMatch(switchBody, /\bgoto\s*\(|\blocation\b|\.reload\s*\(|\binvalidateAll\s*\(/);

  const editForm = tags(questions, 'form').find((tag) => /(?:^|\s)question-edit-form(?:\s|$)/.test(attribute(tag, 'class') ?? ''));
  assert.ok(editForm);
  assert.equal(attribute(editForm, 'action'), '?/saveQuestion');
  assert.match(editForm, /id=\{`question-edit-\$\{question\.questionPromptId\}`\}/);
  for (const { condition, body } of svelteIfBlocks(questions).filter(({ condition }) => condition.includes('editorLayout'))) {
    assert.equal(tags(body, 'form').some((tag) => /(?:^|\s)question-edit-form(?:\s|$)/.test(attribute(tag, 'class') ?? '')), false, `Existing question forms must not be mounted by layout condition: ${condition}`);
  }
});
