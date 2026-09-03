import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const LEGACY_REVIEW_ZERO_GATE_SQL = `
SELECT
  (SELECT count(*) FROM reviews) AS reviews_count,
  (SELECT count(*) FROM review_questions) AS review_questions_count,
  (SELECT count(*) FROM review_assets) AS review_assets_count;
`.trim();

/** @param {unknown} value */
function count(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Legacy Review gate received an invalid row count.');
  return parsed;
}

/** @param {string} jsonText */
export function assertZeroLegacyReviewRows(jsonText) {
  const parsed = JSON.parse(jsonText);
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  const row = batches.flatMap((batch) => Array.isArray(batch?.results) ? batch.results : [])[0];
  if (!row) throw new Error('Legacy Review gate did not receive a D1 result row.');
  const counts = {
    reviews: count(row.reviews_count),
    reviewQuestions: count(row.review_questions_count),
    reviewAssets: count(row.review_assets_count)
  };
  if (counts.reviews || counts.reviewQuestions || counts.reviewAssets) {
    throw new Error(
      `FSRS cutover blocked: Production legacy Review data is not empty `
      + `(reviews=${counts.reviews}, review_questions=${counts.reviewQuestions}, review_assets=${counts.reviewAssets}). `
      + 'Do not delete or bypass unexpected learner history; investigate before cutover.'
    );
  }
  return counts;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node scripts/learner-fsrs-legacy-review-gate.mjs <wrangler-json-file>');
  const counts = assertZeroLegacyReviewRows(await readFile(path, 'utf8'));
  console.log(`Legacy Review cutover gate passed: ${JSON.stringify(counts)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
