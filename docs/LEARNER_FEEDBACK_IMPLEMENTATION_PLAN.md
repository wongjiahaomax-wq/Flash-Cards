# Learner Feedback — Implementation Plan

## Status

Implementation-ready planning contract for the learner-to-Admin content feedback workflow.

This Draft PR owns both planning and implementation. Keep implementation in this PR; do not create a second PR.

Before product-code implementation, synchronize this existing branch with the exact current `main`, keep the PR Draft, then re-read current root/scoped `AGENTS.md`, task routing, migration state, and directly affected routes/tests. At the second planning review, `main` had advanced after this PR was opened and the migration history ended at `0030_learner_account_deletion_integrity.sql`; re-check both facts rather than assuming they remain current. If that migration boundary is unchanged, the expected next migration is `0031`.

Prefer the smallest implementation that satisfies this contract and preserves current learner, Admin, Case-lifecycle, Preview, and account-deletion behavior.

## Product goal

Learners need a low-friction way to report a suspected content problem while studying a Case. Admins need a durable Case-grouped work queue and a way to keep the report visible while editing the relevant active Case.

V1 is intentionally Case-level. It is not a ticketing system and does not target individual questions, images, or other sub-resources.

## 1. Learner UX

### Entry point

Add one secondary **Report an issue** action to the active Review screen.

It is available both:

- before answers are revealed; and
- after answers are revealed.

Keep it visually secondary to the study action. It must not compete with **Reveal answers**, Scheduled Study ratings, or Free Study completion.

### Report dialog

Selecting **Report an issue** opens a lightweight dialog/modal over the current Review with:

- title: `Report an issue`;
- short helper text that the learner can report something incorrect or unclear in this Case;
- one plain-text textarea;
- `Cancel` and `Submit`.

V1 has no:

- question/image selector;
- category;
- severity/priority;
- attachment;
- learner-visible thread;
- feature-specific character limit.

Trim only for blank-input validation. Whitespace-only feedback is rejected. Do not add a product `maxlength`; normal platform/request limits remain authoritative.

Treat learner feedback as plain text. Do not render it as trusted HTML or add Markdown processing solely for this feature.

### Submission behavior

The server derives ownership and Case identity from the authenticated active Review. The browser must not nominate an arbitrary learner or Case.

Use the existing `/study/[reviewId]` ownership/access boundary and keep the write-time check authoritative. The simplest safe persistence shape is a single `INSERT ... SELECT`-style write (or equivalent one-statement D1 boundary) from `active_reviews` keyed by:

- submitted Review id;
- authenticated `user_id`;
- current unexpired/valid active Review state; and
- current deletion/access fences that already make Study unavailable.

That write derives `case_id` and `case_title_snapshot` from the active Review and uses a server/DB timestamp for `reported_at`. Do not implement a vulnerable read-then-unconditionally-insert sequence where the Review can expire/complete or deletion can begin between validation and persistence.

The feedback insert must also fail closed if a permanent learner-account deletion marker is active. Add the narrow database writer guard needed to prevent feedback insertion from racing after permanent deletion has started; do not create a new concurrency subsystem.

While one submission is pending, disable/reject an accidental duplicate submit from the same dialog. Multiple intentional separate reports for the same Case remain allowed; V1 does not deduplicate.

On failure:

- remain on the same Review;
- keep the dialog/text available for correction/retry when still meaningful;
- show a concise inline error;
- create no partial feedback row;
- do not mutate reveal/completion/rating/run state.

After success:

- remain on the same Review;
- close the dialog;
- show a short acknowledgement;
- do not reveal answers;
- do not complete or rate the Review;
- do not advance the run;
- do not otherwise mutate scheduler/study state.

## 2. Durable model and migration

Add one D1-backed `learner_feedback` table using current migration/Drizzle conventions.

Required conceptual fields:

- stable feedback id;
- `case_id`;
- learner `user_id`;
- compact reporter-label snapshot;
- Case-title snapshot from the active Review;
- plain-text feedback body;
- status: `open | resolved | dismissed`;
- `reported_at`;
- nullable `reviewed_at`;
- nullable `reviewed_by` Admin identity.

Use current identifier/timestamp conventions and register the table in the appropriate Drizzle schema/export and migration validation paths.

Recommended referential behavior:

- `case_id` follows the repository's restrictive Case-reference model so feedback survives Case deactivation and does not create a new hard-delete/cascade path;
- `user_id` may use the repository's normal learner-owned `user` FK/cascade convention as a defensive orphan-prevention backstop, while the existing staged account-deletion engine remains the supported destructive path.

Use a status constraint and keep review metadata coherent:

- `open` => `reviewed_at`/`reviewed_by` null;
- `resolved|dismissed` => reviewer/time populated;
- reopen => `open` and clear reviewer/time.

No Case save/edit automatically changes feedback status.

### Reporter label

Admin must be able to identify who reported the issue without depending on a later live-account join. Snapshot the smallest human-readable identity already supported by account conventions: learner display name plus the visible login identifier when needed to distinguish accounts (beta username for beta identities, otherwise email), or an existing equivalent helper. Do not create a profile model or broad account snapshot.

### Account deletion integration

Ordinary disable/ban preserves feedback and its reporter snapshot.

Permanent learner-account deletion removes that learner's feedback using the existing retry-safe staged deletion engine. Do **not** add a new deletion state machine or a new `learner_account_deletions.phase` value solely for this feature; the existing phase column has a database CHECK over the current phase vocabulary.

Integrate feedback through the narrowest existing terminal/final-sweep mechanism so that:

- feedback rows are deleted in bounded staged cleanup;
- the final remaining-row scan cannot reach `identity_ready` while learner feedback remains;
- the direct `user` deletion guard also treats remaining learner feedback as learner-owned data that requires staged deletion; and
- a feedback insert cannot commit after the permanent-deletion marker has become authoritative.

`Clear my study data` remains a study-data reset, not a feedback purge. Do not add learner feedback to that self-service flow.

## 3. Case lifecycle

Case deactivation does not delete feedback. Reports remain visible in the Admin Feedback queue and the Case group is clearly marked **Inactive**.

Current repository behavior does not provide the ordinary Case Editor for inactive Cases; inactive Cases use the existing recovery surface. Therefore:

- active Case => report action is **Open Case Editor**;
- inactive Case => use **Open Case recovery** (or equivalent existing recovery wording), not a fake editable Case Editor;
- do not weaken `requireProductionCase(...)` or make inactive Cases editable for this feature;
- preserve the bounded Feedback return context through recovery;
- after a successful restore, it is desirable to continue to the now-active Case Editor with the originating feedback context/drawer if this fits the existing redirect cleanly; otherwise return to the preserved Feedback queue without inventing another lifecycle path.

There is currently no routine hard Case deletion product flow. Do not add one or add feedback-specific cascade cleanup. Preserve current restrictive Case/FK safety.

## 4. Admin Feedback page

Add Production Admin route:

`/admin/feedback`

Add **Feedback** near **Cases** in the existing Admin sidebar. Do not redesign the sidebar.

### Queue structure

The page is grouped by stable `case_id`.

Default: `Open` + `Newest first`.

Controls:

- `Open`;
- `Resolved`;
- `Dismissed`;
- `All`;
- free-text search;
- Date submitted: `Newest first` / `Oldest first`.

Search at least current Case title and feedback body. Keep groups keyed by `case_id`, so renaming a Case never splits old/new reports into separate groups. When the Case still exists, display its current title as the group heading; use the submission-time Case-title snapshot as fallback/historical context rather than as a second grouping identity.

A Case-title search may surface that Case's status-matching reports. A feedback-body match must not cause unrelated Cases to appear.

### Date sort

After status/search filtering:

- Newest first => groups ordered by newest visible report; reports within group newest first.
- Oldest first => groups ordered by oldest visible report; reports within group oldest first.

Use a deterministic id tie-break for equal timestamps.

### Pagination

Pagination is optional at expected beta scale. Do not add it automatically.

If needed, paginate Case groups after filter/search/group/sort. Never split one Case's visible reports across pages. Preserve page in return state.

### Queue return state

Use bounded/normalized query state, not arbitrary return URLs. Preserve when present:

- status;
- search;
- date sort;
- page.

The same bounded Feedback context is used when entering an active editor or inactive recovery surface and returning.

### Report presentation

Each report shows:

- reporter identity;
- submitted date/time;
- full feedback text;
- status where useful;
- active Case: **Open Case Editor**;
- inactive Case: **Open Case recovery**;
- relevant status actions;
- permanent delete.

Keep it compact. No assignment, comments, replies, priority, or ticket metadata.

## 5. Admin feedback actions

### Resolve

`open -> resolved`, recording reviewing Admin + review timestamp.

### Dismiss

`open -> dismissed`, recording reviewing Admin + review timestamp.

### Reopen

`resolved|dismissed -> open`, clearing review metadata.

### Permanent delete

Allowed from any status. Physically remove the row. Require explicit confirmation that deletion cannot be undone. V1 has no feedback soft-delete/tombstone.

### Bulk delete

Allow selected visible reports to be permanently deleted after confirmation with selected count.

Only explicit submitted ids are eligible. Clear/revalidate selection after mutation and whenever status/search/sort/page context changes so hidden stale selection cannot be deleted.

No bulk resolve/dismiss in v1.

## 6. Case Editor integration

The editor integration must remain unobtrusive and must not lose current unsaved Case work.

### Normal active Case entry

- no permanent Feedback content section/navigation item;
- open reports => subtle `Feedback · N` in existing header/action area, where `N` is open count;
- history but zero open => subtle plain `Feedback` affordance, no warning count;
- no history => control may be omitted;
- entering from Cases does not auto-open Feedback.

### Desktop/two-column drawer

The existing Admin body has a real left navigation column plus gutter on normal desktop widths. The Feedback drawer visually overlays only that left allocation.

It must:

- cover the existing Admin navigation visually without restructuring it;
- use the available space from the Admin body's left edge up to the existing Case Editor/main-content left boundary;
- derive that boundary from the real layout rather than a duplicated stale hard-coded width;
- never cross into the Case Editor main content;
- never resize/reflow/horizontally shift the Case Editor;
- keep Case Editor controls interactive;
- use no disabling modal backdrop;
- remain viewport-stable while the editor scrolls;
- have independent report scrolling;
- keep its close/header controls available;
- minimise nested horizontal padding so feedback text uses the rail width.

Closing it simply reveals the unchanged Admin navigation underneath.

### Narrow/collapsed Admin layout

At the current narrow breakpoint the Admin navigation becomes horizontal and there is no persistent left rail. Use the same drawer component responsively as a near/full-width viewport overlay. It must remain closeable/scrollable and must not reflow the underlying editor. Side-by-side editing is not required at this width.

### Drawer content

Show open feedback first. Each report contains reporter/date/text and Resolve/Dismiss/Delete or Reopen/Delete.

A secondary **View history** affordance exposes resolved/dismissed reports. If only history exists, opening Feedback goes directly to a useful history view.

### Preserve unsaved Case Editor work

Feedback is operational metadata, not Case authoring content. Drawer actions must not trigger a full editor navigation/invalidation that discards or resets the Case Editor coordinator's unsaved drafts, dirty count, local field values, or scroll position.

Prefer a focused feedback endpoint/fetch/enhanced mutation that updates the drawer/count locally. Do not route Resolve/Dismiss/Reopen/Delete through the existing Case Save All pipeline.

If the Case Editor has unsaved authoring changes, the Admin must be able to resolve/dismiss/delete/reopen feedback without those edits disappearing.

### Entry from Feedback queue

For an active Case:

- open the existing Production Case Editor;
- auto-open the drawer;
- surface/highlight the originating report;
- present a clear **Back to Feedback** action;
- preserve normalized status/search/sort/page context.

For an inactive Case, route to the existing recovery surface instead as described above.

Normal Cases return behavior remains unchanged when the editor was not entered from Feedback.

## 7. Production / Preview boundary

Feedback is a Production learner-content workflow.

- `/admin/feedback` is Production Admin only;
- no `/preview-admin/feedback` queue;
- Preview/shared Case Editor must not read/show the Feedback control or drawer;
- Preview cannot resolve/dismiss/reopen/delete Production feedback;
- if a shared named Case-Editor action is introduced, preserve the existing Preview action contract with the required explicit block/403 implementation;
- do not add Preview architecture.

The learner `/study` route is already unavailable on the remote Preview Worker; preserve that boundary.

## 8. Authorization

Learner:

- submit only from own valid authenticated active Review;
- cannot list feedback;
- cannot use Admin feedback actions.

Production Admin:

- list/read;
- resolve/dismiss/reopen;
- delete/bulk delete.

Non-Admin and Preview-only identities must fail at the actual server mutation/read boundary, not only through hidden UI.

## 9. Query/index expectations

Use only indexes justified by the product queries, principally:

- status + reported timestamp;
- Case + status + reported timestamp;
- learner user id for account deletion.

Keep this beta-scale. No queue service, search service, event bus, worker, analytics store, or new concurrency architecture.

## 10. Expected implementation surfaces

Use current file names/patterns after syncing to `main`; do not force these names if repository structure has changed. Expected surfaces are approximately:

- next additive migration + Drizzle schema/export for `learner_feedback` and necessary guards/indexes;
- one focused server DB/helper owner for feedback create/read/status/delete operations;
- `src/routes/study/[reviewId]/+page.server.js` and `+page.svelte` for learner submission UI/action;
- new `src/routes/admin/feedback/` route;
- Admin sidebar link;
- `CaseEditorHeader.svelte` plus one reusable responsive Feedback drawer component and minimal route coordination;
- existing inactive Case recovery route only for return-context integration, not new inactive editing;
- existing learner-account deletion helper/final scan/direct-delete guard integration;
- focused tests at existing route/DB/component layers;
- current living data-model/documentation index updates where repository policy requires them.

Do not refactor unrelated study, Admin, account, Case lifecycle, or layout architecture.

## 11. Explicit v1 non-goals

Do not add:

- email notifications;
- screenshots/attachments;
- question/image-specific feedback;
- categories/severity/priority;
- Admin assignment;
- Admin comment threads;
- learner replies;
- automatic retention/deletion;
- automatic deduplication;
- feedback analytics/dashboard counts;
- automatic resolution after Case edits;
- a separate database/R2 usage;
- new auth architecture;
- new background/concurrency machinery;
- hard Case deletion or inactive-Case editing.

## 12. Executable acceptance contract

Implementation is complete when focused proof establishes these material behaviors at the nearest real boundary.

| Invariant | Required proof |
| --- | --- |
| Before/after reveal submission | Real learner Review surface can submit in both states and creates one durable row. |
| Server-bound Case/learner | Crafted client Case/user identifiers cannot redirect the report; persisted Case/user come from authenticated active Review context. |
| Write-time Review validity | Expired/completed/wrong-owner Review or active deletion fence inserts zero feedback rows, including a race-sensitive write-boundary test where practical at the existing DB layer. |
| Study state isolation | Reporting does not alter reveal/completion/rating/run/scheduler state. |
| Blank/no feature max | Whitespace-only fails; no feature `maxlength`/2,000-character rule is introduced. |
| Plain-text safety | Feedback is rendered as text, not trusted HTML. |
| Deactivated learner readability | Existing feedback remains readable after ordinary learner disable/ban. |
| Permanent learner deletion cleanup | Current staged deletion cannot reach identity deletion while feedback remains; feedback is boundedly removed; final scan/direct-user-delete guard include it; no new deletion phase/state machine is introduced. |
| Admin grouping/search/sort | Multiple Cases prove stable `case_id` grouping, current-title display, status/search semantics, Newest/Oldest group/report ordering, deterministic ties. |
| Pagination, if added | One Case group is never split across pages. |
| Resolve/Dismiss/Reopen | Actual Admin mutations set/clear status and review metadata correctly. |
| Permanent/bulk delete | Physical deletion affects only intended ids; stale hidden selections are not carried across queue context changes. |
| Authorization | Non-Admin cannot read/mutate Admin feedback; Preview does not expose or mutate Production feedback. |
| Bounded return state | Feedback status/search/sort/page are normalized and restored without accepting arbitrary return URLs. |
| Normal editor unobtrusive | Cases entry does not auto-open drawer or insert permanent Feedback content. |
| History reachable | History-only Case can intentionally open Feedback without an open-warning count. |
| Feedback entry | Active Case opened from Feedback auto-opens drawer, surfaces origin report, and retains Back-to-Feedback state. |
| Unsaved editor work survives feedback mutations | Create an unsaved Case edit, perform a drawer Resolve/Dismiss/Reopen/Delete, and prove draft/local field/dirty state remains intact. |
| Desktop geometry | Existing UI harness if available, otherwise focused local visual verification: drawer stays within left rail and editor width/left boundary do not change. Do not add a browser-test framework solely for this CSS invariant. |
| Narrow layout | Existing UI harness if available, otherwise local visual verification: responsive overlay is closeable/scrollable and underlying editor does not reflow. |
| Inactive Case workflow | Feedback remains queued with Inactive state and routes to existing Case recovery, not normal editor; restore/return behavior preserves the feedback workflow without making inactive Cases editable. |
| Case save isolation | Saving/editing Case never automatically changes feedback status. |

Do not substitute helper/source-regex assertions for route/action/database behavior where a current executable boundary already exists. Conversely, do not create heavyweight new harnesses for presentation-only geometry.

## 13. Implementation guidance for GPT-5.6 Luna

Continue this exact Draft PR after syncing its branch to exact current `main`. Do not open another PR.

Implement the reviewed contract using the simplest repository-native approach. Re-check current migration number, current main head, root/scoped guidance, and affected route/test ownership before coding.

During implementation:

- use focused tests while iterating;
- preserve current Production/Preview boundaries;
- preserve current active/inactive Case lifecycle;
- preserve existing Case Editor unsaved-work coordination;
- extend the existing learner-account deletion engine narrowly rather than adding phases/architecture;
- keep feedback creation atomic at the active-Review write boundary;
- avoid unrelated refactors.

At handoff, run the repository-required final validation appropriate to the changed surfaces and report exactly what ran. Keep the PR Draft until implementation review is complete.