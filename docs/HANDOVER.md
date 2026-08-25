# Flash-Cards agent handover

_Refreshed: 25 August 2026_

## Current outcome

Flash-Cards is a working private case-based medical learning application with:

- D1-backed learner Study/Review persistence;
- protected private R2 teaching images and historical Review-media snapshots;
- Better Auth production/Preview role boundaries;
- Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags, and imports;
- learner-selectable **Original questions** versus **Expanded Learning** Review modes;
- contextual **System → Topic / Tag / All** learner navigation merged behind rollout control;
- current Case classification of exactly one behaviorally active **Primary Topic** plus zero or more **Case Tags**;
- fixed images plus optional Alternative Sets;
- whole-Case, set-wide, exact-image, tag-shared, Topic, and Reusable Image Questions;
- Tagging Stage A/B;
- Image Management V2 and lifecycle cleanup views;
- production-backed Preview Admin retained as a legacy/safety-sensitive subsystem;
- strict reviewed/resumable imports;
- local production-like D1/R2 development replica;
- local slide-review/deterministic-finalizer tooling;
- bounded Admin read models;
- repository-owned coding-agent/validation workflow including repository-scoped `npm run local:stop`;
- a fully imported and production-verified first ECG corpus: **66/66 source notes represented**.

Current `main` is at least through merged PR #90. The Case editor has been decomposed into focused components, and the Preview backend has been decomposed through Session/ownership foundations, Case lifecycle/cloning, and fixed-image operations without intentionally changing product behavior.

As of 25 August 2026, the deployed `/preview-admin` workflow is no longer part of the normal development/testing path. The primary workflow is the local clone with the production-like local D1/R2 replica, `npm run dev`, local `npm run preview`, repository validation, and GitHub CI. Further Preview backend decomposition is intentionally paused after PR #83; draft PR #91 was closed unmerged.

## Status boundary: production versus current `main`

Do not collapse these facts:

```text
merged on main
≠ migration applied to production D1
≠ Worker deployed
≠ behavior explicitly verified in production
```

The recorded verified production baseline includes learner/Admin/Preview/Image Management V2/Tagging Stage B and the complete ECG import. Current `main` contains later features/migrations/refactors that must not be called deployed/applied without separate evidence.

Current repository migrations extend through:

```text
0015_contextual_system_topic_tag_navigation.sql
```

Important recent migrations are:

```text
0014_review_question_pool_mode.sql
→ Review-level Original/Core versus Expanded question-pool provenance

0015_contextual_system_topic_tag_navigation.sql
→ System/Topic taxonomy, System↔Tag exposure, and System-route Review provenance
```

PR #90 intentionally adds no `0016` migration. Legacy secondary `case_concepts` rows may remain physically stored, but current authoring/read models/learner routing ignore them and current mutation/import/clone paths do not create new secondary relationships.

A migration file being present is not proof that it has been applied to production. The same distinction applies to Worker deployment, taxonomy curation, learner rollout flags, and live behavior verification.

## Read first

For project-wide work:

```text
docs/DOCUMENTATION_INDEX.md
docs/CURRENT_PRODUCT_ROADMAP.md
docs/CURRENT_DESIGN.md
docs/V1_SPEC.md
docs/V1_DATA_MODEL.md
docs/AUTHORING_MODEL.md
```

For coding-agent execution:

```text
AGENTS.md
docs/AGENT_TASK_MAP.md
docs/DEVELOPMENT_EXECUTION_WORKFLOW.md
nearest scoped AGENTS.md
```

For subsystem work, use the task map rather than loading the entire documentation corpus.

## Recent merged milestone sequence

Important recent `main` history includes:

- PR #53 — local/offline slide reviewer + deterministic finalizer;
- PR #54 — Case-editor Topic management/inline Topic creation;
- PR #55 — production-like local D1/R2 replica;
- PR #56/#57 — exact-image question authoring and author-facing whole-Case vs exact-stimulus scope;
- PR #58 — Reusable Image Questions;
- PR #59 — same-image higher-resolution Asset replacement;
- PR #61 — Performance Read-Model Pass 1;
- PR #62 — alternative option **Remove from Case** archival semantics;
- PR #63 — Image Library Current/Historical only/Unused lifecycle views;
- PR #64 — Performance Read-Model Pass 2 for Case/Question libraries;
- PR #66 — combined owner role may use production Study;
- PR #68 — Case-question exact save anchors/scroll return;
- PR #69 — responsive Classic/Compact Case-editor preference;
- PR #72 — Compact fast-review redesign;
- PR #73 — production/Preview mutation-boundary and Wrangler-runtime hardening;
- PR #75–#77 — coding-agent DX, local preview reliability, validation intelligence;
- PR #78 — behavior-preserving Admin Case-editor component decomposition;
- PR #79 — capability-based Local/Remote GitHub/Hybrid agent workflow;
- PR #80 — Preview workspace foundation extraction;
- PR #82 — Preview Case lifecycle/cloning extraction;
- PR #83 — Preview fixed Case-image operation extraction;
- PR #87 — learner-selectable **Original questions** / **Expanded Learning** with persisted Review mode provenance;
- PR #88 — contextual **System → Topic / Tag / All** navigation, System↔Tag exposure, and selected/effective route provenance;
- PR #89 — safe repository-scoped `npm run local:stop` plus aligned local-development/agent guidance;
- PR #90 — current **Primary Topic + Case Tags** behavior replacing Additional Study Topics in active product behavior, with no new migration.

PR #91 was a draft attempt at the next Preview Alternative Set/stimulus extraction. It was intentionally closed unmerged on 25 August 2026 after the project moved to a local-first testing workflow. Do not resume it as unfinished required work.

## Product/content model

The current authoring hierarchy is:

```text
System
└── Topic
    └── Case
        ├── Case Tags
        ├── fixed Assets
        ├── Alternative Sets
        │   └── Stimulus Options
        └── contextual questions
```

A Case has one behaviorally active Primary Topic plus zero or more Case Tags. Legacy secondary `case_concepts` rows may still exist physically but are not current authoring/learner behavior.

System is the learner-navigation grouping. Topic is the Case's canonical educational classification. Tags are flat cross-cutting classification/contextual discovery. System↔Tag exposure determines where a Tag may appear contextually; it does not change the Case's direct Topic-question context.

Global reusable knowledge is separate:

```text
Shared Question
→ Prompt + reusable answer + one Reuse Scope Tag

Reusable Image Question
→ exact Asset + Prompt + canonical Asset-specific answer
→ explicit opt-in per exact stimulus usage
```

`question_prompts` stores wording only.

## Original questions / Expanded Learning

New Reviews require an explicit question-pool mode:

```text
Original questions (`core`)
→ Case-owned sources only: case, stimulus_group, stimulus_option

Expanded Learning (`expanded`)
→ full eligible resolver including reusable Topic/ancestor/Tag/Image sources
```

Eligibility is selected before duplicate-Prompt precedence/deduplication. The selected mode is snapshotted on the Review.

Study defaults the selector to Original questions. Ordinary Next Case requires a fresh Original/Expanded choice rather than inheriting the completed Review's mode. A completed Original Review may explicitly continue into a new Expanded Review for the same Case.

## Current question precedence

Current-main duplicate-Prompt precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for selected option
> stimulus group
> Case
> exact Primary Topic
> tag-shared Question
> nearest inheritable ancestor Topic
> more distant ancestors
```

The final candidate set is deduplicated by `question_prompt_id` before Automatic/All/Fixed selection.

A cross-group invariant prevents the same Prompt becoming independently stimulus-specific in two active groups that can both be selected in one Review.

## Current Case authoring mental model

Ordinary scope choice is:

```text
Applies to this whole Case
Applies to a specific image / stimulus
```

A fixed image targeted for exact-image teaching may be atomically converted into a one-option active Stimulus Group while preserving Asset identity and Case caption.

Image cards distinguish:

```text
Case-specific Image Questions
Reusable Image Questions
```

Reusable Image Questions never auto-propagate merely because the same Asset is reused elsewhere.

Case classification controls are:

```text
Primary Topic
+ Case Tags
```

Additional Study Topic controls are retired. Global Tag rename/deactivation and System↔Tag exposure remain global taxonomy operations rather than Case-editor side effects.

## Case editor implementation ownership

PR #78 removed the previous single ~70 KB route as the primary implementation surface.

The route:

```text
src/routes/admin/cases/[caseId]/+page.svelte
```

is now the cross-section/server-data coordinator.

Focused components live under:

```text
src/lib/components/case-editor/
├── CaseEditorHeader.svelte
├── CaseEditorNavigation.svelte
├── CaseTopicsSection.svelte
├── CaseDetailsSection.svelte
├── CaseImagesSection.svelte
├── CaseQuestionsSection.svelte
├── CaseImagePickerDialog.svelte
└── CasePreviewSection.svelte
```

Future Case-authoring work should normally start with the owning component plus directly relevant server/helpers/tests. Do not re-monolithize the route or duplicate a Preview editor.

Preview Admin still renders the production editor surface while the legacy subsystem remains present. `test/admin-editor-preview-contract.test.js` protects shared actions/data contracts across the route + components.

## Classic/Compact and fast-review behavior

The browser-local layout preference supports Classic and Compact, defaulting safely to Compact if storage cannot be used.

Compact mode adds:

- structural completeness summary;
- responsive/sticky navigation;
- horizontal image strips for multi-image content;
- visible current Prompt/Answer content for Case-specific, used reusable-image, and set-wide questions;
- **All questions in this Case** audit;
- exact image/set source indicators with hover/focus/tap previews;
- deterministic structural ordering.

Classic remains the previous presentation. No global question order or learner behavior is created by Compact mode.

## Alternative option lifecycle

Three different operations must remain distinct:

```text
Deactivate option
→ retain normal authoring relationship, exclude from learner selection.

Remove from Case
→ set removed_from_case; hide from current authoring/selection while retaining identity/history.

Delete Asset
→ not implemented as a routine workflow.
```

A removed option preserves Asset/R2 identity, exact-option questions, reusable relationships, and Review provenance. Re-adding the same Asset to its original set may restore the archived option when validation permits.

## Image Library lifecycle

Asset Active/Inactive status is independent from derived usage:

- **Current** — active Asset participates in active production Case content;
- **Historical only** — no current use, but retained Case/option relationship, Review snapshot, Reusable Image Question, or supersession lineage still requires provenance;
- **Unused** — neither current use nor retained historical/provenance dependency.

Preview relationships do not affect production classification.

Lifecycle filters support conservative cleanup decisions; they do not physically delete R2 objects/Asset rows.

## Higher-resolution Asset replacement

Use **Replace with higher-resolution version** only for the same underlying image at better quality/resolution.

Successful A → B replacement:

```text
upload new immutable R2 object
create new Asset B
move current production fixed/option relationships A → B
preserve Stimulus Option IDs, group membership, order, captions
clone A Asset Questions to B and remap current opt-ins
mark A inactive + superseded_by_asset_id = B.id
retain old Asset Questions + old R2 bytes for historical provenance
```

A different image showing the same diagnosis remains a separate Asset.

Review historical media is served from `review_assets.storage_key_snapshot` through an authenticated Review-owned route. Existing Reviews are never rewritten.

A live Preview workspace referencing A blocks replacement; Preview relationships are never silently migrated while Preview ownership remains implemented.

## Performance/read-model state

### Pass 1 — merged

- `/admin` uses aggregate counts + bounded work queue;
- Case detail uses exact active production Case-by-ID rather than loading the Case library;
- lightweight timing instrumentation exists.

### Pass 2 — merged

- `/admin/cases` uses 60-row SQL-filtered/count pages + visible-ID enrichment;
- `/admin/questions` uses 60-row bounded pages and bounded SQL-prefiltered candidate verification for Unicode-aware search;
- production/Preview isolation remains explicit.

Remaining planned work:

```text
Pass 3 — Better Auth short-lived session cookie-cache investigation
Pass 4 — learner Study/startReview read-model optimisation
Pass 5 — Case-editor server read/lazy-loading boundaries
Later  — thumbnails + measured EXPLAIN/index tuning
```

PR #78 improved UI implementation boundaries but did **not** implement Pass 5 server-side lazy reads.

## Preview backend ownership after PR #80/#82/#83

Public callers stay on:

```text
src/lib/server/db/preview-workspace.js
```

Current internal responsibility map:

```text
preview-workspace/errors.js
→ PreviewWorkspaceError

preview-workspace/input.js
→ normalization/time primitives

preview-workspace/session.js
→ Session lookup/create/reuse/TTL

preview-workspace/ownership.js
→ ownership/security guards

preview-workspace/case.js
→ production Case discovery/search
→ complete Case clone transaction
→ Preview Case list + metadata/vignette/question-selection
→ Primary Topic mutation and deprecated secondary-Topic compatibility handling

preview-workspace/fixed-images.js
→ ongoing fixed-image editor reads
→ single/bounded bulk attach
→ caption update
→ detach + display-order normalization
→ reorder
```

Important transaction boundary: clone-time fixed `case_assets` copying remains in `case.js` because the complete Case clone is one semantic transaction.

Still in the façade:

- `ensurePreviewWorkspace()` and workspace cleanup;
- Alternative Set/stimulus operations;
- fixed → Alternative Set conversion/orchestration;
- Case/group/option question operations;
- scope/reusable-question operations;
- composed editor loading.

These remaining façade responsibilities are now an **accepted legacy boundary**, not a required staged-refactor queue.

Do not continue the former sequence:

```text
Alternative Set extraction
→ question/scope/reusable-question extraction
→ final façade/cleanup ownership review
```

unless active Preview maintenance resumes and there is a concrete risk/cost benefit. Existing security and ownership contracts must remain intact while Preview remains in the repository.

## Preview security invariants

- Preview Worker `/admin/**` blocked;
- Preview Worker `/study/**` blocked;
- Preview Auth Admin API blocked;
- production assets may be reused read-only into owned Preview Case relationships where allowed;
- Preview cannot mutate production Asset metadata/Collections/R2/supersession;
- Shared Questions and Reusable Image Questions remain production-global;
- higher-resolution replacement remains production-only;
- combined `admin,preview_admin` owner may use production Study; Preview-only identity may not.

These invariants still matter even though the remote Preview surface is no longer routinely used.

## Developer/coding-agent workflow

Execution mode is capability-based, not inferred from device:

```text
usable checkout + commands → Local checkout mode
GitHub access without local execution → Remote GitHub mode
both → Hybrid mode
```

When local execution is available, repository-owned commands are:

```text
npm run agent:doctor
npm run agent:checks
npm run validate:fast
npm run validate:full
```

`agent:checks` classifies the changed subsystem and surfaces specialized requirements such as `runtime:smoke` or slide-review build/test.

Remote GitHub sessions must report GitHub CI/check evidence separately from commands they did not execute locally.

## Local development and local preview — primary workflow

`npm run dev` and `npm run preview` use deterministic Node launchers, repository-installed Vite/Wrangler, and child-scoped repository-local XDG/Wrangler state.

`npm run preview` performs production-style **local** verification with local D1 migrations and localhost Better Auth configuration. It does not deploy the remote Preview Worker or refresh production-derived local content automatically.

The local replica is the normal application development path:

```text
Production D1/R2 -- fixed read-only refresh --> local D1/R2
local app writes ---------------------------> local D1/R2 only
```

Typical iteration:

```text
npm run local:refresh   # when fresh production-derived content is needed
npm run dev             # hot-reload development
npm run local:stop
npm run preview         # production-style local runtime verification
repository-defined validation / GitHub CI
```

`npm run local:stop` is the safe checkout-scoped cleanup command for the repository's Vite/Wrangler process trees. Prefer it before switching between `dev` and `preview` and instead of broad machine-wide Node termination.

The remote `/preview-admin` Worker is no longer the default integration gate.

## Future Preview decommissioning

Stopping the refactor does not authorize casual deletion of Preview code.

If remote Preview is permanently retired, first create a dedicated decommissioning assessment covering:

- `/preview-admin` routes and shared editor contracts;
- Preview auth roles/session boundaries;
- `preview_sessions` and Preview-owned rows;
- production filtering of Preview-owned Cases/Prompts/Assets;
- Preview R2 cleanup/prefixes;
- production Asset replacement checks involving live Preview references;
- bootstrap/deploy/restore workflows;
- Preview-specific tests and documentation;
- safe handling of any extant Preview-owned production data.

Do not mix that removal into unrelated feature or refactor work.

## Reviewed slide workflow

The local slide reviewer/finalizer is implemented. It consumes a review bundle containing the actual production-shaped `manifest.json`, media, review metadata, and source previews; humans edit/approve that content; deterministic finalization emits the strict production ZIP.

Semantic PPTX/PDF source reconstruction remains a separate upstream AI/human process. The reviewer is not an OCR/source-understanding engine.

## ECG migration status

Production verification records:

```text
13 Batch 01 imported Cases/ECGs
51 Batch 02 imported Cases/ECGs
 2 pre-existing mapped calcium Cases
--
66 / 66 source notes represented
```

Initial ingestion is complete. Ongoing work is curation/enrichment.

## Current next work

Preferred sequence:

1. curate canonical Primary Topics, clinically useful Case Tags, and System↔Tag exposure before learner rollout;
2. verify intended Topic/Tag/System learner reachability and Original/Expanded behavior with real content;
3. promote genuinely reusable Shared/Image Questions where scope is proven and add stimulus variants only when educationally useful;
4. observe Admin/learner friction;
5. improve local-development/modularity/performance paths where they reduce concrete risk or cost;
6. implement learner-account administration;
7. implement basic learner-progress administration.

Further Preview decomposition is not on this sequence.

## Deliberately deferred

- further Preview backend decomposition after PR #83;
- remote Preview decommissioning until separately assessed;
- compound/multiple Shared Question scopes;
- Tag hierarchy/aliases or standalone Study-by-Tag outside contextual System exposure;
- automatic/AI Tag inference;
- Asset Tags;
- generic Asset families/version-history UI;
- automatic visual same-image detection;
- permanent Asset/R2 deletion;
- FSRS/sophisticated scheduling;
- advanced analytics;
- broad media expansion/WYSIWYG;
- institutional/multi-tenant/product-growth features.

## Handover rule

Before changing project status, compare:

```text
current main code
+ migration files
+ merged PR history
+ explicitly verified production evidence
```

Behavior-preserving refactors still require documentation updates when responsibility ownership materially changes where future agents should work. Historical refactor plans must not override the current local-first workflow decision.