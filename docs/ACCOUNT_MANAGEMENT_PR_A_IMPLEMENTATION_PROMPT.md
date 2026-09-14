# Account Management PR A — Password Recovery + Transactional Email

_Status: implementation-ready Draft PR handoff_

_Last reviewed: 14 September 2026_

This is the implementation contract for PR A of Account Management. It replaces the August handoff with a current-main plan. Implement in this Draft PR; do not create a second PR for the same scope.

## Work state

Repository: `wongjiahaomax-wq/Flash-Cards`

Branch: `agent/account-password-recovery-2026-09`

Current planning baseline: this branch is synced with `main` through `e32e26e83efd3eb411b84143548d9b8e0cc1bf66` (PR #179, including the repository's Playwright setup).

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
- The remote Preview Worker shares production D1/auth tables, so password recovery must fail closed there while current Preview sign-in/sign-out/get-session behavior remains available.
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
9. focused executable tests at the required real auth/runtime/browser boundaries;
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

### Email configuration must be lazy

Missing `RESEND_API_KEY` and/or `AUTH_EMAIL_FROM` must not prevent Better Auth construction or break unrelated authentication.

Do not validate required email-delivery configuration at module import time or during ordinary `createAuth(...)` construction. Validate it only when an email delivery is actually required, inside the delivery path/task.

With email configuration absent, the existing auth stack must still be able to:

- construct Better Auth;
- perform session lookup;
- perform the existing email/password sign-in flow.

A forgot-password request that reaches a delivery attempt without email configuration must still preserve the generic public response contract; the operational delivery failure must not reveal account state.

## Password-reset contract

Use Better Auth's built-in reset-token lifecycle. Do not invent application-owned reset tokens or cryptography.

Preserve the reviewed fragment transport unless current pinned Better Auth makes it impossible:

```text
/reset-password#token=...
```

The token must not appear in the initial HTTP request URL. The client must capture it and remove the fragment from the visible browser URL immediately after capture, before user interaction, then submit the reset using the supported Better Auth API.

Configure session revocation on successful password reset using `revokeSessionsOnPasswordReset: true` or the pinned-version equivalent.

Invalid, expired, missing, and already-used tokens must fail closed without exposing internal validation details.

## Anti-enumeration and Cloudflare behavior

`/forgot-password` must return the same learner-facing result regardless of whether the email exists. Provider failure must not reveal account existence.

Use wording equivalent to:

> If an account exists for that email address, password reset instructions have been sent.

Do not expose `email not found`, account existence, or provider-specific failure details.

### Reset-email delivery must be non-blocking

Non-blocking delivery is mandatory, not optional.

For a known account, the public forgot-password response must not await the Resend/provider promise. Schedule the delivery work with Cloudflare request-lifetime `waitUntil` or the narrow Better Auth/SvelteKit-compatible equivalent already available at the request boundary. If a small scheduler must be threaded into auth construction to reach that request lifetime, keep it narrowly scoped to this need.

A plain detached Promise that is not attached to the Worker request lifetime is not sufficient, because the Worker may terminate it after the response.

Provider failure after the public response has completed must be handled as an operational failure only. It must not change the already-produced public response, expose whether an account exists, or log passwords, reset tokens, token-bearing URLs, or credentials.

Do not add Queues, new background-worker infrastructure, or a generic concurrency subsystem for this feature.

## Rate limiting / abuse protection

Every externally reachable HTTP surface capable of requesting a password-reset email must be abuse/rate-limit protected. Protecting only the application `/forgot-password` action is insufficient if another public Better Auth reset-request endpoint remains reachable.

Better Auth `1.6.25` does not apply its HTTP rate limiter to server-side `auth.api` calls. Therefore, do not treat a direct server-side `auth.api` reset call as rate-limited merely because Better Auth rate limiting is enabled elsewhere.

During implementation, enumerate the actual reset-request HTTP surfaces exposed by the pinned Better Auth configuration plus the new application route. At minimum account for:

```text
/forgot-password
/api/auth/request-password-reset
```

and any pinned-version alias or equivalent route that can initiate reset-email delivery.

For each externally reachable reset-request path, do one of exactly these:

1. route it through equivalent effective abuse/rate-limit protection; or
2. if it is not used by the application flow, explicitly block that direct public endpoint before Better Auth handles it.

Use the simplest protection that is effective for the actual exposed surfaces. If the application route/action calls `auth.api`, add only the smallest route-local/request-boundary guard needed and ensure the direct Better Auth HTTP reset-request endpoint cannot bypass it. Reuse an existing repository/runtime primitive if available.

Do not build a broad distributed rate-limit service, Durable Object, queue, or general-purpose abuse framework in PR A.

Throttle behavior may be visible, but it must depend on request/limiter state rather than whether the submitted email exists. Known and unknown accounts under equivalent limiter state must not produce account-specific public behavior.

If the chosen narrow limiter has a real Cloudflare isolation/durability limitation, document it accurately as a residual rollout limitation rather than silently claiming global enforcement.

## Preview Worker password-recovery boundary

Password recovery must fail closed on the remote Preview Worker because Preview shares production D1/auth state. A reset request created on Preview can otherwise create a production reset token; a successful reset can change the production credential and revoke production sessions.

Use the narrowest existing runtime boundary. The current `hooks.server.js` already detects `isPreviewWorker(env)` and blocks selected sensitive paths before `svelteKitHandler`/Better Auth handles them. Extend that existing pre-auth path guard; do not create a second Preview auth architecture.

On Preview, block all new password-recovery application and Better Auth HTTP surfaces before they can reach route logic or Better Auth reset handling. At minimum account for:

```text
/forgot-password
/reset-password
/api/auth/request-password-reset
/api/auth/reset-password
```

plus any pinned Better Auth alias/equivalent discovered during implementation that can create or consume a password-reset token.

This Preview block applies regardless of user role. A production Admin, Preview Admin, combined-role account, ordinary learner, or unauthenticated request must not be able to request or consume password-reset tokens through the Preview Worker.

Do not broaden the Preview restriction to ordinary authentication. Existing Preview behavior for sign-in, sign-out, and get-session must remain available exactly as today.

Do not add a second database, Preview-specific auth instance, new Preview role model, new Worker, or new Preview middleware architecture. Extend the existing path-level fail-closed boundary only as far as required for password recovery.

## Required security invariants

Implementation must preserve all of these:

1. Public signup remains disabled.
2. PR A creates no learner/admin accounts.
3. Forgot-password responses do not reveal whether an account exists.
4. Every externally reachable reset-request HTTP surface is equivalently abuse/rate-limit protected or explicitly blocked; no direct Better Auth endpoint may bypass the intended guard.
5. Known-account forgot-password responses do not await external email delivery; delivery is attached to the Cloudflare request lifetime.
6. Later email-provider failure cannot alter the public response or leak account state.
7. Missing email-provider configuration does not break Better Auth construction, session lookup, or existing sign-in.
8. Better Auth owns reset-token generation, storage, validation, expiry, and single-use semantics.
9. The reset token is not sent in the initial reset-page HTTP request URL.
10. The token fragment is removed from the visible URL immediately after client capture.
11. Passwords, reset tokens, full token-bearing reset URLs, and Resend credentials are never logged.
12. Resend configuration remains server-only.
13. A successful reset revokes prior sessions.
14. Invalid/expired/reused reset links fail safely.
15. On the Preview Worker, all password-recovery application routes and Better Auth request/reset endpoints fail closed before token creation/consumption or credential/session mutation can occur.
16. Preview sign-in, sign-out, and get-session remain available and behaviorally unchanged.
17. Production/Preview authorization boundaries are otherwise unchanged.
18. Existing learner-account deletion fences/guards remain unchanged.
19. No production D1/R2 mutation, production secret change, DNS change, deployment, or live Resend send is performed as part of implementation/testing.

## Implementation shape

Keep the change small. Likely affected surfaces include current auth configuration, the sign-in route, new forgot/reset routes, the existing Preview/path guard in `hooks.server.js`, a small server email module, tests, and focused documentation. Discover exact paths from current repository routing rather than treating this list as mandatory.

Do not refactor unrelated auth/Preview code.

Do not add a new database or duplicate Better Auth's credential/session storage.

Do not add broad rate-limit, background-job, Preview, or email-framework architecture to satisfy the focused security requirements above.

## Implementation tranches

### Tranche 1 — auth/email foundation

- Verify pinned Better Auth reset APIs/options and enumerate every exposed reset-request/reset HTTP endpoint or alias relevant to the configured auth instance.
- Add narrow transactional email transport + Resend implementation.
- Keep email configuration validation inside the delivery path rather than ordinary auth construction.
- Wire Better Auth reset-email callback and expiry/session-revocation behavior.
- Make provider delivery non-blocking via request-lifetime `waitUntil`/narrow equivalent.
- Add fakeable/testable delivery boundary.

Checkpoint the security-sensitive server behavior before proceeding.

### Tranche 2 — learner UX + public boundaries

- Add `Forgot password?` to sign-in.
- Implement `/forgot-password` with generic result and effective abuse/rate-limit protection.
- Ensure every alternate public reset-request endpoint has equivalent protection or is explicitly blocked so the application guard has no bypass.
- Implement `/reset-password` with fragment capture/removal, new-password + confirm-password UX, safe invalid/expired handling, and success path back to sign-in.
- Extend the existing Preview Worker pre-auth path boundary to fail closed for the new application password-recovery routes and Better Auth reset request/reset endpoints while preserving sign-in/sign-out/get-session.
- Follow existing auth-screen UI conventions; do not redesign the auth area.

### Tranche 3 — executable proof + docs

Add focused coverage proving the behavioral contract, including the real browser/runtime boundaries called out below, then update operator/account-management documentation to describe what is implemented versus what still requires production configuration.

## Required executable proof

The following are implementation acceptance requirements, not optional robustness work.

| Invariant | Required behavior | Required executable proof |
| --- | --- | --- |
| All reset-request surfaces protected | Every externally reachable HTTP path capable of initiating reset-email delivery is either covered by the intended abuse guard or deliberately unavailable. | Exercise the real `/forgot-password` request entrypoint repeatedly and show the configured guard takes effect. Separately exercise the direct Better Auth `/api/auth/request-password-reset` endpoint and every other reset-request alias/equivalent exposed by the pinned configuration. Prove none can bypass the guard: each must show equivalent protection or be blocked before reset delivery/token creation. Helper-only limiter tests or direct `auth.api` tests are insufficient. Also show protection does not branch on account existence. |
| Non-blocking reset email | A known-account public response completes without waiting for the provider, and delivery survives via request-lifetime scheduling. | Use a controlled mocked provider promise that remains unresolved; prove the known-account forgot-password response completes first. Then reject/fail that provider promise and prove the completed public response is unchanged and no account-state/provider detail is exposed. |
| Lazy email configuration | Missing Resend/from-address configuration does not break unrelated auth. | With both email settings absent, prove auth construction succeeds, session lookup works, and the existing sign-in path still succeeds for valid credentials. Do not satisfy this with source inspection alone. |
| Fragment-token hygiene | `/reset-password#token=<sentinel>` captures the token client-side, strips it from the visible URL, and never sends it in request URLs/server-rendered data. | Add one focused Playwright test using the real `/reset-password#token=<sentinel>` page. Without user interaction, prove the visible URL loses the fragment after capture. Prove the sentinel was captured by exercising the reset submission path or another observable client use of the captured value. Record browser network request URLs and assert none contains the sentinel; inspect the initial document/server-rendered payload and assert the sentinel is absent there too. Use the Playwright framework already on current `main`; do not add another browser framework. |
| Preview password recovery fails closed | Preview cannot create or consume production password-reset tokens or mutate production credentials/sessions through any new application or Better Auth recovery endpoint; ordinary Preview auth remains intact. | Add focused runtime-level coverage using the existing Preview runtime marker/boundary. With Preview mode enabled, exercise `/forgot-password`, `/reset-password`, `/api/auth/request-password-reset`, `/api/auth/reset-password`, and any discovered pinned alias/equivalent; prove they are rejected before reset route/Better Auth handling and no reset delivery or reset mutation path is reached. In the same focused coverage, prove current sign-in, sign-out, and get-session paths are still allowed through the Preview boundary. Do not satisfy this with source inspection alone. |

## Acceptance coverage

At minimum prove the equivalent of:

- signup remains disabled;
- known and unknown email produce the same public forgot-password response under equivalent limiter state;
- the real forgot-password browser/request entrypoint is abuse/rate-limit protected;
- direct `/api/auth/request-password-reset` and any other exposed reset-request HTTP path cannot bypass that protection;
- a known account reaches the email-dispatch path;
- a known-account response completes while the mocked provider is still pending;
- later provider failure does not change the public response or become an enumeration signal;
- missing `RESEND_API_KEY` / `AUTH_EMAIL_FROM` does not prevent auth construction, session lookup, or existing sign-in;
- reset email uses the application reset route and fragment-token contract;
- one real-browser Playwright test proves fragment capture/removal and absence from request URLs/server-rendered data;
- valid reset changes the password;
- successful reset invalidates prior sessions;
- used token cannot reset again;
- invalid token fails safely;
- expired token fails safely;
- missing token fails safely;
- password mismatch/invalid-password behavior is handled;
- Preview rejects the new application forgot/reset routes and Better Auth reset request/reset endpoints before password-recovery handling;
- Preview still permits existing sign-in, sign-out, and get-session behavior;
- Production/Preview auth behavior is otherwise unchanged;
- external email is mocked/faked in tests.

Prefer integration/smoke coverage through the actual Better Auth + D1/runtime boundary for the security-critical reset/session behavior rather than only source-string tests. Use the repository's existing Playwright setup only for the focused browser-only fragment invariant. Keep testing proportional; do not build a second test framework.

## Validation

Follow repository-owned validation selection rather than a hard-coded blanket loop.

Typical sequence when local execution is available:

```text
npm run agent:doctor
focused auth/password-reset tests during implementation
focused Preview boundary/runtime tests
focused Playwright fragment test
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

Document any real residual rate-limit durability/isolation limitation of the selected narrow solution. Do not represent the presence of Better Auth rate-limit configuration as proof that server-side `auth.api` calls are protected.

Document that the remote Preview Worker intentionally does not provide password recovery because it shares production auth state. Do not describe this as an implementation deficiency or create a second Preview auth system to avoid the restriction.

Do not claim production readiness for any step that was not actually performed.

## Handoff

Leave this PR Draft until implementation and review are complete. Do not merge or deploy automatically.

Final PR description/handoff should clearly record:

- implementation completed;
- preserved security invariants;
- tests/validation actually run;
- the complete externally reachable reset-request surface and how each path is guarded or blocked;
- the Preview password-recovery fail-closed boundary and confirmation that sign-in/sign-out/get-session remain available;
- the actual forgot-password rate-limit path and any residual limitation;
- production Resend setup still required;
- explicit PR-B next step: Admin Accounts lifecycle UI and actions.
