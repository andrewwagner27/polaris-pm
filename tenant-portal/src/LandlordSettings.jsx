import { useState } from "react";
import { useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard",   route: "/landlord" },
  { icon: "🏢", label: "Properties",  route: "/landlord/properties" },
  { icon: "👥", label: "Tenants",     route: "/landlord/tenants" },
  { icon: "💰", label: "Rent Roll",   route: "/landlord/rentroll" },
  { icon: "🔧", label: "Maintenance", route: "/landlord/maintenance" },
  { icon: "📈", label: "Financials",  route: "/landlord/financials" },
  { icon: "💬", label: "Messages",    route: "/landlord/messages" },
  { icon: "⚙️", label: "Settings",   route: "/landlord/settings" },
];

const NOTIFICATION_SETTINGS = [
  { id: "rent_received",   label: "Rent payment received",        sub: "When a tenant pays rent",                  email: true,  sms: true  },
  { id: "rent_late",       label: "Rent payment overdue",         sub: "When rent is 1+ days past due",            email: true,  sms: true  },
  { id: "maintenance_new", label: "New maintenance request",      sub: "When a tenant submits a request",          email: true,  sms: false },
  { id: "maintenance_upd", label: "Maintenance status update",    sub: "When a ticket status changes",             email: true,  sms: false },
  { id: "lease_expiry",    label: "Lease expiring soon",          sub: "90 days before a lease expires",           email: true,  sms: false },
  { id: "new_message",     label: "New tenant message",           sub: "When a tenant sends you a message",        email: false, sms: true  },
  { id: "insurance_lapse", label: "Insurance policy lapsed",      sub: "When a tenant's policy expires",           email: true,  sms: false },
];

const TEAM_MEMBERS = [
  { id: 1, name: "Andrew Wagner", email: "andrew@polarispm.com", role: "Owner",            avatar: "AW", color: "#185FA5", bg: "#E6F1FB", status: "active" },
];

const s = {
  app: { display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", minHeight: "100vh" },
  sidebar: { width: 220, background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" },
  sidebarLogo: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8 },
  logoText: { fontSize: 15, fontWeight: 700, color: "#fff" },
  logoSub: { fontSize: 10, color: "#5B7FA6", marginTop: 2 },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: active ? "3px solid #378ADD" : "3px solid transparent", cursor: "pointer", color: active ? "#fff" : "#7A9CC4", fontSize: 13, fontWeight: active ? 600 : 400 }),
  sidebarFooter: { marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10 },
  sidebarAvatar: { width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 },
  sidebarName: { fontSize: 12, fontWeight: 600, color: "#fff" },
  sidebarRole: { fontSize: 10, color: "#5B7FA6" },
  main: { flex: 1, padding: "28px", overflowY: "auto" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  pageTitle: { fontSize: 22, fontWeight: 700 },
  pageSub: { fontSize: 13, color: "#888", marginTop: 2 },
  layout: { display: "grid", gridTemplateColumns: "220px 1fr", gap: 24 },
  settingNav: { display: "flex", flexDirection: "column", gap: 2 },
  settingNavItem: (active) => ({ padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#0C447C" : "#555", background: active ? "#E6F1FB" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.1s" }),
  content: { display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" },
  cardHeader: { padding: "16px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#1a1a1a" },
  cardSub: { fontSize: 12, color: "#888", marginTop: 2 },
  cardBody: { padding: "20px" },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 5 },
  input: { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none", color: "#1a1a1a", boxSizing: "border-box" },
  halfGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  saveBtn: { padding: "9px 20px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  savedMsg: { fontSize: 12, color: "#3B6D11", fontWeight: 600 },
  // Notifications
  notifRow: (last) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: last ? "none" : "1px solid #f8f9fa" }),
  notifLeft: { flex: 1 },
  notifLabel: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  notifSub: { fontSize: 11, color: "#888", marginTop: 2 },
  notifToggles: { display: "flex", gap: 20, flexShrink: 0 },
  toggleWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  toggleLabel: { fontSize: 10, color: "#aaa", fontWeight: 500 },
  toggle: (on) => ({ width: 36, height: 20, borderRadius: 10, background: on ? "#185FA5" : "#d1d5db", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }),
  toggleThumb: (on) => ({ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: on ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }),
  // Team
  memberRow: (last) => ({ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: last ? "none" : "1px solid #f8f9fa" }),
  memberAvatar: (color, bg) => ({ width: 36, height: 36, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }),
  memberName: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  memberEmail: { fontSize: 11, color: "#888", marginTop: 1 },
  roleBadge: { fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "#E6F1FB", color: "#185FA5" },
  // Integrations
  integRow: (last) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: last ? "none" : "1px solid #f8f9fa" }),
  integLeft: { display: "flex", alignItems: "center", gap: 12 },
  integIcon: (bg) => ({ width: 40, height: 40, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }),
  integName: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  integSub: { fontSize: 11, color: "#888", marginTop: 2 },
  connectedBadge: { fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: "#EAF3DE", color: "#3B6D11" },
  connectBtn: { fontSize: 11, fontWeight: 600, padding: "7px 14px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  dangerZone: { background: "#FDECEA", border: "1px solid #f5c6c6", borderRadius: 12, padding: "16px 20px" },
  dangerTitle: { fontSize: 13, fontWeight: 700, color: "#A32D2D", marginBottom: 6 },
  dangerSub: { fontSize: 12, color: "#888", marginBottom: 12 },
  dangerBtn: { padding: "8px 16px", background: "#fff", border: "1px solid #f5c6c6", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#A32D2D", cursor: "pointer", fontFamily: "'Inter',sans-serif" },
};

const SETTING_SECTIONS = [
  { id: "profile",       icon: "👤", label: "Profile" },
  { id: "company",       icon: "🏢", label: "Company" },
  { id: "notifications", icon: "🔔", label: "Notifications" },
  { id: "team",          icon: "👥", label: "Team & Access" },
  { id: "integrations",  icon: "🔌", label: "Integrations" },
  { id: "billing",       icon: "💳", label: "Billing & Plan" },
];

export default function LandlordSettings() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("profile");
  const [saved, setSaved] = useState(false);
  const [notifs, setNotifs] = useState(NOTIFICATION_SETTINGS);
  const [team, setTeam] = useState(TEAM_MEMBERS);

  // Profile state
  const [profile, setProfile] = useState({ firstName: "Andrew", lastName: "Wagner", email: "andrew@polarispm.com", phone: "(614) 555-0100" });
  const [company, setCompany] = useState({ name: "Polaris Property Solutions LLC", address: "Columbus, OH", ein: "**-*******", website: "polarispm.com" });

  function saveProfile() { setSaved(true); setTimeout(() => setSaved(false), 2500); }

  function toggleNotif(id, type) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, [type]: !n[type] } : n));
  }

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }`}</style>

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.logoText}>🏢 Polaris PM</div>
          <div style={s.logoSub}>Property Management</div>
        </div>
        {NAV_ITEMS.map(item => (
          <div key={item.route} style={s.navItem(item.label === "Settings")} onClick={() => navigate(item.route)}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
          </div>
        ))}
        <div style={s.sidebarFooter}>
          <div style={s.sidebarUser}>
            <div style={s.sidebarAvatar}>AW</div>
            <div><div style={s.sidebarName}>Andrew Wagner</div><div style={s.sidebarRole}>Portfolio Owner</div></div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        <div style={s.topBar}>
          <div>
            <div style={s.pageTitle}>Settings</div>
            <div style={s.pageSub}>Manage your account, notifications, and integrations</div>
          </div>
        </div>

        <div style={s.layout}>
          {/* Settings nav */}
          <div style={s.settingNav}>
            {SETTING_SECTIONS.map(section => (
              <div key={section.id} style={s.settingNavItem(activeSection === section.id)} onClick={() => setActiveSection(section.id)}>
                <span>{section.icon}</span>{section.label}
              </div>
            ))}
            <div style={{ marginTop: 16, padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 400, color: "#A32D2D", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} onClick={() => navigate("/login")}>
              <span>🚪</span>Sign out
            </div>
          </div>

          {/* Content */}
          <div style={s.content}>

            {/* ── Profile ── */}
            {activeSection === "profile" && (
              <>
                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <div>
                      <div style={s.cardTitle}>Personal information</div>
                      <div style={s.cardSub}>Your name and contact details</div>
                    </div>
                    {saved && <span style={s.savedMsg}>✓ Saved!</span>}
                  </div>
                  <div style={s.cardBody}>
                    <div style={s.halfGrid}>
                      <div style={s.fieldWrap}>
                        <label style={s.fieldLabel}>First name</label>
                        <input style={s.input} value={profile.firstName} onChange={e => setProfile(p => ({...p, firstName: e.target.value}))} />
                      </div>
                      <div style={s.fieldWrap}>
                        <label style={s.fieldLabel}>Last name</label>
                        <input style={s.input} value={profile.lastName} onChange={e => setProfile(p => ({...p, lastName: e.target.value}))} />
                      </div>
                    </div>
                    <div style={s.halfGrid}>
                      <div style={s.fieldWrap}>
                        <label style={s.fieldLabel}>Email</label>
                        <input style={s.input} type="email" value={profile.email} onChange={e => setProfile(p => ({...p, email: e.target.value}))} />
                      </div>
                      <div style={s.fieldWrap}>
                        <label style={s.fieldLabel}>Phone</label>
                        <input style={s.input} value={profile.phone} onChange={e => setProfile(p => ({...p, phone: e.target.value}))} />
                      </div>
                    </div>
                    <button style={s.saveBtn} onClick={saveProfile}>Save changes</button>
                  </div>
                </div>

                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <div>
                      <div style={s.cardTitle}>Password</div>
                      <div style={s.cardSub}>Change your login password</div>
                    </div>
                  </div>
                  <div style={s.cardBody}>
                    <div style={s.halfGrid}>
                      <div style={s.fieldWrap}>
                        <label style={s.fieldLabel}>Current password</label>
                        <input style={s.input} type="password" placeholder="••••••••" />
                      </div>
                      <div style={s.fieldWrap}>
                        <label style={s.fieldLabel}>New password</label>
                        <input style={s.input} type="password" placeholder="••••••••" />
                      </div>
                    </div>
                    <button style={s.saveBtn}>Update password</button>
                  </div>
                </div>
              </>
            )}

            {/* ── Company ── */}
            {activeSection === "company" && (
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardTitle}>Company information</div>
                    <div style={s.cardSub}>Shown on leases, receipts, and PDF reports</div>
                  </div>
                  {saved && <span style={s.savedMsg}>✓ Saved!</span>}
                </div>
                <div style={s.cardBody}>
                  <div style={s.fieldWrap}>
                    <label style={s.fieldLabel}>Company name</label>
                    <input style={s.input} value={company.name} onChange={e => setCompany(p => ({...p, name: e.target.value}))} />
                  </div>
                  <div style={s.halfGrid}>
                    <div style={s.fieldWrap}>
                      <label style={s.fieldLabel}>Business address</label>
                      <input style={s.input} value={company.address} onChange={e => setCompany(p => ({...p, address: e.target.value}))} />
                    </div>
                    <div style={s.fieldWrap}>
                      <label style={s.fieldLabel}>EIN</label>
                      <input style={s.input} value={company.ein} onChange={e => setCompany(p => ({...p, ein: e.target.value}))} placeholder="XX-XXXXXXX" />
                    </div>
                  </div>
                  <div style={s.fieldWrap}>
                    <label style={s.fieldLabel}>Website</label>
                    <input style={s.input} value={company.website} onChange={e => setCompany(p => ({...p, website: e.target.value}))} placeholder="yourcompany.com" />
                  </div>
                  <button style={s.saveBtn} onClick={saveProfile}>Save changes</button>
                </div>
              </div>
            )}

            {/* ── Notifications ── */}
            {activeSection === "notifications" && (
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardTitle}>Notification preferences</div>
                    <div style={s.cardSub}>Choose how you receive alerts for each event</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 20px 0", gap: 40 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#888", width: 36, textAlign: "center" }}>EMAIL</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#888", width: 36, textAlign: "center" }}>SMS</span>
                </div>
                {notifs.map((n, i) => (
                  <div key={n.id} style={s.notifRow(i === notifs.length - 1)}>
                    <div style={s.notifLeft}>
                      <div style={s.notifLabel}>{n.label}</div>
                      <div style={s.notifSub}>{n.sub}</div>
                    </div>
                    <div style={s.notifToggles}>
                      {["email", "sms"].map(type => (
                        <div key={type} style={s.toggleWrap}>
                          <div style={s.toggle(n[type])} onClick={() => toggleNotif(n.id, type)}>
                            <div style={s.toggleThumb(n[type])} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Team ── */}
            {activeSection === "team" && (
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardTitle}>Team members</div>
                    <div style={s.cardSub}>Invite property managers or maintenance staff</div>
                  </div>
                  <button style={{ ...s.saveBtn, padding: "7px 14px", fontSize: 12 }}>+ Invite member</button>
                </div>
                {team.map((m, i) => (
                  <div key={m.id} style={s.memberRow(i === team.length - 1)}>
                    <div style={s.memberAvatar(m.color, m.bg)}>{m.avatar}</div>
                    <div style={{ flex: 1 }}>
                      <div style={s.memberName}>{m.name}</div>
                      <div style={s.memberEmail}>{m.email}</div>
                    </div>
                    <span style={s.roleBadge}>{m.role}</span>
                  </div>
                ))}
                <div style={{ padding: "16px 20px", borderTop: "1px solid #f0f0f0", background: "#fafafa" }}>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    💡 Team members can be assigned properties, manage maintenance tickets, and message tenants. Owners have full access.
                  </div>
                </div>
              </div>
            )}

            {/* ── Integrations ── */}
            {activeSection === "integrations" && (
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>Connected integrations</div>
                </div>
                {[
                  { icon: "💳", bg: "#E6F1FB", name: "Stripe", sub: "Payment processing for rent collection", connected: false },
                  { icon: "🏦", bg: "#EAF3DE", name: "Plaid",  sub: "Bank account verification for ACH payments", connected: false },
                  { icon: "📧", bg: "#FAEEDA", name: "SendGrid", sub: "Email notifications and receipts", connected: false },
                  { icon: "📱", bg: "#F3EEFB", name: "Twilio", sub: "SMS notifications to tenants", connected: false },
                  { icon: "📊", bg: "#f4f5f7", name: "QuickBooks", sub: "Sync income and expenses to QBO", connected: false },
                ].map((integ, i, arr) => (
                  <div key={i} style={s.integRow(i === arr.length - 1)}>
                    <div style={s.integLeft}>
                      <div style={s.integIcon(integ.bg)}>{integ.icon}</div>
                      <div>
                        <div style={s.integName}>{integ.name}</div>
                        <div style={s.integSub}>{integ.sub}</div>
                      </div>
                    </div>
                    {integ.connected
                      ? <span style={s.connectedBadge}>● Connected</span>
                      : <button style={s.connectBtn}>Connect</button>
                    }
                  </div>
                ))}
              </div>
            )}

            {/* ── Billing ── */}
            {activeSection === "billing" && (
              <>
                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <div>
                      <div style={s.cardTitle}>Current plan</div>
                      <div style={s.cardSub}>Polaris PM — Self-hosted</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", background: "#EAF3DE", color: "#3B6D11", borderRadius: 20 }}>Active</span>
                  </div>
                  <div style={{ padding: "20px" }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#0C447C", marginBottom: 6 }}>$0<span style={{ fontSize: 14, fontWeight: 400, color: "#888" }}>/month</span></div>
                    <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>You built this. No subscription fees.</div>
                    {["Unlimited properties", "Unlimited tenants", "Rent collection via Stripe", "Maintenance tracking", "Financial reports & DSCR"].map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13 }}>
                        <span style={{ color: "#3B6D11" }}>✓</span>{f}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={s.dangerZone}>
                  <div style={s.dangerTitle}>⚠️ Danger zone</div>
                  <div style={s.dangerSub}>These actions are irreversible. Proceed with caution.</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={s.dangerBtn}>Export all data</button>
                    <button style={s.dangerBtn}>Delete account</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
