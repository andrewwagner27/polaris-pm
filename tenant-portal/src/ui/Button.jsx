import { DARK, FONT } from "../lib/tokens";

// One primary-action button for every management screen (replaces nine per-page copies).
// Filled Action Gold with dark text (8.7:1). `color` gives a filled status variant (e.g. resolve = green) — the
// text stays dark, because every status colour in DARK is light enough for dark text (≥ 6.7:1).
// Hover/focus/disabled styling lives in index.css (.m-btn); touch target ≥ 44px on phones, 36px on desktop
// for `small` toolbar buttons.
export function PrimaryBtn({ children, onClick, disabled, small, color, type = "button", ariaLabel, style }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={`m-btn m-btn-primary${small ? " m-btn-small" : ""}`}
      style={{ background: color || DARK.action, color: DARK.onGold, fontFamily: FONT.sans, ...style }}>
      {children}
    </button>
  );
}

// Secondary action: outline with Action Gold text.
export function GhostBtn({ children, onClick, disabled, small, danger, type = "button", ariaLabel, style }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={`m-btn m-btn-ghost${small ? " m-btn-small" : ""}`}
      style={{ color: danger ? DARK.red : DARK.action, borderColor: danger ? "rgba(240,112,112,0.4)" : DARK.borderStrong, fontFamily: FONT.sans, ...style }}>
      {children}
    </button>
  );
}
