<script>
  /** @typedef {{ id: string, assetId: string, promptMd: string, answerMd: string, usedInCase: boolean }} ReusableImageQuestion */
  /** @typedef {{ assetId: string, stimulusOptionId: string | null, total: number, used: number, available: number, questions: ReusableImageQuestion[] }} ReusableImageQuestionSummary */
  /** @type {{ summary?: ReusableImageQuestionSummary, caseId: string, assetId: string, optionId?: string | null, previewMode?: boolean }} */
  let { summary, caseId, assetId, optionId = null, previewMode = false } = $props();
  let questions = $derived(summary?.questions ?? []);
  let usedQuestions = $derived(questions.filter((question) => question.usedInCase));
  let availableQuestions = $derived(questions.filter((question) => !question.usedInCase));
</script>

<section class="reusable-manager" aria-label="Reusable Image Questions">
  <div class="heading">
    <div>
      <h5>Reusable Image Questions <span class="count">{summary?.total ?? 0}</span></h5>
      <p>Canonical questions belong to this exact Asset. This Case uses them only after explicit opt-in.</p>
    </div>
    {#if !previewMode}<a class="asset-link" href={`/admin/images/${assetId}#reusable-questions`}>Open Asset question library</a>{/if}
  </div>

  {#if (summary?.total ?? 0) === 0}
    <p class="empty">No active reusable questions exist for this Asset.</p>
  {:else}
    <div class="group">
      <strong>Used in this Case · {usedQuestions.length}</strong>
      {#if usedQuestions.length === 0}<span class="muted">None currently opted in for this exact stimulus.</span>{/if}
      {#each usedQuestions as question}
        <article class="question-row">
          <div><strong>{question.promptMd}</strong><span>{question.answerMd}</span></div>
          {#if !previewMode && optionId}
            <form method="POST" action="?/removeAssetQuestionReuse">
              <input type="hidden" name="case_id" value={caseId} />
              <input type="hidden" name="option_id" value={optionId} />
              <input type="hidden" name="asset_question_id" value={question.id} />
              <button class="button danger small" type="submit">Remove from this Case</button>
            </form>
          {/if}
        </article>
      {/each}
    </div>

    <div class="group">
      <strong>Available to reuse · {availableQuestions.length}</strong>
      {#if availableQuestions.length === 0}<span class="muted">No additional active reusable questions are available for this stimulus.</span>{/if}
      {#each availableQuestions as question}
        <article class="question-row">
          <div><strong>{question.promptMd}</strong><span>{question.answerMd}</span></div>
          {#if !previewMode}
            <form method="POST" action="?/reuseAssetQuestion">
              <input type="hidden" name="case_id" value={caseId} />
              <input type="hidden" name="asset_id" value={assetId} />
              <input type="hidden" name="option_id" value={optionId ?? ''} />
              <input type="hidden" name="asset_question_id" value={question.id} />
              <button class="button small" type="submit">Reuse in this Case</button>
            </form>
          {/if}
        </article>
      {/each}
    </div>
  {/if}

  {#if !previewMode}
    <details class="create-question">
      <summary>Create a Reusable Image Question</summary>
      <form method="POST" action="?/createReusableImageQuestion" class="form-grid">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="asset_id" value={assetId} />
        <label>Question prompt<textarea name="prompt_md" rows="2" required maxlength="2000"></textarea></label>
        <label>Canonical answer<textarea name="answer_md" rows="2" required maxlength="10000"></textarea></label>
        <div><button class="button small" type="submit">Create reusable question</button></div>
      </form>
    </details>

    {#if questions.length > 0}
      <details class="edit-answers">
        <summary>Edit canonical answers</summary>
        <div class="edit-list">
          {#each questions as question}
            <form method="POST" action="?/saveReusableImageAnswer" class="answer-form">
              <input type="hidden" name="case_id" value={caseId} />
              <input type="hidden" name="asset_question_id" value={question.id} />
              <strong>{question.promptMd}</strong>
              <label>Canonical answer<textarea name="answer_md" rows="2" required maxlength="10000">{question.answerMd}</textarea></label>
              <div><button class="button small" type="submit">Save canonical answer</button></div>
            </form>
          {/each}
        </div>
      </details>
    {/if}
  {/if}
</section>

<style>
  h5, p { margin: 0; }
  h5 { font-size: 0.95rem; }
  .count, .muted, .heading p { color: #667085; font-size: 0.82rem; font-weight: 500; }
  .reusable-manager { display: grid; gap: 0.8rem; padding: 0.85rem; border: 1px solid #dfe5ee; border-radius: 8px; background: #f8fafc; }
  .heading { display: flex; justify-content: space-between; align-items: start; gap: 0.8rem; }
  .heading > div { display: grid; gap: 0.25rem; }
  .asset-link { color: #344054; font-size: 0.8rem; font-weight: 650; white-space: nowrap; }
  .group { display: grid; gap: 0.45rem; }
  .question-row { display: flex; justify-content: space-between; align-items: start; gap: 0.75rem; padding: 0.65rem; border: 1px solid #e4e7ec; border-radius: 7px; background: #fff; }
  .question-row > div { display: grid; gap: 0.2rem; min-width: 0; }
  .question-row span { color: #667085; font-size: 0.82rem; overflow-wrap: anywhere; }
  .empty { color: #667085; font-size: 0.84rem; }
  details { border: 1px solid #e4e7ec; border-radius: 7px; background: #fff; }
  summary { padding: 0.65rem 0.75rem; cursor: pointer; color: #344054; font-size: 0.84rem; font-weight: 650; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; padding: 0.75rem; }
  label { display: grid; gap: 0.3rem; color: #344054; font-size: 0.82rem; font-weight: 650; }
  textarea { width: 100%; box-sizing: border-box; padding: 0.55rem; border: 1px solid #cdd6e3; border-radius: 7px; background: #fff; font: inherit; resize: vertical; }
  .edit-list { display: grid; gap: 0.65rem; padding: 0.75rem; }
  .answer-form { display: grid; gap: 0.5rem; padding-bottom: 0.65rem; border-bottom: 1px solid #eaecf0; }
  .answer-form:last-child { padding-bottom: 0; border-bottom: 0; }
  .button { display: inline-block; padding: 0.6rem 0.8rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; cursor: pointer; font: inherit; }
  .button.small { padding: 0.5rem 0.65rem; font-size: 0.82rem; }
  .button.danger { border-color: #fecdca; color: #b42318; }
  @media (max-width: 760px) { .heading, .question-row { flex-direction: column; } .asset-link { white-space: normal; } .form-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
