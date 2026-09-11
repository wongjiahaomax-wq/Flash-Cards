# Case Added / Last Edited Metadata — Implementation Plan

_Status: planning contract for Draft PR #176. First-pass implementation-readiness findings are incorporated here. Feature implementation is intentionally still pending; this same Draft PR remains the implementation vehicle._

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

The current schema already has `cases.created_at` and `cases.updated_at`. The original migration gives both non-null millisecond timestamp fields with database defaults, so this feature does **not** need a schema migration or historical timestamp backfill.

Current Case creation relies on those database defaults. However, current Production authoring does not consistently maintain the parent Case's `updated_at`: core Case fields, Topic relationships, Tags, Case Questions, fixed images and stimulus/image-question relationships are owned by separate writers. Current Case Library and Case Editor read models also do not expose the Case timestamps.

Therefore the feature should reuse the existing fields and establish `cases.updated_at` as the canonical aggregate **Case-authoring timestamp** from this feature onward.

Historical limitation: `created_at` is authoritative for when an existing Case was added. Pre-feature `updated_at` values were not maintained as a comprehensive Case-authoring history, so old Cases may initially show an incomplete historical "Last edited" value. Do not fabricate a backfill or attempt to reconstruct historical edits.

The schema default uses second-resolution `unixepoch()` multiplied to milliseconds. That is acceptable for initial row creation, but timestamp correctness tests must not depend on the default changing within a particular wall-clock interval.

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

### Monotonicity

`cases.updated_at` must be monotonic. An operation carrying an older or equal operation time must never overwrite a newer persisted Case timestamp.

This is a database-write invariant, not a read-then-write convention:

```text
persisted updated_at = max(existing updated_at, operation time)
```

Use an equivalent atomic SQL expression/conditional update at the database write itself. Do **not** read `updated_at` into application code, compare it there, and later issue an unconditional write; that can lose a newer concurrent value.

No-op detection is still required. The monotonic expression prevents time regression; it does not make a no-op into a legitimate edit.

## What MUST count as a Case edit

The implementation must cover the currently exposed Production Admin authoring surfaces in these semantic families. Use current repository routing and actual current writer ownership to locate the complete call sites rather than treating this section as a permanent hard-coded file map.

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

This applies whether the relationship is edited from the Case editor, Case Library, or the separate Production Admin Tags workspace.

Do **not** count global Tag rename/activation/deactivation as edits to every related Case.

### Case Questions and Case-specific question scope

Count actual changes to Case-owned question configuration, including:

- create/edit/remove/restore a Case Question;
- **reorder a Case Question when its order actually changes**;
- prompt/answer changes made through Case Question authoring;
- Case Question scope movement between Case-wide and Case-specific stimulus scope;
- the per-Case choice to make/remove a Case Question reusable for its Topic when that Case-editor authoring choice actually changes persisted state.

A boundary/no-op question reorder must not advance `updated_at`.

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
- **convert an existing stimulus option back to Always shown / supporting**;
- change a Case-specific option caption;
- activate/deactivate Case-owned stimulus configuration when the persisted state actually changes;
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

## Complete Production Admin mutation-entrypoint coverage contract

Before implementation handoff, every **currently exposed Production Admin mutation entrypoint** relevant to Case authoring must be accounted for. Representative family testing alone is insufficient because standalone routes and alternate Admin workspaces can bypass the obvious Case-editor path.

Use progressive repository discovery rather than committing a permanent path/function checklist:

```text
Production Admin server actions + POST mutation endpoints
        ↓
trace inherited/standalone route entrypoints to their real DB writer(s)
        ↓
classify each current writer/entrypoint
        ↓
verify timestamp behavior and executable coverage
```

Classify each current mutation as exactly one of:

1. **touch** — successful execution necessarily creates/changes Case-local authored state. A new Case's initial insert satisfies this through its creation timestamps; do not add a redundant post-create touch.
2. **conditional-no-op touch** — the operation can validly succeed without changing Case-local state; advance the timestamp only for the changed Case(s).
3. **must-not-touch** — the operation changes only global/shared data, lifecycle state, Preview state, learner state, or other non-Case-authoring state.

Discovery must include route aliases/inherited actions and standalone mutation endpoints, not only forms rendered directly by `src/routes/admin/cases/[caseId]`. Known non-obvious boundaries that must be explicitly traced include:

- stimulus-option → Always shown/supporting conversion;
- Case Tags through the Case editor, Case Library bulk flows, and Tags workspace;
- Case-Question-Tag add/remove from the Tags workspace;
- Case Question scope/reorder entrypoints;
- quick-create Topic/Tag flows that combine global-object creation with Case-local assignment;
- upload/create global Asset flows that may or may not also attach the Asset to a Case;
- reusable-question global editing versus per-Case opt-in/out;
- lifecycle deactivate/restore, which is explicitly `must-not-touch`.

This inventory is a **discovery/review checkpoint**, not a second architecture registry. Do not add a permanent source-code list that will silently become stale. Before final handoff, repeat the mutation-entrypoint discovery against the then-current PR head and record the classified inventory concisely in the PR handoff/review notes.

Executable tests do not need one duplicate test per route alias when multiple entrypoints demonstrably delegate to the exact same writer with no extra persistence behavior. However, each non-obvious or independently implemented boundary must have direct behavioral proof, and no current mutation family may remain unclassified.

## Timestamp write architecture

Introduce one narrowly scoped server-side Production Case-authoring timestamp primitive near the DB layer. Exact naming/API should follow current repository conventions, but it must support composition into the actual database atomic unit rather than behaving as a best-effort side effect.

### Atomicity is mandatory

For every substantive Production Case-local transition:

```text
Case-local authored-state mutation
+
parent Case updated_at advancement
=
one atomic D1 persistence unit for that transition
```

Requirements:

1. The primitive must target Production Cases only (`preview_session_id IS NULL`) and must not become a second Preview ownership implementation.
2. Callers remain responsible for determining whether a substantive change exists. Do not turn the helper into a broad full-Case diff/fingerprint engine.
3. If the authored fields live on the `cases` row itself, update the authored fields and monotonic `updated_at` in the **same SQL UPDATE**.
4. If Case-local authored state lives in another table or spans tables, include the Case touch in the **same D1 batch/transactional unit** as the corresponding Case-local state transition. Do not commit the content first and touch afterward, or touch first and then attempt the content.
5. Where an existing writer already has an atomic `db.batch(...)`, add the touch to that exact batch rather than issuing a later write.
6. Where adding the parent touch converts an otherwise single cross-table write into two writes, use an atomic D1 unit for `[authored-state write, Case touch]`. A sequential best-effort pair is not acceptable for Production timestamp truthfulness.
7. Preserve existing mutation semantics on non-D1/test fallbacks. If an existing fallback path remains supported, it must provide equivalent content/timestamp atomicity or compensation; do not silently weaken the invariant just because `db.batch` is unavailable.
8. Do not duplicate raw `cases.updated_at = ...` writes throughout unrelated modules if one focused statement builder/helper can preserve the invariant cleanly.
9. Do not add a generic data-access abstraction, event bus, audit table or repository-wide mutation framework for this feature.
10. Do not touch Preview Case timestamps as part of this Production documentation feature. Existing Preview behavior may remain as-is.

Use one explicit operation time for all statements representing one logical atomic transition where practical.

### Monotonic touch statement

The parent touch must update `updated_at` to the greater of its current persisted value and the supplied operation time **inside the database statement**. The operation time must be usable as a deterministic test input without changing public route payloads.

An older operation time is therefore a valid successful authored-state operation but must leave a newer persisted `updated_at` intact.

### Intentionally partial-persistence writers

Do **not** accidentally change an existing writer's partial-persistence contract merely to simplify timestamp handling.

If a current operation intentionally consists of independently durable steps and a later step can fail after earlier Case-local authored state has persisted:

- each independently durable Case-local transition must atomically carry its truthful timestamp touch;
- a later error must not erase that already-truthful timestamp unless the current writer also rolls the authored state back;
- global/shared preparatory writes that persist without any Case-local state change do not justify a Case touch;
- Save All remains request-level partial persistence across drafts exactly as today.

This means an operation may return an error while a Case timestamp legitimately advanced **only when Case-local authored state also legitimately remained persisted**.

### Compensation/rollback paths

Some current writers deliberately persist an atomic unit, verify postconditions, and compensate if a concurrency/postcondition check fails. For any such flow:

- capture the pre-operation Case timestamp when needed for truthful compensation;
- if compensation restores the Case-local authored state to its pre-operation value, restore the prior Case timestamp in the **same atomic compensation unit**;
- if compensation itself fails and current semantics leave authored state changed, the timestamp must remain consistent with the state that actually remains;
- do not report a compensated no-net-change operation with an advanced Last edited value.

Do not introduce a broad rollback framework; extend only the current compensation boundaries that this feature touches.

## No-op, retry and failure semantics

This is a correctness requirement because the Case Editor's Save All intentionally is **not** one all-or-nothing D1 transaction across every draft.

Current Save All can persist an earlier draft and then fail on a later draft. The client retains captured drafts so the user can retry. Therefore:

```text
successful earlier substantive draft
→ authored state + timestamp persist together even if a later Save All draft fails

retry of the already-persisted identical earlier draft
→ must NOT advance Last edited again

failing draft that changes nothing
→ must NOT advance Last edited
```

Do not implement one blind route-level "touch Case after successful request" hook. That would misclassify shared/global operations, break atomicity, and make idempotent Save All retries appear to be new edits.

Where current writers already know no-op state, preserve/use it. Current examples include same-Primary-Topic early return and boundary reorders that return without changing order.

Where a writer currently rewrites equal values, add the minimum persisted-state equality check needed to avoid timestamp-only churn. Compare normalized/canonical values, not raw form formatting where normalization is already part of the writer's contract.

No-op detection must **not** change existing validation, ownership or error semantics. In particular:

- do not move an equality/no-op return ahead of a guard that the current writer is expected to execute;
- an already-absent relationship removal that currently succeeds should remain a successful no-op, not acquire a new unrelated validation failure;
- an already-equal activation/state toggle must leave `updated_at` unchanged while preserving the writer's existing validation behavior;
- a Case Question/fixed-image/stimulus-option boundary reorder must keep its current no-op result and leave `updated_at` unchanged.

Do not solve no-op detection by loading/fingerprinting the complete Case graph before and after every mutation.

## Bulk-operation semantics

For bulk Case-local changes:

- validate the selection exactly as current code requires;
- determine the subset whose relationship/configuration will really change;
- mutate and timestamp only that changed subset;
- Cases already in the requested state must keep their previous `updated_at`;
- include Case timestamp writes in the same all-set D1 batch/transactional unit as the corresponding relationship writes;
- preserve existing all-set validation, concurrency and compensation semantics.

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

## Clock-deterministic test contract

Every test whose assertion depends on whether `updated_at` changed or stayed unchanged must control time deterministically.

Requirements:

- use the repository's Node 22-compatible test clock facilities or a narrow explicit operation-time injection seam at the timestamp boundary;
- do not change public route payloads merely to inject time;
- do not use `sleep`, polling delays, busy waits, or assumptions that the wall clock advanced;
- do not rely on the schema default's effective one-second resolution to distinguish two operations;
- seed known `created_at`/`updated_at` values where useful and advance the test clock/operation time to exact known instants;
- for no-op tests, choose a controlled candidate operation time that would definitely produce a different timestamp if an accidental touch occurred;
- for monotonicity, apply a newer controlled operation time followed by an older one and assert that the newer persisted value survives.

Creation-default coverage may assert that the database populated timestamps, but edit/no-op ordering assertions must use controlled values.

## Implementation tranches for GPT-5.6 Luna

Implement in this same Draft PR. Do not create a new PR or restart from `main`. First inspect the actual current PR/base/head; if `main` has advanced since this planning commit, reconcile normally before implementation while preserving this plan.

Before Tranche 1, perform the progressive Production Admin mutation-entrypoint inventory described above so the implementation surface is known without creating a permanent hard-coded registry.

### Tranche 1 — Timestamp primitive + core Case behavior

Establish the narrow Production Case-authoring timestamp statement/helper pattern with:

- DB-side monotonic-max semantics;
- deterministic operation-time testability;
- atomic composition with Case-local writes;
- core Case metadata no-op detection;
- Production-only targeting.

Prove:

- creation/default timestamps are populated;
- a real core Case edit advances `updated_at`;
- `created_at` remains fixed;
- an identical core update/replay does not advance `updated_at`;
- an older operation time cannot lower a newer persisted timestamp;
- a forced failure cannot persist content without its touch or the touch without its content;
- Preview-owned Cases are not accidentally touched by the Production helper.

### Tranche 2 — Classification / Tags / Questions

Apply the same atomic/conditional touch contract to current Production Case-local Topic, Tag, Case Question, Case Question reorder, question-scope and Case Question Tag authoring across every current Production Admin entrypoint found in discovery.

Preserve current shared Topic/Tag/question semantics: global shared-object changes do not fan out into parent Case timestamps.

For bulk Topic/Tag actions, timestamp only changed Cases and preserve current batch/compensation semantics.

Add explicit no-op coverage for an already-absent relationship removal and a boundary Case Question reorder.

### Tranche 3 — Images / Stimulus / reusable-question opt-ins

Apply the Case-local atomic/conditional touch contract to current Production fixed-image relationships, Alternative/Stimulus Family configuration, option→supporting conversion, Case-specific stimulus questions/scope changes and reusable Asset Question Case opt-in/out relationships.

Do not touch global Asset/R2 replacement/maintenance or global reusable Asset Question content edits.

Preserve current Production/Preview and Asset/stimulus ownership guards. Do not broaden this into stimulus or storage architecture work.

Add explicit no-op proof for an already-equal state toggle and a boundary image/option reorder, plus direct executable coverage of the standalone option→supporting transition.

### Tranche 4 — Read models + presentation

Expose timestamps through the existing bounded Case Library and Case detail read models, add deterministic Singapore formatting, and render the two requested UI presentations.

Keep the Case Library column/sort/filter model unchanged. Keep Preview Editor timestamp presentation out of scope.

### Tranche 5 — Completion / regression proof

Repeat the Production Admin mutation-entrypoint discovery against the then-current head and confirm every current entrypoint is classified as `touch`, `conditional-no-op touch`, or `must-not-touch`.

Run focused semantic tests while iterating, then follow current repository-owned checkpoint/handoff validation. Inspect the complete intended-base → current-head diff before handoff and keep the PR Draft until explicitly asked otherwise.

Record the final concise mutation classification and test mapping in the PR handoff/review notes rather than adding a permanent hard-coded source registry.

## Executable acceptance contract

Important semantic requirements must be proven at the behavioral layer rather than only by regex/source-inspection tests.

| Invariant | Required behavior | Required executable proof |
| --- | --- | --- |
| Added is immutable | `created_at` is set at Case creation and does not change on later authoring | Current-schema DB fixture creates a Case, performs a real edit at controlled time, and observes unchanged `created_at` |
| Real Case edit advances recency | A substantive core Case change advances parent `updated_at` | Invoke the real Production Case writer with deterministic time and query the Case row before/after |
| Timestamp is monotonic | Older/equal operation time never overwrites newer persisted `updated_at` | Focused executable test applies controlled newer then older operation times and observes the newer value remains |
| Idempotent replay is not a new edit | Reapplying canonically identical persisted values leaves `updated_at` unchanged | Invoke the same real writer twice with controlled distinct candidate operation times and compare timestamps |
| Atomic content/timestamp success | A cross-table Case-local mutation cannot persist independently of its parent timestamp touch | Failure-injection test of the real atomic writer/batch proves content and timestamp commit together |
| Atomic content/timestamp failure | Failure of either statement in the atomic transition leaves neither a one-sided content change nor a one-sided timestamp change | Purpose-built executable batch/transaction failure injection; no production test hook |
| Compensation is truthful | If current post-write verification compensates back to pre-operation Case-local state, the prior Case timestamp is restored atomically | Executable failure/concurrency injection through a current compensating writer verifies both authored state and timestamp return together |
| Partial persistence remains truthful | If an earlier independently durable Case-local transition persists and a later step/request draft fails, its timestamp persists with it | Focused executable writer/Save All failure case verifies persisted state and timestamp agree |
| Save All retry is idempotent | Retrying an already-persisted identical earlier draft after later failure does not create a newer timestamp | Focused executable `actions.saveAll`/route coverage using deterministic time, not static source inspection |
| Complete Production mutation coverage | Every current Production Admin authoring entrypoint is classified touch / conditional-no-op touch / must-not-touch | Final progressive route→writer inventory against current head, recorded in handoff notes; non-obvious independent boundaries have executable tests |
| Primary Topic relationships count | Actual relationship change touches the owning Case; same-target no-op does not | Execute real single/bulk writer paths with controlled timestamps |
| Case Tags count across surfaces | Real Case Tag relationship changes touch the Case regardless of Case editor/Library/Tags workspace entrypoint | Execute the underlying real writer plus independently implemented route boundary where needed; absent removal no-op keeps timestamp |
| Case Question Tags count | Add/remove Case-Question-Tag touches the Case owning that Case Question; absent removal is a no-op | Real Tags-workspace/underlying writer coverage resolves owner Case and observes controlled timestamp behavior |
| Bulk no-op subset stays unchanged | Mixed bulk selection timestamps only Cases whose relationship changed | Real bulk writer test with already-attached/already-target + changed Cases |
| Case Questions count | Create/edit/remove/restore/scope-changing Case-owned question state touches its Case | Existing current-schema Case Question/question-scope fixture invokes real writer(s) with deterministic time |
| Case Question reorder counts conditionally | Successful reorder advances Case timestamp; boundary/no-op reorder does not | Real `moveCaseQuestion` coverage checks changed and boundary paths |
| Case-owned fixed-image state counts | Real fixed-image attach/detach/caption/reorder transitions touch Case when changed | Existing image fixture exercises actual writers; boundary/no-op reorder remains unchanged |
| Stimulus state counts | Real group/option/caption/question/role transitions touch Case when changed | Existing stimulus fixture plus focused independent-boundary tests |
| Option→supporting conversion is atomic | Converting an Alternative option to supporting changes relationship state and Case timestamp as one unit | Direct executable `convertStimulusOptionToSupporting` success + injected failure coverage |
| Equal state toggle is a no-op | Requesting already-persisted active/inactive state does not advance Case timestamp while preserving existing validation semantics | Real toggle writer test with controlled candidate time |
| Already-absent relationship removal is a no-op | Successful removal of a relationship that is already absent keeps `updated_at` unchanged and keeps current success/error semantics | Real Case Tag or equivalent relationship writer coverage |
| Reusable image relationship counts but global edit does not | Case opt-in/out touches Case; editing global reusable Asset Question content alone does not | Real opt-in/out and global-question writer coverage against the same related Case |
| Global shared metadata does not fan out | Tag rename/shared Topic hierarchy/global Asset metadata/global reusable content change leaves related Case timestamp unchanged | Real global writer coverage for the non-obvious shared-object boundaries found in inventory |
| Lifecycle is separate | Case deactivate/restore leaves last-authoring timestamp intact | Invoke current lifecycle writer and compare controlled `updated_at` |
| Failure without Case mutation is not an edit | Validation/ownership/error path that persists no Case-local authored state leaves timestamp unchanged | Exercise real failing writer paths with deterministic candidate time |
| Production/Preview boundary holds | Preview authoring does not update a Production Case timestamp and Production timestamp helper cannot target Preview-owned rows | Current Preview/Production fixture or ownership-focused executable coverage |
| Library read stays bounded | Library rows include both timestamps without N+1/per-row reads or altered pagination/filter behavior | Extend current Case Library/read-model performance coverage |
| Editor read exposes timestamps | Production editor data includes both fields through its existing Case data path | Exercise existing `getAdminCaseData`/real consumer coverage |
| UI documents dates | Production Case Library shows `Added`/`Edited`; Production editor shows `Added`/`Last edited`; Preview editor omits the Production timestamp line | Render/component behavior coverage appropriate to current Svelte test conventions; source inspection may supplement but not replace DB semantics |
| Singapore formatting is deterministic | Formatting is independent of host timezone | Focused formatter test using fixed timestamps and expected `Asia/Singapore` output |

### Failure-injection requirements

At minimum, executable failure injection must prove both of these directions for a real cross-table Case-local transition:

```text
content transition would fail
→ timestamp does not advance

parent timestamp write / later statement in same atomic unit fails
→ Case-local content transition does not remain committed alone
```

Use the current DB fixture/batch/transaction semantics or a purpose-built test adapter that can force a statement failure while observing rollback. Do not add production-only failure switches.

Also exercise at least one current intentionally partial-persistence path where an earlier Case-local unit succeeds and a later step fails, proving that the earlier authored state and its timestamp remain aligned.

Do not create an enormous duplicate one-test-per-route-alias matrix when multiple routes provably delegate to the same already-tested writer with no additional persistence. Conversely, "representative" writer tests are not sufficient to skip independently implemented or semantically non-obvious Production Admin mutation boundaries.

## Existing behavior that must remain intact

- Production/Preview ownership boundaries and current Preview editor behavior.
- One canonical Primary Topic + Case Tags classification model; do not reintroduce Additional Study Topics.
- Existing Case Library bounded reads, paging, filters, sorting, sticky selection/return-context behavior and inactive recovery semantics.
- Existing Case Editor Save All semantics, including partial persistence and authoritative readback behavior.
- Existing writer validation/error ordering and legitimate no-op behavior.
- Current Case Question/reusable Topic Question behavior, including reorder semantics.
- Current Stimulus Family/Original/Alternative/supporting semantics and module façades.
- Current reusable Asset Question/global Asset ownership semantics.
- Asset identity/history and R2 lifecycle safeguards.
- Existing domain error mapping and SvelteKit redirect handling.
- Existing D1 all-set/compensation semantics; timestamp integration must strengthen content/timestamp consistency without silently widening transaction scope across intentionally partial operations.

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
- a permanent mutation-entrypoint registry/checklist that duplicates repository routing;
- a generic transaction/audit/event framework;
- unrelated refactors/cleanup.

A future audit-history feature can build on this later, but should use an explicit change-event/user-identity model rather than overloading this PR.

## Planning-review gate

Do **not** begin implementation immediately after this amendment commit. Perform one more implementation-readiness review of the amended plan against the current repository and PR diff.

That review must specifically ask:

- Can any Case-local authored state still persist without its corresponding timestamp, or vice versa?
- Do compensation and intentionally partial-persistence paths remain truthful?
- Can an older operation time regress a newer timestamp?
- Is every currently exposed Production Admin mutation entrypoint classified?
- Are Case Question reorder, option→supporting conversion, Case Tags and Case-Question-Tags explicit?
- Do no-op preflights preserve existing validation/error behavior?
- Are timestamp-sensitive tests fully deterministic without sleeps/default-resolution assumptions?

Only after that review finds no unresolved High/Medium planning gap should coding begin.

## Luna 5.6 implementation handoff

Use this as the implementation prompt **only after the post-amendment planning review is complete**:

> Continue existing Draft PR #176 and implement `docs/CASE_AUTHORING_TIMESTAMPS_IMPLEMENTATION_PLAN.md` in the same PR. Do not create another PR, merge, or mark Ready. Inspect the actual current PR/base/head and follow current root/scoped `AGENTS.md` plus `AGENT_TASK_MAP.md` with progressive retrieval. Before editing, inventory every current Production Admin mutation entrypoint that can affect Case authoring and classify it touch / conditional-no-op touch / must-not-touch; do not create a permanent hard-coded registry. Existing `cases.created_at` is immutable Added time. Existing `cases.updated_at` is the canonical Production Case-local authoring timestamp. A Case-local authored-state transition and its parent timestamp must commit in the same atomic D1 unit; compensated no-net-change paths must restore the prior timestamp, while intentionally partial persisted Case-local transitions must retain their truthful touch. Timestamp writes must be DB-side monotonic-max so older operation times cannot regress newer values. No-op/idempotent replay, already-absent removals, equal toggles and boundary reorders must not advance the timestamp and must preserve current validation/error semantics. Include Case Question reorder, Tags/Case-Question-Tags, question scope, fixed images, stimulus/option—including option→supporting conversion—and per-Case reusable-question opt-ins. Global/shared edits, learner activity, lifecycle-only deactivate/restore and Preview edits must not fan out touches. Preserve Save All partial persistence and retry semantics. Expose the timestamps through the existing bounded Case Library/detail read models and show the requested `Added`/`Edited` metadata using deterministic `Asia/Singapore` formatting. No migration/backfill/audit log/date sorting/new dependency/Preview timestamp UI/deployment/Production mutation. Timestamp-sensitive tests must use a deterministic clock or explicit operation time—never sleeps or schema-default timing—and must include atomic failure injection, monotonicity, partial-persistence truthfulness and the final current-entrypoint coverage review. Follow repository-owned focused/checkpoint/final validation and report exactly what ran.

## Completion condition

The feature is complete when an Admin can see a stable Added date and trustworthy Last edited date for Production Cases in both requested Admin surfaces, and executable tests establish all of the following:

- real Case-local authoring advances recency;
- `created_at` remains immutable;
- content and timestamp cannot drift across success, failure or compensation;
- intentionally partial persisted authored state retains a truthful timestamp;
- `updated_at` is monotonic under out-of-order operation times;
- no-ops/retries/absent removals/equal toggles/boundary reorders do not create false edits;
- every current Production Admin authoring entrypoint has been classified and the non-obvious boundaries proven;
- Preview/lifecycle/learner/global-shared maintenance does not alter Production Case authoring recency;
- the requested bounded read models and Singapore UI presentation are preserved without schema or scope expansion.
