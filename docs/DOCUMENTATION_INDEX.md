# Flash-Cards Documentation Index

_Last reconciled: 4 September 2026._

This index defines document authority. Historical plans/evidence may preserve old branch-era facts; they do not override current executable implementation or the living authorities below.

## Conflict rule

Use this order when sources disagree:

1. current code, committed migrations/schema, executable validators, and workflow definitions;
2. `CURRENT_PRODUCT_ROADMAP.md` for current repository/Production status and priorities;
3. `V1_DATA_MODEL.md` plus the relevant current subsystem authority for implemented semantics;
4. `CURRENT_DESIGN.md`, `V1_SPEC.md`, and `AUTHORING_MODEL.md` for concise product mental model;
5. locked/pending designs for future intent;
6. implementation plans, PR prompts, and evidence records for historical context only.

## Reconciliation baseline

This reconciliation was prepared from `main` at `602b2ab` after merged PR #142. Use Git/GitHub for the exact current head after this documentation PR changes the branch.

The implemented repository migration boundary is:

```text
0025_learner_fsrs_admin_analytics_deletion.sql
```

`V1_DATA_MODEL.md` and the committed migration tree own the exact ledger.

Merged repository work represented by the living docs includes PR #137 (learner FSRS runtime cutover), PR #139 / PR F (Reset/Fresh, retention, learner Progress), PR #141 / PR G (Admin analytics and mature-account deletion readiness), and PR #142 (dependency-install speedups).

Repository merge state is not Production deployment evidence.

The GitHub repository is public. The application remains closed-enrollment/private; public signup is disabled on current repository code.

## Living project-wide authorities

- `CURRENT_PRODUCT_ROADMAP.md` — shortest status/priorities map.
- `V1_DATA_MODEL.md` — primary implemented data-model/schema authority.
- `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` — current learner-runtime implementation companion.
- `CURRENT_DESIGN.md` — concise current product/design mental model.
- `V1_SPEC.md` — concise current V1 repository behavior.
- `AUTHORING_MODEL.md` — administrator mental model.
- `AGENT_TASK_MAP.md` — minimum-context coding-agent routing authority; root `AGENTS.md` remains the universal safety contract.
- `TESTING_AND_VALIDATION_GUIDANCE.md` — current test/validation authority; `CI_AGENT_DIAGNOSTICS.md` owns CI presentation/retrieval details.
- `ENGINEERING_ARCHITECTURE_GUIDELINES.md` — structural guidance for substantial refactors/new module boundaries.
- `DOCUMENTATION_MAINTENANCE.md` — living documentation-lifecycle and drift-prevention guidance.

## Taxonomy / learner navigation

Current Case classification is:

```text
Case
├── exactly one behaviorally active Primary Topic
└── zero or more Case Tags
```

Use:

- `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md` for System/Topic/Tag reachability semantics;
- `ADDITIONAL_STUDY_TOPICS_TO_TAGS_PLAN.md` as the historical PR #90 decision record;
- `MULTI_TOPIC_STUDY_ROUTES.md` only as pre-PR-#90 historical context.

Do not infer Topic→Tag conversion from matching labels.

## Learner Study / FSRS

Product/design chain:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — locked product authority;
- `LEARNER_FSRS_RUN_SIZE_PRODUCT_AMENDMENT.md` — 5/10/20/All and continuous-run amendment;
- `MULTI_SYSTEM_STUDY_PLAN.md` — proposed future-intent plan for mixed multi-System study; not current implemented behavior;
- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md` — technical design/history;
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md` — readiness/safety requirements;
- `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md` — focused tranche ownership where older assignments conflict.

Current-state facts come from current code, `V1_DATA_MODEL.md`, and `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`.

`LEARNER_FSRS_PR_A_EVIDENCE.md` through `LEARNER_FSRS_PR_G_EVIDENCE.md` are implementation evidence records, not living status documents. PR #141 / PR G is merged; branch-era wording inside older evidence revisions is historical context.

## Admin/content management

Relevant current authorities/records include:

- `ADMIN_CONTENT_MANAGEMENT_PLAN.md`
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`
- `ORIGINAL_AND_ALTERNATIVE_STIMULI.md`
- `IMAGE_MANAGEMENT_V2_PLAN.md`
- `REUSABLE_IMAGE_QUESTIONS.md`
- `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md`
- `PERFORMANCE_AND_READ_MODEL_PLAN.md`

Additional Study Topic authoring is retired. Historical Case Library PR #104 plans may still say `draft PR #104`; PR #104 is merged, so those files are implementation records rather than current status authorities.

## Authentication / Account Management

`ACCOUNT_MANAGEMENT_PLAN.md` is product/design context. Its PR A/B implementation prompts are task handoffs, not proof of current-main behavior.

As of this reconciliation:

- PR #96 (password recovery / transactional email) is open and draft;
- PR #97 (Admin account management) is open and draft and stacked on PR #96.

Neither is part of the reconciliation base merely because the design/prompts are committed.

## Reviewed imports / Anki / slide review

Use:

- `CONTENT_IMPORT_PACKAGES.md` — strict Import Package v1/resumable import contract;
- `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` — resumable runtime safety;
- `ANKI_APKG_EXTRACTION.md` and `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` — source-recovery/migration guidance;
- `ECG_ANKI_INGESTION_RULES.md` — ECG package-preparation convention;
- `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` — reviewed slide workflow;
- `tools/slide-import-review/README.md` — executable reviewer/finalizer workflow;
- `tools/slide-import-review/schemas/review-map-v1.schema.json` — authoritative strict review-map v1 schema.

Executable validators/schemas outrank old extraction-prompt examples. Import Package v1 keeps `secondaryTopicIds` only as an empty compatibility field for current reviewed input.

## Preview / operations / development

- `PREVIEW_ADMIN_WORKSPACE.md` — retained Preview Admin ownership/safety model.
- `PREVIEW_DEPLOYMENT.md` — optional remote Preview deployment workflow.
- `CLOUDFLARE.md` — Production release/migration runbook.
- `DEVELOPMENT_EXECUTION_WORKFLOW.md` — Local / Remote GitHub / Hybrid workflow.
- `LOCAL_DEVELOPMENT_REPLICA.md` — local production-content replica.
- `R2_COST_GUARDRAILS.md` and `IMAGE_PROVENANCE.md` — media/storage safety.
- `OPEN_SOURCE_READINESS.md` — current public-repository safety posture.

Normal local dependency preparation after branch sync is `npm run deps:ensure`; GitHub Actions may still intentionally perform clean installs.

## Historical-document rule

Historical plans, prompts, and evidence files are retained because they explain why current architecture exists. Do not rewrite every historical body to pretend it was authored after later work merged.

Instead, keep living authorities current and use this index to classify historical files. Add a narrow banner correction only when old status wording is operationally dangerous.

## Production-state rule

Never treat these as equivalent:

```text
code merged
migration committed
migration applied to Production D1
Worker deployed
feature enabled
manual behavior verified
learner rollout complete
```

Where Production evidence is absent, say that it is absent rather than guessing from repository state.
