# Engineering Architecture Guidelines

This document is the repository-wide authority for the **direction of application architecture and structural refactoring** in Flash-Cards.

It guides future coding work toward clearer ownership, stronger contracts, and smaller cohesive modules while preserving the project's current SvelteKit modular-monolith model.

These are **directional defaults, not a mandate to refactor nearby code in every PR**. Behavioral correctness and focused scope come first. Existing legacy patterns may remain until appropriately scoped work touches them. Architectural improvements should normally be incremental and behavior-preserving unless the task explicitly changes behavior.

## 1. Architectural model: modular SvelteKit monolith

Flash-Cards intentionally remains a **modular SvelteKit monolith**.

Prefer this conceptual dependency direction:

```text
Svelte components / routes
        ↓
request / workflow orchestration
        ↓
domain-specific application modules
        ↓
database / storage infrastructure
        ↓
D1 / R2
```

Dependencies should normally flow downward. Lower-level modules should not depend on route or component implementation details.

Keep the architecture as simple as possible while preserving clear ownership boundaries. Do not introduce microservices, event buses, dependency-injection frameworks, repository-interface layers around every table, or other enterprise architecture merely for conceptual purity.

## 2. Incremental TypeScript direction

New application modules should default to TypeScript where supported by the existing repository and toolchain.

When functionality is extracted from an existing JavaScript module, the new focused module should normally be TypeScript when that can be done without expanding the behavioral scope of the PR.

This is an incremental migration policy:

- existing JavaScript does **not** need to be converted merely because a file is touched;
- do not initiate broad JavaScript-to-TypeScript conversion as incidental cleanup;
- JavaScript and TypeScript are expected to coexist during the migration period;
- a feature or bug-fix PR must not become a large TypeScript migration unless conversion is explicitly part of the requested scope.

TypeScript should improve contracts and agent comprehension rather than merely change file extensions. Prefer meaningful types at module boundaries. Avoid unnecessary `any`, broad casts, or weakly typed interfaces that defeat the purpose of the migration.

## 3. Module responsibility and file size

Prefer cohesive modules with one principal responsibility.

File size is an architectural signal, not by itself a correctness rule. Use these approximate heuristics when deciding whether a file is accumulating too many independently changing concerns:

| Approximate size | Guidance |
| --- | --- |
| Under ~300 lines | Usually no concern solely because of size. |
| ~300–500 lines | Consider whether multiple responsibilities are beginning to emerge. |
| ~500–800 lines | Actively evaluate natural extraction boundaries before adding substantial new functionality. |
| Over ~800 lines | Treat as an architectural hotspot. Adding another independent responsibility should require explicit justification. |

These are not CI limits. Do not split a cohesive module merely to satisfy a line-count target, and avoid artificial fragmentation where understanding one operation requires jumping through many tiny files.

## 4. Existing architectural hotspots

Future agents should not automatically append functionality to an already-large file merely because related code currently lives there.

Before adding substantial functionality to a large module:

1. identify the ownership boundary of the new behavior;
2. determine whether that boundary already has a focused module;
3. when proportionate to the task, extract or create a focused module;
4. keep the existing large file as a coordinator or compatibility facade where that reduces migration risk.

Do not turn every small bug fix into a refactor. Extraction should be proportionate to the task and preserve behavior unless behavior change is explicitly requested.

## 5. Thin routes and UI coordinators

Route components should primarily coordinate page-level state and compose focused UI components.

Server route/action files should primarily:

- authenticate and establish request context;
- validate request-boundary input;
- invoke canonical domain operations;
- translate domain results/errors into HTTP or SvelteKit responses.

Substantial business rules should normally live in focused domain/server modules rather than directly inside:

```text
+page.svelte
+page.server.ts
+server.ts
API route handlers
```

Avoid accumulating unrelated application behavior inside route files. A route may still contain small request-specific orchestration when extracting it would add indirection without a meaningful ownership benefit.

## 6. Explicit domain ownership

Important behavior should have one canonical owner.

Examples of domain concepts include:

- Cases;
- Questions;
- Assets;
- Topics;
- Preview Sessions;
- Preview Case lifecycle;
- Imports;
- Reviews;
- authentication and authorization.

A future coding agent should be able to answer:

> If I change this behavior, which module owns it?

Avoid multiple independent implementations of the same business rule. Other modules should call the canonical owner rather than reimplementing the invariant.

## 7. Dependency direction

Prefer dependencies that move from higher-level orchestration toward lower-level domain and infrastructure code:

```text
UI
→ route/server orchestration
→ domain/application module
→ database/storage
```

Avoid inversions such as:

```text
database module → route helper
shared server module → Svelte component
storage primitive → Admin-specific UI behavior
```

Do not introduce circular dependencies merely to reuse a convenient helper. If reuse would violate ownership direction, move or redesign the shared primitive at the appropriate boundary.

## 8. Purpose-specific read models

Prefer purpose-specific reads over universal “load everything” functions when consumers genuinely require different data shapes or performance characteristics.

Examples:

```text
getAdminDashboardSummary()
getCaseEditorModel()
getLearnerCase()
getPreviewCase()
```

are generally clearer than one enormous operation such as:

```text
getCase()
```

that returns every related record for every workflow.

Query only the data required for the specific page or workflow. Filter and bound data in SQL where practical instead of loading broad collections and filtering them in application code.

Do not split reads merely for naming aesthetics. Use distinct read models when they encode genuinely different consumers, contracts, or performance needs.

## 9. Reads versus mutations

Keep the conceptual distinction between **queries/reads** and **commands/mutations**.

This does not require formal CQRS infrastructure or prescribed filenames. The goal is simply to make it clear whether an operation reads application state or changes application state and therefore must preserve invariants.

Avoid giant modules where unrelated reads and mutations accumulate indefinitely.

## 10. Authorization and data-integrity invariants

Security and data-integrity invariants should live as close as practical to the operation they protect.

Do not rely exclusively on every caller remembering to perform a separate ownership check. Where practical, canonical operations should enforce required ownership/scope conditions themselves or invoke the canonical guard internally.

Examples include:

- Production-versus-Preview isolation;
- Preview Session ownership;
- production-only mutations;
- Asset ownership/lifecycle restrictions;
- Admin authorization.

Do not duplicate security guards across modules. Use one canonical implementation for each invariant and preserve the repository-specific semantics documented in `AGENTS.md` and the relevant subsystem authority.

## 11. Transaction boundaries

A transaction should normally correspond to a business operation when partial completion would leave invalid or inconsistent state.

If an operation logically performs several dependent writes, do not casually expose those writes as independent caller responsibilities. Prefer a canonical domain operation with an appropriate transaction boundary.

For example, a Case creation or clone operation that must copy dependent relationships and update associated state should be atomic when partial completion would violate an application invariant.

Do not introduce transactions unnecessarily around independent operations.

## 12. Domain-specific names over generic utility dumping grounds

Avoid dumping domain behavior into generic modules such as:

```text
utils.ts
helpers.ts
common.ts
misc.ts
db-utils.ts
```

when the contained behavior has a meaningful domain owner.

Prefer names such as:

```text
question-selection.ts
asset-usage.ts
preview-session-lifecycle.ts
case-ownership.ts
markdown-validation.ts
```

Small genuine infrastructure utilities are acceptable. The rule is not that generic filenames are forbidden; it is that domain behavior should not lose its ownership merely because several callers reuse it.

## 13. Avoid boolean-driven universal APIs

Avoid operations that grow into collections of workflow mode flags, for example:

```text
getCase({
  includeInactive,
  includeAssets,
  preview,
  admin,
  learner,
  includeHistorical
})
```

when those combinations correspond to genuinely different workflows.

Prefer purpose-specific contracts when they make ownership and behavior clearer:

```text
getAdminCaseEditor()
getPreviewCase()
getLearnerReviewCase()
```

Do not mechanically create separate functions when a small, coherent option genuinely belongs to one operation.

## 14. Characterization tests before sensitive legacy refactors

Before materially decomposing a sensitive or complex legacy subsystem, capture important current behavior with focused characterization tests where practical.

Particularly protect:

- authorization and ownership;
- transaction behavior;
- lifecycle semantics;
- selection/resolution rules;
- data filtering;
- error semantics;
- Preview-versus-Production behavior.

Characterization tests provide a behavioral fence for refactoring. Do not write exhaustive tests for implementation details merely because a file is large.

## 15. Abstraction policy

Prefer the smallest abstraction that clearly represents a real domain concept or repeated invariant.

Do not generalize code solely because two implementations currently look similar. Prefer explicit domain operations, clear invariants, and focused tests over premature generic frameworks.

Avoid, without demonstrated need:

- abstract base classes;
- service/repository interfaces with only one implementation unless the boundary provides concrete value;
- generic entity systems;
- generic scoped-resource helpers that obscure different security semantics;
- infrastructure introduced solely because it resembles “clean architecture”.

Duplication can sometimes be safer than an incorrect abstraction.

## 16. Refactor discipline and PR scope

Architectural direction must not become an excuse for scope expansion.

For ordinary feature and bug-fix PRs:

- implement the requested behavior narrowly;
- use existing architectural boundaries where appropriate;
- improve a nearby boundary when doing so materially simplifies or protects the requested change;
- do not perform unrelated cleanup;
- do not convert an entire subsystem to TypeScript;
- do not move many unrelated files;
- do not redesign APIs unrelated to the task.

Large architectural changes should receive their own focused PRs.

## 17. Stable public facades during staged refactors

When decomposing an existing large subsystem, preserving a stable public facade is encouraged where doing so reduces migration risk.

Conceptually:

```text
large-module.js
    ↓ stable exports
focused-module-a.ts
focused-module-b.ts
focused-module-c.ts
```

Existing callers do not need to be rewritten simultaneously simply because internals are being decomposed. Remove or redesign the facade only when there is a deliberate later reason to do so.

## 18. Comments and documentation should explain invariants

Comments should primarily explain:

- why an invariant exists;
- security/data-integrity boundaries;
- non-obvious compatibility constraints;
- intentionally unusual behavior;
- reasons an apparent simplification is unsafe.

Avoid comments that merely restate obvious implementation syntax. Types, names, and module boundaries should carry as much explanatory burden as practical.

## 19. Future advisory architecture checks

This document does **not** add automated enforcement.

Future repository tooling may provide advisory signals for architectural drift, such as:

- very large newly created source modules;
- significant growth of known architectural hotspots;
- new JavaScript application modules where TypeScript is appropriate;
- prohibited dependency directions;
- route modules accumulating substantial business logic.

Such checks should initially be advisory rather than arbitrary hard failures. Any automated enforcement should be introduced later in its own focused PR after the rules have proven useful in normal development.

## 20. Agent decision checklist

Before adding substantial code, ask:

1. What domain owns this behavior?
2. Is there already a canonical module for it?
3. Am I adding another independent responsibility to a large file?
4. Should a new or extracted module be TypeScript?
5. Does this business rule belong in the route/UI or in a domain module?
6. Am I creating a universal API when separate workflows have different contracts?
7. Is authorization enforced close enough to the mutation?
8. Could partial writes leave invalid state?
9. Am I introducing a generic abstraction without a demonstrated need?
10. Am I expanding this PR beyond the requested behavior?

This checklist guides judgment. It does not mechanically require architectural work in every PR.

## Direction, not mandate

Use these guidelines to make future work **naturally move toward** clearer modular ownership over time.

The repository does not require every coding task to refactor nearby legacy code first. In particular:

- behavioral correctness comes first;
- focused PR scope remains important;
- existing legacy patterns may remain until touched by appropriately scoped work;
- incremental improvement is preferred over large migrations;
- architectural improvements should be behavior-preserving unless the task explicitly changes behavior.

When a structural improvement would substantially broaden an ordinary feature or bug fix, record it as follow-up work instead of forcing it into the current PR.
