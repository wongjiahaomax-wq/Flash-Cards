<script>
  import AccessibleInfo from './AccessibleInfo.svelte';

  /** @typedef {{ questionPromptId: string, promptMd: string, answerMd: string }} CaseSpecificQuestion */
  /** @typedef {{ id: string, questionPromptId?: string, promptMd: string, answerMd: string, usedInCase: boolean }} ReusableQuestion */
  /** @typedef {{ total?: number, used?: number, available?: number, questions?: ReusableQuestion[] }} ReusableSummary */
  /** @typedef {{ id?: string, assetId: string, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null }} ReviewAsset */
  /** @type {{ caseId: string, optionId: string, asset: ReviewAsset, groupName: string, caseSpecificQuestions?: CaseSpecificQuestion[], reusable?: ReusableSummary, previewMode?: boolean, onimageopen?: (asset: ReviewAsset, subtitle: string) => void }} */
  let { caseId, optionId, asset, groupName, caseSpecificQuestions = [], reusable, previewMode = false, onimageopen = () => {} } = $props();
  let usedReusable = $derived((reusable?.questions ?? []).filter((question) => question.usedInCase));
  let availableCount = $derived(reusable?.available ?? 0);
  let imageName = $derived(asset.originalFilename ?? asset.assetId);
</script>

<section id={`option-review-${optionId}`} class="image-question-review" aria-label={`Questions for ${imageName}`} tabindex="-1">
  <div class="review-heading">
    <div>
      <strong>{imageName}</strong>
      <span class="relationship">ALTERNATIVE · {groupName}</span>
    </div>
    <span class="counts">{caseSpecificQuestions.length} image-specific · {usedReusable.length} reusable used{availableCount ? ` · ${availableCount} available` : ''}</span>
  </div>

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
          <div class="image-reference">
            {#if asset.imageUrl}
              <button class="review-thumbnail" type="button" onclick={() => onimageopen(asset, `${groupName} alternative`)} aria-label={`Open full image viewer for ${imageName}`}>
                <img src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" />
              </button>
            {:else}
              <span class="missing-image">Inactive image</span>
            {/if}
            <span class="scope-label">IMAGE-SPECIFIC · {imageName}</span>
          </div>
          <label>Prompt<textarea name="prompt_md" rows="2" maxlength="2000" required>{question.promptMd}</textarea></label>
          <label>Answer<textarea name="answer_md" rows="2" maxlength="10000" required>{question.answerMd}</textarea></label>
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
            <div class="image-reference">
              {#if asset.imageUrl}<button class="review-thumbnail" type="button" onclick={() => onimageopen(asset, `${groupName} alternative`)} aria-label={`Open full image viewer for ${imageName}`}><img src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" /></button>{:else}<span class="missing-image">Inactive image</span>{/if}
              <span class="scope-label">REUSABLE · {imageName}</span>
            </div>
            <div class="read-field"><span>Prompt</span><strong>{question.promptMd}</strong></div>
            <div class="read-field"><span>Answer</span><p>{question.answerMd}</p></div>
          </article>
        {:else}
          <form method="POST" action="?/saveReusableImageAnswer" class="qa-row reusable-row">
            <input type="hidden" name="case_id" value={caseId} />
            <input type="hidden" name="asset_question_id" value={question.id} />
            <div class="image-reference">
              {#if asset.imageUrl}<button class="review-thumbnail" type="button" onclick={() => onimageopen(asset, `${groupName} alternative`)} aria-label={`Open full image viewer for ${imageName}`}><img src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" /></button>{:else}<span class="missing-image">Inactive image</span>{/if}
              <span class="scope-label">REUSABLE · {imageName}</span>
            </div>
            <div class="read-field"><span>Prompt</span><strong>{question.promptMd}</strong><a href={`/admin/images/${asset.assetId}#reusable-questions`}>Edit shared wording in Asset library</a></div>
            <label>Answer<textarea name="answer_md" rows="2" maxlength="10000" required>{question.answerMd}</textarea></label>
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
</section>

<style>
  .image-question-review { display: grid; gap: 0.65rem; padding-top: 0.7rem; border-top: 1px solid #e4e7ec; scroll-margin-top: 5rem; }
  .image-question-review:focus-visible { outline: 3px solid #84adff; outline-offset: 3px; }
  .review-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
  .review-heading > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.45rem; min-width: 0; }
  .relationship, .scope-label { color: #667085; font-size: 0.7rem; font-weight: 750; letter-spacing: 0.035em; text-transform: uppercase; }
  .counts, .quiet-empty, .available-note { margin: 0; color: #667085; font-size: 0.78rem; }
  .scope-heading { display: flex; align-items: center; gap: 0.15rem; margin-top: 0.15rem; color: #344054; font-size: 0.82rem; }
  .reusable-heading { margin-top: 0.45rem; }
  .qa-list { display: grid; }
  .qa-row { display: grid; grid-template-columns: 92px minmax(0, 2fr) minmax(0, 3fr) auto; gap: 0.7rem; align-items: start; padding: 0.75rem 0; border-top: 1px solid #eaecf0; }
  .qa-row:first-child { border-top: 0; }
  .image-reference { display: grid; gap: 0.35rem; min-width: 0; }
  .review-thumbnail { width: 88px; height: 66px; padding: 0; overflow: hidden; border: 1px solid #dfe5ee; border-radius: 6px; background: #eef2f6; cursor: zoom-in; }
  .review-thumbnail img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .missing-image { display: grid; place-items: center; width: 88px; height: 66px; border-radius: 6px; background: #eef2f6; color: #667085; font-size: 0.68rem; text-align: center; }
  label, .read-field { display: grid; gap: 0.3rem; min-width: 0; color: #344054; font-size: 0.78rem; font-weight: 650; }
  textarea { width: 100%; box-sizing: border-box; min-height: 4.8rem; padding: 0.55rem 0.65rem; border: 1px solid #cdd6e3; border-radius: 7px; background: #fff; font: inherit; line-height: 1.4; resize: vertical; }
  .read-field > span { color: #667085; font-size: 0.72rem; }
  .read-field strong, .read-field p { margin: 0; color: #344054; font-size: 0.86rem; font-weight: 500; line-height: 1.45; overflow-wrap: anywhere; }
  .read-field a { width: fit-content; color: #475467; font-size: 0.72rem; font-weight: 600; }
  .row-actions { align-self: end; }
  .button { display: inline-block; padding: 0.6rem 0.8rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; cursor: pointer; font: inherit; }
  .button.small { padding: 0.5rem 0.65rem; font-size: 0.78rem; }
  button:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 860px) {
    .qa-row { grid-template-columns: 78px minmax(0, 1fr); }
    .image-reference { grid-row: 1 / span 2; }
    .review-thumbnail, .missing-image { width: 72px; height: 58px; }
    .row-actions { grid-column: 2; }
  }
  @media (max-width: 560px) {
    .review-heading { align-items: start; flex-direction: column; }
    .qa-row { grid-template-columns: minmax(0, 1fr); }
    .image-reference { grid-row: auto; grid-template-columns: 76px minmax(0, 1fr); align-items: center; }
    .row-actions { grid-column: auto; }
    .review-thumbnail, .missing-image { width: 72px; height: 56px; }
  }
</style>
