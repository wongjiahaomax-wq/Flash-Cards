// @ts-nocheck
const STATUS_VALUES = new Set(['open', 'resolved', 'dismissed', 'all']);
const SORT_VALUES = new Set(['newest', 'oldest']);
const MAX_SEARCH_LENGTH = 160;
const MAX_PAGE = 1000;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function paramsFrom(value) {
  if (value instanceof URLSearchParams) return value;
  if (value && typeof value === 'object') {
    return new URLSearchParams({
      status: String(value.status ?? ''),
      q: String(value.search ?? value.q ?? ''),
      sort: String(value.sort ?? ''),
      page: String(value.page ?? '')
    });
  }
  return new URLSearchParams(typeof value === 'string' ? value : '');
}

export function normalizeFeedbackStatus(value) {
  const status = text(value).toLowerCase();
  return STATUS_VALUES.has(status) ? status : 'open';
}

export function normalizeFeedbackSort(value) {
  const sort = text(value).toLowerCase();
  return SORT_VALUES.has(sort) ? sort : 'newest';
}

export function normalizeFeedbackSearch(value) {
  return text(value).slice(0, MAX_SEARCH_LENGTH);
}

export function normalizeFeedbackPage(value) {
  const page = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(page) && page > 0 && page <= MAX_PAGE ? page : 1;
}

export function feedbackQueryString(value = {}) {
  const params = paramsFrom(value);
  const status = normalizeFeedbackStatus(params.get('status'));
  const search = normalizeFeedbackSearch(params.get('q') ?? params.get('search'));
  const sort = normalizeFeedbackSort(params.get('sort'));
  const page = normalizeFeedbackPage(params.get('page'));
  const result = new URLSearchParams();
  result.set('status', status);
  if (search) result.set('q', search);
  result.set('sort', sort);
  if (page > 1) result.set('page', String(page));
  return result.toString();
}

export function parseFeedbackQueueQuery(value) {
  const params = paramsFrom(value);
  const status = normalizeFeedbackStatus(params.get('status'));
  const search = normalizeFeedbackSearch(params.get('q') ?? params.get('search'));
  const sort = normalizeFeedbackSort(params.get('sort'));
  const page = normalizeFeedbackPage(params.get('page'));
  return { status, search, sort, page, query: feedbackQueryString({ status, search, sort, page }) };
}

export function normalizeFeedbackReturnQuery(value) {
  return feedbackQueryString(value);
}

export function feedbackQueueHref(value = {}) {
  const query = typeof value === 'string' ? normalizeFeedbackReturnQuery(value) : feedbackQueryString(value);
  return query ? '/admin/feedback?' + query : '/admin/feedback';
}

export function feedbackCaseHref({ caseId, feedbackId, active = true, returnQuery = '' }) {
  const params = new URLSearchParams();
  params.set('feedback', '1');
  if (feedbackId) params.set('feedback_id', String(feedbackId));
  const query = normalizeFeedbackReturnQuery(returnQuery);
  if (query) params.set('feedback_return', query);
  const suffix = active ? '' : '/recovery';
  return '/admin/cases/' + encodeURIComponent(String(caseId)) + suffix + '?' + params.toString();
}

export function formatFeedbackDate(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore'
  }).format(date);
}
