# Account Management PR B — Production Admin Accounts

_Status: implementation contract for Draft PR #181. The PR-B implementation is present; final handoff and rollout verification remain pending._

_Last reviewed: 14 September 2026._

This is the current implementation contract for **Account Management PR B**. It replaces the stale August handoff and is grounded in current `main` after PR #178 and PR #180 merged.

**Normative security amendment:** `ACCOUNT_MANAGEMENT_PR_B_IMPLEMENTATION_AMENDMENT.md` is part of this contract and supersedes/tightens this prompt where they differ. It closes the Production `/api/auth/admin/*` bypass surface and requires a pre-existing durable deletion marker before `Continue deletion` may advance staged deletion.

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
- `docs/ACCOUNT_MANAGEMENT_PR_B_IMPLEMENTATION_AMENDMENT.md` as the normative security tightening for this prompt;
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

No additional account-state migration is required. The implementation does include two narrow D1 integrity migrations: `0029_account_admin_safety.sql` protects the last active Production Administrator, and `0030_learner_account_deletion_integrity.sql` makes a deletion marker and Production role change mutually exclusive. Apply both when deploying pending migrations.

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

In addition, apply `ACCOUNT_MANAGEMENT_PR_B_IMPLEMENTATION_AMENDMENT.md`: the public Better Auth `/api/auth/admin` HTTP subtree must not remain an alternate Production mutation control plane. Block the unused direct HTTP surface at the existing hook boundary while preserving trusted server-side `auth.api.*` calls, with focused runtime proof.

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

Also run the amendment's direct-HTTP bypass proof: Production requests to the Better Auth `/api/auth/admin` subtree must be rejected before mutation, while protected server-side Accounts actions can still call `auth.api.*` and ordinary auth endpoints remain available.

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

## Start versus Continue precondition

Apply the normative amendment explicitly:

- **Start deletion** is the only action allowed to create the durable `learner_account_deletions` marker, and only after typed-email confirmation succeeds.
- **Continue deletion** must first prove server-side that the durable marker already exists for the target.
- If no marker exists, Continue fails without calling the auto-starting `advanceLearnerAccountDeletion()`, without banning the user, without creating/resetting deletion markers, and without deleting auth or learner data.

Do not change `advanceLearnerAccountDeletion()` solely to remove its existing auto-start behavior. Enforce this distinction in the Accounts route/shared orchestration before delegation.

## Shared orchestration

There is already deletion orchestration in `src/routes/admin/learner-analytics/+page.server.js`.

Do not create two subtly different destructive workflows.

Preferred smallest solution:

- extract only the small request-bounded orchestration shared by Learner Analytics and Accounts into one focused server helper; or
- if current code already exposes an adequate shared primitive by implementation time, use it directly.

Keep email-confirmation/UI mapping in each route as appropriate.

If orchestration is shared, preserve explicit **start confirmed deletion** versus **continue existing deletion** semantics. Do not allow a shared helper to auto-start a deletion merely because `advanceLearnerAccountDeletion()` can do so.

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
- direct Continue POST with **no existing marker** fails and leaves identity, ban state, deletion-marker state, sessions/accounts and representative learner data unchanged;
- confirmed Start creates the durable marker before Continue is accepted;
- Continue deletion resumes the existing durable phase rather than restarting/auto-starting unsafe work;
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

# Narrow schema migrations only when integrity requires them

Current schema already supports:

- roles;
- disabled/banned state;
- sessions;
- reset verifications;
- permanent learner deletion markers and staged cleanup.

Do not add a migration merely to track invitation state, account status, role labels, or deletion confirmation. The implementation's `0029_account_admin_safety.sql` and `0030_learner_account_deletion_integrity.sql` migrations are narrow database backstops for concurrency and lockout integrity, not new product state.

The first version does **not** need persisted invitation status. `Setup email requested` is an action result, not a new durable account state.

The existing `learner_account_deletions` marker is sufficient to distinguish a confirmed/start-in-progress permanent deletion from a rejected direct Continue request; do not add a second confirmation marker.

If implementation discovers an actual persisted-field requirement, stop that narrow tranche and justify it before adding schema.

---

# Tranche 5 — UI polish + living documentation reconciliation

After behavior is correct:

1. ensure Accounts navigation and pages match current Admin spacing/forms/table conventions;
2. keep destructive actions visually separated in a Danger zone;
3. show deletion progress clearly without exposing internal SQL details;
4. reconcile living account-management documentation to state that PR A is merged and permanent normal-Learner deletion is supported through the existing staged engine;
5. keep historical branch-era prompts/evidence historical rather than rewriting all old docs;
6. document that external `/api/auth/admin/*` is intentionally blocked as a public account-mutation surface while internal server-side `auth.api.*` remains the application mutation path.

Do not mix Production deployment evidence into repository implementation status.

---

# Validation strategy

Use focused validation during implementation, not a full suite after every small edit.

For each tranche:

```text
coherent code + tests
→ scoped diff
→ focused tests
```

At checkpoint/final handoff follow current `docs/TESTING_AND_VALIDATION_GUIDANCE.md` and `npm run agent:checks` routing.

Security-sensitive final evidence must include the applicable real runtime boundaries rather than source assertions only:

- Better Auth/D1 integration for create/role/ban/unban/session/remove paths;
- Production hook/runtime proof that public `/api/auth/admin/*` cannot mutate accounts while ordinary auth remains functional;
- Preview fail-closed behavior;
- public signup still disabled;
- PR-A password reset still works;
- direct Continue-without-marker route proof plus confirmed Start → Continue progression;
- staged deletion through final Better Auth identity removal;
- browser/UI smoke for the Accounts happy path and destructive confirmation where practical with existing Playwright infrastructure.

External Resend delivery must remain faked/injected for normal automated tests. Do not send live email or mutate Production accounts merely to satisfy validation.

---

# Acceptance criteria

PR B is implementation-ready/complete only when all applicable items below are true.

## Authority / boundary

- only Production Admin can access/manage Accounts;
- Preview Worker cannot manage Production accounts;
- Preview-only Admin cannot manage Production accounts;
- public `/api/auth/admin` HTTP routes cannot bypass PR-B policy on Production;
- trusted protected Accounts actions can still use server-side `auth.api.*`;
- ordinary sign-in/sign-out/get-session remain unaffected;
- public signup remains disabled.

## Creation / password setup

- Admin can create Learner and production Administrator;
- no Admin-visible password exists;
- generated credential is high entropy and undisclosed;
- setup/reset request reuses Better Auth + PR-A flow;
- duplicate email is safe;
- account survives a post-create setup-request failure with retry path;
- no second invitation-token architecture exists;
- direct Better Auth Admin HTTP creation cannot bypass the no-direct-password workflow.

## Roles / lifecycle / sessions

- promote/demote normal production roles;
- Preview-bearing role is not accidentally stripped;
- self-disable/self-demote fail;
- last-active-production-Admin disable/demote fail;
- direct Better Auth Admin HTTP role/lifecycle mutations cannot bypass those guards;
- Disable prevents sign-in and revokes sessions;
- Restore permits new sign-in but revives no old session;
- manual revoke revokes sessions only;
- deletion-in-progress target is fenced from conflicting mutations.

## Permanent Learner deletion

- exact-email confirmation is server-side for the initial Delete action;
- durable deletion marker/access revocation happens before bounded cleanup;
- Continue requires an already-existing `learner_account_deletions` marker server-side;
- Continue without a marker is non-destructive and cannot auto-start deletion;
- confirmed Start → Continue progression is executable-proven;
- bounded retry/resume works;
- final identity removal uses Better Auth;
- direct Better Auth Admin HTTP remove-user cannot bypass staged deletion or confirmation;
- normal Learner data/auth state is removed according to existing deletion contract;
- Administrator deletion requires prior safe demotion;
- Preview-bearing identity cannot be deleted from PR B.

## Scope

- no Better Auth upgrade;
- no new auth DB;
- no new schema without separately justified need;
- no new deletion state machine;
- no distributed locking/queue architecture;
- no broad auth/Admin refactor;
- no Production deployment/secret/account mutation as part of coding/testing.

---

# Luna 5.6 implementation sequence

Implementation sequence used for this Draft:

1. sync to the exact current PR head and run repository doctor/routing;
2. read this prompt **and** `ACCOUNT_MANAGEMENT_PR_B_IMPLEMENTATION_AMENDMENT.md` as one contract;
3. verify exact pinned Better Auth Admin APIs and current tests;
4. implement Tranche 1 and focused tests;
5. implement Tranche 2 and focused tests;
6. implement Tranche 3 plus the direct `/api/auth/admin/*` runtime block/proof;
7. implement Tranche 4 with explicit confirmed-Start versus marker-required-Continue semantics;
8. reconcile UI/docs in Tranche 5;
9. run repository-selected final validation and inspect the entire base→head delta;
10. keep PR Draft until independent review is complete.

Do not implement beyond this contract merely because nearby auth/Admin cleanup appears possible.

---

# Final handover summary for Luna

Implement the smallest production Admin Accounts portal on current post-PR-A architecture.

```text
/admin/accounts
→ bounded directory/search
→ Add Learner/Admin with no Admin-known password
→ reuse PR-A Better Auth setup/reset email
→ reset resend / revoke sessions
→ Disable/Restore
→ Learner↔Admin with self + last-Admin guards
→ permanent Learner deletion via existing staged engine
```

Two non-negotiable boundary rules from the normative amendment:

```text
public /api/auth/admin/* on Production
→ blocked before Better Auth
→ protected server auth.api.* remains usable

Continue deletion
→ requires existing learner_account_deletions marker
→ never auto-starts an unconfirmed deletion
```

Protect Preview-bearing identities, keep public signup disabled, preserve Preview boundaries, add no new auth/deletion architecture, and keep validation proportional but executable at the actual security boundaries.
