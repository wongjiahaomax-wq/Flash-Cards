<script>
  // @ts-nocheck
  import { onMount } from 'svelte';
  import { deserialize } from '$app/forms';
  import { formatFeedbackDate } from '$lib/admin-feedback-state.js';

  let {
    reports = [],
    caseId,
    caseTitle,
    caseIsActive = true,
    originFeedbackId = null,
    returnQuery = '',
    onclose = () => {},
    onmutated = () => {}
  } = $props();

  let localReports = $state(reports);
  let showHistory = $state(localReports.every((report) => report.status !== 'open'));
  let drawerStyle = $state('');
  let actionError = $state('');
  let mutatingId = $state('');

  onMount(() => {
    function positionDrawer() {
      const body = document.querySelector('.admin-body');
      const content = document.querySelector('.admin-content');
      if (!body || !content) return;
      const bodyRect = body.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      if (window.innerWidth <= 720) {
        drawerStyle = 'top:' + Math.max(0, bodyRect.top) + 'px;left:0;width:100%;height:calc(100vh - ' + Math.max(0, bodyRect.top) + 'px)';
        return;
      }
      const width = Math.max(0, contentRect.left - bodyRect.left);
      drawerStyle = 'top:' + Math.max(0, bodyRect.top) + 'px;left:' + Math.max(0, bodyRect.left) + 'px;width:' + width + 'px;height:calc(100vh - ' + Math.max(0, bodyRect.top) + 'px)';
    }
    positionDrawer();
    window.addEventListener('resize', positionDrawer);
    window.addEventListener('scroll', positionDrawer, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(positionDrawer) : null;
    observer?.observe(document.querySelector('.admin-body') ?? document.body);
    return () => {
      window.removeEventListener('resize', positionDrawer);
      window.removeEventListener('scroll', positionDrawer);
      observer?.disconnect();
    };
  });

  function reportIsOrigin(report) {
    return report.id === originFeedbackId;
  }

  async function mutate(report, action) {
    if (mutatingId) return;
    mutatingId = report.id;
    actionError = '';
    const formData = new URLSearchParams();
    formData.set('feedback_id', report.id);
    formData.set('drawer', '1');
    formData.set('return_query', returnQuery);
    try {
      const response = await fetch('/admin/feedback?/' + action, {
        method: 'POST',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body: formData
      });
      const result = deserialize(await response.text());
      if (result.type === 'failure') {
        actionError = result.data?.error ?? 'Unable to update this report.';
        return;
      }
      if (result.type === 'error') {
        actionError = 'Unable to update this report.';
        return;
      }
      const updated = result.data?.report ?? null;
      if (action === 'delete') {
        localReports = localReports.filter((item) => item.id !== report.id);
        if (localReports.every((item) => item.status !== 'open')) showHistory = true;
      } else {
        localReports = localReports.map((item) => item.id === report.id ? updated : item);
      }
      onmutated(localReports);
    } catch {
      actionError = 'Unable to update this report.';
    } finally {
      mutatingId = '';
    }
  }

  function visibleReports() {
    const reportsForCase = localReports.filter((report) => report.caseId === caseId);
    return showHistory ? reportsForCase : reportsForCase.filter((report) => report.status === 'open');
  }

  function historyCount() {
    return localReports.filter((report) => report.caseId === caseId && report.status !== 'open').length;
  }
</script>

<aside class="feedback-drawer" style={drawerStyle} aria-label="Case feedback">
  <div class="drawer-header">
    <div>
      <p class="eyebrow">Feedback</p>
      <h2>{caseTitle}</h2>
      <p class="drawer-subtitle">{visibleReports().length} report{visibleReports().length === 1 ? '' : 's'} · {caseIsActive ? 'Active Case' : 'History'}</p>
      {#if historyCount() > 0}<button class="history-button" type="button" onclick={() => (showHistory = !showHistory)}>{showHistory ? 'Hide history' : 'View history'}</button>{/if}
    </div>
    <button class="close-button" type="button" aria-label="Close Feedback" onclick={onclose}>×</button>
  </div>

  {#if actionError}<p class="action-error" role="alert">{actionError}</p>{/if}

  <div class="drawer-reports">
    {#if visibleReports().length === 0}
      <p class="muted">No reports in this Case.</p>
    {:else}
      {#each visibleReports() as report}
        <article class:origin-report={reportIsOrigin(report)} class="drawer-report">
          <div class="report-meta">
            <strong>{report.reporterLabel}</strong>
            <span class={'status-badge status-' + report.status}>{report.status}</span>
            <time datetime={new Date(report.reportedAt).toISOString()}>{formatFeedbackDate(report.reportedAt)}</time>
          </div>
          <p class="report-body">{report.body}</p>
          <div class="report-actions">
            {#if report.status === 'open'}
              <button class="button" type="button" onclick={() => mutate(report, 'resolve')} disabled={mutatingId === report.id}>Resolve</button>
              <button class="button" type="button" onclick={() => mutate(report, 'dismiss')} disabled={mutatingId === report.id}>Dismiss</button>
            {:else}
              <button class="button" type="button" onclick={() => mutate(report, 'reopen')} disabled={mutatingId === report.id}>Reopen</button>
            {/if}
            <button class="button danger" type="button" onclick={() => mutate(report, 'delete')} disabled={mutatingId === report.id}>Delete</button>
          </div>
        </article>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .feedback-drawer { position:fixed; z-index:40; display:flex; flex-direction:column; overflow:hidden; border:1px solid #cdd6e3; border-top:0; background:#fff; box-shadow:12px 0 30px rgba(23,32,51,.16); }
  .drawer-header { display:flex; align-items:start; justify-content:space-between; gap:1rem; padding:1rem; border-bottom:1px solid #eaecf0; background:#f8fafc; }
  .drawer-header h2 { margin:.15rem 0 .25rem; font-size:1.05rem; line-height:1.3; } .drawer-subtitle { margin:0; color:#667085; font-size:.82rem; }
  .history-button { margin-top:.45rem; padding:0; border:0; background:transparent; color:#175cd3; cursor:pointer; font:inherit; font-size:.8rem; }
  .eyebrow { margin:0; color:#667085; font-size:.7rem; font-weight:750; letter-spacing:.08em; text-transform:uppercase; }
  .close-button { width:2rem; height:2rem; border:0; border-radius:7px; background:transparent; color:#475467; font-size:1.5rem; line-height:1; cursor:pointer; }
  .drawer-reports { overflow:auto; padding:1rem; } .drawer-report { display:grid; gap:.65rem; padding:.85rem 0; border-bottom:1px solid #eaecf0; } .drawer-report:first-child { padding-top:0; } .drawer-report:last-child { border-bottom:0; }
  .drawer-report.origin-report { margin:.2rem -.5rem; padding:.85rem .5rem; border:2px solid #84adff; border-radius:8px; }
  .report-meta, .report-actions { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; } .report-meta { color:#667085; font-size:.78rem; } .report-meta strong { color:#344054; }
  .report-body { margin:0; white-space:pre-wrap; line-height:1.5; } .status-badge { padding:.16rem .4rem; border-radius:999px; font-size:.7rem; font-weight:750; text-transform:capitalize; } .status-open { background:#ecfdf3; color:#027a48; } .status-resolved { background:#eff8ff; color:#175cd3; } .status-dismissed { background:#f2f4f7; color:#667085; }
  .button { padding:.55rem .7rem; border:1px solid #cdd6e3; border-radius:7px; background:#fff; color:#172033; cursor:pointer; font:inherit; font-size:.82rem; } .button.danger { border-color:#fecdca; color:#b42318; } button:disabled { cursor:default; opacity:.55; } .action-error { margin:1rem; color:#b42318; font-size:.85rem; }
  .muted { color:#667085; } a:focus-visible, button:focus-visible { outline:3px solid #84adff; outline-offset:2px; }
  @media (max-width:720px) { .feedback-drawer { border-right:0; border-left:0; } }
</style>
