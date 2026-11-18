// Agent Center design tokens (same palette as the rest of the landlord portal's dark screens).
export const C = {
  bg:       "#0B0D10",
  surface:  "#15191F",
  raised:   "#1C2129",
  border:   "#303640",
  text:     "#F5F2EB",
  textSub:  "#B7BBC4",
  textMuted:"#9298A3",
  gold:     "#C9A968",
  goldDim:  "#6B4F24",
  blue:     "#6AAEF0",
  green:    "#72B02A",
  red:      "#F07070",
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
