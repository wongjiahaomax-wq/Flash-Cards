<script lang="ts">
  import {
    casePrimaryTopicTargets,
    type TaxonomyWorkspaceItem,
    type WorkspaceCaseAssignment
  } from './taxonomy-workspace-model.ts';

  let {
    selectedCases,
    items,
    stagingBlockedReason = '',
    onStage,
    onClear
  }: {
    selectedCases: WorkspaceCaseAssignment[];
    items: TaxonomyWorkspaceItem[];
    stagingBlockedReason?: string;
    onStage: (caseIds: string[], topicId: string) => void;
    onClear: () => void;
  } = $props();

  let targetTopicId = $state('');
  const topicById = $derived(new Map(items.filter((item) => item.kind === 'topic').map((item) => [item.id, item])));
  const targetOptions = $derived(casePrimaryTopicTargets(items));
  const originalTopicIds = $derived([...new Set(selectedCases.map((caseItem) => caseItem.originalTopicId))]);
  const projectedTopicIds = $derived([...new Set(selectedCases.map((caseItem) => caseItem.topicId))]);
  const stagedCount = $derived(selectedCases.filter((caseItem) => caseItem.staged).length);

  function topicLabel(topicIds: string[]) {
    if (topicIds.length !== 1) return 'Multiple Topics';
    return topicById.get(topicIds[0])?.breadcrumbLabel ?? topicIds[0];
  }

  function stageSelection() {
    if (!targetTopicId || stagingBlockedReason) return;
    onStage(selectedCases.map((caseItem) => caseItem.id), targetTopicId);
  }
</script>

<aside class="inspector" aria-label="Case classification inspector">
  <div class="inspector-heading">
    <div>
      <p class="eyebrow">Case inspector</p>
      {#if selectedCases.length === 1}
        <h2>{selectedCases[0].title}</h2>
      {:else}
        <h2>{selectedCases.length} Cases selected</h2>
      {/if}
      <div class="identity-row">
        <span class="kind-badge">Case</span>
        {#if stagedCount}<span class="staged-badge">{stagedCount} staged</span>{/if}
      </div>
    </div>
    <button class="text-action" type="button" onclick={onClear}>Clear selection</button>
  </div>

  <dl class="metrics">
    <div><dt>Loaded Primary Topic</dt><dd>{topicLabel(originalTopicIds)}</dd></div>
    <div><dt>Projected Primary Topic</dt><dd>{topicLabel(projectedTopicIds)}</dd></div>
    {#if selectedCases.length > 1}<div><dt>Selected Cases</dt><dd>{selectedCases.length}</dd></div>{/if}
  </dl>

  {#if selectedCases.length > 1}
    <div class="selection-list" aria-label="Selected Cases">
      {#each selectedCases.slice(0, 8) as caseItem (caseItem.id)}
        <span>{caseItem.title}</span>
      {/each}
      {#if selectedCases.length > 8}<span class="muted">+ {selectedCases.length - 8} more</span>{/if}
    </div>
  {/if}

  <section class="reassign" aria-labelledby="primary-topic-reassign-heading">
    <div>
      <p class="eyebrow">Stage classification change</p>
      <h3 id="primary-topic-reassign-heading">Primary Topic</h3>
      <p>Choose one active Topic. A single selection or up to 60 selected Cases can be staged as one reviewed batch.</p>
    </div>
    <label>New Primary Topic
      <select bind:value={targetTopicId}>
        <option value="">Choose Topic…</option>
        {#each targetOptions as topic}
          <option value={topic.id}>{topic.breadcrumbLabel}</option>
        {/each}
      </select>
    </label>
    {#if stagingBlockedReason}
      <p class="blocked" role="status">{stagingBlockedReason}</p>
    {/if}
    <button
      class="button primary"
      type="button"
      disabled={!targetTopicId || Boolean(stagingBlockedReason) || selectedCases.length > 60}
      onclick={stageSelection}
    >Stage Primary Topic change</button>
    <p class="muted small">Case Tags are unchanged by this operation and remain a separate classification dimension.</p>
  </section>

  {#if selectedCases.length === 1}
    <a class="button" href={'/admin/cases/' + selectedCases[0].id}>Open full Case</a>
  {/if}
</aside>

<style>
  .inspector { position: sticky; top: 1rem; display: grid; align-content: start; gap: 1rem; min-width: 0; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 12px; background: #fff; }
  .inspector-heading { display: flex; justify-content: space-between; gap: .8rem; align-items: flex-start; }
  .eyebrow { margin: 0 0 .28rem; color: #667085; font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  h2,h3,p { margin-top: 0; }
  h2 { margin-bottom: 0; font-size: 1.25rem; overflow-wrap: anywhere; }
  h3 { margin-bottom: .25rem; font-size: 1rem; }
  .identity-row { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .55rem; }
  .kind-badge,.staged-badge { display: inline-block; width: max-content; padding: .18rem .45rem; border-radius: 999px; background: #eef4ff; color: #3538cd; font-size: .76rem; font-weight: 700; }
  .staged-badge { background: #fffaeb; color: #b54708; }
  .metrics { display: grid; gap: .55rem; margin: 0; }
  .metrics > div { display: grid; gap: .2rem; padding-bottom: .5rem; border-bottom: 1px solid #eaecf0; }
  .metrics dt { color: #667085; }
  .metrics dd { margin: 0; color: #172033; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
  .selection-list { display: grid; gap: .28rem; max-height: 12rem; padding: .65rem; border: 1px solid #eaecf0; border-radius: 8px; overflow: auto; font-size: .86rem; }
  .selection-list span { overflow-wrap: anywhere; }
  .reassign { display: grid; gap: .65rem; padding: .8rem; border: 1px solid #b2ccff; border-radius: 9px; background: #f8faff; }
  .reassign p { margin-bottom: 0; color: #667085; line-height: 1.45; }
  .reassign label { display: grid; gap: .3rem; color: #344054; font-weight: 650; }
  select { box-sizing: border-box; width: 100%; padding: .62rem .68rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  .blocked { padding: .55rem .65rem; border: 1px solid #fedf89; border-radius: 7px; background: #fffaeb; color: #93370d !important; }
  .button { display: inline-block; width: max-content; max-width: 100%; box-sizing: border-box; padding: .62rem .82rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .button:disabled { cursor: not-allowed; opacity: .5; }
  .text-action { padding: .2rem .3rem; border: 0; background: transparent; color: #475467; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 650; text-decoration: underline; text-underline-offset: 3px; }
  .muted { color: #667085; }
  .small { font-size: .8rem; }
  @media (max-width: 920px) { .inspector { position: static; } }
</style>
