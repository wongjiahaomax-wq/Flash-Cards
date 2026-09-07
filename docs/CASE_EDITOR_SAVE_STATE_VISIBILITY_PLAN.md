# Case Editor — Save Persistence and Unsaved-State Visibility Plan

_Status: proposed implementation plan for Draft PR. Implementation must continue in this same PR/branch. Do not mark Ready, merge, deploy, or perform Production/Preview data mutation while the PR contains only planning or while implementation is incomplete._

_Base for planning: `main` at `d4299c795c63e739106d3a5d872d3773550b304f`._

## 1. Goal

Fix the Case Editor save-state UX so an Admin can trust three things at all times:

1. clicking a visible Save control really persists the intended data;
2. after a successful save, the editor becomes clean only for the exact submitted data that the server accepted;
3. when unsaved work exists, the UI identifies exactly what is unsaved and where it is.

This is a focused follow-up to PR #161. Preserve the stable-save, draft-preservation, Save All, exact Case Library return-context, and leave-protection work already implemented there. Do not redesign the authoring model.

## 2. Current findings

### 2.1 The main Save paths are backed by real database writes

Current production Case-editor actions are not cosmetic-only UI operations:

- `Save Case` posts to `?/updateCase`, which calls the canonical `updateCase(...)` database writer for title, vignette, question-selection mode and question count.
- `Save question` posts to `?/saveQuestion`, which calls `saveCaseQuestion(...)` and persists the stable Case-question relationship, prompt identity, answer and Topic-reuse state.
- image captions, alternative-image captions, image-set settings, stimulus questions and reusable image answers all route to existing database mutation functions.

Existing domain tests already verify several of these writers by reading the database after mutation. Preserve these writers and tests rather than creating a second persistence layer.

### 2.2 The current UI does not provide one authoritative model of unsaved work

PR #161 introduced a coordinator for ordinary drafts plus additional leave protection for partially entered structural forms and staged image-picker selections.

However, these surfaces do not currently use the same complete source of truth:

- the header uses `coordinator.dirtyCount()` and can only display a number such as `2 unsaved`;
- ordinary Case/question/image editable forms can show local `Saved`, `Saving…`, `Unsaved changes`, or `Save failed` state;
- leave protection additionally inspects meaningful partially entered structural forms;
- leave protection additionally inspects staged image-picker selections.

Therefore the editor can warn on navigation even when the header appears clean, and the warning cannot tell the Admin what work is at risk.

### 2.3 There is a false-positive pristine-state path

`formHasMeaningfulUnsubmittedInput(...)` currently infers ordinary form dirtiness from DOM `defaultValue`, `defaultChecked`, and `defaultSelected` state.

Some Case-editor controls are initialized or maintained by client state rather than by a matching HTML default baseline. A pristine structural form can therefore compare different from its DOM default state even though the Admin changed nothing.

The fix must establish an explicit pristine baseline rather than weakening leave protection globally.

## 3. Product behavior

### 3.1 One authoritative unsaved-work inventory

Introduce one Case-editor-wide representation of unsaved work. The same inventory must drive:

- the header unsaved indicator;
- Save All;
- navigation/leave protection;
- browser `beforeunload` protection;
- per-section/per-form visual status where applicable.

The inventory should distinguish at least:

- ordinary saveable drafts;
- meaningful partially entered structural/create forms that are not Save-All eligible;
- staged image-picker selections;
- failed saves that remain dirty;
- currently saving drafts.

Do not infer “clean” independently in several consumers.

### 3.2 Unsaved work must be descriptive

Replace count-only visibility with an actionable list.

Examples:

- `Case details — Vignette`
- `Case details — Internal title`
- `Question 2 — Answer`
- `Question 4 — Prompt, Share with Topic`
- `Always-shown image — Caption`
- `Image set “ECG” — Settings`
- `Image-specific question — Answer`
- `Reusable image question — Canonical answer`
- `Add Case question — Prompt and answer entered`
- `Create image set — Name entered`
- `Primary Topic replacement — selection entered`
- `Image picker — 3 images selected`

The UI need not expose internal database IDs. Prefer human-readable section and field labels, with stable logical keys retained internally.

### 3.3 Header affordance

When no work is dirty, the header should not show an alarming unsaved control.

When unsaved work exists, show a clear affordance such as:

`3 unsaved changes`

It must expand or otherwise reveal the exact inventory. Each item should make its section identifiable; linking/scrolling to the affected section is preferred where straightforward and stable.

Save-All-eligible items should be distinguishable from structural partial work that requires its own explicit submit action.

Example semantics:

- ordinary dirty draft: `Unsaved — included in Save all`;
- partial create/structural form: `Not submitted — use this form's action`;
- staged picker selection: `Not attached yet — use Attach`;
- failed save: `Save failed — still unsaved`.

### 3.4 Local visual indication

A dirty ordinary form must remain visibly identifiable at its editing location.

Use concise status treatment rather than a broad visual redesign:

- clean: `Saved`;
- dirty: `Unsaved changes` plus field-specific summary when practical;
- pending: `Saving…`;
- successful completion: `Saved`;
- failure: `Save failed — changes remain unsaved`.

Where an ordinary form contains several fields, identify the changed field(s). A subtle dirty border/background or badge on the affected form/section is acceptable, but do not depend on color alone.

Partially entered structural forms should show `Not submitted` once meaningful input exists.

### 3.5 Leave warning must identify the work

For in-app navigation where a custom confirm dialog/message is available, the warning should summarize what would be lost rather than only saying generic `unsaved Case-editor work`.

Example:

`Unsaved Case-editor work: Case details — Vignette; Question 2 — Answer; Add Case question — Prompt entered. Leave and lose these changes?`

Keep this bounded for many dirty items: show the first few descriptive items plus an `and N more` suffix.

Native browser `beforeunload` text is browser-controlled; preserve the browser mechanism there rather than attempting custom message text that modern browsers ignore.

### 3.6 Save success must mean confirmed server success

A visible `Saved` state must only be shown after a successful action result.

Do not clear dirty state optimistically on button click.

Retain PR #161 snapshot reconciliation:

- capture the exact submitted snapshot;
- allow the server result to become authoritative;
- clear the dirty state only if the current draft still matches the submitted snapshot;
- if the Admin edits again while a save is in flight, the newer draft remains dirty and must not be overwritten by the older successful response.

Apply the same rule to Save All.

### 3.7 Reload persistence is the final proof

For each ordinary save class, tests should prove the full contract:

`edit -> click/submit visible Save action -> server success -> editor clean -> reload/read authoritative data -> saved value remains`

The implementation does not need a second runtime verification request after every save merely to satisfy the UI. The existing server action + authoritative invalidation/reload path can remain the persistence authority. The regression suite must prove that path is wired correctly.

## 4. Required unsaved-item model

Prefer extending the existing coordinator instead of introducing a parallel manager.

Conceptually each registered saveable draft should expose:

- stable logical key;
- human-readable label;
- current dirty field labels;
- dirty state;
- pending state;
- save function;
- optional focus/section target.

The coordinator should be able to return a descriptive collection such as `dirtyItems()` rather than only `dirtyCount()`.

Structural partial work and picker selections may be represented through the same inventory API or through registered non-saveable entries. The important invariant is that all consumers receive one combined inventory rather than reproducing separate DOM scans with divergent semantics.

Avoid storing rendered user content such as the full answer text in the global inventory. Labels and field names are sufficient.

## 5. Structural-form baseline fix

Replace brittle pristine-state inference where needed with explicit snapshots/baselines.

Requirements:

- freshly loaded Case Editor with no user interaction reports zero unsaved work;
- client-side navigation to a Case Editor also reports zero unsaved work;
- Svelte-controlled select/radio/checkbox initialization must not create a false dirty state;
- after a successful structural submit/reload, the new authoritative values become the new pristine baseline;
- meaningful typed/selected structural input still participates in leave protection.

Do not solve this by excluding entire structural form classes from protection.

## 6. Save-path audit scope

During implementation, audit all visible Case-editor controls whose label implies persistence, including at minimum:

### Ordinary coordinated saves

- Save Case;
- Save question for existing Case questions;
- always-shown Case image caption;
- alternative image caption;
- image-set settings;
- existing option/group image-specific questions;
- reusable image canonical answers.

### Explicit structural/lifecycle mutations

These are not necessarily Save-All eligible but their successful action must still persist and their partial input must be visible as unsaved/not submitted:

- Add Case question;
- change question scope;
- Primary Topic/System placement;
- create Topic / add/remove Case Tag;
- create/start image set;
- attach/detach/reorder images;
- add/remove/reorder alternatives;
- create image-specific questions;
- image picker selections and Attach;
- image upload-and-attach;
- activation/deactivation/recovery actions where relevant.

Do not expand this PR into a broad redesign of these structural actions. Audit wiring and integrate their unsaved visibility only where they can contain meaningful pre-submit user input.

## 7. Testing requirements

### 7.1 Pristine-state regression

Add focused coverage for:

- initial fresh editor: zero dirty inventory;
- client-routed editor initialization: zero dirty inventory where test infrastructure permits;
- current Primary Topic/System selectors and other Svelte-initialized controls do not create dirtiness by themselves;
- leaving a pristine editor does not warn.

### 7.2 Field-level dirty descriptions

Test at least:

- edit only Case title -> inventory identifies `Case details — Internal title`;
- edit only vignette -> identifies `Case details — Vignette`;
- edit only Question answer -> identifies the exact Question + `Answer`;
- change Question prompt and reuse toggle -> identifies both fields;
- edit one image caption -> identifies that exact caption context;
- partially type Add Case question -> identifies a non-saveable/not-submitted structural item;
- stage picker selection -> identifies picker work.

### 7.3 Save behavior

For each ordinary save class represented in the coordinator:

- dirty before submit;
- pending while request is in flight;
- success clears only the submitted snapshot;
- failure leaves it dirty;
- edit-after-submit stays dirty after the older save succeeds;
- Save All follows the same snapshot rule.

### 7.4 Persistence proof

Retain existing domain DB tests and add/extend focused route/integration coverage so the visible Save actions are tied to the canonical writer.

At minimum prove end-to-end persistence for:

- Case details;
- existing Case question;
- one representative coordinated image field (caption or image-specific answer);
- reusable image canonical answer if practical within current test infrastructure.

A deliberate authoritative reload/read after save should reproduce the stored value.

### 7.5 Leave-protection consistency

Verify that:

- header inventory and navigation guard agree on whether unsaved work exists;
- no warning when inventory is empty;
- warning when any saveable dirty item exists;
- warning when a meaningful non-saveable structural draft exists;
- warning when staged picker selection exists;
- after successful save/submit of the last item, warning disappears;
- bounded warning text names the affected item(s) for in-app navigation.

## 8. Implementation sequence

### Tranche 1 — Characterize and reproduce

Add failing focused regressions for the pristine false-positive and the header/leave-guard disagreement before changing behavior.

Audit visible Save controls against their route actions and canonical DB writer. Record any real persistence wiring gap as a blocking finding; do not assume all controls are correct merely because the common ones are.

### Tranche 2 — Descriptive coordinator entries

Extend the coordinator registration contract so ordinary drafts can expose labels and dirty fields while preserving existing save/pending behavior and stable logical identity.

Update Case details and existing Case questions first because they already have explicit snapshot models.

### Tranche 3 — Coordinated image forms

Extend `registerCaseEditorForm(...)` or its caller contract so captions, image-set settings, image-specific questions and reusable answers register human-readable labels and field-level dirty state without losing their current generic stable-enhance behavior.

### Tranche 4 — Structural partial-work inventory

Unify meaningful structural forms and staged picker selections into the same editor-wide inventory used by the header and guard.

Establish explicit pristine baselines so client-initialized values do not look edited.

### Tranche 5 — Header and local UX

Replace the count-only header with the descriptive unsaved-work affordance.

Add concise local dirty/saving/saved/failed treatment and field-level summaries where appropriate.

### Tranche 6 — Persistence and reload verification

Add focused tests that connect visible Save forms to server action success and authoritative persisted values after reload/read.

Do not introduce extra production database writes solely for verification.

### Tranche 7 — Final reconciliation

Run focused Case-editor tests during development, then repository-required validation for the final handoff.

Inspect the complete diff against current `main` and reconcile this planning document's status after implementation. Keep the PR Draft unless explicitly instructed otherwise.

## 9. Acceptance criteria

The PR is ready for review only when all of the following are true:

1. Open a Case Editor and make no changes -> no unsaved indicator and no leave warning.
2. Edit one field -> the exact section/field is visibly identified as unsaved.
3. Edit several fields/forms -> the header lists each logical dirty item.
4. Save one item -> only that successfully persisted submitted snapshot becomes clean.
5. Save fails -> the item remains dirty and visibly reports failure.
6. Edit while save is in flight -> the newer edit remains dirty after the older response succeeds.
7. Save All persists all saveable dirty items without falsely claiming structural partial forms were saved.
8. Partially entered Add/Create forms are visibly marked `Not submitted` and participate in leave protection.
9. Staged image-picker selections are visible in the same unsaved-work inventory.
10. Leaving with unsaved work identifies what would be lost for in-app navigation.
11. Reload after successful Case details save reproduces the saved values.
12. Reload after successful existing Case-question save reproduces the saved prompt/answer/reuse state.
13. Representative image/coordinated save persists across reload/read.
14. Header, Save All and leave protection agree on the same unsaved-work inventory.
15. Existing PR #161 stable navigation, return-context, draft-preservation and Preview/Production boundaries remain intact.

## 10. Non-goals

- no schema or migration changes;
- no Production/Preview data mutation for testing;
- no deployment in this PR without separate explicit instruction;
- no per-keystroke autosave;
- no browser-local long-lived draft persistence;
- no wholesale Case Editor visual redesign;
- no replacement of canonical database writers;
- no weakening of question, stimulus, taxonomy, Case Tag, Preview or lifecycle invariants;
- no change to learner Study semantics.
