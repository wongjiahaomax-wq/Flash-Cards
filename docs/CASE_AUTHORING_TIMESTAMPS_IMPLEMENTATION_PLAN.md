# Case Added / Last Edited Metadata — Simplified Implementation Plan

_Status: single planning authority for Draft PR #176. This PR remains planning-only. Feature implementation has not started._

## Goal

Show useful Case authoring dates to Admins using the timestamp columns that already exist on `cases`:

- **Added** = existing `cases.created_at`
- **Last edited** = existing `cases.updated_at`

Display:

```text
Case Library
Added 3 Sep 2026 · Edited 9 Sep 2026

Production Case Editor
Added 3 Sep 2026 · Last edited 9 Sep 2026, 21:42 SGT
```

Use deterministic `Asia/Singapore` formatting.

This is practical Admin-facing authoring metadata. It is **not** an audit log, revision number, concurrency token, or mathematically exact representation of every persisted Case transition.

## Existing data model

The current `cases` table already has `created_at` and `updated_at`.

Therefore:

- no schema migration;
- no new timestamp columns;
- no historical backfill;
- no attempt to reconstruct old edit history;
- existing Cases may initially have an `updated_at` value that reflects older incomplete maintenance rather than every historical authoring action.

From this feature onward, `updated_at` should be maintained as useful Case authoring recency.

## Product semantics

### Added

`created_at` remains immutable after Case creation.

It represents when the Case record was originally created/imported into Flash-Cards. Initial Case/import assembly should continue to rely on the existing creation timestamp behavior; do not add extra post-create timestamp churn solely for this feature.

### Last edited

Advance `updated_at` after a **successful Production Admin action that actually changes normal Case-authored content or configuration**.

Count ordinary Case-local authoring such as:

- title;
- vignette;
- question-selection settings;
- Primary Topic assignment;
- Case Tags;
- Case Question Tags;
- Case Questions, including meaningful reorder and scope changes;
- fixed-image attachment/removal, Case-specific caption, and meaningful reorder;
- stimulus / Original / Alternative / supporting configuration;
- Case-specific stimulus questions;
- per-Case reusable-question opt-in/out.

Do not update Case authoring recency merely because related global/shared state changed elsewhere.

### Must not touch `updated_at`

Do not advance Production Case `updated_at` for:

- Preview edits;
- learner study/review/progress activity;
- Case deactivate/restore lifecycle actions;
- global System maintenance;
- global Topic rename/reparent/hierarchy maintenance;
- global Tag rename/activation/deactivation;
- global Asset metadata, replacement, R2 lifecycle, deduplication, or storage maintenance;
- global reusable/shared-question content edits;
- reads, navigation, filtering, previewing, or opening the editor;
- creation/import assembly beyond the Case's initial timestamp.

Case lifecycle and authoring recency remain separate concepts.

## Engineering rule: keep this simple

Do **not** turn `cases.updated_at` into an audit-grade consistency system.

Do not introduce or redesign concurrency control solely for this feature. In particular, do not add:

- CAS/version-token machinery;
- concurrency sentinels;
- timestamp ownership tokens;
- new rollback/compensation frameworks;
- new transaction abstractions;
- exhaustive compensation/interleaving logic;
- audit/event tables;
- schema changes;
- a permanent mutation-entrypoint registry;
- repository-wide writer refactors merely to make timestamps exact.

Preserve the current writer architecture unless a very small local change is required to maintain the timestamp.

### Practical write rule

Use the smallest change that fits the writer already present:

1. **Case-row edits** — when the Case row itself is already being updated, include `updatedAt` in that successful substantive update where practical.
2. **Existing `db.batch(...)` writer** — if the Case-local mutation already uses a batch and adding the Case touch is straightforward, include the timestamp update in that batch.
3. **Existing sequential writer** — preserve its current mutation structure; after the substantive Case-local mutation succeeds, update the Production Case timestamp.
4. Do not restructure a working sequential or compensating writer solely to guarantee perfect timestamp atomicity.

Rare failure/concurrency edge cases where Last edited becomes slightly conservative/newer than the final net state are acceptable for this Admin documentation feature.

The timestamp helper/update must remain Production-only and must not create a new Preview ownership implementation.

## No-op handling

Avoid obvious false edits without creating a general diff engine.

Preserve existing no-op knowledge where the writer already has it or where a small equality check is straightforward, for example:

- assigning the same Primary Topic;
- already-attached/already-removed relationship when the writer already knows that state;
- boundary reorder where no order changes;
- already-equal activation state;
- identical Case Editor Save All replay where practical.

A known no-op should leave `updated_at` unchanged.

However, do not add substantial preflight/concurrency logic simply to distinguish every theoretical no-op. If equality detection would materially complicate the existing writer or change its semantics, preserve the existing writer behavior rather than expanding this PR.

Do not move current ownership, validation, or error checks merely to optimize timestamp no-ops.

## Bulk operations

For bulk Case-local actions:

- preserve current validation and batch behavior;
- if the writer already identifies the subset of Cases whose relationship/configuration changed, timestamp only that changed subset;
- Cases already in the requested state should remain untouched where the existing writer already exposes that distinction;
- do not add complex preflight/concurrency machinery solely to make bulk timestamping perfectly exact.

## Production Admin surface discovery

During implementation, inspect the current Production Admin authoring surfaces sufficiently to avoid obvious missed Case-local writers.

Use progressive repository discovery:

```text
start from the Case editor / Case Library / Tags / image-stimulus authoring surfaces
→ follow the current route/action to its real writer
→ add the smallest timestamp integration at the writer boundary
→ stop when the normal Case-local authoring families are covered
```

This is a pragmatic coverage review, not a formal completeness proof.

Do not create:

- an exhaustive one-test-per-writer certification matrix;
- a permanent registry of mutation entrypoints;
- a new architecture layer whose only purpose is tracking timestamp coverage.

Pay particular attention to normal Case-local operations that may be exposed from more than one Admin surface, including Case Tags, Case Question Tags, question scope/reorder, fixed images, stimulus roles/options, and reusable-question opt-ins.

## Read model changes

### Case Library

Extend the existing bounded Case Library read model so each Case row already returned by the query also exposes:

- `createdAt`;
- `updatedAt`.

Do not add N+1 reads or per-Case timestamp queries.

Preserve current pagination, filtering, sorting, counts, return-context behavior, and inactive Case handling.

### Production Case Editor

Expose `createdAt` and `updatedAt` through the existing Production Case detail/editor data path.

Do not add a second Case-detail query solely for timestamps.

Preview Editor timestamp UI remains out of scope.

## UI

### Case Library

Under the Case title, render muted secondary metadata:

```text
Added 3 Sep 2026 · Edited 9 Sep 2026
```

Requirements:

- no new table column;
- keep existing title, checkbox, Topic/System/Tags, inactive badge, and Open behavior intact;
- show absolute dates, not relative time;
- keep responsive/mobile behavior intact.

### Production Case Editor

Under/near the existing header metadata, render:

```text
Added 3 Sep 2026 · Last edited 9 Sep 2026, 21:42 SGT
```

Requirements:

- Production editor only;
- keep Save All, unsaved-work, navigation, return-context, and Study Preview behavior unchanged;
- no editable timestamp control;
- no revision/history interaction.

### Formatting

Prefer one small shared formatting helper.

Formatting contract:

- explicit timezone: `Asia/Singapore`;
- English human-readable date;
- Case Library: date only;
- Production editor: date + 24-hour time + explicit `SGT` indication;
- deterministic across server/test environments;
- no new date dependency.

Use semantic `<time>` markup where convenient, but do not expand scope solely for markup refactoring.

## Testing contract

Use deterministic timestamps wherever a test compares before/after timestamp values. Do not use sleeps or depend on wall-clock resolution.

Focus executable coverage on the product behavior rather than formal writer certification.

Required coverage:

1. A real core Case edit updates `updated_at`.
2. `created_at` remains unchanged after later edits.
3. An obvious identical/no-op update does not falsely advance `updated_at` where the current writer supports that distinction.
4. Representative Primary Topic, Tag, and Case Question Case-local changes update the owning Case.
5. A representative fixed-image or stimulus Case-local change updates the owning Case.
6. A representative bulk operation timestamps only the changed subset where the current writer already exposes that subset.
7. A representative global/shared metadata edit does not fan out `updated_at` to related Cases.
8. Case deactivate/restore does not alter authoring recency.
9. Preview authoring does not alter the Production Case's recency.
10. Case Editor Save All retains its existing partial-persistence/retry behavior; timestamp support must not make the whole Save All request transactional or change its established error semantics.
11. Case Library and Production Case Editor render the requested Added/Edited metadata.
12. Singapore formatting is deterministic.

Prefer existing current-schema fixtures and real writer/action tests. Static/source tests may supplement UI/routing contracts but should not be the only evidence for timestamp mutation behavior.

Do **not** require:

- two-direction failure injection solely for timestamp atomicity;
- synthetic compensation/interleaving tests;
- monotonic-concurrency proofs;
- timestamp-as-CAS tests;
- exhaustive route/writer certification.

## Preserve existing behavior

Do not change:

- Production/Preview ownership boundaries;
- Case Editor Save All semantics;
- current validation/error ordering and domain error mapping;
- one Primary Topic + Case Tags classification model;
- Case Question/shared-question ownership semantics;
- stimulus architecture or Original/Alternative/supporting semantics;
- Asset identity, replacement, R2 lifecycle, or storage safeguards;
- Case deactivate/restore behavior;
- learner/review behavior;
- import package/schema merely to carry timestamps.

If implementation discovery exposes an unrelated defect, keep it out of this PR unless it blocks safe timestamp integration.

## Explicit non-goals

Do not add:

- schema migration;
- historical backfill;
- `updated_by` / editor identity;
- audit or revision history;
- history/diff UI;
- learner-facing timestamps;
- Preview timestamp UI;
- Added/Edited sorting or filtering;
- relative-time labels;
- timestamp editing controls;
- new date library;
- concurrency/version infrastructure;
- broad authoring refactors;
- Production deployment or Production D1/R2 mutation.

## Implementation tranches for Luna 5.6

Keep implementation in this same Draft PR. Do not create a new PR, merge, or mark Ready.

### Tranche 1 — Core timestamp behavior

- Establish the smallest Production-only Case timestamp helper/pattern that fits current DB conventions.
- Update core Case metadata writes so substantive title/vignette/question-selection changes advance `updated_at`.
- Preserve `created_at`.
- Add deterministic focused tests for real edit + obvious no-op behavior.

### Tranche 2 — Classification and questions

- Cover normal Primary Topic, Case Tag, Case Question Tag, Case Question, reorder, and question-scope authoring.
- Reuse existing no-op knowledge rather than adding a general diff layer.
- Preserve current validation and shared/global Topic/Tag/question semantics.

### Tranche 3 — Images, stimulus, reusable-question opt-ins

- Cover Case-local fixed-image and stimulus configuration changes and per-Case reusable-question opt-in/out.
- Where current writers already use `db.batch(...)`, include the Case timestamp update in the batch when straightforward.
- Keep global Asset/R2 and reusable-question content maintenance from touching Cases.
- Do not refactor stimulus/storage architecture for timestamp precision.

### Tranche 4 — Read models and UI

- Expose `createdAt` and `updatedAt` through existing bounded Case Library and Production Case Editor read models.
- Add one small deterministic Singapore formatter if appropriate.
- Render the requested metadata without another Case Library column or Preview UI.

### Tranche 5 — Focused regression and handoff

- Do a pragmatic scan of current Production Admin authoring surfaces for obvious missed Case-local writers.
- Add/finish the focused behavioral coverage listed above; do not create exhaustive writer certification.
- Run `npm run agent:checks -- --compact` and all repository-required focused/checkpoint/final validation it reports.
- Inspect the complete intended-base → head diff once at final handoff.
- Keep the PR Draft.

## Luna 5.6 implementation handoff

Use this prompt when implementation begins:

> Continue existing Draft PR #176 from its current head. Do not create a new PR, merge, or mark Ready. Implement `docs/CASE_AUTHORING_TIMESTAMPS_IMPLEMENTATION_PLAN.md` as the single authority. Keep the feature pragmatic: existing `cases.created_at` is immutable Added time; existing `cases.updated_at` is useful Production Admin Case-authoring recency, not an audit/concurrency system. Advance it after successful substantive Case-local authoring changes; do not touch it for Preview, learner/review activity, deactivate/restore, or global/shared Topic/Tag/Asset/R2/reusable-question maintenance. Preserve existing writer architecture: include the touch in an existing `db.batch(...)` when straightforward; otherwise preserve sequential writers and touch after the successful substantive mutation. Avoid obvious no-op timestamp churn using existing writer knowledge, but do not add CAS/version/rollback/concurrency machinery or a general diff engine. Cover normal core Case, classification/Tags/questions, fixed-image/stimulus and per-Case reusable-question authoring, then expose `createdAt`/`updatedAt` through the existing bounded Case Library and Production editor read models. Render `Added … · Edited …` in the library and `Added … · Last edited … SGT` in the Production editor using deterministic `Asia/Singapore` formatting. No migration/backfill/audit/history/date sorting/new dependency/Preview timestamp UI/deployment/Production mutation. Use deterministic timestamp tests, focused representative executable coverage, and repository-required validation. Keep the PR Draft.

## Completion condition

The feature is complete when Admins can see stable Added dates and useful Last edited dates in the requested Production Admin surfaces, normal Case-local authoring refreshes Last edited, obvious no-ops do not create misleading edits where the current writer can cheaply identify them, global/lifecycle/Preview/learner operations remain excluded, and the implementation achieves this without turning `cases.updated_at` into an audit or concurrency subsystem.
