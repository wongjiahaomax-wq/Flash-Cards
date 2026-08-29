# Stimulus Family refactor architecture

_Status: implemented architecture after accepted Checkpoint A correctness and Checkpoint B mechanical decomposition_

_PR #110 established the reviewed architecture/correctness contract. Long-lived PR #112 implements that contract. Checkpoint A was accepted at `fc7b0e3d1fdc6f8561ecc5d4ccc2d35f950f5dda`; Checkpoint B was accepted after its dependency-direction correction at `4ca09338d333603df38f2017b221a9a35c247960`._

_The final merge gate is operational rather than architectural: the exact head intended for review/merge must pass repository-owned full validation. A later commit invalidates that exact-head validation._

This document describes the implemented Production Stimulus Family architecture and preserves the important pre-refactor findings that explain why the work was staged. Current executable code, committed migrations, tests and workflow definitions remain authoritative if this document ever becomes stale.

The term **Stimulus Family** is the domain name for the persisted `stimulus_groups` / Alternative Set model. This document does not rename the persisted model or product terminology.

## Scope and non-goals

The completed refactor preserves:

- fixed Case images (`case_assets`) as a valid, separate concept;
- active/inactive and `removed_from_case` as distinct lifecycle states;
- explicit Production Original semantics and the legacy `original_option_id = NULL` compatibility path;
- Core versus Expanded Learning selection;
- Group, Option and reusable Asset Question semantics and precedence;
- Case fixed-question-count constraints and Stimulus coverage guarantees;
- Production/Preview ownership separation;
- stable Asset/Stimulus Option identity where existing workflows depend on it;
- Review snapshot/provenance history;
- D1 triggers and schema constraints as complementary integrity enforcement where those safeguards actually exist.

The programme did **not** become a schema redesign, Preview rebuild, generic repository/service-layer introduction, JS-to-TS migration, route reorganisation, Import Package v1 redesign, or product/UX redesign.

## Current domain model

A Production Case can contain both always-shown fixed images and independently selectable Stimulus Families.

```text
Case
├── case_assets                         always shown / supporting images
└── stimulus_groups                     independently selectable families
    ├── original_option_id              explicit canonical Original or NULL legacy state
    ├── specific_question_mode          none | minimum | all
    └── stimulus_group_options
        ├── asset_id                    stable Asset identity
        ├── is_active
        ├── removed_from_case
        ├── stimulus_option_questions   Case-specific exact-option knowledge
        └── stimulus_option_asset_questions
            └── asset_questions         reusable knowledge for the exact Asset
```

Family-wide knowledge is stored in `stimulus_group_questions`.

The learner supports only `selection_count = 1`. Database constraints require a positive count, while the learner adapter rejects unsupported values rather than inventing multi-option selection behavior.

### State terms are intentionally not interchangeable

- **active option**: `stimulus_group_options.is_active = true`;
- **in Case**: `removed_from_case = false`;
- **archived/removed option relationship**: the option row remains for identity/history, normally with `is_active = false` and `removed_from_case = true`;
- **active Asset**: the backing Asset remains eligible for current use;
- **active family**: the family participates in current authoring/learner selection;
- **Original**: `stimulus_groups.original_option_id` points at the canonical option for a curated family;
- **Alternative**: an eligible non-Original option in a curated family.

Deleting or recreating rows to simulate these transitions would break current identity/provenance semantics.

## Implemented module ownership

### Compatibility façade

`src/lib/server/db/stimulus-groups.js` is now a thin compatibility export surface. It does not own the decomposed implementation.

It re-exports the established compatibility operations from focused modules, including the **exact same** canonical `StimulusGroupInputError` constructor object exported by `stimulus-family-error.js`.

Existing callers do not need to be mechanically migrated merely because the internals were decomposed. Compatibility callers are allowed where they do not invert the new lower-level ownership direction.

### Shared primitives and canonical policy

| Module | Implemented ownership |
| --- | --- |
| `stimulus-family-error.js` | Sole canonical `StimulusGroupInputError` constructor. |
| `stimulus-family-input.js` | Shared Stimulus Family input parsing/normalization primitives. |
| `stimulus-family-eligibility.js` | Production Case/Family/image-Asset eligibility and lower-level content-guard adaptation. |
| `stimulus-family-coverage.js` | Canonical Production specific-question coverage, Prompt deduplication, `none`/`minimum`/`all`, additive active-Family coverage, Case Fixed-N compatibility and prospective option/group overrides. |
| `stimulus-family-specificity.js` | Canonical application-level live cross-Family Prompt ownership, retained exact/reusable Prompt loading and prospective activation/restoration/movement ownership overrides. |
| `stimulus-family-live-state.js` | Composition of eligibility, Original integrity, specificity and coverage for transitions that make Family/Option content live; canonical Production movement/restoration preflight. |

These modules depend downward on schema/content guards and each other as appropriate. They do not depend upward on `stimulus-groups.js`.

### Focused Production lifecycle, mutation and read ownership

| Module | Implemented ownership |
| --- | --- |
| `stimulus-family-lifecycle.js` | Family create, source-aware fixed-image start, update and Family reactivation orchestration. |
| `stimulus-option-lifecycle.js` | Option add, generic fixed→option conversion, activation/deactivation, archive/remove, restoration reuse and intra-Family display ordering. |
| `stimulus-question-mutations.js` | Ordinary Group/Option Question save/remove behavior using canonical lower-level specificity policy. |
| `stimulus-family-admin-read.js` | Production Admin Stimulus Family authoring read model. |
| `asset-questions.js` | Canonical reusable exact-Asset Question lifecycle and explicit option opt-ins, including its source-aware fixed-image conversion. It consumes `StimulusGroupInputError` from `stimulus-family-error.js` and Prompt specificity directly from `stimulus-family-specificity.js`, not through the façade. |

Purpose-specific modules remain separate where that reflects real domain ownership rather than being forced behind the façade:

- `stimulus-originals.js` — explicit Original reassignment;
- `stimulus-role-conversion.js` — Alternative → always-shown/supporting conversion while preserving archived option identity;
- `simple-stimulus-curation.js` — atomic simple Original/Alternative authoring convenience;
- `image-option-move.js` — same-Case cross-Family option movement coordinator, with Production and Preview branches;
- `stimulus-audit.js` — Production Original cleanup/audit read model;
- `asset-replacement.js` — same-image higher-resolution replacement while preserving option identity and historical provenance;
- `question-scope.js` / `case-questions.js` — their established authoring workflows and compatibility calls.

Some of those purpose-specific or route-facing modules still import `stimulus-groups.js` as an intentional compatibility surface. That is not a violation by itself. The prohibited direction is a lower-level implementation owner depending upward on the façade that re-exports it.

### Learner boundary

Stimulus Family learner selection/read behavior is no longer embedded directly inside `learning.js`.

`src/lib/server/db/learner-stimulus-families.js` owns learner-purpose current Family reads and selection:

1. load active Families for the active Production Case;
2. require `selection_count = 1`;
3. load active, non-removed options backed by active Production Assets;
4. apply Original/Alternative selection for Core/Expanded, while preserving legacy random selection for `original_option_id = NULL` Families;
5. load active Group Questions;
6. load active exact selected-Option Questions;
7. load active reusable Asset Questions only through explicit opt-in and only when the reusable Asset still exactly matches the selected Option Asset;
8. return selected Asset/Family/Option provenance and Family coverage metadata.

`src/lib/server/db/learner-case-source.js` composes the learner Case/Topic/Tag/fixed-Asset/question sources with `learner-stimulus-families.js`, then invokes the existing question-pool-mode resolver.

`src/lib/server/db/learning.js` retains Review orchestration and writes:

- Review creation/continuation;
- final question picking;
- Review Question snapshots and source provenance;
- Review Asset snapshots and Family/Option provenance;
- reveal/completion/read orchestration.

`src/lib/server/learning/question-pool-mode.ts` still defines the Core/Expanded input boundary, and `src/lib/server/learning/questions.js` still owns precedence, selected-group compatibility at resolution time and final coverage-aware question picking.

The learner Stimulus adapter/read modules do **not** import the Production mutation services or the `stimulus-groups.js` compatibility façade.

### Preview remains purpose-specific

`src/lib/server/db/preview-workspace.js` remains the retained Preview façade over the same physical tables with Preview ownership guards. Production refactoring did not give Production mutation modules authority over Preview.

`image-option-move.js` intentionally keeps two paths:

- Production (`previewSessionId == null`) delegates prospective movement validation to the canonical Production `validateStimulusOptionMoveState` policy;
- Preview retains its existing Preview-local movement/coverage simulation and ownership predicates.

This asymmetry is intentional. Do not rewrite the architecture as though Preview movement now shares Production-only mutation guards.

Migration `0016` deliberately leaves Preview `original_option_id` values uncurated.

### Import Package v1 remains unchanged

`src/lib/server/import/content-package.js` Import Package v1 has no Stimulus Family collections. It imports Cases, fixed Assets/CaseAssets and Questions only.

PR #112 does not extend or redesign that schema.

## Implemented dependency direction

The post-Checkpoint-B Production direction is effectively:

```text
schema + content guards
        ↓
Stimulus Family error / input / eligibility primitives
        ↓
canonical coverage + specificity policy
        ↓
prospective live-state composition
        ↓
focused family / option / ordinary-question mutations
        ↓
stimulus-groups.js compatibility façade
        ↓
Production Admin routes and other existing compatibility callers
```

Reusable Asset Questions are a sibling mutation owner that consumes the lower policy directly:

```text
canonical error + specificity policy
        ↓
asset-questions.js reusable lifecycle
```

Learner reads are parallel, not downstream of Production mutations:

```text
schema + pure learner question/selection policy
        ↓
learner-stimulus-families.js
        ↓
learner-case-source.js
        ↓
learning.js Review orchestration / snapshots
```

Preview remains parallel:

```text
schema + Preview ownership primitives
        ↓
preview-workspace.js retained façade
```

The façade may re-export lower implementation modules. A lower implementation module that is re-exported by the façade must not import the façade, because that would invert ownership and risk a cycle.

## Current compatibility surface

The following exports remain part of the `stimulus-groups.js` compatibility surface:

- `StimulusGroupInputError`;
- `getCaseStimulusCoverageRequirement`;
- `ensurePromptIsNotUsedByAnotherGroup`;
- `validateStimulusOptionMoveState`;
- `validateStimulusOptionRestoration`;
- `getAdminStimulusData`;
- `createStimulusGroup`;
- `startStimulusGroupFromCaseAsset`;
- `updateStimulusGroup`;
- `addStimulusOption`;
- `convertCaseAssetToStimulusOption`;
- `setStimulusOptionActive`;
- `removeStimulusOptionFromCase`;
- `moveStimulusOption` (display-order movement inside one Family);
- `saveStimulusGroupQuestion`;
- `saveStimulusOptionQuestion`;
- `removeStimulusGroupQuestion`;
- `removeStimulusOptionQuestion`.

This is a compatibility façade, not a requirement to aggregate every Stimulus-related function into one service object.

### Shared error identity is part of compatibility

Admin routes and focused compatibility callers use `instanceof StimulusGroupInputError` to classify expected authoring failures. `stimulus-family-error.js` therefore owns the single constructor, and `stimulus-groups.js` re-exports that exact object.

Do not create look-alike Stimulus error classes for extracted ownership paths.

## Database protection

### Core tables and constraints

The implemented schema uses:

- `stimulus_groups`;
- `stimulus_group_options`;
- `stimulus_group_questions`;
- `stimulus_option_questions`;
- `asset_questions`;
- `stimulus_option_asset_questions`;
- `case_assets`;
- Review provenance columns on `review_assets` / `review_questions`.

Important schema constraints include positive `selection_count`, supported coverage modes, non-negative display orders, unique Family+Asset and Family+display-order option relationships, unique Question relationships, restrictive foreign keys, and exact Option/Asset-question opt-in identity.

### Migration ownership

`0002_optional_stimulus_groups.sql` establishes the original Family/Option/Question model, Case question-count mode and Review Stimulus provenance.

`0009_reusable_image_questions.sql` adds canonical `asset_questions`, explicit Option opt-ins, exact-Asset matching triggers, Production/Preview protection for reusable content, reusable-question Review provenance, and cross-group Prompt guards specifically for conflicts in which reusable Asset Question usage participates.

`0010_reusable_image_reactivation_guard.sql` revalidates cross-group Prompt compatibility specifically when a dormant reusable Asset Question is reactivated.

`0012_archive_stimulus_options.sql` adds `removed_from_case`; this is relationship history, not Asset deletion.

`0016_original_stimulus_options.sql` adds `original_option_id`, conservative Production backfill and Original-integrity guards.

`0017_align_reusable_prompt_live_state_guards.sql` is the accepted Checkpoint A forward migration. It replaces the reusable cross-Family Prompt trigger definitions from `0009`/`0010` so deployed databases use the same dormant-parent definition as the canonical application policy. Historical migrations remain immutable.

`0017` remains deliberately narrow:

- it aligns existing reusable-path defense-in-depth with inactive-Family/inactive-Option/removed-Option dormant semantics;
- it is **not** a general ordinary exact-vs-exact D1 guard;
- it is **not** a movement-specific trigger;
- it does not make D1 the sole owner of the general cross-Family Prompt invariant.

There is still no general D1 constraint preventing an ordinary `stimulus_group_question` or `stimulus_option_question` from conflicting with another ordinary Group/Option Question in another independently selectable Family. The general rule is application-enforced and checked again by the learner resolver.

### Original-integrity triggers remain part of the domain contract

Migration `0016` protects, among other cases:

- assignment of an Original that is not an eligible option in its Family;
- reactivation/movement of an active Production Family with an invalid explicit Original;
- moving, deactivating, removing or deleting the current Original option;
- repointing an active Production Original to an ineligible Asset;
- deactivating an Asset that still backs an Original in an active Family.

Application preflight supplies contextual validation; D1 remains the atomic final guard for the Original invariants it covers.

## Accepted correctness semantics — implemented in Checkpoint A

The five reviewed decisions are no longer future targets. They are the implemented semantic baseline that Checkpoint B mechanically decomposed.

### 1. Same-Case Production movement uses canonical post-move coverage

Production movement evaluates the prospective post-move graph through the canonical coverage model:

- active Group Questions;
- active exact Option Questions;
- valid active reusable exact-Asset Question usages;
- Prompt deduplication;
- `none` / `minimum` / `all`;
- additive active-Family requirements;
- Case Fixed-N compatibility.

Movement preserves the same Stimulus Option row and Asset relationship, so attached exact Questions, reusable opt-ins, caption and historical provenance remain attached.

Preview does not use this Production validator.

### 2. The transition that makes content live performs complete revalidation

When an inactive Option becomes active inside an already active Family, or an inactive Family becomes active, prospective live-state validation establishes:

- Production image eligibility;
- explicit Original integrity where an Original pointer exists;
- cross-Family Prompt specificity;
- canonical coverage;
- Case Fixed-N compatibility.

An Option may become active while its parent Family remains inactive without becoming learner-selectable. Family activation is then the decisive full validation boundary.

Archived `removed_from_case` restoration remains a distinct, stronger lifecycle transition while sharing lower-level validators.

### 3. Retained Prompt ownership is revalidated on Production movement

Same-Case movement intentionally preserves exact Option Questions and reusable Asset Question opt-ins. Before the Family ownership update, active retained Prompt IDs are evaluated in the prospective target-Family graph.

- same-Prompt sources within the target Family are legal because precedence resolves them;
- conflicts with another simultaneously selectable active Family are rejected;
- inactive Families, inactive Options and removed Options do not reserve live ownership.

No movement-specific D1 trigger was added.

### 4. Source-aware fixed-image conversion assigns Original explicitly

When a known fixed Production image is transparently converted into the established one-option Family shape for exact/reusable image-specific authoring, the preserved source Option is assigned as the explicit Original in the same coherent atomic mutation before the fixed relationship is removed.

The explicit **Start Alternative Set** source-aware flow follows the same source-known principle.

Generic option insertion/conversion into an existing Family remains different: it does **not** infer Original from insertion order, display order, name, caption or sequence.

The Production read-only audit after fixing future writes found zero active Production Families matching the conservative one-option uncurated predicate. No cleanup/backfill migration was required. Preview was excluded.

### 5. Inactive parents are dormant for live cross-Family Prompt ownership

Inactive Families, inactive Options and removed Options retain authored Question/opt-in relationships but do not reserve a live Prompt because they are not learner-selectable.

Any transition that would make retained content selectable revalidates the resulting live Prompt graph before the transition is committed.

This replaced the parent-activity asymmetry characterized by the PR #110 baseline.

## Current question and coverage semantics

- Group Question applies across every eligible option in the Family;
- exact Option Question applies only when that Option is selected;
- reusable Asset Question applies only through explicit opt-in for the exact current Asset;
- precedence remains exact Option > reusable Asset > Group > Case > exact Topic > Tag-shared > ancestor;
- same-Prompt sources within one selectable Family may coexist because precedence resolves them;
- one active Prompt must not independently become stimulus-specific in more than one simultaneously selectable active Family in the same Case;
- inactive Families, inactive Options and `removed_from_case` Options are dormant for live Prompt ownership;
- Family coverage composes additively across independently selected active Families;
- canonical coverage includes Group, exact Option and valid reusable Asset Question Prompt sets with Prompt deduplication;
- Fixed Case question count rejects impossible guarantees;
- Core excludes reusable Asset/Topic/Tag/ancestor inputs while retaining Case/Group/exact Option knowledge;
- Expanded uses the full resolver input.

## Current learner semantics and provenance

For a curated Family with a valid explicit Original:

- **Core** chooses the Original;
- **Expanded** chooses an eligible non-Original Alternative when one exists, otherwise the Original.

For a legacy `original_option_id = NULL` Family, selection remains random among eligible options in both modes.

Eligible learner options remain active, non-removed and backed by active Production Assets. `selection_count` must be exactly `1` for the current learner implementation.

Question-source loading remains:

- active Family-wide Group Questions;
- active exact Questions for the selected Option;
- active reusable Asset Questions only through explicit opt-in and exact selected-Asset match.

Review creation still snapshots:

- Prompt/answer content and Question source provenance;
- Asset storage/caption/alt-text state;
- source Stimulus Family and Option IDs.

Later authoring changes do not rewrite historical Review rows.

## Invariant ownership matrix — implemented state

| Invariant | Application owner(s) | Database / schema owner | Learner/read enforcement | Representative coverage |
| --- | --- | --- | --- | --- |
| Production operations cannot mutate Preview-owned Case/Asset content | Production eligibility/content guards and production-scoped joins | reusable-question Preview guards; FKs | learner reads Production only | Production/Preview and reusable-image suites |
| Current Original must be an eligible Option in its own active Production Family | `stimulus-originals.js`; `stimulus-family-live-state.js`; lifecycle/move preflights | `0016` Original triggers | learner uses explicit pointer only against loaded eligible options | Original semantics suites |
| Current Original cannot be silently removed/deactivated/moved/deleted | option lifecycle, movement and role-conversion preflights | `0016` option update/delete triggers | n/a | Original semantics suites |
| Asset lifecycle cannot invalidate a protected Original | `asset-replacement.js`; Asset lifecycle operations | `0016` Original Asset guards | n/a | Original + replacement suites |
| Inactive / `removed_from_case` Options are not learner-selectable | `stimulus-option-lifecycle.js` | persisted state + FKs | `learner-stimulus-families.js` active/non-removed filter | Stimulus/Original suites |
| Archived restoration revalidates live eligibility/coverage while preserving identity | `stimulus-family-live-state.js`; `stimulus-option-lifecycle.js`; Admin workflow | Original triggers remain final guard | learner sees the row only after valid restoration | reusable restoration + Checkpoint A tests |
| Reusable Asset Question applies only to exact Asset + explicit Option usage | `asset-questions.js` | `0009` exact-Asset triggers | `learner-stimulus-families.js` exact current Asset match | reusable image suites |
| Cross-Family live Prompt specificity | `stimulus-family-specificity.js` consumed by ordinary/reusable writers and live-state transitions | no general ordinary exact-vs-exact D1 guard; `0009`/`0010` reusable guards aligned by `0017` | learner resolver rejects incompatible selected-group context | question-scope/reusable + Checkpoint A specificity tests |
| Canonical coverage is satisfiable for every eligible live option | `stimulus-family-coverage.js` + `stimulus-family-live-state.js` | coverage-mode/check constraints only | `pickReviewQuestions` enforces selected Review coverage | Stimulus/reusable restoration + Checkpoint A tests |
| Fixed Case count can satisfy active Family guarantees | `stimulus-family-coverage.js`; Case authoring callers | Case mode/count constraints only | `pickReviewQuestions` rejects impossible selected coverage | Stimulus + Checkpoint A tests |
| Core/Expanded preserves Original/Alternative semantics | n/a mutation side | pointer + lifecycle state | `learner-stimulus-families.js` + `question-pool-mode.ts` | Original semantics suites |
| Review snapshots preserve historical identity/provenance | stable-identity mutation paths | Review FK/provenance schema | `learning.js` snapshots | Stimulus/Original/replacement suites |
| Admin, audit and learner reads do not confer shared mutation ownership | purpose-specific read modules | n/a | purpose-specific | façade/boundary + route/module tests |

## Historical pre-refactor baseline and hazards

This section is retained because it explains the staged design and the defects Checkpoint A intentionally corrected. It is **historical context**, not the current module map.

### Historical hotspot

Before Checkpoint B, `stimulus-groups.js` combined Family CRUD/read behavior, Option lifecycle, coverage, restoration, ordinary Group/Option Question mutations, specificity validation and the shared error constructor. Several already-focused callers/modules depended on it.

That made a direct “split the large file” refactor unsafe: if the façade imported extracted modules while those modules still imported façade primitives, circular dependencies were likely.

Checkpoint B solved this by moving canonical primitives/policy downward first and leaving `stimulus-groups.js` as a compatibility-only re-export surface.

### Historical coverage duplication

Before Checkpoint A, canonical restoration coverage and narrower local activation/movement simulations did not agree. In particular, the movement simulation omitted valid reusable Asset Questions.

Checkpoint A established one Production semantic owner; Checkpoint B moved that owner to `stimulus-family-coverage.js`. The retained local simulation in `image-option-move.js` is Preview-only and must not be mistaken for competing Production coverage policy.

### Historical cross-Family Prompt asymmetry

PR #110 characterized an application/database parent-activity asymmetry and an option-movement bypass. The accepted dormant-parent policy plus prospective movement validation intentionally replaced that baseline behavior.

Database protection remains layered but asymmetric in scope: reusable-path triggers provide defense-in-depth, while general ordinary exact-vs-exact protection remains application-owned.

### Historical fixed-image Original gap

PR #110 identified transparent exact/reusable fixed-image conversions that created a one-option Family without curating the known source as Original. Checkpoint A fixed those source-aware flows and audited Production, finding no rows requiring cleanup.

### Lifecycle and stable identity hazards that remain relevant

`is_active` and `removed_from_case` are still different states. Restoration remains stronger than ordinary activation.

Stimulus Option ID remains observable domain state because it anchors:

- `original_option_id`;
- exact Option Questions;
- reusable Asset Question opt-ins;
- Review source provenance.

Role correction, movement and same-image quality replacement must preserve stable identity where their established contracts require it.

## Test safety net after Checkpoints A and B

The existing large behavioral suites remain part of the regression fence, including:

- `test/stimulus-groups.test.js`;
- `test/original-stimulus-semantics.test.js`;
- `test/simple-stimulus-curation.test.js`;
- `test/stimulus-audit.test.js`;
- `test/stimulus-reusable-coverage-restoration.test.js`;
- `test/reusable-image-questions.test.js`;
- `test/reusable-image-question-safety-regression.test.js`;
- `test/question-scope.test.js`;
- `test/image-management-v2.test.js`;
- `test/asset-higher-resolution-replacement.test.js`.

PR #112 adds/updates focused safety coverage including:

- `test/stimulus-family-correctness-checkpoint-a.test.js` — target behavior for the settled correctness decisions;
- `test/stimulus-family-correctness-checkpoint-a-boundaries.test.js` — lifecycle/source-aware/Preview boundary cases;
- `test/stimulus-family-live-prompt-trigger-alignment.test.js` — `0017` reusable-trigger/live-state alignment;
- `test/stimulus-prompt-specificity-characterisation.test.js` — intentionally updated from the PR #110 old-state characterization to the implemented dormant-parent policy;
- `test/stimulus-family-facade-contract.test.js` — compatibility operations, exact error constructor identity, downward façade dependency direction including `asset-questions.js`, and learner independence from Production mutation services.

The boundary test deliberately protects architectural contracts that would otherwise be easy to regress during later maintenance. It does not attempt to ban every remaining compatibility import of `stimulus-groups.js`.

## Staged implementation record

### PR #110 — architecture and characterization baseline

PR #110 established:

- the domain/caller/invariant map;
- the five reviewed correctness decisions;
- the stable façade/error-identity requirement;
- the planned dependency direction;
- characterization coverage needed before sensitive changes.

It did not implement the five correctness changes itself.

### PR #112 Checkpoint A — correctness tranche — accepted

Accepted head: `fc7b0e3d1fdc6f8561ecc5d4ccc2d35f950f5dda`.

Checkpoint A implemented the five reviewed semantics, added `0017` for the narrow reusable-trigger alignment, completed the Production read-only audit and stopped for independent semantic review before decomposition.

### PR #112 Checkpoint B — mechanical decomposition — accepted

Accepted reviewed head after correction: `4ca09338d333603df38f2017b221a9a35c247960`.

Checkpoint B:

1. established the canonical error/input/eligibility primitives;
2. extracted canonical coverage and specificity policy;
3. extracted prospective live-state composition;
4. extracted Family and Option lifecycle ownership;
5. extracted ordinary Stimulus Question mutation ownership and the Admin read model;
6. isolated learner-purpose Stimulus reads/selection from Review orchestration;
7. reduced `stimulus-groups.js` to the compatibility façade;
8. corrected `asset-questions.js` to consume canonical error/specificity downward and added it to the boundary test.

Checkpoint B was structural: it preserved the accepted Checkpoint A semantics.

## Final Definition-of-Done / merge gate

The implemented architecture is ready for final review only when all of the following remain true on the exact proposed head:

- the five accepted correctness semantics above remain implemented and tested;
- canonical specificity, coverage and prospective live-state validation remain the Production owners rather than new local simulations;
- Production movement preserves Option/Asset identity, exact Questions, reusable opt-ins, captions and history while validating the post-move graph;
- live Family/Option transitions establish eligibility, Original integrity, specificity, coverage and Fixed-N compatibility at the transition that makes content selectable;
- source-aware fixed-image conversions assign explicit Original, while generic insertion does not infer Original;
- the Production audit result remains recorded as no cleanup required unless later evidence justifies a separately reviewed data operation;
- dependency direction remains one-way and lower implementation owners do not import the façade;
- reusable Asset Question ownership continues to consume lower shared policy directly;
- learner Stimulus reads stay independent of Production mutation services and the façade;
- the compatibility surface and exact shared `StimulusGroupInputError` identity remain intact;
- Core/Expanded selection, question precedence, supporting/fixed-image behavior, stable identity and historical Review snapshots/provenance remain unchanged outside the five approved corrections;
- Production/Preview ownership separation remains intact and Preview is not silently routed through Production mutation guards;
- Import Package v1 remains unchanged;
- historical migrations remain immutable and no additional schema/D1 work is added without separate justification;
- repository-owned full validation passes on the exact final head intended for review/merge;
- any independent final review has no unresolved correctness, architecture or scope findings.

Do not merge a later, unvalidated head on the strength of validation from an earlier SHA.
