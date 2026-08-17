<script>
  import { invalidateAll } from '$app/navigation';
  import PreviewSignOutButton from '$lib/components/PreviewSignOutButton.svelte';

  let { data, children } = $props();
  let resetting = $state(false);
  let resetError = $state('');

  async function resetWorkspace() {
    if (resetting) return;
    resetting = true;
    resetError = '';
    try {
      const response = await fetch('/preview-admin/reset', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        resetError = result.error || 'Preview cleanup failed. The workspace was kept for retry.';
        return;
      }
      await invalidateAll();
    } finally {
      resetting = false;
    }
  }
</script>

<div class="preview-shell">
  <header class="preview-banner">
    <div>
      <strong>PREVIEW MODE</strong>
      <span>Changes here are disposable and do not affect learner content.</span>
      <small>Workspace {data.workspace.id.slice(0, 8)} · expires {new Date(data.workspace.expiresAt).toLocaleString()}</small>
    </div>
    <div class="preview-controls">
      <button class="button" type="button" onclick={resetWorkspace} disabled={resetting}>
        {resetting ? 'Resetting…' : 'Reset Preview Workspace'}
      </button>
      <PreviewSignOutButton />
    </div>
  </header>

  {#if data.workspaceError || data.workspace.status === 'cleanup_required'}
    <div class="cleanup-error" role="alert">
      <strong>Preview cleanup requires attention.</strong>
      <span>{data.workspaceError || data.workspace.lastError || 'Use Reset Preview Workspace to retry cleanup before continuing.'}</span>
    </div>
  {/if}
  {#if resetError}<div class="cleanup-error" role="alert">{resetError}</div>{/if}

  <nav class="preview-nav" aria-label="Preview Admin">
    <a href="/preview-admin">Preview Cases</a>
    <span>Topics, global Questions, production Asset metadata, learner/user administration and imports are read-only/unavailable in Preview Mode.</span>
  </nav>

  <main class="preview-content">{@render children()}</main>
</div>

<style>
  .preview-shell { min-height: 100vh; background: #fffaf0; }
  .preview-banner { position: sticky; top: 0; z-index: 100; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; padding: 0.9rem 1rem; border-bottom: 3px solid #b54708; background: #fffaeb; box-shadow: 0 2px 8px rgb(0 0 0 / 8%); }
  .preview-banner > div:first-child { display: grid; gap: 0.18rem; }
  .preview-banner strong { color: #7a2e0e; font-size: 1rem; letter-spacing: 0.08em; }
  .preview-banner span { font-weight: 650; }
  .preview-banner small { color: #7a2e0e; }
  .preview-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
  .preview-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 0.75rem 1rem; border-bottom: 1px solid #fedf89; background: white; }
  .preview-nav a { font-weight: 750; }
  .preview-nav span { color: #667085; font-size: 0.88rem; }
  .preview-content { padding: 1rem; }
  .cleanup-error { margin: 1rem; padding: 0.85rem 1rem; border: 1px solid #f04438; border-radius: 8px; background: #fef3f2; color: #7a271a; display: grid; gap: 0.25rem; }
</style>
