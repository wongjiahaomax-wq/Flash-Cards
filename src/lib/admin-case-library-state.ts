export const CASE_LIBRARY_STATE_KEY = 'flash-cards:admin:case-library-state:v1';
export const CASE_LIBRARY_STATE_VERSION = 1;

const CASE_LIBRARY_SORTS = new Set([
  'case-asc', 'case-desc', 'topic-asc', 'topic-desc',
  'system-asc', 'system-desc', 'tag-asc', 'tag-desc'
]);
const CASE_LIBRARY_QUERY_KEYS = ['q', 'topic', 'system', 'tag', 'sort', 'lifecycle', 'page'];

type CaseLibraryExplicitQueryKey = 'sort' | 'lifecycle' | 'page';

export type CaseLibraryStoredState = {
  version: 1;
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