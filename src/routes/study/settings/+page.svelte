<script>
  let { data, form } = $props();
</script>

<svelte:head><title>Study settings | Flash-Cards</title></svelte:head>

<main class="shell settings-shell">
  <header class="page-header"><div><p class="eyebrow">Study</p><h1>Study settings</h1><p class="muted">Preferences used when the next active Review is frozen.</p></div><a class="button" href="/study">← Back to Study</a></header>
  <section class="settings-card">
    <div><p class="eyebrow">Global learner preference</p><h2>Expanded Learning</h2><p class="muted">Default is off. The preference applies to both Scheduled and Free Study.</p></div>
    <form method="POST" action="?/preference">
      <label><input type="checkbox" name="expandedLearning" checked={data.preferences.expandedLearning} /> <strong>{data.preferences.expandedLearning ? 'Enabled' : 'Disabled'}</strong></label>
      <button class="button primary" type="submit">Save preference</button>
    </form>
  </section>
  {#if form?.message}<p class="status-message" role="status">{form.message}</p>{/if}
</main>

<style>
  .settings-shell { display:grid; gap:1.5rem; max-width:900px; }
  .page-header,.settings-card { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
  .settings-card { align-items:center; padding:1.2rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  h1,h2 { margin:.2rem 0 0; } .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  p { margin:.35rem 0 0; } form { display:flex; align-items:center; gap:.8rem; flex-wrap:wrap; } label { display:flex; align-items:center; gap:.45rem; }
  .status-message { padding:.8rem 1rem; border-radius:10px; background:#f8fafc; }
  @media (max-width:620px) { .page-header,.settings-card { display:grid; } }
</style>
