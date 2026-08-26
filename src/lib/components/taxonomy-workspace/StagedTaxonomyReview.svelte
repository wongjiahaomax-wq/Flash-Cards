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

<section class="tray" aria-label="Staged taxonomy and Case changes">
  <div class="heading">
    <div>
      <p class="eyebrow">Review staged changes</p>
      <h2>{totalChanges} pending {totalChanges === 1 ? 'change' : 'changes'}</h2>
      <p>Nothing has been saved. All current-state checks run before the first canonical write.</p>
    </div>
    <button class="button" type="button" onclick={onDiscardAll}>Discard all</button>
  </div>

  {#if moves.length}
    <section class="section">
      <h3>Topic hierarchy · {moves.length}</h3>
      <ol>
        {#each moves as move (move.id)}
          <li><div><strong>{byId.get(move.id)?.name ?? move.id}</strong><span>{parentLabel(move.originalParentId)} → {parentLabel(move.parentId)}</span></div><button class="text" type="button" onclick={() => onUndoMove(move.id)}>Undo</button></li>
        {/each}
      </ol>
    </section>
  {/if}

  {#if caseChanges.length}
    <section class="section">
      <h3>Case Primary Topic · {caseChanges.length}</h3>
      <ol>
        {#each caseChanges as change (change.caseId)}
          <li><div><strong>{change.title}</strong><span>{topicLabel(change.originalTopicId)} → {topicLabel(change.topicId)}</span></div><button class="text" type="button" onclick={() => onUndoCaseChange(change.caseId)}>Undo</button></li>
        {/each}
      </ol>
    </section>
  {/if}

  {#if tagChanges.length}
    <section class="section">
      <h3>Case Tags · {tagChanges.length}</h3>
      <ol>
        {#each tagChanges as change (`${change.caseId}:${change.tagId}`)}
          <li><div><strong>{change.title}</strong><span>{change.operation === 'add' ? '+' : '−'} {change.tagName}</span></div><button class="text" type="button" onclick={() => onUndoTagChange(change.caseId, change.tagId)}>Undo</button></li>
        {/each}
      </ol>
    </section>
  {/if}

  <form method="POST" action="?/applyWorkspace" use:enhance class="apply">
    <input type="hidden" name="hierarchy_changes_json" value={hierarchyChangesJson} />
    <input type="hidden" name="case_changes_json" value={caseChangesJson} />
    <input type="hidden" name="tag_changes_json" value={tagChangesJson} />
    <div>
      <strong>Validate all staged domains, then apply</strong>
      <span>Stale Topic parents, Primary Topics, Case/Tag memberships, and inactive add targets fail before writes begin.</span>
    </div>
    <button class="button primary" type="submit">Validate &amp; apply all changes</button>
  </form>

  <p class="boundary">This is one review/apply workflow, but not a claimed serializable cross-domain transaction. After unified preflight succeeds, established hierarchy, Primary Topic, and Case Tag writers run in sequence. A narrow concurrent-change or later operational-failure window therefore remains.</p>
</section>

<style>
  .tray { position: sticky; bottom: .75rem; z-index: 20; display: grid; gap: .75rem; padding: .9rem 1rem; border: 1px solid #f79009; border-radius: 12px; background: #fffcf5; box-shadow: 0 12px 30px rgb(16 24 40 / .12); }
  .heading,.apply { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .eyebrow { margin: 0 0 .2rem; color: #854a0e; font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  h2,h3,p { margin-top: 0; }
  h2 { margin-bottom: .2rem; font-size: 1.05rem; }
  h3 { margin-bottom: .45rem; font-size: .88rem; color: #854a0e; }
  p { margin-bottom: 0; color: #667085; }
  .section { display: grid; gap: .45rem; padding-top: .65rem; border-top: 1px solid #fedf89; }
  ol { display: grid; gap: .35rem; max-height: 12rem; margin: 0; padding: 0; list-style: none; overflow: auto; }
  li { display: flex; justify-content: space-between; align-items: center; gap: .8rem; padding: .55rem .65rem; border: 1px solid #fedf89; border-radius: 8px; background: #fff; }
  li > div,.apply > div { display: grid; gap: .12rem; min-width: 0; }
  li span,.apply span { color: #667085; font-size: .82rem; overflow-wrap: anywhere; }
  .apply { padding-top: .7rem; border-top: 1px solid #fedf89; }
  .boundary { padding-top: .55rem; border-top: 1px dashed #fedf89; font-size: .78rem; line-height: 1.45; }
  .button { display: inline-block; width: max-content; max-width: 100%; box-sizing: border-box; padding: .62rem .82rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; cursor: pointer; font: inherit; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .text { padding: .25rem; border: 0; background: transparent; color: #475467; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 650; text-decoration: underline; text-underline-offset: 3px; }
  @media (max-width: 720px) { .heading,.apply { align-items: stretch; flex-direction: column; } .button { width: 100%; text-align: center; } }
</style>
