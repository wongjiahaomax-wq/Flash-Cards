<script>
  import AccessibleInfo from '$lib/components/AccessibleInfo.svelte';

  /** @typedef {'classic' | 'compact'} CaseEditorLayout */
  /** @typedef {{ id: string, name: string, role: string, isActive: boolean }} CaseTopic */
  /** @typedef {{ options: unknown[] }} StimulusGroupSummary */
  /** @typedef {{ topics: CaseTopic[], attached: unknown[], stimulusGroups: StimulusGroupSummary[], questions: unknown[] }} NavigationCase */
  /** @typedef {{ fixedImages: number, alternativeImages: number, alternativeSets: number, caseWideQuestions: number, caseSpecificImageQuestions: number, reusableImageQuestionsUsed: number, setWideQuestions: number, allQuestions: number }} FastReviewSummary */
  /** @typedef {{ selectedCase: NavigationCase, primaryTopic?: CaseTopic | null, editorLayout: CaseEditorLayout, fastReviewSummary: FastReviewSummary, auditCount: number, onlayoutchange: (layout: CaseEditorLayout) => void }} NavigationProps */
  /** @type {NavigationProps} */
  let { selectedCase, primaryTopic, editorLayout, fastReviewSummary, auditCount, onlayoutchange } = $props();
</script>

<div class="layout-preference">
  <fieldset class="layout-selector">
    <legend>Layout</legend>
    <label class:selected={editorLayout === 'classic'}><input type="radio" name="case_editor_layout" value="classic" checked={editorLayout === 'classic'} onchange={() => onlayoutchange('classic')} /> Classic</label>
    <label class:selected={editorLayout === 'compact'}><input type="radio" name="case_editor_layout" value="compact" checked={editorLayout === 'compact'} onchange={() => onlayoutchange('compact')} /> Compact</label>
  </fieldset>
</div>

{#if editorLayout === 'compact'}
  <section class="fast-review-summary" aria-label="Case completeness summary">
    <div class="fast-topic-context">
      {#if primaryTopic}<a class="topic-pill" href={'/admin/topics/' + primaryTopic.id}>{primaryTopic.name}<span>PRIMARY</span></a>{/if}
      {#each selectedCase.topics.filter((topic) => topic.role === 'secondary' && topic.isActive) as topic}<a class="topic-pill secondary" href={'/admin/topics/' + topic.id}>{topic.name}<span>STUDY TOPIC</span></a>{/each}
    </div>
    <div class="fast-counts">
      <span><strong>{fastReviewSummary.fixedImages}</strong> fixed {fastReviewSummary.fixedImages === 1 ? 'image' : 'images'}</span>
      <span><strong>{fastReviewSummary.alternativeImages}</strong> alternatives in {fastReviewSummary.alternativeSets} {fastReviewSummary.alternativeSets === 1 ? 'set' : 'sets'}</span>
      <span><strong>{fastReviewSummary.caseWideQuestions}</strong> Case-wide</span>
      <span><strong>{fastReviewSummary.caseSpecificImageQuestions}</strong> image-specific</span>
      <span><strong>{fastReviewSummary.reusableImageQuestionsUsed}</strong> reusable used</span>
      <span><strong>{fastReviewSummary.setWideQuestions}</strong> set-wide</span>
      <a href="#all-questions"><strong>{fastReviewSummary.allQuestions}</strong> total Case questions</a>
    </div>
  </section>
  <div class="compact-authoring-rule"><strong>Question scope</strong><AccessibleInfo label="question scope" text="Case-wide questions apply to the whole presentation. Case-specific Image Questions belong to this Case plus one exact stimulus. Reusable Image Questions belong to the exact Asset and require explicit opt-in. Set-wide questions apply to every option in one Alternative Set." /></div>
{:else}
  <div class="authoring-rule"><strong>Authoring rule:</strong> choose where the question applies. Case-wide questions belong to the clinical presentation; Case-specific Image Questions belong only to this Case + image context; Reusable Image Questions belong to the exact Asset and require explicit Case opt-in.</div>
{/if}

<nav class="section-nav" aria-label="Case editor sections">
  <a href="#topics">Topics <span>{selectedCase.topics.length}</span></a><a href="#case">Case</a><a href="#images">Images <span>{selectedCase.attached.length + selectedCase.stimulusGroups.reduce((count, group) => count + group.options.length, 0)}</span></a><a href="#questions">Case questions <span>{selectedCase.questions.length}</span></a>{#if editorLayout === 'compact'}<a href="#all-questions">All questions <span>{auditCount}</span></a>{/if}<a href="#preview">Preview</a>
</nav>

<style>
  .layout-preference { display: flex; justify-content: flex-end; margin: 0.75rem 0 -0.25rem; }
  .layout-selector { display: flex; align-items: center; gap: 0.3rem; margin: 0; padding: 0; border: 0; color: #667085; font-size: 0.8rem; }
  .layout-selector legend { float: left; margin-right: 0.2rem; padding: 0; font-weight: 650; }
  .layout-selector label { display: flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.5rem; border: 1px solid #dfe5ee; border-radius: 7px; background: #fff; color: #475467; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
  .layout-selector label.selected { border-color: #98a2b3; background: #f2f4f7; color: #172033; }
  .layout-selector input { width: auto; margin: 0; }
  .fast-review-summary { display: grid; gap: 0.65rem; margin-top: 0.8rem; padding: 0.8rem 0; border-bottom: 1px solid #dfe5ee; }
  .fast-topic-context, .fast-counts { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; }
  .topic-pill { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.32rem 0.5rem; border: 1px solid #d0d5dd; border-radius: 999px; color: #344054; text-decoration: none; font-size: 0.8rem; font-weight: 650; }
  .topic-pill span { color: #667085; font-size: 0.62rem; letter-spacing: 0.05em; } .topic-pill.secondary { font-weight: 550; }
  .fast-counts span, .fast-counts a { padding-right: 0.65rem; border-right: 1px solid #e4e7ec; color: #667085; font-size: 0.78rem; text-decoration: none; }
  .fast-counts strong { color: #344054; }
  .compact-authoring-rule { display: flex; align-items: center; gap: 0.15rem; margin-top: 0.55rem; color: #667085; font-size: 0.8rem; }
  .authoring-rule { margin: 1rem 0; padding: 0.8rem 0.9rem; border: 1px solid #cfd8e5; border-radius: 8px; background: #f8fafc; color: #344054; line-height: 1.5; }
  .section-nav { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 1.5rem 0 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #dfe5ee; }
  .section-nav a { padding: 0.55rem 0.7rem; border-radius: 6px; color: #344054; font-weight: 650; text-decoration: none; }
  .section-nav a:hover { background: #e9eef5; } .section-nav span { color: #667085; font-size: 0.85rem; font-weight: 500; }
  input:focus-visible, a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (min-width: 1024px) { :global(.case-editor[data-editor-layout="compact"]) .section-nav { position: sticky; top: 0; z-index: 4; margin-top: 1rem; padding: 0.45rem; border: 1px solid #dfe5ee; border-radius: 8px; background: #fff; box-shadow: 0 4px 14px rgb(16 24 40 / 8%); } }
  @media (max-width: 760px) { .layout-preference { justify-content: flex-start; } }
</style>
