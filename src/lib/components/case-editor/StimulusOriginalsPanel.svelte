<script>
  /**
   * @typedef {{
   *   id: string,
   *   assetId: string,
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
   *   name: string,
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
  /**
   * @typedef {{
   *   case: { id: string },
   *   stimulusGroups?: StimulusGroup[],
   *   attached?: SupportingAsset[]
   * }} SelectedCase
   */

  /** @type {{ selectedCase: SelectedCase }} */
  let { selectedCase } = $props();

  let groups = $derived(selectedCase?.stimulusGroups ?? []);
  let supportingAssets = $derived((selectedCase?.attached ?? []).filter((asset) => asset.isActive !== false));
  let activeGroups = $derived(groups.filter((group) => group.isActive));
</script>

<section class="panel" id="stimulus-curation" aria-labelledby="stimulus-curation-heading">
  <div class="heading-row">
    <div>
      <p class="eyebrow">Study stimulus semantics</p>
      <h2 id="stimulus-curation-heading">Original and Alternatives</h2>
      <p class="muted">Manage the learner-facing role of this Case's images here. Core study uses each family's Original. Expanded study substitutes an eligible Alternative when one exists. Always-shown supporting images remain visible in both modes.</p>
    </div>
    <a class="button secondary" href="/admin/stimulus-cleanup">Stimulus cleanup</a>
  </div>

  {#if supportingAssets.length === 1 && activeGroups.length === 0}
    <div class="notice info">
      <strong>Current Original</strong>
      <span>This Case has one ordinary learner image. It is already treated as the source-faithful Original in both study modes. Start a family from it only when you want to add Alternatives.</span>
    </div>
  {:else if supportingAssets.length > 1 && activeGroups.length === 0}
    <div class="notice warning">
      <strong>Choose the principal image</strong>
      <span>This Case has {supportingAssets.length} ordinary learner images and no stimulus family. Choose one below to start a family as the Original, then move the other interchangeable images into that family as Alternatives.</span>
    </div>
  {:else if supportingAssets.length > 0 && activeGroups.length > 0}
    <div class="notice info">
      <strong>Always shown / unassigned images</strong>
      <span>{supportingAssets.length} ordinary {supportingAssets.length === 1 ? 'image is' : 'images are'} still shown alongside the selected family stimulus. You can move interchangeable images into an existing family below.</span>
    </div>
  {/if}

  {#if supportingAssets.length > 0}
    <div class="supporting-section">
      <div class="section-heading">
        <div>
          <h3>Ordinary / always-shown images</h3>
          <p class="muted compact">Use these controls to curate existing Case images without opening the advanced image controls.</p>
        </div>
        <span class="count-badge">{supportingAssets.length}</span>
      </div>

      <div class="supporting-list">
        {#each supportingAssets as asset (asset.assetId)}
          <article class="supporting-card">
            <div class="supporting-identity">
              {#if asset.imageUrl}
                <img class="thumbnail" src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" />
              {:else}
                <div class="thumbnail placeholder" aria-hidden="true">No preview</div>
              {/if}
              <div class="option-label">
                <strong>{asset.originalFilename || asset.captionMd || asset.assetId}</strong>
                <span class="muted">{asset.captionMd || asset.altText || 'No caption'}</span>
                {#if supportingAssets.length === 1 && activeGroups.length === 0}
                  <span class="badge original role-badge">Current Original</span>
                {:else}
                  <span class="badge role-badge">Always shown</span>
                {/if}
              </div>
            </div>

            <div class="supporting-actions">
              <form method="POST" action="?/startAlternativeSet" class="curation-form">
                <input type="hidden" name="case_id" value={selectedCase.case.id} />
                <input type="hidden" name="asset_id" value={asset.assetId} />
                <label>
                  New family name
                  <input name="set_name" required placeholder="e.g. Fundus appearance" />
                </label>
                <button class="button small" type="submit">Start family with this Original</button>
              </form>

              {#if activeGroups.length > 0}
                <form method="POST" action="?/addStimulusOption" class="curation-form">
                  <input type="hidden" name="case_id" value={selectedCase.case.id} />
                  <input type="hidden" name="asset_id" value={asset.assetId} />
                  <input type="hidden" name="convert_fixed" value="on" />
                  <label>
                    Existing family
                    <select name="group_id" required>
                      <option value="">Choose family</option>
                      {#each activeGroups as group (group.id)}
                        <option value={group.id}>{group.name}</option>
                      {/each}
                    </select>
                  </label>
                  <button class="button small secondary" type="submit">Add as Alternative</button>
                </form>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </div>
  {/if}

  {#if activeGroups.length === 0}
    {#if supportingAssets.length === 0}
      <p class="muted compact empty-state">No eligible Case images or stimulus families are available to curate yet.</p>
    {:else}
      <p class="muted compact next-step">After you start a family, this section will show its Original and Alternatives and the remaining ordinary images can be moved into it directly.</p>
    {/if}
  {:else}
    <div class="family-list">
      <div class="section-heading family-section-heading">
        <div>
          <h3>Stimulus families</h3>
          <p class="muted compact">Make any eligible family image the Original, or move a non-Original image back to Always shown.</p>
        </div>
        <span class="count-badge">{activeGroups.length}</span>
      </div>

      {#each activeGroups as group (group.id)}
        {@const eligible = group.options.filter((option) => option.isActive && !option.removedFromCase && option.assetIsActive)}
        {@const currentOriginal = group.originalOptionId ? eligible.find((option) => option.id === group.originalOptionId) : null}
        <article class="family-card">
          <div class="family-heading">
            <div>
              <h3>{group.name}</h3>
              <p class="muted">{eligible.length} eligible {eligible.length === 1 ? 'image' : 'images'}</p>
            </div>
            {#if currentOriginal}
              <span class="badge original">Original assigned</span>
            {:else if eligible.length > 1}
              <span class="badge warning">Cleanup required</span>
            {:else if eligible.length === 1}
              <span class="badge warning">Original not assigned</span>
            {/if}
          </div>

          {#if eligible.length === 0}
            <p class="muted compact">This family has no eligible images.</p>
          {:else}
            {#if !currentOriginal && eligible.length > 1}
              <p class="warning-text">Legacy multi-option family: learner selection keeps the previous random behavior until an Original is explicitly chosen.</p>
            {/if}
            <div class="option-list">
              {#each eligible as option (option.id)}
                <div class="option-row">
                  <div class="option-label">
                    <strong>{option.originalFilename || option.captionMd || option.assetId}</strong>
                    <span class="muted">{option.captionMd || option.altText || 'No caption'}</span>
                  </div>
                  {#if option.id === group.originalOptionId}
                    <span class="badge original">Original</span>
                  {:else}
                    <div class="option-actions">
                      <span class="badge">Alternative</span>
                      <form method="POST" action="/admin/stimulus-original">
                        <input type="hidden" name="case_id" value={selectedCase.case.id} />
                        <input type="hidden" name="group_id" value={group.id} />
                        <input type="hidden" name="option_id" value={option.id} />
                        <button class="button small" type="submit">Make Original</button>
                      </form>
                      <form method="POST" action="/admin/stimulus-supporting">
                        <input type="hidden" name="case_id" value={selectedCase.case.id} />
                        <input type="hidden" name="option_id" value={option.id} />
                        <button class="button small secondary" type="submit">Move to Always shown</button>
                      </form>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  h2, h3, p { margin-top: 0; }
  h2 { margin-bottom: 0.35rem; font-size: 1.05rem; }
  h3 { margin-bottom: 0.2rem; font-size: 0.98rem; }
  .panel { margin-top: 1rem; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .heading-row, .section-heading, .family-heading, .option-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; }
  .heading-row { align-items: flex-start; }
  .heading-row > div { max-width: 780px; }
  .eyebrow { margin-bottom: 0.25rem; color: #667085; font-size: 0.72rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .compact { margin-bottom: 0; }
  .notice { display: grid; gap: 0.2rem; margin-top: 0.85rem; padding: 0.75rem; border-radius: 8px; }
  .notice.info { background: #f5f8ff; }
  .notice.warning { background: #fffaeb; }
  .supporting-section, .family-list { margin-top: 1rem; }
  .supporting-list, .family-list { display: grid; gap: 0.75rem; }
  .family-section-heading { margin-bottom: 0.1rem; }
  .supporting-card, .family-card { padding: 0.85rem; border: 1px solid #e4e7ec; border-radius: 8px; }
  .supporting-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 1.2fr); gap: 1rem; align-items: start; }
  .supporting-identity { display: flex; gap: 0.75rem; min-width: 0; align-items: center; }
  .thumbnail { width: 88px; height: 72px; border: 1px solid #e4e7ec; border-radius: 7px; object-fit: contain; background: #f8fafc; flex: 0 0 auto; }
  .thumbnail.placeholder { display: grid; place-items: center; color: #667085; font-size: 0.72rem; }
  .supporting-actions { display: grid; gap: 0.65rem; }
  .curation-form { display: grid; grid-template-columns: minmax(150px, 1fr) auto; gap: 0.55rem; align-items: end; }
  .curation-form label { display: grid; gap: 0.3rem; color: #475467; font-size: 0.78rem; font-weight: 650; }
  .curation-form input, .curation-form select { width: 100%; min-width: 0; padding: 0.5rem 0.6rem; border: 1px solid #cdd6e3; border-radius: 7px; background: #fff; color: #172033; font: inherit; font-size: 0.86rem; }
  .family-heading p { margin-bottom: 0; font-size: 0.86rem; }
  .option-list { display: grid; gap: 0.5rem; margin-top: 0.65rem; }
  .option-row { padding-top: 0.5rem; border-top: 1px solid #f0f2f5; }
  .option-label { display: grid; min-width: 0; flex: 1; }
  .option-label strong, .option-label span { overflow-wrap: anywhere; }
  .option-label span { font-size: 0.82rem; }
  .role-badge { width: fit-content; margin-top: 0.35rem; }
  .option-actions { display: flex; flex: 0 0 auto; gap: 0.45rem; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .badge, .count-badge { display: inline-flex; flex: 0 0 auto; padding: 0.22rem 0.48rem; border-radius: 999px; background: #f2f4f7; color: #344054; font-size: 0.72rem; font-weight: 700; }
  .badge.original { background: #ecfdf3; color: #027a48; }
  .badge.warning { background: #fef0c7; color: #93370d; }
  .warning-text { margin: 0.65rem 0 0; color: #93370d; font-size: 0.86rem; }
  .next-step, .empty-state { margin-top: 0.9rem; }
  .button { display: inline-block; padding: 0.58rem 0.8rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.small { padding: 0.5rem 0.68rem; font-size: 0.82rem; }
  .button.secondary { white-space: nowrap; }
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 900px) {
    .supporting-card { grid-template-columns: 1fr; }
  }
  @media (max-width: 760px) {
    .heading-row, .section-heading, .family-heading, .option-row { align-items: stretch; flex-direction: column; }
    .button.secondary { width: fit-content; }
    .option-actions { align-items: stretch; flex-direction: column; }
    .option-actions form, .option-actions button { width: 100%; }
    .curation-form { grid-template-columns: 1fr; }
    .curation-form .button { width: 100%; }
    .supporting-identity { align-items: flex-start; }
    .thumbnail { width: 72px; height: 64px; }
  }
</style>
