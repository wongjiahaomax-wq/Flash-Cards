<script>
  let { data, form } = $props();
  const selectedTagIds = new Set(data.sharedQuestion.descriptiveTags.map((tag) => tag.tagId));
</script>

<svelte:head><title>Edit Shared Question | Admin</title></svelte:head>

<div class="page">
  <a class="back" href="/admin/shared-questions">← Shared Questions</a>
  <header>
    <p class="eyebrow">{data.sharedQuestion.isActive ? 'Active Shared Question' : 'Archived Shared Question'}</p>
    <h1>{data.sharedQuestion.promptMd}</h1>
  </header>

  {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

  <section class="panel">
    <form method="POST" action="?/save" class="form-grid">
      <label>
        Question Prompt
        <select name="question_prompt_id" required>
          {#each data.promptChoices as prompt}
            <option value={prompt.id} selected={prompt.id === data.sharedQuestion.questionPromptId}>{prompt.promptMd}</option>
          {/each}
        </select>
        <small>Prompt wording is reusable text only. Change wording in the Questions library when appropriate.</small>
      </label>

      <label>
        Reusable answer
        <textarea name="answer_md" rows="7" required>{data.sharedQuestion.answerMd}</textarea>
      </label>

      <label>
        Reuse Scope Tag
        <select name="reuse_scope_tag_id" required>
          {#if !data.sharedQuestion.reuseScopeTagIsActive}
            <option value={data.sharedQuestion.reuseScopeTagId} selected>{data.sharedQuestion.reuseScopeTagName} (inactive)</option>
          {/if}
          {#each data.activeTags as tag}
            <option value={tag.id} selected={tag.id === data.sharedQuestion.reuseScopeTagId}>{tag.name}</option>
          {/each}
        </select>
        <small>This exactly one active Tag controls Case eligibility. It is independent from descriptive Tags.</small>
      </label>

      <fieldset>
        <legend>Descriptive Tags <span>metadata only</span></legend>
        <p class="hint">These Tags describe the medical knowledge. Selecting them does not make a Shared Question eligible for a Case.</p>
        <div class="tag-grid">
          {#each data.activeTags as tag}
            <label class="check"><input type="checkbox" name="descriptive_tag_ids" value={tag.id} checked={selectedTagIds.has(tag.id)} /> {tag.name}</label>
          {/each}
        </div>
      </fieldset>

      <button type="submit">Save Shared Question</button>
    </form>
  </section>

  <section class="danger panel">
    <h2>{data.sharedQuestion.isActive ? 'Archive' : 'Reactivate'}</h2>
    <p>{data.sharedQuestion.isActive ? 'Archiving removes this Shared Question from learner eligibility while preserving historical Review provenance.' : 'Reactivation requires an active production Prompt, an active Reuse Scope Tag, and no other active Shared Question using the same Prompt.'}</p>
    <form method="POST" action="?/setActive">
      <input type="hidden" name="is_active" value={data.sharedQuestion.isActive ? 'false' : 'true'} />
      <button class="secondary" type="submit">{data.sharedQuestion.isActive ? 'Archive Shared Question' : 'Reactivate Shared Question'}</button>
    </form>
  </section>
</div>

<style>
  .page { max-width: 900px; display: grid; gap: 1.4rem; }
  h1, h2, p { margin-top: 0; }
  .back { color: #475467; text-decoration: none; font-weight: 650; }
  .eyebrow { margin-bottom: .3rem; color: #667085; font-size: .78rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
  .panel { background: #fff; border: 1px solid #dfe5ee; border-radius: 10px; padding: 1.25rem; }
  .form-grid { display: grid; gap: 1rem; }
  label, fieldset { display: grid; gap: .35rem; font-weight: 650; }
  textarea, select { width: 100%; box-sizing: border-box; padding: .7rem .8rem; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; font: inherit; }
  textarea { resize: vertical; }
  small, .hint, legend span, .danger p { color: #667085; font-size: .85rem; font-weight: 500; }
  fieldset { border: 1px solid #dfe5ee; border-radius: 8px; padding: 1rem; }
  legend { padding: 0 .35rem; font-weight: 750; }
  .tag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: .45rem .8rem; }
  .check { display: flex; align-items: center; gap: .45rem; font-weight: 500; }
  .check input { width: auto; }
  button { border: 0; border-radius: 7px; padding: .7rem 1rem; background: #172033; color: white; font-weight: 700; cursor: pointer; }
  .secondary { background: #eef2f6; color: #344054; }
  .error { padding: .8rem 1rem; border-radius: 7px; background: #fef3f2; color: #b42318; }
</style>
