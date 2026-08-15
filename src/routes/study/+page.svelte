<script>
  import SignOutButton from '$lib/components/SignOutButton.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>Study | Flash-Cards</title>
</svelte:head>

<main class="shell study-shell">
  <header class="study-header">
    <div>
      <p class="eyebrow">Learner study</p>
      <h1>Choose a topic to review</h1>
      <p class="muted intro">
        Choose a topic and Flash-Cards will select a compatible case and snapshot its questions and
        teaching images for this review.
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
      <span>Connect the Cloudflare D1 binding to load the available topics.</span>
    </section>
  {/if}

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

        <form method="POST" action="?/start">
          <input type="hidden" name="conceptId" value={topic.id} />
          <button class="button primary" type="submit">Start review →</button>
        </form>
      </section>
    {/each}
  </div>
</main>

<style>
  .study-shell {
    display: grid;
    gap: 1.5rem;
  }

  .study-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
  }

  .study-header h1,
  .topic-heading h2 {
    margin: 0.2rem 0 0;
  }

  .intro {
    max-width: 680px;
    margin-bottom: 0;
    line-height: 1.6;
  }

  .eyebrow {
    margin: 0;
    color: #667085;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .account-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .demo-note {
    display: grid;
    gap: 0.3rem;
    padding: 1rem 1.1rem;
    border: 1px solid #cdd6e3;
    border-radius: 12px;
    background: #eef3f8;
    line-height: 1.5;
  }

  .topic-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .topic-card {
    display: grid;
    gap: 1.2rem;
    align-content: start;
    background: white;
    border: 1px solid #dfe5ee;
    border-radius: 14px;
    padding: 1.25rem;
  }

  .topic-heading {
    display: grid;
    gap: 0.75rem;
  }

  .topic-heading p:last-child {
    margin: 0;
    line-height: 1.5;
  }

  @media (max-width: 760px) {
    .study-header {
      display: grid;
    }

    .account-actions {
      justify-content: flex-start;
    }

    .topic-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
