<script>
  let { progress } = $props();

  /** @param {number} part @param {number} whole */
  function percent(part, whole) {
    if (!whole) return 0;
    return Math.round((Number(part) / Number(whole)) * 100);
  }

  /** @param {number|string|null|undefined} value */
  function formatDate(value) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : 'Unknown time';
  }

  /** @param {unknown} value */
  function ratingLabel(value) {
    const text = String(value ?? '');
    return text ? `${text[0].toUpperCase()}${text.slice(1)}` : 'Unknown';
  }

  /** @param {unknown} value */
  function retentionLabel(value) {
    if (value === '36m') return '36 months';
    if (value === '60m') return '60 months';
    if (value === 'indefinite') return 'Indefinite';
    return '24 months';
  }

  /** @param {SubmitEvent} event @param {string} message */
  function confirmBoundaryChange(event, message) {
    if (!window.confirm(message)) event.preventDefault();
  }
</script>

<section class="progress-card" aria-labelledby="learner-progress-title">
  <div class="progress-heading">
    <div>
      <p class="eyebrow">Learner Progress</p>
      <h2 id="learner-progress-title">Scheduling and activity</h2>
      <p class="muted">Coverage is separate from memory status. Raw FSRS stability and difficulty are not shown.</p>
    </div>
    <p class="retention-note muted">
      Detailed Scheduled history: {retentionLabel(progress.profile?.detailedHistoryRetention)}
    </p>
  </div>

  <div class="progress-metrics">
    <article>
      <span>Due now</span>
      <strong>{progress.memory.due}</strong>
      <small>scheduled Cases</small>
    </article>
    <article>
      <span>SRS coverage</span>
      <strong>{percent(progress.coverage.enteredSrs, progress.coverage.eligibleCases)}%</strong>
      <small>{progress.coverage.enteredSrs} / {progress.coverage.eligibleCases} eligible Cases</small>
    </article>
    <article>
      <span>Not due</span>
      <strong>{progress.memory.notDue}</strong>
      <small>scheduled Cases</small>
    </article>
    <article>
      <span>Scheduled activity</span>
      <strong>{progress.activity.scheduledCompleted}</strong>
      <small>{progress.activity.recentScheduled30d} in the last 30 days</small>
    </article>
    <article>
      <span>Free Study</span>
      <strong>{progress.activity.freeCompleted}</strong>
      <small>completed encounters</small>
    </article>
  </div>

  <div class="rating-row" aria-label="Scheduled rating distribution">
    <span><strong>{progress.ratings.again}</strong> Again</span>
    <span><strong>{progress.ratings.hard}</strong> Hard</span>
    <span><strong>{progress.ratings.good}</strong> Good</span>
    <span><strong>{progress.ratings.easy}</strong> Easy</span>
  </div>

  {#if progress.systems.length}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>System</th>
            <th>Coverage</th>
            <th>Due</th>
            <th>Not due</th>
            <th>Scheduled Reviews</th>
          </tr>
        </thead>
        <tbody>
          {#each progress.systems as system}
            <tr>
              <th>{system.systemName}</th>
              <td>{system.enteredSrs} / {system.eligibleCases}</td>
              <td>{system.due}</td>
              <td>{system.notDue}</td>
              <td>{system.scheduledCompleted}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="history-and-reset">
    <div class="history-block">
      <h3>Recent Scheduled activity</h3>
      {#if progress.recentHistory.length}
        <ol class="history-list">
          {#each progress.recentHistory as event}
            <li>
              <div>
                <strong>{event.caseTitle}</strong>
                <span class="muted">{event.systemName} · {event.contentMode === 'expanded' ? 'Expanded' : 'Original'}</span>
              </div>
              <div class="history-meta">
                <span class="rating">{ratingLabel(event.rating)}</span>
                <time datetime={new Date(event.completedAt).toISOString()}>{formatDate(event.completedAt)}</time>
              </div>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="muted">No retained Scheduled Review history yet.</p>
      {/if}
    </div>

    <aside class="reset-block" aria-label="Reset learner progress">
      <div>
        <p class="eyebrow">Reset options</p>
        <h3>Start scheduling over</h3>
        <p class="muted">
          Both options clear current Case scheduling state and any active Review. Historical Scheduled activity and Free Study encounter state are retained.
        </p>
      </div>

      <form
        method="POST"
        action="?/resetProgress"
        onsubmit={(event) => confirmBoundaryChange(
          event,
          'Reset Progress? Every Case will become New to scheduling again. Retained history and your current FSRS parameters will be kept.'
        )}
      >
        <input type="hidden" name="confirmation" value="reset-progress" />
        <button class="button" type="submit">Reset Progress</button>
        <small>Keeps the current FSRS generation and parameters; starts a new review-sequence epoch.</small>
      </form>

      <form
        method="POST"
        action="?/freshFsrsStart"
        onsubmit={(event) => confirmBoundaryChange(
          event,
          'Fresh FSRS Start? Every Case will become New and your FSRS parameters will return to the default 90% desired retention.'
        )}
      >
        <input type="hidden" name="confirmation" value="fresh-fsrs-start" />
        <button class="button danger" type="submit">Fresh FSRS Start</button>
        <small>Starts a new FSRS generation and review-sequence epoch with default parameters.</small>
      </form>
    </aside>
  </div>
</section>

<style>
  .progress-card { display:grid; gap:1.1rem; padding:1.2rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .progress-heading { display:flex; justify-content:space-between; gap:1rem; align-items:start; }
  .progress-heading h2,.reset-block h3,.history-block h3 { margin:.2rem 0 0; }
  .progress-heading p,.reset-block p { margin:.35rem 0 0; line-height:1.5; }
  .retention-note { margin:0; text-align:right; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .progress-metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:.65rem; }
  .progress-metrics article { display:grid; gap:.18rem; padding:.8rem; border-radius:10px; background:#f8fafc; }
  .progress-metrics span,.progress-metrics small { color:#667085; }
  .progress-metrics strong { font-size:1.35rem; }
  .progress-metrics small { line-height:1.35; }
  .rating-row { display:flex; flex-wrap:wrap; gap:.5rem; }
  .rating-row span,.rating { padding:.38rem .58rem; border-radius:999px; background:#eef2f6; color:#475467; font-size:.85rem; }
  .table-wrap { overflow-x:auto; border:1px solid #eaecf0; border-radius:10px; }
  table { width:100%; border-collapse:collapse; min-width:640px; }
  th,td { padding:.65rem .75rem; text-align:left; border-bottom:1px solid #eaecf0; }
  thead th { color:#475467; font-size:.8rem; text-transform:uppercase; letter-spacing:.04em; }
  tbody tr:last-child th,tbody tr:last-child td { border-bottom:0; }
  .history-and-reset { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr); gap:1rem; align-items:start; }
  .history-block,.reset-block { display:grid; gap:.8rem; }
  .history-list { display:grid; gap:.45rem; margin:0; padding:0; list-style:none; }
  .history-list li { display:flex; justify-content:space-between; gap:1rem; padding:.65rem .75rem; border:1px solid #eaecf0; border-radius:10px; }
  .history-list li > div { display:grid; gap:.18rem; }
  .history-meta { justify-items:end; align-content:start; }
  .history-meta time { color:#667085; font-size:.8rem; }
  .reset-block { padding:.9rem; border:1px solid #f2c7c2; border-radius:10px; background:#fff9f8; }
  .reset-block form { display:grid; gap:.35rem; }
  .reset-block small { color:#667085; line-height:1.4; }
  .danger { border-color:#d92d20; color:#b42318; }
  @media (max-width:900px) {
    .progress-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .history-and-reset { grid-template-columns:1fr; }
  }
  @media (max-width:620px) {
    .progress-heading,.history-list li { display:grid; }
    .retention-note { text-align:left; }
    .progress-metrics { grid-template-columns:1fr; }
    .history-meta { justify-items:start; }
  }
</style>
