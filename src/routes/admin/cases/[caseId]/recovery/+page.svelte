<script>
  let { data, form } = $props();
  let recovery = $derived(data.recoveryCase);
</script>

<svelte:head><title>{recovery.case.title} | Inactive Case | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">Case recovery</p><div class="title-line"><h1>{recovery.case.title}</h1><span class="status-badge">Inactive</span></div><p class="muted">This Production Case is preserved but unavailable to learners and normal active-Case editing.</p></div>
  <a class="button" href="/admin/cases?lifecycle=inactive">Back to Inactive Cases</a>
</section>

{#if data.status === 'case-deactivated'}<p class="success-message" role="status">Case deactivated. Its questions, images, Topics, Tags, and review history were retained.</p>{/if}
{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

<section class="panel" aria-labelledby="recovery-context-heading">
  <div><p class="eyebrow">Recovery context</p><h2 id="recovery-context-heading">Confirm the record before restoring</h2></div>
  <dl>
    <div><dt>Case ID</dt><dd><code>{recovery.case.id}</code></dd></div>
    <div><dt>Primary Topic</dt><dd>{#if recovery.primaryTopics.length === 0}<span class="warning">Missing</span>{:else}{#each recovery.primaryTopics as topic}<span>{topic.name ?? topic.conceptId}{#if !topic.isActive} · inactive{/if}{#if topic.kind && topic.kind !== 'topic'} · {topic.kind}{/if}</span>{/each}{/if}</dd></div>
    <div><dt>System</dt><dd>{recovery.systemName ?? 'Unassigned'}</dd></div>
    <div><dt>Tags</dt><dd class="tag-list">{#if recovery.tags.length}{#each recovery.tags as tag}<span class="tag-chip" class:inactive-tag={!tag.isActive}>{tag.name}{#if !tag.isActive} · inactive{/if}</span>{/each}{:else}<span class="muted">No Tags</span>{/if}</dd></div>
  </dl>
  {#if recovery.case.vignetteMd}<div class="vignette"><h3>Vignette</h3><p>{recovery.case.vignetteMd}</p></div>{/if}
</section>

<section class="restore-panel" aria-labelledby="restore-heading">
  <div><h2 id="restore-heading">Restore Case</h2><p class="muted">Restoration is validated server-side. The Case will only become active if it still has exactly one active Primary Topic classified as a Topic.</p></div>
  <form method="POST" action="?/restoreCase">
    <input type="hidden" name="case_id" value={recovery.case.id} />
    <button class="button primary" type="submit">Restore Case</button>
  </form>
</section>

<style>
  .page-heading, .restore-panel { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } h1, h2, h3, p { margin-top: 0; } h1 { margin-bottom: 0; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.35rem; font-size: 1.15rem; } h3 { margin-bottom: 0.4rem; font-size: 1rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; } .title-line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem; }
  .status-badge { padding: 0.2rem 0.5rem; border-radius: 999px; background: #fef3f2; color: #b42318; font-size: 0.76rem; font-weight: 750; }
  .panel, .restore-panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .restore-panel { border-color: #b2ddff; background: #f5fbff; }
  dl { display: grid; gap: 0; margin: 1rem 0 0; } dl > div { display: grid; grid-template-columns: minmax(120px, 0.3fr) minmax(0, 1fr); gap: 1rem; padding: 0.7rem 0; border-top: 1px solid #eaecf0; } dt { color: #667085; font-weight: 700; } dd { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; color: #172033; } code { overflow-wrap: anywhere; }
  .vignette { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eaecf0; } .vignette p { margin-bottom: 0; white-space: pre-wrap; }
  .tag-list { display: flex; flex-wrap: wrap; gap: 0.35rem; } .tag-chip { padding: 0.18rem 0.4rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.78rem; font-weight: 650; } .tag-chip.inactive-tag { background: #f2f4f7; color: #667085; } .warning { color: #b42318; font-weight: 700; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; } .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .form-error, .success-message { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; } .form-error { background: #fef3f2; color: #b42318; } .success-message { background: #ecfdf3; color: #027a48; }
  a:focus-visible, button:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 680px) { .page-heading, .restore-panel { align-items: stretch; flex-direction: column; } dl > div { grid-template-columns: 1fr; gap: 0.25rem; } .restore-panel .button { width: 100%; } }
</style>