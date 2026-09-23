# PR #201 — Case Editor Tag, Markdown numbering and unassigned-Case preview

## Status and authority

Continue **existing Draft PR #201**, branch `fix-case-editor-tag-discard-warning`, at its **actual current head**. Do not start from `main`, create a replacement PR, merge, deploy or mark Ready for Review. This document is the implementation plan for the *expanded* PR. The original [Tag mutation plan](CASE_EDITOR_TAG_MUTATION_DISCARD_WARNING.md) remains the detailed record of the already-implemented Tag tranche; do not redo that work.

The three product fixes are independent. Implement the two remaining fixes as small, reviewable changes in this same PR. Inspect current code and follow repository `AGENTS.md` / progressive retrieval and validation guidance; paths below are routing hints, not instructions for broad exploration.

## Tranche A — Tag mutations (already implemented; preserve)

The Case Editor's add-existing, create-and-add and remove Tag flows now use the existing `/admin/cases/[caseId]/case-tags` JSON path and update Tag chips/options inline on confirmed success, rather than triggering a native redirect and a false `beforeNavigate` discard confirmation. Keep the endpoint's native-redirect contract for other callers.

Preserve unrelated saveable and structural drafts; real attempts to leave with unsaved work still warn. A failed request must not claim success or lose entered Tag data. Do not globally suppress dirty tracking or rewrite this implementation while completing B/C. Retain its existing focused tests and outstanding real-editor/manual acceptance.

## Tranche B — Sequential numbered-list Markdown in the shared editor

### Observed cause and target

`src/lib/components/MarkdownField.svelte` defines Numbered list with the fixed block prefix `1. `. Its generic `toggleBlock` applies that literal prefix to every selected nonblank line and detects toggle-off only when each line starts with that exact prefix. Markdown preview correctly renders ordered-list numbers, but the **editable source** incorrectly shows `1.` on every line.

In the existing shared Markdown field, clicking **Numbered list** on a selected multi-line range must write sequential Markdown markers (`1. `, `2. `, `3. `, …) in source order. For a single empty/current line, retain the current `1. List item` affordance. Scope the change to the numbered-list branch of the existing toolbar logic; bullet, heading, inline, link, preview and external-value synchronization must retain current behavior.

### Editing semantics

- Number only nonblank lines in the selected/current line range. Preserve content, indentation where already supported, line breaks and blank lines; a blank line must not consume a number. Do not renumber unrelated lines outside the acted-on range or automatically rewrite Markdown on each keystroke/preview.
- A second click on the numbered-list button over an already-numbered selection removes its ordered-list markers even when the values are `2.`, `3.`, etc. Do not prepend another `1. ` to an existing ordered list merely because its lines do not all start with `1. `. Keep the current toggle behavior for mixed selections as far as practicable: preserve line text and do not create duplicate list prefixes.
- Use the existing `commit` and snapshot/selection machinery so one toolbar action is undoable/redoable and the caret/selection remains usable; propagate the changed source through `onvaluechange` to dirty tracking and Save All. Preserve the ability to type Markdown manually, including valid repeated-`1.` notation; no background auto-normalization.
- Do not change Markdown parsing/rendering, saved content migration, add a dependency, or replace the editor.

### Focused proof

Exercise the **real MarkdownField editing behavior**, or the actual toolbar transformation with a small component-level test if that is already how this repo tests it: selected 3–4 lines become `1.`–`4.` in the textarea; click again strips the numbers; blank lines are handled without duplicated markers; single-line insertion works; Undo/Redo and editing-to-preview-to-editing preserve the source. Verify a changed field remains dirty/saveable where the existing Case Editor integration already supplies that coverage. One small manual UI check is sufficient; no broad Playwright suite.

## Tranche C — Direct Admin Study Preview of an unassigned Case

### Observed cause and supported product scope

`src/lib/server/learning/admin-study-preview.js` implements `buildDirectAdminStudyPreview` by searching **System/Topic/Tag learner-route candidates**; if no candidate matches the Case it throws “This Case is not currently eligible for learner study preview.” A Case with a Primary Topic not placed under any System cannot be reached by that search. In addition, `buildActiveReviewSnapshot` → `loadCaseSource` validates a Primary Topic, so merely bypassing the route candidate check does **not** resolve a Case with no valid Primary Topic.

**Required product behavior:** From the Production Case Editor, `Preview in Study` shows the **exact persisted Case** for Admin verification when its Primary Topic has no System assignment. It must not require adding a fake/holding System or Topic. Where a Case genuinely has no Primary Topic but has persisted previewable Case-specific content, support an Admin-only Case-specific preview using the smallest existing read/selection primitives; do not imply that a Topic-dependent learner question pool is available without its Topic. If there are no eligible persisted Original questions or required media/content is unavailable, give a precise Admin-facing error and a Back to Case Editor link rather than silently substituting data. Distinguish “Topic exists but is outside a System” from “no Primary Topic” in fixtures and implementation.

The direct entry uses `/admin/study-preview?mode=direct&caseId=...`. It previews saved content only: unsaved Case Editor drafts must still warn on navigation and must not appear as if persisted. Generic dashboard Admin Study Preview and normal learner Study continue to require their existing valid System/Topic/Tag scope.

### Minimal implementation direction

1. Keep the existing direct-mode route, preview presentation component and return-query/back link. Resolve the Case **by exact requested ID** on the server with Production Admin permissions and active Production/non-Preview ownership checks; do not trust an arbitrary requested ID to expose inactive, Preview-owned or unrelated content.
2. Preserve the existing candidate-based path and snapshot shape for currently eligible/assigned Cases. For an active Production Case with a **valid active Primary Topic but no System route**, obtain its authoritative Primary Topic ID and build the existing Original/core `buildActiveReviewSnapshot` directly with that ID. This removes only the unnecessary System-route requirement for **Admin direct preview**. Keep question selection, fixed/selected stimuli, images/captions/order, limits and failure handling from the existing snapshot code. Do not modify `loadCaseSource` or learner eligibility to admit unassigned Cases globally.
3. Only if the Case truly lacks a usable Primary Topic, consider a **narrow, read-only Admin-only Case-specific adapter**: load the saved Production Case, active Production Case-specific Original question prompts/answers and fixed/Original stimulus content using existing authoritative DB read/selection helpers; shape the result for the existing `AdminStudyPreviewCase.svelte` renderer and authenticated `/api/assets/{id}/image` URLs. Reuse existing Original selection/coverage and snapshot-limit checks where applicable; do not invent Topic/ancestor/Tag/Expanded questions, fake `studyConceptId`, or create a second learner-run engine. If current invariants prevent this state from having previewable persisted content, document that with a focused fixture and return the actionable missing-content error instead of broadening core learner paths.
4. Retain the current direct preview's answer-hidden/reveal/title behavior, image inspection, question/image order and Back to Case Editor context. Preserve the dashboard's generic System chooser and the Preview Worker/Preview Admin restrictions. No active Review, preferences, FSRS, Free Study state, completion, feedback, content writes or migration.
5. Handle missing/inactive Case, inactive/missing question content, and unsafe/non-Production assets with explicit Admin-facing errors. Do not fall back to another Case or silently pick an unrelated System/Topic. Keep all permission and data filtering server-side.

### Required executable proof (focused, not exhaustive)

- DB/resolver test: a saved active Production Case **with an active Primary Topic but no System ancestry** resolves in direct Original preview with the exact ID and expected saved question(s), images/order as applicable; contrast with an assigned Case whose existing behavior is unchanged.
- If a no-Primary-Topic fallback is implemented, test a genuinely missing Primary Topic separately (not just an unassigned System); verify it uses only eligible saved Case-specific Original content and a missing-question case returns a clear error. Otherwise prove/document why this persisted state cannot supply previewable content in the current model.
- Invoke the **actual direct route loader** for the unassigned fixture; assert exact Case, back-link return context, and no learner/content DB writes. Extend `test/admin-study-preview-fsrs-isolation.test.js` or the closest existing focused owner. A helper-only test is not sufficient for the route contract.
- Preserve existing tests for generic preview, valid assigned Case, missing/inactive/non-Production Case, and read-only isolation. For the visible interaction, reuse the existing direct-preview browser acceptance if a suitable seeded local fixture/auth is available; otherwise report it as an explicit manual acceptance step rather than adding a full browser harness.

## Validation, documentation and handoff

Complete B then C, or another small order that avoids redoing tranche A. Use focused tests during iteration, repository-owned final validation at handoff, and one proportional real-editor/manual pass for Tag add/create/remove + retained draft/leave warning, numbered-list toggle/Undo/preview, and unassigned Case direct preview with reveal/back (and image inspection if an image is present). Do not run exhaustive new Playwright suites for these UI fixes. Report **what actually ran** and any unavailable browser fixture/credentials, not hypothetical results.

Before handoff, inspect the full intended-base → current-head PR diff for accidental changes; update PR description to reflect all three fixes and the remaining manual items. Commit/push to the **same branch and PR**. Report exact final head SHA, final validation and exact-head CI separately; the earlier Tag-tranche CI success is not evidence for the expanded head. Leave PR #201 Draft, unmerged, undeployed.
