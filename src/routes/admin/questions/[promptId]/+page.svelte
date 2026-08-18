<script>
  let { data, form } = $props();
  let prompt = $derived(data.prompt);
</script>

<svelte:head><title>{prompt ? prompt.promptMd + ' | Questions | Admin' : 'Question | Admin | Flash-Cards'}</title></svelte:head>

{#if !prompt}
  <section class="panel"><h1>Question Prompt not found</h1><p class="muted">This prompt may no longer be available.</p><a class="button" href="/admin/questions">Back to Questions</a></section>
{:else}
  <section class="page-heading">
    <div><p class="eyebrow">Question Prompt</p><h1>{prompt.promptMd}</h1><p class="muted">{prompt.usageCount} active usage{prompt.usageCount === 1 ? '' : 's'} · {prompt.totalUsageCount} total relationship{prompt.totalUsageCount === 1 ? '' : 's'}</p></div>
    <a class="button" href="/admin/questions">All Questions</a>
  </section>

  {#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

  <section class="panel edit-panel" aria-labelledby="edit-heading">
    <div><p class="eyebrow">Global wording</p><h2 id="edit-heading">Edit Question Prompt</h2><p class="muted">This changes the reusable wording everywhere this prompt is used. Answers below remain attached to their own Case, Topic, stimulus context, or Shared Question.</p></div>
    {#if prompt.usageCount > 1}
      <div class="warning" role="note"><strong>Shared prompt: review the blast radius before saving.</strong><span>This prompt is currently used in {prompt.usageCount} places. Inspect every usage below, then confirm the global edit.</span></div>
    {/if}
    <form method="POST" action="?/updatePrompt" class="stack">
      <input type="hidden" name="expected_usage_count" value={prompt.usageCount} />
      <label>Prompt text<textarea name="prompt_md" rows="4" maxlength="2000" required>{prompt.promptMd}</textarea></label>
      {#if prompt.usageCount > 1}<label class="checkbox-label"><input name="confirm_shared_edit" type="checkbox" required /> I reviewed the {prompt.usageCount} usages and understand this wording change is global.</label>{/if}
      <div><button class="button primary" type="submit">Save prompt wording</button></div>
    </form>
  </section>

  <section class="panel" aria-labelledby="shared-question-usages-heading">
    <div class="panel-heading"><div><p class="eyebrow">Tag-reusable answers</p><h2 id="shared-question-usages-heading">Shared Question usages <span class="count">{prompt.sharedQuestionUsages.length}</span></h2></div><span class="muted">Reuse Scope Tags control Case eligibility; descriptive Tags are metadata only.</span></div>
    {#if prompt.sharedQuestionUsages.length === 0}<p class="empty-state">No Shared Question usages.</p>{/if}
    <div class="usage-list">
      {#each prompt.sharedQuestionUsages as usage}
        <article class="usage-card" class:inactive={!usage.isActive || !usage.reuseScopeTagIsActive}>
          <div class="usage-heading"><div><strong>Reuse scope: {usage.reuseScopeTagName}</strong><span class="muted">{usage.isActive ? 'Active Shared Question' : 'Archived Shared Question'}</span></div><a class="button small" href={'/admin/shared-questions/' + usage.id}>Open Shared Question</a></div>
          <p>{usage.answerMd}</p>
          {#if !usage.isActive || !usage.reuseScopeTagIsActive}<span class="status">Inactive Shared Question or Reuse Scope Tag</span>{/if}
        </article>
      {/each}
    </div>
  </section>

  <section class="panel" aria-labelledby="case-usages-heading">
    <div class="panel-heading"><div><p class="eyebrow">Context-specific answers</p><h2 id="case-usages-heading">Case usages <span class="count">{prompt.caseUsages.length}</span></h2></div><span class="muted">Each Case can answer the same prompt differently.</span></div>
    {#if prompt.caseUsages.length === 0}<p class="empty-state">No Case-specific usages.</p>{/if}
    <div class="usage-list">
      {#each prompt.caseUsages as usage}
        <article class="usage-card" class:inactive={!usage.isActive || !usage.caseIsActive}>
          <div class="usage-heading"><div><strong>{usage.caseTitle}</strong>{#if usage.conceptName}<span class="muted">Topic: {usage.conceptName}</span>{/if}</div><a class="button small" href={'/admin/cases/' + usage.caseId}>Open Case</a></div>
          <p>{usage.answerMd}</p>
          {#if !usage.isActive || !usage.caseIsActive}<span class="status">Inactive relationship or Case</span>{/if}
        </article>
      {/each}
    </div>
  </section>

  <section class="panel" aria-labelledby="concept-usages-heading">
    <div class="panel-heading"><div><p class="eyebrow">Reusable answers</p><h2 id="concept-usages-heading">Topic usages <span class="count">{prompt.conceptUsages.length}</span></h2></div><span class="muted">These answers may be inherited by descendant Concepts.</span></div>
    {#if prompt.conceptUsages.length === 0}<p class="empty-state">No reusable Topic usages.</p>{/if}
    <div class="usage-list">
      {#each prompt.conceptUsages as usage}
        <article class="usage-card" class:inactive={!usage.isActive || !usage.conceptIsActive}>
          <div class="usage-heading"><div><strong>{usage.conceptName}</strong><span class="muted">{usage.inheritToDescendants ? 'Inherited by descendants' : 'This Topic only'}</span></div></div>
          <p>{usage.answerMd}</p>
          {#if !usage.isActive || !usage.conceptIsActive}<span class="status">Inactive relationship or Topic</span>{/if}
        </article>
      {/each}
    </div>
  </section>

  <section class="panel" aria-labelledby="stimulus-usages-heading">
    <div class="panel-heading"><div><p class="eyebrow">Alternative stimulus answers</p><h2 id="stimulus-usages-heading">Stimulus Group usages <span class="count">{prompt.stimulusGroupUsages.length + prompt.stimulusOptionUsages.length}</span></h2></div><span class="muted">These answers apply only within a Case's selected stimulus context.</span></div>
    {#if prompt.stimulusGroupUsages.length === 0 && prompt.stimulusOptionUsages.length === 0}<p class="empty-state">No Stimulus Group or Stimulus Option usages.</p>{/if}
    <div class="usage-list">
      {#each prompt.stimulusGroupUsages as usage}<article class="usage-card" class:inactive={!usage.isActive || !usage.groupIsActive || !usage.caseIsActive}><div class="usage-heading"><div><strong>{usage.groupName}</strong><span class="muted">Case: {usage.caseTitle}</span></div><a class="button small" href={'/admin/cases/' + usage.caseId}>Open Case</a></div><p>{usage.answerMd}</p>{#if !usage.isActive || !usage.groupIsActive || !usage.caseIsActive}<span class="status">Inactive relationship, group, or Case</span>{/if}</article>{/each}
      {#each prompt.stimulusOptionUsages as usage}<article class="usage-card" class:inactive={!usage.isActive || !usage.optionIsActive || !usage.groupIsActive || !usage.caseIsActive}><div class="usage-heading"><div><strong>Selected option {usage.optionId}</strong><span class="muted">{usage.groupName} · Case: {usage.caseTitle}</span></div><a class="button small" href={'/admin/cases/' + usage.caseId}>Open Case</a></div><p>{usage.answerMd}</p>{#if !usage.isActive || !usage.optionIsActive || !usage.groupIsActive || !usage.caseIsActive}<span class="status">Inactive relationship, option, group, or Case</span>{/if}</article>{/each}
    </div>
  </section>
{/if}

<style>
  .page-heading, .panel-heading, .usage-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; max-width: 850px; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; } .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .panel { display: grid; gap: 0.9rem; margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .stack { display: grid; gap: 0.85rem; } label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } textarea { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; resize: vertical; } .checkbox-label { display: flex; align-items: center; gap: 0.45rem; font-weight: 500; } .checkbox-label input { width: auto; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.small { padding: 0.5rem 0.65rem; font-size: 0.82rem; white-space: nowrap; } .form-error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #fef3f2; color: #b42318; }
  .warning { display: grid; gap: 0.2rem; padding: 0.8rem; border: 1px solid #fedf89; border-radius: 8px; background: #fffaeb; color: #7a2e0b; } .warning span { color: #93370d; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; } .usage-list { display: grid; gap: 0.7rem; } .usage-card { display: grid; gap: 0.5rem; padding: 0.85rem; border: 1px solid #eaecf0; border-radius: 8px; background: #f8fafc; } .usage-card p { margin-bottom: 0; white-space: pre-wrap; } .usage-heading { align-items: start; } .usage-heading > div { display: grid; gap: 0.2rem; min-width: 0; } .inactive { opacity: 0.65; } .status { color: #b42318; font-size: 0.82rem; font-weight: 650; } .empty-state { padding: 0.85rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; }
  @media (max-width: 620px) { .page-heading, .panel-heading, .usage-heading { align-items: start; flex-direction: column; } }
</style>