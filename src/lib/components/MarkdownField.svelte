<script>
  import MarkdownContent from '$lib/components/MarkdownContent.svelte';
  import { toggleNumberedList } from './markdown-field-numbered-list.js';

  /** @param {HTMLTextAreaElement} _node */
  const noopAction = (_node) => {};
  let {
    label,
    name,
    id = null,
    value = '',
    rows = 3,
    maxlength,
    required = false,
    placeholder = '',
    disabled = false,
    textareaAction = noopAction,
    onvaluechange = () => {}
  } = $props();
  let textarea = $state();
  let editorPane = $state();
  let editing = $state(false);
  /** @type {Array<{value:string,selectionStart:number,selectionEnd:number}>} */
  let editHistory = $state([]);
  /** @type {Array<{value:string,selectionStart:number,selectionEnd:number}>} */
  let redoHistory = $state([]);
  let syncingForDisplay = false;
  /** @type {{value:string,selectionStart:number,selectionEnd:number} | null} */
  let inputSelection = null;
  let draftValue = $state(String(value ?? ''));
  let previousValue = value;

  $effect(() => {
    if (value !== previousValue) {
      const nextValue = String(value ?? '');
      const changedOutsideThisField = nextValue !== draftValue;
      draftValue = nextValue;
      previousValue = value;
      if (changedOutsideThisField) {
        editHistory = [];
        redoHistory = [];
      }
    }
  });

  const tools = [
    { label: 'Bold', kind: 'inline', before: '**', after: '**', placeholder: 'bold text' },
    { label: 'Italic', kind: 'inline', before: '*', after: '*', placeholder: 'emphasis' },
    { label: 'Heading', kind: 'block', before: '## ', placeholder: 'Heading' },
    { label: 'Bullet list', kind: 'block', before: '- ', placeholder: 'List item' },
    { label: 'Numbered list', kind: 'numbered-list', before: '1. ', placeholder: 'List item' },
    { label: 'Link', kind: 'link', before: '[', after: '](https://)', placeholder: 'link text' }
  ];

  /** @param {string} next @param {number} selectionStart @param {number} selectionEnd */
  function commit(next, selectionStart, selectionEnd) {
    if (next === draftValue) return;
    editHistory = [...editHistory, currentSnapshot()].slice(-50);
    redoHistory = [];
    draftValue = next;
    onvaluechange(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function currentSnapshot() {
    return {
      value: draftValue,
      selectionStart: Math.min(textarea?.selectionStart ?? draftValue.length, draftValue.length),
      selectionEnd: Math.min(textarea?.selectionEnd ?? draftValue.length, draftValue.length)
    };
  }

  function handleBeforeInput() {
    inputSelection = currentSnapshot();
  }

  /** @param {{value:string,selectionStart:number,selectionEnd:number}} snapshot */
  function restoreSnapshot(snapshot) {
    draftValue = snapshot.value;
    onvaluechange(snapshot.value);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    });
  }

  function undo() {
    const snapshot = editHistory.at(-1);
    if (!snapshot) return;
    editHistory = editHistory.slice(0, -1);
    redoHistory = [...redoHistory, currentSnapshot()].slice(-50);
    restoreSnapshot(snapshot);
  }

  function redo() {
    const snapshot = redoHistory.at(-1);
    if (!snapshot) return;
    redoHistory = redoHistory.slice(0, -1);
    editHistory = [...editHistory, currentSnapshot()].slice(-50);
    restoreSnapshot(snapshot);
  }

  /** @param {string} value */
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** @param {number} start @param {number} end */
  function lineRange(start, end) {
    const lineStart = draftValue.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextLineBreak = draftValue.indexOf('\n', end);
    return { start: lineStart, end: nextLineBreak === -1 ? draftValue.length : nextLineBreak };
  }

  /** @param {{before:string,placeholder:string}} tool */
  function toggleBlock(tool) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const range = lineRange(start, end);
    const lines = draftValue.slice(range.start, range.end).split('\n');
    const prefix = tool.before;
    const hasContent = lines.some((line) => line.trim());
    const removePrefix = hasContent && lines.filter((line) => line.trim()).every((line) => line.startsWith(prefix));
    const transformed = lines.map((line) => {
      if (removePrefix && line.startsWith(prefix)) return line.slice(prefix.length);
      if (!removePrefix && line.trim() && !line.startsWith(prefix)) return `${prefix}${line}`;
      return line;
    });
    if (!hasContent && lines.length === 1) transformed[0] = `${prefix}${tool.placeholder}`;
    const replacement = transformed.join('\n');
    const next = `${draftValue.slice(0, range.start)}${replacement}${draftValue.slice(range.end)}`;
    commit(next, range.start, range.start + replacement.length);
  }

  /** @param {{placeholder:string}} tool */
  function toggleNumberedListBlock(tool) {
    if (!textarea) return;
    const result = toggleNumberedList(
      draftValue,
      textarea.selectionStart,
      textarea.selectionEnd,
      tool.placeholder
    );
    commit(result.value, result.selectionStart, result.selectionEnd);
  }

  /** @param {{before:string,after:string,placeholder:string}} tool */
  function toggleInline(tool) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draftValue.slice(start, end);
    const before = tool.before;
    const after = tool.after;

    if (!selected) {
      const inserted = `${before}${tool.placeholder}${after}`;
      const next = `${draftValue.slice(0, start)}${inserted}${draftValue.slice(end)}`;
      const contentStart = start + before.length;
      commit(next, contentStart, contentStart + tool.placeholder.length);
      return;
    }

    const leading = selected.match(/^\s*/)?.[0] ?? '';
    const trailing = selected.match(/\s*$/)?.[0] ?? '';
    const core = selected.slice(leading.length, selected.length - trailing.length);
    const contentStart = start + leading.length;
    const contentEnd = end - trailing.length;
    const wrappedSelection = new RegExp(`^${escapeRegExp(before)}([\\s\\S]*?)(\\s*)${escapeRegExp(after)}$`).exec(core);
    const beforeSelection = draftValue.slice(0, contentStart);
    const afterSelection = draftValue.slice(contentEnd);
    const hasAdjacentWrapper = beforeSelection.endsWith(before) && afterSelection.startsWith(after)
      && !(before === '*' && (beforeSelection.endsWith('**') || afterSelection.startsWith('**')));

    if (wrappedSelection) {
      const content = `${wrappedSelection[1]}${wrappedSelection[2]}`;
      const replacement = `${leading}${content}${trailing}`;
      const next = `${draftValue.slice(0, start)}${replacement}${draftValue.slice(end)}`;
      commit(next, start + leading.length, start + leading.length + content.length);
      return;
    }

    if (hasAdjacentWrapper) {
      const wrapperStart = contentStart - before.length;
      const next = `${draftValue.slice(0, wrapperStart)}${leading}${core}${afterSelection.slice(after.length)}`;
      commit(next, wrapperStart + leading.length, wrapperStart + leading.length + core.length);
      return;
    }

    const wrapped = `${leading}${before}${core}${after}${trailing}`;
    const next = `${draftValue.slice(0, start)}${wrapped}${draftValue.slice(end)}`;
    commit(next, start + leading.length + before.length, start + leading.length + before.length + core.length);
  }

  /** @param {{before:string,after:string,placeholder:string}} tool */
  function toggleLink(tool) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draftValue.slice(start, end);
    const markdownLink = /^\[([\s\S]*)\]\(([^)]*)\)$/.exec(selected);

    if (markdownLink) {
      const next = `${draftValue.slice(0, start)}${markdownLink[1]}${draftValue.slice(end)}`;
      commit(next, start, start + markdownLink[1].length);
      return;
    }

    const beforeSelection = draftValue.slice(0, start);
    const linkStart = beforeSelection.lastIndexOf('[');
    const closeStart = draftValue.indexOf('](', end);
    const closeEnd = closeStart === -1 ? -1 : draftValue.indexOf(')', closeStart + 2);
    if (linkStart !== -1 && linkStart === start - 1 && closeStart === end && closeEnd !== -1) {
      const next = `${draftValue.slice(0, linkStart)}${selected}${draftValue.slice(closeEnd + 1)}`;
      commit(next, linkStart, linkStart + selected.length);
      return;
    }

    const linkText = selected || tool.placeholder;
    const inserted = `${tool.before}${linkText}${tool.after}`;
    const next = `${draftValue.slice(0, start)}${inserted}${draftValue.slice(end)}`;
    const contentStart = start + tool.before.length;
    commit(next, contentStart, contentStart + linkText.length);
  }

  /** @param {{kind:string,before:string,after?:string,placeholder:string}} tool */
  function applyTool(tool) {
    if (tool.kind === 'numbered-list') toggleNumberedListBlock(tool);
    else if (tool.kind === 'block') toggleBlock(tool);
    else if (tool.kind === 'link') toggleLink({ ...tool, after: tool.after ?? '' });
    else toggleInline({ ...tool, after: tool.after ?? '' });
  }

  function startEditing() {
    if (disabled) return;
    editing = true;
    requestAnimationFrame(() => {
      if (!textarea) return;
      syncingForDisplay = true;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      syncingForDisplay = false;
      textarea.focus();
    });
  }

  /** @param {Event} event */
  function handleInvalid(event) {
    event.preventDefault();
    startEditing();
  }

  /** @param {FocusEvent} event */
  function handleEditorFocusout(event) {
    const next = event.relatedTarget;
    if (next instanceof Node && editorPane?.contains(next)) return;
    editing = false;
  }

  /** @param {PointerEvent} event */
  function handleWindowPointerdown(event) {
    if (!editing) return;
    const target = event.target;
    if (target instanceof Node && editorPane?.contains(target)) return;
    editing = false;
  }

  /** @param {MouseEvent} event */
  function handlePreviewClick(event) {
    if (event.target instanceof Element && event.target.closest('a')) return;
    startEditing();
  }

  /** @param {KeyboardEvent} event */
  function handlePreviewKeydown(event) {
    if (event.target instanceof Element && event.target.closest('a')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    startEditing();
  }
</script>

<svelte:window onpointerdown={handleWindowPointerdown} />

<div class="markdown-field">
  <div class="field-heading">
    <label for={id || name}>{label}</label>
  </div>
  <div class="editor-preview">
    <div bind:this={editorPane} class:collapsed={!editing} class="editor-pane" onfocusout={handleEditorFocusout}>
      <div class="toolbar" aria-label={`${label} formatting tools`}>
        {#each tools as tool}
          <button
            type="button"
            onclick={() => applyTool(tool)}
            disabled={disabled}
            aria-label={`Toggle ${tool.label}`}
            title={tool.kind === 'block' || tool.kind === 'numbered-list' ? `Apply ${tool.label.toLowerCase()} to the current or selected lines` : `Toggle ${tool.label.toLowerCase()}`}
          >{tool.label}</button>
        {/each}
        <button type="button" onclick={undo} disabled={disabled || editHistory.length === 0} title="Undo the last toolbar change">Undo</button>
        <button type="button" onclick={redo} disabled={disabled || redoHistory.length === 0} title="Redo the last undone toolbar change">Redo</button>
        {#if editing}<span class="mode-hint" role="status">Editing Markdown · click outside to preview</span>{/if}
      </div>
      <p class="toolbar-help">Place the cursor on a line or select text, then choose a tool. Select multiple lines to format a list; click the same tool again to remove it. Use Undo to reverse a text or formatting change.</p>
      <textarea
        bind:this={textarea}
        id={id || name}
        {name}
        {rows}
        {maxlength}
        {required}
        {placeholder}
        {disabled}
        oninvalid={handleInvalid}
        use:textareaAction
        value={draftValue}
        onbeforeinput={handleBeforeInput}
        oninput={(event) => {
          const nextValue = event.currentTarget.value;
          if (!syncingForDisplay && nextValue !== draftValue) {
            editHistory = [...editHistory, inputSelection ?? currentSnapshot()].slice(-50);
            redoHistory = [];
          }
          inputSelection = null;
          draftValue = nextValue;
          onvaluechange(draftValue);
        }}
      ></textarea>
    </div>
    {#if !editing}
      <div
        class="preview-box"
        role="button"
        tabindex="0"
        aria-label={`${label} preview. Activate to edit.`}
        onclick={handlePreviewClick}
        onkeydown={handlePreviewKeydown}
      >
        {#if draftValue.trim()}<MarkdownContent source={draftValue} />{:else}<span class="muted">Nothing to preview yet.</span>{/if}
        <span class="preview-edit-hint">Click to edit</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .markdown-field { display: grid; gap: .4rem; min-width: 0; }
  .field-heading { display: flex; align-items: center; justify-content: space-between; gap: .7rem; }
  .field-heading > label { color: #344054; font-weight: 650; }
  .editor-preview { display: grid; grid-template-columns: minmax(0, 1fr); overflow: hidden; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; }
  .editor-preview:focus-within { border-color: #84adff; }
  .editor-pane { display: grid; gap: .4rem; min-width: 0; padding: .55rem .65rem .65rem; }
  .editor-pane.collapsed { display: none; }
  .toolbar button { padding: .35rem .5rem; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #475467; font: inherit; font-size: .76rem; cursor: pointer; }
  .toolbar { display: flex; flex-wrap: wrap; gap: .25rem; }
  .toolbar button { border-color: #cdd6e3; background: #fff; }
  .toolbar button:hover { border-color: #98a2b3; }
  .mode-hint { align-self: center; margin-left: auto; color: #667085; font-size: .76rem; }
  .toolbar-help { margin: 0; color: #667085; font-size: .74rem; line-height: 1.35; }
  textarea { width: 100%; box-sizing: border-box; padding: .1rem 0 0; border: 0; border-radius: 0; background: transparent; font: inherit; line-height: 1.5; resize: vertical; }
  .preview-box { min-height: 6rem; padding: .75rem; background: #fbfcfe; cursor: text; }
  .preview-box:focus-visible { outline: 3px solid #84adff; outline-offset: -3px; }
  .preview-edit-hint { display: block; margin-top: .65rem; color: #667085; font-size: .76rem; }
  .muted { color: #667085; }
  button:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  textarea:focus-visible { outline: none; }
  button:disabled { cursor: default; opacity: .55; }
  @media (max-width: 700px) { .mode-hint { width: 100%; margin-left: 0; padding-top: .1rem; } }
</style>
