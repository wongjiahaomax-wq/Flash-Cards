// @ts-nocheck

import { createImportHistoryState } from './import-history-state.js';

/**
 * Client interaction state for import processing and terminal-history actions.
 * Preview authorization is deliberately owned by the separate preview
 * controller; history mutations cannot clear or pause it.
 */
export function createImportHistoryController(initial = {}, options = {}) {
  const postJobAction = options.postJobAction ?? (async () => ({}));
  const postHistoryAction = options.postHistoryAction ?? (async () => ({}));
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const onChange = options.onChange ?? (() => {});
  const historyState = createImportHistoryState(initial);
  let destroyed = false;
  let state = {
    runningJobId: null,
    requestInFlight: false,
    historyMutationInFlight: false,
    localError: '',
    historyError: '',
    historyResult: null,
    pendingClearCursor: null
  };

  function snapshot() {
    return { ...state, ...historyState.value() };
  }

  function emit() {
    if (!destroyed) onChange(snapshot());
  }

  function setState(patch) {
    state = { ...state, ...patch };
    emit();
  }

  function upsertJob(job) {
    historyState.upsert(job);
    emit();
  }

  function applyHistoryResult(result) {
    if (result?.history) historyState.replace(result.history);
    setState({ historyResult: result ?? null, pendingClearCursor: result?.nextCursor ?? null });
    return result;
  }

  async function runImport(id) {
    if (destroyed || state.requestInFlight || state.runningJobId) return false;
    setState({ runningJobId: id, localError: '' });
    try {
      while (!destroyed && state.runningJobId === id) {
        setState({ requestInFlight: true });
        let result;
        try {
          result = await postJobAction('process', id);
        } finally {
          setState({ requestInFlight: false });
        }
        if (result?.job) upsertJob(result.job);
        if (result?.busy) {
          setState({ localError: 'This import is currently being processed by another browser tab. Processing here has paused safely.' });
          break;
        }
        const job = result?.job;
        if (!job || ['complete', 'cancelled', 'failed'].includes(job.status)) break;
        await sleep(30);
      }
      return true;
    } catch (error) {
      setState({ localError: error instanceof Error ? error.message : 'Import processing stopped unexpectedly.' });
      return false;
    } finally {
      setState({ requestInFlight: false, runningJobId: state.runningJobId === id ? null : state.runningJobId });
    }
  }

  function pauseImport(id) {
    if (state.runningJobId === id) setState({ runningJobId: null });
  }

  async function cancelJob(id) {
    pauseImport(id);
    setState({ localError: '' });
    try {
      const result = await postJobAction('cancel', id);
      upsertJob(result?.job);
      return result;
    } catch (error) {
      setState({ localError: error instanceof Error ? error.message : 'Unable to cancel this import.' });
      return null;
    }
  }

  function openClearDialog(cursor = null) {
    setState({ pendingClearCursor: cursor });
  }

  async function removeHistory(id) {
    if (destroyed || state.historyMutationInFlight) return null;
    setState({ historyMutationInFlight: true, historyError: '' });
    try {
      return applyHistoryResult(await postHistoryAction('removeHistory', id));
    } catch (error) {
      setState({ historyError: error instanceof Error ? error.message : 'Unable to remove this history record safely.' });
      return null;
    } finally {
      setState({ historyMutationInFlight: false });
    }
  }

  async function confirmClear({ confirmed = false, cursor = state.pendingClearCursor } = {}) {
    if (!confirmed || destroyed || state.historyMutationInFlight) return null;
    setState({ historyMutationInFlight: true, historyError: '' });
    try {
      return applyHistoryResult(await postHistoryAction('clearHistory', cursor));
    } catch (error) {
      setState({ historyError: error instanceof Error ? error.message : 'Unable to clear import history safely.' });
      return null;
    } finally {
      setState({ historyMutationInFlight: false });
    }
  }

  function destroy() {
    destroyed = true;
    state = { ...state, runningJobId: null, requestInFlight: false };
  }

  emit();
  return { snapshot, upsertJob, runImport, pauseImport, cancelJob, openClearDialog, removeHistory, confirmClear, destroy };
}
