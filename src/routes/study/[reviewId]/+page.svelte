<script>
  import { deserialize, enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  import MarkdownContent from '$lib/components/MarkdownContent.svelte';
  import {
    learnerStudyRunReturnHref,
    requestNextLearnerStudyWork
  } from '$lib/learner-study-open.js';
  import {
    clearLearnerStudyRun,
    persistLearnerStudyRunReplacement,
    readLearnerStudyRun
  } from '$lib/learner-study-run-storage.js';
  import { activeStudyRunProgress } from '$lib/study-run-progress.js';
  import { buildStudyCompletionSummary } from '$lib/study-completion-summary.js';

  let { data } = $props();
  /** @type {any} */
  let browserRun = $state(null);
  let completionError = $state('');
  let completing = $state(false);
  let storageRecovery = $state(false);
  let reportDialog = $state(false);
  let feedbackBody = $state('');
  let feedbackError = $state('');
  let feedbackNotice = $state('');
  let submittingFeedback = $state(false);
  /** @type {HTMLDialogElement | undefined} */
  let feedbackDialog = $state();
  /** @type {HTMLTextAreaElement | undefined} */
  let feedbackTextarea = $state();
  /** @type {HTMLButtonElement | undefined} */
  let feedbackTrigger = $state();

  $effect(() => {
    if (reportDialog && feedbackDialog && !feedbackDialog.open) {
      feedbackDialog.showModal();
      requestAnimationFrame(() => feedbackTextarea?.focus());
    } else if (!reportDialog && feedbackDialog?.open) {
      feedbackDialog.close();
    }
  });
  /** @type {any} */
  let inspectedAsset = $state(null);
  /** @type {HTMLButtonElement|undefined} */
  let closeImageButton = $state();
  /** @type {HTMLDivElement|undefined} */
  let imageDialog = $state();
  /** @type {HTMLButtonElement|null} */
  let imageTrigger = $state(null);

  onMount(() => {
    browserRun = readLearnerStudyRun(localStorage);
    storageRecovery = new URLSearchParams(window.location.search).get('storageRecovery') === '1';
  });

  /** @param {string} mode */
  function contentModeLabel(mode) {
    return mode === 'expanded'
      ? 'Expanded Learning · includes related questions'
      : 'Original questions · curated for this Case';
  }

  /** @param {any} asset @param {MouseEvent|null} [event] */
  function openAssetInspection(asset, event = null) {
    inspectedAsset = asset;
    imageTrigger = /** @type {HTMLButtonElement|null} */ (event?.currentTarget ?? null);
  }

  function closeAssetInspection() {
    inspectedAsset = null;
    const trigger = imageTrigger;
    imageTrigger = null;
    requestAnimationFrame(() => trigger?.focus());
  }

  /** @param {MouseEvent} event */
  function handleImageDialogClick(event) {
    if (event.target === event.currentTarget) closeAssetInspection();
  }

  function imageDialogFocusableElements() {
    if (!imageDialog) return [];
    return /** @type {HTMLElement[]} */ (Array.from(imageDialog.querySelectorAll(
      'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )));
  }

  /** @param {KeyboardEvent} event */
  function handleImageDialogKeydown(event) {
    if (!inspectedAsset || !imageDialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAssetInspection();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = imageDialogFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      imageDialog.focus();
      return;
    }

    const activeIndex = focusable.findIndex((element) => element === document.activeElement);
    const nextIndex = event.shiftKey
      ? activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1
      : activeIndex < 0 || activeIndex === focusable.length - 1 ? 0 : activeIndex + 1;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }

  /** @param {any} descriptor */
  function publishCompletionSummary(descriptor) {
    const summary = buildStudyCompletionSummary(descriptor);
    if (!summary?.runId) return null;
    const token = `${summary.runId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      sessionStorage.setItem(`flash-cards:study-completion:${summary.runId}`, JSON.stringify({ token, summary }));
      return { runId: summary.runId, token };
    } catch {
      return null;
    }
  }

  $effect(() => {
    if (inspectedAsset) requestAnimationFrame(() => closeImageButton?.focus());
  });

  /** @type {NonNullable<Parameters<typeof enhance>[1]>} */
  const preserveRevealPosition = () => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    return async ({ update }) => {
      await update();
      requestAnimationFrame(() => window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' }));
    };
  };

  /** @param {any} descriptor */
  async function openFollowingReview(descriptor) {
    try {
      const next = await requestNextLearnerStudyWork(descriptor);
      if (next.payload.descriptor) {
        const persisted = persistLearnerStudyRunReplacement(localStorage, next.payload.descriptor, descriptor);
        browserRun = persisted.descriptor;
        if (!persisted.ok) {
          if (['review', 'resume'].includes(next.payload.status) && next.payload.reviewId) {
            await goto(`/study/${next.payload.reviewId}?storageRecovery=1`);
            return;
          }
          await goto(learnerStudyRunReturnHref({ status: 'run-lost' }));
          return;
        }
      }
      if (['review', 'resume'].includes(next.payload.status) && next.payload.reviewId) {
        await goto(`/study/${next.payload.reviewId}`);
        return;
      }
      if (['waiting', 'new-limit-reached', 'complete', 'resume'].includes(next.payload.status)) {
        if (next.payload.status === 'complete') {
          const published = publishCompletionSummary(next.payload.descriptor ?? descriptor);
          clearLearnerStudyRun(localStorage);
          const query = published
            ? `&completionRun=${encodeURIComponent(published.runId)}&completionToken=${encodeURIComponent(published.token)}`
            : '';
          await goto(`/study?runStatus=complete${query}`);
        } else {
          await goto(learnerStudyRunReturnHref(next.payload));
        }
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
        const persisted = persistLearnerStudyRunReplacement(localStorage, payload.descriptor, browserRun);
        browserRun = persisted.descriptor;
        if (!persisted.ok) {
          completionError = 'Review completed, but browser storage could not save the updated session. Start a new Study session to continue.';
          await goto(learnerStudyRunReturnHref({ status: 'run-lost' }));
          return;
        }
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

  /** @param {MouseEvent} event */
  function openFeedback(event) {
    feedbackTrigger = /** @type {HTMLButtonElement} */ (event.currentTarget);
    feedbackError = '';
    feedbackNotice = '';
    reportDialog = true;
  }

  /** @param {{ force?: boolean } | undefined} [options] */
  function closeFeedback(options) {
    if (submittingFeedback && options?.force !== true) return;
    if (feedbackDialog?.open) feedbackDialog.close();
    reportDialog = false;
    feedbackError = '';
    requestAnimationFrame(() => feedbackTrigger?.focus());
  }

  function handleFeedbackClose() {
    closeFeedback();
  }

  /** @param {Event} event */
  function handleFeedbackCancel(event) {
    if (submittingFeedback) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    closeFeedback();
  }

  /** @param {MouseEvent} event */
  function handleFeedbackBackdrop(event) {
    if (event.target === feedbackDialog) closeFeedback();
  }

  /** @param {SubmitEvent} event */
  async function submitFeedback(event) {
    event.preventDefault();
    if (submittingFeedback) return;
    submittingFeedback = true;
    feedbackError = '';
    feedbackNotice = '';
    try {
      const formData = new FormData(/** @type {HTMLFormElement} */ (event.currentTarget));
      const response = await fetch('?/submitFeedback', {
        method: 'POST',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body: formData
      });
      const result = /** @type {any} */ (deserialize(await response.text()));
      if (result.type === 'failure') {
        feedbackError = result.data?.error ?? 'Unable to submit feedback right now.';
        return;
      }
      if (result.type === 'error') {
        feedbackError = 'Unable to submit feedback right now. Please try again.';
        return;
      }
      closeFeedback({ force: true });
      feedbackBody = '';
      feedbackNotice = 'Thanks — your feedback was submitted.';
    } catch {
      feedbackError = 'Unable to submit feedback right now. Please try again.';
    } finally {
      submittingFeedback = false;
    }
  }
  let runProgress = $derived(activeStudyRunProgress(browserRun));
</script>

<svelte:window onkeydown={handleImageDialogKeydown} />

<svelte:head>
  <title>Active Review | Flash-Cards</title>
</svelte:head>

<main class="shell review-shell">
  <nav class="review-nav" aria-label="Study navigation">
    <a href="/study">← Back to Study</a>
    <div class="review-nav-status">
      <span class="muted">Review in progress</span>
      <span class="review-nav-divider" aria-hidden="true"></span>
      <button class="feedback-link" type="button" onclick={openFeedback}>Report an issue</button>
      {#if runProgress}<span class="run-progress">Case {runProgress.current} of {runProgress.total}</span>{/if}
    </div>
  </nav>

  <header class="case-header">
    <div class="case-meta">
      <span>{data.review.studyMode === 'scheduled' ? 'Scheduled Study' : 'Free Study'}</span>
      <span class="badge">{contentModeLabel(data.review.contentMode)}</span>
    </div>
    <h1>{data.review.revealed && data.review.caseTitle ? data.review.caseTitle : 'Case review'}</h1>
    {#if data.review.vignette}<MarkdownContent class="case-vignette" source={data.review.vignette} />{/if}
  </header>

  {#if storageRecovery}
    <p class="recovery-notice" role="status">This Review is saved. Browser storage is unavailable, so you can finish it here. You may need to start a new Study session afterward.</p>
  {/if}

  {#if feedbackNotice}<p class="feedback-notice" role="status">{feedbackNotice}</p>{/if}

  {#if reportDialog}
    <dialog bind:this={feedbackDialog} class="feedback-dialog" aria-labelledby="feedback-dialog-title" oncancel={handleFeedbackCancel} onclick={handleFeedbackBackdrop}>
      <div class="feedback-dialog-content">
        <p class="eyebrow">Case feedback</p>
        <h2 id="feedback-dialog-title">Report an issue</h2>
        <p class="muted">Tell us if something in this case seems incorrect or unclear. If relevant, mention the question or image you're referring to.</p>
        <form onsubmit={submitFeedback}>
          <label for="feedback-body">What should we review?</label>
          <textarea bind:this={feedbackTextarea} id="feedback-body" name="feedback_body" bind:value={feedbackBody} disabled={submittingFeedback}></textarea>
          {#if feedbackError}<p class="action-error" role="alert">{feedbackError}</p>{/if}
          <div class="dialog-actions">
            <button class="button" type="button" onclick={handleFeedbackClose} disabled={submittingFeedback}>Cancel</button>
            <button class="button primary" type="submit" disabled={submittingFeedback}>{submittingFeedback ? 'Submitting…' : 'Submit'}</button>
          </div>
        </form>
      </div>
    </dialog>
  {/if}

  <div class:has-assets={data.review.assets.length > 0} class="review-content-grid">
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
            <div class="asset-stage">
              <button
                class="asset-image-button"
                type="button"
                aria-label="Inspect image"
                onclick={(event) => openAssetInspection(asset, event)}
              >
                <img src={asset.imageUrl} alt={asset.altText ?? asset.caption ?? 'Teaching image'} />
              </button>
              <button
                class="asset-inspect-button"
                type="button"
                aria-label="Inspect image"
                title="Inspect image"
                onclick={(event) => openAssetInspection(asset, event)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
              </button>
            </div>
            {#if asset.caption}<figcaption><MarkdownContent source={asset.caption} /></figcaption>{/if}
          </figure>
        {/each}
      </div>
    </section>
  {/if}

  {#if inspectedAsset}
    <div class="asset-modal-backdrop" role="presentation" onclick={handleImageDialogClick}>
      <div bind:this={imageDialog} class="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title" tabindex="-1" onclick={(event) => event.stopPropagation()}>
        <div class="asset-dialog-panel">
          <div class="asset-dialog-header">
            <div>
              <p class="eyebrow">Image inspection</p>
              <h2 id="asset-dialog-title">Enlarged teaching image</h2>
            </div>
            <button bind:this={closeImageButton} class="close-button" type="button" onclick={closeAssetInspection}>Close</button>
          </div>
          <div class="asset-dialog-image-wrap">
            <img
              class="asset-dialog-image"
              src={inspectedAsset.imageUrl}
              alt={inspectedAsset.altText ?? inspectedAsset.caption ?? 'Teaching image'}
            />
          </div>
          {#if inspectedAsset.caption}<div class="asset-dialog-caption"><MarkdownContent source={inspectedAsset.caption} /></div>{/if}
        </div>
      </div>
    </div>
  {/if}

  <section class="review-section" aria-labelledby="questions-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Question set</p>
        <h2 id="questions-heading">Questions</h2>
      </div>
      <span class="muted">Reveal every answer, then rate the Case overall.</span>
    </div>
    <div class="question-list">
      {#each data.review.questions as question, index}
        <article class="question-card">
          <div class="question-number">{index + 1}</div>
          <div class="question-content">
            <MarkdownContent class="question-prompt" source={question.prompt} />
            {#if data.review.revealed}
              <div class="answer-block">
                <p class="answer-label">Answer</p>
                <MarkdownContent source={question.answer} />
              </div>
            {:else}
              <p class="muted think-prompt">Think through your answer before revealing.</p>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  </section>
  </div>

  <section class:ratingReview={data.review.revealed && data.review.studyMode === 'scheduled'} class="review-actions" aria-live="polite">
    {#if !data.review.revealed}
      <div>
        <strong>Ready to check?</strong>
        <p class="muted">Reveal all answers before completing this Review.</p>
      </div>
      <form method="POST" action="?/reveal" use:enhance={preserveRevealPosition}>
        <button class="button primary action-button" type="submit">Reveal answers</button>
      </form>
    {:else if data.review.studyMode === 'scheduled'}
      <div class="rating-intro">
        <strong>How did you do overall?</strong>
        <p class="muted">Rate the Case overall, including its questions and clinical images.</p>
        {#if completionError}<p class="action-error" role="alert">{completionError}</p>{/if}
      </div>
      <div class="rating-buttons">
        <button class="button rating-button" title="Forgot or could not recall" type="button" onclick={() => completeReview('again')} disabled={completing}>Again</button>
        <button class="button rating-button" title="Recalled with significant effort" type="button" onclick={() => completeReview('hard')} disabled={completing}>Hard</button>
        <button class="button primary rating-button" title="Recalled with reasonable effort" type="button" onclick={() => completeReview('good')} disabled={completing}>Good</button>
        <button class="button rating-button" title="Recalled easily" type="button" onclick={() => completeReview('easy')} disabled={completing}>Easy</button>
      </div>
    {:else}
      <div>
        <strong>Free Study completion</strong>
        <p class="muted">This records the Free Study session without changing Scheduled Study.</p>
        {#if completionError}<p class="action-error" role="alert">{completionError}</p>{/if}
      </div>
      <button class="button primary action-button" type="button" onclick={() => completeReview()} disabled={completing}>
        {completing ? 'Completing…' : 'Complete Free Review →'}
      </button>
    {/if}
    {#if data.review.revealed}
      <button class="text-button rating-link" type="button" onclick={() => document.getElementById('questions-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Review answers from top</button>
    {/if}
  </section>
</main>

<style>
  .review-shell { display:grid; width:min(1560px, calc(100% - 2rem)); max-width:1560px; gap:1.25rem; padding-bottom:2rem; }
  .review-nav { display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; font-size:.9rem; }
  .run-progress { padding:.25rem .55rem; border:1px solid #d0d5dd; border-radius:999px; color:#344054; font-size:.82rem; font-weight:700; }
  .review-nav a { text-decoration:none; } .review-nav a:hover,.review-nav a:focus-visible { text-decoration:underline; }
  .review-nav-status { display:flex; align-items:center; justify-content:flex-end; gap:.75rem; flex-wrap:wrap; }
  .review-nav-divider { width:1px; height:1.1rem; background:#d0d5dd; }
  .feedback-link { padding:0; border:0; background:transparent; color:#175cd3; cursor:pointer; font:inherit; }
  .feedback-link:hover { text-decoration:underline; text-underline-offset:.15em; }
  .case-header { display:grid; gap:.6rem; padding-bottom:.25rem; }
  .case-header h1 { margin:0; }
  .case-header h1 { font-size:clamp(1.8rem,4vw,2.5rem); line-height:1.12; }
  :global(.case-header .case-vignette) { max-width:760px; color:#475467; line-height:1.65; }
  .case-meta { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; color:#667085; font-size:.9rem; font-weight:600; }
  .badge { padding:.2rem .5rem; border-radius:999px; background:#eef2f6; color:#344054; font-size:.78rem; text-transform:capitalize; }
  .recovery-notice { margin:0; padding:.85rem 1rem; border:1px solid #f0b7b1; border-radius:10px; background:#fff9f8; color:#7a271a; line-height:1.5; }
  .feedback-notice { margin:0; color:#027a48; font-size:.9rem; }
  .feedback-dialog { width:min(100% - 2rem, 520px); max-height:calc(100vh - 2rem); margin:auto; padding:0; border:1px solid #cdd6e3; border-radius:14px; background:#fff; box-shadow:0 24px 60px rgba(23,32,51,.22); }
  .feedback-dialog::backdrop { background:rgba(23,32,51,.35); }
  .feedback-dialog-content { padding:1.25rem; }
  .feedback-dialog h2 { margin:.15rem 0 .4rem; }
  .feedback-dialog form { display:grid; gap:.65rem; }
  .feedback-dialog label { font-weight:650; }
  .feedback-dialog textarea { min-height:9rem; resize:vertical; padding:.7rem; border:1px solid #98a2b3; border-radius:8px; font:inherit; line-height:1.5; }
  .dialog-actions { display:flex; justify-content:flex-end; gap:.55rem; }
  .review-section { display:grid; gap:.75rem; }
  .review-content-grid { display:grid; gap:1.1rem; min-width:0; }
  .review-content-grid.has-assets { grid-template-columns:minmax(0, 1.1fr) minmax(0, .9fr); align-items:start; }
  .section-heading { display:flex; align-items:end; justify-content:space-between; gap:1rem; }
  .section-heading h2 { margin:.15rem 0 0; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .asset-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.75rem; }
  .asset-grid.singleAsset { grid-template-columns:minmax(0,1fr); }
  figure { align-self:start; margin:0; display:grid; gap:.4rem; }
  .asset-stage { position:relative; align-self:start; display:grid; place-items:center; width:100%; padding:.5rem; border:1px dashed #98a2b3; border-radius:14px; background:#eef2f6; }
  .asset-stage img { display:block; width:auto; max-width:100%; height:auto; max-height:520px; object-fit:contain; border-radius:12px; }
  .asset-image-button { display:block; width:100%; padding:0; border:0; background:transparent; cursor:zoom-in; }
  .asset-image-button:focus-visible,.asset-inspect-button:focus-visible,.close-button:focus-visible { outline:3px solid rgba(52,64,84,.35); outline-offset:2px; }
  .asset-inspect-button { position:absolute; top:.5rem; right:.5rem; display:grid; place-items:center; width:2.25rem; height:2.25rem; padding:0; border:1px solid #cdd6e3; border-radius:999px; background:rgb(255 255 255 / 94%); color:#172033; cursor:zoom-in; box-shadow:0 2px 8px rgb(16 24 40 / 12%); }
  .asset-inspect-button svg { width:1.15rem; height:1.15rem; fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:2; }
  figcaption { color:#667085; font-size:.88rem; }
  .asset-modal-backdrop { position:fixed; z-index:10; inset:0; display:grid; place-items:center; padding:1.5rem; background:rgb(16 24 40 / 78%); backdrop-filter:blur(3px); }
  .asset-dialog { box-sizing:border-box; width:min(92vw,1300px); max-width:calc(100vw - 2rem); max-height:calc(100vh - 2rem); overflow:hidden; border:1px solid rgb(255 255 255 / 45%); border-bottom:4px solid #172033; border-radius:18px; background:#fff; box-shadow:0 28px 90px rgb(16 24 40 / 38%); }
  .asset-dialog-panel { display:grid; gap:0; max-height:calc(100vh - 2rem - 4px); overflow:hidden; }
  .asset-dialog-header { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.25rem; border-bottom:1px solid #dfe5ee; background:#fff; }
  .asset-dialog-header h2 { margin:.18rem 0 0; color:#172033; font-size:1.08rem; letter-spacing:-.01em; }
  .asset-dialog-image-wrap { display:grid; place-items:center; min-height:0; overflow:auto; padding:1.25rem 1.5rem 1.5rem; background:#f2f4f7; }
  .asset-dialog-image { display:block; width:auto; height:auto; max-width:100%; max-height:calc(100vh - 10rem); border:1px solid #d0d5dd; border-radius:10px; background:#fff; box-shadow:0 12px 30px rgb(16 24 40 / 16%); object-fit:contain; }
  .asset-dialog-caption { margin:0; padding:.8rem 1.25rem 1rem; border-top:1px solid #dfe5ee; background:#fff; color:#667085; font-size:.9rem; line-height:1.5; }
  .close-button { padding:.6rem .95rem; border:1px solid #cdd6e3; border-radius:9px; background:#172033; color:#fff; font:inherit; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgb(16 24 40 / 12%); }
  .close-button:hover { background:#344054; }
  .question-list { display:grid; gap:.65rem; }
  .question-card { display:grid; grid-template-columns:auto minmax(0,1fr); gap:.8rem; padding:.9rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .question-number { display:grid; place-items:center; width:2rem; height:2rem; border-radius:999px; background:#172033; color:#fff; font-weight:700; }
  :global(.question-prompt) { font-size:1rem; font-weight:700; }
  .think-prompt { margin:.5rem 0 0; font-size:.9rem; }
  .answer-block { display:grid; gap:.35rem; margin-top:.75rem; padding-top:.75rem; border-top:1px solid #e6eaf0; }
  .answer-block :global(p) { margin:0; line-height:1.55; }
  .answer-label { color:#344054; font-size:.78rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; }
  .review-actions { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.75rem 1rem; border:1px solid #cdd6e3; border-radius:14px; background:#fff; box-shadow:0 10px 30px rgba(23,32,51,.1); }
  .review-actions.ratingReview { display:grid; grid-template-columns:minmax(0,1fr); gap:.55rem; }
  .review-actions p { margin:.2rem 0 0; font-size:.88rem; }
  .rating-intro,.rating-buttons { width:100%; min-width:0; }
  .rating-buttons { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.55rem; }
  .rating-button,.action-button { min-width:0; text-align:center; }
  .rating-button { width:100%; padding:.6rem .75rem; }
  .rating-link { justify-self:end; width:max-content; }
  .review-actions.ratingReview > form,.review-actions.ratingReview > .action-button { justify-self:end; }
  button:disabled { cursor:default; }
  button:focus-visible, a:focus-visible { outline:3px solid rgba(52,64,84,.25); outline-offset:2px; }
  .action-error { color:#b42318; }
  .text-button { padding:0; border:0; background:transparent; color:#475467; font:inherit; text-decoration:underline; cursor:pointer; }
  @media (max-width:700px) {
    .section-heading,.review-actions { display:grid; align-items:stretch; }
    .review-nav { align-items:flex-start; }
    .asset-grid { grid-template-columns:1fr; }
    .review-content-grid.has-assets { grid-template-columns:1fr; }
    .asset-modal-backdrop { padding:.5rem; }
    .asset-dialog { width:calc(100vw - 1rem); max-height:calc(100vh - 1rem); }
    .asset-dialog-panel { max-height:calc(100vh - 1rem - 4px); }
    .asset-dialog-image-wrap { padding:.75rem .75rem 1rem; }
    .asset-dialog-image { max-height:calc(100vh - 9rem); }
    .rating-buttons { display:grid; grid-template-columns:1fr 1fr; }
    .rating-button,.action-button { width:100%; }
    .review-actions > form,.review-actions > .action-button { justify-self:stretch; }
  }
</style>
