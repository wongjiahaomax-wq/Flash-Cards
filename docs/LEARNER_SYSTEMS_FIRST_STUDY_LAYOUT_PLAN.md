# Learner Systems-First Study Layout Plan

_Status: proposed implementation plan for Draft PR._

_Last updated: 31 August 2026_

## Goal

Make the learner Study entry experience reflect the existing contextual navigation model:

```text
Study
→ choose System
→ choose All / Topic / curated Tag
→ choose question set
→ start Review
```

The learner should not be confronted with a long flat list of Topics as the primary information architecture once System navigation is ready for rollout.

The Production Admin portal's **Preview learner study** entry must also show this prospective learner experience, even while the real learner rollout flag remains disabled. Admin preview should therefore be useful for reviewing learner UX before production learner rollout rather than merely mirroring the currently enabled rollout state.

This work must not redefine the taxonomy model, Case classification, question eligibility, Review provenance, or production content.

## Current state

The repository already implements System-aware learner navigation behind the existing `SYSTEM_STUDY_NAVIGATION_ENABLED` rollout flag.

When the flag is enabled, `/study` receives `systems` from `listStudySystems()` and supports the existing `startSystem` action with these routes:

- `all`;
- `topic:<topicId>`;
- `tag:<tagId>`.

When the flag is absent or not exactly `true`, `/study` intentionally falls back to the older flat Topic list.

The current System-enabled presentation is functionally complete but visually dense: every System card immediately exposes its route choices, question-pool controls, and Start button. As the number of Systems/Topics/Tags grows, this makes the landing page behave more like a configuration form than a learner navigation page.

There is also a separate Admin-preview problem. The Production Admin dashboard currently implements **Preview learner study** as a plain link to `/study`. That means Admin preview inherits the ordinary learner feature flag. While System navigation is disabled for learners, the Admin sees the legacy Topic view too, which prevents the Admin portal from previewing the learner experience being prepared for rollout.

The existing `/admin` layout is already a strong Production Admin boundary: it rejects the Preview Worker, requires authentication, and requires the production `admin` role. This is distinct from the repository's separate Preview Worker / `preview_admin` subsystem.

## Product model to preserve

The existing contextual navigation contract remains authoritative:

- **System** is the top-level learner navigation grouping.
- **Topic** is the canonical Case classification and direct Topic-question scope.
- **Tag** is cross-cutting metadata that may be curated as a learner route within one or more Systems.
- A Case still has one canonical Primary Topic plus zero or more Case Tags.
- Selecting a Tag route does not reclassify the Case or substitute another Study Topic.
- `System → All` remains the deduplicated union of native descendant Topic routes plus curated Tag routes, with native Topic provenance taking precedence for duplicate Cases.
- Existing Review provenance and Next-case behavior remain unchanged.

## Proposed learner experience

### Stage 1 — choose a System

`/study` should initially present compact System choices rather than the full nested configuration for every System.

Each System choice should show only the information useful for choosing a System:

- System name;
- eligible Case count;
- a clear affordance to open/select that System.

The first viewport should answer one question:

> **What System do I want to study?**

Do not show every Topic, Tag, question-pool choice, and Start button for every System simultaneously.

### Stage 2 — configure the selected System route

After a System is selected, progressively disclose that System's study options while de-emphasising the other Systems.

Present the route choices in this order:

1. **All cases** — the primary/default option for the selected System;
2. **Topics** — native descendant Topic routes;
3. **Curated Tags** — explicitly labelled as Tags and visually secondary to Topics.

Keep Topic and Tag semantics distinguishable. A learner should not infer that a curated Tag is a canonical Topic merely because both can be selected as study routes.

For nested Topics, retain the existing breadcrumb/context where it helps disambiguate the hierarchy.

### Stage 3 — choose question set

Show the existing question-pool choice only after the learner has selected/opened a System:

- **Original questions** — default;
- **Expanded Learning**.

This control configures the selected Review; it should not dominate the landing page.

### Stage 4 — start Review

Use the existing System-review creation path.

The learner should have one obvious primary action for the currently selected System/route:

```text
Start review →
```

Validation errors should remain attached to the selected System configuration rather than surfacing against unrelated System cards.

## Production Admin learner-preview requirement

The Production Admin portal must be able to preview the same prospective systems-first learner experience before the feature is enabled for ordinary learners.

Required behavior:

1. **Preview learner study** from the Production Admin dashboard opens an Admin-authorized learner preview rather than the rollout-gated legacy Topic view.
2. The preview uses the same System chooser/configuration UI as the real learner view. Do not maintain a separate visual mock that can drift from `/study`.
3. The Admin preview loads `listStudySystems()` regardless of `SYSTEM_STUDY_NAVIGATION_ENABLED`, because its purpose is to inspect the prospective System experience before rollout.
4. If the Admin starts a review from that preview, use the same System-route validation and Review creation semantics as the real learner flow. The bypass of the rollout flag must exist only inside the authenticated Production Admin preview boundary.
5. The ordinary learner `/study` route continues to respect `SYSTEM_STUDY_NAVIGATION_ENABLED` until rollout is explicitly approved.
6. A non-Admin must not be able to obtain the preview by adding a query parameter or otherwise forcing preview state on `/study`.
7. The existing Preview Worker / Preview-only Admin restriction remains intact. This Production Admin learner preview is not the Preview Worker subsystem.

### Preferred route boundary

Prefer a dedicated route under the existing Production Admin authorization tree, for example:

```text
/admin/study-preview
```

The Admin dashboard shortcut should point there.

This is preferable to a query-string override such as `/study?preview=true`, because the authorization boundary is explicit and the ordinary learner route does not need a hidden feature-flag bypass.

The Admin preview may include a small surrounding indicator such as **Admin learner preview** and a **Back to Admin** affordance, but the actual learner chooser/configuration should be the shared learner UI.

## Preferred implementation shape

Avoid copying the existing `/study` markup into an Admin page.

Preferred approach:

1. extract the System-first chooser/configuration presentation into a focused shared Svelte component;
2. use that component from the real `/study` page when System navigation is enabled;
3. add an Admin-only learner-preview route under `/admin` that always loads the System navigation data and uses the same shared component;
4. change the Admin dashboard **Preview learner study** shortcut to that route;
5. retain the existing server-side System route membership checks and Review creation behavior;
6. if action code needs reuse, extract only the smallest coherent server helper rather than creating a second independent implementation;
7. preserve the ordinary `/study` legacy Topic fallback until the rollout decision changes.

The implementation should remain small. The new Admin route exists to provide an explicit authorization boundary, not to establish a second learner application.

## Layout direction

### Desktop

- compact System-card grid at the top level;
- after selection, a focused configuration panel for the selected System;
- clear section headings for All, Topics, and Tags;
- avoid repeating the full question-set form for every System simultaneously.

### Mobile

- single-column System choices;
- selected System configuration should read naturally top-to-bottom;
- controls and Start button should remain comfortably tappable;
- long Topic/Tag names and breadcrumbs must wrap without horizontal overflow.

## Empty and edge states

- Systems with zero eligible Cases remain excluded by the existing navigation builder.
- If a System has no eligible Topics, omit the Topics section.
- If a System has no eligible curated Tags, omit the Tags section.
- `All cases` remains available for any System returned to the learner because returned Systems already have at least one eligible Case.
- Preserve the existing database-not-configured state.
- Preserve the existing block on learner Study for the separate Preview Worker / Preview-only Admin environment.
- Production Admin learner preview must not weaken `/admin` authentication or Production-vs-Preview ownership boundaries.

## Rollout boundary

Admin preview and learner rollout are intentionally different concerns.

The current production configuration does not declare `SYSTEM_STUDY_NAVIGATION_ENABLED=true`, and the existing product contract treats enabling that flag as the Phase B learner rollout step after taxonomy curation/reachability has been reviewed.

Therefore:

- Production Admin should be able to preview the systems-first experience now;
- ordinary learners remain behind the existing flag during implementation and review;
- Admin preview must not mutate the flag or implicitly enable the feature globally;
- decide explicitly, after UX/taxonomy validation, whether this PR should also enable production System navigation or whether rollout should be a separate narrow change;
- do not mutate production D1/R2 merely to test the layout.

## Expected implementation surface

Likely files include:

```text
src/routes/study/+page.svelte
src/routes/admin/+page.svelte
src/routes/admin/study-preview/+page.svelte
src/routes/admin/study-preview/+page.server.js
src/lib/components/<focused shared study chooser>.svelte
```

Potential focused tests/contracts include existing System navigation contracts plus focused Admin-preview authorization/wiring coverage.

Server/domain files should change only where necessary to share the existing System-start behavior safely. No schema or migration change is expected.

## Acceptance criteria

1. With System navigation enabled, the initial learner Study view presents Systems as the primary choices.
2. Topic/Tag/question-set controls are progressively disclosed for the selected System rather than repeated in full for every System on initial load.
3. `All cases` remains the default route for a selected System.
4. Topics and curated Tags remain semantically and visually distinguishable.
5. Existing System-route eligibility, Case deduplication, question-pool behavior, Review provenance, and Next-case behavior are unchanged.
6. Validation errors remain associated with the selected System configuration.
7. The layout remains usable on narrow/mobile viewports without horizontal overflow.
8. While the ordinary learner rollout flag is disabled, normal `/study` continues to show the existing Topic flow.
9. While that same flag is disabled, Production Admin **Preview learner study** shows the prospective systems-first learner view.
10. The Admin preview and real systems-first learner view share the same learner chooser/configuration component or otherwise have one presentation owner; they must not be independently duplicated UIs.
11. Starting a System Review from Admin preview uses the same route validation and Review semantics as the real learner path, without globally enabling the feature.
12. Non-Admins cannot force the Admin preview/bypass from `/study`.
13. Preview Worker / Preview-only Admin restrictions remain unchanged.
14. No application-domain, schema, migration, production-content, or deployment change is introduced merely to accomplish the layout and preview work.

## Validation plan

During implementation:

- use Vite/HMR for presentation iteration where available;
- exercise at least a System with several Topics, a System with curated Tags, and a System with both;
- verify Original and Expanded Learning starts still submit the intended route;
- verify form-error state remains on the selected System;
- verify narrow/mobile layout and long labels/breadcrumbs;
- with the rollout flag disabled, verify ordinary `/study` still uses the legacy Topic flow;
- with the rollout flag disabled, verify an authenticated Production Admin can open the systems-first learner preview;
- verify a non-Admin cannot access the Admin preview route;
- verify the Preview Worker does not gain Production Admin learner-preview authority;
- run focused contextual System navigation and Admin route contracts as appropriate;
- use `npm run agent:checks` to determine repository-required validation;
- run the repository's normal validation contract before implementation handoff when local execution is available, otherwise rely on and report GitHub CI evidence accurately.

## Explicitly out of scope

- changing the System/Topic/Tag domain model;
- adding Additional Study Topics;
- changing Case classification;
- changing question eligibility/provenance semantics;
- changing Review/Next-case behavior;
- schema or migration work;
- production D1/R2 mutation;
- unrelated Admin taxonomy UX;
- redesigning or expanding the separate Preview Worker subsystem;
- deploying the Worker;
- silently enabling the production learner feature flag before the rollout decision is reviewed.
