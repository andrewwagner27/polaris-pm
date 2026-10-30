import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

const C = {
  bg:"#0A0B0D", surface:"#111316", raised:"#181C21", border:"#252930",
  text:"#EDEAE2", textSub:"#9095A0", textMuted:"#5C6270",
  gold:"#C9A96E", goldDim:"#7A5C2E",
  blue:"#4A9AE8", green:"#72B02A", red:"#E05555", amber:"#F0A430",
};


// ─── email helper ─────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  try {
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html }),
    });
  } catch (e) { console.warn("Inspection email failed", e); }
}

export default function MoveInInspection() {
  const navigate = useNavigate();
  const { tenant } = useTenant();

  const [inspection, setInspection]   = useState(null);   // landlord-created record
  const [loading, setLoading]         = useState(true);
  const [step, setStep]               = useState(0);       // 0=intro, 1..N=rooms, N+1=photos, N+2=sign
  const [roomNotes, setRoomNotes]     = useState({});      // { roomIdx: string }
  const [roomIssues, setRoomIssues]   = useState({});      // { "ri-ii": "Good"|"Fair"|"Poor"|"N/A" }
  const [photos, setPhotos]           = useState([]);      // { file, preview, room }
  const [photoRoom, setPhotoRoom]     = useState("");
  const [tenantNotes, setTenantNotes] = useState("");
  const [signature, setSignature]     = useState("");      // typed name
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);
  const fileRef = useRef();

  useEffect(() => { loadInspection(); }, []);

  async function loadInspection() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    const { data: tenantData } = await supabase.from("tenants").select("id").eq("user_id", user.id).single();
    if (!tenantData) { setLoading(false); return; }
    const { data } = await supabase
      .from("inspections")
      .select("*")
      .eq("tenant_id", tenantData.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    setInspection(data || null);
    setLoading(false);
  }

  const rooms = inspection?.rooms || [];
  const totalSteps = rooms.length + 2; // intro + rooms + photos + sign

  function getRoomStatus(ri, ii) {
    return roomIssues[`${ri}-${ii}`] || (inspection?.rooms?.[ri]?.items?.[ii]?.status || "Good");
  }
  function setRoomStatus(ri, ii, val) {
    setRoomIssues(prev => ({ ...prev, [`${ri}-${ii}`]: val }));
  }

  async function handlePhotoAdd(e) {
    const files = Array.from(e.target.files || []);
    const added = files.map(f => ({ file: f, preview: URL.createObjectURL(f), room: photoRoom }));
    setPhotos(prev => [...prev, ...added]);
    e.target.value = "";
  }

  async function submitInspection() {
    if (!signature.trim()) { alert("Please type your name to sign."); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Upload photos to Supabase storage
      const photoUrls = [];
      for (const p of photos) {
        const ext = p.file.name.split(".").pop();
        const path = `inspections/${inspection.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("inspection-photos").upload(path, p.file);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("inspection-photos").getPublicUrl(path);
          photoUrls.push(urlData.publicUrl);
        }
      }

      // Build tenant room updates — merge back with landlord baseline
      const updatedRooms = rooms.map((room, ri) => ({
        ...room,
        items: (room.items || []).map((item, ii) => ({
          ...item,
          tenant_status: getRoomStatus(ri, ii),
          tenant_notes: roomNotes[`${ri}`] || "",
        })),
        tenant_room_notes: roomNotes[`${ri}`] || "",
      }));

      await supabase.from("inspections").update({
        rooms:           updatedRooms,
        tenant_notes:    tenantNotes,
        tenant_photos:   photoUrls,
        tenant_signature: signature.trim(),
        tenant_signed_at: new Date().toISOString(),
        status:          "tenant_complete",
      }).eq("id", inspection.id);

      // notify landlord
      await sendEmail({
        to: "moduspropmgmt@gmail.com",
        subject: `Tenant Walkthrough Complete — ${inspection?.tenants?.name || "Tenant"} Has Signed Off`,
        html: `<div style="font-family:'DM Sans',Arial,sans-serif;background:#0A0B0D;padding:32px;border-radius:8px;max-width:600px;margin:auto">
  <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#C9A96E;margin-bottom:4px">Modus Property Management</div>
  <hr style="border:none;border-top:1px solid #252930;margin:14px 0 20px"/>
  <p style="color:#EDEAE2;font-size:15px;margin-bottom:12px">A tenant has completed their move-in walkthrough.</p>
  <table style="width:100%;border-collapse:collapse;background:#111316;border-radius:6px;overflow:hidden;margin-bottom:20px">
    <tr><td style="padding:8px 12px;color:#5C6270;font-size:12px;width:120px">Tenant</td><td style="padding:8px 12px;color:#EDEAE2;font-size:13px">${signature.trim()}</td></tr>
    <tr style="background:#181C21"><td style="padding:8px 12px;color:#5C6270;font-size:12px">Signed at</td><td style="padding:8px 12px;color:#EDEAE2;font-size:13px">${new Date().toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</td></tr>
    <tr><td style="padding:8px 12px;color:#5C6270;font-size:12px">Photos</td><td style="padding:8px 12px;color:#EDEAE2;font-size:13px">${photoUrls.length} uploaded</td></tr>
  </table>
  <p style="color:#9095A0;font-size:13px;line-height:1.6">Log in to the landlord portal to review the tenant's notes and photos. When the tenant moves out, you can begin the move-out inspection from the inspection detail view.</p>
  <hr style="border:none;border-top:1px solid #252930;margin:24px 0 14px"/>
  <p style="font-size:11px;color:#5C6270">Modus Property Management — automated notification</p>
</div>`,
      });
      setDone(true);
    } catch (e) {
      alert("Error submitting. Please try again.");
    }
    setSubmitting(false);
  }

  const STATUS_OPTS = ["Good","Fair","Poor","N/A"];
  const STATUS_COLOR = { Good: C.green, Fair: C.amber, Poor: C.red, "N/A": C.textMuted };

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .mov-status:hover{opacity:0.85;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      <div style={{ padding:"24px 20px", fontFamily:"'DM Sans',sans-serif" }}>

        {/* Done state */}
        {done && (
          <div style={{ textAlign:"center", padding:"60px 20px" }}>
            <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:600, color:C.text, marginBottom:8 }}>Inspection Submitted</div>
            <p style={{ color:C.textMuted, fontSize:14, lineHeight:1.6, marginBottom:24 }}>
              Your move-in inspection has been recorded. You'll receive a copy for your records.
              This protects you if there are any questions about unit condition when you move out.
            </p>
            <button onClick={() => navigate("/home")}
              style={{ padding:"10px 24px", background:C.goldDim, border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, fontSize:13, fontWeight:600, cursor:"pointer" }}>
              Back to Home
            </button>
          </div>
        )}

        {!done && loading && (
          <div style={{ color:C.textMuted, fontSize:13, padding:40, textAlign:"center" }}>Loading…</div>
        )}

        {!done && !loading && !inspection && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"40px 24px", textAlign:"center" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:8 }}>No Inspection Ready</div>
            <p style={{ fontSize:13, color:C.textMuted, lineHeight:1.6 }}>
              Your property manager hasn't created a move-in inspection for your unit yet.
              Check back after your move-in date, or contact Modus Property Management.
            </p>
          </div>
        )}

        {!done && !loading && inspection && (inspection.status === "tenant_complete" || inspection.status === "closed") && (
          <div>
            {/* Header */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:600, color:C.text, marginBottom:4 }}>
                Your Move-In Inspection
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                <span style={{ fontSize:11, padding:"2px 9px", borderRadius:10, background:`${C.green}18`, color:C.green, fontWeight:600 }}>✓ Signed</span>
                <span style={{ fontSize:12, color:C.textMuted }}>
                  {new Date(inspection.tenant_signed_at || inspection.updated_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
                </span>
                {inspection.tenant_signature && (
                  <span style={{ fontSize:12, color:C.textSub, fontStyle:"italic" }}>"{inspection.tenant_signature}"</span>
                )}
              </div>
            </div>

            {/* Landlord baseline — read only */}
            <div style={{ fontSize:12, fontWeight:600, color:C.textMuted, letterSpacing:1, marginBottom:8, marginTop:4 }}>UNIT CONDITION AT MOVE-IN (PROPERTY MANAGER)</div>
            {(inspection.rooms||[]).map((room, ri) => (
              <div key={ri} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:8, overflow:"hidden" }}>
                <div style={{ background:C.raised, padding:"8px 16px", borderBottom:`1px solid ${C.border}`, fontSize:13, fontWeight:600, color:C.text }}>
                  {room.room}
                </div>
                <div style={{ padding:"10px 16px 12px" }}>
                  {(room.items||[]).map((item,ii) => {
                    const STATUS_COLOR = { Good:"#72B02A", Fair:"#F0A430", Poor:"#E05555", "N/A":"#5C6270" };
                    return (
                      <div key={ii} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
                        <span style={{ color:C.textSub }}>{item.name}</span>
                        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                          {item.notes && <span style={{ fontSize:11, color:C.textMuted, fontStyle:"italic" }}>{item.notes}</span>}
                          <span style={{ fontSize:11, fontWeight:700, color:STATUS_COLOR[item.status]||C.textMuted }}>{item.status}</span>
                        </div>
                      </div>
                    );
                  })}
                  {room.room_notes && <div style={{ fontSize:11, color:C.textMuted, marginTop:6, fontStyle:"italic" }}>Note: {room.room_notes}</div>}
                </div>
              </div>
            ))}

            {/* Tenant responses */}
            {inspection.tenant_notes && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 16px", marginTop:8 }}>
                <div style={{ fontSize:11, color:C.textMuted, marginBottom:4, letterSpacing:1 }}>YOUR NOTES</div>
                <p style={{ fontSize:13, color:C.textSub, lineHeight:1.6 }}>{inspection.tenant_notes}</p>
              </div>
            )}

            {/* Tenant photos */}
            {(inspection.tenant_photos||[]).length > 0 && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 16px", marginTop:8 }}>
                <div style={{ fontSize:11, color:C.textMuted, marginBottom:10, letterSpacing:1 }}>YOUR PHOTOS</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {(inspection.tenant_photos||[]).map((p,i) => {
                    const url = typeof p === "string" ? p : p.url;
                    const caption = typeof p === "string" ? "" : (p.caption||p.room||"");
                    return (
                      <div key={i} style={{ width:100 }}>
                        <img src={url} alt="" onClick={()=>window.open(url,"_blank")}
                          style={{ width:100, height:72, objectFit:"cover", borderRadius:6, border:`1px solid ${C.border}`, cursor:"pointer", display:"block" }} />
                        {caption && <div style={{ fontSize:9, color:C.textMuted, marginTop:3, textAlign:"center" }}>{caption}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Move-out summary if closed */}
            {inspection.status === "closed" && inspection.deposit_deductions?.length > 0 && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 16px", marginTop:12 }}>
                <div style={{ fontSize:11, color:C.textMuted, marginBottom:10, letterSpacing:1 }}>DEPOSIT SUMMARY</div>
                {inspection.deposit_deductions.map((d,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
                    <span style={{ color:C.textSub }}>{d.description}</span>
                    <span style={{ color:"#E05555", fontWeight:600 }}>-${Number(d.amount).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:14, fontWeight:700 }}>
                  <span style={{ color:C.text }}>Your refund</span>
                  <span style={{ color:"#72B02A" }}>${Math.max(0, (inspection.deposit_held||0) - (inspection.total_deducted||0)).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div style={{ marginTop:20 }}>
              <button onClick={() => navigate("/home")}
                style={{ padding:"9px 20px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, color:C.textSub, fontSize:13, cursor:"pointer" }}>
                ← Back to Home
              </button>
            </div>
          </div>
        )}

        {!done && !loading && inspection && inspection.status !== "tenant_complete" && (
          <>
            {/* Progress bar */}
            <div style={{ marginBottom:24 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.textMuted, marginBottom:6 }}>
                <span>Step {step + 1} of {totalSteps + 1}</span>
                <span>{Math.round(((step) / (totalSteps)) * 100)}%</span>
              </div>
              <div style={{ background:C.border, borderRadius:4, height:4, overflow:"hidden" }}>
                <div style={{ width:`${(step/totalSteps)*100}%`, height:"100%", background:C.gold, transition:"width 0.3s" }} />
              </div>
            </div>

            {/* ── INTRO step ── */}
            {step === 0 && (
              <div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:600, color:C.text, marginBottom:8 }}>
                  Move-In Inspection
                </div>
                <p style={{ color:C.textSub, fontSize:13, lineHeight:1.7, marginBottom:16 }}>
                  Walk through each room and document the condition of your unit. Take photos of any existing damage.
                  This protects <strong style={{ color:C.text }}>you</strong> — your signed inspection is on file and cannot be changed.
                </p>
                <div style={{ background:`${C.gold}11`, border:`1px solid ${C.goldDim}`, borderRadius:8, padding:"14px 18px", marginBottom:24 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.gold, marginBottom:6 }}>What to check</div>
                  <ul style={{ color:C.textSub, fontSize:13, lineHeight:1.8, paddingLeft:18 }}>
                    <li>Pre-existing scratches, scuffs, stains on walls and floors</li>
                    <li>Condition of appliances and fixtures</li>
                    <li>Working locks, windows, and doors</li>
                    <li>Any damage you did not cause</li>
                  </ul>
                </div>
                <div style={{ fontSize:13, color:C.textMuted, marginBottom:20 }}>
                  <strong style={{ color:C.textSub }}>{rooms.length} rooms</strong> to walk through · inspection date: {new Date(inspection.inspection_date || inspection.created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
                </div>
                <button onClick={() => setStep(1)}
                  style={{ width:"100%", padding:"12px", background:C.goldDim, border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  Start Walkthrough →
                </button>
              </div>
            )}

            {/* ── ROOM steps ── */}
            {step >= 1 && step <= rooms.length && (
              <div>
                {(() => {
                  const ri = step - 1;
                  const room = rooms[ri];
                  return (
                    <>
                      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:600, color:C.text, marginBottom:4 }}>
                        {room.room}
                      </div>
                      <p style={{ color:C.textMuted, fontSize:12, marginBottom:20 }}>Review each item and update status if needed</p>

                      {(room.items||[]).map((item, ii) => {
                        const cur = getRoomStatus(ri, ii);
                        return (
                          <div key={ii} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 16px", marginBottom:8 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                              <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{item.name}</span>
                              <div style={{ display:"flex", gap:4 }}>
                                {STATUS_OPTS.map(s => (
                                  <button key={s} className="mov-status" onClick={() => setRoomStatus(ri, ii, s)}
                                    style={{ padding:"3px 8px", fontSize:11, borderRadius:8, cursor:"pointer", fontWeight:600,
                                      background: cur===s ? `${STATUS_COLOR[s]}22` : "transparent",
                                      border:`1px solid ${cur===s ? STATUS_COLOR[s] : C.border}`,
                                      color: cur===s ? STATUS_COLOR[s] : C.textMuted,
                                    }}>
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {cur === "Poor" && (
                              <div style={{ fontSize:11, color:C.amber, marginTop:4 }}>
                                ⚠ Marking Poor — add a photo on the next step to document this
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div style={{ marginTop:12, marginBottom:24 }}>
                        <label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:6 }}>ROOM NOTES (optional)</label>
                        <textarea
                          value={roomNotes[ri] || ""}
                          onChange={e => setRoomNotes(prev => ({ ...prev, [ri]: e.target.value }))}
                          rows={2}
                          placeholder={`Any notes about the ${room.room}…`}
                          style={{ width:"100%", padding:"9px 12px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none", resize:"vertical", lineHeight:1.5 }} />
                      </div>

                      <div style={{ display:"flex", gap:10 }}>
                        <button onClick={() => setStep(s => s-1)}
                          style={{ flex:1, padding:"11px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, color:C.textSub, fontSize:13, cursor:"pointer" }}>
                          ← Back
                        </button>
                        <button onClick={() => setStep(s => s+1)}
                          style={{ flex:2, padding:"11px", background:C.goldDim, border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                          {ri < rooms.length-1 ? `Next: ${rooms[ri+1].room} →` : "Add Photos →"}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── PHOTOS step ── */}
            {step === rooms.length + 1 && (
              <div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:600, color:C.text, marginBottom:4 }}>Add Photos</div>
                <p style={{ color:C.textMuted, fontSize:12, marginBottom:20 }}>Document any damage or pre-existing issues with photos. Optional but recommended.</p>

                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"16px 20px", marginBottom:16 }}>
                  <div style={{ display:"flex", gap:10, alignItems:"flex-end", marginBottom:12 }}>
                    <div style={{ flex:1 }}>
                      <label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:6 }}>ROOM / AREA</label>
                      <select value={photoRoom} onChange={e=>setPhotoRoom(e.target.value)}
                        style={{ width:"100%", padding:"8px 12px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none" }}>
                        <option value="">Select room…</option>
                        {rooms.map(r => <option key={r.room} value={r.room}>{r.room}</option>)}
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <button onClick={() => fileRef.current?.click()}
                      style={{ padding:"8px 16px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, color:C.textSub, fontSize:13, cursor:"pointer", whiteSpace:"nowrap" }}>
                      + Add Photo
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhotoAdd} style={{ display:"none" }} />
                  </div>

                  {photos.length === 0 && (
                    <div style={{ textAlign:"center", padding:"24px 0", color:C.textMuted, fontSize:13 }}>
                      No photos added yet
                    </div>
                  )}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                    {photos.map((p, i) => (
                      <div key={i} style={{ position:"relative" }}>
                        <img src={p.preview} alt={`Photo ${i+1}`} style={{ width:100, height:80, objectFit:"cover", borderRadius:6, border:`1px solid ${C.border}` }} />
                        <div style={{ position:"absolute", bottom:4, left:4, right:4, fontSize:9, color:"#fff", background:"rgba(0,0,0,0.6)", borderRadius:3, padding:"1px 4px", textAlign:"center", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                          {p.room || "No room"}
                        </div>
                        <button onClick={() => setPhotos(prev => prev.filter((_,j)=>j!==i))}
                          style={{ position:"absolute", top:-6, right:-6, width:18, height:18, borderRadius:"50%", background:C.red, border:"none", color:"#fff", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom:24 }}>
                  <label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:6 }}>ADDITIONAL NOTES (optional)</label>
                  <textarea value={tenantNotes} onChange={e=>setTenantNotes(e.target.value)} rows={3}
                    placeholder="Anything else you want on record about the unit's condition at move-in…"
                    style={{ width:"100%", padding:"9px 12px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, outline:"none", resize:"vertical", lineHeight:1.5 }} />
                </div>

                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => setStep(s => s-1)}
                    style={{ flex:1, padding:"11px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, color:C.textSub, fontSize:13, cursor:"pointer" }}>
                    ← Back
                  </button>
                  <button onClick={() => setStep(s => s+1)}
                    style={{ flex:2, padding:"11px", background:C.goldDim, border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                    Review & Sign →
                  </button>
                </div>
              </div>
            )}

            {/* ── SIGN step ── */}
            {step === rooms.length + 2 && (
              <div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:600, color:C.text, marginBottom:4 }}>Sign & Submit</div>
                <p style={{ color:C.textMuted, fontSize:12, marginBottom:20 }}>Review your inspection and sign to confirm accuracy.</p>

                {/* Summary */}
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"16px 20px", marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Summary</div>
                  {rooms.map((room, ri) => {
                    const poor = (room.items||[]).filter((_,ii) => getRoomStatus(ri,ii) === "Poor").length;
                    const fair = (room.items||[]).filter((_,ii) => getRoomStatus(ri,ii) === "Fair").length;
                    return (
                      <div key={ri} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
                        <span style={{ color:C.textSub }}>{room.room}</span>
                        <span>
                          {poor>0&&<span style={{ color:C.red, marginRight:8 }}>{poor} Poor</span>}
                          {fair>0&&<span style={{ color:C.amber, marginRight:8 }}>{fair} Fair</span>}
                          {poor===0&&fair===0&&<span style={{ color:C.green }}>All Good</span>}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ marginTop:8, fontSize:12, color:C.textMuted }}>{photos.length} photo{photos.length!==1?"s":""} attached</div>
                </div>

                <div style={{ background:`${C.amber}11`, border:`1px solid ${C.amber}44`, borderRadius:8, padding:"14px 18px", marginBottom:20 }}>
                  <div style={{ fontSize:12, color:C.amber, fontWeight:600, marginBottom:4 }}>By signing, you confirm:</div>
                  <ul style={{ color:C.textSub, fontSize:12, lineHeight:1.8, paddingLeft:18 }}>
                    <li>This inspection accurately reflects the unit's condition at move-in</li>
                    <li>Any items marked Poor/Fair are pre-existing — not caused by you</li>
                    <li>You understand this document is on record and cannot be modified</li>
                  </ul>
                </div>

                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:6 }}>TYPE YOUR FULL NAME TO SIGN</label>
                  <input type="text" value={signature} onChange={e=>setSignature(e.target.value)}
                    placeholder="Your full name…"
                    style={{ width:"100%", padding:"10px 14px", background:C.raised, border:`1px solid ${signature.trim()?C.goldDim:C.border}`, borderRadius:6, color:C.text, fontSize:14, outline:"none", fontStyle:"italic" }} />
                </div>

                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => setStep(s => s-1)}
                    style={{ flex:1, padding:"11px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, color:C.textSub, fontSize:13, cursor:"pointer" }}>
                    ← Back
                  </button>
                  <button onClick={submitInspection} disabled={submitting || !signature.trim()}
                    style={{ flex:2, padding:"11px", background:signature.trim()?C.goldDim:"transparent", border:`1px solid ${signature.trim()?C.goldDim:C.border}`, borderRadius:6, color:signature.trim()?C.gold:C.textMuted, fontSize:13, fontWeight:600, cursor:submitting||!signature.trim()?"default":"pointer", opacity:submitting?0.6:1 }}>
                    {submitting ? "Submitting…" : "Submit Inspection ✓"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </TenantLayout>
  );
}
