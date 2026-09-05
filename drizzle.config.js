import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/lib/server/db/schema.js',
    './src/lib/server/db/fsrs-schema.js',
    './src/lib/server/db/fsrs-analytics-schema.js',
    './src/lib/server/db/study-data-deletion-schema.js',
    './src/lib/server/db/active-review-schema.js',
    './src/lib/server/db/free-study-schema.js',
    './src/lib/server/db/import-job-schema.js',
    './src/lib/server/db/tag-schema.js'
  ],
  out: './drizzle',
  dialect: 'sqlite',
  verbose: true,
  strict: true
});
