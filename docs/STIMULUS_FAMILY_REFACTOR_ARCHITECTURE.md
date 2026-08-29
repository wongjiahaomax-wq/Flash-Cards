# Stimulus Family refactor architecture

_Status: architecture baseline plus Checkpoint A correctness implementation status_

_Audited against `main` at `c4284c4c9ed0bf2367b990b0cbe43632309d0be5` on 29 August 2026._

_Correctness decisions for the five audit findings were settled on 29 August 2026. PR #110 documents those target semantics. Draft PR #112 implements Checkpoint A and remains gated on independent acceptance before mechanical Checkpoint B._

This document defines the safe architectural boundary for refactoring Production Stimulus Families without redesigning learner or Admin behaviour. It is deliberately descriptive first: current executable code, migrations and tests remain authoritative for current behaviour if this document becomes stale. Sections explicitly labelled **target semantics** describe reviewed follow-up behaviour that is not yet implemented by PR #110.

The term **Stimulus Family** is used here as the domain name for the existing `stimulus_groups` / Alternative Set model. This document does not rename the persisted model or product terminology.

## Scope and non-goals

The refactor programme should preserve:

- fixed Case images (`case_assets`) as a valid, separate concept;
- active/inactive and `removed_from_case` as distinct states;
- explicit Production Original semantics and the legacy `original_option_id = NULL` compatibility path;
- Core versus Expanded Learning selection;
- Group, Option and reusable Asset Question semantics and precedence;
- Case fixed-question-count constraints and Stimulus coverage guarantees;
- Production/Preview ownership separation;
- Review snapshot/provenance history;
- D1 triggers and schema constraints as complementary integrity enforcement where those safeguards actually exist.

The programme is not a schema redesign, Preview rebuild, generic repository/service-layer introduction, JS-to-TS migration, or route reorganisation.

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

The current learner supports only `selection_count = 1`. Database constraints require a positive count, while the learner loader rejects unsupported values rather than silently inventing multi-option behaviour.

### State terms are intentionally not interchangeable

- **active option**: `stimulus_group_options.is_active = true`;
- **in Case**: `removed_from_case = false`;
- **archived/removed option relationship**: the option row remains for identity/history, normally with `is_active = false` and `removed_from_case = true`;
- **active Asset**: the backing Asset remains eligible for current use;
- **active family**: the family participates in current authoring/learner selection;
- **Original**: `stimulus_groups.original_option_id` points at the canonical option for a curated family;
- **Alternative**: an eligible non-Original option in a curated family.

Deleting or recreating rows to simulate these transitions would break current identity/provenance semantics.

## Current module map

### Production mutation/read modules

| Module | Current ownership | Important coupling |
| --- | --- | --- |
| `src/lib/server/db/stimulus-groups.js` | Main compatibility surface; family CRUD/read model, option add/convert/reactivate/archive/reorder, coverage calculation, restoration validation, Group/Option Question writes, cross-group Prompt validation, shared error class | Large hotspot. Imported by routes and by already-extracted focused modules. |
| `stimulus-originals.js` | Explicit Original reassignment | Imports `StimulusGroupInputError` from `stimulus-groups.js`; D1 triggers provide final atomic guard. |
| `stimulus-role-conversion.js` | Alternative → always-shown/supporting conversion while archiving the option identity | Imports the shared error class; preserves Asset and option history. |
| `simple-stimulus-curation.js` | Atomic two-fixed-image Original/Alternative authoring convenience | Creates family/options and assigns Original in one batch. |
| `image-option-move.js` | Same-Case option movement between families, Production and Preview scoped by caller input | Preserves option identity, exact Option Questions, reusable opt-ins and caption; owns local coverage simulation. |
| `stimulus-audit.js` | Production cleanup/read model for ambiguous/unassigned Original state | Intentionally reports rather than mutates. |
| `asset-questions.js` | Canonical reusable exact-Asset Questions and explicit option opt-ins; fixed-image conversion for reuse | Shares the reusable-Asset branch of the cross-group Prompt invariant with `stimulus-groups.js`; `0009`/`0010` provide reusable-path database guards. |
| `question-scope.js` | Case Question ↔ exact-stimulus authoring and fixed-image conversion | Calls `saveStimulusOptionQuestion` and shared Prompt guard from `stimulus-groups.js`. |
| `case-assets.js` | Always-shown fixed image relationships | Rejects current grouped-option conflicts; remains a separate domain boundary. |
| `admin-image-workflow.js` | Bounded image picker/bulk attachment workflows | Imports restoration validation and shared Stimulus error; performs its own target preflight. |
| `asset-replacement.js` | Higher-resolution replacement of the same underlying image | Repoints stable option rows before deactivating the old Asset; preserves Original pointer and historical Review rows. |
| `admin-content.js` | Case authoring, including fixed question-count validation | Calls `getCaseStimulusCoverageRequirement`. |
| `case-questions.js` | Case Question authoring | Uses the shared cross-group Prompt guard to prevent incompatible scope reuse. |

### Learner modules

`src/lib/server/db/learning.js` reads Stimulus tables directly. It does not call Production mutation helpers.

Its Stimulus responsibilities are:

1. load active families for an active Production Case;
2. load active, non-removed options backed by active Production Assets;
3. select one option per family;
4. load Group Questions, selected Option Questions and explicit reusable Asset Questions whose Asset still exactly matches the selected option;
5. resolve the question pool;
6. apply family coverage to Case question selection;
7. snapshot selected Asset/Family/Option and Question provenance into Review rows.

`src/lib/server/learning/question-pool-mode.ts` defines the Core/Expanded input boundary:

- Core: Case + Stimulus Group + selected Option Questions;
- Expanded: the full resolver input, including reusable Asset, Topic, Tag-shared and ancestor inputs.

`src/lib/server/learning/questions.js` owns question precedence, cross-selected-group compatibility at resolution time, and final coverage-aware question picking.

### Preview

`src/lib/server/db/preview-workspace.js` is a parallel retained-legacy façade over the same physical Stimulus tables with Preview ownership guards. It does **not** import the Production `stimulus-groups.js` mutation surface.

That separation is intentional. Production refactoring must not force Preview through Production ownership guards, and migration `0016` deliberately leaves Preview `original_option_id` values uncurated.

### Imports

`src/lib/server/import/content-package.js` Import Package v1 has no Stimulus Family collections. It imports Cases, fixed Assets/CaseAssets and Questions only. A Stimulus refactor must not silently extend or change the import-package schema.

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

Important schema constraints include positive `selection_count`, supported coverage modes, non-negative display orders, unique family+Asset and family+display-order option relationships, unique Question relationships, restrictive foreign keys, and exact option/Asset-question opt-in identity.

### Migration ownership

`0002_optional_stimulus_groups.sql` establishes the original family/option/question model, Case question-count mode, and Review Stimulus provenance.

`0009_reusable_image_questions.sql` adds canonical `asset_questions`, explicit option opt-ins, exact-Asset matching triggers, Production/Preview protection for reusable content, reusable-question Review provenance, and cross-group Prompt guards specifically for conflicts in which reusable Asset Question usage participates.

`0010_reusable_image_reactivation_guard.sql` revalidates cross-group Prompt compatibility specifically when a dormant reusable Asset Question is reactivated.

`0012_archive_stimulus_options.sql` adds `removed_from_case`; this is relationship history, not Asset deletion.

`0016_original_stimulus_options.sql` adds `original_option_id`, conservative Production backfill, and the final Original-integrity guards.

`0017_align_reusable_prompt_live_state_guards.sql` is a Checkpoint A forward migration that replaces the reusable cross-Family Prompt trigger definitions from `0009`/`0010` so deployed databases use the same dormant-parent definition as the reviewed application policy. Historical migrations remain immutable. `0017` is not a general ordinary exact-vs-exact guard and does not add a movement-specific trigger.

`0009` and `0010` do **not** provide a general D1 constraint preventing an ordinary `stimulus_group_question` or `stimulus_option_question` from conflicting with another ordinary Group/Option Question in another independently selectable Family. The general ordinary exact-question rule is currently enforced by application validation and by the learner resolver. Future extraction work must not weaken application enforcement on the assumption that D1 supplies a general fallback that does not exist.

Checkpoint A review exposed one necessary forward D1 alignment: the historical reusable-question triggers from `0009`/`0010` predated the settled dormant-parent policy and overrejected authored relationships under inactive Families/Options. PR #112 therefore adds `0017_align_reusable_prompt_live_state_guards.sql` to align those existing reusable defense-in-depth triggers on deployed databases without rewriting migration history. This does not create a general ordinary exact-vs-exact D1 guard. If a future change proposes general database enforcement of the cross-Family Prompt invariant, it should still be designed comprehensively rather than as a movement-specific trigger.

### Original-integrity triggers are part of the domain contract

Migration `0016` currently protects:

- new family insertion from supplying an arbitrary non-null Original before the option exists;
- assignment of an Original that is not an active, non-removed option in the family backed by an active Asset;
- reactivation/movement of an active Production family with an invalid explicit Original;
- moving, deactivating or removing the current Original option;
- repointing an active Production Original to an ineligible Asset;
- deleting the current Original option;
- deactivating an Asset that still backs an Original in an active family.

Application preflight provides contextual/friendly validation. The D1 triggers provide the atomic last line of defence for the Original invariants they cover. Future refactors must preserve both layers.

## Current compatibility surface

`src/lib/server/db/stimulus-groups.js` should remain the compatibility façade while its internals are decomposed.

The following current exports are part of that migration surface and should remain import-compatible until a deliberate caller-migration change says otherwise:

- `StimulusGroupInputError`;
- `getCaseStimulusCoverageRequirement`;
- `validateStimulusOptionRestoration`;
- `getAdminStimulusData`;
- `createStimulusGroup`;
- `startStimulusGroupFromCaseAsset`;
- `updateStimulusGroup`;
- `addStimulusOption`;
- `convertCaseAssetToStimulusOption`;
- `setStimulusOptionActive`;
- `removeStimulusOptionFromCase`;
- `ensurePromptIsNotUsedByAnotherGroup`;
- `moveStimulusOption` (display-order movement inside one family);
- `saveStimulusGroupQuestion`;
- `saveStimulusOptionQuestion`;
- `removeStimulusGroupQuestion`;
- `removeStimulusOptionQuestion`.

This is a **compatibility façade for the existing module**, not a requirement to aggregate every Stimulus-related function into one service object. Existing focused public modules such as `stimulus-originals.js`, `stimulus-role-conversion.js`, `simple-stimulus-curation.js`, `image-option-move.js`, `stimulus-audit.js` and `asset-questions.js` can remain separately imported.

### Why the shared error identity is part of compatibility

Several focused modules import `StimulusGroupInputError` from `stimulus-groups.js`, while Admin routes use `instanceof StimulusGroupInputError` to classify expected authoring errors as HTTP 400 rather than 500. An internal extraction must therefore preserve the same constructor identity, normally by moving the canonical class into a lower-level domain module and re-exporting that exact class from the façade.

Do not replace it with multiple look-alike error classes during decomposition.

## Caller map

The current important caller groups are:

### Production Admin

- `src/routes/admin/cases/[caseId]/+page.server.js` loads `getAdminStimulusData`, starts source-aware families, and orchestrates reusable-image actions through focused modules;
- `src/routes/admin/stimulus-roles/+server.js` uses fixed→Alternative conversion and focused Original/simple-role operations;
- `src/routes/admin/stimulus-original/+server.js` calls `setStimulusGroupOriginal` and relies on shared error identity;
- `src/routes/admin/stimulus-supporting/+server.js` calls Alternative→supporting conversion and relies on shared error identity;
- Admin image/question modules call restoration, coverage and cross-group Prompt checks behind their route actions.

### Learner Review creation

`src/lib/server/db/learning.js` is the runtime consumer of family/option state. It snapshots selected identities and question provenance so later authoring changes do not rewrite completed/in-progress Review content.

### Preview Admin

Preview uses `preview-workspace.js` and its scoped submodules. Same physical tables do not imply shared mutation authority.

### Asset replacement

`asset-replacement.js` mutates option `asset_id` while intentionally keeping option ID stable. Its ordering is coupled to Original triggers: eligible new Asset and option repoint must exist before old Asset deactivation.

### Question-scope conversion and reusable Asset Questions

`question-scope.js`, `case-questions.js`, and `asset-questions.js` share the policy that one Prompt should not become stimulus-specific in independently selectable groups of the same Case. The general ordinary Group/Option branch is enforced in application helpers and checked again by the learner resolver. Historical database defence from `0009`/`0010` is narrower: it covers reusable Asset Question opt-in/write/reactivation paths and ordinary writes only when they conflict with reusable usage. Checkpoint A migration `0017` aligns those existing reusable guards with the reviewed dormant-parent live-state definition.

## Invariant ownership matrix

| Invariant | Application owner(s) | Database / schema owner | Learner/read enforcement | Characterisation coverage |
| --- | --- | --- | --- | --- |
| Production operations cannot mutate Preview-owned Case/Asset content | Production content guards and production-scoped joins; focused modules | reusable Asset Question Preview rejection triggers; FKs | learner loads Production only | Production/Preview and reusable-image tests |
| Current Original must be an eligible option in its own active Production family | `stimulus-originals.js`; lifecycle/move preflights | `0016` Original triggers | learner only treats explicit pointer as curated when eligible options were loaded | `original-stimulus-semantics.test.js` |
| Current Original cannot be silently removed/deactivated/moved/deleted | option lifecycle, move and role-conversion preflights | `0016` option update/delete triggers | n/a | `original-stimulus-semantics.test.js` |
| Asset lifecycle cannot invalidate a protected Original | `asset-replacement.js`; Asset lifecycle operations | `assets_original_stimulus_deactivate_guard` and Original Asset repoint guard | n/a | Original + higher-resolution replacement tests |
| `removed_from_case` / inactive options are not learner-selectable | option lifecycle writers | persisted state + FKs | `learning.js` filters active + non-removed + active Asset | Stimulus Group / Original tests |
| Archived restoration revalidates current eligibility and coverage before reuse of stable identity | `validateStimulusOptionRestoration`; Admin bulk workflow | Original trigger still blocks invalid protected transition | learner sees restored row only after valid state | `stimulus-reusable-coverage-restoration.test.js` |
| Reusable Asset Question applies only to the exact Asset and explicit option usage | `asset-questions.js` | `0009` Asset-match triggers | loader requires opt-in and exact current option Asset match | reusable image question suites + replacement tests |
| Same Prompt should not be stimulus-specific in independently selectable selected groups | General ordinary Group/Option conflicts: `ensurePromptIsNotUsedByAnotherGroup` plus route/scope preflights. Reusable conflicts: additional checks in `asset-questions.js` | **No general ordinary exact-vs-exact D1 guard.** `0009`/`0010` establish the reusable-path guards; `0017` aligns their live-state predicates with dormant-parent semantics | resolver rejects incompatible selected-group context | question-scope + reusable-image suites + `stimulus-prompt-specificity-characterisation.test.js` |
| Coverage `none` / `minimum` / `all` must be satisfiable by eligible option-specific knowledge | `stimulus-groups.js` canonical coverage/restoration; some specialised local preflights | coverage mode/check constraints only; D1 does not calculate semantic coverage | `pickReviewQuestions` enforces selected Review coverage | Stimulus Group + reusable restoration tests |
| Fixed Case question count cannot be smaller than active family guarantees | `admin-content.js`; family update/restoration validation | Case mode/count constraints, but no cross-table semantic trigger | `pickReviewQuestions` rejects impossible selected coverage | Stimulus Group tests |
| Core/Expanded family choice preserves Original/Alternative semantics | n/a mutation side | pointer + lifecycle state | `learning.js` selection + `question-pool-mode.ts` | Original semantics tests |
| Review snapshots preserve historical Asset/option/question identity after later edits | mutation paths preserve stable IDs where required | Review FK/provenance schema | Review creation snapshots prompt/answer/assets/provenance | Stimulus Group, Original and replacement tests |
| Family/option read models used by Admin do not confer mutation ownership | purpose-specific DB reads | n/a | n/a | route/module tests |

The matrix above describes the current implementation baseline. The resolved target semantics below deliberately change the application meaning of inactive parents and require movement/reactivation to converge on canonical policies before mechanical decomposition.

## Meaningful transitions and target correctness boundaries

Future implementation should reason about transitions rather than create a Cartesian-product test matrix. Current behaviour remains executable authority until the correctness tranche lands; the bullets below identify the intended transition boundaries.

### Family lifecycle

- create active/inactive family for an active Production Case;
- update coverage/name/activity without making Case fixed-count state impossible;
- before an inactive Family becomes learner-selectable, validate the complete live state: Original eligibility/integrity, cross-Family Prompt specificity, canonical coverage and Fixed-N compatibility;
- retain legacy `original_option_id = NULL` compatibility for existing ambiguous historical families until explicitly curated or conservatively cleaned up under the settled rule below.

### Option membership/lifecycle

- add a new eligible Production image;
- convert a fixed image into an option without duplicating current Case use;
- deactivate/reactivate an option;
- if an option activation inside an already active Family makes it learner-selectable, validate its complete live-state invariants before activation;
- activating an option while its parent Family remains inactive does not by itself make the content live; Family activation remains the decisive validation boundary;
- archive/remove the option relationship while preserving Asset and historical identity;
- restore the archived option in its original family after revalidation;
- move a non-Original option within the same Case while preserving option identity, caption, exact Questions and reusable opt-ins, but validate the post-move live graph before the ownership change;
- move an Alternative to always-shown/supporting while archiving the old option identity;
- reorder options without changing semantics.

### Original semantics

- explicitly designate an eligible Original;
- change Original before any destructive transition of the old Original;
- explicit **Start Alternative Set** source-aware creation assigns the known source image as Original atomically;
- transparent Production fixed-image conversion performed to create an exact/reusable image-specific relationship is also source-aware and must assign the preserved source option as Original in the same coherent atomic mutation;
- generic sequential option insertion must not infer Original from insert/display order;
- higher-resolution same-image replacement preserves the stable option identity referenced by Original.

### Question and coverage semantics

- Group Question applies across every eligible option in the family;
- exact Option Question applies only when that option is selected;
- reusable Asset Question applies only through explicit opt-in for the exact current Asset;
- precedence remains exact Option > reusable Asset > Group > Case > exact Topic > Tag-shared > ancestor;
- same-Prompt sources within one selectable Family may coexist because precedence resolves them;
- the same active Prompt must not independently become stimulus-specific in more than one simultaneously selectable active Family in the same Case;
- inactive Families, inactive Options and `removed_from_case` Options are dormant for live cross-Family Prompt ownership; their relationships remain stored but do not reserve a Prompt until a transition would make them selectable again;
- any transition that makes dormant content live must validate the resulting cross-Family Prompt graph before learner selection can observe it;
- family coverage composes additively across independently selected active Families;
- canonical coverage includes active Group Questions, active exact Option Questions and valid active reusable Asset Question usages with Prompt deduplication;
- fixed Case count rejects impossible guarantees;
- Core excludes reusable Asset/Topic/Tag/ancestor inputs while retaining Case/Group/Option knowledge; Expanded uses the full pool.

### Historical provenance

- changing Original affects future Reviews, not stored Review snapshots;
- later Asset replacement keeps old Review Asset/provenance rows readable;
- moving/archiving current authoring relationships must not rewrite old Review rows.

## Distributed ownership and refactor hazards

### 1. `stimulus-groups.js` is both façade and dependency

Already-extracted modules import its shared error and validation helpers. If the façade simply begins importing every focused module for re-export, circular dependencies are easy to create.

The first implementation extraction should establish downward dependency direction: low-level Stimulus Family errors/eligibility/policy modules must not import the façade; the façade may import and re-export them.

### 2. Coverage has one canonical calculation but specialised local simulations

Canonical coverage in `stimulus-groups.js` accounts for active Group Questions, exact Option Questions, and valid reusable Asset Questions. Restoration explicitly uses that model.

Current option activation and same-Case option-move code use narrower local calculations. This is now a **confirmed correctness defect**, not an open architecture question. The implementation correctness tranche must establish one canonical coverage/eligibility policy and route transitions that make content live, including post-move validation, through it before mechanical extraction relies on that policy.

### 3. Cross-group Prompt protection is layered but asymmetric

General ordinary Group/Option Prompt conflicts are application-enforced by `ensurePromptIsNotUsedByAnotherGroup` and rejected by the learner resolver if incompatible groups are selected together. There is no general D1 exact-vs-exact guard for ordinary Questions.

`0009` and `0010` establish database defence only for reusable Asset Question paths: opt-in/write conflicts involving reusable usage and reusable-question reactivation. Checkpoint A migration `0017` preserves that narrow ownership while aligning target/other Family and Option lifecycle predicates with the reviewed live-state policy. Do not describe these triggers as a database owner of the whole invariant.

PR #110 characterized an application/database asymmetry around parent activity: ordinary Prompt checks could count inactive parents while reusable paths applied active Family/Option filtering. Checkpoint A in Draft PR #112 intentionally replaces that characterization with the reviewed live-state policy and adds SQL-trigger regression coverage for both ordinary-vs-reusable directions.

The implemented Checkpoint A policy treats inactive Families/options and removed Options as dormant for live Prompt ownership. The transition that makes dormant content selectable revalidates specificity first. Mechanical extraction must preserve this settled behavior rather than reintroducing the PR #110 baseline asymmetry.

PR #110 identified an invariant bypass because option movement changes `stimulus_group_options.stimulus_group_id` while retaining exact/reusable Question relationships. Checkpoint A now evaluates retained active exact/reusable Prompt IDs in the post-move Production graph, rejects conflicts with the old source Family or any third simultaneously selectable Family, and allows same-Family duplicates in the target. Preview retains its separate ownership-local path.

### 4. Some fixed-image conversions create a one-option family without curating Original

`startStimulusGroupFromCaseAsset` and simple two-image role assignment explicitly curate Original. PR #110 identified that fixed-image conversions inside Question-scope/reusable-question workflows created the established one-option family shape without an explicit Original update.

Checkpoint A fixes that Production semantic inconsistency: transparent fixed-image conversions have unambiguous source semantics, so the fixed image preserved into the new one-option Family is assigned as Original atomically. Generic option insertion remains unchanged and must never infer Original from sequence.

Checkpoint A fixed the future creation paths and completed the Production read-only audit on 29 August 2026. Zero active Production Families matched the conservative one-option uncurated predicate, so no Original cleanup/backfill migration is required. Do not infer Original from order/name/caption/history, and keep Preview excluded from this rule.

### 5. `is_active` and `removed_from_case` must not collapse

An inactive option remains a current relationship that can be reactivated. A removed option is archived from current Case use and restored through stricter validation. Treating both as a single `active` boolean would break restoration and history.

The settled dormant-parent policy does not erase this distinction. Both inactive and removed relationships are excluded from live Prompt ownership, but restoration remains a stronger lifecycle transition than ordinary activation and retains its identity/history semantics.

### 6. Stable option identity is observable domain state

Option ID anchors:

- `original_option_id`;
- exact Option Questions;
- reusable Asset Question opt-ins;
- Review source provenance.

Moving, correcting roles and same-image quality replacement must update relationships in place where current behaviour does so.

### 7. Read models should remain purpose-specific

Admin authoring, cleanup/audit and learner selection have different eligibility and history needs. Do not replace them with one giant `getStimulusFamily()` aggregate merely to reduce query duplication.

## Resolved correctness decisions for follow-up implementation

Two independent reviews converged on the following semantic contract. PR #110 documented these as **target semantics** without runtime changes; Checkpoint A in Draft PR #112 implements them and retains this section as the behavioral contract for later decomposition.

1. **Same-Case option move uses canonical post-move coverage.** `image-option-move.js` currently omits valid reusable Asset Questions from its local simulation. Production movement must instead validate the post-move state with the canonical coverage model: active Group Questions, active exact Option Questions, valid active reusable Asset Question usages, Prompt deduplication, `minimum` / `all`, every active Family and Case Fixed-N compatibility. Preserve stable Option/Asset identity, exact Questions, reusable opt-ins, caption and history. Do not route retained Preview behaviour through Production-only guards.

2. **Reactivation validates the transition that actually makes content live.** `setStimulusOptionActive(..., true)` currently performs a narrower local `minimum` check and omits reusable/fixed-count policy. Any transition that makes content learner-selectable must establish Asset eligibility, cross-Family Prompt specificity, canonical coverage, Fixed-N compatibility and Original integrity where relevant. An option can become active while its Family remains inactive without yet becoming live; in that case Family activation is the decisive full-validation boundary. Archived `removed_from_case` restoration remains the stronger lifecycle operation but should share lower-level live-state validators.

3. **Same-Case movement must revalidate retained Prompt ownership.** Movement intentionally preserves exact Option Questions and reusable Asset Question opt-ins. Before changing Family ownership, evaluate their active Prompt IDs as if the option already belonged to the target Family. Same-Prompt sources inside the target Family are legal under precedence. Conflicts with the old source Family or any third simultaneously selectable active Family are rejected. Use a canonical application-level specificity policy; do not add a movement-specific D1 trigger.

4. **Source-aware fixed-image conversion assigns Original.** Production conversion from a known fixed `case_assets` source into a one-option Family for exact/reusable image-specific authoring must create the Family with NULL Original as required, create the preserved option, explicitly assign that option as Original, remove the fixed relationship and perform the requested Question/opt-in mutation as one coherent atomic operation where required. Generic insertion continues not to infer Original. After fixing future writes, audit Production; only if affected rows actually exist should cleanup use the conservative Production-only rule: active Family, `original_option_id IS NULL`, exactly one eligible active/non-removed option backed by an active Production Asset, with no inference from order/name/caption/history and Preview excluded.

5. **Inactive parents are dormant, not live Prompt owners.** Inactive Families, inactive Options and removed Options retain their Question/opt-in relationships but do not participate in the live cross-Family Prompt invariant because they cannot be selected by the learner. Reactivation must validate all content that would become simultaneously selectable before it becomes live. This intentionally replaces the current ordinary/reusable parent-activity asymmetry characterized by PR #110.

Shared constraints for all five changes:

- preserve Asset and Stimulus Option identity;
- do not rewrite historical Review snapshots or provenance;
- do not redesign Preview or Import Package v1;
- do not add schema/D1 changes unless separately justified as a comprehensive invariant;
- make correctness changes regression-first and distinguish them from mechanical refactoring.

## Recommended semantic boundaries

The current coupling and settled target semantics support the following boundaries. These are ownership boundaries, not a mandated one-file-per-box layout.

### Compatibility façade

`stimulus-groups.js` remains the stable import surface for its existing exports until a deliberate caller migration says otherwise.

### Production family eligibility / invariant primitives

Own Production Case/family/option/Asset eligibility and the canonical Stimulus error type. This layer may depend on schema/content guards, but not on routes, the façade, learner orchestration or Preview.

### Coverage policy

Own the canonical calculation of eligible family-specific Prompt sets and `none` / `minimum` / `all` requirements, plus validation against Case Fixed-N. Specialised mutations must consume this policy rather than grow independent simulations.

### Option membership and lifecycle

Own add, fixed→option conversion, deactivate/reactivate, archive/remove, restore and display-order changes. Same-Case cross-family movement remains a related transition that preserves attached questions/opt-ins and therefore must invoke both canonical specificity and coverage policy against the post-move graph.

### Original / role semantics

Own explicit designation and transitions that need an Original precondition. `stimulus-originals.js`, `stimulus-role-conversion.js`, `simple-stimulus-curation.js`, D1 triggers and Asset replacement are already evidence for this boundary. Source-aware fixed-image conversion belongs to the explicit-Original rule; generic insertion does not.

### Stimulus-specific question semantics

Own Group/Option Question writes and the cross-group Prompt policy. Reusable Asset Question canonical ownership remains in `asset-questions.js`, but shared specificity checks should have one lower-level policy direction rather than mutual façade imports. The consolidated target policy is now explicit: only simultaneously selectable active parent relationships reserve live Prompt ownership, and reactivation validates dormant content before it becomes live.

### Read models

Keep separate:

- Production Admin authoring read model;
- audit/cleanup read model;
- learner selection/read model.

Learner selection and Review snapshot orchestration should not move into DB mutation modules.

## Target dependency direction

A safe staged direction is:

```text
schema + content guards
        ↓
Stimulus Family error / eligibility / invariant primitives
        ↓
coverage policy + specificity policy
        ↓
focused family / option / question mutations
        ↓
stimulus-groups.js compatibility façade
        ↓
Production Admin routes and other existing callers
```

Parallel consumers:

```text
schema + pure learner selection/question policy
        ↓
learner read model / Review snapshot orchestration
```

and:

```text
schema + Preview ownership primitives
        ↓
preview-workspace.js façade
```

A focused internal module must not import `stimulus-groups.js` once `stimulus-groups.js` imports that module. Preserve one-way ownership to avoid circular domain dependencies.

## Test safety net at this baseline

Important existing executable coverage includes:

- `test/stimulus-groups.test.js`: option selection/provenance, inactive exclusion, question precedence, coverage/count interaction, conversion and authoring behaviour;
- `test/original-stimulus-semantics.test.js`: migration/backfill, source-aware Original creation, Core/Expanded selection, Original correction, D1 guards, move/deactivate/remove protection, supporting-role conversion and historical Review snapshots;
- `test/simple-stimulus-curation.test.js`: atomic simple role assignment;
- `test/stimulus-audit.test.js`: Production cleanup read model and D1 bind safety;
- `test/stimulus-reusable-coverage-restoration.test.js`: reusable Questions in minimum/all restoration coverage and fixed-count rejection;
- `test/reusable-image-questions.test.js`: exact-Asset semantics, precedence, coverage, provenance, Preview separation and import-package decoupling;
- `test/reusable-image-question-safety-regression.test.js`: reactivation and scoped removal safety;
- `test/question-scope.test.js`: exact stimulus scope, atomic fixed-image conversion and cross-group Prompt protection;
- `test/image-management-v2.test.js`: identity-preserving same-Case option movement, coverage preflight and Production/Preview ownership;
- `test/asset-higher-resolution-replacement.test.js`: relationship migration, stable option identity, Original preservation, reusable Question cloning/remapping and historical provenance.

The architecture PR adds:

- `test/stimulus-family-facade-contract.test.js` to lock the façade's named compatibility surface and, more importantly, the shared `StimulusGroupInputError` constructor identity used across focused mutations and route error classification;
- `test/stimulus-prompt-specificity-characterisation.test.js` to lock the **current** inactive-parent asymmetry between ordinary exact-question application checks and reusable Asset-question paths so this documentation-only PR does not silently alter runtime semantics.

The inactive-parent characterization test is not the desired final policy. In the later correctness tranche, add target-behaviour regression coverage first and intentionally update/replace that characterization expectation when the dormant-parent policy is implemented.

The existing large behavioural suites should remain intact during decomposition. Add focused transition tests next to a semantic correction or extraction; do not rewrite unrelated suites to fit a new internal design.

## Single Draft implementation PR programme

After PR #110 merges, the agreed implementation strategy is one long-lived **Draft** PR with explicit correctness and refactor checkpoints. Correctness commits must remain distinguishable from structural commits; do not squash these boundaries early.

### Checkpoint A — correctness tranche

Do not begin mechanical decomposition until this checkpoint is green and independently reviewed as a coherent semantic change set.

1. **Target-behaviour regression scenarios.** Add focused tests for all five settled issues, including current-failure demonstrations where useful. Preserve PR #110's façade contract and use its inactive-parent test as characterization of the old state until the intentional policy change lands.
2. **Canonical specificity + dormant-parent policy.** Establish one downward application-level policy for live cross-Family Prompt ownership. Only simultaneously selectable active parent relationships reserve a Prompt. Add complete Family/Option live-reactivation validation.
3. **Canonical coverage/eligibility policy.** Give Group + exact Option + valid reusable Asset Question coverage, Prompt deduplication, `none` / `minimum` / `all`, and Case Fixed-N compatibility one semantic owner.
4. **Movement correctness.** Route Production same-Case option movement through post-move specificity and canonical post-move coverage while preserving stable identities and retained relationships. Preserve Preview ownership boundaries.
5. **Option reactivation correctness.** Route any option activation that makes content live through the shared validators; keep Family activation responsible when the option remains dormant inside an inactive Family.
6. **Source-aware fixed-image Original correction.** Make transparent Production fixed-image conversions assign the preserved option as explicit Original atomically; generic insertion remains unchanged.
7. **Production data audit.** Inspect actual Production rows after future-write fixes. Add narrowly justified cleanup only if affected one-option uncurated Production Families actually exist; do not add speculative broad migration work.

### Checkpoint B — mechanical decomposition

Only after Checkpoint A is green and reviewed should implementation move responsibilities out of `stimulus-groups.js` against the corrected canonical semantics.

1. establish downward error/eligibility/invariant primitives while preserving façade imports and exact `StimulusGroupInputError` constructor identity;
2. extract canonical coverage and specificity policy ownership without changing the newly settled behaviour;
3. extract option membership/lifecycle while preserving stable identity and Original protections;
4. extract Stimulus-specific Group/Option Question mutation ownership while keeping reusable canonical Question lifecycle in `asset-questions.js`;
5. extract family lifecycle and the Production Admin read model without inventing a generic repository layer;
6. isolate a learner-purpose Stimulus Family read/selection adapter without importing mutation services or changing Core/Expanded behavior;
7. shrink `stimulus-groups.js` to the compatibility façade only after caller/import and dependency-cycle review proves it is safe.

At natural boundaries—especially after specificity/reactivation, coverage/movement, and learner extraction—perform an incremental review rather than waiting for the final PR diff.

### Final PR gate

Keep the implementation PR Draft during intermediate work so repository fast validation can run on staged heads. Once all correctness and decomposition checkpoints are complete, mark it Ready for Review and require repository-owned full validation on the exact final head before merge.

### Final Definition of Done

The implementation PR is acceptable for merge only when **all** of the following are true:

- all five settled correctness decisions are implemented deliberately and covered by focused target-behaviour regression tests;
- the old inactive-parent characterization has been intentionally updated or replaced only after dormant-parent semantics are implemented, with no accidental weakening or deletion of unrelated regression coverage;
- cross-Family Prompt specificity has one canonical application-level live-state policy: same-Family precedence remains legal, dormant parents do not reserve live ownership, and every transition that makes content selectable revalidates the resulting graph;
- coverage/eligibility has one canonical semantic owner including Group Questions, exact Option Questions, valid reusable Asset Questions, Prompt deduplication, `none` / `minimum` / `all`, and Case Fixed-N compatibility; narrower movement/reactivation simulations no longer define competing Production semantics;
- same-Case Production movement validates the complete post-move specificity and coverage state while preserving Stimulus Option ID, Asset ID, exact Questions, reusable opt-ins, caption and history; retained Preview behavior has not been routed through Production-only mutation guards;
- live Option/Family reactivation establishes Asset eligibility, specificity, canonical coverage, Fixed-N compatibility and Original integrity at the transition that actually makes the content learner-selectable; archived restoration remains a distinct stronger lifecycle path with shared lower-level validators where appropriate;
- source-aware Production fixed-image conversions assign the preserved source option as explicit Original atomically, while generic option insertion still never infers Original from order or sequence;
- the Production data audit has been completed after future-write fixes; any cleanup is evidence-based, Production-only and conservative, or the PR explicitly records that no cleanup was required; Preview is excluded;
- Checkpoint A was reviewed and green before mechanical decomposition began, and correctness commits remain distinguishable from structural refactor commits in review history;
- Checkpoint B is complete: dependency direction is one-way, focused internal modules do not create façade cycles, `stimulus-groups.js` has been reduced only as far as caller/import analysis proves safe, and purpose-specific Admin/audit/learner read models remain appropriately separated;
- the existing compatibility surface remains intact for callers that were not deliberately migrated, including exact shared `StimulusGroupInputError` constructor identity and expected route error classification;
- learner Core/Expanded selection, question precedence, fixed/supporting image behavior, stable identity rules, and historical Review Asset/Question snapshots and provenance remain unchanged except for the five explicitly approved correctness semantics;
- Production/Preview ownership separation and Import Package v1 behavior remain unchanged; no unrelated UX, schema, route, import-package or Preview redesign has entered the PR;
- no new schema/D1 enforcement has been added unless it received separate explicit review as a comprehensive invariant rather than a one-off correctness patch;
- durable documentation has been updated to describe the implemented final state rather than leaving the five decisions labelled only as future target semantics;
- all repository-owned tests and validation required by the final implementation are green, with no skipped/disabled tests used to manufacture a pass;
- the complete final diff has received an independent end-to-end review with no unresolved correctness, architecture or scope findings;
- the PR is Ready for Review and repository-owned **full validation has passed on the exact head SHA that will be merged**. Any later commit invalidates that acceptance and requires final review/validation again.

If any item above is false, the implementation PR is not done and must not be merged.

## Definition of ready for the next agent

The next implementation agent may begin only if it follows these constraints:

1. treat the five resolved correctness decisions in this document as the target semantic contract, while recognising that PR #110 itself does not implement them;
2. add/adjust regression coverage deliberately before changing the characterized current behavior;
3. complete and review the correctness tranche before mechanical decomposition;
4. preserve the façade's existing exports and exact `StimulusGroupInputError` identity throughout staged extraction;
5. keep Production and Preview mutation ownership separate;
6. preserve D1 triggers and schema constraints without assuming they cover invariants they do not actually enforce;
7. preserve stable Option/Asset IDs and all historical Review snapshots/provenance;
8. keep generic option insertion distinct from source-aware Original assignment;
9. do not redesign Preview or Import Package v1;
10. do not add one-off schema/D1 enforcement unless a separately reviewed comprehensive invariant requires it.

With these constraints, the domain is characterised, the five correctness semantics are settled, and the implementation can proceed in one staged Draft PR without using mechanical refactoring to conceal behaviour changes.
