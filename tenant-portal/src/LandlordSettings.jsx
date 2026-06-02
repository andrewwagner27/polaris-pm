import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LandlordLayout from "./LandlordLayout";

// ─── Modus tokens ──────────────────────────────────────────────────────────
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

const NOTIFICATION_SETTINGS = [
  { id: "rent_received",   label: "Rent payment received",     sub: "When a tenant pays rent",             email: true,  sms: true  },
  { id: "rent_late",       label: "Rent payment overdue",      sub: "When rent is 1+ days past due",       email: true,  sms: true  },
  { id: "maintenance_new", label: "New maintenance request",   sub: "When a tenant submits a request",     email: true,  sms: false },
  { id: "maintenance_upd", label: "Maintenance status update", sub: "When a ticket status changes",        email: true,  sms: false },
  { id: "lease_expiry",    label: "Lease expiring soon",       sub: "90 days before a lease expires",      email: true,  sms: false },
  { id: "new_message",     label: "New tenant message",        sub: "When a tenant sends you a message",   email: false, sms: true  },
  { id: "insurance_lapse", label: "Insurance policy lapsed",   sub: "When a tenant's policy expires",      email: true,  sms: false },
];

const SETTING_SECTIONS = [
  { id: "profile",       label: "Profile" },
  { id: "company",       label: "Company" },
  { id: "notifications", label: "Notifications" },
  { id: "team",          label: "Team & Access" },
  { id: "integrations",  label: "Integrations" },
  { id: "billing",       label: "Billing & Plan" },
];

// ─── Shared ────────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>{children}</label>;
}

function Input({ value, onChange, placeholder, type = "text" }) {
  const [focused, setFocused] = useState(false);
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${focused ? C.gold : C.border}`, borderRadius: 7, background: C.raised, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", boxShadow: focused ? "0 0 0 3px rgba(201,169,110,0.08)" : "none", transition: "border-color 0.15s" }}
    />
  );
}

function PrimaryBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "transparent", border: `1px solid ${C.goldDim}`, color: C.gold, fontSize: 13, fontWeight: 500, padding: "9px 20px", borderRadius: 7, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s" }}
      onMouseOver={e => e.currentTarget.style.background = "rgba(201,169,110,0.07)"}
      onMouseOut={e => e.currentTarget.style.background = "transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, small, danger }) {
  const borderColor = danger ? "rgba(224,85,85,0.3)" : C.border;
  const textColor   = danger ? C.red : C.textSub;
  return (
    <button onClick={onClick} style={{ background: danger ? "rgba(224,85,85,0.08)" : "transparent", border: `1px solid ${borderColor}`, color: textColor, fontSize: small ? 11 : 13, fontWeight: 500, padding: small ? "6px 12px" : "8px 16px", borderRadius: 7, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}
      onMouseOver={e => !danger && (e.currentTarget.style.color = C.text)}
      onMouseOut={e => !danger && (e.currentTarget.style.color = textColor)}
    >{children}</button>
  );
}

function Card({ children }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>{children}</div>;
}

function CardHeader({ title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function Toggle({ on, onToggle }) {
  return (
    <div onClick={onToggle} style={{ width: 36, height: 20, borderRadius: 10, background: on ? C.goldDim : C.raised, border: `1px solid ${on ? C.goldDim : C.border}`, position: "relative", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }}>
      <div style={{ width: 14, height: 14, borderRadius: "50%", background: on ? C.gold : C.textMuted, position: "absolute", top: 2, left: on ? 19 : 2, transition: "left 0.2s" }} />
    </div>
  );
}

export default function LandlordSettings() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection]   = useState("profile");
  const [saved, setSaved]                   = useState(false);
  const [notifs, setNotifs]                 = useState(NOTIFICATION_SETTINGS);
  const [profile, setProfile]               = useState({ firstName: "Andrew", lastName: "Wagner", email: "andrewwagner27@gmail.com", phone: "(614) 555-0100" });
  const [company, setCompany]               = useState({ name: "Modus Property Management", address: "Columbus, OH", ein: "**-*******", website: "moduspm.com" });

  function save() { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  function toggleNotif(id, type) { setNotifs(prev => prev.map(n => n.id === id ? { ...n, [type]: !n[type] } : n)); }

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .m-setting-nav-item:hover { background: ${C.raised} !important; color: ${C.text} !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: "28px 32px 48px" }}>

        {/* Top bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: C.text }}>Settings</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>Manage your account, notifications, and integrations</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>

          {/* Settings nav */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {SETTING_SECTIONS.map(section => (
              <div key={section.id} className="m-setting-nav-item"
                style={{
                  padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: activeSection === section.id ? 500 : 400,
                  color: activeSection === section.id ? C.gold : C.textSub,
                  background: activeSection === section.id ? `rgba(201,169,110,0.07)` : "transparent",
                  borderLeft: `2px solid ${activeSection === section.id ? C.gold : "transparent"}`,
                  cursor: "pointer", transition: "all 0.12s",
                }}
                onClick={() => setActiveSection(section.id)}
              >{section.label}</div>
            ))}
            <div style={{ marginTop: 16, padding: "9px 14px", borderRadius: 7, fontSize: 13, color: C.red, cursor: "pointer", borderLeft: "2px solid transparent" }}
              onClick={() => navigate("/login")}>Sign out</div>
          </div>

          {/* Content */}
          <div>

            {/* ── Profile ── */}
            {activeSection === "profile" && (
              <>
                <Card>
                  <CardHeader title="Personal information" sub="Your name and contact details" action={saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Saved!</span>} />
                  <div style={{ padding: "20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                      <div><FieldLabel>First name</FieldLabel><Input value={profile.firstName} onChange={e => setProfile(p => ({...p, firstName: e.target.value}))} /></div>
                      <div><FieldLabel>Last name</FieldLabel><Input value={profile.lastName} onChange={e => setProfile(p => ({...p, lastName: e.target.value}))} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                      <div><FieldLabel>Email</FieldLabel><Input type="email" value={profile.email} onChange={e => setProfile(p => ({...p, email: e.target.value}))} /></div>
                      <div><FieldLabel>Phone</FieldLabel><Input value={profile.phone} onChange={e => setProfile(p => ({...p, phone: e.target.value}))} /></div>
                    </div>
                    <PrimaryBtn onClick={save}>Save changes</PrimaryBtn>
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Password" sub="Change your login password" />
                  <div style={{ padding: "20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                      <div><FieldLabel>Current password</FieldLabel><Input type="password" placeholder="••••••••" value="" onChange={() => {}} /></div>
                      <div><FieldLabel>New password</FieldLabel><Input type="password" placeholder="••••••••" value="" onChange={() => {}} /></div>
                    </div>
                    <PrimaryBtn onClick={() => {}}>Update password</PrimaryBtn>
                  </div>
                </Card>
              </>
            )}

            {/* ── Company ── */}
            {activeSection === "company" && (
              <Card>
                <CardHeader title="Company information" sub="Shown on leases, receipts, and PDF reports" action={saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Saved!</span>} />
                <div style={{ padding: "20px" }}>
                  <div style={{ marginBottom: 14 }}><FieldLabel>Company name</FieldLabel><Input value={company.name} onChange={e => setCompany(p => ({...p, name: e.target.value}))} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div><FieldLabel>Business address</FieldLabel><Input value={company.address} onChange={e => setCompany(p => ({...p, address: e.target.value}))} /></div>
                    <div><FieldLabel>EIN</FieldLabel><Input value={company.ein} onChange={e => setCompany(p => ({...p, ein: e.target.value}))} placeholder="XX-XXXXXXX" /></div>
                  </div>
                  <div style={{ marginBottom: 20 }}><FieldLabel>Website</FieldLabel><Input value={company.website} onChange={e => setCompany(p => ({...p, website: e.target.value}))} placeholder="moduspm.com" /></div>
                  <PrimaryBtn onClick={save}>Save changes</PrimaryBtn>
                </div>
              </Card>
            )}

            {/* ── Notifications ── */}
            {activeSection === "notifications" && (
              <Card>
                <CardHeader title="Notification preferences" sub="Choose how you receive alerts for each event" />
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 20px 0", gap: 40 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, width: 36, textAlign: "center", letterSpacing: "0.08em" }}>EMAIL</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, width: 36, textAlign: "center", letterSpacing: "0.08em" }}>SMS</span>
                </div>
                {notifs.map((n, i) => (
                  <div key={n.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: i === notifs.length - 1 ? "none" : `1px solid ${C.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{n.label}</div>
                      <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{n.sub}</div>
                    </div>
                    <div style={{ display: "flex", gap: 40, flexShrink: 0 }}>
                      <Toggle on={n.email} onToggle={() => toggleNotif(n.id, "email")} />
                      <Toggle on={n.sms}   onToggle={() => toggleNotif(n.id, "sms")}   />
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {/* ── Team ── */}
            {activeSection === "team" && (
              <Card>
                <CardHeader title="Team members" sub="Invite property managers or maintenance staff" action={<PrimaryBtn onClick={() => {}}>+ Invite member</PrimaryBtn>} />
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.gold}22`, border: `1px solid ${C.gold}44`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>AW</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Andrew Wagner</div>
                    <div style={{ fontSize: 11, color: C.textSub }}>andrewwagner27@gmail.com</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: `${C.gold}18`, color: C.gold }}>Owner</span>
                </div>
                <div style={{ padding: "14px 20px", background: C.raised }}>
                  <div style={{ fontSize: 12, color: C.textSub }}>Team members can be assigned properties, manage maintenance tickets, and message tenants. Owners have full access.</div>
                </div>
              </Card>
            )}

            {/* ── Integrations ── */}
            {activeSection === "integrations" && (
              <Card>
                <CardHeader title="Connected integrations" />
                {[
                  { name: "Stripe",      sub: "Payment processing for rent collection",     connected: false, color: C.blue },
                  { name: "Plaid",       sub: "Bank account verification for ACH payments", connected: false, color: C.green },
                  { name: "Resend",      sub: "Email notifications and receipts",           connected: true,  color: C.gold },
                  { name: "Twilio",      sub: "SMS notifications to tenants",               connected: false, color: C.amber },
                  { name: "QuickBooks",  sub: "Sync income and expenses to QBO",            connected: false, color: C.textSub },
                ].map((integ, i, arr) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 8, background: `${integ.color}18`, border: `1px solid ${integ.color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: integ.color }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{integ.name}</div>
                        <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{integ.sub}</div>
                      </div>
                    </div>
                    {integ.connected
                      ? <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: `${C.green}15`, color: C.green }}>● Connected</span>
                      : <GhostBtn small onClick={() => {}}>Connect</GhostBtn>
                    }
                  </div>
                ))}
              </Card>
            )}

            {/* ── Billing ── */}
            {activeSection === "billing" && (
              <>
                <Card>
                  <CardHeader title="Current plan" sub="Modus PM — Self-hosted"
                    action={<span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", background: `${C.green}15`, color: C.green, borderRadius: 20 }}>Active</span>}
                  />
                  <div style={{ padding: "20px" }}>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 600, color: C.gold, marginBottom: 6 }}>$0<span style={{ fontSize: 14, fontWeight: 400, color: C.textSub }}>/month</span></div>
                    <div style={{ fontSize: 13, color: C.textSub, marginBottom: 18 }}>You built this. No subscription fees.</div>
                    {["Unlimited properties", "Unlimited tenants", "Rent collection via Stripe", "Maintenance tracking", "Financial reports & DSCR"].map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, color: C.textSub }}>
                        <span style={{ color: C.green, fontWeight: 600 }}>✓</span>{f}
                      </div>
                    ))}
                  </div>
                </Card>

                <div style={{ background: "rgba(224,85,85,0.06)", border: `1px solid rgba(224,85,85,0.2)`, borderRadius: 10, padding: "18px 20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 6 }}>Danger zone</div>
                  <div style={{ fontSize: 12, color: C.textSub, marginBottom: 14 }}>These actions are irreversible. Proceed with caution.</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <GhostBtn danger onClick={() => {}}>Export all data</GhostBtn>
                    <GhostBtn danger onClick={() => {}}>Delete account</GhostBtn>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </LandlordLayout>
  );
}