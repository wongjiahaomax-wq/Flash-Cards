# Local production-like development replica

> **INTERNAL OPERATIONAL DOCUMENTATION**
>
> This runbook is intended for the private Flash-Cards repository. Review and remove/redact private operational details before making the repository public.
>
> Never commit Cloudflare credentials, Better Auth secrets, passwords, production database exports, production auth/user/session data, mirrored R2 bytes, `.dev.vars`, or `.wrangler/` state.

_Status: implemented local developer workflow._

_Last reviewed: 20 August 2026._

## Purpose

The normal rapid-development environment is a local copy of production **content**, not a direct connection from localhost to writable production bindings.

```text
Production D1/R2
      ↓ read-only refresh
Local D1/R2
      ↓
npm run dev
      ↓
localhost:5173
```

This lets the developer navigate real Topics, Cases, Questions, Shared Questions, Tags, Assets, Reusable Image Questions, Image Collections and stimulus relationships while UI/content experiments remain disposable local changes.

The production-backed Preview Worker remains the final integration gate before merge. Local replica mode is for fast iteration, not a replacement for Preview/CI/deployment verification.

## Relationship to import and slide-review tooling

The project now has several local/offline workflows with different responsibilities. Do not collapse them into one system:

```text
Local production-like replica
= read production content → write disposable local D1/R2 → run the app locally

Local slide reviewer/finalizer
= open a Reviewable Import Bundle → human edit/approve → produce Import Package v1

Production Admin importer
= validate exact production package → resumable production D1/R2 writes
```

The local replica:

- does not consume `*-review.zip` bundles;
- does not finalize slide review bundles;
- does not mirror or resume production `import_jobs`;
- does not mirror production `imports/staging/` operational R2 objects;
- does not act as a production import dry-run authority;
- does not create a two-way content sync or production backup.

The slide reviewer uses browser/ZIP state and IndexedDB for editorial work and is independent of the replica D1/R2 state.

## Safety contract

`npm run local:refresh` has a deliberately narrow remote surface:

- production D1: hard-coded `SELECT` queries only;
- production R2: object `GET` only;
- local D1: migrations/reset/import are allowed;
- local R2: object `PUT` is allowed;
- there is no production D1 write path;
- there is no production R2 put/delete path;
- there is no two-way synchronization.

The normal app still uses local D1/R2 bindings. Do not add `remote: true` to ordinary development bindings as a shortcut.

## Production data mirrored

The D1 allowlist currently mirrors production-owned rows from:

```text
concepts
image_collections
tags
cases
assets
question_prompts
asset_questions
case_concepts
case_assets
stimulus_groups
stimulus_group_options
stimulus_option_asset_questions
concept_questions
case_questions
stimulus_group_questions
stimulus_option_questions
case_tags
case_question_tags
shared_questions
shared_question_tags
```

Rows belonging to a Preview Session are filtered out from `cases`, `assets`, `question_prompts`, and dependent relationship/question rows. `asset_questions` and `stimulus_option_asset_questions` are included so the local replica reproduces current Reusable Image Question authoring state rather than only the image relationships.

The allowlist lives in `scripts/local-replica-lib.mjs`. Treat additions as security/privacy-sensitive changes: a new table is **not** mirrored merely because it exists.

## Production data deliberately excluded

The normal replica does not read production rows from:

```text
user
account
session
verification
reviews
review_questions
review_assets
preview_sessions
import_jobs
```

This keeps production Better Auth identities/credentials/session material, learner progress, Preview workspace state and operational import state out of the normal developer copy.

Local Better Auth tables exist because migrations create them, but they contain local-only identities created by `npm run local:admin`.

## R2 media selection

R2 mirroring is derived from the mirrored `assets.storage_key` rows. The workflow does not clone the whole production bucket.

For every mirrored Asset it performs:

```text
production R2 object GET
        ↓
ignored .wrangler staging file
        ↓
local R2 object PUT at the same key
```

Preview/import staging objects are therefore not copied merely because they exist in the bucket. In particular, `imports/staging/` ZIPs, execution plans and import media sidecars are production operational state and are outside the replica contract.

A missing production teaching object referenced by a mirrored Asset is reported explicitly. Stale unreferenced objects may remain in local R2 after a refresh; they are harmless because the refreshed local D1 no longer references them.

Inactive superseded Assets remain production content and are mirrored when present because Asset lineage and retained immutable teaching-image objects may be relevant to current authoring/history inspection. Learner Review rows themselves remain excluded.

## Requirements

Before using the replica:

1. clone/open the repository locally;
2. install dependencies with `npm ci` (or `npm install` when intentionally updating the lockfile);
3. authenticate Wrangler to the Cloudflare account, or provide a local-only least-privilege credential capable of production D1 reads and R2 object reads;
4. do not place refresh credentials in source control.

A credential blocker must be fixed by granting the required **read** access. Do not solve it by enabling remote runtime bindings or broadening the local app's write access.

## First-time setup

From the repository root:

```sh
npm ci
npm run local:setup
npm run local:admin
npm run dev
```

`npm run local:setup`:

1. creates `.dev.vars` with a random local Better Auth secret if `.dev.vars` does not already exist;
2. applies current migrations locally;
3. reads the allowlisted production D1 content;
4. resets only disposable local content/progress/Preview/import state while preserving local Better Auth identity tables;
5. imports the production-derived content into local D1;
6. copies R2 objects referenced by the mirrored Asset rows into local R2.

If `.dev.vars` already exists it is preserved.

### Self-referencing content import order

The checked-out schema has two self-referencing content relationships that require deterministic dependency ordering during local import:

```text
concepts.parent_id
assets.superseded_by_asset_id
```

Topic rows are inserted parent-first. Asset supersession rows are inserted **successor-first**: for `A → B → C`, local import inserts C, then B, then A. This means refresh correctness does not depend on arbitrary Asset ID ordering and the immediate D1 self-FK remains satisfied.

Missing referenced parents/successors or cycles fail closed rather than silently dropping lineage.

Before local content reset, the script clears both self-FKs locally (`concepts.parent_id` and `assets.superseded_by_asset_id`) and then deletes child tables before parent tables. `stimulus_option_asset_questions` is deleted before `asset_questions`, and `asset_questions` before `assets`.

These operations are **local-only**. They do not add any production mutation path.

## Local administrator

Public sign-up remains disabled locally, matching production auth behavior.

Create the local-only administrator with:

```sh
npm run local:admin
```

The command:

- applies local migrations first;
- writes only with `wrangler d1 ... --local`;
- refuses any `--remote` operation;
- prompts for name/email/password;
- hashes the password using Better Auth's existing crypto helper;
- assigns the `admin` role;
- verifies the resulting local credential account;
- safely no-ops when the same complete local administrator already exists.

Do **not** use `npm run admin:bootstrap` for local development. That is a production operator command.

## Daily workflow

Normal iteration:

```sh
npm run dev
```

Then open the Vite URL (normally `http://localhost:5173`), sign in with the local administrator, and use the real application surfaces.

When production content changes:

```sh
npm run local:refresh
npm run dev
```

Refresh is intentionally destructive to local content edits and local Review/progress state. Local administrator identity is preserved.

Component/CSS/Svelte changes can then be inspected with Vite hot reload without creating a PR or deploying a Worker for every iteration.

If the work is instead reviewing a slide reconstruction bundle, use the separate `slide-review:*` workflow rather than refreshing D1/R2.

## Individual refresh commands

Refresh D1 content only:

```sh
npm run local:refresh:d1
```

Refresh R2 media referenced by the current local Asset rows only:

```sh
npm run local:refresh:r2
```

Full content + media refresh:

```sh
npm run local:refresh
```

## Authentication validation

The isolated Better Auth regression smoke test remains separate from the real-content replica:

```sh
node scripts/local-auth-smoke.mjs
```

It uses its own disposable `.wrangler/auth-smoke` persistence directory. Its test administrator is not the administrator used by normal `npm run dev`.

After local setup, manually verify:

```text
signed out /sign-in loads
signed out /admin redirects to sign-in
signed out /study redirects to sign-in
local admin can sign in
/admin loads
/admin/cases loads
/admin/questions loads
/admin/shared-questions loads
/admin/images loads and images render
/admin/topics loads
/admin/tags loads
/study can navigate production-derived Cases
```

For current image authoring, also verify that Reusable Image Questions and their current Case/stimulus opt-ins appear locally for mirrored production Assets, and that superseded Asset lineage can be represented without requiring production Review history.

## Local mutation safety check

A useful manual confirmation after first setup is to make a harmless local content edit and verify it persists locally. Do not perform a production write merely to prove that production was untouched.

The structural safety proof is instead in the command contract/tests:

- remote D1 command builder accepts `SELECT` only;
- remote R2 builder exposes `get` only;
- D1 import/reset builders require `--local`;
- R2 put builder requires `--local`;
- forbidden production tables are absent from the mirror allowlist;
- Asset supersession ordering is dependency-based rather than ID-based;
- Reusable Image Question tables are explicitly allowlisted/reset.

## Local state and cleanup

Local state and temporary production-derived files live under gitignored paths:

```text
.dev.vars
.wrangler/
```

The generated SQL staging files are stored under:

```text
.wrangler/local-replica/
```

Treat this material as private even though it is ignored by Git.

When disposing of or transferring a development machine, remove `.dev.vars` and `.wrangler/` securely as appropriate.

To rebuild from scratch, stop the dev server, remove local Wrangler state, then rerun:

```sh
npm run local:setup
npm run local:admin
```

Removing local Wrangler state also removes the local administrator, so bootstrap it again afterwards.

## Schema-changing branches

The refresh script applies the checked-out branch's migrations locally before importing production-derived rows. It never applies branch migrations remotely.

If a branch changes table semantics such that the current production rows can no longer be imported safely, the refresh should fail visibly. Do not weaken production safety or silently pretend schema compatibility.

The Asset supersession self-FK is an example: the refresh implementation must topologically order Assets rather than relying on `ORDER BY id` to satisfy the checked-out branch schema.

## Production/Preview/import commands remain separate

Do not confuse this workflow with:

```text
npm run admin:bootstrap              production administrator operator
npm run preview-admin:bootstrap      production-backed Preview identity operator
npm run db:migrate:remote            production migration operation
wrangler deploy                      production/Preview deployment
Admin → Import package               production reviewed-package import
npm run slide-review:build           local review UI build
npm run slide-review:finalize        local deterministic package finalizer
```

Local replica refresh is a read-production/write-local developer operation only.

## Validation before merging changes to this tooling

Run:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

Also exercise `npm run local:refresh` with suitable Cloudflare read authorization and verify local Admin navigation plus image rendering when credentials/local machine access are available.

## Open-source note

This document intentionally contains internal operational detail because the repository is currently private. Before publication, follow `OPEN_SOURCE_READINESS.md` and review/remove/redact this runbook and related infrastructure/operator details. Deleting a later file does not erase sensitive values from Git history, which is why secrets and production-derived data must never be committed in the first place.
