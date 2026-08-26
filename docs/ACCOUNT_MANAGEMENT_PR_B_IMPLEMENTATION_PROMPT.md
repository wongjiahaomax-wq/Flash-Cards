# Account Management PR B — Implementation Prompt

_Status: active implementation handoff while PR B remains pending_

_Last reviewed: 25 August 2026_

This file preserves the agreed implementation prompt for the second Account Management v1 implementation PR. It is intentionally stored beside `ACCOUNT_MANAGEMENT_PLAN.md` rather than under `docs/agent-tasks/`, which is reserved for already-completed historical prompts.

The account-management design remains authoritative over this prompt if the two ever diverge. Before implementation, inspect current `main`, PR A state, and current repository behavior rather than assuming file layout or dependency behavior has remained unchanged.

---

Please implement PR B of the Account Management v1 plan in:

`wongjiahaomax-wq/Flash-Cards`

This PR is specifically:

**PRODUCTION ADMIN ACCOUNT MANAGEMENT**

Do NOT implement learner-progress administration or broader account-security polish in this PR.

## WORK STATE

Before editing, inspect current repository/PR state.

The product/design decisions are recorded in:

- PR #95 — “Document account management and password recovery plan”
- `docs/ACCOUNT_MANAGEMENT_PLAN.md`
- `docs/ACCOUNT_MANAGEMENT_PR_A_IMPLEMENTATION_PROMPT.md`

PR A is the password-recovery + transactional-email foundation.

IMPORTANT:

- If PR #95 has been merged, use the copy on current `main`.
- If PR #95 is still open/unmerged, read its documentation as design context, but do NOT branch from PR #95 merely to inherit documentation.
- If PR A has been merged, start PR B from the latest current `main` and reuse the merged email/password-reset foundation.
- If PR A is still open/unmerged, inspect it carefully. Do not duplicate its implementation. Normally wait for or base implementation sequencing on the merged PR-A foundation rather than reimplementing email/reset logic inside PR B.
- If an implementation PR for this exact PR-B scope already exists, continue that PR rather than creating duplicate work.

Create a focused feature branch, for example:

`agent/admin-account-management`

Open a DRAFT PR targeting:

`main`

Do NOT merge the PR.

## EXECUTION MODE

Use the repository's capability-based workflow.

Read:

- `AGENTS.md`
- `docs/AGENT_TASK_MAP.md`
- `docs/ACCOUNT_MANAGEMENT_PLAN.md`
- `docs/ACCOUNT_MANAGEMENT_PR_A_IMPLEMENTATION_PROMPT.md`
- `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md`

Also inspect the nearest scoped `AGENTS.md` files for any Admin/auth/server modules you modify.

If you have a usable terminal/local checkout, use the repository-defined Local/Hybrid validation workflow.

If you only have GitHub repository access, use Remote GitHub mode and clearly distinguish GitHub CI evidence from commands you personally executed.

Inspect current implementation rather than assuming paths below remain unchanged.

## CURRENT AUTH / ACCOUNT BASELINE

The repository uses Better Auth with Cloudflare D1.

Existing behavior that must be preserved:

- email/password authentication;
- `disableSignUp: true` — public signup remains disabled;
- Better Auth Admin server/client plugins;
- production `admin` role;
- retained `preview_admin` role;
- combined `admin,preview_admin` behavior where already supported;
- production Admin authorization through the existing server-side guards;
- Preview Worker restrictions on production Admin/Better Auth Admin authority;
- `npm run admin:bootstrap` as first-production-Admin / disaster-recovery tooling;
- ordinary authenticated non-Preview-only users can Study;
- Preview-only Admin identities are not ordinary production account managers.

The repository currently pins Better Auth `1.6.25` unless a separate reviewed dependency PR has changed this by implementation time.

Do NOT upgrade Better Auth as part of PR B merely to match newer documentation.

Verify the exact Admin APIs available in the pinned installed version before coding. Prefer supported Better Auth Admin APIs over direct writes to Better Auth tables.

## PR-A DEPENDENCY

PR B should reuse the password-reset / transactional-email foundation delivered by PR A.

Expected reusable capabilities include the equivalent of:

- a purpose-specific server-side email abstraction;
- Resend transport/configuration;
- a secure Better Auth password-reset request path;
- reset-token generation/validation owned by Better Auth;
- set/reset-password email delivery primitives;
- session revocation on successful password reset;
- anti-enumeration behavior for public forgot-password requests.

Do NOT create a second Resend client scattered through Admin routes.

Do NOT create a second reset-token mechanism.

Do NOT duplicate email templates unnecessarily.

If PR A's exact implementation differs from these assumptions, adapt to the merged implementation rather than forcing this prompt's example shape.

## GOAL

Implement the smallest complete production-Admin account-management workflow for closed enrollment.

The intended account lifecycle is:

```text
production Admin
→ Accounts
→ Add account
→ choose Learner or Administrator
→ enter name + email
→ server creates Better Auth user
→ recipient receives Set your password email
→ recipient chooses their own password
→ normal sign-in
→ Admin may later change role / disable / restore / revoke sessions
```

The product remains private. There is no public learner signup.

## PRODUCT ROLE MODEL

Use the existing role model.

Product-facing roles:

```text
Learner
Administrator
```

Internal mapping:

```text
Learner       → ordinary/default Better Auth `user`
Administrator → Better Auth `admin`
Preview Admin → existing separate `preview_admin` concept
```

Do NOT introduce a new `learner` role merely for product terminology.

Do NOT make Preview Admin creation or management part of `/admin/accounts`.

Do NOT accidentally strip `preview_admin` from an existing combined owner account when changing only production Admin status. Inspect and preserve existing role-composition semantics.

## ADMIN NAVIGATION / ROUTE

Add a production-Admin-only Accounts area, expected route:

`/admin/accounts`

Add an **Accounts** entry to the existing production Admin navigation.

The route and every privileged mutation must be protected server-side by the existing production Admin authority model.

Do not rely on navigation visibility or disabled buttons as authorization.

The Preview Worker must continue to fail closed for production account-management authority.

## ACCOUNTS LIST

Provide a focused Accounts list suitable for the expected small initial user base.

At minimum show:

- name;
- email;
- product-facing account type (`Learner` / `Administrator`);
- status (`Active` / `Disabled`);
- created date where available;
- a clear way to open account details/actions;
- `Add account`.

Support practical search by name/email.

Use Better Auth's list/search Admin APIs where appropriate rather than creating a parallel application-owned user directory.

Keep reads bounded/paginated according to the capabilities of Better Auth and repository read-model guidance. Do not create an unbounded whole-user-table read merely because the current user count is small.

Do not display raw password/authentication credential data.

## ACCOUNT DETAIL / ACTIONS

Provide a focused account detail/action surface, either as a dedicated route or another UI shape consistent with current Admin conventions.

At minimum support, where applicable:

- view name;
- view email;
- view Learner / Administrator type;
- view Active / Disabled status;
- view created date where available;
- send/resend Set password / Password reset email;
- promote Learner → Administrator;
- demote Administrator → Learner;
- Disable account;
- Restore account;
- Revoke all sessions.

Use product terminology rather than leaking raw Better Auth implementation vocabulary such as `banned` when the product concept is **Disabled**.

## CREATE ACCOUNT

Provide `Add account` for production Admins.

Required fields:

- name;
- email;
- account type: Learner or Administrator.

Normalize/validate email according to Better Auth/current application behavior.

Creation must use supported Better Auth Admin APIs/read models where feasible.

Do not expose a password field to the Admin.

The Admin must not choose or learn another user's password.

## INITIAL CREDENTIAL / SET-PASSWORD FLOW

The recipient should establish their own password through the same secure email/reset mechanism established in PR A.

Preferred flow:

```text
Admin creates account
→ Better Auth user/credential account exists
→ secure Set your password email is requested
→ recipient follows tokenized link
→ recipient chooses password
```

If pinned Better Auth's Admin create-user API requires an initial password:

- generate a high-entropy random credential server-side;
- use it only to satisfy account creation requirements;
- never display it;
- never return it to browser action data;
- never email it;
- never log it;
- never persist it outside Better Auth's intended credential storage;
- immediately use PR A's secure reset/set-password flow for the recipient.

Do not create predictable temporary passwords.

Do not create an Admin-visible “temporary password”.

Do not make the temporary generated credential the invitation mechanism.

## ACCOUNT CREATION + EMAIL FAILURE

Account creation and external email delivery cannot be one atomic transaction.

Handle this explicitly.

If Better Auth account creation succeeds but the Set your password email cannot be delivered/requested:

- preserve the created account;
- do not roll back by manually deleting Better Auth rows unless the API guarantees safe semantics;
- surface a clear Admin-facing delivery failure;
- provide a safe **Resend set-password email** action;
- never reveal any generated credential as recovery.

Avoid duplicate account creation when an Admin retries after an email-delivery failure.

The UI should make it clear that the account exists even if invitation delivery needs to be retried.

## INVITATION / SET-PASSWORD EMAIL

Reuse the PR-A email abstraction and reset-token mechanism.

Add the minimum additional email/template behavior needed for an Admin-created account, such as:

**Set your Flash-Cards password**

The email should:

- clearly identify Flash-Cards;
- explain that an account was created for the recipient;
- provide the secure set-password link;
- indicate the link expires;
- contain no temporary password;
- contain no unnecessary personal/sensitive data;
- contain no marketing content.

Do not implement a separate invitation-token system when the secure Better Auth reset/set-password flow can satisfy the requirement.

## ACTIVE / DISABLED LIFECYCLE

The normal account-removal lifecycle is:

```text
Active ↔ Disabled
```

Do NOT expose routine hard deletion.

The learning domain retains historical Reviews keyed by `userId`; deleting the Better Auth user before a retention/anonymization design exists risks orphaning historical learner identity.

Where Better Auth Admin ban/unban semantics are the supported mechanism, map them to product-facing:

```text
ban   → Disable
unban → Restore
```

### Disable requirements

Disabling an account must:

- prevent future sign-in;
- revoke existing sessions;
- preserve learner Review/history data;
- not delete the Better Auth user;
- not delete application learning data.

### Restore requirements

Restoring an account must:

- permit future sign-in again;
- not recreate/revive previously revoked sessions;
- preserve prior history.

Do not use a finite ban expiry to model ordinary Disabled state unless there is a concrete product reason. Prefer an indefinite disabled state if that is the supported safe representation.

## SESSION REVOCATION

Provide **Revoke all sessions** for a target account.

Use Better Auth's supported session APIs.

This action is useful for:

- lost device;
- suspected compromise;
- forced reauthentication.

Required behavior:

```text
manual revoke   → revoke sessions only
disable account → disable + revoke sessions
password reset  → already handled by PR A; revoke sessions
restore account → do not restore old sessions
```

Do not revoke the acting Admin's own session unless they explicitly target themselves through a separately allowed operation. Account Management v1 does not need a self-session management UI here.

## ROLE CHANGES

Support:

```text
Learner → Administrator
Administrator → Learner
```

Use Better Auth Admin role-management APIs where supported.

Preserve any existing unrelated role component such as `preview_admin` when changing only the production role state.

Examples:

```text
user                  + promote → admin
admin                 + demote  → user
preview_admin         → not managed here
admin,preview_admin   + demote production Admin → preserve preview_admin only if current role model supports this safely
```

Inspect current role parsing/storage and write focused tests for combined-role behavior rather than assuming string formatting.

## ADMIN LOCKOUT PROTECTIONS

These are mandatory server-side invariants.

The currently signed-in production Administrator must not be able through ordinary Account Management actions to:

- disable their own account;
- demote themselves from production Administrator.

The system must also block attempts to:

- disable the last active production Administrator;
- demote the last active production Administrator.

These checks must happen immediately before the protected mutation using current authoritative state.

Do not implement them only in the browser.

Do not count Preview-only Admins as active production Administrators.

Combined `admin,preview_admin` identities count as production Administrators because they include the `admin` role.

Be careful about TOCTOU/race semantics. Keep the check and protected mutation as close together as the Better Auth/D1 architecture permits. If Better Auth APIs prevent a true application transaction across both operations, fail closed and document the residual concurrency boundary rather than inventing unsafe direct-table writes.

## DUPLICATE / CONFLICT HANDLING

Account creation must fail safely for an already-used email.

Do not expose stack traces or database details.

The Admin-facing error may state that an account already exists because this is a privileged production Admin surface; public anti-enumeration requirements apply to public forgot-password flows, not to an authorized account directory.

Avoid duplicate users caused by repeated form submissions where practical using existing SvelteKit action patterns and Better Auth uniqueness constraints.

## AUTHORITY / PREVIEW BOUNDARIES

Preserve all current production/Preview security boundaries.

At minimum:

- unauthenticated users cannot access `/admin/accounts`;
- learners cannot access `/admin/accounts`;
- Preview-only Admins cannot manage production accounts;
- the Preview Worker cannot become a route around production account-management authority;
- existing blocked Better Auth Admin endpoints on Preview remain blocked;
- ordinary production Admins retain their current Study access behavior;
- combined owner behavior remains consistent with current auth contracts.

Do not broaden Preview permissions merely to simplify testing.

## SERVER-SIDE OWNERSHIP

Keep privileged account mutations in small server-side modules with explicit ownership.

Avoid placing all account logic directly into a very large `+page.server` route.

A reasonable conceptual structure, adjusted to repository conventions, might be:

```text
src/lib/server/accounts/
  list/read model
  create account
  role mutation
  lifecycle mutation
  session mutation
  guard helpers
```

or another small cohesive boundary.

Do not create a generic `utils.ts` dumping ground.

Prefer TypeScript for new/extracted application modules according to repository architecture guidance.

Keep SvelteKit routes thin: parse/validate input, authorize, call a purpose-specific server operation, map safe result/error to UI.

Do not refactor unrelated Better Auth/Preview code simply because account management touches nearby boundaries.

## AUDITABILITY

The Account Management plan recommends eventual audit events for security-sensitive Admin actions, but the full audit subsystem may remain PR C if adding it would materially expand PR B.

Do not invent an under-designed audit table merely to check a box.

If a suitable application audit mechanism already exists by implementation time, use it for relevant actions.

Never record in audit/log payloads:

- passwords;
- generated initial credentials;
- reset tokens;
- full tokenized reset URLs;
- Resend API keys.

## SECURITY INVARIANTS

These are acceptance requirements.

1. `disableSignUp: true` remains intact.

2. No public self-registration is introduced.

3. Only production Administrators manage production accounts.

4. Preview-only Admins cannot manage production accounts.

5. Preview Worker production-Admin boundaries remain intact.

6. Learner is the ordinary/default user state; no new `learner` auth role is introduced.

7. Admin-created users never receive an Admin-known password.

8. Any generated initial credential is high entropy and never exposed to browser/email/logs.

9. Initial account setup reuses secure Better Auth reset/set-password semantics from PR A.

10. Resend/provider logic is reused through PR A's server email abstraction rather than duplicated through Admin code.

11. Disable revokes sessions and prevents future sign-in.

12. Restore does not recreate old sessions.

13. Manual Revoke all sessions works without disabling the account.

14. Self-disable fails closed server-side.

15. Self-demote fails closed server-side.

16. Disabling the last active production Admin fails closed.

17. Demoting the last active production Admin fails closed.

18. Combined-role behavior preserves the existing Preview role contract.

19. Routine hard deletion is absent.

20. Learner Review/history rows are not deleted by account lifecycle actions.

21. Passwords, generated credentials, reset tokens, tokenized links, and provider secrets are never logged.

22. No production D1 mutation/configuration/deployment occurs merely as part of implementation/testing unless explicitly authorized.

## UI / UX

Follow existing Admin UI conventions rather than designing a new application shell.

The first version should optimize for clarity and safety over feature density.

Suggested product language:

- Accounts
- Add account
- Learner
- Administrator
- Active
- Disabled
- Send set-password email
- Send password-reset email / Resend set-password email as context requires
- Revoke all sessions
- Promote to Administrator
- Change to Learner
- Disable account
- Restore account

Use confirmation UI for destructive/security-sensitive actions where consistent with repository conventions, especially:

- Disable account;
- demote Administrator;
- revoke all sessions.

Do not hide server-side failure reasons that an authorized Admin needs to act on, but map internal errors to safe product messages.

For example, a blocked last-Admin operation should clearly explain that at least one active production Administrator must remain.

## TESTING

Add focused automated coverage for security-sensitive behavior.

At minimum verify the equivalent of:

### Authorization

- unauthenticated access to Accounts fails closed;
- learner access fails closed;
- Preview-only Admin access fails closed;
- production Admin access succeeds;
- Preview runtime cannot use production account-management/Better Auth Admin paths.

### Listing / read model

- production Admin can list/search accounts;
- product-facing role mapping is correct;
- Active/Disabled mapping is correct;
- combined-role mapping is handled correctly;
- reads are bounded/paginated as designed.

### Creation

- production Admin can create a Learner;
- production Admin can create another production Administrator;
- duplicate email fails safely;
- invalid input fails safely;
- initial generated credential, if required, never reaches browser-visible response/action data;
- successful creation requests the set-password email through the PR-A abstraction;
- email failure leaves the account recoverable and does not create duplicate users on resend;
- resend set-password email works for an existing account.

### Roles / lifecycle

- Learner can be promoted to production Administrator;
- Administrator can be demoted to Learner when safe;
- combined production/Preview role behavior preserves Preview role semantics;
- Disable prevents future sign-in;
- Disable revokes existing sessions;
- Restore permits future sign-in;
- Restore does not restore old sessions;
- manual Revoke all sessions works.

### Lockout guards

- current Admin cannot disable self;
- current Admin cannot demote self;
- last active production Admin cannot be disabled;
- last active production Admin cannot be demoted;
- Preview-only Admin does not satisfy the production last-Admin count;
- a combined `admin,preview_admin` user does count as a production Admin.

### Preservation

- lifecycle actions do not hard-delete the Better Auth user;
- learner Review/history data is not deleted;
- public signup remains disabled;
- PR-A password recovery behavior remains intact.

Mock external email delivery in automated tests. Do not send real Resend email from ordinary unit/CI tests.

Follow existing test conventions before adding new test infrastructure.

## MANUAL UI TESTING

Document a short manual test checklist in the draft PR.

At minimum, when local environment support exists:

1. Sign in as a production Admin.
2. Open Accounts.
3. Confirm list/search and role/status labels.
4. Create a Learner using a non-production test mailbox / mocked email flow as appropriate.
5. Verify no password is requested or displayed to the Admin.
6. Verify set-password email action is requested.
7. Verify duplicate-email behavior.
8. Promote a non-current Learner to Administrator.
9. Demote a safe non-current Administrator.
10. Revoke another account's sessions.
11. Disable another account and confirm it cannot continue/sign in.
12. Restore it and confirm a new sign-in is required.
13. Verify self-disable/self-demote is blocked.
14. Verify last-active-production-Admin protection.
15. Verify learner/Preview-only identities cannot access Accounts.

Do not mutate real production accounts merely to satisfy manual testing.

## DOCUMENTATION

Update documentation in the same PR where necessary.

At minimum update:

`docs/ACCOUNT_MANAGEMENT_PLAN.md`

to distinguish implemented PR-A/PR-B behavior from remaining PR-C work if the plan is present on current main.

Also update the documentation index/roadmap/handover if repository conventions require status changes.

Document:

- Accounts route and authority model;
- role mapping;
- account creation/set-password behavior;
- Disable/Restore semantics;
- session revocation behavior;
- self/last-Admin safety invariants;
- any residual Better Auth limitations discovered;
- any operator/manual prerequisites still required.

Do NOT claim production account management is deployed or verified merely because code is merged.

Keep these states separate:

```text
code implemented
≠ code merged
≠ required secrets configured
≠ Worker deployed
≠ production behavior verified
```

## OUT OF SCOPE

Do NOT implement in PR B unless a tiny prerequisite is genuinely unavoidable:

- public signup;
- learner self-registration;
- Preview Admin creation/management UI;
- account hard deletion;
- learner-history deletion/anonymization;
- learner-progress administration/analytics;
- cohorts/organizations;
- CSV/bulk account import;
- OAuth/social login;
- email-verification product flow;
- 2FA;
- passkeys;
- advanced security notifications;
- a new audit subsystem if it materially expands scope;
- self-service `/account` profile/password UI unless already delivered separately;
- a Better Auth dependency upgrade;
- a second transactional-email provider;
- production Resend/DNS/secret configuration;
- production deployment;
- production data mutation for testing.

PR C remains the place for account-security/self-service polish where needed.

Learner-progress administration is a separate product stage after account administration.

## IMPLEMENTATION REVIEW

Before pushing the principal implementation, self-review the complete diff for:

- accidental public-signup enablement;
- learner/Preview authorization bypass;
- direct Better Auth table writes that should use supported APIs;
- duplicated PR-A email/reset logic;
- generated credential leakage;
- password/token/secret logging;
- hard-delete behavior;
- Review/history deletion;
- unsafe combined-role handling;
- failure to revoke sessions on Disable;
- session resurrection on Restore;
- missing self-disable/self-demote protection;
- missing last-active-Admin protection;
- race-prone last-Admin checks where a safer boundary is available;
- unbounded user reads;
- route/module bloat;
- unrelated auth/Preview refactors;
- unnecessary Better Auth upgrade;
- production mutation/deployment creep.

## VALIDATION

When command execution is available, follow repository guidance.

Start with:

`npm run agent:doctor`

After implementation:

`npm run agent:checks`

Run focused account-management/auth tests.

Then run the appropriate repository validation, including:

`npm run validate:full`

before final handoff when applicable.

Run specialized checks identified by `agent:checks`.

Do not report a command as passing unless you actually executed it.

If working in Remote GitHub mode without a terminal:

- inspect the complete PR diff;
- inspect GitHub CI/check results;
- clearly state what was not executable locally.

## PR HANDOFF

Open/update a DRAFT PR.

The PR description should contain:

- `## Goal`
- `## Dependency / PR-A foundation`
- `## Current auth baseline`
- `## Implementation`
- `## Account lifecycle / role semantics`
- `## Security invariants`
- `## Validation`
- `## Manual testing`
- `## Production rollout still required`
- `## Explicitly out of scope`
- `## Next stage — PR C / learner-progress administration`

Do NOT merge the PR.

Do NOT deploy to production.

Do NOT configure production secrets.

Do NOT mutate production accounts/data for testing.

Leave the draft PR as a complete durable handoff for review and the subsequent account-security/self-service or learner-progress work.