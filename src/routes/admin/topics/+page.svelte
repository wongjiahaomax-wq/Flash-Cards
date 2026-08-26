<script>
  import TaxonomyWorkspace from '$lib/components/taxonomy-workspace/TaxonomyWorkspace.svelte';

  let { data, form } = $props();
</script>

<svelte:head><title>Systems &amp; Topics | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Learner taxonomy</p>
    <h1>Systems &amp; Topics</h1>
    <p class="muted">Browse the System / Topic hierarchy, create Topics in context, and reveal direct Cases only when you need to curate them.</p>
  </div>
</section>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

{#if data.coverage}
  <section class:ready={data.coverage.readyForLearnerSystemNavigation} class="coverage" aria-label="System navigation coverage">
    <div>
      <strong>Taxonomy coverage</strong>
      <span>{data.coverage.activeSystemCount} Systems · {data.coverage.activeTopicCount} Topics · {data.coverage.activeProductionCaseCount} active production Cases</span>
    </div>
    <div>
      <strong>{data.coverage.readyForLearnerSystemNavigation ? 'Coverage ready' : 'Curation required'}</strong>
      <span>{data.coverage.unassignedTopics.length} unassigned active Topics · {data.coverage.uncoveredCases.length} uncovered active Cases</span>
    </div>
    {#if data.coverage.unassignedTopics.length}
      <details><summary>Unassigned Topics</summary><ul>{#each data.coverage.unassignedTopics as topic}<li><a href={'/admin/topics/' + topic.id}>{topic.name}</a></li>{/each}</ul></details>
    {/if}
    {#if data.coverage.uncoveredCases.length}
      <details><summary>Cases not currently reachable through any System route</summary><ul>{#each data.coverage.uncoveredCases as item}<li><a href={'/admin/cases/' + item.id}>{item.title}</a></li>{/each}</ul></details>
    {/if}
  </section>
{/if}

<TaxonomyWorkspace
  items={data.hierarchyOptions}
  initialSearch={data.filters.search}
  initialSelectedId={data.selectedId}
/>

<style>
  .page-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1,p { margin-top: 0; }
  h1 { margin-bottom: .3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); }
  .eyebrow { margin-bottom: .3rem; color: #667085; font-size: .74rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  .muted { max-width: 58rem; color: #667085; }
  .coverage { display: grid; gap: .75rem; margin: 1rem 0; padding: 1rem; border: 1px solid #fdb022; border-radius: 10px; background: #fffaeb; }
  .coverage.ready { border-color: #6ce9a6; background: #ecfdf3; }
  .coverage > div { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .coverage > div span { color: #667085; }
  .coverage details { color: #344054; }
  .coverage ul { margin: .5rem 0 0; padding-left: 1.2rem; }
  .form-error { margin: 1rem 0; padding: .8rem; border-radius: 8px; background: #fef3f2; color: #b42318; }
</style>
