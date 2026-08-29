# GitHub workflow agent guidance

This file supplements the repository-wide `AGENTS.md` for `.github/`.

- Use permanent reviewed workflows only; do not add temporary deployment or mutation workflows.
- CI uses Node 22. Keep local runtime expectations aligned with that major.
- After `npm ci`, workflows must use the repository-installed Wrangler authority; do not download alternate Wrangler versions.
- Ordinary PR CI selects the repository-owned validation mode from the actual pull-request Draft state: Draft PRs use `fast`, Ready-for-Review PRs use `full`, and `ready_for_review` must trigger full validation without requiring a new source commit. Keep PR-specific diff semantics and GitHub annotations explicit rather than maintaining a second validation command list in workflow YAML.
- Preserve the ordinary-CI Node-test presentation contract when editing workflows. `npm test` remains the canonical `node --test` suite; `scripts/validate-ci.mjs` is responsible for adding `--test-reporter=./scripts/ci-test-reporter.mjs`. Keep successful output compact, failure detail collected at the end, and reporting driven by structured `node:test` events. Do not bypass the wrapper, restore buffered TAP/spec/dot parsing, or reintroduce hundreds of successful per-test records.
- Preserve the single required `check` job/status context unless an explicitly reviewed ruleset change is in scope. PR CI concurrency should be scoped by workflow plus PR number so newer runs cancel obsolete runs for the same PR without affecting other PRs.
- Preserve Production/Preview separation: Preview deployment never implies production deployment and must not apply production migrations.
- Conserve GitHub Actions minutes: keep expensive/runtime smoke jobs path-filtered where the current workflow intentionally does so.
- Do not broaden secrets or permissions merely to simplify an agent workflow.

Read `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, `docs/PREVIEW_DEPLOYMENT.md`, and `docs/CLOUDFLARE.md` for exact operational semantics.
