<script>
  // @ts-nocheck
  import {
    feedbackCaseHref,
    feedbackQueueHref,
    formatFeedbackDate
  } from '$lib/admin-feedback-state.js';

  let { data, form } = $props();
  let selected = $state(new Set());

  $effect(() => {
    data;
    selected = new Set();
  });

  function toggleSelected(id, checked) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    selected = next;
  }

  function confirmDelete(event) {
    if (!window.confirm('Delete this feedback report permanently? This cannot be undone.')) {
      event.preventDefault();
    }
  }

  function confirmBulkDelete(event) {
    if (selected.size === 0 || !window.confirm('Delete ' + selected.size + ' selected feedback reports permanently? This cannot be undone.')) {
      event.preventDefault();
    }
  }

  function statusLabel(status) {
    return status === 'open' ? 'Open' : status === 'resolved' ? 'Resolved' : 'Dismissed';
  }
</script>

<svelte:head><title>Feedback | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Learner feedback</p>
    <h1>Feedback</h1>
    <p class="muted">Review Case-level reports submitted from active learner Reviews.</p>
  </div>
  <span class="count">{data.reportCount} report{data.reportCount === 1 ? '' : 's'}</span>
</section>

<nav class="status-tabs" aria-label="Feedback status">
  {#each [['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['all', 'All']] as [value, label]}
    <a class:active={data.filters.status === value} href={feedbackQueueHref({ status: value, search: data.filters.search, sort: data.filters.sort })}>{label}</a>
  {/each}
</nav>

<form class="filters" method="GET" action="/admin/feedback">
  <input type="hidden" name="status" value={data.filters.status} />
  <label>
    <span>Search</span>
    <input name="q" value={data.filters.search} placeholder="Case title or feedback text" />
  </label>
  <label>
    <span>Date submitted</span>
    <select name="sort" onchange={(event) => event.currentTarget.form?.submit()}>
      <option value="newest" selected={data.filters.sort === 'newest'}>Newest first</option>
      <option value="oldest" selected={data.filters.sort === 'oldest'}>Oldest first</option>
    </select>
  </label>
  <button class="button primary" type="submit">Search</button>
</form>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

<form id="bulk-feedback-form" method="POST" action="?/bulkDelete" onsubmit={confirmBulkDelete}>
  <input type="hidden" name="confirm" value="DELETE" />
  <input type="hidden" name="return_query" value={data.query} />
  <button class="button danger" type="submit" disabled={selected.size === 0}>Delete selected ({selected.size})</button>
</form>

{#if data.groups.length === 0}
  <section class="empty panel"><h2>No feedback in this view</h2><p class="muted">Try another status or search term.</p></section>
{:else}
  <div class="groups">
    {#each data.groups as group}
      {@const firstReport = group.reports[0]}
      <section class="group panel" aria-labelledby={'case-' + group.caseId}>
        <div class="group-heading">
          <div>
            <p class="eyebrow">{group.caseIsActive ? 'Active Case' : 'Inactive Case'}</p>
            <h2 id={'case-' + group.caseId}>{group.caseTitle}</h2>
            {#if group.caseTitleSnapshot && group.caseTitleSnapshot !== group.caseTitle}
              <p class="snapshot-note">Reported as “{group.caseTitleSnapshot}”.</p>
            {/if}
          </div>
          {#if group.caseExists}
            <a class="button" href={feedbackCaseHref({ caseId: group.caseId, feedbackId: firstReport.id, active: group.caseIsActive, returnQuery: data.query })}>{group.caseIsActive ? 'Open Case Editor' : 'Open Case recovery'}</a>
          {:else}
            <span class="muted">Case unavailable</span>
          {/if}
        </div>

        <div class="reports">
          {#each group.reports as report}
            <article class="report">
              <div class="report-meta">
                <label class="select-report">
                  <input type="checkbox" form="bulk-feedback-form" name="feedback_id" value={report.id} checked={selected.has(report.id)} onchange={(event) => toggleSelected(report.id, event.currentTarget.checked)} />
                  <span>Select</span>
                </label>
                <span class={'status-badge status-' + report.status}>{statusLabel(report.status)}</span>
                <span>{report.reporterLabel}</span>
                <time datetime={new Date(report.reportedAt).toISOString()}>{formatFeedbackDate(report.reportedAt)}</time>
              </div>
              <p class="report-body">{report.body}</p>
              <div class="report-actions">
                {#if report.status === 'open'}
                  <form method="POST" action="?/resolve">
                    <input type="hidden" name="feedback_id" value={report.id} />
                    <input type="hidden" name="return_query" value={data.query} />
                    <button class="button" type="submit">Resolve</button>
                  </form>
                  <form method="POST" action="?/dismiss">
                    <input type="hidden" name="feedback_id" value={report.id} />
                    <input type="hidden" name="return_query" value={data.query} />
                    <button class="button" type="submit">Dismiss</button>
                  </form>
                {:else}
                  <form method="POST" action="?/reopen">
                    <input type="hidden" name="feedback_id" value={report.id} />
                    <input type="hidden" name="return_query" value={data.query} />
                    <button class="button" type="submit">Reopen</button>
                  </form>
                {/if}
                <form method="POST" action="?/delete" onsubmit={confirmDelete}>
                  <input type="hidden" name="feedback_id" value={report.id} />
                  <input type="hidden" name="confirm" value="DELETE" />
                  <input type="hidden" name="return_query" value={data.query} />
                  <button class="button danger" type="submit">Delete</button>
                </form>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

<style>
  .page-heading { display:flex; align-items:end; justify-content:space-between; gap:1rem; }
  h1, h2, p { margin-top:0; } h1 { margin-bottom:.35rem; font-size:clamp(1.8rem,4vw,2.5rem); } h2 { margin-bottom:.25rem; font-size:1.2rem; }
  .eyebrow { margin:0 0 .3rem; color:#667085; font-size:.72rem; font-weight:750; letter-spacing:.08em; text-transform:uppercase; }
  .muted { color:#667085; } .count { color:#667085; font-weight:650; }
  .status-tabs { display:flex; gap:.3rem; flex-wrap:wrap; margin:1.25rem 0 1rem; }
  .status-tabs a { padding:.5rem .75rem; border-radius:999px; color:#475467; text-decoration:none; }
  .status-tabs a:hover, .status-tabs a:focus-visible, .status-tabs a.active { background:#e9eef5; color:#172033; }
  .filters { display:flex; align-items:end; gap:.75rem; flex-wrap:wrap; padding:1rem; border:1px solid #dfe5ee; border-radius:10px; background:#fff; }
  .filters label { display:grid; gap:.3rem; min-width:min(100%, 260px); } .filters label span { color:#667085; font-size:.8rem; font-weight:700; }
  input, select { min-height:2.6rem; padding:.55rem .65rem; border:1px solid #98a2b3; border-radius:7px; background:#fff; font:inherit; }
  #bulk-feedback-form { display:flex; justify-content:flex-end; margin:1rem 0; }
  .groups { display:grid; gap:1rem; } .panel { padding:1.1rem; border:1px solid #dfe5ee; border-radius:10px; background:#fff; }
  .group-heading { display:flex; align-items:end; justify-content:space-between; gap:1rem; padding-bottom:.9rem; border-bottom:1px solid #eaecf0; }
  .snapshot-note { margin:0; color:#667085; font-size:.85rem; }
  .reports { display:grid; } .report { display:grid; gap:.75rem; padding:1rem 0; border-bottom:1px solid #eaecf0; } .report:last-child { border-bottom:0; padding-bottom:0; }
  .report-meta, .report-actions { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; } .report-meta { color:#667085; font-size:.85rem; }
  .select-report { display:flex; align-items:center; gap:.35rem; color:#475467; } .select-report span { font-size:.8rem; }
  .report-body { margin:0; white-space:pre-wrap; line-height:1.55; color:#172033; }
  .status-badge { padding:.2rem .5rem; border-radius:999px; font-size:.75rem; font-weight:750; } .status-open { background:#ecfdf3; color:#027a48; } .status-resolved { background:#eff8ff; color:#175cd3; } .status-dismissed { background:#f2f4f7; color:#667085; }
  .button { display:inline-block; padding:.65rem .9rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; color:#172033; text-decoration:none; cursor:pointer; font:inherit; } .button.primary { border-color:#172033; background:#172033; color:#fff; } .button.danger { border-color:#fecdca; color:#b42318; }
  button:disabled { cursor:default; opacity:.55; } .form-error { margin:1rem 0; padding:.75rem; border-radius:8px; background:#fef3f2; color:#b42318; } .empty { margin-top:1rem; }
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline:3px solid #84adff; outline-offset:2px; }
  @media (max-width:680px) { .page-heading, .group-heading { align-items:stretch; flex-direction:column; } .group-heading .button { width:100%; text-align:center; } .filters { align-items:stretch; flex-direction:column; } .filters label { min-width:0; } .filters .button { width:100%; } }
</style>
