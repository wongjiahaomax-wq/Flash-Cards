import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const importJobs = sqliteTable(
  'import_jobs',
  {
    id: text('id').primaryKey(),
    packageId: text('package_id').notNull(),
    packageSha256: text('package_sha256').notNull(),
    packageStorageKey: text('package_storage_key').notNull(),
    status: text('status').notNull().default('validating'),
    phase: text('phase').notNull(),
    cursor: integer('cursor').notNull().default(0),
    processedCount: integer('processed_count').notNull().default(0),
    totalCount: integer('total_count').notNull().default(0),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    leaseToken: text('lease_token'),
    leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp_ms' })
  },
  (table) => [
    uniqueIndex('import_jobs_storage_key_unique').on(table.packageStorageKey),
    index('import_jobs_status_updated_idx').on(table.status, table.updatedAt),
    index('import_jobs_created_at_idx').on(table.createdAt),
    check('import_jobs_status_check', sql`${table.status} in ('validating', 'ready', 'importing', 'complete', 'failed', 'cancelled')`),
    check('import_jobs_cursor_check', sql`${table.cursor} >= 0`),
    check('import_jobs_processed_count_check', sql`${table.processedCount} >= 0`),
    check('import_jobs_total_count_check', sql`${table.totalCount} >= 0`),
    check('import_jobs_progress_check', sql`${table.processedCount} <= ${table.totalCount}`)
  ]
);
