import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import aboutRowhouses from "./assets/about-rowhouses.webp";
import demoResidentRepair from "./assets/demo-resident-repair.webp";

// Marketing page. Product visuals are CSS mockups of the real Modus screens with illustrative sample data (no
// screenshots of real tenants, no invented customers or metrics). About and FAQ describe online payments only
// where enabled. The homepage makes no availability claim (tests/landing-claims.test.mjs).
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
  building: "M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 11h.01M16 11h.01",
};

// ── Product mockups (decorative; the real screens are behind sign-in) ─────────────────────────────────────
function Tag({ kind }) {
  const s = kind === "Urgent" ? { c: "#F2A3A3", b: "rgba(240,112,112,0.14)" }
    : kind === "Decision" ? { c: GOLD, b: "rgba(199,168,108,0.14)" } : { c: "#9DC6F2", b: "rgba(106,174,240,0.14)" };
  return <span className="lp-tag" style={{ color: s.c, background: s.b }}>{kind}</span>;
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
          <h1 id="maintenance-tour-title">Try a sample repair</h1>
          <p>Report a leak, approve a quote, and see the repair date using sample data.</p>
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
            <div className="lp-cta">
              {step === TOUR_STEPS.length - 1 && <a href="/contact?intent=demo" className="lp-btn lp-btn-gold">Request a demo</a>}
              <button type="button" className={"lp-btn " + (step === TOUR_STEPS.length - 1 ? "lp-btn-quiet" : "lp-btn-gold")} onClick={() => setStep((step + 1) % TOUR_STEPS.length)}>{current.action}</button>
            </div>
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

const PUBLIC_PAGES = [
  { key: "about", label: "About Us" },
  { key: "faq", label: "FAQ" },
  { key: "contact", label: "Contact Us" },
];

function PublicLinks({ page }) {
  return PUBLIC_PAGES.map(({ key, label }) => (
    <a key={key} href={"/" + key} aria-current={page === key ? "page" : undefined}>{label}</a>
  ));
}

function AboutModus() {
  return (
    <div className="lp-about">
      <section className="lp-about-hero" aria-labelledby="about-title">
        <div className="lp-wrap lp-about-hero-grid">
          <div className="lp-about-headline">
            <p className="lp-about-label">About Us</p>
            <h1 id="about-title">We’ve been on both sides of the lease.</h1>
            <p>Modus started with a frustration our founder knew as both a renter and a property investor. It was hard to find out what was happening and who needed to act.</p>
          </div>
          <figure className="lp-about-photo">
            <img src={aboutRowhouses} width={1400} height={928} fetchPriority="high" alt="Brick rowhouses with front steps and flower pots along a tree-lined sidewalk"/>
            <figcaption>Photo by <a href="https://unsplash.com/photos/a-row-of-brick-buildings-with-flowers-on-the-steps-Ii4Yedkl3z4">Krishna Dubagunta</a></figcaption>
          </figure>
        </div>
      </section>

      <section className="lp-about-story" aria-label="Why we built Modus">
        <div className="lp-wrap">
          <div className="lp-about-perspectives">
            <div>
              <h2>As a renter</h2>
              <p>Our founder would report a problem and then hear nothing back. There was no update, no timeline, and no one to follow up with.</p>
            </div>
            <div>
              <h2>As an investor</h2>
              <p>He ran into the same problem from the other side. He couldn’t easily tell what was happening at his properties, what it was costing, or which decisions were waiting on him.</p>
            </div>
          </div>
          <p className="lp-about-bridge">The tools were built around paperwork. He built Modus so residents could see where a request stands and managers could see what it would cost and what needed their call.</p>
        </div>
      </section>

      <section className="lp-about-example" aria-labelledby="about-example-title">
        <div className="lp-wrap lp-about-example-inner">
          <h2 id="about-example-title">What happens when a faucet leaks?</h2>
          <p>A resident reports the leak in their portal. The manager sees the request, reviews the contractor’s quote, and approves the repair. When management adds the appointment, the resident can see when the contractor is coming.</p>
          <a className="lp-btn lp-btn-gold" href="/walkthrough">Try the maintenance walkthrough</a>
        </div>
      </section>
    </div>
  );
}

function ModusFaq() {
  return (
      <section className="lp-light lp-white lp-faq" aria-labelledby="faq-title">
        <div className="lp-wrap lp-about-copy">
          <h1 id="faq-title">Frequently Asked Questions</h1>
          <details>
            <summary>What is Modus?</summary>
            <p>Modus is property management software for residents, owners, and managers. Residents can report issues, message management, and pay rent where online payments are enabled. Owners and managers get the full picture behind each request so they can make decisions quickly.</p>
          </details>
          <details>
            <summary>Who is Modus for?</summary>
            <p>Independent landlords, small-portfolio investors, and property managers who want something simpler than enterprise software, and better than texts, spreadsheets, and email threads.</p>
          </details>
          <details>
            <summary>How do residents submit a maintenance request?</summary>
            <p>Through their resident portal. They describe the issue, attach photos if helpful, and can follow the recorded status from submission through scheduling and resolution.</p>
          </details>
          <details>
            <summary>What happens when a resident sends a message?</summary>
            <p>The Modus AI assistant can answer common questions and suggest basic troubleshooting, such as checking a thermostat setting. Residents can ask for a person or submit a maintenance request for management to review.</p>
          </details>
          <details>
            <summary>How does Modus handle repairs and vendor costs?</summary>
            <p>When a repair needs a quote, the owner or manager can review and approve the vendor’s estimate before work begins. Vendors can accept work orders electronically, which keeps a record of the job.</p>
          </details>
          <details>
            <summary>How do residents pay rent?</summary>
            <p>Where online payments are enabled, residents can pay rent through the portal by ACH bank transfer, processed by Stripe. Owners can see payment status in Modus. If online payments are unavailable, follow the payment instructions in your lease.</p>
          </details>
          <details>
            <summary>Is there a mobile app?</summary>
            <p>Modus works on phones through the browser. Residents can add it to their home screen on supported devices and open it like an app without downloading it from an app store.</p>
          </details>
          <details>
            <summary>How do new residents get set up?</summary>
            <p>The owner or manager sends an invitation. The resident opens it to create an account and complete setup for their unit. Already set up? <a href="/login">Sign in to the resident portal</a>.</p>
          </details>
          <details>
            <summary>Is my information secure?</summary>
            <p>Stripe processes bank transfers, and Modus does not store full bank account numbers. Access controls restrict residents to their own rental records and managers to the properties they’re authorized to manage.</p>
          </details>
          <details>
            <summary>How much does Modus cost?</summary>
            <p><a href="/contact?intent=pricing">Contact us for pricing</a> and tell us what you manage.</p>
          </details>
          <details>
            <summary>How do I get started?</summary>
            <p><a href="/contact?intent=demo">Request a demo</a> or <a href="/walkthrough">try the interactive maintenance walkthrough</a>. If you’re a resident, ask your property manager for an invitation.</p>
          </details>
        </div>
      </section>
  );
}

function ContactModus() {
  const [params] = useSearchParams();
  const intent = params.get("intent");
  const isDemo = intent === "demo";
  const isPricing = intent === "pricing";
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const inFlight = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    inFlight.current = true;
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await response.json();
      if (!response.ok || !["sent", "preview"].includes(data.status)) {
        setResult({ error: data.error || "We couldn’t confirm delivery. Please try again." });
        return;
      }
      setResult({ message: data.status === "preview" ? "Preview submission complete. No email was sent." : "Thanks for contacting Modus. We received your message." });
      form.reset();
    } catch {
      setResult({ error: "We couldn’t confirm delivery. Please try again." });
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <section className="lp-light lp-ivory">
      <div className="lp-wrap lp-about-copy lp-contact">
        <h1>{isDemo ? "Request a demo" : isPricing ? "Ask about pricing" : "Contact Us"}</h1>
        {isDemo ? <p>Tell us how to reach you. We’ll follow up by email to arrange a walkthrough and discuss your rentals.</p>
          : isPricing ? <p>Tell us what you manage and what you’d like to know about pricing. We’ll follow up by email.</p>
          : <p>Have a question about Modus? Send us a message. For help with your rental or a maintenance request, contact your property manager in the <a href="/login">resident portal</a>.</p>}
        <form onSubmit={submit}>
          {(isDemo || isPricing) && <input type="hidden" name="intent" value={intent}/>}
          <label htmlFor="contact-name">Name</label>
          <input id="contact-name" name="name" autoComplete="name" maxLength={100} required/>
          <label htmlFor="contact-email">Email address</label>
          <input id="contact-email" name="email" type="email" autoComplete="email" maxLength={254} required/>
          {(isDemo || isPricing) && <>
            <label htmlFor="contact-units">Rental units (optional)</label>
            <input id="contact-units" name="units" type="number" min={1} max={100000} step={1}/>
          </>}
          <label htmlFor="contact-message">{isDemo ? "What would you like to see? (optional)" : "Message"}</label>
          <textarea id="contact-message" name="message" rows={isDemo ? 4 : 6} maxLength={3000} required={!isDemo}/>
          <div hidden><label htmlFor="contact-website">Leave this field empty</label><input id="contact-website" name="website" tabIndex={-1} autoComplete="off"/></div>
          <button type="submit" className="lp-btn lp-btn-gold" disabled={sending}>{sending ? "Sending…" : isDemo ? "Send demo request" : "Send message"}</button>
          <div role="status">{result?.message}</div>
          {result?.error && <p role="alert" className="lp-contact-error">{result.error}</p>}
        </form>
      </div>
    </section>
  );
}

export default function LandingPage({ page = "home" }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const title = document.title;
    const publicPage = PUBLIC_PAGES.find(item => item.key === page);
    if (publicPage) document.title = publicPage.label + " | Modus";
    if (page === "walkthrough") document.title = "Repair Walkthrough | Modus";
    if (page === "home" && window.location.hash === "#maintenance-tour") {
      window.location.replace("/walkthrough");
    }
    if (page === "about" && window.location.hash === "#faq") window.location.replace("/faq");
    return () => { document.title = title; };
  }, [page]);

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
          <nav className="lp-nav-desktop" aria-label="Main navigation">
            <PublicLinks page={page}/>
            <a href="/login" onClick={go("/login")}>Resident sign-in</a>
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
            <a href="/login" onClick={go("/login")}>Resident sign-in</a>
            <PublicLinks page={page}/>
          </div>
        )}
      </header>

      <main>
        {page === "about" && <AboutModus/>}
        {page === "faq" && <ModusFaq/>}
        {page === "contact" && <ContactModus/>}
        {page === "walkthrough" && <MaintenanceTour/>}
        {page === "home" && (
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <h1>See every repair through.</h1>
              <p>Track rental repairs from the first report to the contractor’s visit.</p>
              <div className="lp-cta">
                <a href="/contact?intent=demo" className="lp-btn lp-btn-gold">Request a demo</a>
                <a href="/walkthrough" className="lp-btn lp-btn-quiet">Try a sample repair</a>
              </div>
              <a className="lp-resident-entry" href="/login" onClick={go("/login")}>Resident sign-in</a>
            </div>
            <figure className="lp-hero-visual">
              <div className="lp-hero-exhibit">
                <img src={demoResidentRepair} width={596} height={239} alt="Resident home activity shows a contractor confirmation message and the kitchen faucet repair marked In progress"/>
              </div>
              <figcaption>Modus resident home, shown with sample data.</figcaption>
            </figure>
          </div>
        </section>
        )}
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <Wordmark/>
          <nav aria-label="Footer"><PublicLinks page={page}/></nav>
          <span>© {new Date().getFullYear()} Modus Property Management</span>
        </div>
      </footer>
    </div>
  );
}

const CSS = `
.lp { font-family: var(--m-font); color: ${TXT}; background: ${INK}; min-height: 100vh; min-height: 100dvh; }
.lp a { color: inherit; }
.lp-wrap { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.lp h1, .lp h2, .lp h3 { font-family: var(--m-font); margin: 0; }
.lp-about-copy { max-width: 800px; }
.lp-about-copy h1 { font-size: clamp(38px, 7vw, 68px); letter-spacing: -0.05em; line-height: 1.05; }
.lp-about-copy p { color: #52525B; font-size: 17px; line-height: 1.65; }
.lp-about-copy .lp-btn { margin-top: 10px; }
.lp-about { color: #24211C; background: #FFFFFF; }
.lp-about-hero { padding: 72px 0 56px; background: #F5F3EE; }
.lp-about-hero-grid { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.15fr); gap: clamp(28px, 5.5vw, 88px); align-items: center; }
.lp-about-label { margin: 0 0 18px; color: #7A5C12; font-size: 14px; font-weight: 600; }
.lp .lp-about-headline h1, .lp .lp-about h2 { font-family: var(--m-font-brand); font-weight: 600; letter-spacing: -.035em; }
.lp .lp-about-headline h1 { max-width: 11ch; font-size: clamp(47px, 6.1vw, 88px); line-height: .97; }
.lp-about-headline > p:last-child { max-width: 40ch; margin: 24px 0 0; font-size: 17px; line-height: 1.62; color: #514A40; }
.lp-about-photo { margin: 0; }
.lp-about-photo img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; object-position: 46% center; }
.lp .lp-about-photo figcaption { margin-top: 8px; color: #5E584D; font-size: 12px; text-align: right; }
.lp-about-story { padding: 66px 0; }
.lp-about-story .lp-wrap, .lp-about-example-inner { max-width: 960px; }
.lp-about-perspectives { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(24px, 7vw, 96px); }
.lp-about-perspectives > div { border-top: 1px solid #B5A886; padding-top: 20px; }
.lp .lp-about h2 { font-size: clamp(33px, 4vw, 51px); line-height: 1.05; }
.lp-about-perspectives p, .lp-about-example p { margin: 12px 0 0; color: #514A40; font-size: 17px; line-height: 1.65; }
.lp-about-bridge { max-width: 62ch; margin: 34px 0 0; font-size: 17px; line-height: 1.65; }
.lp-about-example { padding: 55px 0 66px; background: #F5F3EE; }
.lp-about-example p { max-width: 62ch; margin-bottom: 22px; }
@media (max-width: 720px) {
  .lp-about-hero { padding: 38px 0 26px; }
  .lp-about-hero-grid, .lp-about-perspectives { grid-template-columns: 1fr; }
  .lp .lp-about-headline h1 { font-size: clamp(46px, 10vw, 64px); }
  .lp-about-headline > p:last-child { margin-top: 18px; }
  .lp-about-photo img { aspect-ratio: 3 / 2; }
  .lp-about-story, .lp-about-example { padding: 44px 0; }
}
.lp-faq { scroll-margin-top: 75px; }
.lp-faq h1 { margin-bottom: 18px; }
.lp-faq details { border-bottom: 1px solid #E7E2D8; }
.lp-faq summary { padding: 16px 2px; min-height: 48px; font-size: 17px; font-weight: 600; cursor: pointer; }
.lp-faq details p { margin: 0 0 18px; }
.lp-contact form { display: grid; gap: 10px; max-width: 620px; padding: clamp(16px, 4vw, 30px); background: white; border: 1px solid #E7E2D8; border-radius: 16px; }
.lp-contact label { font-weight: 600; }
.lp-contact input, .lp-contact textarea { width: 100%; min-height: 44px; margin-bottom: 8px; padding: 10px 12px; border: 1px solid #8C857A; border-radius: 8px; font: inherit; }
.lp-contact textarea { resize: vertical; }
.lp-contact input:focus-visible, .lp-contact textarea:focus-visible { outline: 2px solid #7A5C12; outline-offset: 2px; }
.lp-contact button { justify-self: start; border: 0; font-family: inherit; cursor: pointer; }
.lp-contact button:disabled { opacity: .7; cursor: wait; }
.lp-contact .lp-contact-error { margin: 0; color: #9F2424; }
.lp-footer-row nav { display: flex; gap: 18px; }
.lp-footer-row nav a { display: inline-flex; align-items: center; min-height: 44px; }

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
.lp-tour-heading h1 { font-size:clamp(32px,5vw,48px); line-height:1.1; }
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
.lp-hero { padding: 74px 0; background: radial-gradient(1200px 500px at 50% -10%, rgba(199,168,108,0.08), transparent 70%), ${INK}; }

.lp-hero-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:center; gap:clamp(28px,5vw,72px); }
.lp-hero h1 { font-size: clamp(34px, 6vw, 60px); line-height: 1.07; font-weight: 600; letter-spacing: -0.02em; }
.lp-hero p { margin: 18px 0 26px; max-width: 42ch; font-size: clamp(16px, 2vw, 19px); line-height: 1.6; color: ${TXT2}; }


.lp figure { margin: 0; }
.lp figcaption { margin-top: 14px; font-size: 13px; color: ${TXT3}; text-align: center; }

/* Product window mockups */
.lp-window { background: ${INK2}; border: 1px solid ${LINE}; border-radius: 16px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.45); text-align: left; color: ${TXT}; }
.lp-window-bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid ${LINE}; font-size: 13px; color: ${TXT2}; }
.lp-window-bar i { width: 10px; height: 10px; border-radius: 50%; background: #2C323C; }
.lp-window-bar span:first-of-type { margin-left: 10px; font-weight: 600; color: ${TXT}; }
.lp-scope { margin-left: auto; padding: 6px 12px; border: 1px solid ${LINE}; border-radius: 8px; font-size: 12px; }
.lp-main { padding: 28px; min-width: 0; }
.lp-tag { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.lp-act { font-size: 12px; font-weight: 600; padding: 8px 12px; border-radius: 8px; border: 1px solid ${LINE}; color: ${GOLD}; white-space: nowrap; }
.lp-act.primary { background: ${GOLD}; color: ${INK}; border-color: ${GOLD}; }

/* Light sections */
.lp-light { color: ${DARK_TXT}; padding: 104px 0; }
.lp-ivory { background: ${IVORY}; }
.lp-white { background: #FBFAF7; }
.lp-light figcaption { color: #6B6B73; }
.lp-light h2 { font-size: clamp(28px, 4vw, 42px); line-height: 1.15; font-weight: 600; letter-spacing: -0.015em; }
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

.lp-resident-entry { display:inline-flex; align-items:center; min-height:44px; margin-top:10px; text-underline-offset:4px; }
.lp .lp-hero-visual { margin:0; min-width:0; }
.lp-hero-exhibit { background:#1E232C; border:1px solid #363C45; border-radius:16px; padding:clamp(10px,2vw,20px); }
.lp-hero-exhibit img { display:block; width:100%; height:auto; border-radius:8px; }
@media (max-width: 820px) { .lp-hero-grid { grid-template-columns:1fr; } }

/* Final CTA + footer */
.lp-footer { background: ${INK}; border-top: 1px solid rgba(255,255,255,0.06); }
.lp-footer-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; min-height: 88px; font-size: 13px; color: ${TXT3}; }

/* Focus */
.lp a:focus-visible, .lp button:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 3px; }
.lp-light a:focus-visible { outline-color: ${GOLD_DEEP}; }

/* Tablet */
@media (max-width: 1024px) {
  .lp-light { padding: 80px 0; }
}
/* Phones */
@media (max-width: 720px) {
  .lp-wrap { padding: 0 20px; }
  .lp-header-row { min-height: 60px; }
  .lp-hero { padding: 36px 0 32px; }
  .lp-hero-copy { text-align: left; }
  .lp-hero p { margin: 16px 0 24px; }
  .lp-hero .lp-cta { justify-content: flex-start; }
  .lp-cta .lp-btn { flex: 1 1 100%; }
  .lp .lp-hero-visual { margin-top: 0; }
  .lp-main { padding: 18px; }
  .lp-light { padding: 64px 0; }
}
@media (prefers-reduced-motion: reduce) { .lp * { transition: none !important; } }
`;
