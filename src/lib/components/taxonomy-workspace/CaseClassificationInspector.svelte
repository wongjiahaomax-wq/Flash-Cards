<script lang="ts">
  import SearchableTaxonomyPicker from './SearchableTaxonomyPicker.svelte';
  import type { SearchableTaxonomyOption } from './taxonomy-picker-model.ts';
  import {
    projectedCaseTagIds,
    projectedCaseTags,
    type CaseTagAssignment,
    type CaseTagOption,
    type StagedCaseTagChange
  } from './case-tag-workspace-model.ts';
  import {
    casePrimaryTopicTargets,
    type TaxonomyWorkspaceItem,
    type WorkspaceCaseAssignment
  } from './taxonomy-workspace-model.ts';

  let {
    selectedCases,
    items,
    availableTags,
    caseTagAssignments,
    stagedTagChanges,
    editable = false,
    onStage,
    onStageTags,
    onClear
  }: {
    selectedCases: WorkspaceCaseAssignment[];
    items: TaxonomyWorkspaceItem[];
    availableTags: CaseTagOption[];
    caseTagAssignments: CaseTagAssignment[];
    stagedTagChanges: StagedCaseTagChange[];
    editable?: boolean;
    onStage: (caseIds: string[], topicId: string) => void;
    onStageTags: (caseIds: string[], tagId: string, operation: 'add' | 'remove') => void;
    onClear: () => void;
  } = $props();

  let targetTopicId = $state('');
  let tagQuery = $state('');
  let selectedTagId = $state('');

  const singleCase = $derived(selectedCases.length === 1 ? selectedCases[0] : null);
  const topicById = $derived(new Map(items.filter((item) => item.kind === 'topic').map((item) => [item.id, item])));
  const targetOptions = $derived(casePrimaryTopicTargets(items));
  const searchableTopicOptions = $derived<SearchableTaxonomyOption[]>(targetOptions.map((topic) => ({
    id: topic.id,
    label: topic.breadcrumbLabel,
    meta: 'Topic'
  })));
  const originalTopicIds = $derived([...new Set(selectedCases.map((caseItem) => caseItem.originalTopicId))]);
  const projectedTopicIds = $derived([...new Set(selectedCases.map((caseItem) => caseItem.topicId))]);
  const primaryStagedCount = $derived(selectedCases.filter((caseItem) => caseItem.staged).length);
  const selectedCaseIdSet = $derived(new Set(selectedCases.map((caseItem) => caseItem.id)));
  const tagStagedCount = $derived(stagedTagChanges.filter((change) => selectedCaseIdSet.has(change.caseId)).length);
  const filteredTags = $derived(availableTags.filter((tag) => tag.name.toLocaleLowerCase().includes(tagQuery.trim().toLocaleLowerCase())));
  const singleCaseTags = $derived(singleCase
    ? projectedCaseTags(caseTagAssignments, stagedTagChanges, singleCase.id, availableTags)
    : []);
  const projectedTagIdsByCase = $derived(new Map(selectedCases.map((caseItem) => [
    caseItem.id,
    projectedCaseTagIds(caseTagAssignments, stagedTagChanges, caseItem.id)
  ])));
  const sharedTags = $derived(selectedCases.length > 1
    ? availableTags.filter((tag) => selectedCases.every((caseItem) => projectedTagIdsByCase.get(caseItem.id)?.has(tag.id)))
    : []);
  const anyTags = $derived(selectedCases.length > 1
    ? availableTags.filter((tag) => selectedCases.some((caseItem) => projectedTagIdsByCase.get(caseItem.id)?.has(tag.id)))
    : []);
  const selectedTag = $derived(availableTags.find((tag) => tag.id === selectedTagId) ?? null);
  const selectedTagAttachedCount = $derived(selectedTag
    ? selectedCases.filter((caseItem) => projectedTagIdsByCase.get(caseItem.id)?.has(selectedTag.id)).length
    : 0);

  function topicLabel(topicIds: string[]) {
    if (topicIds.length !== 1) return 'Multiple Topics';
    const id = topicIds[0];
    return id ? (topicById.get(id)?.breadcrumbLabel ?? id) : 'Unknown';
  }

  function stageSelection() {
    if (!targetTopicId) return;
    onStage(selectedCases.map((caseItem) => caseItem.id), targetTopicId);
  }

  function stageTags(operation: 'add' | 'remove', tagId = selectedTagId) {
    if (!tagId) return;
    onStageTags(selectedCases.map((caseItem) => caseItem.id), tagId, operation);
  }
</script>

<aside class="inspector" aria-label="Case classification inspector">
  <div class="heading">
    <div>
      <p class="eyebrow">Case inspector</p>
      {#if singleCase}
        <h2>{singleCase.title}</h2>
      {:else}
        <h2>{selectedCases.length} Cases selected</h2>
      {/if}
      <div class="badges">
        <span class="badge">Case</span>
        {#if editable && primaryStagedCount}<span class="staged">{primaryStagedCount} Topic staged</span>{/if}
        {#if editable && tagStagedCount}<span class="staged">{tagStagedCount} Tag staged</span>{/if}
      </div>
    </div>
    <button class="text-action" type="button" onclick={onClear}>Clear selection</button>
  </div>

  <dl class="metrics">
    {#if editable}
      <div><dt>Loaded Primary Topic</dt><dd>{topicLabel(originalTopicIds)}</dd></div>
      <div><dt>Projected Primary Topic</dt><dd>{topicLabel(projectedTopicIds)}</dd></div>
    {:else}
      <div><dt>Primary Topic</dt><dd>{topicLabel(originalTopicIds)}</dd></div>
    {/if}
    {#if selectedCases.length > 1}<div><dt>Selected Cases</dt><dd>{selectedCases.length}</dd></div>{/if}
  </dl>

  {#if selectedCases.length > 1}
    <div class="selection-list" aria-label="Selected Cases">
      {#each selectedCases.slice(0, 8) as caseItem (caseItem.id)}<span>{caseItem.title}</span>{/each}
      {#if selectedCases.length > 8}<span class="muted">+ {selectedCases.length - 8} more</span>{/if}
    </div>
  {/if}

  {#if editable}
    <section class="classification-section" aria-labelledby="primary-topic-heading">
      <div>
        <p class="eyebrow">Stage classification change</p>
        <h3 id="primary-topic-heading">Primary Topic</h3>
        <p>Changing Primary Topic changes canonical Case classification and Topic-specific learning context. Drag selected Cases onto a Topic, or use this searchable picker.</p>
      </div>
      <SearchableTaxonomyPicker
        bind:value={targetTopicId}
        options={searchableTopicOptions}
        label="New Primary Topic"
        searchPlaceholder="Search Topic or breadcrumb…"
        emptyLabel="Choose Topic…"
      />
      <button class="button primary" type="button" disabled={!targetTopicId || selectedCases.length > 60} onclick={stageSelection}>
        Stage Primary Topic change
      </button>
    </section>
  {/if}

  <section class="classification-section tags-section" aria-labelledby="case-tags-heading">
    <div>
      <p class="eyebrow">Flat classification</p>
      <h3 id="case-tags-heading">Case Tags</h3>
      {#if editable}
        <p>Tags stay separate from the System/Topic tree. Add or remove a Tag for one Case or up to 60 selected Cases.</p>
      {:else}
        <p>Tags stay separate from the System/Topic tree.</p>
      {/if}
    </div>

    {#if singleCase}
      <div class="tag-summary" aria-label={editable ? 'Projected Case Tags' : 'Case Tags'}>
        <strong>{editable ? 'Projected Tags' : 'Tags'}</strong>
        {#if singleCaseTags.length}
          <div class="tag-chips">
            {#each singleCaseTags as tag (tag.id)}
              <span class="tag-chip">
                {tag.name}
                {#if editable}
                  <button type="button" aria-label={`Stage removal of ${tag.name}`} onclick={() => stageTags('remove', tag.id)}>×</button>
                {/if}
              </span>
            {/each}
          </div>
        {:else}
          <span class="muted small">No Case Tags.</span>
        {/if}
      </div>
    {:else}
      <div class="bulk-tag-summary">
        <div><strong>On every selected Case</strong><span>{sharedTags.length ? sharedTags.map((tag) => tag.name).join(', ') : 'None'}</span></div>
        <div><strong>On at least one selected Case</strong><span>{anyTags.length ? anyTags.map((tag) => tag.name).join(', ') : 'None'}</span></div>
      </div>
    {/if}

    {#if editable}
      <label>Search existing Tags<input bind:value={tagQuery} placeholder="e.g. Anticoagulation" /></label>
      <label>Tag
        <select bind:value={selectedTagId}>
          <option value="">Choose Tag…</option>
          {#each filteredTags as tag (tag.id)}<option value={tag.id}>{tag.name}</option>{/each}
        </select>
      </label>
      {#if selectedTag}
        <p class="muted small">{selectedTagAttachedCount} of {selectedCases.length} selected {selectedCases.length === 1 ? 'Case has' : 'Cases have'} this Tag in the staged view.</p>
      {/if}
      <div class="tag-actions">
        <button class="button primary" type="button" disabled={!selectedTag || selectedCases.length > 60 || selectedTagAttachedCount === selectedCases.length} onclick={() => stageTags('add')}>Stage add</button>
        <button class="button" type="button" disabled={!selectedTag || selectedCases.length > 60 || selectedTagAttachedCount === 0} onclick={() => stageTags('remove')}>Stage remove</button>
      </div>
      <p class="muted small">Creating new Tags and System↔Tag exposure remain in their existing Admin workflows.</p>
    {:else}
      <p class="browse-note">Browse mode is read-only. Enter Organize taxonomy &amp; Cases to change the Primary Topic or Tags.</p>
    {/if}
  </section>

  {#if singleCase}<a class="button" href={'/admin/cases/' + singleCase.id}>Open full Case</a>{/if}
</aside>

<style>
  .inspector { position: sticky; top: 1rem; display: grid; align-content: start; gap: 1rem; min-width: 0; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 12px; background: #fff; }
  .heading { display: flex; justify-content: space-between; gap: .8rem; align-items: flex-start; }
  .eyebrow { margin: 0 0 .28rem; color: #667085; font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  h2,h3,p { margin-top: 0; }
  h2 { margin-bottom: 0; font-size: 1.25rem; overflow-wrap: anywhere; }
  h3 { margin-bottom: .25rem; font-size: 1rem; }
  .badges { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .55rem; }
  .badge,.staged { display: inline-block; padding: .18rem .45rem; border-radius: 999px; background: #eef4ff; color: #3538cd; font-size: .76rem; font-weight: 700; }
  .staged { background: #fffaeb; color: #b54708; }
  .metrics { display: grid; gap: .55rem; margin: 0; }
  .metrics > div { display: grid; gap: .2rem; padding-bottom: .5rem; border-bottom: 1px solid #eaecf0; }
  .metrics dt { color: #667085; }
  .metrics dd { margin: 0; color: #172033; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
  .selection-list { display: grid; gap: .28rem; max-height: 12rem; padding: .65rem; border: 1px solid #eaecf0; border-radius: 8px; overflow: auto; font-size: .86rem; }
  .classification-section { display: grid; gap: .65rem; padding: .8rem; border: 1px solid #b2ccff; border-radius: 9px; background: #f8faff; }
  .tags-section { border-color: #d0d5dd; background: #fcfcfd; }
  .classification-section p { margin-bottom: 0; color: #667085; line-height: 1.45; }
  .classification-section label { display: grid; gap: .3rem; color: #344054; font-weight: 650; }
  input,select { box-sizing: border-box; width: 100%; padding: .62rem .68rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  .button { display: inline-block; width: max-content; max-width: 100%; box-sizing: border-box; padding: .62rem .82rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .button:disabled { cursor: not-allowed; opacity: .5; }
  .text-action { padding: .2rem .3rem; border: 0; background: transparent; color: #475467; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 650; text-decoration: underline; text-underline-offset: 3px; }
  .tag-summary,.bulk-tag-summary { display: grid; gap: .4rem; }
  .tag-chips { display: flex; flex-wrap: wrap; gap: .35rem; }
  .tag-chip { display: inline-flex; align-items: center; gap: .28rem; padding: .28rem .42rem; border: 1px solid #d0d5dd; border-radius: 999px; background: #fff; color: #344054; font-size: .8rem; font-weight: 650; }
  .tag-chip button { display: grid; place-items: center; width: 1.15rem; height: 1.15rem; padding: 0; border: 0; border-radius: 999px; background: #f2f4f7; color: #475467; cursor: pointer; font: inherit; }
  .bulk-tag-summary > div { display: grid; gap: .15rem; padding-bottom: .35rem; border-bottom: 1px solid #eaecf0; }
  .bulk-tag-summary span { color: #667085; font-size: .82rem; line-height: 1.4; overflow-wrap: anywhere; }
  .tag-actions { display: flex; flex-wrap: wrap; gap: .45rem; }
  .browse-note { padding: .6rem .7rem; border-radius: 8px; background: #f8fafc; }
  .muted { color: #667085; }
  .small { font-size: .8rem; }
  @media (max-width: 920px) { .inspector { position: static; } }
</style>
