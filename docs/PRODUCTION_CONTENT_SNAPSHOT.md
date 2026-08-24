# Production content snapshot

_Status: current read-only production content inspection workflow._

_Last updated: 25 August 2026._

This repository includes a manually triggered GitHub Actions workflow for inspecting a deliberately limited snapshot of learning content from the production Cloudflare D1 database.

Workflow:

```text
.github/workflows/production-content-snapshot.yml
```

The purpose is to make production taxonomy/content review possible without exposing Cloudflare credentials and without exporting authentication or learner-progress data.

## 1. What this workflow proves — and what it does not

A completed snapshot is evidence about the production **rows queried by that workflow at that time**.

It can support statements such as:

```text
these production-owned Topics/Cases/Case↔Topic rows currently exist in production D1
```

For Case routing, the workflow excludes disposable Preview-owned Cases with:

```sql
cases.preview_session_id IS NULL
```

The `CASE_TOPIC_ROUTES` output therefore represents production-owned Cases and their stored Topic relationships rather than all Case rows sharing production D1.

Historical snapshot runs produced before this filter was added may have included Preview-owned Cases if a Preview workspace existed at the time. Do not reuse an older run as authoritative production-Case evidence without checking which workflow revision produced it.

The snapshot is not authoritative evidence for:

```text
which Git commit is deployed to the production Worker
whether a particular migration file was applied
whether a deployment workflow succeeded
whether unqueried tables/features are present or active
```

Keep production data state, migration state, Worker deployment state, feature enablement, and learner rollout separate.

## 2. Current meaning of stored secondary Case Topic rows

The snapshot intentionally still emits `case_concepts.role` so stored legacy relationships remain inspectable.

Current application semantics are:

```text
role = primary
→ canonical Case Topic used by current authoring/learner behavior

role = secondary
→ legacy compatibility data only
→ not a current learner route or authoring relationship
```

A snapshot showing a secondary row therefore does **not** mean Additional Study Topics remain a current feature or that the row must be migrated/deleted before learner launch.

PR #90 intentionally requires no cleanup migration. Clinically useful alternate discovery should be curated explicitly through Case Tags + System↔Tag exposure rather than inferred from a stored secondary Topic name.

The current snapshot workflow does not need to become a Topic→Tag conversion tool merely because old secondary rows are visible.

## 3. Safety model

The workflow is intentionally constrained:

- it runs only through `workflow_dispatch`;
- all SQL is hard-coded in the repository;
- all database operations are `SELECT` queries;
- there is no free-form SQL workflow input;
- it queries only explicitly approved learning-content tables;
- Case-route output filters out rows owned by a Preview Session;
- it does not query Better Auth tables, users, sessions, learner Reviews, or learner progress;
- Cloudflare credentials remain GitHub repository secrets and are never printed deliberately.

Because the repository is private, snapshot output is visible only to people with access to its Actions logs. Treat the output as private teaching-content metadata nevertheless.

## 4. Credentials

The workflow prefers the dedicated repository secret:

```text
CLOUDFLARE_D1_READ_TOKEN
```

Use a least-privilege Cloudflare token with D1 read permission for the relevant account.

A deployment-token fallback may exist for compatibility, but the dedicated read-only token is preferred because it narrows blast radius and keeps production inspection independent from deployment-token scope.

Never commit a token, API key, password, Better Auth secret, account credential or other secret to repository source or workflow YAML.

Keep read and write credentials separate. Do not grant write permission merely to make the snapshot work.

## 5. Default snapshot scope

The default run queries:

```text
concepts
production-owned cases where preview_session_id IS NULL
case_concepts for those Cases
```

It emits:

- Topic identity/name/slug/description/parent/active state;
- production-owned Case identity/internal title, bounded vignette preview and active state;
- stored Case↔Topic relationships for those production-owned Cases;
- relationship role (`primary` or legacy `secondary`);
- Topic active state for each stored relationship.

This is useful for taxonomy review and for identifying legacy relationships that remain physically stored. Current learner/Admin routing behavior itself should be determined from current code/docs, not inferred from the mere presence of a secondary row in this report.

## 6. Optional reusable Topic questions

The manual workflow has an `include_topic_questions` input, disabled by default.

When enabled it additionally reads:

```text
concept_questions
question_prompts
```

and emits reusable Topic prompts, a bounded answer preview, inheritance state and active state.

Use this only when question context is useful for understanding Topic meaning.

The current snapshot workflow is not a general query surface for newer tables such as Reusable Image Questions or learner data. Add future scope only through a reviewed, purpose-specific change with the privacy/safety boundary updated at the same time.

## 7. Explicitly excluded data

Do not expand the snapshot casually to include:

- Better Auth tables;
- user identities/email addresses;
- sessions/authentication tokens;
- learner Reviews;
- learner ratings/progress;
- administrator credentials;
- unrestricted database dumps;
- arbitrary free-form SQL input.

If a future task genuinely requires sensitive/learner data, design a separate purpose-specific export with the minimum required fields and document its privacy boundary before implementation.

## 8. Running the snapshot

1. Open **GitHub → Actions**.
2. Select **Production content snapshot**.
3. Choose **Run workflow**.
4. Leave `include_topic_questions` off for normal taxonomy review, or enable it when Topic-question context is useful.
5. Open the completed run and `snapshot` job.
6. Inspect the grouped output and confirm the workflow revision includes the production-owned Case filter when using Case rows as evidence.

Record the workflow run when using the output as evidence for a production-content decision.

## 9. Fixed-purpose historical production taxonomy operator

The snapshot workflow is read-only and must remain read-only.

The repository also contains the earlier fixed-purpose taxonomy operation:

```text
.github/workflows/apply-agreed-production-taxonomy.yml
scripts/apply-agreed-taxonomy.mjs
```

That operator records a specific historical production taxonomy change. It is deliberately not a generic production mutation API and should not be broadened into a Topic→Tag cleanup mechanism for PR #90.

See `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md` for its historical audit/recovery contract.

For any future direct production data mutation, use a separately reviewed, narrowly scoped operator only when the mutation is genuinely needed.

## 10. Snapshot → operator audit pattern

For an approved future fixed-purpose production content mutation, the preferred operational pattern remains:

```text
read-only snapshot / pre-flight
→ reviewed fixed-purpose mutation
→ machine post-flight verification + human relationship review
→ read-only snapshot again
```

Retain relevant workflow runs as the audit trail.

Do not treat a successful mutation operator as Worker deployment evidence; data mutation and code deployment are separate operations.

PR #90 does not require such an operator merely to retire Additional Study Topics from current behavior.

## 11. Troubleshooting authorization

If Cloudflare reports that the account/token is not authorized, assume the query did not run successfully until proven otherwise.

Check:

1. the configured account context is the one that owns the intended D1 database;
2. the selected token has the required read permission for that account.

Prefer correcting/creating the dedicated read-only credential rather than broadening a deployment or write credential.

## 12. Intended assistant workflow

A GitHub-capable assistant may inspect completed snapshot workflow output without receiving the underlying Cloudflare secret.

Use the snapshot as source of truth for the production learning-content rows it actually queried, rather than inferring those rows from seed fixtures or repository examples.

Do not infer unqueried feature/deployment/migration/learner state from snapshot output.

Do not treat stored secondary rows as current learner routes merely because the snapshot emits them.

## 13. Maintenance rule

Any future change to queried tables/fields, Preview ownership filtering, credential selection, logging, or the safety/privacy boundary must update this document in the same reviewed change.
