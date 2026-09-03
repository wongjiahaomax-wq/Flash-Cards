<script>
  let { data, form } = $props();

  /** @param {string | number | Date | null | undefined} value */
  function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en-SG', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    }).format(new Date(value));
  }

  /** @param {{ scheduledCompleted?: number | null, good?: number | null, easy?: number | null } | null | undefined} row */
  function rate(row) {
    const completed = Number(row?.scheduledCompleted ?? 0);
    if (!completed) return '—';
    return `${Math.round(((Number(row?.good ?? 0) + Number(row?.easy ?? 0)) / completed) * 100)}%`;
  }
</script>

<svelte:head>
  <title>Learner analytics | Admin | Flash-Cards</title>
</svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Learner FSRS</p>
    <h1>History and trends</h1>
    <p>
      Read-only learner history, lifetime usage, durable monthly System trends, and account-created-month cohorts.
      Monthly trends remain available after detailed Scheduled-history expiry.
    </p>
  </div>
  <a class="secondary" href="/admin/learner-retention">Retention overrides</a>
</section>

{#if form?.message}
  <p class:success={form.deleted === true} class:error={form.deleted === false && !form.deletionInProgress} class="notice">
    {form.message}
  </p>
{/if}

{#if data.learners.length === 0}
  <section class="panel"><h2>No learner accounts</h2><p>No normal learner accounts are currently available.</p></section>
{:else}
  <section class="panel">
    <h2>Learners</h2>
    <div class="learner-grid">
      {#each data.learners as learner}
        <a
          class:selected={data.selectedUserId === learner.userId}
          class="learner-card"
          href={`/admin/learner-analytics?learner=${encodeURIComponent(learner.userId)}`}
        >
          <strong>{learner.name || learner.email}</strong>
          <span>{learner.email}</span>
          <small>{learner.scheduledCompleted} Scheduled · {learner.freeCompleted} Free · {rate(learner)} Good/Easy</small>
          {#if learner.deletionPhase}<em>Deletion: {learner.deletionPhase}</em>{/if}
        </a>
      {/each}
    </div>
  </section>
{/if}

{#if data.selected}
  <section class="panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Selected learner</p>
        <h2>{data.selected.learner.name || data.selected.learner.email}</h2>
        <p>{data.selected.learner.email} · retention {data.selected.learner.detailedHistoryRetention}</p>
      </div>
      <div class="stat-strip">
        <span><strong>{data.selected.learner.scheduledCompleted}</strong> Scheduled</span>
        <span><strong>{data.selected.learner.freeCompleted}</strong> Free</span>
        <span><strong>{rate(data.selected.learner)}</strong> Good/Easy</span>
      </div>
    </div>

    <h3>Per-System lifetime totals</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>System</th><th>Completed</th><th>Again</th><th>Hard</th><th>Good</th><th>Easy</th><th>Good/Easy</th></tr></thead>
        <tbody>
          {#each data.selected.systems as row}
            <tr><td>{row.systemName}</td><td>{row.scheduledCompleted}</td><td>{row.again}</td><td>{row.hard}</td><td>{row.good}</td><td>{row.easy}</td><td>{rate(row)}</td></tr>
          {:else}
            <tr><td colspan="7">No Scheduled System activity yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h3>Per-System monthly trend</h3>
    <p class="hint">This table comes from retained learner × System × UTC-month buckets, not reconstructed lifetime totals.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Month</th><th>System</th><th>Completed</th><th>Again</th><th>Hard</th><th>Good</th><th>Easy</th></tr></thead>
        <tbody>
          {#each data.selected.monthlySystems as row}
            <tr><td>{row.month}</td><td>{row.systemName}</td><td>{row.scheduledCompleted}</td><td>{row.again}</td><td>{row.hard}</td><td>{row.good}</td><td>{row.easy}</td></tr>
          {:else}
            <tr><td colspan="7">No durable monthly Scheduled activity yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h3>Recent detailed Scheduled history</h3>
    <p class="hint">Bounded by the learner's detailed-history retention policy; newest 100 retained events are shown.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Completed</th><th>Case snapshot</th><th>Historical System</th><th>Rating</th><th>Content</th><th>Boundary</th></tr></thead>
        <tbody>
          {#each data.selected.recentHistory as row}
            <tr>
              <td>{formatDate(row.completedAt)}</td>
              <td>{row.caseTitle}</td>
              <td>{row.systemName}</td>
              <td>{row.rating}</td>
              <td>{row.contentMode}</td>
              <td>g{row.generation}/e{row.reviewSequenceEpoch}</td>
            </tr>
          {:else}
            <tr><td colspan="6">No retained detailed Scheduled history.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel danger">
    <h2>Permanent learner account deletion</h2>
    <p>
      Deletion revokes access first, then removes learner-owned FSRS/runtime rows in retry-safe bounded batches.
      Better Auth removes the identity only after the staged-data guard confirms learner rows are gone.
    </p>
    <form method="POST" action="?/deleteLearner" class="delete-form">
      <input type="hidden" name="userId" value={data.selected.learner.userId} />
      <label>
        <span>Type {data.selected.learner.email} to confirm</span>
        <input name="confirmEmail" autocomplete="off" required />
      </label>
      <button type="submit">{data.selected.learner.deletionPhase ? 'Continue deletion' : 'Delete account permanently'}</button>
    </form>
  </section>
{/if}

<section class="panel">
  <div class="section-heading">
    <div><p class="eyebrow">Durable analytics</p><h2>System monthly trend</h2></div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Month</th><th>System</th><th>Active learners</th><th>Completed</th><th>Again</th><th>Hard</th><th>Good</th><th>Easy</th></tr></thead>
      <tbody>
        {#each data.trends.systemMonthly as row}
          <tr><td>{row.month}</td><td>{row.systemName}</td><td>{row.activeLearners}</td><td>{row.scheduledCompleted}</td><td>{row.again}</td><td>{row.hard}</td><td>{row.good}</td><td>{row.easy}</td></tr>
        {:else}
          <tr><td colspan="8">No monthly System trend data yet.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<section class="panel">
  <div class="section-heading">
    <div><p class="eyebrow">Stable cohort</p><h2>Account-created-month cohort trend</h2><p>Membership key: learner account creation UTC month.</p></div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Cohort</th><th>Activity month</th><th>Active learners</th><th>Completed</th><th>Again</th><th>Hard</th><th>Good</th><th>Easy</th></tr></thead>
      <tbody>
        {#each data.trends.cohortMonthly as row}
          <tr><td>{row.cohortMonth}</td><td>{row.month}</td><td>{row.activeLearners}</td><td>{row.scheduledCompleted}</td><td>{row.again}</td><td>{row.hard}</td><td>{row.good}</td><td>{row.easy}</td></tr>
        {:else}
          <tr><td colspan="8">No cohort trend data yet.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .page-heading, .section-heading { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
  .page-heading { margin-bottom: 1.5rem; }
  .page-heading > div { max-width: 880px; }
  .eyebrow { margin: 0 0 0.35rem; color: #667085; font-size: 0.78rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  h1 { margin: 0 0 0.65rem; color: #172033; font-size: clamp(1.8rem, 3vw, 2.4rem); }
  h2 { margin: 0 0 0.4rem; color: #172033; }
  h3 { margin: 1.5rem 0 0.5rem; color: #24324d; }
  p { color: #475467; line-height: 1.5; }
  .secondary { padding: 0.6rem 0.8rem; border: 1px solid #cfd6e1; border-radius: 7px; color: #344054; text-decoration: none; background: #fff; white-space: nowrap; }
  .notice { margin: 0 0 1rem; padding: 0.8rem 1rem; border: 1px solid #d0d5dd; border-radius: 8px; background: #fff; }
  .notice.success { border-color: #a6d8b3; }
  .notice.error { border-color: #e6a7a7; }
  .panel { margin-bottom: 1rem; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .learner-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0.65rem; }
  .learner-card { display: grid; gap: 0.2rem; padding: 0.8rem; border: 1px solid #dfe5ee; border-radius: 8px; color: #344054; text-decoration: none; }
  .learner-card.selected { border-color: #667085; background: #f7f9fc; }
  .learner-card span, .learner-card small { overflow-wrap: anywhere; color: #667085; }
  .learner-card em { color: #9b2c2c; font-size: 0.8rem; }
  .stat-strip { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .stat-strip span { padding: 0.55rem 0.7rem; border-radius: 7px; background: #f5f7fa; color: #475467; }
  .stat-strip strong { color: #172033; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { padding: 0.55rem 0.6rem; border-bottom: 1px solid #eaecf0; text-align: left; vertical-align: top; }
  th { color: #475467; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
  .hint { margin: 0 0 0.5rem; font-size: 0.88rem; }
  .danger { border-color: #e9b4b4; }
  .delete-form { display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap; }
  .delete-form label { display: grid; gap: 0.35rem; min-width: min(100%, 360px); color: #344054; font-weight: 650; }
  .delete-form input { padding: 0.62rem 0.7rem; border: 1px solid #cfd6e1; border-radius: 7px; }
  .delete-form button { min-height: 40px; padding: 0.6rem 0.95rem; border: 0; border-radius: 7px; background: #9b2c2c; color: #fff; font-weight: 700; cursor: pointer; }
  @media (max-width: 760px) { .page-heading, .section-heading { display: grid; } }
</style>
