import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { hashPassword } from 'better-auth/crypto';

const wrangler = ['--yes', 'wrangler@4.123.0'];
const database = 'DB';
const tempDir = '.wrangler/bootstrap-admin';
const seedFile = `${tempDir}/bootstrap-admin.sql`;

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildBootstrapSql({ userId, accountId, name, email, passwordHash, now }) {
  return [
    'PRAGMA foreign_keys = ON;',
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`) VALUES (${sqlString(userId)}, ${sqlString(name)}, ${sqlString(email)}, 1, ${now}, ${now}, 'admin', 0);`,
    `INSERT INTO \`account\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`password\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(accountId)}, ${sqlString(userId)}, 'credential', ${sqlString(userId)}, ${sqlString(passwordHash)}, ${now}, ${now});`
  ].join('\n');
}

export function extractRows(jsonText) {
  const parsed = JSON.parse(jsonText);
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  return batches.flatMap((batch) => (Array.isArray(batch?.results) ? batch.results : []));
}

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

function queryRemote(sql) {
  return extractRows(
    runWrangler(
      ['d1', 'execute', database, '--remote', '--command', sql, '--json'],
      { capture: true }
    )
  );
}

function hasAdminRole(role) {
  return String(role ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes('admin');
}

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

        if (char >= ' ') {
          value += char;
        }
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
  console.log('Flash-Cards production administrator bootstrap');
  console.log('This command writes one administrator account to the remote Cloudflare D1 database.');

  const existingAdmins = queryRemote(
    "SELECT `email`, `role` FROM `user` WHERE instr(',' || replace(coalesce(`role`, ''), ' ', '') || ',', ',admin,') > 0 LIMIT 5;"
  );

  if (existingAdmins.length > 0) {
    const emails = existingAdmins.map((row) => row.email).filter(Boolean).join(', ');
    throw new Error(
      `Refusing to bootstrap because an administrator already exists${emails ? `: ${emails}` : '.'}`
    );
  }

  const prompts = createInterface({ input: stdin, output: stdout });
  let name;
  let email;

  try {
    name = (await prompts.question('Administrator name: ')).trim();
    email = (await prompts.question('Administrator email: ')).trim().toLowerCase();
    const confirmation = (await prompts.question(`Type CREATE to create ${email || 'this account'} in production: `)).trim();

    if (confirmation !== 'CREATE') {
      console.log('Cancelled; production D1 was not changed.');
      return;
    }
  } finally {
    prompts.close();
  }

  if (!name) throw new Error('Administrator name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid administrator email address.');
  }

  const existingUser = queryRemote(
    `SELECT \`id\`, \`email\`, \`role\` FROM \`user\` WHERE lower(\`email\`) = lower(${sqlString(email)}) LIMIT 1;`
  );
  if (existingUser.length > 0) {
    throw new Error(`A user with ${email} already exists. No changes were made.`);
  }

  const password = await readHidden('Password (minimum 12 characters; hidden): ');
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters. No changes were made.');
  }

  const confirmationPassword = await readHidden('Confirm password (hidden): ');
  if (password !== confirmationPassword) {
    throw new Error('Passwords do not match. No changes were made.');
  }

  const userId = randomUUID();
  const accountId = randomUUID();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true, mode: 0o700 });

  try {
    writeFileSync(
      seedFile,
      buildBootstrapSql({ userId, accountId, name, email, passwordHash, now }),
      { mode: 0o600 }
    );

    runWrangler(['d1', 'execute', database, '--remote', '--file', seedFile, '--yes']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const verified = queryRemote(
    `SELECT u.\`email\`, u.\`role\`, a.\`providerId\` FROM \`user\` u JOIN \`account\` a ON a.\`userId\` = u.\`id\` WHERE u.\`id\` = ${sqlString(userId)} AND a.\`providerId\` = 'credential';`
  );

  if (
    verified.length !== 1 ||
    verified[0].email !== email ||
    verified[0].providerId !== 'credential' ||
    !hasAdminRole(verified[0].role)
  ) {
    throw new Error('The D1 write completed, but administrator verification failed. Inspect production D1 before retrying.');
  }

  console.log(`Production administrator created and verified for ${email}.`);
  console.log('You can now sign in through the deployed /sign-in page.');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`\nBootstrap failed: ${error.message}`);
    process.exitCode = 1;
  });
}
