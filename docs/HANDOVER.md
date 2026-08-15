# Flash-Cards agent handover

_Refreshed: 15 August 2026_

## Current outcome

The project has a working end-to-end V1 vertical slice and has now started the Admin content-management redesign.

Merged implementation milestones of note:

```text
PR #7  — D1-backed learner Reviews
PR #8  — protected R2 teaching-image pipeline
PR #9  — browser-based admin Case/Asset/question management
PR #10 — Admin shell + Case management redesign
```

PR #10 merged into `main` at:

```text
21f349b4869f59a8bccbf440437ce67088776b58
```

PR #10 CI was green before merge, including database checks, tests, Svelte checks, build, and local D1/Better Auth smoke validation in GitHub Actions.

The production Worker remains:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

A deliberate post-merge production redeploy may still be done later; do not assume the currently deployed Worker contains every newest `main` commit unless deployment is explicitly verified.

---

## Current next implementation phase

**PR #11 Questions Library and PR #12 Image Library should proceed in parallel from current `main`.**

Read:

```text
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/PARALLEL_WORK_PLAN.md
```

before implementation.

Expected workspaces:

```text
PR #11 branch: agent/admin-questions-library
PR #12 branch: agent/admin-images-library
```

PR #13 — Topics dashboard — should wait until PR #11 and PR #12 are merged.

---

## Admin product state after PR #10

The Admin UI is no longer one monolithic editing page.

Implemented:

- persistent Admin shell/navigation;
- `/admin` overview/dashboard;
- `/admin/cases` searchable Case library;
- `/admin/cases/new` dedicated Case creation;
- `/admin/cases/[caseId]` focused Case editor;
- Case internal title editing;
- primary Topic editing;
- Case vignette/stem editing;
- Case question add/edit/remove/reorder;
- optional save-as-reusable Topic question;
- upload JPEG/PNG teaching images through the protected R2 pipeline;
- clipboard paste, drag/drop, and file-picker upload;
- attach existing Assets to Cases without re-uploading;
- reorder/detach Case Assets;
- Case-specific image captions;
- learner Study preview.

Questions, Images, and Topics are the next Admin library surfaces.

---

## PR #11 product requirement — Questions Library

Build:

```text
/admin/questions
/admin/questions/[promptId]
```

The Questions Library must respect the established content model:

```text
Question Prompt
      ↓
Case or Concept usage
      ↓
context-specific answer
```

A reused prompt is not a complete independent flashcard. The same prompt may have different Case-specific answers.

Required capabilities include:

- search Question Prompt text;
- search Case/Concept answer text;
- useful Topic/scope filtering;
- usage counts;
- prompt detail showing all Case and Concept usages/answers;
- direct links back to Case editors;
- clear warning/blast-radius visibility before editing a reused shared prompt.

Do not silently clone a shared prompt merely to avoid global-edit semantics.

---

## PR #12 product requirement — Image Library

Build:

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

Required capabilities include:

- visual thumbnail library;
- search by image name, alt text, and source label;
- useful used/unused, active/inactive, and source-known/source-unknown filters;
- large Asset detail preview;
- edit Asset-level metadata;
- usage count and list of Cases using the Asset;
- direct links to Case editors;
- reuse the existing protected upload pipeline.

### Image renaming decision

The existing field:

```text
assets.original_filename
```

is intentionally treated as the administrator-editable image name.

The actual upload filename does **not** need separate preservation.

Renaming must update D1 metadata only and must never rename, move, copy, replace, or delete the R2 object/key.

These must remain stable:

- `assets.id`;
- `assets.storage_key`;
- R2 object/key;
- Case Asset relationships;
- Review relationships/snapshots.

No schema migration is expected for image renaming.

Case-specific captions remain in the Case editor because they belong to the `Case + Asset` relationship, not the global Asset.

---

## Learner flow

`/study` is D1-backed.

Current learner behaviour:

- learner selects a Concept/topic;
- system selects an eligible active Case;
- persisted Review history is used for immediate-repeat avoidance where possible;
- Case vignette is snapshotted;
- ordered Case Assets are snapshotted;
- questions resolve with precedence:
  `Case-specific > primary Concept > nearest inheritable ancestor > more distant ancestor`;
- randomized question set targets three and caps at four;
- all selected questions remain visible together;
- learner reveals answers;
- learner rates the whole Case `Again` or `Good`;
- Review timestamps/snapshots persist in D1.

Internal diagnosis-bearing Case titles are masked from learners.

Do not redesign this flow in PR #11 or PR #12.

---

## Educational/content model decisions

The main learner-facing unit is a **Case**, not a fixed front/back card.

Important rules:

- Case stem/vignette is Case-level context.
- Assets are reusable stimuli; store image bytes once in R2 and attach to multiple Cases when needed.
- Multiple images that must be interpreted together belong to one Case.
- Alternative examples of the same condition remain separate Cases.
- Case-specific question/answer takes precedence over reusable Concept-level question for the same prompt.
- reusable Question Prompt is separate from its context-specific answer.
- later exam question parts may hint at earlier parts; no gating is required.

See `docs/CONTENT_MODEL_EXAMPLES.md` and `docs/V1_DATA_MODEL.md`.

---

## Authentication status

Better Auth 1.6.25 is configured with direct Cloudflare D1 persistence and the Admin plugin.

Completed:

- public sign-up disabled;
- `/study` requires authentication;
- `/admin` requires administrator role;
- local auth smoke test exists;
- production auth schema deployed;
- first production administrator bootstrapped;
- administrator sign-in and Admin access verified.

Remaining later work:

- smallest administrator learner-account creation/management workflow;
- create a test learner;
- verify normal learner access to `/study` and denial from `/admin`.

These items remain after Admin CMS/pilot-content work.

Never store administrator credentials or `BETTER_AUTH_SECRET` in the repository or documentation.

---

## D1 / Drizzle state

The V1 learning-domain schema is active and includes:

- Concepts and hierarchy;
- Cases with `vignette_md`;
- Case/Concept links;
- Assets and Case Assets;
- reusable Question Prompts;
- Concept Questions;
- Case Questions;
- Reviews;
- Review Questions;
- Review Assets.

Drizzle is used for the learning-domain schema. Better Auth tables remain separate direct-D1 auth tables by design.

No migration is expected for PR #11 or #12 unless a concrete blocker is discovered and documented.

`scripts/seed-content.mjs` remains useful for local/tests but must not be run blindly in production because placeholder seed Asset keys do not have corresponding production R2 objects.

---

## R2 state and provenance

Private R2 is the canonical teaching-image store.

Implemented:

- `MEDIA` R2 binding;
- maximum 5 MiB per image;
- 5 GiB application-managed ceiling;
- immutable storage keys;
- upload through `putTeachingImage()`;
- orphan cleanup attempt if D1 Asset insert fails;
- authenticated `/api/assets/{assetId}/image` serving;
- MIME/ETag/private-cache handling;
- optional `source_label`, `source_url`, and `licence` metadata.

External source URLs are attribution/reference metadata only, never runtime image sources.

Unknown source is valid; never fabricate attribution.

See `docs/IMAGE_PROVENANCE.md` and `docs/R2_COST_GUARDRAILS.md`.

---

## Cloudflare resources

| Purpose | Binding | Production resource |
|---|---|---|
| Relational database | `DB` | D1 `flash-cards-db` (`ea6f3ec4-eb09-4fb1-8314-cd027436a2f8`) |
| Teaching images | `MEDIA` | R2 `flash-cards-media` |
| Static files | `ASSETS` | Workers static assets |

Worker name:

```text
flash-cards
```

Workers subdomain:

```text
mmed-fm-flashcardstest.workers.dev
```

---

## Recommended sequence

1. **PR #11 — Questions Library** — parallel now.
2. **PR #12 — Image Library + rename/edit metadata** — parallel now.
3. Merge both after review/green CI; rebase whichever is merged second if the shared Admin layout conflicts.
4. **PR #13 — Topics dashboard**.
5. Enter representative ECG/Cardiology, ENT, Eye, and Dermatology pilot content.
6. Fix Admin friction discovered during real content entry.
7. Implement learner-account administration and role-boundary acceptance.
8. Implement basic learner progress administration.
9. Only later revisit FSRS/scheduling, bulk Anki import, richer analytics, structured marks/marking points, or broader stimulus types.

---

## Known technical debt

- `package.json` still pins Wrangler 4.115.0 while compatibility/release work has used 4.123.0; update deliberately rather than incidentally inside PR #11/#12.
- do not run `npm audit fix --force` casually.
- Review Asset historical serving currently depends on live Asset resolution; deactivation semantics may need later refinement.
- attribution metadata is live rather than snapshotted.
- if marks become structured, do not encode them in strings and parse them later.

---

## Validation

Before an implementation PR is considered complete:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

GitHub CI must be green before merge.
