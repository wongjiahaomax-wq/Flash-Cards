<script>
  import { reconcileCasePickerSelection } from '$lib/admin-image-selection.js';

  let { selectedCase, imagePicker, editorBase } = $props();
  let pickerDialog = $state();
  let pickerCloseButton = $state();
  let pickerSelected = $state(new Set());
  let pickerContextKey = $state(null);

  $effect(() => {
    const nextContextKey = `${selectedCase?.case.id ?? ''}:${imagePicker?.targetGroupId ?? 'fixed'}`;
    const orderedIds = imagePicker?.assets?.map((asset) => asset.id) ?? [];
    const visibleIds = new Set(orderedIds);
    const contextChanged = Boolean(pickerContextKey && pickerContextKey !== nextContextKey);
    const hasHiddenSelection = [...pickerSelected].some((assetId) => !visibleIds.has(assetId));
    if (contextChanged || hasHiddenSelection) {
      const reconciled = reconcileCasePickerSelection({ selectedIds: pickerSelected, previousContextKey: pickerContextKey, nextContextKey, orderedIds });
      pickerSelected = reconciled.selectedIds;
    }
    pickerContextKey = nextContextKey;
    if (imagePicker?.open && pickerDialog && !pickerDialog.open) {
      pickerDialog.showModal();
      requestAnimationFrame(() => pickerCloseButton?.focus());
    }
  });

  function togglePickerAsset(assetId) {
    const next = new Set(pickerSelected);
    if (next.has(assetId)) next.delete(assetId);
    else next.add(assetId);
    pickerSelected = next;
  }
</script>

{#if imagePicker?.open}
  <dialog bind:this={pickerDialog} class="image-picker" aria-labelledby="image-picker-heading"><div class="picker-shell"><div class="picker-heading"><div><p class="eyebrow">Asset Library</p><h2 id="image-picker-heading">{imagePicker.targetGroupName ? `Add images to ${imagePicker.targetGroupName}` : 'Add images from library'}</h2><p class="muted">Search is server-backed and limited to Assets not already used by this Case.</p></div><button bind:this={pickerCloseButton} class="button" type="button" onclick={() => pickerDialog?.close()}>Close</button></div><form method="GET" action={`${editorBase}/cases/${selectedCase.case.id}`} class="picker-search"><input type="hidden" name="picker" value="1" />{#if imagePicker.targetGroupId}<input type="hidden" name="target_group" value={imagePicker.targetGroupId} />{/if}<label>Search filename, alt text, or source<input name="image_q" value={imagePicker.search} placeholder="e.g. prolonged QTc" /></label><button class="button" type="submit">Search</button></form>{#if imagePicker.assets.length === 0}<p class="empty-state">No unused active images match this search.</p>{:else}<div class="picker-grid">{#each imagePicker.assets as asset}<label class:selected={pickerSelected.has(asset.id)} class="picker-card"><input type="checkbox" checked={pickerSelected.has(asset.id)} onchange={() => togglePickerAsset(asset.id)} /><img src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" /><span><strong>{asset.originalFilename ?? asset.id}</strong><small>{asset.altText || 'No alt text'}</small>{#if asset.sourceLabel}<small>Source: {asset.sourceLabel}</small>{/if}</span></label>{/each}</div>{#if imagePicker.hasMore}<p class="picker-note">Showing the first {imagePicker.limit} matches. Refine the search to narrow the result set.</p>{/if}{/if}<form method="POST" action="?/attachMany" class="picker-actions">{#each [...pickerSelected] as assetId}<input type="hidden" name="asset_id" value={assetId} />{/each}<input type="hidden" name="case_id" value={selectedCase.case.id} />{#if imagePicker.targetGroupId}<input type="hidden" name="target_group_id" value={imagePicker.targetGroupId} />{/if}<strong>{pickerSelected.size} selected</strong><button class="button primary" type="submit" disabled={pickerSelected.size === 0 || pickerSelected.size > 30}>{imagePicker.targetGroupName ? `Add ${pickerSelected.size} to set` : `Attach ${pickerSelected.size} images`}</button></form><details class="upload-disclosure"><summary>Upload new image</summary><div class="advanced-body"><p class="muted">JPEG or PNG, up to the existing storage limit. The new Asset remains reusable elsewhere.</p><form method="POST" action="?/uploadAndAttach" enctype="multipart/form-data" class="form-grid"><input type="hidden" name="case_id" value={selectedCase.case.id} />{#if imagePicker.targetGroupId}<input type="hidden" name="target_group_id" value={imagePicker.targetGroupId} />{/if}<label class="wide">Image file<input name="image" type="file" accept="image/jpeg,image/png" required /></label><label>Admin image name <span class="muted">(optional)</span><input name="image_name" maxlength="500" /></label><label>Alt text<input name="alt_text" maxlength="500" required /></label><label>Source label <span class="muted">(optional)</span><input name="source_label" maxlength="300" /></label><label>Source URL <span class="muted">(optional)</span><input name="source_url" type="url" maxlength="2000" /></label><label>Licence / permission <span class="muted">(optional)</span><input name="licence" maxlength="500" /></label><div class="wide"><button class="button primary" type="submit">Upload and {imagePicker.targetGroupName ? 'add to set' : 'attach'}</button></div></form></div></details></div></dialog>
{/if}

<style>
  h2, p { margin-top: 0; } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; } .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .image-picker { width: min(94vw, 1120px); max-width: none; max-height: 92vh; padding: 0; border: 0; border-radius: 12px; box-shadow: 0 24px 80px rgb(16 24 40 / 28%); } .image-picker::backdrop { background: rgb(16 24 40 / 64%); }
  .picker-shell { display: grid; gap: 1rem; max-height: 92vh; overflow: auto; padding: 1rem; } .picker-heading { display: flex; justify-content: space-between; align-items: start; gap: 1rem; position: sticky; top: -1rem; z-index: 2; padding: 1rem 0 0.4rem; background: #fff; border-bottom: 1px solid #eaecf0; }
  .picker-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 0.65rem; } .picker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.7rem; }
  .picker-card { position: relative; display: grid; grid-template-rows: 130px auto; gap: 0; overflow: hidden; border: 2px solid #e4e7ec; border-radius: 9px; background: #fff; cursor: pointer; } .picker-card.selected { border-style: solid; border-width: 3px; } .picker-card > input { position: absolute; z-index: 1; top: 0.5rem; left: 0.5rem; width: 1.15rem; height: 1.15rem; accent-color: #172033; } .picker-card img { width: 100%; height: 130px; object-fit: contain; background: #eef2f6; } .picker-card > span { display: grid; gap: 0.2rem; padding: 0.6rem; overflow-wrap: anywhere; } .picker-card small { color: #667085; font-weight: 400; }
  .picker-actions { position: sticky; bottom: -1rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.8rem; border: 1px solid #d0d5dd; border-radius: 9px; background: #fff; box-shadow: 0 -6px 20px rgb(16 24 40 / 8%); } .picker-note { margin-bottom: 0; color: #667085; font-size: 0.85rem; }
  .empty-state { padding: 0.85rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; } .upload-disclosure { border: 1px solid #e4e7ec; border-radius: 8px; background: #f8fafc; } summary { padding: 0.72rem 0.85rem; cursor: pointer; color: #344054; font-weight: 650; } .advanced-body { padding: 0.75rem 0.85rem; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; } label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .wide { grid-column: 1 / -1; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; } .button.primary { border-color: #172033; background: #172033; color: #fff; } button:disabled { cursor: not-allowed; opacity: 0.45; }
  button:focus-visible, summary:focus-visible, input:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 760px) { .picker-heading { align-items: start; flex-direction: column; } .form-grid, .picker-search { grid-template-columns: minmax(0, 1fr); } .wide { grid-column: auto; } .picker-actions { align-items: stretch; flex-direction: column; } }
</style>
