# Flash-Cards — Current Product Roadmap

_Last updated: 18 August 2026_

This document is the short status map for what is merged/deployed versus what remains product work. Detailed architecture remains in the design and handover documents.

## Merged and deployed baseline

The current product includes:

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

Both reviewed import jobs are `complete`, match their recorded package SHA-256 values and have no recorded import error. The current production database contains all 13 Batch 01 and all 51 Batch 02 active production Cases, active ECG Assets and Case↔ECG links. The two pre-existing Hypocalcaemia/Hypercalcaemia mapped Cases remain active and image-backed.

Initial ingestion is therefore complete. Remaining ECG work is **curation/enrichment**, not source migration: improve Tags, promote genuinely repeated knowledge to Shared Questions, add secondary Study Topics/stimulus alternatives where useful, and medically review source content as needed.

See `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` for the exact accounting and verification record.

## Current product work

### 1. ECG/content curation using the completed Stage B model

Use the real corpus to curate Case Tags and Shared Questions progressively. Do not mass-normalize merely because repetition exists: promote knowledge only when the prompt/answer remains reliably correct across the intended Reuse Scope Tag.

The learner duplicate-Prompt precedence remains:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> eligible ancestor Topic
```

### 2. Learner-account administration

Implement the smallest useful administrator learner-account workflow while preserving the existing production/Preview role boundaries.

### 3. Basic learner-progress administration

Add learner list, recent Reviews, filtering, Again/Good summaries and repeated-Again flags. Defer sophisticated analytics until real usage establishes requirements.

## Deliberately deferred

Unless real corpus/learner evidence creates a concrete need, keep deferred:

- multiple/compound Shared Question Reuse Scope rules;
- Tag hierarchy and aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- FSRS/scheduling controls;
- advanced analytics;
- rich WYSIWYG authoring;
- broad non-image upload types;
- a more complex global media taxonomy beyond current Image Collections.

## Implementation principle

The platform architecture is now a working baseline rather than the primary bottleneck. Prefer real-content curation and observed learner/Admin friction over speculative schema expansion.
