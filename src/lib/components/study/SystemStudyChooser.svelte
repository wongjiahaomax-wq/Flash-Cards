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
    studyMode?: string;
  } | null;

  let {
    systems,
    form = null,
    studyMode,
    action = '?/planSystemStudy',
    submitLabel = studyMode === 'scheduled' ? 'Start Scheduled Study →' : 'Start Free Study →'
  }: {
    systems: StudySystem[];
    form?: ActionForm;
    studyMode: 'scheduled' | 'free';
    action?: string;
    submitLabel?: string;
  } = $props();

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
  let suppressFormMessage = $state(false);

  let formApplies = $derived(form?.studyMode === studyMode);
  let formSystemId = $derived(formApplies && typeof form?.systemId === 'string' ? form.systemId : '');
  let formRoutes = $derived(formApplies ? restoredRoutes(form) : []);
  let selectedSystemId = $derived(selectedSystemIdOverride ?? formSystemId);
  let selectedRoutes = $derived(selectedRoutesOverride ?? formRoutes);
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
    suppressFormMessage = true;
  }

  function changeSystem(): void {
    selectedSystemIdOverride = '';
    selectedRoutesOverride = [];
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
    const routes: string[] = [];
    const visit = (currentId: string): void => {
      const current = system.topics.find((topic: StudyTopic) => topic.id === currentId);
      if (current && current.caseCount > 0) routes.push(routeValue('topic', currentId));
      for (const child of system.topics.filter((topic: StudyTopic) => topicParentId(topic) === currentId)) {
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
  <section class="system-stage" aria-labelledby={`${studyMode}-system-stage-heading`}>
    <div class="stage-heading">
      <div>
        <p class="eyebrow">Step 1</p>
        <h2 id={`${studyMode}-system-stage-heading`}>Choose a System</h2>
      </div>
      <p class="muted">Open one System to choose the exact Topics and curated Tags you want to include.</p>
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
  <section class="configuration" aria-labelledby={`${studyMode}-selected-system-heading`}>
    <button class="change-system" type="button" onclick={changeSystem}>← Change System</button>

    <div class="selected-heading">
      <div>
        <p class="eyebrow">Step 2 · Configure {studyMode === 'scheduled' ? 'Scheduled Study' : 'Free Study'}</p>
        <h2 id={`${studyMode}-selected-system-heading`}>{selectedSystem.name}</h2>
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
      <input type="hidden" name="studyMode" value={studyMode} />

      <fieldset class="selection-group topics-group">
        <legend>Topics</legend>
        <div class="group-toolbar">
          <p class="muted">Topic checkboxes use exact Topic membership. Parent controls also toggle visible descendant Topics.</p>
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
                id={`${studyMode}-study-topic-${topic.id}`}
                type="checkbox"
                name={topic.caseCount > 0 ? 'route' : undefined}
                value={value}
                checked={topicChecked(selectedSystem, topic)}
                aria-controls={descendants.length > 0 ? descendants.map((id: string) => `${studyMode}-study-topic-${id}`).join(' ') : undefined}
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

      {#if !suppressFormMessage && formApplies && form?.message && form.systemId === selectedSystem.id}
        <p class="start-error" role="alert">{form.message}</p>
      {/if}

      <div class="start-row">
        {#if selectedCount === 0}<p class="muted zero-note">Select at least one Topic or curated Tag to start.</p>{/if}
        <button class="button primary start-button" type="submit" disabled={selectedCount === 0}>{submitLabel}</button>
      </div>
    </form>
  </section>
{/if}

<style>
  .system-stage,.configuration,.selection-form,.selection-group,.option-list { display:grid; gap:1rem; min-width:0; }
  .stage-heading,.selected-heading,.group-toolbar,.start-row { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
  .stage-heading h2,.selected-heading h2 { margin:.2rem 0 0; }
  .eyebrow { margin:0; color:#667085; font-size:.78rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .system-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.85rem; }
  .system-card { display:grid; gap:.4rem; text-align:left; padding:1rem; border:1px solid #dfe5ee; border-radius:12px; background:#fff; cursor:pointer; }
  .system-card:hover { border-color:#98a2b3; }
  .system-name { font-weight:750; font-size:1.05rem; }
  .system-count,.system-open,.availability,.selection-summary,.zero-note { line-height:1.45; }
  .system-count { color:#667085; }
  .system-open { color:#344054; font-weight:650; }
  .change-system { width:max-content; padding:0; border:0; background:none; color:#475467; cursor:pointer; font-weight:650; }
  .selection-summary { margin:0; padding:.45rem .65rem; border-radius:999px; background:#f2f4f7; color:#344054; font-size:.85rem; white-space:nowrap; }
  .selection-summary.custom-selection { background:#fffaeb; }
  .selection-group { margin:0; padding:1rem; border:1px solid #e4e7ec; border-radius:12px; }
  .selection-group legend { padding:0 .25rem; font-weight:750; }
  .group-toolbar p { margin:0; max-width:680px; }
  .group-actions { display:flex; gap:.4rem; white-space:nowrap; }
  .group-actions button { padding:0; border:0; background:none; color:#475467; cursor:pointer; text-decoration:underline; }
  .study-option { display:grid; grid-template-columns:auto minmax(0,1fr); gap:.7rem; align-items:start; padding:.75rem; border:1px solid #e4e7ec; border-radius:10px; }
  .study-option:has(input:checked) { border-color:#98a2b3; background:#f8fafc; }
  .topic-option { margin-left:calc(var(--topic-depth) * 1rem); }
  .tag-option { border-style:dashed; }
  .study-option input { margin-top:.2rem; }
  .option-copy { display:grid; gap:.2rem; min-width:0; }
  .option-copy small { color:#667085; line-height:1.4; overflow-wrap:anywhere; }
  .start-error { margin:0; color:#b42318; }
  .start-row { align-items:center; }
  .zero-note { margin:0; }
  @media (max-width:760px) {
    .system-grid { grid-template-columns:1fr; }
    .stage-heading,.selected-heading,.group-toolbar,.start-row { display:grid; }
    .selection-summary { width:max-content; max-width:100%; white-space:normal; }
    .topic-option { margin-left:calc(var(--topic-depth) * .55rem); }
  }
</style>
