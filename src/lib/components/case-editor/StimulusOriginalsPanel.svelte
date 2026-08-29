<script>
  /**
   * @typedef {{
   *   id: string,
   *   assetId: string,
   *   imageUrl?: string | null,
   *   captionMd?: string | null,
   *   originalFilename?: string | null,
   *   altText?: string | null,
   *   isActive: boolean,
   *   removedFromCase: boolean,
   *   assetIsActive: boolean
   * }} StimulusOption
   */
  /**
   * @typedef {{
   *   id: string,
   *   isActive: boolean,
   *   originalOptionId?: string | null,
   *   options: StimulusOption[]
   * }} StimulusGroup
   */
  /**
   * @typedef {{
   *   assetId: string,
   *   imageUrl?: string | null,
   *   captionMd?: string | null,
   *   originalFilename?: string | null,
   *   altText?: string | null,
   *   isActive?: boolean
   * }} SupportingAsset
   */
  /** @typedef {{ case: { id: string }, stimulusGroups?: StimulusGroup[], attached?: SupportingAsset[] }} SelectedCase */

  /** @type {{ selectedCase: SelectedCase }} */
  let { selectedCase } = $props();

  let supportingAssets = $derived((selectedCase?.attached ?? []).filter((asset) => asset.isActive !== false));
  let activeGroups = $derived((selectedCase?.stimulusGroups ?? []).filter((group) => group.isActive));
  let selectedOriginalId = $state('');
  let selectedAlternativeId = $state('');
</script>

<section class="panel" id="stimulus-curation" aria-labelledby="stimulus-curation-heading">
  <div class="heading-row">
    <div>
      <p class="eyebrow">Image roles</p>
      <h2 id="stimulus-curation-heading">Original and Alternatives</h2>
      <p class="muted">Choose which image is the Original. Core study uses the Original; Expanded study can use an Alternative instead.</p>
    </div>
    <a class="button secondary" href="/admin/stimulus-cleanup">Back to cleanup list</a>
  </div>

  {#if activeGroups.length === 0 && supportingAssets.length > 1}
    <form method="POST" action="/admin/stimulus-roles" class="role-assignment">
      <input type="hidden" name="intent" value="assign-pair" />
      <input type="hidden" name="case_id" value={selectedCase.case.id} />

      <div class="assignment-heading">
        <h3>Choose the roles</h3>
        <p class="muted compact">Pick one Original and one Alternative, then save.</p>
      </div>

      <div class="role-table" role="group" aria-label="Choose Original and Alternative images">
        <div class="role-header" aria-hidden="true">
          <span>Image</span>
          <span>Original</span>
          <span>Alternative</span>
        </div>
        {#each supportingAssets as asset (asset.assetId)}
          <div class="role-row">
            <div class="image-identity">
              {#if asset.imageUrl}
                <img class="thumbnail" src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" />
              {:else}
                <div class="thumbnail placeholder" aria-hidden="true">No preview</div>
              {/if}
              <div class="image-label">
                <strong>{asset.originalFilename || asset.captionMd || asset.assetId}</strong>
                <span class="muted">{asset.captionMd || asset.altText || 'No caption'}</span>
              </div>
            </div>
            <label class="role-choice">
              <input type="radio" name="original_asset_id" value={asset.assetId} bind:group={selectedOriginalId} disabled={selectedAlternativeId === asset.assetId} required />
              <span>Original</span>
            </label>
            <label class="role-choice">
              <input type="radio" name="alternative_asset_id" value={asset.assetId} bind:group={selectedAlternativeId} disabled={selectedOriginalId === asset.assetId} required />
              <span>Alternative</span>
            </label>
          </div>
        {/each}
      </div>

      <div class="save-row">
        <p class="muted compact">Any other images remain always shown.</p>
        <button class="button primary" type="submit" disabled={!selectedOriginalId || !selectedAlternativeId}>Save roles</button>
      </div>
    </form>
  {:else if activeGroups.length === 0 && supportingAssets.length === 1}
    {@const onlyAsset = supportingAssets[0]}
    <div class="single-original">
      <div class="image-identity">
        {#if onlyAsset.imageUrl}
          <img class="thumbnail" src={onlyAsset.imageUrl} alt={onlyAsset.altText ?? ''} loading="lazy" />
        {:else}
          <div class="thumbnail placeholder" aria-hidden="true">No preview</div>
        {/if}
        <div class="image-label">
          <strong>{onlyAsset.originalFilename || onlyAsset.captionMd || onlyAsset.assetId}</strong>
          <span class="muted">{onlyAsset.captionMd || onlyAsset.altText || 'No caption'}</span>
        </div>
      </div>
      <span class="badge original">Original</span>
    </div>
    <p class="muted compact helper-text">There is only one learner image, so it is already the Original. Add another Case image if you want an Alternative.</p>
  {:else if activeGroups.length === 0}
    <p class="muted compact empty-state">No eligible Case images are available to assign.</p>
  {:else}
    <div class="assigned-section">
      <div class="assignment-heading">
        <h3>Assigned roles</h3>
        <p class="muted compact">Choose a different Original and save to change the principal image. Every other eligible image in that set is an Alternative. To move the current Original to Always shown, make another Alternative the Original first.</p>
      </div>

      {#each activeGroups as group, groupIndex (group.id)}
        {@const eligible = group.options.filter((option) => option.isActive && !option.removedFromCase && option.assetIsActive)}
        <form method="POST" action="/admin/stimulus-roles" class="existing-role-form">
          <input type="hidden" name="intent" value="set-original" />
          <input type="hidden" name="case_id" value={selectedCase.case.id} />
          <input type="hidden" name="group_id" value={group.id} />
          {#if activeGroups.length > 1}<p class="set-label">Image set {groupIndex + 1}</p>{/if}

          <div class="existing-options">
            {#each eligible as option (option.id)}
              <div class="existing-option">
                <div class="image-identity">
                  {#if option.imageUrl}
                    <img class="thumbnail" src={option.imageUrl} alt={option.altText ?? ''} loading="lazy" />
                  {:else}
                    <div class="thumbnail placeholder" aria-hidden="true">No preview</div>
                  {/if}
                  <div class="image-label">
                    <strong>{option.originalFilename || option.captionMd || option.assetId}</strong>
                    <span class="muted">{option.captionMd || option.altText || 'No caption'}</span>
                    <span class:original={option.id === group.originalOptionId} class="badge role-badge">
                      {option.id === group.originalOptionId ? 'Original' : 'Alternative'}
                    </span>
                  </div>
                </div>
                <div class="option-role-actions">
                  <label class="choose-original">
                    <input type="radio" name="option_id" value={option.id} checked={option.id === group.originalOptionId} required />
                    Use as Original
                  </label>
                  {#if option.id !== group.originalOptionId}
                    <button class="button small secondary" type="submit" form={`move-supporting-${option.id}`}>Move to Always shown</button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="save-row compact-save">
            <span></span>
            <button class="button primary" type="submit">Save roles</button>
          </div>
        </form>
        {#each eligible.filter((option) => option.id !== group.originalOptionId) as option (option.id)}
          <form id={`move-supporting-${option.id}`} method="POST" action="/admin/stimulus-supporting" class="hidden-role-form">
            <input type="hidden" name="case_id" value={selectedCase.case.id} />
            <input type="hidden" name="option_id" value={option.id} />
          </form>
        {/each}
      {/each}
    </div>

    {#if supportingAssets.length > 0}
      <div class="unassigned-section">
        <h3>Always-shown images <span class="optional-label">Optional</span></h3>
        <p class="muted compact">These optional supporting images appear consistently with the Case. They are independent of the Original/Alternative image set.</p>
        <div class="unassigned-list">
          {#each supportingAssets as asset (asset.assetId)}
            <div class="unassigned-row">
              <div class="image-identity">
                {#if asset.imageUrl}<img class="thumbnail small-thumb" src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" />{/if}
                <div class="image-label"><strong>{asset.originalFilename || asset.captionMd || asset.assetId}</strong><span class="badge always-shown">Always shown</span></div>
              </div>
              {#if activeGroups.length === 1}
                <form method="POST" action="/admin/stimulus-roles">
                  <input type="hidden" name="intent" value="add-alternative" />
                  <input type="hidden" name="case_id" value={selectedCase.case.id} />
                  <input type="hidden" name="group_id" value={activeGroups[0].id} />
                  <input type="hidden" name="asset_id" value={asset.assetId} />
                  <button class="button small secondary" type="submit">Make Alternative</button>
                </form>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  h2, h3, p { margin-top: 0; }
  h2 { margin-bottom: 0.35rem; font-size: 1.05rem; }
  h3 { margin-bottom: 0.25rem; font-size: 0.98rem; }
  .panel { margin-top: 1rem; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .heading-row, .save-row, .unassigned-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; }
  .heading-row { align-items: flex-start; }
  .heading-row > div { max-width: 780px; }
  .eyebrow { margin-bottom: 0.25rem; color: #667085; font-size: 0.72rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .compact { margin-bottom: 0; }
  .role-assignment, .assigned-section, .unassigned-section { margin-top: 1rem; }
  .assignment-heading { margin-bottom: 0.75rem; }
  .role-table { border: 1px solid #e4e7ec; border-radius: 9px; overflow: hidden; }
  .role-header, .role-row { display: grid; grid-template-columns: minmax(0, 1fr) 110px 120px; align-items: center; }
  .role-header { padding: 0.55rem 0.75rem; background: #f8fafc; color: #475467; font-size: 0.76rem; font-weight: 700; }
  .role-header span:not(:first-child) { text-align: center; }
  .role-row { padding: 0.7rem 0.75rem; border-top: 1px solid #e4e7ec; }
  .image-identity { display: flex; gap: 0.7rem; align-items: center; min-width: 0; }
  .image-label { display: grid; min-width: 0; gap: 0.12rem; }
  .image-label strong, .image-label span { overflow-wrap: anywhere; }
  .image-label span { font-size: 0.8rem; }
  .thumbnail { width: 82px; height: 68px; border: 1px solid #e4e7ec; border-radius: 7px; object-fit: contain; background: #f8fafc; flex: 0 0 auto; }
  .small-thumb { width: 58px; height: 48px; }
  .thumbnail.placeholder { display: grid; place-items: center; color: #667085; font-size: 0.68rem; }
  .role-choice { display: flex; justify-content: center; gap: 0.4rem; align-items: center; font-size: 0.84rem; cursor: pointer; }
  .role-choice input, .choose-original input { width: 18px; height: 18px; }
  .save-row { margin-top: 0.8rem; }
  .single-original { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin-top: 1rem; padding: 0.8rem; border: 1px solid #e4e7ec; border-radius: 9px; }
  .helper-text, .empty-state { margin-top: 0.75rem; }
  .existing-role-form { margin-top: 0.8rem; padding: 0.8rem; border: 1px solid #e4e7ec; border-radius: 9px; }
  .set-label { margin-bottom: 0.55rem; color: #475467; font-size: 0.76rem; font-weight: 750; }
  .existing-options { display: grid; gap: 0.55rem; }
  .existing-option { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.55rem; border-radius: 8px; }
  .existing-option:has(input:checked) { background: #f5f8ff; }
  .option-role-actions { display: flex; flex: 0 0 auto; gap: 0.5rem; align-items: center; }
  .choose-original { display: flex; gap: 0.45rem; align-items: center; flex: 0 0 auto; font-size: 0.84rem; font-weight: 650; cursor: pointer; }
  .badge { display: inline-flex; width: fit-content; padding: 0.22rem 0.48rem; border-radius: 999px; background: #f2f4f7; color: #344054; font-size: 0.72rem; font-weight: 700; }
  .badge.original { background: #ecfdf3; color: #027a48; }
  .badge.always-shown { margin-top: 0.2rem; background: #f2f4f7; color: #475467; }
  .role-badge { margin-top: 0.25rem; }
  .optional-label { margin-left: 0.25rem; color: #667085; font-size: 0.76rem; font-weight: 500; }
  .compact-save { margin-top: 0.65rem; }
  .hidden-role-form { display: none; }
  .unassigned-section { padding-top: 0.9rem; border-top: 1px solid #e4e7ec; }
  .unassigned-list { display: grid; gap: 0.5rem; margin-top: 0.7rem; }
  .unassigned-row { padding: 0.55rem 0; border-top: 1px solid #f0f2f5; }
  .button { display: inline-block; padding: 0.58rem 0.8rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .button.small { padding: 0.45rem 0.62rem; font-size: 0.82rem; }
  .button:disabled { opacity: 0.5; cursor: not-allowed; }
  a:focus-visible, button:focus-visible, input:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 700px) {
    .heading-row, .save-row, .unassigned-row, .existing-option { align-items: stretch; flex-direction: column; }
    .role-header { display: none; }
    .role-row { grid-template-columns: 1fr 1fr; gap: 0.65rem; }
    .role-row .image-identity { grid-column: 1 / -1; }
    .role-choice { justify-content: flex-start; min-height: 44px; padding: 0.35rem; border: 1px solid #e4e7ec; border-radius: 7px; }
    .save-row .button, .choose-original, .option-role-actions, .unassigned-row form, .unassigned-row .button { width: 100%; }
    .option-role-actions { align-items: stretch; flex-direction: column; }
    .choose-original { min-height: 44px; }
    .thumbnail { width: 70px; height: 60px; }
  }
</style>
