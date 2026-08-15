import { load as loadCases, actions } from '../../+page.server.js';

export async function load(event) {
  const url = new URL(event.url);
  url.searchParams.set('case', event.params.caseId);
  return loadCases(/** @type {any} */ ({ ...event, url }));
}

export { actions };
