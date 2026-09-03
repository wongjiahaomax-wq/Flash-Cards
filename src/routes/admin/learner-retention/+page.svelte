<script>
  let { data, form } = $props();

  const retentionOptions = [
    { value: '24m', label: '24 months' },
    { value: '36m', label: '36 months' },
    { value: '60m', label: '60 months' },
    { value: 'indefinite', label: 'Indefinite' }
  ];
</script>

<svelte:head>
  <title>Learner retention | Admin | Flash-Cards</title>
</svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Learner FSRS</p>
    <h1>Detailed history retention</h1>
    <p>
      Scheduled Study history is retained for 24 months by default. Override an individual learner to
      36 months, 60 months, or Indefinite when required. This setting does not change current FSRS
      scheduling state or run boundaries.
    </p>
  </div>
</section>

{#if form?.message}
  <p class:success={form.saved === true} class:error={form.saved === false} class="notice">
    {form.message}
  </p>
{/if}

{#if data.learners.length === 0}
  <section class="empty-state">
    <h2>No learner accounts</h2>
    <p>No normal learner accounts are currently available for a retention override.</p>
  </section>
{:else}
  <section class="learner-list" aria-label="Learner detailed-history retention">
    {#each data.learners as learner}
      <form method="POST" class="learner-row">
        <input type="hidden" name="userId" value={learner.userId} />
        <div class="identity">
          <strong>{learner.name || learner.email}</strong>
          <span>{learner.email}</span>
          <small>
            {learner.profileInitialized
              ? 'FSRS profile initialized'
              : 'No FSRS profile yet — saving an override creates the canonical initial profile'}
          </small>
        </div>

        <label>
          <span>Detailed history</span>
          <select
            name="retention"
            aria-label={`Detailed history retention for ${learner.email}`}
          >
            {#each retentionOptions as option}
              <option
                value={option.value}
                selected={learner.detailedHistoryRetention === option.value}
              >{option.label}</option>
            {/each}
          </select>
        </label>

        <button type="submit">Save</button>
      </form>
    {/each}
  </section>
{/if}

<style>
  .page-heading { display: flex; justify-content: space-between; gap: 2rem; margin-bottom: 1.5rem; }
  .page-heading > div { max-width: 800px; }
  .eyebrow { margin: 0 0 0.35rem; color: #667085; font-size: 0.78rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  h1 { margin: 0 0 0.65rem; color: #172033; font-size: clamp(1.8rem, 3vw, 2.4rem); }
  .page-heading p:last-child { margin: 0; color: #475467; line-height: 1.55; }
  .notice { margin: 0 0 1rem; padding: 0.8rem 1rem; border: 1px solid #d0d5dd; border-radius: 8px; background: #fff; }
  .notice.success { border-color: #a6d8b3; }
  .notice.error { border-color: #e6a7a7; }
  .learner-list { display: grid; gap: 0.75rem; }
  .learner-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, 240px) auto; gap: 1rem; align-items: end; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .identity { display: grid; gap: 0.2rem; min-width: 0; }
  .identity strong { color: #172033; }
  .identity span { color: #475467; overflow-wrap: anywhere; }
  .identity small { color: #667085; line-height: 1.35; }
  label { display: grid; gap: 0.35rem; color: #344054; font-size: 0.88rem; font-weight: 650; }
  select { width: 100%; padding: 0.62rem 0.7rem; border: 1px solid #cfd6e1; border-radius: 7px; background: #fff; color: #172033; }
  button { min-height: 40px; padding: 0.6rem 0.95rem; border: 0; border-radius: 7px; background: #172033; color: #fff; font-weight: 700; cursor: pointer; }
  button:hover, button:focus-visible { background: #24324d; }
  .empty-state { padding: 1.25rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .empty-state h2 { margin: 0 0 0.35rem; }
  .empty-state p { margin: 0; color: #667085; }
  @media (max-width: 820px) {
    .learner-row { grid-template-columns: 1fr; align-items: stretch; }
    button { justify-self: start; }
  }
</style>
