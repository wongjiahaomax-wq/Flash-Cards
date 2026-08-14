# Flash-Cards

Private case-based medical learning application.

## Current status

The educational model and Version 1 contract are documented. Application implementation is the next milestone.

## Documentation

- [`docs/CURRENT_DESIGN.md`](docs/CURRENT_DESIGN.md) — design rationale, educational model, and future questions.
- [`docs/V1_SPEC.md`](docs/V1_SPEC.md) — frozen Version 1 product/behaviour specification.
- [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md) — Version 1 relational data model and selection algorithms.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — ordered implementation milestones.

## V1 technical direction

```text
SvelteKit
└── Cloudflare Workers
    ├── Better Auth
    ├── Drizzle ORM
    │   └── Cloudflare D1
    └── Cloudflare R2
```

## Next implementation milestone

Scaffold the SvelteKit/Cloudflare Workers application, then implement the D1/Drizzle schema and a small seeded learner study flow before building the full admin interface.
