<script>
  let { data, form } = $props();
  let plan = $derived(data.plan);
  let decodedDimensions = $state(/** @type {Record<string, string>} */ ({}));

  /** @param {any} context */
  function contextLabel(context) {
    if (context.case?.previewSessionId) return 'Retained Preview context';
    if (context.relationship === 'fixed') return context.case?.isActive ? 'Current learner-relevant fixed image' : 'Retained inactive Case';
    if (!context.group?.is_active || !context.is_active || context.removed_from_case) return 'Retained inactive/removed Stimulus Option';
    return context.case?.isActive ? 'Current learner-relevant Stimulus Option' : 'Retained inactive Case Stimulus Option';
  }

  /** @param {any[]} questions @param {string} assetId */
  function questionsForAsset(questions, assetId) {
    return questions.filter((question) => question.asset_id === assetId);
  }

  /** @param {any} conflict */
  function isResolutionConflict(conflict) {
    return conflict.resolutionRequired;
  }

  /** @param {any[]} ancestry */
  function ancestryLabel(ancestry) {
    return ancestry.map((item) => `${item.name} (ID ${item.id})`).join(' → ');
  }

  /** @param {string} assetId @param {Event} event */
  function recordDecodedDimensions(assetId, event) {
    const image = /** @type {HTMLImageElement} */ (event.currentTarget);
    if (!image?.naturalWidth || !image?.naturalHeight) return;
    decodedDimensions[assetId] = `${image.naturalWidth} × ${image.naturalHeight} px`;
  }

  /** @param {any} asset @param {string} id @param {string} label */
  function displayAsset(asset, id, label) {
    return asset ?? {
      id,
      original_filename: `${label} Asset no longer exists`,
      alt_text: null,
      source_label: null,
      source_url: null,
      licence: null,
      image_collection_id: null,
      mime_type: 'unknown',
      storage_key: 'unavailable',
      is_active: false,
      preview_session_id: null,
      superseded_by_asset_id: null,
      deduplicated_into_asset_id: null,
      imageUrl: null
    };
  }
</script>

<svelte:head><title>Compare image Assets | Admin | Flash-Cards</title></svelte:head>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{#if data.error}<p class="error" role="alert">{data.error}</p>{/if}

{#if !plan}
  <section class="panel"><p class="eyebrow">Image maintenance</p><h1>Compare image Assets</h1><p class="muted">Select exactly two eligible Production images from the Image Library to begin a server-owned certification comparison.</p><a class="button" href="/admin/images">Back to Images</a></section>
{:else}
  <section class="page-heading"><div><p class="eyebrow">Human-certified canonical merge</p><h1>Compare / merge duplicates</h1><p class="muted">Visual similarity never proves identity. Review every retained context before selecting the canonical survivor.</p></div><a class="button" href="/admin/images">Back to Images</a></section>

  {#if plan.blockers.length}<section class="panel blocker-panel" aria-labelledby="blockers-heading"><h2 id="blockers-heading">Merge blocked</h2><p class="muted">These server-owned blockers must be resolved before certification.</p><ul>{#each plan.blockers as blocker}<li>{blocker.message}</li>{/each}</ul></section>{/if}
  {#if plan.questionResolutionBlockers.length}<section class="panel question-blocker" aria-labelledby="question-blockers-heading"><h2 id="question-blockers-heading">Answer resolutions required</h2><p class="muted">Choose exactly one current answer for every same-Prompt conflict. The selected survivor Asset Question ID remains canonical.</p><ul>{#each plan.questionResolutionBlockers as blocker}<li>{blocker.message}</li>{/each}</ul></section>{/if}

  <form method="POST" action="?/merge">
    <input type="hidden" name="survivor_asset_id" value={plan.survivorAssetId} />
    <input type="hidden" name="duplicate_asset_id" value={plan.duplicateAssetId} />
    <input type="hidden" name="merge_plan_fingerprint" value={plan.mergePlanFingerprint} />

    <section class="comparison-grid" aria-label="Image comparison">
      {#each [displayAsset(plan.survivor, plan.survivorAssetId, 'Selected survivor'), displayAsset(plan.duplicate, plan.duplicateAssetId, 'Selected duplicate')] as asset, index}
        <article class:survivor-card={index === 0} class="panel image-column">
          <p class="eyebrow">{index === 0 ? 'Selected survivor A' : 'Duplicate/source B'}</p>
          {#if asset.imageUrl}<img class="large-preview" src={asset.imageUrl} alt={asset.alt_text ?? ''} onload={(event) => recordDecodedDimensions(asset.id, event)} />{:else}<div class="missing-preview">Authoritative R2 object unavailable</div>{/if}
          <h2>{asset.original_filename ?? 'Unnamed image'}</h2>
          <dl class="metadata"><dt>Asset ID</dt><dd>{asset.id}</dd><dt>Alt text</dt><dd>{asset.alt_text ?? 'None'}</dd><dt>Source</dt><dd>{asset.source_label ?? 'Unknown'}{#if asset.source_url} · {asset.source_url}{/if}</dd><dt>Licence</dt><dd>{asset.licence ?? 'Unknown'}</dd><dt>Collection</dt><dd>{asset.image_collection_id ?? 'Unsorted'}</dd><dt>MIME / storage</dt><dd>{asset.mime_type} · {asset.storage_key}</dd>{#if decodedDimensions[asset.id]}<dt>Dimensions</dt><dd>{decodedDimensions[asset.id]}</dd>{/if}<dt>Lifecycle</dt><dd>{asset.is_active ? 'Active' : 'Inactive'} · {asset.preview_session_id ? 'Preview-owned' : 'Production'} · {asset.superseded_by_asset_id ? `Superseded by ${asset.superseded_by_asset_id}` : 'Not superseded'} · {asset.deduplicated_into_asset_id ? `Deduplicated into ${asset.deduplicated_into_asset_id}` : 'Not deduplicated'}</dd></dl>
        </article>
      {/each}
    </section>

    <section class="panel" aria-labelledby="contexts-heading"><h2 id="contexts-heading">Retained Case, vignette and Stimulus evidence</h2><p class="muted">Every retained relationship participates in certification, including inactive Cases and removed options. Persisted text is displayed literally.</p><div class="context-grid">{#each plan.contexts as context}<article class="context-card"><span class="context-label">{contextLabel(context)}</span><h3>{context.case?.title ?? 'Unknown Case'}</h3><p class="muted">Case ID {context.case?.id} · {context.case?.isActive ? 'Active' : 'Inactive'}{#if context.case?.previewSessionId} · Preview {context.case.previewSessionId}{/if}</p><p><strong>Primary Topic:</strong> {context.primaryTopic ? `${context.primaryTopic.name} (ID ${context.primaryTopic.id})` : 'Unassigned'}{#if context.systemAncestry.length} · <strong>System ancestry:</strong> {ancestryLabel(context.systemAncestry)}{/if}</p><h4>Full vignette</h4><pre>{context.case?.vignetteMd ?? ''}</pre><h4>Retained Case Questions</h4>{#if context.caseQuestions.length}<ul>{#each context.caseQuestions as question}<li><strong>Case Question {question.id}</strong> · Prompt ID {question.question_prompt_id}: {question.promptMd ?? ''} · {question.is_active ? 'Active' : 'Inactive'}<pre>{question.answer_md}</pre></li>{/each}</ul>{:else}<p class="muted">None retained.</p>{/if}{#if context.relationship === 'fixed'}<p><strong>Fixed relationship:</strong> order {context.display_order} · created {context.created_at} · caption</p><pre>{context.caption_md ?? ''}</pre>{:else}<h4>Stimulus Group / Option</h4><p><strong>Group:</strong> {context.group?.name ?? context.stimulus_group_id} (ID {context.stimulus_group_id}) · {context.group?.is_active ? 'Active' : 'Inactive'} · <strong>Option ID:</strong> {context.id} · order {context.display_order} · {context.is_active ? 'Active' : 'Inactive'}{#if context.removed_from_case} · Removed from Case{/if}</p><pre>{context.caption_md ?? ''}</pre>{#if context.group?.questions?.length}<p><strong>Group Questions</strong></p><ul>{#each context.group.questions as question}<li><strong>Group Question {question.id}</strong> · Prompt ID {question.question_prompt_id}: {question.promptMd ?? ''} · {question.is_active ? 'Active' : 'Inactive'}<pre>{question.answer_md}</pre></li>{/each}</ul>{/if}{#if context.optionQuestions.length}<p><strong>Option Questions</strong></p><ul>{#each context.optionQuestions as question}<li><strong>Option Question {question.id}</strong> · Prompt ID {question.question_prompt_id}: {question.promptMd ?? ''} · {question.is_active ? 'Active' : 'Inactive'}<pre>{question.answer_md}</pre></li>{/each}</ul>{/if}{/if}</article>{/each}</div></section>

    <section class="panel" aria-labelledby="reusable-heading"><h2 id="reusable-heading">Reusable Image Questions and exact opt-ins</h2><div class="question-grid">{#each [plan.survivorAssetId, plan.duplicateAssetId] as assetId}<div><h3>{assetId === plan.survivorAssetId ? 'Survivor A' : 'Duplicate B'}</h3>{#each questionsForAsset(plan.reusableQuestions, assetId) as question}<article class="question-card"><strong>Asset Question {question.id}</strong><span>Prompt ID {question.question_prompt_id}: {question.prompt_md}</span><pre>{question.answer_md}</pre><span class="muted">{question.is_active ? 'Active' : 'Inactive'} · {question.optIns.length} exact opt-in{question.optIns.length === 1 ? '' : 's'}</span>{#if question.optIns.length}<ul>{#each question.optIns as optIn}<li>{optIn.case_title ?? optIn.case_id} (Case ID {optIn.case_id}) · Group ID {optIn.stimulus_group_id} · Option ID {optIn.stimulus_group_option_id}</li>{/each}</ul>{/if}</article>{/each}</div>{/each}</div>{#each plan.questionConflicts.filter(isResolutionConflict) as conflict}<div class="resolution"><h3>Prompt ID {conflict.questionPromptId}: {conflict.promptMd ?? ''}</h3><div class="answer-choices"><label><input type="radio" name={`resolution_${conflict.questionPromptId}`} value="survivor" required /> Keep survivor answer: <pre>{conflict.survivor.answer_md}</pre></label><label><input type="radio" name={`resolution_${conflict.questionPromptId}`} value="duplicate" required /> Use duplicate answer: <pre>{conflict.duplicate.answer_md}</pre></label></div></div>{/each}</section>

    <section class="panel certification"><label><input type="checkbox" name="certification_confirmed" value="yes" required disabled={plan.blockers.length > 0} /> I have reviewed both images and every retained Case, vignette, Case question, stimulus and reusable-question context shown above. I certify that the selected survivor is clinically and educationally interchangeable for all of those uses, preserves all required visible content, and does not introduce an answer-bearing annotation or overlay. I understand the duplicate's global Asset metadata/provenance will not be copied automatically and its stored image will be permanently deleted only after the canonical survivor media is reverified.</label><button class="button primary" type="submit" disabled={plan.blockers.length > 0}>Certify and merge</button></section>
  </form>
{/if}

<style>
  .page-heading,.comparison-grid,.context-grid,.question-grid{display:grid;gap:1rem}.page-heading{grid-template-columns:1fr auto;align-items:end}.comparison-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin:1rem 0}.panel{padding:1.1rem;border:1px solid #dfe5ee;border-radius:10px;background:#fff}.survivor-card{border-color:#7da4e8;box-shadow:0 0 0 2px #e5efff}.eyebrow{margin:0 0 .3rem;color:#667085;font-size:.74rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.muted{color:#667085}.button{display:inline-block;padding:.7rem 1rem;border:1px solid #cdd6e3;border-radius:8px;background:#fff;color:#172033;text-decoration:none;cursor:pointer;font:inherit}.button.primary{border-color:#172033;background:#172033;color:#fff}button:disabled{cursor:not-allowed;opacity:.5}.error{padding:.75rem;border-radius:8px;background:#fef3f2;color:#b42318}.blocker-panel{border-color:#fecdca;background:#fff8f7}.question-blocker{border-color:#f5d0a0;background:#fffaf0}.comparison-grid img,.missing-preview{width:100%;height:280px;object-fit:contain;background:#eef2f6}.missing-preview{display:grid;place-items:center;color:#b42318}.metadata{display:grid;grid-template-columns:max-content 1fr;gap:.35rem .75rem;overflow-wrap:anywhere}.metadata dt{font-weight:700;color:#344054}.metadata dd{margin:0}.context-grid{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.context-card,.question-card{padding:.9rem;border:1px solid #eaecf0;border-radius:8px}.context-label{display:inline-block;padding:.2rem .45rem;border-radius:999px;background:#eef4ff;color:#175cd3;font-size:.76rem;font-weight:700}.context-card h3,.context-card h4,.question-card strong{margin:.5rem 0 .25rem}.context-card pre,.question-card pre,.answer-choices pre{margin:.35rem 0;padding:.6rem;white-space:pre-wrap;overflow-wrap:anywhere;background:#f8fafc;border-radius:6px;font:inherit}.context-card ul,.question-card ul{padding-left:1.2rem}.question-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:1rem}.resolution{margin-top:1rem;padding:1rem;border:1px solid #f5d0a0;border-radius:8px;background:#fffaf0}.answer-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.answer-choices label{display:block}.certification{display:grid;gap:1rem;margin-top:1rem}.certification label{display:flex;gap:.65rem;align-items:flex-start;line-height:1.5}.certification input{margin-top:.3rem}.certification button{justify-self:start}@media(max-width:750px){.page-heading,.comparison-grid,.question-grid,.answer-choices{grid-template-columns:1fr}.page-heading{align-items:start}.comparison-grid img,.missing-preview{height:220px}}
</style>
