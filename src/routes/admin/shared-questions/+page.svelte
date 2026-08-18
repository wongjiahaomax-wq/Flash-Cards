<script>
  let { data, form } = $props();
</script>

<svelte:head><title>Shared Questions | Admin</title></svelte:head>

<div class="page">
  <header>
    <p class="eyebrow">Tagging Stage B</p>
    <h1>Shared Questions</h1>
    <p class="lede">Curate reusable medical questions that become eligible when a Case has one matching Reuse Scope Tag.</p>
  </header>

  {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

  <section class="panel">
    <h2>Create Shared Question</h2>
    <form method="POST" action="?/create" class="form-grid">
      <label>
        Existing Question Prompt
        <select name="question_prompt_id">
          <option value="">Create new wording below</option>
          {#each data.promptChoices as prompt}
            <option value={prompt.id}>{prompt.promptMd}</option>
          {/each}
        </select>
      </label>

      <label>
        New Question Prompt wording
        <textarea name="prompt_md" rows="3" placeholder="Leave blank when reusing an existing Prompt"></textarea>
      </label>

      <label>
        Reusable answer
        <textarea name="answer_md" rows="5" required></textarea>
      </label>

      <label>
        Reuse Scope Tag <span class="required">required</span>
        <select name="reuse_scope_tag_id" required>
          <option value="">Select one active Tag</option>
          {#each data.activeTags as tag}<option value={tag.id}>{tag.name}</option>{/each}
        </select>
        <small>This one Tag controls Case eligibility.</small>
      </label>

      <fieldset>
        <legend>Descriptive Tags <span>optional metadata</span></legend>
        <p class="hint">These describe what the Shared Question teaches/tests. They do not control reuse eligibility.</p>
        <div class="tag-grid">
          {#each data.activeTags as tag}
            <label class="check"><input type="checkbox" name="descriptive_tag_ids" value={tag.id} /> {tag.name}</label>
          {/each}
        </div>
      </fieldset>

      <button type="submit">Create Shared Question</button>
    </form>
  </section>

  <section>
    <div class="section-head"><h2>Curated Shared Questions</h2><span>{data.sharedQuestions.length}</span></div>
    {#if data.sharedQuestions.length === 0}
      <p class="empty">No Shared Questions yet.</p>
    {:else}
      <div class="cards">
        {#each data.sharedQuestions as question}
          <article class:inactive={!question.isActive}>
            <div class="status-row">
              <span class:archived={!question.isActive}>{question.isActive ? 'Active' : 'Archived'}</span>
              <span class="scope">Reuse scope: {question.reuseScopeTagName}{question.reuseScopeTagIsActive ? '' : ' (inactive Tag)'}</span>
            </div>
            <h3><a href={`/admin/shared-questions/${question.id}`}>{question.promptMd}</a></h3>
            <p class="answer">{question.answerMd}</p>
            <p class="tags"><strong>Descriptive Tags:</strong> {question.descriptiveTags.length ? question.descriptiveTags.map((tag) => tag.tagName).join(', ') : 'None'}</p>
            <div class="actions">
              <a href={`/admin/shared-questions/${question.id}`}>Edit</a>
              <form method="POST" action="?/setActive">
                <input type="hidden" name="shared_question_id" value={question.id} />
                <input type="hidden" name="is_active" value={question.isActive ? 'false' : 'true'} />
                <button class="secondary" type="submit">{question.isActive ? 'Archive' : 'Reactivate'}</button>
              </form>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .page { max-width: 1180px; display: grid; gap: 2rem; }
  h1, h2, h3, p { margin-top: 0; }
  .eyebrow { margin-bottom: .35rem; color: #475467; font-size: .78rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
  .lede { max-width: 760px; color: #667085; }
  .panel, article { background: #fff; border: 1px solid #dfe5ee; border-radius: 10px; padding: 1.25rem; }
  .form-grid { display: grid; gap: 1rem; max-width: 850px; }
  label, fieldset { display: grid; gap: .35rem; font-weight: 650; }
  input, textarea, select { width: 100%; box-sizing: border-box; padding: .7rem .8rem; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; font: inherit; }
  textarea { resize: vertical; }
  fieldset { border: 1px solid #dfe5ee; border-radius: 8px; padding: 1rem; }
  legend { padding: 0 .35rem; font-weight: 750; }
  legend span, small, .hint { color: #667085; font-size: .82rem; font-weight: 500; }
  .tag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: .45rem .8rem; }
  .check { display: flex; align-items: center; gap: .45rem; font-weight: 500; }
  .check input { width: auto; }
  button { width: fit-content; border: 0; border-radius: 7px; padding: .7rem 1rem; background: #172033; color: white; font-weight: 700; cursor: pointer; }
  .secondary { background: #eef2f6; color: #344054; }
  .required { color: #b42318; font-size: .78rem; }
  .error { padding: .8rem 1rem; border-radius: 7px; background: #fef3f2; color: #b42318; }
  .section-head, .status-row, .actions { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
  .cards { display: grid; gap: .9rem; }
  article.inactive { opacity: .72; }
  .status-row { justify-content: flex-start; flex-wrap: wrap; font-size: .8rem; }
  .status-row > span:first-child { padding: .2rem .5rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-weight: 750; }
  .status-row > span.archived { background: #f2f4f7; color: #667085; }
  .scope { color: #344054; font-weight: 650; }
  h3 { margin: .8rem 0 .45rem; }
  h3 a { color: #172033; }
  .answer { color: #475467; white-space: pre-wrap; }
  .tags { color: #667085; font-size: .9rem; }
  .actions { justify-content: flex-start; }
  .actions form { margin: 0; }
  .empty { color: #667085; }
</style>
