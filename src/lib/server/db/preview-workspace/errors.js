export class PreviewWorkspaceError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'PREVIEW_WORKSPACE_ERROR') {
    super(message);
    this.name = 'PreviewWorkspaceError';
    this.code = code;
  }
}
