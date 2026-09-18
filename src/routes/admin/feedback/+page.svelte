<script>
  // @ts-nocheck
  import {
    feedbackCaseHref,
    feedbackQueueHref,
    formatFeedbackDate
  } from '$lib/admin-feedback-state.js';

  let { data, form } = $props();
  let selected = $state(new Set());
  let selectedReport = $state(null);
  let reportDialog = $state();
  let reportCloseButton = $state();
  let reportTrigger = $state();

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

  function openReport(report, event) {
    selectedReport = report;
    reportTrigger = event.currentTarget;
  }

  function closeReport() {
    if (reportDialog?.open) reportDialog.close();
    selectedReport = null;
    requestAnimationFrame(() => reportTrigger?.focus());
  }

  $effect(() => {
    if (selectedReport && reportDialog && !reportDialog.open) {
      reportDialog.showModal();
      requestAnimationFrame(() => reportCloseButton?.focus());
    } else if (!selectedReport && reportDialog?.open) {
      reportDialog.close();
    }
  });

  function handleReportCancel(event) {
    event.preventDefault();
    closeReport();
  }

  function handleReportBackdrop(event) {
    if (event.target === reportDialog) closeReport();
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

<form id="bulk-feedback-form" class="bulk-toolbar" class:visible={selected.size > 0} method="POST" action="?/bulkDelete" onsubmit={confirmBulkDelete}>
  {#if selected.size > 0}
    <span>{selected.size} selected</span>
    <button class="button" type="button" onclick={() => (selected = new Set())}>Clear selection</button>
    <input type="hidden" name="confirm" value="DELETE" />
    <input type="hidden" name="return_query" value={data.query} />
    <button class="button danger" type="submit">Delete selected</button>
  {/if}
</form>

{#snippet reportRow(report)}
  <article class="report">
    <label class="select-report">
      <input type="checkbox" form="bulk-feedback-form" name="feedback_id" value={report.id} checked={selected.has(report.id)} aria-label={'Select report from ' + report.reporterLabel} onchange={(event) => toggleSelected(report.id, event.currentTarget.checked)} />
    </label>
    <button class="report-open" type="button" onclick={(event) => openReport(report, event)} aria-label={'Open feedback report from ' + report.reporterLabel}>
      <span class="report-meta">
        <span class={'status-badge status-' + report.status}>{statusLabel(report.status)}</span>
        <span class="reporter">{report.reporterLabel}</span>
        <time datetime={new Date(report.reportedAt).toISOString()}>{formatFeedbackDate(report.reportedAt)}</time>
      </span>
      <span class="report-preview">{report.body}</span>
      <span class="report-chevron" aria-hidden="true">›</span>
    </button>
  </article>
{/snippet}

{#if data.groups.length === 0}
  <section class="empty panel">
    {#if data.filters.status === 'open' && !data.filters.search}
      <h2>No open feedback</h2><p class="muted">You're up to date.</p>
    {:else}
      <h2>No matching feedback</h2><p class="muted">Try a different search or filter.</p>
      {#if data.filters.search}<a class="button" href={feedbackQueueHref({ status: data.filters.status, sort: data.filters.sort, page: data.filters.page })}>Clear search</a>{/if}
    {/if}
  </section>
{:else}
  <div class="groups">
    {#each data.groups as group}
      {@const firstReport = group.reports[0]}
      {@const openReports = group.reports.filter((report) => report.status === 'open')}
      {@const historyReports = group.reports.filter((report) => report.status !== 'open')}
      {@const activeReports = data.filters.status === 'all' ? openReports : group.reports}
      <section class="group panel" aria-labelledby={'case-' + group.caseId}>
        <div class="group-heading">
          <div>
            <p class="eyebrow">{group.caseIsActive ? 'Active Case' : 'Inactive Case'}</p>
            <h2 id={'case-' + group.caseId}>{group.caseTitle}</h2>
            {#if group.caseTitleSnapshot && group.caseTitleSnapshot !== group.caseTitle}
              <p class="snapshot-note">Reported as “{group.caseTitleSnapshot}”.</p>
            {/if}
            <p class="group-summary">{group.reports.length} report{group.reports.length === 1 ? '' : 's'}{#if openReports.length > 0} · {openReports.length} open{/if}</p>
          </div>
          {#if group.caseExists}
            <a class="button" href={feedbackCaseHref({ caseId: group.caseId, feedbackId: firstReport.id, active: group.caseIsActive, returnQuery: data.query })}>{group.caseIsActive ? 'Open Case Editor' : 'Open Case recovery'}</a>
          {:else}
            <span class="muted">Case unavailable</span>
          {/if}
        </div>

        {#if activeReports.length > 0}
          <div class="reports">
            {#each activeReports as report}
              {@render reportRow(report)}
            {/each}
          </div>
        {/if}

        {#if data.filters.status === 'all' && historyReports.length > 0}
          <details class="history-group">
            <summary>Show history ({historyReports.length})</summary>
            <div class="reports history-reports">
              {#each historyReports as report}
                {@render reportRow(report)}
              {/each}
            </div>
          </details>
        {/if}
      </section>
    {/each}
  </div>
{/if}

{#if selectedReport}
    <dialog bind:this={reportDialog} class="feedback-modal" aria-labelledby="feedback-modal-title" oncancel={handleReportCancel} onclick={handleReportBackdrop}>
      <div class="modal-heading">
        <div>
          <p class="eyebrow">Feedback report</p>
          <h2 id="feedback-modal-title">{selectedReport.currentCaseTitle || selectedReport.caseTitleSnapshot || selectedReport.caseId}</h2>
        </div>
        <button bind:this={reportCloseButton} class="close-button" type="button" aria-label="Close feedback report" onclick={closeReport}>×</button>
      </div>
      <div class="modal-meta">
        <span class={'status-badge status-' + selectedReport.status}>{statusLabel(selectedReport.status)}</span>
        <span>Reported by {selectedReport.reporterLabel}</span>
        <time datetime={new Date(selectedReport.reportedAt).toISOString()}>{formatFeedbackDate(selectedReport.reportedAt)}</time>
      </div>
      <p class="modal-body">{selectedReport.body}</p>
      {#if selectedReport.currentCaseId}
        <a class="button primary case-action" href={feedbackCaseHref({ caseId: selectedReport.caseId, feedbackId: selectedReport.id, active: selectedReport.caseIsActive, returnQuery: data.query })}>{selectedReport.caseIsActive ? 'Open Case Editor' : 'Open Case recovery'}</a>
      {/if}
      <div class="report-actions">
        <div class="workflow-actions">
          {#if selectedReport.status === 'open'}
            <form method="POST" action="?/resolve">
              <input type="hidden" name="feedback_id" value={selectedReport.id} />
              <input type="hidden" name="return_query" value={data.query} />
              <button class="button" type="submit">Resolve</button>
            </form>
            <form method="POST" action="?/dismiss">
              <input type="hidden" name="feedback_id" value={selectedReport.id} />
              <input type="hidden" name="return_query" value={data.query} />
              <button class="button" type="submit">Dismiss</button>
            </form>
          {:else}
            <form method="POST" action="?/reopen">
              <input type="hidden" name="feedback_id" value={selectedReport.id} />
              <input type="hidden" name="return_query" value={data.query} />
              <button class="button" type="submit">Reopen</button>
            </form>
          {/if}
        </div>
        <div class="destructive-actions">
          <form method="POST" action="?/delete" onsubmit={confirmDelete}>
            <input type="hidden" name="feedback_id" value={selectedReport.id} />
            <input type="hidden" name="confirm" value="DELETE" />
            <input type="hidden" name="return_query" value={data.query} />
            <button class="button danger" type="submit">Delete</button>
          </form>
        </div>
      </div>
    </dialog>
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
  .bulk-toolbar { position:sticky; top:1rem; z-index:5; display:none; align-items:center; justify-content:flex-end; gap:.75rem; margin:1rem 0; padding:.65rem .75rem; border:1px solid #cdd6e3; border-radius:10px; background:rgb(255 255 255 / 96%); box-shadow:0 8px 24px rgb(23 32 51 / 10%); backdrop-filter:blur(8px); }
  .bulk-toolbar.visible { display:flex; }
  .bulk-toolbar > span { color:#667085; font-size:.85rem; font-weight:650; }
  .groups { display:grid; gap:1rem; } .panel { padding:1.1rem; border:1px solid #dfe5ee; border-radius:10px; background:#fff; }
  .group-heading { display:flex; align-items:end; justify-content:space-between; gap:1rem; padding-bottom:.9rem; border-bottom:1px solid #eaecf0; }
  .snapshot-note, .group-summary { margin:0; color:#667085; font-size:.85rem; }
  .group-summary { margin-top:.45rem; font-size:.82rem; }
  .reports { display:grid; } .report { display:grid; grid-template-columns:auto minmax(0,1fr); gap:.45rem .75rem; padding:.85rem 0; border-bottom:1px solid #eaecf0; } .report:last-child { border-bottom:0; padding-bottom:0; }
  .select-report { grid-column:1; grid-row:1 / span 3; display:flex; align-items:flex-start; padding-top:.15rem; }
  .report-open { display:grid; grid-column:2; grid-template-columns:minmax(0,1fr) auto; gap:.35rem .75rem; width:100%; min-width:0; padding:.15rem .25rem; border:0; border-radius:7px; background:transparent; color:inherit; cursor:pointer; text-align:left; font:inherit; }
  .report-open:hover { background:#f8fafc; }
  .report-meta { grid-column:1; display:flex; min-width:0; align-items:center; gap:.6rem; flex-wrap:wrap; color:#667085; font-size:.85rem; }
  .reporter { overflow-wrap:anywhere; }
  .report-preview { grid-column:1; display:-webkit-box; overflow:hidden; margin:0; color:#172033; line-height:1.45; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
  .report-chevron { grid-column:2; grid-row:1 / span 2; align-self:center; color:#667085; font-size:1.35rem; line-height:1; }
  .report-body { margin:0; white-space:pre-wrap; line-height:1.55; color:#172033; }
  .report-actions { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; }
  .report-actions form { margin:0; }
  .history-group { margin-top:.25rem; border-top:1px solid #eaecf0; }
  .history-group > summary { padding:.85rem 0 .2rem; font-weight:650; }
  .history-reports { padding-top:.25rem; }
  .feedback-modal { width:min(100% - 2rem, 560px); max-height:calc(100vh - 2rem); overflow:auto; margin:auto; padding:1.25rem; border:1px solid #cdd6e3; border-radius:14px; background:#fff; box-shadow:0 24px 60px rgb(23 32 51 / 22%); }
  .feedback-modal::backdrop { background:rgb(23 32 51 / 35%); }
  .modal-heading { display:flex; align-items:start; justify-content:space-between; gap:1rem; }
  .modal-heading h2 { margin:.15rem 0 0; overflow-wrap:anywhere; font-size:1.15rem; }
  .close-button { width:2rem; height:2rem; padding:0; border:0; border-radius:7px; background:transparent; color:#475467; cursor:pointer; font-size:1.5rem; line-height:1; }
  .modal-meta { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-top:.9rem; color:#667085; font-size:.85rem; }
  .modal-body { margin:1rem 0; white-space:pre-wrap; line-height:1.6; }
  .case-action { margin-bottom:1rem; }
  .workflow-actions, .destructive-actions { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; }
  .destructive-actions { margin-left:auto; padding-left:.8rem; border-left:1px solid #eaecf0; }
  .status-badge { padding:.2rem .5rem; border-radius:999px; font-size:.75rem; font-weight:750; } .status-open { background:#ecfdf3; color:#027a48; } .status-resolved { background:#eff8ff; color:#175cd3; } .status-dismissed { background:#f2f4f7; color:#667085; }
  .button { display:inline-block; padding:.65rem .9rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; color:#172033; text-decoration:none; cursor:pointer; font:inherit; } .button.primary { border-color:#172033; background:#172033; color:#fff; } .button.danger { border-color:#fecdca; color:#b42318; }
  button:disabled { cursor:default; opacity:.55; } .form-error { margin:1rem 0; padding:.75rem; border-radius:8px; background:#fef3f2; color:#b42318; } .empty { margin-top:1rem; }
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline:3px solid #84adff; outline-offset:2px; }
  @media (max-width:680px) { .page-heading, .group-heading { align-items:stretch; flex-direction:column; } .group-heading .button { width:100%; text-align:center; } .filters { align-items:stretch; flex-direction:column; } .filters label { min-width:0; } .filters .button { width:100%; } }
</style>
