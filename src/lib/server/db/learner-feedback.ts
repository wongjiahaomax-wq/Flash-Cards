const FEEDBACK_STATUSES = ['open', 'resolved', 'dismissed'];
const DATABASE_NOW_SQL = "cast((julianday('now') - 2440587.5) * 86400000 as integer)";
const FEEDBACK_COLUMNS = [
  'f.id',
  'f.case_id',
  'f.user_id',
  'f.reporter_label_snapshot',
  'f.case_title_snapshot',
  'f.body',
  'f.status',
  'f.reported_at',
  'f.reviewed_at',
  'f.reviewed_by',
  'c.id AS current_case_id',
  'c.title AS current_case_title',
  'c.is_active AS current_case_is_active'
].join(', ');

export class LearnerFeedbackInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LearnerFeedbackInputError';
  }
}

export class LearnerFeedbackActionError extends Error {
  constructor(message, code = 'conflict') {
    super(message);
    this.name = 'LearnerFeedbackActionError';
    this.code = code;
  }
}

function requireD1Client(db) {
  const client = db?.$client;
  if (!client || typeof client.prepare !== 'function' || typeof client.batch !== 'function') {
    throw new Error('Learner feedback requires a Cloudflare D1 client with batch support.');
  }
  return client;
}

function required(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new LearnerFeedbackInputError(label + ' is required.');
  return normalized;
}

function feedbackBody(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LearnerFeedbackInputError('Tell us what seems incorrect or unclear.');
  }
  return value.trim();
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

function mapRow(row) {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    userId: String(row.user_id),
    reporterLabel: String(row.reporter_label_snapshot ?? ''),
    caseTitleSnapshot: String(row.case_title_snapshot ?? ''),
    body: String(row.body ?? ''),
    status: String(row.status),
    reportedAt: Number(row.reported_at),
    reviewedAt: row.reviewed_at == null ? null : Number(row.reviewed_at),
    reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
    currentCaseId: row.current_case_id == null ? null : String(row.current_case_id),
    currentCaseTitle: row.current_case_title == null ? null : String(row.current_case_title),
    caseIsActive: Boolean(Number(row.current_case_is_active ?? 0))
  };
}

async function readRow(client, id) {
  const row = await client.prepare(
    'SELECT ' + FEEDBACK_COLUMNS + ' FROM learner_feedback f LEFT JOIN cases c ON c.id = f.case_id WHERE f.id = ? LIMIT 1'
  ).bind(id).first();
  return row ? mapRow(row) : null;
}

function labelExpression() {
  return [
    "COALESCE(NULLIF(trim(u.name), ''), '')",
    "CASE WHEN trim(COALESCE(u.name, '')) <> '' AND trim(COALESCE(u.email, '')) <> '' THEN ' · ' ELSE '' END",
    "COALESCE(NULLIF(trim(CASE WHEN lower(COALESCE(u.email, '')) LIKE '%@beta.invalid' THEN substr(u.email, 1, length(u.email) - length('@beta.invalid')) ELSE u.email END), ''), ar.user_id)"
  ].join(' || ');
}

export async function createLearnerFeedback({ db, userId, reviewId, body }) {
  const client = requireD1Client(db);
  const normalizedUserId = required(userId, 'Learner');
  const normalizedReviewId = required(reviewId, 'Review');
  const normalizedBody = feedbackBody(body);
  const feedbackId = crypto.randomUUID();
  const result = await client.prepare(
    'INSERT INTO learner_feedback ' +
    '(id, case_id, user_id, reporter_label_snapshot, case_title_snapshot, body, status, reported_at) ' +
    'SELECT ?, ar.case_id, ar.user_id, ' + labelExpression() + ', ar.case_title_snapshot, ?, \'open\', ' + DATABASE_NOW_SQL + ' ' +
    'FROM active_reviews ar JOIN user u ON u.id = ar.user_id ' +
    'WHERE ar.id = ? AND ar.user_id = ? AND ar.expires_at > ' + DATABASE_NOW_SQL + ' ' +
    'AND NOT EXISTS (SELECT 1 FROM learner_account_deletions d WHERE d.user_id = ar.user_id) ' +
    'AND NOT EXISTS (SELECT 1 FROM learner_study_data_deletions d WHERE d.user_id = ar.user_id AND d.phase <> \'complete\')'
  ).bind(feedbackId, normalizedBody, normalizedReviewId, normalizedUserId).run();
  if (changes(result) !== 1) return null;
  return readRow(client, feedbackId);
}

export async function listCaseFeedback(db, caseId) {
  const client = requireD1Client(db);
  const normalizedCaseId = required(caseId, 'Case');
  const result = await client.prepare(
    'SELECT ' + FEEDBACK_COLUMNS + ' FROM learner_feedback f LEFT JOIN cases c ON c.id = f.case_id ' +
    'WHERE f.case_id = ? ORDER BY f.reported_at DESC, f.id DESC'
  ).bind(normalizedCaseId).all();
  return result.results.map(mapRow);
}

function compareRows(left, right, sort) {
  const timeDelta = Number(left.reported_at) - Number(right.reported_at);
  if (timeDelta !== 0) return sort === 'oldest' ? timeDelta : -timeDelta;
  const idDelta = String(left.id).localeCompare(String(right.id));
  return sort === 'oldest' ? idDelta : -idDelta;
}

export async function listFeedbackQueue(db, filters = {}) {
  const client = requireD1Client(db);
  const status = ['open', 'resolved', 'dismissed', 'all'].includes(filters.status) ? filters.status : 'open';
  const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 160) : '';
  const sort = filters.sort === 'oldest' ? 'oldest' : 'newest';
  const where = [];
  const bindings = [];
  if (status !== 'all') {
    where.push('f.status = ?');
    bindings.push(status);
  }
  if (search) {
    where.push('(lower(COALESCE(c.title, f.case_title_snapshot)) LIKE lower(?) OR lower(f.body) LIKE lower(?))');
    const pattern = '%' + search + '%';
    bindings.push(pattern, pattern);
  }
  const result = await client.prepare(
    'SELECT ' + FEEDBACK_COLUMNS + ' FROM learner_feedback f LEFT JOIN cases c ON c.id = f.case_id ' +
    (where.length ? 'WHERE ' + where.join(' AND ') + ' ' : '') +
    'ORDER BY f.reported_at ' + (sort === 'oldest' ? 'ASC' : 'DESC') + ', f.id ' + (sort === 'oldest' ? 'ASC' : 'DESC')
  ).bind(...bindings).all();

  const rows = [...result.results].sort((left, right) => compareRows(left, right, sort));
  const groupsByCase = new Map();
  for (const row of rows) {
    const report = mapRow(row);
    let group = groupsByCase.get(report.caseId);
    if (!group) {
      group = {
        caseId: report.caseId,
        caseTitle: report.currentCaseTitle || report.caseTitleSnapshot || report.caseId,
        caseTitleSnapshot: report.caseTitleSnapshot,
        caseExists: Boolean(report.currentCaseId),
        caseIsActive: report.caseIsActive,
        reports: []
      };
      groupsByCase.set(report.caseId, group);
    }
    group.reports.push(report);
  }
  const groups = [...groupsByCase.values()];
  groups.sort((left, right) => {
    const leftReport = left.reports[0];
    const rightReport = right.reports[0];
    const timeDelta = Number(leftReport.reportedAt) - Number(rightReport.reportedAt);
    if (timeDelta !== 0) return sort === 'oldest' ? timeDelta : -timeDelta;
    return sort === 'oldest'
      ? left.caseId.localeCompare(right.caseId)
      : right.caseId.localeCompare(left.caseId);
  });
  return { groups, reportCount: groups.reduce((total, group) => total + group.reports.length, 0) };
}

function ensureId(id) {
  return required(id, 'Feedback');
}

export async function resolveFeedback(db, { id, adminId }) {
  const client = requireD1Client(db);
  const feedbackId = ensureId(id);
  const reviewer = required(adminId, 'Reviewing Admin');
  const result = await client.prepare(
    'UPDATE learner_feedback SET status = \'resolved\', reviewed_at = ' + DATABASE_NOW_SQL + ', reviewed_by = ? ' +
    'WHERE id = ? AND status = \'open\''
  ).bind(reviewer, feedbackId).run();
  return changes(result) === 1 ? readRow(client, feedbackId) : null;
}

export async function dismissFeedback(db, { id, adminId }) {
  const client = requireD1Client(db);
  const feedbackId = ensureId(id);
  const reviewer = required(adminId, 'Reviewing Admin');
  const result = await client.prepare(
    'UPDATE learner_feedback SET status = \'dismissed\', reviewed_at = ' + DATABASE_NOW_SQL + ', reviewed_by = ? ' +
    'WHERE id = ? AND status = \'open\''
  ).bind(reviewer, feedbackId).run();
  return changes(result) === 1 ? readRow(client, feedbackId) : null;
}

export async function reopenFeedback(db, { id, adminId }) {
  const client = requireD1Client(db);
  const feedbackId = ensureId(id);
  const reviewer = required(adminId, 'Reviewing Admin');
  const result = await client.prepare(
    'UPDATE learner_feedback SET status = \'open\', reviewed_at = NULL, reviewed_by = NULL ' +
    'WHERE id = ? AND status IN (\'resolved\', \'dismissed\')'
  ).bind(feedbackId).run();
  if (changes(result) !== 1) return null;
  return readRow(client, feedbackId);
}

export async function deleteFeedback(db, id) {
  const client = requireD1Client(db);
  const feedbackId = ensureId(id);
  const result = await client.prepare('DELETE FROM learner_feedback WHERE id = ?').bind(feedbackId).run();
  return changes(result) === 1;
}

export async function bulkDeleteFeedback(db, ids) {
  const client = requireD1Client(db);
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map((id) => typeof id === 'string' ? id.trim() : '').filter(Boolean))];
  if (uniqueIds.length === 0) throw new LearnerFeedbackInputError('Select at least one feedback report.');
  if (uniqueIds.length > 100) throw new LearnerFeedbackInputError('Select no more than 100 feedback reports at once.');
  const result = await client.batch(uniqueIds.map((id) => client.prepare('DELETE FROM learner_feedback WHERE id = ?').bind(id)));
  return result.reduce((total, item) => total + changes(item), 0);
}
