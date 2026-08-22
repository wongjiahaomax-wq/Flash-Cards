# Script agent guidance

This file supplements the repository-wide `AGENTS.md` for `scripts/`.

- Treat scripts that can touch Cloudflare as privileged operator surfaces.
- Production mutation is forbidden unless a current runbook explicitly defines that operation.
- Local replica refresh is read-production/write-local only; preserve its hard-coded SELECT / R2 GET remote surface.
- The exact package/lockfile Wrangler pin is the only Wrangler authority. Use the repository-installed Wrangler; never add `npx --yes wrangler@<version>`.
- Prefer `process.execPath` for repository Node scripts and cross-platform child-process handling for npm/Windows.
- Never print `.dev.vars` contents, tokens, secrets, or production-derived data.
- Keep diagnostics read-only unless their command is explicitly an operator mutation command.

Read `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, `docs/LOCAL_DEVELOPMENT_REPLICA.md`, and `docs/CLOUDFLARE.md` when relevant.

Tool/runtime changes require focused tests and `npm run runtime:smoke` in addition to normal validation.
