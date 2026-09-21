# Learner Study UX/UI Redesign — Single-PR Implementation Plan

Status: approved product direction; implementation pending in this Draft PR. This plan is the authoritative scope and acceptance contract for this PR, not a claim of implemented or deployed behavior.

Date: 21 September 2026. Baseline: create this PR from the current main branch; refresh the actual main/head/overlapping PR state before implementation. Current overlapping Draft PR #190 modifies the Case Editor route and Admin Study Preview; do not assume #190 is merged or transplant unfinished changes.

## 1. Goal and locked decisions

Deliver one coherent redesign of the learner Study experience, with all five tranches implemented and validated **within this same Draft PR/branch**. Modern is the default Study launcher; retain the existing full launcher as Classic for learners and testing. On mobile, images remain **above** questions; do not add a persistent View images control or sticky thumbnail.

Agreed scope:
- Render authored Markdown consistently in learner Review and applicable Admin authoring/preview surfaces; add light formatting and Write/Preview affordances to existing Case Editor textareas.
- Modern quick start and Classic launcher.
- Desktop two-column clinical images/questions, reveal/navigation improvements, clearer Case-level FSRS ratings, refinement of the existing image-inspection modal.
- An explicit completion state and a responsive mobile Progress layout.
- Integrated journey/browser testing and final cross-tranche polish in the same PR.

Deliberately excluded:
- Do **not** suppress answers in unrevealed server page data as a separate task. This is a self-directed study application, not an exam. Preserve current reveal, scheduling and frozen-snapshot ownership.
- No individual-question reveal or individual-question FSRS ratings; no new scheduler, algorithm, question selection, content model, schema/migration, R2/media pipeline, auth, or Production/Preview mutation.
- No due-count prominence redesign, permanent review-history changes, bookmarks, full WYSIWYG editor, image annotation, pan/pinch/zoom machinery, or unrelated admin/product refactoring.

Existing runtime, active-Review and FSRS behavior is authoritative over historical plan language. Follow root/scoped AGENTS.md, docs/AGENT_TASK_MAP.md, and relevant repository-owned implementation/testing guidance using progressive retrieval; do not preload every historical plan.

## 2. Implementation rules and work state

1. Continue THIS existing Draft PR at its actual head for every tranche. Do not create another implementation PR, restart from main, merge, deploy, apply migrations, mutate Production/Preview data, or change Draft/Ready status.
2. Establish current main, PR head, intended base, and active overlapping ownership at start. PR #190 covers the direct Case Editor Study Preview; inspect its actual current state before touching shared Case Editor/Admin Preview surfaces. If merged, incorporate the latest main in this PR safely; if open, do not copy its unmerged feature into this branch. Coordinate the smallest shared component change when needed and report a real conflict rather than overwriting its work.
3. Implement tranches sequentially, each as a coherent commit or small related set of commits in this same branch. Record completed scope, relevant files, focused validation, and unresolved issues in the PR conversation/body at each tranche checkpoint. Continue to the next tranche without reopening the architecture unless a material implementation blocker appears.
4. Preserve Classic existing behavior as the regression reference, but do not create two separate planning or runtime architectures. Reuse existing handlers, state/selection logic, backend planner, active-Review and completion owners.
5. Retain current Production/Preview boundaries, current-user browser storage ownership, learner deletion fences, Case Editor Save All/draft reconciliation, and image media authorization. No new persistent data or migration solely for these UI changes.
6. During each tranche use focused tests/visual iteration proportional to its risk. Follow agent:checks for checkpoint/handoff requirements. At final handoff run the repository-required complete validation, one focused integrated browser acceptance pass, and inspect the entire intended-base-to-current-head diff; report exact-head CI separately. Do not claim tests ran unless executed.

## 3. Tranche 1 — Shared clinical Markdown + Case Editor

### Functional behavior
- Add a small, reusable, safe Markdown rendering path for Case vignette/stem, question prompts, answers and learner image captions. Support paragraphs, meaningful newlines, emphasis, headings, ordered/unordered lists, links, code where relevant, and clinical tables without clipping mobile widths. Keep existing plain text readable and preserve source text/snapshot bytes.
- Treat authored Markdown as untrusted input. No raw HTML execution, unsafe URL protocols, inline event handlers or unsanitized dynamic HTML. Prefer one lightweight renderer/sanitization pattern consistently used in SSR and client view; no hand-built regex parser. The same text should render equivalently in learner Review and the relevant Admin learning preview.
- Add a compact Markdown insertion toolbar and Write/Preview affordance to the **existing textarea-driven** Case Editor fields: vignette and Case-wide question prompt/answer first; reuse the same small field treatment for existing image/stimulus and reusable answer fields where editing occurs. Insert formatting at the selection/cursor without replacing an existing unsaved draft. Keep current field length limits and required validation.
- A preview must show the current UNSAVED draft rendered with the same learner rules; it must not save, normalize, overwrite, or silently discard edits. Switching modes, applying toolbar actions and saving must participate in the existing draft state, dirty indicators, Save All, authoritative readback, pending-save reconciliation, and Classic/Compact Case Editor layouts.
- Reuse the current Admin Study Preview where present; do not turn this into a redesign of the separate direct-preview feature owned by PR #190. Apply Markdown to appropriate current preview render paths after checking ownership.

### Executable acceptance
- Use existing representative plain-text and Markdown clinical fixtures (including multiline lists, emphasis and a table). Prove correct learner render and matching Admin preview, readable at phone width.
- Check malicious HTML and javascript-style links remain inert, not executable, using the actual rendering surface.
- Browser/component-level proof that toolbar insertion and Write/Preview preserve an unsaved edit, Save All persists exactly the edited Markdown, and an edit made while a save is in flight is not lost. Exercise the existing Case Editor rather than a disconnected helper only.
- Confirm no content migration, question-eligibility modification, or changed Case Editor save semantics.

## 4. Tranche 2 — Modern default + Classic launcher

### Product behavior
- Modern default: on an ordinary no-active/no-resumable run state, show a concise quick start for **Scheduled Study, all currently eligible Systems, default 10 distinct Cases**, plus a clear Customize session action. Do not mislabel the total selected eligible Cases as due-now. Preserve current server-planner authority and behavior when no eligible content exists.
- Modern customization reuses the existing whole-System/Topic/Tag applied/draft state and Scheduled/Free + 5/10/20/All size selection. Classic retains the CURRENT detailed launcher and its controls, wording/semantics and count behavior as closely as possible for regression testing. Both layouts must feed the SAME existing planner and run lifecycle; do not duplicate form validation, scope computation or browser-run persistence.
- Provide a visible Modern/Classic switch near the top. Persist an explicit user-selected layout as a browser-local per-user preference (gracefully handle unavailable storage); Modern is the default for users with no preference. Support a direct Classic URL override for testing, without making the override silently mutate the persistent preference.
- Active Review, deletion in progress and resumable browser-run state take precedence in **both** layouts. The layout switch must not discard an active Review or a saved session. Opening/canceling alternate-session customization cannot replace a run; replace only after successful authoritative planning and existing safe persistence.
- Preserve stale-route rejection/rehydration, exact Topic hierarchy, overlapping-Case deduplication, all-visible-routes versus whole-System semantics, freshest applied-scope count, count-outage nonblocking planning, and learner access fences.

### Executable acceptance
- Real launcher interaction in both layouts: quick start produces Scheduled/all eligible Systems/10; equivalent customized selections yield equivalent server-plan inputs and session behavior; Classic remains reachable by switch and direct URL.
- Switch Modern↔Classic while editing customization without silently submitting hidden/stale routes or losing a saved session. Persisted preference remains current-user-owned; localStorage failure does not block Study.
- Browser-check Active Review precedence, resume, deletion, zero eligible cases, server stale selection and count failure. Preserve current no-start-before-browser-hydration behavior.

## 5. Tranche 3 — Learner Review layout and controls

### Clinical content layout
- On suitable desktop width, present vignette above the content region, with ordered clinical images on the left and question/answer content on the right. Increase Review content width as needed while keeping the vignette/questions readable. The left image panel may be sticky when viewport permits, but it must not cover controls or become a trapped scrolling region. Preserve all image order/captions and image authorization.
- Image-free Case: full-width questions, no empty image column. Multi-image Case: keep all images accessible and in authored order; do not crop clinical detail. Narrow/mobile: single column with **images above questions**, no persistent image button/thumbnail. Existing click-to-inspect remains available.
- Preserve current whole-Case reveal, the scroll position through reveal, authored Core question display order, selected-question membership/count, Core/Expanded distinctions and continuous Review navigation.
- Make Reveal answers conveniently accessible on long Cases with the smallest non-obscuring control pattern. After reveal show each answer directly under its question and a voluntary Review answers from top action; do not auto-scroll the learner away. Do not add per-question reveal state.
- Scheduled ratings retain Again/Hard/Good/Easy and existing completion request values. Give each comparable visual weight and short factual recall-difficulty descriptions; explain the single rating is for the Case overall, not the percentage of subquestions answered. Free Study retains its current distinct completion, with no implication of Scheduled FSRS changes.
- Refine existing image-inspection modal: sensible desktop size near intended 75vw/75vh when useful, responsive mobile limits, preserve intrinsic image dimensions/aspect ratio rather than force-upscaling small files, retain caption, tap on image and magnifier both open, close/backdrop/Escape work, dialog focus remains inside and returns to the opening control, and touch target is comfortably sized. Reuse the same authenticated media URL; no second pipeline or full zoom engine.

### Executable acceptance
- Focused real Review browser tests with image-free, one-image and multi-image fixtures at desktop and phone widths; inspect diagnostic image readability; reveal does not jump or cover content.
- Test all four rating actions through the current completion owner (Scheduled only), Free completion separately, open-following-Review behavior, and an error retry without double completion.
- Test both image open affordances, caption, close/backdrop/Escape, focus entry/return, and no enlargement above natural image size where dimensions are known.
- Preserve existing tests for frozen title after reveal, question order, progress indicator, feedback, media/auth boundaries.

## 6. Tranche 4 — Session completion + mobile Progress

### Completion
- Show a clear terminal session-complete presentation only when the existing run owner reports genuine completion. Display trustworthy distinct-Case totals from existing run/descriptor data; show repeat count only if reliably derivable without new persistence or a fabricated counter.
- Distinguish Scheduled from Free completion copy. Never present Free completion as Scheduled FSRS advancement. A run waiting for a required repeat, a new-Case limit, an interrupted/resumable run, storage recovery and an opening failure are **not** completion; preserve their distinct existing recovery actions and messages.
- Provide Start another session and Return to Study actions. Do not reset or replace the run merely by viewing a completion screen or choosing to return; use the current terminal cleanup/transition behavior and avoid reviving stale completion summaries on subsequent sessions.
- Keep continuity between Cases and all existing completion idempotency/ownership behavior.

### Progress
- Retain all current Progress metrics, queries, history and definitions. At narrow widths present the five key metrics compactly and convert/augment the horizontal per-System table with readable System cards or equivalent responsive rows. Preserve desktop table and readable long labels, zero states, and accessibility.

### Executable acceptance
- Real Scheduled and Free runs reach distinct accurate terminal summaries; waiting repeat, run-loss and open-failure do not. Starting a new run does not display previous session totals.
- Phone-width Progress displays all existing metrics, System values and history without requiring page-wide horizontal scrolling; desktop values remain unchanged.

## 7. Tranche 5 — Integrated acceptance and final polish

Run a focused, real browser acceptance journey using a local learner plus representative fixture Cases:

sign in → Modern quick start → start/resume → image-free/single-image/multi-image Review → inspect image → reveal formatted clinical answers → rate or complete → next Review → terminal completion → return; repeat relevant launcher/Review checks in Classic and on mobile.

Explicit integration checks:
- Modern/Classic mode switch and URL override; full Classic customization regression; Scheduled/Free, Core/Expanded and 5/10/20/All; overlapping Systems/Topics/Tags; draft Apply/Cancel; stale route/zero-case/count failure; active Review/resume/deletion precedence.
- Admin textarea formatting and live preview → Save All → learner Review shows identical Markdown. If #190 was merged and the direct Case Editor Study Preview exists, verify its read-only learner-style preview remains functional; otherwise do not add that unrelated feature here.
- Desktop/mobile image layout, multi-image order, the original image modal controls, long answers/tables, focus and controls; reveal and four Scheduled ratings; Free completion, repeat waiting, and honest terminal summary.
- Browser storage failure and existing authorization/Preview-isolation invariants where touched.

At each tranche record focused tests/results and unresolved risks in the PR. At final handoff run all checks required by repository-owned agent:checks plus relevant specialized browser tests, review the complete intended-base-to-head diff, inspect exact-head GitHub CI, and document any limitation. Do not merge, deploy, change Draft state, or open another PR.

## 8. Handoff checklist for Luna

- [ ] Tranche 1 implemented, focused proof recorded.
- [ ] Tranche 2 implemented, both launchers use same planner and resume owner.
- [ ] Tranche 3 implemented, desktop/mobile and image/FSRS acceptance recorded.
- [ ] Tranche 4 implemented, completion and mobile Progress acceptance recorded.
- [ ] Tranche 5 integrated journey and final repository-required checks completed.
- [ ] Current-head diff reviewed against intended base, relevant PR #190 overlap reconciled, exact-head CI reported, outstanding limitations stated.
- [ ] This PR remains Draft; no merge, deployment, migrations, or Production mutation.
