# Stimulus Family refactor architecture

_Status: architecture and characterisation baseline for incremental refactoring_

_Audited against `main` at `c4284c4c9ed0bf2367b990b0cbe43632309d0be5` on 29 August 2026._

This document defines the safe architectural boundary for refactoring Production Stimulus Families without redesigning learner or Admin behaviour. It is deliberately descriptive first: current executable code, migrations and tests remain authoritative if this document becomes stale.

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

`0009` and `0010` do **not** provide a general D1 constraint preventing an ordinary `stimulus_group_question` or `stimulus_option_question` from conflicting with another ordinary Group/Option Question in another independently selectable Family. The general ordinary exact-question rule is currently enforced by application validation and by the learner resolver. Future extraction work must not weaken application enforcement on the assumption that D1 supplies a general fallback that does not exist.

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

The following current exports are part of that migration surface and should remain import-compatible until a deliberate caller-migration PR says otherwise:

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

`question-scope.js`, `case-questions.js`, and `asset-questions.js` share the policy that one Prompt should not become stimulus-specific in independently selectable groups of the same Case. The general ordinary Group/Option branch is enforced in application helpers and checked again by the learner resolver. Database defence in `0009`/`0010` is narrower: it covers reusable Asset Question opt-in/write/reactivation paths and ordinary writes only when they conflict with reusable usage.

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
| Same Prompt should not be stimulus-specific in independently selectable selected groups | General ordinary Group/Option conflicts: `ensurePromptIsNotUsedByAnotherGroup` plus route/scope preflights. Reusable conflicts: additional checks in `asset-questions.js` | **No general ordinary exact-vs-exact D1 guard.** `0009` guards conflicts where reusable Asset Question usage participates; `0010` guards reusable Question reactivation | resolver rejects incompatible selected-group context | question-scope + reusable-image suites + `stimulus-prompt-specificity-characterisation.test.js` |
| Coverage `none` / `minimum` / `all` must be satisfiable by eligible option-specific knowledge | `stimulus-groups.js` canonical coverage/restoration; some specialised local preflights | coverage mode/check constraints only; D1 does not calculate semantic coverage | `pickReviewQuestions` enforces selected Review coverage | Stimulus Group + reusable restoration tests |
| Fixed Case question count cannot be smaller than active family guarantees | `admin-content.js`; family update/restoration validation | Case mode/count constraints, but no cross-table semantic trigger | `pickReviewQuestions` rejects impossible selected coverage | Stimulus Group tests |
| Core/Expanded family choice preserves Original/Alternative semantics | n/a mutation side | pointer + lifecycle state | `learning.js` selection + `question-pool-mode.ts` | Original semantics tests |
| Review snapshots preserve historical Asset/option/question identity after later edits | mutation paths preserve stable IDs where required | Review FK/provenance schema | Review creation snapshots prompt/answer/assets/provenance | Stimulus Group, Original and replacement tests |
| Family/option read models used by Admin do not confer mutation ownership | purpose-specific DB reads | n/a | n/a | route/module tests |

The matrix deliberately distinguishes genuine defence in depth from application-only enforcement. Refactoring should remove accidental duplication only after proving that one layer is not an independent safeguard, and it must not assume a database safeguard exists where the matrix explicitly says it does not.

## Meaningful transitions to preserve

A future decomposition should reason about transitions rather than create a Cartesian-product test matrix.

### Family lifecycle

- create active/inactive family for an active Production Case;
- update coverage/name/activity without making Case fixed-count state impossible;
- activate a family without invalidating an explicit Original;
- retain legacy `original_option_id = NULL` compatibility until explicitly curated.

### Option membership/lifecycle

- add a new eligible Production image;
- convert a fixed image into an option without duplicating current Case use;
- deactivate/reactivate an option;
- archive/remove the option relationship while preserving Asset and historical identity;
- restore the archived option in its original family after revalidation;
- move a non-Original option within the same Case while preserving option identity, caption, exact Questions and reusable opt-ins;
- move an Alternative to always-shown/supporting while archiving the old option identity;
- reorder options without changing semantics.

### Original semantics

- explicitly designate an eligible Original;
- change Original before any destructive transition of the old Original;
- source-aware family creation may assign the known source image as Original atomically;
- generic sequential option insertion must not infer Original from insert/display order;
- higher-resolution same-image replacement preserves the stable option identity referenced by Original.

### Question and coverage semantics

- Group Question applies across every eligible option in the family;
- exact Option Question applies only when that option is selected;
- reusable Asset Question applies only through explicit opt-in for the exact current Asset;
- precedence remains exact Option > reusable Asset > Group > Case > exact Topic > Tag-shared > ancestor;
- specific Prompt ambiguity across independently selectable families is rejected for learner-selected contexts;
- current authoring preflight for ordinary exact Questions has an inactive-parent asymmetry documented below and must not be silently normalised during extraction;
- family coverage composes additively across independently selected families;
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

Some specialised transitions perform narrower local checks. In particular, current option activation and same-Case option-move code do not obviously use the same reusable-Asset-question accounting as the canonical coverage path. Treat this as an existing correctness question, not permission for a refactor to change outcomes opportunistically.

### 3. Cross-group Prompt protection is layered but asymmetric

General ordinary Group/Option Prompt conflicts are application-enforced by `ensurePromptIsNotUsedByAnotherGroup` and rejected by the learner resolver if incompatible groups are selected together. There is no general D1 exact-vs-exact guard for ordinary Questions.

`0009` and `0010` add database defence only for reusable Asset Question paths: opt-in/write conflicts involving reusable usage and reusable-question reactivation. Do not describe those triggers as a database owner of the whole invariant.

The application paths are also not currently uniform about parent activity. `ensurePromptIsNotUsedByAnotherGroup` requires the ordinary Question row itself to be active and excludes `removed_from_case` options, but it does not filter ordinary Group Questions by `stimulus_groups.is_active` and does not filter ordinary Option Questions by `stimulus_group_options.is_active` or parent Family activity. The reusable application/database paths do apply active Family/Option filtering. This is current characterised behaviour, not a recommended final policy.

Option movement changes `stimulus_group_options.stimulus_group_id` while retaining exact/reusable Question relationships. The reusable-question cross-group triggers are primarily attached to Question/opt-in writes and reactivation, not obviously to the option's group move itself. This remains a suspected existing blind spot to verify separately before consolidating the invariant.

### 4. Some fixed-image conversions create a one-option family without curating Original

`startStimulusGroupFromCaseAsset` and simple two-image role assignment explicitly curate Original. Fixed-image conversions inside Question-scope/reusable-question workflows create the established one-option family shape without an explicit Original update.

With one eligible option, learner selection is observationally the same, but cleanup/audit semantics distinguish curated versus legacy-null families. Do not silently normalise these paths during decomposition; decide the intended product behaviour in a separate correctness change.

### 5. `is_active` and `removed_from_case` must not collapse

An inactive option remains a current relationship that can be reactivated. A removed option is archived from current Case use and restored through stricter validation. Treating both as a single `active` boolean would break restoration and history.

### 6. Stable option identity is observable domain state

Option ID anchors:

- `original_option_id`;
- exact Option Questions;
- reusable Asset Question opt-ins;
- Review source provenance.

Moving, correcting roles and same-image quality replacement must update relationships in place where current behaviour does so.

### 7. Read models should remain purpose-specific

Admin authoring, cleanup/audit and learner selection have different eligibility and history needs. Do not replace them with one giant `getStimulusFamily()` aggregate merely to reduce query duplication.

## Suspected existing correctness gaps discovered by this audit

These are recorded so decomposition does not accidentally fix, hide or cement them. They were **not changed by the architecture PR**.

1. **Same-Case option move and reusable coverage.** `image-option-move.js` simulates coverage from Group + exact Option Questions, while canonical coverage also includes valid reusable Asset Questions. `minimum` / `all` / fixed-count decisions can therefore diverge from the canonical model.
2. **Option reactivation and reusable/fixed-count coverage.** `setStimulusOptionActive` performs a local minimum check using Group + exact Option Questions and does not use the full canonical reusable-question/fixed-count validation path. Reactivation can therefore be judged differently from restoration or later Review selection.
3. **Cross-group Prompt invariant after moving an already-questioned option.** Same-Case movement preserves exact Questions and reusable opt-ins while changing the owning group. Application and reusable-path D1 protection should be verified for conflicts created by that move itself.
4. **One-option fixed-image conversion leaves Original uncurated in some authoring paths.** `question-scope.js` and `asset-questions.js` fixed-image conversions create active one-option Production families without the explicit Original assignment used by source-aware Alternative Set creation.
5. **Inactive-parent semantics differ between ordinary and reusable Prompt specificity checks.** `ensurePromptIsNotUsedByAnotherGroup` currently counts active ordinary Group Questions under inactive Families and active ordinary Option Questions under inactive options/Families (provided the option is not `removed_from_case`). Reusable application/database checks filter active parent Families/options. The architecture PR characterises this asymmetry; a later policy consolidation must make an explicit product/domain decision before changing it.

Before fixing any item, add or retain a focused regression demonstrating the current behaviour/failure and confirm the intended behaviour against `ORIGINAL_AND_ALTERNATIVE_STIMULI.md`, `REUSABLE_IMAGE_QUESTIONS.md`, `STIMULUS_GROUPS_DESIGN.md` and current product intent. Keep correctness fixes separate from mechanical extraction when practical.

## Recommended semantic boundaries

The current coupling supports the following boundaries. These are ownership boundaries, not a mandated one-file-per-box layout.

### Compatibility façade

`stimulus-groups.js` remains the stable import surface for its existing exports until the final migration PR.

### Production family eligibility / invariant primitives

Own Production Case/family/option/Asset eligibility and the canonical Stimulus error type. This layer may depend on schema/content guards, but not on routes, the façade, learner orchestration or Preview.

### Coverage policy

Own semantic calculation of eligible family-specific Prompt sets and `none` / `minimum` / `all` requirements, plus validation against Case fixed count. Specialised mutations should eventually call this policy instead of growing independent simulations.

### Option membership and lifecycle

Own add, fixed→option conversion, deactivate/reactivate, archive/remove, restore and display-order changes. Same-Case cross-family movement remains a related but more complex transition because it preserves attached questions/opt-ins.

### Original / role semantics

Own explicit designation and transitions that need an Original precondition. `stimulus-originals.js`, `stimulus-role-conversion.js`, `simple-stimulus-curation.js`, D1 triggers and Asset replacement are already evidence for this boundary.

### Stimulus-specific question semantics

Own Group/Option Question writes and the cross-group Prompt policy. Reusable Asset Question canonical ownership remains in `asset-questions.js`, but shared specificity checks should have one lower-level policy direction rather than mutual façade imports. The consolidated policy must explicitly decide parent-activity semantics rather than inheriting one branch by accident.

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
- `test/stimulus-prompt-specificity-characterisation.test.js` to lock the current inactive-parent asymmetry between ordinary exact-question application checks and reusable Asset-question paths before later policy consolidation.

The existing large behavioural suites should remain intact during decomposition. Add focused transition tests next to a semantic extraction; do not rewrite the existing suites to fit a new internal design.

## Incremental refactor programme

The following sequence minimises blast radius and avoids forcing repository-wide caller migrations.

### PR 2 — establish downward dependency primitives

**Objective:** remove the reverse dependency where focused Stimulus modules import the large façade for the shared error/low-level invariant primitives.

- move the canonical `StimulusGroupInputError` and only genuinely shared Production family eligibility primitives into a focused internal Stimulus Family module;
- re-export the exact same error constructor from `stimulus-groups.js`;
- update internal focused modules to depend downward on the new primitive module;
- keep route imports and all public operation signatures unchanged;
- use the façade contract test plus existing Production/Preview guard tests.

No family/option behaviour change.

### PR 3 — extract canonical coverage policy

**Objective:** give `none` / `minimum` / `all` and Case fixed-count compatibility one semantic owner.

- move canonical eligible-specific-Prompt loading/calculation and Case coverage validation behind the façade;
- preserve current inputs/errors/queries unless a separately reviewed correctness fix is required;
- keep learner `pickReviewQuestions` as the final Review selection policy rather than importing DB mutation code into learner modules;
- add table-driven transition tests around group + option + reusable Asset Question combinations.

Do not opportunistically change the suspected option-move/reactivation discrepancies in a mechanical extraction commit.

### PR 4 — extract option membership and lifecycle

**Objective:** move add/convert/deactivate/reactivate/archive/restore/reorder implementation out of `stimulus-groups.js` while preserving stable option identity.

- façade re-exports/signatures remain stable;
- restoration keeps exact Questions/reusable opt-ins and reruns current eligibility/coverage checks;
- Original protection remains application preflight + D1 trigger;
- fixed image and grouped option remain mutually exclusive current Case relationships.

Keep same-Case cross-family move separate if its suspected Prompt/coverage correctness questions are still unresolved.

### PR 5 — extract Stimulus-specific question policy and mutations

**Objective:** consolidate Group/Option Question mutation ownership and the shared cross-group Prompt specificity policy.

- preserve exact Option > reusable Asset > Group precedence in the learner resolver;
- keep reusable canonical Question lifecycle in `asset-questions.js`;
- make shared specificity validation a downward dependency used by both modules;
- retain `0009` / `0010` as reusable-path database defence in depth, without treating them as a general ordinary exact-question D1 constraint;
- preserve the new inactive-parent characterisation tests until an explicit domain decision intentionally changes that policy;
- add focused ordinary exact-vs-exact tests if consolidation changes the shape of the application guard;
- preserve Case Question scope conversion behaviour and stable Prompt IDs.

### PR 6 — extract family lifecycle and Production Admin read model

**Objective:** separate family create/update/activation plus `getAdminStimulusData` from option/question implementation.

- do not create a generic repository layer;
- keep audit as a separate purpose-specific read model;
- keep façade compatibility and current route data shape.

### PR 7 — isolate learner Stimulus Family read/selection adapter

**Objective:** reduce Stimulus-specific loading/orchestration inside `db/learning.js` without changing Review behaviour.

- extract a learner-purpose read/selection adapter, not mutation services;
- preserve Core/Expanded selection exactly;
- preserve question-pool precedence and coverage inputs;
- preserve Review Asset and Question snapshot/provenance writes;
- keep Preview out of the learner Production path.

### PR 8 — shrink `stimulus-groups.js` to the compatibility façade

**Objective:** after callers and invariants are stable, leave the file as imports/re-exports plus only intentionally façade-level adaptation.

- no repository-wide rename is required;
- remove dead internal helpers only after import/caller search proves they are unused;
- review dependency graph for cycles;
- run full behavioural suites before considering any later caller migration.

## Correctness work that should remain separate

Before or between the refactor PRs, the suspected gaps above may justify narrowly scoped correctness PRs. If confirmed, each should add a regression first and change only the affected transition. Do not hide such a behaviour change inside an extraction PR merely because the extracted policy makes the inconsistency obvious.

## Definition of ready for the next agent

The next refactor agent may begin moving implementation out of `stimulus-groups.js` when it follows these constraints:

1. preserve this façade's existing exports and `StimulusGroupInputError` identity;
2. keep Production and Preview mutation ownership separate;
3. preserve D1 triggers and schema constraints without assuming they cover invariants they do not actually enforce;
4. treat coverage, Original integrity, cross-group Prompt specificity and Review provenance as domain invariants rather than incidental query details;
5. preserve stable option/Asset IDs across the transitions that currently do so;
6. use existing characterisation suites as contracts, adding focused tests before changing a risky transition;
7. do not use refactoring as a vehicle to silently fix the recorded suspected correctness gaps.

With those constraints, the domain is sufficiently characterised for incremental, behaviour-preserving decomposition without redesigning the Stimulus model.