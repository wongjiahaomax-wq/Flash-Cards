# Case editor fast-review design

_Status: pending design for future implementation. This document does not describe current implemented behavior._

_Last updated: 22 August 2026_

## 1. Goal

The Compact Case editor should primarily support **fast review of all clinically relevant information in one Case**.

The author should be able to scan the Case, its stimuli and every question/answer pair quickly enough to detect missing, incorrect, duplicated or mis-scoped content without repeatedly opening disclosures or remembering which image a question belongs to.

The governing interaction rule is:

> Information needed to judge whether the Case is correct stays visible. Controls needed only to manipulate the Case may be visually secondary.

This is a presentation/interaction design. It must preserve the existing content model, learner resolver, Review provenance and current safe image/stimulus mutations unless a later implementation PR explicitly scopes a behavioral change.

## 2. Scope

This design applies to **Compact mode** only.

Classic mode should remain behaviorally unchanged during the first implementation pass unless a later decision explicitly retires it.

The first implementation should be a UI/UX refactor rather than a schema project. No migration should be required merely to implement this design.

## 3. Core review principles

### 3.1 Prompt and answer remain visible together

Do not collapse ordinary questions into prompt-only outline rows.

For Case-wide, Case-specific Image, Reusable Image and set-wide questions, the review surface should preserve a consistent two-column rhythm:

```text
Prompt | Answer
```

The author should be able to scan both sides simultaneously. Editing controls may be compact, but the Prompt and Answer themselves should not require an extra click to reveal.

Text areas/fields should be dense enough for rapid review without becoming spreadsheet-like one-line cells. They should allow common 2–4 line content to remain readable and may grow for longer content.

### 3.2 Clinical content expanded; management controls secondary

Keep visible by default:

- Case title and stem;
- current Topic context;
- learner-facing images/stimuli;
- Case-specific Image Question Prompt/Answer pairs;
- Reusable Image Question Prompt/Answer pairs that are explicitly used in this Case/stimulus;
- alternative-set-wide Prompt/Answer pairs where applicable;
- Case-wide Prompt/Answer pairs;
- a final all-questions audit view.

Controls such as moving images, changing set membership, deactivating/reactivating, removing relationships, editing provenance, advanced coverage settings and other low-frequency administration may be placed behind concise menus/disclosures as long as the existing actions remain easy to discover.

### 3.3 Explanations behind accessible info controls

Long permanent explanatory prose should be reduced where the relationship can be represented clearly through labels and badges.

Use small `ⓘ` help controls next to concepts such as:

- Primary Topic;
- Study Topic;
- Fixed image;
- Alternative image;
- Case-wide question;
- Case-specific Image Question;
- Reusable Image Question;
- set-wide question.

On pointer devices, the explanation may appear on hover. It must also be keyboard/focus accessible, and touch devices need an equivalent tap interaction. Do not make essential semantics mouse-hover-only.

## 4. Page hierarchy

Compact mode should read as an authoring workspace rather than a long stack of equally weighted admin panels.

Recommended high-level order:

```text
Case header / review summary
Case details
Topics / routing summary
Images and stimulus sets
  → image-specific/reusable/set-wide Q&A
All questions in this Case
Preview / review actions
```

A restrained sticky or side section navigation is appropriate on wide screens. Mobile/tablet layouts may collapse back to a horizontal or otherwise space-efficient navigation.

The page should use fewer nested bordered boxes. Reserve strong card treatment for real objects such as an image/stimulus set, while using spacing and subtle separators for question rows.

## 5. Case header and review summary

The top of the editor should provide a fast completeness summary, for example:

```text
Acute pericarditis
Cardiology · Primary
ECG · Study Topic
1 fixed image · 3 ECG alternatives · 8 Case-wide questions · 5 image questions · 3 reusable questions used
```

Exact copy and counts may be refined during implementation, but the purpose is to let the author detect obvious structural omissions before scrolling.

Normal/valid state should remain visually quiet. Draw stronger attention to actionable problems such as:

- missing answer;
- inactive or unavailable image;
- missing primary Topic;
- empty required content;
- invalid/incomplete relationship state.

Avoid filling the page with redundant green success indicators.

## 6. Images and stimulus sets

### 6.1 Preserve the real relationship model

Do not reduce the model to a misleading binary `Fixed / Not fixed` toggle.

The UI should identify the real learner relationship:

```text
FIXED
```

or:

```text
ALTERNATIVE · <set name>
```

and provide a concise placement/relationship control that maps to the existing safe mutations.

### 6.2 Preserve current image controls

The visual redesign must not accidentally remove existing authoring capabilities.

In particular, alternative-option management currently includes concepts such as:

- reorder within a set;
- activate/deactivate;
- move the existing option to another set in the same Case;
- remove the image relationship from the Case while retaining the reusable Asset in the Image Library and preserving historical Reviews;
- manage Case-specific captions;
- manage Case-specific Image Questions;
- manage explicit Reusable Image Question opt-ins.

Fixed-image workflows also need the existing safe paths for attaching images, creating/entering alternative sets and removing Case relationships where currently supported.

The redesign may consolidate these operations under a concise `Change placement`, `⋯`, or similar control, but it must preserve the semantic distinction between:

```text
move to another set
```

and:

```text
remove from this Case
```

Removing an alternative image from its Case is not the same operation as silently converting it back to a fixed image.

### 6.3 Carousel/strip for multiple images

For Cases with several related images or several options in an Alternative Set, use a compact horizontal image carousel/strip at the top of that set rather than forcing every full-size image into a wide multi-column layout.

Example:

```text
ALTERNATIVE SET · ECG
◀  [ ECG A ] [ ECG B ] [ ECG C ] [ ECG D ]  ▶
```

The carousel is an overview/navigation surface. It should make set membership and order obvious and allow the author to jump to the corresponding detailed image/Q&A block.

For fixed images, a similar compact strip/grid may be used where several fixed images form the Case presentation.

The implementation should remain usable with one image, many images and multiple independent Alternative Sets in the same Case.

## 7. Image-centred Q&A review

### 7.1 Keep image-linked Q&A content visible

The current compact-card counts are not sufficient for the fast-review goal.

For each image/stimulus that participates in the Case, Compact mode should show the relevant Prompt/Answer content directly with that image rather than requiring the author to open `Manage questions` merely to read it.

At minimum, show full two-column Q&A for:

```text
Case-specific Image Questions
Reusable Image Questions used in this Case
```

If the Alternative Set has set-wide questions, those should also be reviewable without losing their set context.

Reusable Image Questions that exist on the Asset but are **not** opted into the current Case/stimulus are not part of the current Case's possible learner questions. Their available count and management affordance may remain secondary rather than cluttering the main review surface.

### 7.2 Keep the associated image visible while scrolling

A long image block may contain many questions. The author should not have to scroll back upward to remember which ECG/X-ray/photograph the question refers to.

Recommended wide-screen structure:

```text
[small image] | Prompt | Answer
[small image] | Prompt | Answer
[small image] | Prompt | Answer
```

The repeated image cell may use a compact thumbnail, a sticky image reference within the block, or an equivalent implementation that keeps stimulus identity visually available while reviewing lower rows.

The image should remain clickable/tappable to open the shared Admin image viewer.

On smaller screens, preserve the association without forcing an unusably narrow three-column layout; the thumbnail may move above/beside the row responsively.

## 8. Question scope/source labels

Use concise scope/source labels to make question provenance immediately understandable:

```text
CASE-WIDE
IMAGE-SPECIFIC · ECG A
REUSABLE · ECG A
SET-WIDE · ECG alternatives
```

The exact user-facing terminology should stay aligned with the established model:

- **Case-specific Image Question** means Case + exact-image context;
- **Reusable Image Question** means canonical exact-Asset content explicitly opted into this stimulus;
- **set-wide** means valid for every option in that Alternative Set;
- **Case-wide** means applicable regardless of selected stimulus.

Badges should aid scanning rather than dominate it. Avoid a highly saturated rainbow of scope colors when a neutral badge plus source identity is sufficient.

## 9. Final master audit — All questions in this Case

The bottom of Compact mode should provide a final overview of **all questions that can currently participate in this Case**, not only Case-wide questions.

This is a Case-centred audit view of the same underlying relationships already shown in their authoring context. It must not create duplicate question records or alter resolver precedence.

Recommended columns:

```text
# | Prompt | Source / scope | Answer | compact actions
```

Example:

```text
Q1 | What is the diagnosis?        | CASE-WIDE              | Acute pericarditis
Q2 | What are the ECG changes?     | IMAGE-SPECIFIC · ECG A | Diffuse concave ST elevation...
Q3 | What is the treatment?        | CASE-WIDE              | NSAIDs and colchicine
Q4 | What rhythm is present?       | REUSABLE · ECG A       | Sinus rhythm
Q5 | What feature is common to...? | SET-WIDE · ECG set     | ...
```

The audit should include, when active/eligible for the Case:

- Case-wide questions;
- Case-specific Image Questions;
- Reusable Image Questions explicitly used in this Case/stimulus;
- Alternative-set-wide questions.

It should not treat reusable Asset Questions that are merely available-but-not-opted-in as questions in the Case.

The row should identify the exact source image/set whenever the question is not Case-wide.

### 9.1 Hover/focus source thumbnail

To keep the master table narrow, the Source/scope column does not need a permanently rendered image thumbnail.

For an image-bound source, show a compact source label such as:

```text
IMAGE-SPECIFIC · ECG A  [image indicator]
```

Hovering or keyboard-focusing the image indicator should reveal a small preview thumbnail/popover of the exact stimulus. Touch users need an equivalent tap interaction.

The preview should be sufficient to confirm stimulus identity without navigating away. The author should still be able to open the full shared image viewer when required.

This source preview is particularly valuable when a Case contains several visually similar ECGs/X-rays in one or more Alternative Sets.

## 10. Editing behavior

The review surface may remain directly editable. Prompt and Answer fields should not require entering a separate edit mode merely to make a small correction.

Low-frequency destructive/structural actions can remain secondary.

Where practical, save feedback should be compact and contextual. A future implementation may explore dirty/saved state, but this design does not require changing the server mutation model in the first pass.

## 11. Optional later Review Focus

A later enhancement may add a `Review focus` toggle within Compact mode.

Its purpose would be to hide most manipulation controls temporarily while preserving:

```text
Case stem
images/stimuli
all visible Prompt | Answer content
scope/source identity
final all-questions audit
```

This is optional follow-on work and should not block the main Compact-mode redesign.

## 12. Responsive behavior

The design must work for:

- a simple Case with no image;
- one fixed image;
- several fixed images presented together;
- one Alternative Set with many options;
- multiple independent Alternative Sets, for example ECG + CXR;
- mixtures of Case-wide, Case-specific, Reusable Image and set-wide questions;
- long Prompt/Answer content;
- desktop, tablet and narrow mobile widths.

Do not make the fast-review surface depend on hover alone. Hover may enrich desktop interaction, but focus/tap equivalents are required.

## 13. Non-goals for the first implementation

Do not use this redesign as justification to:

- change learner selection/resolver semantics;
- change question ownership semantics;
- redesign the reusable Asset Question model;
- change Review snapshot/provenance behavior;
- remove existing safe image movement/removal actions;
- add a new schema solely for layout state;
- merge or deduplicate Questions/Assets;
- redesign the Image Library itself;
- retire Classic mode without a separate decision.

## 14. Acceptance direction for a later implementation PR

A later implementation should be considered successful when:

1. Compact mode is clearly optimized for rapid Case review.
2. Prompt and Answer remain visible together for every current Case question category.
3. Case-specific and currently used Reusable Image Question content is visible with the relevant image without opening `Manage questions` just to read it.
4. Several images and several Alternative Sets remain easy to understand through a compact image carousel/strip and clear set membership.
5. The relevant stimulus remains visually identifiable while the author scrolls through its Q&A.
6. Existing image management semantics, including same-Case option Move and Remove from Case, remain available and distinct.
7. Scope explanations move behind accessible `ⓘ` help rather than consuming permanent page space.
8. A final **All questions in this Case** audit shows all current Case-participating question sources with Prompt and Answer visible.
9. Image-specific/reusable rows identify their exact image/set source.
10. Hover/focus/tap source previews let the author verify the exact image from the final audit without making the table permanently image-heavy.
11. No schema or learner-behavior change is introduced merely for this visual redesign.

## 15. Relationship to current documentation

Until this design is implemented, `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` remains authoritative for current Case/Image authoring behavior, including its current compact-card counts and `Manage questions` interaction.

This document intentionally records a future Compact-mode presentation change that would make more Q&A content visible by default while preserving the underlying relationships and mutation safety described by the current workflow document.
