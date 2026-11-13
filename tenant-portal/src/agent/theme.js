// Agent Center design tokens (same palette as the rest of the landlord portal's dark screens).
export const C = {
  bg:       "#0C0E12",
  surface:  "#14181F",
  raised:   "#1A1F29",
  border:   "rgba(255,255,255,0.08)",
  text:     "#EDEAE2",
  textSub:  "#9095A0",
  textMuted:"#5C6270",
  gold:     "#C9A96E",
  goldDim:  "#6B4F24",
  blue:     "#4A9AE8",
  green:    "#72B02A",
  red:      "#E05555",
  amber:    "#F0A430",
};

export const font = "'DM Sans', sans-serif";

export const label = { fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 };

export const btn = (tone = "plain") => ({
  padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: font, minHeight: 32,
  background: tone === "gold" ? "rgba(201,169,110,0.12)" : tone === "green" ? "rgba(114,176,42,0.12)" : "transparent",
  border: `1px solid ${tone === "gold" ? C.gold : tone === "green" ? C.green : C.border}`,
  color: tone === "gold" ? C.gold : tone === "green" ? C.green : C.textSub,
});

export const input = {
  width: "100%", background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7,
  padding: "9px 12px", color: C.text, fontSize: 13, fontFamily: font, outline: "none",
};

export function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" });
}
