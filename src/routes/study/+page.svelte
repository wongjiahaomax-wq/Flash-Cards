<script>
  import { applyAction, enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  import LearnerFsrsProgress from '$lib/components/LearnerFsrsProgress.svelte';
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import { requestNextLearnerStudyWork } from '$lib/learner-study-open.js';
  import {
    clearLearnerStudyRun,
    readLearnerStudyRunForUser,
    writeLearnerStudyRun
  } from '$lib/learner-study-run-storage.js';
  import {
    contributingStudyRouteValues,
    orderedStudyTopics,
    studyTopicDepth,
    studyTopicDescendantIds,
    studyTopicSubtreeRouteValues
  } from '$lib/study-topic-hierarchy.js';
  import { effectiveStudyRunDistinctCaseTarget } from '$lib/study-run-size.js';

  let { data, form } = $props();
  /** @type {any} */
  let browserRun = $state(null);
  let runMessage = $state('');
  let opening = $state(false);
  let planning = $state(false);
  let counting = $state(false);
  /** @type {number|null} */
  let eligibleCount = $state(null);
  let selectedSystemCount = $state(0);
  let countMessage = $state('Select one or more Systems to calculate the combined unique Case count.');
  /** @type {HTMLFormElement|undefined} */
  let planForm = $state();
  let countRequest = 0;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let countTimer;

  /** @param {string} search */
  function runStatusMessage(search) {
    const params = new URLSearchParams(search);
    const status = params.get('runStatus');
    if (status === 'waiting') {
      const nextRepeatDueAt = Number(params.get('nextRepeatDueAt'));
      return Number.isFinite(nextRepeatDueAt)
        ? `No distinct Case can be introduced now. The next required in-run repeat matures at ${new Date(nextRepeatDueAt).toLocaleTimeString()}.`
        : 'The run is waiting for a required in-run repeat.';
    }
    if (status === 'new-limit-reached') {
      const limit = Number(params.get('limit'));
      return `The safety limit of ${Number.isFinite(limit) ? limit : 50} consecutive New completions was reached. Start a new Scheduled run to continue.`;
    }
    if (status === 'complete') return 'This Study run is complete. Start another run when you are ready.';
    if (status === 'resume') return 'Another active Review must be resumed or discarded before this browser run can continue.';
    if (status === 'run-lost') return 'The Review completed, but the browser-local run could not be recovered. Start a new run to continue.';
    if (status === 'open-failed') return 'The previous Review completed, but the next Review could not be opened. Continue the browser run when ready.';
    return '';
  }

  onMount(() => {
    if (form?.browserRunInvalidated) {
      clearLearnerStudyRun(localStorage);
      browserRun = null;
      runMessage = form.message ?? 'Scheduling changed. The stale browser run was cleared.';
    } else {
      browserRun = readLearnerStudyRunForUser(localStorage, data.user.id);
      runMessage = runStatusMessage(window.location.search);
    }
    queueMicrotask(() => refreshEligibleCount());
  });

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (form?.discardedReviewId && browserRun?.currentReviewId === form.discardedReviewId) {
      clearLearnerStudyRun(localStorage);
      browserRun = null;
      runMessage = 'The discarded Review belonged to this browser run, so that run was cleared. Learner progress was not reset.';
    }
  });

  /** @param {string} systemId */
  function submittedSystem(systemId) {
    return Array.isArray(form?.selectedSystems)
      ? form.selectedSystems.find((system) => system?.systemId === systemId)
      : null;
  }

  /** @param {string} systemId */
  function systemSelected(systemId) {
    return Boolean(submittedSystem(systemId));
  }

  /** @param {string} systemId */
  function systemNarrowed(systemId) {
    return submittedSystem(systemId)?.mode === 'routes';
  }

  /** @param {any} system */
  function initialRoutesForSystem(system) {
    const submitted = submittedSystem(system.id);
    return submitted?.mode === 'routes' && Array.isArray(submitted.selectedRoutes)
      ? [...new Set(submitted.selectedRoutes)]
      : contributingStudyRouteValues(system);
  }

  /** @type {Record<string,string[]>} */
  let routeSelections = $state(Object.fromEntries(
    data.systems.map((system) => [system.id, initialRoutesForSystem(system)])
  ));

  /** @param {string} systemId */
  function selectedRoutesForSystem(systemId) {
    return routeSelections[systemId] ?? [];
  }

  /** @param {string} systemId @param {string} value */
  function isRouteSelected(systemId, value) {
    return selectedRoutesForSystem(systemId).includes(value);
  }

  /** @param {string} systemId @param {string[]} values @param {boolean} checked */
  function setRoutes(systemId, values, checked) {
    const current = selectedRoutesForSystem(systemId);
    const affected = new Set(values);
    routeSelections[systemId] = checked
      ? [...new Set([...current, ...values])]
      : current.filter((value) => !affected.has(value));
  }

  /** @param {any} system @param {any} topic */
  function topicChecked(system, topic) {
    if (Number(topic.caseCount) > 0) return isRouteSelected(system.id, `topic:${topic.id}`);
    const subtree = studyTopicSubtreeRouteValues(system.topics, topic.id);
    return subtree.length > 0 && subtree.every((value) => isRouteSelected(system.id, value));
  }

  /** @param {any} system @param {any} topic */
  function topicIndeterminate(system, topic) {
    const subtree = studyTopicSubtreeRouteValues(system.topics, topic.id);
    if (subtree.length < 2) return false;
    const count = subtree.filter((value) => isRouteSelected(system.id, value)).length;
    return count > 0 && count < subtree.length;
  }

  /** @param {HTMLInputElement} node @param {boolean} value */
  function indeterminate(node, value) {
    node.indeterminate = Boolean(value);
    return {
      /** @param {boolean} next */
      update(next) {
        node.indeterminate = Boolean(next);
      }
    };
  }

  /** @param {Event} event */
  function eventChecked(event) {
    return /** @type {HTMLInputElement} */ (event.currentTarget).checked;
  }

  /** @param {any} system @param {any} topic @param {boolean} checked */
  function toggleTopicSubtree(system, topic, checked) {
    setRoutes(system.id, studyTopicSubtreeRouteValues(system.topics, topic.id), checked);
  }

  /** @param {any} system @param {'topic'|'tag'} routeType @param {boolean} checked */
  function toggleGroup(system, routeType, checked) {
    const values = routeType === 'topic'
      ? system.topics
        .filter((topic) => Number(topic.caseCount) > 0)
        .map((topic) => `topic:${topic.id}`)
      : system.tags.map((tag) => `tag:${tag.id}`);
    setRoutes(system.id, values, checked);
  }

  /** @param {'scheduled'|'free'} mode */
  function selectedMode(mode) {
    return (form?.studyMode || 'scheduled') === mode;
  }

  /** @param {'5'|'10'|'20'|'all'} value */
  function selectedRunSize(value) {
    return (form?.runSize || '10') === value;
  }

  async function refreshEligibleCount() {
    if (!planForm) return;
    const requestId = ++countRequest;
    counting = true;
    try {
      const response = await fetch('/study/api/count', {
        method: 'POST',
        body: new FormData(planForm)
      });
      const payload = await response.json();
      if (requestId !== countRequest) return;
      if (!response.ok) {
        eligibleCount = null;
        selectedSystemCount = 0;
        countMessage = payload.message ?? 'Unable to calculate the combined eligible Case count.';
        return;
      }
      eligibleCount = Number(payload.candidateCount);
      selectedSystemCount = Number(payload.selectedSystemCount);
      countMessage = 'Server-resolved union; overlapping Cases are counted once.';
    } catch (cause) {
      if (requestId !== countRequest) return;
      eligibleCount = null;
      selectedSystemCount = 0;
      countMessage = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (requestId === countRequest) counting = false;
    }
  }

  function scheduleEligibleCount() {
    eligibleCount = null;
    countMessage = 'Updating combined count…';
    if (countTimer) clearTimeout(countTimer);
    countTimer = setTimeout(() => refreshEligibleCount(), 120);
  }

  function clearBrowserRun() {
    clearLearnerStudyRun(localStorage);
    browserRun = null;
    runMessage = 'Browser run cleared. Learner scheduling/history was not reset.';
  }

  /** @param {any} descriptor */
  function runSummary(descriptor) {
    if (!descriptor) return null;
    if (descriptor.kind === 'scheduled') {
      const available = descriptor.capturedDue.length + descriptor.capturedNew.length;
      return {
        mode: 'Scheduled Study',
        due: Math.max(0, descriptor.capturedDue.length - Number(descriptor.duePosition ?? 0)),
        newCount: Math.max(0, descriptor.capturedNew.length - Number(descriptor.newPosition ?? 0)),
        repeats: descriptor.repeatEntries?.length ?? 0,
        completed: new Set(descriptor.completedCaseIds ?? []).size,
        target: effectiveStudyRunDistinctCaseTarget(descriptor.distinctCaseTarget, available),
        allAvailable: descriptor.distinctCaseTarget == null
      };
    }
    const total = effectiveStudyRunDistinctCaseTarget(descriptor.distinctCaseTarget, descriptor.bag.length);
    return {
      mode: 'Free Study',
      remaining: Math.max(0, total - Number(descriptor.position ?? 0)),
      total,
      allAvailable: descriptor.distinctCaseTarget == null
    };
  }

  /** @param {any} descriptor */
  async function openRun(descriptor) {
    if (!descriptor || data.activeReview || opening) return;
    opening = true;
    runMessage = '';
    try {
      const { ok, payload } = await requestNextLearnerStudyWork(descriptor);
      if (payload.descriptor) browserRun = writeLearnerStudyRun(localStorage, payload.descriptor);
      if (payload.status === 'review' && payload.reviewId) {
        await goto(`/study/${payload.reviewId}`);
        return;
      }
      if (payload.status === 'resume' && payload.reviewId) {
        runMessage = payload.message ?? 'Resume the active Review before continuing this run.';
        return;
      }
      if (payload.status === 'waiting') {
        runMessage = `No new distinct Case can be introduced yet. The next in-run repeat matures at ${new Date(payload.nextRepeatDueAt).toLocaleTimeString()}.`;
        return;
      }
      if (payload.status === 'new-limit-reached') {
        runMessage = `The safety limit of ${payload.limit} consecutive New completions was reached. Start a new Scheduled run to continue.`;
        return;
      }
      if (payload.status === 'complete') {
        runMessage = 'This Study run is complete. Start another run when you are ready.';
        return;
      }
      if (!ok) runMessage = payload.message ?? 'Unable to open the next Review.';
    } catch (cause) {
      runMessage = cause instanceof Error ? cause.message : String(cause);
    } finally {
      opening = false;
    }
  }

  /** @type {NonNullable<Parameters<typeof enhance>[1]>} */
  const startPlannedRun = () => {
    planning = true;
    runMessage = 'Planning run…';

    return async ({ result }) => {
      try {
        if (result.type !== 'success') {
          await applyAction(result);
          return;
        }

        const descriptor = result.data?.descriptor;
        if (!descriptor) {
          runMessage = 'Run planning completed without a browser run descriptor.';
          return;
        }

        const plannedRun = writeLearnerStudyRun(localStorage, descriptor);
        browserRun = plannedRun;
        runMessage = 'Run planned. Opening the first Review…';
        await openRun(plannedRun);
      } finally {
        planning = false;
      }
    };
  };

  async function continueRun() {
    await openRun(browserRun);
  }

  let summary = $derived(runSummary(browserRun));
</script>

<svelte:head>
  <title>Study | Flash-Cards</title>
</svelte:head>

<main class="shell study-shell">
  <header class="study-header">
    <div>
      <p class="eyebrow">Learner Study</p>
      <h1>Study</h1>
      <p class="muted intro">
        Choose one or more Systems, optionally narrow each System by Topic or curated Tag, then start one combined Scheduled or Free run.
      </p>
    </div>
    <div class="account-actions">
      <span class="muted">{data.user.email}</span>
      <SignOutButton />
    </div>
  </header>

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
        <a class="button primary" href={`/study/${data.activeReview.id}`}>Resume Review →</a>
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

  <LearnerFsrsProgress progress={data.progress} />

  {#if browserRun && summary}
    <section class="run-card" aria-label="Browser Study run">
      <div>
        <p class="eyebrow">Current browser run</p>
        <h2>{summary.mode}</h2>
        {#if browserRun.kind === 'scheduled'}
          <div class="metrics">
            <span><strong>{summary.completed}</strong> / {summary.target} distinct Cases</span>
            <span><strong>{summary.due}</strong> Due queued</span>
            <span><strong>{summary.newCount}</strong> New queued</span>
            <span><strong>{summary.repeats}</strong> repeats queued</span>
          </div>
        {:else}
          <div class="metrics">
            <span><strong>{summary.remaining}</strong> of {summary.total} distinct Cases left</span>
          </div>
        {/if}
        <p class="muted">Run size: {summary.allAvailable ? 'All available' : summary.total ?? summary.target}. Run id: <code>{browserRun.runId}</code></p>
      </div>
      <div class="run-actions">
        <button class="button primary" type="button" onclick={continueRun} disabled={opening || planning || Boolean(data.activeReview)}>
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
      <p class="eyebrow">Start a new run</p>
      <h2>Choose Systems and scope</h2>
    </div>
    <p class="muted">Selecting a System means all eligible content in that System unless you explicitly narrow it.</p>
  </section>

  <form
    bind:this={planForm}
    method="POST"
    action="?/plan"
    use:enhance={startPlannedRun}
    onchange={scheduleEligibleCount}
    class="multi-plan-form"
  >
    <section class="run-options-card">
      <fieldset class="mode-set">
        <legend>Study mode</legend>
        <label class="mode-option">
          <input type="radio" name="studyMode" value="scheduled" checked={selectedMode('scheduled')} />
          <span><strong>Scheduled Study</strong><small>One combined FSRS queue across all selected Systems.</small></span>
        </label>
        <label class="mode-option">
          <input type="radio" name="studyMode" value="free" checked={selectedMode('free')} />
          <span><strong>Free Study</strong><small>One shuffled combined eligible Case bag; no Scheduled FSRS transition.</small></span>
        </label>
      </fieldset>

      <fieldset class="size-set">
        <legend>Run size</legend>
        <label class="size-option"><input type="radio" name="runSize" value="5" checked={selectedRunSize('5')} /><span>5</span></label>
        <label class="size-option"><input type="radio" name="runSize" value="10" checked={selectedRunSize('10')} /><span>10</span></label>
        <label class="size-option"><input type="radio" name="runSize" value="20" checked={selectedRunSize('20')} /><span>20</span></label>
        <label class="size-option"><input type="radio" name="runSize" value="all" checked={selectedRunSize('all')} /><span>All available</span></label>
        <p class="field-help">Applies to the combined unique Case pool. Default is 10. Required Scheduled repeats do not consume another distinct-Case slot.</p>
      </fieldset>

      <div class="combined-count" aria-live="polite">
        <div>
          <p class="eyebrow">Combined scope</p>
          <strong>{eligibleCount == null ? '—' : eligibleCount} unique eligible {eligibleCount === 1 ? 'Case' : 'Cases'}</strong>
        </div>
        <div class="count-detail">
          <span>{selectedSystemCount} {selectedSystemCount === 1 ? 'System' : 'Systems'} selected</span>
          <small class="muted">{counting ? 'Updating from server…' : countMessage}</small>
        </div>
      </div>
    </section>

    <div class="system-grid">
      {#each data.systems as system}
        <section class="system-card">
          <label class="system-select">
            <input type="checkbox" name="system" value={system.id} checked={systemSelected(system.id)} />
            <span>
              <strong>{system.name}</strong>
              <small>{system.allCaseCount} eligible {system.allCaseCount === 1 ? 'Case' : 'Cases'} when the whole System is selected</small>
            </span>
          </label>

          <details class="scope-details">
            <summary>Configure Topics / Tags</summary>
            <p class="field-help">Leave “Narrow this System” unchecked to submit canonical <code>mode: "all"</code>. Turn it on only when you want explicit routes.</p>
            <label class="narrow-option">
              <input type="checkbox" name={`narrow:${system.id}`} checked={systemNarrowed(system.id)} />
              <span><strong>Narrow this System</strong><small>Use only the checked exact-Topic/curated Tag routes below.</small></span>
            </label>

            <fieldset class="route-set topic-set">
              <legend>Topics</legend>
              <div class="group-toolbar">
                <p class="field-help">Topic routes use exact Topic membership. Structural parents toggle descendant Topic routes without becoming routes themselves.</p>
                <div class="group-actions" aria-label={`${system.name} Topic selection controls`}>
                  <button type="button" onclick={() => toggleGroup(system, 'topic', true)}>Select all</button>
                  <span aria-hidden="true">·</span>
                  <button type="button" onclick={() => toggleGroup(system, 'topic', false)}>Clear all</button>
                </div>
              </div>
              {#each orderedStudyTopics(system.topics) as topic}
                {@const value = `topic:${topic.id}`}
                {@const descendants = studyTopicDescendantIds(system.topics, topic.id)}
                {@const breadcrumbText = topic.breadcrumb.map((item) => item.name).join(' → ')}
                <label class="route-option topic-route" style={`--topic-depth:${studyTopicDepth(topic)}`}>
                  <input
                    id={`study-${system.id}-topic-${topic.id}`}
                    type="checkbox"
                    name={Number(topic.caseCount) > 0 ? `route:${system.id}` : undefined}
                    value={value}
                    checked={topicChecked(system, topic)}
                    aria-controls={descendants.length > 0 ? descendants.map((id) => `study-${system.id}-topic-${id}`).join(' ') : undefined}
                    use:indeterminate={topicIndeterminate(system, topic)}
                    onchange={(event) => toggleTopicSubtree(system, topic, eventChecked(event))}
                  />
                  <span>
                    <strong>{topic.name}</strong>
                    {#if Number(topic.caseCount) > 0}
                      <small>Topic · {topic.caseCount} exact {topic.caseCount === 1 ? 'Case' : 'Cases'}{#if topic.breadcrumb.length > 1} · {breadcrumbText}{/if}</small>
                    {:else}
                      <small>Structural Topic · 0 exact Cases · {topic.subtreeCaseCount} {topic.subtreeCaseCount === 1 ? 'Case' : 'Cases'} in descendant Topics{#if topic.breadcrumb.length > 1} · {breadcrumbText}{/if}</small>
                    {/if}
                  </span>
                </label>
              {/each}
            </fieldset>

            {#if system.tags.length > 0}
              <fieldset class="route-set tag-set">
                <legend>Curated Tags</legend>
                <div class="group-toolbar">
                  <p class="field-help">Curated Tags can add relevant Cases across Topics, including Cases from Topics you unchecked.</p>
                  <div class="group-actions" aria-label={`${system.name} curated Tag selection controls`}>
                    <button type="button" onclick={() => toggleGroup(system, 'tag', true)}>Select all</button>
                    <span aria-hidden="true">·</span>
                    <button type="button" onclick={() => toggleGroup(system, 'tag', false)}>Clear all</button>
                  </div>
                </div>
                {#each system.tags as tag}
                  {@const value = `tag:${tag.id}`}
                  <label class="route-option tag-route">
                    <input
                      type="checkbox"
                      name={`route:${system.id}`}
                      value={value}
                      checked={isRouteSelected(system.id, value)}
                      onchange={(event) => setRoutes(system.id, [value], eventChecked(event))}
                    />
                    <span><strong>{tag.name}</strong><small>Curated Tag · {tag.caseCount} {tag.caseCount === 1 ? 'Case' : 'Cases'}</small></span>
                  </label>
                {/each}
              </fieldset>
            {/if}
          </details>
        </section>
      {/each}
    </div>

    {#if form?.message}<p class="form-error" role="alert">{form.message}</p>{/if}
    <div class="start-row">
      <p class="muted">The server revalidates every selected System/route and resolves the real deduplicated candidate union before planning.</p>
      <button class="button primary" type="submit" disabled={Boolean(data.activeReview) || planning || opening}>
        {planning ? 'Starting…' : 'Start combined Study run'}
      </button>
    </div>
  </form>
</main>

<style>
  .study-shell { display:grid; gap:1.5rem; max-width:1100px; }
  .study-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1.5rem; }
  .study-header h1,.chooser-heading h2,.active-card h2,.preference-card h2,.run-card h2 { margin:.2rem 0 0; }
  .intro { max-width:760px; margin-bottom:0; line-height:1.6; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .account-actions,.active-actions,.run-actions,.preference-form { display:flex; align-items:center; justify-content:flex-end; gap:.65rem; flex-wrap:wrap; }
  .active-card,.preference-card,.run-card,.run-options-card { display:flex; justify-content:space-between; gap:1rem; align-items:center; padding:1.1rem 1.2rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .active-card p,.preference-card p,.run-card p { margin:.35rem 0 0; }
  .toggle-row { display:flex; gap:.5rem; align-items:center; font-weight:700; }
  .metrics { display:flex; gap:.55rem; flex-wrap:wrap; margin-top:.75rem; }
  .metrics span { padding:.4rem .6rem; border-radius:999px; background:#eef2f6; color:#475467; font-size:.85rem; }
  .status-message { margin:0; padding:.8rem 1rem; border-radius:10px; background:#f8fafc; color:#344054; }
  .chooser-heading { display:flex; align-items:end; justify-content:space-between; gap:1rem; }
  .chooser-heading > p { max-width:520px; margin:0; text-align:right; }
  .multi-plan-form { display:grid; gap:1rem; }
  .run-options-card { align-items:stretch; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
  .mode-set,.size-set,.route-set { display:grid; gap:.55rem; margin:0; padding:0; border:0; }
  .mode-set legend,.size-set legend,.route-set legend { margin-bottom:.1rem; color:#344054; font-size:.88rem; font-weight:700; }
  .mode-option,.route-option,.narrow-option,.system-select { display:grid; grid-template-columns:auto minmax(0,1fr); gap:.65rem; align-items:start; padding:.72rem; border:1px solid #dfe5ee; border-radius:10px; cursor:pointer; }
  .mode-option:has(input:checked),.route-option:has(input:checked),.narrow-option:has(input:checked),.system-select:has(input:checked) { border-color:#98a2b3; background:#f8fafc; }
  .size-set { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .size-set legend,.size-set .field-help { grid-column:1 / -1; }
  .size-option { display:flex; gap:.4rem; align-items:center; justify-content:center; padding:.6rem .45rem; border:1px solid #dfe5ee; border-radius:10px; cursor:pointer; font-weight:700; text-align:center; }
  .size-option:has(input:checked) { border-color:#98a2b3; background:#f8fafc; }
  .combined-count { grid-column:1 / -1; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.9rem 1rem; border-radius:12px; background:#f8fafc; }
  .combined-count strong { display:block; margin-top:.2rem; font-size:1.05rem; }
  .count-detail { display:grid; justify-items:end; gap:.15rem; font-size:.88rem; text-align:right; }
  .system-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
  .system-card { display:grid; gap:.8rem; align-content:start; padding:1rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .system-card:has(.system-select input:checked) { border-color:#98a2b3; box-shadow:0 0 0 1px #eef2f6 inset; }
  .system-select { border:0; padding:.25rem; }
  .system-select span,.mode-option span,.route-option span,.narrow-option span { display:grid; gap:.18rem; }
  .system-select small,.mode-option small,.route-option small,.narrow-option small { color:#667085; line-height:1.4; }
  .scope-details { border-top:1px solid #eef2f6; padding-top:.7rem; }
  .scope-details summary { cursor:pointer; color:#344054; font-weight:700; }
  .scope-details > .field-help { margin:.7rem 0; }
  .narrow-option { margin-bottom:.7rem; }
  .field-help { margin:0; color:#667085; font-size:.82rem; line-height:1.45; }
  .group-toolbar { display:flex; align-items:flex-start; justify-content:space-between; gap:.75rem; margin-bottom:.1rem; }
  .group-toolbar .field-help { max-width:390px; }
  .group-actions { display:flex; align-items:center; gap:.35rem; flex-wrap:wrap; white-space:nowrap; }
  .group-actions button { padding:0; border:0; background:transparent; color:#475467; font:inherit; font-size:.8rem; text-decoration:underline; cursor:pointer; }
  .route-set + .route-set { margin-top:1rem; padding-top:.85rem; border-top:1px solid #eef2f6; }
  .topic-route { margin-left:calc(var(--topic-depth, 0) * .8rem); }
  .tag-route { border-style:dashed; }
  .mode-option input,.route-option input,.narrow-option input,.system-select input { margin-top:.18rem; }
  .form-error { margin:0; color:#b42318; font-size:.88rem; }
  .start-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .start-row p { margin:0; max-width:700px; }
  code { font-size:.88em; }
  @media (max-width:820px) {
    .study-header,.chooser-heading,.active-card,.preference-card,.run-card,.start-row,.combined-count { display:grid; align-items:stretch; }
    .account-actions,.active-actions,.run-actions,.preference-form { justify-content:flex-start; }
    .chooser-heading > p,.count-detail { text-align:left; justify-items:start; }
    .run-options-card,.system-grid { grid-template-columns:1fr; }
    .group-toolbar { display:grid; }
  }
  @media (max-width:520px) {
    .size-set { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
</style>