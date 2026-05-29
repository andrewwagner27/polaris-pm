import { useState, useRef } from "react";

const CATEGORIES = [
  { id: "plumbing",    label: "Plumbing",     icon: "🚿" },
  { id: "electrical",  label: "Electrical",   icon: "⚡" },
  { id: "hvac",        label: "Heat / AC",    icon: "🌡️" },
  { id: "appliance",   label: "Appliance",    icon: "🍳" },
  { id: "pest",        label: "Pest",         icon: "🐛" },
  { id: "other",       label: "Other",        icon: "🔧" },
];

const PRIORITIES = [
  { id: "low",    label: "Low",    sub: "Not urgent",          color: "#639922", bg: "#EAF3DE" },
  { id: "normal", label: "Normal", sub: "Within a few days",   color: "#185FA5", bg: "#E6F1FB" },
  { id: "high",   label: "High",   sub: "ASAP",                color: "#854F0B", bg: "#FAEEDA" },
  { id: "urgent", label: "Urgent", sub: "Safety issue",        color: "#A32D2D", bg: "#FDECEA" },
];

const s = {
  app: {
    maxWidth: 460,
    margin: "40px auto",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#f4f5f7",
    minHeight: "100vh",
    padding: "0 0 40px",
  },
  header: {
    background: "#0C447C",
    borderRadius: "12px 12px 0 0",
    padding: "18px 20px 22px",
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  backBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none",
    borderRadius: 8,
    width: 32,
    height: 32,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#E6F1FB",
    fontSize: 16,
    flexShrink: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: "#E6F1FB" },
  headerSub: { fontSize: 12, color: "#85B7EB", marginTop: 2, paddingLeft: 42 },
  body: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderTop: "none",
    borderRadius: "0 0 12px 12px",
    padding: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "#555",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 20,
  },
  categoryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    marginBottom: 4,
  },
  categoryBtn: (active) => ({
    padding: "10px 6px",
    border: active ? "2px solid #185FA5" : "1px solid #e8eaed",
    borderRadius: 10,
    background: active ? "#E6F1FB" : "#f8f9fa",
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.15s",
  }),
  categoryIcon: { fontSize: 22, marginBottom: 4 },
  categoryLabel: (active) => ({
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active ? "#185FA5" : "#555",
  }),
  priorityList: { display: "flex", flexDirection: "column", gap: 8 },
  priorityBtn: (active, color, bg) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    border: active ? `2px solid ${color}` : "1px solid #e8eaed",
    borderRadius: 10,
    background: active ? bg : "#f8f9fa",
    cursor: "pointer",
    transition: "all 0.15s",
  }),
  priorityLeft: { display: "flex", alignItems: "center", gap: 10 },
  priorityDot: (color) => ({
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: color,
    flexShrink: 0,
  }),
  priorityLabel: (active, color) => ({
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? color : "#1a1a1a",
  }),
  prioritySub: { fontSize: 11, color: "#888" },
  priorityCheck: (active, color) => ({
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: active ? `2px solid ${color}` : "2px solid #d1d5db",
    background: active ? color : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 11,
    color: "#fff",
  }),
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#555",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 5,
  },
  fieldWrap: { marginBottom: 14 },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#1a1a1a",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#1a1a1a",
    outline: "none",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: 90,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    lineHeight: 1.5,
  },
  fieldErr: { fontSize: 11, color: "#c0392b", marginTop: 4 },
  photoZone: (dragging) => ({
    border: `2px dashed ${dragging ? "#185FA5" : "#d1d5db"}`,
    borderRadius: 10,
    padding: "20px 16px",
    textAlign: "center",
    background: dragging ? "#E6F1FB" : "#f8f9fa",
    cursor: "pointer",
    transition: "all 0.15s",
  }),
  photoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    marginBottom: 10,
  },
  photoThumb: {
    aspectRatio: "1",
    borderRadius: 8,
    objectFit: "cover",
    width: "100%",
    border: "1px solid #e8eaed",
  },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.6)",
    border: "none",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  submitBtn: {
    width: "100%",
    padding: 13,
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    transition: "background 0.15s",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  successWrap: { textAlign: "center", padding: "36px 20px 28px" },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "#e8f5e9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 18px",
    fontSize: 30,
  },
  ticketBox: {
    background: "#f8f9fa",
    border: "1px solid #e8eaed",
    borderRadius: 10,
    padding: "14px 16px",
    textAlign: "left",
    marginBottom: 22,
  },
  ticketRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "6px 0",
    borderBottom: "1px solid #e8eaed",
  },
  ticketRowLast: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "6px 0",
  },
  ticketKey: { fontSize: 13, color: "#666", flexShrink: 0, marginRight: 12 },
  ticketVal: { fontSize: 13, fontWeight: 600, color: "#1a1a1a", textAlign: "right" },
  backBtn2: {
    width: "100%",
    padding: 12,
    background: "transparent",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "#1a1a1a",
    cursor: "pointer",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
};

function FocusInput({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{ ...style, borderColor: focused ? "#185FA5" : "#d1d5db", boxShadow: focused ? "0 0 0 3px rgba(24,95,165,0.1)" : "none" }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function FocusTextarea({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      style={{ ...style, borderColor: focused ? "#185FA5" : "#d1d5db", boxShadow: focused ? "0 0 0 3px rgba(24,95,165,0.1)" : "none" }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function Spinner() {
  return (
    <span style={{
      width: 16, height: 16,
      border: "2px solid rgba(255,255,255,0.35)",
      borderTopColor: "#fff",
      borderRadius: "50%",
      display: "inline-block",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

function SuccessScreen({ ticket, category, title, priority, onReset }) {
  const cat = CATEGORIES.find(c => c.id === category);
  const pri = PRIORITIES.find(p => p.id === priority);
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <div style={s.successWrap}>
      <div style={s.successIcon}>✅</div>
      <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Request submitted</p>
      <p style={{ fontSize: 15, color: "#666", marginBottom: 24 }}>
        We'll be in touch shortly to schedule a time.
      </p>
      <div style={s.ticketBox}>
        {[
          ["Ticket #", ticket],
          ["Category", `${cat?.icon} ${cat?.label}`],
          ["Issue", title],
          ["Priority", pri?.label],
          ["Submitted", date],
        ].map(([k, v], i, arr) => (
          <div key={k} style={i === arr.length - 1 ? s.ticketRowLast : s.ticketRow}>
            <span style={s.ticketKey}>{k}</span>
            <span style={s.ticketVal}>{v}</span>
          </div>
        ))}
      </div>
      <button style={s.backBtn2} onClick={onReset}>← Back to portal</button>
    </div>
  );
}

export default function MaintenanceRequestForm() {
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

  function validate() {
    const e = {};
    if (!category)      e.category = "Please select a category";
    if (!title.trim())  e.title    = "Please describe the issue briefly";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleFiles(files) {
    const newPhotos = [];
    Array.from(files).slice(0, 6 - photos.length).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      newPhotos.push({ url, name: file.name });
    });
    setPhotos(p => [...p, ...newPhotos].slice(0, 6));
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    // TODO: POST to /api/maintenance with { category, title, description, priority, photos }
    await new Promise(r => setTimeout(r, 1800));
    const id = "MR-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    setTicket(id);
    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={s.app}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; }`}</style>
        <div style={s.header}>
          <div style={s.headerTop}>
            <span style={s.headerTitle}>Maintenance request</span>
          </div>
        </div>
        <div style={s.body}>
          <SuccessScreen
            ticket={ticket}
            category={category}
            title={title}
            priority={priority}
            onReset={() => { setSubmitted(false); setCategory(""); setTitle(""); setDesc(""); setPriority("normal"); setPhotos([]); setErrors({}); }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; }`}</style>
      <div style={s.app}>

        {/* Header */}
        <div style={s.header}>
          <div style={s.headerTop}>
            <button style={s.backBtn}>←</button>
            <span style={s.headerTitle}>Maintenance request</span>
          </div>
          <div style={s.headerSub}>Unit 4B · Clifton Manor</div>
        </div>

        {/* Body */}
        <div style={s.body}>

          {/* Category */}
          <div style={{ ...s.sectionTitle, marginTop: 0 }}>What's the issue?</div>
          <div style={s.categoryGrid}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                style={s.categoryBtn(category === cat.id)}
                onClick={() => { setCategory(cat.id); setErrors(e => ({ ...e, category: "" })); }}
              >
                <div style={s.categoryIcon}>{cat.icon}</div>
                <div style={s.categoryLabel(category === cat.id)}>{cat.label}</div>
              </button>
            ))}
          </div>
          {errors.category && <p style={{ ...s.fieldErr, marginTop: 6 }}>{errors.category}</p>}

          {/* Title */}
          <div style={s.sectionTitle}>Brief description</div>
          <div style={s.fieldWrap}>
            <FocusInput
              style={s.input}
              value={title}
              onChange={e => { setTitle(e.target.value); setErrors(p => ({ ...p, title: "" })); }}
              placeholder="e.g. Kitchen faucet is dripping constantly"
              maxLength={80}
            />
            {errors.title && <p style={s.fieldErr}>{errors.title}</p>}
          </div>

          {/* Details */}
          <div style={s.sectionTitle}>More details <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#aaa", fontSize: 11 }}>(optional)</span></div>
          <div style={s.fieldWrap}>
            <FocusTextarea
              style={s.textarea}
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="When did it start? How often does it happen? Anything else we should know?"
              maxLength={500}
            />
            <p style={{ fontSize: 11, color: "#aaa", textAlign: "right", marginTop: 3 }}>{description.length}/500</p>
          </div>

          {/* Priority */}
          <div style={s.sectionTitle}>Priority</div>
          <div style={s.priorityList}>
            {PRIORITIES.map(p => (
              <button
                key={p.id}
                style={s.priorityBtn(priority === p.id, p.color, p.bg)}
                onClick={() => setPriority(p.id)}
              >
                <div style={s.priorityLeft}>
                  <div style={s.priorityDot(p.color)} />
                  <div>
                    <div style={s.priorityLabel(priority === p.id, p.color)}>{p.label}</div>
                    <div style={s.prioritySub}>{p.sub}</div>
                  </div>
                </div>
                <div style={s.priorityCheck(priority === p.id, p.color)}>
                  {priority === p.id && "✓"}
                </div>
              </button>
            ))}
          </div>

          {/* Photo upload */}
          <div style={s.sectionTitle}>
            Photos <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#aaa", fontSize: 11 }}>(optional, up to 6)</span>
          </div>

          {photos.length > 0 && (
            <div style={s.photoGrid}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={p.url} alt={p.name} style={s.photoThumb} />
                  <button
                    style={s.photoRemove}
                    onClick={() => setPhotos(ph => ph.filter((_, j) => j !== i))}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {photos.length < 6 && (
            <div
              style={s.photoZone(dragging)}
              onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#555", marginBottom: 3 }}>
                Tap to add photos
              </p>
              <p style={{ fontSize: 11, color: "#aaa" }}>or drag and drop · JPG, PNG up to 10MB each</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={e => handleFiles(e.target.files)}
              />
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              ...s.submitBtn,
              background: loading ? "#378ADD" : "#0C447C",
              color: "#fff",
              opacity: loading ? 0.85 : 1,
              marginTop: 20,
            }}
          >
            {loading ? <><Spinner /> Submitting…</> : <>🔧 Submit request</>}
          </button>

        </div>
      </div>
    </>
  );
}
