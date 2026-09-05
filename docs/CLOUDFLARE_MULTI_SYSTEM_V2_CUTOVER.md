# Cloudflare Multi-System Runtime v2 Cutover Addendum

_Status: operational addendum for the first Runtime v2 Production release. This addendum supersedes any older `CLOUDFLARE.md` instruction that treats `apply_migrations=false` as permission to skip the required v2 migration during the first or an incomplete cutover._

_Date: 5 September 2026._

This is a repository/runbook contract only. It does **not** authorize or record a Production deployment.

## First or incomplete v2 Production cutover

The durable release workflow is:

```text
.github/workflows/deploy-production.yml
```

For the first Multi-System Runtime v2 cutover, or for a retry where the prior cutover did not reach a proven open v2 runtime, there is **no effective `apply_migrations=false` path**. The workflow may expose the normal migration input for later post-cutover releases, but an incomplete cutover independently forces the fenced sequence and migration.

Dispatch only from reviewed `main`. The workflow itself enforces `refs/heads/main`.

### Cutover-completion evidence

Migration `0026` or a v2-looking D1 trigger by itself is **not** proof that the clean cutover completed.

Before installing any Production fence, the workflow successfully inspects both:

```text
1. D1 active_reviews_content_scope_guard
2. deployed /api/runtime-cutover-status
```

A prior cutover is treated as complete only when:

```text
D1 guard status = v2
AND
runtime endpoint returns HTTP 200 with:
  learnerRuntimeCutoverVersion = 2
  learnerRuntimeScopeVersion = 2
  learnerRuntimeWriteFence = false
  learnerRuntimeBuildSha = valid 40-hex commit SHA
```

An absent, legacy, malformed, or still-fenced runtime therefore re-enters the cutover even if migration `0026` is already installed. This covers the partial-cutover case where migration succeeded but Worker transition/verification did not complete.

A D1 inspection/authentication failure or runtime-status transport failure is different from an incomplete cutover: it fails the workflow **before any Production mutation or outage fence is installed**.

### Mandatory pre-fence validation

Before Production fencing, the workflow runs:

```sh
npm run multi-system:d1-acceptance
npm run multi-system:d1-lifecycle-acceptance
npm run multi-system:benchmark
npm run multi-system:d1-trigger-benchmark
```

The first command is the direct migration-`0026` scope/guard acceptance. The second is the real workerd + fully migrated-D1 Scheduled/Free lifecycle acceptance. The third validates the JS/browser supported envelope. The fourth measures valid Active Review INSERT cost through the strict v2 D1 trigger itself at the supported scope envelope.

### Mechanically owned cutover sequence

For a first or incomplete cutover:

```text
validate repository + both migrated-D1 acceptances + both envelope benchmarks
→ inspect D1 guard and deployed runtime completion state
→ require the D1 write credential before taking learner runtime down
→ preflight exact-zero data before downtime (repeat under the fence to close the write race)
→ prove exact unauthenticated /study 303 application behavior while the control-plane Worker version remains stable
→ persist a structured recovery record bound to that Worker, run ID, run attempt, commit SHA, Production origin, and edge proof
→ deploy temporary learner write-fence Worker
→ verify the temporary fence
→ run exact-zero remote cutover gate
→ apply all pending Production D1 migrations regardless of the ordinary migration input
→ verify migration 0026's v2 Active Review guard
→ deploy expected v2 Worker with LEARNER_RUNTIME_WRITE_FENCE=true and APP_BUILD_SHA=GITHUB_SHA
→ verify exact expected build SHA + fence=true non-mutatingly
→ re-check v2 guard and exact-zero sentinels
→ redeploy the same expected build without the fence
→ verify exact expected build SHA + fence=false
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

The first cutover must not be decomposed into a manual migration followed by a later unfenced Worker deployment. If somebody nevertheless applies `0026` manually or a prior workflow stops after migration, the next workflow does not infer success from the schema: without a proven open identified v2 runtime, it re-enters the fenced exact-zero path.

During fenced v2 verification, checks are non-mutating. Do not bypass `LEARNER_RUNTIME_WRITE_FENCE` to create synthetic learner data in Production.

## Immutable deployed build identity

`/api/runtime-cutover-status` reports `learnerRuntimeBuildSha` from the Worker variable `APP_BUILD_SHA`.

The deployment workflow sets:

```text
APP_BUILD_SHA = GITHUB_SHA
```

for the fenced v2 Worker, the reopened Worker, and ordinary later deployments. Both fenced and final-open verification require `learnerRuntimeBuildSha` to equal that exact `GITHUB_SHA`.

This prevents “some v2-looking runtime is reachable” from being used as proof that the expected build was deployed.

## Subsequent releases

Only when the strict v2 D1 guard **and** an already-open identified v2 runtime prove that the historical cutover completed does the workflow skip the exact-zero/fence sequence.

Ordinary later deployments then return to the repository's normal migration policy:

```text
apply_migrations=false
→ code-only deployment permitted

apply_migrations=true
→ deliberately apply pending D1 migrations before Worker deployment
```

The zero-data result is a one-time cutover assumption, not a permanent requirement that a live v2 system remain empty. A later deployment still verifies the v2 Active Review guard and exact expected Worker build before it is accepted as open.

## Credentials

Keep the existing least-privilege separation:

- Production D1 read token for inspection/gates/verification;
- Production D1 write token only when migration application is required or explicitly requested;
- Worker deployment token for Worker configuration/deployments.

For a first/incomplete cutover, the workflow verifies that the D1 write credential exists **before** installing the temporary fence, so a missing migration credential cannot unnecessarily leave learner Study closed.

Never commit or print credential values.

## Failure rule

If the exact-zero gate, guard verification, expected-build verification, or fenced runtime verification fails during the cutover, stop. Do not reinterpret v1 browser/proof/persisted state, delete learner data to make the gate pass, or introduce an unreviewed compatibility path.

Unexpected live learner runtime data invalidates the clean-cutover assumption and requires a separately reviewed compatibility/migration design.

### Authorized disposable test-history recovery

On 5 September 2026 the owner confirmed this deployment has no real learners and explicitly authorized deletion of their test learner history. This is an incident-specific operator authorization, not permission for automatic resets in deployment or for deleting future live learner data.

For that incident, first verify the remote schema still ends at migration 0024, that all sentinel tables other than the seven below are empty (0025's monthly table is absent), and that the temporary fence is active. Record authored-content/account counts. With writes fenced, delete only the confirmed test history:

```sql
DELETE FROM scheduled_review_events;
DELETE FROM learner_case_fsrs;
DELETE FROM learner_case_encounters;
DELETE FROM learner_optimizer_evidence;
DELETE FROM learner_aggregates;
DELETE FROM learner_system_aggregates;
DELETE FROM learner_fsrs_profiles;
```

Re-run the schema-aware exact-zero gate and confirm authored-content/account counts are unchanged. Do not delete users, authentication records, preferences, Cases, taxonomy, questions, Assets, or R2 objects. If schema/count assumptions differ, re-evaluate the operation before mutation.

Runs 21–23 never reached migrations. Run 21 installed maintenance; runs 22–23 then captured that version `b0eb8a02-60fb-4292-8a6c-52792151aa76` is the maintenance Worker itself, not a valid recovery target. Once current migration state confirms rollback remains compatible, restore the run-20 application version `0ac08060-18ae-4809-87ec-a5f14defd8ae` using the installed Wrangler `rollback <version> --name flash-cards`; verify control-plane identity and unfenced Study behavior. Do not start new test Reviews before the cutover. Then dispatch the reviewed deployment workflow from `main`, retaining its fenced recheck, migration, and exact-build verification sequence.

The preflight prevents known nonzero data from causing downtime. Recovery capture now fails closed unless `/study` proves the exact unauthenticated `303 → /sign-in?redirect=%2Fstudy` application contract and the Cloudflare control-plane Worker version is unchanged across that edge probe. The uploaded `pre-fence-recovery.json` also binds the target to the source run ID, run attempt, commit SHA, Production origin, and stored edge evidence. Interrupted-run recovery rejects legacy bare Worker IDs and any mismatched or unverified record before rollback.

## Release evidence

Record separately:

```text
repository PR merged
migration 0026 applied to Production D1
v2 guard verified
expected Worker GITHUB_SHA deployed while fenced
fenced exact-build verification passed
same expected Worker build reopened
final exact-build/open verification passed
post-release behavior verified
```

Do not infer any of these facts from repository presence or migration presence alone.