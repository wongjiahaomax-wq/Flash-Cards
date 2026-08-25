# Account Management Plan

_Status: pending product/implementation design_

_Last reviewed: 25 August 2026_

This document records the agreed direction for production account creation, learner/Admin account management, password recovery, transactional authentication email, and related security controls.

It is a design/implementation handoff, not a statement that these capabilities are deployed.

## Goal

Provide the smallest complete account lifecycle for the private Flash-Cards application:

```text
first production Admin bootstrap
        ↓
Admin-managed closed enrollment
        ↓
Learner / production Admin accounts
        ↓
email-based set-password / password recovery
        ↓
normal sign-in
        ↓
Admin disable/restore/session security controls
```

The application should remain private. Public self-registration is intentionally out of scope.

## Current repository baseline

Current `main` already uses Better Auth with Cloudflare D1.

Relevant implementation:

- `src/lib/server/auth.js`
  - Better Auth is D1-backed;
  - email/password authentication is enabled;
  - `disableSignUp: true` intentionally disables public registration;
  - the Better Auth Admin plugin is installed.
- `src/lib/auth-client.js`
  - the Better Auth Admin client plugin is installed.
- `src/hooks.server.js`
  - request-scoped Better Auth is created from Cloudflare bindings;
  - production/Preview runtime boundaries are enforced before Better Auth handles privileged Admin routes.
- `src/lib/server/preview-auth.js`
  - current role parsing distinguishes `admin` and `preview_admin`.
- `src/routes/admin/+layout.server.js`
  - production Admin access requires the `admin` role.
- `src/routes/study/+layout.server.js`
  - ordinary authenticated accounts can Study, while Preview-only Admin identities are blocked.
- `scripts/bootstrap-admin.mjs`
  - creates the first production Admin directly in D1 and refuses to bootstrap another Admin when one already exists.
- `src/routes/sign-in/`
  - currently supports email/password sign-in but has no forgotten-password flow.

`package.json` currently pins Better Auth `1.6.25`.

Do not replace Better Auth or introduce a second credential/session system for this feature.

Before implementation, confirm the exact Better Auth `1.6.25` server/client APIs used by the Admin and email/password plugins. Do not bundle a Better Auth upgrade into account-management work merely to match newer documentation.

## Product terminology and roles

Keep the internal role model small.

| Product concept | Better Auth role representation | Intended access |
| --- | --- | --- |
| Learner | ordinary/default `user` | Study |
| Production Administrator | `admin` | Admin + Study |
| Preview Administrator | `preview_admin` | retained Preview-only authority |
| Combined owner identity | `admin,preview_admin` | existing combined behavior |

Do **not** introduce a separate `learner` role merely for display terminology. Existing application authorization already treats an ordinary authenticated non-Preview-only user as a learner.

Do **not** make Preview Admin creation/management part of the ordinary production Accounts UI. Preview identity is a separate retained security/runtime concept and should keep its existing bootstrap/ownership contract unless deliberately redesigned later.

## Closed enrollment

Public sign-up remains disabled.

The normal account-creation path should become:

```text
production Admin
→ Admin / Accounts
→ Add account
→ choose Learner or Administrator
→ enter name + email
→ server creates Better Auth user
→ server sends secure set-password email
→ recipient chooses their own password
→ normal sign-in
```

The existing `npm run admin:bootstrap` flow remains the first-production-Admin and disaster-recovery mechanism. It should not become the normal way subsequent accounts are created.

## New-account credential design

An Administrator should not choose or learn another user's password.

If the pinned Better Auth Admin create-user API requires an initial password, generate a high-entropy random credential on the server solely to establish the credential account, then immediately issue the same secure reset/set-password flow used for password recovery.

The generated credential:

- must never be displayed to the Admin;
- must never be emailed;
- must never be logged;
- must never be returned to the browser;
- should never be relied on by the recipient.

The account invitation is therefore effectively a **Set your password** link rather than a temporary password.

Email delivery is external and cannot be transactionally committed with D1. If user creation succeeds but invitation email delivery fails, preserve the created account, report the delivery failure clearly to the Admin, and provide a safe **Resend set-password email** action. Never expose the generated credential as a recovery mechanism.

## Admin Accounts UI

Add a production-Admin-only Accounts area, expected route:

```text
/admin/accounts
```

Add **Accounts** to the existing production Admin navigation.

### Accounts list

The first useful list should support:

- name;
- email;
- product-facing account type (`Learner` / `Administrator`);
- status (`Active` / `Disabled`);
- created date where available;
- search/filter sufficient for normal small-scale administration;
- `Add account`.

Use Better Auth's Admin APIs/read models where they provide the required behavior rather than maintaining a parallel application-owned user table.

### Account detail / actions

An account detail surface should provide, as applicable:

- name and email;
- Learner / Administrator role;
- Active / Disabled state;
- created date;
- send/resend password-reset/set-password email;
- revoke all sessions;
- promote Learner → Administrator;
- demote Administrator → Learner;
- disable account;
- restore account.

Do not expose raw Better Auth terminology such as `banned` when `Disabled` is clearer product language.

## Disable rather than delete

Normal account removal should be **Disable account**, not hard deletion.

The learning domain persists `userId` on Reviews. Hard-deleting an authentication user without an explicit learning-data retention/anonymization policy could leave historical study records pointing at an identity that no longer exists.

Therefore Account Management v1 should support:

```text
Active
↔ Disabled
```

and should **not** expose a routine `Delete user` control.

Where the pinned Better Auth Admin plugin supports ban/unban semantics, it may be used as the underlying implementation while the product UI says Disabled/Restore.

Disabling must revoke existing sessions so the account cannot continue using an already-authenticated browser/device.

Hard deletion is deferred until the project explicitly decides what should happen to Reviews and any future learner-progress data.

## Administrator role safety

Role and lifecycle mutations must prevent accidental production lockout.

At minimum, fail closed when attempting to:

- disable the currently signed-in Administrator's own account;
- demote the currently signed-in Administrator's own account from `admin`;
- disable the last remaining active production Administrator;
- demote the last remaining active production Administrator.

These protections belong server-side. Hiding or disabling a browser button is not sufficient authorization.

Do not permit production Admin account-management actions through the Preview Worker. Preserve the existing `src/hooks.server.js` boundary that blocks Better Auth Admin endpoints on the Preview runtime.

## Password recovery

Add a conventional email-based password-recovery flow.

Expected learner-facing routes:

```text
/sign-in
   ↓
/forgot-password
   ↓
email reset link
   ↓
/reset-password?token=...
```

The sign-in page should expose **Forgot password?**.

### Request behavior

The forgot-password form accepts an email address and always returns a generic response such as:

> If an account exists for that email address, password reset instructions have been sent.

Do not reveal whether an email exists in the user table.

Do not create application-owned reset tokens if the pinned Better Auth email/password flow already provides secure reset-token generation/validation.

### Reset behavior

A successful password reset should:

- require a valid unexpired Better Auth reset token;
- apply the normal password-policy rules;
- revoke the user's existing sessions;
- allow normal sign-in with the new password;
- avoid exposing the token in logs, analytics, error reporting, or audit payloads.

Target reset-token lifetime: approximately **1 hour**, subject to the supported pinned Better Auth configuration.

Configure session revocation on password reset when supported by the pinned version. If that exact option is unavailable, implement equivalent server-side session revocation using the supported Better Auth Admin/session APIs.

## Changing a known password

Keep these three operations distinct:

| Situation | Operation |
| --- | --- |
| User knows current password | self-service **Change password** |
| User forgot password | email **Forgot password** flow |
| Admin is helping a user | **Send password-reset email** |

Do not make direct Admin assignment of another person's new password the normal product workflow, even if Better Auth exposes a set-password Admin API.

A self-service `/account` page for changing one's own password/name is useful but may be implemented after the core Admin + recovery flows if scope needs to remain small.

## Transactional email

Better Auth should remain responsible for authentication/reset semantics. The application supplies the actual email transport.

Recommended initial architecture:

```text
Better Auth callback / account workflow
        ↓
small server-side email abstraction
        ↓
Resend HTTP API
        ↓
recipient mailbox
```

### Preferred initial provider

Use **Resend** as the preferred initial transactional-email provider unless implementation-time verification finds a concrete blocker.

At planning time its free transactional tier appeared sufficient for the expected low-volume usage of invitations and password resets. Provider pricing is not an application contract and must be rechecked when accounts are implemented/deployed.

Do not make the application depend directly on Resend-specific calls throughout auth/UI code. Keep provider-specific delivery behind a small purpose-specific server module so changing provider later does not require rewriting authentication behavior.

Expected secret/config names may include:

```text
RESEND_API_KEY
AUTH_EMAIL_FROM
```

Exact names may be adjusted to existing repository conventions.

Never commit API keys. Production sending should use a verified sending domain/from address.

### Email timing/privacy

Forgot-password behavior must not create a useful timing oracle for account existence.

Where the Cloudflare/SvelteKit runtime permits, hand email delivery to the request execution context/deferred work mechanism rather than making user-enumeration-sensitive response time depend directly on external email-provider latency.

Tests should inject/fake the email sender. Do not require live Resend delivery for ordinary unit/CI tests.

Never log complete reset URLs or reset tokens in production.

## Email types required for v1

Only a small set is necessary initially:

1. **Set your password / account created**
   - sent after Admin creates a learner or production Admin;
   - includes secure password-reset/set-password URL;
   - does not contain a temporary password.

2. **Password reset requested**
   - sent through the forgotten-password flow or an Admin resend action;
   - includes secure password-reset URL;
   - may include expiry/security copy but no sensitive account data.

Additional security notifications can be added later when real need exists.

## Sessions

Expose **Revoke all sessions** to production Admins for a target account.

Use it for lost devices, suspected compromise, or forced reauthentication.

Required lifecycle behavior:

```text
disable account → revoke sessions
password reset → revoke sessions
manual revoke → revoke sessions only
restore account → does not silently recreate a session
```

## Email verification

Email verification is not required to solve the currently agreed closed-enrollment/password-recovery problem.

Do not expand Account Management v1 into a public registration/email-verification product unless a concrete requirement appears. If Better Auth account creation/reset semantics interact with `emailVerified`, inspect the pinned implementation and document the chosen behavior explicitly rather than guessing.

## Rate limiting and abuse controls

Password-reset and sign-in endpoints are abuse-sensitive.

Before rollout, verify the rate-limiting capabilities and configuration available in pinned Better Auth `1.6.25` and the Cloudflare deployment model.

Requirements:

- reset requests cannot be used for high-volume email abuse;
- sign-in brute-force protection remains effective across serverless instances;
- user-enumeration resistance is preserved;
- rate-limit state should not rely on one process's memory if that would make protection ineffective across Cloudflare isolates.

Do not upgrade Better Auth only to obtain a newer rate-limit API without treating that upgrade as a separate reviewed dependency change.

## Auditability

Account-security mutations should eventually have an application-level audit trail.

Useful events include:

- account created;
- account role changed;
- account disabled/restored;
- password-reset/set-password email requested by an Admin;
- sessions revoked by an Admin.

Never record:

- passwords;
- generated temporary credentials;
- reset tokens;
- full reset URLs containing tokens.

The audit table/UI can be a follow-up security-polish PR if keeping the core account lifecycle smaller materially reduces implementation risk.

## Recommended implementation sequence

Implement in focused PRs rather than one broad authentication rewrite.

### PR A — Password recovery + transactional email foundation

Scope:

- purpose-specific server email abstraction;
- Resend production transport/configuration;
- Better Auth password-reset email callback/configuration using the pinned version;
- `/forgot-password`;
- `/reset-password`;
- `Forgot password?` from `/sign-in`;
- generic anti-enumeration response;
- reset-token expiry configuration;
- session revocation after reset;
- focused tests;
- relevant auth/Cloudflare documentation.

Do not add Admin account-management UI in this PR unless a very small shared primitive is necessary.

### PR B — Production Admin account management

Scope:

- `/admin/accounts` list/search;
- account detail/actions;
- create Learner / production Administrator;
- server-generated undisclosed initial credential if required by pinned Better Auth;
- initial set-password email;
- resend set-password/password-reset email;
- Learner/Admin promotion and demotion;
- Active/Disabled lifecycle;
- session revocation;
- self-lockout and last-active-Admin guards;
- Admin navigation entry;
- focused tests.

Do not add Preview Admin creation to this UI.

### PR C — Account security / self-service polish

Potential scope:

- `/account` self-service name/password changes;
- account-security audit events/UI;
- durable rate-limit improvements if not safely delivered in PR A;
- additional security notifications;
- future 2FA/passkeys only when deliberately prioritized.

This PR is not a prerequisite for the basic closed-enrollment lifecycle if PRs A/B already meet rollout security requirements.

## Likely files/boundaries for implementation

The continuation agent should inspect current `main` rather than assuming exact file names remain unchanged.

Likely existing boundaries:

```text
src/lib/server/auth.js
src/lib/auth-client.js
src/hooks.server.js
src/lib/server/preview-auth.js
src/routes/sign-in/
src/routes/admin/+layout.server.js
src/routes/admin/+layout.svelte
src/routes/study/+layout.server.js
scripts/bootstrap-admin.mjs
```

Likely new boundaries should remain purpose-specific and small, for example:

```text
src/lib/server/auth/             # only if extraction is justified
src/lib/server/email/            # transactional email provider boundary
src/routes/forgot-password/
src/routes/reset-password/
src/routes/admin/accounts/
```

Follow `ENGINEERING_ARCHITECTURE_GUIDELINES.md`: prefer TypeScript for new/extracted application modules where practical, thin SvelteKit routes, server-side authorization close to privileged mutations, and cohesive modules rather than a generic auth utility dump.

Do not refactor unrelated authentication/Preview code merely because these files are touched.

## Required security invariants

Implementation must preserve all of the following:

1. Public signup remains disabled.
2. Only a production Administrator can manage production accounts.
3. Preview Worker continues to reject Better Auth Admin endpoints/production Admin account management.
4. Ordinary learners cannot access account-administration routes/actions.
5. Preview-only Admins cannot become production account managers merely by being authenticated.
6. Forgotten-password responses do not reveal whether the account exists.
7. Reset tokens are short-lived and never logged.
8. Password reset revokes existing sessions.
9. Disabling an account revokes existing sessions and prevents future sign-in.
10. Restoring an account does not restore old sessions.
11. Admin-created undisclosed initial credentials are never exposed.
12. The signed-in Admin cannot disable/demote themselves through ordinary account-management UI/actions.
13. The last active production Admin cannot be disabled/demoted.
14. Routine hard deletion is absent until learning-history retention is explicitly designed.
15. Passwords, generated credentials, and reset tokens are never written to application logs/audit records.

## Validation / test expectations

At minimum, add focused coverage for:

- public sign-up still disabled;
- unauthenticated and learner access to `/admin/accounts` fails closed;
- Preview runtime cannot use production account-management/Admin auth endpoints;
- production Admin can create a learner;
- production Admin can create another production Admin;
- duplicate email/user creation fails safely;
- initial generated credential never reaches browser-visible action data;
- invitation email failure leaves a recoverable account and permits resend;
- forgot-password response is equivalent for existing/non-existing email;
- valid reset changes credential;
- invalid/expired reset token is rejected;
- password reset revokes prior sessions;
- disable revokes sessions and prevents sign-in;
- restore permits future sign-in but does not revive previous sessions;
- promote/demote behavior matches production Admin authorization;
- self-disable/self-demote fails closed;
- last-active-Admin disable/demote fails closed;
- hard-delete action is not exposed;
- email sender is faked in tests and no real provider secret is required.

Use the repository's current agent/validation workflow. Runtime/Cloudflare-sensitive changes may require the specialized runtime smoke test as advised by `npm run agent:checks`.

## Operational rollout requirements

Merge alone is not deployment verification.

Before enabling real password recovery/invitations in production:

1. configure the transactional email provider account;
2. verify the sending domain/address;
3. configure required Cloudflare secrets without committing them;
4. deploy the Worker with the expected public auth base URL;
5. test one real invitation/set-password email;
6. test one real forgotten-password reset;
7. verify reset/session revocation behavior from a second browser/session;
8. verify a disabled learner cannot continue an existing session or sign in again;
9. verify the last-Admin guard using non-production fixtures/local data before relying on it;
10. record deployment/behavior verification separately from PR merge status.

## Explicitly out of scope for Account Management v1

Do not add these merely for completeness:

- public learner self-registration;
- social OAuth providers;
- magic-link-only authentication;
- Preview Admin account creation in production Accounts UI;
- routine hard user deletion;
- learner Review deletion/anonymization policy;
- organizations/teams/cohorts;
- complex permission/ACL frameworks beyond current roles;
- advanced learner-progress analytics;
- billing/subscriptions;
- a Better Auth major/minor upgrade unless separately justified;
- 2FA/passkeys unless separately prioritized after the base lifecycle works.

## Success criteria

Account Management v1 is successful when:

- the first Admin can continue to be bootstrapped safely;
- that Admin can create subsequent Learner/Admin accounts without knowing their passwords;
- recipients can securely set/recover their own password by email;
- public registration remains closed;
- Admins can list, search, promote/demote, disable/restore, resend reset email, and revoke sessions;
- self-lockout and last-active-Admin lockout are prevented server-side;
- disabled accounts retain learner history rather than being hard-deleted;
- Preview and production authority boundaries remain intact;
- secrets/tokens/passwords do not leak through browser data, logs, or Git;
- the implementation is covered by focused auth/account security tests and normal repository validation.

## Continuation guidance

For an implementation agent starting from this plan:

1. start from the latest current `main` unless explicitly continuing an existing implementation PR;
2. read root `AGENTS.md`, `docs/AGENT_TASK_MAP.md`, this document, and the directly relevant auth/Admin/Cloudflare code;
3. verify the exact APIs supported by pinned Better Auth `1.6.25` before coding;
4. preserve `disableSignUp: true` and existing production/Preview boundaries;
5. implement PR A first unless project priorities explicitly choose PR B after the email/reset foundation already exists;
6. keep the PR draft until relevant validation and review are complete;
7. do not merge or deploy unless explicitly authorized.
