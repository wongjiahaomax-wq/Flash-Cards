# GitHub workflow agent guidance

This file supplements the repository-wide `AGENTS.md` for `.github/`.

- Use permanent reviewed workflows only; do not add temporary deployment or mutation workflows.
- CI uses Node 22. Keep local runtime expectations aligned with that major.
- After `npm ci`, workflows must use the repository-installed Wrangler authority; do not download alternate Wrangler versions.
- Ordinary PR CI and local `validate:full` must consume the same repository-owned validation definitions rather than maintaining separate command lists. Keep CI-only diff semantics and GitHub annotations explicit.
- Preserve Production/Preview separation: Preview deployment never implies production deployment and must not apply production migrations.
- Conserve GitHub Actions minutes: keep expensive/runtime smoke jobs path-filtered where the current workflow intentionally does so.
- Do not broaden secrets or permissions merely to simplify an agent workflow.

Read `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, `docs/PREVIEW_DEPLOYMENT.md`, and `docs/CLOUDFLARE.md` for exact operational semantics.
