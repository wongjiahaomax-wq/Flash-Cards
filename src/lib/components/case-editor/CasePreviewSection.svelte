<script>
  let { previewMode, studyPreviewHref = null } = $props();
</script>

<section id="preview" class="panel preview-panel"><p class="eyebrow">Learner view</p><h2>Preview</h2>{#if previewMode}<p class="muted">Learner Study is available on the production Worker only. Preview Mode is limited to inspecting and editing the disposable Preview Case workspace.</p>{:else}<p class="muted">Open the Study flow to verify the Case stem, selected images, question composition, and answer reveal behaviour.</p><a class="button primary" href={studyPreviewHref ?? '/study'}>Open Study preview</a>{/if}</section>

<style>
  h2, p { margin-top: 0; } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .preview-panel { padding-bottom: 1.4rem; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; } .button.primary { border-color: #172033; background: #172033; color: #fff; }
  a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (min-width: 1024px) { :global(.case-editor[data-editor-layout="compact"]) #preview { scroll-margin-top: 4.75rem; } }
</style>
