# Account Management PR A — Implementation Prompt

_Status: active implementation handoff while PR A remains pending_

_Last reviewed: 25 August 2026_

This file preserves the agreed implementation prompt for the first Account Management v1 implementation PR. It is intentionally stored beside `ACCOUNT_MANAGEMENT_PLAN.md` rather than under `docs/agent-tasks/`, which is reserved for already-completed historical prompts.

The account-management design remains authoritative over this prompt if the two ever diverge. Before implementation, inspect current `main` and current PR state rather than assuming file layout or dependency behavior has remained unchanged.

---

Please implement PR A of the Account Management v1 plan in:

`wongjiahaomax-wq/Flash-Cards`

This PR is specifically:

**PASSWORD RECOVERY + TRANSACTIONAL EMAIL FOUNDATION**

Do NOT implement the Admin Accounts management UI yet.

## WORK STATE

Before editing, inspect current repository/PR state.

The product/design decisions are recorded in:

- PR #95 — “Document account management and password recovery plan”
- `docs/ACCOUNT_MANAGEMENT_PLAN.md`

IMPORTANT:

- If PR #95 has been merged by the time you start, use the copy on current main.
- If PR #95 is still open/unmerged, read the document and PR as design context, but DO NOT branch from PR #95 merely to inherit the documentation.
- This implementation should start from the latest current main unless another implementation PR for this exact PR-A scope already exists.
- If an implementation PR for PR A already exists, inspect and continue it rather than creating duplicate work.

Create a focused feature branch, for example:

`agent/account-password-recovery`

Open a DRAFT PR targeting:

`main`

Do NOT merge the PR.

## EXECUTION MODE

Use the repository's capability-based workflow.

Read:

- `AGENTS.md`
- `docs/AGENT_TASK_MAP.md`
- `docs/ACCOUNT_MANAGEMENT_PLAN.md`
- `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md`

If you have a usable terminal/local checkout, use the repository-defined Local/Hybrid validation workflow.

If you only have GitHub repository access, use Remote GitHub mode and clearly distinguish GitHub CI evidence from commands you personally executed.

Inspect current implementation rather than assuming the paths below remain unchanged.

## CURRENT AUTH BASELINE

The repository currently uses Better Auth with Cloudflare D1.

Important existing behavior that must be preserved:

- email/password authentication is already enabled;
- public signup is intentionally disabled: `disableSignUp: true`;
- the Better Auth Admin plugin is already configured;
- production Admin, Preview Admin, and combined-role behavior already exists;
- production/Preview authority boundaries must remain intact;
- the Preview Worker must not gain production Admin authority;
- `npm run admin:bootstrap` remains the initial-production-Admin / disaster-recovery mechanism;
- ordinary learner account creation is NOT part of this PR.

The repository currently pins:

`better-auth 1.6.25`

Do NOT upgrade Better Auth as part of this PR.

Before implementation, verify the exact password-reset APIs and configuration supported by the pinned Better Auth version rather than assuming the latest Better Auth documentation exactly matches 1.6.25.

## GOAL

Implement secure self-service password recovery and the transactional-email foundation needed by future account creation.

The finished learner flow should be:

```text
Sign in
→ Forgot password?
→ enter email
→ generic confirmation response
→ receive password-reset email through Resend
→ open secure reset link
→ choose new password
→ password changes
→ previous sessions are revoked
→ user may sign in with the new password
```

This PR should also establish a small reusable email-delivery boundary that PR B can later use for new-account “Set your password” invitations.

## EMAIL PROVIDER

Use:

**Resend**

Resend is the agreed initial transactional-email provider.

However, do NOT couple Better Auth or route code directly to Resend throughout the application.

Create a small server-side email abstraction with clear ownership.

For example, inspect current conventions and choose an appropriate focused location such as:

`src/lib/server/email/`

New/extracted application code should prefer TypeScript in accordance with the repository architecture guidance.

A reasonable conceptual boundary is:

```text
sendPasswordResetEmail(...)
        ↓
email provider abstraction
        ↓
Resend transport
```

Do not create a generic framework unnecessarily.

The purpose of the abstraction is simply to prevent Better Auth/domain logic from depending directly on the provider SDK/API everywhere.

## SECRETS / CONFIGURATION

Use Cloudflare environment bindings/secrets.

Expected configuration will likely include concepts such as:

```text
RESEND_API_KEY
AUTH_EMAIL_FROM
```

Choose exact names consistently with repository conventions.

Do NOT:

- commit secrets;
- hard-code an API key;
- configure a real production secret;
- deploy a Worker;
- mutate production configuration.

Update the appropriate documentation/example configuration so future operators know which environment values are required.

Do not document current Resend free-tier quotas/pricing as an application contract because external pricing can change.

## BETTER AUTH PASSWORD RESET

Integrate Better Auth's password-reset mechanism using the capabilities actually available in pinned Better Auth 1.6.25.

The implementation should provide the equivalent of:

1. request password reset;
2. Better Auth creates/validates the reset token;
3. `sendResetPassword` or the pinned-version equivalent sends the email;
4. reset page consumes the token;
5. Better Auth updates the password;
6. existing sessions are revoked.

Prefer Better Auth's built-in reset-token implementation.

Do NOT invent a custom password-reset token table or homemade cryptographic token system unless the pinned Better Auth version genuinely cannot provide the required capability.

Configure a sensible short expiration time.

Target approximately:

`1 hour`

unless the pinned API requires a materially different safe configuration.

Configure:

`revokeSessionsOnPasswordReset: true`

or the pinned-version equivalent.

## EMAIL-SENDING TIMING / CLOUDFLARE

Password-reset requests must not leak whether an account exists.

The browser-facing request should not behave observably differently simply because the email exists or does not exist.

Better Auth guidance recommends avoiding a synchronous email-send timing leak.

Because this application runs on Cloudflare Workers, inspect the current SvelteKit/Cloudflare request context and use an appropriate background-lifetime mechanism such as Cloudflare `waitUntil` if supported cleanly by the existing runtime.

Do NOT:

- delay the response only for known accounts;
- expose Resend errors to the learner;
- expose whether a user was found;
- log reset tokens.

If asynchronous delivery fails after the reset request has been accepted, handle/log the operational failure safely without exposing the account state or token.

Never log:

- plaintext passwords;
- temporary credentials;
- reset tokens;
- Resend API keys.

## FORGOT PASSWORD UX

Add:

**Forgot password?**

to the existing sign-in page.

Implement a focused route such as:

`/forgot-password`

The page should:

- ask for an email address;
- submit the reset request;
- present the SAME learner-facing result whether or not the account exists.

Use wording equivalent to:

> If an account exists for that email address, we’ve sent password reset instructions.

Do not reveal:

- “email not found”;
- “no account exists”;
- different success/error states based on account existence.

Normal validation errors such as a malformed email may still be handled appropriately, provided they do not reveal stored account state.

## RESET PASSWORD UX

Implement a route such as:

`/reset-password`

The reset email should direct the user to this application route with the Better Auth reset token in the expected form.

The page should allow the user to:

- enter a new password;
- confirm it;
- submit the reset through Better Auth.

Handle:

- missing token;
- invalid token;
- expired token;
- successful reset.

Invalid/expired reset links should fail safely and offer a route back to request a new password-reset email.

Do not expose internal token-validation details.

Use existing application UI conventions rather than redesigning authentication screens.

## PASSWORD POLICY

Use the password constraints already enforced by Better Auth/current application configuration.

Do not create a second contradictory password policy purely in the UI.

Client-side hints/validation may mirror the server constraints for UX, but the server/Better Auth remains authoritative.

## SECURITY INVARIANTS

These are acceptance requirements.

1. Public signup remains disabled.
2. This PR does NOT add learner self-registration.
3. Password-reset requests do not reveal whether an account exists.
4. Better Auth remains responsible for reset-token generation and validation.
5. Reset links expire.
6. Reset tokens are not stored/logged by application code outside Better Auth's intended storage mechanism.
7. Passwords are never logged.
8. Resend credentials remain server-only.
9. A successful password reset revokes existing sessions.
10. A reset token cannot be reused after successful password reset.
11. Invalid/expired reset links fail closed.
12. Production/Preview auth boundaries remain unchanged.
13. Preview Admin authority must not be expanded.
14. No production mutation/configuration/deployment occurs while implementing this PR.

## EMAIL TEMPLATE

Keep the v1 password-reset email simple.

It needs:

- clear Flash-Cards identity;
- explanation that a password reset was requested;
- secure reset link;
- indication that the link expires;
- wording that the recipient can ignore the email if they did not request it.

Do not add marketing content.

Avoid putting sensitive token values anywhere except the reset URL itself.

Both plain-text and HTML forms may be provided if that fits the chosen Resend integration cleanly.

## EMAIL ABSTRACTION REQUIREMENT

Design the email layer so PR B can later add:

**Set your Flash-Cards password**

without rewriting the authentication layer.

Do NOT implement account invitations in this PR.

It should simply be possible for future code to reuse the same email transport cleanly.

Keep modules cohesive and small.

Avoid putting:

- auth configuration;
- Resend transport;
- templates;
- SvelteKit form handling;

all into one large module.

Follow the repository architecture direction:

- TypeScript for new/extracted application modules where practical;
- small cohesive modules;
- thin routes;
- explicit ownership;
- no generic utility dumping ground.

## RATE LIMITING

Inspect the rate-limiting behavior actually provided by Better Auth 1.6.25.

Password-reset endpoints must not become an obvious abuse vector.

Use Better Auth's supported protections where sufficient.

Do NOT:

- silently assume features documented only for a newer Better Auth version;
- bundle a Better Auth upgrade into this PR;
- create a large custom distributed rate-limiting system unless genuinely necessary.

If Better Auth 1.6.25 cannot provide the desired durable Cloudflare/serverless rate-limit behavior cleanly, implement the safest narrow PR-A behavior available and explicitly document the residual limitation for later hardening.

Do not allow this concern to expand PR A into a major infrastructure project.

## TESTING

Add focused automated coverage for security-sensitive behavior where feasible.

At minimum verify the equivalent of:

- public signup remains disabled;
- forgot-password request uses a generic result;
- unknown email does not produce an account-enumeration response;
- known email triggers the email-dispatch path;
- reset email contains the appropriate application reset URL;
- reset tokens are not accidentally exposed in rendered response data;
- valid reset changes the password;
- successful reset revokes prior sessions;
- invalid reset token fails safely;
- expired reset token fails safely;
- password mismatch / invalid password handling works;
- Resend/email-provider failure does not leak account existence;
- provider secrets remain server-side;
- Preview/production authority behavior is unchanged.

Mock external email delivery in automated tests.

Do NOT send real Resend emails from ordinary unit/CI tests.

Inspect existing test conventions before introducing new test infrastructure.

## DOCUMENTATION

Update documentation in the same PR where necessary.

At minimum ensure the repository records:

- password recovery is now implemented;
- Resend is the current email transport;
- required environment-secret names;
- how reset-email URLs are constructed/configured;
- any local-development behavior;
- any manual operator setup still required before production use.

Update:

`docs/ACCOUNT_MANAGEMENT_PLAN.md`

to distinguish implemented PR-A behavior from future PR-B/PR-C work if the document is present on current main by implementation time.

Also update the appropriate documentation index/status documents if repository conventions require it.

Do NOT claim:

- Resend is configured in production;
- a sending domain has been verified;
- production password reset is working;

unless those things have actually been explicitly verified.

```text
Code merged
≠ production secret configured
≠ Resend domain verified
≠ Worker deployed
≠ production behavior verified
```

Keep those facts separate.

## OUT OF SCOPE

Do NOT implement in this PR:

- `/admin/accounts`;
- Admin learner list;
- account creation;
- learner invitation creation;
- Admin-created temporary passwords;
- Admin role promotion/demotion UI;
- Disable/Restore account UI;
- account hard deletion;
- Admin session-management UI;
- learner-progress administration;
- public signup;
- OAuth/social login;
- organizations/cohorts;
- 2FA;
- passkeys;
- Better Auth upgrades;
- production Resend secret configuration;
- production DNS changes;
- production deployment.

PR B will handle production Admin account management after this email/reset foundation exists.

## IMPLEMENTATION REVIEW

Before pushing the principal implementation, self-review the complete diff for:

- accidental public-signup enablement;
- account enumeration;
- token leakage;
- password leakage;
- secret leakage;
- synchronous timing differences;
- unsafe external-email error handling;
- lost session revocation;
- Preview/production authority regression;
- unnecessary Better Auth upgrade;
- route/module bloat;
- duplicated auth logic;
- unrelated cleanup.

## VALIDATION

When command execution is available, follow repository guidance.

Start with:

`npm run agent:doctor`

After implementation:

`npm run agent:checks`

Run focused authentication/password-reset tests.

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

- Goal
- Current auth baseline
- Implementation
- Security invariants
- Resend/configuration requirements
- Validation
- Manual testing
- Production rollout still required
- Explicitly out of scope
- Next stage — PR B

Do NOT merge the PR.

Do NOT deploy to production.

Do NOT configure production secrets.

Do NOT mutate production D1.

Leave the draft PR as a complete durable handoff for review and the subsequent Admin Account Management PR B.
