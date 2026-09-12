# Account Management PR A — Password Recovery + Transactional Email

_Status: implementation-ready Draft PR handoff_

_Last reviewed: 12 September 2026_

This is the implementation contract for PR A of Account Management. It replaces the August handoff with a current-main plan. Implement in this Draft PR; do not create a second PR for the same scope.

## Work state

Repository: `wongjiahaomax-wq/Flash-Cards`

Branch: `agent/account-password-recovery-2026-09`

Initial base: current `main` at `63757ba76ff6d29602d50c9a984c20182eef1d77`.

Before coding, follow root `AGENTS.md` and `docs/AGENT_TASK_MAP.md`, then inspect the current auth implementation and directly related tests. Authentication is a protected boundary, so broaden only as required by repository routing.

Do not revive or rebase old PR #96 wholesale. It is useful implementation/history reference, but current `main` has materially evolved.

## Goal

Add secure self-service password recovery and the small transactional-email foundation required by future Admin account creation.

Finished learner flow:

```text
Sign in
→ Forgot password?
→ enter email
→ generic confirmation
→ receive reset email
→ /reset-password#token=...
→ choose new password
→ password changes
→ prior sessions are revoked
→ sign in normally
```

PR B will build the Admin Accounts portal on top of this foundation.

## Current baseline to preserve

- Better Auth `1.6.25` remains pinned. Do not upgrade it in this PR.
- Cloudflare D1 remains the auth/user database. Do not create another database.
- Email/password auth is already enabled.
- Public registration remains disabled (`disableSignUp: true`).
- Better Auth Admin support already exists.
- Production `admin`, Preview `preview_admin`, and combined-role behavior already exist.
- Preview must not gain production account-management authority.
- The current staged learner-account deletion architecture and its database/request guards remain unchanged.
- No schema migration is expected for PR A. Add one only if implementation proves a persisted field is genuinely required; do not add speculative auth tables.

## Scope

Implement only:

1. a small server-only transactional email boundary;
2. Resend transport/configuration behind that boundary;
3. Better Auth password-reset callback/configuration using the pinned API;
4. `/forgot-password`;
5. `/reset-password`;
6. `Forgot password?` from `/sign-in`;
7. short reset-token expiry (target approximately 1 hour if supported cleanly);
8. session revocation after successful password reset;
9. focused executable tests at the real auth/runtime boundary where practical;
10. operator documentation for required email configuration and rollout steps.

Do not implement `/admin/accounts`, account creation, invitations, role changes, Disable/Restore, account deletion UI, audit UI, public signup, OAuth, 2FA/passkeys, cohorts/organizations, or a Better Auth upgrade.

## Email design

Use Resend as the initial provider, but keep provider-specific code behind a narrow server-side abstraction. Prefer existing repository conventions and TypeScript for new application modules.

Conceptually:

```text
Better Auth / auth workflow
        ↓
password-reset email function
        ↓
transactional email transport
        ↓
Resend HTTP API
```

Do not create a generic notification framework. The abstraction only needs to make PR B able to reuse the transport for a future `Set your password` email without coupling routes/auth configuration directly to Resend.

Expected server-only configuration:

```text
RESEND_API_KEY
AUTH_EMAIL_FROM
```

Use repository naming conventions if current code establishes a better equivalent. Never commit, log, expose, or configure real production secrets while implementing this PR.

Automated tests must fake/mock email delivery; ordinary CI must not send real email.

## Password-reset contract

Use Better Auth's built-in reset-token lifecycle. Do not invent application-owned reset tokens or cryptography.

Preserve the reviewed fragment transport unless current pinned Better Auth makes it impossible:

```text
/reset-password#token=...
```

The token must not appear in the initial HTTP request URL. The client should capture it and immediately remove the fragment from the visible browser URL, then submit the reset using the supported Better Auth API.

Configure session revocation on successful password reset using `revokeSessionsOnPasswordReset: true` or the pinned-version equivalent.

Invalid, expired, missing, and already-used tokens must fail closed without exposing internal validation details.

## Anti-enumeration and Cloudflare behavior

`/forgot-password` must return the same learner-facing result regardless of whether the email exists. Provider failure must not reveal account existence.

Use wording equivalent to:

> If an account exists for that email address, password reset instructions have been sent.

Do not expose `email not found`, account existence, or provider-specific failure details.

Avoid making response latency materially dependent on external email delivery for known accounts. Reuse the existing Cloudflare/SvelteKit background-task mechanism if available cleanly (for example the existing `waitUntil`/background-task pattern). Do not create new concurrency infrastructure solely for this feature.

## Rate limiting

Inspect Better Auth `1.6.25` behavior actually present in the installed package/current code.

Do not upgrade Better Auth and do not build a new distributed rate-limiting subsystem in PR A unless a realistic material abuse gap cannot otherwise be shipped safely.

If the pinned built-in reset limiter is per-process/per-isolate rather than durable across Cloudflare isolates, document that residual limitation accurately. Treat it as a rollout/security limitation, not an excuse for broad infrastructure work.

## Required security invariants

Implementation must preserve all of these:

1. Public signup remains disabled.
2. PR A creates no learner/admin accounts.
3. Forgot-password responses do not reveal whether an account exists.
4. Better Auth owns reset-token generation, storage, validation, expiry, and single-use semantics.
5. The reset token is not sent in the initial reset-page HTTP request URL.
6. The token fragment is removed from the visible URL promptly after client capture.
7. Passwords, reset tokens, full token-bearing reset URLs, and Resend credentials are never logged.
8. Resend configuration remains server-only.
9. A successful reset revokes prior sessions.
10. Invalid/expired/reused reset links fail safely.
11. Production/Preview authorization boundaries are unchanged.
12. Existing learner-account deletion fences/guards remain unchanged.
13. No production D1/R2 mutation, production secret change, DNS change, deployment, or live Resend send is performed as part of implementation/testing.

## Implementation shape

Keep the change small. Likely affected surfaces include current auth configuration, the sign-in route, new forgot/reset routes, a small server email module, tests, and focused documentation. Discover exact paths from current repository routing rather than treating this list as mandatory.

Do not refactor unrelated auth/Preview code.

Do not add a new database or duplicate Better Auth's credential/session storage.

## Implementation tranches

### Tranche 1 — auth/email foundation

- Verify pinned Better Auth reset APIs/options.
- Add narrow transactional email transport + Resend implementation.
- Wire Better Auth reset-email callback and expiry/session-revocation behavior.
- Add fakeable/testable delivery boundary.

Checkpoint the security-sensitive server behavior before proceeding.

### Tranche 2 — learner UX

- Add `Forgot password?` to sign-in.
- Implement `/forgot-password` with generic result.
- Implement `/reset-password` with fragment capture/removal, new-password + confirm-password UX, safe invalid/expired handling, and success path back to sign-in.
- Follow existing auth-screen UI conventions; do not redesign the auth area.

### Tranche 3 — executable proof + docs

Add focused coverage proving the behavioral contract, then update operator/account-management documentation to describe what is implemented versus what still requires production configuration.

## Acceptance coverage

At minimum prove the equivalent of:

- signup remains disabled;
- known and unknown email produce the same public forgot-password response;
- a known account reaches the email-dispatch path;
- provider failure does not become an enumeration response;
- reset email uses the application reset route and fragment-token contract;
- token is not exposed in initial rendered/server response data;
- valid reset changes the password;
- successful reset invalidates prior sessions;
- used token cannot reset again;
- invalid token fails safely;
- expired token fails safely;
- missing token fails safely;
- password mismatch/invalid-password behavior is handled;
- Preview/production auth behavior is unchanged;
- external email is mocked/faked in tests.

Prefer integration/smoke coverage through the actual Better Auth + D1/runtime boundary for the security-critical reset/session behavior rather than only source-string tests. Keep testing proportional; do not build a second test framework.

## Validation

Follow repository-owned validation selection rather than a hard-coded blanket loop.

Typical sequence when local execution is available:

```text
npm run agent:doctor
focused auth/password-reset tests during implementation
npm run agent:checks -- --compact
repository-required checkpoint/final validation
```

Before handoff, execute every final check reported by current `agent:checks` and inspect the complete base-to-head diff. Do not claim a command passed unless it actually ran.

If working without a terminal, report GitHub CI evidence separately from local commands that were not executable.

## Documentation / rollout truth

Document the required Resend/API/from-address configuration and any local-development behavior.

Keep these claims separate:

```text
code implemented/merged
≠ Resend production secret configured
≠ sending domain/from address verified
≠ Worker deployed
≠ production password-reset flow verified
```

Do not claim production readiness for any step that was not actually performed.

## Handoff

Leave this PR Draft until implementation and review are complete. Do not merge or deploy automatically.

Final PR description/handoff should clearly record:

- implementation completed;
- preserved security invariants;
- tests/validation actually run;
- any residual Better Auth 1.6.25 rate-limit limitation;
- production Resend setup still required;
- explicit PR-B next step: Admin Accounts lifecycle UI and actions.
