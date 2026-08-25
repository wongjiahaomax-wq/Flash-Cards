<script>
  import AccessibleInfo from '$lib/components/AccessibleInfo.svelte';

  /** @typedef {'classic' | 'compact'} CaseEditorLayout */
  /** @typedef {{ assetId: string, isActive: boolean, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, captionMd?: string | null }} CaseAsset */
  /** @typedef {{ id: string, assetId: string, isActive: boolean, assetIsActive: boolean, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, captionMd?: string | null }} StimulusOption */
  /** @typedef {{ name: string, isActive: boolean, options: StimulusOption[] }} StimulusGroup */
  /** @typedef {{ questionPromptId: string, promptMd: string, answerMd: string, reusableForTopic?: boolean }} CaseQuestion */
  /** @typedef {{ case: { id: string, conceptName?: string | null }, questions: CaseQuestion[], attached: CaseAsset[], stimulusGroups: StimulusGroup[] }} QuestionsCase */
  /** @type {{ selectedCase: QuestionsCase, previewMode: boolean, editorLayout: CaseEditorLayout }} */
  let { selectedCase, previewMode, editorLayout } = $props();
  let newQuestionScope = $state('case');
</script>

<section id="questions" class="panel stack">
  <div class="section-heading">
    <div>
      <p class="eyebrow">This clinical presentation</p>
      <h2>Case questions <span class="count">{selectedCase.questions.length}</span>{#if editorLayout === 'compact'}<AccessibleInfo label="Case-wide question" text="A Case-wide Prompt/Answer pair applies to the whole clinical presentation regardless of which image option is selected." />{/if}</h2>
      <p class="muted compact-hide-explainer">This section contains only questions that apply to the whole Case, regardless of which stimulus is selected.</p>
    </div>
  </div>

  <section class="question-authoring-panel" aria-labelledby="add-case-question-heading">
    <div class="subsection-title">
      <strong id="add-case-question-heading">Add Case question</strong>
      <span class="muted">Create a new Prompt/Answer pair and choose where it applies.</span>
    </div>
    <form method="POST" action={previewMode ? '?/saveQuestion' : `/admin/cases/${selectedCase.case.id}/question-scope`} class="form-grid question-authoring">
      <input type="hidden" name="case_id" value={selectedCase.case.id} />
      <label class="new-question-prompt">Question prompt<textarea name="prompt_md" rows="3" maxlength="2000" required placeholder="e.g. What is the likely cause in this patient?"></textarea></label>
      <label class="new-question-answer">Answer<textarea name="answer_md" rows="3" maxlength="5000" required placeholder="The answer shown after reveal."></textarea></label>
      {#if !previewMode}
        <fieldset class="scope-choice wide"><legend>Applies to:</legend><label><input type="radio" name="scope" value="case" bind:group={newQuestionScope} /> This whole Case</label><label><input type="radio" name="scope" value="stimulus" bind:group={newQuestionScope} /> A specific image / stimulus</label></fieldset>
        {#if newQuestionScope === 'case'}
          <label class="checkbox-label new-question-reuse"><input name="reusable_for_topic" type="checkbox" /> Also reuse this question in the Topic</label>
        {:else}
          <fieldset class="stimulus-picker wide"><legend>Choose the image / stimulus</legend><div class="move-image-options">{#each selectedCase.attached.filter((asset) => asset.isActive) as asset}<label class="move-image-option"><input type="radio" name="target" value={`fixed:${asset.assetId}`} required />{#if asset.imageUrl}<img src={asset.imageUrl} alt={asset.altText ?? 'Case image'} loading="lazy" />{/if}<span><strong>{asset.originalFilename ?? asset.assetId}</strong><small>Always shown with this Case</small>{#if asset.captionMd}<small>{asset.captionMd}</small>{/if}</span></label>{/each}{#each selectedCase.stimulusGroups.filter((group) => group.isActive) as group}{#each group.options.filter((option) => option.isActive && option.assetIsActive) as option}<label class="move-image-option"><input type="radio" name="target" value={`option:${option.id}`} required />{#if option.imageUrl}<img src={option.imageUrl} alt={option.altText ?? 'Alternative image'} loading="lazy" />{/if}<span><strong>{option.originalFilename ?? option.assetId}</strong><small>{group.name}</small>{#if option.captionMd}<small>{option.captionMd}</small>{/if}</span></label>{/each}{/each}</div></fieldset>
        {/if}
      {:else}
        <label class="checkbox-label new-question-reuse"><input name="reusable_for_topic" type="checkbox" /> Share this question with the Topic</label>
      {/if}
      <div class="new-question-actions"><button class="button primary" type="submit">Add question</button></div>
    </form>
  </section>

  <div class="existing-questions-heading">
    <strong>Existing questions</strong>
    <span class="count">{selectedCase.questions.length}</span>
  </div>

  {#if selectedCase.questions.length === 0}<p class="empty-state">No Case-wide questions yet. Compatible Topic and stimulus-specific questions can still be used in Reviews.</p>{/if}

  <div class="question-list">
    {#each selectedCase.questions as question, index}
      <article id={`question-${question.questionPromptId}`} class="question-card">
        <div class="card-heading">
          <div class="question-identity">
            <span class="question-number">{index + 1}</span>
            <div>
              <strong>Question {index + 1}</strong>
              <span class="scope-badge">Whole Case</span>
            </div>
          </div>
          <div class="header-actions">
            {#if question.reusableForTopic}<span class="badge">Shared with {selectedCase.case.conceptName}</span>{/if}
            <div class="question-order-actions">
              <form method="POST" action="?/reorderQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><input type="hidden" name="direction" value="up" /><button class="button small icon-action" type="submit" disabled={index === 0} aria-label="Move question up">↑</button></form>
              <form method="POST" action="?/reorderQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><input type="hidden" name="direction" value="down" /><button class="button small icon-action" type="submit" disabled={index === selectedCase.questions.length - 1} aria-label="Move question down">↓</button></form>
            </div>
            <form method="POST" action="?/removeQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><button class="button danger small remove-action" type="submit">Remove</button></form>
          </div>
        </div>

        <form id={`question-edit-${question.questionPromptId}`} method="POST" action="?/saveQuestion" class="question-edit-form">
          <input type="hidden" name="case_id" value={selectedCase.case.id} />
          <input type="hidden" name="original_prompt_id" value={question.questionPromptId} />
          <label class="question-prompt-field">Prompt<textarea name="prompt_md" rows="2" maxlength="2000" required>{question.promptMd}</textarea></label>
          <label class="question-answer-field">Answer<textarea name="answer_md" rows="3" maxlength="5000" required>{question.answerMd}</textarea></label>
          <div class="question-footer">
            <label class="checkbox-label question-reuse-field"><input name="reusable_for_topic" type="checkbox" checked={question.reusableForTopic} /> Share this question with the Topic</label>
            <button class="button primary" type="submit">Save question</button>
          </div>
        </form>

        {#if !previewMode}
          <details class="scope-change" open={editorLayout === 'classic'}>
            <summary>Change scope</summary>
            <div class="scope-change-body stack">
              <strong class="classic-scope-heading">Change scope</strong>
              <form method="POST" action={`/admin/cases/${selectedCase.case.id}/question-scope`} class="stack">
                <input type="hidden" name="intent" value="move" />
                <input type="hidden" name="case_id" value={selectedCase.case.id} />
                <input type="hidden" name="prompt_id" value={question.questionPromptId} />
                <label>Applies to<select name="target" required><option value="" disabled selected>A specific image / stimulus…</option>{#each selectedCase.attached.filter((asset) => asset.isActive) as asset}<option value={`fixed:${asset.assetId}`}>{asset.originalFilename ?? asset.assetId} — always shown</option>{/each}{#each selectedCase.stimulusGroups.filter((group) => group.isActive) as group}{#each group.options.filter((option) => option.isActive && option.assetIsActive) as targetOption}<option value={`option:${targetOption.id}`}>{targetOption.originalFilename ?? targetOption.assetId} — {group.name}{targetOption.captionMd ? ` — ${targetOption.captionMd}` : ''}</option>{/each}{/each}</select></label>
                <div><button class="button small" type="submit">Apply specific stimulus scope</button></div>
              </form>
            </div>
          </details>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
  h2, p { margin-top: 0; }
  h2 { margin-bottom: 0.2rem; font-size: 1.2rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .stack { display: grid; gap: 0.85rem; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .section-heading p:last-child { margin-bottom: 0; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem 1rem; }
  label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; }
  input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  textarea { resize: vertical; }
  .wide { grid-column: 1 / -1; }
  .checkbox-label { display: flex; align-items: center; gap: 0.45rem; font-weight: 500; }
  .checkbox-label input { width: auto; }

  .question-authoring-panel { display: grid; gap: 0.8rem; padding: 0.9rem; border: 1px solid #dfe5ee; border-radius: 9px; background: #f8fafc; }
  .subsection-title { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
  .subsection-title > span { font-size: 0.8rem; }
  .new-question-reuse { grid-column: 1; }
  .new-question-actions { grid-column: 2; justify-self: end; align-self: end; }

  .scope-choice, .stimulus-picker { margin: 0; padding: 0.65rem; border: 1px solid #e4e7ec; border-radius: 8px; background: #fff; }
  .scope-choice legend, .stimulus-picker legend { padding: 0 0.25rem; color: #344054; font-weight: 700; }
  .scope-choice { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; }
  .scope-choice label { display: flex; align-items: center; gap: 0.45rem; font-weight: 500; }
  .scope-choice input { width: auto; }
  .move-image-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.55rem; }
  .move-image-option { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 0.45rem; padding: 0.45rem; border: 1px solid #e4e7ec; border-radius: 7px; background: #f8fafc; cursor: pointer; font-weight: 500; }
  .move-image-option:has(input:checked) { border-color: #172033; box-shadow: 0 0 0 2px #d0d5dd; }
  .move-image-option input { width: auto; margin-top: 0.15rem; }
  .move-image-option img { grid-column: 1 / -1; width: 100%; height: 90px; object-fit: contain; border-radius: 5px; background: #eef2f6; }
  .move-image-option span { display: grid; gap: 0.15rem; min-width: 0; overflow-wrap: anywhere; }
  .move-image-option small { color: #667085; font-weight: 400; }

  .existing-questions-heading { display: flex; align-items: baseline; gap: 0.45rem; padding-top: 0.1rem; }
  .question-list { display: grid; gap: 0.7rem; }
  .question-card { display: grid; gap: 0.7rem; padding: 0.75rem; border: 1px solid #e4e7ec; border-radius: 8px; background: #fff; }
  .card-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .question-identity { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
  .question-identity > div { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; min-width: 0; }
  .question-number { display: grid; place-items: center; width: 1.65rem; height: 1.65rem; flex: 0 0 1.65rem; border-radius: 999px; background: #172033; color: #fff; font-size: 0.76rem; font-weight: 750; }
  .scope-badge { display: inline-block; padding: 0.2rem 0.45rem; border-radius: 999px; background: #eef2f6; color: #475467; font-size: 0.72rem; font-weight: 650; }
  .header-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 0.4rem; }
  .badge { color: #475467; font-size: 0.78rem; font-weight: 500; }
  .question-order-actions { display: flex; align-items: center; gap: 0.3rem; }
  .question-order-actions form, .header-actions > form { display: contents; }
  .icon-action { min-width: 2.15rem; }
  .remove-action { background: transparent; }

  .question-edit-form { display: grid; gap: 0.7rem 1rem; }
  .question-footer { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding-top: 0.1rem; }
  .question-reuse-field { min-width: 0; }

  .empty-state { padding: 0.85rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .button.small { padding: 0.5rem 0.65rem; font-size: 0.82rem; }
  .button.danger { border-color: #fecdca; color: #b42318; }
  button:disabled { cursor: not-allowed; opacity: 0.45; }

  .scope-change { width: fit-content; max-width: 100%; border: 1px solid #e4e7ec; border-radius: 8px; background: #f8fafc; }
  summary { padding: 0.55rem 0.7rem; cursor: pointer; color: #344054; font-size: 0.82rem; font-weight: 650; }
  .scope-change-body { min-width: min(560px, calc(100vw - 5rem)); padding: 0.75rem 0.85rem; }
  button:focus-visible, summary:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  :global(.case-editor[data-editor-layout="classic"]) .scope-change { width: 100%; }
  :global(.case-editor[data-editor-layout="classic"]) .scope-change > summary { display: none; }
  :global(.case-editor[data-editor-layout="compact"]) .classic-scope-heading { display: none; }
  :global(.case-editor[data-editor-layout="compact"]) .compact-hide-explainer { display: none; }

  @media (min-width: 1024px) {
    :global(.case-editor[data-editor-layout="compact"]) #questions { scroll-margin-top: 4.75rem; }
    :global(.case-editor[data-editor-layout="compact"]) .question-authoring { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
    :global(.case-editor[data-editor-layout="compact"]) .new-question-prompt { grid-column: 1; }
    :global(.case-editor[data-editor-layout="compact"]) .new-question-answer { grid-column: 2; }
    :global(.case-editor[data-editor-layout="compact"]) .question-edit-form { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
    :global(.case-editor[data-editor-layout="compact"]) .question-prompt-field { grid-column: 1; }
    :global(.case-editor[data-editor-layout="compact"]) .question-answer-field { grid-column: 2; }
    :global(.case-editor[data-editor-layout="compact"]) .question-footer { grid-column: 1 / -1; }
  }

  @media (max-width: 760px) {
    .subsection-title, .card-heading, .question-footer { align-items: start; flex-direction: column; }
    .form-grid, .question-edit-form { grid-template-columns: minmax(0, 1fr); }
    .wide, .new-question-reuse, .new-question-actions { grid-column: auto; }
    .new-question-actions { justify-self: start; }
    .header-actions { width: 100%; justify-content: flex-start; }
    .scope-change { width: 100%; }
    .scope-change-body { min-width: 0; }
  }
</style>
