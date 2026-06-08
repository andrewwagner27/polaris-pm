import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

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

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 420, padding: "28px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: C.text }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
    </div>
  );
}

function SaveButton({ onClick, loading, label = "Save changes" }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ width: "100%", padding: "12px", background: C.goldDim, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, color: C.text, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.7 : 1, marginTop: 8 }}>
      {loading ? "Saving…" : label}
    </button>
  );
}

function leaseProgress(start, end) {
  const s = new Date(start || "2026-01-01");
  const e = new Date(end   || "2026-12-31");
  const today = new Date();
  return Math.min(100, Math.max(0, Math.round(((today - s) / (e - s)) * 100)));
}

function daysRemaining(end) {
  const e = new Date(end || "2026-12-31");
  const diff = Math.ceil((e - new Date()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export default function AccountScreen() {
  const navigate = useNavigate();
  const { tenant, user } = useTenant();

  const [modal, setModal]   = useState(null); // "profile" | "password" | "notifications"
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState(null);

  // Profile fields
  const [name,  setName]  = useState(tenant?.name  || "");
  const [phone, setPhone] = useState(tenant?.phone || "");

  // Password fields
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // Notification prefs
  const [notifRent,        setNotifRent]        = useState(true);
  const [notifMaintenance, setNotifMaintenance] = useState(true);
  const [notifMessages,    setNotifMessages]    = useState(true);
  const [notifLease,       setNotifLease]       = useState(true);

  // Autopay
  const [autopay, setAutopay] = useState(false);

  function showToast(msg, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSaveProfile() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("tenants").update({ name: name.trim(), phone: phone.trim() }).eq("id", tenant?.id);
    setSaving(false);
    if (error) { showToast("Failed to save profile", true); return; }
    showToast("Profile updated");
    setModal(null);
  }

  async function handleChangePassword() {
    if (!newPw || newPw !== confirmPw) { showToast("Passwords don't match", true); return; }
    if (newPw.length < 8) { showToast("Password must be at least 8 characters", true); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) { showToast("Failed to update password", true); return; }
    showToast("Password updated");
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setModal(null);
  }

  function handleSaveNotifications() {
    showToast("Notification preferences saved");
    setModal(null);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  const name_val   = tenant?.name || "Tenant";
  const initials   = name_val.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const progress   = leaseProgress(tenant?.lease_start, tenant?.lease_end);
  const daysLeft   = daysRemaining(tenant?.lease_end);

  const SETTINGS_ITEMS = [
    { label: "Profile",       sub: "Name, phone number",         action: () => { setName(tenant?.name || ""); setPhone(tenant?.phone || ""); setModal("profile"); },      color: C.blue },
    { label: "Notifications", sub: "Rent reminders, alerts",     action: () => setModal("notifications"), color: C.amber },
    { label: "Password",      sub: "Change your password",       action: () => setModal("password"),      color: C.textSub },
    { label: "Autopay",       sub: autopay ? "Currently on" : "Currently off", action: () => setAutopay(p => !p), color: autopay ? C.green : C.textSub, toggle: true, toggleVal: autopay },
  ];

  const LEASE_ROWS = [
    ["Property",     tenant?.property    || "—"],
    ["Unit",         tenant?.unit        ? `Unit ${tenant.unit}` : "—"],
    ["Lease start",  tenant?.lease_start ? new Date(tenant.lease_start).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"],
    ["Lease end",    tenant?.lease_end   ? new Date(tenant.lease_end).toLocaleDateString("en-US",   { month: "long", day: "numeric", year: "numeric" }) : "—"],
    ["Monthly rent", tenant?.rent        ? `$${Number(tenant.rent).toLocaleString()}` : "—"],
  ];

  return (
    <TenantLayout tenantName={name_val}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .t-menu-item:hover{background:${C.raised}!important;}
        .t-toggle{position:relative;width:40px;height:22px;border-radius:11px;cursor:pointer;transition:background 0.2s;border:none;padding:0;flex-shrink:0;}
        .t-toggle-knob{position:absolute;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left 0.2s;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 300, background: toast.isError ? C.red : C.green, color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", paddingBottom: 80, maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "28px 20px 24px", textAlign: "center" }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", background: `${C.gold}22`, border: `2px solid ${C.goldDim}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, margin: "0 auto 14px" }}>{initials}</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 4 }}>{name_val}</div>
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12 }}>{tenant?.email || user?.email || "—"}</div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: 20, padding: "5px 14px", fontSize: 12, color: C.green }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} /> Active tenant · Unit {tenant?.unit || "—"}
          </span>
        </div>

        <div style={{ padding: "20px 20px 0" }}>

          {/* Lease summary */}
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, marginTop: 4 }}>Lease summary</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
            {LEASE_ROWS.map(([k, v], i) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < LEASE_ROWS.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ fontSize: 13, color: C.textSub }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textSub, marginBottom: 6 }}>
                <span>Lease progress</span>
                <span style={{ color: daysLeft < 60 ? C.amber : C.textSub }}>{daysLeft} days remaining</span>
              </div>
              <div style={{ height: 4, background: C.raised, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: daysLeft < 60 ? C.amber : C.gold, borderRadius: 2, transition: "width 0.3s" }} />
              </div>
            </div>
            {daysLeft < 60 && (
              <div style={{ marginTop: 12, padding: "10px 12px", background: `${C.amber}12`, border: `1px solid ${C.amber}33`, borderRadius: 8, fontSize: 12, color: C.amber }}>
                ⚠ Your lease expires in {daysLeft} days. Contact your property manager about renewal.
              </div>
            )}
          </div>

          {/* Settings */}
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Settings</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
            {SETTINGS_ITEMS.map((item, i) => (
              <div key={item.label} className="t-menu-item"
                onClick={item.action}
                style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: i < SETTINGS_ITEMS.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", gap: 14, transition: "background 0.12s" }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${item.color}18`, border: `1px solid ${item.color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: C.textSub }}>{item.sub}</div>
                </div>
                {item.toggle ? (
                  <button className="t-toggle" style={{ background: item.toggleVal ? C.green : C.border }} onClick={e => { e.stopPropagation(); item.action(); }}>
                    <div className="t-toggle-knob" style={{ left: item.toggleVal ? "21px" : "3px" }} />
                  </button>
                ) : (
                  <span style={{ fontSize: 16, color: C.textMuted }}>›</span>
                )}
              </div>
            ))}
          </div>

          {/* Sign out */}
          <button onClick={handleSignOut} style={{ width: "100%", padding: "12px", background: "rgba(224,85,85,0.08)", border: `1px solid rgba(224,85,85,0.2)`, borderRadius: 8, fontSize: 14, fontWeight: 500, color: C.red, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>
            Sign out
          </button>
          <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center", paddingBottom: 8 }}>Modus PM · Built in Columbus, OH</div>
        </div>
      </div>

      {/* Profile Modal */}
      {modal === "profile" && (
        <Modal title="Edit profile" onClose={() => setModal(null)}>
          <Field label="Full name" value={name} onChange={setName} placeholder="Your name" />
          <Field label="Phone number" value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" />
          <SaveButton onClick={handleSaveProfile} loading={saving} />
        </Modal>
      )}

      {/* Password Modal */}
      {modal === "password" && (
        <Modal title="Change password" onClose={() => setModal(null)}>
          <Field label="New password" value={newPw} onChange={setNewPw} type="password" placeholder="At least 8 characters" />
          <Field label="Confirm password" value={confirmPw} onChange={setConfirmPw} type="password" placeholder="Repeat new password" />
          <SaveButton onClick={handleChangePassword} loading={saving} />
        </Modal>
      )}

      {/* Notifications Modal */}
      {modal === "notifications" && (
        <Modal title="Notification preferences" onClose={() => setModal(null)}>
          {[
            ["Rent reminders",       notifRent,        setNotifRent],
            ["Maintenance updates",  notifMaintenance, setNotifMaintenance],
            ["New messages",         notifMessages,    setNotifMessages],
            ["Lease expiry alerts",  notifLease,       setNotifLease],
          ].map(([label, val, set]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14, color: C.text }}>{label}</span>
              <button className="t-toggle" style={{ background: val ? C.green : C.border }} onClick={() => set(p => !p)}>
                <div className="t-toggle-knob" style={{ left: val ? "21px" : "3px" }} />
              </button>
            </div>
          ))}
          <SaveButton onClick={handleSaveNotifications} loading={false} />
        </Modal>
      )}
    </TenantLayout>
  );
}