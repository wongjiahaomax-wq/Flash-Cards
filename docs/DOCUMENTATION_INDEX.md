# Flash-Cards Documentation Index

_Last reviewed: 22 August 2026_

This file identifies which repository documents describe the **verified deployed product**, which describe **current `main`**, which are subsystem contracts/runbooks, which are pending designs, and which are historical records.

## Conflict rule

When documentation appears to disagree, use this order:

1. current code and explicitly verified applied migrations/deployments;
2. `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` for merged/deployed status;
3. `V1_DATA_MODEL.md` plus the relevant current subsystem behavior document for exact semantics;
4. `CURRENT_DESIGN.md`, `V1_SPEC.md`, and `AUTHORING_MODEL.md` for the product mental model;
5. pending designs only for future intent;
6. historical plans/proposals only for decision context.

An old PR instruction, draft rollout note, or agent task is never authority over current `main`.

## Verified production baseline versus current `main`

The last explicitly recorded production baseline includes:

- learner Study/Review persistence;
- private R2 teaching images;
- Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags, and reviewed imports;
- multi-Topic Case routing;
- optional stimulus groups/options;
- Tagging Stage A and deployed Stage B;
- reviewed Import Package v1 and resumable imports;
- production-backed Preview Admin;
- Image Management V2 and Image Collections;
- wide responsive Admin workspace;
- first ECG source deck fully represented in production (`13 + 51 + 2 = 66/66`).

Remaining ECG work is curation/enrichment.

Current `main` is ahead of that verified baseline and now also contains the merged PR #53–#59 sequence:

- PR #53 — local/offline slide review and deterministic finalizer tooling;
- PR #54 — Case-editor Topic management and inline Topic creation;
- PR #55 — production-like local D1/R2 development replica;
- PR #56 — moving an existing Case-wide question to an exact image/stimulus option;
- PR #57 — author-facing **Applies to: This whole Case / A specific image or stimulus** scope, including transparent fixed-image conversion;
- PR #58 — Reusable Image Questions with explicit per-stimulus opt-in;
- PR #59 — narrow same-image higher-resolution Asset replacement and supersession lineage.

Repository developer tooling includes both the local D1/R2 replica (`LOCAL_DEVELOPMENT_REPLICA.md`) and the local slide-review/finalizer (`SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md`). Neither is itself a deployed learner/Admin feature.

Current `main` contains migrations through:

```text
0009_reusable_image_questions.sql
0010_reusable_image_reactivation_guard.sql
0011_asset_supersession.sql
```

Their presence on `main` is a repository/schema fact. Do **not** infer that a migration is applied to production, or that the corresponding Worker behavior is deployed, without explicit rollout verification.

The repository contains an explicit production rollout trigger commit for merged PR #56. A trigger commit alone is not treated here as proof that the workflow completed successfully; production deployment remains an explicitly verified fact, separate from merge status.

## Start here — authoritative orientation

### `CURRENT_PRODUCT_ROADMAP.md`

Shortest verified-production-versus-current-main-versus-next-work status map.

### `HANDOVER.md`

Detailed implementation handover: current migrations, Preview boundaries, Stage B, Image Management V2, recent PR #53–#59 additions, ECG migration verification, and next sequence.

### `PERFORMANCE_AND_READ_MODEL_PLAN.md`

Current performance/read-model guidance: dashboard-specific aggregate reads, exact Case detail reads, lightweight timing instrumentation, structural before/after analysis, and the intentionally deferred performance passes.

### `CURRENT_DESIGN.md`

Living product/design summary across Topic → Case → stimuli, Tags, Shared Questions, Collections, resolver, imports, Preview, and priorities.

### `V1_SPEC.md`

Current shipped V1 behavior specification plus the next small V1 Admin increments.

### `V1_DATA_MODEL.md`

Authoritative implemented domain model, including Preview ownership, Image Collections, multi-Topic routing, stimulus groups, Tags, Shared Questions, Reusable Image Questions, Review snapshots/provenance, and higher-resolution Asset supersession on current `main`.

### `AUTHORING_MODEL.md`

Preferred administrator mental model and question-placement/reuse rules.

### `CONTENT_MODEL_EXAMPLES.md`

Concrete examples for stems, fixed/alternative stimuli, Study Topics, contextual questions, Tags, Shared Questions, Collections, and progressive Anki enrichment.

## Current subsystem contracts

### Admin/content management

- `ADMIN_CONTENT_MANAGEMENT_PLAN.md` — historical filename, current implemented Admin CMS contract and next Admin work.
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — current Case/Image Library authoring interaction contract.
- `IMAGE_MANAGEMENT_V2_PLAN.md` — deployed behavior record for pagination, selection, Collections, bounded bulk execution, option Move, and Preview isolation.
- `REUSABLE_IMAGE_QUESTIONS.md` — exact-Asset reusable question semantics, explicit Case/stimulus opt-in, resolver precedence, Review provenance, fixed-image conversion, and Preview restrictions on current `main`.
- `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` — current-main narrow same-image quality upgrade contract: new immutable Asset/R2 object, supersession lineage, current relationship transfer, reusable-question cloning, stable Stimulus Option IDs, historical Review media delivery, rollback, and Preview isolation.
- `PERFORMANCE_AND_READ_MODEL_PLAN.md` — Admin/read-path performance rule: query only page-required data, filter/bound in SQL, keep list/detail/dashboard reads distinct, and use lightweight measurement before caching/index tuning.

### Topics / multi-Topic routing

- `MULTI_TOPIC_STUDY_ROUTES.md` — implemented multi-Topic learner/Admin routing and Review provenance.
- `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md` — fixed-purpose production taxonomy operator/runbook; never a generic taxonomy API.

### Tags / Shared Questions

- `TAGGING_MODEL_DECISIONS.md` — authoritative Tag/Shared Question architecture decisions.
- `STAGE_A_TAG_FOUNDATION.md` — implemented Stage A foundation.
- `TAGGING_STAGE_B_BEHAVIOR.md` — deployed Stage B eligibility, precedence, Admin authoring, and Review provenance.

### Stimulus behavior

- `STIMULUS_GROUPS_DESIGN.md` — implemented optional stimulus groups, contextual questions, coverage, and interaction with current resolver/count modes.

### Reviewed imports / Anki / slide review

- `CONTENT_IMPORT_PACKAGES.md` — production-validated Import Package v1 and resumable job contract.
- `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` — lease/R2/checkpoint/runtime safety invariants.
- `ANKI_APKG_EXTRACTION.md` — verified source-recovery workflow outside the production app.
- `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` — canonical end-to-end ECG migration record including production completion.
- `ECG_ANKI_INGESTION_RULES.md` — adopted naming/content rules and completed Batch 01 rename audit.
- `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` — implemented local/offline human-review and deterministic-finalization contract merged in PR #53. It freezes `review-map.json` v1, edits the real production-shaped manifest, supports fixed-image review/replacement and unresolved-question promotion/rejection, exports reviewed bundles, and finalizes production-compatible `manifest.json + media/` ZIPs. **ChatGPT PPTX/PDF reconstruction/extraction remains a separate workflow and is not implemented by the local tool.**

### Preview Admin

- `PREVIEW_ADMIN_WORKSPACE.md` — current production-backed Preview ownership/isolation model.
- `PREVIEW_ADMIN_IDENTITY.md` — current role/identity bootstrap/promotion rules.
- `PREVIEW_DEPLOYMENT.md` — current Deploy PR / Restore Main operator playbook, including laptop-versus-mobile dispatch rules and the distinction between local `npm run preview` and remote production-backed Preview deployment.

### Cloudflare / operations / local development

- `CLOUDFLARE.md` — current Worker/D1/R2 migration/deployment/Preview runbook.
- `DEVELOPMENT_EXECUTION_WORKFLOW.md` — **internal execution policy** for laptop/local-first development versus mobile/ChatGPT+GitHub operation, including GitHub Actions minute conservation, local versus remote Preview semantics, and workflow-dispatch fallback rules.
- `LOCAL_DEVELOPMENT_REPLICA.md` — **internal operational runbook** for read-production/write-local D1/R2 developer replication, local Admin bootstrap, refresh and cleanup.
- `LOCAL_REAL_DATA_UX_WORKFLOW.md` — implemented design record for the local real-data workflow; operational details live in `LOCAL_DEVELOPMENT_REPLICA.md`, while laptop-versus-mobile execution policy lives in `DEVELOPMENT_EXECUTION_WORKFLOW.md`.
- `R2_COST_GUARDRAILS.md` — application-managed storage/write/delete guardrails; external provider pricing must be reverified before changing cost assumptions.
- `IMAGE_PROVENANCE.md` — current image naming/source/licence/runtime-serving rules.
- `PRODUCTION_CONTENT_SNAPSHOT.md` — read-only production-content snapshot plus fixed-purpose taxonomy-operator linkage.
- `OPEN_SOURCE_READINESS.md` — private-repository checklist for removing/redacting internal operational detail and verifying no secrets/production-derived data are present before publication.

## Current implementation tracking

### `IMPLEMENTATION_PLAN.md`

Milestone ledger current through the merged PR #53–#59 sequence, while keeping production rollout/application status separate from merge status.

## Pending / forward designs

These are intentional future designs, **not current implemented behavior**.

- `CASE_EDITOR_FAST_REVIEW_DESIGN.md` — pending Compact-mode Case editor redesign centered on rapid full-Case review: persistent side-by-side Prompt/Answer visibility, accessible `ⓘ` explanations, compact image carousels/strips for multiple stimuli, always-visible image-linked Q&A, exact source identity while scrolling, preservation of existing image Move/Remove semantics, and a final **All questions in this Case** audit with hover/focus/tap image-source previews.

The slide-ingestion **source reconstruction/extraction** step remains separate future workflow work even though the local reviewer/finalizer is implemented; do not infer that PPTX/PDF ingestion is automated from the existence of the local review tool.

The narrow higher-resolution replacement workflow does **not** imply generic Asset families, arbitrary version history, automatic visual similarity, different-image substitution, or bulk replacement. Those remain outside current scope.

If pending work is later implemented, its design document must be converted from future/acceptance language into an operational runbook and the project roadmap/handover updated.

## Historical / superseded records

### `PROPOSED_TAGGING_MODEL.md`

Historical proposal superseded by `TAGGING_MODEL_DECISIONS.md`. Stage A/B are already implemented.

### `PARALLEL_WORK_PLAN.md`

Historical record of the completed PR #11/#12/#13 parallel Admin-library phase plus reusable parallel-work lessons.

### `agent-tasks/`

Historical implementation prompts for completed PR #11/#12 work. The directory README explicitly prevents them being treated as backlog.

## Implemented records with useful rollout history

These files may retain short historical rollout notes because they explain safety decisions, but their status headers/behavior are current:

- `STIMULUS_GROUPS_DESIGN.md`;
- `MULTI_TOPIC_STUDY_ROUTES.md`;
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`;
- `IMAGE_MANAGEMENT_V2_PLAN.md`;
- `STAGE_A_TAG_FOUNDATION.md`;
- `TAGGING_STAGE_B_BEHAVIOR.md`;
- `LOCAL_REAL_DATA_UX_WORKFLOW.md`;
- Preview deployment/runbook documents;
- ECG migration/rename runbooks.

## Current next product sequence

```text
curate real ECG Case Tags
→ promote genuinely reusable knowledge into Shared Questions / Reusable Image Questions where scope is proven
→ add useful alternate Study Topics/stimuli
→ observe real Admin/learner friction
→ implement learner-account administration
→ implement basic learner-progress administration
```

Do not expand schema/taxonomy merely for conceptual completeness.

## Documentation maintenance rules

For future PRs:

1. Update the subsystem behavior document in the same PR when behavior changes.
2. Update `V1_DATA_MODEL.md` in the same PR when schema/relationship semantics change.
3. Update `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` when a milestone is merged/deployed or materially changes priorities.
4. Convert `planned` / `draft` / `for review` language to implemented records after merge, and to deployed records only after deployment is explicitly verified.
5. Keep migration presence, migration application, and Worker deployment as separate explicitly verified facts.
6. Preserve historical decision records but label them clearly.
7. Record production content migrations with exact accounting/verification.
8. Keep terminology consistent: Topic, Case, Tag, Asset, Collection, Question Prompt, Shared Question, Reusable Image Question.
9. Do not call a pending design implemented merely because the design doc exists.
10. Before editing project-wide status, compare documentation with current code, migrations, merged PR state, and explicitly verified production state.
