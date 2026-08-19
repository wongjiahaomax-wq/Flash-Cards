# Open-source readiness

_Status: private-repository publication checklist._

Before making this repository public:

- [ ] Review `docs/LOCAL_DEVELOPMENT_REPLICA.md` and remove/redact internal operational details that should not be public.
- [ ] Review `docs/CLOUDFLARE.md`, Preview runbooks, production snapshot/operator docs, and workflow YAML for infrastructure identifiers that should be removed or generalized.
- [ ] Review GitHub Actions secret **names** and operator descriptions for unnecessary internal disclosure.
- [ ] Confirm no Cloudflare API token, Better Auth secret, password, cookie, password hash, or other credential value is tracked.
- [ ] Confirm no production D1 export, production user/session data, learner data, or mirrored R2 media is tracked.
- [ ] Confirm `.dev.vars`, `.env*`, `.wrangler/`, local databases, and replica staging paths remain gitignored.
- [ ] Run repository/host secret scanning before publication.
- [ ] Review Git history, not only the current tree, for accidentally committed sensitive material.
- [ ] If a real secret or private dataset was ever committed, rotate/revoke/remove it and rewrite repository history where appropriate; deleting it in a later commit is insufficient.
- [ ] Re-read the public README/documentation from the perspective of a third party and remove private operational assumptions.

This checklist is intentionally conservative. The repository being private today is not permission to commit secrets or production-derived private data.
