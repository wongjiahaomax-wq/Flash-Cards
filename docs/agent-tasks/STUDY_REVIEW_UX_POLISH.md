# Study Review UX Polish

## Goal

Polish the learner Study Review without changing Study architecture, scheduling, content models, or storage.

Implement the feature work in this same PR after plan review.

## Product changes

### 1. Reveal the Case title only after answers are revealed

Before reveal, keep the existing neutral heading:

```text
Case review
```

After reveal, replace that heading with the frozen Case title for the active Review, for example:

```text
Atrial fibrillation
```

The Case title can contain the diagnosis, so it must not be exposed to the learner before reveal, including in page/server data sent to the browser. Use the Review's frozen title snapshot rather than reading a mutable current Case title.

### 2. Preserve authored question order for Original/Core Study display

The Case editor's up/down controls define meaningful Case-question order.

For Original/Core Study, keep existing eligibility, duplicate precedence, coverage, and random/subset selection behavior, but once the Review's questions have been selected, display the selected questions in their authored/pool order rather than shuffled order.

Do not change Expanded Learning ordering unless required by the smallest shared implementation. Do not change which questions are eligible or how many are selected.

### 3. Add conservative image inspection

Each learner Study image should be visibly inspectable:

- show a small magnifying-glass affordance;
- clicking/tapping the image or affordance opens a centered modal with a dimmed backdrop;
- on laptop/desktop, the enlarged image is constrained to approximately `75vw` × `75vh`;
- preserve aspect ratio and do not force upscaling beyond the image's intrinsic size;
- on smaller screens, use responsive limits that make sensible use of available space;
- retain the image caption in the modal when present;
- close via an explicit close control, backdrop click, or `Escape`.

This is not a full-screen viewer. Do not add pan/zoom machinery, a second image pipeline, derivative thumbnails, or image-processing/storage changes. Reuse the existing authenticated Study media URL and original snapshotted R2 object.

### 4. Show Study run progress

When the current run descriptor provides enough information, show compact progress such as:

```text
Case 3 of 10
```

Place it near the Study navigation/header without making it dominant. Derive it from existing run state; do not add persistence/schema solely for this label. If existing run state cannot robustly provide both values, keep this item out rather than inventing a parallel counter.

### 5. Preserve sensible position through answer reveal

Revealing answers should not unnecessarily jump the learner away from the questions they were reviewing. Preserve the current page/scroll position across the reveal interaction using the smallest existing SvelteKit-compatible approach. Do not add automatic scrolling or animation.

## Preserve

- Existing Scheduled vs Free Study behavior and completion flow.
- Existing FSRS/rating semantics.
- Existing active-Review snapshot ownership and frozen content behavior.
- Existing Review/media authorization boundaries.
- Existing question eligibility, precedence, coverage constraints, and configured question counts.
- Existing mobile/responsive Study usability.

## Non-goals

Do not add or redesign:

- Study architecture or routing;
- schema/migrations;
- active-Review snapshot format unless strictly necessary for an already-frozen value;
- full-screen image viewing;
- multi-level zoom, pan, pinch-zoom controls, or image transformations;
- question-by-question reveal;
- keyboard-navigation feature sets beyond `Escape` for closing the modal;
- broad Study page visual redesign;
- Expanded Learning semantics.

## Acceptance / executable proof

1. **Diagnosis secrecy and reveal**
   - An unrevealed Study Review renders `Case review` and the Case title is absent from the learner page data/HTML.
   - After the real reveal action, the same Review renders its frozen Case title as the heading.

2. **Core ordering**
   - A focused test creates/uses Case questions with a known authored order, exercises Core Review question selection, and proves the selected questions are displayed in authored order even when selection randomness would otherwise shuffle them.
   - Existing selection count and coverage behavior remains intact.

3. **Image inspection**
   - Exercise the actual Study Review component/page at the rendered-interaction layer where practical: activating an image opens the larger modal; caption is retained; close control and `Escape` close it.
   - The modal uses the existing Study media URL; no alternate media endpoint is introduced.

4. **Run progress**
   - If implemented, focused proof shows the label reflects the existing run descriptor and does not persist a separate counter.

5. **Reveal position**
   - Focused browser/component coverage should prove reveal does not reset the learner to an unrelated page position if the repository's current test surface supports this economically. Do not build new test infrastructure solely for this.

## Execution

Inspect the actual current repository state and follow current root/scoped `AGENTS.md` guidance with progressive retrieval. Start from the Study Review page, active Review read model, question selection path, and their existing focused tests; broaden only when evidence requires it.

Use focused validation during implementation, then run repository-required final validation and report what actually ran. Keep the PR Draft until implementation and review are complete. Do not merge or mark Ready for Review.