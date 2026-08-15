# Production content snapshot

This repository includes a manually triggered GitHub Actions workflow for inspecting a deliberately limited snapshot of learning content from the production Cloudflare D1 database.

Workflow:

```text
.github/workflows/production-content-snapshot.yml
```

The purpose is to make production taxonomy/content review possible without exposing Cloudflare credentials and without exporting authentication or learner-progress data.

## Safety model

The workflow is intentionally constrained:

- it runs only through `workflow_dispatch`;
- all SQL is hard-coded in the repository;
- all database operations are `SELECT` queries;
- there is no free-form SQL workflow input;
- it queries only the learning-content tables listed below;
- it does not query Better Auth tables, users, sessions, learner Reviews, or learner progress;
- Cloudflare credentials remain GitHub repository secrets and are never printed deliberately.

Because the repository is private, the snapshot is visible only to people who can access its Actions logs. Treat the output as private teaching-content metadata nevertheless.

## Cloudflare credentials

The workflow prefers this repository secret:

```text
CLOUDFLARE_D1_READ_TOKEN
```

Create this as a least-privilege Cloudflare API token with `D1 Read` permission for the Cloudflare account that owns the production D1 database.

For compatibility, if that secret is absent the workflow falls back to the existing deployment secret:

```text
CLOUDFLARE_API_TOKEN
```

The existing account ID secret is also required:

```text
CLOUDFLARE_ACCOUNT_ID
```

`CLOUDFLARE_ACCOUNT_ID` must identify the same Cloudflare account that owns `flash-cards-db`.

The fallback avoids blocking initial use, but a dedicated read-only token is preferred because it limits the effect of an accidental future workflow change and avoids depending on deployment-token scope.

At the start of each run, the workflow records whether it is using the dedicated D1-read token or the deployment-token fallback. It never prints the token value.

Never commit a token, API key, password, Better Auth secret, or other credential to the repository or workflow YAML.

## What the default snapshot contains

The default run queries:

```text
concepts
cases
case_concepts
```

It emits:

- Topic ID, name, slug, description, parent Topic, and active state;
- Case ID, internal title, a short vignette preview, and active state;
- every Case↔Topic relationship;
- relationship role (`primary` or `secondary`);
- Topic active state for each route.

This is sufficient for most Topic taxonomy, relabelling, hierarchy, and multi-Topic routing reviews after PR #18.

## Optional reusable Topic questions

The manual workflow has an `include_topic_questions` input, disabled by default.

When enabled it additionally reads:

```text
concept_questions
question_prompts
```

and emits reusable Topic prompts, a bounded answer preview, inheritance state, and active state.

Use this only when question context is helpful for understanding what a Topic actually teaches.

## Explicitly excluded data

The workflow must not be expanded casually to include:

- Better Auth tables;
- user identities or email addresses;
- sessions or authentication tokens;
- learner Reviews;
- learner ratings or progress;
- administrator credentials;
- unrestricted database dumps.

If a future task genuinely requires learner data, design a separate purpose-specific export with the smallest required fields and document its privacy boundary before implementation.

## Running the snapshot

After this workflow is merged into the default branch:

1. Open the repository on GitHub.
2. Open **Actions**.
3. Select **Production content snapshot**.
4. Choose **Run workflow**.
5. Leave `include_topic_questions` off for normal taxonomy review, or enable it when reusable question context is needed.
6. Open the completed run and the `snapshot` job.
7. The grouped log sections `TOPICS`, `CASE_TOPIC_ROUTES`, and optionally `TOPIC_QUESTIONS` contain the production snapshot.

The workflow uses the D1 binding `DB` defined in `wrangler.jsonc`, which currently points to production database `flash-cards-db` when Wrangler is invoked with `--remote`.

## Applying the agreed taxonomy change

The snapshot workflow is read-only and must remain read-only. The agreed production taxonomy update has a separate manually triggered operator:

```text
.github/workflows/apply-agreed-production-taxonomy.yml
scripts/apply-agreed-taxonomy.mjs
```

Configure a separate GitHub repository secret:

```text
CLOUDFLARE_D1_WRITE_TOKEN
```

It must be a least-privilege Cloudflare API token with D1 write/edit permission for the account that owns `flash-cards-db`. Do not grant write permission to `CLOUDFLARE_D1_READ_TOKEN`, and do not use the read token for this workflow.

The operator has no free-form SQL or workflow record-ID inputs. It uses the known production Case IDs and Cardiology ID, resolves the six agreed Topics by fixed slugs, reuses existing Topic rows, creates missing rows with reserved IDs, and updates only the agreed hierarchy and two Case route sets. It does not touch questions, assets, Reviews, users, authentication, or learner progress.

Run it safely:

1. Run **Apply agreed production taxonomy** with `apply = false`. Review the pre-flight output against the latest snapshot.
2. Run it again with `apply = true` only after the pre-flight matches the expected current state.
3. Confirm the transaction completes and inspect the post-flight read-back for the hierarchy, one primary plus one secondary route per target Case, and zero direct Cardiology routes for those Cases.
4. Run **Production content snapshot** again and retain both workflow run links as the audit record.

The operator is idempotent: rerunning it reuses the same Topic slugs, upserts the two intended Case relationships, preserves unrelated relationships, and leaves Cardiology active. If pre-flight or post-flight verification is unexpected, stop and use a reviewed rollback operator change; never paste ad-hoc SQL into Actions.

## Troubleshooting authorization

If Cloudflare returns error `7403` with a message that the account is not valid or is not authorized to access the service, the SQL has not run. Check both of the following:

1. `CLOUDFLARE_ACCOUNT_ID` is the account that owns `flash-cards-db`.
2. The token selected by the workflow has D1 access for that account.

Preferred fix:

1. In Cloudflare, create a custom API token scoped to the relevant account with `D1 Read` permission.
2. In GitHub repository settings, save that token as:

   ```text
   CLOUDFLARE_D1_READ_TOKEN
   ```

3. Keep the existing `CLOUDFLARE_ACCOUNT_ID` only if it is the owning account ID; otherwise correct that secret.
4. Re-run **Production content snapshot**.

The workflow prints a notice when the dedicated read token is selected and a warning when it has fallen back to the deployment token. If a fallback run receives error `7403`, do not broaden the deployment token merely to make the snapshot work; prefer the dedicated D1-read token.

## GitHub Actions runtime warning

The workflow uses the current `actions/checkout@v6`. Older runs that used `actions/checkout@v4` may show a Node.js 20 deprecation warning on newer GitHub-hosted runners. That warning is unrelated to Cloudflare D1 authorization and was not the cause of the first snapshot failure.

## Intended ChatGPT/GitHub workflow

Once a run has completed, a connected GitHub-capable assistant can inspect the workflow run/job logs without receiving the Cloudflare secret itself.

Typical request:

```text
Check the latest Production content snapshot and help me reorganise my production Topics.
```

The assistant should use the snapshot as the source of truth for production learning content rather than inferring production rows from seed fixtures or repository examples.

## Maintenance rule

Any future change to the snapshot's queried tables or fields, credential selection, or safety boundary must update this document in the same PR.
