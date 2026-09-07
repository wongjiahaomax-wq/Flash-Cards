<script>
  import { invalidateAll } from '$app/navigation';
  import { caseLibraryReturnHref } from '$lib/admin-case-library-state.ts';
  import { caseEditorUnsavedWorkMessage } from '$lib/case-editor-mutation.js';
  import { shouldClearSaveAllResult } from '$lib/case-editor-coordinator.js';
  let { selectedCase, previewMode, studyPreviewHref = null, caseLibraryReturnQuery = '', coordinator = null, draftRevision = 0 } = $props();
  let unsavedItems = $derived.by(() => {
    draftRevision;
    return /** @type {any[]} */ (coordinator?.dirtyItems() ?? []);
  });
  let saveableCount = $derived(unsavedItems.filter((item) => item.saveable).length);
  let saveableItems = $derived(unsavedItems.filter((item) => item.saveable));
  let structuralItems = $derived(unsavedItems.filter((item) => !item.saveable));
  /** @type {{ attempted: number, succeeded: number, failed: number } | null} */
  let saveAllResult = $state(null);
  let saveAllMessage = $state('');
  /** @type {number | null} */
  let saveAllResultRevision = $state(null);
  $effect(() => {
    draftRevision;
    if (saveAllResult && shouldClearSaveAllResult({ resultRevision: saveAllResultRevision, currentRevision: draftRevision, saving: coordinator?.isSavingAll?.(), dirtyCount: coordinator?.dirtyCount?.() ?? 0 })) {
      saveAllResult = null;
      saveAllResultRevision = null;
    }
  });
  async function saveAll() {
    const conflictMessage = caseEditorUnsavedWorkMessage(null, coordinator);
    if (conflictMessage) {
      saveAllMessage = conflictMessage;
      return;
    }
    saveAllMessage = '';
    const result = await coordinator.saveAll();
    if (result.succeeded) await invalidateAll();
    saveAllResult = result;
    saveAllResultRevision = draftRevision;
  }
</script>

<section class="page-heading">
  <div><p class="eyebrow">Case editor</p><h1>{selectedCase.case.title}</h1><p class="muted">Topic: {#if selectedCase.case.conceptId}<a class="topic-link" href={'/admin/topics/' + selectedCase.case.conceptId}>{selectedCase.case.conceptName}</a>{:else}No primary Topic assigned{/if}</p></div>
  <div class="actions"><a class="button" href={caseLibraryReturnHref(caseLibraryReturnQuery)}>All Cases</a>{#if unsavedItems.length}<details class="unsaved-work"><summary class="unsaved-count" aria-live="polite">{unsavedItems.length} unsaved changes</summary><div class="unsaved-popover">
    {#if saveableItems.length}<strong>Can be saved with Save All</strong><ul>{#each saveableItems as item}<li><span>{item.fields.length ? `${item.label} — ${item.fields.join(', ')}` : item.label}</span><small>{item.status}</small></li>{/each}</ul>{/if}
    {#if structuralItems.length}<strong>Needs individual action</strong><p class="popover-guidance">Submit this valid structural work first; your saveable drafts stay in place, then use Save All.</p><ul>{#each structuralItems as item}<li><span>{item.fields.length ? `${item.label} — ${item.fields.join(', ')}` : item.label}</span><small>Submit this form, then save the remaining drafts</small></li>{/each}</ul>{/if}
  </div></details>{#if saveableCount && !structuralItems.length}<button class="button primary save-all-button" type="button" onclick={saveAll} disabled={coordinator.isSavingAll()} aria-label="Save all saveable Case-editor changes">{coordinator.isSavingAll() ? 'Saving…' : 'Save all changes'}</button>{/if}{/if}{#if structuralItems.length}<span class="save-all-guidance">Submit structural work first; then Save All is available.</span>{/if}{#if saveAllMessage}<span class="save-all-result error" role="alert">{saveAllMessage}</span>{:else if saveAllResult?.failed}<span class="save-all-result error" role="alert">{saveAllResult.succeeded} saved, {saveAllResult.failed} failed — unsaved changes remain</span>{:else if saveAllResult?.attempted}<span class="save-all-result" role="status">{saveAllResult.succeeded} saved</span>{/if}{#if previewMode}<span class="muted">Learner Study is unavailable in Preview Mode.</span>{:else}<a class="button primary" href={studyPreviewHref ?? '/study'}>Preview in Study</a>{/if}</div>
</section>

<style>
  .page-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; } .topic-link { color: inherit; font-weight: 650; }
  .unsaved-count { color: #b54708; font-size: 0.82rem; font-weight: 700; }
  .unsaved-work { position: relative; }
  .unsaved-work summary { cursor: pointer; list-style: none; }
  .unsaved-work summary::-webkit-details-marker { display: none; }
  .unsaved-popover { position: absolute; right: 0; z-index: 3; width: min(28rem, 90vw); margin-top: 0.45rem; padding: 0.8rem; border: 1px solid #fecdca; border-radius: 8px; background: #fff; box-shadow: 0 12px 28px rgb(16 24 40 / 16%); }
  .unsaved-popover ul { display: grid; gap: 0.55rem; margin: 0.55rem 0 0.8rem; padding-left: 1.15rem; }
  .unsaved-popover li { padding-left: 0.15rem; }
  .unsaved-popover li span, .unsaved-popover li small { display: block; }
  .unsaved-popover li small { margin-top: 0.12rem; color: #667085; }
  .popover-guidance, .save-all-guidance { color: #667085; font-size: 0.78rem; }
  .popover-guidance { margin: 0.35rem 0 0; }
  .save-all-guidance { max-width: 18rem; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 760px) { .page-heading { align-items: start; flex-direction: column; } }
</style>
