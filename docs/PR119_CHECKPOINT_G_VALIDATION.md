# PR #119 — Checkpoint G Validation Matrix

This file records the final integrated validation traceability for the systems-first learner Study change.

The coding sequence and acceptance contract remain authoritative in `docs/PR119_IMPLEMENTATION_PROMPT.md`. This matrix does not change product behavior, rollout state, or deployment policy.

## Automated evidence matrix

| # | Required protection | Primary automated owner |
|---|---|---|
| 1 | OR-union selection | `test/system-study-selection.test.js` |
| 2 | Case deduplication | `test/system-study-selection.test.js` |
| 3 | exact Topic semantics | `test/system-study-selection.test.js` |
| 4 | child deselection under a partially selected parent | `test/system-study-selection.test.js` plus `test/system-study-chooser.test.js` hierarchy wiring |
| 5 | Topic precedence over Tag | `test/system-study-selection.test.js` |
| 6 | deterministic Tag precedence | `test/system-study-selection.test.js` |
| 7 | cross-System Topic rejection | `test/system-study-selection.test.js`, `test/start-system-study.test.js` |
| 8 | non-curated Tag rejection | `test/system-study-checkpoint-g.test.js` |
| 9 | empty selection rejection | `test/system-study-selection.test.js`, `test/start-system-study.test.js` |
| 10 | duplicate form selections dedupe safely | `test/start-system-study.test.js` |
| 11 | all-selected equals current System All IDs + effective provenance | `test/system-study-selection.test.js` |
| 12 | first Review persists immutable selection | `test/system-study-selection-review.test.js` |
| 13 | Review/selection user and System mismatch rejected | user mismatch: `test/study-selection-migration.test.js`; System mismatch: `test/system-study-checkpoint-g.test.js` |
| 14 | effective Review provenance unchanged | `test/system-study-selection-review.test.js`, `test/system-review-navigation.test.js` |
| 15 | Expanded preserves selection ID | `test/system-study-selection-continuation.test.js` |
| 16 | Next preserves selection ID/routes | `test/system-study-selection-continuation.test.js` |
| 17 | invalidated stored route fails safely | `test/system-study-selection-continuation.test.js` |
| 18 | historical all/Topic/Tag Reviews remain readable/continuable | `test/system-review-navigation.test.js`, `test/contextual-system-topic-tag-navigation.test.js` |
| 19 | migration preserves existing Review rows/snapshots | `test/study-selection-migration.test.js` |
| 20 | selection-route-only historical Topic is non-deletable | `test/study-selection-topic-deletion-guard.test.js`, `test/topic-deletion.test.js` |
| 21 | `deleteUnusedTopic()` rejects selection-route-only historical Topic | `test/topic-deletion.test.js` |
| 22 | reverse lookup index begins with route type + route ID | `test/topic-deletion-indexes.test.js` |
| 23 | flag-off learner `/study` remains legacy Topic flow | `test/system-study-chooser.test.js`, `test/study-selection-rollout-boundary.test.js` |
| 24 | flag-off learner cannot use System selection start | `test/study-selection-rollout-boundary.test.js` |
| 25 | flag-on learner gets systems-first multi-select UI | `test/system-study-chooser.test.js` |
| 26 | flag-off Production Admin preview gets same multi-select UI | `test/admin-study-preview.test.js` |
| 27 | non-Admin cannot access Admin preview | existing Admin layout/auth contract plus `test/admin-study-preview.test.js` explicit action authorization wiring |
| 28 | Preview Worker / Preview-only Admin remains blocked | `test/admin-study-preview.test.js`, existing `test/preview-auth.test.js` / Preview access contracts |
| 29 | flag-off ordinary learner System Next blocked | `test/contextual-system-topic-tag-navigation.test.js`, `test/admin-study-preview.test.js` |
| 30 | flag-off Production Admin selection Next allowed | `test/admin-study-preview.test.js` |
| 31 | learner/Admin preview share one chooser owner | `test/system-study-chooser.test.js`, `test/admin-study-preview.test.js` |
| 32 | learner/Admin start share one flag-independent workflow owner | `test/start-system-study.test.js`, `test/admin-study-preview.test.js` |
| 33 | failed action restores exact checkbox/question state | `test/start-system-study.test.js`, `test/system-study-chooser.test.js` |

## Checkpoint G additions

The final validation tranche adds no application or schema behavior. It adds focused coverage for gaps found during matrix review:

- rejection of a Tag that exists on a Case but is not curated for the selected System;
- database rejection when a Review references a selection belonging to a different System;
- source-level responsive guardrails for minimum-width containment, long-label wrapping, 44px option rows, responsive System-grid breakpoints, and mobile full-width Start.

The responsive source contract is a regression guard, not a substitute for browser validation.

## Manual UX matrix

This Remote GitHub session does not provide an interactive browser/runtime suitable for claiming the manual UX checks passed. These remain explicit handoff/user-testing items rather than silently inferred successes.

### Learner flag on

Pending browser verification:

- System-first entry and default-all selection;
- nested parent/child partial-selection ergonomics;
- Tag cross-inclusion clarity;
- zero-selection disabled Start;
- Original and Expanded starts;
- failed-action state restoration in rendered UI;
- complete Review → Next with unchanged selection.

### Learner flag off

Pending browser verification:

- legacy Topic Study presentation remains unchanged;
- no visible/public route to multi-select.

### Production Admin flag off

Pending browser verification:

- dashboard shortcut opens `/admin/study-preview`;
- shared chooser renders correctly;
- targeted selection enters the real learner Review UI;
- reveal/rate/Expanded/Next operate correctly where applicable;
- Back returns to Admin learner preview.

### Responsive/accessibility

Pending browser verification:

- narrow viewport;
- long Topic names and breadcrumbs;
- many checkboxes;
- no horizontal overflow;
- keyboard and touch usability.

## Rollout/deployment state

Checkpoint G does not authorize rollout. The following must remain unchanged until separately approved:

- learner System-navigation feature flag;
- Production deployment state;
- Production D1/R2 data.

No production mutation or deployment is part of this checkpoint.
