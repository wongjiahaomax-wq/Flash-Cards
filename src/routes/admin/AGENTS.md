# Admin route agent guidance

This file supplements the repository-wide `AGENTS.md` for `src/routes/admin/`.

- Preserve the current authoring model; inspect existing actions, components, and DB helpers before adding patterns.
- Keep UX-only work out of schema/architecture changes unless explicitly required.
- SvelteKit `redirect()` throws. Do not wrap a successful redirect in a broad catch that converts it to an error response.
- Keep fallible DB/storage work inside the error boundary, then redirect after success.
- Preserve Production/Preview ownership and mutation semantics in Admin actions.
- Reuse current Topic, Tag, Shared Question, image/stimulus, and reusable-image-question flows rather than duplicating them.

Minimum context is task-specific; start with `docs/AGENT_TASK_MAP.md` and inspect directly related route tests/helpers.

## Case editor map

`src/routes/admin/cases/[caseId]/+page.svelte` is the shared route-level coordinator used by both Production Admin and Preview Admin. Keep cross-section state there only when it genuinely coordinates multiple editor sections.

Case-editor UI responsibilities live under `src/lib/components/case-editor/`:

- `CaseEditorHeader.svelte` and `CaseEditorNavigation.svelte` — heading, layout preference, completeness summary, section navigation;
- `CaseTopicsSection.svelte` — primary/default Topic and Additional Study Topic authoring;
- `CaseDetailsSection.svelte` — core Case metadata and question-selection settings;
- `CaseImagesSection.svelte` — fixed images, Alternative Sets, image-specific questions, and reusable Image Question controls;
- `CaseQuestionsSection.svelte` — Case-wide questions and scope changes;
- `CaseImagePickerDialog.svelte` — Case image-library picker and upload/attach flow;
- `CasePreviewSection.svelte` — learner-preview affordance and Preview Mode restriction copy.

Preview Admin deliberately imports the Production Admin `+page.svelte`; do not create a copied Preview editor. When adding or changing a named form action, keep `test/admin-editor-preview-contract.test.js` green and provide a safe Preview implementation or explicit named block as required by `docs/PREVIEW_ADMIN_WORKSPACE.md`.

For presentation-only UX work, batch small copy, spacing, class, and layout edits under Vite/HMR and inspect the result before running broader repository checks. Do not run the full test/check/build cycle after every visual edit.

When Admin logic changes, run the relevant focused tests as soon as they are useful. Use `npm run validate:fast` at a coherent checkpoint and `npm run validate:full` once before handoff; rerun them only when later changes could invalidate what they checked.
