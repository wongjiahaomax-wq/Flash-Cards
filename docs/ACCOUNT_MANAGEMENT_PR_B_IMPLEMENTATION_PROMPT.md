# Account Management PR B — Production Admin Accounts

_Status: planning-only implementation contract for the new PR B Draft. Do not implement product code until this contract has been reviewed._

_Last reviewed: 14 September 2026._

This is the current implementation contract for **Account Management PR B**. It replaces the stale August handoff and is grounded in current `main` after PR #178 and PR #180 merged.

Where older account-management documentation says routine hard deletion is absent, that statement is stale for normal Learners: current `main` already contains a tested staged permanent learner-account deletion flow and the product decision is now to expose that existing capability from the Accounts portal. Do **not** use that decision to invent a second deletion engine or to direct-delete Administrator/Preview identities.

---

## Work state

Repository:

`wongjiahaomax-wq/Flash-Cards`

Planning base:

`main` at `2301ec8a44a78ab61eb8fa96c16cdc4440a19212`

This base contains:

- PR #178 test-discovery / current-schema fixture cleanup;
- PR #179 local Playwright support;
- PR #180 password recovery + transactional email.

The old Draft PR #97 (`agent/admin-account-management`) was stacked on obsolete August PR-A work and must **not** be revived or merged wholesale. This new PR B should start from current `main` and reuse current implementation directly.

Before coding, follow:

- root `AGENTS.md`;
- the applicable rows in `docs/AGENT_TASK_MAP.md`;
- `docs/ACCOUNT_MANAGEMENT_PLAN.md` as product context, subject to the current deletion decision above;
- `docs/PASSWORD_RECOVERY.md` for the merged PR-A implementation;
- `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md`;
- nearest scoped `AGENTS.md` files for any modified server/Admin areas.

Do not implement from memory. Refresh current head, installed Better Auth version, relevant API signatures, and directly affected route/module tests before mutation.

---

# Goal

Implement the smallest complete **production Admin Accounts portal** for closed enrollment.

The intended lifecycle is:

```text
production Administrator
        ↓
/admin/accounts
        ↓
list/search accounts
        ↓
Add account
        ↓
Learner or production Administrator
        ↓
server creates Better Auth identity with undisclosed random credential
        ↓
existing Better Auth password-reset flow sends setup/reset link
        ↓
recipient chooses their own password
        ↓
normal sign-in
        ↓
Admin may resend setup/reset email, revoke sessions,
change Learner/Admin role, Disable/Restore,
or permanently delete a Learner
```

The application remains private. Public signup remains disabled.

---

# Verified current baseline

At the planning base:

## Authentication

- Better Auth remains pinned at `1.6.25`.
- Cloudflare D1 remains the single auth/user database.
- `src/lib/server/auth-config.js` has email/password enabled and `disableSignUp: true`.
- `src/lib/server/auth.js` installs Better Auth's Admin plugin and the merged PR-A password-reset callback.
- `src/hooks.server.js` blocks Production Admin routes and Better Auth Admin endpoints on the Preview Worker.
- `src/lib/server/preview-auth.js` parses comma-separated roles and distinguishes `admin`, `preview_admin`, and Preview-only Admin.
- `src/routes/admin/+layout.server.js` requires a production `admin` role and rejects Preview.
- `src/routes/admin/+layout.svelte` owns the production Admin navigation.

## Better Auth schema

The existing Better Auth migration already has the fields PR B needs:

```text
user.id
user.name
user.email
user.createdAt
user.updatedAt
user.role
user.banned
user.banReason
user.banExpires
session
account
verification
```

No PR-B schema migration is expected.

## PR-A email/reset foundation

Current merged code already provides:

- `src/lib/server/email/transactional.ts`;
- `src/lib/server/email/resend.ts`;
- `src/lib/server/email/password-reset.ts`;
- one-hour Better Auth reset-token expiry;
- session revocation after successful reset;
- fragment-based reset URLs so tokens are absent from the initial HTTP request URL;
- request-lifetime background email scheduling;
- public anti-enumeration behavior;
- Preview fail-closed password-recovery boundaries.

Reuse those semantics. Do not add a second reset-token or Resend architecture.

## Existing permanent learner deletion

Current `main` already contains:

- `src/lib/server/db/learner-account-deletion.ts`;
- the durable `learner_account_deletions` marker;
- immediate access revocation;
- bounded deletion of Better Auth sessions/verifications/accounts and learner study/history state;
- final identity removal through Better Auth;
- retry-safe progress phases;
- existing Production Admin orchestration in `src/routes/admin/learner-analytics/+page.server.js`.

The existing deletion primitive deliberately accepts only normal Learners (`role = user`). Preserve that safety boundary in PR B.

---

# Pinned Better Auth Admin capabilities

The v1.6 Admin plugin supports the server-side operations PR B needs, including the equivalents of:

```text
createUser
listUsers
setRole
banUser
unbanUser
revokeUserSessions
removeUser
```

Use the exact APIs/types present in installed `better-auth@1.6.25`; do not upgrade Better Auth merely to match newer documentation.

For privileged server APIs, pass the acting request headers where required so Better Auth performs its own Admin authorization in addition to the application's Production Admin guard.

Prefer Better Auth APIs for identity mutations. Direct reads of the Better Auth-owned `user` table are acceptable where a small bounded application read model is materially simpler and must join application-owned deletion state; do not perform ad-hoc direct SQL writes to Better Auth identity fields as a shortcut.

---

# Product role model

Keep the existing role model.

| Product concept | Stored role semantics | PR-B treatment |
| --- | --- | --- |
| Learner | `user` / ordinary default | fully manageable |
| Production Administrator | `admin` | fully manageable subject to lockout guards |
| Preview Administrator | `preview_admin` | not managed here |
| Combined owner | contains `admin` + `preview_admin` | production Admin authority retained; Preview component must never be lost |

Do not introduce a new `learner` auth role.

Do not add Preview Admin creation to the Production Accounts UI.

### Preview-role safety simplification

PR B does not need to solve arbitrary custom-role composition.

For any identity whose current role set contains `preview_admin`:

- it may be displayed if it is also a production Admin;
- do not change its role, Disable/Restore it, or delete it unless the installed pinned Better Auth API can demonstrably preserve the Preview role without ambiguity and focused tests prove the exact behavior;
- the safe default is to show those destructive/role controls as unavailable with a short explanation;
- reset/setup email and session revocation may remain available only if they do not alter role/lifecycle authority and the current production security model permits them.

Do not broaden Better Auth access-control configuration solely to make Preview-role mutations convenient.

---

# Scope

Implement only the following.

1. Production Admin navigation entry for **Accounts**.
2. `/admin/accounts` bounded list/search.
3. Account detail/actions.
4. Add Learner or production Administrator.
5. Undisclosed server-generated initial credential where required by Better Auth.
6. Initial setup/reset email using the merged PR-A reset mechanism.
7. Resend setup/password-reset email.
8. Learner ↔ Administrator role changes.
9. Active ↔ Disabled lifecycle.
10. Revoke all sessions.
11. Self-lockout and last-active-production-Admin guards.
12. Permanent **Learner** deletion using the existing staged deletion machinery.
13. Deletion-progress/continue UI for bounded multi-request deletion.
14. Focused executable tests and concise operator/docs reconciliation required by the implementation.

---

# Explicitly out of scope

Do not add:

- public signup/self-registration;
- Preview Admin creation UI;
- a new auth/user database;
- a Better Auth upgrade;
- direct password assignment by an Administrator as the normal workflow;
- a separate invitation-token table/system;
- OAuth/social login;
- magic links;
- 2FA/passkeys;
- cohort/organization features;
- bulk account import;
- a generalized notification framework;
- a new audit subsystem unless an existing audit mechanism can be reused trivially;
- self-service `/account` profile/password UI;
- durable/distributed rate-limit architecture;
- arbitrary hard deletion of production Administrators or Preview-bearing identities;
- deletion/anonymization redesign of content authored by Administrators;
- Production deployment, live Resend configuration, secret mutation, or live production-account mutation during implementation.

---

# UX / route shape

Prefer a simple route structure rather than a large modal-heavy single page:

```text
/admin/accounts
/admin/accounts/new
/admin/accounts/[userId]
```

This is guidance, not a mandate if current route conventions make an equally small alternative clearer.

## `/admin/accounts`

Show a compact table/list with:

- Name;
- Email;
- Type: `Learner` / `Administrator`;
- Status: `Active` / `Disabled` / `Deletion in progress`;
- Created date;
- action/link to details;
- **Add account**.

Provide practical GET-based search by name/email.

Use bounded pagination. A simple default such as 50 rows/page with a small hard maximum is sufficient; do not build infinite scrolling or a generic grid framework.

Preview-only identities do not belong in the ordinary Production Accounts list. A combined identity containing `admin` and `preview_admin` may appear as an Administrator but should expose its protected Preview-role state.

## `/admin/accounts/new`

Simple fields only:

- Name;
- Email;
- Account type: Learner / Administrator.

No password field.

On success, redirect to the new account detail page and report that setup email was **requested**, not guaranteed delivered.

## `/admin/accounts/[userId]`

Display:

- Name;
- Email;
- Type;
- Status;
- Created date;
- protected Preview-role note where applicable;
- deletion progress where applicable.

Group actions clearly:

### Password / access

- Send setup/password-reset email;
- Revoke all sessions.

### Account type

- Promote Learner → Administrator;
- Demote Administrator → Learner.

### Lifecycle

- Disable;
- Restore.

### Danger zone

- Delete Learner permanently;
- Continue deletion when staged deletion is in progress.

Do not use raw product-facing labels such as `banned` or `banReason` when `Disabled` is the actual product concept.

---

# Server-side ownership

Keep routes thin.

Prefer one cohesive new server module first, for example:

```text
src/lib/server/accounts/admin-accounts.ts
```

It should own the account read model and security-sensitive account operations/guards. Split it only if it becomes genuinely unwieldy; do not pre-create a mini-framework.

Expected route responsibilities:

```text
parse form/query
→ require Production Admin + non-Preview runtime
→ call purpose-specific server operation
→ map typed safe error/result to SvelteKit response
```

Do not create a generic `utils.ts` dumping ground.

Prefer TypeScript for the new server module.

---

# Production Admin authorization

Every Accounts page/action must fail closed server-side.

At minimum:

- Preview Worker → 403;
- unauthenticated → sign-in/appropriate denial according to existing Admin conventions;
- normal Learner → no account-management authority;
- Preview-only Admin → no production account-management authority;
- production Admin → permitted subject to target-specific guards.

Do not rely solely on the parent layout for mutation authorization. A direct form/action POST must still re-check the Production Admin/runtime boundary close to the mutation.

Remember: a direct server call to `auth.api.*` does not traverse the public `/api/auth/admin` hook path. The application route itself must enforce the Preview/Production boundary before calling it.

---

# Account read model

The account directory needs Better Auth identity fields plus application deletion state.

A small bounded D1 read model is acceptable and likely simplest because current code already reads Better Auth `user` rows for learner analytics and the Accounts UI must join `learner_account_deletions`.

Read-only fields may include:

```text
user.id
user.name
user.email
user.createdAt
user.role
user.banned
user.banReason
user.banExpires
learner_account_deletions.phase
```

Do not read credential hashes/tokens.

Derive product state in one place:

```text
deletion marker present → Deletion in progress
else banned             → Disabled
else                    → Active
```

Derive roles using the same comma-separated semantics as `parseRoles()`; do not use substring logic that would mistake `preview_admin` for `admin`.

Search must use parameters, remain bounded, and support name/email. Return a total/count only if needed for ordinary pagination.

---

# Tranche 1 — Accounts directory + read-only UI

Implement first:

1. Production Admin authorization helper/context as narrowly needed.
2. Bounded Accounts list/search read model.
3. Account detail read model.
4. `/admin/accounts` page.
5. `/admin/accounts/[userId]` read-only detail.
6. Accounts navigation entry.
7. Product status/type derivation.
8. Display protected Preview-role state without mutating it.

Do not add mutations until this tranche is coherent.

### Focused Tranche-1 tests

Prove:

- Production Admin can load list/detail;
- Learner cannot;
- Preview Worker cannot;
- Preview-only Admin cannot;
- list is bounded/paginated;
- search is parameterized and matches name/email;
- `preview_admin` is not misclassified as production `admin`;
- combined `admin,preview_admin` is displayed as Administrator + protected Preview role;
- banned maps to Disabled;
- deletion marker maps to Deletion in progress and takes precedence over Disabled display.

---

# Tranche 2 — Create account + setup email

## Create-account mutation

Use Better Auth's installed Admin `createUser` API or its pinned equivalent.

Required behavior:

1. require Production Admin/non-Preview runtime;
2. validate name/email/account type;
3. reject unsupported Preview role creation;
4. generate a high-entropy random password **server-side** if Better Auth requires a password;
5. call Better Auth to create the identity;
6. never expose the generated credential to the browser, logs, email, action result, or docs;
7. request the existing Better Auth password-reset flow for the new email so the recipient chooses their own password;
8. return/redirect using only safe account metadata.

Use the platform Web Crypto API already available in Workers/Node rather than adding a password-generation dependency.

Do not create predictable temporary passwords.

## Email configuration

Keep PR A's lazy auth construction unchanged.

For the **Admin create-account** workflow only, it is reasonable to fail before creating the account when `RESEND_API_KEY` / `AUTH_EMAIL_FROM` are plainly absent, because an Admin-created closed-enrollment account without a usable setup path is operationally poor. Do not make missing email configuration break ordinary sign-in/session lookup.

Provider acceptance still cannot be atomically coupled to D1/Better Auth user creation.

## Delivery semantics

PR A intentionally schedules email delivery in the request lifetime and does not expose provider latency/failure to the public reset response. Do not undo that architecture merely so the Admin page can claim delivery.

Use wording such as:

```text
Account created. Setup email requested.
```

not:

```text
Email delivered.
```

If the Better Auth reset-request call itself fails synchronously after account creation, preserve the account and return a clear privileged Admin result indicating that the account exists and setup email should be retried from the detail page.

If the external provider later rejects asynchronous delivery, the account remains valid and the Admin can use **Send setup/password-reset email** again.

## Email copy

The simplest v1 may reuse the existing reset email unchanged.

A small copy-only adjustment to make the same tokenized email suitable for both first setup and later reset is allowed, e.g. `Set or reset your Flash-Cards password`, provided:

- the same Better Auth token mechanism remains authoritative;
- forgot-password anti-enumeration/timing behavior is unchanged;
- no second invitation context/token store is introduced;
- existing PR-A security tests are updated proportionally.

Do not add request-scoped invitation context machinery solely for different wording.

### Focused Tranche-2 tests

Prove:

- create Learner;
- create Administrator;
- duplicate email fails safely;
- public signup remains disabled;
- generated initial credential is not present in returned data/log assertions/email content;
- setup reset request is issued for created email;
- missing email configuration fails before Admin UI account creation if that preflight is implemented;
- synchronous reset-request failure after creation leaves one created account and exposes a retry path, not a second create;
- Preview/learner callers cannot create accounts;
- no real Resend request occurs in normal tests.

---

# Tranche 3 — Reset email, sessions, Disable/Restore, role changes

## Send setup/password-reset email

Use the merged PR-A Better Auth reset-request path/server API.

This is a privileged Admin action, so it may state whether the target account exists. Do not change the public `/forgot-password` anti-enumeration behavior.

Block this action for an account whose permanent deletion is already in progress.

## Revoke all sessions

Use Better Auth's pinned `revokeUserSessions` API or equivalent.

Do not build a custom session DELETE query.

A manual revoke changes sessions only; it must not Disable the account.

For v1, do not expose a self-revoke control in the Accounts page if doing so would merely log out the acting Admin unexpectedly. The server action should fail closed for self-targeting unless a deliberate self-session product flow is later added.

## Disable

Use Better Auth `banUser`/pinned equivalent with an indefinite disabled state.

Requirements:

- future sign-in fails;
- existing sessions are revoked;
- learner/history data remains;
- user identity remains;
- no finite automatic expiry unless deliberately required.

Verify the pinned Better Auth behavior rather than assuming docs. If `banUser` does not revoke existing sessions in the installed version, explicitly call its supported revoke-all-sessions API after the ban.

Use a non-sensitive reason such as `Disabled by administrator` if a reason is required.

## Restore

Use Better Auth `unbanUser`/pinned equivalent.

Restore permits future sign-in but must not recreate old sessions.

## Role changes

Support only normal production role changes:

```text
user  → admin
admin → user
```

Use Better Auth `setRole`/pinned equivalent.

Do not mutate role while permanent deletion is in progress.

For any target containing `preview_admin`, fail closed unless current installed API behavior has been explicitly proven to preserve it. Do not silently replace `admin,preview_admin` with `user` or `admin`.

### Focused Tranche-3 tests

Prove:

- revoke-all invalidates an existing target session while account stays Active;
- Disable prevents sign-in and invalidates existing target session;
- Restore permits new sign-in and does not revive old session;
- Learner promotion succeeds;
- Administrator demotion succeeds when safe;
- self-disable fails;
- self-demote fails;
- Preview-bearing target mutation fails closed under the chosen v1 rule;
- deletion-in-progress account cannot be restored/promoted/reset-email-requested into an inconsistent state.

---

# Last-active-production-Admin guard

This is a mandatory server-side invariant for Disable and demotion.

Immediately before either mutation:

1. read authoritative current target state;
2. confirm target is still an active production Admin;
3. count current **active production Administrators**;
4. exclude Preview-only identities from that count;
5. count combined `admin,preview_admin` as production Administrators because they contain `admin`;
6. reject when the mutation would leave zero active production Administrators.

Also reject self-disable/self-demote regardless of count.

Use exact role-token semantics, not `LIKE '%admin%'` logic that also matches `preview_admin`.

Keep engineering proportional. Do not introduce distributed locks, queues, Durable Objects, or a new concurrency subsystem solely for this small closed-enrollment Admin UI. Keep the check immediately adjacent to the mutation and document the residual cross-request race if the Better Auth API prevents one atomic D1 transaction.

---

# Tranche 4 — Permanent Learner deletion

Permanent deletion is now **in scope** for normal Learners.

Do not create a new deletion algorithm.

Reuse:

```text
beginLearnerAccountDeletion(...)
advanceLearnerAccountDeletion(...)
removeUserWithBetterAuth(...)
```

and the current durable markers/guards.

## Delete eligibility

Allow delete only when all are true:

- target identity exists;
- target is a normal Learner (`user`/ordinary learner semantics);
- target does not contain `admin`;
- target does not contain `preview_admin`;
- acting user is a Production Admin;
- runtime is not Preview.

An Administrator who should be deleted must first be **demoted to Learner** through the normal role action. That demotion is already protected by self-demote and last-active-Admin guards. After demotion, the same learner deletion flow applies and safely clears any study data the former Administrator may have accumulated.

This two-step design is deliberate. Do not add a separate direct Administrator-deletion path in PR B.

Preview-bearing identities are not deletable from this portal in PR B.

## Confirmation

Require the Admin to type the target email exactly (case-insensitive comparison is acceptable after trimming) before the first destructive deletion request.

Do not rely on a browser-only confirmation dialog.

## Bounded progression

Preserve the existing bounded/retry-safe deletion design.

One HTTP request may perform only the existing small bounded number of deletion steps. If the account is not ready for identity removal, return:

```text
Deletion in progress
current phase
Continue deletion
```

The account must remain access-revoked while staged deletion exists.

When the deletion primitive reports `readyForIdentityDelete`, remove the identity through Better Auth's existing `removeUser` wrapper/API, not raw SQL.

After final identity removal:

- account disappears from Accounts list;
- sign-in is impossible;
- account/session/verification and learner data are gone according to the existing staged deletion contract;
- no deletion marker is left orphaned beyond existing cascade semantics.

## Shared orchestration

There is already deletion orchestration in `src/routes/admin/learner-analytics/+page.server.js`.

Do not create two subtly different destructive workflows.

Preferred smallest solution:

- extract only the small request-bounded orchestration shared by Learner Analytics and Accounts into one focused server helper; or
- if current code already exposes an adequate shared primitive by implementation time, use it directly.

Keep email-confirmation/UI mapping in each route as appropriate.

Do not broadly refactor learner analytics.

## Conflicting actions during deletion

Once `learner_account_deletions` exists, block ordinary account mutations that could fight deletion, including:

- Restore;
- role change;
- setup/reset email resend;
- manual session management other than what deletion itself owns.

The only Accounts action should be **Continue deletion** until identity removal completes.

### Focused Tranche-4 tests

Preserve existing staged-deletion tests and add only the Accounts-facing coverage needed to prove:

- delete requires exact-email confirmation;
- normal Learner deletion starts and immediately revokes access;
- bounded request can return Deletion in progress;
- Continue deletion resumes the existing durable phase rather than restarting unsafe work;
- final ready state removes identity through Better Auth;
- deleted account cannot sign in and no longer appears in Accounts;
- disabled Learner can still be permanently deleted;
- Administrator delete action fails and instructs demotion first;
- after a safe Admin→Learner demotion, the same delete flow works;
- self/last-Admin protections therefore cannot be bypassed through Delete;
- Preview-bearing identities cannot be deleted;
- Preview Worker cannot perform deletion.

---

# Error/result model

Use small typed server errors/results rather than exposing raw Better Auth/SQLite/provider errors.

Admin-facing messages may reveal that an account exists because this is an authorized account-management surface.

Never return/log:

- password hashes;
- generated temporary passwords;
- reset tokens;
- full tokenized reset URLs;
- session tokens;
- Resend API key;
- raw provider response bodies.

Log only the minimum operational context necessary, preferably action + safe target user id, and avoid recipient email when it is not required.

---

# No schema migration by default

Current schema already supports:

- roles;
- disabled/banned state;
- sessions;
- reset verifications;
- permanent learner deletion markers and staged cleanup.

Do not add a migration merely to track invitation state, account status, or role labels.

The first version does **not** need persisted invitation status. `Setup email requested` is an action result, not a new durable account state.

If implementation discovers an actual persisted-field requirement, stop that narrow tranche and justify it before adding schema.

---

# Tranche 5 — UI polish + living documentation reconciliation

After behavior is correct:

1. ensure Accounts navigation and pages match current Admin spacing/forms/table conventions;
2. keep destructive actions visually separated in a Danger zone;
3. show clear disabled/protected controls for self/last-Admin/Preview-bearing constraints where useful, while retaining server-side enforcement;
4. show deletion progress plainly;
5. avoid a new component/design system unless repeated markup genuinely warrants a small local component.

Reconcile living account documentation only where current merged state or the implemented PR-B behavior makes it materially stale.

At minimum, final implementation should update `docs/ACCOUNT_MANAGEMENT_PLAN.md` to reflect:

- PR A merged;
- PR B implemented state;
- permanent normal-Learner deletion now exposed through Accounts using the already-existing staged deletion contract;
- production Admin deletion requires safe demotion to Learner first;
- Preview-bearing identity deletion remains outside this portal.

Also reconcile `docs/DOCUMENTATION_INDEX.md` Authentication / Account Management status if needed.

Do not rewrite historical prompt bodies merely for chronology.

---

# Security invariants

The final implementation must preserve all of these.

1. Public signup remains disabled.
2. No public account-creation endpoint is introduced.
3. Only Production Administrators can manage production accounts.
4. Preview Worker cannot manage production accounts.
5. Preview-only Admins cannot manage production accounts.
6. Better Auth remains credential/session/reset authority.
7. No Better Auth upgrade is bundled into PR B.
8. No new auth database/table is created.
9. Admin never chooses or learns a target user's initial password.
10. Generated initial credential is high entropy and never returned/logged/emailed.
11. Initial setup reuses Better Auth reset semantics.
12. Reset tokens remain absent from initial application HTTP request URLs.
13. Public forgot-password anti-enumeration remains unchanged.
14. Disable prevents sign-in and revokes existing sessions.
15. Restore never resurrects old sessions.
16. Manual Revoke all sessions does not Disable the account.
17. Self-disable is blocked server-side.
18. Self-demote is blocked server-side.
19. Last active production Admin cannot be Disabled.
20. Last active production Admin cannot be demoted.
21. `preview_admin` is never accidentally stripped or promoted into production authority.
22. Permanent delete is available only for a normal Learner in PR B.
23. Production Administrator deletion requires safe demotion to Learner first.
24. Preview-bearing identity deletion remains blocked.
25. Learner deletion reuses the current durable staged deletion flow and Better Auth final identity removal.
26. Deletion in progress remains access-revoked and retry-safe.
27. No password/hash/reset token/session token/provider secret is exposed in logs or browser data.
28. No Production deployment, secret mutation, or live Production-account mutation is part of implementation/testing without separate explicit authorization.

---

# Test strategy

Keep testing proportional to the real security/product risk. Do not build a new test framework.

## Unit/read-model tests

Cover:

- role parsing/product type;
- status derivation;
- search/pagination;
- Preview-bearing protection;
- active-production-Admin count/guard;
- typed validation/errors.

Use the repository current-schema fixture (`applyCurrentSchema`) for ordinary runtime tests, consistent with merged PR #178.

## Better Auth integration tests

Using the pinned installed package and isolated DB/fake email behavior, prove representative real API semantics for:

- createUser;
- setRole;
- ban/unban;
- revokeUserSessions;
- requestPasswordReset;
- removeUser where Accounts deletion reaches final identity removal.

Do not mock the exact Better Auth behavior that the test is intended to prove.

## Route/runtime tests

Prove direct application actions enforce:

- Production Admin only;
- Preview fail closed;
- self/last-Admin guard;
- lifecycle effects;
- deletion confirmation/progression.

Extend an existing local auth/Worker smoke only where that gives materially stronger evidence without turning it into an oversized all-purpose suite.

## Browser/UI coverage

Use the merged Playwright setup for one or two focused high-value paths if practical, e.g.:

- Accounts page renders/searches and opens detail;
- destructive Learner delete requires typed confirmation / shows controlled progress.

Do not reproduce every server mutation in Playwright when lower-level runtime tests already prove it.

---

# Focused implementation sequence for Luna 5.6

Implement in coherent tranches and review each tranche before expanding scope.

## Step 0 — refresh current state

Before mutation:

```text
current PR head/base
installed better-auth version
current Better Auth Admin API signatures/types
current auth/Preview guards
current learner deletion APIs/tests
current Admin route conventions
current test-routing output from agent:checks
```

Do not re-read unrelated repository architecture.

## Step 1 — Tranche 1

Accounts list/detail read model + read-only UI + navigation.

Run only focused account/read-model/auth-boundary tests plus repository-routed checks required by changed files.

## Step 2 — Tranche 2

Create account + setup/reset request.

Add focused Better Auth integration proof. Confirm no secret/temporary credential appears in outputs/logs.

## Step 3 — Tranche 3

Reset resend + session revoke + Disable/Restore + role changes + lockout guards.

Test representative session/sign-in effects, not just source shape.

## Step 4 — Tranche 4

Expose permanent Learner deletion by reusing the existing staged engine. Share only the small orchestration necessary with Learner Analytics.

Run existing deletion regressions plus focused Accounts-facing deletion tests.

## Step 5 — Tranche 5

UI cleanup and living-doc reconciliation only after behavior is stable.

## Checkpoint / final handoff

Use repository routing rather than inventing a validation list:

```sh
npm run agent:checks
```

Then run every required/specialized check it reports.

During development, use targeted tests for the affected tranche. Do not repeatedly run the full suite after tiny edits.

At final handoff, run the repository-selected full validation path (normally `npm run validate:full` when reported), plus any account/auth/deletion/browser checks that `agent:checks` does not already cover and that are required by this contract.

Inspect the complete intended-base → head diff once before handoff.

Do not claim commands were run if they were not actually run.

---

# Manual acceptance checklist

Using local/test identities only:

1. Production Admin opens Accounts.
2. Search finds account by name/email.
3. Add Learner; no password is shown; setup email request is reported.
4. Add Administrator; same undisclosed-credential behavior.
5. Existing target receives/reset flow can establish password in configured test environment.
6. Revoke sessions logs target out without disabling.
7. Disable logs target out and blocks sign-in.
8. Restore allows a new sign-in but old session remains invalid.
9. Promote Learner to Administrator.
10. Demote a non-self/non-last Administrator to Learner.
11. Self-disable and self-demote are rejected.
12. Last-active-Admin disable/demote are rejected.
13. Preview-bearing role mutation/destruction is unavailable/fails closed.
14. Delete Learner requires typed email.
15. Deletion either completes or shows Deletion in progress + Continue deletion.
16. Continue deletion reaches final identity removal.
17. Deleted Learner cannot sign in and disappears from Accounts.
18. Administrator cannot be deleted directly; after safe demotion to Learner, deletion becomes available.
19. Preview Worker cannot access or mutate Production Accounts.
20. Public signup remains disabled.

---

# Acceptance criteria

PR B is implementation-complete only when:

- Accounts navigation + list/search/detail exist;
- list/search is bounded;
- add Learner/Admin works without an Admin-visible password;
- setup/reset email uses PR-A Better Auth reset semantics;
- resend setup/reset works;
- revoke all sessions works;
- Disable/Restore works with real session/sign-in effects;
- Learner/Admin promotion/demotion works for supported pure production roles;
- Preview-bearing roles fail closed from unsupported destructive/role changes;
- self-disable/self-demote and last-active-Admin guards are server-side and tested;
- permanent normal-Learner deletion is available with typed confirmation;
- deletion reuses staged deletion, supports Continue deletion, and finalizes through Better Auth;
- an Administrator must be safely demoted to Learner before deletion;
- no schema migration was added unless separately justified by implementation evidence;
- public signup, Preview boundaries, password-recovery security, and existing learner deletion behavior remain intact;
- final repository-required validation passes;
- no Production deployment/configuration/data mutation was performed merely to validate the PR.

---

# Short handoff to implementation agent

```text
Implement Account Management PR B from this Draft's reviewed contract.

Priority:
1. bounded Production Admin Accounts list/search/detail;
2. Add Learner/Admin with server-generated undisclosed credential;
3. reuse PR-A Better Auth reset flow for setup/resend;
4. revoke sessions + Disable/Restore;
5. Learner/Admin role changes with self/last-active-Admin guards;
6. expose permanent Learner deletion using the existing staged deletion engine;
7. Admin must be demoted to Learner before deletion; Preview-bearing identities remain protected;
8. keep routes thin, prefer one cohesive TS account server module, no schema by default;
9. no Better Auth upgrade, no new invitation token system, no broad auth refactor;
10. use focused tests per tranche and repository-selected final validation.

Do not implement beyond this contract without concrete current-head evidence that the requirement cannot otherwise be satisfied.
```