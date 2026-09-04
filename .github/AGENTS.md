# GitHub workflow agent guidance

This file supplements the repository-wide `AGENTS.md` for `.github/`.

- Use permanent reviewed workflows only; do not add temporary deployment or mutation workflows.
- CI uses Node 22. Keep local runtime expectations aligned with that major.
- Any workflow that installs the root dependency set must use `actions/setup-node@v5` with Node 22, `cache: npm`, and `cache-dependency-path: package-lock.json`, then install with `npm ci --prefer-offline --no-audit --no-fund`. Cache npm's download cache, never `node_modules`; preserve clean-install semantics.
- After `npm ci`, workflows must use the repository-installed Wrangler authority; do not download alternate Wrangler versions.
- Ordinary PR CI selects the repository-owned validation mode from the actual pull-request Draft state: Draft PRs use `fast`, Ready-for-Review PRs use `full`, and `ready_for_review` must trigger full validation without requiring a new source commit. Keep PR-specific diff semantics and GitHub annotations explicit rather than maintaining a second validation command list in workflow YAML.
- For ordinary PR CI's change-aware specialized requirements, `.github/workflows/ci.yml` does not own changed-path classification or validation satisfaction rules. `scripts/agent-checks-lib.mjs` is the central classifier for that ordinary-CI specialized subset, and `scripts/validation-contract.mjs` owns named checks plus explicit satisfaction/deduplication. Do not reimplement those ordinary-CI contracts with `ci.yml` path conditions or shell conditionals. See `docs/TESTING_AND_VALIDATION_GUIDANCE.md`.
- `wrangler-runtime-smoke.yml` is an intentional exception to that ordinary-CI ownership split: it remains a separate path-filtered workflow and owns its existing `pull_request.paths` trigger. That workflow filter is not redundant merely because `agent:checks` also advises `runtimeSmoke`, and `agent:checks` advice is not evidence that ordinary CI executed the smoke check. Preserve this separate workflow ownership unless a separately reviewed validation-architecture change redesigns it.
- Preserve the ordinary-CI Node-test presentation contract when editing workflows. `npm test` remains the canonical complete `node --test` suite; `scripts/validate-ci.mjs` is responsible for adding `--test-reporter=./scripts/ci-test-reporter.mjs`. Keep successful output compact, failure detail collected at the end, and reporting driven by structured `node:test` events. Do not bypass the wrapper, restore buffered TAP/spec/dot parsing, or reintroduce hundreds of successful per-test records.
- Preserve the connector-readable `CI_ERROR|`, `CI_REPRO|`, and `CI_STATUS|` plain-text records documented in `docs/CI_AGENT_DIAGNOSTICS.md`; GitHub annotations remain supplemental rather than the only machine-readable failure surface.
- Preserve the single required `check` job/status context unless an explicitly reviewed ruleset change is in scope. PR CI concurrency should be scoped by workflow plus PR number so newer runs cancel obsolete runs for the same PR without affecting other PRs.
- Preserve Production/Preview separation: Preview deployment never implies production deployment and must not apply production migrations.
- Conserve GitHub Actions minutes: keep expensive/runtime smoke jobs path-filtered where the current workflow intentionally does so.
- Do not broaden secrets or permissions merely to simplify an agent workflow.

Read `docs/TESTING_AND_VALIDATION_GUIDANCE.md`, `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, `docs/CI_AGENT_DIAGNOSTICS.md`, `docs/PREVIEW_DEPLOYMENT.md`, and `docs/CLOUDFLARE.md` for exact operational semantics.
