from pathlib import Path
import re


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:140]!r}")
    write(path, text.replace(old, new, 1))


def replace_regex_once(path, pattern, replacement):
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"expected one regex match in {path}; found {count}: {pattern!r}")
    write(path, updated)


# Idempotent when the self-triggered workflow runs after pushing the fix commit.
delete_source = read('src/lib/server/db/learner-account-deletion.ts')
if "phase: 'auth_sessions'" in delete_source and "phase: 'auth_accounts'" in delete_source:
    print('PR #141 review fixups already applied')
    raise SystemExit(0)

# ---------------------------------------------------------------------------
# 1. Put every unbounded Better Auth learner-owned collection behind the same
#    <=1000-row retry-safe deletion state machine.
# ---------------------------------------------------------------------------
path = 'src/lib/server/db/learner-account-deletion.ts'
replace_once(
    path,
    "const PHASES = [\n  { phase: 'auth_verifications', table: 'verification', userColumn: 'value', next: 'free_receipts' },",
    "const PHASES = [\n  { phase: 'auth_sessions', table: 'session', userColumn: 'userId', next: 'auth_verifications' },\n  { phase: 'auth_verifications', table: 'verification', userColumn: 'value', next: 'auth_accounts' },\n  { phase: 'auth_accounts', table: 'account', userColumn: 'userId', next: 'free_receipts' },"
)
replace_regex_once(
    path,
    r"async function revokeAccess\(client: D1Database, userId: string\) \{.*?\n\}",
    '''async function revokeAccess(client: D1Database, userId: string) {
  await client.prepare(`
    UPDATE user
    SET banned = 1,
        banReason = 'Account deletion in progress',
        banExpires = NULL,
        updatedAt = ${DATABASE_NOW_MS_SQL}
    WHERE id = ? AND (role IS NULL OR role = 'user')
  `).bind(userId).run();
}'''
)
replace_once(
    path,
    "    `).bind(userId),\n    client.prepare('DELETE FROM session WHERE userId = ?').bind(userId)\n  ]);",
    "    `).bind(userId)\n  ]);"
)
replace_once(path, "      VALUES (?, 'auth_verifications')", "      VALUES (?, 'auth_sessions')")
replace_once(
    path,
    "  SELECT CASE\n    WHEN EXISTS (SELECT 1 FROM verification WHERE value = ? LIMIT 1) THEN 'auth_verifications'",
    "  SELECT CASE\n    WHEN EXISTS (SELECT 1 FROM session WHERE userId = ? LIMIT 1) THEN 'auth_sessions'\n    WHEN EXISTS (SELECT 1 FROM verification WHERE value = ? LIMIT 1) THEN 'auth_verifications'\n    WHEN EXISTS (SELECT 1 FROM account WHERE userId = ? LIMIT 1) THEN 'auth_accounts'"
)
replace_once(path, ".bind(...Array(12).fill(userId))", ".bind(...Array(14).fill(userId))")
replace_once(
    path,
    " * final full learner-row rescan repairs any in-flight write that committed before\n * access revocation became authoritative. Better Auth 1.6.25 reset-password",
    " * final full learner-row rescan repairs any in-flight write that committed before\n * access revocation became authoritative. Existing Better Auth sessions and linked\n * accounts are bounded staged phases; the durable marker is the immediate\n * access-denial authority. Better Auth 1.6.25 reset-password"
)

path = 'src/lib/server/db/fsrs-analytics-schema.js'
replace_once(
    path,
    "      enum: [\n        'auth_verifications',",
    "      enum: [\n        'auth_sessions',\n        'auth_verifications',\n        'auth_accounts',"
)
replace_once(path, ".default('auth_verifications')", ".default('auth_sessions')")

path = 'drizzle/0025_learner_fsrs_admin_analytics_deletion.sql'
replace_once(path, "`phase` text DEFAULT 'auth_verifications' NOT NULL,", "`phase` text DEFAULT 'auth_sessions' NOT NULL,")
replace_once(
    path,
    "\tCONSTRAINT `learner_account_deletions_phase_check` CHECK (`phase` in (\n\t\t'auth_verifications',",
    "\tCONSTRAINT `learner_account_deletions_phase_check` CHECK (`phase` in (\n\t\t'auth_sessions',\n\t\t'auth_verifications',\n\t\t'auth_accounts',"
)
replace_once(
    path,
    "CREATE TRIGGER `verification_learner_account_deletion_guard`",
    "CREATE TRIGGER `account_learner_account_deletion_guard`\nBEFORE INSERT ON `account`\nWHEN EXISTS (\n\tSELECT 1 FROM `learner_account_deletions` d WHERE d.`user_id` = NEW.`userId`\n)\nBEGIN\n\tSELECT RAISE(ABORT, 'learner_account_deletion_in_progress');\nEND;\n--> statement-breakpoint\nCREATE TRIGGER `verification_learner_account_deletion_guard`"
)
replace_once(
    path,
    "\tAND (\n\t\tEXISTS (SELECT 1 FROM `verification` x WHERE x.`value` = OLD.`id`)",
    "\tAND (\n\t\tEXISTS (SELECT 1 FROM `session` x WHERE x.`userId` = OLD.`id`)\n\t\tOR EXISTS (SELECT 1 FROM `verification` x WHERE x.`value` = OLD.`id`)\n\t\tOR EXISTS (SELECT 1 FROM `account` x WHERE x.`userId` = OLD.`id`)"
)

# ---------------------------------------------------------------------------
# 2. Durable deletion state, not physical session removal, is the immediate
#    request-level access boundary while auth rows drain in bounded chunks.
# ---------------------------------------------------------------------------
path = 'src/hooks.server.js'
replace_once(
    path,
    "function forbidden(message) {\n  return new Response(message, {\n    status: 403,\n    headers: { 'content-type': 'text/plain; charset=utf-8' }\n  });\n}\n",
    "function forbidden(message) {\n  return new Response(message, {\n    status: 403,\n    headers: { 'content-type': 'text/plain; charset=utf-8' }\n  });\n}\n\n/** @param {D1Database} db @param {string} userId */\nasync function learnerDeletionInProgress(db, userId) {\n  const row = await db.prepare(`\n    SELECT 1 AS active FROM learner_account_deletions WHERE user_id = ? LIMIT 1\n  `).bind(userId).first();\n  return Boolean(row);\n}\n"
)
replace_once(
    path,
    "  event.locals.session = session?.session ?? null;\n  event.locals.user = session?.user ?? null;\n\n  // Preview-only identities",
    "  event.locals.session = session?.session ?? null;\n  event.locals.user = session?.user ?? null;\n\n  // The durable deletion marker is immediate access revocation. Existing Better\n  // Auth session/account rows are drained later in bounded batches, so an old\n  // session cookie must fail closed before its physical session row disappears.\n  if (\n    event.locals.user?.id &&\n    (event.locals.user.role == null || event.locals.user.role === 'user') &&\n    await learnerDeletionInProgress(env.DB, event.locals.user.id)\n  ) {\n    event.locals.session = null;\n    event.locals.user = null;\n    return forbidden('Learner account deletion is in progress.');\n  }\n\n  // Preview-only identities"
)

# ---------------------------------------------------------------------------
# 3. Unit/source-contract coverage: physical sessions survive begin, cannot be
#    used/recreated, and drain over multiple bounded calls. Accounts are staged
#    too so Better Auth removeUser reaches a one-row identity root with zero
#    unbounded auth-owned children.
# ---------------------------------------------------------------------------
path = 'test/learner-fsrs-pr-g.test.js'
replace_once(
    path,
    "    INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)\n    VALUES ('account-a', 'learner-a', 'credential', 'learner-a', 'not-a-real-password-hash', 1, 1);\n    INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)\n    VALUES ('session-a', 9999999999999, 'session-token-a', 1, 1, 'learner-a');",
    "    INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES\n      ('account-a', 'learner-a', 'credential', 'learner-a', 'not-a-real-password-hash', 1, 1),\n      ('account-b', 'linked-b', 'provider-b', 'learner-a', NULL, 1, 1),\n      ('account-c', 'linked-c', 'provider-c', 'learner-a', NULL, 1, 1);\n    INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES\n      ('session-a', 9999999999999, 'session-token-a', 1, 1, 'learner-a'),\n      ('session-b', 9999999999999, 'session-token-b', 1, 1, 'learner-a'),\n      ('session-c', 9999999999999, 'session-token-c', 1, 1, 'learner-a'),\n      ('session-d', 9999999999999, 'session-token-d', 1, 1, 'learner-a'),\n      ('session-e', 9999999999999, 'session-token-e', 1, 1, 'learner-a');"
)
replace_once(
    path,
    "    assert.equal(started.phase, 'auth_verifications');\n    assert.equal(sqlite.prepare(\"SELECT banned FROM user WHERE id = 'learner-a'\").get().banned, 1);\n    assert.equal(sqlite.prepare(\"SELECT COUNT(*) AS n FROM session WHERE userId = 'learner-a'\").get().n, 0);",
    "    assert.equal(started.phase, 'auth_sessions');\n    assert.equal(sqlite.prepare(\"SELECT banned FROM user WHERE id = 'learner-a'\").get().banned, 1);\n    assert.equal(\n      sqlite.prepare(\"SELECT COUNT(*) AS n FROM session WHERE userId = 'learner-a'\").get().n,\n      5,\n      'begin must revoke access through durable state without an unbounded session delete'\n    );\n    assert.equal(sqlite.prepare(\"SELECT COUNT(*) AS n FROM account WHERE userId = 'learner-a'\").get().n, 3);"
)
replace_once(
    path,
    "    assert.throws(\n      () => sqlite.exec(`\n        INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)\n        VALUES ('new-session', 9999999999999, 'new-token', 1, 1, 'learner-a');\n      `),\n      /deletion_in_progress/i,\n      'a staged learner cannot regain a new Better Auth session'\n    );",
    "    assert.throws(\n      () => sqlite.exec(`\n        INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)\n        VALUES ('new-session', 9999999999999, 'new-token', 1, 1, 'learner-a');\n      `),\n      /deletion_in_progress/i,\n      'a staged learner cannot regain a new Better Auth session'\n    );\n    assert.throws(\n      () => sqlite.exec(`\n        INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt)\n        VALUES ('new-account', 'new-linked', 'provider-new', 'learner-a', 1, 1);\n      `),\n      /deletion_in_progress/i,\n      'a staged learner cannot acquire a new Better Auth linked account'\n    );"
)
replace_once(
    path,
    "    assert.equal(ready, true, 'bounded retries should reach the identity-ready state');\n    assert.ok(deletionSteps.filter((step) => step.rowsDeleted === 2).length >= 2, 'fixture should require repeated bounded chunks');",
    "    assert.equal(ready, true, 'bounded retries should reach the identity-ready state');\n    assert.deepEqual(\n      deletionSteps.slice(0, 6).map((step) => [step.phase, step.rowsDeleted]),\n      [\n        ['auth_sessions', 2],\n        ['auth_sessions', 2],\n        ['auth_verifications', 1],\n        ['auth_accounts', 1],\n        ['auth_accounts', 2],\n        ['free_receipts', 1]\n      ],\n      'Better Auth sessions, verification, and accounts must drain through bounded staged phases'\n    );\n    assert.equal(sqlite.prepare(\"SELECT COUNT(*) AS n FROM session WHERE userId = 'learner-a'\").get().n, 0);\n    assert.equal(sqlite.prepare(\"SELECT COUNT(*) AS n FROM account WHERE userId = 'learner-a'\").get().n, 0);\n    assert.ok(deletionSteps.filter((step) => step.rowsDeleted === 2).length >= 2, 'fixture should require repeated bounded chunks');"
)

path = 'test/learner-fsrs-pr-g-source-contract.test.js'
replace_once(
    path,
    "  const migration = source('drizzle/0025_learner_fsrs_admin_analytics_deletion.sql');\n\n  assert.equal(packageJson.dependencies['better-auth'], '1.6.25');",
    "  const migration = source('drizzle/0025_learner_fsrs_admin_analytics_deletion.sql');\n  const hooks = source('src/hooks.server.js');\n\n  assert.equal(packageJson.dependencies['better-auth'], '1.6.25');"
)
replace_once(
    path,
    "  assert.match(adminRoute, /auth\\.api\\.removeUser/);\n  assert.match(deletion, /phase:\\s*'auth_verifications'/);",
    "  assert.match(adminRoute, /auth\\.api\\.removeUser/);\n  assert.match(deletion, /phase:\\s*'auth_sessions'/);\n  assert.match(deletion, /table:\\s*'session',\\s*userColumn:\\s*'userId'/);\n  assert.match(deletion, /phase:\\s*'auth_accounts'/);\n  assert.match(deletion, /table:\\s*'account',\\s*userColumn:\\s*'userId'/);\n  assert.doesNotMatch(deletion, /DELETE FROM session WHERE userId = \\?/);\n  assert.match(hooks, /learner_account_deletions/);\n  assert.match(deletion, /phase:\\s*'auth_verifications'/);"
)
replace_once(
    path,
    "  assert.match(migration, /EXISTS \\(SELECT 1 FROM `verification` x WHERE x\\.`value` = OLD\\.`id`\\)/);\n});",
    "  assert.match(migration, /EXISTS \\(SELECT 1 FROM `session` x WHERE x\\.`userId` = OLD\\.`id`\\)/);\n  assert.match(migration, /EXISTS \\(SELECT 1 FROM `verification` x WHERE x\\.`value` = OLD\\.`id`\\)/);\n  assert.match(migration, /EXISTS \\(SELECT 1 FROM `account` x WHERE x\\.`userId` = OLD\\.`id`\\)/);\n  assert.match(migration, /account_learner_account_deletion_guard/);\n});\n\ntest('PR G authoritative data-model/index documents include migration 0025 and no longer describe PR G as pending', () => {\n  const model = source('docs/V1_DATA_MODEL.md');\n  const index = source('docs/DOCUMENTATION_INDEX.md');\n  assert.match(model, /0025_learner_fsrs_admin_analytics_deletion\\.sql/);\n  assert.match(model, /fsrs-analytics-schema\\.js/);\n  assert.match(model, /learner_system_monthly_buckets/);\n  assert.match(model, /auth_sessions/);\n  assert.match(model, /auth_accounts/);\n  assert.match(index, /0025_learner_fsrs_admin_analytics_deletion\\.sql/);\n  assert.match(index, /LEARNER_FSRS_PR_G_EVIDENCE\\.md/);\n  assert.doesNotMatch(index, /PR G Admin\\/cohort analytics, account deletion, and automatic optimizer execution remain separately owned/);\n});"
)

# ---------------------------------------------------------------------------
# 4. Mature benchmark: force multiple bounded Better Auth session and account
#    batches in addition to the existing high-volume FSRS/runtime fixture.
# ---------------------------------------------------------------------------
path = 'scripts/learner-fsrs-account-deletion-benchmark.mjs'
replace_once(
    path,
    "  const { caseCount, eventCount, systemCount, freeReceiptCount } = options;",
    "  const { caseCount, eventCount, systemCount, freeReceiptCount, sessionCount, accountCount } = options;"
)
replace_once(
    path,
    "    db.prepare(`\n      INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)\n      VALUES ('benchmark-account', 'benchmark-user', 'credential', 'benchmark-user', 'fixture', ?, ?)\n    `).run(now, now);",
    "    const insertAccount = db.prepare(`\n      INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)\n      VALUES (?, ?, ?, 'benchmark-user', ?, ?, ?)\n    `);\n    for (let index = 0; index < accountCount; index += 1) {\n      insertAccount.run(\n        `benchmark-account-${index}`,\n        index === 0 ? 'benchmark-user' : `linked-${index}`,\n        index === 0 ? 'credential' : `provider-${index}`,\n        index === 0 ? 'fixture' : null,\n        now,\n        now\n      );\n    }"
)
replace_once(path, "    for (let index = 0; index < 20; index += 1) {", "    for (let index = 0; index < sessionCount; index += 1) {")
replace_once(
    path,
    "    freeReceiptCount: options.freeReceiptCount ?? 2_000\n  };",
    "    freeReceiptCount: options.freeReceiptCount ?? 2_000,\n    sessionCount: options.sessionCount ?? 5_000,\n    accountCount: options.accountCount ?? 2_500\n  };"
)
replace_once(
    path,
    "    assert.equal(authVerificationCount, 1);\n\n    let directDeleteBlocked = false;",
    "    assert.equal(authVerificationCount, 1);\n    const authSessionCount = Number(db.prepare(`\n      SELECT COUNT(*) AS n FROM session WHERE userId = 'benchmark-user'\n    `).get().n);\n    const authAccountCount = Number(db.prepare(`\n      SELECT COUNT(*) AS n FROM account WHERE userId = 'benchmark-user'\n    `).get().n);\n    assert.equal(authSessionCount, fixture.sessionCount);\n    assert.equal(authAccountCount, fixture.accountCount);\n\n    let directDeleteBlocked = false;"
)
replace_once(
    path,
    "    const begin = await measured(() => beginLearnerAccountDeletion({ db: learningDb, userId: 'benchmark-user' }));\n    const stepDurations = [];",
    "    const begin = await measured(() => beginLearnerAccountDeletion({ db: learningDb, userId: 'benchmark-user' }));\n    assert.equal(begin.value.phase, 'auth_sessions');\n    assert.equal(Number(db.prepare(\"SELECT COUNT(*) AS n FROM session WHERE userId = 'benchmark-user'\").get().n), fixture.sessionCount);\n    assert.equal(Number(db.prepare(\"SELECT COUNT(*) AS n FROM account WHERE userId = 'benchmark-user'\").get().n), fixture.accountCount);\n    const stepDurations = [];"
)
replace_once(
    path,
    "    assert.ok(Math.max(...stepRows) <= LEARNER_ACCOUNT_DELETION_BATCH_SIZE);\n    assert.equal(Number(db.prepare(\"SELECT COUNT(*) AS n FROM verification WHERE value = 'benchmark-user'\").get().n), 0);",
    "    assert.ok(Math.max(...stepRows) <= LEARNER_ACCOUNT_DELETION_BATCH_SIZE);\n    assert.equal(Number(db.prepare(\"SELECT COUNT(*) AS n FROM session WHERE userId = 'benchmark-user'\").get().n), 0);\n    assert.equal(Number(db.prepare(\"SELECT COUNT(*) AS n FROM account WHERE userId = 'benchmark-user'\").get().n), 0);\n    assert.equal(Number(db.prepare(\"SELECT COUNT(*) AS n FROM verification WHERE value = 'benchmark-user'\").get().n), 0);"
)
replace_once(
    path,
    "        'Scheduled history and current-generation optimizer evidence are not hard-capped, so no finite one-shot mature-account cascade can be proven bounded. The staged path caps each child delete at 1,000 rows.',",
    "        'Scheduled history, current-generation optimizer evidence, Better Auth sessions, and linked accounts have no finite per-learner lifetime row cap. The supported path caps every learner-owned auth/application purge at 1,000 rows before the one-row identity root.',"
)
replace_once(path, "        authSessions: 20", "        authSessions: authSessionCount,\n        authAccounts: authAccountCount")
replace_once(
    path,
    "    const remainingVerification = Number(db.prepare(\"SELECT COUNT(*) AS n FROM verification WHERE value = 'benchmark-user'\").get().n);",
    "    const remainingVerification = Number(db.prepare(\"SELECT COUNT(*) AS n FROM verification WHERE value = 'benchmark-user'\").get().n);\n    const remainingSession = Number(db.prepare(\"SELECT COUNT(*) AS n FROM session WHERE userId = 'benchmark-user'\").get().n);\n    const remainingAccount = Number(db.prepare(\"SELECT COUNT(*) AS n FROM account WHERE userId = 'benchmark-user'\").get().n);"
)
# The original script already declares remainingAccount one line earlier. Remove
# that first declaration so the staged-zero assertion is explicit and unique.
text = read(path)
text = text.replace(
    "    const remainingAccount = Number(db.prepare(\"SELECT COUNT(*) AS n FROM account WHERE userId = 'benchmark-user'\").get().n);\n    const remainingVerification = Number(db.prepare(\"SELECT COUNT(*) AS n FROM verification WHERE value = 'benchmark-user'\").get().n);\n    const remainingSession = Number(db.prepare(\"SELECT COUNT(*) AS n FROM session WHERE userId = 'benchmark-user'\").get().n);\n    const remainingAccount = Number(db.prepare(\"SELECT COUNT(*) AS n FROM account WHERE userId = 'benchmark-user'\").get().n);",
    "    const remainingVerification = Number(db.prepare(\"SELECT COUNT(*) AS n FROM verification WHERE value = 'benchmark-user'\").get().n);\n    const remainingSession = Number(db.prepare(\"SELECT COUNT(*) AS n FROM session WHERE userId = 'benchmark-user'\").get().n);\n    const remainingAccount = Number(db.prepare(\"SELECT COUNT(*) AS n FROM account WHERE userId = 'benchmark-user'\").get().n);",
    1
)
write(path, text)
replace_once(path, "    assert.equal(remainingAccount, 0);\n    assert.equal(remainingVerification, 0);", "    assert.equal(remainingSession, 0);\n    assert.equal(remainingAccount, 0);\n    assert.equal(remainingVerification, 0);")
replace_once(path, "      residual: { remainingUser, remainingAccount, remainingVerification }", "      residual: { remainingUser, remainingSession, remainingAccount, remainingVerification }")

# ---------------------------------------------------------------------------
# 5. Real workerd/D1 smoke with 2,500 sessions and 1,500 linked accounts.
# ---------------------------------------------------------------------------
path = 'scripts/learner-fsrs-account-deletion-d1-smoke.mjs'
replace_once(path, "const deletionBatchSize = 1_000;", "const deletionBatchSize = 1_000;\nconst sessionCount = 2_500;\nconst accountCount = 1_500;")
replace_once(
    path,
    "    `INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES ('d1-account', 'd1-deletion-user', 'credential', 'd1-deletion-user', 'fixture', ${now}, ${now});`,\n    `INSERT INTO verification",
    "    `INSERT INTO verification"
)
replace_once(
    path,
    "  appendMultiRow(\n    lines,\n    'INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)',",
    "  appendMultiRow(\n    lines,\n    'INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)',\n    Array.from({ length: accountCount }, (_, index) => `(${sqlString(`d1-account-${index}`)}, ${sqlString(index === 0 ? 'd1-deletion-user' : `linked-${index}`)}, ${sqlString(index === 0 ? 'credential' : `provider-${index}`)}, 'd1-deletion-user', ${index === 0 ? sqlString('fixture') : 'NULL'}, ${now}, ${now})`)\n  );\n  appendMultiRow(\n    lines,\n    'INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)',"
)
replace_once(path, "    Array.from({ length: 20 }, (_, index) =>", "    Array.from({ length: sessionCount }, (_, index) =>")
replace_once(
    path,
    "    assert.equal(initial.verifications, 1, 'mature fixture must include learner-owned Better Auth verification state');\n    assert.equal(initial.scheduledEvents, eventCount);",
    "    assert.equal(initial.verifications, 1, 'mature fixture must include learner-owned Better Auth verification state');\n    assert.equal(initial.sessions, sessionCount, 'mature fixture must force multiple bounded auth-session batches');\n    assert.equal(initial.accounts, accountCount, 'mature fixture must force multiple bounded auth-account batches');\n    assert.equal(initial.scheduledEvents, eventCount);"
)
replace_once(
    path,
    "    const begun = await fetchJson(baseUrl, '/begin');\n    assert.equal(begun.status.banned, true);\n    assert.equal(begun.status.sessions, 0, 'access revocation must delete Better Auth sessions before child cleanup');",
    "    const begun = await fetchJson(baseUrl, '/begin');\n    assert.equal(begun.status.banned, true);\n    assert.equal(begun.status.phase, 'auth_sessions');\n    assert.equal(begun.status.sessions, sessionCount, 'begin must not perform an unbounded Better Auth session delete');\n    assert.equal(begun.status.accounts, accountCount, 'begin must not perform an unbounded Better Auth account delete');"
)
replace_once(
    path,
    "    assert.equal(ready, true, `D1 staged deletion did not become identity-ready; phase=${latest.phase}`);\n    assert.equal(latest.verifications, 0);",
    "    assert.equal(ready, true, `D1 staged deletion did not become identity-ready; phase=${latest.phase}`);\n    assert.deepEqual(steps.slice(0, 3), [\n      { phase: 'auth_sessions', rowsDeleted: 1000 },\n      { phase: 'auth_sessions', rowsDeleted: 1000 },\n      { phase: 'auth_verifications', rowsDeleted: 500 }\n    ], 'D1 must drain 2,500 auth sessions through three bounded staged steps');\n    assert.equal(latest.sessions, 0);\n    assert.equal(latest.accounts, 0);\n    assert.equal(latest.verifications, 0);"
)
replace_once(path, "    assert.equal(latest.accounts, 1, 'Better Auth credential remains until identity-root deletion');\n", "")
replace_once(path, "        authSessions: 20,", "        authSessions: sessionCount,\n        authAccounts: accountCount,")
replace_once(
    path,
    "      accessRevokedBeforeCleanup: begun.status.banned && begun.status.sessions === 0,",
    "      accessRevokedBeforeCleanup: begun.status.banned && begun.status.phase === 'auth_sessions' && begun.status.sessions === sessionCount,"
)

# ---------------------------------------------------------------------------
# 6. Evidence/status docs: bounded auth-owned phases and stronger fixtures.
# ---------------------------------------------------------------------------
path = 'docs/LEARNER_FSRS_PR_G_EVIDENCE.md'
replace_once(
    path,
    "2. bans the learner and deletes Better Auth sessions before large child cleanup;\n3. database guards reject new sessions and active Reviews while the marker exists;\n4. deletes at most 1,000 rows in one staged child-table step;",
    "2. bans the learner and commits that access-disabled state with the durable deletion marker;\n3. the request hook treats that marker as immediate access denial even while old session/account rows remain; database guards reject new sessions, linked accounts, and active Reviews;\n4. drains existing Better Auth sessions as the first retry-safe phase, deleting at most 1,000 rows per step;\n5. stages learner-owned Better Auth verification rows and linked accounts under the same 1,000-row bound before FSRS/runtime cleanup;"
)
replace_once(
    path,
    "5. is retry-safe if a delete commits but the phase update does not;\n6. performs a full residual rescan before declaring the identity ready for deletion;\n7. keeps a database guard on learner `user` deletion so an in-flight writer that recreates learner-owned rows forces the final identity delete to fail closed and be retried;\n8. calls pinned Better Auth Admin `removeUser` only after the staged data gate is clear.",
    "6. is retry-safe if a delete commits but the phase update does not;\n7. performs a full residual rescan before declaring the identity ready for deletion;\n8. keeps a database guard on learner `user` deletion so any surviving session/account/verification/application row forces final identity deletion to fail closed and be retried;\n9. calls pinned Better Auth Admin `removeUser` only after the staged data gate is clear, where the auth-owned collection deletes are already zero-row operations."
)
replace_once(
    path,
    "- Better Auth credential account, 20 sessions, and a learner-owned password-reset verification row.",
    "- 5,000 Better Auth sessions, 2,500 Better Auth linked/credential accounts, and a learner-owned password-reset verification row."
)
replace_once(
    path,
    "The local workerd/D1 smoke uses a smaller but multi-batch fixture, including the same Better Auth verification ownership class, and proves the same state machine through the actual D1 binding.",
    "The local workerd/D1 smoke uses a smaller but multi-batch fixture with 2,500 sessions, 1,500 linked/credential accounts, and the same verification ownership class, and proves the same state machine through the actual D1 binding."
)
replace_once(
    path,
    "- session invalidation/new-session guard during deletion;",
    "- immediate marker-authoritative access denial, bounded multi-batch session/account purge, and new-session/new-account guards during deletion;"
)

path = 'docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md'
replace_once(path, "Date: 3 September 2026", "Date: 4 September 2026")
replace_once(
    path,
    "3. bans the learner and removes Better Auth sessions before large child cleanup;\n4. rejects new sessions and new active Reviews while deletion is in progress;\n5. removes at most 1,000 rows from one learner-owned deletion class per staged step;",
    "3. bans the learner and commits the durable deletion marker as the immediate access-disabled authority;\n4. the request hook rejects any already-issued learner session while the marker exists, and database guards reject new sessions, linked accounts, and active Reviews;\n5. drains Better Auth sessions, learner-owned verification rows, and linked accounts as staged ownership classes at at most 1,000 rows per step;\n6. removes at most 1,000 rows from every subsequent application deletion class per staged step;"
)
replace_once(
    path,
    "6. removes Better Auth password-reset verification records owned by the learner through `verification.value` before FSRS/runtime cleanup;\n7. removes Free receipts, Scheduled events, active Reviews/children, optimizer evidence, learner×Case state, encounters, durable monthly buckets, System aggregates, learner aggregates, preferences and profile state;\n8. rescans every staged ownership class before declaring the identity ready;\n9. calls pinned Better Auth Admin `removeUser` only after the staged-data gate is clear.",
    "7. removes Free receipts, Scheduled events, active Reviews/children, optimizer evidence, learner×Case state, encounters, durable monthly buckets, System aggregates, learner aggregates, preferences and profile state;\n8. rescans every staged auth/application ownership class before declaring the identity ready;\n9. calls pinned Better Auth Admin `removeUser` only after the staged-data gate is clear, leaving no unbounded auth-owned collection for the final one-row identity operation."
)
replace_once(
    path,
    "A database user-delete guard fails closed if any learner-owned row or learner-owned verification record remains or reappears before identity deletion,",
    "A database user-delete guard fails closed if any learner-owned session, account, verification, or application row remains or reappears before identity deletion,"
)

# ---------------------------------------------------------------------------
# 7. Synchronize the authoritative V1 data model and documentation index.
# ---------------------------------------------------------------------------
path = 'docs/V1_DATA_MODEL.md'
replace_once(path, "_Last updated: 3 September 2026_", "_Last updated: 4 September 2026_")
replace_once(
    path,
    "This document records the implemented V1 application data model represented by current `main` after the learner FSRS runtime cutover, contextual System/Topic/Tag navigation, Primary-Topic-only Case behavior, Original/Alternative stimulus changes, and merged PR #139 (PR F) Reset/Fresh/retention ownership.",
    "This document records the implemented V1 application data model through the learner FSRS runtime cutover, contextual System/Topic/Tag navigation, Primary-Topic-only Case behavior, Original/Alternative stimulus changes, merged PR #139 (PR F), and the PR G Admin analytics/account-deletion repository implementation through migration `0025`."
)
replace_once(
    path,
    "0024_learner_fsrs_reset_fresh.sql\n```",
    "0024_learner_fsrs_reset_fresh.sql\n0025_learner_fsrs_admin_analytics_deletion.sql\n```"
)
replace_once(
    path,
    "- `0024` — defensive Scheduled active-Review/profile-boundary guard used by Reset Progress / Fresh FSRS Start serialization. It prevents generation/review-sequence/parameter/scheduler boundary movement while a Scheduled active Review still survives.\n",
    "- `0024` — defensive Scheduled active-Review/profile-boundary guard used by Reset Progress / Fresh FSRS Start serialization. It prevents generation/review-sequence/parameter/scheduler boundary movement while a Scheduled active Review still survives.\n- `0025` — durable learner × historical-System × UTC-month Scheduled analytics buckets, transactional maintenance/backfill from still-retained detailed history, System-provenance guards, and durable retry-safe learner account-deletion state/guards with bounded auth/application ownership phases.\n"
)
replace_once(
    path,
    "`src/lib/server/db/fsrs-schema.js` for durable FSRS/progress state, `src/lib/server/db/active-review-schema.js` for unfinished learner Review ownership, and `src/lib/server/db/free-study-schema.js` for Free completion receipts;",
    "`src/lib/server/db/fsrs-schema.js` for durable FSRS/progress state, `src/lib/server/db/fsrs-analytics-schema.js` for durable PR G monthly analytics/deletion state, `src/lib/server/db/active-review-schema.js` for unfinished learner Review ownership, and `src/lib/server/db/free-study-schema.js` for Free completion receipts;"
)
replace_once(
    path,
    "19. Reset/Fresh scheduler-boundary changes consume any active Review and clear current learner×Case scheduler state atomically with the boundary change; browser run state is convenience only and old proofs still fail server-side current-profile checks.\n",
    "19. Reset/Fresh scheduler-boundary changes consume any active Review and clear current learner×Case scheduler state atomically with the boundary change; browser run state is convenience only and old proofs still fail server-side current-profile checks.\n20. Long-range Admin System/cohort time series are sourced from durable monthly buckets, never reconstructed from lifetime aggregates or optimizer evidence; mature account deletion uses marker-authoritative access denial and bounded retry-safe auth/application purges.\n"
)
replace_once(
    path,
    "- a System with durable FSRS history in `scheduled_review_events` or `learner_system_aggregates` cannot be reclassified or deleted; application checks plus migration `0023` database triggers enforce this current provenance boundary.",
    "- a System with durable FSRS history in `scheduled_review_events`, `learner_system_aggregates`, or `learner_system_monthly_buckets` cannot be reclassified or deleted; centralized application checks plus migrations `0023`/`0025` database triggers enforce this provenance boundary."
)
text = read(path)
marker = "## PR G — durable Admin analytics and mature learner account deletion"
if marker not in text:
    text += '''\n\n## PR G — durable Admin analytics and mature learner account deletion\n\nMigration `0025_learner_fsrs_admin_analytics_deletion.sql` adds `learner_system_monthly_buckets`, keyed by `(user_id, system_id, month_start)`. `month_start` is the UTC calendar-month boundary; each row retains compact Scheduled completion and Again/Hard/Good/Easy counts plus first/last completion timestamps for the historical System captured at study time. The migration backfills only still-retained `scheduled_review_events`, and an `AFTER INSERT` trigger maintains future buckets transactionally. Detailed-history expiry does not decrement or delete these buckets. Long-range Admin System/cohort trends use the monthly table directly and must not reconstruct expired time axes from `learner_system_aggregates` or `learner_optimizer_evidence`.\n\n`learner_account_deletions` is the durable mature-account deletion state. Its first phases are `auth_sessions`, `auth_verifications`, and `auth_accounts`, followed by the learner FSRS/runtime ownership classes. Starting deletion atomically creates/resumes the marker and bans the learner; `src/hooks.server.js` treats that marker as immediate access denial even while pre-existing Better Auth rows remain. Database guards prevent new session/account ownership after the marker, and each auth/application collection is purged in retry-safe chunks of at most 1,000 rows. The final residual scan includes sessions, linked accounts, verification ownership, and all learner FSRS/runtime classes. The user-delete guard prevents an identity-root delete while any staged row remains; Better Auth Admin `removeUser` is called only after those collection deletes are guaranteed to be zero-row operations and only the one user identity root remains.\n\nThe monthly analytics table and deletion-state table are learner-owned state, are account-deletable, and are explicitly forbidden from Production-to-local content replica import. `learner_system_monthly_buckets` is also part of centralized historical System provenance, so retained monthly attribution blocks destructive System reclassification/deletion even after detailed events expire.\n'''
    write(path, text)

path = 'docs/DOCUMENTATION_INDEX.md'
replace_once(path, "_Last reviewed: 3 September 2026_", "_Last reviewed: 4 September 2026_")
replace_once(
    path,
    "Current `main` contains learner FSRS Parts A–E, PR #137 learner runtime cutover, and merged PR #139 (PR F).",
    "The repository baseline documented here contains learner FSRS Parts A–E, PR #137 learner runtime cutover, merged PR #139 (PR F), and the PR G Admin analytics/mature-account-deletion implementation through migration `0025`."
)
replace_once(path, "The merged repository migration chain therefore extends through `0024`.", "The repository migration chain documented by this PR therefore extends through `0025`.")
replace_once(path, "0024_learner_fsrs_reset_fresh.sql\n```", "0025_learner_fsrs_admin_analytics_deletion.sql\n```")
replace_once(
    path,
    "- `0024_learner_fsrs_reset_fresh.sql` — defensive Scheduled active-Review/profile-boundary guard for Reset/Fresh serialization; the migration itself does not reset learner data.\n",
    "- `0024_learner_fsrs_reset_fresh.sql` — defensive Scheduled active-Review/profile-boundary guard for Reset/Fresh serialization; the migration itself does not reset learner data.\n- `0025_learner_fsrs_admin_analytics_deletion.sql` — durable learner × historical-System monthly analytics, transactional retained-history maintenance, System-provenance extension, and durable staged account-deletion guards/state with bounded auth/application ownership phases.\n"
)
replace_once(
    path,
    "durable System provenance, legacy Review sentinel status, Preview ownership, and the migration ledger through `0024`.",
    "durable System provenance, PR G monthly analytics/deletion ownership, legacy Review sentinel status, Preview ownership, and the migration ledger through `0025`."
)
replace_once(
    path,
    "**Current implementation-status companion for the post-PR #137 learner runtime including merged PR #139 (PR F).**",
    "**Current implementation-status companion for the post-PR #137 learner runtime including merged PR #139 (PR F) and the PR G branch implementation.**"
)
replace_once(
    path,
    "Parts A–E, PR #137, and PR #139 (PR F) are merged into the current repository runtime. PR #139 implements its assigned Reset/Fresh/retention/learner-Progress subset. Use current code, migrations, `V1_DATA_MODEL.md`, and `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` for executable repository behavior; PR G Admin/cohort analytics, account deletion, and automatic optimizer execution remain separately owned.",
    "Parts A–E, PR #137, and PR #139 (PR F) are merged into the current repository runtime. PR #139 implements its assigned Reset/Fresh/retention/learner-Progress subset, and PR G implements the separately owned Admin/cohort analytics plus mature-account deletion tranche. Automatic optimizer execution/parameter replacement remains outside PR G. Use current code, migrations, `V1_DATA_MODEL.md`, `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`, and `LEARNER_FSRS_PR_G_EVIDENCE.md` for executable repository behavior/evidence."
)
text = read(path)
evidence_heading = "### `LEARNER_FSRS_PR_G_EVIDENCE.md`"
if evidence_heading not in text:
    needle = "### `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md`"
    if needle not in text:
        raise SystemExit('technical design heading missing from documentation index')
    text = text.replace(
        needle,
        "### `LEARNER_FSRS_PR_G_EVIDENCE.md`\n\n**Focused PR G implementation/validation evidence.** Records durable monthly analytics semantics, stable account-created-month cohorts, historical System provenance, the staged deletion scale-gate decision, bounded auth/application purges, workerd/D1 proof, and Production deployment exclusions.\n\n" + needle,
        1
    )
    write(path, text)

print('PR #141 review blocker fixups applied')
