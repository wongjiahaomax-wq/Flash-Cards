# Flash-Cards — Current Product Roadmap

_Last updated: 20 August 2026_

This document is the short status map for what is explicitly verified in production, what is merged on current `main`, and what remains product work. Detailed architecture remains in the design and handover documents.

## Verified production baseline

The explicitly recorded deployed baseline includes:

- D1-backed learner Study/Review flow;
- protected private R2 teaching images;
- Better Auth production Admin and Preview Admin boundaries;
- Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags and reviewed imports;
- optional stimulus groups/options with exact-option and set-wide contextual questions;
- multi-Topic Case routing and Admin authoring;
- reviewed Import Package v1 plus resumable/chunked imports;
- Tagging Stage A: canonical flat Tags, Case↔Tag and contextual Case Question↔Tag curation;
- Tagging Stage B: tag-scoped Shared Questions, one Reuse Scope Tag, descriptive Tags, learner resolver integration and Review provenance;
- Production-backed Preview Admin workspace, Admin identity reuse and manual Preview deploy/restore workflows;
- PR #29 Admin image-authoring baseline;
- PR #34 Image Management V2 with Collections, scalable selection/bulk operations and same-Case option Move;
- PR #40 wide responsive Admin workspace;
- PR #43 Tagging Stage B behavior/Admin authoring, deployed to production after the already-applied `0008_tag_shared_questions.sql` schema foundation.

The repository also contains an explicit production rollout trigger commit for merged PR #56. This roadmap does not infer successful rollout solely from the existence of that trigger; deployment remains a separately verified fact.

## Current `main` — merged after the older production baseline

Current `main` includes the following later merged work:

- PR #53 — local/offline slide review + deterministic finalizer tooling;
- PR #54 — Case-editor Topic management and inline Topic creation;
- PR #55 — production-like local D1/R2 development replica;
- PR #56 — move an existing Case-wide question to an exact image/stimulus option;
- PR #57 — author-facing **Applies to: This whole Case / A specific image or stimulus** scope, including transparent fixed-image conversion;
- PR #58 — Reusable Image Questions and explicit per-stimulus opt-in;
- PR #59 — safe same-image higher-resolution Asset replacement with supersession lineage and historical Review media preservation.

Current repository migrations now extend through:

```text
0009_reusable_image_questions.sql
0010_reusable_image_reactivation_guard.sql
0011_asset_supersession.sql
```

Those migration files are present on `main`; this status map does not claim they have been applied to production without separate rollout evidence.

The local slide reviewer/finalizer and local production-like replica are repository/developer tooling, not learner/Admin production features.

## Real ECG/Anki migration — initial deck complete

The original ECG Anki source contained 66 notes/cards with 66 front-side ECG references.

Production verification on 18 August 2026 confirmed full source accounting:

```text
Batch 01 imported Cases/ECGs:      13
Batch 02 imported Cases/ECGs:      51
Pre-existing mapped calcium Cases:  2
                         ----
Source notes represented:          66 / 66
```

Both reviewed import jobs are `complete`, match their recorded package SHA-256 values and have no recorded import error. The verified production database contained all 13 Batch 01 and all 51 Batch 02 active production Cases, active ECG Assets and Case↔ECG links. The two pre-existing Hypocalcaemia/Hypercalcaemia mapped Cases remained active and image-backed.

Initial ingestion is therefore complete. Remaining ECG work is **curation/enrichment**, not source migration: improve Tags, promote genuinely repeated knowledge to Shared Questions or Reusable Image Questions, add secondary Study Topics/stimulus alternatives where useful, and medically review source content as needed.

See `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` for the exact accounting and verification record.

## Current product work

### 1. ECG/content curation using the completed reusable-content model

Use the real corpus to curate Case Tags, Shared Questions and Reusable Image Questions progressively. Do not mass-normalize merely because repetition exists: promote knowledge only when the prompt/answer remains reliably correct across the intended reuse scope.

Current-main duplicate-Prompt precedence is:

```text
selected exact stimulus option question
> explicitly reused Asset Question for the selected option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> eligible ancestor Topic
```

### 2. Exercise the current authoring model on real image variants

Use real ECGs to validate the merged **whole Case vs specific image/stimulus** authoring workflow, including transparent fixed-image conversion and explicit Reusable Image Question opt-in. Use higher-resolution replacement only for a better-quality copy of the same underlying image.

### 3. Learner-account administration

Implement the smallest useful administrator learner-account workflow while preserving the existing production/Preview role boundaries.

### 4. Basic learner-progress administration

Add learner list, recent Reviews, filtering, Again/Good summaries and repeated-Again flags. Defer sophisticated analytics until real usage establishes requirements.

## Deliberately deferred

Unless real corpus/learner evidence creates a concrete need, keep deferred:

- multiple/compound Shared Question Reuse Scope rules;
- Tag hierarchy and aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- generic Asset families or arbitrary version-history UI;
- automatic visual same-image detection;
- different-image substitution through the higher-resolution replacement action;
- bulk Asset replacement;
- FSRS/scheduling controls;
- advanced analytics;
- rich WYSIWYG authoring;
- broad non-image upload types;
- a more complex global media taxonomy beyond current Image Collections.

## Implementation principle

The platform architecture is now a working baseline rather than the primary bottleneck. Prefer real-content curation and observed learner/Admin friction over speculative schema expansion.
