# Flash-Cards Documentation Index

_Last reviewed: 28 August 2026_

This index identifies the documents that describe current repository behavior, operational contracts, pending designs, and historical/implementation records.

Repository-wide coding-agent safety rules live in root `AGENTS.md`. Use `AGENT_TASK_MAP.md` to select the minimum current context and execution/validation mode. Repository-wide structural direction lives in `ENGINEERING_ARCHITECTURE_GUIDELINES.md`.

## Conflict rule

When documentation appears to disagree, use this order:

1. current code, executable validators, committed schema/migrations, and workflow definitions, while keeping production application/deployment status separate;
2. `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` for merged/deployed status and current priorities;
3. `V1_DATA_MODEL.md` plus the relevant current subsystem behavior document for exact semantics;
4. `CURRENT_DESIGN.md`, `V1_SPEC.md`, and `AUTHORING_MODEL.md` for product mental model;
5. pending designs only for future intent;
6. implementation plans/historical records only for decision context.

An old PR instruction, stale status banner, rollout note, staged-refactor plan, or historical design is never authority over current code/current priorities.

## Current repository baseline

At this refresh, current `main` is through merged PR #106. Draft PR #108 adds the Original/Alternative stimulus model described below; its presence on this branch is not evidence that it has merged, been migrated in production, or been deployed.

Important post-PR-#90 merged changes include:

- PR #92 — local-first workflow decision / Preview refactor pause;
- PR #93 — Case-editor desktop UX refinement;
- PR #95 — Account Management v1 **design documentation**;
- PR #98 — bulk Case Primary Topic assignment;
- PR #99 — visual Systems & Topics taxonomy/Case-classification workspace with mixed staged review, unified workspace apply, and all-domain preflight before canonical writes;
- PR #100 — Production Case lifecycle + inline/bulk Case Tag curation;
- PR #102 — Case Library text-filter/read-path performance improvement;
- PR #106 — Draft-fast / Ready-full PR CI and same-PR run cancellation.

Account Management implementation PRs are not current-main features merely because PR #95's plan is merged. Inspect actual implementation PR/merge state before relying on the implementation prompts.

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

On this PR branch, the repository migration sequence extends through:

```text
0016_original_stimulus_options.sql
```

Important recent migrations:

- `0014_review_question_pool_mode.sql` — Original/Core versus Expanded Review source-mode provenance;
- `0015_contextual_system_topic_tag_navigation.sql` — System/Topic taxonomy, System↔Tag exposure, and System-route Review provenance;
- `0016_original_stimulus_options.sql` — nullable `stimulus_groups.original_option_id`, conservative production-only Original backfill, and defensive Original-integrity guards.

Migration `0016` leaves ambiguous legacy multi-option production families and retained Preview-owned families with `original_option_id = NULL`; it does not infer Original from ordering or labels. See `ORIGINAL_AND_ALTERNATIVE_STIMULI.md` and `V1_DATA_MODEL.md` for the current branch contract.

There is intentionally no new migration solely for retiring Additional Study Topics.

A committed migration is not proof that it has been applied to production. Merge, migration application, Worker deployment, taxonomy/data/stimulus curation, learner feature enablement, and behavior verification are separate facts.

## Start here — living authorities

### `CURRENT_PRODUCT_ROADMAP.md`

Shortest status map for verified production, current `main`, and next product priorities. Updated through PR #106.

### `HANDOVER.md`

Current implementation handover, operational boundaries, recent merged changes, and current coding-agent/CI lifecycle.

### `CURRENT_DESIGN.md`

Living product/design summary across classification, Cases/stimuli, questions/reuse, Review provenance, imports, Preview, and lifecycle behavior. If it omits a newer Admin convenience/UX feature, use the roadmap/handover plus the relevant implementation record; omission is not authority against current code.

### `V1_SPEC.md`

Current V1 product behavior specification. Exact implementation status of later Admin UX/tooling changes should be cross-checked with roadmap/handover/current code.

### `V1_DATA_MODEL.md`

Authoritative implemented domain model for the current branch, including the physical compatibility shape of `case_concepts`, current Primary-Topic behavior, Tags/System exposure, Original/Alternative stimulus relationships, question-pool modes, Review provenance, Preview ownership, and migration ledger.

### `AUTHORING_MODEL.md`

Preferred administrator mental model. Current Case-local classification is **Primary Topic + Case Tags**; global System↔Tag exposure remains separate.

### `CONTENT_MODEL_EXAMPLES.md`

Concrete content examples. Any historical Additional Study Topic example is superseded by the current Primary Topic + Tags model unless explicitly framed as legacy context.

### `AGENT_TASK_MAP.md`

Coding-agent routing guide for scoped context and validation.

### `ENGINEERING_ARCHITECTURE_GUIDELINES.md`

Repository-wide modularity, TypeScript, thin-route, ownership, transaction, testing, and scope-control guidance.

## Current taxonomy / learner-navigation contracts

### `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md`

Current System/Topic/Tag learner-routing contract:

- canonical Topic routes use the Case's one Primary Topic;
- Tag routes discover the Case without changing direct Topic-question context;
- System → All deduplicates Topic + exposed-Tag reachability;
- effective Review provenance is separate from learner-selected navigation provenance;
- taxonomy curation, Worker deployment, and learner rollout remain separate operational steps.

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

PR #100 also added inline and bulk Case Tag curation in the Case Library. Current code/PR #100 are authoritative over any older draft-status wording in this document.

### `CASE_LIBRARY_SEARCH_PERFORMANCE_PLAN.md`

**Implemented design/implementation record — PR #102 merged.** Case/Topic/System text filters no longer navigate after every typing pause; explicit Search/Enter submits the GET form, and the active read path no longer performs the previous duplicate taxonomy supporting read.

Current code/PR #102 are authoritative over any older `draft` / `validation pending` status wording in the plan.

## Tags / Shared Questions

- `TAGGING_MODEL_DECISIONS.md` — Tag/Shared Question architecture decisions.
- `STAGE_A_TAG_FOUNDATION.md` — Tag foundation record.
- `TAGGING_STAGE_B_BEHAVIOR.md` — Shared Question eligibility/precedence/Admin/Review behavior.

Case Tags additionally carry alternate/cross-cutting Case classification and may become learner routes only when a System explicitly exposes the Tag. System exposure does not itself make a Shared Question eligible; explicit matching Case Tag remains required.

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

## Authentication / account management

- `ACCOUNT_MANAGEMENT_PLAN.md` — merged Account Management v1 product/security design for closed enrollment, password recovery, transactional email, production account administration, Disable/Restore semantics, session controls, and Admin lockout guards.
- `ACCOUNT_MANAGEMENT_PR_A_IMPLEMENTATION_PROMPT.md` — implementation handoff for password recovery + transactional email; treat as a task prompt, not proof of merge.
- `ACCOUNT_MANAGEMENT_PR_B_IMPLEMENTATION_PROMPT.md` — implementation handoff for production Admin account management; treat as a task prompt, not proof of merge.

For account/auth work, inspect current implementation and current PR state before relying on an implementation prompt. Once an implementation PR merges, the prompt becomes historical handoff context.

Public signup remains intentionally disabled unless a separately reviewed product decision changes that contract.

## Stimulus behavior

- `ORIGINAL_AND_ALTERNATIVE_STIMULI.md` — explicit Original pointer and Core/Expanded family-selection semantics. Curated Core uses Original; Expanded substitutes an eligible non-Original Alternative when available, otherwise Original; legacy `NULL` families retain random eligible-option selection.
- `STIMULUS_GROUPS_DESIGN.md` — Alternative Sets, contextual questions, coverage, resolver/count-mode interaction, and identity-preserving movement/replacement.
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

## Cloudflare / operations / local development

- `CLOUDFLARE.md` — Worker/D1/R2 migration/deployment runbook.
- `DEVELOPMENT_EXECUTION_WORKFLOW.md` — Local / Remote GitHub / Hybrid execution policy and Draft/Ready CI lifecycle.
- `LOCAL_DEVELOPMENT_REPLICA.md` — read-production/write-local developer replica and primary application testing workflow.
- `LOCAL_REAL_DATA_UX_WORKFLOW.md` — local real-data workflow design record.
- `R2_COST_GUARDRAILS.md` — storage/write/delete guardrails.
- `IMAGE_PROVENANCE.md` — image source/licence/runtime-serving rules.
- `PRODUCTION_CONTENT_SNAPSHOT.md` — read-only production-content snapshot/reporting contract.
- `OPEN_SOURCE_READINESS.md` — publication-cleanup checklist.

`npm run dev` and `npm run preview` use repository-owned launchers and repository-local Wrangler/XDG state. `npm run local:stop` is the preferred checkout-scoped cleanup command.

The repository-installed/pinned Wrangler dependency and lockfile are the authority. Avoid documentation that hard-codes an independent ad-hoc Wrangler version.

## CI / validation authority

PR #106 establishes:

```text
Draft PR            → fast ordinary CI
Ready-for-Review PR → full ordinary CI
Draft → Ready       → full CI on the same head
same-PR newer run   → cancel superseded run
different PRs       → independent concurrency groups
```

The ordinary status/job remains `check`.

Authority split:

```text
scripts/validation-contract.mjs
→ fast/full check composition

scripts/validate-ci.mjs
→ CI runner/mode/diagnostics

.github/workflows/ci.yml
→ PR event state + concurrency + job orchestration
```

Do not duplicate the static test list into task prompts. Use root `AGENTS.md`, `AGENT_TASK_MAP.md`, and repository commands.

## Historical / superseded records

Historical implementation prompts and decision records remain useful for explaining why schema/provenance exists, but they must not be used as current product authority.

Notable examples:

- `MULTI_TOPIC_STUDY_ROUTES.md` — former Additional Study Topic behavior;
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

1. Update the relevant subsystem behavior document in the same PR when behavior changes.
2. Update `V1_DATA_MODEL.md` in the same PR when schema/relationship semantics change.
3. Update roadmap/handover when status or priorities materially change; do not call a draft/merged feature deployed without explicit verification.
4. Keep migration presence, production migration application, Worker deployment, curation, feature enablement, and behavior verification as separate facts.
5. Preserve historical decision records, but label their current status clearly in the index when their original banner is phase-specific.
6. If a future production data change is needed, use explicit reviewed identifiers and verification; never infer clinical mapping from matching labels.
7. Keep terminology consistent: System, Topic, Case, Tag, Asset, Collection, Question Prompt, Shared Question, Reusable Image Question, Stimulus Group, Stimulus Option, Original, Alternative.
8. Behavior-preserving refactors should update ownership/routing docs when future agents need a new file/module boundary.
9. Do not keep a historical staged-refactor sequence alive after its workflow/value assumption has changed.
10. For machine-consumed artifacts, executable validators/schemas outrank copied examples in prose prompts.
