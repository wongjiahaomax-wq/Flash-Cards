<script>
  let { data } = $props();
</script>

<svelte:head><title>Progress | Study | Flash-Cards</title></svelte:head>

<main class="shell progress-shell">
  <header class="page-header">
    <div>
      <p class="eyebrow">Study</p>
      <h1>Progress</h1>
      <p class="muted">Detailed scheduling coverage, activity, ratings, and retained review history.</p>
    </div>
    <a class="button" href="/study">← Back to Study</a>
  </header>

  {#if data.blockedByDeletion}
    <section class="blocked-card" aria-live="polite">
      <h2>Progress is temporarily unavailable</h2>
      <p class="muted">Study data deletion is in progress. Detailed progress stays hidden until removal finishes.</p>
      <a class="button danger" href="/study/settings/data">Continue deletion</a>
    </section>
  {:else if data.progress}
    <section class="progress-card" aria-labelledby="learner-progress-title">
      <div class="progress-heading">
        <div>
          <p class="eyebrow">Learner Progress</p>
          <h2 id="learner-progress-title">Scheduling and activity</h2>
          <p class="muted">Coverage shows how much of your eligible content has entered Scheduled Study.</p>
        </div>
        <p class="retention-note muted">Detailed Scheduled history: {data.progress.profile?.detailedHistoryRetention ?? '24 months'}</p>
      </div>
      <div class="metrics">
        <article><span>Due now</span><strong>{data.progress.memory.due}</strong><small>scheduled Cases</small></article>
        <article><span>Scheduling coverage</span><strong>{data.progress.coverage.eligibleCases ? Math.round((data.progress.coverage.enteredSrs / data.progress.coverage.eligibleCases) * 100) : 0}%</strong><small>{data.progress.coverage.enteredSrs} / {data.progress.coverage.eligibleCases} eligible Cases</small></article>
        <article><span>Not due</span><strong>{data.progress.memory.notDue}</strong><small>scheduled Cases</small></article>
        <article><span>Scheduled activity</span><strong>{data.progress.activity.scheduledCompleted}</strong><small>{data.progress.activity.recentScheduled30d} in the last 30 days</small></article>
        <article><span>Free Study</span><strong>{data.progress.activity.freeCompleted}</strong><small>completed encounters</small></article>
      </div>
      <div class="rating-row" aria-label="Scheduled rating distribution">
        <span><strong>{data.progress.ratings.again}</strong> Again</span>
        <span><strong>{data.progress.ratings.hard}</strong> Hard</span>
        <span><strong>{data.progress.ratings.good}</strong> Good</span>
        <span><strong>{data.progress.ratings.easy}</strong> Easy</span>
      </div>
      {#if data.progress.systems.length}
        <div class="table-wrap"><table><thead><tr><th>System</th><th>Coverage</th><th>Due</th><th>Not due</th><th>Scheduled Reviews</th></tr></thead><tbody>{#each data.progress.systems as system}<tr><th>{system.systemName}</th><td>{system.enteredSrs} / {system.eligibleCases}</td><td>{system.due}</td><td>{system.notDue}</td><td>{system.scheduledCompleted}</td></tr>{/each}</tbody></table></div>
      {/if}
      <section class="history-block" aria-labelledby="history-title">
        <h2 id="history-title">Recent Scheduled activity</h2>
        {#if data.progress.recentHistory.length}
          <ol class="history-list">{#each data.progress.recentHistory as event}<li><div><strong>{event.caseTitle}</strong><span class="muted">{event.systemName} · {event.contentMode === 'expanded' ? 'Expanded' : 'Original'}</span></div><div><span class="rating">{event.rating}</span><time datetime={new Date(event.completedAt).toISOString()}>{new Date(event.completedAt).toLocaleString()}</time></div></li>{/each}</ol>
        {:else}<p class="muted">No retained Scheduled Review history yet.</p>{/if}
      </section>
    </section>
  {/if}
</main>

<style>
  .progress-shell { display:grid; gap:1.5rem; max-width:1100px; }
  .page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
  h1,h2 { margin:.2rem 0 0; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .page-header p { margin:.35rem 0 0; }
  .progress-card,.blocked-card { display:grid; gap:1.1rem; padding:1.2rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .blocked-card { border-color:#f2c7c2; background:#fff9f8; }
  .progress-heading { display:flex; justify-content:space-between; gap:1rem; align-items:start; }
  .progress-heading p { margin:.35rem 0 0; }
  .retention-note { margin:0; text-align:right; }
  .metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:.65rem; }
  .metrics article { display:grid; gap:.18rem; padding:.8rem; border-radius:10px; background:#f8fafc; }
  .metrics span,.metrics small { color:#667085; }
  .metrics strong { font-size:1.35rem; }
  .rating-row { display:flex; flex-wrap:wrap; gap:.5rem; }
  .rating-row span,.rating { padding:.38rem .58rem; border-radius:999px; background:#eef2f6; color:#475467; font-size:.85rem; }
  .table-wrap { overflow-x:auto; border:1px solid #eaecf0; border-radius:10px; }
  table { width:100%; border-collapse:collapse; min-width:640px; }
  th,td { padding:.65rem .75rem; text-align:left; border-bottom:1px solid #eaecf0; }
  .history-block { display:grid; gap:.8rem; }
  .history-list { display:grid; gap:.45rem; margin:0; padding:0; list-style:none; }
  .history-list li { display:flex; justify-content:space-between; gap:1rem; padding:.65rem .75rem; border:1px solid #eaecf0; border-radius:10px; }
  .history-list li > div { display:grid; gap:.18rem; }
  time { color:#667085; font-size:.8rem; }
  @media (max-width:900px) { .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width:620px) { .page-header,.progress-heading,.history-list li { display:grid; } .retention-note { text-align:left; } .metrics { grid-template-columns:1fr; } }
</style>
