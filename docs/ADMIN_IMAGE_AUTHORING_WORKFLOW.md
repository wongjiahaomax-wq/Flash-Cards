# Admin image authoring workflow

_Status: implemented. PR #29 established the Case image-authoring baseline, PR #34/Image Management V2 extended scalable library behaviour, PR #56 added Case-question → exact-option moves, and the stimulus-scope authoring follow-up makes fixed and alternative images equivalent targets from the author's perspective._

_Last updated: 19 August 2026_

This document records the current Admin image-authoring interaction contract. Learner stimulus semantics remain defined by fixed Case Assets and optional stimulus groups/options; Image Library organisation must not change those semantics.

Terminology:

```text
Topic      = educational / learner Case classification
Tag        = cross-cutting clinical metadata
Collection = Image Library organisational bucket
```

A Collection is not a Topic, Tag, or stimulus group.

## 1. Case editor order

The common authoring flow is:

```text
Topics → Case → Images → Case questions → Preview
```

Images appear before Case questions because the selected stimuli often determine which exact questions are useful.

The Images section preserves two learner relationship types:

- **Fixed image** — `case_assets`; shown in every applicable Review.
- **Alternative image set** — `stimulus_groups` containing `stimulus_group_options`; one active option is selected per active set when a Review begins.

Case-specific captions remain on the Case/stimulus relationship. Filename, alt text, source, licence, and Collection remain global Asset metadata.

## 2. Author-facing question scope

Question authors should not have to reason about database relationships. The normal control is:

```text
Applies to:
- This whole Case
- A specific image / stimulus
```

**This whole Case** creates/edits a Case Question and may expose **Also reuse this question in the Topic**.

**A specific image / stimulus** creates/edits an exact-image question. Topic sharing is not a compatible ordinary option and contradictory submitted form data must be rejected server-side.

The stimulus picker includes both:

- current fixed Case images;
- active options in existing Alternative image sets.

Use thumbnails plus filename, Case caption and set context where available. The author should be able to choose a fixed ECG as easily as an existing alternative ECG option.

## 3. Transparent fixed-image conversion for exact questions

General image-management operations still keep fixed-versus-alternative conversion explicit. One deliberate exception exists for stimulus-specific question authoring.

When an author assigns an exact-image question to a currently fixed image, the app may transparently:

1. create an active one-option Stimulus Group with `selection_count = 1`;
2. convert the fixed Case image into that option;
3. preserve the Asset identity;
4. preserve the Case-specific caption;
5. preserve active learner-visible behaviour;
6. attach the exact-image question to that option.

The generated group name should be deterministic and human-readable from existing Asset metadata. The author must not need to open **Alternative-set actions** or supply a set name merely to scope a question to that image.

The conversion and question assignment are one semantic mutation. Preflight validation must happen before destructive scope changes, and the D1 batch/transaction convention must prevent a failed assignment from leaving the fixed image unexpectedly converted.

With one active option, that image remains selected whenever the Case is reviewed, preserving the previous fixed-image learner behaviour.

## 4. Existing Case-question scope changes

Every Case-wide question should visibly identify its scope as **This whole Case** and provide an easy path to change it to **A specific image / stimulus**.

Changing Case → stimulus:

- reuses the existing Question Prompt identity where appropriate;
- preserves the relationship-specific answer exactly;
- deactivates/removes the active Case-wide relationship;
- creates/reactivates the exact-image relationship;
- preserves the cross-Stimulus-Group Prompt conflict invariant;
- removes Topic reuse only under the existing safe semantics, never by deleting legitimate use belonging to another Case.

After the move, the question no longer belongs in the Case Questions list.

## 5. Keep Case Questions tidy

The Case Questions section contains only questions that apply to the whole Case regardless of the selected stimulus.

Do not duplicate exact-image questions into that section. Stimulus-specific questions are managed primarily beside the image where they live. Alternative-set-wide questions remain at the set level.

This is important when a Case has several ECGs, radiographs, or other stimuli: the Case Questions area must not become a second flattened list of every contextual question.

## 6. Stimulus cards and question management

Fixed and alternative image cards use clinically useful contain-fit previews and can open the shared Admin image viewer.

An image card should remain compact. Show:

- the image;
- Case-specific caption/set context;
- **Image-specific questions · N**;
- a short prompt summary/list when useful;
- collapsed **Manage questions** controls.

Inside **Manage questions**, preserve the ability to:

- create a new exact-image question;
- move an existing Case-wide question here;
- edit an existing exact-image question;
- remove an existing exact-image question.

Do not render every question/answer textarea open by default.

Alternative option cards also retain active state, ordering, caption editing and explicit same-Case **Move to another set…** behaviour.

## 7. Exact-option identity and Prompt invariant

An exact-image question belongs to the `stimulus_group_option`, not to the global Asset. Reusing the same Asset elsewhere does not carry unrelated Case-specific questions with it.

The invariant in `stimulus-groups.js` remains authoritative:

> The same Question Prompt cannot be independently attached to multiple active Stimulus Groups within one Case where both groups may be selected in the same Review.

Do not bypass this invariant during fixed-image conversion or Case-question moves.

Within different options of the same Alternative set, identical prompt wording may reuse one Question Prompt while each option keeps an independent answer on its own relationship.

## 8. Same-Case option Move

Image Management V2 permits:

```text
Case A / Alternative Set 1 / Option X
→ Case A / Alternative Set 2 / Option X
```

The operation re-parents the existing option in place and preserves:

- option ID;
- Asset identity;
- Case-specific caption;
- active state;
- exact-option questions/answers.

Set-wide questions remain with their original sets. Cross-Case/ownership/conflict/coverage-invalid moves are rejected.

## 9. Asset picker and uploads

**Add images from library** remains a bounded searchable picker rather than rendering the full library inside the Case editor.

Administrators can search/browse eligible Assets, select several Assets, attach them as fixed images, add them to an alternative set through the safe relationship endpoint, and upload a new image through the protected R2 media pipeline.

Normal guardrails remain authoritative: authenticated/authorized writes, supported type/size, managed R2 storage ceiling, immutable production object key, optional source/provenance metadata, and no invented attribution.

## 10. General fixed-versus-alternative safety

Outside the exact-question authoring semantic operation, do not silently convert an image merely because it is selected in another image-management control.

Bulk Add-to-alternative-set rejects a fixed relationship rather than silently converting it. If an Asset is already in another alternative set in the same Case, use the explicit same-Case Move operation. Inactive options are not silently reactivated by bulk Add.

The stimulus-specific question workflow is the narrow exception because conversion is an internal implementation detail required to express the author's requested exact-image scope safely.

## 11. Image Library scalability and Collections

The full `/admin/images` and `/preview-admin/images` libraries retain Image Management V2 behaviour:

- 60 Assets per server-backed page;
- exact matching result count;
- deterministic search/filter/sort;
- explicit cross-page selection within one canonical query context;
- exact Select All up to 300 matching Assets;
- explicit refusal above 300;
- current-page Shift-range only;
- selection reset when authoritative query context changes.

Relationship/metadata bulk mutation requests remain bounded to `<= 30` unique Asset IDs per server request, with larger selections split into sequential browser-side chunks.

Image Collections remain organisational only. Deleting/changing a Collection never changes Case relationships, Tags, questions, Reviews, learner routing, or R2 identity.

## 12. Production / Preview behaviour

The production and Preview workspaces continue to share the real Case-editor UI where possible, but mutation authority differs.

Production Admin may perform the new stimulus-scope operation on production-owned Cases/assets subject to normal validation.

Preview must not gain unintended production mutation authority. The production-only fixed-conversion/scope endpoint is not exposed as a Preview mutation path; the shared UI hides those controls in Preview while existing Preview-safe named actions continue to follow their ownership rules.

Preview must never mutate production Asset metadata, production Collections, production R2 objects, production Cases, or production stimulus relationships.

`test/admin-editor-preview-contract.test.js` remains the shared-editor contract for named form actions/data and now also asserts that the production stimulus-scope path is not introduced into the Preview adapter.

## 13. Stimulus-specific coverage

Coverage rules remain learner-authoring semantics. Bulk Add, detach, deactivate, conversion, reorder, same-Case Move and question-scope operations must preserve applicable fixed question-count/coverage constraints.

Auto-created one-option groups use the ordinary no-guarantee coverage baseline; adding the exact question does not create a new coverage guarantee by itself.

## 14. Asset metadata versus Case metadata

Global reusable Asset metadata includes administrator filename/name, alt text, source label/URL, licence, Collection, active state, and immutable storage identity.

Case relationship metadata includes fixed/alternative membership, display order, Case-specific caption, exact-option contextual questions, and group membership/settings/questions.

Transparent fixed conversion preserves that boundary: the Asset remains the same reusable Asset; only its Case-level learner relationship representation changes.

## 15. Regression expectations

Changes to image/question authoring should protect:

- Case-wide versus stimulus-specific author mental model;
- clinically useful image display;
- bounded Case picker behaviour;
- atomic fixed-image conversion + question assignment;
- exact-option Prompt/answer identity;
- cross-group Prompt conflict protection;
- safe Topic reuse semantics;
- Case Questions containing only Case-wide questions;
- compact stimulus question management;
- one-option learner behaviour equivalent to the previous fixed image;
- existing PR #56 workflows;
- production/Preview ownership isolation;
- existing scalable Image Library and Collection rules.

## 16. Validation standard

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```
