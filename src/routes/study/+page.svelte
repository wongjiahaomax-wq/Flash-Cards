<script>
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { tick, onMount } from 'svelte';

  import LearnerFsrsProgressSummary from '$lib/components/LearnerFsrsProgressSummary.svelte';
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import { requestNextLearnerStudyWork } from '$lib/learner-study-open.js';
  import {
    clearLearnerStudyRun,
    persistLearnerStudyRunReplacement,
    readLearnerStudyRunForUser
  } from '$lib/learner-study-run-storage.js';
  import {
    contributingStudyRouteValues,
    orderedStudyTopics,
    studyTopicDepth,
    studyTopicDescendantIds,
    studyTopicSubtreeRouteValues
  } from '$lib/study-topic-hierarchy.js';
  import { effectiveStudyRunDistinctCaseTarget } from '$lib/study-run-size.js';
  import { createStudyCountController } from '$lib/study-count-controller.js';

  /** @typedef {{id:string,name:string,kind?:string}} StudyBreadcrumbItem */
  /** @typedef {{id:string,name:string,caseCount:number,subtreeCaseCount:number,breadcrumb:StudyBreadcrumbItem[]}} StudyTopic */
  /** @typedef {{id:string,name:string,caseCount:number,displayOrder?:number}} StudyTag */
  /** @typedef {{id:string,name:string,allCaseCount:number,topics:StudyTopic[],tags:StudyTag[]}} StudySystem */

  let { data, form } = $props();
  let studySystems = $derived(/** @type {StudySystem[]} */ (
    Array.isArray(form?.freshSystems) ? form.freshSystems : data.systems
  ));
  /** @type {any} */
  let browserRun = $state(null);
  /** @type {'unknown'|'none'|'resumable'} */
  let browserRunState = $state('unknown');
  let showAlternateLauncher = $state(false);
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
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let countTimer;
  const countController = createStudyCountController((formData) => fetch('/study/api/count', {
    method: 'POST',
    body: formData
  }));

  let deletionBlocked = $derived(Boolean(data.studyDataDeletion?.inProgress || form?.deletionInProgress));

  /** @param {{eligibleCount:number|null,selectedSystemCount:number,countMessage:string,counting:boolean}} state */
  function syncCountState(state) {
    eligibleCount = state.eligibleCount;
    selectedSystemCount = state.selectedSystemCount;
    countMessage = state.countMessage;
    counting = state.counting;
  }

  /** @param {string} search */
  function runStatusMessage(search) {
    const params = new URLSearchParams(search);
    const status = params.get('runStatus');
    if (status === 'waiting') {
      const nextRepeatDueAt = Number(params.get('nextRepeatDueAt'));
      return Number.isFinite(nextRepeatDueAt)
        ? `No new Case can be added right now. The next repeat needed for this session is ready at ${new Date(nextRepeatDueAt).toLocaleTimeString()}.`
        : 'This session is waiting for a repeat needed to continue.';
    }
    if (status === 'new-limit-reached') {
      const limit = Number(params.get('limit'));
      return `You reached the limit of ${Number.isFinite(limit) ? limit : 50} new Cases in a row. Start a new Scheduled Study to continue.`;
    }
    if (status === 'complete') return 'This Study session is complete. Start another session when you are ready.';
    if (status === 'resume') return 'Resume or discard the active Review before starting more Study.';
    if (status === 'run-lost') return 'The Review was saved, but this Study session could not be restored. Start a new session to continue.';
    if (status === 'open-failed') return 'The previous Review was saved, but the next Review could not be opened. Continue your Study session when ready.';
    return '';
  }

  onMount(() => {
    browserRun = readLearnerStudyRunForUser(localStorage, data.user.id);
    browserRunState = browserRun ? 'resumable' : 'none';
    runMessage = runStatusMessage(window.location.search);
    queueMicrotask(() => {
      if (browserRunState === 'none') refreshEligibleCount();
    });
  });

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (form?.discardedReviewId && browserRun?.currentReviewId === form.discardedReviewId) {
      clearLearnerStudyRun(localStorage);
      browserRun = null;
      browserRunState = 'none';
      runMessage = 'The discarded Review belonged to this Study session, so its saved session was cleared. Your learning progress was not reset.';
    }
  });

  /** @param {string} systemId */
  function submittedSystem(systemId) {
    return Array.isArray(form?.selectedSystems)
      ? form.selectedSystems.find((system) => system?.systemId === systemId)
      : null;
  }

  /** @typedef {{status:'UNSELECTED'|'SELECTED_ALL'|'SELECTED_ROUTES',appliedRoutes:string[],draftMode:'all'|'routes',draftRoutes:string[]}} ScopeState */

  /** @param {StudySystem} system @returns {ScopeState} */
  function initialScopeState(system) {
    const submitted = submittedSystem(system.id);
    const availableRoutes = new Set(contributingStudyRouteValues(system));
    const submittedRoutes = submitted?.mode === 'routes' && Array.isArray(submitted.selectedRoutes)
      ? [...new Set(submitted.selectedRoutes)].filter((route) => availableRoutes.has(route))
      : [];
    const status = !submitted
      ? 'UNSELECTED'
      : submitted.mode === 'routes' && submittedRoutes.length > 0
        ? 'SELECTED_ROUTES'
        : submitted.mode === 'routes' ? 'UNSELECTED' : 'SELECTED_ALL';
    return {
      status,
      appliedRoutes: status === 'SELECTED_ROUTES' ? submittedRoutes : [],
      draftMode: status === 'SELECTED_ROUTES' ? 'routes' : 'all',
      draftRoutes: status === 'SELECTED_ROUTES' ? submittedRoutes : contributingStudyRouteValues(system)
    };
  }

  /** @type {Record<string,ScopeState>} */
  let scopeStates = $state(/** @type {Record<string,ScopeState>} */ (Object.fromEntries(
    data.systems.map((system) => [system.id, initialScopeState(system)])
  )));
  let customizingSystemId = $state(/** @type {string|null} */ (null));
  let customizationMessage = $state('');
  /** @type {Record<string, HTMLElement|undefined>} */
  let customizerTriggers = $state({});

  /** @param {string} systemId */
  async function restoreCustomizerFocus(systemId) {
    await tick();
    customizerTriggers[systemId]?.focus();
  }

  $effect(() => {
    if (!Array.isArray(form?.freshSystems)) return;
    scopeStates = /** @type {Record<string,ScopeState>} */ (Object.fromEntries(
      studySystems.map((system) => [system.id, initialScopeState(system)])
    ));
    customizingSystemId = null;
    customizationMessage = '';
  });

  /** @param {string} systemId */
  function scopeStateForSystem(systemId) {
    return scopeStates[systemId] ?? {
      status: 'UNSELECTED',
      appliedRoutes: [],
      draftMode: 'all',
      draftRoutes: []
    };
  }

  /** @param {string} systemId @param {Partial<ScopeState>} update */
  function updateScopeState(systemId, update) {
    scopeStates = {
      ...scopeStates,
      [systemId]: { ...scopeStateForSystem(systemId), ...update }
    };
  }

  /** @param {string} systemId */
  function systemSelected(systemId) {
    return scopeStateForSystem(systemId).status !== 'UNSELECTED';
  }

  /** @param {string} systemId */
  function systemNarrowed(systemId) {
    return scopeStateForSystem(systemId).status === 'SELECTED_ROUTES';
  }

  /** @param {string} systemId @param {boolean} checked */
  function setSystemSelected(systemId, checked) {
    const system = studySystems.find((candidate) => candidate.id === systemId);
    if (!system) return;
    updateScopeState(systemId, checked
      ? {
          status: 'SELECTED_ALL',
          appliedRoutes: [],
          draftMode: 'all',
          draftRoutes: contributingStudyRouteValues(system)
        }
      : {
          status: 'UNSELECTED',
          appliedRoutes: [],
          draftMode: 'all',
          draftRoutes: []
        });
    customizingSystemId = null;
    customizationMessage = '';
    scheduleEligibleCount();
  }

  /** @param {string} systemId */
  function appliedRoutesForSystem(systemId) {
    return scopeStateForSystem(systemId).appliedRoutes;
  }

  /** @param {string} systemId */
  function routesAreSubmitted(systemId) {
    return scopeStateForSystem(systemId).status === 'SELECTED_ROUTES';
  }

  /** @param {string} systemId */
  function selectedRoutesForSystem(systemId) {
    return scopeStateForSystem(systemId).draftRoutes;
  }

  /** @param {string} systemId @param {string} value */
  function isRouteSelected(systemId, value) {
    return selectedRoutesForSystem(systemId).includes(value);
  }

  /** @param {string} systemId @param {string[]} values @param {boolean} checked */
  function setRoutes(systemId, values, checked) {
    const current = selectedRoutesForSystem(systemId);
    const affected = new Set(values);
    const nextRoutes = checked
      ? [...new Set([...current, ...values])]
      : current.filter((value) => !affected.has(value));
    updateScopeState(systemId, { draftRoutes: nextRoutes });
  }

  /** @param {string} systemId */
  function draftScopeMode(systemId) {
    return scopeStateForSystem(systemId).draftMode;
  }

  /** @param {string} systemId @param {'all'|'routes'} mode */
  function setDraftScopeMode(systemId, mode) {
    const system = studySystems.find((candidate) => candidate.id === systemId);
    const current = scopeStateForSystem(systemId);
    updateScopeState(systemId, {
      draftMode: mode,
      draftRoutes: mode === 'routes' && current.draftRoutes.length === 0 && system
        ? contributingStudyRouteValues(system)
        : current.draftRoutes
    });
    customizationMessage = '';
  }

  /** @param {string} systemId */
  function openCustomize(systemId) {
    const current = scopeStateForSystem(systemId);
    const system = studySystems.find((candidate) => candidate.id === systemId);
    updateScopeState(systemId, {
      draftMode: current.status === 'SELECTED_ROUTES' ? 'routes' : 'all',
      draftRoutes: current.status === 'SELECTED_ROUTES'
        ? [...current.appliedRoutes]
        : system ? contributingStudyRouteValues(system) : []
    });
    customizingSystemId = systemId;
    customizationMessage = '';
  }

  /** @param {string} systemId @param {Event} event */
  function toggleCustomizer(systemId, event) {
    const open = /** @type {HTMLDetailsElement} */ (event.currentTarget).open;
    if (open) openCustomize(systemId);
    else if (customizingSystemId === systemId) cancelCustomize(systemId);
  }

  /** @param {string} systemId */
  function cancelCustomize(systemId) {
    const current = scopeStateForSystem(systemId);
    const system = studySystems.find((candidate) => candidate.id === systemId);
    updateScopeState(systemId, {
      draftMode: current.status === 'SELECTED_ROUTES' ? 'routes' : 'all',
      draftRoutes: current.status === 'SELECTED_ROUTES'
        ? [...current.appliedRoutes]
        : system ? contributingStudyRouteValues(system) : []
    });
    customizingSystemId = null;
    customizationMessage = '';
    restoreCustomizerFocus(systemId);
  }

  /** @param {StudySystem} system */
  function applyCustomize(system) {
    const current = scopeStateForSystem(system.id);
    if (current.draftMode === 'all') {
      updateScopeState(system.id, {
        status: 'SELECTED_ALL',
        appliedRoutes: [],
        draftRoutes: contributingStudyRouteValues(system)
      });
      customizingSystemId = null;
      customizationMessage = '';
      restoreCustomizerFocus(system.id);
      scheduleEligibleCount();
      return;
    }

    const contributingRoutes = new Set(contributingStudyRouteValues(system));
    const routes = [...new Set(current.draftRoutes)].filter((route) => contributingRoutes.has(route));
    if (routes.length === 0) {
      customizationMessage = 'Select at least one Topic or curated Tag, or choose Whole System.';
      return;
    }
    updateScopeState(system.id, {
      status: 'SELECTED_ROUTES',
      appliedRoutes: routes,
      draftRoutes: routes
    });
    customizingSystemId = null;
    customizationMessage = '';
    restoreCustomizerFocus(system.id);
    scheduleEligibleCount();
  }

  /** @param {StudySystem} system @param {StudyTopic} topic */
  function topicChecked(system, topic) {
    if (Number(topic.caseCount) > 0) return isRouteSelected(system.id, `topic:${topic.id}`);
    const subtree = studyTopicSubtreeRouteValues(system.topics, topic.id);
    return subtree.length > 0 && subtree.every((value) => isRouteSelected(system.id, value));
  }

  /** @param {StudySystem} system @param {StudyTopic} topic */
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

  /** @param {StudySystem} system @param {StudyTopic} topic @param {boolean} checked */
  function toggleTopicSubtree(system, topic, checked) {
    setRoutes(system.id, studyTopicSubtreeRouteValues(system.topics, topic.id), checked);
  }

  /** @param {StudySystem} system @param {'topic'|'tag'} routeType @param {boolean} checked */
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

  /** @param {number} [requestId] */
  async function refreshEligibleCount(requestId) {
    if (!planForm) return;
    const pending = countController.refresh(new FormData(planForm), requestId);
    syncCountState(countController.snapshot());
    syncCountState(await pending);
  }

  function scheduleEligibleCount() {
    const selectedCount = Object.values(scopeStates).filter((scope) => scope.status !== 'UNSELECTED').length;
    const requestId = countController.begin(selectedCount);
    syncCountState(countController.snapshot());
    if (countTimer) clearTimeout(countTimer);
    countTimer = setTimeout(() => refreshEligibleCount(requestId), 120);
  }

  function hasAppliedSystemSelection() {
    return Object.values(scopeStates).some((scope) => scope.status !== 'UNSELECTED');
  }

  function clearBrowserRun() {
    if (!window.confirm('Clear this saved Study session? Your scheduling and learning history will not be reset.')) return;
    clearLearnerStudyRun(localStorage);
    browserRun = null;
    browserRunState = 'none';
    showAlternateLauncher = false;
    runMessage = 'Saved Study session cleared. Your scheduling and learning history were not reset.';
  }

  function openAlternateLauncher() {
    showAlternateLauncher = true;
    runMessage = '';
    scheduleEligibleCount();
  }

  function closeAlternateLauncher() {
    showAlternateLauncher = false;
    runMessage = '';
  }

  function canShowNewRunLauncher() {
    return browserRunState !== 'unknown'
      && !data.activeReview
      && !deletionBlocked
      && (!browserRun || showAlternateLauncher);
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
      if (payload.descriptor) {
        const persisted = persistLearnerStudyRunReplacement(localStorage, payload.descriptor, descriptor);
        if (!persisted.ok) {
          browserRun = persisted.descriptor;
          browserRunState = browserRun ? 'resumable' : 'none';
          runMessage = browserRun
            ? 'Study could not save the updated session. Your previous session is still available. Check browser storage permissions and try again.'
            : 'Study session could not be saved in this browser. Check browser storage permissions and try again.';
          if (payload.status === 'review' && payload.reviewId) {
            await goto(`/study/${payload.reviewId}`);
          }
          return;
        }
        browserRun = persisted.descriptor;
      }
      if (payload.status === 'review' && payload.reviewId) {
        await goto(`/study/${payload.reviewId}`);
        return;
      }
      if (payload.status === 'resume' && payload.reviewId) {
        runMessage = payload.message ?? 'Resume the active Review before continuing this session.';
        return;
      }
      if (payload.status === 'waiting') {
        runMessage = `No new Case can be added yet. The next repeat needed for this session is ready at ${new Date(payload.nextRepeatDueAt).toLocaleTimeString()}.`;
        return;
      }
      if (payload.status === 'new-limit-reached') {
        runMessage = `The safety limit of ${payload.limit} consecutive New completions was reached. Start a new Scheduled Study session to continue.`;
        return;
      }
      if (payload.status === 'complete') {
        runMessage = 'This Study session is complete. Start another session when you are ready.';
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
    runMessage = 'Planning your Study session…';

    return async ({ result, update }) => {
      try {
        if (result.type !== 'success') {
          await update({ invalidateAll: true });
          return;
        }

        const descriptor = result.data?.descriptor;
        if (!descriptor) {
          runMessage = 'Study planning finished without a session to open.';
          return;
        }

        const persisted = persistLearnerStudyRunReplacement(localStorage, descriptor, browserRun);
        if (!persisted.ok) {
          browserRun = persisted.descriptor;
          browserRunState = browserRun ? 'resumable' : 'none';
          runMessage = browserRun
            ? 'Study could not save the replacement session. Your previous session is still available. Check browser storage permissions and try again.'
            : 'Study session could not be saved in this browser. Check browser storage permissions and try again.';
          return;
        }
        const plannedRun = persisted.descriptor;
        browserRun = plannedRun;
        browserRunState = 'resumable';
        showAlternateLauncher = false;
        runMessage = 'Study session planned. Opening the first Review…';
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
        Choose one or more Systems, optionally narrow each System by Topic or curated Tag, then start one combined Scheduled or Free Study session.
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
          {data.activeReview.contentMode === 'expanded' ? 'Expanded Learning · more relevant questions' : 'Original questions · curated for this Case'} · {data.activeReview.revealed ? 'Answers revealed' : 'Review in progress'}
        </p>
      </div>
      <div class="active-actions">
        <a class="button primary" href={`/study/${data.activeReview.id}`}>Resume Review →</a>
        <form method="POST" action="?/discard" onsubmit={(event) => { if (!window.confirm('Discard this active Review? Your learning progress will not be reset.')) event.preventDefault(); }}>
          <input type="hidden" name="reviewId" value={data.activeReview.id} />
          <button class="button danger" type="submit">Discard Review</button>
        </form>
      </div>
    </section>
  {/if}

  {#if deletionBlocked}
    <section class="deletion-card" aria-labelledby="study-data-deletion-title">
      <div>
        <p class="eyebrow">Manage study data</p>
        <h2 id="study-data-deletion-title">Deletion in progress</h2>
        <p class="muted">
          Your study data is being removed in several safe steps. Your account, sign-in, and preferences remain available, but Study is temporarily unavailable until removal finishes.
        </p>
      </div>
      <a class="button danger" href="/study/settings/data">Continue deletion</a>
      <small>We’ll confirm when all study data has been removed.</small>
    </section>
  {/if}

  {#if !data.activeReview && !deletionBlocked && browserRunState === 'unknown'}
    <section class="ownership-card" aria-live="polite">
      <div>
        <p class="eyebrow">Current Study state</p>
        <h2>Checking for an existing Study session…</h2>
        <p class="muted">Restoring your previous Study session before showing the launcher.</p>
      </div>
    </section>
  {/if}

  {#if !data.activeReview && !deletionBlocked && browserRunState !== 'unknown' && browserRun && summary}
    <section class="run-card" aria-label="Study session">
      <div>
      <p class="eyebrow">Continue your Study session</p>
        <h2>{summary.mode}</h2>
        {#if browserRun.kind === 'scheduled'}
          <div class="metrics">
            <span><strong>{summary.completed}</strong> / {summary.target} distinct Cases</span>
            <span><strong>{summary.due}</strong> Due</span>
            <span><strong>{summary.newCount}</strong> New</span>
            <span><strong>{summary.repeats}</strong> Repeats</span>
          </div>
        {:else}
          <div class="metrics">
            <span><strong>{summary.remaining}</strong> of {summary.total} distinct Cases left</span>
          </div>
        {/if}
        <p class="muted">Session size: {summary.allAvailable ? 'All available' : summary.total ?? summary.target} Cases.</p>
      </div>
      <div class="run-actions">
        <button class="button primary" type="button" onclick={continueRun} disabled={opening || planning || Boolean(data.activeReview)}>
          {opening ? 'Opening…' : 'Continue session →'}
        </button>
        <button class="button" type="button" onclick={openAlternateLauncher} disabled={opening || planning || showAlternateLauncher}>
          Start a different session
        </button>
        <button class="button danger" type="button" onclick={clearBrowserRun}>Clear saved session</button>
      </div>
    </section>
  {/if}

  {#if runMessage || form?.message}
    <p class="status-message" role="status">{runMessage || form?.message}</p>
  {/if}

  {#if canShowNewRunLauncher()}
  <section class="chooser-heading">
    <div>
      <p class="eyebrow">{browserRun ? 'Alternate launcher' : 'Start a study session'}</p>
      <h2>{browserRun ? 'Start a different Study session' : 'Choose Systems and scope'}</h2>
    </div>
    <div class="chooser-heading-actions">
      <p class="muted">Selecting a System means all eligible content in that System unless you explicitly narrow it.</p>
      {#if browserRun}
        <button class="button" type="button" onclick={closeAlternateLauncher}>Cancel</button>
      {/if}
    </div>
  </section>

  <form
    bind:this={planForm}
    method="POST"
    action="?/plan"
    use:enhance={startPlannedRun}
    class="multi-plan-form"
  >
    <div class="system-grid">
      {#each studySystems as system}
        <section class="system-card">
          {#if systemSelected(system.id)}
            <input type="hidden" name="system" value={system.id} />
            {#if routesAreSubmitted(system.id)}
              <input type="hidden" name={`narrow:${system.id}`} value="on" />
              {#each appliedRoutesForSystem(system.id) as route}
                <input type="hidden" name={`route:${system.id}`} value={route} />
              {/each}
            {/if}
          {/if}
          <label class="system-select">
            <input
              type="checkbox"
              value={system.id}
              checked={systemSelected(system.id)}
              onchange={(event) => setSystemSelected(system.id, eventChecked(event))}
            />
            <span>
              <strong>{system.name}</strong>
              <small>{systemNarrowed(system.id) ? 'Specific Topics / Tags applied' : `${system.allCaseCount} eligible ${system.allCaseCount === 1 ? 'Case' : 'Cases'} in Whole System`}</small>
            </span>
          </label>

          {#if systemSelected(system.id)}
          <details
            class="scope-details"
            open={customizingSystemId === system.id}
            ontoggle={(event) => toggleCustomizer(system.id, event)}
          >
            <summary bind:this={customizerTriggers[system.id]}>{systemNarrowed(system.id) ? 'Edit Topics / Tags' : 'Customize'}</summary>
            <p class="field-help">Choose the whole System or apply specific Topics / Tags. Changes take effect when you choose Apply.</p>

            <fieldset class="scope-mode">
              <legend>Scope</legend>
              <label class="scope-mode-option">
                <input type="radio" name={`draftScope:${system.id}`} value="all" checked={draftScopeMode(system.id) === 'all'} onchange={() => setDraftScopeMode(system.id, 'all')} />
                <span><strong>Whole System</strong><small>All eligible Cases in {system.name}.</small></span>
              </label>
              <label class="scope-mode-option">
                <input type="radio" name={`draftScope:${system.id}`} value="routes" checked={draftScopeMode(system.id) === 'routes'} onchange={() => setDraftScopeMode(system.id, 'routes')} />
                <span><strong>Specific Topics / Tags</strong><small>Use only the applied exact-Topic and curated Tag routes below.</small></span>
              </label>
            </fieldset>

            {#if draftScopeMode(system.id) === 'routes'}

            <fieldset class="route-set topic-set">
              <legend>Topics</legend>
                <div class="group-toolbar">
                <p class="field-help">Choose Topics directly. Parent Topics select their subtopics without adding the parent itself.</p>
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
                    value={value}
                    checked={topicChecked(system, topic)}
                    disabled={draftScopeMode(system.id) !== 'routes'}
                    aria-controls={descendants.length > 0 ? descendants.map((id) => `study-${system.id}-topic-${id}`).join(' ') : undefined}
                    use:indeterminate={topicIndeterminate(system, topic)}
                    onchange={(event) => toggleTopicSubtree(system, topic, eventChecked(event))}
                  />
                  <span>
                    <strong>{topic.name}</strong>
                    {#if Number(topic.caseCount) > 0}
                    <small>{topic.caseCount} {topic.caseCount === 1 ? 'Case' : 'Cases'} in this Topic{#if topic.breadcrumb.length > 1} · {breadcrumbText}{/if}</small>
                  {:else}
                      <small>Topic group · {topic.subtreeCaseCount} {topic.subtreeCaseCount === 1 ? 'Case' : 'Cases'} in subtopics{#if topic.breadcrumb.length > 1} · {breadcrumbText}{/if}</small>
                    {/if}
                  </span>
                </label>
              {/each}
            </fieldset>

            {#if system.tags.length > 0}
              <fieldset class="route-set tag-set">
                <legend>Curated Tags</legend>
                <div class="group-toolbar">
                  <p class="field-help">Tags can add relevant Cases across Topics, including Cases from Topics you unchecked.</p>
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
                      value={value}
                      checked={isRouteSelected(system.id, value)}
                      disabled={draftScopeMode(system.id) !== 'routes'}
                      onchange={(event) => setRoutes(system.id, [value], eventChecked(event))}
                    />
                    <span><strong>{tag.name}</strong><small>Curated Tag · {tag.caseCount} {tag.caseCount === 1 ? 'Case' : 'Cases'}</small></span>
                  </label>
                {/each}
              </fieldset>
            {/if}
            {/if}

            {#if customizationMessage && customizingSystemId === system.id}
              <p class="form-error" role="alert">{customizationMessage}</p>
            {/if}
            <div class="scope-actions">
              <button class="button" type="button" onclick={() => cancelCustomize(system.id)}>Cancel</button>
              <button class="button primary" type="button" onclick={() => applyCustomize(system)}>Apply</button>
            </div>
          </details>
          {/if}
        </section>
      {/each}
    </div>

    <section class="run-options-card">
      <fieldset class="mode-set">
        <legend>Study mode</legend>
        <label class="mode-option">
          <input type="radio" name="studyMode" value="scheduled" checked={selectedMode('scheduled')} />
          <span><strong>Scheduled Study</strong><small>Work through Cases in the order they are due and ready to learn.</small></span>
        </label>
        <label class="mode-option">
          <input type="radio" name="studyMode" value="free" checked={selectedMode('free')} />
          <span><strong>Free Study</strong><small>Choose from eligible Cases in a shuffled order.</small></span>
        </label>
      </fieldset>

      <fieldset class="size-set">
        <legend>Session size</legend>
        <label class="size-option"><input type="radio" name="runSize" value="5" checked={selectedRunSize('5')} /><span>5</span></label>
        <label class="size-option"><input type="radio" name="runSize" value="10" checked={selectedRunSize('10')} /><span>10</span></label>
        <label class="size-option"><input type="radio" name="runSize" value="20" checked={selectedRunSize('20')} /><span>20</span></label>
        <label class="size-option"><input type="radio" name="runSize" value="all" checked={selectedRunSize('all')} /><span>All available</span></label>
        <p class="field-help">Choose how many Cases to include. Default is 10. Scheduled repeats are added as needed.</p>
      </fieldset>

      <div class="combined-count" aria-live="polite">
        <div>
          <p class="eyebrow">Your selection</p>
          <strong>{eligibleCount == null ? '—' : eligibleCount} eligible {eligibleCount === 1 ? 'Case' : 'Cases'}</strong>
        </div>
        <div class="count-detail">
          <span>{selectedSystemCount} {selectedSystemCount === 1 ? 'System' : 'Systems'} selected</span>
          <small class="muted">{counting ? 'Updating the count…' : countMessage}</small>
        </div>
      </div>
    </section>

    {#if form?.message}<p class="form-error" role="alert">{form.message}</p>{/if}
    <div class="start-row">
      <p class="muted">Your selected Systems and routes are checked again before the session starts.</p>
      <button class="button primary" type="submit" disabled={Boolean(data.activeReview) || deletionBlocked || planning || opening || !hasAppliedSystemSelection()}>
        {planning ? 'Starting…' : 'Start Study'}
      </button>
    </div>
  </form>
  {/if}

  {#if !deletionBlocked}
    <LearnerFsrsProgressSummary progress={data.progressSummary} />
    <nav class="secondary-links" aria-label="Study details and settings">
      <a href="/study/progress">Progress <span aria-hidden="true">→</span><small>View detailed history and scheduling</small></a>
      <a href="/study/settings">Study settings <span aria-hidden="true">→</span><small>Expanded Learning: {data.preferences.expandedLearning ? 'On' : 'Off'}</small></a>
      <a href="/study/settings/data">Manage Study data <span aria-hidden="true">→</span><small>Reset, fresh start, or delete</small></a>
    </nav>
  {:else}
    <nav class="secondary-links deletion-links" aria-label="Study settings during deletion">
      <a href="/study/settings">Study settings <span aria-hidden="true">→</span><small>Expanded Learning remains available during deletion</small></a>
    </nav>
  {/if}
</main>

<style>
  .study-shell { display:grid; gap:1.5rem; max-width:1100px; }
  .study-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1.5rem; }
  .study-header h1,.chooser-heading h2,.active-card h2,.run-card h2,.deletion-card h2,.ownership-card h2 { margin:.2rem 0 0; }
  .intro { max-width:760px; margin-bottom:0; line-height:1.6; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .account-actions,.active-actions,.run-actions { display:flex; align-items:center; justify-content:flex-end; gap:.65rem; flex-wrap:wrap; }
  .active-card,.run-card,.run-options-card,.deletion-card,.ownership-card { display:flex; justify-content:space-between; gap:1rem; align-items:center; padding:1.1rem 1.2rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .active-card p,.run-card p { margin:.35rem 0 0; }
  .deletion-card { border-color:#f2c7c2; background:#fff9f8; }
  .deletion-card > div { max-width:720px; }
  .deletion-card p { margin:.35rem 0 0; line-height:1.5; }
  .deletion-card small { color:#667085; line-height:1.4; }
  .metrics { display:flex; gap:.55rem; flex-wrap:wrap; margin-top:.75rem; }
  .metrics span { padding:.4rem .6rem; border-radius:999px; background:#eef2f6; color:#475467; font-size:.85rem; }
  .ownership-card { border-style:dashed; background:#f8fafc; }
  .status-message { margin:0; padding:.8rem 1rem; border-radius:10px; background:#f8fafc; color:#344054; }
  .chooser-heading { display:flex; align-items:end; justify-content:space-between; gap:1rem; }
  .chooser-heading-actions { display:flex; align-items:end; justify-content:flex-end; gap:.75rem; }
  .chooser-heading-actions p { max-width:520px; margin:0; text-align:right; }
  .secondary-links { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.7rem; }
  .secondary-links a { display:grid; gap:.25rem; padding:.85rem 1rem; border:1px solid #dfe5ee; border-radius:12px; color:#344054; text-decoration:none; background:#fff; }
  .secondary-links a:hover,.secondary-links a:focus-visible { border-color:#98a2b3; background:#f8fafc; }
  .secondary-links small { color:#667085; line-height:1.35; }
  .multi-plan-form { display:grid; gap:1rem; }
  .run-options-card { align-items:stretch; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
  .mode-set,.size-set,.route-set { display:grid; gap:.55rem; margin:0; padding:0; border:0; }
  .mode-set legend,.size-set legend,.route-set legend { margin-bottom:.1rem; color:#344054; font-size:.88rem; font-weight:700; }
  .mode-option,.route-option,.system-select { display:grid; grid-template-columns:auto minmax(0,1fr); gap:.65rem; align-items:start; padding:.72rem; border:1px solid #dfe5ee; border-radius:10px; cursor:pointer; }
  .mode-option:has(input:checked),.route-option:has(input:checked),.system-select:has(input:checked) { border-color:#667085; background:#f2f4f7; box-shadow:0 0 0 1px #d0d5dd inset; }
  .size-set { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .size-set legend,.size-set .field-help { grid-column:1 / -1; }
  .size-option { display:flex; gap:.4rem; align-items:center; justify-content:center; padding:.6rem .45rem; border:1px solid #dfe5ee; border-radius:10px; cursor:pointer; font-weight:700; text-align:center; }
  .size-option:has(input:checked) { border-color:#667085; background:#f2f4f7; box-shadow:0 0 0 1px #d0d5dd inset; }
  .combined-count { grid-column:1 / -1; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.9rem 1rem; border-radius:12px; background:#f8fafc; }
  .combined-count strong { display:block; margin-top:.2rem; font-size:1.05rem; }
  .count-detail { display:grid; justify-items:end; gap:.15rem; font-size:.88rem; text-align:right; }
  .system-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
  .system-card { display:grid; gap:.8rem; align-content:start; padding:1rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .system-card:has(.system-select input:checked) { border-color:#667085; background:#fbfcfe; box-shadow:0 0 0 2px #e4e7ec inset; }
  .system-select { border:0; padding:.25rem; }
  .system-select span,.mode-option span,.route-option span { display:grid; gap:.18rem; }
  .system-select small,.mode-option small,.route-option small { color:#667085; line-height:1.4; }
  .scope-details { border-top:1px solid #eef2f6; padding-top:.7rem; }
  .scope-details summary { cursor:pointer; color:#344054; font-weight:700; }
  .scope-details > .field-help { margin:.7rem 0; }
  .scope-mode { display:grid; gap:.55rem; margin:.8rem 0 0; padding:0; border:0; }
  .scope-mode legend { margin-bottom:.1rem; color:#344054; font-size:.88rem; font-weight:700; }
  .scope-mode-option { display:grid; grid-template-columns:auto minmax(0,1fr); gap:.65rem; align-items:start; padding:.65rem .72rem; border:1px solid #dfe5ee; border-radius:10px; cursor:pointer; }
  .scope-mode-option:has(input:checked) { border-color:#667085; background:#f2f4f7; box-shadow:0 0 0 1px #d0d5dd inset; }
  .scope-mode-option span { display:grid; gap:.18rem; }
  .scope-mode-option small { color:#667085; line-height:1.4; }
  .scope-actions { display:flex; justify-content:flex-end; gap:.55rem; margin-top:.9rem; }
  .route-option:has(input:disabled) { cursor:default; opacity:.62; }
  .system-select strong,.mode-option strong,.route-option strong,.scope-mode-option strong { overflow-wrap:anywhere; }
  .field-help { margin:0; color:#667085; font-size:.82rem; line-height:1.45; }
  .group-toolbar { display:flex; align-items:flex-start; justify-content:space-between; gap:.75rem; margin-bottom:.1rem; }
  .group-toolbar .field-help { max-width:390px; }
  .group-actions { display:flex; align-items:center; gap:.35rem; flex-wrap:wrap; white-space:nowrap; }
  .group-actions button { padding:0; border:0; background:transparent; color:#475467; font:inherit; font-size:.8rem; text-decoration:underline; cursor:pointer; }
  .route-set + .route-set { margin-top:1rem; padding-top:.85rem; border-top:1px solid #eef2f6; }
  .topic-route { margin-left:calc(var(--topic-depth, 0) * .8rem); }
  .tag-route { border-style:dashed; }
  .mode-option input,.route-option input,.system-select input { margin-top:.18rem; }
  .form-error { margin:0; color:#b42318; font-size:.88rem; }
  .start-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .start-row p { margin:0; max-width:700px; }
  @media (max-width:820px) {
    .study-header,.chooser-heading,.active-card,.run-card,.deletion-card,.ownership-card,.start-row,.combined-count { display:grid; align-items:stretch; }
    .account-actions,.active-actions,.run-actions { justify-content:flex-start; }
    .chooser-heading-actions { display:grid; justify-items:start; }
    .chooser-heading-actions p,.count-detail { text-align:left; justify-items:start; }
    .scope-actions { justify-content:flex-start; }
    .run-options-card,.system-grid,.secondary-links { grid-template-columns:1fr; }
    .group-toolbar { display:grid; }
  }
  @media (max-width:520px) {
    .size-set { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
</style>
