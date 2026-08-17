# Local UX iteration with real production content

_Status: agreed workflow design; implementation pending_

## Why this exists

The current repository has a deliberately conservative Preview workflow: a candidate UX change normally becomes a PR, passes the normal validation suite, is manually deployed to the production-backed Preview Worker, is inspected, and is then restored/reset before the next candidate.

That remains the correct integration and pre-merge validation workflow, but it is too slow for rapid visual iteration such as changing spacing, hierarchy, image sizing, navigation placement, card density, or alternative layout variants.

For UX work, the preferred future loop is:

```text
local code
→ real production content copied into a local D1 snapshot
→ real teaching images available for read-only inspection
→ Vite/Svelte hot reload
→ repeated local visual iteration
→ clean implementation
→ normal validation
→ PR
→ production-backed Preview
→ merge
```

The intent is to make GitHub/Cloudflare Preview the final integration gate rather than the mechanism used for every small design experiment.

## Current repository baseline

At the time this document was written:

- `npm run dev` runs `vite dev`;
- `npm run db:migrate:local` applies D1 migrations to the local development database;
- production teaching content is stored in D1;
- teaching images are private R2 objects;
- the production-backed Preview Worker deliberately shares the production D1 and R2 bindings while isolating mutable Preview content through explicit Preview ownership;
- the existing Preview deployment workflow is PR-based and runs the normal validation suite before deployment.

Do not interpret any proposed convenience command in this document as already implemented. This document records the desired workflow and safety contract for a later implementation PR.

## Decision

Use **local development with real production content** as the primary rapid UX iteration environment.

The default mode should **not** point the application directly at the production D1 database. Instead, the developer should refresh a local D1 snapshot from production and run local code against that snapshot.

This gives local UX development the real Cases, Questions, Topics, Tags, auth-shaped data, and edge cases already present in the application while preventing accidental writes from changing the production database.

## Target development modes

### 1. Normal local real-data mode — default

This should be the normal UX workflow.

```text
local SvelteKit/Vite code
        ↓
local D1 snapshot copied from production
        +
production teaching images available read-only
```

Properties:

- local code changes use normal Vite/Svelte hot reload;
- D1 writes affect only the local snapshot;
- the snapshot can be thrown away and regenerated;
- the developer can inspect real production content rather than artificial fixtures;
- normal UX experiments do not require a PR or Cloudflare deployment;
- production R2 must never be writable from this mode.

### 2. Local live-data mode — exceptional/read-only

A second, deliberately harder-to-enter mode may later be provided for cases where the exact current production dataset matters and refreshing a snapshot is undesirable.

```text
local code
   ↓
remote production D1/R2 bindings
```

Cloudflare supports remote D1 and R2 bindings during local development, while Worker code continues executing locally.

This mode must be treated as a production connection, not a simulation.

Required safety contract if implemented:

- visibly label the UI as using live production data;
- disable or reject all application mutations server-side;
- do not rely only on disabled buttons;
- block D1 write paths;
- block R2 `put`/`delete` paths;
- block Admin form actions/imports/user-management actions that can mutate production;
- default back to snapshot mode when the process restarts;
- require an explicit developer action/configuration to enable live mode.

This mode is optional. Snapshot mode is the priority.

## Production D1 → local snapshot

Cloudflare D1 supports exporting a remote database to SQL and executing that SQL into a local D1 database. The implementation should wrap this in a safe developer command rather than requiring the owner to remember raw Wrangler commands.

Conceptually:

```text
production D1
   ↓ export schema + data
local temporary SQL snapshot
   ↓ reset/recreate local D1
local D1 populated with production content
```

A future convenience command may be named something like:

```sh
npm run dev:refresh-real
```

The exact command name is not yet part of the repository contract.

The implementation should:

1. require Cloudflare authentication suitable for D1 export;
2. export the production D1 schema/data to a local ignored path;
3. reset the local D1 development state safely;
4. import the exported SQL into local D1;
5. preserve the production database unchanged;
6. print an unambiguous success/failure summary;
7. ensure exported production data is never committed to Git;
8. avoid exposing credentials or auth secrets in generated files/logs.

## R2 strategy

The real teaching images are important to UX work, especially ECG/image-heavy learner and Admin screens.

Preferred initial strategy:

- keep D1 local via a production snapshot;
- allow production R2 teaching images to be read remotely during local development;
- enforce read-only behaviour for that production R2 binding.

The implementation must not allow local UX experiments to upload, replace, rename, or delete production R2 objects.

If a robust server-side read-only guard cannot be guaranteed, fall back to a local R2 copy/cache for the subset of Assets needed by the development session rather than exposing a writable production binding.

## Safety invariants

The implementation PR must preserve all of the following.

### Production D1 safety

Normal local UX mode must not execute application writes against production D1.

A production snapshot is disposable local development data. Mutating it is expected and safe.

### Production R2 safety

If real production teaching images are read through a remote R2 binding, that binding is read-only from the application's perspective.

No local development action should be capable of calling a production teaching-image `put` or `delete` path.

### Secrets and personal data

Production snapshots may contain application/user data and must be treated as sensitive local development artifacts.

- snapshot SQL/database files must be gitignored;
- do not package them into CI artifacts;
- do not upload them to Preview/production deployments;
- do not print secrets/session material unnecessarily;
- document cleanup when a machine is transferred or no longer used for development.

If the production dataset later contains data that should not be routinely copied to a developer laptop, introduce a sanitised export step before making snapshot refresh broadly available.

### Schema compatibility

A local snapshot must be compatible with the checked-out code.

If the branch contains an unapplied schema migration that production does not yet have, the refresh workflow must not silently pretend production matches that branch. The implementation should either:

- refresh from production and then apply the branch's local migrations, where that is safe for local testing; or
- stop with a clear warning when schema compatibility cannot be established.

No unmerged migration is applied remotely as part of local UX refresh.

## Intended owner workflow

At the start of a UX session:

```text
refresh local real-data snapshot
→ start local dev server
→ open localhost
```

Then iterate without commits/deploys:

```text
inspect a real Case
→ change Svelte/CSS/component behaviour
→ hot reload
→ inspect another real Case/edge case
→ repeat
```

When the design is accepted:

```text
clean up implementation
→ run normal validation
→ commit
→ open PR
→ deploy candidate to production-backed Preview
→ final integration inspection
→ merge
```

The existing production-backed Preview Admin workspace remains valuable because it tests the finished candidate against the real deployed runtime, real bindings, auth boundaries, and disposable Preview-owned mutation model. Local development does not replace that final gate.

## What local iteration should be used for

Good candidates:

- layout and spacing;
- image sizing/placement;
- learner Case/question hierarchy;
- navigation placement;
- responsive behaviour;
- list/card density;
- filters and controls;
- alternative presentation variants;
- checking real long/short content and image aspect ratios;
- Admin information architecture where no production write is required.

Use the production-backed Preview workflow before merge when testing:

- real Admin mutations;
- Preview clone/reset behaviour;
- authentication/authorization boundaries;
- R2 uploads;
- imports;
- production-like Worker behaviour;
- any change whose correctness depends on remote bindings or deployed runtime behaviour.

## Optional UX-lab route

A dedicated `/ux` route is optional, not required for this workflow.

The primary goal is to render the real application locally against real content. A UX lab can later be useful for side-by-side variants (`A/B/C`) or deliberately extreme states, but should reuse production components and must not become a second UI implementation that drifts from the real application.

## Proposed implementation scope

A later implementation PR should be narrow and developer-focused. It should aim to add:

- a documented one-command production-D1 → local-D1 refresh path;
- secure ignored storage for the exported SQL/snapshot;
- safe reset/import of local D1;
- a normal local development command/workflow that uses the refreshed local D1;
- real image loading suitable for local UX inspection, preferably through a read-only remote R2 path;
- hard server-side protection against production mutations from any remote binding used locally;
- clear terminal/UI indication of the active development data mode;
- documentation for setup, refresh, start, cleanup, and troubleshooting;
- tests for the mutation guards where practical.

Do not combine this developer-workflow PR with unrelated product/schema work.

## Acceptance criteria for the future implementation PR

The workflow is successful when the owner can:

1. refresh local content from current production with one documented command;
2. start local development with one documented command;
3. navigate real production-derived Cases, Questions, Topics, Tags and images locally;
4. change Svelte/CSS and see the result via hot reload without committing or deploying;
5. make local Admin edits that affect only the local D1 snapshot;
6. confirm production D1 remains unchanged;
7. confirm production R2 cannot be mutated from the normal local UX mode;
8. delete/reset the local snapshot and regenerate it cleanly;
9. move an accepted change into the normal PR → Preview → merge workflow.

## Non-goals

This workflow does not:

- replace CI;
- replace the production-backed Preview Worker;
- create another production/staging database;
- require a second permanent R2 bucket;
- make production D1 writable from ordinary local development;
- make Preview migrations automatic;
- turn UX experiments into production-visible changes;
- require Storybook or Figma.

## Cloudflare capability references

The design relies on current Cloudflare capabilities documented by Cloudflare:

- D1 remote export can produce SQL for local development/testing and that SQL can be executed against local D1;
- local Workers development uses local simulated bindings by default;
- D1 and R2 support per-binding remote connections during local development;
- remote bindings connect to the real remote resource, so mutations must be treated as real production mutations.

Because Wrangler/Cloudflare development behaviour can change, the implementation PR should re-check current Cloudflare documentation before choosing exact Wrangler flags/configuration.
