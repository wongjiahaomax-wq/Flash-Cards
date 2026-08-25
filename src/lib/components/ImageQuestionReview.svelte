<script>
  import AccessibleInfo from './AccessibleInfo.svelte';

  /** @typedef {{ questionPromptId: string, promptMd: string, answerMd: string }} CaseSpecificQuestion */
  /** @typedef {{ id: string, questionPromptId?: string, promptMd: string, answerMd: string, usedInCase: boolean }} ReusableQuestion */
  /** @typedef {{ total?: number, used?: number, available?: number, groupActive?: boolean, questions?: ReusableQuestion[] }} ReusableSummary */
  /** @typedef {{ id?: string, assetId: string, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, isActive?: boolean, assetIsActive?: boolean }} ReviewAsset */
  /** @type {{ caseId: string, optionId: string, asset: ReviewAsset, groupName: string, groupActive?: boolean, caseSpecificQuestions?: CaseSpecificQuestion[], reusable?: ReusableSummary, previewMode?: boolean, onimageopen?: (asset: ReviewAsset, subtitle: string) => void }} */
  let { caseId, optionId, asset, groupName, groupActive, caseSpecificQuestions = [], reusable, previewMode = false, onimageopen = () => {} } = $props();
  let usedReusable = $derived((reusable?.questions ?? []).filter((question) => question.usedInCase));
  let availableCount = $derived(reusable?.available ?? 0);
  let imageName = $derived(asset.originalFilename ?? asset.assetId);
  let effectiveGroupActive = $derived(groupActive ?? reusable?.groupActive ?? true);
  let currentParticipant = $derived(effectiveGroupActive && asset.isActive !== false && asset.assetIsActive !== false);

  /** Keep answers readable within the narrower image-question column. */
  /** @param {HTMLTextAreaElement} node */
  const autoGrowImageField = (node) => {
    const maxHeight = 220;
    let expanded = false;
    const expandButton = document.createElement('button');
    expandButton.type = 'button';
    expandButton.className = 'button small image-answer-expand-button';
    expandButton.hidden = true;
    expandButton.style.display = 'none';

    const resize = () => {
      node.style.height = 'auto';
      const isOverflowing = node.scrollHeight > maxHeight;
      const hidden = !isOverflowing && !expanded;
      node.style.height = `${expanded ? node.scrollHeight : Math.min(node.scrollHeight, maxHeight)}px`;
      node.style.overflowY = expanded ? 'hidden' : isOverflowing ? 'auto' : 'hidden';
      expandButton.hidden = hidden;
      expandButton.style.display = hidden ? 'none' : '';
      expandButton.textContent = expanded ? 'Collapse answer' : 'Expand answer';
      expandButton.setAttribute('aria-expanded', String(expanded));
    };

    expandButton.addEventListener('click', () => {
      expanded = !expanded;
      resize();
    });
    node.addEventListener('input', resize);
    node.insertAdjacentElement('afterend', expandButton);
    requestAnimationFrame(resize);

    return {
      destroy() {
        node.removeEventListener('input', resize);
        expandButton.remove();
      }
    };
  };
</script>

<section id={`option-review-${optionId}`} class="image-question-review" class:inactive-review={!currentParticipant} aria-label={`${currentParticipant ? '' : 'Inactive '}questions for ${imageName}`} tabindex="-1">
  <div class="review-heading">
    <div>
      <strong>Image questions</strong>
      <span class="relationship">{currentParticipant ? '' : 'INACTIVE · '}ALTERNATIVE · {groupName}</span>
    </div>
    <span class="counts">{caseSpecificQuestions.length} image-specific · {usedReusable.length} reusable used{availableCount ? ` · ${availableCount} available` : ''}</span>
  </div>

  {#if !currentParticipant}
    <p class="inactive-note">Historical/inactive set or option content. It is retained for authoring context but is excluded from the current learner-participating Case audit.</p>
  {/if}

  <div class="review-body">
    <div class="review-image-context">
      {#if asset.imageUrl}
        <button class="review-image" type="button" onclick={() => onimageopen(asset, `${groupName} alternative`)} aria-label={`Open full image viewer for ${imageName}`}>
          <img src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" />
        </button>
      {:else}
        <span class="missing-image">Inactive image</span>
      {/if}
      <span class="scope-label">IMAGE-SPECIFIC · {imageName}</span>
    </div>

    <div class="review-question-column">
      {#if caseSpecificQuestions.length > 0}
        <div class="scope-heading">
          <strong>Case-specific Image Questions</strong>
          <AccessibleInfo label="Case-specific Image Questions" text="These Prompt/Answer pairs belong only to this Case and this exact image/stimulus context." />
        </div>
        <div class="qa-list">
          {#each caseSpecificQuestions as question (question.questionPromptId)}
            <form method="POST" action="?/saveStimulusOptionQuestion" class="qa-row">
              <input type="hidden" name="case_id" value={caseId} />
              <input type="hidden" name="option_id" value={optionId} />
              <input type="hidden" name="original_prompt_id" value={question.questionPromptId} />
              <label>Prompt<textarea use:autoGrowImageField name="prompt_md" rows="2" maxlength="2000" required>{question.promptMd}</textarea></label>
              <label>Answer<textarea use:autoGrowImageField name="answer_md" rows="3" maxlength="10000" required>{question.answerMd}</textarea></label>
              <div class="row-actions"><button class="button small" type="submit">Save</button></div>
            </form>
          {/each}
        </div>
      {/if}

      {#if usedReusable.length > 0}
        <div class="scope-heading reusable-heading">
          <strong>Reusable Image Questions used in this Case</strong>
          <AccessibleInfo label="Reusable Image Questions" text="These canonical Prompt/Answer pairs belong to this exact Asset and are included here only because this stimulus explicitly opted into them." />
        </div>
        <div class="qa-list">
          {#each usedReusable as question (question.id)}
            {#if previewMode}
              <article class="qa-row reusable-row read-only">
                <div class="read-field"><span>Prompt</span><strong>{question.promptMd}</strong></div>
                <div class="read-field"><span>Answer</span><p>{question.answerMd}</p></div>
              </article>
            {:else}
              <form method="POST" action="?/saveReusableImageAnswer" class="qa-row reusable-row">
                <input type="hidden" name="case_id" value={caseId} />
                <input type="hidden" name="asset_question_id" value={question.id} />
                <div class="read-field"><span>Prompt</span><strong>{question.promptMd}</strong><a href={`/admin/images/${asset.assetId}#reusable-questions`}>Edit shared wording in Asset library</a></div>
                <label>Answer<textarea use:autoGrowImageField name="answer_md" rows="3" maxlength="10000" required>{question.answerMd}</textarea></label>
                <div class="row-actions"><button class="button small" type="submit">Save canonical answer</button></div>
              </form>
            {/if}
          {/each}
        </div>
      {/if}

      {#if caseSpecificQuestions.length === 0 && usedReusable.length === 0}
        <p class="quiet-empty">No image-linked questions are currently used with this option.{#if availableCount > 0} {availableCount} reusable {availableCount === 1 ? 'question is' : 'questions are'} available through Manage questions.{/if}</p>
      {:else if availableCount > 0}
        <p class="available-note">{availableCount} additional reusable {availableCount === 1 ? 'question is' : 'questions are'} available to reuse through Manage questions.</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .image-question-review { display: grid; gap: 0.75rem; padding-top: 0.7rem; border-top: 1px solid #e4e7ec; scroll-margin-top: 5rem; }
  .image-question-review:focus-visible { outline: 3px solid #84adff; outline-offset: 3px; }
  .inactive-review { padding: 0.7rem; border: 1px dashed #d0d5dd; border-radius: 7px; background: #f8fafc; }
  .inactive-review .relationship { color: #7a5d00; }
  .inactive-note { margin: -0.1rem 0 0; color: #667085; font-size: 0.76rem; line-height: 1.4; }
  .review-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
  .review-heading > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.45rem; min-width: 0; }
  .relationship, .scope-label { color: #667085; font-size: 0.7rem; font-weight: 750; letter-spacing: 0.035em; text-transform: uppercase; }
  .counts, .quiet-empty, .available-note { margin: 0; color: #667085; font-size: 0.78rem; }
  .review-body { display: grid; grid-template-columns: minmax(280px, 42%) minmax(0, 1fr); gap: 1rem; align-items: start; }
  .review-image-context { display: grid; gap: 0.45rem; min-width: 0; position: sticky; top: 1rem; }
  .review-image { width: 100%; min-height: 260px; padding: 0; overflow: hidden; border: 1px solid #dfe5ee; border-radius: 8px; background: #eef2f6; cursor: zoom-in; }
  .review-image img { display: block; width: 100%; height: clamp(260px, 28vw, 390px); object-fit: contain; }
  .missing-image { display: grid; place-items: center; width: 100%; min-height: 260px; border-radius: 8px; background: #eef2f6; color: #667085; font-size: 0.78rem; text-align: center; }
  .review-question-column { display: grid; gap: 0.65rem; min-width: 0; }
  .scope-heading { display: flex; align-items: center; gap: 0.15rem; margin-top: 0.05rem; color: #344054; font-size: 0.82rem; }
  .reusable-heading { margin-top: 0.45rem; }
  .qa-list { display: grid; }
  .qa-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.55rem 0.7rem; align-items: start; padding: 0.75rem 0; border-top: 1px solid #eaecf0; }
  .qa-row:first-child { border-top: 0; }
  .qa-row > label, .qa-row > .read-field { grid-column: 1 / -1; }
  label, .read-field { display: grid; gap: 0.3rem; min-width: 0; color: #344054; font-size: 0.78rem; font-weight: 650; }
  textarea { width: 100%; box-sizing: border-box; min-height: 4.8rem; padding: 0.55rem 0.65rem; border: 1px solid #cdd6e3; border-radius: 7px; background: #fff; font: inherit; line-height: 1.4; resize: vertical; }
  .read-field > span { color: #667085; font-size: 0.72rem; }
  .read-field strong, .read-field p { margin: 0; color: #344054; font-size: 0.86rem; font-weight: 500; line-height: 1.45; overflow-wrap: anywhere; }
  .read-field a { width: fit-content; color: #475467; font-size: 0.72rem; font-weight: 600; }
  .row-actions { grid-column: 2; justify-self: end; align-self: end; }
  .button { display: inline-block; padding: 0.6rem 0.8rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; cursor: pointer; font: inherit; }
  .button.small { padding: 0.5rem 0.65rem; font-size: 0.78rem; }
  button:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }

  @media (min-width: 1024px) {
    :global(.case-editor[data-editor-layout="compact"] .option-card > .option-thumbnail),
    :global(.case-editor[data-editor-layout="compact"] .option-card > .option-thumb) { display: none; }
  }

  @media (max-width: 860px) {
    .review-body { grid-template-columns: minmax(0, 1fr); }
    .review-image-context { position: static; width: min(100%, 560px); }
    .review-image, .missing-image { min-height: 210px; }
    .review-image img { height: clamp(210px, 52vw, 320px); }
  }

  @media (max-width: 560px) {
    .review-heading { align-items: start; flex-direction: column; }
    .review-image-context { width: 100%; }
    .qa-row { grid-template-columns: minmax(0, 1fr); }
    .row-actions { grid-column: auto; justify-self: start; }
  }
</style>
