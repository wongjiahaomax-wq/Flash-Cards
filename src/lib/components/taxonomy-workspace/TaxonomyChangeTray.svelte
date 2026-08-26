<script lang="ts">
  import { enhance } from '$app/forms';
  import type { StagedTopicMove, TaxonomyWorkspaceItem } from './taxonomy-workspace-model.ts';

  let {
    moves,
    items,
    onDiscardAll,
    onUndoMove
  }: {
    moves: StagedTopicMove[];
    items: TaxonomyWorkspaceItem[];
    onDiscardAll: () => void;
    onUndoMove: (topicId: string) => void;
  } = $props();

  const byId = $derived(new Map(items.map((item) => [item.id, item])));

  function parentLabel(parentId: string | null) {
    if (!parentId) return 'Unassigned';
    return byId.get(parentId)?.breadcrumbLabel ?? 'Unknown / changed parent';
  }

  function topicLabel(topicId: string) {
    return byId.get(topicId)?.name ?? topicId;
  }

  const changesJson = $derived(JSON.stringify(moves.map((move) => ({
    id: move.id,
    parentId: move.parentId,
    expectedParentId: move.originalParentId
  }))));
</script>

<section class="change-tray" aria-label="Staged taxonomy changes">
  <div class="tray-heading">
    <div>
      <p class="eyebrow">Staged changes</p>
      <h2>{moves.length} hierarchy {moves.length === 1 ? 'change' : 'changes'}</h2>
      <p>Nothing has been saved yet. Review these proposed Topic moves; the server will validate the current hierarchy again before applying them.</p>
    </div>
    <button class="button" type="button" onclick={onDiscardAll}>Discard all</button>
  </div>

  <ol class="change-list">
    {#each moves as move (move.id)}
      <li>
        <div class="change-copy">
          <strong>{topicLabel(move.id)}</strong>
          <span>{parentLabel(move.originalParentId)} <span aria-hidden="true">→</span><span class="sr-only">to</span> {parentLabel(move.parentId)}</span>
        </div>
        <button class="text-action" type="button" onclick={() => onUndoMove(move.id)}>Undo</button>
      </li>
    {/each}
  </ol>

  <form method="POST" action="?/applyHierarchy" use:enhance class="apply-form">
    <input type="hidden" name="changes_json" value={changesJson} />
    <div class="apply-copy">
      <strong>Validate before writing</strong>
      <span>If a Topic parent changed since this workspace loaded, apply will fail and require review.</span>
    </div>
    <button class="button primary" type="submit">Validate &amp; apply</button>
  </form>
</section>

<style>
  .change-tray { position: sticky; bottom: .75rem; z-index: 20; display: grid; gap: .75rem; padding: .9rem 1rem; border: 1px solid #f79009; border-radius: 12px; background: #fffcf5; box-shadow: 0 12px 30px rgb(16 24 40 / .12); }
  .tray-heading,.apply-form { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .eyebrow { margin: 0 0 .2rem; color: #854a0e; font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  h2,p { margin-top: 0; }
  h2 { margin-bottom: .2rem; font-size: 1.05rem; }
  p { margin-bottom: 0; color: #667085; }
  .change-list { display: grid; gap: .35rem; max-height: 13rem; margin: 0; padding: 0; list-style: none; overflow: auto; }
  .change-list li { display: flex; justify-content: space-between; align-items: center; gap: .8rem; padding: .55rem .65rem; border: 1px solid #fedf89; border-radius: 8px; background: #fff; }
  .change-copy { display: grid; gap: .12rem; min-width: 0; }
  .change-copy strong,.change-copy span { overflow-wrap: anywhere; }
  .change-copy span { color: #667085; font-size: .84rem; }
  .apply-form { padding-top: .7rem; border-top: 1px solid #fedf89; }
  .apply-copy { display: grid; gap: .12rem; }
  .apply-copy span { color: #667085; font-size: .82rem; }
  .button { display: inline-block; width: max-content; max-width: 100%; box-sizing: border-box; padding: .62rem .82rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; cursor: pointer; font: inherit; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .text-action { padding: .28rem .38rem; border: 0; background: transparent; color: #475467; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 650; text-decoration: underline; text-underline-offset: 3px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (max-width: 720px) {
    .tray-heading,.apply-form { align-items: stretch; flex-direction: column; }
    .button { width: 100%; text-align: center; }
  }
</style>
