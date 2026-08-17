# Image Management V2 — Implemented Behaviour

_Status: implemented in draft PR #34 on top of the merged PR #29 image-authoring baseline and PR #33 roadmap refresh._

_Last updated: 17 August 2026_

## Purpose

Image Management V2 makes the production and Preview Image Libraries practical for a larger corpus while preserving the existing Case/stimulus model. It is an Admin workflow change only: learner stimulus selection, contextual-question precedence, Review snapshots/provenance and protected R2 identity are unchanged.

This implementation adds D1 migration `drizzle/0007_image_collections.sql`; it does not change `wrangler.jsonc`.

Terminology is deliberate: **Topic** is an educational / learner Case classification, **Tag** is cross-cutting clinical metadata, and **Collection** is an Image Library organisational bucket. Collections are not Topics, Categories or Folders.

## Preserved content model

The implementation continues to distinguish:

```text
fixed Case image            = case_assets
alternative image set       = stimulus_groups
image in an alternative set = stimulus_group_options
```

Case-specific captions remain relationship metadata. Exact-image questions remain attached to the exact `stimulus_group_option`. A stimulus group is still a Case-specific learner alternative set, not a media-library folder.

There is no Asset-folder model, Asset Tags, global album hierarchy or generic library-wide Move command in V2.

## Image Library Collections

Each Asset has zero or one Collection through nullable `assets.image_collection_id`. A null value is presented as **Unsorted**. `image_collections.name` is unique, and the foreign key uses `ON DELETE SET NULL`.

Collections are global Asset metadata. They do not change `case_concepts`, Case Tags, Case relationships, captions, stimulus/question semantics, learner routing, Review snapshots or R2 identity. The read-only Case-derived context remains labelled **Used in Topics** so it cannot be confused with Collection.

The Image Library supports server-backed Collection filtering alongside the existing Used in Topic, usage, status and source filters. Collection changes reset to page 1 and clear cross-page selection. Sorts include Collection A–Z, Collection Z–A and Unsorted first, with deterministic Asset-ID tie-breaks.

Admins can create or rename a named Collection from `/admin/images`, assign selected Assets through **Set Collection**, or explicitly choose **Unsorted** to remove an assignment. Rename preserves the Collection ID and all assignments. Admins can also delete empty or non-empty Collections after an explicit confirmation showing the affected image count; deletion detaches those Assets to Unsorted but never deletes images or any Case, stimulus, question, Topic, Tag, Review or R2 data. Success feedback reports how many images moved to Unsorted. Assignment replaces the prior value and is chunked sequentially at the existing 30-Asset server bound. A failed chunk stops later requests, retains failed/unprocessed selection and reports completed versus remaining work. Preview can display, filter and sort Collection metadata but cannot create, rename, delete or mutate production Asset assignments.

## 1. Server-backed Image Library pagination

`/admin/images` and `/preview-admin/images` use server-backed pagination with a bounded page size of **60 Assets**.

The server computes:

- the exact total matching count;
- the current normalized page;
- total pages;
- deterministic page rows using stable Asset-ID tie-breakers;
- the current canonical search/filter/sort context.

The UI shows the displayed range and page, for example:

```text
Showing 61–120 of 237 images
Page 2 of 4
```

Previous/Next links preserve the authoritative search/filter/sort parameters. The filter form does not carry `page`, so applying a changed search/filter/sort query starts at page 1. Invalid pages normalize to page 1 and pages beyond the final page normalize to the final page.

Only the current bounded Asset page is loaded for rendering. Relationship/context rows are fetched only for the current page Asset IDs. Production read models continue excluding Preview-owned Assets and Preview-owned Case relationships from normal usage counts.

## 2. Cross-page explicit selection

Explicit Image Library selection now persists across page navigation while the canonical search/filter/sort context is unchanged.

Example:

```text
Page 1: select A + B
Page 2: select C
Selection = A + B + C
```

The selected Asset IDs are stored as explicit client selection state for that query context. Page changes alone do not prune off-page IDs.

Changing an authoritative query criterion clears the old selection universe, including changes to:

- search text;
- Topic;
- Used/Unused;
- active/inactive status;
- source filter;
- sort order.

`Clear selection` clears the complete cross-page selection. Ctrl/Cmd toggle and touch Select mode continue to operate on explicit IDs. Shift-range remains intentionally limited to the currently displayed page/order; an off-page range is never inferred.

The bounded Case-editor Asset picker keeps its previous pruning semantics because it is a separate contained workflow rather than the paginated Image Library.

## 3. Exact `Select all N matching images`

The server computes the exact matching count before any all-matching action is offered.

The first V2 bound is:

```text
maximum exact all-matching selection = 300 Assets
```

When the exact count is at most 300, the server resolves the exact matching Asset IDs for the canonical filters and the client turns those IDs into the explicit selection. This is not a visible-page approximation.

When more than 300 Assets match, `allMatchingIds` is not returned and the UI refuses the action with guidance to refine the search/filters. It never silently selects the first 300 or labels a partial selection as all matching.

Changing the canonical query context clears an all-matching selection exactly like any other cross-page selection.

## 4. 30-Asset server mutation invariant and client chunking

The PR #29 server invariant remains unchanged:

```text
one relationship-write request <= 30 unique Assets
```

Selections larger than 30 are split client-side into sequential chunks of at most 30 explicit IDs. Only one request is in flight at a time.

Every chunk calls the existing server-safe Add-to-alternative-set primitive, so every request independently repeats authorization, Asset validity, target Case/group ownership and relationship-conflict checks. Validation from an earlier successful chunk is never treated as authority for a later chunk.

The UI reports progress such as:

```text
Adding images… 60 / 143 processed
```

There is no persistent bulk-job table. Refresh/browser close can interrupt the client loop.

## 5. Partial-failure semantics

A failed chunk stops later chunks immediately.

Successful earlier chunks remain committed; the operation is never described as atomic. The client reports completed versus remaining counts and keeps the failed/unprocessed IDs selected for inspection or retry where practical.

Example semantics:

```text
60 of 143 images were processed.
83 images remain selected.
The next batch failed.
```

After any successful chunks, the page data is invalidated so displayed usage/relationship state can refresh without discarding the retained remaining selection.

## 6. Existing bulk Add-to-alternative-set safety remains authoritative

The V2 client orchestrator builds on the existing server helper rather than replacing it.

Existing rules therefore remain:

- already active in the exact target set -> idempotent no-op where supported;
- fixed in the target Case -> reject rather than convert;
- already in another alternative set in the target Case -> reject rather than silently move;
- inactive existing option -> do not silently reactivate;
- inactive/missing target -> reject;
- unrelated other-Case relationships -> preserve unchanged;
- Preview bulk Add -> target only a current-session Preview-owned active stimulus group.

## 7. Identity-preserving same-Case alternative-option Move

Schema inspection confirmed that V2 can safely implement the deliberately narrow Move without a migration:

- `stimulus_group_options.id` is the stable option identity;
- `stimulus_group_options.stimulus_group_id` can be updated to another valid group;
- exact-option questions reference `stimulus_group_option_id`, not the group ID;
- Case-specific option captions, active state and option-owned metadata live on the option row.

V2 therefore supports:

```text
existing stimulus_group_option
Case A / Alternative Set 1
→ Case A / Alternative Set 2
```

The operation is exposed on the existing alternative-option card in the Case editor as **Move to another set…**. It is relationship-specific; `/admin/images` does not expose a generic Asset Move command.

### Move preservation rules

The implementation updates the existing option row in place and preserves:

- `stimulus_group_option.id`;
- Asset identity;
- Case-specific option caption;
- active state;
- exact-option Question relationships and answers;
- created metadata already owned by the option.

A valid new target `display_order` is assigned after the target's current final option.

Set-wide/group-level questions remain attached to their original groups and do not follow the moved option.

### Move validation

Before the write, the server validates:

- current production or Preview Case ownership;
- active Case;
- existing active source option;
- active source group;
- active target group;
- source and target belong to the same Case;
- target does not already contain a conflicting option for the Asset;
- simulated source-after-removal and target-after-addition stimulus-specific coverage;
- compatibility with a fixed Case question-count limit.

Cross-Case, inactive, duplicate/conflicting and ownership-invalid moves are rejected. Unrelated Cases, Assets, questions and Review snapshots remain untouched.

Production Admin cannot move Preview-owned relationships because the owning Case must be a production Case. Preview Move requires the current live Preview Session and both groups/options must belong to that Preview-owned Case/session.

## 8. Fixed images remain a distinct authoring operation

Fixed `case_assets` are not silently reinterpreted as alternative options by this Move operation.

The existing fixed-image -> alternative-set conversion remains a separate explicit authoring path and continues to use its existing safety logic. Case Questions are not inferred to be exact-image questions merely because a Case previously had one image; question re-scoping remains an explicit Admin decision.

## 9. Preview Admin parity/isolation

`/preview-admin/images` shares the scalable browsing/selection UI against real production Assets read-only.

Preview may:

- search/filter/sort;
- paginate;
- enlarge;
- select across pages;
- select all matching within the 300 cap;
- bulk-add selected production Assets to current-session Preview-owned alternative sets;
- move Preview-owned stimulus options between Preview-owned groups in the same Preview Case.

Preview may not mutate production Asset metadata, production R2 objects, production Cases or production stimulus relationships.

The shared Case-editor component continues to be used by both production and Preview. The Move form switches only its relationship endpoint according to `previewMode`; it does not add an ambiguous production named action to the shared adapter contract.

## 10. Learner behaviour is unchanged

V2 does not change:

- fixed Case Asset semantics;
- one-option-per-active-stimulus-group selection;
- random option selection;
- exact-option questions;
- group-level questions;
- contextual question precedence;
- Case Topics/Tags;
- Review Asset snapshots;
- Review Question snapshots;
- Review provenance.

Historical Reviews continue rendering persisted snapshots and are unaffected by later option movement.

## 11. Schema/deployment status

This implementation changes:

```text
drizzle/0007_image_collections.sql
src/lib/server/db/schema.js
```

The existing `.github/workflows/deploy-pr-to-preview.yml` intentionally refuses PRs that change D1 schema/migrations, because that workflow deploys the Worker against the production-backed D1 binding and never applies migrations. The current PR #34 head therefore cannot safely deploy through that workflow. Applying `0007_image_collections.sql` alone is not sufficient: the guard compares the PR diff with `main` and also blocks the `schema.js` change. The safest sequencing is to review and merge the migration/schema foundation through the normal protected process, apply `0007_image_collections.sql` to the intended D1 environment, rebase/update PR #34 so those already-landed schema/migration files are no longer in its diff, and then deploy the resulting code-only PR head to Preview for manual review. Do not weaken the guard or point Preview at an unreviewed database.

## 12. Regression coverage

Focused V2 tests cover:

- deterministic 60-item pagination;
- exact counts/total pages;
- invalid/out-of-range page normalization;
- canonical query context excluding page number;
- exact all-matching IDs at <=300;
- explicit refusal/no silent truncation at >300;
- production exclusion of Preview-owned Assets;
- cross-page selection preservation;
- query-context selection reset;
- Ctrl/Cmd and current-page Shift behaviour;
- retained Case-picker pruning behaviour;
- 1/30/31/60/61 chunk boundaries;
- sequential execution;
- stop-on-first-failure and completed/remaining accounting;
- same-Case Move identity/caption/exact-question preservation;
- cross-Case/inactive/duplicate Move rejection;
- minimum coverage validation;
- group-level questions remaining with their groups;
- production/Preview ownership enforcement.
- Collection migration/schema and nullable Unsorted semantics;
- Collection creation, assignment/reset, filtering, sorting and deterministic tie-breaking;
- 1/30/31/60/61 Collection chunk boundaries and partial-failure accounting;
- Preview read-only Collection metadata and unchanged Case-derived Topic relationships.

Existing image workflow, learner Review and Preview Reset suites remain part of the full `npm test` regression run.

## Validation

Before handoff the PR head must pass:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

These commands are also covered by the repository CI workflow for pull requests.

## Manual Preview review

After CI is green:

1. Do not run **Deploy PR to Preview** for the current PR #34 head; the workflow is expected to stop at its schema guard.
2. Land the separately reviewed migration/schema foundation and apply `0007_image_collections.sql` through the protected migration process to the D1 database used by Preview.
3. Rebase/update PR #34 so the already-landed migration and `schema.js` changes are no longer part of its diff, then deploy that code-only PR head through the approved Preview path.
4. Sign into `/preview-admin`.
5. Create or use a disposable Preview Case with at least two active alternative sets.
6. Verify Image Library pagination and exact total matching count.
7. Change search/filter/sort and verify page reset plus selection reset.
8. Select images on page 1, navigate to page 2, add more selections and verify the combined count.
9. Exercise Ctrl/Cmd toggle, current-page Shift-range and touch Select mode where practical.
10. Use **Select all N matching images** with <=300 matches and confirm exact selection.
11. Use a broad result set with >300 matches and confirm Select All is refused rather than truncated.
12. Select >30 Assets and bulk Add them to an active Preview-owned alternative set; verify sequential progress.
13. Verify Collection names and Unsorted display/filter/sorts in Preview, and confirm no Preview control can assign a production Asset Collection.
14. Force or encounter a conflict in a later chunk and verify completed/remaining reporting with remaining IDs selected.
15. In the Preview Case editor, use **Move to another set…** on an existing option and verify its caption and exact-option questions remain attached.
16. Confirm set-wide questions remained with their original sets.
17. Confirm the source production Case is unchanged.
18. Reset Preview Workspace.
19. Run **Restore Main to Preview**.

## Definition of done

Image Management V2 is complete when a large Image Library can be paged deterministically, selected exactly across pages within explicit bounds, organised through one-Collection-per-Asset metadata with an explicit Unsorted state, mutated through server-safe sequential chunks, and reorganised through an identity-preserving same-Case option Move without loss of contextual teaching data or Preview isolation.
