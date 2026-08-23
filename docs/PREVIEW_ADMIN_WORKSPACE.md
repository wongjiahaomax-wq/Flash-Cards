# Production-backed Preview Admin Workspace

_Status: implemented and part of the operational baseline. Current `main` also contains a staged, behavior-preserving backend decomposition through Preview fixed Case-image operations._

_Last updated: 24 August 2026_

## Purpose

Admin UI changes need real browser inspection against current teaching content without maintaining a second synchronized D1 database or R2 bucket.

Preview therefore uses a separate Worker bound to the same production D1 and R2 resources.

Safety depends on explicit Preview ownership, narrow mutation capability, database constraints, central learner/production filtering, hard request boundaries, separate authentication secrets/sessions, and deliberate restrictions on global production objects.

The core rule is:

> **Clone then mutate Preview-owned content. Never mutate production content and rely on rollback as the normal Preview workflow.**

## 1. Worker/resource layout

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

There is no second D1/R2 resource in the current design.

## 2. Identity and hard route boundaries

The owner may hold:

```text
admin,preview_admin
```

Production and Preview Workers use separate Better Auth secrets, so sessions remain separate.

Current hard boundaries include:

```text
Preview Worker /admin/**          -> forbidden
Preview Worker /study/**          -> forbidden
Preview Worker /api/auth/admin/** -> forbidden

preview-only preview_admin on production /study/** -> forbidden
combined admin,preview_admin on production /study/** -> allowed
```

The Preview Worker is not a learner endpoint or general production Admin endpoint.

## 3. Preview ownership

Preview-owned domain rows use explicit `preview_session_id` where supported. Preview uploads use:

```text
preview/<preview-session-id>/...
```

Production rows have no Preview session ownership.

Normal learner Review construction excludes Preview-owned Cases, Prompts, and Assets. Production Admin read models/counts also exclude disposable Preview ownership where required.

## 4. Clone then mutate

Normal flow:

```text
production Case/content
→ clone complete relevant authoring state into Preview-owned rows
→ mutate only Preview-owned Case/workspace relationships/content
→ inspect shared production editor UI
→ Reset Preview Workspace
```

Production objects may be reused read-only where existing contracts permit, including attaching eligible production Assets to current-session Preview-owned Cases/options without mutating the production Asset.

## 5. Stable public backend façade

Application callers should continue importing Preview workspace operations through:

```text
src/lib/server/db/preview-workspace.js
```

The staged refactor changes internal responsibility ownership, not the caller-facing API, route contracts, error contracts, ownership semantics, or product behavior.

Current focused modules are:

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
→ complete production → Preview Case clone orchestration
→ Preview Case listing
→ title/vignette/question-selection metadata mutations
→ primary/secondary Topic mutations

src/lib/server/db/preview-workspace/fixed-images.js
→ fixed Case-image editor reads
→ single fixed-image attach
→ bounded bulk fixed-image attach after façade preconditions
→ Case-specific fixed-image caption update
→ fixed-image detach + display-order normalization
→ fixed-image reorder
```

`preview-workspace.js` remains the public façade and delegates to these focused owners.

## 6. Why Case cloning remains cohesive

The complete Case clone transaction remains owned by `preview-workspace/case.js`, including clone-time child graph copying such as fixed `case_assets` relationships.

That is intentional: clone-time fixed-image copying is part of the complete Case-clone transaction, not an ongoing fixed-image editor mutation. Moving it into `fixed-images.js` merely for symmetry would split one semantic transaction and risk circular dependencies.

The clone continues to preserve production source metadata, Topic/Tag mappings, Preview Session ownership, production Asset reuse where allowed, Preview Prompt isolation, and established ordered batch/write behavior.

## 7. Fixed-image operation boundary

`fixed-images.js` owns ongoing fixed-image operations after the Case exists.

Bulk attach has one important preserved precondition: Case ownership validation occurs before bounded bulk-input validation, preserving the established error precedence for foreign Case IDs even when the submitted selection is empty or oversized.

The public façade owns that ownership-before-input precondition and passes a prevalidated Case into the focused helper, avoiding a redundant second ownership query on success.

Behavior intentionally preserved includes ordering, captions, duplicate/conflict handling, Asset eligibility, batch/fallback behavior, ownership rejection, and public error codes/messages.

## 8. Deliberately still owned by the façade

The staged refactor is not complete. Current façade ownership still includes:

- `ensurePreviewWorkspace()` because it coordinates Session state with cleanup;
- workspace-wide cleanup/reset orchestration;
- Alternative Set / Stimulus Group / Stimulus Option operations;
- fixed → Alternative Set conversion/orchestration where the dominant semantic responsibility is Alternative Set mutation;
- Case/group/option question operations;
- question scope and reusable-question operations;
- composed editor loading where several child domains are assembled together.

Likely next focused sequence:

```text
Alternative Set / stimulus extraction
→ question / scope / reusable-question extraction
→ final façade / cleanup ownership review
```

Do not extract a function merely because it touches a child table; keep compound operations with the domain that owns their semantic transaction.

## 9. Shared production Case editor

Preview renders the real Production Case-editor component surface rather than maintaining a copied editor.

After PR #78 the shared editor spans the route plus focused components under:

```text
src/lib/components/case-editor/
```

`test/admin-editor-preview-contract.test.js` treats that route/component set as the shared editor implementation surface while keeping the route as the top-level server-data boundary.

Whenever a new shared named action is added, Preview must provide either:

- a safe Preview implementation; or
- an explicit named blocked/403 implementation.

Production-only non-named endpoints must remain unreachable from Preview mutation controls.

## 10. Production Assets in Preview

Preview may browse/search/filter/paginate/select real production Assets read-only and may attach eligible production Assets to Preview-owned Case relationships where explicitly supported.

Preview may not mutate production Asset metadata, Collection assignment, R2 bytes/object identity, supersession lineage, or production Case/stimulus relationships.

Image Library lifecycle classification remains a production-content read concern; Preview-session relationships do not change a production Asset's Current/Historical only/Unused classification.

## 11. Shared Questions and Reusable Image Questions remain production-global

`shared_questions` and `asset_questions` are global production-curated reusable knowledge. Preview Admin has no canonical mutation authority over either.

D1/application protections reject Preview-owned backing Prompts/Assets and preserve cross-group Prompt invariants.

Preview may display safe counts/status from shared editor data, but display parity does not imply create/edit/archive/reuse/remove authority.

## 12. Option archive/removal compatibility

Migration `0012_archive_stimulus_options.sql` adds the current `removed_from_case` relationship archive state.

Preview behavior must preserve the same semantic distinction wherever those options are cloned/edited:

```text
Deactivate option
≠ Remove from Case
```

Removed relationships are excluded from current learner/current-authoring semantics while retained rows preserve historical/question/provenance relationships. Internal Preview refactors must not collapse that state into ordinary `is_active` handling.

## 13. Higher-resolution replacement is production-only and Preview-aware

Production **Replace with higher-resolution version** remains unavailable in Preview.

A production Asset referenced by a live Preview workspace is temporarily ineligible as a replacement source. Live means:

```text
preview_sessions.status = 'active'
AND expires_at > now
```

Both Preview fixed `case_assets` and Preview option references block replacement. Production replacement checks before R2 upload and repeats the condition in the D1 claim so a newly live Preview reference causes rollback and cleanup of only the new uncommitted object.

Preview relationships are never silently rewritten by production replacement.

## 14. Preview Session lifecycle

V1 supports one live Preview workspace per Preview Admin with a 24-hour expiry.

Session state is durable in D1. Existing behavior intentionally preserves:

- active-session reuse;
- TTL/expiry semantics;
- expired-session cleanup before replacement workspace creation;
- surfaced cleanup failure rather than falsely declaring success;
- retry behavior;
- owner-scoped Session/Case/Prompt/Group/Option access.

PR #80 extracted primitives behind the unchanged façade and added characterization coverage around these contracts.

Reset/cleanup must remain idempotent and may remove only explicitly owned Preview rows/objects.

## 15. Preview R2 cleanup

Preview writes use the isolated Preview prefix and central media guardrails.

Reset may delete only objects proven to belong to the relevant Preview session. Reviewed-import staging and failed production replacement cleanup are different storage lifecycles and must not be confused with Preview ownership.

## 16. Deploy PR to Preview

The permanent manual workflow remains:

```text
.github/workflows/deploy-pr-to-preview.yml
```

It resolves an exact trusted same-repository PR head targeting `main`, validates it, and deploys only to Preview. Candidate schema/migration/`wrangler.jsonc` changes remain blocked; the workflow never applies a remote migration.

Use `PREVIEW_DEPLOYMENT.md` for the operator playbook and capability-based dispatch guidance.

Local `npm run preview` is production-style **local verification** and is not this remote Preview deployment.

## 17. Restore Main to Preview

After candidate inspection, return Preview to current `main` through the permanent Restore Main workflow rather than leaving arbitrary candidate code deployed.

Typical lifecycle:

```text
main on Preview
→ Deploy PR to Preview
→ inspect candidate
→ Reset Preview Workspace as appropriate
→ Restore Main to Preview
```

## 18. Migration compatibility map

Preview ownership foundation:

```text
0006_preview_admin_workspace.sql
```

Later repository migrations remain compatible with the same boundary:

- `0007_image_collections.sql` — global Asset organisation;
- `0008_tag_shared_questions.sql` — global Shared Questions + Preview backing-Prompt protection;
- `0009_reusable_image_questions.sql` — global Reusable Image Questions + backing-content/cross-group protection;
- `0010_reusable_image_reactivation_guard.sql` — reactivation defense;
- `0011_asset_supersession.sql` — production-only replacement lineage;
- `0012_archive_stimulus_options.sql` — retained option relationship archive state;
- `0013_review_assets_asset_lookup.sql` — Asset-leading historical Review lookup index; no new Preview ownership semantics.

Repository presence is not proof of production application.

## 19. Validation expectations

Preview-related changes should use root `AGENTS.md` + `AGENT_TASK_MAP.md` and preserve characterization/regression coverage for:

- public façade/export contracts;
- Session lifecycle/reuse/TTL/cleanup failure;
- ownership isolation across Session/Case/Prompt/Group/Option;
- production Asset usability in Preview;
- complete Case clone behavior and write ordering;
- fixed-image ordering/captions/attach/detach/reorder;
- ownership-before-input error precedence for bulk attach;
- shared editor action/data contracts;
- route hard blocks;
- R2 prefix safety;
- reusable-content restrictions;
- live-Preview replacement blocking;
- option archive/current-state semantics.

`agent:checks` should determine the relevant ordinary/specialized command set when local execution is available. GitHub-only sessions must report CI evidence separately from locally executed commands.

## 20. Non-goals

Current Preview V1 deliberately does not provide:

- a second independently synchronized D1/R2 staging stack;
- automatic deployment of every PR;
- Preview application of unmerged migrations;
- unrestricted editing of global production objects;
- Preview mutation of global Shared/Re\-usable Image Questions;
- Preview higher-resolution Asset replacement;
- silent migration of Preview relationships when a production Asset is superseded;
- multiple simultaneous Preview workspaces per owner;
- learner Study on the Preview Worker;
- production Auth Admin-plugin operations through Preview;
- premature child-module extraction that splits a cohesive clone/conversion/cleanup transaction.
