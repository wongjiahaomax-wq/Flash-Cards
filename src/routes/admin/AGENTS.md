# Admin route agent guidance

This file supplements the repository-wide `AGENTS.md` for `src/routes/admin/`.

- Preserve the current authoring model; inspect existing actions, components, and DB helpers before adding patterns.
- Keep UX-only work out of schema/architecture changes unless explicitly required.
- SvelteKit `redirect()` throws. Do not wrap a successful redirect in a broad catch that converts it to an error response.
- Keep fallible DB/storage work inside the error boundary, then redirect after success.
- Preserve Production/Preview ownership and mutation semantics in Admin actions.
- Reuse current Topic, Tag, Shared Question, image/stimulus, and reusable-image-question flows rather than duplicating them.

Minimum context is task-specific; start with `docs/AGENT_TASK_MAP.md` and inspect directly related route tests/helpers.

Relevant validation normally includes `npm test`, `npm run check`, and `npm run build`.
