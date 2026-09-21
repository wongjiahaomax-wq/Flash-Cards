import { marked } from 'marked';

/** @param {unknown} value */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** @param {Array<{text?: string, raw?: string}>} tokens */
function inlinePlainText(tokens = []) {
  return tokens.map((token) => token.text ?? token.raw ?? '').join('');
}

/** @param {string} href */
function isSafeHref(href) {
  const value = String(href ?? '').trim();
  if (!value) return false;
  if (/^(?:https?:|mailto:)/i.test(value)) return true;
  return /^(?:[/?#]|\.\.?\/)/.test(value) && !/^\/\//.test(value);
}

const renderer = new marked.Renderer();
renderer.html = () => '';
renderer.image = () => '';
renderer.link = /** @param {import('marked').Tokens.Link} token */ (token) => {
  const { href, title, tokens } = token;
  const text = escapeHtml(inlinePlainText(tokens));
  if (!isSafeHref(href)) return text;
  const safeHref = escapeHtml(href);
  const safeTitle = title ? ` title="${escapeHtml(title)}"` : '';
  const external = /^(?:https?:|mailto:)/i.test(String(href));
  return `<a href="${safeHref}"${safeTitle}${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
};

/**
 * Render authored clinical Markdown into a deliberately small safe HTML
 * subset. Raw HTML and Markdown images are intentionally inert; clinical
 * media is supplied by the authenticated Study asset path instead.
 * @param {unknown} source
 */
export function renderMarkdown(source) {
  const value = String(source ?? '');
  if (!value.trim()) return '';
  return /** @type {string} */ (marked.parse(value, {
    gfm: true,
    breaks: true,
    renderer
  }));
}
