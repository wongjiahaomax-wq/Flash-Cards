<script>
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { beforeNavigate } from '$app/navigation';
  import { createCaseEditorCoordinator } from '$lib/case-editor-coordinator.js';
  import { captureCaseEditorView, stableCaseEditorEnhance } from '$lib/case-editor-mutation.js';
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
  import StimulusOriginalsPanel from '$lib/components/case-editor/StimulusOriginalsPanel.svelte';

  /** @typedef {{ imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, assetId?: string }} ViewableAsset */
  /** @typedef {'classic' | 'compact'} CaseEditorLayout */
  let { data, form } = $props();
  let selectedCase = $derived(data.selectedCase);
  let primaryTopic = $derived(selectedCase?.topics.find((topic) => topic.role === 'primary'));
  let editorBase = $derived(data.previewMode ? '/preview-admin' : '/admin');
  let studyPreviewHref = $derived.by(() => {
    if (data.previewMode) return null;
    const { learnerStudyPreviewHref = '/study' } = data;
    return learnerStudyPreviewHref;
  });
  let fastReviewSummary = $derived(buildCaseFastReviewSummary(selectedCase));
  let caseQuestionAudit = $derived(buildCaseQuestionAudit(selectedCase));
  /** @type {CaseEditorLayout} */
  let editorLayout = $state('compact');
  /** @type {{ src: string, alt: string, title: string, subtitle: string } | null} */
  let viewerImage = $state(null);
  const draftCoordinator = createCaseEditorCoordinator();
  let draftRevision = $state(0);

  onMount(() => {
    editorLayout = readCaseEditorLayout(getCaseEditorStorage(window));
    const unsubscribe = draftCoordinator.subscribe(() => { draftRevision += 1; });
    /** @param {BeforeUnloadEvent} event */
    const beforeUnload = (event) => {
      if (!hasEditorUnsavedWork()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    /** @param {SubmitEvent} event */
    const submitGuard = (event) => {
      const submittedForm = event.target;
      if (!(submittedForm instanceof HTMLFormElement) || !hasEditorUnsavedWork()) return;
      const otherPartialForm = [...document.querySelectorAll('.case-editor form')].some((form) => form instanceof HTMLFormElement && form !== submittedForm && formHasMeaningfulUnsubmittedInput(form));
      const isDraftableSave = submittedForm.id === 'case-details-form' || submittedForm.classList.contains('question-edit-form');
      const unrelatedDirtyDraft = draftCoordinator.dirtyCount() > 0 && !isDraftableSave;
      if ((otherPartialForm || unrelatedDirtyDraft) && !window.confirm('Another Case-editor form contains unsaved work. Continue and risk discarding it?')) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('submit', submitGuard, true);
    const stableFormActions = [...document.querySelectorAll('.case-editor form[method="POST"]')]
      .filter((form) => {
        if (!(form instanceof HTMLFormElement)) return false;
        if (form.id === 'case-details-form' || form.classList.contains('question-edit-form')) return false;
        const action = form.getAttribute('action') ?? '';
        return (action.startsWith('?/') || action.includes('/cases/')) && !action.includes('/deactivate') && !action.includes('/reorderQuestion');
      })
      .map((form) => enhance(/** @type {HTMLFormElement} */ (form), /** @type {any} */ (() => stableCaseEditorEnhance(captureCaseEditorView()))));
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('submit', submitGuard, true);
      for (const action of stableFormActions) action?.destroy?.();
    };
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

  /** @param {SubmitEvent} event */
  function confirmCaseDeactivation(event) {
    if (!window.confirm('Deactivate this Case? It will be removed from learner study and the active Case library. Its questions, images, Topics, Tags, and review history will be retained so it can be restored later.')) {
      event.preventDefault();
    }
  }

  /** @param {HTMLFormElement} form */
  function formHasMeaningfulUnsubmittedInput(form) {
    if (form.id === 'case-details-form' || form.classList.contains('question-edit-form')) return false;
    return [...form.elements].some((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
      if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
      if (element instanceof HTMLInputElement && element.type === 'file') return Boolean(element.files?.length);
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return element.checked !== element.defaultChecked;
      if (element instanceof HTMLSelectElement) return [...element.options].some((option) => option.selected !== option.defaultSelected);
      return element.value.trim() !== element.defaultValue.trim();
    });
  }

  function hasEditorUnsavedWork() {
    if (draftCoordinator.dirtyCount() > 0) return true;
    return [...document.querySelectorAll('.case-editor form')].some((form) => form instanceof HTMLFormElement && formHasMeaningfulUnsubmittedInput(form));
  }

  beforeNavigate(({ cancel }) => {
    if (hasEditorUnsavedWork() && !window.confirm('You have unsaved Case-editor work. Leave this page and lose it?')) cancel();
  });
</script>

<svelte:head><title>{selectedCase?.case.title ?? 'Case'} | Admin | Flash-Cards</title></svelte:head>

{#if !selectedCase}
  <section class="panel"><h1>Case not found</h1><p class="muted">This Case may be inactive or no longer available.</p><a class="button" href="/admin/cases">Back to Cases</a></section>
{:else}
  <CaseEditorHeader {selectedCase} previewMode={data.previewMode} {studyPreviewHref} caseLibraryReturnQuery={data['caseLibraryReturnQuery']} coordinator={draftCoordinator} {draftRevision} />

  {#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}
  {#if !data.previewMode && data.status === 'case-restored'}<p class="success-message" role="status">Case restored. It is active and available to normal Admin and learner flows.</p>{/if}
  <div class="case-editor" data-editor-layout={editorLayout}>
    <CaseEditorNavigation {selectedCase} {primaryTopic} {editorLayout} {fastReviewSummary} auditCount={caseQuestionAudit.length} onlayoutchange={setEditorLayout} />
    <CaseTopicsSection {selectedCase} concepts={data.concepts} systems={data.systems} tagOptions={selectedCase.tagOptions ?? []} {primaryTopic} previewMode={data.previewMode} {editorLayout} />
    <CaseDetailsSection {selectedCase} {primaryTopic} {editorLayout} coordinator={draftCoordinator} caseLibraryReturnQuery={data['caseLibraryReturnQuery']} />
    <CaseImagesSection {selectedCase} previewMode={data.previewMode} {editorLayout} {editorBase} onimageopen={showImage} />
    {#if !data.previewMode}<StimulusOriginalsPanel {selectedCase} />{/if}
    <CaseQuestionsSection {selectedCase} previewMode={data.previewMode} status={data.status} removedQuestionPromptId={data.removedQuestionPromptId} {editorLayout} coordinator={draftCoordinator} caseLibraryReturnQuery={data['caseLibraryReturnQuery']} />
    {#if editorLayout === 'compact'}<CaseQuestionAudit rows={caseQuestionAudit} onimageopen={showImage} />{/if}
    <CasePreviewSection previewMode={data.previewMode} {studyPreviewHref} />
    {#if !data.previewMode}
      <section class="lifecycle-panel" aria-labelledby="case-lifecycle-heading">
        <div><p class="eyebrow">Case lifecycle</p><h2 id="case-lifecycle-heading">Active</h2><p class="muted">Deactivate this Case to remove it from learner study and the active Case library. Questions, images, Topics, Tags, and review history are retained for recovery.</p></div>
        <form method="POST" action={`/admin/cases/${encodeURIComponent(selectedCase.case.id)}/deactivate`} onsubmit={confirmCaseDeactivation}>
          <input type="hidden" name="case_id" value={selectedCase.case.id} />
          <input type="hidden" name="return_query" value={data['caseLibraryReturnQuery']} />
          <button class="button danger" type="submit">Deactivate Case</button>
        </form>
      </section>
    {/if}
  </div>

  <CaseImagePickerDialog {selectedCase} imagePicker={data.imagePicker} {editorBase} />
  <AdminImageViewer image={viewerImage} onclose={() => (viewerImage = null)} />
{/if}

<style>
  h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.35rem; font-size: 1.05rem; }
  .eyebrow { margin-bottom: 0.25rem; color: #667085; font-size: 0.72rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .form-error, .success-message { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; } .form-error { background: #fef3f2; color: #b42318; } .success-message { background: #ecfdf3; color: #027a48; }
  .lifecycle-panel { display: flex; justify-content: space-between; align-items: end; gap: 1rem; margin-top: 1rem; padding: 1rem; border: 1px solid #fecdca; border-radius: 10px; background: #fffbfa; } .lifecycle-panel > div { max-width: 760px; } .lifecycle-panel p:last-child { margin-bottom: 0; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; } .button.danger { border-color: #d92d20; color: #b42318; background: #fff; }
  a:focus-visible, button:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 680px) { .lifecycle-panel { align-items: stretch; flex-direction: column; } .lifecycle-panel .button { width: 100%; } }
</style>
