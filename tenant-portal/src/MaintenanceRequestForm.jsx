import { useNavigate } from 'react-router-dom';
import { useState, useRef } from "react";
import { supabase } from "./supabase";
import { useTenant } from "./useTenant";
import { notifyNewMaintenanceTicket } from "./notifications";
import TenantLayout from "./TenantLayout";

const C = {
  bg:        "#0A0B0D",
  surface:   "#111316",
  raised:    "#181C21",
  border:    "#252930",
  text:      "#EDEAE2",
  textSub:   "#9095A0",
  textMuted: "#5C6270",
  gold:      "#C9A96E",
  goldDim:   "#7A5C2E",
  blue:      "#4A9AE8",
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
};

const CATEGORIES = [
  { id: "plumbing",   label: "Plumbing",  icon: "🚿" },
  { id: "electrical", label: "Electrical",icon: "⚡" },
  { id: "hvac",       label: "Heat / AC", icon: "🌡️" },
  { id: "appliance",  label: "Appliance", icon: "🍳" },
  { id: "pest",       label: "Pest",      icon: "🐛" },
  { id: "other",      label: "Other",     icon: "🔧" },
];

const PRIORITIES = [
  { id: "low",    label: "Low",    sub: "Not urgent",        color: C.green },
  { id: "normal", label: "Normal", sub: "Within a few days", color: C.blue  },
  { id: "high",   label: "High",   sub: "ASAP",              color: C.amber },
  { id: "urgent", label: "Urgent", sub: "Safety issue",      color: C.red   },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_SLOTS = ["Morning (8am–12pm)", "Afternoon (12pm–5pm)", "Evening (5pm–8pm)"];

function Spinner() {
  return <span style={{ width:16, height:16, border:"2px solid rgba(201,169,110,0.3)", borderTopColor:C.gold, borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }}/>;
}

function SectionLabel({ children, optional }) {
  return (
    <div style={{ fontSize:10, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10, marginTop:24 }}>
      {children}{optional && <span style={{ fontWeight:400, textTransform:"none", letterSpacing:0, color:C.textMuted, fontSize:11, marginLeft:6 }}>(optional)</span>}
    </div>
  );
}

function Checkbox({ checked, onChange, label, sub }) {
  return (
    <div onClick={onChange} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", background:checked?`${C.gold}08`:C.raised, border:`1px solid ${checked?C.goldDim:C.border}`, borderRadius:8, cursor:"pointer", transition:"all 0.12s" }}>
      <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${checked?C.gold:C.border}`, background:checked?C.gold:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1, transition:"all 0.12s" }}>
        {checked && <span style={{ fontSize:10, color:C.bg, fontWeight:700 }}>✓</span>}
      </div>
      <div>
        <div style={{ fontSize:13, color:checked?C.text:C.textSub, fontWeight:checked?500:400 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function MaintenanceRequestForm() {
  const navigate = useNavigate();
  const { tenant, user } = useTenant();
  const [category, setCategory]   = useState("");
  const [title, setTitle]         = useState("");
  const [description, setDesc]    = useState("");
  const [priority, setPriority]   = useState("normal");
  const [photos, setPhotos]       = useState([]);
  const [errors, setErrors]       = useState({});
  const [loading, setLoading]     = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ticket, setTicket]       = useState("");
  const [dragging, setDragging]   = useState(false);
  const fileRef = useRef();

  // Availability
  const [availDays, setAvailDays]   = useState([]);
  const [availTimes, setAvailTimes] = useState([]);
  const [entryAllowed, setEntryAllowed] = useState(false);
  const [hasPets, setHasPets]       = useState(false);
  const [petDetails, setPetDetails] = useState("");
  const [accessNotes, setAccessNotes] = useState("");

  function toggleDay(day) {
    setAvailDays(d => d.includes(day) ? d.filter(x => x !== day) : [...d, day]);
  }
  function toggleTime(time) {
    setAvailTimes(t => t.includes(time) ? t.filter(x => x !== time) : [...t, time]);
  }

  function validate() {
    const e = {};
    if (!category)          e.category = "Please select a category";
    if (!title.trim())      e.title    = "Please describe the issue briefly";
    if (priority !== "urgent" && availDays.length === 0)  e.avail = "Please select at least one available day";
    if (priority !== "urgent" && availTimes.length === 0) e.avail = (e.avail || "") + " and time";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleFiles(files) {
    const newPhotos = [];
    Array.from(files).slice(0, 6 - photos.length).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      newPhotos.push({ file, previewUrl: URL.createObjectURL(file) });
    });
    setPhotos(p => [...p, ...newPhotos].slice(0, 6));
  }

  async function uploadPhotos(requestId) {
    const urls = [];
    for (const photo of photos) {
      const ext  = photo.file.name.split(".").pop();
      const path = `${requestId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("maintenance-photos").upload(path, photo.file, { contentType: photo.file.type });
      if (!error) {
        const { data } = supabase.storage.from("maintenance-photos").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
    }
    return urls;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const tenantId = tenant?.id || authUser.id;

    const availability = {
      days:          availDays,
      times:         availTimes,
      entry_allowed: entryAllowed,
      has_pets:      hasPets,
      pet_details:   petDetails,
      access_notes:  accessNotes,
    };

    const { data, error } = await supabase.from("maintenance_requests").insert({
      tenant_id: tenantId,
      unit_id:   tenant?.unit_id || null,
      category, title, description, priority, status: "open",
      availability,
    }).select().single();

    if (error) { setLoading(false); alert("Failed to submit. Please try again."); return; }

    if (photos.length > 0) {
      const photoUrls = await uploadPhotos(data.id);
      if (photoUrls.length > 0) {
        await supabase.from("maintenance_requests").update({ photos: photoUrls }).eq("id", data.id);
      }
    }

    setLoading(false);
    setTicket("MR-" + data.id.slice(0, 5).toUpperCase());
    setSubmitted(true);

    const { data: tenantData } = await supabase.from("tenants").select("name, units(unit_number, properties(name))").eq("id", tenantId).maybeSingle();
    notifyNewMaintenanceTicket({
      tenantName: tenantData?.name || authUser.email,
      title, priority,
      unit:         tenantData?.units?.unit_number || "—",
      property:     tenantData?.units?.properties?.name || "—",
      ticketId:     data.id,
      availability,
    });
  }

  if (submitted) return (
    <TenantLayout tenantName={tenant?.name}>
      <div style={{ background:C.bg, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", padding:20 }}>
        <div style={{ width:"100%", maxWidth:420, textAlign:"center" }}>
          <div style={{ width:64, height:64, borderRadius:"50%", background:`${C.green}18`, border:`1px solid ${C.green}33`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", fontSize:26, color:C.green }}>✓</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:600, color:C.text, marginBottom:6 }}>Request submitted</div>
          <div style={{ fontSize:14, color:C.textSub, marginBottom:28 }}>We'll be in touch shortly to confirm a time.</div>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"16px", marginBottom:24, textAlign:"left" }}>
            {[["Ticket #", ticket], ["Category", CATEGORIES.find(c=>c.id===category)?.label], ["Issue", title], ["Priority", PRIORITIES.find(p=>p.id===priority)?.label]].map(([k,v],i,arr)=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none" }}>
                <span style={{ fontSize:13, color:C.textSub }}>{k}</span>
                <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("/maintenance")} style={{ width:"100%", padding:"12px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, color:C.textSub, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>← Back to requests</button>
        </div>
      </div>
    </TenantLayout>
  );

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
      `}</style>

      <div style={{ background:C.bg, minHeight:"100vh", color:C.text, fontFamily:"'DM Sans',sans-serif", padding:"24px 20px 80px", maxWidth:680, margin:"0 auto" }}>

        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:600, color:C.text, marginBottom:4 }}>New request</div>
        <div style={{ fontSize:13, color:C.textSub, marginBottom:24 }}>Unit {tenant?.unit || "—"} · {tenant?.property || "—"}</div>

        {/* Category */}
        <SectionLabel>What's the issue?</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:4 }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { setCategory(cat.id); setErrors(e=>({...e,category:""})); }}
              style={{ padding:"14px 8px", border:`1px solid ${category===cat.id?C.goldDim:C.border}`, borderRadius:10, background:category===cat.id?`${C.gold}0F`:C.surface, cursor:"pointer", textAlign:"center", transition:"all 0.15s", fontFamily:"'DM Sans',sans-serif" }}>
              <div style={{ fontSize:22, marginBottom:6 }}>{cat.icon}</div>
              <div style={{ fontSize:12, fontWeight:category===cat.id?600:400, color:category===cat.id?C.gold:C.textSub }}>{cat.label}</div>
            </button>
          ))}
        </div>
        {errors.category && <p style={{ fontSize:11, color:C.red, marginTop:6, marginBottom:0 }}>{errors.category}</p>}

        {/* Title */}
        <SectionLabel>Brief description</SectionLabel>
        <input value={title} onChange={e=>{setTitle(e.target.value);setErrors(p=>({...p,title:""}));}}
          placeholder="e.g. Kitchen faucet is dripping constantly" maxLength={80}
          style={{ width:"100%", padding:"11px 14px", fontSize:14, border:`1px solid ${errors.title?C.red:C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", boxSizing:"border-box", fontFamily:"'DM Sans',sans-serif" }}/>
        {errors.title && <p style={{ fontSize:11, color:C.red, marginTop:4, marginBottom:0 }}>{errors.title}</p>}

        {/* Description */}
        <SectionLabel optional>More details</SectionLabel>
        <div style={{ position:"relative" }}>
          <textarea value={description} onChange={e=>setDesc(e.target.value)} maxLength={500}
            placeholder="When did it start? How often does it happen? Anything else we should know?" rows={4}
            style={{ width:"100%", padding:"11px 14px", fontSize:14, border:`1px solid ${C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", boxSizing:"border-box", resize:"vertical", minHeight:90, fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}/>
          <span style={{ position:"absolute", bottom:10, right:12, fontSize:10, color:C.textMuted }}>{description.length}/500</span>
        </div>

        {/* Priority */}
        <SectionLabel>Priority</SectionLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {PRIORITIES.map(p => (
            <button key={p.id} onClick={() => setPriority(p.id)}
              style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", border:`1px solid ${priority===p.id?p.color+"66":C.border}`, borderRadius:10, background:priority===p.id?`${p.color}0F`:C.surface, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:p.color }}/>
                <div style={{ textAlign:"left" }}>
                  <div style={{ fontSize:13, fontWeight:priority===p.id?600:400, color:priority===p.id?p.color:C.text }}>{p.label}</div>
                  <div style={{ fontSize:11, color:C.textSub }}>{p.sub}</div>
                </div>
              </div>
              <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${priority===p.id?p.color:C.border}`, background:priority===p.id?p.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", flexShrink:0 }}>
                {priority===p.id && "✓"}
              </div>
            </button>
          ))}
        </div>

        {/* Availability */}
        <SectionLabel>{priority === "urgent" ? "Availability" : "Your availability next week *"}</SectionLabel>

        {priority === "urgent" && (
          <div style={{ background:`${C.red}0F`, border:`1px solid ${C.red}33`, borderRadius:8, padding:"12px 14px", marginBottom:12, fontSize:13, color:C.amber }}>
            ⚠ For urgent/safety issues we may need emergency access including weekends. We will contact you immediately to coordinate.
          </div>
        )}

        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, color:C.textSub, marginBottom:8, fontWeight:500 }}>Which days work for you?</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6 }}>
            {DAYS.map(day => (
              <Checkbox key={day} checked={availDays.includes(day)} onChange={() => toggleDay(day)} label={day}
                sub={day === "Saturday" || day === "Sunday" ? "Weekend — emergencies only" : null}/>
            ))}
          </div>
          {errors.avail && <p style={{ fontSize:11, color:C.red, marginTop:6, marginBottom:0 }}>{errors.avail}</p>}
        </div>

        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:C.textSub, marginBottom:8, fontWeight:500 }}>What times work?</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {TIME_SLOTS.map(time => (
              <Checkbox key={time} checked={availTimes.includes(time)} onChange={() => toggleTime(time)} label={time}/>
            ))}
          </div>
        </div>

        {/* Entry & access */}
        <SectionLabel>Entry & access</SectionLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
          <Checkbox
            checked={entryAllowed}
            onChange={() => setEntryAllowed(v => !v)}
            label="Vendor may enter when I am not home"
            sub="We will use the unit entry instructions on file"
          />
          <Checkbox
            checked={hasPets}
            onChange={() => setHasPets(v => !v)}
            label="I have pets"
            sub="Please provide details so the vendor is prepared"
          />
        </div>

        {hasPets && (
          <div style={{ marginBottom:16 }}>
            <input value={petDetails} onChange={e => setPetDetails(e.target.value)}
              placeholder="e.g. Large dog, friendly but will bark. Please keep door closed."
              style={{ width:"100%", padding:"11px 14px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", boxSizing:"border-box", fontFamily:"'DM Sans',sans-serif" }}/>
          </div>
        )}

        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, color:C.textSub, marginBottom:6, fontWeight:500 }}>Any other access notes?</div>
          <textarea value={accessNotes} onChange={e => setAccessNotes(e.target.value)}
            placeholder="e.g. Ring the doorbell first, park in the lot behind the building…" rows={2}
            style={{ width:"100%", padding:"11px 14px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", boxSizing:"border-box", resize:"none", fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}/>
        </div>

        {/* Photos */}
        <SectionLabel optional>Photos (up to 6)</SectionLabel>
        {photos.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
            {photos.map((p,i) => (
              <div key={i} style={{ position:"relative" }}>
                <img src={p.previewUrl} alt={`photo-${i}`} style={{ aspectRatio:"1", borderRadius:8, objectFit:"cover", width:"100%", border:`1px solid ${C.border}` }}/>
                <button onClick={() => setPhotos(ph=>ph.filter((_,j)=>j!==i))} style={{ position:"absolute", top:4, right:4, width:20, height:20, borderRadius:"50%", background:"rgba(0,0,0,0.7)", border:"none", color:"#fff", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {photos.length < 6 && (
          <div onClick={() => fileRef.current.click()}
            onDragOver={e=>{e.preventDefault();setDragging(true);}}
            onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);handleFiles(e.dataTransfer.files);}}
            style={{ border:`2px dashed ${dragging?C.goldDim:C.border}`, borderRadius:10, padding:"20px 16px", textAlign:"center", background:dragging?`${C.gold}08`:C.raised, cursor:"pointer", transition:"all 0.15s" }}>
            <div style={{ fontSize:24, marginBottom:6 }}>📷</div>
            <div style={{ fontSize:13, fontWeight:500, color:C.textSub, marginBottom:3 }}>Tap to add photos</div>
            <div style={{ fontSize:11, color:C.textMuted }}>or drag and drop · JPG, PNG up to 10MB</div>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e=>handleFiles(e.target.files)}/>
          </div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={loading} style={{ width:"100%", padding:"13px", border:`1px solid ${C.goldDim}`, borderRadius:8, fontSize:14, fontWeight:500, background:loading?"rgba(201,169,110,0.07)":"transparent", color:C.gold, cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:24, fontFamily:"'DM Sans',sans-serif", opacity:loading?0.7:1 }}>
          {loading ? <><Spinner/> Submitting…</> : "Submit request →"}
        </button>
      </div>
    </TenantLayout>
  );
}