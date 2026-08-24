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

## Execution capabilities

At the beginning of a coding task, detect the capabilities actually available to the agent, then select the best supported workflow automatically. Do not infer the execution mode from the user's device, location, or statements such as “I am at my laptop” or “I am on my phone”. Explicit user constraints on how the task must be executed override automatic selection.

Relevant capabilities include, where applicable:

- usable command/shell execution;
- an actual repository working tree and functional Git access to it;
- ability to execute repository-owned commands;
- GitHub repository/API/integration access;
- ability to inspect PRs and GitHub CI/check results.

Before creating or selecting a branch, identify the requested work state. If the task explicitly targets an existing PR or branch, inspect and continue that current head against its intended base rather than starting new work from `main`. If no existing work state is targeted, resolve the intended base, normally the latest `main`, and create the feature branch from that resolved base.

Use these conceptual modes:

- **Local checkout:** a usable checkout, command execution, and the repository workflow are available. Preserve the local validation flow documented in `docs/AGENT_TASK_MAP.md`.
- **Remote GitHub:** useful GitHub access exists but no usable local checkout/execution environment exists. Preserve explicitly targeted existing PR/branch state; otherwise resolve the intended base, normally current `main`. Use the same minimum-context routing, inspect enough context before writing, make coherent branch changes, review the complete branch/PR diff, and use GitHub CI/check evidence for executable validation. Never report a repository command as locally executed when it was not.
- **Hybrid:** both local execution and GitHub access are available. Prefer the local checkout for repository exploration, implementation, focused tests, and repository validation; use GitHub for branch collaboration, PR/review state, CI/check evidence, and durable handoff. Avoid expensive repeated remote reads for information already available locally.

For remote GitHub work, do not use Actions as the first debugger when inspection and coherent self-review can catch the problem first. Batch related edits where practical, use logical commits, and avoid speculative push/CI loops. Before the principal handoff, inspect the complete proposed diff for task fit, behavioral invariants, scope expansion, stale references, missing or inappropriate tests, and documentation accuracy. Refactor-only work must explicitly preserve behavior.

A draft PR is an important durable handover artifact for remote work. Keep its title/body, branch diff, commits, review discussion, and CI/check state sufficient for a later coding-agent session to reconstruct the current work without the original chat. Use concise PR sections such as Goal, Behavioral invariants / constraints, Implementation, Validation, Remaining review points, and Explicitly out of scope when they add value; trivial changes do not need verbose PR bodies.

## Change discipline

- Preserve product behavior in refactor-only work.
- Prefer a small explicit guard, focused test, and clear invariant over a generic abstraction.
- Do not broaden a task into unrelated cleanup, formatting, schema, UX, or architecture changes.
- Inspect related tests and existing helpers before adding a new pattern.
- Treat Production-vs-Preview predicates and ownership checks as data-integrity boundaries, not incidental query filters.
- For capable coding agents, task prompts should normally supply the goal, behavioral/product invariants, constraints, acceptance criteria, and authority; use repository guidance to discover exact implementation details rather than requiring large hard-coded file lists unless the task genuinely needs them.
- If you notice an unrelated issue, fix it only when required to complete the requested task safely; otherwise leave it out of the focused PR and record a meaningful follow-up observation when appropriate.

## Architecture direction

For substantial structural work, consult `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md`.

- New or extracted application modules should normally prefer TypeScript where the current toolchain supports it; do not convert existing JavaScript merely because a file is touched.
- Prefer cohesive modules with explicit domain ownership, thin routes/coordinators, and downward dependency flow.
- Do not append another independent responsibility to an architectural hotspot without evaluating a focused extraction boundary.
- Keep ordinary feature and bug-fix PRs focused. Architectural direction is incremental guidance, not a requirement to broaden unrelated work into a migration.

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
- Distinguish validation you executed from conclusions based on inspection and from validation executed by GitHub CI. “GitHub CI passed” is not the same claim as “`npm run validate:full` passed locally”.
- Use the validation commands documented by the repository and the task.
- `npm run agent:doctor` is the read-only pre-edit environment check.
- After a coherent implementation change, run `npm run agent:checks` to inspect the branch diff and identify repository-specific required and recommended validation. It is advisory and must not mutate Git, contact GitHub, access production, or auto-run the recommended suites.
- During active editing, use the cheapest feedback that can meaningfully catch the likely failure. For presentation-only UX changes, batch small copy, spacing, class, and layout edits under Vite/HMR instead of running repository validation after every edit.
- `npm run validate:fast` is checkpoint validation after a coherent batch of work, not an every-edit loop. Run focused tests earlier when changed logic warrants them.
- `npm run validate:full` is the ordinary local pre-handoff validation after implementation is complete. Do not repeatedly run it during normal iteration.
- Ordinary PR CI and local `validate:full` share the same repository-owned validation definitions. Do not add a second manually maintained ordinary-validation command list in workflow YAML or another script.
- Do not rerun an unchanged validation command merely because another small edit was made; rerun it when subsequent changes could invalidate what it checked.
- Run specialized checks when `agent:checks`, the task contract, or the affected subsystem requires them. Examples include `npm run runtime:smoke`; slide-review tooling requires both `npm run slide-review:test` and `npm run slide-review:build`.
- When command execution is unavailable, inspect equivalent GitHub check/workflow evidence where it exists and explicitly report required validation that could not be executed or verified.
- Report every check you could not run and the exact reason.
- Do not describe an unexecuted check as passing based only on code inspection.
- If implementation and documentation disagree, report the discrepancy and which source of truth you followed.

## Before committing

Confirm that the complete diff:

- satisfies the requested goal and acceptance criteria without unrelated cleanup;
- preserves documented behavioral invariants, especially for refactor-only work;
- does not mutate or embed production content;
- does not weaken Production/Preview ownership boundaries;
- does not introduce secrets or generated local state;
- does not rewrite migration history;
- does not add an alternate Wrangler/deployment path;
- contains focused tests for any new safety invariant;
- preserves behavior outside the intended safety tightening;
- has no stale references/imports, accidental scope expansion, or documentation made inaccurate by the implementation.
