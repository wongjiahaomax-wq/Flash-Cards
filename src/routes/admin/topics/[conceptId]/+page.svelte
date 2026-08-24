<script>
  let { data, form } = $props();

  function curatedTag(tagId) {
    return data.topic?.systemCoverage?.curatedTags.find((tag) => tag.tagId === tagId) ?? null;
  }
</script>

<svelte:head><title>{data.topic?.name ?? 'System / Topic'} | Admin | Flash-Cards</title></svelte:head>

{#if !data.topic}
  <section class="panel"><h1>System or Topic not found</h1><p class="muted">This classification does not exist or the database is unavailable.</p><a href="/admin/topics">Back to Systems &amp; Topics</a></section>
{:else}
  <section class="page-heading">
    <div>
      <p class="eyebrow">{data.topic.kind === 'system' ? 'System detail' : 'Topic detail'}</p>
      <div class="title-line"><h1>{data.topic.name}</h1><span class:system={data.topic.kind === 'system'} class="kind-badge">{data.topic.kind === 'system' ? 'System' : 'Topic'}</span>{#if data.topic.unassigned}<span class="warning-badge">Unassigned</span>{/if}</div>
      <nav class="breadcrumb" aria-label="Taxonomy breadcrumb">{#each data.topic.breadcrumb as item, index}{#if index > 0}<span>→</span>{/if}<a href={'/admin/topics/' + item.id}>{item.name}</a>{/each}</nav>
    </div>
    <div class="actions">
      <span class:inactive={!data.topic.isActive} class="status-badge">{data.topic.isActive ? 'Active' : 'Inactive'}</span>
      {#if data.topic.kind === 'topic'}<a class="button primary" href={'/admin/cases/new?concept=' + data.topic.id}>Add Case in this Topic</a>{/if}
    </div>
  </section>

  {#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

  <section class="panel identity">
    <form method="POST" action="?/updateConcept" class="identity-form">
      <div class="panel-heading"><div><h2>Classification identity</h2><p class="muted section-copy">Kind and status are global taxonomy properties. Move parents from the hierarchy manager.</p></div><a class="button" href="/admin/topics#hierarchy">Hierarchy manager</a></div>
      <div class="fields">
        <label>Name<input name="name" maxlength="200" required value={data.topic.name} /></label>
        <label>Kind<select name="kind"><option value="topic" selected={data.topic.kind === 'topic'}>Topic</option><option value="system" selected={data.topic.kind === 'system'}>System</option></select></label>
        <label class="check"><input type="checkbox" name="is_active" checked={data.topic.isActive} /><span>Active</span></label>
        <label class="wide">Description<textarea name="description_md" rows="3">{data.topic.descriptionMd ?? ''}</textarea></label>
      </div>
      <div class="identity-meta">
        <span>Parent: {#if data.topic.parent}<a href={'/admin/topics/' + data.topic.parent.id}>{data.topic.parent.name}</a>{:else}—{/if}</span>
        <span>Internal slug: <code>{data.topic.slug}</code></span>
      </div>
      <button class="button primary" type="submit">Save identity</button>
    </form>
  </section>

  <section class="panel metrics">
    <div><span>Direct Case attachments</span><strong>{data.topic.kind === 'topic' ? data.topic.directCaseCount : '—'}</strong></div>
    <div><span>Deduplicated descendant Study Cases</span><strong>{data.topic.descendantStudyCaseCount}</strong></div>
    <div><span>Direct reusable Topic Questions</span><strong>{data.topic.kind === 'topic' ? data.topic.activeSharedQuestionCount : '—'}</strong></div>
    {#if data.topic.kind === 'system'}<div><span>System All route Cases</span><strong>{data.topic.systemCoverage?.allCaseCount ?? 0}</strong></div>{/if}
  </section>

  {#if data.topic.kind === 'system'}
    <section class="panel">
      <div class="panel-heading"><div><h2>Native descendant Topics</h2><p class="muted section-copy">These are taxonomy children under this System. Counts are active production Case eligibility for each Topic route.</p></div></div>
      {#if !data.topic.systemCoverage?.descendantTopics.length}<p class="empty-state">No descendant Topics yet.</p>{:else}<div class="stack">{#each data.topic.systemCoverage.descendantTopics as topic}<a class="row" href={'/admin/topics/' + topic.id}><span><strong>{topic.name}</strong><small>{topic.breadcrumb.map((item) => item.name).join(' → ')}</small></span><span class="row-meta">{topic.caseCount} {topic.caseCount === 1 ? 'case' : 'cases'} · {topic.isActive ? 'Active' : 'Inactive'}</span></a>{/each}</div>{/if}
    </section>

    <section class="panel">
      <div class="panel-heading"><div><h2>Tags exposed in this System</h2><p class="muted section-copy">Only Tags explicitly curated here become learner choices in this System. This does not change Case Tags or Shared Question eligibility.</p></div></div>
      <form method="POST" action="?/saveSystemTags" class="tag-form">
        {#if data.activeTags.length === 0}<p class="empty-state">No active Tags are available.</p>{:else}
          <div class="tag-table">
            <div class="tag-header"><span>Expose</span><span>Tag</span><span>Study Cases</span><span>Order</span></div>
            {#each data.activeTags as tag}
              {@const current = curatedTag(tag.id)}
              <label class="tag-row">
                <span><input type="checkbox" name="tag_id" value={tag.id} checked={Boolean(current)} /></span>
                <strong>{tag.name}</strong>
                <span>{current?.caseCount ?? 0}</span>
                <input aria-label={'Display order for ' + tag.name} type="number" min="0" name={'order:' + tag.id} value={current?.displayOrder ?? 9999} />
              </label>
            {/each}
          </div>
        {/if}
        {#if data.topic.systemCoverage?.curatedTags.some((tag) => !tag.tagIsActive)}<p class="muted warning-copy">Inactive Tags still linked to this System are shown below for cleanup and are not learner-visible.</p><ul>{#each data.topic.systemCoverage.curatedTags.filter((tag) => !tag.tagIsActive) as tag}<li>{tag.tagName} · order {tag.displayOrder}</li>{/each}</ul>{/if}
        <button class="button primary" type="submit">Save exposed Tags &amp; order</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-heading"><div><h2>Cases matched through several routes</h2><p class="muted section-copy">Useful for auditing deduplication and understanding why a Case contributes to System → All.</p></div><span class="muted">{data.topic.systemCoverage?.overlapCases.length ?? 0} overlaps</span></div>
      {#if !data.topic.systemCoverage?.overlapCases.length}<p class="empty-state">No active Case currently matches several routes in this System.</p>{:else}<div class="stack">{#each data.topic.systemCoverage.overlapCases as item}<a class="row" href={'/admin/cases/' + item.id}><strong>{item.title}</strong><span class="route-chips">{#each item.routes as route}<em>{route.type === 'topic' ? 'Topic' : 'Tag'}: {route.label}</em>{/each}</span></a>{/each}</div>{/if}
    </section>
  {:else}
    <section class="panel">
      <div class="panel-heading"><div><h2>Cases <span class="count">{data.topic.cases.length}</span></h2><p class="muted section-copy">All exact Case attachments to this Topic are shown, including canonical Primary and Additional Study Topic relationships.</p></div></div>
      {#if data.topic.cases.length === 0}<p class="empty-state">No Cases are attached directly to this Topic yet.</p>{:else}<div class="stack">{#each data.topic.cases as item}<a class="row" href={'/admin/cases/' + item.caseId}><strong>{item.caseTitle}</strong><span class="route-chips"><em>{item.role === 'primary' ? 'Primary' : 'Additional Study Topic'}</em><span class:inactive={!item.caseIsActive} class="status-badge">{item.caseIsActive ? 'Active' : 'Inactive'}</span></span></a>{/each}</div>{/if}
    </section>

    <section class="panel">
      <div class="panel-heading"><div><h2>Shared Topic Questions <span class="count">{data.topic.questions.length}</span></h2><p class="muted section-copy">Canonical Topic-question resolution remains based on the actual Study Topic; System and Tag navigation do not replace this layer.</p></div></div>
      {#if data.topic.questions.length === 0}<p class="empty-state">No reusable questions are attached directly to this Topic.</p>{:else}<div class="question-list">{#each data.topic.questions as question}<article class="question-card"><div class="question-heading"><a href={'/admin/questions/' + question.promptId}><strong>{question.promptMd}</strong></a><span class:inactive={!(question.usageIsActive && question.promptIsActive && data.topic.isActive)} class="status-badge">{question.usageIsActive && question.promptIsActive && data.topic.isActive ? 'Active' : 'Inactive'}</span></div><p>{question.answerMd}</p><p class="meta">Available to descendant Topics: <strong>{question.inheritToDescendants ? 'Yes' : 'No'}</strong></p></article>{/each}</div>{/if}
    </section>
  {/if}

  <section class="panel">
    <div class="panel-heading"><h2>Direct children <span class="count">{data.topic.children.length}</span></h2><span class="muted">Move relationships in the hierarchy manager</span></div>
    {#if data.topic.children.length === 0}<p class="empty-state">No direct children.</p>{:else}<div class="stack">{#each data.topic.children as child}<a class="row" href={'/admin/topics/' + child.id}><span><strong>{child.name}</strong><small>{child.kind === 'system' ? 'System' : 'Topic'}</small></span><span class:inactive={!child.isActive} class="status-badge">{child.isActive ? 'Active' : 'Inactive'}</span></a>{/each}</div>{/if}
  </section>
{/if}

<style>
  .page-heading,.panel-heading,.question-heading,.row,.actions,.title-line { display:flex; justify-content:space-between; align-items:center; gap:1rem; } .page-heading { align-items:end; margin-bottom:1rem; } .title-line { justify-content:flex-start; flex-wrap:wrap; }
  h1,h2,p { margin-top:0; } h1 { margin-bottom:.3rem; font-size:clamp(1.8rem,4vw,2.5rem); } h2 { margin-bottom:0; font-size:1.15rem; } .eyebrow { margin-bottom:.3rem; color:#667085; font-size:.74rem; font-weight:750; letter-spacing:.08em; text-transform:uppercase; } .muted,.meta { color:#667085; } .section-copy { margin:.35rem 0 0; max-width:52rem; }
  .breadcrumb { display:flex; gap:.4rem; flex-wrap:wrap; color:#667085; font-size:.9rem; } .breadcrumb a { color:#475467; } .kind-badge,.status-badge,.warning-badge { display:inline-block; width:max-content; padding:.2rem .45rem; border-radius:999px; background:#f2f4f7; color:#475467; font-size:.78rem; font-weight:650; white-space:nowrap; } .kind-badge.system { background:#eef4ff; color:#3538cd; } .status-badge { background:#ecfdf3; color:#027a48; } .status-badge.inactive { background:#f2f4f7; color:#667085; } .warning-badge { background:#fffaeb; color:#b54708; }
  .panel { margin-bottom:1rem; padding:1.1rem; border:1px solid #dfe5ee; border-radius:10px; background:#fff; } .identity-form { display:grid; gap:1rem; } .fields { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(140px,.6fr) auto; gap:.75rem; align-items:end; } .fields .wide { grid-column:1/-1; } label { display:grid; gap:.35rem; color:#344054; font-weight:650; } input,select,textarea { box-sizing:border-box; width:100%; padding:.65rem .75rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; font:inherit; } .check { display:flex; align-items:center; gap:.5rem; min-height:42px; } .check input { width:auto; } .identity-meta { display:flex; gap:1.2rem; flex-wrap:wrap; color:#667085; font-size:.88rem; }
  .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.75rem; } .metrics div { display:grid; gap:.25rem; padding:.8rem; border:1px solid #eaecf0; border-radius:8px; } .metrics span { color:#667085; font-size:.82rem; } .metrics strong { font-size:1.35rem; }
  .count { color:#667085; font-size:.85rem; font-weight:500; } .stack,.question-list { display:grid; gap:.65rem; margin-top:1rem; } .row { padding:.75rem; border:1px solid #eaecf0; border-radius:8px; color:#172033; text-decoration:none; } .row > span:first-child { display:grid; gap:.15rem; } .row small,.row-meta { color:#667085; } .route-chips { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:.35rem; } .route-chips em { padding:.15rem .4rem; border-radius:999px; background:#f2f4f7; color:#475467; font-size:.76rem; font-style:normal; }
  .question-card { padding:.9rem; border:1px solid #eaecf0; border-radius:8px; } .question-card p { margin:.65rem 0 0; white-space:pre-wrap; } .question-heading a { color:#172033; }
  .tag-form { display:grid; gap:1rem; margin-top:1rem; } .tag-table { display:grid; } .tag-header,.tag-row { display:grid; grid-template-columns:70px minmax(0,1fr) 100px 100px; gap:.75rem; align-items:center; padding:.6rem .4rem; border-bottom:1px solid #eaecf0; } .tag-header { color:#667085; font-size:.75rem; font-weight:750; text-transform:uppercase; } .tag-row { cursor:pointer; } .tag-row > span:first-child input { width:auto; } .warning-copy { margin-bottom:0; color:#b54708; }
  .button { display:inline-block; padding:.65rem .85rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; color:#172033; text-decoration:none; white-space:nowrap; cursor:pointer; font:inherit; } .button.primary { border-color:#172033; background:#172033; color:#fff; } .empty-state { margin:1rem 0 0; padding:1rem; border:1px dashed #d0d5dd; border-radius:8px; } .form-error { margin:1rem 0; padding:.8rem; border-radius:8px; background:#fef3f2; color:#b42318; }
  @media (max-width:820px) { .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } .fields { grid-template-columns:1fr; } .fields .wide { grid-column:auto; } }
  @media (max-width:680px) { .page-heading,.panel-heading { align-items:start; flex-direction:column; } .actions { align-items:flex-start; flex-wrap:wrap; } .metrics { grid-template-columns:1fr; } .tag-header { display:none; } .tag-row { grid-template-columns:auto minmax(0,1fr) 80px; } .tag-row input[type='number'] { grid-column:2/-1; } .row { align-items:flex-start; flex-direction:column; } .route-chips { justify-content:flex-start; } }
</style>
