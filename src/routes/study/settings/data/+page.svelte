<script>
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';

  import { clearLearnerStudyRun } from '$lib/learner-study-run-storage.js';

  let { data, form } = $props();
  let message = $state('');

  onMount(() => {
    if (form?.browserRunInvalidated) {
      clearLearnerStudyRun(localStorage);
      message = form.message ?? 'Your browser Study run was cleared.';
    }
  });

  /** @type {NonNullable<Parameters<typeof enhance>[1]>} */
  const handleAction = () => async ({ result, update }) => {
    if (result.type === 'success' && result.data?.browserRunInvalidated) {
      clearLearnerStudyRun(localStorage);
      message = String(result.data.message ?? 'Your browser Study run was cleared.');
    }
    await update({ invalidateAll: true });
  };
</script>

<svelte:head><title>Study data | Flash-Cards</title></svelte:head>

<main class="shell data-shell">
  <header class="page-header"><div><p class="eyebrow">Study</p><h1>Manage Study data</h1><p class="muted">Reset or remove learner study state. These actions are deliberately fenced and invalidate the browser-owned run when successful.</p></div><div class="page-actions"><a class="button" href="/study/settings">Study settings</a><a class="button" href="/study">← Back to Study</a></div></header>

  {#if data.studyDataDeletion?.inProgress || form?.deletionInProgress}
    <section class="deletion-card" aria-live="polite">
      <h2>Deletion in progress</h2>
      <p class="muted">Study remains blocked until the bounded deletion process verifies an empty state.</p>
      <form method="POST" action="?/continueStudyDataDeletion" use:enhance={handleAction}>
        <button class="button danger" type="submit">Continue deletion</button>
      </form>
    </section>
  {:else}
    <section class="settings-card">
      <div><p class="eyebrow">Reset Progress</p><h2>Start scheduling over</h2><p class="muted">Every Case becomes New to scheduling again. Retained history and current FSRS parameters remain.</p></div>
      <form method="POST" action="?/resetProgress" use:enhance={handleAction} onsubmit={(event) => { if (!window.confirm('Reset Progress? Every Case will become New to scheduling again.')) event.preventDefault(); }}>
        <input type="hidden" name="confirmation" value="reset-progress" />
        <button class="button" type="submit">Reset Progress</button>
      </form>
    </section>
    <section class="settings-card">
      <div><p class="eyebrow">Fresh FSRS Start</p><h2>Reset scheduling and parameters</h2><p class="muted">Starts a new FSRS generation with default 90% desired retention. Historical activity remains.</p></div>
      <form method="POST" action="?/freshFsrsStart" use:enhance={handleAction} onsubmit={(event) => { if (!window.confirm('Fresh FSRS Start? Scheduling state and personalized parameters will reset.')) event.preventDefault(); }}>
        <input type="hidden" name="confirmation" value="fresh-fsrs-start" />
        <button class="button danger" type="submit">Fresh FSRS Start</button>
      </form>
    </section>
    <section class="deletion-card">
      <div><p class="eyebrow">Permanent deletion</p><h2>Delete all my study data</h2><p class="muted">Removes completed Reviews, ratings, FSRS scheduling state, Free Study history, and associated learning analytics. Your account and preferences remain active. This cannot be undone.</p></div>
      <form method="POST" action="?/deleteStudyData" use:enhance={handleAction} onsubmit={(event) => { if (!window.confirm('Delete all study data? This cannot be undone.')) event.preventDefault(); }}>
        <label for="study-data-deletion-confirmation">Type <strong>DELETE MY STUDY DATA</strong> to confirm</label>
        <input id="study-data-deletion-confirmation" name="confirmation" type="text" required autocomplete="off" spellcheck="false" placeholder="DELETE MY STUDY DATA" />
        <button class="button danger" type="submit">Delete my study data</button>
      </form>
    </section>
  {/if}

  {#if message || form?.message}<p class="status-message" role="status">{message || form?.message}</p>{/if}
</main>

<style>
  .data-shell { display:grid; gap:1rem; max-width:1000px; }
  .page-header,.settings-card { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
  .page-actions { display:flex; gap:.55rem; flex-wrap:wrap; justify-content:flex-end; }
  .page-header { margin-bottom:.5rem; } h1,h2 { margin:.2rem 0 0; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  p { margin:.35rem 0 0; line-height:1.5; }
  .settings-card,.deletion-card { padding:1.2rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .deletion-card { display:flex; justify-content:space-between; gap:1rem; border-color:#f2c7c2; background:#fff9f8; }
  .deletion-card > div { max-width:650px; } form { display:grid; gap:.5rem; min-width:260px; align-self:center; } label { color:#344054; font-size:.85rem; }
  input { min-width:0; padding:.62rem .7rem; border:1px solid #d0d5dd; border-radius:8px; font:inherit; }
  .status-message { padding:.8rem 1rem; border-radius:10px; background:#f8fafc; } .danger { border-color:#d92d20; color:#b42318; }
  @media (max-width:700px) { .page-header,.settings-card,.deletion-card { display:grid; } form { min-width:0; } }
</style>
