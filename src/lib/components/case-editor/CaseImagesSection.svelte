<script>
  import { tick } from 'svelte';
  import { reusableSummaryForContext, usedReusableQuestions } from '$lib/admin-case-question-audit.js';
  import CaseImagesAdvanced from '$lib/components/case-editor/CaseImagesAdvanced.svelte';

  /** @typedef {'classic' | 'compact'} CaseEditorLayout */
  /** @typedef {{ questionPromptId: string, promptMd: string, answerMd: string, isActive: boolean, stimulusGroupOptionId?: string | null }} ScopedQuestion */
  /** @typedef {{ questionPromptId: string, promptMd: string, answerMd?: string, isActive?: boolean }} CaseQuestion */
  /** @typedef {{ assetId: string, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, captionMd?: string | null, isActive: boolean, sourceLabel?: string | null, sourceUrl?: string | null, licence?: string | null }} CaseAsset */
  /** @typedef {{ id: string, assetId: string, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, captionMd?: string | null, isActive: boolean, assetIsActive: boolean, removedFromCase?: boolean }} StimulusOption */
  /** @typedef {{ id: string, name: string, isActive: boolean, originalOptionId?: string | null, options: StimulusOption[], optionQuestions: ScopedQuestion[], questions: ScopedQuestion[], specificQuestionMode?: string, minimumSpecificQuestions?: number | null }} StimulusGroup */
  /** @typedef {{ case: { id: string }, attached: CaseAsset[], questions: CaseQuestion[], stimulusGroups: StimulusGroup[], reusableImageQuestions?: any[] }} ImagesCase */
  /** @typedef {{ imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, assetId?: string, id?: string }} ViewableAsset */
  /** @typedef {{ key: string, scope: 'Image-specific' | 'Reusable' | 'Shared across this image set', promptMd: string, answerMd: string }} ImageQuestionPreview */
  /** @type {{ selectedCase: ImagesCase, previewMode: boolean, editorLayout: CaseEditorLayout, editorBase: string, onimageopen?: (asset: ViewableAsset, subtitle?: string) => void }} */
  let { selectedCase, previewMode, editorLayout, editorBase, onimageopen } = $props();

  let advancedOpen = $state(false);
  let activeGroups = $derived((selectedCase?.stimulusGroups ?? []).filter((group) => group.isActive));
  let attachedImages = $derived((selectedCase?.attached ?? []).filter((asset) => asset.isActive !== false));
  let assignedImages = $derived(activeGroups.flatMap((group) =>
    group.options
      .filter((option) => option.isActive && option.assetIsActive && !option.removedFromCase)
      .map((option) => ({
        ...option,
        group,
        role: option.id === group.originalOptionId ? 'Original' : 'Alternative'
      }))
  ));
  let ordinaryImages = $derived(attachedImages.map((asset) => ({
    ...asset,
    role: activeGroups.length > 0
      ? 'Always shown'
      : attachedImages.length === 1
        ? 'Original'
        : attachedImages.length > 1
          ? 'Needs role'
          : 'Case image'
  })));
  let imageCount = $derived(ordinaryImages.length + assignedImages.length);

  /** @param {ViewableAsset} asset @param {string} subtitle */
  function showImage(asset, subtitle) {
    onimageopen?.(asset, subtitle);
  }

  /** @param {CaseAsset | StimulusOption} image @param {StimulusGroup | null} [group] */
  function questionsForImage(image, group = null) {
    /** @type {ImageQuestionPreview[]} */
    const previews = [];
    const optionId = group && 'id' in image ? image.id : null;

    if (group && optionId) {
      for (const question of group.optionQuestions ?? []) {
        if (!question.isActive || question.stimulusGroupOptionId !== optionId) continue;
        previews.push({
          key: `specific:${optionId}:${question.questionPromptId}`,
          scope: 'Image-specific',
          promptMd: question.promptMd ?? '',
          answerMd: question.answerMd ?? ''
        });
      }
    }

    const reusable = usedReusableQuestions(
      reusableSummaryForContext(selectedCase, image.assetId, optionId)
    );
    for (const question of reusable) {
      previews.push({
        key: `reusable:${optionId ?? 'case'}:${question.id ?? question.questionPromptId ?? question.promptMd}`,
        scope: 'Reusable',
        promptMd: question.promptMd ?? '',
        answerMd: question.answerMd ?? ''
      });
    }

    if (group) {
      for (const question of group.questions ?? []) {
        if (!question.isActive) continue;
        previews.push({
          key: `set:${group.id}:${question.questionPromptId}`,
          scope: 'Shared across this image set',
          promptMd: question.promptMd ?? '',
          answerMd: question.answerMd ?? ''
        });
      }
    }

    return previews;
  }

  async function openAdvanced() {
    advancedOpen = true;
    await tick();
    document.querySelector('.advanced-image-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

{#if previewMode}
  <CaseImagesAdvanced {selectedCase} {previewMode} {editorLayout} {editorBase} {onimageopen} />
{:else}
  <section id="images" class="panel image-overview" aria-labelledby="case-images-heading">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Clinical presentation</p>
        <h2 id="case-images-heading">Images <span class="count">{imageCount}</span></h2>
        <p class="muted">Review each learner-visible image and its linked Q&A here. Use <strong>Image roles</strong> directly below to choose the Original and Alternatives.</p>
      </div>
      <a class="button primary" href="?picker=1#images">Add images from library</a>
    </div>

    {#if imageCount === 0}
      <p class="empty-state">No images are attached to this Case yet.</p>
    {:else}
      <div class="image-grid" aria-label="Case images">
        {#each ordinaryImages as asset (asset.assetId)}
          {@const imageQuestions = questionsForImage(asset)}
          <article class="image-card">
            <button class="image-preview" type="button" onclick={() => showImage(asset, 'Case image')} aria-label={`Enlarge ${asset.originalFilename ?? 'Case image'}`}>
              {#if asset.imageUrl}
                <img src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" />
              {:else}
                <span class="no-preview">No preview</span>
              {/if}
            </button>
            <div class="image-card-copy">
              <div class="image-title">
                <strong>{asset.originalFilename ?? asset.assetId}</strong>
                <span class:original={asset.role === 'Original'} class:alternative={asset.role === 'Alternative'} class:needs-role={asset.role === 'Needs role'} class="role-badge">{asset.role}</span>
              </div>
              <span class="muted caption">{asset.captionMd || asset.altText || 'No caption'}</span>
            </div>
            {#if imageQuestions.length > 0}
              <div class="image-questions" aria-label="Questions linked to this image">
                {#each imageQuestions as question (question.key)}
                  <div class="image-question">
                    <span class="question-scope">{question.scope}</span>
                    <div class="qa-row"><strong>Q</strong><span>{question.promptMd || '—'}</span></div>
                    <div class="qa-row"><strong>A</strong><span>{question.answerMd || '—'}</span></div>
                  </div>
                {/each}
              </div>
            {/if}
          </article>
        {/each}

        {#each assignedImages as option (option.id)}
          {@const imageQuestions = questionsForImage(option, option.group)}
          <article class="image-card">
            <button class="image-preview" type="button" onclick={() => showImage(option, option.role)} aria-label={`Enlarge ${option.originalFilename ?? 'Case image'}`}>
              {#if option.imageUrl}
                <img src={option.imageUrl} alt={option.altText ?? ''} loading="lazy" />
              {:else}
                <span class="no-preview">No preview</span>
              {/if}
            </button>
            <div class="image-card-copy">
              <div class="image-title">
                <strong>{option.originalFilename ?? option.assetId}</strong>
                <span class:original={option.role === 'Original'} class:alternative={option.role === 'Alternative'} class="role-badge">{option.role}</span>
              </div>
              <span class="muted caption">{option.captionMd || option.altText || 'No caption'}</span>
            </div>
            {#if imageQuestions.length > 0}
              <div class="image-questions" aria-label="Questions linked to this image">
                {#each imageQuestions as question (question.key)}
                  <div class="image-question">
                    <span class="question-scope">{question.scope}</span>
                    <div class="qa-row"><strong>Q</strong><span>{question.promptMd || '—'}</span></div>
                    <div class="qa-row"><strong>A</strong><span>{question.answerMd || '—'}</span></div>
                  </div>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}

    <div class="management-row">
      <div>
        <strong>Need to edit captions, Q&A, ordering or removal?</strong>
        <p class="muted">Open Advanced image management for Case-specific Image Questions, Reusable Image Questions, captions, ordering, removal and less-common image-set controls.</p>
      </div>
      <button class="button" type="button" onclick={openAdvanced}>Advanced image management</button>
    </div>

    <details class="advanced-image-shell" bind:open={advancedOpen}>
      <summary>Advanced image management</summary>
      <div class="advanced-copy">
        <p class="muted">Edit captions and image questions, reorder or remove images, and manage image sets.</p>
      </div>
      <!-- The delegated editor retains the established updateStimulusOptionCaption action and its identity-preserving mutation flow. -->
      {#if advancedOpen}
        <div class="advanced-editor">
          <CaseImagesAdvanced {selectedCase} {previewMode} {editorLayout} {editorBase} {onimageopen} />
        </div>
      {/if}
    </details>
  </section>
{/if}

<style>
  h2, p { margin-top: 0; }
  h2 { margin-bottom: 0.25rem; font-size: 1.2rem; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .panel-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .panel-heading > div { max-width: 760px; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .button { display: inline-block; padding: 0.68rem 0.9rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .empty-state { margin: 1rem 0 0; padding: 0.9rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; }
  .image-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 0.8rem; margin-top: 1rem; }
  .image-card { display: grid; align-content: start; gap: 0.65rem; min-width: 0; padding: 0.7rem; border: 1px solid #e4e7ec; border-radius: 9px; background: #fff; }
  .image-preview { display: grid; place-items: center; width: 100%; height: 170px; padding: 0; overflow: hidden; border: 1px solid #e4e7ec; border-radius: 7px; background: #f8fafc; cursor: zoom-in; }
  .image-preview img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .no-preview { color: #667085; font-size: 0.82rem; }
  .image-card-copy { display: grid; gap: 0.35rem; min-width: 0; }
  .image-title { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; min-width: 0; }
  .image-title strong { min-width: 0; overflow-wrap: anywhere; font-size: 0.9rem; }
  .caption { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; }
  .role-badge { display: inline-flex; flex: 0 0 auto; padding: 0.22rem 0.48rem; border-radius: 999px; background: #f2f4f7; color: #475467; font-size: 0.72rem; font-weight: 700; white-space: nowrap; }
  .role-badge.original { background: #ecfdf3; color: #027a48; }
  .role-badge.alternative { background: #eef4ff; color: #3538cd; }
  .role-badge.needs-role { background: #fef0c7; color: #93370d; }
  .image-questions { display: grid; gap: 0.65rem; padding-top: 0.65rem; border-top: 1px solid #eaecf0; }
  .image-question { display: grid; gap: 0.38rem; padding: 0.6rem; border: 1px solid #e4e7ec; border-radius: 7px; background: #f8fafc; }
  .question-scope { width: fit-content; color: #475467; font-size: 0.7rem; font-weight: 750; letter-spacing: 0.025em; text-transform: uppercase; }
  .qa-row { display: grid; grid-template-columns: 1.2rem minmax(0, 1fr); gap: 0.4rem; align-items: start; font-size: 0.8rem; line-height: 1.4; }
  .qa-row strong { color: #344054; }
  .qa-row span { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
  .management-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e4e7ec; }
  .management-row p { margin: 0.2rem 0 0; font-size: 0.84rem; }
  .advanced-image-shell { margin-top: 0.75rem; border: 1px solid #e4e7ec; border-radius: 8px; background: #f8fafc; }
  .advanced-image-shell > summary { padding: 0.75rem 0.85rem; cursor: pointer; color: #344054; font-weight: 700; }
  .advanced-copy { padding: 0 0.85rem 0.75rem; }
  .advanced-copy p { margin: 0; font-size: 0.84rem; }
  .advanced-editor { padding: 0 0.85rem 0.85rem; }
  .advanced-editor :global(#images) { margin-top: 0; }
  button:focus-visible, a:focus-visible, summary:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 720px) {
    .panel-heading, .management-row { align-items: stretch; flex-direction: column; }
    .panel-heading .button, .management-row .button { width: 100%; box-sizing: border-box; text-align: center; }
    .image-grid { grid-template-columns: 1fr 1fr; }
    .image-preview { height: 145px; }
  }
  @media (max-width: 430px) {
    .image-grid { grid-template-columns: 1fr; }
    .image-preview { height: 180px; }
  }
</style>