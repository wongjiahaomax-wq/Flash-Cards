<script>
  import AccessibleInfo from '$lib/components/AccessibleInfo.svelte';
  let { selectedCase, primaryTopic, editorLayout } = $props();
</script>

<section id="case" class="panel stack">
  <div><p class="eyebrow">Clinical presentation</p><h2>Case{#if editorLayout === 'compact'}<AccessibleInfo label="Case" text="The Case is one coherent clinical presentation. The internal title is Admin-facing; the learner sees the vignette/stem and selected stimuli." />{/if}</h2><p class="muted compact-hide-explainer">Cases under the same Topic can have different stems, causes, findings, or educational intent. The internal title is not shown to learners.</p></div>
  <form method="POST" action="?/updateCase" class="form-grid"><input type="hidden" name="case_id" value={selectedCase.case.id} /><label>Internal Case title<input name="title" value={selectedCase.case.title} maxlength="300" required /></label><div class="wide current-case-topic"><span class="muted">Current primary/default Topic:</span> {#if primaryTopic}<a href={'/admin/topics/' + primaryTopic.id}>{primaryTopic.name}</a>{:else}No primary Topic assigned{/if}. Manage Topic relationships in the <a href="#topics">Topics section</a>.</div><label class="wide">Case stem / vignette <span class="muted">(optional)</span><textarea name="vignette_md" rows="7" maxlength="5000">{selectedCase.case.vignetteMd ?? ''}</textarea></label><label>Questions per Review<select name="question_selection_mode"><option value="automatic" selected={selectedCase.case.questionSelectionMode === 'automatic'}>Automatic</option><option value="all" selected={selectedCase.case.questionSelectionMode === 'all'}>Ask all eligible</option><option value="fixed" selected={selectedCase.case.questionSelectionMode === 'fixed'}>Choose N questions</option></select></label><label>Question count <span class="muted">(used for Choose N)</span><input type="number" name="question_count" min="1" value={selectedCase.case.questionCount ?? ''} /></label><div class="wide"><button class="button primary" type="submit">Save Case</button></div></form>
</section>

<style>
  h2, p { margin-top: 0; } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; } .stack { display: grid; gap: 0.85rem; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; }
  label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; }
  input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } textarea { resize: vertical; }
  .wide { grid-column: 1 / -1; } .current-case-topic { padding: 0.65rem 0; color: #344054; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; } .button.primary { border-color: #172033; background: #172033; color: #fff; }
  button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  :global(.case-editor[data-editor-layout="compact"]) .compact-hide-explainer { display: none; }
  @media (min-width: 1024px) { :global(.case-editor[data-editor-layout="compact"]) #case { scroll-margin-top: 4.75rem; } }
  @media (max-width: 760px) { .form-grid { grid-template-columns: minmax(0, 1fr); } .wide { grid-column: auto; } }
</style>
