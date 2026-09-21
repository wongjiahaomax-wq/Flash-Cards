# Flash-Cards Documentation Index

_Last reconciled: 21 September 2026 (repository-state checkpoint)._

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

Repository `main` checkpoint: `f392752cb5fe6fc14d37257d9352fd611cc0f25b` (merged #193); refresh GitHub for the actual current HEAD. The **committed repository** migration sequence ends at `0031_learner_feedback.sql` at this checkpoint; `V1_DATA_MODEL.md` and the committed migration tree own the exact ledger. Runtime v2's migration `0026` and subsequent migrations `0027`–`0031` are repository facts, not proof of Production D1 application or Worker deployment.

Relevant later merged repository work includes #149 (original learner multi-System cutover) and #159 (subsequent redesign of the Study launcher, applied/draft selection, and secondary routes), #174 (Asset deduplication), #180–#181 (password recovery and Admin accounts), #186 (learner feedback), #187 (Study Review UX), #188 (Case Library), and #192–#193 (Issue #191 cleanup/navigation optimization). Open Draft #190 remains the separate direct Case Editor Study Preview work; do not describe it as merged.

The GitHub repository is public. The application remains closed-enrollment/private; public signup is disabled in the repository implementation.

## Living project-wide authorities

- `CURRENT_PRODUCT_ROADMAP.md` — shortest status/priorities map.
- `V1_DATA_MODEL.md` — primary implemented data-model/schema authority and the complete committed migration ledger.
- `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` — learner-runtime/cutover baseline through the Runtime v2 foundation; for the subsequent learner chooser/current Multi-System UX use the executable code plus `MULTI_SYSTEM_UX_IMPLEMENTATION.md`.
- `MULTI_SYSTEM_RUNTIME_V2_IMPLEMENTATION.md` — Runtime v2 scope/proof/D1/cutover evidence from the foundation tranche; its statement that learner UX was deferred describes that tranche boundary, not the state after the UX tranche.
- `MULTI_SYSTEM_UX_IMPLEMENTATION.md` — current learner-facing multi-System chooser, request wiring, unique-count, Scheduled/Free, navigation, and UX-CI companion.
- `CURRENT_DESIGN.md` — concise current product/design mental model.
- `V1_SPEC.md` — concise current V1 repository behavior.
- `AUTHORING_MODEL.md` — administrator mental model.
- `AGENT_TASK_MAP.md` — minimum-context coding-agent routing authority; root `AGENTS.md` remains the universal safety contract.
- `LOCAL_CODEX_EXECUTION_GUIDANCE.md` — living local-Codex retrieval/shell-output overlay for Codex with usable local execution, including the local-execution side of Hybrid mode; it does not apply to ChatGPT chat using the GitHub plugin/Remote GitHub mode.
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

- `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md` for System/Topic/Tag reachability semantics; its original persisted-Review/"Next case" narrative reflects a pre-FSRS implementation stage. Use current FSRS/Runtime v2 code and its companions for active Review/proof/navigation behavior;
- `ADDITIONAL_STUDY_TOPICS_TO_TAGS_PLAN.md` as the historical PR #90 decision record;
- `MULTI_TOPIC_STUDY_ROUTES.md` only as pre-PR-#90 historical context.

Do not infer Topic→Tag conversion from matching labels.

## Learner Study / FSRS

Product/design chain:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — locked FSRS product baseline; its original pre-implementation instructions are historical now that the principal FSRS/runtime, retention and analytics tranches have merged. Automatic optimizer execution remains outside current scope;
- `LEARNER_FSRS_RUN_SIZE_PRODUCT_AMENDMENT.md` — 5/10/20/All and continuous-run amendment;
- `MULTI_SYSTEM_STUDY_PLAN.md` — design authority for mixed multi-System study, including the fenced zero-data v2 cutover, mandatory v2 Active Review migration, active-primary-Topic eligibility preservation, and the split between `Multi-System Runtime` and `Multi-System UX`;
- `MULTI_SYSTEM_RUNTIME_V2_IMPLEMENTATION.md` — executable-implementation companion for merged PR #147's Runtime foundation;
- `MULTI_SYSTEM_UX_IMPLEMENTATION.md` — executable-implementation companion for the learner cutover: multi-select Systems, optional per-System Topic/curated-Tag narrowing, compact whole-System `all`, authoritative deduplicated combined counts, and combined Scheduled/Free continuous runs;
- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md` — technical design/history;
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md` — readiness/safety requirements;
- `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md` — focused tranche ownership where older assignments conflict.

Current-state facts come first from current code, committed migrations, `V1_DATA_MODEL.md`, and the two Multi-System implementation companions. `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` remains authoritative for the underlying FSRS/cutover baseline but may preserve pre-UX wording about the chooser. Production deployment state must still be established separately.

`LEARNER_FSRS_PR_A_EVIDENCE.md` through `LEARNER_FSRS_PR_G_EVIDENCE.md` are implementation evidence records, not living status documents. PR #141 / PR G is merged; migration `0025_learner_fsrs_admin_analytics_deletion.sql` introduced durable monthly analytics and staged learner-account deletion. That is a historical migration milestone, **not** the current repository terminal boundary (`0031`). Branch-era wording inside older evidence revisions is historical context.

## Admin/content management

Relevant current authorities/records include:

- `ADMIN_CONTENT_MANAGEMENT_PLAN.md` — original content-management contract, with current Admin navigation/status corrected; superseded "next work" ideas are historical;
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`
- `ORIGINAL_AND_ALTERNATIVE_STIMULI.md`
- `IMAGE_MANAGEMENT_V2_PLAN.md`
- `REUSABLE_IMAGE_QUESTIONS.md`
- `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md`
- `PERFORMANCE_AND_READ_MODEL_PLAN.md` — retained August Admin read-model implementation record, not an exhaustive current performance backlog; Issue #191 and current code own the later audit/optimization status.
- `CASE_EDITOR_SAVE_AND_NAVIGATION_UX_PLAN.md` — historical PR #161 planning/decision record; current implementation and validation state live in the executable code and PR handoff.

Additional Study Topic authoring is retired. Historical Case Library PR #104 plans may still say `draft PR #104`; PR #104 is merged, so those files are implementation records rather than current status authorities. The Case Editor Save State (#165), Case authoring timestamps (#176), and Case Library inline mutation (#188) plans are also completed implementation records, **not** instructions to resume their old Draft branches.

## Authentication / Account Management

`ACCOUNT_MANAGEMENT_PLAN.md` is retained product/design and historical implementation-planning context; its updated status banner records that #180/#181 merged, while its original Draft-era implementation instructions remain historical. Its PR A/B handoff documents do not establish current behavior. Use current auth/Admin routes, tests, and `PASSWORD_RECOVERY.md` for implemented behavior.

PR #180 (password recovery/transactional email), PR #181 (Production Admin account management), and PR #182 (beta credentials) are merged on the reconciliation baseline. The `BETA_TEST_CREDENTIALS_*` planning/amendment files and Account Management PR-A/PR-B implementation prompts are historical, not open work. Remaining product plans require fresh PR/code verification; Production email configuration, migrations, deployment, and live verification remain separate.

Migration `0031` and current learner/Admin Feedback implementation add Case-level learner feedback. `LEARNER_FEEDBACK_IMPLEMENTATION_PLAN.md` is a historical PR #186 planning record; inspect current feedback routes, DB helper and tests for executable behavior, not its earlier Draft language.

## Reviewed imports / Anki / slide review

Use:

- `CONTENT_IMPORT_PACKAGES.md` — strict Import Package v1/resumable import contract;
- `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` — resumable runtime safety;
- `IMPORT_PACKAGE_FINAL_PREVIEW_AND_HISTORY_CLEANUP_PLAN.md` — historical PR #167 implementation plan; executable behavior now lives in the importer, Admin route, and tests;
- `ANKI_APKG_EXTRACTION.md` and `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` — source-recovery/migration guidance;
- `ECG_ANKI_INGESTION_RULES.md` — ECG package-preparation convention;
  - `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` — living reviewed-slide workflow, including the optional deterministic source-preparation stage;
  - `tools/slide-source-prep/README.md` and `tools/slide-source-prep/cli.mjs` — executable local/offline PPTX/PDF preparation workflow and implementation authority;
  - `SLIDE_SOURCE_PREPARATION_PLAN.md` — historical PR #164 implementation plan; current behavior is defined by the executable preparer and living workflow;
  - `SLIDE_SOURCE_PREPARATION_SOURCE_MAP_AMENDMENT.md` — historical PR #164 source-map implementation amendment;
  - `SLIDE_SOURCE_PREP_WINDOWS_LAUNCHER_UX_PLAN.md` — historical merged PR #168 Windows launcher UX implementation plan; executable behavior remains owned by the slide-source-prep implementation and README;
  - `SLIDE_SOURCE_PREP_PORTABLE_AI_HANDOFF_PLAN.md` — historical merged PR #168 portable extraction contract and prepared-output packaging plan; executable behavior remains owned by the slide-source-prep implementation and its portable artifact tests;
- `tools/slide-import-review/README.md` — executable reviewer/finalizer workflow;
- `SLIDE_IMPORT_REVIEWER_PERFORMANCE_UX_PLAN.md` — retained planning record for already-implemented lazy ZIP/cache/persistence work; its old eager-loading problem statement is historical. The compact Q&A (#166), inline crop and amendments (#172), visual polish and amendment (#173), and shared crop workspace (#183) plans are also merged historical implementation records. Issue #191 separately records conditional crop-source profiling.
- `tools/slide-import-review/schemas/review-map-v1.schema.json` — authoritative strict review-map v1 schema.

Executable validators/schemas outrank old extraction-prompt examples. Import Package v1 keeps `secondaryTopicIds` only as an empty compatibility field for current reviewed input.

## Preview / operations / development

- `PREVIEW_ADMIN_WORKSPACE.md` — retained Preview Admin ownership/safety model.
- `PREVIEW_DEPLOYMENT.md` — optional remote Preview deployment workflow.
- `CLOUDFLARE.md` — Production release/migration runbook, not a competing complete migration ledger; for the first Runtime v2 release it must follow the mechanically fenced migration path in `.github/workflows/deploy-production.yml` rather than any historical optional-migration command.
- `DEVELOPMENT_EXECUTION_WORKFLOW.md` — Local / Remote GitHub / Hybrid workflow and living authority for coding-agent execution mechanics/context lifecycle.
- `AGENT_CONTEXT_EFFICIENCY_PLAN.md` — historical PR #156 planning/audit record only; current authority lives in root `AGENTS.md`, `DEVELOPMENT_EXECUTION_WORKFLOW.md`, and repository-owned validation/CI contracts.
- `LOCAL_CODEX_CONTEXT_EFFICIENCY_PLAN.md` — historical PR #160 planning record only; current local-Codex behavior lives in `LOCAL_CODEX_EXECUTION_GUIDANCE.md` plus the applicable `AGENT_TASK_MAP.md` routing.
- `RETAINED_CONTEXT_EFFICIENCY_FOLLOWUP_PLAN.md` — retained PR #162 implementation/evaluation plan and evidence target; operational behavior lives in root `AGENTS.md`, `DEVELOPMENT_EXECUTION_WORKFLOW.md`, `LOCAL_CODEX_EXECUTION_GUIDANCE.md`, and `TESTING_AND_VALIDATION_GUIDANCE.md`.
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
