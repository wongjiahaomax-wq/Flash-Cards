<script>
  import { onMount } from 'svelte';
  import AccessibleInfo from '$lib/components/AccessibleInfo.svelte';

  /** @typedef {'classic' | 'compact'} CaseEditorLayout */
  /** @typedef {{ id: string, name: string, kind?: string }} BreadcrumbItem */
  /** @typedef {{ id: string, name: string, role: string, isActive: boolean, breadcrumb?: BreadcrumbItem[] }} CaseTopic */
  /** @typedef {{ id: string, name: string, breadcrumb?: BreadcrumbItem[] }} ConceptOption */
  /** @typedef {{ id: string, name: string, isActive: boolean }} CaseTag */
  /** @typedef {{ id: string, name: string }} TagOption */
  /** @typedef {{ case: { id: string }, topics: CaseTopic[], caseTags?: CaseTag[] }} TopicsCase */
  /** @typedef {{ selectedCase: TopicsCase, concepts: ConceptOption[], tagOptions?: TagOption[], primaryTopic?: CaseTopic | null, previewMode: boolean, editorLayout: CaseEditorLayout }} TopicsProps */
  let { selectedCase, concepts, tagOptions = [], primaryTopic, previewMode, editorLayout } = $props();
  /** @type {TagOption[]} */
  let loadedTagOptions = $state([]);
  let effectiveTagOptions = $derived(tagOptions.length ? tagOptions : loadedTagOptions);

  onMount(async () => {
    if (previewMode || tagOptions.length) return;
    try {
      const response = await fetch(`/admin/cases/${encodeURIComponent(selectedCase.case.id)}/case-tags`);
      if (!response.ok) return;
      const payload = await response.json();
      loadedTagOptions = Array.isArray(payload.tags) ? payload.tags : [];
    } catch {
      // The global Tags link remains the no-JS/network fallback.
    }
  });

  /** @param {CaseTopic[]} topics */
  function inactivePrimaryTopic(topics) {
    return topics.find((topic) => topic.role === 'primary' && !topic.isActive);
  }

  /** @param {CaseTopic[]} topics */
  function legacyNonPrimaryTopics(topics) {
    return topics.filter((topic) => topic.role !== 'primary');
  }

  /** @param {CaseTag[] | undefined} caseTags @param {string} tagId */
  function hasTag(caseTags, tagId) {
    return Boolean(caseTags?.some((tag) => tag.id === tagId));
  }

  /** @param {{ name: string, breadcrumb?: BreadcrumbItem[] }} topic */
  function topicLabel(topic) {
    return topic.breadcrumb?.length ? topic.breadcrumb.map((item) => item.name).join(' → ') : topic.name;
  }

  /** @param {{ name: string, breadcrumb?: BreadcrumbItem[] }} topic */
  function topicOptionLabel(topic) {
    return `${topicLabel(topic)}.topic`;
  }
</script>

<section id="topics" class="panel stack">
  <div>
    <p class="eyebrow">Learner classification</p>
    <h2>Topic &amp; Tags{#if editorLayout === 'compact'}<AccessibleInfo label="Topic and Tags" text="The Primary Topic is the Case's canonical educational classification. Tags represent cross-cutting concepts and alternate contextual discovery." />{/if}</h2>
    <p class="muted compact-hide-explainer">The Primary Topic defines what this Case fundamentally teaches. Case Tags describe what else it demonstrates and can provide contextual learner discovery when exposed by a System.</p>
  </div>

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

  {#if legacyNonPrimaryTopics(selectedCase.topics).length}
    <div class="legacy-warning" role="status">
      <strong>Legacy non-primary Topic relationships detected.</strong>
      <span>This Case must be handled by the reviewed Topic-to-Tag data migration before this feature can be released.</span>
    </div>
  {/if}

  <div class="topic-primary">
    <div class="topic-row-heading">
      <div><strong>Primary Topic</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Primary Topic" text="Exactly one Topic is the canonical classification and direct reusable Topic-question context for this Case." />{/if}<span class="topic-help">Exactly one active Topic is canonical for current Case behavior.</span></div>
      {#if inactivePrimaryTopic(selectedCase.topics)}<span class="status-badge inactive">Inactive relationship</span>{/if}
    </div>
    <div class="topic-primary-current">{#if primaryTopic}<a href={previewMode ? undefined : '/admin/topics/' + primaryTopic.id}>{topicLabel(primaryTopic)}</a>{#if !previewMode} · <a href={'/admin/topics/' + primaryTopic.id}>Edit Topic</a>{/if}{#if !primaryTopic.isActive}<span class="status-badge inactive">Topic inactive — select an active replacement</span>{/if}{:else}<span class="form-error inline-error">No primary Topic is attached. Select an active replacement below.</span>{/if}</div>
    <form method="POST" action="?/promoteTopic" class="topic-primary-form">
      <input type="hidden" name="case_id" value={selectedCase.case.id} />
      <label class="topic-select-label">Change Primary Topic<select name="concept_id" required><option value="" disabled selected>Select an active Topic</option>{#each concepts as concept}{#if concept.id !== primaryTopic?.id}<option value={concept.id}>{topicOptionLabel(concept)}</option>{/if}{/each}</select></label>
      <button class="button primary" type="submit">Save Primary Topic</button>
    </form>
    {#if !previewMode}
      <div class="topic-create">
        <div class="topic-row-heading"><div><strong>Create a new Topic</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Create Topic" text="Create a new global Topic and make it the canonical Primary Topic for this Case." />{/if}<span class="topic-help">This creates an unassigned global Topic and makes it canonical for this Case. Place it under a System later from Systems &amp; Topics.</span></div><a href="/admin/topics">Manage hierarchy</a></div>
        <form method="POST" action="?/createCaseTopic" class="topic-create-form">
          <input type="hidden" name="case_id" value={selectedCase.case.id} />
          <input type="hidden" name="relationship_intent" value="primary" />
          <label>Topic name<input name="name" maxlength="200" required placeholder="e.g. Pericarditis" /></label>
          <button class="button primary" type="submit">Create &amp; make Primary</button>
        </form>
      </div>
    {/if}
  </div>

  <div class="case-tags-context">
    <div class="case-tags-heading">
      <div><strong>Case Tags</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Case Tags" text="Tags capture cross-cutting clinical concepts and can provide alternate contextual learner discovery when a System exposes them." />{/if}</div>
      <small>System exposure is curated separately and is not changed here.</small>
    </div>
    {#if selectedCase.caseTags?.length}
      <div class="tag-chips">
        {#each selectedCase.caseTags as tag}
          <div class="tag-chip-wrap">
            {#if previewMode}<span class:inactive={!tag.isActive} class="tag-chip">{tag.name}</span>{:else}<a class:inactive={!tag.isActive} class="tag-chip" href={'/admin/tags?tag=' + tag.id}>{tag.name}</a>{/if}
            {#if !previewMode}
              <form method="POST" action={'/admin/cases/' + encodeURIComponent(selectedCase.case.id) + '/case-tags'}><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="operation" value="remove" /><input type="hidden" name="tag_id" value={tag.id} /><button class="tag-remove" type="submit" aria-label={'Remove ' + tag.name + ' from this Case'}>Remove</button></form>
            {/if}
          </div>
        {/each}
      </div>
    {:else}<span class="muted">No Case Tags.</span>{/if}

    {#if !previewMode}
      {#if effectiveTagOptions.some((tag) => !hasTag(selectedCase.caseTags, tag.id))}
        <form method="POST" action={'/admin/cases/' + encodeURIComponent(selectedCase.case.id) + '/case-tags'} class="tag-add-form">
          <input type="hidden" name="case_id" value={selectedCase.case.id} />
          <input type="hidden" name="operation" value="add" />
          <label>Add Case Tag<select name="tag_id" required><option value="" disabled selected>Select an active Tag</option>{#each effectiveTagOptions as tag}{#if !hasTag(selectedCase.caseTags, tag.id)}<option value={tag.id}>{tag.name}</option>{/if}{/each}</select></label>
          <button class="button" type="submit">Add Tag</button>
        </form>
      {/if}
      <a class="manage-tags" href="/admin/tags">Manage global Tags</a>
    {:else}
      <small class="muted">Preview copies preserve Case Tags, but global Tag curation remains read-only in Preview Mode.</small>
    {/if}
  </div>
</section>

<style>
  h2, p { margin-top: 0; } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; } .stack { display: grid; gap: 0.85rem; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .taxonomy-context,.case-tags-context { display:flex; justify-content:space-between; align-items:center; gap:1rem; padding:.8rem .9rem; border:1px solid #dfe5ee; border-radius:8px; background:#fff; } .taxonomy-context > div:first-child,.case-tags-heading { display:grid; gap:.2rem; } .taxonomy-context small,.case-tags-context small { color:#667085; } .breadcrumb { color:#344054; font-weight:650; } .taxonomy-links { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:.6rem; } .taxonomy-links a,.manage-tags { color:#344054; font-size:.86rem; }
  .legacy-warning { display:grid; gap:.2rem; padding:.75rem .85rem; border:1px solid #fedf89; border-radius:8px; background:#fffaeb; color:#7a2e0e; }
  .case-tags-context { align-items:flex-start; flex-wrap:wrap; } .tag-chips { display:flex; flex:1; flex-wrap:wrap; gap:.45rem; } .tag-chip-wrap { display:flex; align-items:center; gap:.25rem; } .tag-chip { display:inline-block; padding:.18rem .45rem; border-radius:999px; background:#eef4ff; color:#3538cd; font-size:.78rem; font-weight:650; text-decoration:none; } .tag-chip.inactive { background:#f2f4f7; color:#667085; } .tag-remove { padding:.18rem .35rem; border:0; background:transparent; color:#b42318; cursor:pointer; font:inherit; font-size:.75rem; }
  .tag-add-form { display:flex; flex-wrap:wrap; align-items:end; gap:.55rem; width:100%; } .tag-add-form label { flex:1; min-width:min(100%,260px); }
  .topic-primary { display: grid; gap: 0.75rem; padding: 0.9rem; border: 1px solid #eaecf0; border-radius: 8px; background: #f8fafc; }
  .topic-row-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
  .topic-help { display: block; margin-top: 0.2rem; color: #667085; font-size: 0.86rem; font-weight: 400; }
  .topic-primary-current { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; font-size: 1.05rem; font-weight: 700; }
  .topic-primary-current a { color: #172033; }
  .topic-primary-form, .topic-create-form { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: end; }
  .topic-select-label, .topic-create-form label { flex: 1; min-width: min(100%, 280px); }
  .topic-create { display: grid; gap: 0.75rem; margin-top: 0.35rem; padding-top: 0.9rem; border-top: 1px solid #e4e7ec; }
  .status-badge { display: inline-block; width: max-content; padding: 0.2rem 0.45rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.76rem; font-weight: 650; white-space: nowrap; }
  .status-badge.inactive, .status-badge[class~="inactive"] { background: #f2f4f7; color: #667085; }
  .form-error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #fef3f2; color: #b42318; } .inline-error { margin: 0; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, select { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  :global(.case-editor[data-editor-layout="compact"]) .topic-primary { background: #fff; }
  :global(.case-editor[data-editor-layout="compact"]) .compact-hide-explainer, :global(.case-editor[data-editor-layout="compact"]) .topic-help { display: none; }
  @media (min-width: 1024px) { :global(.case-editor[data-editor-layout="compact"]) #topics { scroll-margin-top: 4.75rem; } }
  @media (max-width:720px) { .taxonomy-context,.case-tags-context { align-items:flex-start; flex-direction:column; } .taxonomy-links { justify-content:flex-start; } }
</style>