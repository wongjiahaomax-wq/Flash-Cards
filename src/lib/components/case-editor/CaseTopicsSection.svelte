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
  /** @typedef {{ id: string, name: string }} SystemOption */
  /** @typedef {{ selectedCase: TopicsCase, concepts: ConceptOption[], systems?: SystemOption[], tagOptions?: TagOption[], primaryTopic?: CaseTopic | null, previewMode: boolean, editorLayout: CaseEditorLayout }} TopicsProps */
  let { selectedCase, concepts, systems = [], tagOptions = [], primaryTopic, previewMode, editorLayout } = $props();
  /** @type {TagOption[]} */
  let loadedTagOptions = $state([]);
  let effectiveTagOptions = $derived(tagOptions.length ? tagOptions : loadedTagOptions);
  /** @param {CaseTopic | undefined | null} topic */
  function systemIdFromTopic(topic) {
    return topic?.breadcrumb?.find((/** @param {BreadcrumbItem} item */ item) => item.kind === 'system')?.id ?? '';
  }
  let currentSystemId = $derived(systemIdFromTopic(primaryTopic));
  const topicGroups = $derived(groupTopics(concepts, primaryTopic?.id));

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
    const systemIndex = topic.breadcrumb?.findIndex((item) => item.kind === 'system') ?? -1;
    const path = topic.breadcrumb?.slice(systemIndex + 1).map((item) => item.name) ?? [topic.name];
    return path.join(' → ');
  }

  /** @param {ConceptOption[]} topicOptions @param {string | undefined} currentTopicId */
  function groupTopics(topicOptions, currentTopicId) {
    /** @type {Map<string, { label: string, topics: ConceptOption[] }>} */
    const groups = new Map();
    for (const concept of topicOptions) {
      if (concept.id === currentTopicId) continue;
      const system = concept.breadcrumb?.find((item) => item.kind === 'system');
      const label = system?.name ?? 'Unassigned Topics';
      const group = groups.get(label) ?? { label, topics: [] };
      group.topics.push(concept);
      groups.set(label, group);
    }
    return [...groups.values()];
  }
</script>

<section id="topics" class="panel stack">
  <div>
    <p class="eyebrow">Learner classification</p>
    <h2>Topic &amp; Tags{#if editorLayout === 'compact'}<AccessibleInfo label="Topic and Tags" text="The Primary Topic is the Case's canonical educational classification. Tags represent cross-cutting concepts and alternate contextual discovery." />{/if}</h2>
    <p class="muted compact-hide-explainer">The Primary Topic defines what this Case fundamentally teaches. Case Tags describe what else it demonstrates and can provide contextual learner discovery when exposed by a System.</p>
  </div>

  <div class="taxonomy-context">
    <div class="taxonomy-heading">
      <strong>Canonical hierarchy</strong>
      {#if primaryTopic}
        {#if previewMode}
          <span class="breadcrumb">{topicLabel(primaryTopic)}</span>
        {:else}
          <a class="breadcrumb" href={'/admin/topics/' + primaryTopic.id}>{topicLabel(primaryTopic)}</a>
        {/if}
      {:else}
        <span class="form-error inline-error">No primary Topic is attached.</span>
      {/if}
    </div>
    {#if !previewMode}<a class="taxonomy-manage" href="/admin/topics">Manage Systems &amp; Topics</a>{/if}
    <div class="taxonomy-placement">
      {#if !previewMode && primaryTopic}
        <form method="POST" action="?/assignPrimaryTopicToSystem" class="system-placement-form">
          <input type="hidden" name="case_id" value={selectedCase.case.id} />
          <input type="hidden" name="topic_id" value={primaryTopic.id} />
          <label>Parent System<select name="system_id" required><option value="" disabled selected={currentSystemId === ''}>Select a System</option>{#each systems as system}<option value={system.id} selected={system.id === currentSystemId}>{system.name}</option>{/each}</select></label>
          <button class="button" type="submit">Save</button>
        </form>
      {:else}
        <small class="compact-hide-explainer">System/parent placement is global taxonomy and is managed outside this Case.</small>
      {/if}
    </div>
  </div>

  <div class="classification-grid">
    <div class="classification-card topic-primary">
      <div class="card-heading">
        <div class="card-heading-copy">
          <div><strong>Primary Topic</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Primary Topic" text="Exactly one Topic is the canonical classification and direct reusable Topic-question context for this Case." />{/if}</div>
          <small class="topic-help">Exactly one active Topic is canonical for current Case behavior.</small>
        </div>
        {#if inactivePrimaryTopic(selectedCase.topics)}<span class="status-badge inactive">Inactive relationship</span>{/if}
      </div>

      <div class="current-block">
        <span class="field-kicker">Current Topic</span>
        <div class="topic-primary-current">
          {#if primaryTopic}
            {#if previewMode}<span>{topicLabel(primaryTopic)}</span>{:else}<a href={'/admin/topics/' + primaryTopic.id}>{topicLabel(primaryTopic)}</a><a class="inline-action" href={'/admin/topics/' + primaryTopic.id}>Edit</a>{/if}
            {#if !primaryTopic.isActive}<span class="status-badge inactive">Topic inactive — select an active replacement</span>{/if}
          {:else}
            <span class="form-error inline-error">No primary Topic is attached. Select an active replacement below.</span>
          {/if}
        </div>
      </div>

      <form method="POST" action="?/promoteTopic" class="topic-primary-form form-row">
        <input type="hidden" name="case_id" value={selectedCase.case.id} />
        <label class="topic-select-label">Change Primary Topic<select name="concept_id" required><option value="" disabled selected>Select an active Topic</option>{#each topicGroups as group}<optgroup label={group.label}>{#each group.topics as concept}<option value={concept.id}>{topicOptionLabel(concept)}</option>{/each}</optgroup>{/each}</select></label>
        <button class="button primary" type="submit">Save Primary Topic</button>
      </form>

      {#if !previewMode}
        <div class="topic-create secondary-section">
          <div class="secondary-heading">
            <div><strong>Create a new Topic</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Create Topic" text="Create a new global Topic and make it the canonical Primary Topic for this Case." />{/if}</div>
            <a href="/admin/topics">Manage hierarchy</a>
          </div>
          <small class="topic-help">Creates an unassigned global Topic and makes it canonical for this Case.</small>
          <form method="POST" action="?/createCaseTopic" class="topic-create-form form-row">
            <input type="hidden" name="case_id" value={selectedCase.case.id} />
            <input type="hidden" name="relationship_intent" value="primary" />
            <label>Topic name<input name="name" maxlength="200" required placeholder="e.g. Pericarditis" /></label>
            <button class="button" type="submit">Create &amp; make Primary</button>
          </form>
        </div>
      {/if}
    </div>

    <div class="classification-card case-tags-context">
      <div class="card-heading">
        <div class="card-heading-copy">
          <div><strong>Case Tags</strong>{#if editorLayout === 'compact'}<AccessibleInfo label="Case Tags" text="Tags capture cross-cutting clinical concepts and can provide alternate contextual learner discovery when a System exposes them." />{/if}</div>
          <small class="topic-help">System exposure is curated separately and is not changed here.</small>
        </div>
        {#if !previewMode}<a class="manage-tags" href="/admin/tags">Manage global Tags</a>{/if}
      </div>

      <div class="current-block tags-current">
        <span class="field-kicker">Current Tags</span>
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
        {:else}
          <span class="muted">No tags attached.</span>
        {/if}
      </div>

      {#if !previewMode}
        {#if effectiveTagOptions.some((tag) => !hasTag(selectedCase.caseTags, tag.id))}
          <form method="POST" action={'/admin/cases/' + encodeURIComponent(selectedCase.case.id) + '/case-tags'} class="tag-add-form form-row">
            <input type="hidden" name="case_id" value={selectedCase.case.id} />
            <input type="hidden" name="operation" value="add" />
            <label>Add existing Case Tag<select name="tag_id" required><option value="" disabled selected>Select an active Tag</option>{#each effectiveTagOptions as tag}{#if !hasTag(selectedCase.caseTags, tag.id)}<option value={tag.id}>{tag.name}</option>{/if}{/each}</select></label>
            <button class="button primary" type="submit">Add Tag</button>
          </form>
        {/if}

        <div class="tag-create secondary-section">
          <div class="secondary-heading"><strong>Create a new Case Tag</strong></div>
          <small class="topic-help">Creates a new active global Tag and attaches it to this Case.</small>
          <form method="POST" action={'/admin/cases/' + encodeURIComponent(selectedCase.case.id) + '/case-tags'} class="tag-create-form form-row">
            <input type="hidden" name="case_id" value={selectedCase.case.id} />
            <input type="hidden" name="operation" value="create-and-add" />
            <label>Tag name<input name="name" maxlength="120" required placeholder="e.g. Prolonged QTc" /></label>
            <button class="button" type="submit">Create &amp; add Tag</button>
          </form>
        </div>
      {:else}
        <small class="muted">Preview copies preserve Case Tags, but global Tag curation remains read-only in Preview Mode.</small>
      {/if}
    </div>
  </div>
</section>

<style>
  h2, p { margin-top: 0; }
  h2 { margin-bottom: 0.2rem; font-size: 1.2rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .stack { display: grid; gap: 0.75rem; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }

  .taxonomy-context { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.65rem 1rem; padding: 0.72rem 0.85rem; border: 1px solid #dfe5ee; border-radius: 8px; background: #fff; }
  .taxonomy-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.18rem 0.65rem; min-width: 0; }
  .taxonomy-placement { grid-column: 1 / -1; min-width: 0; }
  .system-placement-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 0.55rem; }
  .breadcrumb { min-width: 0; overflow-wrap: anywhere; color: #344054; font-weight: 650; }
  a.breadcrumb { text-decoration-thickness: 1px; text-underline-offset: 2px; }
  .taxonomy-manage, .manage-tags, .secondary-heading a, .inline-action { color: #344054; font-size: 0.84rem; font-weight: 500; white-space: nowrap; }

  .classification-grid { display: grid; gap: 0.85rem; }
  .classification-card { display: grid; align-content: start; gap: 0.72rem; min-width: 0; padding: 0.9rem; border: 1px solid #dfe5ee; border-radius: 8px; background: #fff; }
  .topic-primary { background: #f8fafc; }
  .card-heading, .secondary-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; }
  .card-heading-copy { display: grid; gap: 0.12rem; min-width: 0; }
  .topic-help { display: block; color: #667085; font-size: 0.8rem; font-weight: 400; }

  .current-block { display: grid; gap: 0.28rem; min-height: 2.6rem; }
  .field-kicker { color: #667085; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .topic-primary-current { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; font-size: 1rem; font-weight: 700; }
  .topic-primary-current > a:first-child { color: #172033; }
  .inline-action { font-size: 0.78rem; font-weight: 500; }

  .form-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 0.55rem; width: 100%; }
  .form-row label { min-width: 0; }
  .secondary-section { display: grid; gap: 0.5rem; margin-top: 0.1rem; padding-top: 0.72rem; border-top: 1px solid #e4e7ec; }

  .tag-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .tag-chip-wrap { display: flex; align-items: center; gap: 0.2rem; }
  .tag-chip { display: inline-block; padding: 0.18rem 0.45rem; border-radius: 999px; background: #eef4ff; color: #3538cd; font-size: 0.78rem; font-weight: 650; text-decoration: none; }
  .tag-chip.inactive { background: #f2f4f7; color: #667085; }
  .tag-remove { padding: 0.18rem 0.3rem; border: 0; background: transparent; color: #b42318; cursor: pointer; font: inherit; font-size: 0.72rem; }

  .status-badge { display: inline-block; width: max-content; padding: 0.2rem 0.45rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.76rem; font-weight: 650; white-space: nowrap; }
  .status-badge.inactive, .status-badge[class~="inactive"] { background: #f2f4f7; color: #667085; }
  .form-error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #fef3f2; color: #b42318; }
  .inline-error { margin: 0; }

  .button { display: inline-block; padding: 0.65rem 0.9rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; white-space: nowrap; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  label { display: grid; gap: 0.3rem; color: #344054; font-weight: 650; }
  input, select { width: 100%; box-sizing: border-box; padding: 0.62rem 0.7rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }

  :global(.case-editor[data-editor-layout="compact"]) .topic-primary { background: #fff; }
  :global(.case-editor[data-editor-layout="compact"]) .compact-hide-explainer,
  :global(.case-editor[data-editor-layout="compact"]) .topic-help { display: none; }

  @media (min-width: 1100px) {
    .classification-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: stretch; }
    :global(.case-editor[data-editor-layout="compact"]) #topics { scroll-margin-top: 4.75rem; }
  }

  @media (max-width: 720px) {
    .taxonomy-context { align-items: flex-start; }
    .taxonomy-manage { white-space: normal; }
  }

  @media (max-width: 560px) {
    .system-placement-form { grid-template-columns: 1fr; }
    .form-row { grid-template-columns: 1fr; }
    .button { width: 100%; }
    .card-heading, .secondary-heading { align-items: flex-start; flex-direction: column; }
    .manage-tags, .secondary-heading a { white-space: normal; }
  }
</style>
