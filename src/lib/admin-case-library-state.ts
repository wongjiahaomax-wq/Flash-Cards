export const CASE_LIBRARY_STATE_KEY = 'flash-cards:admin:case-library-state:v2';
export const CASE_LIBRARY_STATE_VERSION = 2;

const CASE_LIBRARY_SORTS = new Set([
  'case-asc', 'case-desc', 'topic-asc', 'topic-desc',
  'system-asc', 'system-desc', 'tag-asc', 'tag-desc',
  'added-asc', 'added-desc', 'edited-asc', 'edited-desc'
]);
const CASE_LIBRARY_QUERY_KEYS = ['q', 'topic', 'system', 'tag', 'sort', 'lifecycle', 'page'];

type CaseLibraryExplicitQueryKey = 'sort' | 'lifecycle' | 'page';

export type CaseLibraryStoredState = {
  version: 2;
  q: string;
  topic: string;
  system: string;
  tag: string;
  sort: string;
  lifecycle: 'active' | 'inactive';
  page: number;
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeCaseLibraryStoredState(value: unknown): CaseLibraryStoredState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== CASE_LIBRARY_STATE_VERSION) return null;
  const sort = text(candidate.sort);
  const lifecycle = candidate.lifecycle === 'inactive' ? 'inactive' : 'active';
  const pageValue = Number(candidate.page);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  return {
    version: CASE_LIBRARY_STATE_VERSION,
    q: text(candidate.q),
    topic: text(candidate.topic),
    system: text(candidate.system),
    tag: text(candidate.tag),
    sort: CASE_LIBRARY_SORTS.has(sort) ? sort : 'case-asc',
    lifecycle,
    page
  };
}

export function parseCaseLibraryStoredState(raw: string | null): CaseLibraryStoredState | null {
  if (!raw) return null;
  try {
    return normalizeCaseLibraryStoredState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCaseLibraryStoredState(storage: Pick<Storage, 'getItem'> | null = browserStorage()) {
  if (!storage) return null;
  try {
    return parseCaseLibraryStoredState(storage.getItem(CASE_LIBRARY_STATE_KEY));
  } catch {
    return null;
  }
}

export function clearCaseLibraryStoredState(storage: Pick<Storage, 'removeItem'> | null = browserStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(CASE_LIBRARY_STATE_KEY);
  } catch {
    // Browser storage is a convenience only; unavailable storage must not break the Case Library.
  }
}

function isDefaultActiveState(state: CaseLibraryStoredState) {
  return !state.q && !state.topic && !state.system && !state.tag
    && state.sort === 'case-asc' && state.lifecycle === 'active' && state.page === 1;
}

export function writeCaseLibraryStoredState(
  value: unknown,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = browserStorage()
) {
  if (!storage) return;
  const state = normalizeCaseLibraryStoredState(value);
  if (!state) return;
  try {
    if (isDefaultActiveState(state)) storage.removeItem(CASE_LIBRARY_STATE_KEY);
    else storage.setItem(CASE_LIBRARY_STATE_KEY, JSON.stringify(state));
  } catch {
    // Browser storage is a convenience only; unavailable storage must not break the Case Library.
  }
}

export function hasExplicitCaseLibraryQuery(params: URLSearchParams) {
  return CASE_LIBRARY_QUERY_KEYS.some((key) => params.has(key));
}

export function shouldRestoreCaseLibraryState(params: URLSearchParams, hasActionFailure = false) {
  return !hasActionFailure && !hasExplicitCaseLibraryQuery(params);
}

export function caseLibraryReturnQuery(params: URLSearchParams) {
  const returnParams = new URLSearchParams();
  for (const key of CASE_LIBRARY_QUERY_KEYS) {
    for (const value of params.getAll(key)) returnParams.append(key, value);
  }
  return returnParams.toString();
}

/**
 * Normalize a Case Library query before carrying it through an editor URL.
 * Only the Case Library state keys are retained; the value can never become
 * an arbitrary destination URL.
 */
export function normalizeCaseLibraryReturnQuery(value: string | URLSearchParams | null | undefined) {
  const params = value instanceof URLSearchParams
    ? value
    : new URLSearchParams(typeof value === 'string' ? value : '');
  const state = normalizeCaseLibraryStoredState({
    version: CASE_LIBRARY_STATE_VERSION,
    q: params.get('q') ?? '',
    topic: params.get('topic') ?? '',
    system: params.get('system') ?? '',
    tag: params.get('tag') ?? '',
    sort: params.get('sort') ?? 'case-asc',
    lifecycle: params.get('lifecycle') ?? 'active',
    page: params.get('page') ?? '1'
  });
  if (!state) return '';
  const explicitKeys = (['sort', 'lifecycle', 'page'] as const).filter((key) => params.has(key));
  const href = caseLibraryStateHref(state, explicitKeys);
  return href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
}

export function caseLibraryReturnHref(value: string | URLSearchParams | null | undefined) {
  const query = normalizeCaseLibraryReturnQuery(value);
  return query ? `/admin/cases?${query}` : '/admin/cases';
}

export function caseEditorReturnQuery(value: string | URLSearchParams | null | undefined, lifecycle: 'active' | 'inactive') {
  const params = value instanceof URLSearchParams
    ? new URLSearchParams(value)
    : new URLSearchParams(typeof value === 'string' ? value : '');
  params.set('lifecycle', lifecycle);
  return normalizeCaseLibraryReturnQuery(params);
}

export function caseEditorHref(path: string, returnQuery: string | URLSearchParams | null | undefined) {
  const query = normalizeCaseLibraryReturnQuery(returnQuery);
  return query ? `${path}?return_query=${encodeURIComponent(query)}` : path;
}

export function caseLibraryNamedActionHref(actionName: string, returnQuery = '') {
  const cleanActionName = actionName.trim().replace(/^\/+/, '');
  if (!cleanActionName) throw new Error('Case Library action name is required.');
  const cleanQuery = returnQuery.replace(/^\?+/, '').replace(/^&+|&+$/g, '');
  return `?${cleanQuery ? `${cleanQuery}&` : ''}/${cleanActionName}`;
}

export function caseLibraryStateHref(value: unknown, explicitKeys: CaseLibraryExplicitQueryKey[] = []) {
  const state = normalizeCaseLibraryStoredState(value);
  if (!state) return '/admin/cases';
  const explicit = new Set(explicitKeys);
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.topic) params.set('topic', state.topic);
  if (state.system) params.set('system', state.system);
  if (state.tag) params.set('tag', state.tag);
  if (state.sort !== 'case-asc' || explicit.has('sort')) params.set('sort', state.sort);
  if (state.lifecycle === 'inactive' || explicit.has('lifecycle')) params.set('lifecycle', state.lifecycle);
  if (state.page > 1 || explicit.has('page')) params.set('page', String(state.page));
  const search = params.toString();
  return search ? `/admin/cases?${search}` : '/admin/cases';
}
