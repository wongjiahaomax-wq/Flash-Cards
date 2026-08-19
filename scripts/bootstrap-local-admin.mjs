import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from 'better-auth/crypto';

import { buildLocalAdminSql, hasAdminRole, sqlString } from './bootstrap-local-admin-lib.mjs';
import { extractD1Rows } from './local-replica-lib.mjs';

/** @typedef {string | number | boolean | null} D1Value */
/** @typedef {Record<string, D1Value>} D1Row */

const tempDir = '.wrangler/local-admin';
const seedFile = `${tempDir}/bootstrap-local-admin.sql`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** @param {string[]} args @param {{ capture?: boolean }} [options] */
function runWrangler(args, { capture = false } = {}) {
  if (args.includes('--remote')) throw new Error('Local administrator bootstrap refuses all --remote Wrangler operations.');
  if (capture) {
    return execFileSync(npx, ['wrangler', ...args], {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit']
    });
  }
  execFileSync(npx, ['wrangler', ...args], { stdio: 'inherit' });
  return '';
}

/** @param {string} sql @returns {D1Row[]} */
function queryLocal(sql) {
  return extractD1Rows(
    runWrangler(['d1', 'execute', 'DB', '--local', '--command', sql, '--json'], { capture: true })
  );
}

/** @param {string} label @returns {Promise<string>} */
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
  console.log('Flash-Cards LOCAL administrator bootstrap');
  console.log('This command writes only to the local Wrangler D1 simulation. Production is not accessed.');

  execFileSync(npm, ['run', 'db:migrate:local'], { stdio: 'inherit' });

  const prompts = createInterface({ input: stdin, output: stdout });
  let name = '';
  let email = '';
  try {
    name = (await prompts.question('Local administrator name: ')).trim();
    email = (await prompts.question('Local administrator email: ')).trim().toLowerCase();
  } finally {
    prompts.close();
  }

  if (!name) throw new Error('Administrator name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid administrator email address.');

  const existing = queryLocal(
    `SELECT u.\`id\`, u.\`email\`, u.\`role\`, a.\`providerId\` FROM \`user\` u LEFT JOIN \`account\` a ON a.\`userId\` = u.\`id\` AND a.\`providerId\` = 'credential' WHERE lower(u.\`email\`) = lower(${sqlString(email)}) LIMIT 1;`
  );
  if (existing.length > 0) {
    if (existing[0].providerId === 'credential' && hasAdminRole(existing[0].role)) {
      console.log(`Local administrator ${email} already exists; no changes made.`);
      return;
    }
    throw new Error(`A local user with ${email} already exists but is not a complete administrator credential account.`);
  }

  const password = await readHidden('Password (minimum 12 characters; hidden): ');
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  const confirmation = await readHidden('Confirm password (hidden): ');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const userId = randomUUID();
  const accountId = randomUUID();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(seedFile, buildLocalAdminSql({ userId, accountId, name, email, passwordHash, now }), {
      mode: 0o600
    });
    runWrangler(['d1', 'execute', 'DB', '--local', '--file', seedFile, '--yes']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const verified = queryLocal(
    `SELECT u.\`email\`, u.\`role\`, a.\`providerId\` FROM \`user\` u JOIN \`account\` a ON a.\`userId\` = u.\`id\` WHERE u.\`id\` = ${sqlString(userId)} AND a.\`providerId\` = 'credential';`
  );
  if (verified.length !== 1 || verified[0].email !== email || verified[0].providerId !== 'credential' || !hasAdminRole(verified[0].role)) {
    throw new Error('Local D1 write completed, but administrator verification failed.');
  }

  console.log(`Local administrator created and verified for ${email}.`);
  console.log('Start the app with npm run dev and sign in at /sign-in.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nLocal administrator bootstrap failed: ${message}`);
  process.exitCode = 1;
});
