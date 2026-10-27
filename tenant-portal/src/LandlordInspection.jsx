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
  { room:"Entry / Hallway",  items:["Walls & ceiling","Flooring","Doors & locks","Lighting"] },
  { room:"Living Room",      items:["Walls & ceiling","Flooring","Windows & blinds","Outlets & switches","Lighting"] },
  { room:"Kitchen",          items:["Walls & ceiling","Flooring","Cabinets & countertops","Appliances","Sink & faucet","Outlets & switches"] },
  { room:"Primary Bedroom",  items:["Walls & ceiling","Flooring","Windows & blinds","Closet","Outlets & switches","Lighting"] },
  { room:"Bedroom 2",        items:["Walls & ceiling","Flooring","Windows & blinds","Closet","Outlets & switches"] },
  { room:"Bathroom",         items:["Walls & ceiling","Flooring","Toilet","Shower / tub","Vanity & sink","Ventilation"] },
  { room:"Laundry",          items:["Washer connections","Dryer connections","Flooring","Ventilation"] },
  { room:"Garage / Parking", items:["Garage door","Floor","Walls","Lighting","Outlets"] },
  { room:"Exterior",         items:["Front door & lock","Landscaping","Driveway / walkway","Mailbox","Exterior lighting"] },
];

const STATUS_OPTS  = ["Good","Fair","Poor","N/A"];
const STATUS_COLOR = { Good:C.green, Fair:C.amber, Poor:C.red, "N/A":C.textMuted };

// ─── helpers ───────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pre_move_in:     { label:"Pre-Move-In (Draft)",  color:C.textMuted },
    awaiting_tenant: { label:"Awaiting Tenant",      color:C.amber },
    tenant_complete: { label:"Tenant Signed",        color:C.blue },
    move_out_draft:  { label:"Move-Out (Draft)",     color:C.amber },
    closed:          { label:"Closed",               color:C.green },
  };
  const cfg = map[status] || { label:status, color:C.textMuted };
  return (
    <span style={{ fontSize:11, padding:"2px 9px", borderRadius:10,
      background:`${cfg.color}18`, color:cfg.color, fontWeight:600 }}>
      {cfg.label}
    </span>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom:20 }}>
      <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:600, color:C.text }}>{title}</h2>
      {sub && <p style={{ color:C.textMuted, fontSize:12, marginTop:3 }}>{sub}</p>}
    </div>
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick}
      style={{ marginBottom:18, background:"transparent", border:"none", color:C.textSub, fontSize:13, cursor:"pointer", padding:0 }}>
      ← Back
    </button>
  );
}

// ─── photo uploader component ──────────────────────────
function PhotoUploader({ photos, setPhotos, rooms, label = "Add Photos" }) {
  const fileRef = useRef();
  const [room, setRoom] = useState("");
  const [caption, setCaption] = useState("");

  function handleAdd(e) {
    const files = Array.from(e.target.files || []);
    const added = files.map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
      room: room || "General",
      caption,
    }));
    setPhotos(prev => [...prev, ...added]);
    e.target.value = "";
    setCaption("");
  }

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"16px 20px" }}>
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:12 }}>{label}</div>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end", marginBottom:12 }}>
        <div>
          <label style={{ fontSize:11, color:C.textMuted, display:"block", marginBottom:4 }}>ROOM</label>
          <select value={room} onChange={e=>setRoom(e.target.value)}
            style={{ padding:"7px 10px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:12, outline:"none" }}>
            <option value="">General</option>
            {(rooms||DEFAULT_ROOMS).map(r=><option key={r.room||r} value={r.room||r}>{r.room||r}</option>)}
            <option value="Other">Other</option>
          </select>
        </div>
        <div style={{ flex:1, minWidth:140 }}>
          <label style={{ fontSize:11, color:C.textMuted, display:"block", marginBottom:4 }}>CAPTION (optional)</label>
          <input type="text" value={caption} onChange={e=>setCaption(e.target.value)} placeholder="e.g. Scuff on west wall"
            style={{ width:"100%", padding:"7px 10px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:12, outline:"none" }} />
        </div>
        <button onClick={()=>fileRef.current?.click()}
          style={{ padding:"7px 14px", background:C.goldDim, border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
          + Photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleAdd} style={{ display:"none" }} />
      </div>

      {photos.length === 0
        ? <div style={{ textAlign:"center", padding:"20px 0", color:C.textMuted, fontSize:12, border:`1px dashed ${C.border}`, borderRadius:6 }}>No photos yet</div>
        : <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
            {photos.map((p,i) => (
              <div key={i} style={{ position:"relative", width:110 }}>
                <img src={p.preview||p.url} alt="" style={{ width:110, height:80, objectFit:"cover", borderRadius:6, border:`1px solid ${C.border}`, display:"block" }} />
                <div style={{ fontSize:9, color:C.textSub, marginTop:3, textAlign:"center", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                  {p.room}{p.caption ? ` · ${p.caption}` : ""}
                </div>
                {p.file && (
                  <button onClick={()=>setPhotos(prev=>prev.filter((_,j)=>j!==i))}
                    style={{ position:"absolute", top:-5, right:-5, width:16, height:16, borderRadius:"50%", background:C.red, border:"none", color:"#fff", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>
                    ×
                  </button>
                )}
                {(p.preview||p.url) && (
                  <button onClick={()=>window.open(p.preview||p.url,"_blank")}
                    style={{ position:"absolute", bottom:20, right:2, width:16, height:16, borderRadius:4, background:"rgba(0,0,0,0.5)", border:"none", color:"#fff", fontSize:9, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    ⤢
                  </button>
                )}
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ─── room checklist ─────────────────────────────────────
function RoomChecklist({ rooms, onChange, readOnly = false, compareRooms = null }) {
  return (
    <div>
      {rooms.map((room, ri) => {
        const issues = (room.items||[]).filter(it=>it.status==="Poor").length;
        return (
          <div key={ri} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:10, overflow:"hidden" }}>
            <div style={{ background:C.raised, padding:"9px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{room.room}</span>
              {issues>0&&<span style={{ fontSize:10, padding:"2px 7px", borderRadius:8, background:`${C.red}18`, color:C.red, fontWeight:700 }}>{issues} issue{issues!==1?"s":""}</span>}
            </div>
            <div style={{ padding:"10px 18px 14px" }}>
              {(room.items||[]).map((item, ii) => {
                const cmpItem = compareRooms?.[ri]?.items?.[ii];
                const degraded = cmpItem && item.status !== cmpItem.status &&
                  (item.status === "Poor" || (item.status === "Fair" && cmpItem.status === "Good"));
                return (
                  <div key={ii} style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:10, alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:13, color:C.textSub }}>
                      {degraded && <span style={{ color:C.amber, marginRight:4 }}>▲</span>}
                      {item.name}
                      {degraded && <span style={{ fontSize:10, color:C.amber, marginLeft:6 }}>was {cmpItem.status}</span>}
                    </span>
                    <div style={{ display:"flex", gap:3 }}>
                      {STATUS_OPTS.map(s => (
                        <button key={s} disabled={readOnly}
                          onClick={()=>!readOnly&&onChange(ri,ii,"status",s)}
                          style={{ padding:"3px 7px", fontSize:10, borderRadius:8, fontWeight:600,
                            cursor:readOnly?"default":"pointer",
                            background:item.status===s?`${STATUS_COLOR[s]}22`:"transparent",
                            border:`1px solid ${item.status===s?STATUS_COLOR[s]:C.border}`,
                            color:item.status===s?STATUS_COLOR[s]:C.textMuted,
                          }}>
                          {s}
                        </button>
                      ))}
                    </div>
                    {!readOnly
                      ? <input type="text" placeholder="Notes" value={item.notes||""} onChange={e=>onChange(ri,ii,"notes",e.target.value)}
                          style={{ padding:"4px 8px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:5, color:C.text, fontSize:11, outline:"none" }} />
                      : <span style={{ fontSize:11, color:C.textMuted, fontStyle:"italic" }}>{item.notes||""}</span>
                    }
                  </div>
                );
              })}
              {!readOnly && (
                <div>
                  <label style={{ fontSize:11, color:C.textMuted, display:"block", marginBottom:4 }}>ROOM NOTES</label>
                  <input type="text" placeholder={`Notes for ${room.room}…`} value={room.room_notes||""} onChange={e=>onChange(ri,-1,"room_notes",e.target.value)}
                    style={{ width:"100%", padding:"5px 8px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:5, color:C.text, fontSize:11, outline:"none" }} />
                </div>
              )}
              {readOnly && room.room_notes && (
                <div style={{ fontSize:11, color:C.textMuted, marginTop:4, fontStyle:"italic" }}>Note: {room.room_notes}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── main component ──────────────────────────────────────
export default function LandlordInspection() {
  const [view, setView]               = useState("list");    // list | create | detail | moveout
  const [inspections, setInspections] = useState([]);
  const [tenants, setTenants]         = useState([]);
  const [selected, setSelected]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState("");

  // Create form
  const [fTenant, setFTenant] = useState("");
  const [fDate,   setFDate]   = useState(new Date().toISOString().slice(0,10));
  const [fRooms,  setFRooms]  = useState(DEFAULT_ROOMS.map(r=>({
    room:r.room, room_notes:"", items:r.items.map(name=>({ name, status:"Good", notes:"" })),
  })));
  const [fNotes,  setFNotes]  = useState("");
  const [fPhotos, setFPhotos] = useState([]);   // { file, preview, room, caption }

  // Move-out form
  const [moRooms,  setMoRooms]  = useState([]);
  const [moNotes,  setMoNotes]  = useState("");
  const [moPhotos, setMoPhotos] = useState([]);
  const [moDeduct, setMoDeduct] = useState([]);   // [{ description, amount }]
  const [moDeposit, setMoDeposit] = useState("");

  useEffect(()=>{ loadData(); },[]);

  async function loadData() {
    setLoading(true);
    const [{ data:insp }, { data:ten }] = await Promise.all([
      supabase.from("inspections")
        .select("*, tenants(id,name,unit_id,archived, units:unit_id(unit_number,properties:property_id(name)))")
        .order("created_at",{ ascending:false }),
      supabase.from("tenants")
        .select("id,name,unit_id,archived, units:unit_id(unit_number,properties:property_id(name))")
        .eq("archived",false)
        .order("name"),
    ]);
    setInspections(insp||[]);
    setTenants(ten||[]);
    setLoading(false);
  }

  // ── upload photos to storage ───────────────────────────
  async function uploadPhotos(photosArr, inspectionId, prefix) {
    const urls = [];
    for (const p of photosArr) {
      if (!p.file) { if(p.url) urls.push({ url:p.url, room:p.room, caption:p.caption }); continue; }
      const ext  = p.file.name.split(".").pop();
      const path = `${inspectionId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("inspection-photos").upload(path, p.file);
      if (!error) {
        const { data:urlData } = supabase.storage.from("inspection-photos").getPublicUrl(path);
        urls.push({ url:urlData.publicUrl, room:p.room, caption:p.caption });
      }
    }
    return urls;
  }

  function updateFRoom(ri, ii, field, val) {
    setFRooms(prev=>prev.map((r,rx)=>{
      if(rx!==ri) return r;
      if(ii===-1) return {...r, room_notes:val};
      return {...r, items:r.items.map((it,ix)=>ix!==ii?it:{...it,[field]:val})};
    }));
  }

  function updateMoRoom(ri, ii, field, val) {
    setMoRooms(prev=>prev.map((r,rx)=>{
      if(rx!==ri) return r;
      if(ii===-1) return {...r, room_notes:val};
      return {...r, items:r.items.map((it,ix)=>ix!==ii?it:{...it,[field]:val})};
    }));
  }

  // ── SAVE pre-move-in inspection ───────────────────────
  async function savePreMoveIn() {
    if (!fTenant) { setMsg("Select a tenant first."); return; }
    setSaving(true); setMsg("");
    const { data:ins, error } = await supabase.from("inspections").insert({
      tenant_id:      fTenant,
      inspection_date:fDate,
      rooms:          fRooms,
      landlord_notes: fNotes,
      status:         "awaiting_tenant",
    }).select().single();
    if (error) { setMsg("Error: " + error.message); setSaving(false); return; }
    // upload photos
    const photoUrls = await uploadPhotos(fPhotos, ins.id, "landlord");
    if (photoUrls.length > 0) {
      await supabase.from("inspections").update({ landlord_photos:photoUrls }).eq("id",ins.id);
    }
    setMsg("Saved! Tenant can now complete their walkthrough.");
    await loadData();
    setTimeout(()=>{ setMsg(""); setView("list"); }, 1800);
    setSaving(false);
  }

  // ── OPEN move-out form ────────────────────────────────
  function startMoveOut(insp) {
    // seed move-out rooms from move-in rooms, reset statuses for landlord to fill
    const seed = (insp.rooms||[]).map(r=>({
      ...r,
      room_notes:"",
      items:(r.items||[]).map(it=>({ ...it, notes:"", status:"Good" })),
    }));
    setMoRooms(seed);
    setMoNotes("");
    setMoPhotos([]);
    setMoDeduct([{ description:"", amount:"" }]);
    setMoDeposit(insp.tenants?.security_deposit || "");
    setSelected(insp);
    setView("moveout");
  }

  // ── SAVE move-out inspection ──────────────────────────
  async function saveMoveOut() {
    setSaving(true); setMsg("");
    const photoUrls = await uploadPhotos(moPhotos, selected.id, "moveout");
    const deductions = moDeduct.filter(d=>d.description.trim()&&parseFloat(d.amount)>0)
      .map(d=>({ description:d.description.trim(), amount:parseFloat(d.amount) }));
    const totalDeducted = deductions.reduce((s,d)=>s+d.amount, 0);
    const { error } = await supabase.from("inspections").update({
      move_out_rooms:       moRooms,
      move_out_notes:       moNotes,
      move_out_photos:      photoUrls,
      deposit_deductions:   deductions,
      total_deducted:       totalDeducted,
      move_out_date:        new Date().toISOString().slice(0,10),
      status:               "closed",
    }).eq("id", selected.id);
    if (error) { setMsg("Error: "+error.message); setSaving(false); return; }
    setMsg("Move-out inspection saved.");
    await loadData();
    setTimeout(()=>{ setMsg(""); setView("list"); }, 1800);
    setSaving(false);
  }

  const getTenantDisplay = (t) => {
    if (!t) return "";
    const unit = t.units?.unit_number ? `Unit ${t.units.unit_number}` : "";
    const prop = t.units?.properties?.name ? ` · ${t.units.properties.name}` : "";
    return `${t.name}${unit ? " — " + unit : ""}${prop}`;
  };

  // ─── LIST ─────────────────────────────────────────────
  if (view === "list") return (
    <LandlordLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .insp-row:hover{background:${C.raised}!important;cursor:pointer;}
        select,textarea,input{font-family:'DM Sans',sans-serif;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>
      <div style={{ padding:"24px 28px", background:C.bg, minHeight:"100vh", fontFamily:"'DM Sans',sans-serif" }}>

        <div style={{ marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, fontWeight:600, color:C.text }}>Move-In / Move-Out Inspections</h1>
            <p style={{ color:C.textMuted, fontSize:12, marginTop:3 }}>End-to-end inspection workflow — document condition, get tenant sign-off, compare at move-out, issue deposit decisions</p>
          </div>
          <button onClick={()=>{ setFTenant(""); setFDate(new Date().toISOString().slice(0,10)); setFRooms(DEFAULT_ROOMS.map(r=>({room:r.room,room_notes:"",items:r.items.map(name=>({name,status:"Good",notes:""}))})));setFNotes("");setFPhotos([]); setView("create"); }}
            style={{ padding:"9px 18px", background:C.goldDim, border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, fontSize:13, fontWeight:600, cursor:"pointer" }}>
            + New Inspection
          </button>
        </div>

        {/* Phase legend */}
        <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          {[
            { label:"1 · Pre-Move-In (Landlord)", color:C.amber },
            { label:"2 · Awaiting Tenant Sign-Off", color:C.blue },
            { label:"3 · Tenant Signed", color:C.blue },
            { label:"4 · Move-Out & Deposit", color:C.green },
          ].map(p=>(
            <span key={p.label} style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:`${p.color}14`, color:p.color, fontWeight:500 }}>{p.label}</span>
          ))}
        </div>

        {loading
          ? <div style={{ color:C.textMuted, fontSize:13, padding:40, textAlign:"center" }}>Loading…</div>
          : inspections.length === 0
            ? <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"48px 24px", textAlign:"center", color:C.textMuted, fontSize:14 }}>
                No inspections yet. Create one to start the workflow.
              </div>
            : <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden" }}>
                {inspections.map((ins,i)=>{
                  const t = ins.tenants;
                  const unitNum = t?.units?.unit_number;
                  const propName = t?.units?.properties?.name;
                  const issues  = Array.isArray(ins.rooms) ? ins.rooms.flatMap(r=>r.items||[]).filter(it=>it.status==="Poor").length : 0;
                  const moIssues = Array.isArray(ins.move_out_rooms) ? ins.move_out_rooms.flatMap(r=>r.items||[]).filter(it=>it.status==="Poor").length : 0;
                  return (
                    <div key={ins.id} className="insp-row" onClick={()=>{ setSelected(ins); setView("detail"); }}
                      style={{ borderBottom:i<inspections.length-1?`1px solid ${C.border}`:"none",
                        padding:"13px 20px", display:"flex", alignItems:"center", gap:16, transition:"background 0.1s" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{t?.name||"Unknown"}</div>
                        <div style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>
                          {unitNum?`Unit ${unitNum}`:""}{propName?` · ${propName}`:""}{" · "}
                          {new Date(ins.inspection_date||ins.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
                        {issues>0&&<span style={{ fontSize:10, padding:"2px 7px", borderRadius:8, background:`${C.red}18`, color:C.red, fontWeight:700 }}>{issues} move-in issue{issues!==1?"s":""}</span>}
                        {ins.status==="closed"&&ins.total_deducted>0&&<span style={{ fontSize:10, padding:"2px 7px", borderRadius:8, background:`${C.amber}18`, color:C.amber, fontWeight:700 }}>-${ins.total_deducted} deducted</span>}
                        <StatusBadge status={ins.status}/>
                        <span style={{ fontSize:12, color:C.textMuted }}>›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
        }
      </div>
    </LandlordLayout>
  );

  // ─── CREATE (Pre-move-in) ─────────────────────────────
  if (view === "create") return (
    <LandlordLayout>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}body{background:${C.bg};}select,textarea,input{font-family:'DM Sans',sans-serif;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}`}</style>
      <div style={{ padding:"24px 28px", background:C.bg, minHeight:"100vh", fontFamily:"'DM Sans',sans-serif" }}>
        <BackBtn onClick={()=>setView("list")}/>
        <SectionHeader title="Pre-Move-In Inspection" sub="Step 1 of 3 — Document unit condition before tenant moves in. Attach photos of any existing damage." />

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"18px 22px", marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div>
              <label style={{ fontSize:11, color:C.textMuted, display:"block", marginBottom:5 }}>TENANT</label>
              <select value={fTenant} onChange={e=>setFTenant(e.target.value)}
                style={{ width:"100%", padding:"8px 12px", background:C.raised, border:`1px solid ${fTenant?C.goldDim:C.border}`, borderRadius:6, color:fTenant?C.text:C.textMuted, fontSize:13, outline:"none" }}>
                <option value="">Select active tenant…</option>
                {tenants.map(t=><option key={t.id} value={t.id}>{getTenantDisplay(t)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, color:C.textMuted, display:"block", marginBottom:5 }}>INSPECTION DATE</label>
              <input type="date" value={fDate} onChange={e=>setFDate(e.target.value)}
                style={{ width:"100%", padding:"8px 12px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none" }} />
            </div>
          </div>
        </div>

        <RoomChecklist rooms={fRooms} onChange={updateFRoom} />

        <div style={{ marginBottom:14 }}>
          <PhotoUploader photos={fPhotos} setPhotos={setFPhotos} rooms={fRooms} label="Landlord Photos (pre-move-in)" />
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 18px", marginBottom:20 }}>
          <label style={{ fontSize:11, color:C.textMuted, display:"block", marginBottom:6 }}>OVERALL NOTES</label>
          <textarea value={fNotes} onChange={e=>setFNotes(e.target.value)} rows={2}
            placeholder="General observations, special conditions, items to follow up on…"
            style={{ width:"100%", padding:"8px 10px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none", resize:"vertical", lineHeight:1.5 }} />
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={savePreMoveIn} disabled={saving}
            style={{ padding:"10px 24px", background:fTenant?C.goldDim:"transparent", border:`1px solid ${fTenant?C.goldDim:C.border}`, borderRadius:6, color:fTenant?C.gold:C.textMuted, fontSize:13, fontWeight:600, cursor:saving||!fTenant?"default":"pointer", opacity:saving?0.6:1 }}>
            {saving ? "Saving…" : "Save Pre-Move-In Inspection →"}
          </button>
          {msg&&<span style={{ fontSize:13, color:msg.startsWith("Error")?C.red:C.green }}>{msg}</span>}
        </div>
      </div>
    </LandlordLayout>
  );

  // ─── DETAIL ───────────────────────────────────────────
  if (view === "detail" && selected) {
    const t = selected.tenants;
    const canMoveOut = selected.status === "tenant_complete";
    const lPhotos    = (selected.landlord_photos||[]).map(p=>typeof p==="string"?{url:p,room:"",caption:""}:p);
    const tPhotos    = (selected.tenant_photos||[]).map(p=>typeof p==="string"?{url:p,room:"",caption:""}:p);
    const moPhotosView = (selected.move_out_photos||[]).map(p=>typeof p==="string"?{url:p,room:"",caption:""}:p);

    return (
      <LandlordLayout>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}body{background:${C.bg};}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}`}</style>
        <div style={{ padding:"24px 28px", background:C.bg, minHeight:"100vh", fontFamily:"'DM Sans',sans-serif" }}>
          <BackBtn onClick={()=>setView("list")}/>

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:24 }}>
            <div>
              <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:600, color:C.text }}>{t?.name||"Tenant"}</h1>
              <p style={{ color:C.textMuted, fontSize:12, marginTop:3 }}>
                {t?.units?.unit_number?`Unit ${t.units.unit_number} · `:""}
                {t?.units?.properties?.name||""} · Inspection dated {new Date(selected.inspection_date||selected.created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
              </p>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <StatusBadge status={selected.status}/>
              {canMoveOut && (
                <button onClick={()=>startMoveOut(selected)}
                  style={{ padding:"8px 16px", background:C.goldDim, border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                  Begin Move-Out Inspection →
                </button>
              )}
            </div>
          </div>

          {/* Phase indicator */}
          <div style={{ display:"flex", gap:0, marginBottom:24, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden" }}>
            {[
              { label:"Pre-Move-In (Landlord)", done:true },
              { label:"Tenant Walkthrough", done:selected.status==="tenant_complete"||selected.status==="closed" },
              { label:"Move-Out & Deposit", done:selected.status==="closed" },
            ].map((ph,i)=>(
              <div key={i} style={{ flex:1, padding:"10px 14px", borderRight:i<2?`1px solid ${C.border}`:"none",
                background:ph.done?`${C.green}0A`:"transparent", textAlign:"center" }}>
                <div style={{ fontSize:10, fontWeight:700, color:ph.done?C.green:C.textMuted, marginBottom:2 }}>{ph.done?"✓":String(i+1)}</div>
                <div style={{ fontSize:11, color:ph.done?C.text:C.textMuted }}>{ph.label}</div>
              </div>
            ))}
          </div>

          {/* Move-in condition */}
          <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Move-In Condition (Landlord Assessment)</div>
          <RoomChecklist rooms={selected.rooms||[]} onChange={()=>{}} readOnly={true} />

          {/* Landlord photos */}
          {lPhotos.length > 0 && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 18px", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Landlord Photos (Pre-Move-In)</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                {lPhotos.map((p,i)=>(
                  <div key={i} style={{ width:110 }}>
                    <img src={p.url} alt="" style={{ width:110, height:80, objectFit:"cover", borderRadius:6, border:`1px solid ${C.border}`, cursor:"pointer", display:"block" }}
                      onClick={()=>window.open(p.url,"_blank")} />
                    {(p.room||p.caption)&&<div style={{ fontSize:9, color:C.textMuted, marginTop:3, textAlign:"center" }}>{p.room}{p.caption?` · ${p.caption}`:""}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selected.landlord_notes && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 18px", marginBottom:16 }}>
              <div style={{ fontSize:11, color:C.textMuted, marginBottom:4 }}>LANDLORD NOTES (MOVE-IN)</div>
              <p style={{ fontSize:13, color:C.textSub, lineHeight:1.6 }}>{selected.landlord_notes}</p>
            </div>
          )}

          {/* Tenant walkthrough section */}
          {(selected.status==="tenant_complete"||selected.status==="closed") && (
            <>
              <div style={{ borderTop:`1px solid ${C.border}`, margin:"20px 0" }}/>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>
                Tenant Walkthrough Sign-Off
                {selected.tenant_signed_at&&<span style={{ fontSize:11, color:C.textMuted, fontWeight:400, marginLeft:8 }}>Signed {new Date(selected.tenant_signed_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>}
                {selected.tenant_signature&&<span style={{ fontSize:11, color:C.green, fontWeight:600, marginLeft:8 }}>· "{selected.tenant_signature}"</span>}
              </div>

              {tPhotos.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 18px", marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Tenant Photos</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                    {tPhotos.map((p,i)=>(
                      <div key={i} style={{ width:110 }}>
                        <img src={p.url} alt="" style={{ width:110, height:80, objectFit:"cover", borderRadius:6, border:`1px solid ${C.border}`, cursor:"pointer", display:"block" }}
                          onClick={()=>window.open(p.url,"_blank")} />
                        {(p.room||p.caption)&&<div style={{ fontSize:9, color:C.textMuted, marginTop:3, textAlign:"center" }}>{p.room}{p.caption?` · ${p.caption}`:""}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selected.tenant_notes && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 18px", marginBottom:16 }}>
                  <div style={{ fontSize:11, color:C.textMuted, marginBottom:4 }}>TENANT NOTES</div>
                  <p style={{ fontSize:13, color:C.textSub, lineHeight:1.6 }}>{selected.tenant_notes}</p>
                </div>
              )}
            </>
          )}

          {/* Move-out section */}
          {selected.status === "closed" && (
            <>
              <div style={{ borderTop:`1px solid ${C.border}`, margin:"20px 0" }}/>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>
                Move-Out Inspection
                {selected.move_out_date&&<span style={{ fontSize:11, color:C.textMuted, fontWeight:400, marginLeft:8 }}>{new Date(selected.move_out_date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>}
              </div>
              <RoomChecklist rooms={selected.move_out_rooms||[]} onChange={()=>{}} readOnly={true} compareRooms={selected.rooms||[]} />
              {moPhotosView.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 18px", marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Move-Out Photos</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                    {moPhotosView.map((p,i)=>(
                      <div key={i} style={{ width:110 }}>
                        <img src={p.url} alt="" style={{ width:110, height:80, objectFit:"cover", borderRadius:6, border:`1px solid ${C.border}`, cursor:"pointer", display:"block" }}
                          onClick={()=>window.open(p.url,"_blank")} />
                        {(p.room||p.caption)&&<div style={{ fontSize:9, color:C.textMuted, marginTop:3, textAlign:"center" }}>{p.room}{p.caption?` · ${p.caption}`:""}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Deposit summary */}
              {selected.deposit_deductions?.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 18px" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Security Deposit Summary</div>
                  {selected.deposit_deductions.map((d,i)=>(
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
                      <span style={{ color:C.textSub }}>{d.description}</span>
                      <span style={{ color:C.red, fontWeight:600 }}>-${Number(d.amount).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:14, fontWeight:700 }}>
                    <span style={{ color:C.text }}>Total Deducted</span>
                    <span style={{ color:C.red }}>-${Number(selected.total_deducted||0).toFixed(2)}</span>
                  </div>
                  {selected.deposit_held&&(
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:14, fontWeight:700 }}>
                      <span style={{ color:C.text }}>Deposit Refund</span>
                      <span style={{ color:C.green }}>${Math.max(0, Number(selected.deposit_held||0)-Number(selected.total_deducted||0)).toFixed(2)}</span>
                    </div>
                  )}
                  {selected.move_out_notes&&<p style={{ fontSize:12, color:C.textMuted, marginTop:10, lineHeight:1.6 }}>{selected.move_out_notes}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </LandlordLayout>
    );
  }

  // ─── MOVE-OUT ─────────────────────────────────────────
  if (view === "moveout" && selected) {
    const t = selected.tenants;
    const totalDeducted = moDeduct.reduce((s,d)=>s+(parseFloat(d.amount)||0),0);
    const depositHeld   = parseFloat(moDeposit)||0;
    const refund        = Math.max(0, depositHeld - totalDeducted);

    return (
      <LandlordLayout>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}body{background:${C.bg};}select,textarea,input{font-family:'DM Sans',sans-serif;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}`}</style>
        <div style={{ padding:"24px 28px", background:C.bg, minHeight:"100vh", fontFamily:"'DM Sans',sans-serif" }}>
          <BackBtn onClick={()=>setView("detail")}/>
          <SectionHeader title={`Move-Out Inspection — ${t?.name||"Tenant"}`}
            sub="Step 3 of 3 — Document move-out condition, compare to move-in, and calculate deposit deductions." />

          {/* Side-by-side legend */}
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            <span style={{ fontSize:11, padding:"3px 9px", borderRadius:8, background:`${C.textMuted}14`, color:C.textMuted }}>No flag = same as move-in</span>
            <span style={{ fontSize:11, padding:"3px 9px", borderRadius:8, background:`${C.amber}14`, color:C.amber }}>▲ = condition degraded vs move-in</span>
          </div>

          <RoomChecklist rooms={moRooms} onChange={updateMoRoom} compareRooms={selected.rooms||[]} />

          <div style={{ marginBottom:14 }}>
            <PhotoUploader photos={moPhotos} setPhotos={setMoPhotos} rooms={moRooms} label="Move-Out Photos" />
          </div>

          {/* Deposit deductions */}
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"16px 20px", marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:12 }}>Security Deposit Deductions</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, marginBottom:8 }}>
              <label style={{ fontSize:11, color:C.textMuted }}>DEPOSIT HELD ($)</label>
              <span/>
            </div>
            <input type="number" placeholder="e.g. 1500" value={moDeposit} onChange={e=>setMoDeposit(e.target.value)}
              style={{ width:160, padding:"7px 10px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none", marginBottom:14 }} />

            <div style={{ fontSize:12, color:C.textMuted, marginBottom:8 }}>DEDUCTIONS</div>
            {moDeduct.map((d,i)=>(
              <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
                <input type="text" placeholder="Description (e.g. Carpet replacement)" value={d.description} onChange={e=>setMoDeduct(prev=>prev.map((x,xi)=>xi===i?{...x,description:e.target.value}:x))}
                  style={{ flex:1, padding:"7px 10px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:12, outline:"none" }} />
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ color:C.textMuted, fontSize:13 }}>$</span>
                  <input type="number" placeholder="0.00" value={d.amount} onChange={e=>setMoDeduct(prev=>prev.map((x,xi)=>xi===i?{...x,amount:e.target.value}:x))}
                    style={{ width:90, padding:"7px 10px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:12, outline:"none" }} />
                </div>
                {moDeduct.length>1&&<button onClick={()=>setMoDeduct(prev=>prev.filter((_,xi)=>xi!==i))}
                  style={{ background:"transparent", border:"none", color:C.red, cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>}
              </div>
            ))}
            <button onClick={()=>setMoDeduct(prev=>[...prev,{description:"",amount:""}])}
              style={{ background:"transparent", border:`1px dashed ${C.border}`, borderRadius:6, color:C.textSub, fontSize:12, cursor:"pointer", padding:"5px 14px", marginBottom:14 }}>
              + Add line item
            </button>

            {/* Summary */}
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, display:"flex", flexDirection:"column", gap:4 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                <span style={{ color:C.textSub }}>Deposit held</span>
                <span style={{ color:C.text }}>${depositHeld.toFixed(2)}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                <span style={{ color:C.textSub }}>Total deductions</span>
                <span style={{ color:totalDeducted>0?C.red:C.textMuted }}>-${totalDeducted.toFixed(2)}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:15, fontWeight:700, marginTop:4, borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
                <span style={{ color:C.text }}>Refund to tenant</span>
                <span style={{ color:refund>0?C.green:C.textMuted }}>${refund.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 18px", marginBottom:20 }}>
            <label style={{ fontSize:11, color:C.textMuted, display:"block", marginBottom:6 }}>MOVE-OUT NOTES</label>
            <textarea value={moNotes} onChange={e=>setMoNotes(e.target.value)} rows={2}
              placeholder="Condition summary, disputes, anything on record…"
              style={{ width:"100%", padding:"8px 10px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none", resize:"vertical", lineHeight:1.5 }} />
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={saveMoveOut} disabled={saving}
              style={{ padding:"10px 24px", background:C.goldDim, border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, fontSize:13, fontWeight:600, cursor:saving?"default":"pointer", opacity:saving?0.6:1 }}>
              {saving?"Saving…":"Save Move-Out & Close Inspection ✓"}
            </button>
            {msg&&<span style={{ fontSize:13, color:msg.startsWith("Error")?C.red:C.green }}>{msg}</span>}
          </div>
        </div>
      </LandlordLayout>
    );
  }

  return null;
}
