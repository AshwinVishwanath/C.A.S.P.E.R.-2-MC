// Casper Mission Control — Design Taster Tokens (v1)
//
// Single source of truth for the LAB tab. Promoted to the global theme
// after the visual language is approved. Both modes target sunlight-readable
// body text (WCAG AA, contrast >=4.5:1 on default surface).

export const FONT = {
  display: "'Nevera', sans-serif",
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  cond: "'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif",
  mono: "'IBM Plex Mono', 'Menlo', monospace",
};

// 7-step type scale (px). Tight at small sizes, generous at display.
export const TYPE = {
  micro: 9,    // metadata, dense labels
  cap: 10,     // condensed caps labels
  body: 12,    // default UI body
  data: 14,    // mono data readouts
  title: 17,   // section titles
  hero: 28,    // hero sub
  display: 56, // hero brand
};

// Spacing scale in px (4/8 rhythm).
export const SPACE = {
  s0: 0, s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 28, s7: 40, s8: 56, s9: 80,
};

export const RADIUS = { sm: 3, md: 5, lg: 10, pill: 999 };

// --- DARK ("Obsidian") ----------------------------------------------------
// Deep OLED black, mint -> cyan chromatic accent, very subtle glow.
const DARK = {
  name: "dark",
  bg:        "#04060a",
  bgEl:      "#0a0f17",
  bgPanel:   "#0c1118",
  bgHi:      "#131a24",
  border:    "#1d2735",
  borderHi:  "#2a394d",
  text:      "#e7edf6",
  strong:    "#f5f8fc",
  muted:     "#8a96a8",
  faint:     "#5f6b7c",

  // Accent: mint-to-cyan chromatic. Single hue at full saturation; pair uses cyan.
  accent:    "#5eead4",
  accent2:   "#67e8f9",
  accentBg:  "rgba(94,234,212,0.10)",
  accentRing:"rgba(94,234,212,0.45)",

  warn:      "#fbbf24",
  warnBg:    "rgba(251,191,36,0.12)",
  danger:    "#f87171",
  dangerBg:  "rgba(248,113,113,0.14)",
  info:      "#93c5fd",

  // Effects.
  shadow:    "0 1px 2px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.5)",
  shadowSoft:"0 1px 1px rgba(0,0,0,0.5)",
  glow:      (c) => "0 0 10px " + c + "55",
  glowSoft:  (c) => "0 0 6px " + c + "33",
  glassBlur: "blur(14px) saturate(120%)",
  gridLine:  "#172132",

  armedText: "#04060a",
  firingBg:  "#fbbf24",
  firingText:"#04060a",

  // Shader palette (HSL stops, fed to LiquidMetalCanvas).
  shader: {
    a: [0.012, 0.020, 0.040], // deep blue-black
    b: [0.060, 0.080, 0.110], // graphite
    c: [0.180, 0.580, 0.620], // mint highlight
    d: [0.220, 0.700, 0.700], // cyan highlight
    grain: 0.018,
  },
};

// --- LIGHT ("Brushed Pearl", sunlight-readable) ---------------------------
// Cool warm-grey paper, deep teal accent that holds saturation under glare.
// No glow, sharper borders, higher minimum contrast.
const LIGHT = {
  name: "light",
  bg:        "#f3f5f8",
  bgEl:      "#ffffff",
  bgPanel:   "#ffffff",
  bgHi:      "#eaeef3",
  border:    "#cdd5e0",
  borderHi:  "#a9b4c2",
  text:      "#0f172a",      // 16.1:1 on bg
  strong:    "#020617",      // 19.0:1 on bg
  muted:     "#475569",      // 7.1:1 on bg (AA-large pass at small body too)
  faint:     "#64748b",

  accent:    "#0d9488",      // deep teal — keeps saturation under glare
  accent2:   "#0e7490",
  accentBg:  "rgba(13,148,136,0.10)",
  accentRing:"rgba(13,148,136,0.55)",

  warn:      "#b45309",
  warnBg:    "rgba(180,83,9,0.10)",
  danger:    "#b91c1c",
  dangerBg:  "rgba(185,28,28,0.10)",
  info:      "#1d4ed8",

  shadow:    "0 1px 2px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.10)",
  shadowSoft:"0 1px 1px rgba(15,23,42,0.06)",
  glow:      () => "none",
  glowSoft:  () => "none",
  glassBlur: "blur(8px) saturate(110%)",
  gridLine:  "#d8dee7",

  armedText: "#ffffff",
  firingBg:  "#b45309",
  firingText:"#ffffff",

  shader: {
    a: [0.94, 0.95, 0.97],   // pearl
    b: [0.85, 0.88, 0.92],   // brushed grey
    c: [0.05, 0.40, 0.45],   // teal
    d: [0.10, 0.50, 0.55],   // muted cyan
    grain: 0.010,
  },
};

export const TOKENS = { dark: DARK, light: LIGHT };

// Tunable tracking-and-letterspacing for the editorial display face.
export const TRACK = {
  display: 6,    // px — NEVERA hero
  title: 0.6,
  cap: 1.8,
  data: 0,
};
