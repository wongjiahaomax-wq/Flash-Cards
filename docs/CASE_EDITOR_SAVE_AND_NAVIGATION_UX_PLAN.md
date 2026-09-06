# Case Editor — Stable Saving, Draft Preservation, and Case Library Return Plan

_Status: implementation in progress on Draft PR #161. Return-context plumbing, stable Case/Case-question drafts, Save All coordination, and leave-loss protection are implemented; image/stimulus draft coverage and final handoff verification remain._

_Base used for planning: `main` at `a1fd0098d83c2e0e619322a41a9cb713908ded22`._

## 1. Goal

Fix the three related Admin authoring problems observed in normal Case editing:

1. routine Case-editor saves cause the page/viewport to jump because many POST actions redirect and reload editor data;
2. editing multiple fields/forms and then saving one of them can discard the other unsaved browser edits because the editor is split across independent forms;
3. returning from a Case editor to the Case Library briefly shows the wrong/unfiltered state before the remembered System/Topic/etc. filters are restored.

The target experience is a stable editor where an Admin can make several ordinary edits, save without losing unrelated work or moving around the page, and return directly to the exact Case Library context they came from.

The same return-context contract must cover both active Case editing and inactive Case recovery so active/inactive transitions do not drop the Case Library working state.

## 2. Current behavior confirmed during planning

### 2.1 Case Editor mutations are fragmented

The shared Case editor is composed of multiple independent forms/actions:

- Case details have their own `?/updateCase` form;
- each existing Case Question has its own `?/saveQuestion` form;
- Topic/System placement, Case Tags, image/stimulus operations and other authoring mutations use additional independent forms/routes;
- most successful actions redirect back to the Case editor, often with a status query and sometimes a section/hash target.

Therefore an edit made in form A exists only in browser DOM/state until A is saved. Saving form B can reload authoritative server data and replace A's unsaved value.

Partially entered structural creation forms have the same vulnerability even though they are not ordinary persisted drafts yet. Examples include Add Case question, Case-specific Image Question creation, and new image-set/group creation forms: another mutation or navigation can currently remove the typed-but-not-submitted input.

Question reordering already has a narrow enhanced-submit/scroll-preservation path. That proves the editor can update authoritatively without accepting the normal redirect jump, but the behavior is not generalized to ordinary saving.

### 2.2 Case Library fallback restoration is visibly late

The Case Library is URL-authoritative but also persists its working state in browser `localStorage`.

When the editor's current **All Cases** link returns to bare `/admin/cases`, the server first renders the default Case Library. The client then reads stored state in `onMount()` and may navigate again to the remembered filtered URL. This causes the visible filter flash and an avoidable second Case Library read.

The fix should carry an exact, validated Case Library return context into the editor and use `localStorage` only as the fallback for direct/bare Case Library visits.

This applies to both:

```text
/admin/cases/[caseId]
```

and the inactive recovery flow:

```text
/admin/cases/[caseId]/recovery
```

including the recovery Back path and relevant restore/deactivation transitions between active and inactive Case surfaces.

## 3. Product decisions

### 3.1 Routine saves must not behave like page navigation

Ordinary content saves should:

- remain on the current Case editor;
- preserve scroll position;
- preserve focus where practical;
- avoid hash-driven jumps solely to show that a save succeeded;
- show local save state such as `Unsaved`, `Saving…`, `Saved`, or an error;
- re-read/reconcile authoritative server data as needed without a visible full-page jump.

Do not add per-keystroke server autosave.

### 3.2 Unsaved edits must never be silently discarded by another editor action

Introduce an editor-wide notion of dirty/draft state for ordinary editable content.

At minimum cover the ordinary fields that can currently be edited before pressing an explicit Save button:

- Case title;
- vignette/stem;
- question-selection mode/count;
- existing Case Question prompt/answer/reuse state;
- existing image/stimulus question or caption/group fields where the current UI presents them as ordinary editable Save operations rather than structural lifecycle mutations.

A server refresh/revalidation caused by saving or mutating another section must not overwrite a dirty local draft.

Draft reconciliation must handle identity-changing successful saves. In particular, editing an existing Question **prompt** may cause the saved relationship to return with a different `questionPromptId`; the local draft/save coordinator must reconcile the old local identity to the authoritative saved identity without losing the edited prompt/answer state, duplicating the draft, or leaving a phantom dirty record.

A successful save applies only to the exact logical-draft snapshot that was submitted. If draft A is submitted and the user changes that same draft to B while A is still in flight, A succeeding must not overwrite B or mark B clean. Prefer snapshot/version reconciliation: capture the submitted snapshot (and stable logical identity/version), then clear dirty state only if the current draft still matches that successfully submitted snapshot. If implementation instead freezes input for that logical draft while it is in flight, the frozen state must be explicit and bounded to that draft. This rule applies equally to section saves and Save All.

Partially entered structural creation forms also count as unsaved work for loss-prevention purposes even though they need not participate in Save All. Examples include:

- Add Case question;
- Case-specific Image Question creation;
- new image-set/group forms;
- comparable create/add forms where the user can type/select meaningful input before submitting.

For these partially entered forms, another mutation, revalidation, or navigation must either preserve the entered values or explicitly block/warn. Never silently discard them.

If a particular structural action cannot safely preserve an unrelated dirty draft or partially entered creation form, fail safe: block/warn before the action rather than silently discard the work.

### 3.3 Provide a real Save All path

Add a clear editor-level **Save all changes** affordance for dirty ordinary content.

Requirements:

- it attempts every currently dirty draftable section/record;
- it does not silently report success if only part of the dirty set was persisted;
- successful drafts become clean only after confirmed server success **and only when the current draft still matches the successfully submitted snapshot**;
- if the user edits a submitted draft while its Save All request is in flight, the newer value remains dirty and must not be overwritten by the older successful response;
- failed drafts remain dirty with actionable error state;
- unrelated dirty drafts remain intact if one save fails;
- after a successful Save All, a deliberate browser reload must reproduce all saved values from the server.

Section-level Save controls may remain where useful, but saving one section must no longer destroy another section's draft.

Partially entered structural creation forms are not required to be included in Save All. Their contract is preservation or explicit blocking/warning, not automatic submission.

Prevent overlapping save operations from submitting the same draft concurrently. A section-level save and Save All, or two overlapping Save All/section-save attempts, must coordinate so one logical draft is not posted twice at the same time. The UI should expose a clear in-progress state and either serialize, coalesce, or disable conflicting submission paths until the relevant draft completes.

The implementation may reuse existing server actions/helpers rather than creating a second authoring model. Do not introduce schema changes merely to implement Save All.

### 3.4 Structural authoring actions remain distinct

Do not collapse relationship/lifecycle operations into the ordinary draft transaction merely for UI convenience.

Examples that should remain explicit operations include:

- changing Primary Topic or global System placement;
- adding/removing Case Tags;
- adding/removing/reordering images or stimulus options;
- changing question scope;
- creating/removing questions;
- activation/deactivation/lifecycle operations.

These operations should use the same stable mutation UX where practical and must preserve unrelated dirty drafts and partially entered structural creation forms. Destructive/current-authority guards and existing Production/Preview semantics remain unchanged.

### 3.5 Warn on leaving with unsaved work

If dirty drafts or partially entered structural creation forms remain, navigating away from the Case editor must not silently lose them.

Use the appropriate browser/SvelteKit leave protection for:

- browser Back/Forward;
- clicking **All Cases** / **Back to Cases** or another internal route;
- refresh/close where browser `beforeunload` semantics apply;
- active ↔ inactive Case transitions where the navigation itself would replace the current editor/recovery surface.

Do not show leave warnings when the editor has no dirty draft and no meaningful partially entered creation form.

### 3.6 Return directly to the exact Case Library context

Opening a Case from a filtered Case Library must carry enough canonical return state to reconstruct the exact library URL, including where present:

- `q`;
- `topic`;
- `system`;
- `tag`;
- `sort`;
- `lifecycle`;
- `page`.

The active Case editor's **All Cases** / **Back to Cases** path and the inactive recovery page's Back path should use that canonical return URL directly.

Requirements:

- explicit Case Library URL state remains authoritative;
- direct/bookmarked active Case and recovery visits still work without return context;
- direct visits may continue to rely on existing Case Library `localStorage` fallback when the user later goes to bare `/admin/cases`;
- return context must be normalized/validated as Case Library state, not accepted as an arbitrary open redirect URL;
- editor/recovery mutation URLs and redirects must preserve the return context until the user leaves the Case flow;
- an inactive Case opened from an inactive filtered Case Library must return directly to the exact prior inactive `q/topic/system/tag/sort/lifecycle/page` state;
- restore transitions from `/admin/cases/[caseId]/recovery` back to the active Case surface must retain the same canonical return context so the later Back/All Cases navigation still returns to the originating library state unless the product deliberately changes lifecycle context;
- deactivation transitions from an active Case editor into inactive/recovery handling must likewise retain the canonical return context rather than dropping it;
- tests must cover both Back paths and the relevant restore/deactivation transition plumbing.

## 4. Protected invariants

Preserve all current authoring semantics from `docs/AUTHORING_MODEL.md` and Admin scoped guidance:

- exactly one canonical Primary Topic per current Case;
- zero or more Case Tags for cross-cutting classification;
- no resurrection of Additional Study Topic authoring;
- current Case/Stimulus/Reusable Image Question scope semantics;
- Production/Preview ownership and mutation isolation;
- no schema or migration change unless implementation evidence proves one is genuinely required (none is expected);
- no production D1/R2 mutation for testing;
- no new global autosave/background mutation loop;
- no weakening of current validation/error mapping or destructive-operation guards.

The shared Production/Preview Case-editor component must remain shared. Do not fork a second Preview editor.

## 5. Scope and non-goals

### In scope

- Case-editor client interaction/state needed for dirty drafts, stable saving and leave protection;
- protection/preservation state for partially entered structural creation forms;
- minimal action/result plumbing needed to support stable saves, in-flight snapshot reconciliation and identity reconciliation;
- exact Case Library return-context plumbing across active editor and inactive recovery flows;
- focused regression tests and browser/manual verification;
- minor save-status UI needed to make state understandable;
- final documentation status/authority reconciliation after implementation.

### Out of scope

- schema/migrations;
- changing medical/content semantics;
- redesigning Topic/Tag/image/question ownership;
- replacing the whole Admin data layer;
- broad Case Library database optimization without evidence of residual query latency after the duplicate-navigation fix;
- per-keystroke server autosave;
- offline editing or long-lived draft persistence across browser restarts;
- unrelated Admin visual redesign.

## 6. Implementation sequence for Luna in local Codex

After the user approves this plan, continue this same Draft PR. Do not create a replacement PR, mark Ready, merge, deploy, or perform Production/Preview data mutation.

Use current repository routing/progressive retrieval. Start from the directly affected Case editor/recovery surfaces, Case Library state helper, current Admin actions, and directly related tests; broaden only when a protected boundary or unresolved implementation question requires it.

### Checkpoint 1 — Characterize the failure modes

Before changing behavior, add/extend focused tests that prove the current contracts and the required new ones.

Cover at minimum:

- filtered active Case Library → Case editor carries canonical return state;
- filtered inactive Case Library → `/admin/cases/[caseId]/recovery` carries canonical return state and its Back path returns directly to that exact state;
- relevant restore/deactivation transitions preserve the canonical return context across active/inactive Case surfaces;
- Case editor/recovery return state cannot become an arbitrary external URL;
- dirty editor field A is not allowed to disappear when field/form B saves;
- meaningful partially entered structural creation input is not allowed to disappear because another mutation/revalidation occurs;
- successful routine save does not require a normal page navigation/hash jump;
- editing an existing Question prompt and receiving a changed `questionPromptId` has an explicit reconciliation contract;
- overlapping section-save/Save-All attempts cannot concurrently submit the same logical draft;
- edit a logical draft after its save snapshot is submitted but before the response returns; success for the older snapshot must leave the newer current value intact and dirty;
- the same in-flight edit rule holds for a draft submitted as part of Save All;
- Preview editor still cannot gain Production-only mutation authority.

Keep characterization focused; do not build a broad browser framework solely for this PR.

### Checkpoint 2 — Exact Case Library return context

Implement the smallest canonical return-context path using the existing Case Library state/normalization owner where possible.

Required active behavior:

```text
/admin/cases?<working-state>
→ open Case
→ edit/save as many times as needed
→ All Cases
→ /admin/cases?<same-working-state>
```

Required inactive/recovery behavior:

```text
/admin/cases?<inactive-working-state>
→ /admin/cases/[caseId]/recovery
→ recover/inspect/restore as applicable
→ Back to Cases
→ /admin/cases?<same-canonical-working-state>
```

Restore/deactivation transitions must carry the same normalized return context through any active ↔ inactive Case surface transition so a later Back/All Cases action does not fall back to bare `/admin/cases` or lose `q/topic/system/tag/sort/lifecycle/page`.

The return should be one direct Case Library navigation, not:

```text
/admin/cases
→ render defaults
→ localStorage restore
→ second filtered navigation
```

Preserve the return context through editor and recovery mutations.

### Checkpoint 3 — Shared stable mutation behavior

Extract/reuse a small Case-editor mutation enhancement pattern instead of implementing bespoke scroll code in every component.

For ordinary successful mutations:

- intercept the redirect/result in the client;
- reconcile current authoritative data;
- preserve scroll and relevant focus;
- keep the user on the same logical editor surface;
- retain existing server error semantics;
- do not clear unrelated drafts or partially entered creation forms.

The shared mutation coordinator must also:

- expose enough in-flight state to prevent the same logical draft from being submitted concurrently by overlapping save controls;
- bind each request to the submitted logical-draft snapshot/version;
- on success, clear dirty state only if the current draft still matches that submitted snapshot (or use explicit per-draft input freezing instead);
- never let an older successful response overwrite a newer edit made while the request was in flight.

Reuse or generalize the existing question-reorder scroll-preservation behavior rather than maintaining two competing patterns.

### Checkpoint 4 — Case-details draft state

Make Case details explicitly draft-aware.

A user must be able to change title/vignette/review settings, then perform another editor save/action, and still see the unsaved Case-details values until they deliberately save or discard them.

Also prove the in-flight rule on this bounded base pattern: submit Case-details snapshot A, edit the same logical draft to B before A completes, and ensure A's success leaves B visible and dirty rather than clearing or overwriting it.

Add dirty/save-state UI and focused tests for this section first because it is bounded and provides the base pattern.

### Checkpoint 5 — Existing question draft state

Apply the same semantics to existing editable questions.

Required scenarios:

- edit Question 1 and Question 2;
- save Question 1;
- Question 2 remains visibly dirty and unchanged in the browser;
- save Question 2;
- reload confirms both server values;
- failures leave the failed draft editable and dirty;
- edit an existing Question **prompt**, save it, and correctly reconcile the local draft if the authoritative saved Question now has a different `questionPromptId`;
- after identity change, no duplicate/phantom dirty entry remains and subsequent edits/saves target the new authoritative identity;
- if the question is edited again while its submitted snapshot is still in flight, the older success may reconcile authoritative identity as needed but must preserve the newer local values and keep that logical draft dirty until those newer values are saved.

Cover Case-wide questions first, then apply the same shared mechanism to existing image/stimulus question fields presented as ordinary Save edits.

Do not change question-scope semantics while doing this.

### Checkpoint 6 — Remaining ordinary draftable image/stimulus fields

Audit the Advanced image editor for existing text/configuration Save forms such as captions, existing group metadata, and existing stimulus question edits.

Where they are ordinary editable fields rather than structural lifecycle operations, bring them under the same dirty/stable-save contract, including the same submitted-snapshot/in-flight reconciliation rule.

Also identify structural creation forms on the image/stimulus surface where meaningful unsubmitted input can exist. Those forms do not need to join Save All, but register/preserve their unsaved-work state so another mutation/navigation cannot silently erase them.

Do not broaden this checkpoint into Asset lifecycle or R2 behavior changes.

### Checkpoint 7 — Save All

Add an editor-level Save All coordinator over the dirty draftable records established in checkpoints 4–6.

The exact implementation mechanism should reuse current actions/helpers and current repository patterns. The acceptance contract matters more than introducing a new abstraction.

Save All must:

- know the complete current dirty set of Save-All-eligible drafts;
- capture the exact submitted snapshot/version of each logical draft in that run;
- persist every dirty record or clearly identify failures;
- never clear an unsaved/failed draft merely because another record succeeded;
- clear a successful draft only when its current value still matches the successfully submitted snapshot;
- if a user edits a participating logical draft while Save All is in flight, preserve the newer value and leave that draft dirty after the older snapshot succeeds;
- avoid visible page jumps;
- end globally clean only when every current draft is actually represented by a confirmed successful submitted snapshot;
- serialize/coalesce/disable conflicting submissions so a section Save and Save All cannot post the same logical draft concurrently;
- reconcile identity-changing saves, including existing Question prompt edits that return a new `questionPromptId`, before proceeding with later operations against that draft without overwriting any newer in-flight edit.

Partially entered structural creation forms are outside the Save All submission set and must not be auto-submitted by Save All. Their unsaved-work state must remain intact while Save All runs, or Save All must block safely if preserving them is not possible.

Do not claim atomic all-or-nothing semantics unless the implementation truly provides them. If saves can partially succeed, the UI/test contract must expose that accurately and keep failed or subsequently edited drafts dirty.

### Checkpoint 8 — Structural actions and leave protection

Apply the stable-mutation/draft-preservation rule to structural actions that currently revalidate/redirect the editor.

For every materially used operation, verify one of these outcomes:

```text
dirty drafts and meaningful partially entered creation forms safely survive the operation
```

or, where preservation cannot be made safe without broadening architecture:

```text
operation is blocked with a clear unsaved-changes warning until the work is saved, submitted, discarded, or cancelled
```

This includes structural creation forms such as Add Case question, Case-specific Image Question, and new image-set/group forms. They need not be part of Save All, but another mutation/navigation may not silently reset them.

Apply the same rule to active/inactive lifecycle transitions, including deactivation and recovery/restore flows.

Never allow silent loss.

Add editor-leave protection only when dirty state or meaningful partially entered creation input exists.

### Checkpoint 9 — Integrated UX/performance verification

Run the repository-selected final validation and perform focused browser verification.

Confirm:

- routine saves do not visibly jump the page;
- saving one section does not erase dirty values elsewhere;
- Save All persists all dirty ordinary edits;
- failed saves preserve recoverable drafts;
- edits made after a save snapshot is submitted remain visible/dirty when the older response succeeds;
- the same in-flight edit protection holds during Save All;
- existing Question prompt edits reconcile correctly when `questionPromptId` changes;
- overlapping section-save/Save-All attempts cannot double-submit the same draft;
- structural operations do not silently discard drafts or meaningful partially entered creation forms;
- clean editors do not produce nuisance leave prompts;
- dirty/partially-entered editors warn before destructive navigation away;
- returning to Cases from an active Case lands directly on the previous System/Topic/Tag/search/sort/lifecycle/page state;
- returning from inactive `/admin/cases/[caseId]/recovery` lands directly on the exact prior inactive Case Library state;
- relevant restore/deactivation transitions retain return context across active/inactive Case surfaces;
- direct active Case and recovery visits remain valid;
- Preview boundaries remain intact;
- no duplicate Case Library navigation is required for the normal list → editor/recovery → list workflow.

Use the existing `admin-case-library-read` Server-Timing signal if useful to distinguish residual server-read latency from client/navigation latency. Do not add new performance infrastructure unless existing evidence is insufficient.

As the final implementation/handoff documentation step, reconcile this planning record under `docs/DOCUMENTATION_MAINTENANCE.md`:

- update this file's status so it no longer says the implementation is merely proposed once implementation is actually complete on the PR;
- preserve the body as the PR #161 planning/decision record rather than continuously rewriting it into a living implementation authority;
- update `docs/DOCUMENTATION_INDEX.md`, which owns document-role classification, to classify `CASE_EDITOR_SAVE_AND_NAVIGATION_UX_PLAN.md` appropriately; the expected normal classification after completion is a **historical PR #161 planning record** unless implementation establishes a genuine reason for a different living authority;
- update only any other living documentation whose statements would become materially false or incomplete because of the implemented UX behavior;
- do not describe merge, deployment, or Production verification states that have not actually occurred.

## 7. Regression matrix

Automated coverage should include the strongest practical equivalents of these scenarios:

| Scenario | Required result |
| --- | --- |
| Edit Case title + Question answer, then save Question | title draft remains intact and dirty |
| Edit two existing Questions, then save one | other Question remains intact and dirty |
| Submit Case-details draft A, edit same draft to B before A returns | A success does not overwrite B or mark B clean; B remains dirty |
| Save All submits draft A, user changes it to B before response | A success is recorded for its snapshot only; B remains intact and dirty |
| Edit existing Question prompt and save | changed `questionPromptId` is reconciled; draft follows new authoritative identity with no duplicate/phantom entry |
| Edit Question prompt again while identity-changing save is in flight | older success reconciles identity without overwriting newer values; newer draft remains dirty |
| Section Save overlaps Save All for same draft | same logical draft is not submitted concurrently or twice |
| Save All with multiple dirty records | all successful current snapshots persist; reload confirms them |
| One Save All record fails | failed record stays dirty; no false all-saved state |
| Partially enter Add Case question, then save another section | creation input survives or the mutation is explicitly blocked/warned |
| Partially enter Case-specific Image Question / new image-set form, then mutate elsewhere | creation input survives or the mutation is explicitly blocked/warned |
| Save while scrolled deep in editor | viewport remains effectively stable |
| Save from focused text field | focus is preserved where practical; no hash jump |
| Dirty draft + Topic/Tag/image structural action | draft survives or action is explicitly blocked; never silently lost |
| Dirty/partially-entered editor + navigate away | user receives unsaved-changes protection |
| Clean editor + navigate away | no warning |
| Filtered active Cases → Case → All Cases | exact filtered URL/state returns directly |
| Filtered inactive Cases → recovery → Back to Cases | exact inactive q/topic/system/tag/sort/lifecycle/page state returns directly |
| Recovery restore → active Case → All Cases | canonical originating return context remains available across the transition |
| Active Case deactivation → inactive/recovery flow | canonical return context is not dropped |
| Direct/bookmarked Case or recovery → Back/All Cases | valid fallback behavior; no malformed return handling |
| Crafted return context | normalized to Case Library state; no external/open redirect |
| Production/Preview shared editor | Preview mutation restrictions remain unchanged |
| Implementation handoff documentation | plan status is reconciled and `DOCUMENTATION_INDEX.md` classifies the plan appropriately |

## 8. Manual browser checklist

Use local/test data only.

1. Open an active Case from a Case Library view combining System + Topic + Tag + search + sort and page 2+ where practical.
2. Change the Case title and vignette without saving.
3. Change two existing question answers without saving.
4. Change an existing Question prompt so the save path exercises any `questionPromptId` identity change.
5. Save only one question. Confirm the Case and other question drafts remain unchanged and visibly unsaved, and any saved prompt identity is reconciled correctly.
6. Submit a section save, then edit that same logical draft again before the response returns. Confirm the newer edit remains visible and dirty after the older submitted snapshot succeeds.
7. Start Save All, change one participating draft before its response completes, and confirm the newer value remains dirty rather than being cleared by the older success.
8. Start a Save All and attempt a conflicting section save for the same draft; confirm the UI does not submit that draft twice concurrently.
9. Use Save All. Confirm no viewport jump and all eligible dirty-state indicators clear only for current values that match confirmed submitted snapshots.
10. Refresh the Case editor and confirm every actually saved value persisted.
11. Partially fill **Add Case question** without submitting it, then perform another common save/mutation. Confirm the entered creation data survives or the action is explicitly blocked/warned.
12. Repeat with a Case-specific Image Question or new image-set/group creation form where available.
13. Create a dirty draft, then add/remove a Case Tag or perform another common structural action. Confirm the draft survives or the action is blocked with a clear warning.
14. Create dirty/partially entered work and try **All Cases**, browser Back, and refresh/close. Confirm leave protection occurs.
15. Save/discard/cancel the work and repeat. Confirm no nuisance warning.
16. Use **All Cases** and confirm the previous active Case Library state appears immediately without an unfiltered flash.
17. Open an inactive Case from a filtered inactive Case Library and exercise `/admin/cases/[caseId]/recovery`; confirm its Back path returns immediately to the exact prior inactive `q/topic/system/tag/sort/lifecycle/page` state.
18. Exercise representative restore and deactivation transitions and confirm the canonical return context survives across active/inactive Case surfaces.
19. Repeat a representative save while scrolled through Case Questions and Advanced image management; confirm the viewport does not jump.
20. Exercise the shared editor in Preview and reconfirm Production-only controls/mutations remain unavailable.
21. At implementation handoff, confirm this plan's status no longer says merely proposed and `DOCUMENTATION_INDEX.md` classifies it according to the documentation-maintenance contract.

## 9. Acceptance criteria

This PR is implementation-complete only when all of the following are true:

1. An Admin can edit multiple ordinary Case-editor fields/records without another section's save silently discarding unsaved work.
2. A successful section save or Save All result is scoped to its submitted snapshot: edits made to that logical draft while the request is in flight are never overwritten or incorrectly marked clean; preferably dirty state clears only when the current draft still matches the successfully submitted snapshot.
3. Meaningful partially entered structural creation forms are preserved across unrelated mutations/revalidation or the conflicting action explicitly blocks/warns; they are never silently discarded.
4. An explicit Save All path persists the complete dirty ordinary-edit set and reports partial failure accurately if partial success is technically possible.
5. Section saves and Save All coordinate so the same logical draft cannot be submitted concurrently by overlapping operations.
6. Existing Question prompt edits correctly reconcile local draft identity if the authoritative `questionPromptId` changes after save, including when a newer edit exists while that identity-changing save is in flight.
7. Routine successful saves no longer cause visible page/hash jumps.
8. Structural mutations cannot silently discard unrelated dirty drafts or meaningful partially entered structural creation forms.
9. Dirty/partially-entered leave protection exists; clean-state navigation remains frictionless.
10. Active Case Library → Case editor → Case Library returns directly to the exact prior canonical q/topic/system/tag/sort/lifecycle/page state.
11. Inactive Case Library → `/admin/cases/[caseId]/recovery` → Case Library returns directly to the exact prior inactive canonical state, and relevant restore/deactivation transitions preserve that return context across active/inactive Case surfaces.
12. The normal active or recovery return workflow does not require the current bare-list render followed by `localStorage` restoration and a second navigation.
13. Direct active Case/recovery URLs and bare `/admin/cases` fallback persistence still work.
14. Production/Preview ownership and authoring semantics are unchanged.
15. No schema/migration or production-data operation is introduced for this UX work.
16. Focused tests, repository-required handoff validation, complete base→head review, and the manual browser checklist are reported before the PR is considered ready for user review.
17. After implementation, the plan status and `DOCUMENTATION_INDEX.md` classification are reconciled according to `DOCUMENTATION_MAINTENANCE.md`, without falsely claiming merge/deployment/Production state.

## 10. Work-state rule

Keep this PR **Draft** throughout planning and implementation unless the user explicitly asks to mark it Ready.

The branch remains Draft. Implementation is proceeding against this plan in focused checkpoints; it must not be marked Ready, merged, deployed, or used for Production/Preview data mutation without explicit user direction.
