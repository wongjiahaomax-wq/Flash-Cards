# Beta Test Credentials — Implementation Plan

_Status: reviewed implementation contract for Draft PR #182. PR #181 has merged; PR #182 owns both planning and implementation. Keep #182 Draft and implement this contract in the same PR after rebasing the branch onto exact current `main`._

_Last reviewed: 15 September 2026._

`BETA_TEST_CREDENTIALS_IMPLEMENTATION_AMENDMENT.md` records the review corrections that made this plan implementation-ready. Those corrections are incorporated below. If older wording elsewhere conflicts, this current plan governs execution; use the amendment as the review record.

## Why this exists

The application is approaching small closed beta testing, but transactional email cannot yet be used for arbitrary beta users because there is no verified custom sending domain. The existing Resend/password-recovery architecture remains the intended production path and must not be replaced.

For the beta period, the Administrator needs a deliberately simple way to create Learner accounts and manually issue credentials without email delivery.

The product requirement is:

```text
Production Administrator
        ↓
Admin Accounts portal
        ↓
create Beta Learner
        ↓
choose simple beta username + initial password
        ↓
privately give those credentials to the learner
        ↓
learner signs in with username + password
```

There is no requirement for public registration, email verification, self-service beta password recovery, a permanent username authentication system, or a second auth database.

---

# Locked design decision

Use the existing Better Auth email/password system. Do **not** add Better Auth's username plugin and do not add a username column/schema migration.

A beta username is a product-facing alias for an internal synthetic email:

```text
beta01
    ↓
beta01@beta.invalid
```

`.invalid` is a reserved non-deliverable namespace and is suitable for these synthetic identities.

Better Auth continues to authenticate the internal email/password credential. The learner-facing sign-in page performs the small translation before calling the existing `authClient.signIn.email(...)` path.

This means the repository keeps one authentication architecture:

```text
normal account: real@example.com + password
beta account:   beta01@beta.invalid + password
                           ↑
                    UI displays beta01
```

No beta password is emailed. No Resend call is made for beta account creation or beta password replacement.

---

# Current branch / lifecycle state

PR #181 has merged and its Production Admin Accounts implementation is now the foundation for this work.

PR #182 remains the single PR for the beta-credentials feature. Do not create a separate implementation PR.

Before product-code implementation:

1. inspect exact current `main`;
2. rebase the PR #182 branch onto that exact `main` result;
3. confirm the PR remains targeted to `main`;
4. keep PR #182 Draft;
5. implement this reviewed contract in PR #182.

The PR was previously stacked on #181 for planning. That stacked state is no longer the implementation base.

Do not reimplement PR #181 controls. Extend the merged account-management architecture in place.

Expected implementation surfaces include, but are not limited to:

```text
src/lib/server/accounts/admin-accounts.ts
src/routes/admin/accounts/+page.server.js
src/routes/admin/accounts/+page.svelte
src/routes/admin/accounts/[userId]/+page.server.js
src/routes/admin/accounts/[userId]/+page.svelte
src/routes/sign-in/+page.svelte
src/routes/forgot-password/+page.server.js
src/hooks.server.js
scripts/local-auth-smoke.mjs
```

Use current repository guidance and progressive retrieval rather than treating this list as an exhaustive file prescription.

---

# Better Auth assumptions to verify at implementation time

The repository remains pinned to Better Auth `1.6.25` unless a separate dependency decision changes that.

Better Auth v1.6 exposes the Admin `setUserPassword` operation and documents that it creates a credential account if the user does not already have one. Email/password defaults are 8–128 characters unless configured otherwise.

Implementation must verify the **installed pinned API**, not merely online documentation, and preserve real Better Auth/D1 executable proof in the local auth smoke.

Do not upgrade Better Auth for this feature.

---

# Product semantics

## Beta Learner

A Beta Learner is still an ordinary Better Auth `user` / product Learner.

It is identified by an internal email ending exactly in:

```text
@beta.invalid
```

The username is the local part before that suffix.

Example:

```text
name:           Test Learner 01
beta username:  beta01
internal email: beta01@beta.invalid
role:           user
```

Do not add a new auth role such as `beta`, `tester`, or `beta_user`.

## Beta accounts are Learner-only

Beta credentials are intentionally simple credentials distributed manually for pilot testing. They must not become a shortcut for Production Administrator credentials.

Required invariant:

```text
Beta account → Learner only
```

Therefore:

- Beta creation may create only `user` accounts;
- the Admin UI must not offer Administrator as a beta creation type;
- server-side role promotion of a Beta Learner to Production Administrator must be rejected;
- the standard Add account path must reject the reserved `@beta.invalid` namespace for both Learner and Administrator creation;
- ordinary Production Administrator accounts continue to use the existing real-email account path.

Do not rely on hiding a button alone; enforce these restrictions server-side.

---

# Username rules

Normalize beta usernames to lowercase. The only input restrictions are that a
username must be non-empty after trimming and must not contain whitespace or
`@`, because it is embedded as the local part of the synthetic
`<username>@beta.invalid` email identity.

Examples:

```text
valid:
a
beta01
resident-01
fm2026
resident_01
-beta01
beta01-
resident.01

invalid:
<empty>
A User
beta@example.com
```

A suitable validation expression is:

```text
^[^\s@]+$
```

The server must perform the authoritative validation. Client/UI validation may improve usability but is not the security boundary.

Focused validation must explicitly prove:

```text
blank or whitespace-only → rejected
whitespace-containing   → rejected
@-containing            → rejected
short, long, and punctuation-containing values → accepted when otherwise valid
```

Retain proportionate coverage for normalization and deterministic mapping.

Uniqueness comes from the existing unique email identity constraint after deterministic mapping to `<username>@beta.invalid`; do not add a second username registry.

---

# Reserved `@beta.invalid` namespace

The dedicated Beta Learner path exclusively owns `@beta.invalid`.

## Standard Admin Add account

The existing standard Add account path must reject any address ending exactly in `@beta.invalid` for both account types:

```text
standard Add account + learner@beta.invalid + Learner
→ reject before identity creation

standard Add account + admin@beta.invalid + Administrator
→ reject before identity creation
```

The restriction must be server-side. UI validation may assist but is not authoritative.

Normal real-email Learner and Administrator creation must remain unchanged.

## Public password recovery

Public password recovery must never create a reset token or attempt email delivery for a beta identity.

This applies to every currently reachable reset-request surface, including:

```text
/forgot-password
/api/auth/request-password-reset
```

Required behavior:

- `@beta.invalid` requests do not reach beta reset-token creation or reset-email processing;
- `/forgot-password` preserves the existing generic/non-enumerating public result;
- direct `POST /api/auth/request-password-reset` also remains generic/non-enumerating;
- the response must not reveal that the namespace is reserved or whether the account exists;
- normal real-email password recovery continues through the existing Better Auth/Resend path;
- existing Preview password-recovery blocking and reset-request rate limiting remain intact.

Do not add beta self-service recovery, a second recovery architecture, or a new rate-limit architecture.

---

# Password rules

The Administrator chooses and privately distributes the beta password.

For v1, use the current Better Auth password bounds only:

```text
minimum: 8 characters
maximum: 128 characters
```

Do not add:

- complexity rules;
- password strength meters;
- forced first-login change;
- password expiry;
- one-time temporary passwords;
- password history;
- generated-password infrastructure.

The Administrator can choose a memorable per-user password such as a short multi-word/random combination, but the product must not encourage one shared password for all beta users.

Passwords must never be:

- stored in the `user` table or a new application table;
- returned by account read APIs;
- logged;
- placed in query strings;
- included in PR/test fixture output using real credentials;
- shown again after the create/reset request completes.

Better Auth remains responsible for credential hashing in the existing `account` table.

If validation fails, preserve safe fields such as name/username as useful, but do not echo the submitted password back into action data.

---

# Minimal shared beta-login helper

Add one small pure helper module that may be imported by both client and server code. Prefer a narrow location such as:

```text
src/lib/auth/beta-credentials.js
```

It should own only deterministic beta identity semantics, for example:

```text
BETA_EMAIL_SUFFIX = '@beta.invalid'
normalizeBetaUsername(value)
betaUsernameToEmail(username)
betaUsernameFromEmail(email)
isBetaEmail(email)
loginIdentifierToEmail(value)
```

Do not put database/auth API calls in this shared module.

`loginIdentifierToEmail` should behave approximately as:

```text
contains @  → treat as normal email login
no @        → validate/normalize beta username → append @beta.invalid
```

This prevents duplicate mapping logic between the Admin UI and sign-in page.

---

# Admin Accounts UX

Do not replace or complicate the existing standard Add account workflow from merged PR #181.

Prefer two visibly separate creation surfaces rather than a JavaScript-heavy conditional form.

## Existing standard account form

Keep the current real-email behavior:

```text
Add account
Name
Email
Learner / Administrator
→ reject reserved @beta.invalid namespace
→ otherwise create identity
→ setup email via existing password-reset mechanism
```

This remains the long-term production flow and may be unusable for arbitrary recipients until a sending domain is configured. That is an operational limitation, not a reason to remove it.

## New Beta Learner form

Add a second compact section, for example:

```text
Add beta learner

Name              [________________]
Beta username     [beta01__________]
Initial password  [••••••••••••••••]

[Create beta learner]
```

Supporting copy should state:

- no email is sent;
- the Administrator must give the username/password to the learner;
- the password cannot be viewed later;
- this creates a Learner only.

Use a password input with `autocomplete="new-password"`.

No password-confirmation field is required unless implementation experience shows mistyping is a realistic problem. Prefer one field for v1.

---

# Beta account creation server flow

Add a purpose-specific operation such as:

```text
createBetaLearner(...)
```

Keep the route thin.

Required sequence:

```text
POST Admin action
→ require Production Administrator
→ reject Preview runtime
→ validate name
→ validate/normalize beta username
→ validate password bounds
→ derive username@beta.invalid
→ Better Auth Admin createUser
   role = user
   password = Administrator-supplied password
→ return safe account metadata only
→ redirect to account detail
```

Use Better Auth's installed Admin create-user API rather than manually writing `user` or `account` credential rows.

Creation should be a direct credential creation path. Do not create the account passwordlessly and then invoke the email/reset system.

The beta creation path must **not call Resend**, `requestAdminPasswordEmail`, password-reset token creation, or any external email provider.

Map duplicate identity errors to a useful Admin message such as:

```text
That beta username is already in use.
```

Do not disclose or return the password after creation.

---

# Accounts read model / UI representation

Derive beta state from the reserved internal email suffix; do not persist a separate beta flag.

Extend the account view model only as much as needed, e.g.:

```text
betaUsername: string | null
```

The underlying email may remain available server-side for Better Auth operations, but ordinary Admin UI should present the product-facing login identifier.

Recommended directory presentation:

```text
Name              Login                 Type      Status
Test Learner 01   beta01   [Beta]       Learner   Active
Dr Example         dr@example.com        Learner   Active
```

The current search backend can continue searching the stored email field. Because the beta username is embedded in `beta01@beta.invalid`, username substring search already works through the email search path.

A small UI label change from `Email` to `Email / beta username` or `Login` is sufficient. Do not build a new search index.

---

# Account detail UX

For a Beta Learner, show:

```text
Beta test account
Username: beta01
Type: Learner
Status: Active
```

Do not show the current password; it is not recoverable and should not be stored separately.

Replace irrelevant email actions with one beta-specific action:

```text
Set new beta password
```

Keep existing PR #181 lifecycle actions where applicable:

- revoke sessions;
- Disable / Restore;
- permanent Learner deletion;
- deletion progress / Continue deletion.

Do not allow:

- Send setup email;
- Send password-reset email;
- Promote to Production Administrator.

Those restrictions must also exist server-side so a direct action POST cannot bypass the UI.

For non-beta accounts, keep merged PR #181 behavior unchanged.

---

# Admin-set beta password

Add a purpose-specific server operation such as:

```text
setBetaLearnerPassword(...)
```

Required checks:

```text
Production Admin authority
non-Preview runtime
account exists
account is a Beta Learner
no learner-account deletion is in progress
password is within current Better Auth bounds
```

Then call the pinned Better Auth Admin `setUserPassword` equivalent using the acting request headers where required.

Do not implement password mutation with raw D1 writes.

Do not automatically expose the submitted password in the success response.

Existing `Revoke sessions` remains a separate explicit action for v1. Do not invent transactional password+session machinery merely for this pilot workflow.

---

# Sign-in UX

The current sign-in page accepts `Email` and calls:

```text
authClient.signIn.email({ email, password })
```

Change only the presentation/mapping layer.

Recommended field:

```text
Email or beta username
```

Use `type="text"` with `autocomplete="username"` rather than `type="email"`, because beta usernames contain no `@`.

Before the existing Better Auth call:

```text
user enters beta01
→ helper maps to beta01@beta.invalid
→ authClient.signIn.email(...)
```

Normal email sign-in remains unchanged:

```text
dr@example.com
→ dr@example.com
→ authClient.signIn.email(...)
```

Keep the same generic authentication failure behavior. Do not add an endpoint that lets unauthenticated callers test whether a beta username exists.

The existing Forgot password link remains for real-email accounts. Add concise adjacent guidance such as:

```text
Beta test users: ask the administrator to set a new password.
```

The adjacent copy is guidance only. The server-side reserved-namespace recovery guard remains mandatory because a caller can submit the synthetic beta email directly.

---

# Permanent deletion confirmation

Merged PR #181 requires exact-email confirmation before starting permanent Learner deletion.

For Beta Learners, the product-facing identifier is the beta username. The Accounts detail flow should therefore require the exact displayed beta username instead of forcing the Administrator to type the hidden synthetic email.

Server rule:

```text
normal account → exact normalized email confirmation
beta account   → exact normalized beta username confirmation
```

The underlying staged deletion engine remains unchanged and continues to operate by user id.

Do not change learner-deletion storage/phases for this feature.

---

# Security / authority boundaries to preserve

This is a convenience feature for a closed beta, not a relaxation of authentication boundaries.

Preserve all merged PR #181 protections:

- only Production Administrators may manage accounts;
- Preview Worker cannot perform Production account management;
- public `/api/auth/admin` and `/api/auth/admin/*` HTTP paths remain blocked;
- trusted server-side Better Auth Admin API calls occur only behind protected application actions;
- Preview-only identities remain outside Production Accounts management;
- deletion markers fence conflicting account mutations;
- last-active-Production-Admin protections remain intact;
- public signup remains disabled.

Because this PR newly relies on `setUserPassword`, extend executable bypass proof so a direct HTTP request to the Better Auth Admin password endpoint is rejected by the existing hook boundary before Better Auth handles it.

Do not add rate-limit architecture, distributed locks, audit infrastructure, or a separate credential service.

---

# No schema migration expected

This design intentionally uses existing Better Auth tables:

```text
user.email      = beta01@beta.invalid
user.role       = user
account         = Better Auth credential account/password hash
session         = existing Better Auth sessions
```

No new application table or column is required.

Do not add persisted fields for:

- beta username;
- beta-account boolean;
- plaintext/temporary password;
- password-delivery status;
- invitation state.

If implementation discovers that a schema change is actually required, stop and document the concrete blocker rather than silently broadening the design.

---

# Failure behavior

Keep failures explicit and recoverable.

## Create Beta Learner

If validation fails:

- no user is created;
- no credential is created;
- no email is attempted;
- password is not echoed back.

If Better Auth creation fails:

- report a safe Admin-facing error;
- do not attempt compensating raw D1 writes.

## Set beta password

If the target is not a Beta Learner, reject the request.

If deletion is in progress, reject with the existing deletion-in-progress product error.

If Better Auth rejects the password or operation, leave account state as Better Auth committed it and return a safe error. Do not add a custom rollback subsystem.

---

# Focused executable proof

Testing should be proportional to this small feature but must cover the security-sensitive credential path at the correct behavioral layer.

## Pure helper tests

Prove:

- beta username normalization for short, long, hyphenated, and punctuated values;
- blank, whitespace-containing, and `@`-containing usernames are rejected;
- deterministic `<username>@beta.invalid` mapping;
- beta username extraction from the reserved suffix;
- normal email login passes through;
- beta username login maps to the synthetic email.

## Account-management tests

Prove:

- Production Admin can create a Beta Learner;
- Preview/non-Admin authority cannot;
- beta creation always uses role `user`;
- duplicate username maps to a safe conflict;
- submitted password is passed to Better Auth but not returned in safe account/action data;
- standard Add account rejects `@beta.invalid` for Learner creation with no identity created;
- standard Add account rejects `@beta.invalid` for Administrator creation with no identity created;
- ordinary real-email Learner/Admin creation remains unchanged;
- beta setup/reset email actions are rejected server-side;
- beta promotion to Administrator is rejected server-side;
- standard Learner/Admin role behavior remains unchanged;
- beta deletion confirmation uses beta username;
- deletion marker still blocks beta password mutation.

## Password-recovery surface tests

Exercise the actual behavioral surfaces rather than only a helper:

```text
/forgot-password + beta address
→ generic public response
→ no Better Auth reset token created
→ no reset email/provider call attempted

POST /api/auth/request-password-reset + beta address
→ generic/non-enumerating public response
→ no Better Auth reset token created
→ no reset email/provider call attempted

real email through existing recovery
→ existing normal recovery behavior still works
```

Helper-only tests are supplemental for these two public surfaces.

## Real Better Auth + D1 smoke

Extend `scripts/local-auth-smoke.mjs` using only local/non-production fixtures to prove the installed Better Auth version:

```text
Production Admin session
→ protected Accounts create-beta action
→ user row contains beta01@beta.invalid + role user
→ credential account exists
→ sign-in succeeds with beta password
→ protected Admin set-beta-password action
→ old password no longer signs in
→ new password signs in
```

Also add direct HTTP bypass proof for the relevant Better Auth Admin password mutation endpoint:

```text
POST /api/auth/admin/set-user-password
→ 403 at application hook boundary
→ credential state unchanged
```

Do not call real Resend and do not mutate Production D1.

## Sign-in presentation

Prefer testing the pure mapping helper plus existing auth smoke over adding a large browser-testing layer solely for this field-label change.

If an existing lightweight Playwright/auth test can prove username entry end-to-end with minimal code, it is acceptable, but it is not required if helper + real Better Auth smoke already prove the invariant.

---

# Implementation sequence for Luna 5.6

The planning contract is approved and PR #181 is merged. Implementation is now authorized in Draft PR #182 after the branch is rebased onto exact current `main`.

1. Inspect exact current `main`, rebase the existing #182 branch onto it, and confirm the PR still targets `main`. Do not create another PR.
2. Read root `AGENTS.md`, applicable `AGENT_TASK_MAP.md`, this plan, the merged PR #181 account-management implementation, the amendment, and nearest scoped guidance using progressive retrieval.
3. Confirm pinned Better Auth version and exact installed `createUser` / `setUserPassword` server signatures before code changes.
4. Add the small shared beta identity helper and focused unit tests.
5. Extend the account read model with derived beta username only; no migration.
6. Add `createBetaLearner` to the existing account-management server boundary.
7. Reserve `@beta.invalid` at standard Add account for both Learner and Administrator creation before identity creation.
8. Add the separate Beta Learner form/action to `/admin/accounts` without changing normal real-email creation behavior.
9. Add Beta account detail presentation and `Set new beta password` action.
10. Enforce server-side beta restrictions: no email setup/reset actions and no promotion to Production Administrator.
11. Adapt Accounts deletion confirmation to beta username while leaving the staged deletion engine unchanged.
12. Update sign-in to accept `Email or beta username` and translate beta usernames through the shared helper.
13. Block beta identities from token/email processing at both public reset-request surfaces while preserving generic/non-enumerating behavior and normal real-email recovery.
14. Extend real local Better Auth/D1 smoke for create → sign-in → Admin password replacement → re-sign-in and direct public Admin endpoint rejection.
15. Run focused tests first, then repository-required final validation appropriate to the changed surfaces.
16. Reconcile only living docs that become stale; do not rewrite historical PR-A/PR-B evidence as though beta credentials were part of those earlier changes.

Do not implement extra account-security features while touching this area.

---

# Acceptance criteria

Implementation is complete only when all of the following are true:

- [ ] PR #182 remains the single Draft PR for planning + implementation; no follow-up implementation PR exists.
- [ ] The implementation branch is based on exact current `main` after merged PR #181.
- [ ] Merged PR #181 account management is the retained foundation; no duplicate portal/auth architecture exists.
- [ ] A Production Administrator can create a Beta Learner with name, beta username, and initial password without any email delivery.
- [ ] Beta username maps deterministically to `<username>@beta.invalid` and requires no new schema.
- [ ] Beta username validation removes the product-level length and character-set restriction while preserving non-empty, whitespace-free, `@`-free synthetic email mapping.
- [ ] Standard Add account rejects `@beta.invalid` for both Learner and Administrator before identity creation.
- [ ] Beta accounts are normal Learners (`user`) and cannot be promoted to Production Administrator.
- [ ] Learners can sign in using the beta username rather than seeing/typing the synthetic email.
- [ ] Normal email/password sign-in still works unchanged.
- [ ] `/forgot-password` beta requests remain generic and create no beta reset-token/email side effect.
- [ ] Direct `/api/auth/request-password-reset` beta requests remain generic/non-enumerating and create no beta reset-token/email side effect.
- [ ] Normal real-email password recovery still follows the existing Better Auth/Resend path.
- [ ] Beta accounts do not expose setup/reset email actions.
- [ ] Administrator can set a new beta password through protected server-side Better Auth Admin API use.
- [ ] Current passwords are never readable/displayed/stored separately.
- [ ] Existing Disable/Restore, revoke-session, deletion-progress, and permanent Learner deletion behavior continue to work.
- [ ] Beta deletion confirmation uses the visible beta username.
- [ ] Deletion-in-progress fences beta password/role/lifecycle conflicts consistently with merged PR #181.
- [ ] Public `/api/auth/admin/*` remains unusable as an alternate password-management control plane.
- [ ] Real local Better Auth/D1 smoke proves creation, credential sign-in, password replacement, old-password rejection, and new-password sign-in.
- [ ] Direct `/api/auth/admin/set-user-password` is rejected with credential state unchanged.
- [ ] No real Resend call, Production D1 mutation, deployment, or secret change occurs as part of implementation/testing.
- [ ] Standard real-email account creation/password-recovery architecture remains intact for future custom-domain rollout.

---

# Explicitly out of scope

Do not add these unless a later product decision explicitly requests them:

- Better Auth username plugin;
- username database column/index;
- public username registration;
- beta self-service password recovery;
- emailing synthetic beta addresses;
- forced password change at first login;
- password expiry/history/complexity framework;
- shared global beta password;
- beta Production Administrator accounts;
- bulk beta account generation/import;
- account impersonation;
- 2FA/passkeys;
- conversion of beta usernames to real email identities;
- automatic cleanup/expiry of beta accounts;
- new email provider;
- removal of Resend or PR-A password recovery;
- new authentication database/provider;
- generalized credential-management framework.

---

# Future custom-domain transition

When a verified sending domain is eventually available, the standard email account path remains the preferred production workflow.

This PR does not need to decide whether existing beta identities will be converted to real-email identities or simply deleted after testing. Learner progress is already associated with the Better Auth user id, so any future conversion strategy should be planned deliberately if preservation is needed.

Do not solve that migration in this beta-credentials PR.
