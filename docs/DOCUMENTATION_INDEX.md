# Flash-Cards Documentation Index

_Last reviewed: 3 September 2026_

This index identifies the documents that describe current repository behavior, operational contracts, pending designs, and historical/implementation records.

Repository-wide coding-agent safety rules live in root `AGENTS.md`. Use `AGENT_TASK_MAP.md` to select the minimum current context and execution/validation mode. Repository-wide structural direction lives in `ENGINEERING_ARCHITECTURE_GUIDELINES.md`.

## Conflict rule

When documentation appears to disagree, use this order:

1. current code, executable validators, committed schema/migrations, and workflow definitions, while keeping production application/deployment status separate;
2. `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` for merged/deployed status and current priorities;
3. `V1_DATA_MODEL.md` plus the relevant current subsystem behavior/status document for exact semantics; for the learner FSRS runtime cutover and subsequent FSRS tranches, use `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` as that companion;
4. `CURRENT_DESIGN.md`, `V1_SPEC.md`, and `AUTHORING_MODEL.md` for product mental model;
5. pending designs only for future intent;
6. implementation plans/historical records only for decision context.

An old PR instruction, stale status banner, rollout note, staged-refactor plan, or historical design is never authority over current code/current priorities. Pre-cutover documents that describe `reviews`, `review_questions`, or `review_assets` as the current learner Review runtime are historical context after the PR #137 cutover architecture; they do not override current code, `V1_DATA_MODEL.md`, or `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`.

## Current repository baseline

Current `main` contains the learner FSRS Parts A–E and PR #137 learner runtime cutover. The cutover moved `/study` onto the FSRS/Free runtime, made `active_reviews` / `active_review_questions` / `active_review_assets` the current unfinished learner Review owner, retired legacy Review readers/writers, retained `/fsrs-preview` as a local regression/reference surface, and extended the merged migration chain through `0023_learner_fsrs_system_provenance_guard.sql`.

The in-flight PR F branch adds learner Reset Progress / Fresh FSRS Start, detailed Scheduled-history retention behavior, learner Progress, and migration `0024_learner_fsrs_reset_fresh.sql`. Treat those as branch/PR state until PR F merges.

Repository merge state is not evidence that Production D1 migrations have been applied or that the Production Worker has been deployed. Preserve those operational facts separately.

Older implementation/evidence documents remain useful historical context and should not be rewritten merely because their then-current Review model has since been retired.

## Current taxonomy rule

Current Case classification is:

```text
System = top-level learner navigation grouping
Topic  = one canonical educational home for a Case
Tag    = flat cross-cutting classification / contextual discovery

Case
├── exactly one behaviorally active Primary Topic
└── zero or more Case Tags
```

Additional Study Topics are retired from current authoring/learner behavior. The physical `case_concepts.role = primary | secondary` compatibility shape remains unchanged, so historical secondary rows may still be stored; current code hides/ignores them rather than requiring a cleanup migration.

Do not infer Topic→Tag conversion from matching names/labels. Clinically useful Case Tags and System↔Tag exposure are explicit curation decisions.

## Repository migration boundary

On the PR F branch, the repository migration sequence extends through:

```text
0024_learner_fsrs_reset_fresh.sql
```

Important recent migrations:

- `0014_review_question_pool_mode.sql` — historical legacy Review source-mode compatibility; `reviews` is no longer current learner runtime state after cutover;
- `0015_contextual_system_topic_tag_navigation.sql` — System/Topic taxonomy, System↔Tag exposure, and historical legacy Review route-provenance columns;
- `0016_original_stimulus_options.sql` — nullable `stimulus_groups.original_option_id`, conservative production-only Original backfill, and defensive Original-integrity guards;
- `0017_align_reusable_prompt_live_state_guards.sql` — reusable-question live-state guard alignment;
- `0018_topic_deletion_provenance_indexes.sql` — Topic deletion-provenance indexes;
- `0019_learner_fsrs_foundation.sql` — learner preferences/profiles, learner×Case FSRS state, encounters, Scheduled events, optimizer evidence, learner aggregates, and learner×System Scheduled aggregates;
- `0020_learner_fsrs_active_reviews.sql` — temporary normalized `active_reviews`, `active_review_questions`, and `active_review_assets` ownership;
- `0021_learner_fsrs_scheduled_completion.sql` — Scheduled FSRS completion write-boundary context/guards;
- `0022_learner_fsrs_free_study.sql` — Free Study completion and short-lived retry receipts;
- `0023_learner_fsrs_system_provenance_guard.sql` — defensive System deletion/reclassification protection for durable System attribution in `scheduled_review_events` and `learner_system_aggregates`;
- `0024_learner_fsrs_reset_fresh.sql` — defensive Scheduled active-Review/profile-boundary guard for Reset/Fresh serialization; the migration itself does not reset learner data.

Historical migration `0013_review_assets_asset_lookup.sql` and the Review-related portions of `0014`/`0015` remain immutable migration history; they do not make `review_assets`, `reviews`, or `review_questions` current runtime owners after cutover.

Migration `0016` leaves ambiguous legacy multi-option production families and retained Preview-owned families with `original_option_id = NULL`; it does not infer Original from ordering or labels. See `ORIGINAL_AND_ALTERNATIVE_STIMULI.md` and `V1_DATA_MODEL.md` for the current branch contract.

There is intentionally no new migration solely for retiring Additional Study Topics.

A committed migration is not proof that it has been applied to production. Merge, migration application, Worker deployment, taxonomy/data/stimulus curation, learner feature enablement, and behavior verification are separate facts.

## Start here — living authorities

### `CURRENT_PRODUCT_ROADMAP.md`

Shortest status map for verified production, current `main`, and next product priorities. Cross-check an in-flight PR against its exact head rather than treating an older roadmap snapshot as current branch behavior.

### `HANDOVER.md`

Current implementation handover, operational boundaries, recent merged changes, and current coding-agent/CI lifecycle. Cross-check an in-flight PR against its exact head when the handover predates that work.

### `CURRENT_DESIGN.md`

Living product/design summary across classification, Cases/stimuli, questions/reuse, Review provenance, imports, Preview, and lifecycle behavior. If it omits a newer Admin convenience/UX feature, use the roadmap/handover plus the relevant implementation record; omission is not authority against current code. For learner Review persistence after the FSRS cutover, use `V1_DATA_MODEL.md` plus `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` over older legacy Review wording.

### `V1_SPEC.md`

Current V1 product behavior specification. Exact implementation status of later Admin UX/tooling and learner-runtime changes should be cross-checked with roadmap/handover/current code.

### `V1_DATA_MODEL.md`

Authoritative implemented domain model for the current branch, including the physical compatibility shape of `case_concepts`, current Primary-Topic behavior, Tags/System exposure, Original/Alternative stimulus relationships, FSRS/Free active-Review ownership, Scheduled/Free completion owners, Reset/Fresh profile boundaries, detailed-history retention ownership, authenticated Review-media and Asset/R2 lifecycle ownership, durable System provenance, legacy Review sentinel status, Preview ownership, and the migration ledger through `0024` on the PR F branch.

### `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`

**Current implementation-status companion for the post-PR #137 learner runtime and in-flight PR F branch.** Read it with `V1_DATA_MODEL.md` for `/study` ownership, legacy zero-data Review sentinels, active Review/media ownership, Reset/Fresh serialization, detailed-history retention, learner Progress, local replica/reset boundaries, Admin Study Preview contamination boundaries, local `/fsrs-preview`, durable System provenance, and the explicit separation between repository branch state and Production deployment/migration state.

### `AUTHORING_MODEL.md`

Preferred administrator mental model. Current Case-local classification is **Primary Topic + Case Tags**; global System↔Tag exposure remains separate.

### `CONTENT_MODEL_EXAMPLES.md`

Concrete content examples. Any historical Additional Study Topic example is superseded by the current Primary Topic + Tags model unless explicitly framed as legacy context.

### `AGENT_TASK_MAP.md`

Coding-agent routing guide for scoped context and validation.

### `TESTING_AND_VALIDATION_GUIDANCE.md`

Living test-authoring and validation authority. Read it when adding/rewriting tests, choosing current versus historical schema fixtures, changing fast/full or specialized validation ownership, or changing CI diagnostics. It owns the complete-suite/new-test defaults, exceptional exclusion requirements, invariant-owner hierarchy, and ordinary-PR-CI change-aware specialization split, including the intentional separate path-filtered Wrangler runtime-smoke exception. The PR #115 audit/cleanup plan remains historical implementation evidence rather than the normal future-authoring guide.

### `ENGINEERING_ARCHITECTURE_GUIDELINES.md`

Repository-wide modularity, TypeScript, thin-route, ownership, transaction, testing, and scope-control guidance.

## Current taxonomy / learner-navigation contracts

### `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md`

Current System/Topic/Tag content-reachability contract:

- canonical Topic routes use the Case's one Primary Topic;
- Tag routes discover the Case without changing direct Topic-question context;
- System → All deduplicates Topic + exposed-Tag reachability;
- taxonomy curation, Worker deployment, and learner rollout remain separate operational steps.

Its legacy `reviews` route-provenance/continuation details describe the pre-FSRS-cutover runtime. For current learner Review persistence and System provenance, use `V1_DATA_MODEL.md` plus `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`.

### `ADDITIONAL_STUDY_TOPICS_TO_TAGS_PLAN.md`

PR #90 product/domain decision record. Use it to understand why secondary relationships remain physically compatible while current behavior uses Primary Topic + Tags.

### `MULTI_TOPIC_STUDY_ROUTES.md`

**Historical/superseded decision record.** Read only for migration `0003`, legacy secondary relationships, and older Review provenance.

### `SYSTEMS_TOPICS_ADMIN_UX_PLAN.md`

**Implemented design/implementation record — PR #99 merged.** The file was originally written as the design plan; current code/PR #99 are authoritative for the implemented workspace. Do not treat an older `implementation pending` banner inside a historical revision as current status.

Current implemented boundary includes Topic hierarchy changes, Case Primary Topic changes, and Case Tag changes coexisting in one staged review and one unified workspace apply action. The server completes all requested stale-state/validity preflights before the first canonical write, then invokes the established domain writers sequentially. This is the strongest current fail-before-write boundary; it is **not** one cross-domain serializable/rollback transaction. Direct Case visibility remains by Primary Topic.

## Case Library / Case lifecycle

### `CASE_DEACTIVATION_UX_PLAN.md`

**Implemented design/implementation record — PR #100 merged.** Current lifecycle is Active → Deactivate → preserved Inactive → validated Restore. Deactivation is not deletion.

PR #100 also added inline and bulk Case Tag curation in the Case Library. Current code/PR #100 are authoritative over any older `draft` / `validation pending` status wording in this document.

### `CASE_LIBRARY_SEARCH_PERFORMANCE_PLAN.md`

**Implemented design/implementation record — PR #102 merged.** Case/Topic/System text filters no longer navigate after every typing pause; explicit Search/Enter submits the GET form, and the active read path no longer performs the previous duplicate taxonomy supporting read.

Current code/PR #102 are authoritative over any older `draft` / `validation pending` status wording in the plan.

## Tags / Shared Questions

- `TAGGING_MODEL_DECISIONS.md` — Tag/Shared Question architecture decisions.
- `STAGE_A_TAG_FOUNDATION.md` — Tag foundation record.
- `TAGGING_STAGE_B_BEHAVIOR.md` — Shared Question eligibility/precedence/Admin/Review behavior.

Case Tags additionally carry alternate/cross-cutting Case classification and may become learner routes only when a System explicitly exposes the Tag. System exposure does not itself make a Shared Question eligible; explicit matching Case Tag remains required. For current learner Review persistence/snapshot ownership, `V1_DATA_MODEL.md` controls over any legacy `review_questions` examples.

## Admin/content management

- `ADMIN_CONTENT_MANAGEMENT_PLAN.md` — Admin CMS contract/history.
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — Case/Image authoring and lifecycle interaction contract; PR #108 extends it with source-aware Original curation and safe correction/removal ordering.
- `ORIGINAL_AND_ALTERNATIVE_STIMULI.md` — PR #108's authoritative Original/Alternative family semantics, learner selection, migration/backfill, correction workflow, and Preview boundary.
- `CASE_EDITOR_FAST_REVIEW_DESIGN.md` — Compact editor fast-review record.
- `IMAGE_MANAGEMENT_V2_PLAN.md` — Image Library/Collections behavior record.
- `REUSABLE_IMAGE_QUESTIONS.md` — exact-Asset reusable-question semantics.
- `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` — narrow same-image quality replacement contract.
- `PERFORMANCE_AND_READ_MODEL_PLAN.md` — bounded reads/measurement guidance.

The Case editor is componentized under `src/lib/components/case-editor/`. Current classification actions are Primary Topic + Case Tags; Additional Study Topic actions are retired/fail closed.

For current learner-owned media and Asset/R2 deletion protection during an unfinished Review, `active_review_assets` is authoritative; legacy `review_assets` is not a current lifecycle owner.

## Authentication / account management

- `ACCOUNT_MANAGEMENT_PLAN.md` — merged Account Management v1 product/security design for closed enrollment, password recovery, transactional email, production account administration, Disable/Restore semantics, session controls, and Admin lockout guards.
- `ACCOUNT_MANAGEMENT_PR_A_IMPLEMENTATION_PROMPT.md` — implementation handoff for password recovery + transactional email; treat as a task prompt, not proof of merge.
- `ACCOUNT_MANAGEMENT_PR_B_IMPLEMENTATION_PROMPT.md` — implementation handoff for production Admin account management; treat as a task prompt, not proof of merge.

For account/auth work, inspect current implementation and current PR state before relying on an implementation prompt. Once an implementation PR merges, the prompt becomes historical handoff context.

Public signup remains intentionally disabled unless a separately reviewed product decision changes that contract.

## Learner Study / FSRS / progress — current runtime authority and design history

### `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`

**Current implementation-status authority for the post-PR #137 learner `/study` runtime and in-flight PR F branch.** It records active FSRS/Free ownership, retirement/zero-data-sentinel status of legacy Review tables, active Review media/R2 ownership, Reset/Fresh serialization, detailed-history retention, learner Progress, local replica/reset boundaries, Admin Study Preview contamination boundaries, retained local `/fsrs-preview`, and durable System provenance. It does not claim Production deployment or Production migration application.

### `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md`

**Locked product/planning authority for the learner scheduling programme.** It specifies Case-level FSRS from the first SRS implementation; 90% desired retention; Again / Hard / Good / Easy; Scheduled and Free Study; Due/New start-of-run queues; default Due-first ordering with New fallback; Expanded Learning as a global preference default OFF; compact Scheduled events; temporary active-Review snapshots; reset/fresh-generation semantics; retention; learner/Admin analytics; and selective reuse of the systems-first UX from Draft PR #119 without merging #119.

Parts A–E and PR #137 are merged into the current repository runtime. The in-flight PR F branch implements its assigned Reset/Fresh/retention/learner-Progress subset. Use current code, migrations, `V1_DATA_MODEL.md`, and `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` for executable branch behavior; PR G Admin/cohort analytics, account deletion, and automatic optimizer execution remain separately owned.

### `LEARNER_FSRS_RUN_SIZE_PRODUCT_AMENDMENT.md`

**Normative product-behavior amendment for run sizing and continuous between-Case navigation.** For this specific behavior it updates the locked product baseline: Scheduled and Free Study offer 5 / 10 / 20 / All available with default 10; the target counts distinct Cases; FSRS short-term repeats do not consume another slot and must still be honored before run completion; successful Case completion automatically advances to the next eligible Case when one can open immediately; and run-size/navigation state remains browser-local. PR #137 carries this approved behavior into `/study`; `/fsrs-preview` remains the local regression/reference surface.

### `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md`

**Primary subordinate technical-design companion.** It records the repository-grounded FSRS library direction, compact schema responsibilities, transaction boundaries, write-time active-Review/generation concurrency invariant, preliminary synthetic benchmark evidence, required D1 benchmark gate, Better Auth deletion direction, focused implementation decomposition, and the exact PR #119 reuse/discard boundary. Current code/migrations and the runtime status document are higher authority for post-cutover current-state facts.

### `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md`

**Required implementation-readiness addendum.** Read it with the technical design for the safety/behavioral constraints it established around the explicit legacy-runtime cutover owner, synchronous expired-active replacement, server-clock authority, lazy first-learner bootstrap, scheduler-revision upgrades, optimizer-rescheduling deferral, historical System identity, Scheduled idempotency conflict reconciliation, browser/localStorage workload limits, repeat-waiting/deactivation lifecycle semantics, and removable learner contribution to future time-series analytics.

Its statement that the then-current runtime persisted `reviews`, `review_questions`, and `review_assets` is a pre-cutover repository observation. `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` and `V1_DATA_MODEL.md` supersede that current-state observation after PR #137 while preserving the readiness contract's behavioral/safety requirements.

### `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md`

**Normative implementation-readiness amendment for focused tranche ownership.** It preserves the programme's lifecycle/concurrency invariants while correcting which focused PR owns the completion, Free-completion, and Reset/Fresh sides of cross-operation proofs. It remains tranche-assignment/history context rather than current runtime schema authority.

### FSRS implementation evidence records

`LEARNER_FSRS_PR_A_EVIDENCE.md` through `LEARNER_FSRS_PR_E_EVIDENCE.md` are **historical staged implementation evidence**. Preserve their then-current statements, including references to the legacy Review runtime before cutover. They remain useful for proving the boundary established by each tranche but do not override the post-cutover runtime/data-model authorities.

`LEARNER_FSRS_PR_F_EVIDENCE.md` is the implementation-evidence record for the current PR F branch. It documents Reset/Fresh, retention, learner Progress, concurrency coverage, and explicit exclusions; it is not evidence that PR F has merged or been deployed.

For the run-size and continuous between-Case behavior specifically, `LEARNER_FSRS_RUN_SIZE_PRODUCT_AMENDMENT.md` controls over older wording in the locked product plan. For all other product behavior, the locked product plan remains superior to the technical documents. Where the readiness contract adds narrower implementation specificity to a boundary left open by the technical design, the readiness contract controls that technical boundary. **For tranche ownership only**, `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md` supersedes conflicting PR-assignment language in the technical design/readiness contract; it does not otherwise supersede or weaken those documents.

None of these documents authorizes a Production deployment, Production D1 migration/mutation, bypass of the zero-legacy-Review gate, or unreviewed later-tranche work.

Do not use an older simple-scheduler / Again-Good-only plan or a historical “FSRS later” statement as authority over this chain.

## Stimulus behavior

- `ORIGINAL_AND_ALTERNATIVE_STIMULI.md` — explicit Original pointer and Core/Expanded family-selection semantics. Curated Core uses Original; Expanded substitutes an eligible non-Original Alternative when available, otherwise Original; legacy `NULL` families retain random eligible-option selection.
- `STIMULUS_GROUPS_DESIGN.md` — Alternative Sets, contextual questions, coverage, resolver/count-mode interaction, and identity-preserving movement/replacement.
- `STIMULUS_FAMILY_REFACTOR_ARCHITECTURE.md` — architecture/characterisation authority for staged, behavior-preserving internal decomposition of the Production Stimulus Family domain. Read it before moving implementation out of `stimulus-groups.js`; current executable code, migrations and tests remain higher authority for actual behavior.
- `V1_DATA_MODEL.md` / `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — current `original_option_id` plus `removed_from_case` semantics. **Make Original**, **Deactivate**, **Move**, **Move to Always shown**, and **Remove from Case** must preserve the ordering/integrity rules around the current Original.

Generic option insertion must not infer Original from insertion/display order. The source-aware **Start Alternative Set** operation is different: when the Admin explicitly starts a family from ordinary image A, A is the unambiguous principal source and is assigned as the family's Original atomically.

Higher-resolution replacement is only a better-quality copy of the same underlying image. It preserves the stable Stimulus Option ID and therefore preserves an Original pointer to that option. Correcting a genuinely wrong Original uses normal Alternative authoring: add B, Make Original B, then optionally deactivate/remove/move A.

## Reviewed imports / Anki / slide review

- `CONTENT_IMPORT_PACKAGES.md` — strict Import Package v1 and resumable job contract.
- `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` — lease/R2/checkpoint/runtime invariants.
- `ANKI_APKG_EXTRACTION.md` — source-recovery workflow outside production.
- `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` — ECG migration record.
- `ECG_ANKI_INGESTION_RULES.md` — naming/content rules.
- `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` — local human-review/finalization contract.
- `tools/slide-import-review/README.md` — executable reviewer workflow/use.
- `tools/slide-import-review/schemas/review-map-v1.schema.json` — **authoritative strict review-map v1 schema**.

For current Case classification, Import Package v1 keeps `secondaryTopicIds` only as an empty compatibility field. Reviewed parsing, resumable staging, and staged-plan reads reject non-empty values.

For review bundles, do not copy arbitrary review-map fields from an old extraction prompt. The executable `review-map-v1.schema.json` uses `additionalProperties: false` and therefore owns the accepted shape.

## Preview Admin — retained legacy subsystem

- `PREVIEW_ADMIN_WORKSPACE.md` — current retained safety/ownership model; first Preview document to read.
- `PREVIEW_ADMIN_IDENTITY.md` — role/identity bootstrap rules.
- `PREVIEW_DEPLOYMENT.md` — remote Preview deployment/restore operator playbook; optional/legacy capability, not the default development path.

Preview backend decomposition is intentionally paused after PRs #80/#82/#83 and the PR #92 workflow decision. Do not continue the former PR2D/PR2E/PR2F sequence merely because historical planning material names it.

Preview cloning copies the canonical Primary Topic and Case Tags, not legacy secondary Topic rows. Preview shares global production Topics/Tags read-only and does not gain global Tag/System mutation authority.

Issue #105's Original/Alternative authoring UX is production Admin + learner Review only. Migration `0016` deliberately does not auto-curate retained Preview stimulus groups, so an existing one-option Preview family does not unexpectedly acquire a protected Original that Preview has no UI to manage.

Production **Admin Study Preview** is a separate surface. Under the PR #137 cutover boundary it must remain outside learner persistence: no learner FSRS state, active Reviews, completion events/receipts, preferences, or legacy Review rows. PR F does not extend its persistence authority.

## Cloudflare / operations / local development

- `CLOUDFLARE.md` — Worker/D1/R2 migration/deployment runbook.
- `DEVELOPMENT_EXECUTION_WORKFLOW.md` — Local / Remote GitHub / Hybrid execution policy and Draft/Ready CI lifecycle.
- `LOCAL_DEVELOPMENT_REPLICA.md` — read-production/write-local developer replica and primary application testing workflow.
- `LOCAL_REAL_DATA_UX_WORKFLOW.md` — local real-data workflow design record.
- `R2_COST_GUARDRAILS.md` — storage/write/delete guardrails.
- `IMAGE_PROVENANCE.md` — image source/licence/runtime-serving rules.
- `PRODUCTION_CONTENT_SNAPSHOT.md` — read-only production-content snapshot/reporting contract.
- `OPEN_SOURCE_READINESS.md` — publication-cleanup checklist.

`npm run dev` and `npm run preview` use repository-owned local launchers and repository-local Wrangler/XDG state. `npm run local:stop` is the preferred checkout-scoped cleanup command.

The repository-installed/pinned Wrangler dependency and lockfile are the authority. Avoid documentation that hard-codes an independent ad-hoc Wrangler version.

## CI / validation authority

For current test-authoring and validation rules, start with `TESTING_AND_VALIDATION_GUIDANCE.md`. Detailed connector-readable CI failure semantics live in `CI_AGENT_DIAGNOSTICS.md`.

Ordinary PR state remains:

```text
Draft PR            → fast ordinary CI
Ready-for-Review PR → full ordinary CI
Draft → Ready       → full CI on the same head
same-PR newer run   → cancel superseded run
different PRs       → independent concurrency groups
```

The ordinary status/job remains `check`.

Authority split for ordinary PR CI change-aware specialization:

```text
scripts/agent-checks-lib.mjs
→ central classifier for ordinary-CI specialized requirements
→ agent:checks advisory requirements

scripts/validation-contract.mjs
→ named checks
→ fast/full composition
→ explicit satisfaction/deduplication

scripts/validate-ci.mjs
→ ordinary-CI execution wrapper + diagnostics

.github/workflows/ci.yml
→ PR event state + concurrency + ordinary-CI job orchestration only
```

Intentional separate exception:

```text
.github/workflows/wrangler-runtime-smoke.yml
→ separate Wrangler runtime-smoke workflow
→ owns its existing pull_request.paths trigger
→ runtimeSmoke is not in the ordinary-CI specialized subset
```

`agent:checks` is advisory when run locally; its output is not evidence that a check executed. Ordinary CI consumes the centrally classified specialized subset for the actual PR diff. `agent:checks` may advise `runtimeSmoke` for a broader runtime-sensitive set than the separate workflow's path filter, so neither its advice nor the ordinary `check` job proves runtime smoke executed. Preserve the runtime-smoke workflow's path filter unless a separately reviewed validation-architecture change redesigns it.

Do not add a second ordinary-CI classifier or independent validation command list to `.github/workflows/ci.yml`. Do not treat intentionally separate path-filtered workflows as duplication merely because `agent:checks` also knows about related paths.

Do not duplicate the static test list into task prompts. Use root `AGENTS.md`, `AGENT_TASK_MAP.md`, `TESTING_AND_VALIDATION_GUIDANCE.md`, and repository commands.

## Historical / superseded records

Historical implementation prompts and decision records remain useful for explaining why schema/provenance exists, but they must not be used as current product authority.

Notable examples:

- `MULTI_TOPIC_STUDY_ROUTES.md` — former Additional Study Topic behavior;
- `LEARNER_FSRS_PR_A_EVIDENCE.md` through `LEARNER_FSRS_PR_E_EVIDENCE.md` — staged FSRS implementation evidence before the explicit learner runtime cutover;
- `PROPOSED_TAGGING_MODEL.md` — superseded Tag proposal;
- `PARALLEL_WORK_PLAN.md` — completed parallel Admin phase;
- old Preview staged-refactor instructions expecting PR2D/PR2E/PR2F;
- `agent-tasks/` — completed/historical implementation prompts;
- merged feature plans whose title/status language still reflects their pre-implementation phase; use this index + current code/merged PR state for status.

## Current next product sequence

```text
curate clinically useful Case Tags and System↔Tag exposure before learner rollout
→ verify intended Topic/Tag/System learner reachability
→ promote genuinely reusable Shared/Image Questions where scope is proven
→ user-test merged taxonomy/lifecycle/Case Library workflows
→ finish Account Management v1 implementation
→ learner-progress administration
→ targeted maintainability/performance work where evidence justifies it
```

Further Preview backend decomposition is not part of this sequence.

Existing secondary rows do not need to be deleted before this sequence. Clean them later only if a concrete maintenance reason justifies a reviewed data operation.

Do not expand schema/taxonomy merely for conceptual completeness.

## Documentation maintenance rules

1. Update the relevant subsystem behavior/status document in the same PR when behavior changes.
2. Update `V1_DATA_MODEL.md` in the same PR when schema/relationship/runtime ownership semantics change.
3. Update roadmap/handover when status or priorities materially change; do not call a draft/merged feature deployed without explicit verification.
4. Keep migration presence, production migration application, Worker deployment, curation, feature enablement, and behavior verification as separate facts.
5. Preserve historical decision/evidence records, but label their current authority clearly in the index when their original banner/current-state wording is phase-specific.
6. If a future production data change is needed, use explicit reviewed identifiers and verification; never infer clinical mapping from matching labels.
7. Keep terminology consistent: System, Topic, Case, Tag, Asset, Collection, Question Prompt, Shared Question, Reusable Image Question, Stimulus Group, Stimulus Option, Original, Alternative.
8. Behavior-preserving refactors should update ownership/routing docs when future agents need a new file/module boundary.
9. Do not keep a historical staged-refactor sequence alive after its workflow/value assumption has changed.
10. For machine-consumed artifacts, executable validators/schemas outrank copied examples in prose prompts.
