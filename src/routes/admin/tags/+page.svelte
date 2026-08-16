<script>
  let { data, form } = $props();
  let query = $state('');

  $effect(() => {
    query = data.filters.search;
  });
</script>

<svelte:head><title>Tags | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Cross-cutting metadata</p>
    <h1>Tags</h1>
    <p class="muted">Curate flat clinical Tags and attach them explicitly to Cases or Case Questions.</p>
  </div>
</section>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

<section class="panel" aria-labelledby="create-heading">
  <div class="panel-heading">
    <div><p class="eyebrow">Canonical vocabulary</p><h2 id="create-heading">Create Tag</h2></div>
    <span class="muted">Aliases and hierarchy are intentionally deferred.</span>
  </div>
  <form method="POST" action="?/createTag" class="inline-form">
    <label class="grow">Tag name<input name="name" maxlength="120" required placeholder="e.g. Prolonged QTc" /></label>
    <button class="button primary" type="submit">Create Tag</button>
  </form>
</section>

<section class="panel" aria-labelledby="library-heading">
  <div class="panel-heading">
    <div><p class="eyebrow">Tag library</p><h2 id="library-heading">Canonical Tags <span class="count">{data.tags.length}</span></h2></div>
    <span class="muted">Deactivate rather than delete to preserve existing curation.</span>
  </div>

  <form method="GET" class="filter-form">
    <label class="grow">Search Tags<input name="q" bind:value={query} placeholder="e.g. hypocalcaemia" /></label>
    <label>Show assignments for
      <select name="tag">
        <option value="">All Tags</option>
        {#each data.activeTags as tag}<option value={tag.id} selected={tag.id === data.filters.tagId}>{tag.name}</option>{/each}
      </select>
    </label>
    <div class="filter-actions"><button class="button" type="submit">Filter</button>{#if query || data.filters.tagId}<a class="button" href="/admin/tags">Clear</a>{/if}</div>
  </form>

  {#if data.tags.length === 0}
    <p class="empty-state">No Tags match this search.</p>
  {:else}
    <div class="tag-list">
      {#each data.tags as tag}
        <article class="tag-row" class:inactive={!tag.isActive}>
          <div class="tag-summary">
            <strong>{tag.name}</strong>
            <span class="status-badge" class:active={tag.isActive}>{tag.isActive ? 'Active' : 'Inactive'}</span>
            <span class="muted">{tag.activeCaseCount} active Case{tag.activeCaseCount === 1 ? '' : 's'} · {tag.activeCaseQuestionCount} active Case Question{tag.activeCaseQuestionCount === 1 ? '' : 's'}</span>
          </div>
          <form method="POST" action="?/renameTag" class="rename-form">
            <input type="hidden" name="tag_id" value={tag.id} />
            <input name="name" value={tag.name} maxlength="120" required aria-label={`Rename ${tag.name}`} />
            <button class="button small" type="submit">Rename</button>
          </form>
          <form method="POST" action="?/setTagActive">
            <input type="hidden" name="tag_id" value={tag.id} />
            <input type="hidden" name="is_active" value={tag.isActive ? 'false' : 'true'} />
            <button class="button small" type="submit">{tag.isActive ? 'Deactivate' : 'Reactivate'}</button>
          </form>
        </article>
      {/each}
    </div>
  {/if}
</section>

<section class="panel" aria-labelledby="case-tags-heading">
  <div class="panel-heading">
    <div><p class="eyebrow">Case metadata</p><h2 id="case-tags-heading">Case Tags</h2></div>
    <span class="muted">A Case may have several clinical concept Tags.</span>
  </div>
  <p class="scope-note">Case Tags classify the Case. They do <strong>not</strong> automatically become Question Tags.</p>

  <form method="POST" action="?/addCaseTag" class="assignment-form">
    <label>Case<select name="case_id" required><option value="">Choose Case…</option>{#each data.cases as item}<option value={item.id}>{item.title}</option>{/each}</select></label>
    <label>Tag<select name="tag_id" required><option value="">Choose Tag…</option>{#each data.activeTags as tag}<option value={tag.id}>{tag.name}</option>{/each}</select></label>
    <button class="button primary" type="submit" disabled={data.activeTags.length === 0}>Attach Tag</button>
  </form>

  {#if data.caseAssignments.length === 0}
    <p class="empty-state">No Case Tag assignments match this filter.</p>
  {:else}
    <div class="assignment-list">
      {#each data.caseAssignments as assignment}
        <div class="assignment-row" class:inactive={!assignment.caseIsActive || !assignment.tagIsActive}>
          <div><strong>{assignment.caseTitle}</strong><span class="tag-chip">{assignment.tagName}</span>{#if !assignment.caseIsActive || !assignment.tagIsActive}<span class="muted">Inactive Case or Tag</span>{/if}</div>
          <form method="POST" action="?/removeCaseTag">
            <input type="hidden" name="case_id" value={assignment.caseId} />
            <input type="hidden" name="tag_id" value={assignment.tagId} />
            <button class="button small" type="submit">Remove</button>
          </form>
        </div>
      {/each}
    </div>
  {/if}
</section>

<section class="panel" aria-labelledby="question-tags-heading">
  <div class="panel-heading">
    <div><p class="eyebrow">Contextual knowledge</p><h2 id="question-tags-heading">Case Question Tags</h2></div>
    <span class="muted">Stage A starts with Case Questions only.</span>
  </div>
  <p class="scope-note">Question Tags describe the medical knowledge tested by this specific Case Question. Tags are never attached to reusable <code>question_prompts</code>.</p>

  <form method="POST" action="?/addCaseQuestionTag" class="assignment-form">
    <label>Case Question<select name="case_question_id" required><option value="">Choose Case Question…</option>{#each data.caseQuestions as question}<option value={question.id}>{question.caseTitle} — {question.promptMd}</option>{/each}</select></label>
    <label>Tag<select name="tag_id" required><option value="">Choose Tag…</option>{#each data.activeTags as tag}<option value={tag.id}>{tag.name}</option>{/each}</select></label>
    <button class="button primary" type="submit" disabled={data.activeTags.length === 0}>Attach Tag</button>
  </form>

  {#if data.questionAssignments.length === 0}
    <p class="empty-state">No Case Question Tag assignments match this filter.</p>
  {:else}
    <div class="assignment-list">
      {#each data.questionAssignments as assignment}
        <div class="assignment-row" class:inactive={!assignment.caseQuestionIsActive || !assignment.caseIsActive || !assignment.promptIsActive || !assignment.tagIsActive}>
          <div class="question-assignment">
            <strong>{assignment.promptMd}</strong>
            <span class="muted">Case: {assignment.caseTitle}</span>
            <span class="tag-chip">{assignment.tagName}</span>
            {#if !assignment.caseQuestionIsActive || !assignment.caseIsActive || !assignment.promptIsActive || !assignment.tagIsActive}<span class="muted">Inactive Question relationship, Case, Prompt, or Tag</span>{/if}
          </div>
          <form method="POST" action="?/removeCaseQuestionTag">
            <input type="hidden" name="case_question_id" value={assignment.caseQuestionId} />
            <input type="hidden" name="tag_id" value={assignment.tagId} />
            <button class="button small" type="submit">Remove</button>
          </form>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-heading, .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .panel { display: grid; gap: 0.9rem; margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .grow { min-width: 0; }
  .inline-form, .filter-form, .assignment-form { display: grid; gap: 0.75rem; align-items: end; } .inline-form { grid-template-columns: minmax(0, 1fr) auto; } .filter-form { grid-template-columns: minmax(0, 1.5fr) minmax(180px, 1fr) auto; } .assignment-form { grid-template-columns: minmax(0, 1.6fr) minmax(180px, 0.8fr) auto; }
  .filter-actions { display: flex; gap: 0.5rem; } .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; white-space: nowrap; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.small { padding: 0.45rem 0.65rem; font-size: 0.82rem; } .button:disabled { opacity: 0.5; cursor: not-allowed; }
  .form-error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #fef3f2; color: #b42318; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .tag-list, .assignment-list { display: grid; gap: 0.6rem; } .tag-row, .assignment-row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(220px, 1fr) auto; gap: 0.75rem; align-items: center; padding: 0.75rem; border: 1px solid #eaecf0; border-radius: 8px; background: #f8fafc; } .assignment-row { grid-template-columns: minmax(0, 1fr) auto; }
  .tag-summary, .question-assignment, .assignment-row > div { display: flex; flex-wrap: wrap; gap: 0.4rem 0.6rem; align-items: center; min-width: 0; } .question-assignment { display: grid; gap: 0.2rem; } .rename-form { display: flex; gap: 0.4rem; min-width: 0; }
  .status-badge, .tag-chip { display: inline-block; padding: 0.18rem 0.45rem; border-radius: 999px; background: #f2f4f7; color: #475467; font-size: 0.78rem; font-weight: 650; } .status-badge.active, .tag-chip { background: #ecfdf3; color: #027a48; } .inactive { opacity: 0.65; }
  .scope-note { margin-bottom: 0; padding: 0.7rem 0.8rem; border-left: 3px solid #98a2b3; background: #f8fafc; color: #475467; } .empty-state { padding: 0.85rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; }
  code { padding: 0.1rem 0.25rem; border-radius: 4px; background: #f2f4f7; }
  @media (max-width: 850px) { .tag-row { grid-template-columns: minmax(0, 1fr); } .tag-row > form:last-child { justify-self: start; } }
  @media (max-width: 680px) { .page-heading, .panel-heading { align-items: start; flex-direction: column; } .inline-form, .filter-form, .assignment-form { grid-template-columns: minmax(0, 1fr); } .filter-actions { flex-wrap: wrap; } }
</style>
