import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// Marketing page. Product visuals are CSS mockups of the real Modus screens with illustrative sample data (no
// screenshots of real tenants, no invented customers or metrics). Online rent payment is not offered here: it is
// not live (tests/landing-claims.test.mjs).
const INK = "#0E1116", INK2 = "#161A21", INK3 = "#1E232C", LINE = "#262B33";
const IVORY = "#F5F3EE", WHITE = "#FFFFFF", PAPER_LINE = "#E7E2D8";
const GOLD = "#C7A86C", GOLD_DEEP = "#7A5C12";
const TXT = "#F5F2EB", TXT2 = "#B7BBC4", TXT3 = "#9298A3";
const DARK_TXT = "#18181B", DARK_TXT2 = "#52525B";

function ModusMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M6 33V10L20 27L34 10V33" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke="rgba(199,168,108,0.45)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function Wordmark({ dark = true }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <ModusMark/>
      <span style={{ fontFamily: "var(--m-font-brand)", fontSize: 18, fontWeight: 600, letterSpacing: "0.12em", color: dark ? TXT : DARK_TXT }}>MODUS</span>
    </span>
  );
}

const Icon = ({ d, size = 22, color = GOLD }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>
);
const ICONS = {
  organize: "M4 5h16M4 12h16M4 19h10",
  respond:  "M13 3L4 14h7l-1 7 9-11h-7l1-7z",
  control:  "M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7l8-4zM9 12l2 2 4-4",
  building: "M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 11h.01M16 11h.01",
};

// ── Product mockups (decorative; the real screens are behind sign-in) ─────────────────────────────────────
function Tag({ kind }) {
  const s = kind === "Urgent" ? { c: "#F2A3A3", b: "rgba(240,112,112,0.14)" }
    : kind === "Decision" ? { c: GOLD, b: "rgba(199,168,108,0.14)" } : { c: "#9DC6F2", b: "rgba(106,174,240,0.14)" };
  return <span className="lp-tag" style={{ color: s.c, background: s.b }}>{kind}</span>;
}

function DashboardMock() {
  const rows = [
    { kind: "Urgent",    title: "Water leak reported, bathroom ceiling", meta: "Clifton Manor · Unit 3", cta: "Arrange contractor", primary: true },
    { kind: "Decision",  title: "Quote to approve: sticking bedroom door", meta: "$140 · Handyman · Unit 2", cta: "Review quote" },
    { kind: "Decision",  title: "Work completed: garbage disposal", meta: "Review the work and invoice", cta: "Review & close" },
    { kind: "Follow up", title: "Invitation not accepted", meta: "Sent 5 days ago · Unit 101", cta: "Open tenant" },
  ];
  return (
    <div className="lp-window" aria-hidden="true">
      <div className="lp-window-bar"><i/><i/><i/><span>Home</span><span className="lp-scope">All properties ▾</span></div>
      <div className="lp-window-body">
        <aside className="lp-side">
          <Wordmark/>
          {["Home", "Maintenance", "Messages", "Properties", "Tenants", "Financials"].map((n, i) => (
            <div key={n} className={i === 0 ? "lp-side-item on" : "lp-side-item"}>{n}</div>
          ))}
        </aside>
        <div className="lp-main">
          <div className="lp-h1">Good morning</div>
          <div className="lp-sub">4 items waiting on you</div>
          <div className="lp-queue">
            {rows.map((r) => (
              <div key={r.title} className={`lp-row${r.kind === "Urgent" ? " urgent" : ""}`}>
                <Tag kind={r.kind}/>
                <div className="lp-row-text"><b>{r.title}</b><span>{r.meta}</span></div>
                <span className={r.primary ? "lp-act primary" : "lp-act"}>{r.cta}</span>
              </div>
            ))}
          </div>
          <div className="lp-stats">
            {[["Occupancy", "11 of 12"], ["Open requests", "5"], ["Leases ending", "2 in 60 days"]].map(([k, v]) => (
              <div key={k} className="lp-stat"><span>{k}</span><b>{v}</b></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionMock() {
  return (
    <div className="lp-window lp-window-tight" aria-hidden="true">
      <div className="lp-window-bar"><i/><i/><i/><span>Maintenance</span><span className="lp-scope">Clifton Manor ▾</span></div>
      <div className="lp-main" style={{ padding: 22 }}>
        <div className="lp-chips"><span className="on">Needs you · 3</span><span>In progress · 1</span><span>Resolved</span></div>
        <div className="lp-ticket">
          <div className="lp-ticket-head"><Tag kind="Decision"/><span className="lp-muted">Unit 2 · Plumbing</span></div>
          <div className="lp-ticket-title">Kitchen faucet drips constantly</div>
          <div className="lp-quote">
            <div><span className="lp-muted">Quote from</span><b>Handyman Contractor Services</b></div>
            <div className="lp-amount">$185</div>
          </div>
          <div className="lp-steps">
            {["Reported", "Contractor assigned", "Quote received", "Approved", "Completed"].map((s, i) => (
              <span key={s} className={i < 3 ? "done" : i === 3 ? "next" : ""}>{s}</span>
            ))}
          </div>
          <div className="lp-ticket-actions"><span className="lp-act primary">Approve quote</span><span className="lp-act">Ask a question</span></div>
        </div>
      </div>
    </div>
  );
}

function PhoneMock() {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-phone-notch"/>
      <div className="lp-phone-screen">
        <div className="lp-home-card">
          <span className="lp-home-badge">Your home</span>
          <Icon d={ICONS.building} size={30} color={GOLD_DEEP}/>
          <div className="lp-home-unit">Unit 2</div>
          <div className="lp-home-prop">Clifton Manor</div>
        </div>
        <div className="lp-p-card">
          <div className="lp-p-label">Maintenance</div>
          <div className="lp-p-title">Kitchen faucet</div>
          <div className="lp-p-status"><i/>Contractor scheduled for Thursday</div>
        </div>
        <div className="lp-p-card">
          <div className="lp-p-label">Messages</div>
          <div className="lp-bubble">Guest parking is in the visitor spaces near the north entrance.</div>
        </div>
        <div className="lp-p-card lp-p-row">
          <div><div className="lp-p-label">Lease</div><div className="lp-p-title">Through Aug 2027</div></div>
          <span className="lp-p-link">Documents</span>
        </div>
        <div className="lp-p-nav">{["Home", "Maint.", "Messages", "Account"].map((n, i) => <span key={n} className={i === 0 ? "on" : ""}>{n}</span>)}</div>
      </div>
    </div>
  );
}

const BENEFITS = [
  { icon: "organize", title: "Stay organized", text: "Your properties, tenants, and requests in one place." },
  { icon: "respond",  title: "Respond faster", text: "See urgent issues and decisions before they become problems." },
  { icon: "control",  title: "Stay in control", text: "Approve contractors, review work, and oversee your portfolio." },
];

const TOUR_STEPS = [
  { role: "Resident portal", title: "Report a dripping faucet", status: "Draft", detail: "Unit 2 · Kitchen · Photo attached", action: "Submit sample request" },
  { role: "Manager dashboard", title: "Review the contractor quote", status: "Quote ready", detail: "Faucet repair · Contractor quote $185", action: "Approve sample quote" },
  { role: "Resident portal", title: "See when the repair is scheduled", status: "Scheduled", detail: "Kitchen faucet · Thursday, 10 am–12 pm", action: "Restart walkthrough" },
];

function MaintenanceTour() {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];

  return (
    <section id="maintenance-tour" tabIndex={-1} aria-labelledby="maintenance-tour-title" className="lp-light lp-white lp-tour">
      <div className="lp-wrap">
        <div className="lp-tour-heading">
          <h2 id="maintenance-tour-title">Try the maintenance walkthrough</h2>
          <p>Follow one repair through the resident and manager views. This demo uses sample data.</p>
        </div>
        <div className="lp-tour-shell">
          <ol className="lp-tour-steps" aria-label="Walkthrough steps">
            {["Report an issue", "Approve a quote", "See the schedule"].map((label, index) => (
              <li key={label}>
                <button type="button" aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}>
                  <span>{index + 1}</span>{label}
                </button>
              </li>
            ))}
          </ol>
          <div className="lp-tour-panel">
            <div className="lp-tour-context" aria-live="polite" aria-atomic="true">
              <div className="lp-tour-meta"><span>{current.role}</span><span>{current.status}</span></div>
              <h3>{current.title}</h3>
              <p>{current.detail}</p>
              {step === 0 && <blockquote>“The kitchen faucet keeps dripping even when it’s fully closed.”</blockquote>}
              {step === 1 && <blockquote>Replace the worn faucet cartridge and test for leaks.</blockquote>}
              {step === 2 && <blockquote>Management added a repair window to the request.</blockquote>}
            </div>
            <button type="button" className="lp-btn lp-btn-gold" onClick={() => setStep((step + 1) % TOUR_STEPS.length)}>{current.action}</button>
            {step > 0 && (
              <div className="lp-tour-preview">
                {step === 1 ? <DecisionMock/> : <PhoneMock/>}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef(null);
  const menuRef = useRef(null);

  // Mobile menu: Escape closes and returns focus to the button; the first link takes focus on open.
  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector("a,button")?.focus();
    const onKey = (e) => { if (e.key === "Escape") { setMenuOpen(false); menuBtn.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const go = (path) => (e) => { e.preventDefault(); setMenuOpen(false); navigate(path); };

  return (
    <div className="lp">
      <style>{CSS}</style>

      {/* ── Header ── */}
      <header className="lp-header">
        <div className="lp-wrap lp-header-row">
          <a href="/" onClick={go("/")} aria-label="Modus home" className="lp-logo"><Wordmark/></a>
          <nav className="lp-nav-desktop" aria-label="Sign in">
            <a href="/login" onClick={go("/login")}>Tenant login</a>
            <a href="/landlord/login" onClick={go("/landlord/login")} className="lp-nav-strong">Landlord login</a>
          </nav>
          <button ref={menuBtn} type="button" className="lp-burger" aria-label="Menu" aria-expanded={menuOpen} aria-controls="lp-menu"
            onClick={() => setMenuOpen((v) => !v)}>
            <span/><span/><span/>
          </button>
        </div>
        {menuOpen && (
          <div id="lp-menu" ref={menuRef} className="lp-menu">
            <a href="/landlord/login" onClick={go("/landlord/login")}>Landlord login</a>
            <a href="/login" onClick={go("/login")}>Tenant login</a>
          </div>
        )}
      </header>

      <main>
        {/* ── 1. Hero (dark) ── */}
        <section className="lp-hero">
          <div className="lp-wrap">
            <div className="lp-hero-copy">
              <h1>Property management, without the busywork.</h1>
              <p>Track repairs from the first resident report to the final invoice, alongside tenant messages and property records.</p>
              <div className="lp-cta">
                <a href="#maintenance-tour" className="lp-btn lp-btn-gold">See how maintenance works</a>
                <a href="/login" onClick={go("/login")} className="lp-btn lp-btn-quiet">Tenant portal</a>
              </div>
            </div>
            <figure className="lp-hero-visual">
              <DashboardMock/>
              <figcaption>The Modus landlord dashboard, shown with sample data.</figcaption>
            </figure>
          </div>
        </section>

        <MaintenanceTour/>

        {/* ── 2. Landlord experience (ivory) ── */}
        <section className="lp-light lp-ivory">
          <div className="lp-wrap lp-split">
            <div className="lp-split-copy">
              <span className="lp-eyebrow">For landlords</span>
              <h2>Know what needs your attention. Instantly.</h2>
              <p>Urgent repairs, quotes to approve and finished work come to the top, organized by property.</p>
              <ul className="lp-points">
                <li>Approve contractors and quotes in one step</li>
                <li>Review completed work before closing a ticket</li>
                <li>Switch between properties without losing your place</li>
              </ul>
            </div>
            <figure className="lp-split-visual">
              <DecisionMock/>
              <figcaption>Sample maintenance decision.</figcaption>
            </figure>
          </div>
        </section>

        {/* ── 3. Tenant experience (light) ── */}
        <section className="lp-light lp-white">
          <div className="lp-wrap lp-split lp-split-rev">
            <figure className="lp-split-visual lp-phone-wrap">
              <PhoneMock/>
              <figcaption>Sample tenant home screen.</figcaption>
            </figure>
            <div className="lp-split-copy">
              <span className="lp-eyebrow">For residents</span>
              <h2>A better experience for the people who call your properties home.</h2>
              <p>Residents report issues with photos, follow progress, message management, and keep their lease details close.</p>
            </div>
          </div>
        </section>

        {/* ── 4. Benefits (ivory) ── */}
        <section className="lp-light lp-ivory">
          <div className="lp-wrap">
            <div className="lp-benefits">
              {BENEFITS.map((b) => (
                <div key={b.title} className="lp-benefit">
                  <span className="lp-benefit-icon"><Icon d={ICONS[b.icon]} color={GOLD_DEEP}/></span>
                  <h3>{b.title}</h3>
                  <p>{b.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5. Final CTA (charcoal) ── */}
        <section className="lp-final">
          <div className="lp-wrap">
            <h2>Less administration. More ownership.</h2>
            <a href="#maintenance-tour" className="lp-btn lp-btn-gold">See how maintenance works</a>
            <p className="lp-final-links">Already using Modus? <a href="/landlord/login" onClick={go("/landlord/login")}>Landlord login</a> · <a href="/login" onClick={go("/login")}>Tenant login</a></p>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row"><Wordmark/><span>© {new Date().getFullYear()} Modus Property Management</span></div>
      </footer>
    </div>
  );
}

const CSS = `
.lp { font-family: var(--m-font); color: ${TXT}; background: ${INK}; min-height: 100vh; min-height: 100dvh; }
.lp a { color: inherit; }
.lp-wrap { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.lp h1, .lp h2, .lp h3 { font-family: var(--m-font); margin: 0; }

/* Header */
.lp-header { position: sticky; top: 0; z-index: 50; background: rgba(14,17,22,0.88); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.05); }
.lp-header-row { display: flex; align-items: center; justify-content: space-between; min-height: 72px; }
.lp-logo { text-decoration: none; display: inline-flex; min-height: 44px; align-items: center; }
.lp-nav-desktop { display: flex; gap: 8px; align-items: center; }
.lp-nav-desktop a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 10px; font-size: 14px; font-weight: 500; color: ${TXT2}; text-decoration: none; }
.lp-nav-desktop a:hover { color: ${TXT}; background: rgba(255,255,255,0.04); }
.lp-nav-desktop a.lp-nav-strong { color: ${GOLD}; border: 1px solid rgba(199,168,108,0.35); }
.lp-burger { display: none; width: 44px; height: 44px; border: 0; background: transparent; border-radius: 10px; cursor: pointer; padding: 13px 11px; flex-direction: column; justify-content: space-between; }
.lp-burger span { display: block; height: 2px; border-radius: 2px; background: ${TXT}; }
.lp-menu { border-top: 1px solid rgba(255,255,255,0.06); padding: 8px 16px 16px; display: flex; flex-direction: column; gap: 4px; background: ${INK}; }
.lp-menu a { display: flex; align-items: center; min-height: 48px; padding: 0 12px; border-radius: 10px; font-size: 16px; font-weight: 500; text-decoration: none; color: ${TXT}; }
.lp-menu a:first-child { color: ${GOLD}; }
@media (max-width: 720px) { .lp-nav-desktop { display: none; } .lp-burger { display: flex; } }
@media (min-width: 721px) { .lp-menu { display: none; } }

/* Buttons */
.lp-tour { scroll-margin-top: 90px; }
.lp-tour-heading { max-width: 650px; margin: 0 auto 28px; text-align: center; }
.lp-tour-heading p { color: #52525B; line-height: 1.6; }
.lp-tour-shell { display: grid; grid-template-columns: minmax(190px, 1fr) minmax(0, 2.4fr); gap: 16px; background: #0E1116; padding: clamp(12px, 3vw, 28px); border-radius: 22px; color: #F5F2EB; }
.lp-tour-steps { display: grid; align-content: start; gap: 8px; margin: 0; padding: 0; list-style: none; }
.lp-tour-steps button { display: flex; align-items: center; gap: 10px; min-height: 48px; width: 100%; padding: 8px 12px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.lp-tour-steps button[aria-current="step"] { background: #262B33; border-color: #62646A; }
.lp-tour-steps button span { color: #C7A86C; font-variant-numeric: tabular-nums; }
.lp-tour-panel { background: #161A21; border-radius: 14px; border: 1px solid #363C45; padding: clamp(16px, 4vw, 32px); }
.lp-tour-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: space-between; font-size: 13px; color: #C7A86C; }
.lp-tour-panel h3 { margin: 22px 0 8px; font-size: clamp(20px, 3vw, 28px); }
.lp-tour-panel p { margin: 0; color: #B7BBC4; }
.lp-tour-panel blockquote { margin: 18px 0; padding: 12px; border-left: 2px solid #C7A86C; background: #1E232C; }
.lp-tour-panel .lp-btn { border: 0; cursor: pointer; font-family: inherit; }
.lp-tour-preview { display: grid; justify-items: center; margin-top: 24px; }
.lp-tour-preview .lp-window { width: 100%; max-width: 560px; }
.lp-tour button:focus-visible { outline: 2px solid #C7A86C; outline-offset: 3px; }
@media (max-width: 720px) { .lp-tour-shell { grid-template-columns: 1fr; } }
.lp-cta { display: flex; flex-wrap: wrap; gap: 12px; }
.lp-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 24px; border-radius: 12px; font-size: 15px; font-weight: 600; text-decoration: none; transition: filter .15s, background .15s; }
.lp-btn-gold { background: ${GOLD}; color: ${INK} !important; }
.lp-btn-gold:hover { filter: brightness(1.07); }
.lp-btn-quiet { color: ${TXT} !important; border: 1px solid rgba(255,255,255,0.14); }
.lp-btn-quiet:hover { background: rgba(255,255,255,0.05); }

/* Hero */
.lp-hero { padding: 88px 0 72px; background: radial-gradient(1200px 500px at 50% -10%, rgba(199,168,108,0.08), transparent 70%), ${INK}; }
.lp-hero-copy { max-width: 760px; margin: 0 auto; text-align: center; }
.lp-hero h1 { font-size: clamp(34px, 6vw, 60px); line-height: 1.07; font-weight: 600; letter-spacing: -0.02em; }
.lp-hero p { margin: 22px auto 32px; max-width: 600px; font-size: clamp(16px, 2vw, 19px); line-height: 1.6; color: ${TXT2}; }
.lp-hero .lp-cta { justify-content: center; }
.lp .lp-hero-visual { margin: 64px auto 0; max-width: 1080px; }
.lp figure { margin: 0; }
.lp figcaption { margin-top: 14px; font-size: 13px; color: ${TXT3}; text-align: center; }

/* Product window mockups */
.lp-window { background: ${INK2}; border: 1px solid ${LINE}; border-radius: 16px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.45); text-align: left; color: ${TXT}; }
.lp-window-bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid ${LINE}; font-size: 13px; color: ${TXT2}; }
.lp-window-bar i { width: 10px; height: 10px; border-radius: 50%; background: #2C323C; }
.lp-window-bar span:first-of-type { margin-left: 10px; font-weight: 600; color: ${TXT}; }
.lp-scope { margin-left: auto; padding: 6px 12px; border: 1px solid ${LINE}; border-radius: 8px; font-size: 12px; }
.lp-window-body { display: grid; grid-template-columns: 200px minmax(0, 1fr); }
.lp-side { padding: 20px 14px; border-right: 1px solid ${LINE}; display: flex; flex-direction: column; gap: 4px; }
.lp-side > span { margin: 0 6px 16px; }
.lp-side-item { padding: 9px 12px; border-radius: 8px; font-size: 13px; color: ${TXT2}; }
.lp-side-item.on { background: rgba(199,168,108,0.10); color: ${GOLD}; }
.lp-main { padding: 28px; min-width: 0; }
.lp-h1 { font-size: 24px; font-weight: 600; }
.lp-sub { font-size: 13px; color: ${TXT3}; margin: 4px 0 18px; }
.lp-queue { background: ${INK3}; border-radius: 12px; overflow: hidden; }
.lp-row { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-top: 1px solid ${LINE}; }
.lp-row:first-child { border-top: 0; }
.lp-row.urgent { box-shadow: inset 3px 0 0 #F07070; }
.lp-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.lp-row-text b { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-row-text span { font-size: 12px; color: ${TXT3}; }
.lp-tag { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.lp-act { font-size: 12px; font-weight: 600; padding: 8px 12px; border-radius: 8px; border: 1px solid ${LINE}; color: ${GOLD}; white-space: nowrap; }
.lp-act.primary { background: ${GOLD}; color: ${INK}; border-color: ${GOLD}; }
.lp-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.lp-stat { padding: 14px 16px; border-radius: 12px; background: ${INK3}; display: flex; flex-direction: column; gap: 4px; }
.lp-stat span { font-size: 12px; color: ${TXT3}; }
.lp-stat b { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }

/* Light sections */
.lp-light { color: ${DARK_TXT}; padding: 104px 0; }
.lp-ivory { background: ${IVORY}; }
.lp-white { background: #FBFAF7; }
.lp-light figcaption { color: #6B6B73; }
.lp-split { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 72px; align-items: center; }
.lp-split-rev { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.lp-eyebrow { display: inline-block; font-size: 13px; font-weight: 600; color: ${GOLD_DEEP}; margin-bottom: 14px; }
.lp-light h2 { font-size: clamp(28px, 4vw, 42px); line-height: 1.15; font-weight: 600; letter-spacing: -0.015em; }
.lp-split-copy p { margin-top: 18px; font-size: 17px; line-height: 1.65; color: ${DARK_TXT2}; max-width: 460px; }
.lp-points { list-style: none; padding: 0; margin: 28px 0 0; display: flex; flex-direction: column; gap: 12px; }
.lp-points li { position: relative; padding-left: 26px; font-size: 15px; color: ${DARK_TXT}; }
.lp-points li::before { content: ""; position: absolute; left: 0; top: 7px; width: 12px; height: 7px; border-left: 2px solid ${GOLD_DEEP}; border-bottom: 2px solid ${GOLD_DEEP}; transform: rotate(-45deg); }
.lp-window-tight { box-shadow: 0 24px 60px rgba(24,24,27,0.18); }
.lp-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.lp-chips span { font-size: 12px; padding: 6px 12px; border-radius: 999px; color: ${TXT2}; background: ${INK3}; }
.lp-chips span.on { color: ${INK}; background: ${GOLD}; font-weight: 600; }
.lp-ticket { background: ${INK3}; border-radius: 14px; padding: 20px; }
.lp-ticket-head { display: flex; align-items: center; gap: 10px; }
.lp-muted { font-size: 12px; color: ${TXT3}; }
.lp-ticket-title { font-size: 18px; font-weight: 600; margin: 12px 0 16px; }
.lp-quote { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 10px; background: ${INK2}; }
.lp-quote div:first-child { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.lp-quote b { font-size: 14px; font-weight: 500; }
.lp-amount { font-size: 22px; font-weight: 600; color: ${GOLD}; font-variant-numeric: tabular-nums; }
.lp-steps { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 16px 0; }
.lp-steps span { font-size: 12px; color: ${TXT3}; display: inline-flex; align-items: center; gap: 6px; }
.lp-steps span::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #3A414C; }
.lp-steps span.done::before { background: #5DBB63; }
.lp-steps span.next { color: ${TXT}; }
.lp-steps span.next::before { background: ${GOLD}; }
.lp-ticket-actions { display: flex; gap: 10px; flex-wrap: wrap; }

/* Phone mockup */
.lp-phone-wrap { display: flex; flex-direction: column; align-items: center; }
.lp-phone { width: 300px; max-width: 100%; padding: 12px; border-radius: 44px; background: #1B1E24; box-shadow: 0 30px 70px rgba(24,24,27,0.22); position: relative; }
.lp-phone-notch { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); width: 84px; height: 22px; border-radius: 12px; background: #1B1E24; z-index: 2; }
.lp-phone-screen { background: ${IVORY}; border-radius: 34px; padding: 52px 14px 12px; display: flex; flex-direction: column; gap: 10px; color: ${DARK_TXT}; }
.lp-home-card { position: relative; padding: 18px; border-radius: 18px; background: linear-gradient(160deg, #FBF7EE, #F1EADB); border: 1px solid #E6DCC6; }
.lp-home-badge { position: absolute; top: 14px; right: 14px; font-size: 10px; font-weight: 600; color: ${GOLD_DEEP}; background: rgba(122,92,18,0.08); padding: 3px 8px; border-radius: 999px; }
.lp-home-unit { margin-top: 10px; font-size: 20px; font-weight: 600; }
.lp-home-prop { font-size: 12px; color: ${DARK_TXT2}; }
.lp-p-card { background: ${WHITE}; border-radius: 14px; padding: 12px 14px; box-shadow: 0 1px 2px rgba(24,24,27,0.05); }
.lp-p-label { font-size: 11px; color: #6B6B73; margin-bottom: 3px; }
.lp-p-title { font-size: 14px; font-weight: 600; }
.lp-p-status { margin-top: 6px; font-size: 12px; color: ${DARK_TXT2}; display: flex; align-items: center; gap: 6px; }
.lp-p-status i { width: 7px; height: 7px; border-radius: 50%; background: ${GOLD_DEEP}; }
.lp-bubble { font-size: 12px; line-height: 1.45; background: ${IVORY}; border-radius: 4px 12px 12px 12px; padding: 8px 10px; color: ${DARK_TXT}; }
.lp-p-row { display: flex; align-items: center; justify-content: space-between; }
.lp-p-link { font-size: 12px; font-weight: 600; color: ${GOLD_DEEP}; }
.lp-p-nav { display: flex; justify-content: space-around; padding: 10px 0 4px; border-top: 1px solid ${PAPER_LINE}; margin-top: 2px; }
.lp-p-nav span { font-size: 11px; color: #6B6B73; }
.lp-p-nav span.on { color: ${GOLD_DEEP}; font-weight: 600; }

/* Benefits */
.lp-benefits { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 24px; }
.lp-benefit { background: ${WHITE}; border-radius: 18px; padding: 32px 28px; box-shadow: 0 1px 2px rgba(24,24,27,0.04), 0 8px 24px rgba(24,24,27,0.04); }
.lp-benefit-icon { display: inline-flex; width: 48px; height: 48px; border-radius: 14px; align-items: center; justify-content: center; background: rgba(122,92,18,0.07); margin-bottom: 20px; }
.lp-benefit h3 { font-size: 19px; font-weight: 600; }
.lp-benefit p { margin-top: 8px; font-size: 15px; line-height: 1.6; color: ${DARK_TXT2}; }

/* Final CTA + footer */
.lp-final { padding: 112px 0; text-align: center; background: radial-gradient(900px 400px at 50% 120%, rgba(199,168,108,0.10), transparent 70%), ${INK}; }
.lp-final h2 { font-size: clamp(30px, 5vw, 48px); font-weight: 600; letter-spacing: -0.02em; margin-bottom: 32px; }
.lp-final-links { margin-top: 28px; font-size: 14px; color: ${TXT3}; }
.lp-final-links a { color: ${TXT2}; display: inline-block; padding: 12px 4px; }
.lp-footer { background: ${INK}; border-top: 1px solid rgba(255,255,255,0.06); }
.lp-footer-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; min-height: 88px; font-size: 13px; color: ${TXT3}; }

/* Focus */
.lp a:focus-visible, .lp button:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 3px; }
.lp-light a:focus-visible { outline-color: ${GOLD_DEEP}; }

/* Tablet */
@media (max-width: 1024px) {
  .lp-split, .lp-split-rev { grid-template-columns: minmax(0, 1fr); gap: 48px; }
  .lp-split-rev .lp-phone-wrap { order: 2; }
  .lp-light { padding: 80px 0; }
}
/* Phones */
@media (max-width: 720px) {
  .lp-wrap { padding: 0 20px; }
  .lp-header-row { min-height: 60px; }
  .lp-hero { padding: 40px 0 48px; }
  .lp-hero-copy { text-align: left; }
  .lp-hero p { margin: 16px 0 24px; }
  .lp-hero .lp-cta { justify-content: flex-start; }
  .lp-cta .lp-btn { flex: 1 1 100%; }
  .lp .lp-hero-visual { margin-top: 36px; }
  .lp-window-body { grid-template-columns: minmax(0, 1fr); }
  .lp-side { display: none; }
  .lp-main { padding: 18px; }
  .lp-row { flex-wrap: wrap; gap: 8px 12px; padding: 14px; }
  .lp-row-text { flex-basis: calc(100% - 90px); }
  .lp-row .lp-act { display: none; }
  .lp-row.urgent .lp-act { display: inline-flex; }
  .lp-stats { grid-template-columns: minmax(0, 1fr); }
  .lp-light { padding: 64px 0; }
  .lp-final { padding: 80px 0; }
}
@media (prefers-reduced-motion: reduce) { .lp * { transition: none !important; } }
`;
