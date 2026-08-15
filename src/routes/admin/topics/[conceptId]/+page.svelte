<script>
  let { data } = $props();
</script>

<svelte:head><title>{data.topic?.name ?? 'Topic'} | Admin | Flash-Cards</title></svelte:head>

{#if !data.topic}
  <section class="panel"><h1>Topic not found</h1><p class="muted">This Topic does not exist or the database is unavailable.</p><a href="/admin/topics">Back to Topics</a></section>
{:else}
  <section class="page-heading">
    <div>
      <p class="eyebrow">Topic detail</p>
      <h1>{data.topic.name}</h1>
      <p class="muted">Slug: <code>{data.topic.slug}</code></p>
    </div>
    <span class:inactive={!data.topic.isActive} class="status-badge">{data.topic.isActive ? 'Active' : 'Inactive'}</span>
  </section>

  <section class="panel identity">
    <div><h2>Topic identity</h2>{#if data.topic.descriptionMd}<p class="description">{data.topic.descriptionMd}</p>{:else}<p class="muted">No description.</p>{/if}</div>
    <dl>
      <div><dt>Parent</dt><dd>{#if data.topic.parent}<a href={'/admin/topics/' + data.topic.parent.id}>{data.topic.parent.name}</a>{:else}—{/if}</dd></div>
      <div><dt>Active Cases</dt><dd>{data.topic.activeCaseCount}</dd></div>
      <div><dt>Active shared questions</dt><dd>{data.topic.activeSharedQuestionCount}</dd></div>
    </dl>
  </section>

  <section class="panel">
    <div class="panel-heading"><h2>Cases <span class="count">{data.topic.cases.length}</span></h2><span class="muted">Primary Topic relationships</span></div>
    {#if data.topic.cases.length === 0}<p class="empty-state">No Cases use this as their primary Topic.</p>{:else}
      <div class="stack">{#each data.topic.cases as item}<a class="row" href={'/admin/cases/' + item.caseId}><strong>{item.caseTitle}</strong><span class:inactive={!item.caseIsActive} class="status-badge">{item.caseIsActive ? 'Active' : 'Inactive'}</span></a>{/each}</div>
    {/if}
  </section>

  <section class="panel">
    <div class="panel-heading"><h2>Reusable Topic Questions <span class="count">{data.topic.questions.length}</span></h2><span class="muted">Answers belong to this Topic usage, not the global prompt.</span></div>
    {#if data.topic.questions.length === 0}<p class="empty-state">No reusable questions are attached directly to this Topic.</p>{:else}
      <div class="question-list">{#each data.topic.questions as question}
        <article class="question-card">
          <div class="question-heading"><a href={'/admin/questions/' + question.promptId}><strong>{question.promptMd}</strong></a><span class:inactive={!(question.usageIsActive && question.promptIsActive && data.topic.isActive)} class="status-badge">{question.usageIsActive && question.promptIsActive && data.topic.isActive ? 'Active' : 'Inactive'}</span></div>
          <p>{question.answerMd}</p>
          <p class="meta">Inherit to descendants: <strong>{question.inheritToDescendants ? 'Yes' : 'No'}</strong></p>
        </article>
      {/each}</div>
    {/if}
  </section>

  <section class="panel">
    <div class="panel-heading"><h2>Child Topics <span class="count">{data.topic.children.length}</span></h2><span class="muted">Direct children only</span></div>
    {#if data.topic.children.length === 0}<p class="empty-state">No direct child Topics.</p>{:else}
      <div class="stack">{#each data.topic.children as child}<a class="row" href={'/admin/topics/' + child.id}><strong>{child.name}</strong><span class:inactive={!child.isActive} class="status-badge">{child.isActive ? 'Active' : 'Inactive'}</span></a>{/each}</div>
    {/if}
  </section>
{/if}

<style>
  .page-heading,.panel-heading,.question-heading,.row { display:flex; justify-content:space-between; align-items:center; gap:1rem; }
  .page-heading { align-items:end; margin-bottom:1rem; } h1,h2,p { margin-top:0; } h1 { margin-bottom:.3rem; font-size:clamp(1.8rem,4vw,2.5rem); } h2 { margin-bottom:0; font-size:1.15rem; }
  .eyebrow { margin-bottom:.3rem; color:#667085; font-size:.74rem; font-weight:750; letter-spacing:.08em; text-transform:uppercase; } .muted,.meta { color:#667085; } code { font-size:.9em; }
  .panel { margin-bottom:1rem; padding:1.1rem; border:1px solid #dfe5ee; border-radius:10px; background:#fff; } .identity { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(220px,1fr); gap:1.5rem; }
  dl { margin:0; } dl div { display:flex; justify-content:space-between; gap:1rem; padding:.45rem 0; border-bottom:1px solid #eaecf0; } dl div:last-child { border-bottom:0; } dt { color:#667085; } dd { margin:0; font-weight:650; }
  .count { color:#667085; font-size:.85rem; font-weight:500; } .stack,.question-list { display:grid; gap:.65rem; margin-top:1rem; } .row { padding:.75rem; border:1px solid #eaecf0; border-radius:8px; color:#172033; text-decoration:none; }
  .question-card { padding:.9rem; border:1px solid #eaecf0; border-radius:8px; } .question-card p { margin:.65rem 0 0; white-space:pre-wrap; } .question-heading a { color:#172033; }
  .status-badge { display:inline-block; padding:.2rem .45rem; border-radius:999px; background:#ecfdf3; color:#027a48; font-size:.78rem; font-weight:650; white-space:nowrap; } .status-badge.inactive { background:#f2f4f7; color:#667085; }
  .empty-state { margin:1rem 0 0; padding:1rem; border:1px dashed #d0d5dd; border-radius:8px; }
  .description { white-space:pre-wrap; }
  @media (max-width:680px) { .identity { grid-template-columns:1fr; } .page-heading,.panel-heading { align-items:start; flex-direction:column; } }
</style>
