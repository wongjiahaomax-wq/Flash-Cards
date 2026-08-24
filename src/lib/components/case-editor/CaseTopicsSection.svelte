<script>
  import AccessibleInfo from '$lib/components/AccessibleInfo.svelte';

  /** @typedef {'classic' | 'compact'} CaseEditorLayout */
  /** @typedef {{ id: string, name: string, kind?: string }} BreadcrumbItem */
  /** @typedef {{ id: string, name: string, role: string, isActive: boolean, breadcrumb?: BreadcrumbItem[] }} CaseTopic */
  /** @typedef {{ id: string, name: string, breadcrumb?: BreadcrumbItem[] }} ConceptOption */
  /** @typedef {{ id: string, name: string, isActive: boolean }} CaseTag */
  /** @typedef {{ case: { id: string }, topics: CaseTopic[], caseTags?: CaseTag[] }} TopicsCase */
  /** @typedef {{ selectedCase: TopicsCase, concepts: ConceptOption[], primaryTopic?: CaseTopic | null, previewMode: boolean, editorLayout: CaseEditorLayout }} TopicsProps */
  let { selectedCase, concepts, primaryTopic, previewMode, editorLayout } = $props();

  /** @param {CaseTopic[]} topics */
  function inactivePrimaryTopic(topics) {
    return topics.find((topic) => topic.role === 'primary' && !topic.isActive);
  }

  /** @param {CaseTopic[]} topics */
  function secondaryTopics(topics) {
    return topics.filter((topic) => topic.role === 'secondary');
  }

  /** @param {CaseTopic[]} topics @param {string} conceptId */
  function hasTopic(topics, conceptId) {
    return topics.some((topic) => topic.id === conceptId);
  }

  /** @param {{ name: string, breadcrumb?: BreadcrumbItem[] }} topic */
  function topicLabel(topic) {
    return topic.breadcrumb?.length ? topic.breadcrumb.map((item) => item.name).join(' → ') : topic.name;
  }
</script>

<section id="topics" class="panel stack">
  <div><p class="eyebrow">Learner routing</p><h2>Topics <span class="count">{selectedCase.topics.length}</span>{#if editorLayout === 'compact'}<AccessibleInfo label="Topics" text="The Primary Topic is the Case's canonical classification. Additional Study Topics are separate learner routes and should only be attached when every valid Case configuration remains a legitimate example." />{/if}</h2><p class="muted compact-hide-explainer">The Primary/default Topic is the Case's canonical classification. Additional Study Topics are separate learner routes and may be selected during study.</p></div>

  <div class="taxonomy-context">
    <div>
      <strong>Canonical hierarchy</strong>
      {#if primaryTopic}
        <span class="breadcrumb">{topicLabel(primaryTopic)}</span>
      {:else}
        <span class="form-error inline-error">No primary Topic is attached.</span>
      {/if}
      <small>System/parent placement is global taxonomy. It is not changed from this Case.</small>
    </div>
    {#if !previewMode}<div class="taxonomy-links"><a href="/admin/topics">Manage Systems &amp; Topics</a>{#if primaryTopic}<a href={'/admin/topics/' + primaryTopic.id}>Open primary Topic</a>{/if}</div>{/if}
  </div>

  <div class="case-tags-context">
    <div><strong>Case Tags</strong><small>All cross-cutting Tags on this Case. System exposure is curated separately.</small></div>
    {#if selectedCase.caseTags?.length}
      <div class="tag-chips">{#each selectedCase.caseTags as tag}{#if previewMode}<span class:inactive={!tag.isActive} class="tag-chip">{tag.name}</span>{:else}<a class:inactive={!tag.isActive} class="tag-chip" href={'/admin/tags?tag=' + tag.id}>{tag.name}</a>{/if}{/each}</div>
    {:else}<span class="muted">No Case Tags.</span>{/if}
    {#if !previewMode}<a class="manage-tags" href="/admin/tags">Manage Case Tags</a>{/if}
  </div>

  <div class="topic-primary">
    <div class="topic-row-heading"><div><strong>Primary/default Topic</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Primary Topic" text="Exactly one active Topic is the canonical/default classification for this Case." />{/if}<span class="topic-help">Exactly one active Case Topic must be primary.</span></div>{#if inactivePrimaryTopic(selectedCase.topics)}<span class="status-badge inactive">Inactive relationship</span>{/if}</div>
    <div class="topic-primary-current">{#if primaryTopic}<a href={previewMode ? undefined : '/admin/topics/' + primaryTopic.id}>{topicLabel(primaryTopic)}</a>{#if !previewMode} · <a href={'/admin/topics/' + primaryTopic.id}>Edit Topic</a>{/if}{#if !primaryTopic.isActive}<span class="status-badge inactive">Topic inactive — select an active replacement</span>{/if}{:else}<span class="form-error inline-error">No primary Topic is attached. Select an active replacement below.</span>{/if}</div>
    <form method="POST" action="?/promoteTopic" class="topic-primary-form"><input type="hidden" name="case_id" value={selectedCase.case.id} /><label class="topic-select-label">Change primary/default Topic<select name="concept_id" required><option value="" disabled selected>Select an active Topic</option>{#each concepts as concept}{#if concept.id !== primaryTopic?.id}<option value={concept.id}>{topicLabel(concept)}</option>{/if}{/each}</select></label><button class="button primary" type="submit">Save primary Topic</button></form>
  </div>
  <div class="topic-secondary">
    <div class="topic-row-heading"><div><strong>Additional Study Topics</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Study Topic" text="An Additional Study Topic is another learner route to this same Case. It is not a generic Tag." />{/if}<span class="topic-help">These attachments preserve cross-topic learner routing; they are not generic tags.</span></div></div>
    {#if secondaryTopics(selectedCase.topics).length === 0}<p class="empty-state">No additional Study Topics are attached.</p>{:else}<div class="topic-list">{#each secondaryTopics(selectedCase.topics) as topic}<div class="topic-list-row"><div>{#if previewMode}<span>{topicLabel(topic)}</span>{:else}<a href={'/admin/topics/' + topic.id}>{topicLabel(topic)}</a>{/if}{#if !topic.isActive}<span class="status-badge inactive">Inactive Topic — historical attachment</span>{/if}</div><div class="actions">{#if topic.isActive}<form method="POST" action="?/promoteTopic"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="concept_id" value={topic.id} /><button class="button small" type="submit">Make primary</button></form>{/if}<form method="POST" action="?/removeSecondaryTopic"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="concept_id" value={topic.id} /><button class="button danger small" type="submit">Remove</button></form></div></div>{/each}</div>{/if}
    <form method="POST" action="?/addSecondaryTopic" class="topic-add-form"><input type="hidden" name="case_id" value={selectedCase.case.id} /><label>Add an active Study Topic<select name="concept_id" required><option value="" disabled selected>Select a Topic</option>{#each concepts as concept}{#if !hasTopic(selectedCase.topics, concept.id)}<option value={concept.id}>{topicLabel(concept)}</option>{/if}{/each}</select></label><button class="button" type="submit">Add Topic</button></form>
    {#if !previewMode}
      <div class="topic-create">
        <div class="topic-row-heading"><div><strong>Create a new Topic</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Create Topic" text="Create a Topic here, then choose whether it becomes the canonical Primary Topic or an Additional Study Topic for this Case." />{/if}<span class="topic-help">This creates an unassigned global Topic and attaches it to this Case. Place it under a System later from Systems &amp; Topics.</span></div><a href="/admin/topics">Manage hierarchy</a></div>
        <form method="POST" action="?/createCaseTopic" class="topic-create-form"><input type="hidden" name="case_id" value={selectedCase.case.id} /><label>Topic name<input name="name" maxlength="200" required placeholder="e.g. Pericarditis" /></label><div class="actions"><button class="button primary" type="submit" name="relationship_intent" value="primary">Create &amp; make primary</button><button class="button" type="submit" name="relationship_intent" value="secondary">Create &amp; add as Study Topic</button></div></form>
      </div>
    {/if}
  </div>
</section>

<style>
  h2, p { margin-top: 0; } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; } .stack { display: grid; gap: 0.85rem; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .taxonomy-context,.case-tags-context { display:flex; justify-content:space-between; align-items:center; gap:1rem; padding:.8rem .9rem; border:1px solid #dfe5ee; border-radius:8px; background:#fff; } .taxonomy-context > div:first-child,.case-tags-context > div:first-child { display:grid; gap:.2rem; } .taxonomy-context small,.case-tags-context small { color:#667085; } .breadcrumb { color:#344054; font-weight:650; } .taxonomy-links { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:.6rem; } .taxonomy-links a,.manage-tags { color:#344054; font-size:.86rem; }
  .case-tags-context { align-items:flex-start; } .tag-chips { display:flex; flex:1; flex-wrap:wrap; gap:.35rem; } .tag-chip { display:inline-block; padding:.18rem .45rem; border-radius:999px; background:#eef4ff; color:#3538cd; font-size:.78rem; font-weight:650; text-decoration:none; } .tag-chip.inactive { background:#f2f4f7; color:#667085; }
  .topic-primary, .topic-secondary { display: grid; gap: 0.75rem; padding: 0.9rem; border: 1px solid #eaecf0; border-radius: 8px; background: #f8fafc; }
  .topic-row-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
  .topic-help { display: block; margin-top: 0.2rem; color: #667085; font-size: 0.86rem; font-weight: 400; }
  .topic-primary-current { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; font-size: 1.05rem; font-weight: 700; }
  .topic-primary-current a, .topic-list-row a { color: #172033; }
  .topic-primary-form, .topic-add-form, .topic-create-form { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: end; }
  .topic-select-label, .topic-add-form label, .topic-create-form label { flex: 1; min-width: min(100%, 280px); }
  .topic-create { display: grid; gap: 0.75rem; margin-top: 0.35rem; padding-top: 0.9rem; border-top: 1px solid #e4e7ec; }
  .topic-list { display: grid; gap: 0.5rem; }
  .topic-list-row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.65rem 0; border-bottom: 1px solid #e4e7ec; }
  .topic-list-row:last-child { border-bottom: 0; } .topic-list-row > div:first-child { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
  .status-badge { display: inline-block; width: max-content; padding: 0.2rem 0.45rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.76rem; font-weight: 650; white-space: nowrap; }
  .status-badge.inactive, .status-badge[class~="inactive"] { background: #f2f4f7; color: #667085; }
  .form-error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #fef3f2; color: #b42318; } .inline-error { margin: 0; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; } .actions form { display: contents; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.small { padding: 0.5rem 0.65rem; font-size: 0.82rem; } .button.danger { border-color: #fecdca; color: #b42318; }
  label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, select { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  :global(.case-editor[data-editor-layout="compact"]) .topic-primary, :global(.case-editor[data-editor-layout="compact"]) .topic-secondary { background: #fff; }
  :global(.case-editor[data-editor-layout="compact"]) .compact-hide-explainer, :global(.case-editor[data-editor-layout="compact"]) .topic-help { display: none; }
  @media (min-width: 1024px) { :global(.case-editor[data-editor-layout="compact"]) #topics { scroll-margin-top: 4.75rem; } }
  @media (max-width:720px) { .taxonomy-context,.case-tags-context { align-items:flex-start; flex-direction:column; } .taxonomy-links { justify-content:flex-start; } }
</style>