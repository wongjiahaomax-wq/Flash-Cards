import { getAdminDashboardSummary } from '$lib/server/db/admin-dashboard.js';
import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { serverTimingValue, withServerReadTiming } from '$lib/server/performance-timing.js';

export { actions } from './_actions.server.js';

export async function load({ locals, platform, setHeaders }) {
  const empty = {
    caseCount: 0,
    questionCount: 0,
    assetCount: 0,
    topicCount: 0,
    dashboardCases: []
  };
  if (!canManageCaseAssets(locals.user)) return empty;

  const db = platform?.env?.DB ? createDb(platform.env.DB) : null;
  if (!db) return empty;

  let timing = null;
  const summary = await withServerReadTiming(
    'admin-dashboard-read',
    () => getAdminDashboardSummary(db),
    (value) => {
      timing = value;
    }
  );
  if (timing) {
    setHeaders({ 'server-timing': serverTimingValue(timing.operation, timing.durationMs) });
  }
  return summary;
}
