// Global property scope for the management app.
//
// The landlord picks "All Properties" or one property in the header; every scoped screen reads it through
// usePropertyScope(). The canonical value is a property id or ALL. It is remembered per signed-in user in
// localStorage and validated against the properties the database returns for this user (RLS decides which):
// an unknown, deleted or unauthorised id falls back to ALL.
//
// SECURITY: the scope is a UI filter only. Authorisation stays with Supabase RLS and the server routes; nothing
// here widens or narrows what the database lets the user read.
/* eslint-disable react-refresh/only-export-components -- context module: provider + hook + scope constants belong together */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";

const STORAGE_PREFIX = "modus.propertyScope.v1:";

const ScopeContext = createContext(null);

import { ALL, validateScope, scopeKey, latestOnly } from "./propertyScopeCore";
export { ALL, validateScope, scopeKey, inScope, resetForScope } from "./propertyScopeCore";

function readStored(userId) {
  try { return localStorage.getItem(STORAGE_PREFIX + userId); } catch { return null; }
}
function writeStored(userId, value) {
  try { localStorage.setItem(STORAGE_PREFIX + userId, value); } catch { /* private mode: scope just isn't remembered */ }
}

export function PropertyScopeProvider({ children }) {
  const [userId, setUserId]   = useState(null);
  const [options, setOptions] = useState([]);           // [{ id, name }]
  const [status, setStatus]   = useState("loading");    // loading | ready | error
  const [requested, setRequested] = useState(ALL);      // what the user (or storage) asked for
  const [version, setVersion] = useState(0);            // bumps on every scope change; part of every cache key

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!live || !user) return;
      setUserId(user.id);
      const stored = readStored(user.id);
      if (stored) setRequested(stored);
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (!live) return;
      if (error) { setStatus("error"); return; }
      setOptions((data || []).map((p) => ({ id: p.id, name: p.name || "Unnamed property" })));
      setStatus("ready");
    })();
    return () => { live = false; };
  }, []);

  // Until the authorised list has loaded, everything is portfolio-wide (never a stale stored id).
  const selectedPropertyId = status === "ready" ? validateScope(requested, options) : ALL;

  // Repair storage when a remembered id is no longer valid.
  useEffect(() => {
    if (status === "ready" && userId && requested !== selectedPropertyId) writeStored(userId, selectedPropertyId);
  }, [status, userId, requested, selectedPropertyId]);

  const setSelectedPropertyId = useCallback((value) => {
    const next = validateScope(value, options);
    setRequested(next);
    setVersion((v) => v + 1);
    if (userId) writeStored(userId, next);
  }, [options, userId]);

  const value = useMemo(() => ({
    selectedPropertyId,
    setSelectedPropertyId,
    options,
    loading: status === "loading",
    error: status === "error",
    isAll: selectedPropertyId === ALL,
    selectedName: selectedPropertyId === ALL ? "All Properties" : (options.find((o) => o.id === selectedPropertyId)?.name || "All Properties"),
    version,
  }), [selectedPropertyId, setSelectedPropertyId, options, status, version]);

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

// Screens rendered outside the provider (tests, previews) get a fixed portfolio-wide scope.
const FALLBACK = Object.freeze({ selectedPropertyId: ALL, setSelectedPropertyId: () => {}, options: [], loading: false,
  error: false, isAll: true, selectedName: "All Properties", version: 0 });

export function usePropertyScope() { return useContext(ScopeContext) || FALLBACK; }

// Load data for the current scope. `loader(propertyId)` must take the property id explicitly. Responses from an
// earlier scope (rapid switching) are discarded, and results are cached per key+scope for the session so switching
// back is instant while a fresh copy loads. `reload()` refetches the current scope.
const cache = new Map();
export function useScopedLoad(baseKey, loader, { initial = null } = {}) {
  const { selectedPropertyId } = usePropertyScope();
  const key = scopeKey(baseKey, selectedPropertyId);
  const [state, setState] = useState(() => ({ key, data: cache.has(key) ? cache.get(key) : initial, loading: !cache.has(key), error: null }));
  const gate = useRef(null);
  if (!gate.current) gate.current = latestOnly();
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; });

  const run = useCallback(async (k, pid) => {
    const mine = gate.current.take();
    setState((s) => ({ key: k, data: cache.has(k) ? cache.get(k) : (s.key === k ? s.data : initial), loading: true, error: null }));
    try {
      const data = await loaderRef.current(pid);
      if (!gate.current.isCurrent(mine)) return;                 // a newer scope/request superseded this one
      cache.set(k, data);
      setState({ key: k, data, loading: false, error: null });
    } catch (e) {
      if (!gate.current.isCurrent(mine)) return;
      setState((s) => ({ ...s, key: k, loading: false, error: e?.message || String(e) }));
    }
  }, [initial]);

  useEffect(() => { run(key, selectedPropertyId); }, [key, selectedPropertyId, run]);

  // Never hand back another scope's data while the new scope loads (no flash of the wrong property).
  const data = state.key === key ? state.data : (cache.has(key) ? cache.get(key) : initial);
  return { data, loading: state.key !== key || state.loading, error: state.key === key ? state.error : null,
           reload: () => run(key, selectedPropertyId), propertyId: selectedPropertyId, key };
}

export function clearScopedCache() { cache.clear(); }
