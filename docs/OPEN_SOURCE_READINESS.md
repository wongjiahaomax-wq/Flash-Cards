# Public-repository safety posture

_Status: current repository is public; this file is a continuing safety checklist, not a future publication checklist._

_Last reconciled: 4 September 2026._

The GitHub repository is already public. The application itself remains closed-enrollment/private, and teaching media/user data may still be private even though source code is public.

## Current rule

Treat every tracked file, PR body/comment, workflow definition, issue, and Git commit as potentially public.

Never commit or paste:

- Cloudflare API tokens or other provider credentials;
- Better Auth secrets;
- passwords, password hashes, reset tokens, complete password-reset URLs, or session cookies;
- real `RESEND_API_KEY` or equivalent email-provider credentials;
- `.dev.vars`, secret `.env*` files, `.wrangler/` runtime state, or local databases;
- Production D1 exports containing auth/user/session/learner data;
- production-derived learner history/analytics/account-deletion state;
- mirrored private R2 teaching-media bytes unless publication/licensing is explicitly approved;
- private keys or signing material.

## Current-tree protections verified by repository structure

The committed `.gitignore` excludes the normal local secret/runtime/database paths including:

```text
.wrangler/
.dev.vars
.dev.vars.*
.env
.env.*
*.sqlite
*.sqlite3
*.db
```

with example configuration files deliberately allowed where applicable.

These ignore rules reduce accidental commits but are **not** a secret-management boundary. A credential pasted into another tracked file, PR description, log, or commit remains exposed.

## Public operational identifiers

Some workflow/configuration files may contain non-secret infrastructure identifiers required for deterministic deployment configuration. Do not confuse an identifier with a credential, but review whether publishing each identifier is necessary.

Never place privileged tokens/secrets directly in workflow YAML or committed runtime configuration. Use the established secret/binding mechanism.

## Required continuing checks

Because the repository is already public, these are ongoing controls rather than pre-publication gates:

- [ ] Review new/changed operational docs and workflow YAML for unnecessary internal disclosure.
- [ ] Confirm no credential values are present in the changed tree before merge.
- [ ] Confirm no Production auth/user/session/learner exports or mirrored private media are tracked.
- [ ] Keep `.dev.vars`, secret `.env*`, `.wrangler/`, local databases, and replica staging state excluded.
- [ ] Use repository/host secret scanning where available.
- [ ] Treat Git history as part of the exposure surface; deleting a secret in a later commit does not make the old value private.
- [ ] If a real secret was ever committed, rotate/revoke it immediately and assess history rewrite/removal separately.
- [ ] Review public README/runbooks from a third-party perspective before adding sensitive operational detail.

## Known documentation correction

Older runbooks may still contain language such as “before making the repository public” or “intended for the private repository.” That language is stale with respect to GitHub repository visibility.

The intended distinction is now:

```text
GitHub repository
= public source repository

Flash-Cards application
= closed-enrollment/private application

Production D1/R2/auth/learner data
= private operational data
```

Living runbooks should use that distinction. Historical implementation/evidence files may preserve their original wording when clearly marked historical by `DOCUMENTATION_INDEX.md`.

## What this document does not prove

This reconciliation does not claim that the complete Git history has been exhaustively secret-scanned from this session. It also does not claim that every operational identifier has been intentionally approved for publication.

Those are security-review activities that require the relevant scanning/repository-history capabilities. Absence of a discovered secret in this documentation audit is not proof that no secret has ever existed in history.
