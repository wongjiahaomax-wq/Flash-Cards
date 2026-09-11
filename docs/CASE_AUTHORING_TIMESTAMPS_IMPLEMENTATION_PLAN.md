# Case Added / Last Edited Metadata — Implementation Plan

_Status: planning contract for this Draft PR. Implementation is intentionally pending. The implementation should remain in this same PR._

## Goal

Document when each Production Case was originally added and when its Case-local authored content was most recently changed, then surface that information unobtrusively in the Admin Case Library and Production Case Editor.

The product should answer two different questions:

```text
Added
→ when this Case record was originally created/imported into Flash-Cards

Last edited
→ when a successful substantive Production Case-local authoring change most recently changed this Case
```

This is content-documentation metadata, not an audit log.

## Current baseline

The current schema already has `cases.created_at` and `cases.updated_at`. The original migration gives both non-null millisecond timestamp defaults, so this feature does **not** need a schema migration or timestamp backfill.

Current Case creation relies on those database defaults. However, current Production authoring does not consistently maintain the parent Case's `updated_at`: core Case fields, Topic relationships, Tags, Case Questions, fixed images and stimulus/image-question relationships are owned by separate writers. Current Case Library and Case Editor read models also do not expose the Case timestamps.

Therefore the feature should reuse the existing fields and establish `cases.updated_at` as the canonical aggregate **Case-authoring timestamp** from this feature onward.

Historical limitation: `created_at` is authoritative for when an existing Case was added. Pre-feature `updated_at` values were not maintained as a comprehensive Case-authoring history, so old Cases may initially show an incomplete historical "Last edited" value. Do not fabricate a backfill or attempt to reconstruct historical edits.

## Product semantics

### `created_at` / Added

- Immutable after Case creation.
- Represents when the Case record was inserted into Flash-Cards, including imported Cases.
- Initial related writes performed while constructing a newly imported/created Case do not require artificial parent timestamp touches; the Case's creation/default timestamp is the initial authoring point.
- Never rewrite `created_at` merely to implement this feature.

### `updated_at` / Last edited

Treat `cases.updated_at` as the most recent successful **Production Case-local authoring change**.

A Case-local authoring change is a change an Admin makes to the authored definition/configuration of that specific Case. It is not a generic "something related somewhere changed" timestamp.

The governing rule is:

> Advance `cases.updated_at` only when a successful operation actually changes Production Case-local authored state for that Case.

A validation/error path that makes no Case-local change must not advance it. A true no-op/idempotent replay must not advance it. `created_at` must remain unchanged.

## What MUST count as a Case edit

The implementation must cover the currently exposed Production Admin authoring surfaces in these semantic families. Use current repository routing and actual current writer ownership to locate the complete call sites rather than treating this list as a hard-coded file map.

### Core Case metadata

Count actual changes to:

- internal Case title;
- vignette;
- question-selection mode/count.

### Primary Topic assignment

Count changes to the Case's canonical Primary Topic, including:

- a single Case Primary Topic change;
- bulk Primary Topic assignment for the Cases whose Primary Topic actually changes;
- quick-create a Topic and make it the Case's Primary Topic.

Do **not** count a later rename/reparent/System move of the shared Topic itself as edits to every Case using it.

### Case Tags and Case Question Tags

Count:

- attach/remove a Case Tag;
- bulk attach/remove, but only for Cases whose relationship actually changes;
- quick-create a Tag and attach it to a Case;
- add/remove a Tag on a Case Question, touching the Case that owns that Case Question.

Do **not** count global Tag rename/activation/deactivation as edits to every related Case.

### Case Questions and Case-specific question scope

Count actual changes to Case-owned question configuration, including:

- create/edit/remove/restore a Case Question;
- prompt/answer changes made through Case Question authoring;
- Case Question scope movement between Case-wide and Case-specific stimulus scope;
- the per-Case choice to make/remove a Case Question reusable for its Topic when that Case-editor authoring choice actually changes persisted state.

If a reusable/shared question is later edited through a global/shared authoring surface, that global edit must not fan out and touch every Case that references it.

### Fixed Case images

Count:

- attach/remove a fixed image;
- reorder fixed images when order actually changes;
- change a Case-specific fixed-image caption.

Uploading/renaming/replacing an underlying global Asset is not by itself a Case edit. If an upload flow immediately attaches the new Asset to a Case, the **attachment** is the Case edit.

### Alternative image / Stimulus Family configuration

Count actual Case-owned changes such as:

- create/update an Alternative/Stimulus group;
- add/restore/remove/reorder an option;
- change Original/Alternative/supporting role/configuration where that is Case-owned state;
- change a Case-specific option caption;
- activate/deactivate Case-owned stimulus configuration;
- create/edit/remove/restore Case-specific group/option questions.

Preserve the current stimulus façade/module ownership and current validation/ownership invariants. This timestamp feature is not authorization to refactor the Stimulus Family architecture.

### Reusable Asset Question Case opt-ins

Count the Case-local relationship/configuration operations that opt a reusable Asset Question into or out of this Case, whether for a fixed image or a stimulus option.

Do **not** count global reusable Asset Question prompt/answer/lifecycle edits as edits to every Case currently opting into that reusable question.

## What MUST NOT count as a Case edit

Do not advance Production Case `updated_at` merely because of:

- global System/Topic rename or hierarchy changes;
- global Tag rename/activation/deactivation;
- global Asset metadata changes, image replacement, R2 lifecycle or deduplication/maintenance;
- global/shared/reusable question edits outside a Case-local relationship/configuration operation;
- learner study/review/progress activity;
- Case deactivation or restoration lifecycle operations;
- Preview-owned Case edits;
- reads, previews, navigation, opening/saving UI state, or other non-content actions;
- creation/import assembly of a brand-new Case beyond its initial database timestamp.

Case lifecycle remains distinct from authored-content recency. Deactivating and later restoring a Case should preserve the date it was last substantively authored.

## Timestamp write architecture

Introduce one narrowly scoped server-side Production Case-authoring timestamp primitive near the DB layer. Exact naming/API should follow current repository conventions, but the semantic responsibility must be clear:

```text
Case-owning writer determines that persisted Case-local state will actually change
        ↓
perform that mutation
        ↓
advance the parent Production Case updated_at as part of the same successful logical operation
```

Requirements:

1. The primitive must target Production Cases only (`preview_session_id IS NULL`) and must not become a second Preview ownership implementation.
2. Callers remain responsible for determining whether a substantive change exists. Do not turn the helper into a broad full-Case diff/fingerprint engine.
3. Prefer support for composing the timestamp update into an existing `db.batch(...)` where a writer already relies on D1 batch/all-set semantics. Do not perform an atomic relationship batch and then a separate best-effort timestamp write that can drift from it.
4. For ordinary single writes, advance the timestamp only after/with the successful substantive mutation.
5. Do not duplicate raw `cases.updated_at = ...` writes throughout unrelated modules if one focused helper/statement builder can preserve the invariant cleanly.
6. Do not add a generic data-access abstraction, event bus, audit table or repository-wide mutation framework for this feature.
7. Do not touch Preview Case timestamps as part of this Production documentation feature. Existing Preview behavior may remain as-is.

Use a single operation time for the related mutation/touch where practical so a batch of statements representing one authoring action has coherent timing.

## No-op, retry and failure semantics

This is an important correctness requirement because the current Case Editor's Save All intentionally is **not** one all-or-nothing D1 transaction across every draft.

Current Save All can persist an earlier draft and then fail on a later draft. The client retains captured drafts so the user can retry. Therefore:

```text
successful earlier substantive draft
→ may legitimately advance Last edited even if a later Save All draft fails

retry of the already-persisted identical earlier draft
→ must NOT advance Last edited again

failing draft that changes nothing
→ must NOT advance Last edited
```

Do not implement one blind route-level "touch Case after successful request" hook. That would misclassify shared/global operations and make idempotent Save All retries appear to be new edits.

Where current writers already know no-op state, preserve/use it. Examples in the current code include same-Primary-Topic early return, bulk relationship writers that already calculate changed Case IDs, and boundary image moves that return without changing order.

Where a Save-All-capable writer currently rewrites equal values, add the minimum persisted-state equality check needed to avoid timestamp-only churn. Compare normalized/canonical values, not raw form formatting where normalization is already part of the writer's contract.

Do not solve no-op detection by loading/fingerprinting the complete Case graph before and after every mutation.

## Bulk-operation semantics

For bulk Case-local changes:

- validate the selection exactly as current code requires;
- determine the subset whose relationship/configuration will really change;
- mutate and timestamp only that changed subset;
- Cases already in the requested state must keep their previous `updated_at`;
- where the current operation is an all-set D1 batch, include the Case timestamp updates in that same batch so relationship state and timestamps cannot diverge.

A mixed selection is an important executable acceptance case.

## Read models

### Case Library

Extend the existing bounded `/admin/cases` read model to return `createdAt` and `updatedAt` directly from the already selected Case rows.

Preserve the current performance/read-model contract:

- filtering/counting/pagination still happen against Cases;
- do not add a per-row timestamp query;
- do not introduce timestamp joins;
- keep the existing page bound and enrichment pattern;
- keep all current search/filter/sort semantics unchanged.

Do **not** add Added/Edited sorting or filtering in this PR.

### Case Editor

Extend the existing Production Case detail/read model so `selectedCase.case` includes `createdAt` and `updatedAt`.

Do not add a second Case-detail query solely for timestamps.

The shared Production/Preview editor component must not imply that this PR established the same documentation semantics for Preview-owned Cases.

## UI presentation

The timestamps are documentation metadata and should remain visually secondary to the Case title/classification.

### Admin Case Library

Do not add another table column. The current table is already carrying Case / Topic / System / Tags / Open and has responsive behavior to preserve.

Under the Case title, show a small muted metadata line similar to:

```text
Added 3 Sep 2026 · Edited 9 Sep 2026
```

Requirements:

- show it for both active and inactive Production Case Library rows;
- keep it inside the Case cell so mobile layout remains coherent;
- keep title, selection checkbox and Inactive badge behavior intact;
- exact-date presentation, not relative text such as "2 days ago";
- no new timestamp column, sort control or filter.

### Production Case Editor header

Near the existing Topic metadata under the title, show a second muted line similar to:

```text
Added 3 Sep 2026 · Last edited 9 Sep 2026, 21:42 SGT
```

Requirements:

- Production editor only;
- preserve current Save All, unsaved-work, return-context and Study Preview controls;
- do not show this Production documentation line in Preview Mode;
- no revision-history interaction or editable timestamp control.

### Date formatting

Use one small shared deterministic presentation helper if that avoids duplicated formatting.

Formatting contract:

- locale: human-readable English Singapore style;
- timezone: `Asia/Singapore` explicitly, so SSR/client rendering does not depend on machine timezone;
- Case Library: date only;
- Case Editor: date + 24-hour time and an explicit Singapore timezone indication (`SGT` or an equivalent unambiguous presentation);
- no new date library dependency.

Prefer semantic `<time datetime="...">` markup where practical. The stored value remains UTC epoch milliseconds / the current Drizzle timestamp representation; this PR changes presentation and maintenance semantics, not storage format.

## Implementation tranches for GPT-5.6 Luna

Implement in this same Draft PR. Do not create a new PR or restart from `main`. First inspect the actual current PR/base/head; if `main` has advanced since this planning commit, reconcile normally before implementation while preserving this plan.

### Tranche 1 — Timestamp primitive + core Case behavior

Establish the narrow Production Case-authoring timestamp helper/statement pattern and make core Case metadata writes idempotent with respect to timestamp advancement.

Prove:

- creation/default timestamps are populated;
- a real core Case edit advances `updated_at`;
- `created_at` remains fixed;
- an identical core update/replay does not advance `updated_at`;
- Preview-owned Cases are not accidentally touched by the Production helper.

### Tranche 2 — Classification / Tags / Questions

Apply the same semantic touch contract to current Production Case-local Topic, Tag, Case Question, question-scope and Case Question Tag authoring.

Preserve current shared Topic/Tag/question semantics: global shared-object changes do not fan out into parent Case timestamps.

For bulk Topic/Tag actions, timestamp only changed Cases and preserve the current batch atomicity model.

### Tranche 3 — Images / Stimulus / reusable-question opt-ins

Apply the Case-local touch contract to current Production fixed-image relationships, Alternative/Stimulus Family configuration, Case-specific stimulus questions/scope changes and reusable Asset Question Case opt-in/out relationships.

Do not touch global Asset/R2 replacement/maintenance or global reusable Asset Question content edits.

Preserve current Production/Preview and Asset/stimulus ownership guards. Do not broaden this into stimulus or storage architecture work.

### Tranche 4 — Read models + presentation

Expose timestamps through the existing bounded Case Library and Case detail read models, add the deterministic Singapore formatter, and render the two requested UI presentations.

Keep the Case Library column/sort/filter model unchanged. Keep Preview Editor timestamp presentation out of scope.

### Tranche 5 — Completion / regression proof

Run focused semantic tests while iterating, then follow current repository-owned checkpoint/handoff validation. Inspect the complete intended-base → current-head diff before handoff and keep the PR Draft until explicitly asked otherwise.

## Executable acceptance contract

Important semantic requirements must be proven at the behavioral layer rather than only by regex/source-inspection tests.

| Invariant | Required behavior | Required executable proof |
| --- | --- | --- |
| Added is immutable | `created_at` is set at Case creation and does not change on later authoring | Current-schema DB fixture creates a Case, performs a real edit, and observes unchanged `created_at` |
| Real Case edit advances recency | A substantive core Case change advances parent `updated_at` | Invoke the real Production Case writer and query the Case row before/after |
| Idempotent replay is not a new edit | Reapplying canonically identical persisted values leaves `updated_at` unchanged | Invoke the same Save-All-capable writer twice with identical canonical data and compare timestamps |
| Failure without mutation is not an edit | Validation/ownership/error path leaves Case timestamp unchanged | Exercise a real failing writer path and observe unchanged Case row |
| Save All partial-success semantics remain truthful | An earlier successful substantive draft may update the timestamp even if a later draft fails; retrying the already-persisted first draft does not create a newer timestamp | Focused executable `actions.saveAll`/route coverage using the existing action behavior, not static source inspection |
| Primary Topic/Tag relationships count | Actual relationship change touches the owning Case | Execute representative real relationship writers and observe parent timestamp |
| Bulk no-op subset stays unchanged | Mixed bulk selection timestamps only Cases whose relationship changed | Real bulk writer test with already-attached/already-target + changed Cases |
| Case Questions count | Creating/editing/removing/restoring/scope-changing representative Case-owned question state touches its Case | Existing current-schema Case Question/question-scope fixture invokes real writer(s) and observes parent timestamp |
| Case-owned image/stimulus state counts | Representative fixed-image and stimulus/option Case-local edits touch Case | Existing image/stimulus DB fixture invokes real writer(s) and observes parent timestamp |
| Reusable image relationship counts but global edit does not | Case opt-in/out touches Case; editing global reusable Asset Question content alone does not | Real opt-in/out and global-question writer coverage against the same related Case |
| Global shared metadata does not fan out | e.g. Tag rename/shared Topic hierarchy/global Asset metadata change leaves related Case timestamp unchanged | Representative real global writer test |
| Lifecycle is separate | Case deactivate/restore leaves last-authoring timestamp intact | Invoke current lifecycle writer and compare `updated_at` |
| Production/Preview boundary holds | Preview authoring does not update a Production Case timestamp and Production timestamp helper cannot target Preview-owned rows | Current Preview/Production fixture or ownership-focused executable coverage |
| Library read stays bounded | Library rows include both timestamps without N+1/per-row reads or altered pagination/filter behavior | Extend current Case Library/read-model performance coverage |
| Editor read exposes timestamps | Production editor data includes both fields through its existing Case data path | Exercise existing `getAdminCaseData`/real consumer coverage |
| UI documents dates | Production Case Library shows `Added`/`Edited`; Production editor shows `Added`/`Last edited`; Preview editor omits the Production timestamp line | Render/component behavior coverage appropriate to current Svelte test conventions; source inspection may supplement but not replace DB semantics |
| Singapore formatting is deterministic | Formatting is independent of host timezone | Focused formatter test using fixed timestamps and expected `Asia/Singapore` output |

Do not create an enormous one-test-per-function matrix if representative executable tests plus existing ownership/facade tests prove a whole semantic family. Conversely, do not leave an entire mutation family untested merely because the timestamp helper itself has unit coverage.

## Existing behavior that must remain intact

- Production/Preview ownership boundaries and current Preview editor behavior.
- One canonical Primary Topic + Case Tags classification model; do not reintroduce Additional Study Topics.
- Existing Case Library bounded reads, paging, filters, sorting, sticky selection/return-context behavior and inactive recovery semantics.
- Existing Case Editor Save All semantics, including partial persistence and authoritative readback behavior.
- Current Case Question/reusable Topic Question behavior.
- Current Stimulus Family/Original/Alternative semantics and module façades.
- Current reusable Asset Question/global Asset ownership semantics.
- Asset identity/history and R2 lifecycle safeguards.
- Existing domain error mapping and SvelteKit redirect handling.

## Explicit non-goals

Do not add in this PR:

- schema migration or new timestamp columns;
- historical timestamp backfill;
- revision/audit log;
- `updated_by`, editor identity or "Last edited by";
- revision diff/history UI;
- learner-facing Case timestamps;
- Added/Edited sorting or filtering;
- relative-time labels;
- timestamp editing controls;
- notifications;
- import-package/schema changes solely to carry timestamps;
- Production deployment or Production D1/R2 mutation;
- Preview timestamp UX;
- unrelated refactors/cleanup.

A future audit-history feature can build on this later, but should use an explicit change-event/user-identity model rather than overloading this PR.

## Luna 5.6 implementation handoff

Use this as the implementation prompt when coding locally in Codex:

> Continue this existing Draft PR and implement `docs/CASE_AUTHORING_TIMESTAMPS_IMPLEMENTATION_PLAN.md` in the same PR. Do not create a new PR, merge, or mark Ready for Review. Inspect the actual current PR/base/head first and follow current root/scoped `AGENTS.md` plus `AGENT_TASK_MAP.md` with progressive retrieval. The key contract is that existing `cases.created_at` is immutable Added time and existing `cases.updated_at` becomes the canonical Production Case-local authoring timestamp: advance it only for successful substantive Case-local changes, never for no-op/idempotent replay, Preview changes, learner activity, lifecycle-only deactivate/restore, or later global/shared-object edits. Preserve Save All's current partial-persistence semantics: earlier successful drafts may legitimately advance the timestamp even if a later draft fails, but retrying already-persisted identical drafts must not advance it again. Preserve existing Production/Preview, Topic/Tag, Question, Stimulus and Asset ownership boundaries. Expose the timestamps through the existing bounded Case Library/detail read models; show `Added … · Edited …` under the Case title in the Library and `Added … · Last edited … SGT` in the Production Case Editor header only, using deterministic `Asia/Singapore` formatting. No migration, backfill, audit log, date sorting/filtering, new dependency, Preview timestamp UI, deployment or production mutation. Use focused executable DB/action coverage for the semantic invariants in the plan; helper/static tests alone are insufficient where the requirement concerns real writer/route behavior. Follow repository-owned focused/checkpoint/final validation and report what actually ran.

## Completion condition

The feature is complete when an Admin can see a stable Added date and trustworthy Last edited date for Production Cases in both requested Admin surfaces, and executable tests establish that `updated_at` changes for real Case-local authoring but not for no-ops, retries, Preview/lifecycle/learner activity, or unrelated global/shared-object maintenance.