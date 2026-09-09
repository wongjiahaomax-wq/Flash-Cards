# Slide Import Reviewer — Workspace Visual Polish Plan Amendment

_Status: normative implementation and validation amendment for PR #173. This document supplements and tightens `docs/SLIDE_REVIEWER_WORKSPACE_VISUAL_POLISH_PLAN.md`; where wording differs, this amendment controls._

## Resolved baseline

PR #172 has merged and its inline learner-image crop implementation is part of current `main` and the baseline for PR #173.

Implementation must preserve the complete post-#172 reviewer behavior, including:

- `Adjust crop` availability and source-selection rules;
- crop source picker/layout;
- crop frame and eight resize handles;
- Reset / Cancel / Save crop;
- pointer/crop behavior;
- protected crop-save operation semantics;
- existing image replacement behavior;
- crop persistence/finalization behavior.

Do not spend implementation time treating #172 as a pending dependency and do not duplicate or redesign crop behavior in this PR.

Before editing, inspect the actual current PR head and current `main` so later unrelated changes are not accidentally overwritten, but the #172 dependency itself is resolved.

## 1. Desktop and intermediate-width layout contract

The visual target is not only 1680 px and mobile. The reviewer must remain usable through the intermediate desktop/laptop range where widening the Case queue could otherwise squeeze the right review pane.

Use these representative viewport checkpoints during implementation and manual smoke:

```text
1680 px  — primary desktop target
1440 px  — common desktop/laptop width
1280 px  — constrained desktop width
~1100 px — current responsive transition area
600 px   — narrow/mobile behavior
```

The current `1100px` breakpoint is not a protected product invariant.

If the three-column workspace becomes cramped before 1100 px after widening the Case queue, Luna may move the desktop-to-stacked breakpoint upward or make an equivalent bounded responsive adjustment.

Required result:

- no forced horizontal page scrolling;
- Case titles remain readable rather than collapsing into very narrow stacks;
- source evidence remains readable;
- right-hand Q&A/crop controls remain practically usable;
- stacked/narrow layout remains coherent.

Do not add draggable/resizable columns or a user-configurable layout system.

## 2. Measurable source-readability invariant

Use current post-#172 `main` as the visual baseline.

At approximately 1680 px viewport width:

- the rendered source image should retain at least about **95% of its baseline rendered width**, unless the new layout makes it larger;
- do not reduce the existing source-image maximum height merely to fit the wider Case queue;
- preserve the current evidence presentation semantics (`object-fit: contain` / whole-source visibility) rather than cropping or stretching the source to satisfy layout;
- source thumbnails and direct page selection remain visible and usable.

If the exact baseline source width depends on the source aspect ratio, compare the same representative bundle/page before and after the change rather than inferring from CSS declarations alone.

This is the hard priority order:

```text
1. preserve source-slide readability
2. widen/clean up the Case queue
3. let the right review pane absorb most remaining width cost
4. use compact provenance/reduced chrome to keep the right pane efficient
```

A visually attractive result that materially shrinks the source slide is not acceptable.

## 3. Post-#172 crop layout regression contract

Because the right review pane may become somewhat narrower, explicitly verify the merged crop UI inside that pane.

With `Adjust crop` open, at least at 1680 px and one intermediate desktop width (preferably 1280 or 1440 px), confirm:

- the crop source preview remains large enough for practical adjustment;
- the crop frame is not clipped;
- all eight handles remain visible and reachable;
- the Asset source picker wraps/sizes cleanly;
- Reset / Cancel / Save crop remain visible and usable;
- no crop control causes horizontal overflow;
- learner-image cards remain coherent before and after entering crop mode;
- existing crop pointer/state/persistence behavior is unchanged.

This PR must not modify crop geometry, pointer handling, operation guards, persistence, image bytes, review-state invalidation, or source-selection rules merely to improve appearance.

Use existing crop regression tests as behavioral protection; add only layout/render coverage needed for this visual change.

## 4. Toolbar and progress presentation polish

The existing toolbar is part of the visual-polish scope, but its workflow and control set are frozen.

Improve visual grouping/hierarchy of the existing controls only. A reasonable presentation direction is to make these conceptual groups visually apparent through spacing, separators, alignment, or button hierarchy:

```text
Navigation
Previous · position · Next · filter · Source coverage

Review
Approve · Needs review · Reject

Output
Back up reviewed bundle · Create Import ZIP
```

Do not add group labels if they consume unnecessary vertical space; the goal is visual grouping, not more text.

The existing progress counts may receive a quieter/compact visual treatment so they do not read as one undifferentiated sentence, but:

- retain every existing count;
- retain existing filter meanings;
- do not make counts interactive;
- do not change calculations or state transitions;
- do not add a new dashboard/progress component architecture.

All existing button IDs/actions, review semantics, warning override behavior, persistence, finalization, and navigation behavior remain unchanged.

## 5. Mouse-first scope; no new keyboard work

This PR is intentionally mouse-first.

Do not add:

- new keyboard shortcuts;
- keyboard-first navigation;
- a new focus-navigation system;
- keyboard-specific UI affordances;
- new keyboard-specific acceptance tests solely for this visual-polish work.

Existing keyboard shortcuts/behavior from current `main` must not be deliberately removed or broken, but enhancing or expanding them is out of scope.

For the polished `Open review ZIP` control, keep the existing real file input/load path underneath and style its visible presentation simply. Do not create a second file-opening mechanism.

## Updated executable acceptance contract

In addition to the base plan's existing behavioral requirements, implementation must establish:

| Invariant | Required proof |
| --- | --- |
| Source size at 1680 px | Compare the same representative source page before/after and show the post-change rendered source width is about >=95% of baseline (or larger), without lowering the existing source max-height/evidence-fit behavior |
| Intermediate desktop safety | Render/smoke at 1440 and 1280 px and confirm no horizontal overflow or unusably squeezed right pane; adjust the responsive breakpoint if needed |
| Responsive transition | Exercise the actual transition between three-column and stacked layout rather than checking only 1680 and very narrow mobile |
| Crop visual preservation | Open the real post-#172 crop editor in the rendered reviewer at desktop/intermediate width and confirm picker/frame/handles/actions remain usable without overflow |
| Toolbar polish without workflow change | Existing controls/counts remain present and wired to their existing behavior after presentation changes |
| Existing reviewer semantics | Current focused slide-review and crop regressions remain green; do not replace them with static/source-only checks |

If the current lightweight reviewer harness cannot measure CSS geometry reliably, do not add a heavyweight browser dependency solely for this PR. Use the lightest existing executable/rendered mechanism plus documented measured manual viewport smoke.

## Updated manual acceptance smoke

Use a representative post-#172 review bundle and verify at 1680, 1440 and 1280 px:

1. Case queue is materially wider/cleaner than baseline.
2. Long Case titles have sensible wrapping and clear title/status/technical-ID hierarchy.
3. Source slide retains approximately its baseline readable size; at 1680 px it is about >=95% of baseline width or larger.
4. Source thumbnails/page links remain clear and directly selectable.
5. Right Q&A pane remains readable and editable despite carrying most of the width reduction.
6. Compact provenance retains direct source-page behavior.
7. Warnings/blockers remain visually prominent.
8. Existing toolbar controls are visually grouped more clearly without new actions or changed behavior.
9. All existing progress counts remain visible.
10. `Open review ZIP` uses the same underlying local file-open path with cleaner presentation.
11. `Adjust crop` remains practically usable: source picker, crop frame, eight handles, Reset/Cancel/Save crop, and no horizontal overflow.
12. Existing review-state, warning-override, bulk-Q&A, persistence, source-selection, crop-save and finalization behavior remains unchanged.

Also exercise the responsive transition and the narrow/mobile layout around 600 px.

## Completed validation record

The implementation satisfied this amendment's focused proof requirements without adding a heavyweight browser dependency. Executable coverage now exercises multi-source provenance with source IDs retained on Prompt and Answer references, clickable source selection, single-source label compaction, and the styled file input's real local load path. The focused crop/build/provenance set passed 22/22.

Measured rendered smoke on the representative post-#172 bundle recorded queue/source/review widths of 269/776/510 px at 1680 px, 248/642/425 px at 1440 px, and 248/543/364 px at 1280 px. The source was 116.3% of the 667 px pre-change comparison at 1680 px. The 1199 px responsive transition stacked cleanly, the 600 px layout had no horizontal overflow, and the real crop editor retained eight handles plus Reset/Cancel/Save actions at 1280 px. Project-owner manual testing was completed on 2026-09-10 with no issues reported.

## Updated Luna handoff

> Continue existing Draft PR #173; do not create another PR or restart from `main`. PR #172 has merged and its inline crop reviewer is the baseline—preserve it completely. Implement the base visual-polish plan plus `docs/SLIDE_REVIEWER_WORKSPACE_VISUAL_POLISH_PLAN_AMENDMENT.md` as one contract, with this amendment controlling where it tightens the base plan. Keep the task presentation/layout-only: widen and clean up the Case queue, preserve source-slide readability, simplify visual chrome/provenance, polish the header and existing toolbar/progress presentation, and preserve responsive usability. At 1680 px the same representative source image should remain about >=95% of its post-#172 baseline rendered width (or larger), without reducing the existing source max-height/evidence-fit behavior. Explicitly smoke 1440 and 1280 px; the current 1100 px breakpoint may move upward if needed to avoid a squeezed three-column layout. Verify the real post-#172 crop editor remains usable in the narrower review pane with picker/frame/eight handles/Reset/Cancel/Save visible and no overflow. This is mouse-first: add no new keyboard controls/shortcuts or keyboard-specific test scope. Preserve all review/navigation/persistence/warning-override/finalization/source-selection/crop semantics. Prefer CSS and minimal display-format changes, no new dependency/state model/workflow/schema/refactor. Regenerate `reviewer.html`, run current slide-review/crop regressions plus repository-required final validation, keep the PR Draft, and do not merge or mark Ready until independently reviewed.
