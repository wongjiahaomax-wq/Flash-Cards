<script>
  import { tick } from 'svelte';
  import { reusableSummaryForContext } from '$lib/admin-case-question-audit.js';
  import AccessibleInfo from '$lib/components/AccessibleInfo.svelte';
  import CaseImageStrip from '$lib/components/CaseImageStrip.svelte';
  import ImageQuestionCounts from '$lib/components/ImageQuestionCounts.svelte';
  import ImageQuestionReview from '$lib/components/ImageQuestionReview.svelte';
  import ReusableImageQuestionManager from '$lib/components/ReusableImageQuestionManager.svelte';

  /** @typedef {'classic' | 'compact'} CaseEditorLayout */
  /** @typedef {{ questionPromptId: string, promptMd: string, answerMd: string, isActive: boolean, stimulusGroupOptionId?: string | null }} ScopedQuestion */
  /** @typedef {{ questionPromptId: string, promptMd: string }} CaseQuestion */
  /** @typedef {{ assetId: string, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, captionMd?: string | null, isActive: boolean, sourceLabel?: string | null, sourceUrl?: string | null, licence?: string | null }} FixedAsset */
  /** @typedef {{ id: string, assetId: string, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, captionMd?: string | null, isActive: boolean, assetIsActive: boolean }} StimulusOption */
  /** @typedef {{ id: string, name: string, isActive: boolean, options: StimulusOption[], optionQuestions: ScopedQuestion[], questions: ScopedQuestion[], specificQuestionMode?: string, minimumSpecificQuestions?: number | null }} StimulusGroup */
  /** @typedef {{ case: { id: string }, attached: FixedAsset[], questions: CaseQuestion[], stimulusGroups: StimulusGroup[], reusableImageQuestions?: any[] }} ImagesCase */
  /** @typedef {{ imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, assetId?: string, id?: string }} ViewableAsset */
  /** @type {{ selectedCase: ImagesCase, previewMode: boolean, editorLayout: CaseEditorLayout, editorBase: string, onimageopen?: (asset: ViewableAsset, subtitle?: string) => void }} */
  let { selectedCase, previewMode, editorLayout, editorBase, onimageopen } = $props();
  /** @type {string | null} */
  let selectedOptionId = $state(null);

  /** Keep image-specific answers readable within the narrower image-question editor. */
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

  /** @param {string} targetId */
  async function focusReviewTarget(targetId) {
    await tick();
    const target = document.getElementById(targetId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  }

  /** @param {string} optionId */
  async function selectOption(optionId) {
    selectedOptionId = selectedOptionId === optionId ? null : optionId;
    if (selectedOptionId) {
      await tick();
      const editor = document.getElementById(`option-editor-${optionId}`);
      editor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      editor?.focus({ preventScroll: true });
    }
  }

  /** @param {string} assetId @param {string | null} [optionId] */
  function reusableSummary(assetId, optionId = null) {
    return reusableSummaryForContext(selectedCase, assetId, optionId);
  }

  /** @param {ViewableAsset} asset @param {string} [subtitle] */
  function showImage(asset, subtitle = '') {
    onimageopen?.(asset, subtitle);
  }

  $effect(() => {
    const optionIds = selectedCase?.stimulusGroups.flatMap((group) => group.options.map((option) => option.id)) ?? [];
    if (selectedOptionId && !optionIds.includes(selectedOptionId)) selectedOptionId = null;
  });
</script>

<section id="images" class="panel stack image-authoring">
  <div class="panel-heading"><div><p class="eyebrow">Clinical presentation</p><h2>Images{#if editorLayout === 'compact'}<AccessibleInfo label="Case images" text="Fixed images are shown whenever this Case is reviewed. Each active Alternative Set selects one active option according to the existing learner rules." />{/if}</h2><p class="muted compact-hide-explainer">Fixed images appear in every applicable Review. Each active alternative set selects one active image according to the existing stimulus rules.</p></div><a class="button primary" href={`?picker=1#images`}>Add images from library</a></div>
  <div class="image-subsection stack">
    <div><h3>Fixed images <span class="count">{selectedCase.attached.length}</span>{#if editorLayout === 'compact'}<AccessibleInfo label="Fixed image" text="A fixed image is a Case Asset shown in every applicable Review. It is distinct from an option inside an Alternative Set." />{/if}</h3><p class="muted compact-hide-explainer">These images are always shown with this Case. You can assign Case-specific questions or explicitly reuse canonical Asset questions.</p></div>
    {#if editorLayout === 'compact' && selectedCase.attached.length > 1}
      <CaseImageStrip label="Fixed Case images" items={selectedCase.attached.map((asset) => ({ ...asset, id: `fixed-${asset.assetId}`, status: 'FIXED' }))} onselect={(item) => focusReviewTarget(`fixed-image-${item.assetId}`)} />
    {/if}
    {#if selectedCase.attached.length === 0}<p class="empty-state">No fixed images attached yet.</p>{/if}
    {#each selectedCase.attached as asset, index}
      {@const reusable = reusableSummary(asset.assetId)}
      <article id={`fixed-image-${asset.assetId}`} class="fixed-asset-card" tabindex="-1">
        <div class="asset-card-heading"><div class="asset-title"><span class="order-badge">{index + 1}</span><div><strong>{asset.originalFilename ?? asset.assetId}</strong><span class="muted">{asset.altText || 'No alt text'}</span></div></div><span class="status-badge">Fixed</span></div>
        {#if asset.imageUrl}<button class="fixed-image-preview" type="button" onclick={() => showImage(asset, 'Fixed Case image')} aria-label={`Enlarge ${asset.originalFilename ?? 'fixed image'}`}><img src={asset.imageUrl} alt={asset.altText ?? ''} /></button>{:else}<div class="inactive-image large">Inactive image</div>{/if}
        <div class="asset-meta">{#if asset.sourceLabel}<span>Source: {#if asset.sourceUrl}<a href={asset.sourceUrl} target="_blank" rel="noreferrer">{asset.sourceLabel}</a>{:else}{asset.sourceLabel}{/if}</span>{/if}{#if asset.licence}<span>Licence: {asset.licence}</span>{/if}</div>
        <form method="POST" action="?/caption" class="stack"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><label>Case-specific caption<textarea name="caption" rows="2" maxlength="1000">{asset.captionMd ?? ''}</textarea></label><button class="button small" type="submit">Save caption</button></form>
        <ImageQuestionCounts caseSpecificCount={0} {reusable} />
        {#if !previewMode && asset.isActive}
          <details class="specific-questions"><summary>Manage questions</summary><div class="specific-body stack">
            <section class="question-management-section"><div><h4>Case-specific Image Questions <span class="count">0</span></h4><p class="muted">These belong only to this Case + image context. Adding one keeps the same learner-visible image behaviour and performs the existing safe fixed-image conversion automatically.</p></div>
              <form method="POST" action={`/admin/cases/${selectedCase.case.id}/question-scope`} class="stack image-question-form"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="scope" value="stimulus" /><input type="hidden" name="target" value={`fixed:${asset.assetId}`} /><label class="question-prompt-field">Question prompt<textarea use:autoGrowImageField name="prompt_md" rows="2" required placeholder="e.g. What are the ECG changes?"></textarea></label><label class="question-answer-field">Answer for this Case and image<textarea use:autoGrowImageField name="answer_md" rows="2" required></textarea></label><div class="image-question-actions"><button class="button small" type="submit">Add Case-specific Image Question</button></div></form>
              {#if selectedCase.questions.length > 0}<details class="move-existing-question"><summary>Move existing Case question here</summary><form method="POST" action={`/admin/cases/${selectedCase.case.id}/question-scope`} class="specific-body stack"><input type="hidden" name="intent" value="move" /><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="target" value={`fixed:${asset.assetId}`} /><label>Case question<select name="prompt_id" required><option value="" disabled selected>Choose a Case question</option>{#each selectedCase.questions as caseQuestion}<option value={caseQuestion.questionPromptId}>{caseQuestion.promptMd}</option>{/each}</select></label><div><button class="button small" type="submit">Move question here</button></div></form></details>{/if}
            </section>
            <ReusableImageQuestionManager summary={reusable} caseId={selectedCase.case.id} assetId={asset.assetId} previewMode={previewMode} />
          </div></details>
        {/if}
        <div class="actions"><form method="POST" action="?/reorder"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><input type="hidden" name="direction" value="up" /><button class="button small" type="submit" disabled={index === 0}>Move up</button></form><form method="POST" action="?/reorder"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><input type="hidden" name="direction" value="down" /><button class="button small" type="submit" disabled={index === selectedCase.attached.length - 1}>Move down</button></form><form method="POST" action="?/detach"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><button class="button danger small" type="submit">Detach</button></form></div>
        <details class="advanced compact-disclosure"><summary>Alternative-set actions</summary><div class="advanced-body stack"><form method="POST" action="?/startAlternativeSet" class="move-to-alternatives"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><label>Start a new alternative set from this image<input name="set_name" required placeholder="e.g. ECG" /></label><button class="button small" type="submit">Start alternative set</button></form>{#if selectedCase.stimulusGroups.length > 0}<form method="POST" action="?/addStimulusOption" class="move-to-alternatives"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><input type="hidden" name="convert_fixed" value="on" /><label>Move into an existing set<select name="group_id" required><option value="">Choose alternative set</option>{#each selectedCase.stimulusGroups as group}<option value={group.id}>{group.name}</option>{/each}</select></label><button class="button small" type="submit">Move into set</button></form>{/if}</div></details>
      </article>
    {/each}
  </div>

  <div class="image-subsection stack">
    <div class="subsection-heading"><div><h3>Alternative image sets <span class="count">{selectedCase.stimulusGroups.length}</span>{#if editorLayout === 'compact'}<AccessibleInfo label="Alternative image set" text="An Alternative Set contains interchangeable image options for the same Case. Each active set selects one active option; an option is not merely a non-fixed image." />{/if}</h3><p class="muted compact-hide-explainer">Use these when the Case stays the same but one example image may vary between attempts.</p></div></div>
    <details class="create-set-disclosure"><summary>Create an empty alternative set</summary><div class="advanced-body"><form method="POST" action="?/createStimulusGroup" class="start-alternative-form"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="specific_question_mode" value="none" /><label>Set name<input name="name" required placeholder="e.g. ECG" /></label><button class="button" type="submit">Create set</button></form></div></details>
    {#if selectedCase.stimulusGroups.length === 0}<p class="empty-state">No alternative image sets yet. Start one from a fixed image or create an empty set.</p>{/if}
    {#each selectedCase.stimulusGroups as group}
      <article class="alternative-set">
        <div class="card-heading"><div><p class="eyebrow">Alternative set</p><h3>{group.name} <span class="count">{group.options.length} images</span></h3></div><div class="actions"><span class:inactive={!group.isActive} class="status-badge">{group.isActive ? 'Active' : 'Inactive'}</span>{#if group.isActive}<a class="button small" href={`?picker=1&target_group=${group.id}#images`}>+ Add image</a>{/if}</div></div>
        {#if editorLayout === 'compact' && group.options.length > 0}
          <CaseImageStrip label={`${group.name} alternative images`} items={group.options.map((option) => ({ ...option, status: option.isActive && option.assetIsActive ? `ALTERNATIVE · ${group.name}` : `INACTIVE · ${group.name}` }))} onselect={(item) => focusReviewTarget(`option-review-${item.id}`)} />
        {/if}
        {#if group.options.length === 0}<p class="empty-state">No images in this set yet.</p>{:else}
          <div class="alternative-grid">
            {#each group.options as option, optionIndex}
              {@const imageQuestions = group.optionQuestions.filter((question) => question.stimulusGroupOptionId === option.id && question.isActive)}
              {@const reusable = reusableSummary(option.assetId, option.id)}
              <article class="option-card" class:selected={selectedOptionId === option.id}>
                <div class="option-heading"><span class="order-badge">{optionIndex + 1}</span><span class:inactive={!option.isActive || !option.assetIsActive} class="status-badge">{option.isActive && option.assetIsActive ? 'Active' : 'Inactive'}</span></div>
                {#if option.imageUrl}<button class="option-thumbnail" type="button" onclick={() => showImage(option, `${group.name} alternative`)} aria-label={`Enlarge ${option.originalFilename ?? 'alternative image'}`}><img src={option.imageUrl} alt={option.altText ?? 'Alternative image'} loading="lazy" /></button>{:else}<div class="inactive-image option-thumb">Inactive image</div>{/if}
                <div class="option-copy"><strong>{option.originalFilename ?? option.assetId}</strong><span class="muted">{option.captionMd ?? 'No option caption'}</span></div>
                {#if editorLayout === 'compact'}
                  <ImageQuestionReview caseId={selectedCase.case.id} optionId={option.id} asset={option} groupName={group.name} caseSpecificQuestions={imageQuestions} {reusable} previewMode={previewMode} onimageopen={showImage} />
                {:else}
                  <ImageQuestionCounts caseSpecificCount={imageQuestions.length} caseSpecificQuestions={imageQuestions} {reusable} />
                {/if}
                <button class="button small option-edit" type="button" aria-expanded={selectedOptionId === option.id} aria-controls={`option-editor-${option.id}`} onclick={() => selectOption(option.id)}>{selectedOptionId === option.id ? 'Close questions' : 'Manage questions'}</button>
                <div class="actions compact-actions"><form method="POST" action="?/reorderStimulusOption"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} /><input type="hidden" name="option_id" value={option.id} /><input type="hidden" name="direction" value="up" /><button class="button small" disabled={optionIndex === 0} aria-label={`Move ${option.originalFilename ?? 'image'} up`}>↑</button></form><form method="POST" action="?/reorderStimulusOption"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} /><input type="hidden" name="option_id" value={option.id} /><input type="hidden" name="direction" value="down" /><button class="button small" disabled={optionIndex === group.options.length - 1} aria-label={`Move ${option.originalFilename ?? 'image'} down`}>↓</button></form><form method="POST" action="?/setStimulusOptionActive"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="option_id" value={option.id} /><input type="hidden" name="active" value={option.isActive ? 'false' : 'true'} /><button class="button small" type="submit">{option.isActive ? 'Deactivate' : 'Reactivate'}</button></form><form method="POST" action="?/removeStimulusOptionFromCase" onsubmit={(event) => { if (!window.confirm('Remove this image from this Case? The reusable image will remain in the Image Library and historical Reviews will not be changed.')) event.preventDefault(); }}><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="option_id" value={option.id} /><button class="button danger small" type="submit">Remove from Case</button></form></div>
              </article>
            {/each}
          </div>
          {#if selectedOptionId && group.options.some((option) => option.id === selectedOptionId)}
            {@const option = group.options.find((candidate) => candidate.id === selectedOptionId)}
            {@const imageQuestions = group.optionQuestions.filter((question) => question.stimulusGroupOptionId === option?.id && question.isActive)}
            {#if option}
              {@const reusable = reusableSummary(option.assetId, option.id)}
              <section id={`option-editor-${option.id}`} class="option-editor" aria-labelledby={`option-editor-heading-${option.id}`} tabindex="-1">
                <div class="option-editor-heading"><div><p class="eyebrow">Manage questions</p><h4 id={`option-editor-heading-${option.id}`}>{option.originalFilename ?? option.assetId}</h4><p class="muted">Case-specific Image Questions and Reusable Image Questions are managed separately below.</p></div><button class="button small" type="button" onclick={() => selectOption(option.id)}>Close questions</button></div>
                <div class="option-editor-layout">
                  <div class="option-editor-preview">{#if option.imageUrl}<button class="option-thumbnail" type="button" onclick={() => showImage(option, `${group.name} alternative`)} aria-label={`Enlarge ${option.originalFilename ?? 'alternative image'}`}><img src={option.imageUrl} alt={option.altText ?? 'Alternative image'} /></button>{:else}<div class="inactive-image option-thumb">Inactive image</div>{/if}<span class:inactive={!option.isActive || !option.assetIsActive} class="status-badge">{option.isActive && option.assetIsActive ? 'Active' : 'Inactive'}</span></div>
                  <div class="option-editor-fields stack">
                    <form method="POST" action="?/updateStimulusOptionCaption" class="specific-body stack"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="option_id" value={option.id} /><label>Case-specific caption<textarea name="caption" rows="3" maxlength="1000">{option.captionMd ?? ''}</textarea></label><div><button class="button small" type="submit">Save caption</button></div></form>
                    {#if option.isActive && group.isActive && selectedCase.stimulusGroups.some((candidate) => candidate.id !== group.id && candidate.isActive)}
                      <details class="option-move"><summary>Move to another set…</summary><form method="POST" action={`${editorBase}/cases/${selectedCase.case.id}/move-option`} class="specific-body stack"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="option_id" value={option.id} /><label>Target alternative set<select name="target_group_id" required><option value="" disabled selected>Choose a set</option>{#each selectedCase.stimulusGroups as candidate}{#if candidate.id !== group.id && candidate.isActive}<option value={candidate.id}>{candidate.name}</option>{/if}{/each}</select></label><p class="muted">The option identity, Case-specific caption and exact-image questions stay attached. Set-wide questions stay with their current sets.</p><div><button class="button small" type="submit">Move image</button></div></form></details>
                    {/if}
                    <section class="specific-questions option-editor-questions" aria-labelledby={`questions-${option.id}`}><div class="section-heading"><h4 id={`questions-${option.id}`}>Case-specific Image Questions <span class="count">{imageQuestions.length}</span></h4><p class="muted">These belong only to this Case + exact image context.</p></div><form method="POST" action="?/saveStimulusOptionQuestion" class="stack image-question-form"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="option_id" value={option.id} /><label class="question-prompt-field">Question prompt<textarea use:autoGrowImageField name="prompt_md" rows="3" required placeholder="e.g. Describe this ECG."></textarea></label><label class="question-answer-field">Answer for this Case and image<textarea use:autoGrowImageField name="answer_md" rows="3" required></textarea></label><div class="image-question-actions"><button class="button small" type="submit">Add Case-specific Image Question</button></div></form>{#if !previewMode && selectedCase.questions.length > 0}<details class="move-existing-question"><summary>Move existing Case question here</summary><div class="specific-body stack"><p class="muted">Move a question from this Case to this exact image. Its prompt and answer will be preserved.</p><form method="POST" action={`/admin/cases/${selectedCase.case.id}/question-scope`} class="stack"><input type="hidden" name="intent" value="move" /><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="target" value={`option:${option.id}`} /><label>Case question<select name="prompt_id" required><option value="" disabled selected>Choose a Case question</option>{#each selectedCase.questions as caseQuestion}<option value={caseQuestion.questionPromptId}>{caseQuestion.promptMd}</option>{/each}</select></label><div><button class="button small" type="submit">Move question here</button></div></form></div></details>{/if}{#each imageQuestions as question}<div class="question-card compact"><form method="POST" action="?/saveStimulusOptionQuestion" class="stack image-question-form"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="option_id" value={option.id} /><input type="hidden" name="original_prompt_id" value={question.questionPromptId} /><label class="question-prompt-field">Question prompt<textarea use:autoGrowImageField name="prompt_md" rows="2" required>{question.promptMd}</textarea></label><label class="question-answer-field">Answer for this Case and image<textarea use:autoGrowImageField name="answer_md" rows="2" required>{question.answerMd}</textarea></label><div class="image-question-actions"><button class="button small" type="submit">Save Case-specific Image Question</button></div></form><form method="POST" action="?/removeStimulusQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="scope" value="option" /><input type="hidden" name="context_id" value={option.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><button class="button danger small" type="submit">Remove</button></form></div>{/each}</section>
                    <ReusableImageQuestionManager summary={reusable} caseId={selectedCase.case.id} assetId={option.assetId} optionId={option.id} previewMode={previewMode} />
                  </div>
                </div>
              </section>
            {/if}
          {/if}
        {/if}
        {#if editorLayout === 'compact' && group.isActive && group.options.some((option) => option.isActive && option.assetIsActive) && group.questions.some((question) => question.isActive)}
          <section id={`set-wide-${group.id}`} class="compact-set-wide-review" tabindex="-1">
            <div class="scope-review-heading"><strong>SET-WIDE · {group.name}</strong><AccessibleInfo label="Set-wide question" text="A set-wide Prompt/Answer pair applies to every active image option in this Alternative Set. It is not attached to one exact image." /></div>
            {#each group.questions.filter((question) => question.isActive) as question (question.questionPromptId)}
              <form method="POST" action="?/saveStimulusGroupQuestion" class="compact-set-wide-row"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} /><input type="hidden" name="original_prompt_id" value={question.questionPromptId} /><label>Prompt<textarea name="prompt_md" rows="2" required>{question.promptMd}</textarea></label><label>Answer<textarea name="answer_md" rows="2" required>{question.answerMd}</textarea></label><div><button class="button small" type="submit">Save</button></div></form>
            {/each}
          </section>
        {/if}
        <details class="advanced"><summary>Advanced set settings</summary><div class="advanced-body stack"><p class="muted">Coverage controls how strongly questions specific to this alternative set are represented in a Review.</p><form method="POST" action="?/updateStimulusGroup" class="form-grid"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} /><label>Set name<input name="name" value={group.name} required /></label><label>Specific-question coverage<select name="specific_question_mode"><option value="none" selected={group.specificQuestionMode === 'none'}>No guarantee</option><option value="minimum" selected={group.specificQuestionMode === 'minimum'}>At least N</option><option value="all" selected={group.specificQuestionMode === 'all'}>All available</option></select></label><label>Minimum specific questions<input type="number" name="minimum_specific_questions" min="1" value={group.minimumSpecificQuestions ?? ''} /></label><label class="checkbox-label"><input type="checkbox" name="is_active" checked={group.isActive} /> Active set</label><div><button class="button" type="submit">Save set settings</button></div></form></div></details>
        <details class="advanced"><summary>{group.questions.length} set-wide {group.questions.length === 1 ? 'question' : 'questions'} — advanced</summary><div class="advanced-body stack"><p class="muted">Use this only when a prompt and answer are valid for every image in this set but should not be a general Topic or Case question.</p><form method="POST" action="?/saveStimulusGroupQuestion" class="form-grid"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} /><label>Question prompt<textarea name="prompt_md" rows="2" required></textarea></label><label>Answer<textarea name="answer_md" rows="2" required></textarea></label><div><button class="button" type="submit">Add set-wide question</button></div></form>{#each group.questions as question}<div class="question-card compact"><strong>{question.promptMd}</strong><span>{question.answerMd}</span><form method="POST" action="?/removeStimulusQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="scope" value="group" /><input type="hidden" name="context_id" value={group.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><button class="button danger small" type="submit">Remove</button></form></div>{/each}</div></details>
      </article>
    {/each}
  </div>
</section>

<style>
  h2, h3, h4, p { margin-top: 0; } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; } h3 { margin-bottom: 0.25rem; font-size: 1.05rem; } h4 { margin-bottom: 0.2rem; font-size: 0.98rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .stack { display: grid; gap: 0.85rem; } .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .panel-heading, .asset-card-heading, .subsection-heading, .card-heading, .option-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } .option-heading { align-items: center; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; } .actions form { display: contents; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.small { padding: 0.5rem 0.65rem; font-size: 0.82rem; } .button.danger { border-color: #fecdca; color: #b42318; } button:disabled { cursor: not-allowed; opacity: 0.45; }
  label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } textarea { resize: vertical; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; } .checkbox-label { display: flex; align-items: center; gap: 0.45rem; font-weight: 500; } .checkbox-label input { width: auto; }
  .empty-state { padding: 0.85rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; }
  .image-authoring { gap: 1.25rem; } .image-subsection { padding-top: 0.2rem; } .image-subsection + .image-subsection { padding-top: 1.2rem; border-top: 1px solid #e4e7ec; }
  .fixed-asset-card, .alternative-set, .question-card { display: grid; gap: 0.75rem; padding: 0.85rem; border: 1px solid #eaecf0; border-radius: 8px; background: #f8fafc; } .question-card.compact { background: #fff; font-size: 0.88rem; } .fixed-asset-card { max-width: 980px; background: #fff; }
  .asset-title { display: flex; align-items: center; gap: 0.65rem; min-width: 0; } .asset-title > div { display: grid; gap: 0.2rem; overflow-wrap: anywhere; } .order-badge { display: grid; place-items: center; flex: 0 0 1.7rem; height: 1.7rem; border-radius: 999px; background: #172033; color: #fff; font-size: 0.78rem; font-weight: 700; }
  .status-badge { display: inline-block; width: max-content; padding: 0.2rem 0.45rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.76rem; font-weight: 650; white-space: nowrap; } .status-badge.inactive, .status-badge[class~="inactive"] { background: #f2f4f7; color: #667085; }
  .fixed-image-preview { width: 100%; padding: 0; overflow: hidden; border: 1px solid #dfe5ee; border-radius: 9px; background: #eef2f6; cursor: zoom-in; } .fixed-image-preview img { display: block; width: 100%; height: clamp(300px, 42vw, 440px); object-fit: contain; } .asset-meta { display: flex; flex-wrap: wrap; gap: 0.45rem 1rem; color: #667085; font-size: 0.86rem; } .asset-meta a { color: inherit; } .inactive-image { display: grid; place-items: center; min-height: 120px; border-radius: 8px; background: #eef2f6; color: #667085; } .inactive-image.large { min-height: 300px; }
  .move-to-alternatives, .start-alternative-form { display: flex; align-items: end; gap: 0.6rem; flex-wrap: wrap; } .move-to-alternatives label, .start-alternative-form label { min-width: min(100%, 260px); flex: 1; }
  .compact-disclosure, .create-set-disclosure, .advanced, .specific-questions, .option-move { border: 1px solid #e4e7ec; border-radius: 8px; background: #f8fafc; } summary { padding: 0.72rem 0.85rem; cursor: pointer; color: #344054; font-weight: 650; } .advanced-body, .specific-body { padding: 0.75rem 0.85rem; } .alternative-set { gap: 0.9rem; }
  .alternative-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 0.75rem; } .option-card { display: grid; align-content: start; gap: 0.55rem; min-width: 0; padding: 0.65rem; border: 1px solid #e4e7ec; border-radius: 8px; background: #f8fafc; } .option-card.selected { border-color: #84adff; box-shadow: 0 0 0 2px #dbeafe; }
  .option-thumbnail { width: 100%; padding: 0; border: 1px solid #dfe5ee; border-radius: 7px; overflow: hidden; background: #eef2f6; cursor: zoom-in; } .option-thumbnail img, .option-thumb { display: block; width: 100%; height: 145px; object-fit: contain; } .option-copy { display: grid; gap: 0.2rem; min-width: 0; overflow-wrap: anywhere; font-size: 0.84rem; } .option-copy .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .option-edit { width: 100%; } .compact-actions { gap: 0.35rem; }
  .specific-questions, .option-move, .move-existing-question { margin-top: 0.15rem; background: #fff; } .specific-body p { margin-bottom: 0; font-size: 0.84rem; }
  .question-management-section { display: grid; gap: 0.75rem; padding: 0.8rem; border: 1px solid #dfe5ee; border-radius: 8px; background: #fff; } .question-management-section > div p { margin-bottom: 0; font-size: 0.84rem; }
  .option-editor { display: grid; gap: 1rem; margin-top: 1rem; padding: 1rem; border: 1px solid #cfd8e5; border-radius: 10px; background: #f8fafc; scroll-margin-top: 1rem; } .option-editor-heading { display: flex; justify-content: space-between; align-items: start; gap: 1rem; } .option-editor-heading h4 { margin: 0 0 0.2rem; font-size: 1.05rem; overflow-wrap: anywhere; } .option-editor-layout { display: grid; grid-template-columns: minmax(180px, 250px) minmax(0, 1fr); gap: 1.2rem; align-items: start; } .option-editor-preview { display: grid; gap: 0.55rem; position: sticky; top: 1rem; } .option-editor-preview .option-thumbnail img, .option-editor-preview .option-thumb { height: 200px; } .option-editor-fields { min-width: 0; } .option-editor-fields > form { padding: 0; border: 0; background: transparent; } .option-editor-questions { display: grid; gap: 0.85rem; padding: 0.9rem; border: 1px solid #dfe5ee; border-radius: 8px; } .section-heading h4 { margin: 0 0 0.2rem; font-size: 1rem; }
  .compact-set-wide-review { display: grid; gap: 0.6rem; padding: 0.75rem 0; border-top: 1px solid #d0d5dd; border-bottom: 1px solid #e4e7ec; scroll-margin-top: 5rem; } .scope-review-heading { display: flex; align-items: center; gap: 0.15rem; color: #475467; font-size: 0.76rem; letter-spacing: 0.035em; } .compact-set-wide-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) auto; gap: 0.75rem; align-items: end; padding-top: 0.65rem; border-top: 1px solid #eaecf0; } .compact-set-wide-row label { font-size: 0.78rem; }
  button:focus-visible, a:focus-visible, summary:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, [tabindex="-1"]:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  :global(.case-editor[data-editor-layout="compact"]) .compact-hide-explainer { display: none; }
  :global(.case-editor[data-editor-layout="compact"]) .fixed-asset-card { max-width: none; padding: 0.85rem 0; border-width: 1px 0 0; border-radius: 0; }
  :global(.case-editor[data-editor-layout="compact"]) .fixed-image-preview { width: min(100%, 360px); }
  :global(.case-editor[data-editor-layout="compact"]) .fixed-image-preview img { height: clamp(170px, 24vw, 230px); }
  :global(.case-editor[data-editor-layout="compact"]) .inactive-image.large { min-height: 180px; max-width: 360px; }
  :global(.case-editor[data-editor-layout="compact"]) .alternative-grid { grid-template-columns: minmax(0, 1fr); }
  :global(.case-editor[data-editor-layout="compact"]) .option-card { padding: 0.8rem 0; border-width: 1px 0 0; border-radius: 0; background: #fff; }
  :global(.case-editor[data-editor-layout="compact"]) .option-card.selected { border-color: #84adff; box-shadow: none; }
  :global(.case-editor[data-editor-layout="compact"]) .option-card > .option-thumbnail { width: min(100%, 320px); }
  :global(.case-editor[data-editor-layout="compact"]) .option-card > .option-thumbnail img, :global(.case-editor[data-editor-layout="compact"]) .option-card > .option-thumb { height: 175px; }
  :global(.case-editor[data-editor-layout="compact"]) .option-edit { width: fit-content; }
  @media (min-width: 1024px) {
    :global(.case-editor[data-editor-layout="compact"]) #images { scroll-margin-top: 4.75rem; }
    :global(.case-editor[data-editor-layout="compact"]) .image-question-form { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); column-gap: 1rem; align-items: start; }
    :global(.case-editor[data-editor-layout="compact"]) .question-prompt-field { grid-column: 1; }
    :global(.case-editor[data-editor-layout="compact"]) .question-answer-field { grid-column: 2; }
    :global(.case-editor[data-editor-layout="compact"]) .image-question-actions { grid-column: 1 / -1; }
  }
  @media (max-width: 760px) { .panel-heading, .card-heading, .asset-card-heading, .subsection-heading, .option-editor-heading { align-items: start; flex-direction: column; } .form-grid { grid-template-columns: minmax(0, 1fr); } .fixed-image-preview img { height: clamp(240px, 70vw, 360px); } .option-editor-layout { grid-template-columns: minmax(0, 1fr); } .option-editor-preview { position: static; } .option-editor-preview .option-thumbnail img, .option-editor-preview .option-thumb { height: clamp(180px, 52vw, 280px); } .compact-set-wide-row { grid-template-columns: minmax(0, 1fr); align-items: start; } :global(.case-editor[data-editor-layout="compact"]) .fixed-image-preview img { height: min(58vw, 230px); } }
</style>
