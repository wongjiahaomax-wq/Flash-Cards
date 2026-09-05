# Admin route agent guidance

This file supplements the repository-wide `AGENTS.md` for `src/routes/admin/`.

- Preserve the current authoring model; inspect existing actions, components, and DB helpers before adding patterns.
- Current Case classification is **one canonical Primary Topic + zero or more Case Tags**. Do not reintroduce Additional Study Topic authoring merely because the historical `case_concepts.role = 'secondary'` storage value still exists.
- Treat stored secondary Case↔Topic rows as legacy compatibility data: current Admin UI/read models hide them, current mutations do not create them, and no cleanup migration is required solely to remove them.
- Keep global System/Topic hierarchy and System↔Tag exposure separate from Case-local Primary Topic / Case Tag authoring.
- Keep fallible DB/storage work inside the action error boundary, then redirect after success.
- Preserve the route's existing action error mapping; do not catch thrown values indiscriminately or collapse established domain/action errors into a generic response.
- Preserve Production/Preview ownership and mutation semantics in Admin actions.
- Reuse current Topic, Tag, Shared Question, image/stimulus, and reusable-image-question flows rather than duplicating them.

## Case editor boundary

`src/routes/admin/cases/[caseId]/+page.svelte` is the shared route-level coordinator used by both Production Admin and Preview Admin. Keep cross-section state there only when it genuinely coordinates multiple editor sections.

Preview Admin deliberately imports the Production Admin `+page.svelte`; do not create a copied Preview editor. When adding or changing a named form action, keep `test/admin-editor-preview-contract.test.js` green and provide a safe Preview implementation or explicit named block as required by `docs/PREVIEW_ADMIN_WORKSPACE.md`.

Use `docs/AGENT_TASK_MAP.md` for task-specific authorities; inspect directly related route tests/helpers.
