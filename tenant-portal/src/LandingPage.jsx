import { useState } from "react";
import { useNavigate } from "react-router-dom";

const C = {
  bg:       "#0A0B0D",
  surface:  "#111316",
  raised:   "#181C21",
  border:   "#252930",
  text:     "#EDEAE2",
  textSub:  "#9095A0",
  textMuted:"#5C6270",
  gold:     "#C9A96E",
  goldDim:  "#7A5C2E",
  blue:     "#4A9AE8",
  green:    "#72B02A",
  red:      "#E05555",
  amber:    "#F0A430",
};

const FEATURES_LANDLORD = [
  { title: "Rent collection",     sub: "Stripe-powered payments, autopay, ACH" },
  { title: "Portfolio dashboard",  sub: "NOI, DSCR, occupancy at a glance" },
  { title: "Maintenance tracking", sub: "Tickets, vendors, cost tracking" },
  { title: "Financial reports",    sub: "P&L, rent roll, delinquency, CSV export" },
  { title: "Tenant management",    sub: "Leases, ledgers, communication" },
  { title: "Debt & DSCR",          sub: "Amortization, cap rate, lender-ready" },
];

const FEATURES_TENANT = [
  { title: "Pay rent online",      sub: "Card, ACH, autopay — no checks" },
  { title: "Submit requests",       sub: "Photo uploads, status tracking" },
  { title: "Message your landlord", sub: "Secure in-app messaging" },
  { title: "Download your ledger",  sub: "Lender-ready payment history PDF" },
  { title: "Insurance tracking",    sub: "Policy status, expiry alerts" },
  { title: "Bulletin board",        sub: "Connect with neighbors securely" },
];

const STATS = [
  { value: "63",   label: "Units managed" },
  { value: "3",    label: "Properties" },
  { value: "$0",   label: "Monthly SaaS fees" },
  { value: "100%", label: "Yours to own" },
];

const HOW = [
  { num: "01", title: "Add your properties", text: "Enter property details, units, and rent amounts. Import existing tenants or invite them to sign up." },
  { num: "02", title: "Invite your tenants", text: "Tenants get a magic link to create their account. Pay rent, submit requests, and message you right away." },
  { num: "03", title: "Run your portfolio", text: "Collect rent automatically, track maintenance, monitor NOI and DSCR, and grow your portfolio." },
];

function ModusMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.text, background: C.bg, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0B0D; }
        @keyframes fadeUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .m-nav-btn:hover { background: rgba(201,169,110,0.07) !important; }
        .m-nav-ghost:hover { border-color: #353A44 !important; color: #EDEAE2 !important; }
        .m-feature:hover { border-color: #353A44 !important; background: #181C21 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #252930; border-radius: 2px; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px", height: 64,
        borderBottom: `1px solid ${C.border}`,
        position: "sticky", top: 0,
        background: "rgba(10,11,13,0.92)", backdropFilter: "blur(12px)",
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ModusMark size={28} />
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: "0.1em" }}>MODUS</div>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.16em" }}>PROPERTY MANAGEMENT</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="m-nav-ghost" onClick={() => navigate("/login")} style={{
            padding: "7px 16px", background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 7, fontSize: 13, fontWeight: 500, color: C.textSub,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
          }}>Tenant login</button>
          <button className="m-nav-btn" onClick={() => navigate("/landlord/login")} style={{
            padding: "7px 16px", background: "transparent", border: `1px solid ${C.goldDim}`,
            borderRadius: 7, fontSize: 13, fontWeight: 500, color: C.gold,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s",
          }}>Landlord login</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{
        padding: "100px 48px 120px", textAlign: "center",
        position: "relative", overflow: "hidden",
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Subtle radial glow */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(201,169,110,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", animation: "fadeUp 0.6s ease" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 500, color: C.gold, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 24, padding: "5px 14px", border: `1px solid ${C.goldDim}`, borderRadius: 20 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.gold }} />
            Property management, reimagined
          </div>

          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 72, fontWeight: 600, color: C.text,
            lineHeight: 1.05, marginBottom: 24,
            maxWidth: 720, margin: "0 auto 24px",
            letterSpacing: "-0.01em",
          }}>
            One platform.<br />
            <span style={{ color: C.gold }}>Landlords and tenants.</span>
          </h1>

          <p style={{ fontSize: 18, color: C.textSub, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 48px" }}>
            Collect rent, track maintenance, manage leases, and analyze your portfolio — all in one place. Built for the sophisticated investor.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/landlord/login")} style={{
              padding: "14px 32px", background: C.goldDim, color: C.text,
              border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              letterSpacing: "0.02em", transition: "opacity 0.15s",
            }}>Landlord dashboard →</button>
            <button onClick={() => navigate("/login")} style={{
              padding: "14px 32px", background: "transparent", color: C.textSub,
              border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 500,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
            }}>Tenant portal →</button>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "flex", justifyContent: "center", gap: 0, borderBottom: `1px solid ${C.border}` }}>
        {STATS.map((s, i) => (
          <div key={i} style={{
            textAlign: "center", padding: "32px 60px",
            borderRight: i < STATS.length - 1 ? `1px solid ${C.border}` : "none",
          }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, color: C.gold, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 6, letterSpacing: "0.06em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Dual portal cards ── */}
      <div style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 600, color: C.text, marginBottom: 12 }}>Two portals. One powerful platform.</div>
          <div style={{ fontSize: 16, color: C.textSub }}>Everything landlords need to manage. Everything tenants need to live.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Landlord card */}
          <div
            style={{
              background: C.surface, border: `1px solid ${hovered === "landlord" ? C.goldDim : C.border}`,
              borderTop: `2px solid ${C.gold}`, borderRadius: 12, padding: "36px 32px",
              transition: "border-color 0.2s, transform 0.2s",
              transform: hovered === "landlord" ? "translateY(-3px)" : "none",
              cursor: "default",
            }}
            onMouseEnter={() => setHovered("landlord")}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.gold, marginBottom: 8 }}>Landlord Portal</div>
            <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, marginBottom: 28 }}>Manage your entire portfolio from one dashboard. From single-family rentals to 100-unit multifamily.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
              {FEATURES_LANDLORD.map((f, i) => (
                <div key={i} className="m-feature" style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, transition: "all 0.15s",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{f.title}</div>
                    <div style={{ fontSize: 11, color: C.textSub, marginTop: 1 }}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => navigate("/landlord/login")} style={{
              width: "100%", padding: "13px", background: "transparent",
              border: `1px solid ${C.goldDim}`, borderRadius: 8, fontSize: 14, fontWeight: 500,
              color: C.gold, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              transition: "background 0.15s", letterSpacing: "0.03em",
            }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(201,169,110,0.07)"}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >Go to landlord dashboard →</button>
          </div>

          {/* Tenant card */}
          <div
            style={{
              background: C.surface, border: `1px solid ${hovered === "tenant" ? "#353A44" : C.border}`,
              borderTop: `2px solid ${C.blue}`, borderRadius: 12, padding: "36px 32px",
              transition: "border-color 0.2s, transform 0.2s",
              transform: hovered === "tenant" ? "translateY(-3px)" : "none",
              cursor: "default",
            }}
            onMouseEnter={() => setHovered("tenant")}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.blue, marginBottom: 8 }}>Tenant Portal</div>
            <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, marginBottom: 28 }}>Everything you need as a renter — pay rent, submit requests, and stay connected — all from your phone.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
              {FEATURES_TENANT.map((f, i) => (
                <div key={i} className="m-feature" style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, transition: "all 0.15s",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blue, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{f.title}</div>
                    <div style={{ fontSize: 11, color: C.textSub, marginTop: 1 }}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => navigate("/login")} style={{
              width: "100%", padding: "13px", background: "transparent",
              border: `1px solid ${C.blue}44`, borderRadius: 8, fontSize: 14, fontWeight: 500,
              color: C.blue, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              transition: "background 0.15s", letterSpacing: "0.03em",
            }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(74,154,232,0.07)"}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >Go to tenant portal →</button>
          </div>
        </div>
      </div>

      {/* ── How it works ── */}
      <div style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 600, color: C.text, marginBottom: 12 }}>Get started in minutes</div>
          <div style={{ fontSize: 16, color: C.textSub }}>No lengthy onboarding. No sales calls. Just log in and go.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, maxWidth: 900, margin: "0 auto" }}>
          {HOW.map((step, i) => (
            <div key={i} style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, padding: "28px 24px" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, color: C.gold, marginBottom: 16, lineHeight: 1 }}>{step.num}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>{step.title}</div>
              <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>{step.text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div style={{ padding: "100px 48px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 500, height: 300, background: "radial-gradient(ellipse, rgba(201,169,110,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 600, color: C.text, marginBottom: 16, lineHeight: 1.1 }}>
            Ready to take control<br />of your portfolio?
          </div>
          <div style={{ fontSize: 16, color: C.textSub, marginBottom: 44 }}>
            Join landlords who've built their own premium management platform.
          </div>
          <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
            <button onClick={() => navigate("/landlord/login")} style={{
              padding: "14px 32px", background: C.goldDim, color: C.text,
              border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>Landlord dashboard →</button>
            <button onClick={() => navigate("/login")} style={{
              padding: "14px 32px", background: "transparent", color: C.textSub,
              border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 500,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>Tenant portal →</button>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "28px 48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ModusMark size={22} />
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: "0.08em" }}>MODUS</div>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>Built by Polaris Property Solutions LLC · Columbus, OH</div>
        <div style={{ fontSize: 12, color: C.textMuted }}>© {new Date().getFullYear()} All rights reserved</div>
      </div>
    </div>
  );
}