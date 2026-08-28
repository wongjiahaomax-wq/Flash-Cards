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
  /** @typedef {{ isActive?: boolean }} SupportingAsset */
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
      <p class="muted">Core study uses each family’s Original. Expanded study substitutes an eligible Alternative when one exists. Always-shown supporting images remain visible in both modes.</p>
    </div>
    <a class="button secondary" href="/admin/stimulus-cleanup">Stimulus cleanup</a>
  </div>

  {#if supportingAssets.length === 1 && activeGroups.length === 0}
    <div class="notice info">
      <strong>Original stimulus</strong>
      <span>This Case has one ordinary learner image. It is treated as the source-faithful Original representation in both study modes until you create an Alternative family.</span>
    </div>
  {:else if supportingAssets.length > 1 && activeGroups.length === 0}
    <div class="notice warning">
      <strong>Review suggested</strong>
      <span>This Case has {supportingAssets.length} ordinary learner images and no stimulus family. Decide whether one is the principal stimulus or whether they are all always-shown supporting images.</span>
    </div>
  {:else if supportingAssets.length > 0 && activeGroups.length > 0}
    <div class="notice info">
      <strong>Always shown / supporting</strong>
      <span>{supportingAssets.length} supporting {supportingAssets.length === 1 ? 'image is' : 'images are'} shown alongside whichever eligible family stimulus is selected.</span>
    </div>
  {/if}

  {#if activeGroups.length === 0}
    <p class="muted compact">No stimulus family exists yet. Use the image controls below to turn a principal learner image into an Alternative set when you need substitutions.</p>
  {:else}
    <div class="family-list">
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
  .heading-row, .family-heading, .option-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; }
  .heading-row { align-items: flex-start; }
  .heading-row > div { max-width: 780px; }
  .eyebrow { margin-bottom: 0.25rem; color: #667085; font-size: 0.72rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .compact { margin-bottom: 0; }
  .notice { display: grid; gap: 0.2rem; margin-top: 0.85rem; padding: 0.75rem; border-radius: 8px; }
  .notice.info { background: #f5f8ff; }
  .notice.warning { background: #fffaeb; }
  .family-list { display: grid; gap: 0.75rem; margin-top: 0.9rem; }
  .family-card { padding: 0.85rem; border: 1px solid #e4e7ec; border-radius: 8px; }
  .family-heading p { margin-bottom: 0; font-size: 0.86rem; }
  .option-list { display: grid; gap: 0.5rem; margin-top: 0.65rem; }
  .option-row { padding-top: 0.5rem; border-top: 1px solid #f0f2f5; }
  .option-label { display: grid; min-width: 0; flex: 1; }
  .option-label strong, .option-label span { overflow-wrap: anywhere; }
  .option-label span { font-size: 0.82rem; }
  .option-actions { display: flex; flex: 0 0 auto; gap: 0.45rem; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .badge { display: inline-flex; flex: 0 0 auto; padding: 0.22rem 0.48rem; border-radius: 999px; background: #f2f4f7; color: #344054; font-size: 0.72rem; font-weight: 700; }
  .badge.original { background: #ecfdf3; color: #027a48; }
  .badge.warning { background: #fef0c7; color: #93370d; }
  .warning-text { margin: 0.65rem 0 0; color: #93370d; font-size: 0.86rem; }
  .button { display: inline-block; padding: 0.58rem 0.8rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.small { padding: 0.42rem 0.62rem; font-size: 0.82rem; }
  .button.secondary { white-space: nowrap; }
  a:focus-visible, button:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 760px) {
    .heading-row, .family-heading, .option-row { align-items: stretch; flex-direction: column; }
    .button.secondary { width: fit-content; }
    .option-actions { align-items: stretch; flex-direction: column; }
    .option-actions form, .option-actions button { width: 100%; }
  }
</style>
