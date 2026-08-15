<script>
  let { data, form } = $props();
  let selectedCase = $derived(data.selectedCase);
</script>

<svelte:head><title>{selectedCase?.case.title ?? 'Case'} | Admin | Flash-Cards</title></svelte:head>

{#if !selectedCase}
  <section class="panel"><h1>Case not found</h1><p class="muted">This Case may be inactive or no longer available.</p><a class="button" href="/admin/cases">Back to Cases</a></section>
{:else}
  <section class="page-heading">
    <div>
      <p class="eyebrow">Case editor</p>
      <h1>{selectedCase.case.title}</h1>
      <p class="muted">Topic: {#if selectedCase.case.conceptId}<a class="topic-link" href={'/admin/topics/' + selectedCase.case.conceptId}>{selectedCase.case.conceptName}</a>{:else}No primary Topic assigned{/if}</p>
    </div>
    <div class="actions"><a class="button" href="/admin/cases">All Cases</a><a class="button primary" href="/study">Preview in Study</a></div>
  </section>

  {#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

  <div class="authoring-rule"><strong>Authoring rule:</strong> keep knowledge at the highest level where its answer stays correct. Topic questions are shared; Case questions belong to this clinical presentation; image-specific questions belong only to the selected image.</div>

  <nav class="section-nav" aria-label="Case editor sections">
    <a href="#case">Case</a><a href="#questions">Case questions <span>{selectedCase.questions.length}</span></a><a href="#images">Fixed images <span>{selectedCase.attached.length}</span></a><a href="#stimuli">Alternative images <span>{selectedCase.stimulusGroups.length}</span></a><a href="#preview">Preview</a>
  </nav>

  <section id="case" class="panel stack">
    <div><p class="eyebrow">Clinical presentation</p><h2>Case</h2><p class="muted">Cases under the same Topic can have different stems, causes, findings, or educational intent. The internal title is not shown to learners.</p></div>
    <form method="POST" action="?/updateCase" class="form-grid">
      <input type="hidden" name="case_id" value={selectedCase.case.id} />
      <label>Internal Case title<input name="title" value={selectedCase.case.title} maxlength="300" required /></label>
      <label>Primary Topic<select name="concept_id" required>{#each data.concepts as concept}<option value={concept.id} selected={concept.id === selectedCase.case.conceptId}>{concept.name}</option>{/each}</select></label>
      <label class="wide">Case stem / vignette <span class="muted">(optional)</span><textarea name="vignette_md" rows="7" maxlength="5000">{selectedCase.case.vignetteMd ?? ''}</textarea></label>
      <label>Questions per Review<select name="question_selection_mode"><option value="automatic" selected={selectedCase.case.questionSelectionMode === 'automatic'}>Automatic</option><option value="all" selected={selectedCase.case.questionSelectionMode === 'all'}>Ask all eligible</option><option value="fixed" selected={selectedCase.case.questionSelectionMode === 'fixed'}>Choose N questions</option></select></label>
      <label>Question count <span class="muted">(used for Choose N)</span><input type="number" name="question_count" min="1" value={selectedCase.case.questionCount ?? ''} /></label>
      <div class="wide"><button class="button primary" type="submit">Save Case</button></div>
    </form>
  </section>

  <section id="questions" class="panel stack">
    <div><p class="eyebrow">This clinical presentation</p><h2>Case questions <span class="count">{selectedCase.questions.length}</span></h2><p class="muted">Use this level when the answer depends on this Case. If the same answer remains valid across the Topic, mark it reusable instead of duplicating it.</p></div>
    <form method="POST" action="?/saveQuestion" class="form-grid">
      <input type="hidden" name="case_id" value={selectedCase.case.id} />
      <label>Question prompt<textarea name="prompt_md" rows="3" maxlength="2000" required placeholder="e.g. What is the likely cause in this patient?"></textarea></label>
      <label>Answer<textarea name="answer_md" rows="3" maxlength="5000" required placeholder="The answer shown after reveal."></textarea></label>
      <label class="checkbox-label"><input name="reusable_for_topic" type="checkbox" /> Share this question with the Topic</label>
      <div><button class="button primary" type="submit">Add Case question</button></div>
    </form>
    {#if selectedCase.questions.length === 0}<p class="empty-state">No Case-specific questions yet. Compatible Topic questions can still be used in Reviews.</p>{/if}
    <div class="question-list">
      {#each selectedCase.questions as question, index}
        <article class="question-card">
          <div class="card-heading"><strong>Question {index + 1}</strong>{#if question.reusableForTopic}<span class="badge">Shared with {selectedCase.case.conceptName}</span>{/if}</div>
          <form method="POST" action="?/saveQuestion" class="stack">
            <input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="original_prompt_id" value={question.questionPromptId} />
            <label>Prompt<textarea name="prompt_md" rows="2" maxlength="2000" required>{question.promptMd}</textarea></label>
            <label>Answer<textarea name="answer_md" rows="3" maxlength="5000" required>{question.answerMd}</textarea></label>
            <label class="checkbox-label"><input name="reusable_for_topic" type="checkbox" checked={question.reusableForTopic} /> Share this question with the Topic</label>
            <div class="actions"><button class="button" type="submit">Save question</button></div>
          </form>
          <div class="actions"><form method="POST" action="?/reorderQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><input type="hidden" name="direction" value="up" /><button class="button small" type="submit" disabled={index === 0}>Move up</button></form><form method="POST" action="?/reorderQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><input type="hidden" name="direction" value="down" /><button class="button small" type="submit" disabled={index === selectedCase.questions.length - 1}>Move down</button></form><form method="POST" action="?/removeQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><button class="button danger small" type="submit">Remove</button></form></div>
        </article>
      {/each}
    </div>
  </section>

  <section id="images" class="panel stack">
    <div><p class="eyebrow">Always shown with this Case</p><h2>Fixed images <span class="count">{selectedCase.attached.length}</span></h2><p class="muted">Keep an image fixed when it should appear in every Review of this Case. If several images are interchangeable examples, start an alternative set directly from one of the fixed images below.</p></div>
    <div class="image-columns">
      <div class="stack">
        <h3>Fixed images</h3>
        {#if selectedCase.attached.length === 0}<p class="empty-state">No fixed images attached yet.</p>{/if}
        {#each selectedCase.attached as asset, index}
          <article class="asset-card">
            <div class="asset-topline"><span class="order-badge">{index + 1}</span>{#if asset.imageUrl}<img src={asset.imageUrl} alt={asset.altText ?? ''} width="140" height="100" />{:else}<div class="inactive-image">Inactive image</div>{/if}<div class="asset-details"><strong>{asset.originalFilename ?? asset.assetId}</strong><span class="muted">{asset.altText || 'No alt text'}</span>{#if asset.sourceLabel}<span class="muted">Source: {asset.sourceLabel}</span>{/if}</div></div>
            <form method="POST" action="?/caption" class="stack"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><label>Case-specific caption<textarea name="caption" rows="2" maxlength="1000">{asset.captionMd ?? ''}</textarea></label><button class="button small" type="submit">Save caption</button></form>
            <div class="actions"><form method="POST" action="?/reorder"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><input type="hidden" name="direction" value="up" /><button class="button small" type="submit" disabled={index === 0}>Move up</button></form><form method="POST" action="?/reorder"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><input type="hidden" name="direction" value="down" /><button class="button small" type="submit" disabled={index === selectedCase.attached.length - 1}>Move down</button></form><form method="POST" action="?/detach"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><button class="button danger small" type="submit">Detach</button></form></div>
            <form method="POST" action="?/startAlternativeSet" class="move-to-alternatives">
              <input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} />
              <label>Start a new alternative set from this image<input name="set_name" required placeholder="e.g. ECG" /></label>
              <button class="button small" type="submit">Start alternative set</button>
            </form>
            {#if selectedCase.stimulusGroups.length > 0}<form method="POST" action="?/addStimulusOption" class="move-to-alternatives"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><input type="hidden" name="convert_fixed" value="on" /><label>Or move into an existing set<select name="group_id" required><option value="">Choose alternative set</option>{#each selectedCase.stimulusGroups as group}<option value={group.id}>{group.name}</option>{/each}</select></label><button class="button small" type="submit">Move into set</button></form>{/if}
          </article>
        {/each}
      </div>
      <div class="stack">
        <h3>Image library</h3>
        {#if selectedCase.available.length === 0}<p class="empty-state">All active images are already used in this Case.</p>{/if}
        {#each selectedCase.available as asset}
          <article class="asset-card"><div class="asset-topline"><img src={asset.imageUrl} alt={asset.altText ?? ''} width="140" height="100" /><div class="asset-details"><strong>{asset.originalFilename ?? asset.assetId}</strong><span class="muted">{asset.altText || 'No alt text'}</span></div></div><form method="POST" action="?/attach"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><button class="button primary small" type="submit">Add as fixed image</button></form></article>
        {/each}
      </div>
    </div>
    <div class="upload-box"><div><h3>Upload a new image</h3><p class="muted">JPEG or PNG, up to 5 MiB. The uploaded Asset can be reused in other Cases.</p></div><form method="POST" action="?/upload" enctype="multipart/form-data" class="form-grid"><label class="wide">Image file<input name="image" type="file" accept="image/jpeg,image/png" required /></label><label>Alt text<input name="alt_text" maxlength="500" required /></label><label>Source label <span class="muted">(optional)</span><input name="source_label" maxlength="300" /></label><label>Source URL <span class="muted">(optional)</span><input name="source_url" type="url" maxlength="2000" /></label><label>Licence / permission <span class="muted">(optional)</span><input name="licence" maxlength="500" /></label><div class="wide"><button class="button primary" type="submit">Upload image</button></div></form></div>
  </section>

  <section id="stimuli" class="panel stack">
    <div><p class="eyebrow">Optional variation</p><h2>Alternative images <span class="count">{selectedCase.stimulusGroups.length}</span></h2><p class="muted">Use an alternative set when the Case stays the same but the example image can vary between attempts. Topic and Case questions remain reusable; add image-specific questions only for what changes with the exact image.</p></div>

    <form method="POST" action="?/createStimulusGroup" class="start-alternative-form">
      <input type="hidden" name="case_id" value={selectedCase.case.id} />
      <input type="hidden" name="specific_question_mode" value="none" />
      <label>Create an empty alternative image set<input name="name" required placeholder="e.g. ECG" /></label>
      <button class="button" type="submit">Create empty set</button>
    </form>
    <p class="muted helper-copy">The quickest path is to start a set from a fixed image above, then add another image here. Creating an empty set is useful when none of the current fixed images should become an alternative. Each Review selects one active image from each active set.</p>

    {#if selectedCase.stimulusGroups.length === 0}<p class="empty-state">No alternative image sets yet. Start one from a fixed image above, or create an empty set here.</p>{/if}
    {#each selectedCase.stimulusGroups as group}
      <article class="alternative-set">
        <div class="card-heading"><div><p class="eyebrow">Alternative set</p><h3>{group.name} <span class="count">{group.options.length} images</span></h3></div><span class:inactive={!group.isActive} class="status-badge">{group.isActive ? 'Active' : 'Inactive'}</span></div>

        <div class="stack">
          <h4>Images in this set</h4>
          <form method="POST" action="?/addStimulusOption" class="form-grid">
            <input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} />
            <label>Choose image<select name="asset_id" required><option value="">Choose an image from the library</option>{#each selectedCase.available as asset}<option value={asset.assetId}>{asset.originalFilename ?? asset.assetId}</option>{/each}</select></label>
            <label>Caption <span class="muted">(optional)</span><input name="caption" placeholder="Context for this Case only" /></label>
            <div><button class="button primary" type="submit">Add alternative image</button></div>
          </form>

          {#if group.options.length === 0}<p class="empty-state">No images in this set yet.</p>{/if}
          {#each group.options as option, optionIndex}
            <div class="asset-card">
              <div class="asset-topline">{#if option.imageUrl}<img src={option.imageUrl} alt={option.altText ?? 'Alternative image'} />{:else}<div class="inactive-image">Inactive image</div>{/if}<div class="asset-details"><strong>{option.originalFilename ?? option.assetId}</strong><span>{option.captionMd ?? 'No option caption'}</span><span class="muted">{option.isActive && option.assetIsActive ? 'Active image' : 'Inactive image'}</span></div></div>
              <div class="actions"><form method="POST" action="?/reorderStimulusOption"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} /><input type="hidden" name="option_id" value={option.id} /><input type="hidden" name="direction" value="up" /><button class="button small" disabled={optionIndex === 0}>Move up</button></form><form method="POST" action="?/reorderStimulusOption"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} /><input type="hidden" name="option_id" value={option.id} /><input type="hidden" name="direction" value="down" /><button class="button small" disabled={optionIndex === group.options.length - 1}>Move down</button></form><form method="POST" action="?/setStimulusOptionActive"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="option_id" value={option.id} /><input type="hidden" name="active" value={option.isActive ? 'false' : 'true'} /><button class="button small" type="submit">{option.isActive ? 'Deactivate' : 'Reactivate'}</button></form></div>

              <div class="specific-questions">
                <div><strong>Questions specific to this image</strong><p class="muted">Only use these when the exact selected image changes relevance or the correct answer.</p></div>
                <form method="POST" action="?/saveStimulusOptionQuestion" class="form-grid"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="option_id" value={option.id} /><label>Question prompt<textarea name="prompt_md" rows="2" required placeholder="e.g. Describe this ECG."></textarea></label><label>Answer for this image<textarea name="answer_md" rows="2" required></textarea></label><div><button class="button small" type="submit">Add image-specific question</button></div></form>
                {#each group.optionQuestions.filter((question) => question.stimulusGroupOptionId === option.id) as question}<div class="question-card compact"><strong>{question.promptMd}</strong><span>{question.answerMd}</span><form method="POST" action="?/removeStimulusQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="scope" value="option" /><input type="hidden" name="context_id" value={option.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><button class="button danger small" type="submit">Remove</button></form></div>{/each}
              </div>
            </div>
          {/each}
        </div>

        <details class="advanced">
          <summary>Advanced set settings</summary>
          <div class="advanced-body stack">
            <p class="muted">Coverage controls how strongly questions specific to this alternative set are represented in a Review.</p>
            <form method="POST" action="?/updateStimulusGroup" class="form-grid">
              <input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} />
              <label>Set name<input name="name" value={group.name} required /></label>
              <label>Specific-question coverage<select name="specific_question_mode"><option value="none" selected={group.specificQuestionMode === 'none'}>No guarantee</option><option value="minimum" selected={group.specificQuestionMode === 'minimum'}>At least N</option><option value="all" selected={group.specificQuestionMode === 'all'}>All available</option></select></label>
              <label>Minimum specific questions <input type="number" name="minimum_specific_questions" min="1" value={group.minimumSpecificQuestions ?? ''} /></label>
              <label class="checkbox-label"><input type="checkbox" name="is_active" checked={group.isActive} /> Active set</label>
              <div><button class="button" type="submit">Save set settings</button></div>
            </form>
          </div>
        </details>

        <details class="advanced">
          <summary>Advanced: questions shared by every image in this set</summary>
          <div class="advanced-body stack">
            <p class="muted">Use this only when a prompt and answer are valid for every image in this set but should not be a general Topic or Case question.</p>
            <form method="POST" action="?/saveStimulusGroupQuestion" class="form-grid"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="group_id" value={group.id} /><label>Question prompt<textarea name="prompt_md" rows="2" required></textarea></label><label>Answer<textarea name="answer_md" rows="2" required></textarea></label><div><button class="button" type="submit">Add set-wide question</button></div></form>
            {#each group.questions as question}<div class="question-card compact"><strong>{question.promptMd}</strong><span>{question.answerMd}</span><form method="POST" action="?/removeStimulusQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="scope" value="group" /><input type="hidden" name="context_id" value={group.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><button class="button danger small" type="submit">Remove</button></form></div>{/each}
          </div>
        </details>
      </article>
    {/each}
  </section>

  <section id="preview" class="panel preview-panel"><p class="eyebrow">Learner view</p><h2>Preview</h2><p class="muted">Open the Study flow to verify the Case stem, selected images, question composition, and answer reveal behaviour.</p><a class="button primary" href="/study">Open Study preview</a></section>
{/if}

<style>
  .page-heading, .card-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } h1, h2, h3, h4, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; } h3 { margin-bottom: 0.25rem; font-size: 1.05rem; } h4 { margin-bottom: 0.25rem; font-size: 0.95rem; } .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; } .topic-link { color: inherit; font-weight: 650; }
  .stack { display: grid; gap: 0.85rem; } .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; } .actions form { display: contents; } .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.small { padding: 0.5rem 0.65rem; font-size: 0.82rem; } .button.danger { border-color: #fecdca; color: #b42318; } button:disabled { cursor: not-allowed; opacity: 0.45; }
  .authoring-rule { margin: 1rem 0; padding: 0.8rem 0.9rem; border: 1px solid #cfd8e5; border-radius: 8px; background: #f8fafc; color: #344054; line-height: 1.5; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .form-error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #fef3f2; color: #b42318; } .section-nav { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 1.5rem 0 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #dfe5ee; } .section-nav a { padding: 0.55rem 0.7rem; border-radius: 6px; color: #344054; font-weight: 650; text-decoration: none; } .section-nav a:hover { background: #e9eef5; } .section-nav span, .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; } label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } textarea { resize: vertical; } .wide { grid-column: 1 / -1; } .checkbox-label { display: flex; align-items: center; gap: 0.45rem; font-weight: 500; } .checkbox-label input { width: auto; }
  .question-list, .image-columns { display: grid; gap: 0.85rem; } .question-card, .asset-card, .upload-box, .alternative-set { display: grid; gap: 0.75rem; padding: 0.85rem; border: 1px solid #eaecf0; border-radius: 8px; background: #f8fafc; } .alternative-set { gap: 1rem; background: #fff; } .question-card.compact { background: #fff; } .badge { color: #475467; font-size: 0.82rem; font-weight: 500; } .empty-state { padding: 0.85rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; } .image-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); } .asset-topline { display: flex; align-items: start; gap: 0.7rem; min-width: 0; } .asset-topline img, .inactive-image { flex: 0 0 140px; width: 140px; height: 100px; object-fit: contain; border-radius: 7px; background: #eef2f6; } .inactive-image { display: grid; place-items: center; color: #667085; font-size: 0.8rem; text-align: center; } .asset-details { display: grid; gap: 0.2rem; min-width: 0; overflow-wrap: anywhere; font-size: 0.88rem; } .order-badge { display: grid; place-items: center; flex: 0 0 1.6rem; height: 1.6rem; border-radius: 999px; background: #172033; color: #fff; font-size: 0.8rem; font-weight: 700; } .upload-box { margin-top: 0.25rem; background: #fff; }
  .move-to-alternatives, .start-alternative-form { display: flex; align-items: end; gap: 0.6rem; flex-wrap: wrap; padding-top: 0.7rem; border-top: 1px solid #e4e7ec; } .move-to-alternatives label, .start-alternative-form label { min-width: min(100%, 260px); flex: 1; } .helper-copy { margin-bottom: 0; } .specific-questions { display: grid; gap: 0.7rem; padding-top: 0.75rem; border-top: 1px solid #e4e7ec; } .specific-questions p { margin: 0.2rem 0 0; font-size: 0.88rem; }
  .advanced { border: 1px solid #e4e7ec; border-radius: 8px; background: #f8fafc; } .advanced summary { padding: 0.75rem 0.85rem; cursor: pointer; color: #344054; font-weight: 650; } .advanced-body { padding: 0 0.85rem 0.85rem; } .status-badge { display:inline-block; padding:.2rem .45rem; border-radius:999px; background:#ecfdf3; color:#027a48; font-size:.78rem; font-weight:650; white-space:nowrap; } .status-badge.inactive { background:#f2f4f7; color:#667085; }
  .preview-panel { padding-bottom: 1.4rem; } @media (max-width: 760px) { .page-heading, .card-heading { align-items: start; flex-direction: column; } .image-columns, .form-grid { grid-template-columns: minmax(0, 1fr); } .wide { grid-column: auto; } } @media (max-width: 480px) { .asset-topline { flex-wrap: wrap; } .asset-topline img, .inactive-image { flex-basis: 100%; width: 100%; height: 160px; } }
</style>
