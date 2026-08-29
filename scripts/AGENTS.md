# Script agent guidance

This file supplements the repository-wide `AGENTS.md` for `scripts/`.

- Treat scripts that can touch Cloudflare as privileged operator surfaces.
- Production mutation is forbidden unless a current runbook explicitly defines that operation.
- Local replica refresh is read-production/write-local only; preserve its hard-coded SELECT / R2 GET remote surface.
- The exact package/lockfile Wrangler pin is the only Wrangler authority. Use the repository-installed Wrangler; never add `npx --yes wrangler@<version>`.
- Prefer `process.execPath` for repository Node scripts and cross-platform child-process handling for npm/Windows.
- `npm run local:stop` is the repository-scoped cleanup command for local `dev`/`preview` servers. Preserve its exact Flash-Cards Vite/Wrangler process matching; never replace it with broad Node termination such as `taskkill /IM node.exe`, `killall node`, or equivalent.
- Never print `.dev.vars` contents, tokens, secrets, or production-derived data.
- Keep diagnostics read-only unless their command is explicitly an operator mutation command.
- Keep `agent:checks` classification deterministic and repository-specific. Extend the explicit path/capability rules and focused tests instead of adding fuzzy inference or a generic configuration DSL.
- Keep ordinary validation commands in the shared repository validation contract so local `validate:*` and PR CI cannot silently drift. `scripts/validate-ci.mjs` is the CI-specific wrapper: preserve its PR diff override, GitHub grouping/annotations, and Node-test diagnostics while allowing GitHub Actions to select the shared `fast` or `full` mode. Omitted CI mode should remain fail-safe/backward-compatible as `full`; invalid explicit modes must fail as configuration errors.
- Preserve `scripts/ci-test-reporter.mjs` as the ordinary-CI Node-test presentation layer. `npm test` must remain the canonical `node --test` command; the CI wrapper alone adds the reporter. Keep the reporter event-driven from structured `node:test` events, compact successful progress, one final summary, end-of-run failure collection with name/location/failureType/error/code/operator/expected/actual/useful stack, and GitHub file/line annotations. Do not reintroduce buffered TAP/spec/dot parsing or per-success TAP records in ordinary CI logs.
- Specialized runtime and slide-review checks remain conditional rather than becoming universal ordinary PR CI.

Read `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, `docs/LOCAL_DEVELOPMENT_REPLICA.md`, and `docs/CLOUDFLARE.md` when relevant.

Tool/runtime changes require focused tests and `npm run runtime:smoke` in addition to normal validation when the changed-file contract identifies them as runtime-sensitive.
