# Flash-Cards agent handover

_Refreshed: 28 August 2026_

## Current outcome

Flash-Cards is a working private case-based medical learning application with:

- D1-backed learner Study/Review persistence;
- protected private R2 teaching images and historical Review-media snapshots;
- Better Auth production/Preview role boundaries;
- Admin CMS for Cases, Questions, Shared Questions, Images, Systems/Topics, Tags, and reviewed imports;
- learner-selectable **Original questions** versus **Expanded Learning** Review modes;
- contextual **System → Topic / exposed Tag / All** learner navigation merged behind rollout control;
- current Case classification of exactly one behaviorally active **Primary Topic** plus zero or more **Case Tags**;
- fixed images plus optional Alternative Sets/options;
- Case, stimulus, Topic/ancestor, tag-shared, and exact-Asset reusable Question sources;
- Tagging Stage A/B;
- Image Management V2, Collections, lifecycle cleanup views, and same-image higher-resolution replacement;
- visual Systems & Topics taxonomy/Case-classification workspace;
- Case Library Active/Inactive lifecycle, validated deactivate/restore, inline/bulk Case Tag curation, and bulk Primary Topic assignment;
- strict reviewed/resumable imports;
- local production-like D1/R2 development replica;
- local slide-review/deterministic-finalizer tooling;
- bounded Admin read models and targeted Case Library search/read-path optimisation;
- repository-owned coding-agent/validation workflow with Draft-fast / Ready-full PR CI;
- a fully imported and production-verified first ECG corpus: **66/66 source notes represented**.

Current `main` at this refresh is merge commit `31eac90c0a6dd472d747a7ec0be94cd9ad3eae9d` from PR #106.

## Status boundary: production versus current `main`

Do not collapse these facts:

```text
merged on main
≠ migration applied to production D1
≠ Worker deployed
≠ taxonomy/content curation completed
≠ learner feature enabled
≠ behavior explicitly verified in production
```

The recorded verified production baseline includes learner/Admin/Preview/Image Management V2/Tagging Stage B and the complete ECG import. Current `main` contains later features/refactors that must not be called deployed/applied without separate evidence.

Current repository migrations extend through:

```text
0015_contextual_system_topic_tag_navigation.sql
```

PR #90 intentionally added no `0016` migration. Legacy secondary `case_concepts` rows may remain physically stored, but current authoring/read/import/Preview/learner paths ignore them as active classification and do not create new secondary relationships.

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

## Important recent merged sequence

The following post-PR-#90 changes are on current `main`:

- **PR #92** — documents local-first development and pauses the old Preview backend decomposition sequence;
- **PR #93** — improves desktop Case-editor Topic/Tag authoring layout;
- **PR #95** — records the Account Management v1 design; this is design/documentation, not the implementation itself;
- **PR #98** — adds bulk Case Primary Topic assignment;
- **PR #99** — implements the visual Systems & Topics taxonomy/Case-classification workspace;
- **PR #100** — implements Production Case lifecycle UX plus inline/bulk Case Tag curation;
- **PR #102** — improves Case Library text-filter interaction and removes redundant taxonomy supporting reads;
- **PR #106** — implements Draft PR fast CI, Ready PR full CI, Draft → Ready full validation, and same-PR superseded-run cancellation.

PRs #96/#97 implementation work for Account Management is not part of current `main` merely because PR #95's plan is merged. Always inspect actual PR/merge state before calling a planned account feature implemented.

## Product/content model

The current authoring hierarchy is:

```text
System
└── Topic hierarchy
    └── Case
        ├── exactly one Primary Topic relationship
        ├── zero or more Case Tags
        ├── fixed Assets
        ├── Alternative Sets
        │   └── Stimulus Options
        └── contextual questions
```

System is the top-level learner-navigation grouping. Topic is the Case's canonical educational classification and direct reusable Topic-question context. Tags are flat cross-cutting classification/contextual discovery. System↔Tag exposure determines where a Tag may appear contextually; it does not change the Case's direct Topic-question context.

Additional Study Topics are retired. `MULTI_TOPIC_STUDY_ROUTES.md` and migration `0003` are historical compatibility/provenance context only.

Global reusable knowledge remains separate:

```text
Shared Question
→ Prompt + reusable answer + one Reuse Scope Tag

Reusable Image Question
→ exact Asset + Prompt + canonical Asset-specific answer
→ explicit opt-in per exact stimulus usage
```

`question_prompts` stores wording only.

## Original questions / Expanded Learning

New Reviews use a persisted question-pool mode:

```text
Original/Core
→ Case-owned sources only: case, stimulus_group, stimulus_option

Expanded Learning
→ full eligible resolver including Topic/ancestor, tag-shared, and opted-in reusable Asset sources
```

Eligibility is selected before duplicate-Prompt precedence/deduplication. Automatic/All/Fixed Case question-count selection is applied afterward.

Current duplicate-Prompt precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for selected option
> stimulus group
> Case
> exact Primary Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

## Case authoring

Ordinary Case classification controls are:

```text
Primary Topic
+ Case Tags
```

Additional Study Topic controls must not be reintroduced.

Question scope is author-facing:

```text
Applies to this whole Case
Applies to a specific image / stimulus
```

Image cards distinguish Case-specific Image Questions from Reusable Image Questions. Reusable Image Questions never auto-propagate merely because the same Asset appears elsewhere.

The Case editor is decomposed under:

```text
src/lib/components/case-editor/
```

The route `src/routes/admin/cases/[caseId]/+page.svelte` is primarily a coordinator. Preview reuses the shared editor rather than maintaining a duplicate implementation.

## Systems & Topics workspace

PR #99 made `/admin/topics` the visual taxonomy/classification workspace.

Important semantics:

- Systems remain top-level roots and Cases never attach directly to Systems;
- Topics may nest beneath Systems or other Topics;
- Cases are hidden by default and revealed by direct canonical Primary Topic ownership;
- Topic hierarchy moves, Case Primary Topic changes, and Case Tag additions/removals may coexist in one staged review;
- different Cases may stage different Primary Topic targets within the same review;
- all pending domains are reviewed together and submitted through one `Validate & apply all changes` workspace action;
- the unified helper completes all requested hierarchy/Primary-Topic/Tag preflight checks before the first canonical write;
- the established domain writers then execute sequentially, so this is **not** one cross-domain serializable/rollback transaction;
- System↔Tag exposure stays outside this workspace.

## Case Library lifecycle and curation

Current Case lifecycle is:

```text
Active Production Case
→ Deactivate
→ Inactive Production Case, content/history preserved
→ validated Restore
→ Active Production Case
```

Deactivation changes only `cases.is_active`. It does not delete teaching content, media, relationships, or historical Reviews.

Restore validates the current Production/Primary-Topic invariants before activation.

The Case Library provides:

- Active / Inactive views;
- single/bulk deactivate and restore;
- bulk Primary Topic assignment;
- inline Case Tag add/remove/create-and-attach on active Cases;
- bulk Case Tag add/remove/create-and-add;
- lifecycle-correct Tag filtering;
- bounded filtering/sorting/pagination.

PR #102 removed the former 300 ms text-input auto-submit. Case/Topic/System text typing stays local until Enter or explicit Search; Tag selection may still apply intentionally on change. The active read path also reuses the compatible taxonomy result instead of loading it twice.

## Alternative option / Asset lifecycle

Keep these operations distinct:

```text
Deactivate option
Remove from Case
Asset Active/Inactive
Asset Current/Historical only/Unused
Replace same underlying image with higher-resolution Asset
Permanent Asset/R2 deletion
```

Permanent Asset/R2 deletion is not a routine implemented workflow.

Same-image replacement creates a new immutable Asset/R2 object and preserves historical media/provenance. A different image showing the same diagnosis is a separate Asset, not a replacement.

## Reviewed imports / slide workflow

Production imports accept strict **Flash-Cards Import Package v1**, not arbitrary APKG/PPTX/PDF input.

```text
source
→ semantic reconstruction outside production app
→ human review
→ deterministic finalization
→ strict Import Package v1
→ Production Admin resumable importer
```

Package v1 retains `secondaryTopicIds` only as an empty compatibility array. Non-empty values are invalid current reviewed input.

For slide review, the current executable authorities are:

```text
src/lib/server/import/content-package.js
tools/slide-import-review/schemas/review-map-v1.schema.json
```

The review-map schema is strict; do not copy obsolete review-map example fields from older prompts.

## Preview Admin

The production-backed `/preview-admin` subsystem remains in the repository because ownership/security and production-safety contracts still depend on it.

As of PR #92, it is **not** the normal development/testing path. The primary path is local clone + local production-like D1/R2 + local dev/preview + repository validation/CI.

Preview backend decomposition was intentionally paused after PRs #80/#82/#83. Do not resume the old PR2D/PR2E/PR2F sequence merely because historical planning documents mention it.

Any future Preview removal requires a dedicated decommissioning assessment.

## Developer/coding-agent workflow

Execution mode is capability-based:

```text
usable checkout + commands → Local checkout mode
GitHub access without local execution → Remote GitHub mode
both → Hybrid mode
```

Repository-owned validation commands include:

```text
npm run agent:doctor
npm run agent:checks
npm run validate:fast
npm run validate:full
```

Do not hard-code the individual test list into every task prompt. The repository validation contract is the authority.

### PR CI after PR #106

```text
Draft PR
→ ordinary fast validation

Ready-for-Review PR
→ ordinary full validation

Draft → Ready
→ full validation on the same PR head even without a new source commit

new run for same PR
→ superseded run cancelled

different PRs
→ do not cancel each other
```

The required ordinary CI status/job remains `check`. Fast/full composition is owned by `scripts/validation-contract.mjs`; CI mode selection/orchestration is owned by `.github/workflows/ci.yml` and `scripts/validate-ci.mjs`.

Specialized runtime/slide-review checks remain separate where the task map requires them.

## Local development — primary workflow

Typical iteration:

```text
npm run local:refresh   # when fresh production-derived content is needed
npm run dev             # hot-reload development
npm run local:stop
npm run preview         # production-style local runtime verification
repository-defined validation / GitHub CI
```

`npm run local:stop` is the safe checkout-scoped cleanup command. Do not replace it with broad machine-wide Node-process termination.

The repository-pinned Wrangler dependency/lockfile is authoritative. Do not use ad-hoc hard-coded Wrangler versions in ordinary operational guidance.

## Current product sequence

```text
curate clinically useful Primary Topics / Case Tags / System↔Tag exposure
→ verify intended learner reachability before rollout
→ user-test the merged taxonomy/lifecycle/Case Library workflows
→ finish Account Management v1 implementation
→ basic learner-progress administration
→ targeted maintainability/performance work from observed evidence
```

Do not expand schema/taxonomy merely for conceptual completeness.
