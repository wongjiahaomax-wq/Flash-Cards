# Flash-Cards

Private case-based medical learning application.

## Current status

The Version 1 educational model is documented and the core infrastructure is now running in production.
The repository contains:

- a SvelteKit application targeting Cloudflare Workers;
- Cloudflare D1 + Drizzle learning-domain schema and migrations;
- Better Auth 1.6.25 with D1-backed user/account/session/verification tables;
- protected learner/admin routes with public sign-up disabled;
- a tested first-administrator bootstrap command;
- Cloudflare R2 production binding plus application-level storage guardrails;
- tested Case-selection and reusable-question resolution logic.

Production authentication was deployed and checked on 15 August 2026. Anonymous requests to `/study`
and `/admin` redirect to `/sign-in`, `/sign-in` is live, and a normal GET to
`/api/auth/get-session` returns HTTP 200 with a null session when signed out. The first production
administrator account has been bootstrapped through the local secure operator command.

The main product milestone is now the **small seeded STEMI learner flow**: seed representative Cases
and reusable questions, read them from D1, connect them to `/study`, snapshot Reviews, reveal answers,
and record `Again`/`Good` ratings.

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

Better Auth is embedded as an application library; it is not a separate hosted service in this
architecture. Application users and sessions are stored in the same D1 database as the learning data.

## Immediate next steps

1. Verify the bootstrapped production administrator can sign in and access `/admin` in a browser.
2. Add the tiny representative STEMI seed dataset.
3. Add server-side D1 queries for topic descendants, Cases, assets, and resolved compatible questions.
4. Connect `/study` to the existing selection engine.
5. Create Review, Review Question, and Review Asset snapshots; add answer reveal and `Again`/`Good` completion.
6. Add an administrator flow for creating learner accounts and verify learner/admin role boundaries.
7. Add the minimum R2 upload/serving path needed for real teaching images.

Do not start with a full Anki importer or advanced scheduling. The current objective is one thin,
working learner path using representative seeded content.

## Cloudflare development

The Worker is configured with D1 (`DB`), R2 (`MEDIA`), and static-asset (`ASSETS`) bindings. Wrangler
persists local simulations under `.wrangler/`.

```sh
npm install
npm run db:migrate:local
cp .dev.vars.example .dev.vars
npm run dev
```

### Wrangler version note

`package.json` is still pinned to Wrangler 4.115.0, whose bundled local runtime does not support the
project compatibility date `2026-08-14`. Production release work has therefore been validated with
Wrangler 4.123.0. Until the dependency pin is updated, prefer explicit release commands such as:

```sh
npx --yes wrangler@4.123.0 d1 migrations apply DB --remote
npm run build
npx --yes wrangler@4.123.0 deploy
```

See [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) before applying production migrations or deploying.
