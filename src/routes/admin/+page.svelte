<script>
  let { data } = $props();
</script>

<svelte:head>
  <title>Admin dashboard | Flash-Cards</title>
</svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Content management</p>
    <h1>Dashboard</h1>
    <p class="muted">Welcome back, {data.user.email}. Choose a content library to continue.</p>
  </div>
  <a class="button primary" href="/admin/cases/new">New Case</a>
</section>

<section class="stat-grid" aria-label="Content totals">
  <a class="stat-card" href="/admin/cases"><span>Cases</span><strong>{data.caseCount ?? 0}</strong></a>
  <a class="stat-card" href="/admin#questions"><span>Questions</span><strong>{data.questionCount ?? 0}</strong></a>
  <a class="stat-card" href="/admin#images"><span>Images</span><strong>{data.assetCount ?? 0}</strong></a>
  <a class="stat-card" href="/admin#topics"><span>Topics</span><strong>{data.topicCount ?? 0}</strong></a>
</section>

<section class="dashboard-grid">
  <article class="panel">
    <div class="panel-heading"><div><p class="eyebrow">Work queue</p><h2>Cases</h2></div><a href="/admin/cases">View all</a></div>
    {#if data.dashboardCases.length === 0}
      <p class="muted">No active Cases yet.</p>
    {:else}
      <div class="case-list">
        {#each data.dashboardCases as item}
          <a class="case-row" href={`/admin/cases/${item.id}`}><span><strong>{item.title}</strong><small>{item.conceptName ?? 'No topic'}</small></span><span aria-hidden="true">→</span></a>
        {/each}
      </div>
    {/if}
  </article>

  <article class="panel">
    <p class="eyebrow">Shortcuts</p>
    <h2>Keep building</h2>
    <div class="shortcut-list">
      <a class="shortcut" href="/admin/cases/new"><strong>Create a Case</strong><span>Set a title, topic, and learner vignette.</span></a>
      <a class="shortcut" href="/admin/cases"><strong>Open the Cases library</strong><span>Find and edit existing learning content.</span></a>
      <a class="shortcut" href="/study"><strong>Preview learner study</strong><span>Check active content in the study flow.</span></a>
    </div>
  </article>
</section>

<style>
  .page-heading, .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1, h2, p { margin-top: 0; }
  h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); }
  h2 { margin-bottom: 0.8rem; font-size: 1.15rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.8rem; margin: 1.5rem 0; }
  .stat-card, .panel { border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .stat-card { display: grid; gap: 0.4rem; padding: 1rem; color: #344054; text-decoration: none; }
  .stat-card:hover, .case-row:hover, .shortcut:hover { border-color: #98a2b3; }
  .stat-card strong { color: #172033; font-size: 1.8rem; }
  .dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr); gap: 1rem; }
  .panel { padding: 1.1rem; }
  .panel-heading a { color: #344054; font-size: 0.9rem; font-weight: 650; }
  .case-list, .shortcut-list { display: grid; gap: 0.5rem; }
  .case-row, .shortcut { display: flex; justify-content: space-between; gap: 1rem; padding: 0.8rem; border: 1px solid #eaecf0; border-radius: 8px; color: #172033; text-decoration: none; }
  .case-row span:first-child, .shortcut { display: grid; gap: 0.2rem; }
  .case-row small, .shortcut span { color: #667085; }
  @media (max-width: 720px) { .page-heading { align-items: start; flex-direction: column; } .stat-grid, .dashboard-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 460px) { .stat-grid, .dashboard-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
