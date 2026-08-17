# Flash-Cards — Current Product Roadmap

_Last updated: 17 August 2026_

This document is the short status map for what is merged versus what remains product work. Detailed architecture remains in the existing design and handover documents.

## Merged baseline

The current `main` includes:

- learner Study/Review flow backed by D1;
- protected private R2 teaching images;
- Admin CMS for Cases, Questions, Images, Topics, Tags and reviewed imports;
- optional stimulus groups/options with exact-option and set-wide contextual questions;
- multi-Topic Case routing and Admin authoring;
- reviewed Import Package v1 plus resumable/chunked imports;
- Tagging Stage A: canonical flat Tags, Case↔Tag, contextual Case Question↔Tag, Admin curation/filtering;
- Production-backed Preview Admin workspace using the existing production D1/R2 with explicit Preview ownership and reset isolation;
- Preview Admin identity reuse support for an existing production Admin (`admin,preview_admin`);
- manual Deploy PR to Preview and Restore Main to Preview operator workflows;
- PR #29 image-authoring baseline: large image inspection, bounded Case image picker, fixed/alternative-set authoring, image-library multi-select and safe bulk add-to-set.

## Current product work

### 1. Image Management V2 — pending

The PR #29 workflow is the baseline, not the end state of image management.

V2 should focus on scaling the Image Library and making reorganisation explicit and safe:

- server-backed pagination or an equivalent bounded result contract;
- an exact matching-result count for the current filters;
- safe `Select all N matching` semantics represented on the server rather than as a browser-only approximation;
- bounded/chunked bulk actions for selections larger than the current 30-Asset single-action limit;
- explicit reorganisation/move semantics for Case-scoped image relationships, with preservation rules for captions, exact-option questions, activation/order and stimulus-group coverage;
- clear handling of conflicts such as an Asset already being fixed in the target Case or already belonging to another alternative set in that Case;
- Preview Admin support for every new shared Image/Case-editor action, preserving production isolation.

V2 should not silently invent a global folder/group model. The repository currently has no global Asset-folder relationship; Case-scoped alternative stimulus sets remain a different concept. If a future global organisational model is proposed, it should be a separate architecture/schema decision justified by real library-management needs.

See `IMAGE_MANAGEMENT_V2_PLAN.md` and `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`.

### 2. Tagging Stage B — pending

Stage A is merged. The remaining major tagging milestone is shared/tag-reusable Questions.

Stage B should implement the architecture already agreed in `TAGGING_MODEL_DECISIONS.md`:

- a dedicated shared knowledge Question entity rather than clinical meaning on `question_prompts`;
- descriptive Tags on shared Questions;
- exactly one reuse-scope Tag per shared Question initially;
- Case eligibility derived from matching Case Tags;
- matching creates eligibility, not mandatory display;
- learner resolver integration with precedence:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> eligible ancestor Topic
```

- deduplication by Question Prompt and Review provenance/snapshot regression coverage.

Also still deferred unless separately justified: compound ANY/ALL reuse scopes, Tag hierarchy, aliases/synonyms, Study-by-Tag, Review Tag snapshots, automatic Tag inference, and Asset Tags.

### 3. Real ECG/Anki migration and curation — active content work

Continue progressive ingestion of reviewed ECG/Anki material. Initial import does not require complete tagging or stimulus restructuring. Content can start as Topic → Case → image/questions and be enriched later with additional Study Topics, stimulus sets and Tags.

The improved Image Management V2 and Tagging Stage B become more valuable as the corpus grows, so they are the next major product-facing implementation tracks.

## Later planned work

- smallest viable learner-account administration workflow;
- basic learner progress administration;
- more advanced analytics only after real usage establishes requirements;
- richer taxonomy/tag/search features only when the corpus demonstrates the need.

## Implementation principle

Do not treat a merged foundation as a completed product area. In particular:

```text
Image authoring baseline ≠ Image Management V2 complete
Tagging Stage A         ≠ shared/tag-reusable Questions complete
```

When another document conflicts with this status map, inspect current `main` and the most recent merged PRs before implementation, then update the stale document as part of the next documentation change.
