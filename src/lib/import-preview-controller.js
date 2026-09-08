// @ts-nocheck

import { extractDeclaredZipMedia, sha256Hex } from './import-package-preview.js';

/**
 * Browser-only state machine for the Admin import preview and exact-file gate.
 * The Svelte page owns rendering; this module owns generation, selection, and
 * Blob lifecycle so those transitions can be executed without source matching.
 */
export function createImportPreviewController(options = {}) {
  const hashFile = options.hashFile ?? (async (file) => sha256Hex(await file.arrayBuffer()));
  const extractMedia = options.extractMedia ?? extractDeclaredZipMedia;
  const createObjectURL = options.createObjectURL ?? ((blob) => URL.createObjectURL(blob));
  const revokeObjectURL = options.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url));
  const BlobConstructor = options.BlobConstructor ?? Blob;
  const onChange = options.onChange ?? (() => {});
  const onActionState = options.onActionState ?? (() => {});

  let generation = 0;
  let startSelectionToken = 0;
  let state = {
    selectedPreviewFile: null,
    selectedStartFile: null,
    previewResult: null,
    previewInFlight: false,
    serverPreviewStatus: 'idle',
    localBinding: 'unchecked',
    media: {}
  };

  function snapshot() {
    return { ...state, media: { ...state.media } };
  }

  function emit() {
    onChange(snapshot());
  }

  function setState(patch) {
    state = { ...state, ...patch };
    emit();
  }

  function revokeMedia(media = state.media) {
    for (const entry of Object.values(media)) {
      if (entry?.url) revokeObjectURL(entry.url);
    }
  }

  function invalidatePreview() {
    generation += 1;
    startSelectionToken += 1;
    revokeMedia();
    state = {
      ...state,
      selectedPreviewFile: null,
      selectedStartFile: null,
      previewResult: null,
      serverPreviewStatus: 'invalidated',
      localBinding: 'invalidated',
      media: {}
    };
    emit();
    return generation;
  }

  function selectPreviewFile(file) {
    invalidatePreview();
    state = { ...state, selectedPreviewFile: file ?? null };
    emit();
  }

  function isCurrentStart(file, token, requestGeneration) {
    return generation === requestGeneration
      && startSelectionToken === token
      && state.selectedStartFile === file;
  }

  async function bindStartFile(file, token, requestGeneration) {
    if (!isCurrentStart(file, token, requestGeneration)) return;
    setState({ localBinding: 'hashing' });
    try {
      const digest = await hashFile(file);
      if (!isCurrentStart(file, token, requestGeneration)) return;
      setState({ localBinding: digest === state.previewResult?.previewDigest ? 'matched' : 'mismatched' });
    } catch {
      if (isCurrentStart(file, token, requestGeneration)) setState({ localBinding: 'mismatched' });
    }
  }

  function selectStartFile(file) {
    const selected = file ?? null;
    const token = ++startSelectionToken;
    const requestGeneration = generation;
    setState({
      selectedStartFile: selected,
      localBinding: selected ? 'mismatched' : 'unchecked'
    });
    if (selected && state.serverPreviewStatus === 'succeeded' && state.previewResult?.previewDigest) {
      void bindStartFile(selected, token, requestGeneration);
    }
  }

  async function loadPreviewMedia(model, file, requestGeneration) {
    const targets = (model?.cases ?? []).flatMap((item) => item.assets ?? [])
      .filter((item) => item.asset?.operation === 'create' && item.asset.mediaPath)
      .map((item) => ({ id: item.asset.id, path: item.asset.mediaPath, mimeType: item.asset.mimeType }));
    if (!targets.length) return;

    setState({
      media: Object.fromEntries(targets.map((target) => [target.id, { status: 'pending', url: null }]))
    });

    let bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      if (generation !== requestGeneration) return;
      setState({ media: Object.fromEntries(targets.map((target) => [target.id, { status: 'unavailable', url: null }])) });
      return;
    }

    for (const target of targets) {
      try {
        const extracted = await extractMedia(bytes, [target.path]);
        if (generation !== requestGeneration) return;
        const body = extracted.get(target.path);
        if (!body) throw new Error(`Declared media ${target.path} was not extracted.`);
        const url = createObjectURL(new BlobConstructor([body], { type: target.mimeType }));
        if (generation !== requestGeneration) {
          revokeObjectURL(url);
          return;
        }
        setState({ media: { ...state.media, [target.id]: { status: 'ready', url } } });
      } catch {
        if (generation === requestGeneration) {
          setState({ media: { ...state.media, [target.id]: { status: 'unavailable', url: null } } });
        }
      }
    }
  }

  /**
   * @param {{ formData: FormData, post: (formData: FormData) => Promise<{type: string, data?: any}> }} request
   */
  async function submitPreview({ formData, post }) {
    if (state.previewInFlight || !state.selectedPreviewFile) return null;
    const requestGeneration = generation;
    const previewFile = state.selectedPreviewFile;
    setState({
      previewInFlight: true,
      serverPreviewStatus: 'in-flight',
      localBinding: state.selectedStartFile ? 'mismatched' : 'unchecked'
    });
    try {
      const result = await post(formData);
      if (generation !== requestGeneration) return null;
      onActionState(result?.data ?? null);
      if (result?.type !== 'success') {
        setState({ serverPreviewStatus: 'failed', localBinding: 'mismatched' });
        return result;
      }

      setState({
        previewResult: result.data,
        serverPreviewStatus: 'succeeded',
        localBinding: state.selectedStartFile ? 'mismatched' : 'unchecked'
      });

      // A Step-2 file selected while Step 1 was in flight is revalidated
      // against the new server digest; the Step-1 File is never substituted.
      if (state.selectedStartFile) {
        const token = startSelectionToken;
        void bindStartFile(state.selectedStartFile, token, requestGeneration);
      }
      void loadPreviewMedia(result.data?.previewModel, previewFile, requestGeneration);
      return result;
    } catch (error) {
      if (generation === requestGeneration) {
        const message = error instanceof Error ? error.message : 'Unable to validate this package.';
        onActionState({ error: message });
        setState({ serverPreviewStatus: 'failed', localBinding: 'mismatched' });
      }
      return null;
    } finally {
      setState({ previewInFlight: false });
    }
  }

  function consumeAuthorization() {
    setState({ serverPreviewStatus: 'invalidated', localBinding: 'invalidated' });
  }

  function canStart() {
    return state.serverPreviewStatus === 'succeeded' && state.localBinding === 'matched';
  }

  function destroy() {
    generation += 1;
    startSelectionToken += 1;
    revokeMedia();
    state = { ...state, media: {} };
  }

  return {
    invalidatePreview,
    selectPreviewFile,
    selectStartFile,
    submitPreview,
    consumeAuthorization,
    canStart,
    snapshot,
    destroy
  };
}
