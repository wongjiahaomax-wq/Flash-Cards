const DATE_FORMATTER = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

/** @param {Date | string | number | null | undefined} value */
function validDate(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** @param {Intl.DateTimeFormat} formatter @param {Date} date */
function parts(formatter, date) {
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

/** @param {Date | string | number | null | undefined} value */
export function formatCaseAuthoringDate(value) {
  const date = validDate(value);
  if (!date) return '';
  const formatted = parts(DATE_FORMATTER, date);
  return `${formatted.day} ${formatted.month} ${formatted.year}`;
}

/** @param {Date | string | number | null | undefined} value */
export function formatCaseAuthoringDateTime(value) {
  const date = validDate(value);
  if (!date) return '';
  const formatted = parts(DATE_TIME_FORMATTER, date);
  return `${formatted.day} ${formatted.month} ${formatted.year}, ${formatted.hour}:${formatted.minute} SGT`;
}
