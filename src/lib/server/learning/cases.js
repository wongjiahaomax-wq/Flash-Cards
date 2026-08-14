function isActive(item) {
  return item?.isActive !== false;
}

/**
 * Pick one eligible Case while avoiding an immediate repeat when alternatives exist.
 *
 * The caller is responsible for supplying Cases already matched to the learner's
 * selected Concept/descendants. This function only applies V1 repeat/random rules.
 */
export function pickCase(cases, { lastCompletedCaseId = null, rng = Math.random } = {}) {
  if (!Array.isArray(cases)) {
    throw new Error('Cases must be an array.');
  }

  if (typeof rng !== 'function') {
    throw new Error('rng must be a function.');
  }

  const activeCases = cases.filter(isActive);

  if (activeCases.length === 0) {
    return null;
  }

  const alternatives = lastCompletedCaseId
    ? activeCases.filter((item) => item.id !== lastCompletedCaseId)
    : activeCases;

  const candidates = alternatives.length > 0 ? alternatives : activeCases;
  const randomValue = rng();
  const boundedRandom = Math.min(Math.max(randomValue, 0), 0.9999999999999999);
  const selectedIndex = Math.floor(boundedRandom * candidates.length);

  return candidates[selectedIndex];
}
