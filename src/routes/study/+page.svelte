<script>
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import SystemStudyChooser from '$lib/components/study/SystemStudyChooser.svelte';

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Study | Flash-Cards</title>
</svelte:head>

<main class="shell study-shell">
  <header class="study-header">
    <div>
      <p class="eyebrow">Learner study</p>
      <h1>{data.systemNavigationEnabled ? 'Choose a System to review' : 'Choose a topic to review'}</h1>
      <p class="muted intro">
        {#if data.systemNavigationEnabled}
          Choose a System, then narrow the study pool by unchecking Topics or curated Tags. All available study areas start selected.
        {:else}
          Choose a topic and question set. Flash-Cards will select a compatible case and snapshot its questions and teaching images for this review.
        {/if}
      </p>
    </div>

    <div class="account-actions">
      <span class="muted">{data.user.email}</span>
      <a class="button" href="/">Home</a>
      <SignOutButton />
    </div>
  </header>

  {#if !data.databaseConfigured}
    <section class="demo-note" aria-label="Database status">
      <strong>Study content is not connected</strong>
      <span>Connect the Cloudflare D1 binding to load the available study content.</span>
    </section>
  {/if}

  {#if data.systemNavigationEnabled}
    <SystemStudyChooser systems={data.systems} {form} />
  {:else}
    <div class="topic-grid">
      {#each data.concepts as topic}
        <section class="topic-card">
          <div class="topic-heading">
            <div>
              <p class="eyebrow">{topic.caseCount} {topic.caseCount === 1 ? 'case' : 'cases'}</p>
              <h2>{topic.name}</h2>
            </div>
            <p class="muted">{topic.description ?? 'Case-based medical learning.'}</p>
          </div>

          <form method="POST" action="?/start" class="start-form">
            <input type="hidden" name="conceptId" value={topic.id} />
            <fieldset class="question-set">
              <legend>Choose question set</legend>
              <label class="mode-option">
                <input type="radio" name="questionPoolMode" value="core" checked={form?.conceptId === topic.id ? form.questionPoolMode === 'core' : true} />
                <span><strong>Original questions</strong><small>Questions curated specifically for this Case.</small></span>
              </label>
              <label class="mode-option">
                <input type="radio" name="questionPoolMode" value="expanded" checked={form?.conceptId === topic.id && form.questionPoolMode === 'expanded'} />
                <span><strong>Expanded Learning</strong><small>Includes reusable questions relevant to this Case.</small></span>
              </label>
            </fieldset>

            {#if form?.message && form.conceptId === topic.id}<p class="start-error" role="alert">{form.message}</p>{/if}
            <button class="button primary" type="submit">Start review →</button>
          </form>
        </section>
      {/each}
    </div>
  {/if}
</main>

<style>
  .study-shell { display:grid; gap:1.5rem; }
  .study-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1.5rem; }
  .study-header h1,.topic-heading h2 { margin:.2rem 0 0; }
  .intro { max-width:760px; margin-bottom:0; line-height:1.6; }
  .eyebrow { margin:0; color:#667085; font-size:.78rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .account-actions { display:flex; align-items:center; justify-content:flex-end; gap:.65rem; flex-wrap:wrap; }
  .demo-note { display:grid; gap:.3rem; padding:1rem 1.1rem; border:1px solid #cdd6e3; border-radius:12px; background:#eef3f8; line-height:1.5; }
  .topic-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
  .topic-card { display:grid; gap:1.2rem; align-content:start; background:#fff; border:1px solid #dfe5ee; border-radius:14px; padding:1.25rem; }
  .topic-heading,.start-form { display:grid; gap:.75rem; }
  .topic-heading p:last-child { margin:0; line-height:1.5; }
  .question-set { display:grid; gap:.6rem; margin:0; padding:0; border:0; }
  .question-set legend { margin-bottom:.15rem; color:#344054; font-size:.88rem; font-weight:700; }
  .mode-option { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:start; gap:.65rem; padding:.75rem; border:1px solid #dfe5ee; border-radius:10px; cursor:pointer; }
  .mode-option:has(input:checked) { border-color:#98a2b3; background:#f8fafc; }
  .mode-option input { margin-top:.18rem; }
  .mode-option span { display:grid; gap:.2rem; }
  .mode-option small { color:#667085; line-height:1.4; }
  .start-error { margin:0; color:#b42318; font-size:.88rem; line-height:1.45; }
  @media (max-width:760px) { .study-header { display:grid; } .account-actions { justify-content:flex-start; } .topic-grid { grid-template-columns:1fr; } }
</style>
