<script>
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import { demoTopics } from '$lib/demo-content.js';

  let { data } = $props();
</script>

<svelte:head>
  <title>Study | Flash-Cards</title>
</svelte:head>

<main class="shell study-shell">
  <header class="study-header">
    <div>
      <p class="eyebrow">Learner study</p>
      <h1>Choose a case to review</h1>
      <p class="muted intro">
        This first learner demo uses cases reconstructed from the earlier Anki review so we can test
        the study experience before the database and image pipeline are fully connected.
      </p>
    </div>

    <div class="account-actions">
      <span class="muted">{data.user.email}</span>
      <a class="button" href="/">Home</a>
      <SignOutButton />
    </div>
  </header>

  <section class="demo-note" aria-label="Demo status">
    <strong>Demo content</strong>
    <span>
      ECG and clinical-photo positions are placeholders for now. The page structure is designed to
      accept the original Anki images once they are available to the app.
    </span>
  </section>

  <div class="topic-grid">
    {#each demoTopics as topic}
      <section class="topic-card">
        <div class="topic-heading">
          <div>
            <p class="eyebrow">{topic.cases.length} demo {topic.cases.length === 1 ? 'case' : 'cases'}</p>
            <h2>{topic.name}</h2>
          </div>
          <p class="muted">{topic.description}</p>
        </div>

        <div class="case-list">
          {#each topic.cases as caseItem}
            <a class="case-row" href={`/study/${caseItem.id}`}>
              <div>
                <strong>{caseItem.title}</strong>
                <span>{caseItem.summary}</span>
              </div>
              <span class="open-case" aria-hidden="true">→</span>
            </a>
          {/each}
        </div>
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

  .case-list {
    display: grid;
    border-top: 1px solid #e6eaf0;
  }

  .case-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid #e6eaf0;
    text-decoration: none;
  }

  .case-row:hover strong {
    text-decoration: underline;
  }

  .case-row div {
    display: grid;
    gap: 0.3rem;
  }

  .case-row span:not(.open-case) {
    color: #667085;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .open-case {
    flex: 0 0 auto;
    font-size: 1.25rem;
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
