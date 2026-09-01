<script>
  let { data, form } = $props();

  let caseStudy = $derived(data.caseStudy);
</script>

<svelte:head>
  <title>{caseStudy.title} | Flash-Cards</title>
</svelte:head>

<main class="shell review-shell">
  <nav class="review-nav" aria-label="Study navigation">
    <a href={caseStudy.backHref}>← {caseStudy.backLabel}</a>
    {#if caseStudy.adminStudyPreview}
      <span class="preview-badge">Admin learner preview</span>
    {:else}
      <span class="muted">Saved review</span>
    {/if}
  </nav>

  <header class="case-header">
    <div class="case-meta">
      <span>{caseStudy.concept}</span>
      <span class="question-set-badge">{caseStudy.questionSet.label}</span>
    </div>
    <h1>{caseStudy.title}</h1>
    <p class="question-set-description">{caseStudy.questionSet.description}</p>
    {#if caseStudy.vignette}<p>{caseStudy.vignette}</p>{/if}
  </header>

  <section class="review-section" aria-labelledby="assets-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Clinical stimulus</p>
        <h2 id="assets-heading">{caseStudy.assets.length === 1 ? 'Image' : 'Images'}</h2>
      </div>
      {#if caseStudy.assets.length > 1}
        <span class="asset-count">{caseStudy.assets.length} images shown together</span>
      {/if}
    </div>

    <div class:singleAsset={caseStudy.assets.length === 1} class="asset-grid">
      {#each caseStudy.assets as asset}
        <figure class="asset-placeholder">
          <div class="asset-stage">
            <img src={asset.imageUrl} alt={asset.altText ?? asset.caption ?? 'Teaching image'} />
          </div>
          {#if asset.caption}<figcaption>{asset.caption}</figcaption>{/if}
          {#if asset.sourceLabel}
            {#if asset.sourceUrl}
              <a class="asset-source" href={asset.sourceUrl} target="_blank" rel="noreferrer">Source: {asset.sourceLabel} ↗</a>
            {:else}
              <span class="asset-source">Source: {asset.sourceLabel}</span>
            {/if}
          {/if}
        </figure>
      {/each}
    </div>
  </section>

  <section class="review-section" aria-labelledby="questions-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Question set</p>
        <h2 id="questions-heading">Questions</h2>
      </div>
      <span class="muted">All parts remain visible together</span>
    </div>

    <div class="question-list">
      {#each caseStudy.questions as question, index}
        <article class="question-card">
          <div class="question-number">{index + 1}</div>
          <div class="question-content">
            <h3>{question.prompt}</h3>
            {#if caseStudy.revealed}
              <div class="answer-block">
                <p class="answer-label">Answer</p>
                <p>{question.answer}</p>
                <span>{question.scope}</span>
              </div>
            {:else}
              <p class="muted think-prompt">Think through your answer before revealing.</p>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  </section>

  <section class="review-actions" aria-live="polite">
    {#if !caseStudy.revealed}
      <div>
        <strong>Ready to check?</strong>
        <p class="muted">Reveal all answers when you have considered every question.</p>
      </div>
      <form method="POST" action="?/reveal">
        <button class="button primary action-button" type="submit">
        Reveal answers
        </button>
      </form>
    {:else if caseStudy.rating === null}
      <div>
        <strong>How did you do overall?</strong>
        <p class="muted">For V1, the rating applies to the whole case rather than each question.</p>
      </div>
      <div class="rating-buttons">
        <form method="POST" action="?/rate">
          <input type="hidden" name="rating" value="again" />
          <button class="button rating-button" type="submit">Again</button>
        </form>
        <form method="POST" action="?/rate">
          <input type="hidden" name="rating" value="good" />
          <button class="button primary rating-button" type="submit">Good</button>
        </form>
      </div>
    {:else}
      <div>
        <strong>Rated: {caseStudy.rating === 'again' ? 'Again' : 'Good'}</strong>
        <p class="muted">Your review and rating are saved.</p>
        {#if form?.message}<p class="action-error" role="alert">{form.message}</p>{/if}
      </div>
      <div class="completion-buttons">
        {#if caseStudy.questionPoolMode === 'core'}
          <form method="POST" action="?/continueExpanded">
            <button class="button action-button" type="submit">Continue with Expanded Learning</button>
          </form>
        {/if}
        {#if caseStudy.nextCaseAvailable}
          <form method="POST" action="?/next" class="next-case-form">
            <span class="next-case-prompt">Choose the question set for your next case</span>
            <div class="next-case-buttons">
              <button class="button primary action-button" type="submit" name="questionPoolMode" value="core">
                Next case — Original questions →
              </button>
              <button class="button action-button" type="submit" name="questionPoolMode" value="expanded">
                Next case — Expanded Learning →
              </button>
            </div>
          </form>
        {:else}
          <div class="next-case-form">
            <span class="next-case-prompt">System study navigation is currently unavailable.</span>
            <a class="button action-button" href={caseStudy.backHref}>
              {caseStudy.adminStudyPreview ? 'Return to Admin learner preview' : 'Return to Study to choose a Topic'}
            </a>
          </div>
        {/if}
      </div>
    {/if}
  </section>
</main>

<style>
  .review-shell {
    display: grid;
    gap: 1.5rem;
    max-width: 920px;
  }

  .review-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
  }

  .review-nav a {
    text-decoration: none;
  }

  .review-nav a:hover {
    text-decoration: underline;
  }

  .preview-badge {
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    background: #eef3f8;
    color: #344054;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .case-header {
    display: grid;
    gap: 0.75rem;
    padding-bottom: 0.5rem;
  }

  .case-header h1,
  .case-header p {
    margin: 0;
  }

  .case-header h1 {
    font-size: clamp(1.8rem, 4vw, 2.5rem);
    line-height: 1.12;
  }

  .case-header > p {
    max-width: 760px;
    color: #475467;
    line-height: 1.65;
  }

  .case-header .question-set-description {
    color: #667085;
    font-size: 0.9rem;
  }

  .case-meta {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
    color: #667085;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .question-set-badge {
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    background: #eef2f6;
    color: #344054;
    font-size: 0.78rem;
  }

  .review-section {
    display: grid;
    gap: 1rem;
  }

  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-heading h2 {
    margin: 0.15rem 0 0;
  }

  .eyebrow {
    margin: 0;
    color: #667085;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .asset-count {
    color: #475467;
    font-size: 0.86rem;
  }

  .asset-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .asset-grid.singleAsset {
    grid-template-columns: minmax(0, 1fr);
  }

  .asset-placeholder {
    margin: 0;
    display: grid;
    gap: 0.55rem;
  }

  .asset-stage {
    min-height: 300px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.7rem;
    border: 1px dashed #98a2b3;
    border-radius: 14px;
    background:
      linear-gradient(#f8fafc 1px, transparent 1px),
      linear-gradient(90deg, #f8fafc 1px, transparent 1px),
      #eef2f6;
    background-size: 24px 24px;
    color: #475467;
    text-align: center;
  }

  .asset-stage img {
    display: block;
    width: 100%;
    max-height: 520px;
    object-fit: contain;
    border-radius: 12px;
  }

  .singleAsset .asset-stage {
    min-height: 390px;
  }

  .asset-placeholder figcaption {
    color: #667085;
    font-size: 0.88rem;
  }

  .asset-source {
    color: #667085;
    font-size: 0.78rem;
  }

  .question-list {
    display: grid;
    gap: 0.85rem;
  }

  .question-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 1rem;
    padding: 1.1rem;
    border: 1px solid #dfe5ee;
    border-radius: 14px;
    background: #fff;
  }

  .question-number {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    background: #172033;
    color: #fff;
    font-weight: 700;
  }

  .question-content {
    min-width: 0;
  }

  .question-content h3 {
    margin: 0.25rem 0 0;
    font-size: 1.05rem;
    line-height: 1.45;
  }

  .think-prompt {
    margin: 0.65rem 0 0;
    font-size: 0.9rem;
  }

  .answer-block {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.9rem;
    padding-top: 0.9rem;
    border-top: 1px solid #e6eaf0;
  }

  .answer-block p {
    margin: 0;
    line-height: 1.55;
  }

  .answer-label {
    color: #344054;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .answer-block span {
    width: fit-content;
    margin-top: 0.2rem;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    background: #eef2f6;
    color: #667085;
    font-size: 0.76rem;
  }

  .review-actions {
    position: sticky;
    bottom: 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border: 1px solid #cdd6e3;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 10px 30px rgba(23, 32, 51, 0.1);
    backdrop-filter: blur(8px);
  }

  .review-actions p {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
  }

  .rating-buttons,
  .completion-buttons,
  .next-case-buttons {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .completion-buttons,
  .next-case-form {
    display: grid;
    gap: 0.6rem;
  }

  .next-case-prompt {
    color: #667085;
    font-size: 0.82rem;
    font-weight: 600;
    text-align: right;
  }

  .action-error {
    color: #b42318;
  }

  .action-button,
  .rating-button {
    min-width: 120px;
    text-align: center;
  }

  @media (max-width: 700px) {
    .section-heading,
    .review-actions {
      align-items: stretch;
      display: grid;
    }

    .asset-grid {
      grid-template-columns: 1fr;
    }

    .asset-stage,
    .singleAsset .asset-stage {
      min-height: 260px;
    }

    .rating-buttons,
    .completion-buttons,
    .next-case-buttons {
      display: grid;
      grid-template-columns: 1fr;
    }

    .rating-buttons {
      grid-template-columns: 1fr 1fr;
    }

    .next-case-prompt {
      text-align: left;
    }

    .action-button,
    .rating-button {
      width: 100%;
    }
  }

  @media (max-width: 440px) {
    .question-card {
      grid-template-columns: 1fr;
    }

    .question-number {
      width: 1.8rem;
      height: 1.8rem;
    }
  }
</style>