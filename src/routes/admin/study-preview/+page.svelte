<script>
  import SystemStudyChooser from '$lib/components/study/SystemStudyChooser.svelte';

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Preview learner study | Admin | Flash-Cards</title>
</svelte:head>

<section class="preview-shell">
  <header class="preview-heading">
    <div>
      <p class="eyebrow">Admin learner preview</p>
      <h1>Preview learner study</h1>
      <p class="muted intro">Exercise the prospective systems-first learner Study flow with production content before learner rollout. Reviews created here belong to your Admin account.</p>
    </div>
    <a class="button" href="/admin">← Dashboard</a>
  </header>

  <div class="preview-note" role="note">
    <strong>Production Admin preview</strong>
    <span>This page intentionally ignores the learner System-navigation rollout flag. It is not the Preview Worker workspace.</span>
  </div>

  {#if !data.databaseConfigured}
    <div class="database-note" role="status">
      <strong>Study content is not connected</strong>
      <span>Connect the production D1 binding to load learner study content.</span>
    </div>
  {:else}
    <SystemStudyChooser systems={data.systems} {form} action="?/startSystemSelection" />
  {/if}
</section>

<style>
  .preview-shell { display:grid; gap:1.25rem; min-width:0; }
  .preview-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; }
  .preview-heading h1 { margin:.2rem 0 0; font-size:clamp(1.8rem,4vw,2.5rem); }
  .eyebrow { margin:0; color:#667085; font-size:.78rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .intro { max-width:760px; margin:.55rem 0 0; line-height:1.6; }
  .muted { color:#667085; }
  .button { flex:0 0 auto; display:inline-block; padding:.65rem .9rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; color:#172033; text-decoration:none; }
  .preview-note,.database-note { display:grid; gap:.3rem; padding:.9rem 1rem; border:1px solid #cdd6e3; border-radius:12px; background:#eef3f8; line-height:1.5; }
  .database-note { background:#fff; }
  @media (max-width:700px) { .preview-heading { display:grid; } .button { justify-self:start; } }
</style>
