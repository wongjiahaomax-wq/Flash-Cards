# Flash-Cards Agent Safety Contract

This file is the short machine-facing entry point for coding agents working in this repository.
It is a safety contract, not a replacement for the project documentation.

## Start here

Before changing code, read:

1. `docs/DOCUMENTATION_INDEX.md`
2. `docs/AGENT_TASK_MAP.md` to choose the minimum current task context
3. `docs/HANDOVER.md` only when project-wide status or recent implementation state is materially relevant
4. the domain-specific documents linked from the documentation index/task map for the task you are changing.

For Cloudflare, Preview, local replicas, imports, authoring, or schema work, read the corresponding authoritative documents before editing those areas.

When documentation conflicts with the current executable implementation or enforced contract, follow the current implementation and report the discrepancy. Do not silently rewrite working behavior to match stale prose.

## Change discipline

- Preserve product behavior in refactor-only work.
- Prefer a small explicit guard, focused test, and clear invariant over a generic abstraction.
- Do not broaden a task into unrelated cleanup, formatting, schema, UX, or architecture changes.
- Inspect related tests and existing helpers before adding a new pattern.
- Treat Production-vs-Preview predicates and ownership checks as data-integrity boundaries, not incidental query filters.

## Production and Preview safety

- Never mutate production D1 or R2 merely to test, debug, seed, or preview a change.
- Preview and production may share Cloudflare infrastructure. Data scope must therefore be explicit in every mutation path.
- Production content is normally identified by `previewSessionId IS NULL`.
- Preview-owned mutable content must be scoped to the current Preview Session.
- Do not remove Production-vs-Preview predicates as a cleanup without understanding and preserving the invariant.
- Preview may legitimately reference/read production Assets. Do not equate “visible in Preview” with “owned by Preview”.
- A Preview-owned Asset is different from a production Asset that a Preview Case is allowed to reference.
- Do not invent temporary deployment workflows, one-off production commands, or bypasses around the repository's permanent safety workflows.
- `docs/CLOUDFLARE.md` is the authority for production release procedure.

Never commit:

- credentials, API tokens, account IDs that are intended to remain secret, or private keys;
- `.dev.vars` or equivalent local secret files;
- `.wrangler/` state;
- production-derived D1 exports or snapshots;
- production-derived mirrored R2 media;
- local production-replica state that repository ignore rules deliberately exclude.

## Database and migration safety

- Inspect `src/lib/server/db/schema.js`, current migrations, and migration checks before changing schema behavior.
- Never edit a historical migration merely to make local state work.
- Genuine schema changes require a new migration.
- Run the repository migration/schema checks after schema-related changes.
- Avoid schema changes entirely in a refactor-only PR unless they are strictly necessary and explicitly in scope.
- Do not use production data mutation as migration validation.

## Production/Preview mutation guards

High-risk production mutation code should use explicit semantic guards from `src/lib/server/db/content-guards.js` where the invariant matches:

- `requireProductionCase(...)` for active production-only Case mutation paths;
- `requireProductionImageAsset(...)` for active production image Asset mutation paths.

Preview Case ownership has one authority: `requireOwnedPreviewCase(...)` exported by `src/lib/server/db/preview-workspace.js`. Preserve its full Case return value and `PreviewWorkspaceError` behavior; do not add a second independent implementation in `content-guards.js` or rewrite Preview mutation call sites merely to share an abstraction.

Do not replace these guards with vague “scoped entity” helpers. Do not use the production Asset guard for Preview paths that intentionally allow production Asset reuse.

## Asset and R2 safety

- D1 `Asset` metadata and the corresponding R2 object lifecycle must remain coordinated.
- Do not casually remove upload/delete compensation that cleans up one side when the other side fails.
- Image replacement/refactoring must preserve existing Asset identity and historical relationships unless a task explicitly changes that lifecycle contract.
- Do not permanently delete Assets or R2 objects as part of unrelated cleanup.
- Before changing storage behavior, read the current Asset/media lifecycle code and Cloudflare documentation.

## SvelteKit action safety

SvelteKit `redirect()` throws internally.

- Do not place a successful `redirect()` inside a broad `try/catch` that converts thrown values into an error response.
- Keep fallible database/storage work inside the catch boundary, then redirect after successful completion.
- Preserve the repository's existing action error mapping instead of catching everything indiscriminately.

## Wrangler and runtime safety

- The exact `wrangler` version in `package.json` / `package-lock.json` is the repository Wrangler authority.
- Normal scripts and workflows must use that installed Wrangler; do not silently download a second version with `npx wrangler@...`.
- Direct Wrangler invocations in ordinary GitHub Actions shell steps must use `./node_modules/.bin/wrangler`; do not assume repository-local binaries are on the shell `PATH`.
- Do not lower `wrangler.jsonc` `compatibility_date` merely to make an older local runtime start.
- Run `npm run runtime:smoke` when Wrangler/runtime-affecting files change.
- The runtime smoke is local-only and must not acquire production D1/R2 bindings or secrets.

## Local production-derived replicas

- Follow `docs/LOCAL_DEVELOPMENT_REPLICA.md` for local production-derived data.
- Production reads used to build a local replica must remain within the documented read-only contract.
- Application/runtime writes during local development belong in local D1/R2 only.
- Do not commit replica databases, exports, mirrored media, or generated local secrets.

## Validation and reporting

- Do not claim a command, test, build, deployment, migration, or smoke check ran unless it actually ran.
- Use the validation commands documented by the repository and the task.
- `npm run agent:doctor` is the read-only pre-edit environment check.
- `npm run validate:fast` is the normal iteration validation interface.
- `npm run validate:full` is the ordinary local pre-handoff validation interface.
- For runtime-affecting files, also run `npm run runtime:smoke`.
- Report every check you could not run and the exact reason.
- Do not describe an unexecuted check as passing based only on code inspection.
- If implementation and documentation disagree, report the discrepancy and which source of truth you followed.

## Before committing

Confirm that the diff:

- does not mutate or embed production content;
- does not weaken Production/Preview ownership boundaries;
- does not introduce secrets or generated local state;
- does not rewrite migration history;
- does not add an alternate Wrangler/deployment path;
- contains focused tests for any new safety invariant;
- preserves behavior outside the intended safety tightening.
