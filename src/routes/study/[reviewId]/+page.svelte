<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  import {
    learnerStudyRunReturnHref,
    requestNextLearnerStudyWork
  } from '$lib/learner-study-open.js';
  import {
    clearLearnerStudyRun,
    readLearnerStudyRun,
    writeLearnerStudyRun
  } from '$lib/learner-study-run-storage.js';

  let { data } = $props();
  /** @type {any} */
  let browserRun = $state(null);
  let completionError = $state('');
  let completing = $state(false);

  onMount(() => {
    browserRun = readLearnerStudyRun(localStorage);
  });

  /** @param {string} mode */
  function contentModeLabel(mode) {
    return mode === 'expanded' ? 'Expanded Learning' : 'Original questions';
  }

  /** @param {any} descriptor */
  async function openFollowingReview(descriptor) {
    try {
      const next = await requestNextLearnerStudyWork(descriptor);
      if (next.payload.descriptor) {
        browserRun = writeLearnerStudyRun(localStorage, next.payload.descriptor);
      }
      if (next.payload.status === 'review' && next.payload.reviewId) {
        await goto(`/study/${next.payload.reviewId}`);
        return;
      }
      if (['waiting', 'new-limit-reached', 'complete', 'resume'].includes(next.payload.status)) {
        await goto(learnerStudyRunReturnHref(next.payload));
        return;
      }
      await goto('/study?runStatus=open-failed');
    } catch {
      await goto('/study?runStatus=open-failed');
    }
  }

  /** @param {'again'|'hard'|'good'|'easy'|null} [rating] */
  async function completeReview(rating = null) {
    if (completing) return;
    completing = true;
    completionError = '';
    try {
      const response = await fetch(`/study/api/complete/${data.review.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptor: browserRun, ...(rating ? { rating } : {}) })
      });
      const payload = await response.json();
      if (!response.ok) {
        completionError = payload.message ?? 'Unable to complete this Review.';
        return;
      }
      if (payload.descriptor) {
        browserRun = writeLearnerStudyRun(localStorage, payload.descriptor);
        await openFollowingReview(browserRun);
        return;
      }
      if (payload.runLost) {
        clearLearnerStudyRun(localStorage);
        browserRun = null;
        await goto(learnerStudyRunReturnHref({ status: 'run-lost' }));
        return;
      }
      await goto('/study?runStatus=open-failed');
    } catch (cause) {
      completionError = cause instanceof Error ? cause.message : String(cause);
    } finally {
      completing = false;
    }
  }
</script>

<svelte:head>
  <title>Active Review | Flash-Cards</title>
</svelte:head>

<main class="shell review-shell">
  <nav class="review-nav" aria-label="Study navigation">
    <a href="/study">← Back to Study</a>
    <span class="muted">Active Review · resumable</span>
  </nav>

  <header class="case-header">
    <div class="case-meta">
      <span>{data.review.studyMode === 'scheduled' ? 'Scheduled Study' : 'Free Study'}</span>
      {#if data.review.queueClass}<span class="badge">{data.review.queueClass}</span>{/if}
      <span class="badge">{contentModeLabel(data.review.contentMode)}</span>
    </div>
    <h1>Case review</h1>
    {#if data.review.vignette}<p>{data.review.vignette}</p>{/if}
  </header>

  {#if data.review.assets.length > 0}
    <section class="review-section" aria-labelledby="assets-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Clinical stimulus</p>
          <h2 id="assets-heading">{data.review.assets.length === 1 ? 'Image' : 'Images'}</h2>
        </div>
        {#if data.review.assets.length > 1}<span class="muted">{data.review.assets.length} images shown together</span>{/if}
      </div>
      <div class:singleAsset={data.review.assets.length === 1} class="asset-grid">
        {#each data.review.assets as asset}
          <figure>
            <div class="asset-stage"><img src={asset.imageUrl} alt={asset.altText ?? asset.caption ?? 'Teaching image'} /></div>
            {#if asset.caption}<figcaption>{asset.caption}</figcaption>{/if}
          </figure>
        {/each}
      </div>
    </section>
  {/if}

  <section class="review-section" aria-labelledby="questions-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Question set</p>
        <h2 id="questions-heading">Questions</h2>
      </div>
      <span class="muted">Rate the Case only after revealing every answer.</span>
    </div>
    <div class="question-list">
      {#each data.review.questions as question, index}
        <article class="question-card">
          <div class="question-number">{index + 1}</div>
          <div class="question-content">
            <h3>{question.prompt}</h3>
            {#if data.review.revealed}
              <div class="answer-block">
                <p class="answer-label">Answer</p>
                <p>{question.answer}</p>
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
    {#if !data.review.revealed}
      <div>
        <strong>Ready to check?</strong>
        <p class="muted">Reveal all answers before completing this Review.</p>
      </div>
      <form method="POST" action="?/reveal">
        <button class="button primary action-button" type="submit">Reveal answers</button>
      </form>
    {:else if data.review.studyMode === 'scheduled'}
      <div>
        <strong>How did you do overall?</strong>
        <p class="muted">One Case-level rating drives the FSRS transition.</p>
        {#if completionError}<p class="action-error" role="alert">{completionError}</p>{/if}
      </div>
      <div class="rating-buttons">
        <button class="button rating-button" type="button" onclick={() => completeReview('again')} disabled={completing}>Again</button>
        <button class="button rating-button" type="button" onclick={() => completeReview('hard')} disabled={completing}>Hard</button>
        <button class="button primary rating-button" type="button" onclick={() => completeReview('good')} disabled={completing}>Good</button>
        <button class="button rating-button" type="button" onclick={() => completeReview('easy')} disabled={completing}>Easy</button>
      </div>
    {:else}
      <div>
        <strong>Free Study completion</strong>
        <p class="muted">Records the Free encounter only. No FSRS rating or transition is written.</p>
        {#if completionError}<p class="action-error" role="alert">{completionError}</p>{/if}
      </div>
      <button class="button primary action-button" type="button" onclick={() => completeReview()} disabled={completing}>
        {completing ? 'Completing…' : 'Complete Free Review →'}
      </button>
    {/if}
  </section>
</main>

<style>
  .review-shell { display:grid; gap:1.5rem; max-width:920px; }
  .review-nav { display:flex; align-items:center; justify-content:space-between; gap:1rem; font-size:.9rem; }
  .review-nav a { text-decoration:none; } .review-nav a:hover { text-decoration:underline; }
  .case-header { display:grid; gap:.75rem; padding-bottom:.5rem; }
  .case-header h1,.case-header p { margin:0; }
  .case-header h1 { font-size:clamp(1.8rem,4vw,2.5rem); line-height:1.12; }
  .case-header > p { max-width:760px; color:#475467; line-height:1.65; }
  .case-meta { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; color:#667085; font-size:.9rem; font-weight:600; }
  .badge { padding:.2rem .5rem; border-radius:999px; background:#eef2f6; color:#344054; font-size:.78rem; text-transform:capitalize; }
  .review-section { display:grid; gap:1rem; }
  .section-heading { display:flex; align-items:end; justify-content:space-between; gap:1rem; }
  .section-heading h2 { margin:.15rem 0 0; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .asset-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
  .asset-grid.singleAsset { grid-template-columns:minmax(0,1fr); }
  figure { margin:0; display:grid; gap:.55rem; }
  .asset-stage { min-height:300px; display:grid; place-items:center; border:1px dashed #98a2b3; border-radius:14px; background:#eef2f6; }
  .asset-stage img { display:block; width:100%; max-height:520px; object-fit:contain; border-radius:12px; }
  .singleAsset .asset-stage { min-height:390px; }
  figcaption { color:#667085; font-size:.88rem; }
  .question-list { display:grid; gap:.85rem; }
  .question-card { display:grid; grid-template-columns:auto minmax(0,1fr); gap:1rem; padding:1.1rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .question-number { display:grid; place-items:center; width:2rem; height:2rem; border-radius:999px; background:#172033; color:#fff; font-weight:700; }
  .question-content h3 { margin:.25rem 0 0; font-size:1.05rem; line-height:1.45; }
  .think-prompt { margin:.65rem 0 0; font-size:.9rem; }
  .answer-block { display:grid; gap:.4rem; margin-top:.9rem; padding-top:.9rem; border-top:1px solid #e6eaf0; }
  .answer-block p { margin:0; line-height:1.55; }
  .answer-label { color:#344054; font-size:.78rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; }
  .review-actions { position:sticky; bottom:1rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.1rem; border:1px solid #cdd6e3; border-radius:14px; background:rgba(255,255,255,.96); box-shadow:0 10px 30px rgba(23,32,51,.1); backdrop-filter:blur(8px); }
  .review-actions p { margin:.25rem 0 0; font-size:.9rem; }
  .rating-buttons { display:flex; gap:.55rem; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
  .rating-button,.action-button { min-width:105px; text-align:center; }
  .action-error { color:#b42318; }
  @media (max-width:700px) {
    .section-heading,.review-actions { display:grid; align-items:stretch; }
    .asset-grid { grid-template-columns:1fr; }
    .asset-stage,.singleAsset .asset-stage { min-height:260px; }
    .rating-buttons { display:grid; grid-template-columns:1fr 1fr; }
    .rating-button,.action-button { width:100%; }
  }
</style>
