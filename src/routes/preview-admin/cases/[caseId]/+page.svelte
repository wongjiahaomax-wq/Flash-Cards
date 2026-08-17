<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import AdminCaseEditor from '../../../admin/cases/[caseId]/+page.svelte';

  let { data, form } = $props();
  let navigationNotice = $state('');

  onMount(() => {
    const reusable = document.querySelectorAll('input[name="reusable_for_topic"]');
    for (const input of reusable) {
      input.checked = false;
      input.disabled = true;
      input.closest('label')?.setAttribute('title', 'Topic-level sharing is unavailable in Preview Mode.');
    }
  });

  /** @param {MouseEvent} event */
  async function guardNavigation(event) {
    const target = event.target instanceof Element ? event.target.closest('a') : null;
    if (!(target instanceof HTMLAnchorElement)) return;
    const url = new URL(target.href, window.location.href);
    if (url.origin !== window.location.origin) return;

    if (url.pathname === '/admin/cases') {
      event.preventDefault();
      await goto('/preview-admin');
      return;
    }

    if (url.pathname.startsWith('/admin/') || url.pathname === '/admin' || url.pathname.startsWith('/study')) {
      event.preventDefault();
      navigationNotice = url.pathname.startsWith('/study')
        ? 'Learner Study does not accept Preview Cases. Use this editor to inspect the disposable Case graph.'
        : 'Global production Admin pages are intentionally unavailable from Preview Mode.';
    }
  }
</script>

<svelte:head><title>{data.selectedCase?.case.title ?? 'Preview Case'} | Preview Admin | Flash-Cards</title></svelte:head>

<section class="preview-copy-notice">
  <div>
    <strong>Preview copy</strong>
    <span>The production source Case is untouched. Only records owned by this Preview workspace can be changed.</span>
  </div>
  <a class="button" href="/preview-admin">Back to Preview Cases</a>
</section>

{#if navigationNotice}<p class="navigation-notice" role="status">{navigationNotice}</p>{/if}
{#if data.workspaceBlocked}
  <p class="navigation-notice error" role="alert">This workspace is blocked pending cleanup. Use the Preview banner reset control before editing.</p>
{:else}
  <div class="preview-editor" onclick={guardNavigation}>
    <AdminCaseEditor {data} {form} />
  </div>
{/if}

<style>
  .preview-copy-notice { max-width: 1200px; margin: 0 auto 1rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.85rem 1rem; border: 2px solid #f79009; border-radius: 10px; background: #fff7ed; }
  .preview-copy-notice > div { display: grid; gap: 0.2rem; }
  .preview-copy-notice strong { color: #7a2e0e; text-transform: uppercase; letter-spacing: 0.06em; }
  .navigation-notice { max-width: 1200px; margin: 0 auto 1rem; padding: 0.75rem 1rem; border: 1px solid #fdb022; border-radius: 8px; background: #fffaeb; color: #7a2e0e; }
  .navigation-notice.error { border-color: #f04438; background: #fef3f2; color: #7a271a; }
  .preview-editor { max-width: 1200px; margin: 0 auto; }
  .preview-editor :global(input[name="reusable_for_topic"]) { cursor: not-allowed; }
</style>
