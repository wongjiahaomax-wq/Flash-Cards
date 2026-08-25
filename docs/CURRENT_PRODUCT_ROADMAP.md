# Flash-Cards — Current Product Roadmap

_Last updated: 25 August 2026_

This is the short status map for what is **explicitly verified in production**, what is **merged on current `main`**, and what remains product/engineering work. Detailed semantics live in `HANDOVER.md`, `V1_DATA_MODEL.md`, and the subsystem contracts.

## Explicitly verified production baseline

The recorded deployed baseline includes:

- D1-backed learner Study/Review flow;
- protected private R2 teaching images;
- Better Auth production Admin and Preview Admin boundaries;
- Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags, and reviewed imports;
- optional stimulus groups/options with exact-option and set-wide contextual questions;
- multi-Topic Case routing/Admin authoring;
- reviewed Import Package v1 plus resumable/chunked imports;
- Tagging Stage A and deployed Tagging Stage B;
- production-backed Preview Admin workspace;
- Image Management V2 with Collections and bounded operations;
- wide responsive Admin workspace;
- first ECG/Anki source deck fully represented and verified in production: **66/66 source notes**.

The repository contains later merged code and migrations beyond this verified production baseline. Do not convert merge status into deployment claims without explicit rollout evidence.

The production-backed Preview Admin still exists, but as of 25 August 2026 it is no longer part of the normal development/testing workflow. Local clone + local production-like D1/R2 is now the primary application verification path.

## Current `main` — merged baseline

Current `main` includes the earlier PR #53–#59 sequence:

- local/offline slide review and deterministic finalization;
- Case-editor Topic management/inline Topic creation;
- production-like local D1/R2 replica;
- whole-Case → exact-stimulus question moves;
- author-facing whole-Case vs exact-image/stimulus scope with transparent fixed-image conversion;
- Reusable Image Questions with explicit exact-stimulus opt-in;
- narrow same-image higher-resolution Asset replacement and supersession lineage.

It also includes the later merged sequence:

- **PR #61** — Admin dashboard-specific aggregates/bounded queue, exact Case-detail read, and lightweight timing;
- **PR #62** — alternative-option **Remove from Case** archive state, distinct from deactivation;
- **PR #63** — Image Library **Current / Historical only / Unused** lifecycle views and cleanup-oriented filtering;
- **PR #64** — bounded 60-row `/admin/cases` and `/admin/questions` read models with SQL filtering/counting and visible-ID enrichment;
- **PR #66** — combined `admin,preview_admin` owner accounts may use production Study while Preview-only identities remain blocked;
- **PR #68** — stable exact-question save anchors/scroll return;
- **PR #69** — Classic/Compact responsive Case-editor preference;
- **PR #72** — Compact fast-review UX, image strips, source previews, and **All questions in this Case** audit;
- **PR #73** — hardened production/Preview mutation boundaries plus one repository-pinned Wrangler authority and runtime smoke;
- **PR #75–#77** — local coding-agent DX, reliable local dev/preview launchers, changed-file validation intelligence, and shared validation authority;
- **PR #78** — behavior-preserving decomposition of the large Admin Case editor into focused Svelte components;
- **PR #79** — capability-based Local / Remote GitHub / Hybrid coding-agent workflow;
- **PR #80** — Preview Session/ownership/error/input foundation extraction;
- **PR #82** — Preview Case lifecycle/cloning extraction;
- **PR #83** — Preview fixed Case-image operation extraction.

Draft PR #91 attempted the next Preview Alternative Set/stimulus extraction and was closed unmerged on 25 August 2026 after the project moved to a local-first testing workflow. It is not part of the merged baseline.

Current repository migrations extend through:

```text
0009_reusable_image_questions.sql
0010_reusable_image_reactivation_guard.sql
0011_asset_supersession.sql
0012_archive_stimulus_options.sql
0013_review_assets_asset_lookup.sql
```

These files being present on `main` does **not** prove production application. The same rule applies to Worker behavior: a merged PR or rollout-trigger commit is not deployment verification.

## Real ECG/Anki migration — initial deck complete

Production verification on 18 August 2026 recorded:

```text
Batch 01 imported Cases/ECGs:      13
Batch 02 imported Cases/ECGs:      51
Pre-existing mapped calcium Cases:  2
                         ----
Source notes represented:          66 / 66
```

Initial ingestion is complete. Remaining ECG work is curation/enrichment: improve Tags, promote genuinely repeated knowledge to Shared Questions or Reusable Image Questions, add useful Study Topics/stimulus variants, and medically review content where needed.

## Current product work

### 1. Curate the real corpus

Use real Cases to refine Case Tags, Shared Questions, Reusable Image Questions, Study Topics, and stimulus variants. Promote reusable knowledge only when the Prompt/answer remains reliably correct across the intended reuse scope.

Current-main duplicate-Prompt precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for the selected option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

### 2. Exercise current image lifecycle semantics

Use real authoring work to validate the distinction between:

```text
Deactivate option
≠ Remove from Case
≠ deactivate global Asset
≠ replace same underlying image with a higher-resolution Asset
≠ permanently delete Asset/R2 object
```

Image Library lifecycle views are organisational/cleanup aids. Permanent deletion is not implemented.

### 3. Continue targeted maintainability work only where it pays off

The Case-editor UI is decomposed into focused components. The Preview backend was decomposed through Session/ownership foundations, Case lifecycle/cloning, and fixed Case-image operations in PRs #80/#82/#83.

That Preview decomposition programme is now intentionally paused. Do **not** continue the historical sequence merely to finish it:

```text
PR2D Alternative Set / stimulus extraction
PR2E question / scope / reusable-question extraction
PR2F final façade / cleanup ownership
```

Those phases are no longer current roadmap items because the deployed `/preview-admin` workflow is no longer routinely used. The existing Preview implementation stays in place for now because ownership/security and production-safety contracts still depend on Preview concepts.

If the remote Preview Admin is later judged unnecessary, assess decommissioning as a separate project rather than mixing deletion into unrelated refactors.

For ordinary development, prioritize improvements to the local clone + local D1/R2 workflow and other modules that are actively changed.

### 4. Continue measurement-driven performance work

Passes 1–2 are merged. Remaining planned passes are:

```text
Pass 3 — Better Auth short-lived session cookie-cache investigation
Pass 4 — learner Study/startReview read-model optimisation
Pass 5 — Case-editor server read/lazy-loading boundaries
Later  — image thumbnails and measured EXPLAIN/index tuning
```

PR #78 solved UI ownership/modularity; it did not implement Pass 5 server-read lazy loading.

### 5. Learner-account administration

Implement the smallest useful administrator learner-account workflow while preserving production/Preview role boundaries.

### 6. Basic learner-progress administration

Add learner list, recent Reviews, filtering, Again/Good summaries, and repeated-Again signals. Defer sophisticated analytics until real usage establishes requirements.

## Developer/tooling baseline

The repository now provides:

- capability-based Local / Remote GitHub / Hybrid agent execution guidance;
- scoped `AGENTS.md` files plus `AGENT_TASK_MAP.md`;
- Node 22 contract;
- `agent:doctor`, `agent:checks`, `validate:fast`, `validate:full`;
- repository-owned ordinary CI/local validation definitions;
- repository-pinned Wrangler/workerd runtime with dedicated runtime smoke;
- deterministic local `npm run dev` / `npm run preview` launchers using repository-local Wrangler/XDG state;
- production-like read-production/write-local development replica;
- local slide-review/finalizer tooling.

The normal application workflow is local-first:

```text
npm run local:refresh   # when fresh production-derived content is needed
npm run dev             # fast iteration / hot reload
npm run local:stop
npm run preview         # production-style local verification
repository validation / GitHub CI
```

Remote Preview deployment is now an optional legacy capability, not a required integration gate.

These are repository/developer capabilities, not learner/Admin production features.

## Deliberately deferred

Unless real evidence creates a concrete need, keep deferred:

- further Preview backend decomposition after PR #83;
- remote Preview Admin decommissioning until explicitly assessed;
- multiple/compound Shared Question Reuse Scope rules;
- Tag hierarchy and aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- generic Asset families/arbitrary version-history UI;
- automatic visual same-image detection;
- different-image substitution through higher-resolution replacement;
- bulk Asset replacement;
- permanent Asset/R2 deletion;
- FSRS/scheduling controls;
- advanced analytics;
- rich WYSIWYG authoring;
- broad non-image upload types;
- a more complex global media taxonomy beyond current Image Collections.

## Implementation principle

The platform architecture is a working baseline rather than the primary bottleneck. Prefer real-content curation, observed learner/Admin friction, focused maintainability improvements in actively used paths, and measured performance evidence over speculative schema expansion or completion of historical refactor sequences.
