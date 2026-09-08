<script>
  // @ts-nocheck
  import { deserialize } from '$app/forms';
  import { onDestroy } from 'svelte';
  import ImportPackageText from '$lib/components/ImportPackageText.svelte';
  import { createImportHistoryController } from '$lib/import-history-controller.js';
  import { createImportPreviewController } from '$lib/import-preview-controller.js';
  import { CLEAR_IMPORT_HISTORY_CONFIRMATION } from '$lib/import-history-state.js';

  let { data, form } = /** @type {any} */ ($props());
  let actionState = $state(form ?? null);
  let confirmImport = $state(false);
  let jobs = $state([...(data.jobs ?? [])]);
  let hasEligibleTerminalHistory = $state(Boolean(data.hasEligibleTerminalHistory));
  let runningJobId = $state(null);
  let requestInFlight = $state(false);
  let previewInFlight = $state(false);
  let startInFlight = $state(false);
  let historyMutationInFlight = $state(false);
  let localError = $state('');
  let historyError = $state('');
  let historyResult = $state(null);
  let autoStarted = $state(false);
  let previewResult = $state(null);
  let selectedPreviewFile = $state(null);
  let selectedStartFile = $state(null);
  let serverPreviewStatus = $state('idle');
  let localBinding = $state('unchecked');
  let media = $state({});
  let previewInput;
  let startInput;
  let clearDialog;
  let pendingClearCursor = $state(null);

  const previewController = createImportPreviewController({
    onChange(next) {
      selectedPreviewFile = next.selectedPreviewFile;
      selectedStartFile = next.selectedStartFile;
      previewResult = next.previewResult;
      previewInFlight = next.previewInFlight;
      serverPreviewStatus = next.serverPreviewStatus;
      localBinding = next.localBinding;
      media = next.media;
    },
    onActionState(next) {
      actionState = next;
    }
  });

  const historyController = createImportHistoryController(data, {
    postJobAction,
    postHistoryAction,
    onChange(next) {
      jobs = next.jobs;
      hasEligibleTerminalHistory = next.hasEligibleTerminalHistory;
      runningJobId = next.runningJobId;
      requestInFlight = next.requestInFlight;
      historyMutationInFlight = next.historyMutationInFlight;
      localError = next.localError;
      historyError = next.historyError;
      historyResult = next.historyResult;
      pendingClearCursor = next.pendingClearCursor;
    }
  });

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

  function fileChanged(event) {
    previewController.selectPreviewFile(event.currentTarget.files?.[0] ?? null);
    if (startInput) startInput.value = '';
    confirmImport = false;
    actionState = null;
  }

  function startFileChanged(event) {
    previewController.selectStartFile(event.currentTarget.files?.[0] ?? null);
  }

  async function submitPreview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await previewController.submitPreview({
      formData: new FormData(form),
      post: async (formData) => {
        const response = await fetch(form.action, { method: 'POST', headers: { 'x-sveltekit-action': 'true' }, body: formData });
        return deserialize(await response.text());
      }
    });
  }

  async function submitStart(event) {
    event.preventDefault();
    if (startInFlight || !previewController.canStart()) return;
    startInFlight = true;
    previewController.consumeAuthorization();
    confirmImport = false;
    try {
      const response = await fetch(event.currentTarget.action, { method: 'POST', headers: { 'x-sveltekit-action': 'true' }, body: new FormData(event.currentTarget) });
      const result = deserialize(await response.text());
      actionState = result.data;
      if (result.type !== 'success') return;
      if (result.data?.job) historyController.upsertJob(result.data.job);
      if (result.data?.autoStartJobId) void historyController.runImport(result.data.autoStartJobId);
    } catch (error) {
      actionState = { error: error instanceof Error ? error.message : 'Unable to start this import.' };
    } finally {
      startInFlight = false;
    }
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

  async function cancelJob(id) {
    await historyController.cancelJob(id);
  }

  async function postHistoryAction(action, cursor = null) {
    const body = new FormData();
    if (cursor) body.set(action === 'removeHistory' ? 'jobId' : 'cursor', cursor);
    if (action === 'clearHistory') body.set('confirm', 'on');
    const response = await fetch(`?/${action}`, { method: 'POST', headers: { 'x-sveltekit-action': 'true' }, body });
    const result = deserialize(await response.text());
    if (result.type === 'failure') throw new Error(result.data?.issues?.join(' ') || result.data?.error || `Import history ${action} failed.`);
    if (result.type !== 'success') throw new Error(`Import history ${action} did not complete normally.`);
    return result.data;
  }

  async function removeHistoryJob(id) {
    await historyController.removeHistory(id);
  }

  function openClearDialog(cursor = null) {
    historyController.openClearDialog(cursor);
    pendingClearCursor = cursor;
    clearDialog?.showModal();
  }

  async function confirmClearHistory() {
    clearDialog?.close();
    await historyController.confirmClear({ confirmed: true, cursor: pendingClearCursor });
  }

  $effect(() => {
    if (!autoStarted && form?.autoStartJobId) {
      autoStarted = true;
      if (form.job) historyController.upsertJob(form.job);
      void historyController.runImport(form.autoStartJobId);
    }
  });

  onDestroy(() => {
    previewController.destroy();
    historyController.destroy();
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

{#if actionState?.error}<p class="form-error" role="alert">{actionState.error}</p>{/if}
{#if actionState?.issues?.length}<ul class="form-error">{#each (actionState.issues ?? []) as issue}<li>{issue}</li>{/each}</ul>{/if}
{#if actionState?.warnings?.length}<ul class="warning">{#each actionState.warnings as warning}<li>{warning}</li>{/each}</ul>{/if}
{#if localError}<p class="form-error" role="alert">{localError}</p>{/if}
{#if historyError}<p class="form-error" role="alert">{historyError}</p>{/if}

{#if previewResult?.preview}
  <section class="panel preview" aria-live="polite">
    <p class="eyebrow">Package preview{previewResult.packageId ? ` · ${previewResult.packageId}` : ''}</p>
    <h2>Package structure passed review checks</h2>
    <p class="muted">This preview authorizes only this exact ZIP for a short period. Database conflict validation is intentionally performed later in bounded persisted steps, and all of it must pass before any domain content is written.</p>
    <div class="count-grid">
      <span>Topics <strong>{previewResult.preview.topics.create} create · {previewResult.preview.topics.use} use · {previewResult.preview.topics.skip} skip</strong></span>
      <span>Cases <strong>{previewResult.preview.cases.create} create · {previewResult.preview.cases.use} use · {previewResult.preview.cases.skip} skip</strong></span>
      <span>Images to upload <strong>{previewResult.preview.imagesToUpload}</strong></span>
      <span>Question Prompts <strong>{previewResult.preview.questionPrompts}</strong></span>
      <span>Case Questions <strong>{previewResult.preview.caseQuestions}</strong></span>
      <span>Topic Questions <strong>{previewResult.preview.topicQuestions}</strong></span>
      <span>Primary Topic links <strong>{previewResult.preview.primaryTopicLinks}</strong></span>
      <span>Secondary Topic links <strong>{previewResult.preview.secondaryTopicLinks}</strong></span>
    </div>
    <div class="package-declared-preview">
      <p class="eyebrow">Package-declared content preview</p>
      <p class="muted">Read-only view of the exact ZIP that passed package validation. Existing Production references and database conflicts are validated later.</p>
      {#each (previewResult.previewModel?.cases ?? []) as item (item.id)}
        <article class="content-card">
          <h3>Case · {item.id}</h3>
          {#if item.operation === 'use'}
            <p>Existing Production Case · {item.applicationId}</p>
          {:else}
            <p><strong><ImportPackageText value={item.create.title} /></strong></p>
            {#if item.create.vignetteMd}<p><ImportPackageText value={item.create.vignetteMd} /></p>{/if}
            <p>{item.create.isActive ? 'Active' : 'Inactive'} · {item.create.selectionLabel}</p>
          {/if}
          {#if item.primaryTopic}
            <p class="reference-label">Primary Topic</p>
            {#if item.primaryTopic.operation === 'use'}<p>Existing Production Topic · {item.primaryTopic.applicationId}</p>{:else}<p><ImportPackageText value={item.primaryTopic.name} /></p>{/if}
          {/if}
          {#if item.assets.length}
            <p class="reference-label">Case Assets</p>
            <div class="asset-list">
              {#each item.assets as link (link.id)}
                <div class="asset-row">
                  {#if link.asset?.operation === 'use'}
                    <span>Existing Production Asset · {link.asset.applicationId}</span>
                  {:else}
                    <span>Package media declared for this create Asset · {link.asset.id} · {link.asset.mediaPath}</span>
                    {#if media[link.asset.id]?.status === 'ready'}<img src={media[link.asset.id].url} alt={link.asset.altText ?? ''} />{:else if media[link.asset.id]?.status === 'unavailable'}<span class="muted">Image display unavailable; package validation still passed.</span>{/if}
                    {#if link.create?.captionMd}<ImportPackageText value={link.create.captionMd} />{/if}
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
          {#if item.questions.length}
            <p class="reference-label">Case Questions</p>
            <div class="question-list">
              {#each item.questions as question (question.id)}
                <div class="question-row">
                  <p><strong>Question · {question.id}</strong>{#if question.operation === 'use'} · Existing Production Case Question · {question.applicationId}{/if}</p>
                  {#if question.prompt?.operation === 'use'}<p>Existing Production Question Prompt · {question.prompt.applicationId}</p>{:else if question.prompt?.operation === 'create'}<p><ImportPackageText value={question.prompt.promptMd} /></p>{/if}
                  {#if question.create}<p><ImportPackageText value={question.create.answerMd} /></p><p>{question.create.isActive ? 'Active' : 'Inactive'}</p>{/if}
                </div>
              {/each}
            </div>
          {/if}
        </article>
      {/each}
      {#if previewResult.previewModel?.topicQuestions?.length}
        <p class="reference-label">Topic Questions</p>
        <div class="question-list">
          {#each previewResult.previewModel.topicQuestions as question (question.id)}
            <article class="content-card question-row">
              <p><strong>Topic Question · {question.id}</strong>{#if question.operation === 'use'} · Existing Production Topic Question · {question.applicationId}{/if}</p>
              {#if question.ownerTopic?.operation === 'use'}<p>Owner Topic: Existing Production Topic · {question.ownerTopic.applicationId}</p>{:else if question.ownerTopic}<p>Owner Topic: <ImportPackageText value={question.ownerTopic.name} /></p>{/if}
              {#if question.ownerParentTopic}<p>Immediate package-declared parent: {#if question.ownerParentTopic.operation === 'use'}Existing Production Topic · {question.ownerParentTopic.applicationId}{:else}<ImportPackageText value={question.ownerParentTopic.name} />{/if}</p>{/if}
              {#if question.prompt?.operation === 'use'}<p>Existing Production Question Prompt · {question.prompt.applicationId}</p>{:else if question.prompt?.operation === 'create'}<p><ImportPackageText value={question.prompt.promptMd} /></p>{/if}
              {#if question.create}<p><ImportPackageText value={question.create.answerMd} /></p><p>{question.create.isActive ? 'Active' : 'Inactive'} · {question.create.inheritToDescendants ? 'Inherits to descendants' : 'Does not inherit to descendants'}</p>{/if}
            </article>
          {/each}
        </div>
        <p class="muted small">Existing Production Topics and their ancestors may contribute inherited questions; those records are not fetched for this package preview.</p>
      {/if}
    </div>
  </section>
{/if}

<section class="panel">
  <h2>1. Validate and preview</h2>
  <p class="muted">The ZIP must contain <code>manifest.json</code> and only declared files under <code>media/</code>. Hardened package/static validation does not write D1 or R2.</p>
  <form method="POST" action="?/preview" enctype="multipart/form-data" class="form-grid" onsubmit={submitPreview}>
    <label>Flash-Cards Import Package ZIP<input bind:this={previewInput} name="package" type="file" accept=".zip,application/zip" required onchange={fileChanged} /></label>
    <div class="actions"><button class="button primary" type="submit" disabled={previewInFlight}>{previewInFlight ? 'Validating…' : 'Validate and preview'}</button></div>
  </form>
</section>

<section class="panel">
  <h2>2. Confirm and start resumable import</h2>
  <p class="muted">Select the exact ZIP that most recently passed preview. Its SHA-256 must match before the package is staged privately in R2 and a durable D1 job is created.</p>
  <form method="POST" action="?/start" enctype="multipart/form-data" class="form-grid" onsubmit={submitStart}>
    <label>Package ZIP<input bind:this={startInput} name="package" type="file" accept=".zip,application/zip" required onchange={startFileChanged} /></label>
    <label class="confirmation"><input name="confirm" type="checkbox" value="on" required bind:checked={confirmImport} /> I reviewed the preview and explicitly confirm this exact import package.</label>
    <div class="actions"><button class="button danger" type="submit" disabled={startInFlight || serverPreviewStatus !== 'succeeded' || localBinding !== 'matched' || !confirmImport}>{startInFlight ? 'Starting…' : 'Start resumable import'}</button><span class="muted small">Preview: {serverPreviewStatus} · exact file: {localBinding}</span></div>
  </form>
</section>

<section class="panel jobs" aria-live="polite">
  <div class="section-heading">
    <div><p class="eyebrow">Durable progress</p><h2>Current / recent imports</h2></div>
    <div class="actions">
      {#if hasEligibleTerminalHistory}<button class="button danger-outline" type="button" disabled={historyMutationInFlight} onclick={() => openClearDialog(null)}>Clear old imports</button>{/if}
      <p class="muted">Pause only stops this browser loop. Closing the browser does the same; completed chunks remain checkpointed in D1.</p>
    </div>
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
              <button class="button" type="button" onclick={() => historyController.pauseImport(job.id)}>Pause</button>
            {:else if canResume(job)}
              <button class="button primary" type="button" disabled={requestInFlight} onclick={() => historyController.runImport(job.id)}>{job.status === 'failed' ? 'Retry / resume' : 'Resume import'}</button>
            {/if}
            {#if !['complete', 'cancelled'].includes(job.status)}
              <button class="button danger-outline" type="button" disabled={requestInFlight} onclick={() => cancelJob(job.id)}>{hasDomainWrites(job) ? 'Stop and discard staging' : 'Cancel import'}</button>
            {/if}
            {#if ['complete', 'cancelled'].includes(job.status)}
              <button class="button danger-outline" type="button" disabled={historyMutationInFlight} onclick={() => removeHistoryJob(job.id)}>Remove from history</button>
            {/if}
          </div>
          {#if hasDomainWrites(job) && !['complete', 'cancelled'].includes(job.status)}<p class="muted small">Stopping now does not roll back earlier committed import chunks.</p>{/if}
          {#if ['complete', 'cancelled'].includes(job.status)}<p class="muted small">Imported content will not be deleted.</p>{/if}
        </article>
      {/each}
    </div>
  {/if}
  {#if historyResult}
    <div class="history-result" role="status">
      <p>History cleanup removed {historyResult.removedIds?.length ?? 0} record(s) and safely retained {historyResult.failed?.length ?? 0} record(s).</p>
      {#if historyResult.failed?.length}<ul>{#each historyResult.failed as failure}<li>{failure.id}: {failure.message}</li>{/each}</ul>{/if}
      {#if historyResult.nextCursor}<button class="button" type="button" disabled={historyMutationInFlight} onclick={() => openClearDialog(historyResult.nextCursor)}>Continue clearing this sweep</button>{/if}
    </div>
  {/if}
</section>

<dialog bind:this={clearDialog} class="confirm-dialog">
  <form method="dialog" class="form-grid">
    <h2>{CLEAR_IMPORT_HISTORY_CONFIRMATION.title}</h2>
    <p>{CLEAR_IMPORT_HISTORY_CONFIRMATION.content}</p>
    <p>{CLEAR_IMPORT_HISTORY_CONFIRMATION.retained}</p>
    <div class="actions"><button class="button" type="submit">Cancel</button><button class="button danger" type="button" onclick={confirmClearHistory}>Remove records</button></div>
  </form>
</dialog>

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
  .package-declared-preview { display: grid; gap: 0.75rem; margin-top: 1.1rem; }.content-card { padding: 0.85rem; border: 1px solid #eaecf0; border-radius: 8px; }.content-card h3 { margin: 0 0 0.45rem; font-size: 1rem; }.content-card p { margin-bottom: 0.45rem; }.reference-label { margin-top: 0.7rem; color: #667085; font-size: 0.78rem; font-weight: 750; letter-spacing: 0.04em; text-transform: uppercase; }.asset-list, .question-list { display: grid; gap: 0.55rem; }.asset-row, .question-row { display: grid; gap: 0.35rem; padding: 0.65rem; border-left: 3px solid #d0d5dd; background: #f9fafb; }.asset-row img { max-width: min(100%, 280px); max-height: 180px; object-fit: contain; border-radius: 5px; }.history-result { margin-top: 1rem; padding: 0.75rem; border: 1px solid #d0d5dd; border-radius: 8px; }.confirm-dialog { max-width: 34rem; width: calc(100% - 2rem); border: 0; border-radius: 10px; padding: 1.1rem; }.confirm-dialog::backdrop { background: rgb(16 24 40 / 45%); }
  @media (max-width: 700px) { .page-heading, .section-heading { align-items: start; flex-direction: column; }.count-grid { grid-template-columns: minmax(0, 1fr); }.progress-row { grid-template-columns: minmax(0, 1fr) auto; }.progress-row span { grid-column: 2; }.job-title { flex-direction: column; } }
</style>
