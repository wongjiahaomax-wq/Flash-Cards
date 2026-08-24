<script>
  import { onMount } from 'svelte';
  import { getCaseEditorStorage, readCaseEditorLayout, writeCaseEditorLayout } from '$lib/admin-case-editor-layout.js';
  import { buildCaseFastReviewSummary, buildCaseQuestionAudit } from '$lib/admin-case-question-audit.js';
  import AdminImageViewer from '$lib/components/AdminImageViewer.svelte';
  import CaseQuestionAudit from '$lib/components/CaseQuestionAudit.svelte';
  import CaseDetailsSection from '$lib/components/case-editor/CaseDetailsSection.svelte';
  import CaseEditorHeader from '$lib/components/case-editor/CaseEditorHeader.svelte';
  import CaseEditorNavigation from '$lib/components/case-editor/CaseEditorNavigation.svelte';
  import CaseImagePickerDialog from '$lib/components/case-editor/CaseImagePickerDialog.svelte';
  import CaseImagesSection from '$lib/components/case-editor/CaseImagesSection.svelte';
  import CasePreviewSection from '$lib/components/case-editor/CasePreviewSection.svelte';
  import CaseQuestionsSection from '$lib/components/case-editor/CaseQuestionsSection.svelte';
  import CaseTopicsSection from '$lib/components/case-editor/CaseTopicsSection.svelte';

  /** @typedef {{ imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, assetId?: string }} ViewableAsset */
  /** @typedef {'classic' | 'compact'} CaseEditorLayout */
  let { data, form } = $props();
  let selectedCase = $derived(data.selectedCase);
  let primaryTopic = $derived(selectedCase?.topics.find((topic) => topic.role === 'primary'));
  let editorBase = $derived(data.previewMode ? '/preview-admin' : '/admin');
  let fastReviewSummary = $derived(buildCaseFastReviewSummary(selectedCase));
  let caseQuestionAudit = $derived(buildCaseQuestionAudit(selectedCase));
  /** @type {CaseEditorLayout} */
  let editorLayout = $state('compact');
  /** @type {{ src: string, alt: string, title: string, subtitle: string } | null} */
  let viewerImage = $state(null);

  onMount(() => {
    editorLayout = readCaseEditorLayout(getCaseEditorStorage(window));
  });

  /** @param {CaseEditorLayout} layout */
  function setEditorLayout(layout) {
    editorLayout = writeCaseEditorLayout(getCaseEditorStorage(window), layout);
  }

  /** @param {ViewableAsset} asset @param {string} [subtitle] */
  function showImage(asset, subtitle = '') {
    if (!asset?.imageUrl) return;
    viewerImage = { src: asset.imageUrl, alt: asset.altText ?? '', title: asset.originalFilename ?? asset.assetId ?? 'Teaching image', subtitle };
  }
</script>

<svelte:head><title>{selectedCase?.case.title ?? 'Case'} | Admin | Flash-Cards</title></svelte:head>

{#if !selectedCase}
  <section class="panel"><h1>Case not found</h1><p class="muted">This Case may be inactive or no longer available.</p><a class="button" href="/admin/cases">Back to Cases</a></section>
{:else}
  <CaseEditorHeader {selectedCase} previewMode={data.previewMode} />

  {#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}
  <div class="case-editor" data-editor-layout={editorLayout}>
    <CaseEditorNavigation {selectedCase} {primaryTopic} {editorLayout} {fastReviewSummary} auditCount={caseQuestionAudit.length} onlayoutchange={setEditorLayout} />
    <CaseTopicsSection {selectedCase} concepts={data.concepts} {primaryTopic} previewMode={data.previewMode} {editorLayout} />
    <CaseDetailsSection {selectedCase} {primaryTopic} {editorLayout} />
    <CaseImagesSection {selectedCase} previewMode={data.previewMode} {editorLayout} {editorBase} onimageopen={showImage} />
    <CaseQuestionsSection {selectedCase} previewMode={data.previewMode} {editorLayout} />
    {#if editorLayout === 'compact'}<CaseQuestionAudit rows={caseQuestionAudit} onimageopen={showImage} />{/if}
    <CasePreviewSection previewMode={data.previewMode} />
  </div>

  <CaseImagePickerDialog {selectedCase} imagePicker={data.imagePicker} {editorBase} />
  <AdminImageViewer image={viewerImage} onclose={() => (viewerImage = null)} />
{/if}

<style>
  h1, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); }
  .muted { color: #667085; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .form-error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #fef3f2; color: #b42318; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
</style>