export function hasActiveMissingAnswer(items = []) {
  return items.some(item => item.reviewStatus !== 'rejected' && item.warnings.some(warning => warning.code === 'missing_answer'));
}
