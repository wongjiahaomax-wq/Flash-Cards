# Local UX iteration with real production content

_Status: implemented design record._

_Last reviewed: 22 August 2026._

The developer workflow described by this design is implemented as the local production-like development replica.

Operational instructions are authoritative in:

```text
docs/LOCAL_DEVELOPMENT_REPLICA.md
```

The decision about **where** development/validation should execute when the developer is on a laptop versus mobile is authoritative in:

```text
docs/DEVELOPMENT_EXECUTION_WORKFLOW.md
```

## Implemented decision

Rapid UX iteration uses:

```text
local code
→ allowlisted production content copied read-only from D1 into local D1
→ teaching media copied read-only from production R2 into local R2
→ local Better Auth administrator
→ Vite/Svelte hot reload
→ normal validation
→ PR
→ production-backed Preview
→ merge
```

The local application does **not** use writable production bindings during ordinary development.

The earlier design considered a read-only remote R2 binding. The implemented workflow chose the safer fallback anticipated by the design: mirror the teaching objects referenced by production-owned Asset rows into local R2. This keeps runtime reads and all developer mutations fully local.

## Laptop versus mobile execution

This workflow is specifically the **laptop/local** path. When a laptop is available, prefer local Vite iteration, local replica reuse, local validation and `npm run preview` before spending GitHub Actions minutes on remote deployment.

When the developer is mobile or has no terminal access, do not pretend the local replica ran. Use the connected GitHub tooling and configured CI for supported repository/validation work, then use the permanent production-backed Preview workflow only when a remote Preview is actually needed. See `DEVELOPMENT_EXECUTION_WORKFLOW.md` for the exact fallback rules when workflow dispatch is or is not available from the active GitHub integration.

## Relationship to other local tooling

The local production-like replica and the slide import reviewer are separate tools:

```text
Local replica
= run the real application against production-derived local content

Slide reviewer/finalizer
= review/edit a Reviewable Import Bundle and deterministically produce Import Package v1
```

The slide-review tool does not use the replica D1/R2 state, and the replica does not consume review bundles or production import-job staging.

A completed slide review still goes through:

```text
Reviewed Bundle
→ deterministic finalizer
→ flashcards-import-v1.zip
→ Production Admin Import package
```

The replica is therefore not an alternate production-import route, not a production backup, and not a place to resume `import_jobs`.

## Safety invariants retained from the design

- production D1 is a source only and is queried by fixed `SELECT` statements;
- production R2 is a source only and is accessed by object `GET`;
- application writes affect local D1/R2 only;
- production auth/users/sessions and learner Review/progress data are not mirrored by default;
- Preview-session rows and import-job state are not mirrored;
- production import staging objects are not mirrored as part of normal teaching media refresh;
- generated replica material remains beneath gitignored local paths;
- branch migrations may be applied locally but never remotely by the refresh workflow;
- the production-backed Preview Worker remains the pre-merge integration environment.

## Implemented commands

```sh
npm run local:setup
npm run local:refresh
npm run local:refresh:d1
npm run local:refresh:r2
npm run local:admin
npm run dev
npm run preview
```

Use `npm run dev` for the normal hot-reload loop. Use `npm run preview` as a later local production-style Worker/runtime check; it remains local and does not deploy the Cloudflare Preview Worker.

Related but separate slide-review commands are:

```sh
npm run slide-review:build
npm run slide-review:test
npm run slide-review:finalize -- reviewed.zip [output.zip]
```

See `LOCAL_DEVELOPMENT_REPLICA.md` for exact setup, credentials, troubleshooting, cleanup, and open-source handling. See `DEVELOPMENT_EXECUTION_WORKFLOW.md` for laptop-versus-mobile execution and GitHub Actions minute policy. See `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` for the review/finalization contract.

## Non-goals retained

This workflow does not create two-way sync, a staging database, a second permanent R2 bucket, automatic production migrations, a production data editor, an authentication bypass, a source-reconstruction engine, or a production import-job mirror.
