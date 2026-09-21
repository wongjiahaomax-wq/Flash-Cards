<script>
  import MarkdownContent from '$lib/components/MarkdownContent.svelte';

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
  let mode = $state('write');
  let textarea = $state();
  let draftValue = $state(String(value ?? ''));
  let previousValue = value;

  $effect(() => {
    if (value !== previousValue) {
      draftValue = String(value ?? '');
      previousValue = value;
    }
  });

  const tools = [
    { label: 'Bold', before: '**', after: '**', placeholder: 'bold text' },
    { label: 'Italic', before: '*', after: '*', placeholder: 'emphasis' },
    { label: 'Heading', before: '## ', after: '', placeholder: 'Heading' },
    { label: 'Bullet list', before: '- ', after: '', placeholder: 'List item' },
    { label: 'Numbered list', before: '1. ', after: '', placeholder: 'List item' },
    { label: 'Link', before: '[', after: '](https://)', placeholder: 'link text' }
  ];

  /** @param {{before:string,after:string,placeholder:string}} tool */
  function insert(tool) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draftValue.slice(start, end) || tool.placeholder;
    const next = `${draftValue.slice(0, start)}${tool.before}${selected}${tool.after}${draftValue.slice(end)}`;
    draftValue = next;
    onvaluechange(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + tool.before.length + selected.length + tool.after.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  }
</script>

<div class="markdown-field">
  <div class="field-heading">
    <label for={id || name}>{label}</label>
    <div class="mode-switch" role="group" aria-label={`${label} editing mode`}>
      <button class:active={mode === 'write'} type="button" onclick={() => (mode = 'write')} disabled={disabled}>Write</button>
      <button class:active={mode === 'preview'} type="button" onclick={() => (mode = 'preview')} disabled={disabled}>Preview</button>
    </div>
  </div>
  {#if mode === 'write'}
    <div class="toolbar" aria-label={`${label} formatting tools`}>
      {#each tools as tool}
        <button type="button" onclick={() => insert(tool)} disabled={disabled} aria-label={`Insert ${tool.label}`}>{tool.label}</button>
      {/each}
    </div>
    <textarea
      bind:this={textarea}
      id={id || name}
      {name}
      {rows}
      {maxlength}
      {required}
      {placeholder}
      {disabled}
      use:textareaAction
      value={draftValue}
      oninput={(event) => { draftValue = event.currentTarget.value; onvaluechange(draftValue); }}
    ></textarea>
  {:else}
    <div class="preview-box" aria-label={`${label} preview`}>
      {#if draftValue.trim()}<MarkdownContent source={draftValue} />{:else}<span class="muted">Nothing to preview yet.</span>{/if}
    </div>
    <textarea
      class="preview-source"
      aria-hidden="true"
      tabindex="-1"
      {name}
      {maxlength}
      {required}
      value={draftValue}
    ></textarea>
  {/if}
</div>

<style>
  .markdown-field { display: grid; gap: .4rem; min-width: 0; }
  .field-heading { display: flex; align-items: center; justify-content: space-between; gap: .7rem; }
  .field-heading > label { color: #344054; font-weight: 650; }
  .mode-switch { display: inline-flex; gap: .2rem; padding: .18rem; border-radius: 7px; background: #eef2f6; }
  .mode-switch button, .toolbar button { padding: .35rem .5rem; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #475467; font: inherit; font-size: .76rem; cursor: pointer; }
  .mode-switch button.active { border-color: #cdd6e3; background: #fff; color: #172033; font-weight: 700; box-shadow: 0 1px 2px rgb(16 24 40 / 8%); }
  .toolbar { display: flex; flex-wrap: wrap; gap: .25rem; }
  .toolbar button { border-color: #cdd6e3; background: #fff; }
  .toolbar button:hover, .mode-switch button:hover { border-color: #98a2b3; }
  textarea { width: 100%; box-sizing: border-box; padding: .65rem .75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; line-height: 1.5; resize: vertical; }
  .preview-box { min-height: 7rem; padding: .75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fbfcfe; }
  .preview-source { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .muted { color: #667085; }
  button:focus-visible, textarea:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  button:disabled { cursor: default; opacity: .55; }
  @media (max-width: 560px) { .field-heading { align-items: start; flex-direction: column; } }
</style>
