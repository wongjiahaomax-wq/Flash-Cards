<script>
  let { data, form } = $props();
  let query = $state('');
  let createKind = $state('topic');
  $effect(() => { query = data.filters.search; });

  /** @param {string} conceptId */
  function parentOptions(conceptId) {
    return data.hierarchyOptions.filter((candidate) => candidate.id !== conceptId && candidate.isActive);
  }

  /** @param {{ breadcrumbLabel: string, kind: string }} item */
  function hierarchyLabel(item) {
    return `${item.breadcrumbLabel}.${item.kind}`;
  }

  const activeSystems = $derived(data.hierarchyOptions.filter((item) => item.kind === 'system' && item.isActive));
</script>

<svelte:head><title>Systems &amp; Topics | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Learner taxonomy</p>
    <h1>Systems &amp; Topics</h1>
    <p class="muted">Systems are broad learner groupings. Topics remain the canonical Case classifications and reusable-question context.</p>
  </div>
</section>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

{#if data.coverage}
  <section class:ready={data.coverage.readyForLearnerSystemNavigation} class="coverage" aria-label="System navigation coverage">
    <div><strong>Taxonomy coverage</strong><span>{data.coverage.activeSystemCount} Systems · {data.coverage.activeTopicCount} Topics · {data.coverage.activeProductionCaseCount} active production Cases</span></div>
    <div><strong>{data.coverage.readyForLearnerSystemNavigation ? 'Coverage ready' : 'Curation required'}</strong><span>{data.coverage.unassignedTopics.length} unassigned active Topics · {data.coverage.uncoveredCases.length} uncovered active Cases</span></div>
    {#if data.coverage.unassignedTopics.length}
      <details><summary>Unassigned Topics</summary><ul>{#each data.coverage.unassignedTopics as topic}<li><a href={'/admin/topics/' + topic.id}>{topic.name}</a></li>{/each}</ul></details>
    {/if}
    {#if data.coverage.uncoveredCases.length}
      <details><summary>Cases not currently reachable through any System route</summary><ul>{#each data.coverage.uncoveredCases as item}<li><a href={'/admin/cases/' + item.id}>{item.title}</a></li>{/each}</ul></details>
    {/if}
  </section>
{/if}

<section class="panel create-panel">
  <div><p class="eyebrow">Create classification</p><h2>New System or Topic</h2><p class="muted">New Topics may be temporarily unassigned. Systems are always top-level.</p></div>
  <form method="POST" action="?/createConcept" class="create-form">
    <label>Name<input name="name" maxlength="200" required placeholder="e.g. Cardiology or Pericarditis" /></label>
    <label>Kind<select name="kind" bind:value={createKind} required><option value="topic">Topic</option><option value="system">System</option></select></label>
    {#if createKind === 'topic'}
      <label>Parent System<select name="parent_id"><option value="">Unassigned</option>{#each activeSystems as parent}<option value={parent.id}>{parent.name}</option>{/each}</select></label>
    {/if}
    <label class="wide">Description<textarea name="description_md" rows="2" placeholder="Optional Admin/learner context"></textarea></label>
    <button class="button primary" type="submit">Create</button>
  </form>
</section>

<form class="filter-form" method="GET">
  <label for="topic-search">Search System / Topic name or breadcrumb
    <input id="topic-search" name="q" bind:value={query} placeholder="e.g. Cardiology" />
  </label>
  <div class="filter-actions"><button class="button primary" type="submit">Search</button>{#if query}<a class="button" href="/admin/topics">Clear</a>{/if}</div>
</form>

<section class="panel" aria-labelledby="topic-list-heading">
  <div class="panel-heading"><div><h2 id="topic-list-heading">Taxonomy <span class="count">{data.topics.length}</span></h2><p class="muted section-copy">Direct Cases are exact Topic attachments, including canonical Primary and Additional Study Topic relationships. Descendant Study Cases are deduplicated across the whole subtree.</p></div><span class="muted">System rows are top-level</span></div>
  {#if data.topics.length === 0}<p class="empty-state">No Systems or Topics match this search.</p>{:else}
    <div class="topic-table" role="list">
      <div class="table-header" aria-hidden="true"><span>Classification</span><span>Kind</span><span>Direct Cases</span><span>Study Cases</span><span>Questions</span><span>Status</span></div>
      {#each data.topics as topic}
        <a class:unassigned={topic.unassigned} class="table-row" href={'/admin/topics/' + topic.id}>
          <span class="classification"><strong>{topic.name}</strong><small>{topic.breadcrumbLabel}</small>{#if topic.unassigned}<em>Unassigned Topic</em>{/if}</span>
          <span><span class:system={topic.kind === 'system'} class="kind-badge">{topic.kind === 'system' ? 'System' : 'Topic'}</span></span>
          <span>{topic.kind === 'system' ? '—' : topic.directCaseCount}</span>
          <span>{topic.descendantStudyCaseCount}</span>
          <span>{topic.kind === 'system' ? '—' : topic.activeSharedQuestionCount}</span>
          <span><span class:inactive={!topic.isActive} class="status-badge">{topic.isActive ? 'Active' : 'Inactive'}</span></span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<section class="panel hierarchy-panel">
  <div class="panel-heading"><div><h2>Hierarchy manager</h2><p class="muted section-copy">Stage several Topic moves here, then validate and apply the complete proposed graph atomically. Changing a global parent changes taxonomy everywhere; it is not a Case-only edit.</p></div></div>
  <form method="POST" action="?/applyHierarchy" class="hierarchy-form">
    {#each data.topics as topic}
      <div class="hierarchy-row">
        <div><strong>{topic.name}</strong><small>{topic.kind === 'system' ? 'System · top-level' : topic.breadcrumbLabel}</small></div>
        {#if topic.kind === 'system'}
          <span class="fixed-parent">Top-level</span>
        {:else}
          <label><span class="sr-only">Parent for {topic.name}</span><select name={'parent:' + topic.id}>
            <option value="" selected={!topic.parentId}>Unassigned / no parent</option>
            {#each parentOptions(topic.id) as parent}<option value={parent.id} selected={topic.parentId === parent.id}>{hierarchyLabel(parent)}</option>{/each}
          </select></label>
        {/if}
      </div>
    {/each}
    <button class="button primary" type="submit">Validate &amp; apply staged hierarchy</button>
  </form>
</section>

<style>
  .page-heading,.panel-heading { display:flex; justify-content:space-between; align-items:end; gap:1rem; }
  h1,h2,p { margin-top:0; } h1 { margin-bottom:.3rem; font-size:clamp(1.8rem,4vw,2.5rem); } h2 { margin-bottom:.2rem; font-size:1.15rem; }
  .eyebrow { margin-bottom:.3rem; color:#667085; font-size:.74rem; font-weight:750; letter-spacing:.08em; text-transform:uppercase; } .muted { color:#667085; } .section-copy { margin:.35rem 0 0; max-width:52rem; }
  .coverage { display:grid; gap:.75rem; margin:1rem 0; padding:1rem; border:1px solid #fdb022; border-radius:10px; background:#fffaeb; } .coverage.ready { border-color:#6ce9a6; background:#ecfdf3; } .coverage > div { display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; } .coverage > div span { color:#667085; } .coverage details { color:#344054; } .coverage ul { margin:.5rem 0 0; padding-left:1.2rem; }
  .panel { margin-bottom:1rem; padding:1.1rem; border:1px solid #dfe5ee; border-radius:10px; background:#fff; } .create-panel { display:grid; gap:1rem; margin-top:1rem; }
  .create-form { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(120px,.6fr) minmax(0,1.4fr); gap:.75rem; align-items:end; } .create-form .wide { grid-column:1/-1; }
  label { display:grid; gap:.35rem; color:#344054; font-weight:650; } input,select,textarea { box-sizing:border-box; width:100%; padding:.68rem .75rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; font:inherit; } textarea { resize:vertical; }
  .filter-form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.75rem; align-items:end; margin:1.5rem 0 1rem; } .filter-actions { display:flex; gap:.5rem; }
  .button { display:inline-block; width:max-content; padding:.7rem 1rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; color:#172033; text-decoration:none; cursor:pointer; font:inherit; } .button.primary { border-color:#172033; background:#172033; color:#fff; }
  .count { color:#667085; font-size:.85rem; font-weight:500; } .topic-table { display:grid; margin-top:1rem; } .table-header,.table-row { display:grid; grid-template-columns:minmax(0,2fr) 90px 90px 90px 90px 90px; gap:1rem; align-items:center; padding:.8rem .5rem; } .table-header { color:#667085; border-bottom:1px solid #dfe5ee; font-size:.72rem; font-weight:750; letter-spacing:.04em; text-transform:uppercase; } .table-row { border-bottom:1px solid #eaecf0; color:#172033; text-decoration:none; } .table-row:last-child { border-bottom:0; } .table-row.unassigned { background:#fffcf5; }
  .classification { display:grid; gap:.18rem; min-width:0; } .classification small { color:#667085; overflow-wrap:anywhere; } .classification em { color:#b54708; font-size:.78rem; font-style:normal; font-weight:700; }
  .kind-badge,.status-badge { display:inline-block; width:max-content; padding:.2rem .45rem; border-radius:999px; background:#f2f4f7; color:#475467; font-size:.78rem; font-weight:650; } .kind-badge.system { background:#eef4ff; color:#3538cd; } .status-badge { background:#ecfdf3; color:#027a48; } .status-badge.inactive { background:#f2f4f7; color:#667085; }
  .empty-state { padding:1rem; border:1px dashed #d0d5dd; border-radius:8px; }
  .hierarchy-panel { display:grid; gap:1rem; } .hierarchy-form { display:grid; gap:.55rem; } .hierarchy-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(220px,.8fr); gap:1rem; align-items:center; padding:.65rem 0; border-bottom:1px solid #eaecf0; } .hierarchy-row > div { display:grid; gap:.15rem; } .hierarchy-row small,.fixed-parent { color:#667085; } .fixed-parent { font-weight:650; }
  .form-error { margin:1rem 0; padding:.8rem; border-radius:8px; background:#fef3f2; color:#b42318; }
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  @media (max-width:820px) { .create-form { grid-template-columns:1fr; } .create-form .wide { grid-column:auto; } .table-header { display:none; } .table-row { grid-template-columns:minmax(0,1fr) auto; gap:.35rem .75rem; } .classification { grid-column:1/-1; } .hierarchy-row { grid-template-columns:1fr; } }
  @media (max-width:520px) { .filter-form { grid-template-columns:1fr; } }
</style>
