# Slide Reviewer Inline Crop — Third-Pass Planning Amendment

_Status: normative amendment for Draft PR #172. Planning only; do not implement, mark Ready, or merge yet._

This amendment closes the remaining third-pass planning gap. It supplements:

- `docs/SLIDE_REVIEWER_INLINE_CROP_PLAN.md`
- `docs/SLIDE_REVIEWER_INLINE_CROP_PLAN_SECOND_PASS_AMENDMENT.md`

All prior UX, source-selection, metadata-preservation, no-dependency/no-schema, protected-operation, strict-precommit, pointer-capture, and exact-token cleanup contracts remain unchanged.

## Protected crop Save must block keyboard shortcut entrypoints

The existing `operationGuard` protects DOM controls, but reviewer document-level keyboard shortcuts are a separate entrypoint. While any protected operation is active, and specifically while an accepted crop Save owns `operationGuard`, keyboard shortcuts must not invoke reviewer actions that can mutate/persist state, navigate Cases, or replace/re-render the active crop UI.

Current shortcut behavior includes:

- `A` / `a` → approve current Case (`approveCurrent()`);
- `R` / `r` → set current Case to needs review (`setCaseStatus('needs_review')`);
- `X` / `x` → reject current Case (`setCaseStatus('rejected')`);
- Space → current reviewer render transition (`renderCurrent()` path);
- `ArrowLeft` / `ArrowRight` → previous/next Case navigation through the existing controls.

These and any other reviewer shortcuts handled by the same global `keydown` listener must be inert whenever `operationGuard.active` is set.

## Required implementation shape

Prefer one early guard in the existing document-level `keydown` handler rather than duplicating protected-operation checks inside `approveCurrent()`, `setCaseStatus()`, navigation handlers, or render paths solely for keyboard safety.

Conceptually:

```text
document keydown
→ apply existing generic eligibility/input-focus checks
→ if operationGuard.active: return before any reviewer shortcut branch/action
→ otherwise process current shortcut mapping unchanged
```

The exact ordering relative to existing non-shortcut eligibility checks may follow the current handler, but the `operationGuard.active` check must execute before any shortcut can:

- call `approveCurrent()`;
- call `setCaseStatus()`;
- call `renderCurrent()`;
- click/dispatch previous/next navigation controls;
- mutate `index` / `selectedSourcePath`;
- persist/autosave;
- replace the crop editor DOM/state.

Do not add separate per-key booleans, duplicate crop-specific shortcut checks, or a second keyboard lock. `operationGuard.active` remains the single protected-operation source of truth.

Do not change the normal shortcut mapping or behavior when no protected operation is active.

This protection applies to **all** protected operations, not only crop Save, because the keyboard handler should respect the same `operationGuard.active` contract as disabled protected UI controls.

## Executable browser coverage

Static/regex inspection is not sufficient. Extend executable browser-transition/wiring coverage using the actual global keydown path.

Required deferred-operation test sequence:

```text
load a review bundle/Case
→ acquire an operationGuard token representing an accepted crop Save
→ keep that operation deferred/active
→ snapshot Case status, index/navigation state, persistence-call count, and render-call count
→ dispatch keyboard events through the document-level keydown handler
→ assert no reviewer transition occurs
→ finish the exact crop Save token
→ dispatch the same shortcuts again
→ assert normal shortcut behavior resumes
```

While the protected crop Save is active, dispatch at minimum:

- `A` and/or lowercase equivalent;
- `R`;
- `X`;
- Space;
- `ArrowLeft`;
- `ArrowRight`.

Assert while `operationGuard.active` is set:

- Case/review status is unchanged;
- no approval/rejection/needs-review mutation occurs;
- no persistence/autosave is invoked by those shortcuts;
- Case index/navigation state does not change;
- selected source/navigation state does not change as a side effect;
- no `renderCurrent()` transition replaces/re-renders the crop UI;
- the protected crop Save token remains active/current;
- shortcut dispatch cannot finish or otherwise alter operation ownership.

After releasing/finishing the exact crop operation token, prove the guard is not permanently suppressing shortcuts. At minimum show representative normal behavior again, for example:

- navigation shortcut changes Case/index as before;
- a status shortcut invokes the existing status transition as before;
- Space invokes its existing render behavior as before.

Use the existing browser harness/event wiring where possible. Do not satisfy this contract by calling action functions directly; the test must dispatch through the same document-level `keydown` listener used by the reviewer.

## Interaction with previous protected-operation contract

This amendment does not alter crop Save ownership or cleanup rules:

- crop Save still acquires `operationGuard` before async preparation;
- it still owns the exact token until persistence completes or the Save exits;
- exact-token cleanup remains try/finally-equivalent on every exit;
- unload protection remains active for the accepted crop Save lifetime;
- DOM controls remain protected as previously specified;
- keyboard shortcuts now obey that same active-operation lifetime.

Therefore a deferred crop Save has one consistent protection boundary:

```text
operationGuard.active
→ protected DOM operations blocked
→ reviewer keyboard shortcuts blocked
→ unload protection active
→ crop Save completes/fails/stales
→ exact-token cleanup
→ controls + shortcuts become usable again
```

## Acceptance addition

Add this row to the executable acceptance contract:

| Invariant | Required behavior | Required executable proof |
| --- | --- | --- |
| Keyboard shortcut serialization | while `operationGuard.active` is set, all reviewer global shortcuts are inert; after exact-token release they resume normal behavior | deferred protected crop-Save test dispatching A/R/X/Space/ArrowLeft/ArrowRight through the actual document keydown listener, asserting no mutation/persist/navigation/render while active and normal behavior after release |

## Luna/Codex implementation instruction addition

When implementation begins, the three planning documents form one normative contract. In addition to the prior protected-save rules:

> Guard the existing global reviewer `keydown` handler with one early `operationGuard.active` check before any reviewer shortcut action. While a protected crop Save is active, A/R/X/Space and navigation shortcuts must not mutate, persist, navigate, or render-transition the reviewer. Add executable browser coverage through the actual keydown listener proving suppression while active and restoration after exact-token release. Do not duplicate per-action/per-key guards solely for this requirement.

After this amendment, planning is implementation-ready.