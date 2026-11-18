import { useNavigate } from "react-router-dom";
import { DARK as C } from "./lib/tokens";
import { FEATURES_LANDLORD, FEATURES_TENANT } from "./lib/landingFeatures";

const HOW = [
  { num: "01", title: "Add your properties", text: "Enter properties, units and rent on file, then add your tenants." },
  { num: "02", title: "Invite your tenants", text: "Each tenant gets an email invitation to set up their portal account." },
  { num: "03", title: "Run day-to-day operations", text: "Tenants report issues and send messages; you see what needs attention first and coordinate contractors." },
];

const STATUS_STYLE = {
  "Available":   { color: C.green, border: "rgba(93,187,99,0.4)" },
  "Coming soon": { color: C.amber, border: "rgba(227,154,53,0.45)" },
  "Planned":     { color: C.textSub, border: C.border },
};

function ModusMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function FeatureList({ items, accent }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((f) => {
        const st = STATUS_STYLE[f.status];
        return (
          <li key={f.title} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: f.status === "Available" ? accent : C.textMuted, flexShrink: 0, marginTop: 7 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: C.text }}>{f.title}</span>
              <span style={{ display: "block", fontSize: 13, color: C.textSub, marginTop: 2, lineHeight: 1.45 }}>{f.sub}</span>
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: st.color, border: `1px solid ${st.border}`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>{f.status}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.text, background: C.bg, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes fadeUp { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .lp-hero { animation: none !important; } }
        .lp-nav { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 clamp(16px, 4vw, 48px); min-height:64px; border-bottom:1px solid ${C.border}; position:sticky; top:0; background:rgba(11,13,16,0.94); backdrop-filter:blur(12px); z-index:100; }
        .lp-section { padding: clamp(40px, 7vw, 80px) clamp(16px, 4vw, 48px); }
        .lp-two { display:grid; gap:16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); max-width:1100px; margin:0 auto; }
        .lp-steps { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); max-width:960px; margin:0 auto; }
        .lp-h2 { font-family:'Cormorant Garamond', serif; font-size: clamp(28px, 5vw, 42px); font-weight:600; color:${C.text}; margin:0 0 10px; line-height:1.15; }
        .lp-cta { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
        .lp-cta .m-btn { min-height:48px; padding:0 24px; font-size:15px; }
        .lp-navbtns .m-btn { min-height:44px; }
        @media (max-width: 520px) {
          .lp-cta .m-btn { width:100%; }
          .lp-tag { display:none; }
          .lp-navbtns .m-btn { padding:0 12px; font-size:13px; }
        }
      `}</style>

      <nav className="lp-nav" aria-label="Site">
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <ModusMark size={28} />
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: "0.1em" }}>MODUS</div>
            <div className="lp-tag" style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.16em" }}>PROPERTY MANAGEMENT</div>
          </div>
        </div>
        <div className="lp-navbtns" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="m-btn m-btn-ghost" onClick={() => navigate("/login")} style={{ color: C.textSub, borderColor: C.border }}>Tenant login</button>
          <button type="button" className="m-btn m-btn-ghost" onClick={() => navigate("/landlord/login")} style={{ color: C.action, borderColor: C.border }}>Landlord login</button>
        </div>
      </nav>

      <header className="lp-section" style={{ textAlign: "center", position: "relative", overflow: "hidden", borderBottom: `1px solid ${C.border}` }}>
        <div aria-hidden="true" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(600px, 100%)", height: 400, background: "radial-gradient(ellipse, rgba(201,169,104,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="lp-hero" style={{ position: "relative", animation: "fadeUp 0.5s ease" }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 8vw, 64px)", fontWeight: 600, color: C.text, lineHeight: 1.08, maxWidth: 760, margin: "0 auto 18px", letterSpacing: "-0.01em" }}>
            Calm, organized<br /><span style={{ color: C.action }}>property management.</span>
          </h1>
          <p style={{ fontSize: "clamp(15px, 2.4vw, 18px)", color: C.textSub, lineHeight: 1.6, maxWidth: 560, margin: "0 auto 28px" }}>
            One place for maintenance, tenant messages and leases, with what needs your attention first.
            Online rent collection is coming soon.
          </p>
          <div className="lp-cta">
            <button type="button" className="m-btn m-btn-primary" onClick={() => navigate("/landlord/login")} style={{ background: C.action, color: C.onGold }}>Landlord dashboard →</button>
            <button type="button" className="m-btn m-btn-ghost" onClick={() => navigate("/login")} style={{ color: C.text, borderColor: C.border }}>Tenant portal →</button>
          </div>
        </div>
      </header>

      <section className="lp-section" aria-labelledby="lp-portals">
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h2 id="lp-portals" className="lp-h2">Two portals, one platform</h2>
          <div style={{ fontSize: 15, color: C.textSub }}>Each feature shows whether it is available today.</div>
        </div>
        <div className="lp-two">
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `2px solid ${C.gold}`, borderRadius: 14, padding: "clamp(20px, 4vw, 32px)" }}>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.action, margin: "0 0 6px" }}>Landlord portal</h3>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: "0 0 18px" }}>Run your rentals from one dashboard, on your phone or your desk.</p>
            <FeatureList items={FEATURES_LANDLORD} accent={C.gold} />
            <button type="button" className="m-btn m-btn-ghost" onClick={() => navigate("/landlord/login")} style={{ width: "100%", minHeight: 48, color: C.action, borderColor: C.border }}>Go to landlord dashboard →</button>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `2px solid ${C.blue}`, borderRadius: 14, padding: "clamp(20px, 4vw, 32px)" }}>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.blue, margin: "0 0 6px" }}>Tenant portal</h3>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: "0 0 18px" }}>Report issues, ask questions and keep your lease handy, from your phone.</p>
            <FeatureList items={FEATURES_TENANT} accent={C.blue} />
            <button type="button" className="m-btn m-btn-ghost" onClick={() => navigate("/login")} style={{ width: "100%", minHeight: 48, color: C.blue, borderColor: C.border }}>Go to tenant portal →</button>
          </div>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-how" style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h2 id="lp-how" className="lp-h2">How it works</h2>
        </div>
        <ol className="lp-steps" style={{ listStyle: "none", padding: 0 }}>
          {HOW.map((step) => (
            <li key={step.num} style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: C.action, marginBottom: 10, lineHeight: 1 }}>{step.num}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>{step.title}</div>
              <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6 }}>{step.text}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section" style={{ textAlign: "center" }}>
        <h2 className="lp-h2">Already set up with Modus?</h2>
        <div style={{ fontSize: 15, color: C.textSub, marginBottom: 24 }}>Sign in to your portal.</div>
        <div className="lp-cta">
          <button type="button" className="m-btn m-btn-primary" onClick={() => navigate("/landlord/login")} style={{ background: C.action, color: C.onGold }}>Landlord dashboard →</button>
          <button type="button" className="m-btn m-btn-ghost" onClick={() => navigate("/login")} style={{ color: C.text, borderColor: C.border }}>Tenant portal →</button>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "20px clamp(16px, 4vw, 48px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ModusMark size={22} />
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: "0.08em" }}>MODUS</div>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>Built by Polaris Property Solutions LLC · Columbus, OH</div>
        <div style={{ fontSize: 12, color: C.textMuted }}>© {new Date().getFullYear()} All rights reserved</div>
      </footer>
    </div>
  );
}
