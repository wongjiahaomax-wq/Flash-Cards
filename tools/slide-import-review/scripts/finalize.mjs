import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadReviewBundle, finalizeBundle } from '../src/core.js';
import { parseImportPackage } from '../../../src/lib/server/import/content-package.js';

const input = process.argv[2];
const output = process.argv[3] ?? 'flashcards-import-v1.zip';
if (!input) {
  console.error('Usage: npm run slide-review:finalize -- <reviewed.zip> [output.zip]');
  process.exit(2);
}

try {
  const bytes = new Uint8Array(await readFile(resolve(input)));
  const bundle = await loadReviewBundle(bytes);
  const finalized = await finalizeBundle(bundle);
  // Mandatory production compatibility boundary: use the real parser, not a parallel approximation.
  await parseImportPackage(finalized.zip);
  await writeFile(resolve(output), finalized.zip);
  console.log(`Wrote ${resolve(output)} (${finalized.zip.byteLength} bytes).`);
} catch (error) {
  const issues = error?.issues ?? [error?.message ?? String(error)];
  console.error('Finalization failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
