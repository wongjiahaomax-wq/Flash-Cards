<script>
  let { data, form } = $props();
  let detail = $derived(data.detail);
  /** @param {string} optionId @param {string} questionId */
  const opted = (optionId, questionId) => data.optedKeys?.includes(`${optionId}:${questionId}`) ?? false;
</script>

<svelte:head><title>{detail?.asset.originalFilename ?? 'Image'} | Admin | Flash-Cards</title></svelte:head>

{#if !detail}
  <section class="panel"><h1>Image not found</h1><p class="muted">This Asset may not exist.</p><a class="button" href="/admin/images">Back to Images</a></section>
{:else}
  <section class="page-heading"><div><p class="eyebrow">Asset detail</p><h1>{detail.asset.originalFilename ?? 'Unnamed image'}</h1><p class="muted">Stable Asset ID: {detail.asset.id}</p></div><div class="actions"><a class="button" href="/admin/images">All Images</a><a class="button" href="/admin/cases">Cases</a></div></section>

  {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
  {#if data.status === 'saved'}<p class="success" role="status">Asset metadata saved. The R2 object and its storage key were unchanged.</p>{/if}
  {#if data.status === 'uploaded'}<p class="success" role="status">Image uploaded. You can now maintain its Asset metadata.</p>{/if}
  {#if data.status === 'replaced'}<p class="success" role="status">Higher-resolution replacement created. Current production relationships now use this new Asset; active unfinished Reviews retain their frozen previous-image snapshots.</p>{/if}
  {#if data.status?.startsWith('reusable') || data.status === 'reused' || data.status === 'removed-from-case'}<p class="success" role="status">Reusable image questions updated.</p>{/if}

  {#if data.replacement?.supersededBy}
    <p class="lineage-notice" role="status">This Asset has been superseded. Its old R2 object remains available while active unfinished Reviews may still reference a frozen snapshot. Current authoring uses <a href={`/admin/images/${data.replacement.supersededBy.id}`}>{data.replacement.supersededBy.originalFilename ?? data.replacement.supersededBy.id}</a>.</p>
  {:else if data.replacement?.supersedes}
    <p class="lineage-notice" role="status">This Asset is the current higher-resolution replacement for <a href={`/admin/images/${data.replacement.supersedes.id}`}>{data.replacement.supersedes.originalFilename ?? data.replacement.supersedes.id}</a>.</p>
  {/if}

  <div class="detail-grid">
    <section class="panel preview-panel">
      <p class="eyebrow">Protected preview</p>
      {#if detail.asset.imageUrl}<img class="large-preview" src={detail.asset.imageUrl} alt={detail.asset.altText ?? ''} />{:else}<div class="inactive-preview">Inactive image is not served through the current Asset route.</div>{/if}
      <p class="muted">Runtime image delivery uses the protected R2-backed Asset route. Active unfinished Reviews use their own authenticated frozen-snapshot route. The source URL below is attribution/reference metadata only.</p>
    </section>

    <section class="panel">
      <p class="eyebrow">Global metadata</p>
      <h2>Edit Asset</h2>
      <p class="muted">Renaming changes <code>assets.original_filename</code> in D1 only. Case-specific captions stay in each Case editor. Collection is Image Library organisation, separate from educational Topics and Tags.</p>
      <form method="POST" action="?/saveMetadata" class="form-grid">
        <label class="wide">Image name<input name="original_filename" value={detail.asset.originalFilename ?? ''} maxlength="300" /></label>
        <label class="wide">Alt text<textarea name="alt_text" rows="4" maxlength="500">{detail.asset.altText ?? ''}</textarea></label>
        <label class="wide">Collection<select name="image_collection_id"><option value="" selected={!detail.asset.imageCollectionId}>Unsorted</option>{#each data.collections as collection}<option value={collection.id} selected={detail.asset.imageCollectionId === collection.id}>{collection.name}</option>{/each}</select><span class="muted">Image Library organisation only. This does not change Case Topics, Tags, captions or learner behaviour.</span></label>
        <label>Source label <span class="muted">(optional)</span><input name="source_label" value={detail.asset.sourceLabel ?? ''} maxlength="300" /></label>
        <label>Source URL <span class="muted">(optional)</span><input name="source_url" type="url" value={detail.asset.sourceUrl ?? ''} maxlength="2000" /></label>
        <label class="wide">Licence / permission <span class="muted">(optional)</span><input name="licence" value={detail.asset.licence ?? ''} maxlength="500" /></label>
        <label class="checkbox-label wide"><input name="is_active" type="checkbox" checked={detail.asset.isActive} disabled={Boolean(data.replacement?.supersededByAssetId)} /> Active and available for learner image delivery</label>
        {#if data.replacement?.supersededByAssetId}<p class="muted wide compact">Superseded Assets cannot be reactivated. Use the current replacement Asset instead.</p>{/if}
        <div class="wide"><button class="button primary" type="submit">Save metadata</button></div>
      </form>
    </section>
  </div>

  <section class="panel replacement-panel" id="higher-resolution-replacement">
    <div class="panel-heading"><div><p class="eyebrow">Same image · better media</p><h2>Replace with higher-resolution version</h2></div><span class="muted">Production Admin only</span></div>
    <p>This workflow is only for a better-quality copy of the <strong>same underlying image</strong>. A different ECG, X-ray, photograph or diagram — even when it shows the same diagnosis — must be uploaded as a separate Asset.</p>

    {#if data.replacement?.livePreviewUsage?.hasUsage}
      <p class="error" role="status">Replacement is temporarily blocked because this image is referenced by an active Preview workspace. Reset that Preview workspace or let it expire, then retry.</p>
    {:else if data.replacement?.canReplace}
      <div class="impact-box">
        <strong>This will:</strong>
        <ul>
          <li>create a new immutable Asset and R2 object;</li>
          <li>move {data.replacement.impact.fixedCaseRelationships} fixed Case image {data.replacement.impact.fixedCaseRelationships === 1 ? 'relationship' : 'relationships'} to the new Asset;</li>
          <li>move {data.replacement.impact.stimulusOptions} alternative-image {data.replacement.impact.stimulusOptions === 1 ? 'option' : 'options'} while preserving every Stimulus Option ID;</li>
          <li>clone {data.replacement.impact.reusableImageQuestions} reusable Image {data.replacement.impact.reusableImageQuestions === 1 ? 'Question' : 'Questions'} to the new Asset and remap current production opt-ins;</li>
          <li>preserve Case-specific exact-image questions because their Stimulus Option identities do not change;</li>
          <li>keep this old Asset and its old R2 bytes available for any active unfinished Review that already froze them, then mark this Asset superseded/inactive.</li>
        </ul>
      </div>
      <form method="POST" action="?/replaceHigherResolution" enctype="multipart/form-data" class="replacement-form">
        <label>Higher-resolution copy<input name="image" type="file" accept="image/jpeg,image/png" required /></label>
        <label class="checkbox-label confirmation"><input name="confirm_same_image" type="checkbox" value="yes" required /> I confirm this is the same underlying image at better quality/resolution, not a different image showing the same condition.</label>
        <button class="button primary" type="submit">Create replacement Asset</button>
      </form>
    {:else if data.replacement?.supersededBy}
      <p class="muted">This superseded Asset has already been replaced. To make a further quality upgrade, open the current replacement and replace that Asset, producing a natural A → B → C chain.</p>
    {:else}
      <p class="muted">Only an active production image Asset that has not already been superseded is eligible for this operation.</p>
    {/if}
  </section>

  <section class="panel" id="reusable-questions">
    <div class="panel-heading"><div><p class="eyebrow">Question scope</p><h2>Reusable with this image</h2></div><span class="muted">Production Admin only · exact Asset identity</span></div>
    <p class="muted">These are canonical questions whose wording and answer are intrinsically true of this exact image. Reusing this Asset in another Case does <strong>not</strong> add any question automatically; each Case/stimulus must opt in explicitly. Use the Case-specific image-question workflow for context-dependent answers.</p>

    <form method="POST" action="?/createReusableQuestion" class="question-create">
      <label>Question<input name="prompt_md" required maxlength="2000" placeholder="What does this ECG show?" /></label>
      <label>Canonical answer<textarea name="answer_md" required rows="3" maxlength="10000"></textarea></label>
      <button class="button primary" type="submit">Create reusable image question</button>
    </form>

    {#if data.reusableQuestions.length === 0}
      <p class="empty-state">No reusable questions have been defined for this Asset.</p>
    {:else}
      <div class="question-list">
        {#each data.reusableQuestions as question}
          <article class="question-card">
            <div class="question-heading"><div><strong>{question.promptMd}</strong><small>{question.usageCount} Case stimulus {question.usageCount === 1 ? 'usage' : 'usages'} · {question.isActive && question.promptIsActive ? 'Active' : 'Inactive'}</small></div><span class="shared-badge">Shared canonical content</span></div>
            <form method="POST" action="?/saveReusableAnswer" class="answer-form">
              <input type="hidden" name="asset_question_id" value={question.id} />
              <label>Canonical answer<textarea name="answer_md" rows="3" required maxlength="10000">{question.answerMd}</textarea></label>
              <p class="muted compact">Changing this answer affects all current opt-ins for future Reviews. Existing active Review snapshots remain unchanged.</p>
              <button class="button" type="submit">Save canonical answer</button>
            </form>
            <form method="POST" action="?/setReusableActive" class="inline-form">
              <input type="hidden" name="asset_question_id" value={question.id} />
              <input type="hidden" name="active" value={question.isActive ? 'false' : 'true'} />
              <button class="button" type="submit">{question.isActive ? 'Archive reusable question' : 'Reactivate reusable question'}</button>
            </form>

            {#if question.isActive}
              <div class="reuse-section">
                <strong>Case/stimulus opt-ins</strong>
                {#if detail.currentUsages.length === 0}<p class="muted compact">Attach this active Asset to an active Case relationship before reusing the question.</p>{/if}
                {#each detail.currentUsages as usage}
                  <div class="reuse-row">
                    <span><a href={`/admin/cases/${usage.caseId}`}>{usage.caseTitle}</a>{#if usage.stimulusGroupName}<small>{usage.stimulusGroupName}</small>{:else}<small>Fixed image · converts transparently to a one-option image set on opt-in</small>{/if}</span>
                    {#if usage.stimulusOptionId && opted(usage.stimulusOptionId, question.id)}
                      <form method="POST" action="?/removeReusable" class="inline-form"><input type="hidden" name="option_id" value={usage.stimulusOptionId} /><input type="hidden" name="asset_question_id" value={question.id} /><button class="button" type="submit">Remove from this Case</button></form>
                    {:else}
                      <form method="POST" action="?/optInReusable" class="inline-form"><input type="hidden" name="case_id" value={usage.caseId} /><input type="hidden" name="option_id" value={usage.stimulusOptionId ?? ''} /><input type="hidden" name="asset_question_id" value={question.id} /><button class="button" type="submit">Reuse in this Case</button></form>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="panel usage-panel"><div class="panel-heading"><div><p class="eyebrow">Relationship usage</p><h2>Retained Case relationships <span class="count">{detail.usages.length}</span></h2></div><span class="muted">{detail.asset.usageCount} current {detail.asset.usageCount === 1 ? 'Case' : 'Cases'} · historical authored relationships remain visible for context.</span></div>
    {#if detail.usages.length === 0}<p class="empty-state">This image has no retained production Case relationship.</p>{:else}<div class="usage-list">{#each detail.usages as usage}<a class="usage-row" href={`/admin/cases/${usage.caseId}`}><span><strong>{usage.caseTitle}</strong>{#if usage.stimulusGroupName}<small>Alternative stimulus: {usage.stimulusGroupName}</small>{/if}{#if usage.removedFromCase}<small>Removed from Case</small>{:else if usage.stimulusOptionId && !usage.stimulusOptionIsActive}<small>Deactivated alternative</small>{:else if usage.stimulusGroupId && !usage.stimulusGroupIsActive}<small>Inactive alternative set</small>{/if}{#if usage.captionMd}<small>Case caption: {usage.captionMd}</small>{/if}</span><span class="usage-status">{usage.relationshipIsCurrent ? 'Current' : usage.caseIsActive ? 'Historical authored relationship' : 'Inactive Case'} →</span></a>{/each}</div>{/if}
  </section>
{/if}

<style>
  .page-heading, .panel-heading, .question-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.25rem; font-size: 1.15rem; } .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; } .compact { margin: 0.35rem 0; font-size: 0.88rem; } code { font-size: 0.9em; }
  .actions, .inline-form { display: flex; flex-wrap: wrap; gap: 0.6rem; } .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .detail-grid { display: grid; grid-template-columns: minmax(240px, 0.85fr) minmax(0, 1.15fr); gap: 1rem; } .preview-panel { align-self: start; } .large-preview, .inactive-preview { display: grid; place-items: center; width: 100%; min-height: 300px; max-height: 560px; object-fit: contain; border-radius: 8px; background: #eef2f6; } .inactive-preview { color: #667085; }
  .form-grid, .question-create { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; } .question-create { margin-top: 1rem; padding: 1rem; border: 1px dashed #cdd6e3; border-radius: 8px; } label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } textarea { resize: vertical; } .wide { grid-column: 1 / -1; } .checkbox-label { display: flex; align-items: center; gap: 0.45rem; font-weight: 500; } .checkbox-label input { width: auto; } .success, .error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; } .success { background: #ecfdf3; color: #027a48; } .error { border: 1px solid #fecdca; background: #fef3f2; color: #b42318; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .lineage-notice, .impact-box { margin: 1rem 0; padding: 0.85rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #f8fafc; } .replacement-panel p { max-width: 78ch; } .impact-box ul { margin-bottom: 0; padding-left: 1.25rem; } .impact-box li + li { margin-top: 0.3rem; } .replacement-form { display: grid; gap: 0.85rem; max-width: 760px; margin-top: 1rem; } .confirmation { align-items: start; padding: 0.8rem; border: 1px solid #dfe5ee; border-radius: 8px; }
  .question-list { display: grid; gap: 1rem; margin-top: 1rem; } .question-card { padding: 1rem; border: 1px solid #dfe5ee; border-radius: 8px; } .question-heading { align-items: start; } .question-heading div, .reuse-row span:first-child { display: grid; gap: 0.2rem; } .question-heading small, .reuse-row small { color: #667085; } .shared-badge { padding: 0.25rem 0.5rem; border-radius: 999px; background: #f2f4f7; color: #475467; font-size: 0.75rem; white-space: nowrap; } .answer-form { margin-top: 0.9rem; } .reuse-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eaecf0; } .reuse-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.7rem 0; border-bottom: 1px solid #f2f4f7; } .reuse-row:last-child { border-bottom: 0; }
  .usage-list { display: grid; margin-top: 1rem; } .usage-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.8rem 0.4rem; border-bottom: 1px solid #eaecf0; color: #172033; text-decoration: none; } .usage-row:last-child { border-bottom: 0; } .usage-row span:first-child { display: grid; gap: 0.2rem; } .usage-row small { color: #667085; } .usage-status { color: #667085; font-size: 0.86rem; white-space: nowrap; } .empty-state { margin-top: 1rem; padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  @media (max-width: 760px) { .page-heading, .panel-heading, .question-heading { align-items: start; flex-direction: column; } .detail-grid, .form-grid, .question-create { grid-template-columns: minmax(0, 1fr); } .wide { grid-column: auto; } .usage-row, .reuse-row { align-items: start; flex-direction: column; gap: 0.3rem; } }
</style>