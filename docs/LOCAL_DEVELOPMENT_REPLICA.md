# Local production-like development replica

_Status: implemented local developer workflow and primary application testing path._

_Last reconciled: 4 September 2026._

The GitHub repository is public. This runbook may still describe private operational boundaries because Production credentials, auth/user/learner data, and private teaching media are not public repository content.

Never commit Cloudflare credentials, Better Auth secrets, passwords, Production database exports, Production auth/user/session/learner data, mirrored private R2 bytes, `.dev.vars`, `.wrangler/`, local databases, or replica staging state.

## Purpose

The normal realistic development environment is a **local copy of Production teaching content**, not a writable localhost connection to Production bindings.

```text
Production D1/R2 teaching content
      ↓ deliberate read-only refresh
Local D1/R2
      ↓
npm run dev / npm run preview
      ↓
local browser
```

The goal is to test against realistic Topics, Cases, Questions, Tags, Assets, Collections, stimulus relationships, and other approved content while all local mutations remain disposable.

The production-backed remote Preview Admin environment is retained as an optional/safety-sensitive capability; it is not the normal final integration gate.

## Local runtime commands

### `npm run dev`

Fast development loop:

- Vite/Svelte HMR;
- local D1;
- local R2;
- local Better Auth;
- no Production mutation;
- no remote runtime bindings.

The repository-owned launcher uses repository-local Wrangler/XDG state so local development does not depend on a writable user-global Wrangler directory.

### `npm run preview`

Production-style local checkpoint:

- builds the SvelteKit Cloudflare Worker;
- applies checked-out migrations to local D1;
- runs the built Worker under the pinned Wrangler/workerd runtime;
- keeps D1/R2/auth local;
- does not deploy;
- does not refresh Production-derived content automatically.

Schema migration and content refresh are separate actions.

### `npm run local:stop`

Checkout-scoped cleanup for this repository's local Vite/Wrangler process trees.

Use it when switching dev/preview modes, when a stale local server owns a port, or before a required dependency clean refresh on Windows.

Do not replace it with broad machine-wide Node termination.

### `npm run deploy`

Actual Production deployment. This is **not** a local-replica command. Follow `docs/CLOUDFLARE.md` and use the separately authorized Production release workflow.

## Dependency preparation

After switching/syncing branches, use:

```sh
npm run deps:ensure
```

rather than unconditional `npm ci` for normal local preparation. The helper reuses a valid dependency tree only when its repository/runtime fingerprint matches.

Use:

```sh
npm run deps:ensure -- --force
```

for known damage/drift.

## Initial setup

From a correctly configured local checkout:

```sh
npm run deps:ensure
npm run local:setup
npm run local:admin
npm run dev
```

`local:setup` prepares/refreshed local content/state according to the current replica tooling. `local:admin` bootstraps the local administrator required for local testing.

Exact credential/configuration prerequisites remain in the implementation/runbook comments and environment examples; never commit real values.

## Refresh behavior

Use:

```sh
npm run local:refresh
```

only when the local Production-derived teaching content needs updating.

Available narrower refresh commands include the repository-owned D1/R2 variants defined in `package.json`.

A refresh is a local-development operation. It must not become a Production learner reset mechanism.

## What the replica may copy

The replica is for approved teaching/content structures required to exercise the app realistically.

It must not mirror Production learner/auth/runtime state. Current FSRS work specifically requires local replica/reset tooling to exclude Production:

- Better Auth users/sessions/accounts/verification state;
- learner preferences/profiles;
- learner×Case FSRS state;
- Scheduled events/optimizer evidence/learner aggregates/monthly analytics;
- active Reviews/questions/assets;
- Free completion receipts;
- staged learner-account-deletion state;
- legacy Review cutover-sentinel data;
- Preview session state;
- resumable import-job operational state.

Current implementation allowlists/guards are authoritative if this list evolves.

## Local learner/runtime reset

Destructive local refresh/reset tooling may clear local learner/runtime rows so a refreshed content replica remains safe/testable. That behavior is local-only tooling and is distinct from learner-facing Reset Progress / Fresh FSRS Start.

Never repurpose local reset helpers for Production data.

## Relationship to slide-review/import tooling

Keep these systems separate:

```text
Local production-like replica
= read approved Production content → write disposable local D1/R2 → run app locally

Local slide reviewer/finalizer
= review/edit a Reviewable Import Bundle → produce strict Import Package v1

Production Admin importer
= validate the final package → perform resumable Production writes
```

The local replica does not semantically reconstruct slides, finalize review bundles, or mirror Production import staging state.

## Validation workflow

Use the normal repository flow:

```sh
npm run agent:doctor
npm run agent:checks -- --compact
npm run validate:fast -- --compact
npm run validate:full -- --compact
```

Run only the checks required for the current risk during iteration, then all final required/specialized checks before handoff.

Local replica success is not Production deployment evidence.

## Safety invariants

- Production D1/R2 must never become writable test bindings for local app iteration.
- Production-derived auth/user/session/learner data must not enter the replica.
- Private R2 bytes must not be committed to this public repository.
- Refreshes must remain deliberate and bounded.
- Local runtime state belongs under ignored repository-local paths.
- Production deployment/migration remains a separate explicitly authorized operation.
