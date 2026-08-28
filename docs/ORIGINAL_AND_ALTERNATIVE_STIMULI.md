# Original and Alternative Stimulus Semantics

_Status: implemented in PR #108 for issue #105. A committed migration or passing repository validation does not by itself mean the feature has been migrated/deployed to production._

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

The Admin cleanup audit flags uncurated production families for curation. Retained Preview-owned families are outside this cleanup/authoring feature.

## Eligibility and integrity

An Original must be an option that:

- belongs to the same stimulus family;
- is active;
- is not `removed_from_case`;
- points to an active Asset.

Application/domain mutation paths preflight the current Original before destructive or role-changing writes. The current Original cannot normally be deactivated, removed from the Case, moved to another family, or moved to Always shown / supporting until another eligible option has first been made Original. These failures use actionable domain validation such as:

```text
Choose another Original stimulus before deactivating this image.
Choose another Original stimulus before removing this image from the Case.
```

Migration `0016` also keeps database triggers as defense in depth so invalid direct SQL cannot silently break the family invariant. The normal Admin UX should not rely on a D1 trigger error as its expected control flow.

Changing the Original updates only the family pointer. It does not recreate the option, Asset, exact-image questions, captions/order, or reusable-question opt-ins.

## Migration rules

Migration `0016_original_stimulus_options.sql` adds:

```text
stimulus_groups.original_option_id
```

Backfill policy is deliberately conservative and production-scoped:

- active **production** family with exactly one eligible option → auto-designate that option as Original;
- active production family with multiple eligible options → leave Original unassigned;
- retained Preview-owned family → leave Original unassigned, even if it has one option;
- do not infer Original from display order, insertion order, name, filename, caption, or prior Review history.

The schema guard also requires a newly inserted Stimulus Group to begin with `original_option_id = NULL`. The family/options are created first; an explicit validated update then assigns an eligible option as Original. This avoids brittle circular creation semantics and prevents arbitrary non-null Original pointers during INSERT.

A committed `0016` file is not proof that production D1 has applied it.

## Source-aware family creation versus generic insertion

Generic option insertion does **not** auto-designate an Original. Sequential insertion order is not source semantics.

The production **Start Alternative Set** workflow is different because the Admin has already made an unambiguous semantic choice:

```text
Case has ordinary image A
→ Admin chooses A
→ Start Alternative Set
→ create family with Original = NULL
→ preserve A as that family's option
→ explicitly assign that same option as Original
→ remove the old ordinary case_assets relationship
```

Those writes form one coherent domain operation and preserve failure atomicity. If Original assignment/conversion fails, the ordinary image remains and no partial family is left behind.

Later adding B through the generic option path does not change the pointer:

```text
A remains Original
B is Alternative
Core → A
Expanded → B when eligible, otherwise A
```

A production authoring/import workflow may otherwise designate an Original automatically only when it has equally explicit, source-faithful semantics. It must never use “first inserted” as a substitute for such semantics.

## Correcting a wrong Original

A mistakenly chosen Original is corrected through normal family authoring, not higher-resolution replacement and not re-uploading unrelated images:

```text
Original A was wrong
→ add correct image B to the same family
→ Make Original on B
→ B becomes Original
→ A becomes an ordinary Alternative
```

Only after B is Original may the Admin choose what to do with A:

```text
keep A as Alternative
OR move A to Always shown / supporting
OR deactivate A
OR Remove A from Case
```

This ordering preserves Asset identity, Stimulus Option identity, Case-specific exact-option questions, Reusable Image Question opt-ins, captions/order, and historical Review provenance unless the chosen follow-up operation explicitly changes one of those relationships.

## Ordinary learner images and ambiguous UI

Exactly one ordinary `case_assets` learner image **and no active stimulus family** can be described as the source-faithful single ordinary image representation. It appears in both Core and Expanded modes and is not placed in the cleanup queue.

The presence of one ordinary supporting image is not enough to call it the Case's “Original” when an active uncurated family also exists. The Case editor must avoid that misleading shortcut.

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
- requires another Original to be selected before the current Original can be deactivated, removed, moved between families, or moved out to supporting;
- warns when a legacy production family has no curated Original;
- avoids describing one ordinary image as the unique Original when an active uncurated family is also present;
- links to the global stimulus cleanup audit.

Successful **Make Original** and **Move to Always shown** mutations return to the actual `#stimulus-curation` panel. SvelteKit `redirect()` is performed after fallible database work, outside broad mutation `try/catch` blocks, because `redirect()` throws internally.

Existing image authoring controls remain responsible for adding Alternatives and reordering options. Starting a new Alternative family from an ordinary image uses the source-aware atomic operation described above. Together with the reverse conversion, authors can restructure existing images without re-uploading them.

## Alternative → Always shown and reverse conversion

Moving a non-Original Alternative to Always shown / supporting is non-destructive:

```text
Alternative option
→ ordinary case_assets relationship using the same Asset/caption
→ old Stimulus Option relationship archived (`removed_from_case = true`, inactive)
```

The old option row remains available for historical provenance and restoration. If that same Asset is later moved back into its original family and current validation permits restoration, the existing archived Stimulus Option identity is restored rather than creating a different option identity.

The current Original cannot take this path until another option is promoted first.

## Cleanup audit

`/admin/stimulus-cleanup` distinguishes:

- **Cleanup required** — an active production family has eligible options but no valid Original;
- **Review suggested** — a production Case has multiple ordinary learner images and no curated Original family;
- no entry for a Case whose only relevant image state is one ordinary learner image.

The audit is advisory for ambiguous ordinary images and authoritative for uncurated production stimulus families. Preview-owned content remains outside this feature.

## Historical Review safety

Historical Reviews are immutable snapshots.

`review_assets` already stores the selected Asset plus `source_stimulus_group_id` / `source_stimulus_option_id`, while `review_questions` snapshots the selected question provenance and content. Changing a family Original therefore affects only future Review creation.

For example:

```text
Review R1 created while A is Original
→ R1 keeps A / A's Stimulus Option provenance

Admin promotes B to Original
→ future Core Review R2 selects B
→ R1 remains unchanged
```

Moving an Alternative to Always shown / supporting does not rewrite historical Review rows. Its Asset remains the same Asset, and the old option row is retained in an archived relationship state.

Do not rewrite historical Review rows during Original curation, role conversion, or migration.

## Higher-resolution replacement is a different operation

Higher-resolution replacement means:

```text
same underlying image + better-quality copy
```

It preserves the existing Stimulus Option ID while replacing that option's current Asset A with successor Asset B. If that option is the family Original, `original_option_id` continues to point to the same option ID. Case-specific exact-option questions therefore remain attached to the same contextual identity.

A genuinely different image that should replace a wrong Original is **not** a higher-resolution replacement. Add it as another family option and use **Make Original**.

## Preview Admin boundary

The retained Preview Admin subsystem has no new Original/Alternative authoring UX in issue #105.

Migration `0016` therefore does not auto-curate Preview one-option families, and production Original guards are not intended to make ordinary legacy Preview editing unusable. Existing Preview ownership predicates and safety boundaries remain in force; this feature does not add Preview parity or production mutation authority to Preview.

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
2. using **Start Alternative Set** on that image so the chosen source becomes explicit Original;
3. adding true Alternatives to that family;
4. leaving genuine supporting images as ordinary always-shown / supporting images;
5. correcting a mistaken Original by adding the correct option and promoting it before removing/moving the old one.

This is a post-import authoring decision, not a second semantic AI transformation of the approved import bundle.
