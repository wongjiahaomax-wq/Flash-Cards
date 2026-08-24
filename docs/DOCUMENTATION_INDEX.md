# Flash-Cards Documentation Index

_Last reviewed: 24 August 2026_

This index identifies which repository documents describe the **explicitly verified production baseline**, which describe **current `main`**, which are subsystem contracts/runbooks, which are pending designs, and which are historical records.

Repository-wide coding-agent safety rules live in root `AGENTS.md`. Coding agents should use `AGENT_TASK_MAP.md` to select the minimum current context and the correct execution/validation mode before loading broader documentation. Repository-wide structural direction for substantial refactors and new/extracted application modules lives in `ENGINEERING_ARCHITECTURE_GUIDELINES.md`.

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

Current `main` is ahead of that verified production baseline. In addition to PR #53–#59, later merged work includes:

- PR #61 — targeted Admin dashboard/Case-detail read models and timing;
- PR #62 — distinct **Remove from Case** archival semantics for alternative-image options (`0012`);
- PR #63 — Image Library **Current / Historical only / Unused** lifecycle views plus Review-Asset lookup index (`0013`);
- PR #64 — bounded 60-row Admin Case and Question libraries with SQL filtering/counting;
- PR #66 — combined `admin,preview_admin` owners may use production Study while Preview-only identities and the Preview Worker remain blocked;
- PR #68 — stable Case-question save anchors/scroll return;
- PR #69 — browser-local Classic/Compact Case-editor layout preference and responsive Compact authoring;
- PR #72 — Compact Case-editor fast-review surfaces and **All questions in this Case** audit;
- PR #73 — production/Preview mutation-boundary hardening and single repository-pinned Wrangler authority;
- PR #75–#77 — coding-agent/local validation foundations, reliable local preview launchers, and changed-file validation intelligence;
- PR #78 — behavior-preserving Case-editor component decomposition;
- PR #79 — capability-based Local / Remote GitHub / Hybrid agent execution guidance;
- PR #80 — Preview-workspace Session/ownership/error/input foundation extraction;
- PR #82 — Preview Case lifecycle/cloning extraction;
- PR #83 — Preview fixed Case-image operation extraction.

Current repository migrations extend through:

```text
0013_review_assets_asset_lookup.sql
```

Their presence on `main` is a repository/schema fact. Do **not** infer that a migration is applied to production, or that corresponding Worker behavior is deployed, without explicit rollout verification.

The repository contains an explicit production rollout trigger commit for merged PR #56. A trigger commit alone is not proof that the workflow completed successfully.

## Start here — authoritative orientation

### `CURRENT_PRODUCT_ROADMAP.md`

Shortest verified-production-versus-current-main-versus-next-work status map.

### `HANDOVER.md`

Current implementation handover: merged milestones, migration boundary, Case editor, Preview decomposition, performance work, image lifecycle/replacement, developer workflow, and next sequence.

### `CURRENT_DESIGN.md`

Living product/design summary across Topic → Case → stimuli, Tags, Shared Questions, Reusable Image Questions, lifecycle/archive semantics, Review provenance, imports, Preview, and current priorities.

### `V1_SPEC.md`

Current V1 behavior specification. Learner-account administration and basic learner-progress administration remain the next small Admin capabilities rather than existing baseline features.

### `V1_DATA_MODEL.md`

Authoritative implemented domain model, including Preview ownership, Image Collections, multi-Topic routing, Tags, Shared Questions, Reusable Image Questions, alternative-option archival, Review snapshots/provenance, Asset supersession, and the current migration ledger.

### `AUTHORING_MODEL.md`

Preferred administrator mental model and question-placement/reuse rules.

### `CONTENT_MODEL_EXAMPLES.md`

Concrete examples for stems, fixed/alternative stimuli, Study Topics, contextual questions, Tags, Shared Questions, Reusable Image Questions, and progressive enrichment.

### `AGENT_TASK_MAP.md`

Small coding-agent routing guide: maps common task categories to scoped guidance, minimum authoritative documents, execution-mode selection, repository-owned validation commands, and current Preview backend ownership boundaries.

### `ENGINEERING_ARCHITECTURE_GUIDELINES.md`

Authoritative repository-wide engineering direction for substantial structural work: modular-monolith dependency flow, incremental TypeScript adoption, cohesive module ownership, thin routes, purpose-specific reads/mutations, security and transaction boundaries, characterization testing, abstraction discipline, staged facades, and scope control. These are directional defaults rather than a requirement to refactor every touched area.

### `PERFORMANCE_AND_READ_MODEL_PLAN.md`

Current performance/read-model guidance: dashboard-specific aggregate reads, exact Case-detail reads, bounded Case/Question libraries, timing instrumentation, structural before/after analysis, and intentionally deferred passes.

## Current subsystem contracts

### Admin/content management

- `ADMIN_CONTENT_MANAGEMENT_PLAN.md` — historical filename, current implemented Admin CMS contract and next Admin work.
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — current Case/Image Library authoring interaction contract, including exact-image scope, Reusable Image Questions, alternative-option removal, lifecycle cleanup semantics, and higher-resolution replacement.
- `CASE_EDITOR_FAST_REVIEW_DESIGN.md` — Compact fast-review implementation/design record from PR #72. `Review focus` remains optional follow-on work.
- `IMAGE_MANAGEMENT_V2_PLAN.md` — scalable Image Library/Collections/bulk-selection behavior record. Read alongside lifecycle semantics in `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` and `V1_DATA_MODEL.md`.
- `REUSABLE_IMAGE_QUESTIONS.md` — exact-Asset reusable question semantics, explicit per-stimulus opt-in, resolver precedence, Review provenance, fixed-image conversion, and Preview restrictions.
- `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` — narrow same-image quality-upgrade contract: immutable new Asset/R2 object, supersession lineage, relationship transfer, reusable-question cloning, stable Stimulus Option IDs, historical Review media delivery, rollback, and Preview isolation.
- `PERFORMANCE_AND_READ_MODEL_PLAN.md` — Admin/read-path rule: query only page-required data, filter/bound in SQL, keep list/detail/dashboard reads distinct, and measure before caching/index tuning.

The Case editor implementation is no longer one monolithic route. `src/routes/admin/cases/[caseId]/+page.svelte` remains the cross-section/server-data coordinator and delegates domain sections to `src/lib/components/case-editor/`. Preview Admin continues to reuse this Production editor surface.

### Topics / multi-Topic routing

- `MULTI_TOPIC_STUDY_ROUTES.md` — implemented multi-Topic learner/Admin routing and Review provenance.
- `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md` — fixed-purpose production taxonomy operator/runbook; never a generic taxonomy API.

### Tags / Shared Questions

- `TAGGING_MODEL_DECISIONS.md` — authoritative Tag/Shared Question architecture decisions.
- `STAGE_A_TAG_FOUNDATION.md` — implemented Stage A foundation.
- `TAGGING_STAGE_B_BEHAVIOR.md` — deployed Stage B eligibility, precedence, Admin authoring, and Review provenance.

### Stimulus behavior

- `STIMULUS_GROUPS_DESIGN.md` — implemented optional stimulus groups, contextual questions, coverage, and resolver/count-mode interaction.
- `V1_DATA_MODEL.md` / `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — current `removed_from_case` option-archive semantics. **Deactivate** and **Remove from Case** are intentionally different states.

### Reviewed imports / Anki / slide review

- `CONTENT_IMPORT_PACKAGES.md` — production-validated Import Package v1 and resumable job contract.
- `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` — lease/R2/checkpoint/runtime safety invariants.
- `ANKI_APKG_EXTRACTION.md` — verified source-recovery workflow outside the production app.
- `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` — canonical ECG migration record including production completion.
- `ECG_ANKI_INGESTION_RULES.md` — adopted naming/content rules and completed Batch 01 rename audit.
- `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` — implemented local/offline human-review and deterministic-finalization contract. It edits the real production-shaped manifest, supports fixed-image review/replacement and unresolved-question promotion/rejection, and finalizes production-compatible `manifest.json + media/` ZIPs. **PPTX/PDF semantic reconstruction remains a separate upstream workflow.**

### Preview Admin

- `PREVIEW_ADMIN_WORKSPACE.md` — current production-backed Preview ownership/isolation model and internal backend responsibility map.
- `PREVIEW_ADMIN_IDENTITY.md` — current role/identity bootstrap/promotion rules.
- `PREVIEW_DEPLOYMENT.md` — current Deploy PR / Restore Main operator playbook and distinction between local `npm run preview` and remote production-backed Preview deployment.

Current Preview DB ownership is intentionally staged behind the stable public façade `src/lib/server/db/preview-workspace.js`:

```text
preview-workspace/session.js      → Session lookup/create/TTL
preview-workspace/ownership.js    → ownership/security guards
preview-workspace/errors.js       → PreviewWorkspaceError
preview-workspace/input.js        → shared input/time normalization
preview-workspace/case.js         → Case discovery, clone transaction, Case lifecycle/Topics
preview-workspace/fixed-images.js → ongoing fixed-image reads/mutations
```

Alternative Set and question-domain operations plus workspace-wide cleanup orchestration remain in the façade pending later focused extraction. Caller imports should continue through the façade unless an internal module is being deliberately modified.

### Cloudflare / operations / local development

- `CLOUDFLARE.md` — current Worker/D1/R2 migration/deployment/Preview runbook.
- `DEVELOPMENT_EXECUTION_WORKFLOW.md` — capability-based Local checkout, Remote GitHub, and Hybrid execution policy; GitHub Actions minute conservation; validation evidence rules; local versus remote Preview semantics.
- `LOCAL_DEVELOPMENT_REPLICA.md` — internal read-production/write-local D1/R2 developer-replica runbook.
- `LOCAL_REAL_DATA_UX_WORKFLOW.md` — implemented design record for the local real-data workflow; operational details live in `LOCAL_DEVELOPMENT_REPLICA.md`.
- `R2_COST_GUARDRAILS.md` — application-managed storage/write/delete guardrails; external provider pricing must be reverified before changing cost assumptions.
- `IMAGE_PROVENANCE.md` — image naming/source/licence/runtime-serving rules.
- `PRODUCTION_CONTENT_SNAPSHOT.md` — read-only production-content snapshot plus fixed-purpose taxonomy-operator linkage.
- `OPEN_SOURCE_READINESS.md` — private-repository publication-cleanup checklist.

`npm run dev` and `npm run preview` now route through repository-owned local launchers that use repository-local Wrangler/XDG state. `npm run local:stop` safely stops only this checkout's repository-installed Vite/Wrangler local server process trees and is the preferred cleanup before switching runtime modes or a Windows `npm ci`; it must not be replaced with broad Node-process termination. `npm run preview` remains production-style **local** verification, not deployment of the production-backed Preview Worker.

## Current implementation tracking

### `IMPLEMENTATION_PLAN.md`

Milestone ledger current through the latest merged product/tooling/refactor baseline. Deployment/application state remains separate from merge status.

## Pending / forward designs

These are intentional future directions, **not current implemented behavior**:

- the optional `Review focus` concept in `CASE_EDITOR_FAST_REVIEW_DESIGN.md`;
- remaining Preview-workspace extraction for Alternative Sets, question-domain operations, and final façade/cleanup ownership;
- performance Pass 3 Better Auth session-cache investigation;
- performance Pass 4 learner Study/`startReview` read-model optimisation;
- performance Pass 5 Case-editor **server read/lazy-loading boundaries**. PR #78 decomposed the Svelte UI but did not itself implement lazy server reads;
- permanent Asset/R2 deletion. Current lifecycle filters identify candidates but do not physically delete media;
- generic Asset families/version history, automatic visual same-image detection, different-image substitution, and bulk replacement;
- PPTX/PDF semantic source reconstruction automation inside the local slide-review tool. The reviewer/finalizer is implemented; semantic reconstruction remains separate.

When pending work becomes implemented, convert future/acceptance wording into a current behavior/runbook and update the roadmap/handover in the same documentation pass.

## Historical / superseded records

### `PROPOSED_TAGGING_MODEL.md`

Historical proposal superseded by `TAGGING_MODEL_DECISIONS.md`. Stage A/B are implemented.

### `PARALLEL_WORK_PLAN.md`

Historical record of the completed PR #11/#12/#13 parallel Admin-library phase plus reusable parallel-work lessons.

### `agent-tasks/`

Historical implementation prompts for completed work. The directory README prevents them being treated as backlog.

## Current next product sequence

```text
curate real ECG Case Tags
→ promote genuinely reusable knowledge into Shared Questions / Reusable Image Questions where scope is proven
→ add useful alternate Study Topics/stimuli
→ observe real Admin/learner friction
→ continue targeted modularity/performance work where evidence justifies it
→ implement learner-account administration
→ implement basic learner-progress administration
```

Do not expand schema/taxonomy merely for conceptual completeness.

## Documentation maintenance rules

For future PRs:

1. Update the relevant subsystem behavior document in the same PR when behavior changes.
2. Update `V1_DATA_MODEL.md` in the same PR when schema/relationship semantics change.
3. Update `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` when a milestone is merged/deployed or materially changes priorities.
4. Convert `planned` / `draft` / `for review` language to implemented records after merge, and to deployed records only after deployment is explicitly verified.
5. Keep migration presence, production migration application, Worker deployment, and behavior verification as separate facts.
6. Preserve historical decision records but label them clearly.
7. Record production content migrations with exact accounting/verification.
8. Keep terminology consistent: Topic, Case, Tag, Asset, Collection, Question Prompt, Shared Question, Reusable Image Question.
9. Do not call a pending design implemented merely because the design document exists.
10. Before editing project-wide status, compare documentation with current code, migrations, merged PR state, and explicitly verified production state.
11. Behavior-preserving refactors should update ownership/routing documentation when they materially change where future agents should work, even when user-visible behavior is unchanged.