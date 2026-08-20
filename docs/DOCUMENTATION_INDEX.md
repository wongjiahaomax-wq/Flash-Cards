# Flash-Cards Documentation Index

_Last reviewed: 20 August 2026_

This file identifies which repository documents describe the **current deployed product**, which are subsystem contracts/runbooks, which are pending designs, and which are historical records.

## Conflict rule

When documentation appears to disagree, use this order:

1. current code and explicitly verified applied migrations/deployments;
2. `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` for merged/deployed status;
3. `V1_DATA_MODEL.md` plus the relevant current subsystem behavior document for exact semantics;
4. `CURRENT_DESIGN.md`, `V1_SPEC.md`, and `AUTHORING_MODEL.md` for the product mental model;
5. pending designs only for future intent;
6. historical plans/proposals only for decision context.

An old PR instruction, draft rollout note, or agent task is never authority over current `main`.

## Current production baseline

As of 18 August 2026 the deployed/current baseline includes:

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

Repository developer tooling now also includes the production-like local D1/R2 replica workflow documented in `LOCAL_DEVELOPMENT_REPLICA.md`. This is not a deployed learner/Admin feature.

The local slide-review/finalizer tooling is repository tooling and is not a deployed production-application feature. Its implementation is tracked by draft PR #53 until merged.

Reusable Image Questions are implemented on the current feature branch and documented in `REUSABLE_IMAGE_QUESTIONS.md`; until that PR is merged/deployed, treat that document as the authoritative contract for the pending feature rather than as deployed production behavior.

## Start here — authoritative orientation

### `CURRENT_PRODUCT_ROADMAP.md`

Shortest merged/deployed-versus-next-work status map.

### `HANDOVER.md`

Detailed implementation handover: migrations, Preview boundaries, Stage B, Image Management V2, ECG migration verification, and next sequence.

### `CURRENT_DESIGN.md`

Living product/design summary across Topic → Case → stimuli, Tags, Shared Questions, Collections, resolver, imports, Preview, and priorities.

### `V1_SPEC.md`

Current shipped V1 behavior specification plus the next small V1 Admin increments.

### `V1_DATA_MODEL.md`

Authoritative implemented domain model, including Preview ownership, Image Collections, multi-Topic routing, stimulus groups, Tags, Shared Questions, import jobs, and Review snapshots/provenance.

### `AUTHORING_MODEL.md`

Preferred administrator mental model and question-placement/reuse rules.

### `CONTENT_MODEL_EXAMPLES.md`

Concrete examples for stems, fixed/alternative stimuli, Study Topics, contextual questions, Tags, Shared Questions, Collections, and progressive Anki enrichment.

## Current subsystem contracts

### Admin/content management

- `ADMIN_CONTENT_MANAGEMENT_PLAN.md` — historical filename, current implemented Admin CMS contract and next Admin work.
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — current Case/Image Library authoring interaction contract.
- `IMAGE_MANAGEMENT_V2_PLAN.md` — deployed behavior record for pagination, selection, Collections, bounded bulk execution, option Move, and Preview isolation.
- `REUSABLE_IMAGE_QUESTIONS.md` — exact-Asset reusable question semantics, explicit Case/stimulus opt-in, resolver precedence, Review provenance, fixed-image conversion, and Preview restrictions for the reusable-image feature branch.

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
- `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` — implemented local/offline human-review and deterministic-finalization contract in draft PR #53. It freezes `review-map.json` v1, edits the real production-shaped manifest, supports fixed-image review/replacement and unresolved-question promotion/rejection, exports reviewed bundles, and finalizes production-compatible `manifest.json + media/` ZIPs. **ChatGPT PPTX/PDF reconstruction/extraction remains a separate workflow and is not implemented by the local tool.**

### Preview Admin

- `PREVIEW_ADMIN_WORKSPACE.md` — current production-backed Preview ownership/isolation model.
- `PREVIEW_ADMIN_IDENTITY.md` — current role/identity bootstrap/promotion rules.
- `PREVIEW_DEPLOYMENT.md` — current Deploy PR / Restore Main operator playbook.

### Cloudflare / operations / local development

- `CLOUDFLARE.md` — current Worker/D1/R2 migration/deployment/Preview runbook.
- `LOCAL_DEVELOPMENT_REPLICA.md` — **internal operational runbook** for read-production/write-local D1/R2 developer replication, local Admin bootstrap, refresh and cleanup.
- `LOCAL_REAL_DATA_UX_WORKFLOW.md` — implemented design record for the local real-data workflow; operational details live in `LOCAL_DEVELOPMENT_REPLICA.md`.
- `R2_COST_GUARDRAILS.md` — application-managed storage/write/delete guardrails; external provider pricing must be reverified before changing cost assumptions.
- `IMAGE_PROVENANCE.md` — current image naming/source/licence/runtime-serving rules.
- `PRODUCTION_CONTENT_SNAPSHOT.md` — read-only production-content snapshot plus fixed-purpose taxonomy-operator linkage.
- `OPEN_SOURCE_READINESS.md` — private-repository checklist for removing/redacting internal operational detail and verifying no secrets/production-derived data are present before publication.

## Current implementation tracking

### `IMPLEMENTATION_PLAN.md`

Milestone ledger current through deployed Tagging Stage B and completed initial ECG migration.

## Pending / forward designs

These are intentional future designs, **not current implemented behavior**.

The slide-ingestion **source reconstruction/extraction** step remains separate future workflow work even after the local reviewer/finalizer lands; do not infer that PPTX/PDF ingestion is automated from the existence of the local review tool.

Higher-resolution Asset replacement/versioning remains separate from Reusable Image Questions. Do not infer Asset identity families, version history, or automatic transfer of reusable questions to replacement Assets from this feature.

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
4. Convert `planned` / `draft` / `for review` language to implemented/deployed records after rollout.
5. Keep migration application and Worker deployment as separate explicitly verified facts.
6. Preserve historical decision records but label them clearly.
7. Record production content migrations with exact accounting/verification.
8. Keep terminology consistent: Topic, Case, Tag, Asset, Collection, Question Prompt, Shared Question, Reusable Image Question.
9. Do not call a pending design implemented merely because the design doc exists.
10. Before editing project-wide status, compare documentation with current code, migrations, merged PR state, and explicitly verified production state.
