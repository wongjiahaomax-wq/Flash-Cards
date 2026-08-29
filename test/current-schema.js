import { readdirSync, readFileSync } from 'node:fs';

const drizzleDirectory = new URL('../drizzle/', import.meta.url);
const migrationFiles = readdirSync(drizzleDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

for (const [index, name] of migrationFiles.entries()) {
  const expectedPrefix = String(index).padStart(4, '0');
  if (!name.startsWith(`${expectedPrefix}_`)) {
    throw new Error(`Current-schema test bootstrap expected migration ${expectedPrefix}, found ${name}.`);
  }
}

const currentSchemaMigrationSql = migrationFiles
  .map((name) => readFileSync(new URL(name, drizzleDirectory), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

/**
 * Apply every repository migration in order so ordinary application tests run
 * against the same schema contract as the current application.
 *
 * Historical-schema fixtures belong only in explicit migration/upgrade tests.
 *
 * @param {import('node:sqlite').DatabaseSync} sqlite
 */
export function applyCurrentSchema(sqlite) {
  sqlite.exec(currentSchemaMigrationSql);
}
