<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import {
    clearFsrsPreviewRun,
    readFsrsPreviewRun,
    writeFsrsPreviewRun
  } from '$lib/fsrs-preview-run-storage.js';

  let { data, form } = $props();
  let browserRun = $state(null);
  let runMessage = $state('');
  let opening = $state(false);

  onMount(() => {
    browserRun = readFsrsPreviewRun(localStorage);
  });

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (form?.descriptor) {
      browserRun = writeFsrsPreviewRun(localStorage, form.descriptor);
      runMessage = form.message ?? 'Preview run planned.';
    }
    if (form?.discardedReviewId && browserRun?.currentReviewId === form.discardedReviewId) {
      clearFsrsPreviewRun(localStorage);
      browserRun = null;
      runMessage = 'The discarded Review belonged to the browser run, so that local run was cleared. Learner progress was not reset.';
    }
  });

  function routeChecked(systemId, value) {
    if (form?.systemId !== systemId || !Array.isArray(form?.selectedRoutes)) return true;
    return form.selectedRoutes.includes(value);
  }

  function selectedMode(systemId, mode) {
    if (form?.systemId !== systemId) return mode === 'scheduled';
    return form.studyMode === mode;
  }

  function clearBrowserRun() {
    clearFsrsPreviewRun(localStorage);
    browserRun = null;
    runMessage = 'Browser-only preview run cleared. Local learner scheduling/history was not reset.';
  }

  function runSummary(descriptor) {
    if (!descriptor) return null;
    if (descriptor.kind === 'scheduled') {
      return {
        mode: 'Scheduled Study',
        due: Math.max(0, descriptor.capturedDue.length - Number(descriptor.duePosition ?? 0)),
        newCount: Math.max(0, descriptor.capturedNew.length - Number(descriptor.newPosition ?? 0)),
        repeats: descriptor.repeatEntries?.length ?? 0,
        completed: descriptor.completedCaseIds?.length ?? 0
      };
    }
    return {
      mode: 'Free Study',
      remaining: Math.max(0, descriptor.bag.length - Number(descriptor.position ?? 0)),
      total: descriptor.bag.length
    };
  }

  async function continueRun() {
    if (!browserRun || data.activeReview || opening) return;
    opening = true;
    runMessage = '';
    try {
      const response = await fetch('/fsrs-preview/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptor: browserRun })
      });
      const payload = await response.json();
      if (payload.descriptor) browserRun = writeFsrsPreviewRun(localStorage, payload.descriptor);
      if (payload.status === 'review' && payload.reviewId) {
        await goto(`/fsrs-preview/review/${payload.reviewId}`);
        return;
      }
      if (payload.status === 'resume' && payload.reviewId) {
        runMessage = payload.message ?? 'Resume the active Review before continuing this run.';
        return;
      }
      if (payload.status === 'waiting') {
        runMessage = `No captured Due/New work remains. The next in-run repeat matures at ${new Date(payload.nextRepeatDueAt).toLocaleTimeString()}.`;
        return;
      }
      if (payload.status === 'new-limit-reached') {
        runMessage = `The safety limit of ${payload.limit} consecutive New completions was reached. Start a new Scheduled run to continue.`;
        return;
      }
      if (payload.status === 'complete') {
        runMessage = 'This preview run is complete.';
        return;
      }
      if (!response.ok) runMessage = payload.message ?? 'Unable to open the next Review.';
    } catch (cause) {
      runMessage = cause instanceof Error ? cause.message : String(cause);
    } finally {
      opening = false;
    }
  }

  let summary = $derived(runSummary(browserRun));
</script>

<svelte:head>
  <title>Local FSRS Preview | Flash-Cards</title>
</svelte:head>

<main class="shell preview-shell">
  <header class="preview-header">
    <div>
      <p class="eyebrow">Local-only learner preview</p>
      <h1>FSRS study preview</h1>
      <p class="muted intro">
        Exercise the staged Case-level FSRS flow against local D1/R2 without changing the production <code>/study</code> runtime.
      </p>
    </div>
    <div class="account-actions">
      <span class="muted">{data.user.email}</span>
      <a class="button" href="/study">Current Study</a>
      <SignOutButton />
    </div>
  </header>

  <section class="local-note" aria-label="Local preview safety">
    <strong>Local bindings only</strong>
    <span>This route requires a loopback request and loopback Better Auth binding. Its writes affect only the local learner database.</span>
  </section>

  {#if data.activeReview}
    <section class="active-card" aria-label="Active Review">
      <div>
        <p class="eyebrow">Resume</p>
        <h2>Active {data.activeReview.studyMode === 'scheduled' ? 'Scheduled' : 'Free'} Review</h2>
        <p class="muted">
          {data.activeReview.queueClass ? `${data.activeReview.queueClass} · ` : ''}{data.activeReview.contentMode === 'expanded' ? 'Expanded Learning' : 'Original questions'}{data.activeReview.revealed ? ' · answers revealed' : ''}
        </p>
      </div>
      <div class="active-actions">
        <a class="button primary" href={`/fsrs-preview/review/${data.activeReview.id}`}>Resume Review →</a>
        <form method="POST" action="?/discard">
          <input type="hidden" name="reviewId" value={data.activeReview.id} />
          <button class="button" type="submit">Discard Review</button>
        </form>
      </div>
    </section>
  {/if}

  <section class="preference-card">
    <div>
      <p class="eyebrow">Global learner preference</p>
      <h2>Expanded Learning</h2>
      <p class="muted">Applied when the next Scheduled or Free active Review is frozen. Default is off.</p>
    </div>
    <form method="POST" action="?/preference" class="preference-form">
      <label class="toggle-row">
        <input type="checkbox" name="expandedLearning" checked={data.preferences.expandedLearning} />
        <span>{data.preferences.expandedLearning ? 'Enabled' : 'Disabled'}</span>
      </label>
      <button class="button" type="submit">Save preference</button>
    </form>
  </section>

  {#if browserRun && summary}
    <section class="run-card" aria-label="Browser preview run">
      <div>
        <p class="eyebrow">Browser-local run</p>
        <h2>{summary.mode}</h2>
        {#if browserRun.kind === 'scheduled'}
          <div class="metrics">
            <span><strong>{summary.due}</strong> Due left</span>
            <span><strong>{summary.newCount}</strong> New left</span>
            <span><strong>{summary.repeats}</strong> repeats queued</span>
            <span><strong>{summary.completed}</strong> Cases completed</span>
          </div>
        {:else}
          <div class="metrics">
            <span><strong>{summary.remaining}</strong> of {summary.total} left</span>
          </div>
        {/if}
        <p class="muted">Run id: <code>{browserRun.runId}</code></p>
      </div>
      <div class="run-actions">
        <button class="button primary" type="button" onclick={continueRun} disabled={opening || Boolean(data.activeReview)}>
          {opening ? 'Opening…' : 'Continue run →'}
        </button>
        <button class="button" type="button" onclick={clearBrowserRun}>Clear browser run</button>
      </div>
    </section>
  {/if}

  {#if runMessage || form?.message}
    <p class="status-message" role="status">{runMessage || form?.message}</p>
  {/if}

  <section class="chooser-heading">
    <div>
      <p class="eyebrow">Plan a new run</p>
      <h2>Choose a System and scope</h2>
    </div>
    <p class="muted">All contributing Topic/Tag routes start selected. Uncheck routes to narrow the union.</p>
  </section>

  <div class="system-grid">
    {#each data.systems as system}
      <section class="system-card">
        <div class="system-heading">
          <div>
            <p class="eyebrow">{system.allCaseCount} eligible {system.allCaseCount === 1 ? 'Case' : 'Cases'}</p>
            <h2>{system.name}</h2>
          </div>
          <p class="muted">Exact Topic routes and curated Tags are unioned and deduplicated by the existing Part B selector.</p>
        </div>

        <form method="POST" action="?/plan" class="plan-form">
          <input type="hidden" name="systemId" value={system.id} />

          <fieldset class="mode-set">
            <legend>Study mode</legend>
            <label class="mode-option">
              <input type="radio" name="studyMode" value="scheduled" checked={selectedMode(system.id, 'scheduled')} />
              <span><strong>Scheduled Study</strong><small>Captured Due/New queues, FSRS ratings, and in-run repeats.</small></span>
            </label>
            <label class="mode-option">
              <input type="radio" name="studyMode" value="free" checked={selectedMode(system.id, 'free')} />
              <span><strong>Free Study</strong><small>Shuffled eligible Cases, no FSRS rating or scheduler transition.</small></span>
            </label>
          </fieldset>

          <fieldset class="route-set">
            <legend>Included routes</legend>
            {#each system.topics as topic}
              <label class="route-option">
                <input type="checkbox" name="route" value={`topic:${topic.id}`} checked={routeChecked(system.id, `topic:${topic.id}`)} />
                <span>
                  <strong>{topic.name}</strong>
                  <small>Topic · {topic.caseCount} exact {topic.caseCount === 1 ? 'Case' : 'Cases'}{#if topic.breadcrumb.length > 1} · {topic.breadcrumb.map((item) => item.name).join(' → ')}{/if}</small>
                </span>
              </label>
            {/each}
            {#each system.tags as tag}
              <label class="route-option tag-route">
                <input type="checkbox" name="route" value={`tag:${tag.id}`} checked={routeChecked(system.id, `tag:${tag.id}`)} />
                <span><strong>{tag.name}</strong><small>Curated Tag · {tag.caseCount} {tag.caseCount === 1 ? 'Case' : 'Cases'}</small></span>
              </label>
            {/each}
          </fieldset>

          {#if form?.message && form?.systemId === system.id}
            <p class="form-error" role="alert">{form.message}</p>
          {/if}
          <button class="button primary" type="submit" disabled={Boolean(data.activeReview)}>Plan {system.name} run</button>
        </form>
      </section>
    {/each}
  </div>
</main>

<style>
  .preview-shell { display:grid; gap:1.5rem; max-width:1100px; }
  .preview-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1.5rem; }
  .preview-header h1,.chooser-heading h2,.system-heading h2,.active-card h2,.preference-card h2,.run-card h2 { margin:.2rem 0 0; }
  .intro { max-width:760px; margin-bottom:0; line-height:1.6; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .account-actions,.active-actions,.run-actions,.preference-form { display:flex; align-items:center; justify-content:flex-end; gap:.65rem; flex-wrap:wrap; }
  .local-note { display:grid; gap:.3rem; padding:1rem 1.1rem; border:1px solid #b7c7d9; border-radius:12px; background:#f4f7fb; line-height:1.5; }
  .active-card,.preference-card,.run-card { display:flex; justify-content:space-between; gap:1rem; align-items:center; padding:1.1rem 1.2rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .active-card p,.preference-card p,.run-card p { margin:.35rem 0 0; }
  .toggle-row { display:flex; gap:.5rem; align-items:center; font-weight:700; }
  .metrics { display:flex; gap:.55rem; flex-wrap:wrap; margin-top:.75rem; }
  .metrics span { padding:.4rem .6rem; border-radius:999px; background:#eef2f6; color:#475467; font-size:.85rem; }
  .status-message { margin:0; padding:.8rem 1rem; border-radius:10px; background:#f8fafc; color:#344054; }
  .chooser-heading { display:flex; align-items:end; justify-content:space-between; gap:1rem; }
  .chooser-heading > p { max-width:520px; margin:0; text-align:right; }
  .system-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
  .system-card { display:grid; gap:1.1rem; align-content:start; padding:1.2rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .system-heading,.plan-form { display:grid; gap:.75rem; }
  .system-heading p:last-child { margin:0; line-height:1.5; }
  .mode-set,.route-set { display:grid; gap:.55rem; margin:0; padding:0; border:0; }
  .mode-set legend,.route-set legend { margin-bottom:.1rem; color:#344054; font-size:.88rem; font-weight:700; }
  .mode-option,.route-option { display:grid; grid-template-columns:auto minmax(0,1fr); gap:.65rem; align-items:start; padding:.72rem; border:1px solid #dfe5ee; border-radius:10px; cursor:pointer; }
  .mode-option:has(input:checked),.route-option:has(input:checked) { border-color:#98a2b3; background:#f8fafc; }
  .tag-route { border-style:dashed; }
  .mode-option input,.route-option input { margin-top:.18rem; }
  .mode-option span,.route-option span { display:grid; gap:.18rem; }
  .mode-option small,.route-option small { color:#667085; line-height:1.4; }
  .form-error { margin:0; color:#b42318; font-size:.88rem; }
  code { font-size:.88em; }
  @media (max-width:820px) {
    .preview-header,.chooser-heading,.active-card,.preference-card,.run-card { display:grid; align-items:stretch; }
    .account-actions,.active-actions,.run-actions,.preference-form { justify-content:flex-start; }
    .chooser-heading > p { text-align:left; }
    .system-grid { grid-template-columns:1fr; }
  }
</style>
