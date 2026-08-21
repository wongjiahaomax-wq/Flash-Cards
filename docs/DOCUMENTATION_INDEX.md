# Flash-Cards Documentation Index

_Last reviewed: 22 August 2026_

This file identifies which repository documents describe the **verified deployed product**, which describe the **current repository state**, which are subsystem contracts/runbooks, which are pending designs, and which are historical records.

## Conflict rule

When documentation appears to disagree, use this order:

1. current code and explicitly verified applied migrations/deployments;
2. `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` for merged/deployed status;
3. `V1_DATA_MODEL.md` plus the relevant current subsystem behavior document for exact semantics;
4. `CURRENT_DESIGN.md`, `V1_SPEC.md`, and `AUTHORING_MODEL.md` for the product mental model;
5. pending designs only for future intent;
6. historical plans/proposals only for decision context.

An old PR instruction, draft rollout note, or agent task is never authority over current code.

## Verified production baseline versus repository state

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

Repository implementation and production deployment are separate facts. A feature, migration, or workflow committed to the repository must not be described as deployed merely because the code exists or a PR merges.

Current schema documentation records migrations through `0012`, including `0012` relationship-level **Remove from Case** archive state for stimulus options. Presence in the repository is not proof of production migration application.

## Start here — authoritative orientation

### `CURRENT_PRODUCT_ROADMAP.md`

Shortest verified-production-versus-current-main-versus-next-work status map.

### `HANDOVER.md`

Detailed implementation handover and operational boundary notes.

### `PERFORMANCE_AND_READ_MODEL_PLAN.md`

Current performance/read-model guidance: dashboard-specific aggregate reads, exact Case detail reads, bounded libraries, lightweight timing instrumentation, structural before/after analysis, and intentionally deferred performance passes.

### `CURRENT_DESIGN.md`

Living product/design summary across Topic → Case → stimuli, Tags, Shared Questions, Collections, resolver, imports, Preview, and priorities.

### `V1_SPEC.md`

Current V1 behavior specification plus the next small V1 Admin increments.

### `V1_DATA_MODEL.md`

Authoritative implemented domain model, including Preview ownership, Image Collections, multi-Topic routing, stimulus groups, Tags, Shared Questions, Reusable Image Questions, Review snapshots/provenance, higher-resolution Asset supersession, and relationship-level Remove-from-Case state.

### `AUTHORING_MODEL.md`

Preferred administrator mental model and question-placement/reuse rules.

### `CONTENT_MODEL_EXAMPLES.md`

Concrete examples for stems, fixed/alternative stimuli, Study Topics, contextual questions, Tags, Shared Questions, Collections, and progressive Anki enrichment.

## Current subsystem contracts

### Admin/content management

- `ADMIN_CONTENT_MANAGEMENT_PLAN.md` — historical filename, current implemented Admin CMS contract and next Admin work.
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — current Case/Image Library authoring interaction contract, including the Compact fast-review surface in repository states that contain that implementation, exact image-linked Q&A, image strips, same-Case option Move, Remove from Case, and reusable-image management.
- `CASE_EDITOR_FAST_REVIEW_DESIGN.md` — Compact Case editor fast-review implementation/design contract: structural completeness summary, accessible `ⓘ` help, horizontal image strips, visible image-linked Prompt/Answer pairs, directly editable set-wide Q&A, final **All questions in this Case** audit, and hover/focus/tap source previews. The document explicitly separates repository implementation from production deployment.
- `IMAGE_MANAGEMENT_V2_PLAN.md` — deployed behavior record for pagination, selection, Collections, bounded bulk execution, option Move, and Preview isolation.
- `REUSABLE_IMAGE_QUESTIONS.md` — exact-Asset reusable question semantics, explicit Case/stimulus opt-in, resolver precedence, Review provenance, fixed-image conversion, and Preview restrictions.
- `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` — narrow same-image quality upgrade contract: new immutable Asset/R2 object, supersession lineage, current relationship transfer, reusable-question cloning, stable Stimulus Option IDs, historical Review media delivery, rollback, and Preview isolation.
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
- `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` — implemented local/offline human-review and deterministic-finalization contract. It freezes `review-map.json` v1, edits the real production-shaped manifest, supports fixed-image review/replacement and unresolved-question promotion/rejection, exports reviewed bundles, and finalizes production-compatible `manifest.json + media/` ZIPs. ChatGPT PPTX/PDF reconstruction/extraction remains a separate workflow.

### Preview Admin

- `PREVIEW_ADMIN_WORKSPACE.md` — current production-backed Preview ownership/isolation model.
- `PREVIEW_ADMIN_IDENTITY.md` — current role/identity bootstrap/promotion rules.
- `PREVIEW_DEPLOYMENT.md` — current Deploy PR / Restore Main operator playbook, including laptop-versus-mobile dispatch rules and the distinction between local `npm run preview` and remote production-backed Preview deployment.

### Cloudflare / operations / local development

- `CLOUDFLARE.md` — current Worker/D1/R2 migration/deployment/Preview runbook.
- `DEVELOPMENT_EXECUTION_WORKFLOW.md` — internal execution policy for laptop/local-first development versus mobile/ChatGPT+GitHub operation, including GitHub Actions minute conservation, local versus remote Preview semantics, and workflow-dispatch fallback rules.
- `LOCAL_DEVELOPMENT_REPLICA.md` — internal operational runbook for read-production/write-local D1/R2 developer replication, local Admin bootstrap, refresh and cleanup.
- `LOCAL_REAL_DATA_UX_WORKFLOW.md` — implemented design record for the local real-data workflow.
- `R2_COST_GUARDRAILS.md` — application-managed storage/write/delete guardrails; external provider pricing must be reverified before changing cost assumptions.
- `IMAGE_PROVENANCE.md` — current image naming/source/licence/runtime-serving rules.
- `PRODUCTION_CONTENT_SNAPSHOT.md` — read-only production-content snapshot plus fixed-purpose taxonomy-operator linkage.
- `OPEN_SOURCE_READINESS.md` — private-repository checklist for removing/redacting internal operational detail and verifying no secrets/production-derived data are present before publication.

## Current implementation tracking

### `IMPLEMENTATION_PLAN.md`

Milestone ledger. Keep production rollout/application status separate from merge status.

## Pending / forward designs

These are intentional future designs, **not current implemented behavior**.

- Optional Compact Case-editor **Review Focus** remains a follow-on idea only. It was explicitly not implemented by the first fast-review pass.
- The slide-ingestion **source reconstruction/extraction** step remains separate future workflow work even though the local reviewer/finalizer is implemented; do not infer that PPTX/PDF ingestion is automated from the existence of the local review tool.
- The narrow higher-resolution replacement workflow does not imply generic Asset families, arbitrary version history, automatic visual similarity, different-image substitution, or bulk replacement.

If pending work is later implemented, its design document must be converted from future/acceptance language into an operational/current record and the project roadmap/handover updated where appropriate.

## Historical / superseded records

### `PROPOSED_TAGGING_MODEL.md`

Historical proposal superseded by `TAGGING_MODEL_DECISIONS.md`. Stage A/B are already implemented.

### `PARALLEL_WORK_PLAN.md`

Historical record of the completed PR #11/#12/#13 parallel Admin-library phase plus reusable parallel-work lessons.

### `agent-tasks/`

Historical implementation prompts for completed PR work. The directory README prevents them being treated as backlog.

## Implemented records with useful rollout history

These files may retain short historical rollout notes because they explain safety decisions, but their current behavior/status headers are authoritative only for the repository/deployment state they explicitly claim:

- `STIMULUS_GROUPS_DESIGN.md`;
- `MULTI_TOPIC_STUDY_ROUTES.md`;
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`;
- `CASE_EDITOR_FAST_REVIEW_DESIGN.md`;
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
4. Convert `planned` / `draft` / `for review` language to implemented records after implementation, and to deployed records only after deployment is explicitly verified.
5. Keep migration presence, migration application, and Worker deployment as separate explicitly verified facts.
6. Preserve historical decision records but label them clearly.
7. Record production content migrations with exact accounting/verification.
8. Keep terminology consistent: Topic, Case, Tag, Asset, Collection, Question Prompt, Shared Question, Reusable Image Question.
9. Do not call a pending design implemented merely because the design doc exists.
10. Before editing project-wide status, compare documentation with current code, migrations, merged PR state, and explicitly verified production state.
