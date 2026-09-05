<script>
  let { data, form } = $props();
</script>

<svelte:head>
  <title>My study data | Admin | Flash-Cards</title>
</svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Administrator maintenance</p>
    <h1>My study data</h1>
    <p>
      Clear study data belonging only to this administrator account. Your administrator account, role,
      login, preferences, and Flash-Cards content are not affected.
    </p>
  </div>
</section>

{#if form?.message}
  <p class:success={form.studyDataDeleted === true} class:error={form.studyDataDeleted !== true} class="notice">
    {form.message}
  </p>
{/if}

{#if data.deletion?.inProgress}
  <section class="panel pending" aria-labelledby="study-data-deletion-progress-title">
    <p class="eyebrow">Deletion in progress</p>
    <h2 id="study-data-deletion-progress-title">Your study data is being removed</h2>
    <p>
      Cleanup is proceeding in safe, bounded steps. Your account and role remain available, but Study is
      temporarily blocked until the final empty-state check completes.
    </p>
    <form method="POST" action="?/continueStudyDataDeletion">
      <button type="submit">Continue deletion</button>
    </form>
  </section>
{:else}
  <section class="panel danger" aria-labelledby="study-data-deletion-title">
    <h2 id="study-data-deletion-title">Clear my study data</h2>
    <p>
      Use this if this administrator account has been used on the real study surface for testing. This
      permanently removes your study progress, Reviews, history, and learning analytics. It does not
      remove your administrator account or change your role. This cannot be undone.
    </p>
    <form method="POST" action="?/deleteStudyData" class="delete-form">
      <label for="study-data-deletion-confirmation">
        Type <strong>DELETE MY STUDY DATA</strong> to confirm
      </label>
      <input
        id="study-data-deletion-confirmation"
        name="confirmation"
        type="text"
        autocomplete="off"
        required
      />
      <button type="submit">Clear my study data</button>
    </form>
  </section>
{/if}

<style>
  .page-heading { margin-bottom: 1.5rem; }
  .page-heading > div { max-width: 800px; }
  .eyebrow { margin: 0 0 0.35rem; color: #667085; font-size: 0.78rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  h1 { margin: 0 0 0.65rem; color: #172033; font-size: clamp(1.8rem, 3vw, 2.4rem); }
  h2 { margin: 0 0 0.4rem; color: #172033; }
  p { color: #475467; line-height: 1.55; }
  .page-heading p:last-child { margin: 0; }
  .notice { margin: 0 0 1rem; padding: 0.8rem 1rem; border: 1px solid #d0d5dd; border-radius: 8px; background: #fff; }
  .notice.success { border-color: #a6d8b3; }
  .notice.error { border-color: #e6a7a7; }
  .panel { padding: 1.25rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .panel p { max-width: 760px; }
  .danger { border-color: #e9b4b4; }
  .pending { border-color: #e6c98c; background: #fffdf7; }
  .delete-form { display: grid; grid-template-columns: minmax(0, 360px) auto; gap: 0.65rem 0.75rem; align-items: end; max-width: 700px; }
  .delete-form label { grid-column: 1 / -1; color: #344054; font-weight: 650; }
  .delete-form input { min-width: 0; padding: 0.62rem 0.7rem; border: 1px solid #cfd6e1; border-radius: 7px; }
  button { min-height: 40px; padding: 0.6rem 0.95rem; border: 0; border-radius: 7px; background: #9b2c2c; color: #fff; font-weight: 700; cursor: pointer; }
  button:hover, button:focus-visible { background: #7f2525; }
  .pending button { background: #172033; }
  .pending button:hover, .pending button:focus-visible { background: #24324d; }
  @media (max-width: 620px) {
    .delete-form { grid-template-columns: 1fr; }
    .delete-form button { justify-self: start; }
  }
</style>
