<script>
  let { selectedCase, previewMode } = $props();
</script>

<section class="page-heading">
  <div><p class="eyebrow">Case editor</p><h1>{selectedCase.case.title}</h1><p class="muted">Topic: {#if selectedCase.case.conceptId}<a class="topic-link" href={'/admin/topics/' + selectedCase.case.conceptId}>{selectedCase.case.conceptName}</a>{:else}No primary Topic assigned{/if}</p></div>
  <div class="actions"><a class="button" href="/admin/cases">All Cases</a>{#if previewMode}<span class="muted">Learner Study is unavailable in Preview Mode.</span>{:else}<a class="button primary" href="/study">Preview in Study</a>{/if}</div>
</section>

<style>
  .page-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; } .topic-link { color: inherit; font-weight: 650; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 760px) { .page-heading { align-items: start; flex-direction: column; } }
</style>
