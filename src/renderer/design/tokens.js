// CASPER 2 Mission Control v2 — Design Tokens (ES module port)
// Three schemes x two modes x four accents.

export const ACCENT_HUES = {
  mint:   { dark: "oklch(78% 0.13 175)",  light: "oklch(56% 0.13 175)",  glow: "oklch(78% 0.16 175)" },
  orange: { dark: "oklch(72% 0.17 45)",   light: "oklch(63% 0.18 40)",   glow: "oklch(72% 0.19 45)" },
  amber:  { dark: "oklch(80% 0.14 80)",   light: "oklch(64% 0.13 75)",   glow: "oklch(80% 0.16 80)" },
  red:    { dark: "oklch(70% 0.18 25)",   light: "oklch(58% 0.20 25)",   glow: "oklch(70% 0.20 25)" },
};

// Type scale
export const TYPE = {
  display:  72,
  h1:       28,
  h2:       22,
  h3:       18,
  body:     15,
  bodyLg:   17,
  data:     20,
  dataLg:   28,
  dataXL:   42,
  dataHero: 64,
  cap:      11,
  micro:    11,
};

export const SPACE = {
  s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32, s8: 40, s9: 56, s10: 72,
};

export const RADIUS = { none: 0, xs: 2, sm: 4, md: 6, lg: 10, xl: 16, pill: 999 };

export const FONT = {
  display: '"Big Shoulders Display", "Bebas Neue", "Impact", sans-serif',
  sans:    '"IBM Plex Sans", "Inter", system-ui, sans-serif',
  cond:    '"IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif',
  mono:    '"IBM Plex Mono", "JetBrains Mono", monospace',
};

export const TRACK = {
  display: "0.04em",
  cap:     "0.18em",
  caps:    "0.16em",
  hero:    "-0.01em",
};

// Scheme-specific tweaks applied on top of the theme
export const SCHEME_PROPS = {
  obsidian: {
    panelStyle: "glass",
    showShader: true,
    showGlow: true,
    panelRadius: RADIUS.lg,
    sectionGap: SPACE.s5,
    panelPad: SPACE.s5,
  },
  terminal: {
    panelStyle: "hairline",
    showShader: false,
    showGlow: false,
    panelRadius: RADIUS.xs,
    sectionGap: SPACE.s4,
    panelPad: SPACE.s4,
  },
  instrument: {
    panelStyle: "blueprint",
    showShader: false,
    showGlow: true,
    panelRadius: RADIUS.md,
    sectionGap: SPACE.s5,
    panelPad: SPACE.s5,
  },
  fusion: {
    panelStyle: "glass",
    showShader: true,
    showGlow: true,
    panelRadius: RADIUS.md,
    sectionGap: SPACE.s5,
    panelPad: SPACE.s5,
    glassyType: true,
    blueprintGrid: true,
  },
};

/**
 * Resolve accent — "auto" maps to mint (dark) or orange (light).
 */
export function resolveAccent(mode, accentName) {
  if (accentName === "auto") return mode === "dark" ? ACCENT_HUES.mint : ACCENT_HUES.orange;
  return ACCENT_HUES[accentName] || ACCENT_HUES.mint;
}

/**
 * Build a complete theme object.
 * @param {"dark"|"light"} mode
 * @param {string} accentName — "auto" | "mint" | "orange" | "amber" | "red"
 * @param {string} scheme — "fusion" | "obsidian" | "terminal" | "instrument"
 */
export function buildTheme(mode, accentName, scheme) {
  const accent = resolveAccent(mode, accentName);
  const isDark = mode === "dark";

  const dark = {
    // "name" mirrors mode for backward compat (T.name === "light" checks in App.jsx)
    name: "dark",
    mode: "dark",
    bg:           "oklch(13% 0.012 240)",
    bgEl:         "oklch(16% 0.012 240)",
    bgPanel:      "oklch(17.5% 0.014 240)",
    bgHi:         "oklch(20% 0.014 240)",
    bgInverse:    "oklch(96% 0.008 75)",
    border:       "oklch(28% 0.012 240)",
    borderStrong: "oklch(38% 0.014 240)",
    gridLine:     "oklch(24% 0.010 240)",
    text:         "oklch(78% 0.012 240)",
    strong:       "oklch(96% 0.008 240)",
    muted:        "oklch(58% 0.012 240)",
    faint:        "oklch(38% 0.012 240)",
    accent:       accent.dark,
    accentBg:     `color-mix(in oklch, ${accent.dark} 14%, transparent)`,
    accentRing:   `color-mix(in oklch, ${accent.dark} 36%, transparent)`,
    accentText:   "oklch(10% 0.012 240)",
    danger:       "oklch(67% 0.21 25)",
    dangerBg:     "color-mix(in oklch, oklch(67% 0.21 25) 14%, transparent)",
    warn:         "oklch(78% 0.16 75)",
    warnBg:       "color-mix(in oklch, oklch(78% 0.16 75) 14%, transparent)",
    info:         "oklch(72% 0.13 230)",
    success:      accent.dark,
    glow:         (c) => `0 0 20px ${c}, 0 0 40px color-mix(in oklch, ${c} 35%, transparent)`,
    glowSoft:     (c) => `0 0 12px color-mix(in oklch, ${c} 50%, transparent)`,
    shadow:       "0 12px 36px oklch(0% 0 0 / 0.5)",
    shadowSoft:   "0 2px 8px oklch(0% 0 0 / 0.3)",
    glassBlur:    "blur(18px) saturate(140%)",
    glassBg:      "oklch(15% 0.012 240 / 0.55)",
    shader:       ["oklch(8% 0.014 240)", accent.dark, "oklch(70% 0.10 230)"],
  };

  const light = {
    name: "light",
    mode: "light",
    bg:           "oklch(96.5% 0.010 80)",
    bgEl:         "oklch(98% 0.008 75)",
    bgPanel:      "oklch(99% 0.006 75)",
    bgHi:         "oklch(94.5% 0.012 75)",
    bgInverse:    "oklch(20% 0.014 240)",
    border:       "oklch(78% 0.012 75)",
    borderStrong: "oklch(64% 0.014 75)",
    gridLine:     "oklch(88% 0.010 75)",
    text:         "oklch(36% 0.012 75)",
    strong:       "oklch(18% 0.014 75)",
    muted:        "oklch(46% 0.014 75)",
    faint:        "oklch(62% 0.012 75)",
    accent:       accent.light,
    accentBg:     `color-mix(in oklch, ${accent.light} 12%, transparent)`,
    accentRing:   `color-mix(in oklch, ${accent.light} 32%, transparent)`,
    accentText:   "oklch(99% 0.005 75)",
    danger:       "oklch(54% 0.22 25)",
    dangerBg:     "color-mix(in oklch, oklch(54% 0.22 25) 10%, transparent)",
    warn:         "oklch(56% 0.16 60)",
    warnBg:       "color-mix(in oklch, oklch(56% 0.16 60) 12%, transparent)",
    info:         "oklch(48% 0.16 230)",
    success:      accent.light,
    glow:         (c) => `0 0 16px color-mix(in oklch, ${c} 30%, transparent)`,
    glowSoft:     (c) => `0 0 8px color-mix(in oklch, ${c} 22%, transparent)`,
    shadow:       "0 8px 28px oklch(40% 0.02 75 / 0.10)",
    shadowSoft:   "0 1px 3px oklch(40% 0.02 75 / 0.08)",
    glassBlur:    "blur(14px) saturate(120%)",
    glassBg:      "oklch(99% 0.006 75)",
    shader:       ["oklch(94% 0.012 75)", "oklch(88% 0.015 230)", "oklch(82% 0.025 200)"],
  };

  const T = isDark ? dark : light;
  T.scheme = scheme || "fusion";
  T.accentName = accentName;
  T.schemeProps = SCHEME_PROPS[T.scheme] || SCHEME_PROPS.fusion;
  return T;
}
