# Flash-Cards

Private case-based medical learning application.

## Current status

The Version 1 educational model is documented and the application scaffold is implemented.
The repository now contains:

- a SvelteKit application targeting Cloudflare Workers;
- Cloudflare D1 + Drizzle domain schema and migrations;
- Cloudflare R2 production binding plus application-level storage guardrails;
- Better Auth integration code, protected learner/admin routes, and sign-in/sign-out UI;
- tested Case-selection and reusable-question resolution logic.

The main unfinished infrastructure item is the **Better Auth database schema/migration**.
The current committed D1 migration contains the learning-domain tables but not Better Auth's
user/account/session/verification tables. Do not deploy the auth-enabled current source as a
private production application until that migration has been generated, reviewed, applied, and
tested.

After authentication is database-ready, the next product milestone is a small seeded STEMI
learner flow.

## Documentation

- [`docs/CURRENT_DESIGN.md`](docs/CURRENT_DESIGN.md) — design rationale, educational model, and future questions.
- [`docs/V1_SPEC.md`](docs/V1_SPEC.md) — frozen Version 1 product/behaviour specification.
- [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md) — Version 1 relational data model and selection algorithms.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — implementation milestones and current status.
- [`docs/HANDOVER.md`](docs/HANDOVER.md) — current technical state and recommended next sequence.
- [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) — Cloudflare development/deployment notes.
- [`docs/R2_COST_GUARDRAILS.md`](docs/R2_COST_GUARDRAILS.md) — R2 storage and billing guardrails.

## V1 technical direction

```text
SvelteKit
└── Cloudflare Workers
    ├── Better Auth
    ├── Drizzle ORM
    │   └── Cloudflare D1
    └── Cloudflare R2
```

## Immediate next steps

1. Generate and review the Better Auth D1 schema/migration for the pinned Better Auth version.
2. Apply all migrations to a fresh local D1 database.
3. Test `/`, `/sign-in`, `/study`, `/admin`, and authentication API routes in the local Workers runtime.
4. Apply the reviewed auth migration to production and deploy the auth-enabled build.
5. Bootstrap the first application administrator account; public sign-up remains disabled.
6. Add the tiny STEMI seed dataset and connect it to the learner study flow.

The administrator account is an **application user managed by Better Auth**; Better Auth itself is
a library and does not require a separate hosted-service account for this architecture.

## Cloudflare development

The Worker is configured with D1 (`DB`) and R2 (`MEDIA`) bindings. Wrangler persists local
simulations under `.wrangler/`.

```sh
npm install
npm run db:migrate:local
cp .dev.vars.example .dev.vars
npm run dev
```

See [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) before applying production migrations or deploying.
