# Production-backed Preview Admin Workspace

_Status: implemented but no longer part of the normal development/testing workflow. Retained as a legacy/safety-sensitive subsystem; further backend decomposition is paused after PR #83._

_Last updated: 25 August 2026_

## Current project decision

The deployed Preview Admin surface is the production-backed Worker route:

```text
https://flash-cards-preview.mmed-fm-flashcardstest.workers.dev/preview-admin
```

The project owner no longer uses this surface for routine development or UI verification. The primary workflow is now the local clone with the production-like local D1/R2 replica:

```text
production content
→ read-only local refresh
→ local D1/R2
→ npm run dev for rapid iteration
→ npm run preview for production-style local verification
→ repository validation / GitHub CI
```

Accordingly:

- the remote `/preview-admin` workflow is **not the default integration gate**;
- further Preview backend decomposition is **not a current priority**;
- PR2D/PR2E/PR2F from the earlier staged plan are intentionally deferred;
- draft PR #91, which started the Alternative Set/stimulus extraction, was closed unmerged on 25 August 2026;
- existing Preview code remains in place for now because Preview ownership/security concepts still participate in production safety contracts;
- any future removal of Preview must be a separate decommissioning project, not opportunistic cleanup during unrelated work.

Issue #81 records the decision and historical staged-refactor checkpoint.

## Why this document remains

Although the remote Preview Admin is no longer the normal workflow, it is still present in the repository/deployed architecture and its safety boundaries matter.

Preview uses the same production D1 and R2 resources, so incorrect maintenance could affect production data. Future agents must therefore continue to preserve Preview ownership, production filtering, and mutation guardrails unless an explicitly reviewed decommission removes them.

The core safety rule remains:

> **Clone then mutate Preview-owned content. Never mutate production content and rely on rollback as the normal Preview workflow.**

## Worker/resource layout

```text
Production Worker: flash-cards
  -> DB:    production D1
  -> MEDIA: production R2

Preview Worker: flash-cards-preview
  -> DB:    same production D1
  -> MEDIA: same production R2
  -> PREVIEW_MODE=true
  -> Preview BETTER_AUTH_URL
  -> separate Preview BETTER_AUTH_SECRET
```

There is no independently synchronized Preview D1/R2 stack in the current design.

## Identity and hard route boundaries

The owner may hold:

```text
admin,preview_admin
```

Production and Preview Workers use separate Better Auth secrets, so sessions remain separate.

Hard boundaries include:

```text
Preview Worker /admin/**          -> forbidden
Preview Worker /study/**          -> forbidden
Preview Worker /api/auth/admin/** -> forbidden

preview-only preview_admin on production /study/** -> forbidden
combined admin,preview_admin on production /study/** -> allowed
```

The Preview Worker is not a learner endpoint or a general production Admin endpoint.

## Preview ownership

Preview-owned domain rows use explicit `preview_session_id` where supported. Preview uploads use:

```text
preview/<preview-session-id>/...
```

Production rows have no Preview-session ownership.

Normal learner Review construction excludes Preview-owned Cases, Prompts, and Assets. Production Admin read models/counts also exclude disposable Preview ownership where required.

## Clone-then-mutate model

The legacy remote flow is:

```text
production Case/content
→ clone the relevant authoring state into Preview-owned rows
→ mutate only Preview-owned Case/workspace relationships/content
→ inspect the shared editor UI
→ Reset Preview Workspace
```

Production objects may be reused read-only where existing contracts permit, including attaching eligible production Assets to Preview-owned Case/options without mutating the production Asset.

Current Case classification is Primary Topic + Case Tags. Preview cloning copies the canonical Primary Topic and Case Tags; legacy stored secondary Topic rows are not recreated.

## Stable public backend façade

Application callers continue importing Preview workspace operations through:

```text
src/lib/server/db/preview-workspace.js
```

The completed behavior-preserving extractions are:

```text
src/lib/server/db/preview-workspace/errors.js
→ PreviewWorkspaceError

src/lib/server/db/preview-workspace/input.js
→ shared input/time normalization primitives

src/lib/server/db/preview-workspace/session.js
→ Preview Session lookup/create/reuse/TTL primitives

src/lib/server/db/preview-workspace/ownership.js
→ Preview ownership/security guards

src/lib/server/db/preview-workspace/case.js
→ production Case discovery/search
→ complete production → Preview Case clone transaction
→ Preview Case listing
→ Case metadata/vignette/question-selection mutations
→ canonical Primary Topic replacement
→ deprecated secondary-Topic compatibility helpers that fail closed

src/lib/server/db/preview-workspace/fixed-images.js
→ ongoing fixed Case-image editor reads
→ single/bounded bulk fixed-image attach
→ caption update
→ detach + display-order normalization
→ reorder
```

PRs #80, #82, and #83 established these boundaries. Clone-time child copying remains in `case.js` because it is part of the complete Case-clone transaction.

## Intentionally not further decomposed

The following responsibilities remain in or coordinated through `preview-workspace.js`:

- `ensurePreviewWorkspace()` and Session↔cleanup coordination;
- workspace-wide cleanup/reset orchestration;
- Alternative Set / Stimulus Group / Stimulus Option operations;
- fixed → Alternative Set conversion/orchestration;
- Case/group/option question operations;
- question scope and reusable-question operations;
- composed editor loading;
- other remaining Preview-specific Asset/upload/discard coordination.

This is now an **accepted legacy boundary**, not a queue of required follow-up refactors.

Do not create PR2D/PR2E/PR2F merely to complete the historical decomposition plan. Revisit these boundaries only if active maintenance of Preview resumes and a concrete change-risk benefit justifies the work.

## Shared production Case editor

Preview renders the production Case-editor component surface rather than maintaining a copied editor. Shared components live under:

```text
src/lib/components/case-editor/
```

`test/admin-editor-preview-contract.test.js` protects the shared editor contract.

While Preview exists, a newly shared named action must still provide either a safe Preview implementation or an explicit blocked/403 implementation. Production-only non-named endpoints must remain unreachable from Preview mutation controls.

For Primary Topic + Tags, Preview may replace a Preview Case's canonical Topic. Case Tags are cloned/displayed read-only; global Tag curation and production Case-Tag/System↔Tag mutation remain outside Preview authority.

## Production Assets and reusable questions

Preview may browse production Assets read-only and may reuse eligible production Assets in Preview-owned relationships where explicitly supported.

Preview may not mutate production Asset metadata, Collections, R2 object identity/bytes, supersession lineage, or production Case/stimulus relationships.

`shared_questions` and `asset_questions` remain production-global reusable knowledge. Preview has no canonical mutation authority over them.

Production higher-resolution Asset replacement remains Preview-aware: a production Asset referenced by a live Preview workspace can block replacement, and Preview relationships are never silently rewritten.

## Session and cleanup safety

V1 supports one live Preview workspace per Preview Admin with a 24-hour expiry.

Existing contracts include:

- active-session reuse;
- TTL/expiry semantics;
- cleanup before replacement workspace creation;
- surfaced cleanup failure rather than false success;
- retry behavior;
- owner-scoped Session/Case/Prompt/Group/Option access;
- idempotent cleanup restricted to explicitly owned Preview rows/objects;
- R2 cleanup restricted to objects proven to belong to the Preview session.

These contracts remain important even though the workflow is no longer routinely used.

## Remote deployment workflows are legacy/optional

The repository still contains the manual Preview deployment/restore workflows and operator documentation, including:

```text
.github/workflows/deploy-pr-to-preview.yml
```

and `PREVIEW_DEPLOYMENT.md`.

They are no longer part of the default development path. Do not deploy to the remote Preview Worker merely because a PR is ready for local verification.

Local:

```text
npm run preview
```

means production-style **local** verification with local D1/R2. It is unrelated to deploying the remote Preview Worker.

## Primary development workflow now

Use `LOCAL_DEVELOPMENT_REPLICA.md` for the normal current workflow.

The intended sequence for ordinary application work is:

```text
npm run local:refresh   # when fresh production-derived content is needed
npm run dev             # rapid local iteration / hot reload
npm run local:stop
npm run preview         # production-style local runtime verification
repository-defined validation / CI
```

The local replica deliberately reads production content and writes only local D1/R2 state.

## Future decommissioning decision

Stopping the refactor does **not** mean Preview can be deleted casually.

If the project decides the remote Preview Admin is permanently unnecessary, create a separate decommissioning assessment covering at minimum:

- `/preview-admin` routes and shared-editor contracts;
- Preview auth roles, secrets, and sessions;
- `preview_sessions` and Preview ownership columns/relationships;
- production read filters excluding Preview-owned content;
- cleanup/reset and Preview R2 prefixes;
- production Asset replacement checks involving live Preview references;
- bootstrap tooling;
- deployment/restore workflows;
- Preview-specific tests and documentation;
- safe handling of any extant Preview-owned production rows/objects.

Only after that dependency inventory should code/schema/deployment removal be planned.

## Validation expectations for any future Preview change

If Preview code is touched, preserve or intentionally revise with explicit review:

- public façade/export contracts;
- Session lifecycle/reuse/TTL/cleanup failure;
- ownership isolation across Session/Case/Prompt/Group/Option;
- production Asset read-only reuse;
- complete Case-clone behavior and ordering;
- Primary Topic + Case Tag cloning with legacy secondary rows omitted;
- fixed-image ordering/captions/attach/detach/reorder;
- shared editor action/data contracts;
- route hard blocks;
- R2 prefix safety;
- reusable-content restrictions;
- live-Preview replacement blocking;
- option archive/current-state semantics.

Use repository-defined validation. GitHub-only sessions must distinguish CI/check evidence from commands they did not execute locally.

## Non-goals

Unless a separate product/decommissioning decision changes them, Preview does not provide:

- an independently synchronized staging D1/R2 stack;
- automatic deployment of every PR;
- unmerged migration application;
- unrestricted production-object editing;
- mutation of global Shared Questions or Reusable Image Questions;
- higher-resolution Asset replacement;
- learner Study on the Preview Worker;
- production Auth Admin-plugin operations through Preview;
- a mandate to finish the historical backend-decomposition sequence.
