/**
 * Apply the shared Markdown toolbar's numbered-list toggle to the selected
 * line range. Selection offsets use the textarea's UTF-16 code-unit indexing.
 *
 * @param {string} value
 * @param {number} selectionStart
 * @param {number} selectionEnd
 * @param {string} placeholder
 */
export function toggleNumberedList(value, selectionStart, selectionEnd, placeholder = 'List item') {
  const start = Math.min(Math.max(selectionStart, 0), value.length);
  const end = Math.min(Math.max(selectionEnd, start), value.length);
  const rangeStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const nextLineBreak = value.indexOf('\n', end);
  const rangeEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const lines = value.slice(rangeStart, rangeEnd).split('\n');
  const contentLines = lines.filter((line) => line.trim());
  const orderedMarker = /^([ \t]*)(\d+)\.\s+/;
  const removeMarkers = contentLines.length > 0 && contentLines.every((line) => orderedMarker.test(line));
  let number = 0;

  const transformed = lines.map((line) => {
    if (!line.trim()) return line;
    number += 1;

    const marker = orderedMarker.exec(line);
    if (removeMarkers && marker) return `${marker[1]}${line.slice(marker[0].length)}`;
    if (marker) return line;

    const indentation = line.match(/^[ \t]*/)?.[0] ?? '';
    return `${indentation}${number}. ${line.slice(indentation.length)}`;
  });

  if (contentLines.length === 0 && lines.length === 1) {
    const indentation = lines[0].match(/^[ \t]*/)?.[0] ?? '';
    transformed[0] = `${indentation}1. ${placeholder}`;
  }

  const replacement = transformed.join('\n');
  return {
    value: `${value.slice(0, rangeStart)}${replacement}${value.slice(rangeEnd)}`,
    selectionStart: rangeStart,
    selectionEnd: rangeStart + replacement.length
  };
}
