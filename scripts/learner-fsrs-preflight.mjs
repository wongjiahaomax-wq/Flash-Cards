import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LEGACY_REVIEW_PREFLIGHT_SQL = `
SELECT
  (SELECT COUNT(*) FROM reviews) AS reviews_count,
  (SELECT COUNT(*) FROM review_questions rq INNER JOIN reviews r ON r.id = rq.review_id) AS review_questions_count,
  (SELECT COUNT(*) FROM review_assets ra INNER JOIN reviews r ON r.id = ra.review_id) AS review_assets_count;
`.trim();

/** @param {unknown} payload */
export function extractLegacyReviewCounts(payload) {
  /** @param {unknown} value @returns {Record<string, unknown>|null} */
  const findRow = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findRow(item);
        if (found) return found;
      }
      return null;
    }
    if (!value || typeof value !== 'object') return null;
    const record = /** @type {Record<string, unknown>} */ (value);
    if (
      'reviews_count' in record &&
      'review_questions_count' in record &&
      'review_assets_count' in record
    ) {
      return record;
    }
    for (const child of Object.values(record)) {
      const found = findRow(child);
      if (found) return found;
    }
    return null;
  };

  const row = findRow(payload);
  if (!row) {
    throw new Error('Could not locate legacy Review counts in Wrangler JSON output.');
  }

  return {
    reviews: Number(row.reviews_count),
    reviewQuestions: Number(row.review_questions_count),
    reviewAssets: Number(row.review_assets_count)
  };
}

/** @param {{reviews:number, reviewQuestions:number, reviewAssets:number}} counts */
export function assertZeroLegacyReviewData(counts) {
  const invalid = Object.entries(counts).filter(([, count]) => !Number.isSafeInteger(count) || count < 0);
  if (invalid.length) {
    throw new Error(`Invalid legacy Review preflight count(s): ${invalid.map(([key]) => key).join(', ')}`);
  }

  if (counts.reviews || counts.reviewQuestions || counts.reviewAssets) {
    throw new Error(
      `FSRS clean-cutover preflight failed: reviews=${counts.reviews}, review_questions=${counts.reviewQuestions}, review_assets=${counts.reviewAssets}. No destructive cutover is allowed.`
    );
  }
  return counts;
}

/** @param {{remote?:boolean}} [options] */
export function runLegacyReviewPreflight(options = {}) {
  const wrangler = join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'
  );
  const args = [
    'd1',
    'execute',
    'DB',
    options.remote ? '--remote' : '--local',
    '--command',
    LEGACY_REVIEW_PREFLIGHT_SQL,
    '--json'
  ];
  const result = spawnSync(wrangler, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Wrangler exited with ${result.status}.`);
  }
  const counts = extractLegacyReviewCounts(JSON.parse(result.stdout));
  return assertZeroLegacyReviewData(counts);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const remote = process.argv.includes('--remote');
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--remote' && arg !== '--local');
  if (unknown.length) {
    console.error(`Unknown argument(s): ${unknown.join(', ')}`);
    process.exitCode = 2;
  } else {
    try {
      const counts = runLegacyReviewPreflight({ remote });
      console.log(
        JSON.stringify(
          {
            ok: true,
            target: remote ? 'remote' : 'local',
            note: 'Read-only legacy Review preflight only; this command performs no mutation.',
            counts
          },
          null,
          2
        )
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}