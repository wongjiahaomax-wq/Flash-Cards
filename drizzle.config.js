import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/lib/server/db/schema.js', './src/lib/server/db/import-job-schema.js'],
  out: './drizzle',
  dialect: 'sqlite',
  verbose: true,
  strict: true
});
