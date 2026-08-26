<script lang="ts">
  import { enhance } from '$app/forms';
  import type { StagedCaseTagChange } from './case-tag-workspace-model.ts';
  import type {
    StagedCasePrimaryTopicChange,
    StagedTopicMove,
    TaxonomyWorkspaceItem
  } from './taxonomy-workspace-model.ts';

  let {
    moves,
    caseChanges,
    tagChanges,
    items,
    onDiscardAll,
    onUndoMove,
    onUndoCaseChange,
    onUndoTagChange
  }: {
    moves: StagedTopicMove[];
    caseChanges: StagedCasePrimaryTopicChange[];
    tagChanges: StagedCaseTagChange[];
    items: TaxonomyWorkspaceItem[];
    onDiscardAll: () => void;
    onUndoMove: (topicId: string) => void;
    onUndoCaseChange: (caseId: string) => void;
    onUndoTagChange: (caseId: string, tagId: string) => void;
  } = $props();

  const byId = $derived(new Map(items.map((item) => [item.id, item])));
  const totalChanges = $derived(moves.length + caseChanges.length + tagChanges.length);

  function parentLabel(parentId: string | null) {
    if (!parentId) return 'Unassigned';
    return byId.get(parentId)?.breadcrumbLabel ?? 'Unknown / changed parent';
  }

  function topicLabel(topicId: string) {
    return byId.get(topicId)?.breadcrumbLabel ?? topicId;
  }

  const hierarchyChangesJson = $derived(JSON.stringify(moves.map((move) => ({
    id: move.id,
    parentId: move.parentId,
    expectedParentId: move.originalParentId
  }))));

  const caseChangesJson = $derived(JSON.stringify(caseChanges.map((change) => ({
    caseId: change.caseId,
    conceptId: change.topicId,
    expectedConceptId: change.originalTopicId
  }))));

  const tagChangesJson = $derived(JSON.stringify(tagChanges.map((change) => ({
    caseId: change.caseId,
    tagId: change.tagId,
    operation: change.operation,
    expectedAttached: change.expectedAttached
  }))));
</script>

<section class="change-tray" aria-label="Staged taxonomy and Case changes">
  <div class="tray-heading">
    <div>
      <p class="eyebrow">Staged changes</p>
      <h2>{totalChanges} pending {totalChanges === 1 ? 'change' : 'changes'}</h2>
      <p>Nothing has been saved yet. Review the loaded value and proposed value before applying this batch.</p>
    </div>
    <button class="button" type="button" onclick={onDiscardAll}>Discard all</button>
  </div>

  {#if moves.length}
    <section class="change-section" aria-labelledby="hierarchy-changes-heading">
      <h3 id="hierarchy-changes-heading">Topic hierarchy · {moves.length}</h3>
      <ol class="change-list">
        {#each moves as move (move.id)}
          <li>
            <div class="change-copy">
              <strong>{byId.get(move.id)?.name ?? move.id}</strong>
              <span>{parentLabel(move.originalParentId)} <span aria-hidden="true">→</span><span class="sr-only">to</span> {parentLabel(move.parentId)}</span>
            </div>
            <button class="text-action" type="button" onclick={() => onUndoMove(move.id)}>Undo</button>
          </li>
        {/each}
      </ol>
      <form method="POST" action="?/applyHierarchy" use:enhance class="apply-form">
        <input type="hidden" name="changes_json" value={hierarchyChangesJson} />
        <div class="apply-copy">
          <strong>Validate hierarchy batch</strong>
          <span>If a Topic parent changed since this workspace loaded, the batch fails before proposed writes.</span>
        </div>
        <button class="button primary" type="submit">Validate &amp; apply hierarchy</button>
      </form>
    </section>
  {/if}

  {#if caseChanges.length}
    <section class="change-section" aria-labelledby="case-topic-changes-heading">
      <h3 id="case-topic-changes-heading">Case Primary Topic · {caseChanges.length}</h3>
      <ol class="change-list">
        {#each caseChanges as change (change.caseId)}
          <li>
            <div class="change-copy">
              <strong>{change.title}</strong>
              <span>{topicLabel(change.originalTopicId)} <span aria-hidden="true">→</span><span class="sr-only">to</span> {topicLabel(change.topicId)}</span>
            </div>
            <button class="text-action" type="button" onclick={() => onUndoCaseChange(change.caseId)}>Undo</button>
          </li>
        {/each}
      </ol>
      <form method="POST" action="?/applyCasePrimaryTopics" use:enhance class="apply-form">
        <input type="hidden" name="case_changes_json" value={caseChangesJson} />
        <div class="apply-copy">
          <strong>Validate Case batch</strong>
          <span>If any selected Case has a different Primary Topic than the loaded value, the batch fails before the canonical bulk mutation.</span>
        </div>
        <button class="button primary" type="submit">Validate &amp; apply Primary Topics</button>
      </form>
    </section>
  {/if}

  {#if tagChanges.length}
    <section class="change-section" aria-labelledby="case-tag-changes-heading">
      <h3 id="case-tag-changes-heading">Case Tags · {tagChanges.length}</h3>
      <ol class="change-list">
        {#each tagChanges as change (`${change.caseId}:${change.tagId}`)}
          <li>
            <div class="change-copy">
              <strong>{change.title}</strong>
              <span>{change.operation === 'add' ? '+' : '−'} {change.tagName}</span>
            </div>
            <button class="text-action" type="button" onclick={() => onUndoTagChange(change.caseId, change.tagId)}>Undo</button>
          </li>
        {/each}
      </ol>
      <form method="POST" action="?/applyCaseTags" use:enhance class="apply-form">
        <input type="hidden" name="tag_changes_json" value={tagChangesJson} />
        <div class="apply-copy">
          <strong>Validate Case Tag batch</strong>
          <span>Each loaded Case/Tag membership is checked again before canonical Tag add/remove mutations run.</span>
        </div>
        <button class="button primary" type="submit">Validate &amp; apply Case Tags</button>
      </form>
    </section>
  {/if}

  <p class="boundary-note">Hierarchy, Primary Topic, and Case Tag changes are intentionally staged as separate mutation domains in this milestone. The workspace prevents mixing those domains in one pending batch. Unified cross-domain apply and stronger transaction semantics remain a later milestone.</p>
</section>

<style>
  .change-tray { position: sticky; bottom: .75rem; z-index: 20; display: grid; gap: .75rem; padding: .9rem 1rem; border: 1px solid #f79009; border-radius: 12px; background: #fffcf5; box-shadow: 0 12px 30px rgb(16 24 40 / .12); }
  .tray-heading,.apply-form { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .eyebrow { margin: 0 0 .2rem; color: #854a0e; font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  h2,h3,p { margin-top: 0; }
  h2 { margin-bottom: .2rem; font-size: 1.05rem; }
  h3 { margin-bottom: .45rem; font-size: .88rem; color: #854a0e; }
  p { margin-bottom: 0; color: #667085; }
  .change-section { display: grid; gap: .55rem; padding-top: .65rem; border-top: 1px solid #fedf89; }
  .change-list { display: grid; gap: .35rem; max-height: 13rem; margin: 0; padding: 0; list-style: none; overflow: auto; }
  .change-list li { display: flex; justify-content: space-between; align-items: center; gap: .8rem; padding: .55rem .65rem; border: 1px solid #fedf89; border-radius: 8px; background: #fff; }
  .change-copy { display: grid; gap: .12rem; min-width: 0; }
  .change-copy strong,.change-copy span { overflow-wrap: anywhere; }
  .change-copy span { color: #667085; font-size: .84rem; }
  .apply-form { padding-top: .55rem; }
  .apply-copy { display: grid; gap: .12rem; }
  .apply-copy span { color: #667085; font-size: .82rem; }
  .boundary-note { padding-top: .6rem; border-top: 1px dashed #fedf89; font-size: .78rem; line-height: 1.45; }
  .button { display: inline-block; width: max-content; max-width: 100%; box-sizing: border-box; padding: .62rem .82rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; cursor: pointer; font: inherit; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .text-action { padding: .28rem .38rem; border: 0; background: transparent; color: #475467; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 650; text-decoration: underline; text-underline-offset: 3px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (max-width: 720px) {
    .tray-heading,.apply-form { align-items: stretch; flex-direction: column; }
    .button { width: 100%; text-align: center; }
  }
</style>
