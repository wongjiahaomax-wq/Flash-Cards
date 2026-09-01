<script lang="ts">
  type BreadcrumbItem = {
    id: string;
    name: string;
    kind?: string;
  };

  type StudyTopic = {
    id: string;
    name: string;
    caseCount: number;
    subtreeCaseCount: number;
    breadcrumb: BreadcrumbItem[];
  };

  type StudyTag = {
    id: string;
    name: string;
    caseCount: number;
    displayOrder?: number;
  };

  type StudySystem = {
    id: string;
    name: string;
    allCaseCount: number;
    topics: StudyTopic[];
    tags: StudyTag[];
  };

  type ActionForm = {
    message?: string;
    systemId?: string;
    selectedRoutes?: unknown[];
    questionPoolMode?: string;
  } | null;

  type QuestionPoolMode = 'core' | 'expanded';

  let {
    systems,
    form = null,
    action = '?/startSystemSelection'
  }: { systems: StudySystem[]; form?: ActionForm; action?: string } = $props();

  function canonicalRouteValue(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const separator = value.indexOf(':');
    if (separator < 1) return null;
    const routeType = value.slice(0, separator).trim();
    const routeId = value.slice(separator + 1).trim();
    if ((routeType !== 'topic' && routeType !== 'tag') || !routeId) return null;
    return `${routeType}:${routeId}`;
  }

  function restoredRoutes(actionForm: ActionForm): string[] {
    if (!Array.isArray(actionForm?.selectedRoutes)) return [];
    return [...new Set(
      actionForm.selectedRoutes
        .map(canonicalRouteValue)
        .filter((value): value is string => value !== null)
    )];
  }

  let selectedSystemIdOverride = $state<string | null>(null);
  let selectedRoutesOverride = $state<string[] | null>(null);
  let questionPoolModeOverride = $state<QuestionPoolMode | null>(null);
  let suppressFormMessage = $state(false);

  let formSystemId = $derived(typeof form?.systemId === 'string' ? form.systemId : '');
  let formRoutes = $derived(restoredRoutes(form));
  let formQuestionPoolMode = $derived<QuestionPoolMode>(form?.questionPoolMode === 'expanded' ? 'expanded' : 'core');
  let selectedSystemId = $derived(selectedSystemIdOverride ?? formSystemId);
  let selectedRoutes = $derived(selectedRoutesOverride ?? formRoutes);
  let questionPoolMode = $derived(questionPoolModeOverride ?? formQuestionPoolMode);
  let selectedSystem = $derived(systems.find((system: StudySystem) => system.id === selectedSystemId) ?? null);
  let contributingRoutes = $derived(selectedSystem ? routesForSystem(selectedSystem) : []);
  let selectedCount = $derived(selectedRoutes.filter((value: string) => contributingRoutes.includes(value)).length);
  let totalRouteCount = $derived(contributingRoutes.length);
  let allSelected = $derived(totalRouteCount > 0 && selectedCount === totalRouteCount);

  function routeValue(routeType: 'topic' | 'tag', routeId: string): string {
    return `${routeType}:${routeId}`;
  }

  function routesForSystem(system: StudySystem): string[] {
    return [
      ...system.topics
        .filter((topic: StudyTopic) => topic.caseCount > 0)
        .map((topic: StudyTopic) => routeValue('topic', topic.id)),
      ...system.tags.map((tag: StudyTag) => routeValue('tag', tag.id))
    ];
  }

  function chooseSystem(system: StudySystem): void {
    selectedSystemIdOverride = system.id;
    selectedRoutesOverride = routesForSystem(system);
    questionPoolModeOverride = 'core';
    suppressFormMessage = true;
  }

  function changeSystem(): void {
    selectedSystemIdOverride = '';
    selectedRoutesOverride = [];
    questionPoolModeOverride = 'core';
    suppressFormMessage = true;
  }

  function chooseQuestionPoolMode(mode: QuestionPoolMode): void {
    questionPoolModeOverride = mode;
    suppressFormMessage = true;
  }

  function isRouteSelected(value: string): boolean {
    return selectedRoutes.includes(value);
  }

  function setRoutes(values: string[], checked: boolean): void {
    const affected = new Set(values);
    selectedRoutesOverride = checked
      ? [...new Set([...selectedRoutes, ...values])]
      : selectedRoutes.filter((value: string) => !affected.has(value));
    suppressFormMessage = true;
  }

  function topicParentId(topic: StudyTopic): string | null {
    const breadcrumb = topic.breadcrumb;
    return breadcrumb.length >= 2 ? breadcrumb[breadcrumb.length - 2]?.id ?? null : null;
  }

  function topicDepth(topic: StudyTopic): number {
    return Math.max(0, topic.breadcrumb.length - 2);
  }

  function orderedTopics(system: StudySystem): StudyTopic[] {
    const topics = [...system.topics];
    const topicIds = new Set(topics.map((topic: StudyTopic) => topic.id));
    const children = new Map<string | null, StudyTopic[]>();
    for (const topic of topics) {
      const parentId = topicParentId(topic);
      const key = parentId && topicIds.has(parentId) ? parentId : null;
      const siblings = children.get(key) ?? [];
      siblings.push(topic);
      children.set(key, siblings);
    }
    for (const siblings of children.values()) {
      siblings.sort((left: StudyTopic, right: StudyTopic) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      );
    }
    const ordered: StudyTopic[] = [];
    const visit = (parentId: string | null): void => {
      for (const topic of children.get(parentId) ?? []) {
        ordered.push(topic);
        visit(topic.id);
      }
    };
    visit(null);
    return ordered;
  }

  function topicDescendantIds(system: StudySystem, topicId: string): string[] {
    const ids: string[] = [];
    const visit = (currentId: string): void => {
      for (const child of system.topics.filter((topic: StudyTopic) => topicParentId(topic) === currentId)) {
        ids.push(child.id);
        visit(child.id);
      }
    };
    visit(topicId);
    return ids;
  }

  function topicSubtreeRoutes(system: StudySystem, topicId: string): string[] {
    const topics = system.topics;
    const routes: string[] = [];
    const visit = (currentId: string): void => {
      const current = topics.find((topic: StudyTopic) => topic.id === currentId);
      if (current && current.caseCount > 0) routes.push(routeValue('topic', currentId));
      for (const child of topics.filter((topic: StudyTopic) => topicParentId(topic) === currentId)) {
        visit(child.id);
      }
    };
    visit(topicId);
    return routes;
  }

  function topicChecked(system: StudySystem, topic: StudyTopic): boolean {
    if (topic.caseCount > 0) return isRouteSelected(routeValue('topic', topic.id));
    const subtree = topicSubtreeRoutes(system, topic.id);
    return subtree.length > 0 && subtree.every(isRouteSelected);
  }

  function topicIndeterminate(system: StudySystem, topic: StudyTopic): boolean {
    const subtree = topicSubtreeRoutes(system, topic.id);
    if (subtree.length < 2) return false;
    const count = subtree.filter(isRouteSelected).length;
    return count > 0 && count < subtree.length;
  }

  function indeterminate(node: HTMLInputElement, value: boolean) {
    node.indeterminate = Boolean(value);
    return {
      update(next: boolean) {
        node.indeterminate = Boolean(next);
      }
    };
  }

  function eventChecked(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).checked;
  }

  function toggleTopicSubtree(system: StudySystem, topic: StudyTopic, checked: boolean): void {
    setRoutes(topicSubtreeRoutes(system, topic.id), checked);
  }

  function toggleGroup(system: StudySystem, routeType: 'topic' | 'tag', checked: boolean): void {
    const values = routeType === 'topic'
      ? system.topics
        .filter((topic: StudyTopic) => topic.caseCount > 0)
        .map((topic: StudyTopic) => routeValue('topic', topic.id))
      : system.tags.map((tag: StudyTag) => routeValue('tag', tag.id));
    setRoutes(values, checked);
  }
</script>

{#if !selectedSystem}
  <section class="system-stage" aria-labelledby="system-stage-heading">
    <div class="stage-heading">
      <div>
        <p class="eyebrow">Step 1</p>
        <h2 id="system-stage-heading">Choose a System</h2>
      </div>
      <p class="muted">Open one System to choose the Topics and curated Tags you want to include.</p>
    </div>

    {#if systems.length > 0}
      <div class="system-grid">
        {#each systems as system}
          <button class="system-card" type="button" onclick={() => chooseSystem(system)}>
            <span class="system-name">{system.name}</span>
            <span class="system-count">{system.allCaseCount} eligible unique {system.allCaseCount === 1 ? 'Case' : 'Cases'}</span>
            <span class="system-open">Configure study →</span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="empty-state muted">No Systems currently have eligible study Cases.</p>
    {/if}
  </section>
{:else}
  <section class="configuration" aria-labelledby="selected-system-heading">
    <button class="change-system" type="button" onclick={changeSystem}>← Change System</button>

    <div class="selected-heading">
      <div>
        <p class="eyebrow">Step 2 · Configure study</p>
        <h2 id="selected-system-heading">{selectedSystem.name}</h2>
        <p class="muted availability">{selectedSystem.allCaseCount} eligible unique {selectedSystem.allCaseCount === 1 ? 'Case' : 'Cases'} when all available study areas are selected.</p>
      </div>
      <p class:custom-selection={!allSelected} class="selection-summary" aria-live="polite">
        {#if allSelected}
          All available study areas selected
        {:else}
          Custom selection · {selectedCount} of {totalRouteCount} study areas selected
        {/if}
      </p>
    </div>

    <form method="POST" action={action} class="selection-form">
      <input type="hidden" name="systemId" value={selectedSystem.id} />

      <fieldset class="selection-group topics-group">
        <legend>Topics</legend>
        <div class="group-toolbar">
          <p class="muted">Topic checkboxes use exact Topic membership. Parent controls also toggle the visible descendant Topics.</p>
          <div class="group-actions" aria-label="Topic selection controls">
            <button type="button" onclick={() => toggleGroup(selectedSystem, 'topic', true)}>Select all</button>
            <span aria-hidden="true">·</span>
            <button type="button" onclick={() => toggleGroup(selectedSystem, 'topic', false)}>Clear all</button>
          </div>
        </div>

        <div class="option-list topic-list">
          {#each orderedTopics(selectedSystem) as topic}
            {@const value = routeValue('topic', topic.id)}
            {@const breadcrumbText = topic.breadcrumb.map((item: BreadcrumbItem) => item.name).join(' → ')}
            {@const descendants = topicDescendantIds(selectedSystem, topic.id)}
            <label class="study-option topic-option" style={`--topic-depth:${topicDepth(topic)}`}>
              <input
                id={'study-topic-' + topic.id}
                type="checkbox"
                name={topic.caseCount > 0 ? 'route' : undefined}
                value={value}
                checked={topicChecked(selectedSystem, topic)}
                aria-controls={descendants.length > 0 ? descendants.map((id: string) => 'study-topic-' + id).join(' ') : undefined}
                use:indeterminate={topicIndeterminate(selectedSystem, topic)}
                onchange={(event) => toggleTopicSubtree(selectedSystem, topic, eventChecked(event))}
              />
              <span class="option-copy">
                <strong>{topic.name}</strong>
                {#if topic.caseCount > 0}
                  <small>{topic.caseCount} exact-Topic {topic.caseCount === 1 ? 'Case' : 'Cases'}{#if topic.breadcrumb.length > 2} · {breadcrumbText}{/if}</small>
                {:else}
                  <small>0 exact-Topic Cases · {topic.subtreeCaseCount} {topic.subtreeCaseCount === 1 ? 'Case' : 'Cases'} in descendant Topics{#if topic.breadcrumb.length > 2} · {breadcrumbText}{/if}</small>
                {/if}
              </span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#if selectedSystem.tags.length > 0}
        <fieldset class="selection-group tag-group">
          <legend>Curated Tags</legend>
          <div class="group-toolbar">
            <p class="muted">Curated Tags can add relevant Cases across Topics, including Cases from Topics you unchecked.</p>
            <div class="group-actions" aria-label="Curated Tag selection controls">
              <button type="button" onclick={() => toggleGroup(selectedSystem, 'tag', true)}>Select all</button>
              <span aria-hidden="true">·</span>
              <button type="button" onclick={() => toggleGroup(selectedSystem, 'tag', false)}>Clear all</button>
            </div>
          </div>

          <div class="option-list tag-list">
            {#each selectedSystem.tags as tag}
              {@const value = routeValue('tag', tag.id)}
              <label class="study-option tag-option">
                <input
                  type="checkbox"
                  name="route"
                  value={value}
                  checked={isRouteSelected(value)}
                  onchange={(event) => setRoutes([value], eventChecked(event))}
                />
                <span class="option-copy">
                  <strong>{tag.name}</strong>
                  <small>{tag.caseCount} matching {tag.caseCount === 1 ? 'Case' : 'Cases'} · curated for {selectedSystem.name}</small>
                </span>
              </label>
            {/each}
          </div>
        </fieldset>
      {/if}

      <fieldset class="selection-group question-group">
        <legend>Question set</legend>
        <div class="question-options">
          <label class="mode-option">
            <input
              type="radio"
              name="questionPoolMode"
              value="core"
              checked={questionPoolMode === 'core'}
              onchange={() => chooseQuestionPoolMode('core')}
            />
            <span><strong>Original questions</strong><small>Questions curated specifically for the selected Case.</small></span>
          </label>
          <label class="mode-option">
            <input
              type="radio"
              name="questionPoolMode"
              value="expanded"
              checked={questionPoolMode === 'expanded'}
              onchange={() => chooseQuestionPoolMode('expanded')}
            />
            <span><strong>Expanded Learning</strong><small>Includes reusable questions relevant to the selected Case.</small></span>
          </label>
        </div>
      </fieldset>

      {#if !suppressFormMessage && form?.message && form.systemId === selectedSystem.id}
        <p class="start-error" role="alert">{form.message}</p>
      {/if}

      <div class="start-row">
        {#if selectedCount === 0}<p class="muted zero-note">Select at least one Topic or curated Tag to start.</p>{/if}
        <button class="button primary start-button" type="submit" disabled={selectedCount === 0}>Start review →</button>
      </div>
    </form>
  </section>
{/if}

<style>
  .system-stage,.configuration { display:grid; gap:1.1rem; min-width:0; }
  .stage-heading,.selected-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; min-width:0; }
  .stage-heading h2,.selected-heading h2 { margin:.2rem 0 0; }
  .stage-heading > p { max-width:560px; margin:0; line-height:1.5; }
  .eyebrow { margin:0; color:#667085; font-size:.78rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .system-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.85rem; }
  .system-card { display:grid; gap:.45rem; min-width:0; min-height:132px; padding:1rem; text-align:left; border:1px solid #dfe5ee; border-radius:14px; background:#fff; color:inherit; cursor:pointer; font:inherit; }
  .system-card:hover,.system-card:focus-visible { border-color:#98a2b3; background:#f8fafc; }
  .system-name { font-size:1.05rem; font-weight:750; overflow-wrap:anywhere; }
  .system-count { color:#667085; line-height:1.4; overflow-wrap:anywhere; }
  .system-open { align-self:end; color:#344054; font-size:.88rem; font-weight:700; }
  .empty-state { margin:0; }
  .change-system { justify-self:start; padding:.35rem 0; border:0; background:transparent; color:#344054; font:inherit; font-weight:700; cursor:pointer; }
  .change-system:hover,.change-system:focus-visible { text-decoration:underline; }
  .selected-heading { padding:1.1rem 1.15rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .availability { max-width:660px; margin:.45rem 0 0; line-height:1.5; }
  .selection-summary { flex:0 0 auto; margin:0; padding:.45rem .65rem; border-radius:999px; background:#eef3f8; color:#344054; font-size:.82rem; font-weight:700; text-align:center; }
  .selection-summary.custom-selection { background:#f2f4f7; }
  .selection-form { display:grid; gap:1rem; min-width:0; }
  .selection-group { display:grid; gap:.75rem; min-width:0; margin:0; padding:1rem 1.05rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .selection-group legend { padding:0 .2rem; color:#344054; font-size:.95rem; font-weight:750; }
  .group-toolbar { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; min-width:0; }
  .group-toolbar p { max-width:700px; margin:0; line-height:1.5; }
  .group-actions { flex:0 0 auto; display:flex; align-items:center; gap:.35rem; white-space:nowrap; }
  .group-actions button { min-height:36px; padding:.3rem .2rem; border:0; background:transparent; color:#344054; font:inherit; font-size:.86rem; font-weight:700; cursor:pointer; }
  .group-actions button:hover,.group-actions button:focus-visible { text-decoration:underline; }
  .option-list,.question-options { display:grid; gap:.5rem; min-width:0; }
  .study-option,.mode-option { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:start; gap:.7rem; min-width:0; min-height:44px; padding:.72rem .8rem; border:1px solid #dfe5ee; border-radius:10px; cursor:pointer; }
  .study-option:has(input:checked),.mode-option:has(input:checked) { border-color:#98a2b3; background:#f8fafc; }
  .study-option input,.mode-option input { margin-top:.18rem; }
  .option-copy,.mode-option span { display:grid; gap:.2rem; min-width:0; }
  .option-copy strong,.option-copy small,.mode-option strong,.mode-option small { overflow-wrap:anywhere; }
  .option-copy small,.mode-option small { color:#667085; line-height:1.4; }
  .topic-option { margin-inline-start:calc(min(var(--topic-depth), 4) * 1.05rem); }
  .tag-group { border-style:dashed; }
  .tag-option { border-style:dashed; }
  .start-error { margin:0; color:#b42318; font-size:.88rem; line-height:1.45; }
  .start-row { display:flex; align-items:center; justify-content:flex-end; gap:1rem; flex-wrap:wrap; }
  .zero-note { margin:0 auto 0 0; }
  .start-button:disabled { cursor:not-allowed; opacity:.55; }
  @media (max-width:900px) { .system-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width:760px) {
    .stage-heading,.selected-heading,.group-toolbar { display:grid; }
    .selection-summary { justify-self:start; white-space:normal; text-align:left; }
    .system-grid { grid-template-columns:1fr; }
    .group-actions { white-space:normal; }
    .topic-option { margin-inline-start:calc(min(var(--topic-depth), 2) * .75rem); }
    .start-row { align-items:stretch; }
    .start-button { width:100%; }
  }
</style>