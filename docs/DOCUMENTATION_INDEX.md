# Flash-Cards Documentation Index

_Last reviewed: 25 August 2026_

This index identifies the documents that describe current repository behavior, operational contracts, pending designs, and historical records.

Repository-wide coding-agent safety rules live in root `AGENTS.md`. Use `AGENT_TASK_MAP.md` to select the minimum current context and execution/validation mode. Repository-wide structural direction lives in `ENGINEERING_ARCHITECTURE_GUIDELINES.md`.

## Conflict rule

When documentation appears to disagree, use this order:

1. current code and committed schema/migrations, while keeping production application/deployment status separate;
2. `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` for merged/deployed status and current priorities;
3. `V1_DATA_MODEL.md` plus the relevant current subsystem behavior document for exact semantics;
4. `CURRENT_DESIGN.md`, `V1_SPEC.md`, and `AUTHORING_MODEL.md` for product mental model;
5. pending designs only for future intent;
6. historical plans/proposals only for decision context.

An old PR instruction, rollout note, staged-refactor plan, or historical design is never authority over current code/current priorities.

## Current development-workflow decision

As of 25 August 2026, the deployed production-backed `/preview-admin` Worker is no longer part of the normal development/testing path.

The primary application workflow is:

```text
production content
→ read-only local replica refresh
→ local D1/R2
→ npm run dev
→ local npm run preview
→ repository validation / GitHub CI
```

Preview backend decomposition is intentionally paused after PR #83. Draft PR #91 was closed unmerged. Do not infer from older Preview documents that PR2D/PR2E/PR2F are required next work.

The Preview subsystem remains in the repository for now because ownership/security and production-safety contracts still reference it. Any eventual removal requires a separate decommissioning assessment.

## Important current taxonomy rule

Current Case classification on current `main` is:

```text
System = top-level learner navigation grouping
Topic  = one canonical educational home for a Case
Tag    = flat cross-cutting classification / contextual discovery

Case
├── exactly one behaviorally active Primary Topic
└── zero or more Case Tags
```

Additional Study Topics are retired as current authoring/learner behavior. The physical `case_concepts.role = primary | secondary` schema remains unchanged, so historical secondary rows may still be stored; current code hides and ignores them rather than requiring a cleanup migration.

No Topic→Tag conversion is inferred from labels. Clinically useful Case Tags and System↔Tag exposure are explicit curation decisions that can be made before learner rollout without rewriting old secondary rows.

## Repository migration boundary

The repository migration sequence currently extends through:

```text
0015_contextual_system_topic_tag_navigation.sql
```

Important recent migrations include:

- `0014_review_question_pool_mode.sql` — Original/Core versus Expanded Review source-mode provenance;
- `0015_contextual_system_topic_tag_navigation.sql` — System/Topic taxonomy, System↔Tag exposure, and System-route Review provenance.

There is intentionally **no new migration** for retiring Additional Study Topics. This is a behavior/read-model/import-authoring change over the existing compatibility schema.

A committed migration is not proof that it has been applied to production. Merge, migration application, Worker deployment, taxonomy/data curation, learner feature enablement, and behavior verification are separate facts.

## Start here — authoritative orientation

### `CURRENT_PRODUCT_ROADMAP.md`

Shortest status map for verified production, current repository work, and next product priorities. It records the local-first development decision and the paused Preview refactor.

### `HANDOVER.md`

Implementation handover and operational boundary summary. It records PR #91 as closed unmerged and treats the remaining Preview façade as an accepted legacy boundary rather than required next work.

### `CURRENT_DESIGN.md`

Living product/design summary across System/Topic/Tag classification, Cases/stimuli, questions/reuse, Review provenance, imports, Preview, and lifecycle behavior.

### `V1_SPEC.md`

Current V1 behavior specification.

### `V1_DATA_MODEL.md`

Authoritative implemented domain model, including the physical compatibility shape of `case_concepts`, current Primary-Topic behavior, Tags/System exposure, question-pool modes, Review provenance, Preview ownership, and migration ledger.

### `AUTHORING_MODEL.md`

Preferred administrator mental model. Current Case-local classification is **Primary Topic + Case Tags**; global System↔Tag exposure remains a System-level operation.

### `CONTENT_MODEL_EXAMPLES.md`

Concrete examples for stems, stimuli, contextual questions, Tags, Shared Questions, Reusable Image Questions, and progressive enrichment. Treat any historical Additional Study Topic examples as superseded by the current Primary Topic + Tags model unless the document has been explicitly updated.

### `AGENT_TASK_MAP.md`

Coding-agent routing guide for scoped context and validation.

### `ENGINEERING_ARCHITECTURE_GUIDELINES.md`

Repository-wide modularity, TypeScript, thin-route, ownership, transaction, testing, and scope-control guidance.

## Authentication / account lifecycle

- `PASSWORD_RECOVERY.md` — current repository contract for Better Auth password recovery, Resend transactional-email delivery, anti-enumeration behavior, Cloudflare `waitUntil`, required runtime configuration, testing, and the residual per-isolate rate-limit limitation. Production Resend/domain/secret configuration and live rollout verification remain separate facts.

The production Admin Accounts UI/account-creation lifecycle is not implemented by the password-recovery foundation. Future account-management work should reuse its small server-side email transport rather than duplicating provider calls.

## Current taxonomy / learner-navigation contracts

### `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md`

Authoritative current System/Topic/Tag learner-routing contract:

- canonical Topic routes use the Case's one Primary Topic;
- Tag routes discover the Case without changing direct Topic-question context;
- System → All deduplicates Topic + exposed-Tag reachability;
- effective Review provenance is separate from learner-selected navigation provenance;
- taxonomy curation, Worker deployment, and learner rollout remain separate operational steps.

### `ADDITIONAL_STUDY_TOPICS_TO_TAGS_PLAN.md`

PR #90 product/domain decision record. It explains the historical semantic difference, the no-migration compatibility choice, import/Preview behavior, and the rule that current product behavior ignores stored secondary rows.

### `MULTI_TOPIC_STUDY_ROUTES.md`

**Historical/superseded decision record.** Read only to understand migration `0003`, legacy secondary `case_concepts` rows, and older/development Reviews whose `study_concept_id` may differ from `primary_concept_id`.

### `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md`

Fixed-purpose historical production taxonomy operator/runbook. It is not a generic taxonomy API and does not authorize inferred Topic→Tag conversion.

## Tags / Shared Questions

- `TAGGING_MODEL_DECISIONS.md` — Tag/Shared Question architecture decisions.
- `STAGE_A_TAG_FOUNDATION.md` — Tag foundation record.
- `TAGGING_STAGE_B_BEHAVIOR.md` — Shared Question eligibility/precedence/Admin/Review behavior.

Current Case Tags additionally carry alternate/cross-cutting Case classification and may become learner routes only when a System explicitly exposes the Tag. System exposure does not itself make a Shared Question eligible; explicit matching Case Tag remains required.

## Admin/content management

- `ADMIN_CONTENT_MANAGEMENT_PLAN.md` — Admin CMS contract/history.
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — Case/Image authoring and lifecycle interaction contract.
- `CASE_EDITOR_FAST_REVIEW_DESIGN.md` — Compact editor fast-review record.
- `IMAGE_MANAGEMENT_V2_PLAN.md` — Image Library/Collections behavior record.
- `REUSABLE_IMAGE_QUESTIONS.md` — exact-Asset reusable-question semantics.
- `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` — narrow same-image quality replacement contract.
- `PERFORMANCE_AND_READ_MODEL_PLAN.md` — bounded reads/measurement guidance.

The Case editor is componentized under `src/lib/components/case-editor/`. Current classification actions are Primary Topic plus Case Tags; Additional Study Topic actions are retired/fail closed. Stored legacy secondary rows are not shown.

## Stimulus behavior

- `STIMULUS_GROUPS_DESIGN.md` — optional Alternative Sets, contextual questions, coverage, and resolver/count-mode interaction.
- `V1_DATA_MODEL.md` / `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — current `removed_from_case` semantics. **Deactivate** and **Remove from Case** remain distinct.

## Reviewed imports / Anki / slide review

- `CONTENT_IMPORT_PACKAGES.md` — strict Import Package v1 and resumable job contract.
- `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` — lease/R2/checkpoint/runtime invariants.
- `ANKI_APKG_EXTRACTION.md` — source-recovery workflow outside production.
- `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` — ECG migration record.
- `ECG_ANKI_INGESTION_RULES.md` — naming/content rules.
- `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` — local human-review/finalization contract.

For current Case classification, Import Package v1 keeps `secondaryTopicIds` only as an empty compatibility field. Reviewed parsing, resumable staging, and staged-plan reads reject non-empty values before they can recreate secondary relationships.

## Preview Admin — retained legacy subsystem

- `PREVIEW_ADMIN_WORKSPACE.md` — **current status + retained safety/ownership model**. This is the first Preview document to read.
- `PREVIEW_ADMIN_IDENTITY.md` — role/identity bootstrap rules for the retained subsystem.
- `PREVIEW_DEPLOYMENT.md` — remote Preview deployment/restore operator playbook; now an optional/legacy capability, not the default development path.

Current Preview DB ownership remains behind `src/lib/server/db/preview-workspace.js`. PRs #80/#82/#83 extracted Session/ownership, Case lifecycle/cloning, and fixed-image operations. The remaining Alternative Set/question/cleanup responsibilities are accepted legacy façade ownership for now.

Do **not** continue the former staged sequence simply because older documentation or issue history names PR2D/PR2E/PR2F. Issue #81 is the persistent decision record: the Preview refactor is paused after #83 and PR #91 was closed unmerged.

Preview cloning copies the canonical Primary Topic and Case Tags, not legacy secondary Topic rows. Preview shares global production Topics/Tags read-only and does not gain global Tag/System mutation authority.

## Cloudflare / operations / local development

- `CLOUDFLARE.md` — Worker/D1/R2 migration/deployment runbook.
- `DEVELOPMENT_EXECUTION_WORKFLOW.md` — Local / Remote GitHub / Hybrid execution policy.
- `LOCAL_DEVELOPMENT_REPLICA.md` — read-production/write-local developer replica and the primary application testing workflow.
- `LOCAL_REAL_DATA_UX_WORKFLOW.md` — local real-data workflow design record.
- `R2_COST_GUARDRAILS.md` — storage/write/delete guardrails.
- `IMAGE_PROVENANCE.md` — image source/licence/runtime-serving rules.
- `PRODUCTION_CONTENT_SNAPSHOT.md` — read-only production-content snapshot/reporting contract.
- `OPEN_SOURCE_READINESS.md` — publication-cleanup checklist.

`npm run dev` and `npm run preview` use repository-owned local launchers and repository-local Wrangler/XDG state. `npm run local:stop` is the preferred checkout-scoped cleanup command; do not replace it with broad Node-process termination. Local `npm run preview` is production-style local verification and is not a production-backed Preview Worker deployment.

If older text in `LOCAL_DEVELOPMENT_REPLICA.md` describes the remote Preview Worker as a mandatory/final integration gate, this index plus `CURRENT_PRODUCT_ROADMAP.md`, `HANDOVER.md`, and the updated `PREVIEW_ADMIN_WORKSPACE.md` supersede that statement. The normal path is local-first plus repository validation/CI.

## Historical / superseded records

Historical implementation prompts and decision records remain useful for explaining why schema/provenance exists, but they must be labeled and must not be used as current product authority.

Notable examples:

- `MULTI_TOPIC_STUDY_ROUTES.md` — former Additional Study Topic behavior;
- `PROPOSED_TAGGING_MODEL.md` — superseded Tag proposal;
- `PARALLEL_WORK_PLAN.md` — completed parallel Admin phase;
- older Preview staged-refactor instructions that expect PR2D/PR2E/PR2F to continue;
- `agent-tasks/` — completed/historical implementation prompts.

## Current next product sequence

After current code is reviewed:

```text
curate clinically useful Case Tags and System↔Tag exposure before learner rollout
→ verify intended Topic/Tag/System learner reachability
→ promote genuinely reusable Shared/Image Questions where scope is proven
→ add useful stimulus variants
→ observe Admin/learner friction
→ improve actively used local-development/modularity/performance paths where evidence justifies it
→ learner-account administration
→ learner-progress administration
```

Further remote Preview decomposition is not part of this sequence.

Existing secondary rows do not need to be deleted before this sequence. Clean them later only if a concrete maintenance reason justifies a reviewed data operation.

Do not expand schema/taxonomy merely for conceptual completeness.

## Documentation maintenance rules

1. Update the relevant subsystem behavior document in the same PR when behavior changes.
2. Update `V1_DATA_MODEL.md` in the same PR when schema/relationship semantics change.
3. Update roadmap/handover when status or priorities materially change; do not call a draft/merged feature deployed without explicit verification.
4. Keep migration presence, production migration application, Worker deployment, curation, feature enablement, and behavior verification as separate facts.
5. Preserve historical decision records but label them clearly.
6. If a future production data change is needed, use explicit reviewed identifiers and verification; never infer clinical mapping from matching labels.
7. Keep terminology consistent: System, Topic, Case, Tag, Asset, Collection, Question Prompt, Shared Question, Reusable Image Question.
8. Behavior-preserving refactors should update ownership/routing docs when future agents need a new file/module boundary.
9. Do not keep a historical staged-refactor sequence alive after its workflow/value assumption has changed; record the stop/defer decision explicitly.
