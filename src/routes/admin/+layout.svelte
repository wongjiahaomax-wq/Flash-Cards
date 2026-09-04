<script>
  import SignOutButton from '$lib/components/SignOutButton.svelte';

  let { data, children } = $props();
</script>

<svelte:head>
  <title>Admin | Flash-Cards</title>
</svelte:head>

<div class="admin-frame">
  <header class="admin-header">
    <a class="admin-brand" href="/admin">Flash-Cards <span>Admin</span></a>
    <nav class="admin-header-actions" aria-label="Global navigation">
      <a href={data.learnerStudyPreviewHref ?? '/study'}>Study</a>
      <SignOutButton />
    </nav>
  </header>

  <div class="admin-body">
    <aside class="admin-sidebar" aria-label="Admin navigation">
      <a href="/admin">Dashboard</a>
      <a href="/admin/cases">Cases</a>
      <a href="/admin/questions">Questions</a>
      <a href="/admin/shared-questions">Shared Questions</a>
      <a href="/admin/images">Images</a>
      <a href="/admin/topics">Systems &amp; Topics</a>
      <a href="/admin/tags">Tags</a>
      <a href="/admin/learner-analytics">Learner analytics</a>
      <a href="/admin/learner-retention">Learner retention</a>
      <a href="/admin/import">Import package</a>
    </aside>

    <main class="admin-content">{@render children()}</main>
  </div>
</div>

<style>
  .admin-frame { min-height: 100vh; background: #f6f8fb; }
  .admin-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem max(1rem, calc((100% - 1760px) / 2)); background: #172033; color: #fff; }
  .admin-brand { color: #fff; font-size: 1.05rem; font-weight: 750; text-decoration: none; }
  .admin-brand span { color: #b8c7db; font-size: 0.85rem; font-weight: 500; }
  .admin-header-actions { display: flex; align-items: center; gap: 1rem; }
  .admin-header-actions :global(button), .admin-header-actions a { color: #fff; }
  .admin-header-actions :global(button) { padding: 0; border: 0; background: transparent; cursor: pointer; }
  .admin-body { display: grid; grid-template-columns: minmax(180px, 210px) minmax(0, 1fr); column-gap: clamp(1.5rem, 2vw, 2.5rem); width: min(1760px, calc(100% - 2rem)); margin: 0 auto; }
  .admin-sidebar { display: grid; align-content: start; gap: 0.2rem; padding: 1.5rem 1rem 3rem 0; }
  .admin-sidebar a { padding: 0.7rem 0.8rem; border-radius: 7px; color: #344054; text-decoration: none; font-weight: 650; }
  .admin-sidebar a:hover, .admin-sidebar a:focus-visible { background: #e9eef5; color: #172033; }
  .admin-content { min-width: 0; padding: 2rem 0 4rem; }
  @media (max-width: 720px) {
    .admin-body { display: block; width: min(100% - 2rem, 680px); }
    .admin-sidebar { display: flex; overflow-x: auto; gap: 0.25rem; padding: 0.75rem 0; border-bottom: 1px solid #dfe5ee; }
    .admin-sidebar a { flex: 0 0 auto; white-space: nowrap; }
    .admin-content { padding: 1.25rem 0 3rem; }
  }
</style>
