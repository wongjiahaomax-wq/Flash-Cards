<script>
  import { goto } from '$app/navigation';
  import { authClient } from '$lib/auth-client.js';

  let working = $state(false);
  let errorMessage = $state('');

  async function resetAndSignOut() {
    if (working) return;
    working = true;
    errorMessage = '';
    try {
      const response = await fetch('/preview-admin/reset', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        errorMessage = result.error || 'Preview cleanup failed. The workspace was kept for retry.';
        return;
      }
      const { error } = await authClient.signOut();
      if (error) {
        errorMessage = error.message || 'The workspace was reset, but sign out failed.';
        return;
      }
      await goto('/sign-in');
    } finally {
      working = false;
    }
  }
</script>

<div class="preview-signout">
  <button class="button danger" type="button" onclick={resetAndSignOut} disabled={working}>
    {working ? 'Resetting…' : 'Reset & Sign Out'}
  </button>
  {#if errorMessage}<span class="error" role="alert">{errorMessage}</span>{/if}
</div>

<style>
  .preview-signout { display: flex; flex-wrap: wrap; align-items: center; gap: 0.65rem; }
  .error { max-width: 38rem; color: #7a271a; font-size: 0.85rem; font-weight: 650; }
</style>
