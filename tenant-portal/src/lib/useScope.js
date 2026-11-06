import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { SCOPES } from "./accounting";

export const selectStyle = { padding: "7px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, fontSize: 12, background: "#1A1F29", color: "#9095A0", outline: "none", fontFamily: "'DM Sans', sans-serif", colorScheme: "dark" };

// Portfolio / ownership entity / set of books / property, the same four views on every financial report.
export function useScope() {
  const [scope, setScope]     = useState("portfolio");
  const [scopeId, setScopeId] = useState("");
  const [owners, setOwners]   = useState([]);
  const [books, setBooks]     = useState([]);
  const [properties, setProperties] = useState([]);

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: b }, { data: p }] = await Promise.all([
        supabase.from("ownership_entities").select("id, name, type").order("name"),
        supabase.from("accounting_entities").select("id, name, owner_entity_id").order("name"),
        supabase.from("properties").select("id, name, accounting_entity_id").order("name"),
      ]);
      setOwners(o || []); setBooks(b || []); setProperties(p || []);
    })();
  }, []);

  const options = scope === "owner" ? owners : scope === "books" ? books : scope === "property" ? properties : [];
  const ready = scope === "portfolio" || !!scopeId;
  const label = scope === "portfolio" ? "Portfolio (all books)"
    : `${SCOPES.find(s => s.value === scope).label}: ${options.find(o => o.id === scopeId)?.name || "—"}`;
  return { scope, scopeId, setScope: (s) => { setScope(s); setScopeId(""); }, setScopeId, owners, books, properties, options, ready, label,
           rpcScope: { p_scope: scope, p_scope_id: scope === "portfolio" ? null : (scopeId || null) } };
}
