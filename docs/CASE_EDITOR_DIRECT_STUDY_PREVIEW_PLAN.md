# Case Editor Direct Study Preview — Implementation Plan

## Status

This Draft PR owns both planning and implementation. Do not create a second implementation PR.

## Goal

When an administrator clicks **Preview in Study** from a Production Case Editor, open a read-only learner-style preview of that exact saved Case directly. Do not send the administrator to the generic `/study` landing page or require them to re-select the System/Case first.

## Product contract

### Case-specific entry

- Both Case Editor preview affordances must target the Case currently being edited.
- Production Admin only: preserve the existing Preview Admin restriction that learner Study is unavailable there.
- The direct preview reflects the current persisted Case. Existing unsaved-work navigation protection remains authoritative; do not invent previewing of unsaved in-browser drafts.
- Default the direct entry to **Original questions**. Preserve the existing Admin Study Preview ability to inspect Expanded Learning where it already exists.

### Read-only learner fidelity

The direct Case Editor preview is an Admin verification surface, not learner activity.

- Reuse the existing Admin Study Preview content-resolution boundary and current learner-facing presentation behavior where safe.
- Show the same Case stem, selected learner images, image order/captions, question order, answer-hidden state, answer reveal behavior, post-reveal Case title behavior, and image inspection interaction that the normal learner Study Review presents.
- Do not create an active Review merely to obtain this rendering.
- Do not show learner rating/completion controls or advance to another Case.
- Provide an obvious **Back to Case Editor** action that returns to the originating Case.
- Keep the generic Admin Study Preview entry from the Admin dashboard working; direct Case Editor entry is an additional focused mode, not a replacement for the generic preview tool.

The implementation should prefer a small shared learner-review presentation boundary if current code makes that straightforward. Do not import the live `/study/[reviewId]` route as a pseudo-component, duplicate learner persistence logic, or introduce a second Study-run architecture merely for preview.

### Persistence isolation

Direct Admin preview must not:

- create/update learner FSRS state;
- create active Reviews;
- create Scheduled Review history;
- update Free Study encounter state;
- change learner preferences;
- write learner aggregates/optimizer evidence;
- submit learner feedback;
- mutate Case/content data.

Preserve the existing Admin Study Preview isolation contract.

### Failure behavior

If the exact Case cannot be previewed under the current learner-content rules (for example missing/inactive/invalid routing content), render a clear Admin-facing preview error with a path back to the Case Editor. Do not silently fall back to `/study`, another Case, or a generic Case chooser.

## Implementation shape

Use the smallest current-code change that satisfies the contract.

Expected direction:

1. Change the Case Editor preview href construction so it carries the exact Case context into the existing Admin Study Preview surface instead of `/study`.
2. Extend the Admin Study Preview loader/resolver only as needed so direct Case entry can resolve the exact saved Case without making the administrator choose it again.
3. Add a focused direct-preview presentation mode that uses learner-review rendering behavior without learner completion/persistence controls.
4. Preserve the existing generic Admin Study Preview controls and route behavior for dashboard entry.
5. Reuse current image serving and read-only snapshot/content-resolution paths. No schema, migration, auth, Cloudflare, R2, or learner-run persistence changes are expected.

Do not pre-commit to exact file/component boundaries in this plan; inspect the actual current repository state and keep the implementation local to the existing Case Editor/Admin Study Preview/learner-review presentation surfaces.

## Acceptance and executable proof

The implementation is complete when all of the following are demonstrated:

1. **Exact navigation** — from a Production Case Editor, clicking **Preview in Study** lands directly on a preview of that exact Case without visiting or requiring interaction with the main Study launcher.
2. **Learner-style interaction** — the preview initially hides answers; reveal exposes the answers and the Case title using current learner Study behavior; image inspection remains available for learner images.
3. **No continuation/rating** — the preview cannot rate, complete, or advance a learner run and has a clear return path to the originating Case Editor.
4. **Isolation** — focused executable coverage proves the direct-preview path leaves the existing learner FSRS/Free/active-Review persistence surfaces unchanged.
5. **Generic preview preserved** — opening Admin Study Preview from the Admin dashboard still supports its existing generic System/Case selection workflow.
6. **Preview Admin preserved** — the existing Preview Mode restriction remains intact.
7. **Failure is explicit** — an invalid/non-previewable direct Case request does not redirect to generic Study or display a different Case.

Add focused automated coverage at the real behavioral layer. In particular, add or extend one focused browser acceptance that opens a Case Editor, clicks **Preview in Study**, verifies the exact Case is shown, reveals answers, exercises image inspection when the fixture has an image, and returns to the Case Editor. Run that focused browser regression once during final handoff and report the result; do not add new browser-testing infrastructure solely for this PR.

Use existing Admin Study Preview isolation tests as the foundation for persistence proof and extend them only where the direct path requires it. Static/source-regex checks may supplement but must not be the only proof of the navigation/rendering behavior.

## Scope

Do not broaden this PR into:

- Study launcher/run redesign;
- FSRS or Free Study changes;
- learner scheduling changes;
- database/schema/migration work;
- new Preview Worker behavior;
- auth/account changes;
- feedback redesign;
- Case Editor navigation redesign;
- broad Study component refactors unrelated to the minimum safe shared rendering boundary.

## Handoff

Keep the PR Draft through implementation and validation. Follow current repository progressive retrieval and repository-owned focused/checkpoint/final validation guidance. Before final handoff, inspect the complete intended-base-to-head diff, run the focused browser acceptance once, run every repository-required final check, and report exact results. Do not merge or mark Ready for Review unless explicitly requested.
