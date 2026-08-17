import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { hashPassword } from 'better-auth/crypto';

const wrangler = ['--yes', 'wrangler@4.123.0'];
const database = 'DB';
const tempDir = '.wrangler/bootstrap-preview-admin';
const seedFile = `${tempDir}/bootstrap-preview-admin.sql`;

/** @param {unknown} value */
export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** @param {unknown} role */
export function parseRoles(role) {
  return [...new Set(String(role ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean))];
}

/** @param {unknown} role @param {string} expected */
export function hasRole(role, expected) {
  return parseRoles(role).includes(expected);
}

/** @param {unknown} role */
export function addPreviewAdminRole(role) {
  const roles = parseRoles(role);
  if (!roles.includes('admin')) {
    throw new Error('Only an existing production admin account can be granted Preview Admin access.');
  }
  if (!roles.includes('preview_admin')) roles.push('preview_admin');
  return roles.join(',');
}

/** @param {{ userId: string, currentRole: string, nextRole: string, now: number }} values */
export function buildExistingAdminPromotionSql({ userId, currentRole, nextRole, now }) {
  return [
    'PRAGMA foreign_keys = ON;',
    `UPDATE \`user\` SET \`role\` = ${sqlString(nextRole)}, \`updatedAt\` = ${now} WHERE \`id\` = ${sqlString(userId)} AND coalesce(\`role\`, '') = ${sqlString(currentRole)};`
  ].join('\n');
}

/** @param {{ userId: string, accountId: string, name: string, email: string, passwordHash: string, now: number }} values */
export function buildPreviewBootstrapSql({ userId, accountId, name, email, passwordHash, now }) {
  return [
    'PRAGMA foreign_keys = ON;',
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`) VALUES (${sqlString(userId)}, ${sqlString(name)}, ${sqlString(email)}, 1, ${now}, ${now}, 'preview_admin', 0);`,
    `INSERT INTO \`account\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`password\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(accountId)}, ${sqlString(userId)}, 'credential', ${sqlString(userId)}, ${sqlString(passwordHash)}, ${now}, ${now});`
  ].join('\n');
}

/** @param {string} jsonText */
export function extractRows(jsonText) {
  const parsed = JSON.parse(jsonText);
  const batches = /** @type {any[]} */ (Array.isArray(parsed) ? parsed : [parsed]);
  return batches.flatMap((batch) => (Array.isArray(batch?.results) ? batch.results : []));
}

/** @param {string[]} args @param {{ capture?: boolean }} [options] */
function runWrangler(args, { capture = false } = {}) {
  if (capture) {
    return execFileSync('npx', [...wrangler, ...args], {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit']
    });
  }
  execFileSync('npx', [...wrangler, ...args], { stdio: 'inherit' });
  return '';
}

/** @param {string} sql */
function queryRemote(sql) {
  return extractRows(runWrangler(['d1', 'execute', database, '--remote', '--command', sql, '--json'], { capture: true }));
}

/** @param {string} sql */
function writeRemote(sql) {
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(seedFile, sql, { mode: 0o600 });
    runWrangler(['d1', 'execute', database, '--remote', '--file', seedFile, '--yes']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/** @param {string} userId */
function loadCredentialAccounts(userId) {
  return queryRemote(
    `SELECT \`id\`, \`providerId\` FROM \`account\` WHERE \`userId\` = ${sqlString(userId)} AND \`providerId\` = 'credential' LIMIT 2;`
  );
}

/** @param {string} userId */
function verifyPreviewIdentity(userId) {
  return queryRemote(
    `SELECT u.\`email\`, u.\`role\`, u.\`banned\`, a.\`providerId\` FROM \`user\` u JOIN \`account\` a ON a.\`userId\` = u.\`id\` WHERE u.\`id\` = ${sqlString(userId)} AND a.\`providerId\` = 'credential';`
  );
}

/** @param {string} label */
function readHidden(label) {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('A terminal (TTY) is required so the password can be entered without echoing it.');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = Boolean(stdin.isRaw);
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    };
    /** @param {string} chunk */
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= ' ') value += char;
      }
    };
    stdout.write(label);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  console.log('Flash-Cards Preview Admin bootstrap');
  console.log('This command grants Preview Admin access in the existing production D1 auth tables.');
  console.log('If the email already belongs to a production admin, the same account/password is reused.');
  console.log('It does not deploy a Worker or change any teaching content.');

  const prompts = createInterface({ input: stdin, output: stdout });
  let email = '';
  let name = '';
  /** @type {{ id: string, email: string, role?: unknown, banned?: unknown } | null} */
  let existingUser = null;
  /** @type {Array<{ id: string, email?: string, role?: unknown }>} */
  let existingPreviewAdmins = [];
  try {
    email = (await prompts.question('Preview Admin email: ')).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid Preview Admin email address.');

    existingPreviewAdmins = queryRemote(
      "SELECT `id`, `email`, `role` FROM `user` WHERE instr(',' || replace(coalesce(`role`, ''), ' ', '') || ',', ',preview_admin,') > 0 LIMIT 5;"
    );
    const existingUsers = queryRemote(
      `SELECT \`id\`, \`email\`, \`role\`, \`banned\` FROM \`user\` WHERE lower(\`email\`) = lower(${sqlString(email)}) LIMIT 2;`
    );
    if (existingUsers.length > 1) throw new Error(`Multiple users unexpectedly share ${email}. Inspect D1 before retrying.`);
    existingUser = existingUsers[0] ?? null;

    if (existingUser) {
      if (Number(existingUser.banned ?? 0) !== 0) {
        throw new Error(`The existing account ${email} is banned. No changes were made.`);
      }
      if (!hasRole(existingUser.role, 'admin')) {
        throw new Error(`The existing account ${email} is not a production admin. Refusing to grant Preview Admin access.`);
      }

      const otherPreviewAdmins = existingPreviewAdmins.filter((row) => row.id !== existingUser.id);
      if (otherPreviewAdmins.length > 0) {
        const emails = otherPreviewAdmins.map((row) => row.email).filter(Boolean).join(', ');
        throw new Error(`Refusing to grant a second Preview Admin because one already exists${emails ? `: ${emails}` : '.'}`);
      }

      const credentials = loadCredentialAccounts(existingUser.id);
      if (credentials.length !== 1) {
        throw new Error(`The existing production admin ${email} does not have exactly one credential account. No changes were made.`);
      }

      if (hasRole(existingUser.role, 'preview_admin')) {
        console.log(`${email} already has both production Admin and Preview Admin access. No changes were needed.`);
        return;
      }

      const confirmation = (await prompts.question(
        `Type ADD PREVIEW to grant Preview Admin access to ${email} while keeping the existing password: `
      )).trim();
      if (confirmation !== 'ADD PREVIEW') {
        console.log('Cancelled; D1 was not changed.');
        return;
      }
    } else {
      if (existingPreviewAdmins.length > 0) {
        const emails = existingPreviewAdmins.map((row) => row.email).filter(Boolean).join(', ');
        throw new Error(`Refusing to bootstrap because a Preview Admin already exists${emails ? `: ${emails}` : '.'}`);
      }

      name = (await prompts.question('Preview Admin name: ')).trim();
      if (!name) throw new Error('Preview Admin name is required.');
      const confirmation = (await prompts.question(`Type CREATE PREVIEW to create ${email}: `)).trim();
      if (confirmation !== 'CREATE PREVIEW') {
        console.log('Cancelled; D1 was not changed.');
        return;
      }
    }
  } finally {
    prompts.close();
  }

  if (existingUser) {
    const currentRole = String(existingUser.role ?? '');
    const nextRole = addPreviewAdminRole(currentRole);
    const now = Date.now();
    writeRemote(buildExistingAdminPromotionSql({
      userId: existingUser.id,
      currentRole,
      nextRole,
      now
    }));

    const verified = verifyPreviewIdentity(existingUser.id);
    if (
      verified.length !== 1 ||
      String(verified[0].email).toLowerCase() !== email ||
      verified[0].providerId !== 'credential' ||
      Number(verified[0].banned ?? 0) !== 0 ||
      !hasRole(verified[0].role, 'admin') ||
      !hasRole(verified[0].role, 'preview_admin')
    ) {
      throw new Error('The D1 role update completed, but existing Admin/Preview Admin verification failed. Inspect D1 before retrying.');
    }

    console.log(`Existing production Admin updated and verified for ${email}.`);
    console.log('The existing password was not changed. Use the same email/password on the Preview Worker.');
    return;
  }

  const password = await readHidden('Password (minimum 12 characters; hidden): ');
  if (password.length < 12) throw new Error('Password must be at least 12 characters. No changes were made.');
  const confirmationPassword = await readHidden('Confirm password (hidden): ');
  if (password !== confirmationPassword) throw new Error('Passwords do not match. No changes were made.');

  const userId = randomUUID();
  const accountId = randomUUID();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  writeRemote(buildPreviewBootstrapSql({ userId, accountId, name, email, passwordHash, now }));

  const verified = verifyPreviewIdentity(userId);
  if (
    verified.length !== 1 ||
    String(verified[0].email).toLowerCase() !== email ||
    verified[0].providerId !== 'credential' ||
    Number(verified[0].banned ?? 0) !== 0 ||
    !hasRole(verified[0].role, 'preview_admin')
  ) {
    throw new Error('The D1 write completed, but Preview Admin verification failed. Inspect D1 before retrying.');
  }

  console.log(`Preview Admin created and verified for ${email}.`);
  console.log('Use this dedicated identity only on the Preview Worker.');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`\nBootstrap failed: ${detail}`);
    process.exitCode = 1;
  });
}
