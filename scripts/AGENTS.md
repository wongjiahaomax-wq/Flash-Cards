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
- Keep `agent:checks` classification deterministic and repository-specific. `scripts/agent-checks-lib.mjs` is the one changed-path classification authority consumed by both advisory `agent:checks` output and ordinary-CI specialized requirements. Extend its explicit path/capability rules and focused tests instead of adding fuzzy inference, a generic configuration DSL, or a second classifier in workflow YAML.
- Keep ordinary validation commands, ordering, and explicit satisfaction/deduplication in `scripts/validation-contract.mjs` so local `validate:*` and PR CI cannot silently drift. Do not move specialized-check satisfaction into ad-hoc workflow conditions.
- Fast-test exclusion is exceptional, not a general performance knob. New ordinary maintained Node tests should enter fast automatically. Do not infer exclusion from filenames, directories, DB usage, or apparent cost; follow `docs/TESTING_AND_VALIDATION_GUIDANCE.md` for the required conditional-ownership/evidence contract.
- `scripts/validate-ci.mjs` is the CI-specific wrapper: preserve its PR diff override, GitHub grouping/annotations, and Node-test diagnostics while allowing GitHub Actions to select the shared `fast` or `full` mode. Omitted CI mode should remain fail-safe/backward-compatible as `full`; invalid explicit modes must fail as configuration errors.
- Preserve `scripts/ci-test-reporter.mjs` as the ordinary-CI Node-test presentation layer. `npm test` must remain the canonical `node --test` command; the CI wrapper alone adds the reporter. Keep the reporter event-driven from structured `node:test` events, compact successful progress, one final summary, end-of-run failure collection with name/location/failureType/error/code/operator/expected/actual/useful stack, and GitHub file/line annotations. Do not reintroduce buffered TAP/spec/dot parsing or per-success TAP records in ordinary CI logs.
- Preserve the connector-readable `CI_ERROR|`, `CI_REPRO|`, and `CI_STATUS|` plain-text records documented in `docs/CI_AGENT_DIAGNOSTICS.md`. They supplement GitHub annotations and are the stable lookup surface for remote coding agents; do not replace real structured Node failures with a generic wrapper error.
- Specialized runtime and slide-review checks remain conditional rather than becoming universal ordinary PR CI.

Read `docs/TESTING_AND_VALIDATION_GUIDANCE.md` for test placement, fixture, contract-owner, and specialization rules. Read `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, `docs/CI_AGENT_DIAGNOSTICS.md`, `docs/LOCAL_DEVELOPMENT_REPLICA.md`, and `docs/CLOUDFLARE.md` when relevant.

Tool/runtime changes require focused tests and `npm run runtime:smoke` in addition to normal validation when the changed-file contract identifies them as runtime-sensitive.
