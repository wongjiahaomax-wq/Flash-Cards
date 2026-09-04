# Cloudflare Multi-System Runtime v2 Cutover Addendum

_Status: operational addendum for the first Runtime v2 Production release. This addendum supersedes any older `CLOUDFLARE.md` instruction that treats `apply_migrations=false` as permission to skip the required v2 migration during the first cutover._

_Date: 4 September 2026._

This is a repository/runbook contract only. It does **not** authorize or record a Production deployment.

## First v2 Production release

The durable release workflow is still:

```text
.github/workflows/deploy-production.yml
```

For the first Multi-System Runtime v2 cutover, there is **no effective `apply_migrations=false` path**. The workflow may expose the normal migration input for later post-cutover releases, but when the strict v2 Active Review guard is absent the workflow independently detects that fact and makes the fenced cutover plus migration mandatory. Do not dispatch an older workflow revision or recreate a code-only bypass.

Dispatch only from reviewed `main`. The workflow itself enforces `refs/heads/main`.

The one-time sequence is mechanically owned by the workflow:

```text
validate repository + local migrated-D1 v2 acceptance
→ detect whether the v2 Active Review guard already exists
→ require the D1 write credential before taking the runtime down
→ if absent, deploy temporary learner write-fence Worker
→ verify the temporary fence
→ run exact-zero remote cutover gate
→ apply all pending Production D1 migrations regardless of the ordinary migration input
→ verify migration 0026's v2 Active Review guard
→ deploy the v2 Worker with LEARNER_RUNTIME_WRITE_FENCE=true
→ verify fenced v2 runtime non-mutatingly
→ redeploy the v2 Worker without the fence
→ verify learner runtime reports open
```

The exact-zero gate is:

```sh
npm run multi-system:cutover-gate -- --remote
```

and requires all Runtime v2 sentinels, including `learner_fsrs_profiles`, to be exactly zero. It is read-only and fail-closed. It has no pristine-profile exception.

The v2 guard verification is:

```sh
npm run multi-system:guard-verify -- --remote
```

The first cutover must not be decomposed into a manual migration followed by a later unfenced Worker deployment. The fence exists to remove the old-Worker write race between the zero-data observation and the v2 migration/code boundary.

During the fenced v2 verification, checks are non-mutating. Do not bypass `LEARNER_RUNTIME_WRITE_FENCE` to create synthetic learner data in Production.

## Subsequent releases

Once the strict v2 Active Review guard is already installed, the workflow skips the historical exact-zero cutover and temporary fence sequence. Ordinary later deployments return to the repository's normal migration policy: `apply_migrations=false` may perform a code-only deployment, while `apply_migrations=true` deliberately applies pending D1 migrations before Worker deployment.

The zero-data result is a one-time cutover assumption, not a permanent requirement that a live v2 system remain empty. A later code-only deployment still verifies that the v2 Active Review guard exists before activating the Worker.

## Credentials

Keep the existing least-privilege separation:

- Production D1 read token for detection/gates/verification;
- Production D1 write token only when migration application is required or explicitly requested;
- Worker deployment token for Worker configuration/deployments.

For the first cutover, the workflow verifies that the D1 write credential exists **before** installing the temporary fence, so a missing migration credential cannot unnecessarily leave learner Study closed.

Never commit or print credential values.

## Failure rule

If the exact-zero gate or guard verification fails during the first cutover, stop. Do not reinterpret v1 browser/proof/persisted state, delete learner data to make the gate pass, or introduce an unreviewed compatibility path.

Unexpected live learner runtime data invalidates the clean-cutover assumption and requires a separately reviewed compatibility/migration design.

## Release evidence

Record separately:

```text
repository PR merged
migration 0026 applied to Production D1
v2 guard verified
Worker SHA deployed
fenced verification passed
learner runtime reopened
post-release behavior verified
```

Do not infer any of these facts from repository presence alone.
