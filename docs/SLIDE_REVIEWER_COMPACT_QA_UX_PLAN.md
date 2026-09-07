# Slide Import Reviewer — Compact Q&A Review UX Plan

_Status: focused implementation plan for this Draft PR._

## Goal

Make the right-hand **Case questions** review substantially faster with the smallest practical UI change, while preserving manual source-page vetting and the reviewer’s fail-closed integrity rules.

The normal workflow should become:

```text
vet source pages manually
→ see every question + full answer immediately
→ make any needed edits
→ accept all clean Q&A for the Case in one click
→ explicitly override a warning when the human reviewer has reconciled it
→ continue reviewing
```

This is intentionally a narrow follow-up to the already-merged slide-reviewer performance/UX work. It is not another reviewer redesign.

## Current friction

The Case Questions section is vertically expensive:

- answers start hidden until explicitly revealed;
- prompt/answer textareas do not reliably show the complete content at once;
- each question gives a full-width status selector disproportionate space;
- prompt source, answer source, confidence, and review notes occupy several lines;
- accepting several clean questions requires repeated per-question status changes.

There is also one review-semantics friction point: a blocking warning currently prevents approval/finalization even after the human reviewer has manually inspected the source and deliberately decided that the proposed content is the version to keep. For example, visible Case/answer slides may support one laterality while speaker notes contain a contradictory laterality. The reviewer should be warned prominently, but after reconciliation must be able to make an explicit human override.

The reviewer still needs to support careful manual inspection of every source page. This plan therefore optimizes the **right-hand Q&A review surface** and explicit warning reconciliation, not the requirement to vet source material.

## Scope

Implement only the following high-impact changes.

### 1. Show answers by default and show full Q&A content

- Initial Case rendering should have answers revealed by default.
- Retain the existing `Hide answers / Reveal answers` control as an optional reviewer preference; do not remove it.
- Prompt and answer textareas should automatically grow to fit their current content so routine review does not require scrolling inside the field.
- Recalculate textarea height after Case render/navigation and after edits that change content.
- Keep editing inline; do not introduce a separate read-only/edit mode in this PR.
- Avoid an arbitrary small maximum height that recreates internal scrolling for ordinary long answers. Extremely large content may still use a sensible defensive cap only if needed to prevent pathological layout failure.

### 2. Add one-click bulk acceptance for Case questions

Add a compact action beside the `Case questions` heading, for example:

```text
Accept all 6 Q&A
```

or, when only some are eligible:

```text
Accept 4 eligible Q&A
```

Bulk acceptance applies only to manifest-backed Case Questions in the current Case.

Eligible records are questions that:

- are currently `pending`;
- have valid review metadata;
- do not have a blocking warning;
- are not `needs_review`;
- are not already `approved` or explicitly `rejected`.

The action must:

- change all eligible question review statuses to `approved` as one coherent reviewer action;
- persist through the existing local save/checkpoint path;
- leave `needs_review`, blocking-warning, rejected, already-approved, and missing-metadata records unchanged;
- never change unresolved-question candidates;
- never approve the parent Case automatically.

If no question is eligible, hide or disable the action clearly rather than presenting a misleading bulk operation.

This is a convenience action only. **Bulk/automatic actions must never override a blocking warning.** Explicit warning override is a separate human action described below.

### 3. Compress per-question metadata without hiding source-page access

Keep source provenance directly accessible because every source page is still manually vetted.

Replace the current multi-line routine metadata with a compact line similar to:

```text
Q1 · prompt p.7 · answer p.8 · high confidence
```

Requirements:

- prompt/answer source references remain clickable and retain the current source-preview behavior;
- warnings remain prominent and are never collapsed merely to save space;
- ordinary `reviewNotes` may move behind a small expandable `Review notes` / `Details` disclosure when present;
- package-local IDs such as `case-question-001-01` remain available but should be visually secondary to human-friendly numbering (`Q1`, `Q2`, ...);
- do not remove provenance or review evidence from the underlying bundle.

### 4. Make the existing per-question status control compact

Do not redesign the status vocabulary.

- Retain the existing status choices and ordinary behavior.
- Reduce the status selector from a full-width control to a compact control aligned with the question heading/metadata where the viewport allows it.
- Preserve usable narrow-window wrapping rather than forcing horizontal overflow.
- Keep individual status editing available after a bulk action.
- If a manifest-backed Question has a blocking warning and the reviewer deliberately selects `approved`, require an explicit confirmation/override interaction rather than silently treating the warning as cleared.

### 5. Allow explicit human override of reconciled blocking warnings

A `blocking` warning means **human reconciliation is required before approval**; it must not mean that the human reviewer can never approve the content.

The intended UX is:

```text
Cannot approve Case
- <blocking warning text>

[Approve anyway]  [Keep reviewing]
```

or equivalent wording such as `Override warning and approve`.

Rules:

- The first ordinary approval attempt must continue to surface the blocking warning prominently.
- The reviewer may then explicitly choose to approve the manifest-backed record despite that warning.
- The warning itself must remain unchanged and visible in `review-map.json`; do not delete, downgrade, hide, or rewrite it merely because it was overridden.
- No new schema field is required for this PR. For a manifest-backed Case/Asset/Question, the combination of retained blocking warning(s) plus an explicitly human-set `reviewStatus: "approved"` is the durable record that the warning was reviewed and overridden.
- Automatic actions, including `Accept all Q&A` and any clean-child approval performed by Case approval, must never perform this override on the reviewer’s behalf.
- A Case-level `Approve anyway` may override **Case-level** blocking warnings only. It must not silently waive a blocking warning on an Asset or Question. A blocked child must be explicitly approved/rejected at that child’s own control first.
- An Asset or Question with a blocking warning may likewise be explicitly approved by the reviewer through its individual status control, with a confirmation that makes the override intentional.
- Once an exact manifest-backed record is explicitly approved, deterministic readiness/finalization must treat that record’s retained blocking warning as reconciled rather than continuing to fail solely because the warning still exists.

This override is deliberately limited to **review warnings attached to manifest-backed records**. It must not turn structural/data-integrity failures into waivable warnings.

The following remain non-overridable/fail-closed:

- unresolved questions that still require resolution/rejection;
- missing answers that prevent a valid manifest Case Question from existing;
- missing review metadata;
- invalid/missing manifest relationships or required Case fields;
- invalid or missing learner media;
- source-coverage/schema/package validation failures;
- batch-level blocking warnings with no record-level human approval state;
- any other condition where finalization cannot produce a valid Import Package v1.

Example intended behavior:

```text
Visible case/answer content:
left-sided low-to-medium-frequency sensorineural hearing loss / left-ear Meniere disease

Speaker notes:
moderate right-sided sensorineural hearing loss

Reviewer decision:
visible Case/answer slides are the intended learner content
→ warning remains visible
→ reviewer clicks Approve anyway
→ Case may finalize once all other required records are resolved
```

### 6. Reconcile finalizer/readiness semantics narrowly

The current deterministic finalizer separately rejects blocking warnings even when the same manifest-backed record is already `approved`. That must be reconciled with the explicit override behavior above.

Keep the change narrow:

- `pending` / `needs_review` manifest-backed records still block readiness;
- an explicitly `approved` manifest-backed Case/Asset/Question may retain blocking warnings without those warnings independently blocking finalization;
- rejected-child semantics remain unchanged;
- unresolved-question, batch-warning, schema, source-coverage, media and Import Package integrity checks remain fail-closed;
- do not introduce a second review-state model or weaken validation unrelated to explicit human warning reconciliation.

Update directly related reviewer safety/workflow documentation if necessary so it states the precise rule: **blocking warnings are never overridden automatically, but an explicit human approval may override a warning on that exact manifest-backed record while preserving the warning for audit.**

## Preserve

Do not change:

- the requirement for manual source-page vetting;
- source-preview selection/navigation behavior except where necessary to preserve compact source links;
- `manifest.json` / `review-map.json` authority boundaries;
- the existing review status vocabulary or schema;
- rejected-child semantics;
- unresolved-question handling;
- exact-fingerprint local persistence identity;
- deterministic Import Package v1 output/validation;
- learner-media / answer-leakage evidence visibility;
- local/offline operation.

Do not add:

- keyboard-first workflow changes;
- problem-only review modes;
- automatic source-page skipping or auto-approval based on page viewing;
- automatic blocker override;
- a new save/persistence system;
- a new review-map override field or package/schema version;
- PPTX/PDF extraction changes;
- production Admin/importer, D1, R2, deployment, or taxonomy changes.

Existing keyboard shortcuts may remain unchanged; they are simply not part of this UX tranche.

## Implementation notes

Use the maintainable reviewer sources under `tools/slide-import-review/src/` and `index.template.html` as appropriate. `reviewer.html` remains the generated distribution artifact and must be regenerated through the existing build path rather than hand-maintained independently.

Prefer reusing the existing status-update, warning, source-reference, render, persistence and readiness/finalization mechanisms. The bulk action and explicit override should be thin UI/semantics changes over the existing review model, not a second state model.

Keep the implementation focused. Do not fold unrelated performance/refactoring cleanup into this PR.

## Focused regression coverage

Add/adjust slide-review tests to cover at least:

1. answers are revealed on initial reviewer load;
2. prompt/answer fields are wired for content-fitting textarea behavior;
3. the bulk Q&A action approves all and only eligible clean pending Case Questions;
4. `needs_review`, blocking-warning, rejected, approved, and missing-metadata questions are not incorrectly changed by bulk acceptance;
5. unresolved-question candidates are untouched;
6. bulk acceptance uses the existing persistence path and survives a save/restore cycle where practical in current test architecture;
7. source-page links and individual status controls remain present/usable;
8. an ordinary Case approval attempt still surfaces Case-level blocking warnings;
9. explicit `Approve anyway` can approve a Case with a Case-level blocking warning while preserving the warning;
10. Case-level override does not silently override a blocked child;
11. an individual manifest-backed Question/Asset with a blocking warning can be explicitly approved, while automatic/bulk approval still skips it;
12. finalization succeeds for an otherwise-ready explicitly approved manifest-backed record that retains a blocking warning;
13. finalization still fails for unresolved/missing-answer/missing-metadata/schema/media/source-coverage/batch-level blockers;
14. generated `reviewer.html` remains in sync with maintainable source.

Use the repository-required slide-review checks during implementation, including:

```text
npm run slide-review:test
npm run slide-review:build
```

and follow current `agent:checks`/handoff guidance for final validation.

## Manual acceptance smoke

Use a representative review bundle containing multiple questions, including at least one long answer and one manifest-backed blocking warning such as conflicting visible-slide versus speaker-note wording.

Confirm:

- opening a Case immediately shows all answers;
- all ordinary prompt/answer text is visible without textarea scrolling;
- every source page can still be manually selected/vetted using the visible source links/source pane;
- the Case Questions section is materially shorter than the current layout;
- `Accept all N Q&A` approves every eligible clean question in one click;
- blocked questions are not bulk-approved;
- an individual question status can still be changed afterward;
- the first Case approval attempt displays the blocker clearly;
- after manually reconciling it, `Approve anyway` approves the Case while the warning remains visible/auditable;
- Case-level override does not waive unresolved child blockers;
- edited Q&A and explicit approvals persist using the existing local save behavior;
- finalization accepts explicitly reconciled record-level warnings but still fails closed on genuine unresolved/integrity failures.

## Acceptance criteria

This PR is complete when a normal Case can be reviewed with this interaction:

```text
1. inspect/vet the source pages manually;
2. read every full prompt and answer in the right pane without separately revealing answers or scrolling inside routine fields;
3. make any necessary edits;
4. click one Case-question bulk-accept action for the clean Q&A;
5. explicitly reconcile any remaining warning and choose Approve anyway where appropriate;
6. see the warning remain recorded while the human-approved content is allowed to proceed;
7. retain fail-closed behavior for unresolved or structurally invalid content.
```

The intended gain is reduced vertical space and repeated clicking plus a practical human escape hatch for source inconsistencies that have been consciously reviewed. It is not a broader weakening of review or finalization safety.
