const PAGE_PAD = 4;
const NO_TEXT = '[No extractable native text]';
const NO_SLIDE_TEXT = '[No straightforward extractable visible text]';
const NO_NOTES = '[No speaker notes]';

const FORBIDDEN_SEMANTIC_KEYS = new Set([
  'question',
  'answer',
  'caseId',
  'diagnosis',
  'answerSlideFor',
  'likelyDuplicateOf',
  'learnerAsset',
  'suggestedTopic',
]);

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function round(value, places = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function normalizeText(value) {
  if (value == null) return '';
  return String(value).replace(/\r\n?/g, '\n').trim();
}

function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

function normalizeGeometry(block, pageWidth, pageHeight) {
  const left = finiteNumber(block.left);
  const top = finiteNumber(block.top);
  const width = finiteNumber(block.width);
  const height = finiteNumber(block.height);
  if (
    left == null
    || top == null
    || width == null
    || height == null
    || !(pageWidth > 0)
    || !(pageHeight > 0)
  ) {
    return null;
  }

  return {
    x: round(clamp01(left / pageWidth)),
    y: round(clamp01(top / pageHeight)),
    width: round(clamp01(width / pageWidth)),
    height: round(clamp01(height / pageHeight)),
  };
}

function normalizeStyle(block) {
  const rawFontSize = finiteNumber(block.fontSize);
  const fontSize = rawFontSize != null && rawFontSize > 0 ? rawFontSize : null;
  const color = normalizeColor(block.color);
  const bold = typeof block.bold === 'boolean' ? block.bold : null;
  const italic = typeof block.italic === 'boolean' ? block.italic : null;

  if (fontSize == null && color == null && bold == null && italic == null) return null;
  return {
    fontSize: fontSize == null ? null : round(fontSize, 3),
    color,
    bold,
    italic,
  };
}

function sourceKind(type) {
  if (type === 'pptx') return { noun: 'Slide', idPrefix: 'slide' };
  if (type === 'pdf') return { noun: 'Page', idPrefix: 'page' };
  throw new Error(`Unsupported source-map type: ${type}`);
}

export function padPage(number) {
  return String(number).padStart(PAGE_PAD, '0');
}

/**
 * Normalize deterministic extraction output into the versioned AI-facing source map.
 * Raw blocks may omit geometry/style when the source adapter cannot establish them safely.
 */
export function normalizeSourceMap({ filename, type, pages }) {
  if (!filename || typeof filename !== 'string') throw new Error('Source filename is required.');
  if (!Array.isArray(pages)) throw new Error('Source pages must be an array.');
  const kind = sourceKind(type);

  const normalizedPages = pages.map((page, pageIndex) => {
    const pageNumber = Number.isInteger(page?.number) ? page.number : pageIndex + 1;
    if (pageNumber !== pageIndex + 1) {
      throw new Error(`Source pages must be contiguous and ordered; expected ${pageIndex + 1}, got ${pageNumber}.`);
    }

    const pageWidth = finiteNumber(page.width);
    const pageHeight = finiteNumber(page.height);
    const rawBlocks = Array.isArray(page.blocks) ? page.blocks : [];

    const blocks = rawBlocks
      .map((block, extractionIndex) => {
        const text = normalizeText(block?.text);
        if (!text) return null;
        const geometry = normalizeGeometry(block ?? {}, pageWidth, pageHeight);
        return {
          extractionIndex,
          type: block?.type === 'table' ? 'table' : 'text',
          text,
          geometry,
          style: normalizeStyle(block ?? {}),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ay = a.geometry?.y ?? Number.POSITIVE_INFINITY;
        const by = b.geometry?.y ?? Number.POSITIVE_INFINITY;
        if (ay !== by) return ay - by;
        const ax = a.geometry?.x ?? Number.POSITIVE_INFINITY;
        const bx = b.geometry?.x ?? Number.POSITIVE_INFINITY;
        if (ax !== bx) return ax - bx;
        return a.extractionIndex - b.extractionIndex;
      })
      .map(({ extractionIndex: _extractionIndex, ...block }, blockIndex) => ({
        order: blockIndex + 1,
        ...block,
      }));

    const padded = padPage(pageNumber);
    return {
      id: `${kind.idPrefix}-${padded}`,
      page: pageNumber,
      label: `${kind.noun} ${padded}`,
      width: pageWidth,
      height: pageHeight,
      blocks,
      speakerNotes: type === 'pptx' ? normalizeText(page.speakerNotes) : null,
    };
  });

  const result = {
    version: 1,
    source: { filename, type },
    pageCount: normalizedPages.length,
    pages: normalizedPages,
  };
  assertNonSemanticSourceMap(result);
  return result;
}

export function sourceMapToMarkdown(sourceMap) {
  assertSourceMapShape(sourceMap);
  const isPptx = sourceMap.source.type === 'pptx';
  const countLabel = isPptx ? 'Slides' : 'Pages';
  const lines = [
    `# Source: ${sourceMap.source.filename}`,
    '',
    `${countLabel}: ${sourceMap.pageCount}`,
    '',
  ];

  for (const page of sourceMap.pages) {
    lines.push(`## ${page.label}`, '');
    lines.push(`Visual page: ${page.page}`, `Source-map id: ${page.id}`, '');
    lines.push('### Visible text', '');
    if (page.blocks.length === 0) {
      lines.push(isPptx ? NO_SLIDE_TEXT : NO_TEXT);
    } else {
      for (const block of page.blocks) lines.push(block.text);
    }
    lines.push('');

    if (isPptx) {
      lines.push('### Speaker notes', '');
      lines.push(page.speakerNotes || NO_NOTES, '');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function planChunkRanges(pageCount, { threshold = 50, chunkSize = 40 } = {}) {
  if (!Number.isInteger(pageCount) || pageCount < 0) throw new Error('pageCount must be a non-negative integer.');
  if (!Number.isInteger(threshold) || threshold < 0) throw new Error('threshold must be a non-negative integer.');
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new Error('chunkSize must be a positive integer.');
  if (pageCount <= threshold) return [];

  const ranges = [];
  for (let start = 1; start <= pageCount; start += chunkSize) {
    ranges.push({ start, end: Math.min(pageCount, start + chunkSize - 1) });
  }
  return ranges;
}

export function sliceSourceMap(sourceMap, start, end) {
  assertSourceMapShape(sourceMap);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > sourceMap.pageCount) {
    throw new Error(`Invalid source-map range ${start}-${end}.`);
  }

  return {
    ...sourceMap,
    pageCount: end - start + 1,
    source: {
      ...sourceMap.source,
      originalPageCount: sourceMap.pageCount,
      range: { start, end },
    },
    pages: sourceMap.pages.slice(start - 1, end),
  };
}

export function assertSourceMapShape(sourceMap) {
  if (!sourceMap || sourceMap.version !== 1) throw new Error('Unsupported or missing source-map version.');
  sourceKind(sourceMap.source?.type);
  if (!sourceMap.source?.filename) throw new Error('source.filename is required.');
  if (!Array.isArray(sourceMap.pages) || sourceMap.pages.length !== sourceMap.pageCount) {
    throw new Error('source-map pageCount does not match pages.');
  }

  const range = sourceMap.source?.range;
  sourceMap.pages.forEach((page, index) => {
    const expectedPage = range ? range.start + index : index + 1;
    if (page.page !== expectedPage) {
      throw new Error(`source-map page order mismatch at index ${index}; expected ${expectedPage}, got ${page.page}.`);
    }
    if (!Array.isArray(page.blocks)) throw new Error(`source-map ${page.id} blocks must be an array.`);
    page.blocks.forEach((block, blockIndex) => {
      if (block.order !== blockIndex + 1) throw new Error(`source-map ${page.id} block order is not contiguous.`);
      if (!block.text) throw new Error(`source-map ${page.id} contains an empty text block.`);
    });
  });
  assertNonSemanticSourceMap(sourceMap);
}

export function assertNonSemanticSourceMap(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNonSemanticSourceMap(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_SEMANTIC_KEYS.has(key)) {
      throw new Error(`Semantic source-map key is forbidden at ${path}.${key}.`);
    }
    assertNonSemanticSourceMap(nested, `${path}.${key}`);
  }
}

function decodeXmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_match, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttributes(fragment) {
  const attrs = {};
  for (const match of fragment.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

/** Parse Poppler `pdftotext -bbox-layout` XHTML into raw page/block records. */
export function parsePopplerBboxXhtml(xhtml) {
  if (typeof xhtml !== 'string' || !xhtml.includes('<page')) throw new Error('Poppler bbox output contains no pages.');
  const pages = [];

  for (const pageMatch of xhtml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/gi)) {
    const pageAttrs = parseAttributes(pageMatch[1]);
    const pageBody = pageMatch[2];
    const blocks = [];

    for (const lineMatch of pageBody.matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/gi)) {
      const lineAttrs = parseAttributes(lineMatch[1]);
      const words = [];
      for (const wordMatch of lineMatch[2].matchAll(/<word\b[^>]*>([\s\S]*?)<\/word>/gi)) {
        const text = decodeXmlEntities(wordMatch[1].replace(/<[^>]+>/g, '')).trim();
        if (text) words.push(text);
      }
      const text = words.join(' ').trim();
      if (!text) continue;
      const xMin = finiteNumber(lineAttrs.xMin);
      const yMin = finiteNumber(lineAttrs.yMin);
      const xMax = finiteNumber(lineAttrs.xMax);
      const yMax = finiteNumber(lineAttrs.yMax);
      blocks.push({
        type: 'text',
        text,
        left: xMin,
        top: yMin,
        width: xMin == null || xMax == null ? null : xMax - xMin,
        height: yMin == null || yMax == null ? null : yMax - yMin,
        fontSize: null,
        color: null,
        bold: null,
        italic: null,
      });
    }

    pages.push({
      number: pages.length + 1,
      width: finiteNumber(pageAttrs.width),
      height: finiteNumber(pageAttrs.height),
      blocks,
      speakerNotes: null,
    });
  }

  if (pages.length === 0) throw new Error('Poppler bbox output contains no parseable pages.');
  return pages;
}

export const EMPTY_MARKERS = Object.freeze({
  pdfText: NO_TEXT,
  pptxText: NO_SLIDE_TEXT,
  notes: NO_NOTES,
});
