# Case editor fast-review design

_Status: implemented in `agent/case-editor-fast-review-compact` for review. This status describes the implementation branch, not production deployment. Classic mode remains the compatibility path._

_Last updated: 22 August 2026_

## 1. Goal

The Compact Case editor is designed primarily for **fast review of all clinically relevant information in one Case**.

The governing interaction rule remains:

> Information needed to judge whether the Case is correct stays visible. Controls needed only to manipulate the Case may be visually secondary.

The implementation is a presentation/read-projection refactor. It does not change the content model, learner resolver, Review provenance, fixed/alternative semantics, reusable-image opt-in rules, or image mutation safety.

## 2. Scope and compatibility

This implementation applies to **Compact mode** only. Classic mode retains the preceding editor presentation and interaction paths.

No schema or migration is introduced. The final audit and completeness counts are derived from the bounded `selectedCase` editor read model already loaded for the current Case.

A future `Review focus` toggle remains out of scope.

## 3. Prompt and Answer remain visible together

Compact mode keeps ordinary Case-wide Prompt/Answer fields visible together. On wide screens the existing Case-wide rows preserve their side-by-side rhythm.

The fast-review implementation extends that same principle to:

- Case-specific Image Questions;
- Reusable Image Questions explicitly used by the current Case/stimulus;
- Alternative-Set-wide questions.

Image-linked review rows use a compact image reference plus Prompt and Answer columns on wide screens, and reflow on narrower screens rather than forcing unusably narrow columns.

Reusable Image Questions that merely exist on the Asset but are not opted into the current stimulus are not rendered as Case questions. Their available count remains secondary through the existing management affordance.

## 4. Accessible explanatory help

Compact mode reduces permanent explanatory copy where the relationship is already represented by a concise label. Small `ⓘ` controls provide the longer meaning for concepts including:

- Primary Topic and Study Topic;
- Case/Topic routing;
- fixed images;
- Alternative Sets;
- Case-wide questions;
- Case-specific Image Questions;
- Reusable Image Questions;
- set-wide questions;
- the final all-questions audit.

The help control supports pointer hover, keyboard focus, click/tap, `aria-expanded`, descriptive accessibility text, and Escape dismissal. Essential semantics continue to be present in the visible labels and are not color-only or hover-only.

## 5. Case completeness summary

Compact mode now shows a quiet structural summary before the main section navigation. It includes:

- Primary Topic and active Additional Study Topics;
- active fixed-image count;
- active Alternative Set and option counts;
- Case-wide question count;
- active Case-specific Image Question count;
- explicitly-used Reusable Image Question count;
- active set-wide question count;
- total rows in the final Case audit.

The summary is intended to expose obvious omissions quickly without adding success-state decoration to every object.

## 6. Images and stimulus sets

### 6.1 Relationship model remains explicit

The UI continues to distinguish:

```text
FIXED
```

from:

```text
ALTERNATIVE · <set name>
```

An alternative option is never presented as merely “not fixed”.

### 6.2 Horizontal overview strips

When a Case has several fixed images, Compact mode adds a horizontally scrollable fixed-image overview strip.

Every Alternative Set has its own ordered strip when it contains options. Each strip:

- preserves current display order;
- keeps set membership visible in the option label;
- supports touch/trackpad horizontal scrolling;
- exposes keyboard-focusable image targets;
- provides left/right scroll controls on wider screens;
- jumps to the corresponding detailed image/Q&A block when an item is activated;
- uses no third-party carousel dependency.

The detailed image block remains the place for full authoring controls and opens the existing shared Admin image viewer.

### 6.3 Existing image controls are preserved

The implementation retains the existing authoring paths for:

- fixed-image attach/picker/upload;
- fixed-image caption and reorder/removal workflows;
- starting or entering Alternative Sets;
- alternative-option reorder;
- activate/deactivate;
- Case-specific captions;
- Case-specific Image Question management;
- Reusable Image Question opt-in management;
- same-Case **Move to another set…**;
- **Remove from Case**;
- advanced set/coverage management.

Move and Remove remain distinct semantic operations. Removing an option from a Case does not convert it into a fixed image or delete the reusable Asset.

## 7. Image-centred Q&A review

Compact alternative-option blocks now expose actual clinically relevant Q&A in the main scroll flow instead of relying on counts plus `Manage questions`.

### Case-specific Image Questions

Each active relationship row shows:

```text
small exact-image reference | Prompt | Answer | Save
```

The Prompt and contextual answer remain directly editable with the existing `saveStimulusOptionQuestion` action. The small image reference opens the existing Admin image viewer.

### Reusable Image Questions used in this Case

Only explicit current opt-ins are expanded into the main review surface. The exact-image reference, canonical Prompt, and canonical Answer remain visible together.

Production Admin can edit the canonical answer through the existing reusable-image action. Shared Prompt wording continues to use the existing guarded shared-edit path in the Asset/Question management surface rather than bypassing blast-radius semantics from the Case editor.

Preview Admin renders canonical reusable content read-only, preserving the existing production-only reusable mutation boundary.

### Available reusable questions

Available-but-unused Asset Questions remain secondary as a count/management path. They are not included in the Case audit and are not presented as questions currently belonging to the Case.

## 8. Set-wide Q&A

For an active Alternative Set with active options, active set-wide Prompt/Answer pairs are visible in Compact mode without opening the advanced disclosure.

They are labeled:

```text
SET-WIDE · <set name>
```

and remain directly editable through the existing `saveStimulusGroupQuestion` mutation.

The set strip remains nearby. The UI does not falsely attach a set-wide question to any one exact option.

## 9. Final master audit — All questions in this Case

Compact mode adds a final **All questions in this Case** audit below the ordinary authoring sections.

It is an Admin-only projection of the existing bounded Case editor data. It creates no database rows, does not feed the learner resolver, and does not persist a cross-scope order.

Current audit sources are:

- active Case-wide questions;
- active set-wide questions for active sets with an active selectable option;
- active Case-specific Image Questions for active/selectable exact options;
- active Reusable Image Questions explicitly opted into those exact options.

The audit excludes:

- reusable Asset Questions that are only available to reuse;
- inactive Case/group/option question relationships;
- inactive/unselectable stimulus contexts;
- duplicate copies of the same relationship emitted by the review projection.

### Deterministic presentation order

The audit order is structural rather than educational:

1. whole-Case questions in their existing Case order;
2. any current fixed-image reusable context, if one is ever present in the read model;
3. active Alternative Sets in their existing loaded/display order;
4. active set-wide questions in their existing scope order;
5. active options in their existing display order;
6. within an option, Case-specific questions followed by explicitly-used reusable questions.

This ordering is not persisted and does not claim learner priority. Learner precedence and final Review ordering remain separate resolver concerns.

## 10. Audit source previews

Image-bound audit rows show a compact source label and image indicator rather than a permanent thumbnail column.

The source indicator exposes a small preview by hover/focus and supports click/tap pinning. The preview can open the shared Admin image viewer. Keyboard users can dismiss pinned state with Escape.

Set-wide rows preview a small strip of the relevant active set instead of pretending one exact image owns the question.

## 11. Responsive behavior

The Compact implementation is designed for:

- no-image Cases;
- one fixed image;
- several fixed images;
- one Alternative Set with many options;
- multiple independent Alternative Sets;
- mixed fixed + alternative stimuli;
- long Prompt/Answer content;
- many exact-image questions;
- used Reusable Image Questions;
- set-wide questions.

Wide layouts keep image reference, Prompt and Answer aligned. Tablet layouts reduce the row to two columns. Narrow mobile layouts stack the fields while retaining the exact image/source label.

The final audit converts from a table to labeled stacked rows at narrow widths.

## 12. Performance/read-model boundary

The final audit and summary are built by `src/lib/admin-case-question-audit.js` from the current Case editor `selectedCase` payload.

No broad Case, Asset, or Question library read was added. The existing reusable-image join already selects the current Case's reusable questions; the implementation exposes `questionPromptId` from that same joined row so the audit can retain stable Prompt/source identity without another query.

The Case editor's recent exact-ID/bounded read-model work remains intact.

## 13. Tests

Focused pure-helper tests cover:

- Case-wide source mapping;
- exact-image source mapping;
- reusable exact-image source mapping;
- set-wide source mapping;
- exclusion of available-but-unused reusable questions;
- exclusion of inactive/non-participating relationships;
- deterministic structural ordering;
- duplicate suppression for repeated copies of one valid relationship;
- fast completeness counts.

Existing Case-editor and image-workflow tests continue to guard the underlying authoring semantics.

## 14. Non-goals retained

This first pass does not:

- change learner selection/resolver semantics;
- change question ownership semantics;
- change Review snapshots/provenance;
- add schema or migrations;
- introduce a global persisted question order;
- add autosave;
- replace the Reusable Image Question model;
- redesign the Image Library;
- retire or deliberately redesign Classic mode;
- implement the optional Review Focus toggle.

## 15. Deployment/status boundary

This document describes the implementation present on the feature branch / implementation PR once those commits exist. It must not be used as evidence that the behavior is deployed to production.

After merge, repository status documents may describe the feature as implemented on current `main`. Production deployment remains a separately verified operational fact.
