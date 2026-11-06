import { SCOPES } from "./lib/accounting";
import { selectStyle } from "./lib/useScope";

export function ScopeSelects({ s }) {
  return (
    <>
      <select aria-label="Scope" value={s.scope} onChange={e => s.setScope(e.target.value)} style={selectStyle}>
        {SCOPES.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
      </select>
      {s.scope !== "portfolio" && (
        <select aria-label="Scope item" value={s.scopeId} onChange={e => s.setScopeId(e.target.value)} style={selectStyle}>
          <option value="">Select…</option>
          {s.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
    </>
  );
}
