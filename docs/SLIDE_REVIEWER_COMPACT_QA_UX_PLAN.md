# Slide Import Reviewer — Compact Q&A Review UX Plan

_Status: focused implementation plan for this Draft PR._

## Goal

Make the right-hand **Case questions** review substantially faster with the smallest practical UI change, while preserving manual source-page vetting and all existing review/finalization safety rules.

The normal workflow should become:

```text
vet source pages manually
→ see every question + full answer immediately
→ make any needed edits
→ accept all clean Q&A for the Case in one click
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

The reviewer still needs to support careful manual inspection of every source page. This plan therefore optimizes the **right-hand Q&A review surface**, not the requirement to vet source material.

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

This is a convenience action only. It must not weaken the existing rule that pending/`needs_review` children block an approved Case, while explicitly rejected children remain excluded by the existing deterministic semantics.

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

Do not redesign review-state semantics.

- Retain the existing status choices and behavior.
- Reduce the status selector from a full-width control to a compact control aligned with the question heading/metadata where the viewport allows it.
- Preserve usable narrow-window wrapping rather than forcing horizontal overflow.
- Keep individual status editing available after a bulk action.

## Preserve

Do not change:

- the requirement for manual source-page vetting;
- source-preview selection/navigation behavior except where necessary to preserve compact source links;
- `manifest.json` / `review-map.json` authority boundaries;
- review status meanings or schema;
- rejected-child semantics;
- unresolved-question handling;
- blocking-warning behavior;
- Case approval semantics;
- exact-fingerprint local persistence identity;
- deterministic finalization or Import Package v1 output;
- learner-media / answer-leakage safety;
- local/offline operation.

Do not add:

- keyboard-first workflow changes;
- problem-only review modes;
- automatic source-page skipping or auto-approval based on page viewing;
- a new save/persistence system;
- schema/package changes;
- PPTX/PDF extraction changes;
- production Admin/importer, D1, R2, deployment, or taxonomy changes.

Existing keyboard shortcuts may remain unchanged; they are simply not part of this UX tranche.

## Implementation notes

Use the maintainable reviewer sources under `tools/slide-import-review/src/` and `index.template.html` as appropriate. `reviewer.html` remains the generated distribution artifact and must be regenerated through the existing build path rather than hand-maintained independently.

Prefer reusing the existing status-update, warning, source-reference, render, and persistence mechanisms. The bulk action should be a thin UI operation over existing review semantics, not a second review-state model.

Keep the implementation focused. Do not fold unrelated performance/refactoring cleanup into this PR.

## Focused regression coverage

Add/adjust slide-review tests to cover at least:

1. answers are revealed on initial reviewer load;
2. prompt/answer fields are wired for content-fitting textarea behavior;
3. the bulk Q&A action approves all and only eligible pending Case Questions;
4. `needs_review`, blocking-warning, rejected, approved, and missing-metadata questions are not incorrectly changed;
5. unresolved-question candidates are untouched;
6. bulk acceptance uses the existing persistence path and survives a save/restore cycle where practical in current test architecture;
7. source-page links and individual status controls remain present/usable;
8. generated `reviewer.html` remains in sync with maintainable source.

Use the repository-required slide-review checks during implementation, including:

```text
npm run slide-review:test
npm run slide-review:build
```

and follow current `agent:checks`/handoff guidance for final validation.

## Manual acceptance smoke

Use a representative review bundle containing multiple questions, including at least one long answer and, if available, one question that must not be bulk-approved.

Confirm:

- opening a Case immediately shows all answers;
- all ordinary prompt/answer text is visible without textarea scrolling;
- every source page can still be manually selected/vetted using the visible source links/source pane;
- the Case Questions section is materially shorter than the current layout;
- `Accept all N Q&A` approves every eligible clean question in one click;
- ineligible/problem questions remain visibly unresolved/rejected as appropriate;
- an individual question status can still be changed afterward;
- edited Q&A persists using the existing local save behavior;
- Case approval/finalization still fails closed when required review work remains.

## Acceptance criteria

This PR is complete when a clean Case with several questions can be reviewed with this interaction:

```text
1. inspect/vet the source pages manually;
2. read every full prompt and answer in the right pane without separately revealing answers or scrolling inside routine fields;
3. make any necessary edits;
4. click one Case-question bulk-accept action;
5. see all eligible questions become approved while anything requiring review remains untouched.
```

The intended gain is reduced vertical space and repeated clicking, not a broader change to how source evidence is vetted or how reviewed bundles are finalized.
