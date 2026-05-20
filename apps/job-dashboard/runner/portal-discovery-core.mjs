export function createPortalCounters(portals = []) {
  return Object.fromEntries(portals.map(portal => [String(portal || '').toLowerCase(), 0]));
}

export function canImportForPortal({ portal, importedTotal = 0, counters = {}, budgets = {} } = {}) {
  const name = String(portal || '').toLowerCase();
  if (!name) return false;
  if (importedTotal >= Number(budgets.totalMax || Number.POSITIVE_INFINITY)) return false;
  const limit = Number(budgets.remainingByPortal?.[name] ?? budgets.perPortalMax ?? Number.POSITIVE_INFINITY);
  return Number(counters[name] || 0) < limit;
}

export function recordPortalImport(counters = {}, portal = '') {
  const name = String(portal || '').toLowerCase();
  if (!name) return counters;
  counters[name] = Number(counters[name] || 0) + 1;
  return counters;
}

export function allPortalBudgetsReached(counters = {}, budgets = {}) {
  const entries = Object.entries(budgets.remainingByPortal || {});
  if (entries.length === 0) return false;
  return entries.every(([portal, limit]) => Number(counters[portal] || 0) >= Number(limit || budgets.perPortalMax || 0));
}
