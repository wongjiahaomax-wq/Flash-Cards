<script>
  // @ts-nocheck
  import { deserialize } from '$app/forms';

  let { data, form } = /** @type {any} */ ($props());
  let confirmImport = $state(false);
  let jobs = $state([...(data?.jobs ?? [])]);
  let runningJobId = $state(null);
  let requestInFlight = $state(false);
  let localError = $state('');
  let autoStarted = $state(false);

  const phaseLabels = {
    validate_topics: 'Validating Topics',
    validate_question_prompts: 'Validating Question Prompts',
    validate_cases: 'Validating Cases',
    validate_assets: 'Validating Assets',
    validate_case_topics: 'Validating Case ↔ Topic relationships',
    validate_case_assets: 'Validating Case ↔ Asset relationships',
    validate_case_questions: 'Validating Case Questions',
    validate_topic_questions: 'Validating Topic Questions',
    import_topics: 'Importing Topics',
    import_question_prompts: 'Importing Question Prompts',
    import_cases: 'Importing Cases',
    import_assets: 'Importing Assets',
    import_case_topics: 'Importing Case ↔ Topic relationships',
    import_case_assets: 'Importing Case ↔ Asset relationships',
    import_case_questions: 'Importing Case Questions',
    import_topic_questions: 'Importing Topic Questions',
    finalize: 'Finalizing'
  };

  function fileChanged() {
    confirmImport = false;
  }

  function upsertJob(job) {
    if (!job) return;
    const index = jobs.findIndex((item) => item.id === job.id);
    if (index >= 0) jobs[index] = job;
    else jobs = [job, ...jobs].slice(0, 10);
  }

  function percent(job) {
    if (!job?.totalCount) return job?.status === 'complete' ? 100 : 0;
    return Math.min(100, Math.round((job.processedCount / job.totalCount) * 100));
  }

  function canResume(job) {
    return ['validating', 'ready', 'importing', 'failed'].includes(job.status);
  }

  function hasDomainWrites(job) {
    return job.status === 'importing' || job.phase?.startsWith('import_') || job.phase === 'finalize' || job.status === 'complete';
  }

  async function postJobAction(action, id) {
    const body = new FormData();
    body.set('jobId', id);
    const response = await fetch(`?/${action}`, {
      method: 'POST',
      headers: { 'x-sveltekit-action': 'true' },
      body
    });
    const result = deserialize(await response.text());
    if (result.type === 'failure') {
      throw new Error(result.data?.issues?.join(' ') || result.data?.error || `Import ${action} failed.`);
    }
    if (result.type !== 'success') throw new Error(`Import ${action} did not complete normally.`);
    return result.data;
  }

  async function runImport(id) {
    if (requestInFlight || runningJobId) return;
    runningJobId = id;
    localError = '';
    try {
      while (runningJobId === id) {
        requestInFlight = true;
        let result;
        try {
          result = await postJobAction('process', id);
        } finally {
          requestInFlight = false;
        }
        if (result?.job) upsertJob(result.job);
        if (result?.busy) {
          localError = 'This import is currently being processed by another browser tab. Processing here has paused safely.';
          break;
        }
        const job = result?.job;
        if (!job || ['complete', 'cancelled', 'failed'].includes(job.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    } catch (error) {
      localError = error instanceof Error ? error.message : 'Import processing stopped unexpectedly.';
    } finally {
      requestInFlight = false;
      if (runningJobId === id) runningJobId = null;
    }
  }

  function pauseImport(id) {
    if (runningJobId === id) runningJobId = null;
  }

  async function cancelJob(id) {
    pauseImport(id);
    localError = '';
    try {
      const result = await postJobAction('cancel', id);
      upsertJob(result?.job);
    } catch (error) {
      localError = error instanceof Error ? error.message : 'Unable to cancel this import.';
    }
  }

  $effect(() => {
    if (!autoStarted && form?.autoStartJobId) {
      autoStarted = true;
      if (form.job) upsertJob(form.job);
      void runImport(form.autoStartJobId);
    }
  });
</script>

<svelte:head><title>Import package | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Reviewed content workflow</p>
    <h1>Import package</h1>
    <p class="muted">Review one complete package, then let this browser conduct small sequential Worker requests. D1 keeps the authoritative checkpoint if you close or refresh the page.</p>
  </div>
</section>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}
{#if form?.issues?.length}<ul class="form-error">{#each (form.issues ?? []) as issue}<li>{issue}</li>{/each}</ul>{/if}
{#if form?.warnings?.length}<ul class="warning">{#each form.warnings as warning}<li>{warning}</li>{/each}</ul>{/if}
{#if localError}<p class="form-error" role="alert">{localError}</p>{/if}

{#if form?.preview}
  <section class="panel preview" aria-live="polite">
    <p class="eyebrow">Package preview{form.packageId ? ` · ${form.packageId}` : ''}</p>
    <h2>Package structure passed review checks</h2>
    <p class="muted">This preview authorizes only this exact ZIP for a short period. Database conflict validation is intentionally performed later in bounded persisted steps, and all of it must pass before any domain content is written.</p>
    <div class="count-grid">
      <span>Topics <strong>{form.preview.topics.create} create · {form.preview.topics.use} use · {form.preview.topics.skip} skip</strong></span>
      <span>Cases <strong>{form.preview.cases.create} create · {form.preview.cases.use} use · {form.preview.cases.skip} skip</strong></span>
      <span>Images to upload <strong>{form.preview.imagesToUpload}</strong></span>
      <span>Question Prompts <strong>{form.preview.questionPrompts}</strong></span>
      <span>Case Questions <strong>{form.preview.caseQuestions}</strong></span>
      <span>Topic Questions <strong>{form.preview.topicQuestions}</strong></span>
      <span>Primary Topic links <strong>{form.preview.primaryTopicLinks}</strong></span>
      <span>Secondary Topic links <strong>{form.preview.secondaryTopicLinks}</strong></span>
    </div>
  </section>
{/if}

<section class="panel">
  <h2>1. Validate and preview</h2>
  <p class="muted">The ZIP must contain <code>manifest.json</code> and only declared files under <code>media/</code>. Hardened package/static validation does not write D1 or R2.</p>
  <form method="POST" action="?/preview" enctype="multipart/form-data" class="form-grid">
    <label>Flash-Cards Import Package ZIP<input name="package" type="file" accept=".zip,application/zip" required onchange={fileChanged} /></label>
    <div class="actions"><button class="button primary" type="submit">Validate and preview</button></div>
  </form>
</section>

<section class="panel">
  <h2>2. Confirm and start resumable import</h2>
  <p class="muted">Select the exact ZIP that most recently passed preview. Its SHA-256 must match before the package is staged privately in R2 and a durable D1 job is created.</p>
  <form method="POST" action="?/start" enctype="multipart/form-data" class="form-grid">
    <label>Package ZIP<input name="package" type="file" accept=".zip,application/zip" required onchange={fileChanged} /></label>
    <label class="confirmation"><input name="confirm" type="checkbox" value="on" required bind:checked={confirmImport} /> I reviewed the preview and explicitly confirm this exact import package.</label>
    <div class="actions"><button class="button danger" type="submit">Start resumable import</button></div>
  </form>
</section>

<section class="panel jobs" aria-live="polite">
  <div class="section-heading">
    <div><p class="eyebrow">Durable progress</p><h2>Current / recent imports</h2></div>
    <p class="muted">Pause only stops this browser loop. Closing the browser does the same; completed chunks remain checkpointed in D1.</p>
  </div>

  {#if jobs.length === 0}
    <p class="muted">No import jobs yet.</p>
  {:else}
    <div class="job-list">
      {#each jobs as job (job.id)}
        <article class="job-card">
          <div class="job-title">
            <div><strong>{job.packageId}</strong><span class="job-id">{job.id}</span></div>
            <span class:failed={job.status === 'failed'} class:complete={job.status === 'complete'} class="status">{runningJobId === job.id ? 'processing' : job.status}</span>
          </div>
          <div class="progress-row">
            <progress max="100" value={percent(job)}></progress>
            <strong>{job.processedCount} / {job.totalCount}</strong>
            <span>{percent(job)}%</span>
          </div>
          <p class="phase">Phase: {phaseLabels[job.phase] ?? job.phase} · cursor {job.cursor}</p>
          {#if job.lastError}<p class="job-error">{job.lastError}</p>{/if}
          {#if job.status === 'cancelled' && hasDomainWrites(job)}<p class="warning-inline">Cancelled after writes began: already committed content was not rolled back.</p>{/if}
          {#if job.status === 'complete'}<p class="success-inline">Import complete. The temporary staged ZIP has been removed; imported teaching images remain.</p>{/if}
          <div class="actions">
            {#if runningJobId === job.id}
              <button class="button" type="button" onclick={() => pauseImport(job.id)}>Pause</button>
            {:else if canResume(job)}
              <button class="button primary" type="button" disabled={requestInFlight} onclick={() => runImport(job.id)}>{job.status === 'failed' ? 'Retry / resume' : 'Resume import'}</button>
            {/if}
            {#if !['complete', 'cancelled'].includes(job.status)}
              <button class="button danger-outline" type="button" disabled={requestInFlight} onclick={() => cancelJob(job.id)}>{hasDomainWrites(job) ? 'Stop and discard staging' : 'Cancel import'}</button>
            {/if}
          </div>
          {#if hasDomainWrites(job) && !['complete', 'cancelled'].includes(job.status)}<p class="muted small">Stopping now does not roll back earlier committed import chunks.</p>{/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-heading, .section-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.6rem; font-size: 1.15rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; } .small { font-size: 0.84rem; }
  .panel { margin-top: 1.25rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .preview { border-color: #98a2b3; }
  .form-error, .warning { margin: 1rem 0; padding: 0.75rem 1rem; border-radius: 8px; } .form-error { background: #fef3f2; color: #b42318; } .warning { background: #fffaeb; color: #93370d; }
  .form-grid { display: grid; gap: 1rem; } label { display: grid; gap: 0.4rem; color: #344054; font-weight: 650; } input[type='file'] { padding: 0.65rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .confirmation { display: flex; align-items: center; gap: 0.6rem; } .confirmation input { width: 1rem; height: 1rem; }
  .count-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; } .count-grid span { display: grid; gap: 0.2rem; padding: 0.7rem; border: 1px solid #eaecf0; border-radius: 8px; color: #667085; } .count-grid strong { color: #172033; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; } .button { padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; font: inherit; cursor: pointer; } .button:disabled { cursor: not-allowed; opacity: 0.55; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.danger { border-color: #b42318; background: #b42318; color: #fff; } .button.danger-outline { border-color: #b42318; color: #b42318; }
  .job-list { display: grid; gap: 0.8rem; }.job-card { padding: 0.9rem; border: 1px solid #eaecf0; border-radius: 9px; }.job-title { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }.job-title > div { display: grid; gap: 0.2rem; }.job-id { color: #667085; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.76rem; overflow-wrap: anywhere; }.status { padding: 0.25rem 0.55rem; border-radius: 999px; background: #f2f4f7; color: #344054; font-size: 0.76rem; font-weight: 750; text-transform: capitalize; }.status.complete { background: #ecfdf3; color: #027a48; }.status.failed { background: #fef3f2; color: #b42318; }.progress-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 0.7rem; align-items: center; margin: 0.8rem 0 0.4rem; }.progress-row progress { width: 100%; }.phase { margin-bottom: 0.65rem; color: #475467; font-size: 0.9rem; }.job-error { padding: 0.65rem; border-radius: 7px; background: #fef3f2; color: #b42318; font-size: 0.88rem; }.warning-inline { color: #93370d; font-size: 0.88rem; }.success-inline { color: #027a48; font-size: 0.88rem; }
  @media (max-width: 700px) { .page-heading, .section-heading { align-items: start; flex-direction: column; }.count-grid { grid-template-columns: minmax(0, 1fr); }.progress-row { grid-template-columns: minmax(0, 1fr) auto; }.progress-row span { grid-column: 2; }.job-title { flex-direction: column; } }
</style>
