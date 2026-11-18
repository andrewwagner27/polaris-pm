// Modus design tokens: one source for colour, spacing, radii, type and touch targets.
// Every text colour below is checked against every surface it is used on by tests/design-tokens.test.mjs
// (WCAG 2.1 AA: 4.5:1 for normal text). Add a pairing there when you add a token.

// Management (dark) surfaces.
export const DARK = {
  bg:        "#0B0D10",   // page
  surface:   "#15191F",   // elevated card
  raised:    "#1C2129",   // inputs, nested panels, hover
  border:    "#262B33",   // soft dividers between groups (non-text); inputs use borderStrong
  borderStrong: "#3A414C", // form-field and control outlines
  text:      "#F5F2EB",   // primary text          17.4 / 15.8 / 14.5 : 1
  textSub:   "#B7BBC4",   // secondary text        10.1 /  9.2 /  8.4 : 1
  textMuted: "#9298A3",   // hints, captions        6.7 /  6.1 /  5.6 : 1
  gold:      "#B89450",   // brand gold (marks, filled accents)  6.2:1 on cards
  action:    "#C9A968",   // interactive gold text/links/focus   7.9:1 on cards
  onGold:    "#0B0D10",   // text on filled gold buttons          8.7:1 on #C9A968
  goldDim:   "rgba(201,169,104,0.14)",
  blue:      "#6AAEF0",
  green:     "#5DBB63",
  red:       "#F07070",
  amber:     "#E39A35",
  focus:     "#C9A968",
};

// Tenant portal (light) surfaces. #8B6914 is retired for interactive text: it is below 4.5:1 on the page colour.
export const LIGHT = {
  bg:        "#F5F3EE",
  surface:   "#FFFFFF",
  raised:    "#F8F7F4",
  border:    "#EAE6DE",   // soft dividers (non-text); inputs use borderStrong
  borderStrong: "#D6D0C4",
  text:      "#18181B",
  textSub:   "#52525B",   // 7.0:1 on the page colour
  textMuted: "#6B6B73",   // 4.8:1 on the page colour (was #A1A1AA, 2.3:1)
  gold:      "#7A5C12",   // interactive gold on light: 5.6:1 on the page colour, white text on it 6.2:1
  goldBg:    "#FBF6EC",
  blue:      "#1D4ED8",
  green:     "#166534",
  red:       "#B91C1C",
  amber:     "#92400E",
  focus:     "#7A5C12",
};

export const SPACE  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const RADIUS = { sm: 6, md: 10, card: 12, lg: 14, pill: 999 };
export const CARD_PAD = { mobile: 16, desktop: 20 };
// One app font (Inter) everywhere; the serif is kept for the Modus wordmark and marketing only. Both are CSS variables
// defined in index.css (loaded once from index.html), so a family change is one edit.
export const FONT   = { sans: "var(--m-font)", brand: "var(--m-font-brand)", serif: "var(--m-font-brand)" };

// Type scale (index.css defines the responsive values; phones get the smaller size). Weights: body 400, card titles
// 500-600, page and section titles 600. Figures use tabular numerals.
export const TYPE = {
  title:   { fontSize: "var(--m-fs-title)",   fontWeight: 600, lineHeight: 1.25 },  // 26 / 23
  section: { fontSize: "var(--m-fs-section)", fontWeight: 600, lineHeight: 1.3 },   // 19 / 17
  card:    { fontSize: 15, fontWeight: 600, lineHeight: 1.35 },
  body:    { fontSize: 14, fontWeight: 400, lineHeight: 1.55 },
  support: { fontSize: 13, fontWeight: 400, lineHeight: 1.5 },
  meta:    { fontSize: 12, fontWeight: 400, lineHeight: 1.4 },
  stat:    { fontSize: "var(--m-fs-stat)",    fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }, // 24 / 21
};

// Surfaces: separate groups with elevation and space before borders. Shadows stay minimal on dark.
export const ELEVATION = {
  dark:  { card: "none", overlay: "0 12px 32px rgba(0,0,0,0.45)" },
  light: { card: "0 1px 2px rgba(24,24,27,0.04), 0 1px 3px rgba(24,24,27,0.04)", overlay: "0 12px 32px rgba(24,24,27,0.12)" },
};
export const TOUCH  = 44;            // minimum touch target (px); 48 where space allows
export const BREAK  = { mobile: 720, tablet: 1024 };

// Filled gold button: dark text on Action Gold. Outline/ghost buttons use Action Gold text on the surface.
export const btnPrimary = (t = DARK) => ({
  minHeight: TOUCH, padding: "0 18px", borderRadius: RADIUS.md, border: "none", cursor: "pointer",
  background: t.action || t.gold, color: t.onGold || "#FFFFFF", fontFamily: FONT.sans, fontSize: 14, fontWeight: 600,
});
export const btnGhost = (t = DARK) => ({
  minHeight: TOUCH, padding: "0 16px", borderRadius: RADIUS.md, border: `1px solid ${t.border}`, cursor: "pointer",
  background: "transparent", color: t.action || t.gold, fontFamily: FONT.sans, fontSize: 14, fontWeight: 500,
});

// Relative luminance / contrast (WCAG 2.1). Used by the token tests.
export function contrast(a, b) {
  const lum = (h) => {
    const [r, g, bl] = h.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
