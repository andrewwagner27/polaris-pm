// Pure property-scope rules (no React, no Supabase) so they can be unit-tested. See propertyScope.jsx.
export const ALL = "ALL";

// A requested scope is honoured only if it is ALL or one of the properties the database returned for this user.
export function validateScope(value, options) {
  if (value === ALL || value == null || value === "") return ALL;
  return (options || []).some((o) => o.id === value) ? value : ALL;
}

// Every cached/loaded dataset is keyed by its scope, so one property's data can never be served for another.
export function scopeKey(base, propertyId) { return `${base}::${propertyId || ALL}`; }

// Client-side filter for rows that carry (or can be mapped to) a property id.
export function inScope(propertyId, rowPropertyId) { return propertyId === ALL || rowPropertyId === propertyId; }

// What a list keeps when the scope changes: page 1, no selection, nothing expanded, no open detail, and only the
// filters that still make sense (status/priority/search survive; a filter pinned to one property's units does not).
export function resetForScope(view, { keepFilters = ["status", "priority", "search", "category"] } = {}) {
  const filters = Object.fromEntries(Object.entries(view?.filters || {}).filter(([k]) => keepFilters.includes(k)));
  return { page: 1, selectedIds: [], expandedId: null, detailId: null, filters };
}

// Rapid scope switching: each load takes a ticket; only the newest ticket may write its result.
export function latestOnly() {
  let n = 0;
  return { take: () => ++n, isCurrent: (t) => t === n };
}
