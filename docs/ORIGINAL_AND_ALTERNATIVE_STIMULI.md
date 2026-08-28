# Original and Alternative Stimulus Semantics

_Status: implemented in draft PR #108 for issue #105; validation is still in progress._

This document refines `STIMULUS_GROUPS_DESIGN.md` for the learner-facing meaning of principal images. Existing question-scope, reusable Asset Question, option identity, and Review provenance contracts remain in force unless this document explicitly changes stimulus selection.

The legacy Preview Admin workspace is outside this design. Issue #105's earlier Preview-parity requirement was explicitly superseded on 28 August 2026. New Original/Alternative authoring behavior targets the production Admin Case editor and learner Review flow only.

## Authoring mental model

A Case can contain two different kinds of learner images:

```text
Case
├── zero or more always-shown / supporting images
└── zero or more stimulus families
    ├── exactly one curated Original when the family is curated
    └── zero or more Alternatives
```

The terms mean:

- **Original** — the canonical principal stimulus for that family. Core study uses it.
- **Alternative** — a substitutable variant of the same principal stimulus family. Expanded study may use it instead of the Original.
- **Always-shown / supporting image** — an ordinary `case_assets` attachment. It appears regardless of which stimulus-family option is selected.

A Case may have multiple independent stimulus families. Each family resolves independently.

## Learner selection

For a curated active family with a valid `original_option_id`:

```text
Core (`question_pool_mode = core`)
→ choose Original

Expanded (`question_pool_mode = expanded`)
→ choose a random eligible non-Original Alternative when one exists
→ otherwise fall back to Original
```

The learner-selected study mode controls this behavior. It does not depend on whether that learner has previously completed the Case.

All always-shown / supporting Case images remain visible in both modes.

### Legacy unassigned families

A legacy family may temporarily have `original_option_id = null`.

For such a family, learner selection preserves the pre-#105 behavior: choose randomly from all eligible options. This compatibility behavior exists only so migration does not invent an Original for ambiguous historical data.

The Admin cleanup audit flags these families for curation.

## Eligibility

An Original must be an option that:

- belongs to the same stimulus family;
- is active;
- is not `removed_from_case`;
- points to an active Asset.

The database migration adds integrity guards so the current Original cannot be removed, deactivated, moved to another family, deleted, or have its Asset deactivated before another Original is selected.

Changing the Original updates only the family pointer. It does not recreate the option, Asset, exact-image questions, captions, or reusable-question opt-ins.

## Migration rules

Migration `0016_original_stimulus_options.sql` adds:

```text
stimulus_groups.original_option_id
```

Backfill policy is deliberately conservative:

- active family with exactly one eligible option → auto-designate that option as Original;
- active family with multiple eligible options → leave Original unassigned;
- do not infer Original from display order, name, filename, caption, or prior review history.

Newly authored one-option families auto-designate their sole eligible option when no Original exists. Adding later Alternatives does not change that Original automatically.

## Ordinary learner images

Exactly one ordinary `case_assets` learner image and no curated family is treated as the source-faithful legacy Original representation. It appears in both Core and Expanded modes and is not placed in the cleanup queue.

Multiple ordinary learner images are ambiguous. They may represent:

- one principal image plus supporting images; or
- several legitimate always-shown supporting images.

Therefore multiple ordinary images are only **Review suggested**. The system does not automatically convert or relabel them.

## Admin curation

The production Case editor exposes an **Original and Alternatives** panel that:

- shows the current Original per active family;
- labels other eligible options as Alternatives;
- allows an eligible Alternative to become the Original without changing option identity;
- allows a non-Original Alternative to move to **Always shown / supporting** without re-uploading or recreating its Asset;
- archives the prior option relationship rather than deleting it when moving an Alternative to supporting, preserving option identity and historical provenance;
- requires another Original to be selected before the current Original can be moved out of the family;
- warns when a legacy family has no curated Original;
- explains the one-image and multi-image compatibility cases;
- links to the global stimulus cleanup audit.

Existing image authoring controls remain responsible for creating families, converting ordinary Case images into family options, adding alternatives, and reordering options. Together with the reverse conversion above, authors can restructure existing images without re-uploading them.

## Cleanup audit

`/admin/stimulus-cleanup` distinguishes:

- **Cleanup required** — an active family has eligible options but no valid Original;
- **Review suggested** — a Case has multiple ordinary learner images and no curated Original family;
- no entry for a Case whose only relevant image state is one ordinary learner image.

The audit is advisory for ambiguous ordinary images and authoritative for uncurated stimulus families.

## Historical Review safety

Historical Reviews are immutable snapshots.

`review_assets` already stores the selected Asset plus `source_stimulus_group_id` / `source_stimulus_option_id`, while `review_questions` snapshots the selected question provenance and content. Changing a family Original therefore affects only future Review creation.

Moving an Alternative to Always shown / supporting does not rewrite historical Review rows. Its Asset remains the same Asset, and the old option row is retained in an archived relationship state.

Do not rewrite historical Review rows during Original curation, role conversion, or migration.

## Question semantics remain unchanged

This redesign does not change:

- Case Questions;
- stimulus-family questions;
- exact-option questions;
- reusable Asset Questions;
- reusable-question opt-in identity;
- contextual question precedence.

Questions continue to follow the option actually selected into a Review.

## Reviewed import workflow

The reviewed slide/import workflow remains source-fidelity-first.

Initial extraction should continue to reconstruct learner-facing source images as ordinary Case Assets unless the source itself provides an unambiguous reviewed reason to model alternatives. The extraction step must not guess which of several source images is the pedagogical Original.

After import, an Admin may curate the Case by:

1. identifying the principal source image;
2. creating or using a stimulus family for that principal image;
3. designating the canonical Original;
4. adding true Alternatives to that family;
5. leaving genuine supporting images as ordinary always-shown / supporting images.

This is a post-import authoring decision, not a second semantic AI transformation of the approved import bundle.
