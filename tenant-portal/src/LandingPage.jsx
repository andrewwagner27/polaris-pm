import { useState } from "react";
import { useNavigate } from "react-router-dom";

const FEATURES_LANDLORD = [
  { icon: "💰", title: "Rent collection",     sub: "Stripe-powered payments, autopay, ACH" },
  { icon: "📊", title: "Portfolio dashboard",  sub: "NOI, DSCR, occupancy at a glance" },
  { icon: "🔧", title: "Maintenance tracking", sub: "Tickets, vendors, cost tracking" },
  { icon: "📈", title: "Financial reports",    sub: "P&L, rent roll, delinquency, CSV export" },
  { icon: "👥", title: "Tenant management",    sub: "Leases, ledgers, communication" },
  { icon: "🏦", title: "Debt & DSCR",          sub: "Amortization, cap rate, lender-ready" },
];

const FEATURES_TENANT = [
  { icon: "💳", title: "Pay rent online",      sub: "Card, ACH, autopay — no checks" },
  { icon: "🔧", title: "Submit requests",       sub: "Photo uploads, status tracking" },
  { icon: "💬", title: "Message your landlord", sub: "Secure in-app messaging" },
  { icon: "📄", title: "Download your ledger",  sub: "Lender-ready payment history PDF" },
  { icon: "🛡️", title: "Insurance tracking",   sub: "Policy status, expiry alerts" },
  { icon: "📋", title: "Bulletin board",        sub: "Connect with neighbors securely" },
];

const STATS = [
  { value: "63",   label: "Units managed" },
  { value: "3",    label: "Properties" },
  { value: "$0",   label: "Monthly SaaS fees" },
  { value: "100%", label: "Yours to own" },
];

const s = {
  app: { fontFamily: "'Inter','Segoe UI',sans-serif", color: "#1a1a1a", background: "#fff", minHeight: "100vh" },
  // Nav
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", height: 64, borderBottom: "1px solid #f0f0f0", position: "sticky", top: 0, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", zIndex: 100 },
  navLogo: { display: "flex", alignItems: "center", gap: 10 },
  navLogoIcon: { width: 36, height: 36, borderRadius: 10, background: "#0C447C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 },
  navLogoText: { fontSize: 16, fontWeight: 700, color: "#0C447C" },
  navLinks: { display: "flex", alignItems: "center", gap: 28 },
  navLink: { fontSize: 13, color: "#555", cursor: "pointer", fontWeight: 500 },
  navCta: { display: "flex", gap: 10 },
  navBtnSecondary: { padding: "8px 16px", background: "transparent", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#1a1a1a", cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  navBtnPrimary: { padding: "8px 16px", background: "#0C447C", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  // Hero
  hero: { background: "linear-gradient(135deg, #0C1F3F 0%, #0C447C 50%, #185FA5 100%)", padding: "80px 40px 100px", textAlign: "center", position: "relative", overflow: "hidden" },
  heroEyebrow: { fontSize: 12, fontWeight: 600, color: "#85B7EB", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  heroEyebrowDot: { width: 6, height: 6, borderRadius: "50%", background: "#85B7EB" },
  heroTitle: { fontSize: 52, fontWeight: 800, color: "#fff", lineHeight: 1.1, marginBottom: 20, maxWidth: 700, margin: "0 auto 20px" },
  heroSub: { fontSize: 18, color: "#85B7EB", lineHeight: 1.6, maxWidth: 540, margin: "0 auto 40px" },
  heroCtas: { display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" },
  heroBtn: (primary) => ({ padding: "14px 28px", background: primary ? "#fff" : "rgba(255,255,255,0.12)", color: primary ? "#0C447C" : "#fff", border: primary ? "none" : "1px solid rgba(255,255,255,0.3)", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s" }),
  // Stats bar
  statsBar: { background: "#f8f9fa", borderBottom: "1px solid #e8eaed", padding: "20px 40px", display: "flex", justifyContent: "center", gap: 60 },
  statItem: { textAlign: "center" },
  statVal: { fontSize: 28, fontWeight: 800, color: "#0C447C" },
  statLabel: { fontSize: 12, color: "#888", marginTop: 3 },
  // Dual portal section
  dualSection: { padding: "80px 40px", maxWidth: 1100, margin: "0 auto" },
  dualTitle: { fontSize: 34, fontWeight: 800, textAlign: "center", marginBottom: 10 },
  dualSub: { fontSize: 16, color: "#888", textAlign: "center", marginBottom: 50 },
  dualGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 },
  portalCard: (color, bg) => ({ background: bg, border: `2px solid ${color}20`, borderRadius: 20, padding: "36px 32px", position: "relative", overflow: "hidden" }),
  portalCardAccent: (color) => ({ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: color }),
  portalIcon: { fontSize: 44, marginBottom: 16 },
  portalTitle: (color) => ({ fontSize: 24, fontWeight: 800, color, marginBottom: 8 }),
  portalSub: { fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 24 },
  featureList: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 },
  featureItem: { display: "flex", alignItems: "flex-start", gap: 12 },
  featureIcon: (bg) => ({ width: 34, height: 34, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }),
  featureText: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  featureSub: { fontSize: 11, color: "#888", marginTop: 2 },
  portalBtn: (color) => ({ width: "100%", padding: "13px", background: color, color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }),
  // How it works
  howSection: { background: "#f8f9fa", padding: "80px 40px" },
  howTitle: { fontSize: 34, fontWeight: 800, textAlign: "center", marginBottom: 10 },
  howSub: { fontSize: 16, color: "#888", textAlign: "center", marginBottom: 50 },
  howGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, maxWidth: 900, margin: "0 auto" },
  howCard: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, padding: "28px 24px", textAlign: "center" },
  howNum: { width: 44, height: 44, borderRadius: "50%", background: "#0C447C", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, margin: "0 auto 16px" },
  howTitle2: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  howText: { fontSize: 13, color: "#888", lineHeight: 1.6 },
  // CTA section
  ctaSection: { background: "linear-gradient(135deg, #0C1F3F, #0C447C)", padding: "80px 40px", textAlign: "center" },
  ctaTitle: { fontSize: 38, fontWeight: 800, color: "#fff", marginBottom: 12 },
  ctaSub: { fontSize: 16, color: "#85B7EB", marginBottom: 36 },
  ctaBtns: { display: "flex", gap: 14, justifyContent: "center" },
  // Footer
  footer: { background: "#0C1F3F", padding: "32px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  footerLogo: { fontSize: 14, fontWeight: 700, color: "#fff" },
  footerText: { fontSize: 12, color: "#5B7FA6" },
};

export default function LandingPage() {
  const navigate = useNavigate();
  const [hoveredPortal, setHoveredPortal] = useState(null);

  return (
    <div style={s.app}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes fadeUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.navLogo}>
          <div style={s.navLogoIcon}>🏢</div>
          <span style={s.navLogoText}>Polaris PM</span>
        </div>
        <div style={s.navLinks}>
          <span style={s.navLink}>Features</span>
          <span style={s.navLink}>Pricing</span>
          <span style={s.navLink}>About</span>
        </div>
        <div style={s.navCta}>
          <button style={s.navBtnSecondary} onClick={() => navigate("/login")}>Tenant login</button>
          <button style={s.navBtnPrimary} onClick={() => navigate("/landlord")}>Landlord login</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={s.hero}>
        {/* Background decoration */}
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
        <div style={{ position: "absolute", bottom: -80, left: -80, width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />

        <div style={{ position: "relative", animation: "fadeUp 0.5s ease" }}>
          <div style={s.heroEyebrow}>
            <div style={s.heroEyebrowDot} />
            Property management, reimagined
            <div style={s.heroEyebrowDot} />
          </div>
          <h1 style={s.heroTitle}>
            One platform.<br />Landlords and tenants.
          </h1>
          <p style={s.heroSub}>
            Collect rent, track maintenance, manage leases, and analyze your portfolio — all in one place. Built for the modern landlord.
          </p>
          <div style={s.heroCtas}>
            <button style={s.heroBtn(true)} onClick={() => navigate("/landlord")}>
              🏢 I'm a landlord →
            </button>
            <button style={s.heroBtn(false)} onClick={() => navigate("/login")}>
              🏠 I'm a tenant →
            </button>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={s.statsBar}>
        {STATS.map((stat, i) => (
          <div key={i} style={s.statItem}>
            <div style={s.statVal}>{stat.value}</div>
            <div style={s.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Dual portal cards */}
      <div style={s.dualSection}>
        <div style={s.dualTitle}>Two portals. One powerful platform.</div>
        <div style={s.dualSub}>Everything landlords need to manage. Everything tenants need to live.</div>

        <div style={s.dualGrid}>
          {/* Landlord card */}
          <div style={{ ...s.portalCard("#0C447C", "#F0F5FF"), transform: hoveredPortal === "landlord" ? "translateY(-4px)" : "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: hoveredPortal === "landlord" ? "0 12px 40px rgba(12,68,124,0.15)" : "none" }}
            onMouseEnter={() => setHoveredPortal("landlord")}
            onMouseLeave={() => setHoveredPortal(null)}>
            <div style={s.portalCardAccent("#0C447C")} />
            <div style={s.portalIcon}>🏢</div>
            <div style={s.portalTitle("#0C447C")}>Landlord Portal</div>
            <div style={s.portalSub}>Manage your entire portfolio from one dashboard. From single-family rentals to 100-unit multifamily.</div>
            <div style={s.featureList}>
              {FEATURES_LANDLORD.map((f, i) => (
                <div key={i} style={s.featureItem}>
                  <div style={s.featureIcon("#E6F1FB")}>{f.icon}</div>
                  <div>
                    <div style={s.featureText}>{f.title}</div>
                    <div style={s.featureSub}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <button style={s.portalBtn("#0C447C")} onClick={() => navigate("/landlord")}>
              Go to landlord dashboard →
            </button>
          </div>

          {/* Tenant card */}
          <div style={{ ...s.portalCard("#3B6D11", "#F2FAF0"), transform: hoveredPortal === "tenant" ? "translateY(-4px)" : "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: hoveredPortal === "tenant" ? "0 12px 40px rgba(59,109,17,0.15)" : "none" }}
            onMouseEnter={() => setHoveredPortal("tenant")}
            onMouseLeave={() => setHoveredPortal(null)}>
            <div style={s.portalCardAccent("#3B6D11")} />
            <div style={s.portalIcon}>🏠</div>
            <div style={s.portalTitle("#3B6D11")}>Tenant Portal</div>
            <div style={s.portalSub}>Everything you need as a renter — pay rent, submit requests, and stay connected — all from your phone.</div>
            <div style={s.featureList}>
              {FEATURES_TENANT.map((f, i) => (
                <div key={i} style={s.featureItem}>
                  <div style={s.featureIcon("#EAF3DE")}>{f.icon}</div>
                  <div>
                    <div style={s.featureText}>{f.title}</div>
                    <div style={s.featureSub}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <button style={s.portalBtn("#3B6D11")} onClick={() => navigate("/login")}>
              Go to tenant portal →
            </button>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={s.howSection}>
        <div style={s.howTitle}>Get started in minutes</div>
        <div style={s.howSub}>No lengthy onboarding. No sales calls. Just log in and go.</div>
        <div style={s.howGrid}>
          {[
            { num: "1", title: "Add your properties", text: "Enter your property details, units, and rent amounts. Import existing tenants or invite them to sign up." },
            { num: "2", title: "Invite your tenants", text: "Tenants get a link to create their account. They can pay rent, submit requests, and message you right away." },
            { num: "3", title: "Run your portfolio", text: "Collect rent automatically, track maintenance, monitor your NOI and DSCR, and grow your portfolio." },
          ].map((step, i) => (
            <div key={i} style={s.howCard}>
              <div style={s.howNum}>{step.num}</div>
              <div style={s.howTitle2}>{step.title}</div>
              <div style={s.howText}>{step.text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={s.ctaSection}>
        <div style={s.ctaTitle}>Ready to take control of your portfolio?</div>
        <div style={s.ctaSub}>Join landlords who've ditched expensive SaaS tools and built their own.</div>
        <div style={s.ctaBtns}>
          <button style={s.heroBtn(true)} onClick={() => navigate("/landlord")}>
            🏢 Landlord dashboard →
          </button>
          <button style={s.heroBtn(false)} onClick={() => navigate("/login")}>
            🏠 Tenant portal →
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <div style={s.footerLogo}>🏢 Polaris PM</div>
        <div style={s.footerText}>Built by Polaris Property Solutions LLC · Columbus, OH</div>
        <div style={s.footerText}>© {new Date().getFullYear()} All rights reserved</div>
      </div>
    </div>
  );
}
