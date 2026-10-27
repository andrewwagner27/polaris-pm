import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

const C = {
  bg:"#0A0B0D", surface:"#111316", raised:"#181C21", border:"#252930",
  text:"#EDEAE2", textSub:"#9095A0", textMuted:"#5C6270",
  gold:"#C9A96E", goldDim:"#7A5C2E",
  blue:"#4A9AE8", green:"#72B02A", red:"#E05555", amber:"#F0A430",
};

const DEFAULT_ROOMS = [
  { room: "Entry / Hallway",   items: ["Walls & ceiling","Flooring","Doors & locks","Lighting"] },
  { room: "Living Room",       items: ["Walls & ceiling","Flooring","Windows & blinds","Outlets & switches","Lighting"] },
  { room: "Kitchen",           items: ["Walls & ceiling","Flooring","Cabinets & countertops","Appliances","Sink & faucet","Outlets & switches"] },
  { room: "Primary Bedroom",   items: ["Walls & ceiling","Flooring","Windows & blinds","Closet","Outlets & switches","Lighting"] },
  { room: "Bedroom 2",         items: ["Walls & ceiling","Flooring","Windows & blinds","Closet","Outlets & switches"] },
  { room: "Bathroom",          items: ["Walls & ceiling","Flooring","Toilet","Shower / tub","Vanity & sink","Ventilation"] },
  { room: "Laundry",           items: ["Washer connections","Dryer connections","Flooring","Ventilation"] },
  { room: "Garage / Parking",  items: ["Garage door","Floor","Walls","Lighting","Outlets"] },
  { room: "Exterior",          items: ["Front door & lock","Landscaping","Driveway / walkway","Mailbox","Exterior lighting"] },
];

const STATUS_OPTS = ["Good","Fair","Poor","N/A"];
const STATUS_COLOR = { Good: C.green, Fair: C.amber, Poor: C.red, "N/A": C.textMuted };

export default function LandlordInspection() {
  const [tab, setTab]               = useState("list"); // list | create | view
  const [inspections, setInspections] = useState([]);
  const [tenants, setTenants]       = useState([]);
  const [selected, setSelected]     = useState(null);  // inspection being viewed
  const [loading, setLoading]       = useState(true);

  // create-form state
  const [formTenant, setFormTenant] = useState("");
  const [formDate,   setFormDate]   = useState(new Date().toISOString().slice(0,10));
  const [formRooms,  setFormRooms]  = useState(
    DEFAULT_ROOMS.map(r => ({
      room: r.room,
      items: r.items.map(name => ({ name, status: "Good", notes: "" })),
    }))
  );
  const [formNotes,  setFormNotes]  = useState("");
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: insp }, { data: ten }] = await Promise.all([
      supabase.from("inspections").select("*, tenants(name, unit_number)").order("created_at", { ascending: false }),
      supabase.from("tenants").select("id, name, unit_number").order("unit_number"),
    ]);
    setInspections(insp || []);
    setTenants(ten || []);
    setLoading(false);
  }

  function updateItem(roomIdx, itemIdx, field, val) {
    setFormRooms(prev => {
      const next = prev.map((r, ri) =>
        ri !== roomIdx ? r : {
          ...r,
          items: r.items.map((it, ii) => ii !== itemIdx ? it : { ...it, [field]: val }),
        }
      );
      return next;
    });
  }

  async function saveInspection() {
    if (!formTenant) { setSaveMsg("Please select a tenant."); return; }
    setSaving(true);
    const payload = {
      tenant_id:       formTenant,
      inspection_date: formDate,
      rooms:           formRooms,
      landlord_notes:  formNotes,
      status:          "landlord_complete",
      created_by:      "landlord",
    };
    const { error } = await supabase.from("inspections").insert(payload);
    if (error) {
      setSaveMsg("Error saving: " + error.message);
    } else {
      setSaveMsg("Saved!");
      await loadData();
      setTimeout(() => { setSaveMsg(""); setTab("list"); }, 1200);
    }
    setSaving(false);
  }

  function openView(insp) { setSelected(insp); setTab("view"); }

  const completedCount = inspections.filter(i => i.status === "tenant_complete" || i.status === "both_complete").length;
  const pendingCount   = inspections.filter(i => i.status === "landlord_complete").length;

  return (
    <LandlordLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .insp-tab:hover{background:rgba(255,255,255,0.05)!important;}
        .insp-row:hover{background:${C.raised}!important;cursor:pointer;}
        .insp-status-btn:hover{opacity:0.85;}
        select,textarea,input{font-family:'DM Sans',sans-serif;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      <div style={{ padding:"24px 28px", background:C.bg, minHeight:"100vh", fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, fontWeight:600, color:C.text }}>
              Move-In Inspections
            </h1>
            <p style={{ color:C.textMuted, fontSize:13, marginTop:3 }}>
              Document unit condition at move-in — protect against disputes
            </p>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {["list","create"].map(t => (
              <button key={t} className="insp-tab" onClick={() => setTab(t)}
                style={{ padding:"8px 16px", borderRadius:6, fontSize:13, fontWeight:500, cursor:"pointer", transition:"all 0.12s",
                  background: tab===t ? C.goldDim : "transparent",
                  border: `1px solid ${tab===t ? C.goldDim : C.border}`,
                  color: tab===t ? C.gold : C.textSub,
                }}>
                {t === "list" ? "All Inspections" : "+ New Inspection"}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        {tab === "list" && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:24 }}>
            {[
              { label:"Total",    val:inspections.length,  color:C.textSub },
              { label:"Pending Tenant", val:pendingCount, color:C.amber },
              { label:"Completed",val:completedCount, color:C.green },
            ].map(s => (
              <div key={s.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 18px" }}>
                <div style={{ fontSize:22, fontWeight:700, color:s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── LIST TAB ── */}
        {tab === "list" && (
          loading ? <div style={{ color:C.textMuted, fontSize:13 }}>Loading…</div>
          : inspections.length === 0
            ? <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"40px 24px", textAlign:"center", color:C.textMuted, fontSize:14 }}>
                No inspections yet. Create one to get started.
              </div>
            : <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden" }}>
                {inspections.map((insp, i) => {
                  const st = insp.status || "landlord_complete";
                  const statusLabel = st === "both_complete" ? "Both Signed"
                                    : st === "tenant_complete" ? "Tenant Signed"
                                    : "Awaiting Tenant";
                  const statusColor = st === "both_complete" ? C.green : st === "tenant_complete" ? C.blue : C.amber;
                  const roomCount   = Array.isArray(insp.rooms) ? insp.rooms.length : 0;
                  const issues      = Array.isArray(insp.rooms)
                    ? insp.rooms.flatMap(r => r.items||[]).filter(it => it.status === "Poor").length : 0;
                  return (
                    <div key={insp.id} className="insp-row" onClick={() => openView(insp)}
                      style={{ borderBottom: i < inspections.length-1 ? `1px solid ${C.border}` : "none",
                        padding:"14px 20px", display:"flex", alignItems:"center", gap:16, transition:"background 0.1s" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {insp.tenants?.name || "Unknown Tenant"}
                        </div>
                        <div style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>
                          Unit {insp.tenants?.unit_number || "—"} · {new Date(insp.inspection_date || insp.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
                        {issues > 0 && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:`${C.red}18`, color:C.red, fontWeight:600 }}>{issues} issue{issues!==1?"s":""}</span>}
                        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:`${statusColor}18`, color:statusColor, fontWeight:600 }}>{statusLabel}</span>
                        <span style={{ fontSize:12, color:C.textMuted }}>{roomCount} rooms ›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
        )}

        {/* ── CREATE TAB ── */}
        {tab === "create" && (
          <div>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"20px 24px", marginBottom:20 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div>
                  <label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:6 }}>TENANT</label>
                  <select value={formTenant} onChange={e=>setFormTenant(e.target.value)}
                    style={{ width:"100%", padding:"9px 12px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none" }}>
                    <option value="">Select tenant…</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name} — Unit {t.unit_number}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:6 }}>INSPECTION DATE</label>
                  <input type="date" value={formDate} onChange={e=>setFormDate(e.target.value)}
                    style={{ width:"100%", padding:"9px 12px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none" }} />
                </div>
              </div>
            </div>

            {/* Room-by-room checklist */}
            {formRooms.map((room, ri) => (
              <div key={ri} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:12, overflow:"hidden" }}>
                <div style={{ background:C.raised, padding:"10px 20px", borderBottom:`1px solid ${C.border}`, fontSize:13, fontWeight:600, color:C.text }}>
                  {room.room}
                </div>
                <div style={{ padding:"12px 20px 16px" }}>
                  {room.items.map((item, ii) => (
                    <div key={ii} style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:12, alignItems:"center", marginBottom:10 }}>
                      <span style={{ fontSize:13, color:C.textSub }}>{item.name}</span>
                      <div style={{ display:"flex", gap:4 }}>
                        {STATUS_OPTS.map(s => (
                          <button key={s} className="insp-status-btn" onClick={() => updateItem(ri,ii,"status",s)}
                            style={{ padding:"3px 9px", fontSize:11, borderRadius:10, cursor:"pointer", fontWeight:600, transition:"opacity 0.1s",
                              background: item.status===s ? `${STATUS_COLOR[s]}22` : "transparent",
                              border:`1px solid ${item.status===s ? STATUS_COLOR[s] : C.border}`,
                              color: item.status===s ? STATUS_COLOR[s] : C.textMuted,
                            }}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <input type="text" placeholder="Notes (optional)" value={item.notes} onChange={e=>updateItem(ri,ii,"notes",e.target.value)}
                        style={{ padding:"5px 10px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:12, outline:"none" }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Overall notes */}
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"16px 20px", marginBottom:20 }}>
              <label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:8 }}>OVERALL NOTES</label>
              <textarea value={formNotes} onChange={e=>setFormNotes(e.target.value)} rows={3}
                placeholder="General observations, special conditions, items to follow up on…"
                style={{ width:"100%", padding:"10px 12px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none", resize:"vertical", lineHeight:1.5 }} />
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <button onClick={saveInspection} disabled={saving}
                style={{ padding:"10px 24px", background:C.goldDim, border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, fontSize:13, fontWeight:600, cursor:saving?"default":"pointer", opacity:saving?0.6:1 }}>
                {saving ? "Saving…" : "Save Inspection"}
              </button>
              {saveMsg && <span style={{ fontSize:13, color:saveMsg.startsWith("Error") ? C.red : C.green }}>{saveMsg}</span>}
            </div>
          </div>
        )}

        {/* ── VIEW TAB ── */}
        {tab === "view" && selected && (
          <div>
            <button onClick={() => setTab("list")}
              style={{ marginBottom:18, background:"transparent", border:"none", color:C.textSub, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
              ← Back to list
            </button>

            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"20px 24px", marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:600, color:C.text }}>{selected.tenants?.name || "Unknown Tenant"}</div>
                  <div style={{ fontSize:13, color:C.textMuted, marginTop:3 }}>
                    Unit {selected.tenants?.unit_number || "—"} · {new Date(selected.inspection_date || selected.created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  {(() => {
                    const st = selected.status || "landlord_complete";
                    const label = st==="both_complete"?"Both Signed":st==="tenant_complete"?"Tenant Signed":"Awaiting Tenant";
                    const color = st==="both_complete"?C.green:st==="tenant_complete"?C.blue:C.amber;
                    return <span style={{ fontSize:12, padding:"4px 12px", borderRadius:10, background:`${color}18`, color, fontWeight:600 }}>{label}</span>;
                  })()}
                </div>
              </div>
            </div>

            {Array.isArray(selected.rooms) && selected.rooms.map((room, ri) => {
              const issues = room.items?.filter(it => it.status === "Poor").length || 0;
              return (
                <div key={ri} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:12, overflow:"hidden" }}>
                  <div style={{ background:C.raised, padding:"10px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{room.room}</span>
                    {issues > 0 && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:`${C.red}18`, color:C.red, fontWeight:600 }}>{issues} issue{issues!==1?"s":""}</span>}
                  </div>
                  <div style={{ padding:"12px 20px" }}>
                    {(room.items||[]).map((item, ii) => (
                      <div key={ii} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"6px 0", borderBottom: ii < room.items.length-1 ? `1px solid ${C.border}` : "none" }}>
                        <span style={{ flex:1, fontSize:13, color:C.textSub }}>{item.name}</span>
                        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, fontWeight:600,
                          background:`${STATUS_COLOR[item.status]||C.textMuted}18`,
                          color:STATUS_COLOR[item.status]||C.textMuted,
                          flexShrink:0 }}>{item.status}</span>
                        {item.notes && <span style={{ fontSize:12, color:C.textMuted, flex:1, fontStyle:"italic" }}>{item.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Tenant photos section */}
            {selected.tenant_photos && selected.tenant_photos.length > 0 && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"16px 20px", marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:12 }}>Tenant Photos</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                  {selected.tenant_photos.map((url, i) => (
                    <img key={i} src={url} alt={`Photo ${i+1}`}
                      style={{ width:120, height:90, objectFit:"cover", borderRadius:6, border:`1px solid ${C.border}`, cursor:"pointer" }}
                      onClick={() => window.open(url,"_blank")} />
                  ))}
                </div>
              </div>
            )}

            {/* Tenant notes */}
            {selected.tenant_notes && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"16px 20px", marginBottom:20 }}>
                <div style={{ fontSize:12, color:C.textMuted, marginBottom:6 }}>TENANT NOTES</div>
                <p style={{ fontSize:13, color:C.textSub, lineHeight:1.6 }}>{selected.tenant_notes}</p>
              </div>
            )}

            {/* Landlord notes */}
            {selected.landlord_notes && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"16px 20px" }}>
                <div style={{ fontSize:12, color:C.textMuted, marginBottom:6 }}>LANDLORD NOTES</div>
                <p style={{ fontSize:13, color:C.textSub, lineHeight:1.6 }}>{selected.landlord_notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </LandlordLayout>
  );
}
