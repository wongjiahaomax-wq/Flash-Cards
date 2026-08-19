# Local UX iteration with real production content

_Status: implemented design record._

The developer workflow described by this design is now implemented as the local production-like development replica.

Operational instructions are authoritative in:

```text
docs/LOCAL_DEVELOPMENT_REPLICA.md
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

## Safety invariants retained from the design

- production D1 is a source only and is queried by fixed `SELECT` statements;
- production R2 is a source only and is accessed by object `GET`;
- application writes affect local D1/R2 only;
- production auth/users/sessions and learner Review/progress data are not mirrored by default;
- Preview-session rows and import-job state are not mirrored;
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
```

See `LOCAL_DEVELOPMENT_REPLICA.md` for exact setup, credentials, troubleshooting, cleanup, and open-source handling.

## Non-goals retained

This workflow does not create two-way sync, a staging database, a second permanent R2 bucket, automatic production migrations, a production data editor, or an authentication bypass.
