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

## Current implementation PR

### Image Management V2 — implemented in draft PR #34

Draft PR #34 implements the planned V2 milestone without a D1 migration or `wrangler.jsonc` change:

- 60-item server-backed `/admin/images` and `/preview-admin/images` pagination;
- exact matching counts and normalized page/total-page metadata;
- deterministic ordering with stable Asset-ID tie-breaks;
- cross-page explicit Asset selection while search/filter/sort context is unchanged;
- selection reset when the authoritative query context changes;
- current-page-only Shift ranges plus retained Ctrl/Cmd/touch selection behaviour;
- exact server-resolved **Select all N matching images** up to 300 Assets;
- explicit refusal rather than silent truncation above 300;
- retention of the 30-Asset server mutation limit;
- sequential client orchestration for selections larger than 30, with progress and stop-on-first-failure accounting;
- same-Case, identity-preserving movement of an existing `stimulus_group_option` between active alternative sets;
- preservation of option ID, caption, active state and exact-option questions during Move;
- source/target coverage and duplicate/conflict validation;
- Preview-owned relationship mutation only inside the current disposable Preview Session;
- unchanged learner stimulus selection and Review composition semantics.

The Move operation is deliberately relationship-specific in the Case editor. It is not a generic Image Library Asset Move and does not create global media folders/groups.

See `IMAGE_MANAGEMENT_V2_PLAN.md` and `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`.

## Next product work

### 1. Tagging Stage B — pending

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

### 2. Real ECG/Anki migration and curation — active content work

Continue progressive ingestion of reviewed ECG/Anki material. Initial import does not require complete tagging or stimulus restructuring. Content can start as Topic → Case → image/questions and be enriched later with additional Study Topics, stimulus sets and Tags.

Image Management V2 is intended to make later reorganisation of the growing corpus practical without introducing a global folder model.

## Later planned work

- smallest viable learner-account administration workflow;
- basic learner progress administration;
- more advanced analytics only after real usage establishes requirements;
- richer taxonomy/tag/search features only when the corpus demonstrates the need;
- a global media organisation model only if real corpus-management requirements justify a separate architecture/schema decision.

## Implementation principle

Do not treat a merged foundation as a completed product area. Current status should be read as:

```text
PR #29 image authoring baseline → extended by draft PR #34 Image Management V2
Tagging Stage A              → shared/tag-reusable Questions still pending
```

When another document conflicts with this status map, inspect current `main` and the most recent merged/current implementation PRs before implementation, then update the stale document as part of the next documentation change.