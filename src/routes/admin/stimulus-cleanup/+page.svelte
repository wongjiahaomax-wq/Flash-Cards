<script>
  let { data } = $props();
</script>

<svelte:head><title>Stimulus cleanup | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Content audit</p>
    <h1>Stimulus cleanup</h1>
    <p class="muted">Curate legacy image families without guessing. Single fixed-image Cases are intentionally omitted because their Original meaning is unambiguous.</p>
  </div>
  <a class="button" href="/admin/cases">Back to Cases</a>
</section>

<div class="summary" aria-label="Stimulus cleanup summary">
  <div><strong>{data.cleanupCount}</strong><span>cleanup required</span></div>
  <div><strong>{data.suggestedCount}</strong><span>review suggested</span></div>
</div>

{#if data.issues.length === 0}
  <section class="panel empty">
    <h2>No stimulus cleanup is currently flagged</h2>
    <p class="muted">Legacy multi-option families have an Original, and there are no ambiguous multi-fixed-image Cases requiring review.</p>
  </section>
{:else}
  <div class="issues">
    {#each data.issues as issue (`${issue.caseId}:${issue.groupId ?? issue.severity}`)}
      <article class="panel">
        <div class="issue-heading">
          <div>
            <span class:required={issue.severity === 'needs_cleanup'} class:suggested={issue.severity === 'review_suggested'} class="badge">
              {issue.severity === 'needs_cleanup' ? 'Cleanup required' : 'Review suggested'}
            </span>
            <h2>{issue.caseTitle}</h2>
            {#if issue.groupName}<p class="group-name">Family: {issue.groupName}</p>{/if}
          </div>
          <a class="button" href={`/admin/cases/${encodeURIComponent(issue.caseId)}#stimulus-curation`}>Open Case</a>
        </div>
        <p class="muted reason">{issue.reason}</p>
      </article>
    {/each}
  </div>
{/if}

<style>
  h1, h2, p { margin-top: 0; }
  h1 { margin-bottom: 0.35rem; font-size: clamp(1.8rem, 4vw, 2.5rem); }
  h2 { margin: 0.45rem 0 0.2rem; font-size: 1.05rem; }
  .page-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .page-heading > div { max-width: 800px; }
  .eyebrow { margin-bottom: 0.25rem; color: #667085; font-size: 0.72rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .summary { display: flex; gap: 0.75rem; margin: 1rem 0; }
  .summary > div { display: grid; min-width: 150px; padding: 0.8rem 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .summary strong { font-size: 1.45rem; }
  .summary span { color: #667085; font-size: 0.82rem; }
  .issues { display: grid; gap: 0.75rem; }
  .panel { padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .empty { margin-top: 1rem; }
  .issue-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .group-name, .reason { margin-bottom: 0; }
  .group-name { color: #475467; font-size: 0.86rem; }
  .reason { margin-top: 0.75rem; }
  .badge { display: inline-flex; padding: 0.22rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 750; }
  .badge.required { background: #fef0c7; color: #93370d; }
  .badge.suggested { background: #f2f4f7; color: #344054; }
  .button { display: inline-block; padding: 0.6rem 0.85rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; white-space: nowrap; }
  a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 680px) { .page-heading, .issue-heading { align-items: stretch; flex-direction: column; } .summary { flex-direction: column; } .button { width: fit-content; } }
</style>
