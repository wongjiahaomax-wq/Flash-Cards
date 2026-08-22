<script>
  import AccessibleInfo from '$lib/components/AccessibleInfo.svelte';
  let { selectedCase, concepts, primaryTopic, previewMode, editorLayout } = $props();
</script>

<section id="topics" class="panel stack">
  <div><p class="eyebrow">Learner routing</p><h2>Topics <span class="count">{selectedCase.topics.length}</span>{#if editorLayout === 'compact'}<AccessibleInfo label="Topics" text="The Primary Topic is the Case's canonical classification. Additional Study Topics are separate learner routes and should only be attached when every valid Case configuration remains a legitimate example." />{/if}</h2><p class="muted compact-hide-explainer">The Primary/default Topic is the Case's canonical classification. Additional Study Topics are separate learner routes and may be selected during study.</p></div>
  <div class="topic-primary">
    <div class="topic-row-heading"><div><strong>Primary/default Topic</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Primary Topic" text="Exactly one active Topic is the canonical/default classification for this Case." />{/if}<span class="topic-help">Exactly one active Case Topic must be primary.</span></div>{#if selectedCase.topics.find((topic) => topic.role === 'primary' && !topic.isActive)}<span class="status-badge inactive">Inactive relationship</span>{/if}</div>
    <div class="topic-primary-current">{#if primaryTopic}<a href={'/admin/topics/' + primaryTopic.id}>{primaryTopic.name}</a> · <a href={'/admin/topics/' + primaryTopic.id}>Edit Topic</a>{#if !primaryTopic.isActive}<span class="status-badge inactive">Topic inactive — select an active replacement</span>{/if}{:else}<span class="form-error inline-error">No primary Topic is attached. Select an active replacement below.</span>{/if}</div>
    <form method="POST" action="?/promoteTopic" class="topic-primary-form"><input type="hidden" name="case_id" value={selectedCase.case.id} /><label class="topic-select-label">Change primary/default Topic<select name="concept_id" required><option value="" disabled selected>Select an active Topic</option>{#each concepts as concept}{#if concept.id !== primaryTopic?.id}<option value={concept.id}>{concept.name}</option>{/if}{/each}</select></label><button class="button primary" type="submit">Save primary Topic</button></form>
  </div>
  <div class="topic-secondary">
    <div class="topic-row-heading"><div><strong>Additional Study Topics</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Study Topic" text="An Additional Study Topic is another learner route to this same Case. It is not a generic Tag." />{/if}<span class="topic-help">These attachments preserve cross-topic learner routing; they are not generic tags.</span></div></div>
    {#if selectedCase.topics.filter((topic) => topic.role === 'secondary').length === 0}<p class="empty-state">No additional Study Topics are attached.</p>{:else}<div class="topic-list">{#each selectedCase.topics.filter((topic) => topic.role === 'secondary') as topic}<div class="topic-list-row"><div><a href={'/admin/topics/' + topic.id}>{topic.name}</a>{#if !topic.isActive}<span class="status-badge inactive">Inactive Topic — historical attachment</span>{/if}</div><div class="actions">{#if topic.isActive}<form method="POST" action="?/promoteTopic"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="concept_id" value={topic.id} /><button class="button small" type="submit">Make primary</button></form>{/if}<form method="POST" action="?/removeSecondaryTopic"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="concept_id" value={topic.id} /><button class="button danger small" type="submit">Remove</button></form></div></div>{/each}</div>{/if}
    <form method="POST" action="?/addSecondaryTopic" class="topic-add-form"><input type="hidden" name="case_id" value={selectedCase.case.id} /><label>Add an active Study Topic<select name="concept_id" required><option value="" disabled selected>Select a Topic</option>{#each concepts as concept}{#if !selectedCase.topics.some((topic) => topic.id === concept.id)}<option value={concept.id}>{concept.name}</option>{/if}{/each}</select></label><button class="button" type="submit">Add Topic</button></form>
    {#if !previewMode}
      <div class="topic-create">
        <div class="topic-row-heading"><div><strong>Create a new Topic</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Create Topic" text="Create a Topic here, then choose whether it becomes the canonical Primary Topic or an Additional Study Topic for this Case." />{/if}<span class="topic-help">Create it here and choose how it should route learners for this Case.</span></div></div>
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
</style>
