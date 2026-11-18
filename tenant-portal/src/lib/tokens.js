// Modus design tokens: one source for colour, spacing, radii, type and touch targets.
// Every text colour below is checked against every surface it is used on by tests/design-tokens.test.mjs
// (WCAG 2.1 AA: 4.5:1 for normal text). Add a pairing there when you add a token.

// Management (dark) surfaces.
export const DARK = {
  bg:        "#0B0D10",   // page
  surface:   "#15191F",   // elevated card
  raised:    "#1C2129",   // inputs, nested panels, hover
  border:    "#303640",   // subtle borders (non-text)
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
  border:    "#E4E1DA",
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
export const RADIUS = { sm: 6, md: 10, lg: 14, pill: 999 };
export const FONT   = { serif: "'Cormorant Garamond', serif", sans: "'DM Sans', sans-serif" };
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
