/** @param {unknown} value */
export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * @param {{
 *   userId: string,
 *   accountId: string,
 *   name: string,
 *   email: string,
 *   passwordHash: string,
 *   now: number
 * }} values
 */
export function buildLocalAdminSql({ userId, accountId, name, email, passwordHash, now }) {
  return [
    'PRAGMA foreign_keys = ON;',
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`) VALUES (${sqlString(userId)}, ${sqlString(name)}, ${sqlString(email)}, 1, ${now}, ${now}, 'admin', 0);`,
    `INSERT INTO \`account\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`password\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(accountId)}, ${sqlString(userId)}, 'credential', ${sqlString(userId)}, ${sqlString(passwordHash)}, ${now}, ${now});`
  ].join('\n');
}

/** @param {unknown} role */
export function hasAdminRole(role) {
  return String(role ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes('admin');
}
