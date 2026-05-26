import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { buildTheme } from './tokens.js';
import './animations.css';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const ThemeCtx = createContext(null);

/**
 * ThemeProvider — wraps children in the design theme.
 *
 * @param {{ tweaks: { mode: string, accent: string, scheme: string, motion: boolean, shader: boolean }, children: React.ReactNode }} props
 */
export function ThemeProvider({ tweaks, children }) {
  const theme = useMemo(
    () => buildTheme(tweaks.mode, tweaks.accent, tweaks.scheme),
    [tweaks.mode, tweaks.accent, tweaks.scheme],
  );

  // Sync body background and text to active theme
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.background = theme.bg;
    document.body.style.color = theme.text;
    document.body.style.margin = '0';
    document.body.classList.toggle('cmc-light', theme.name === 'light');
    document.body.classList.toggle('cmc-dark',  theme.name !== 'light');
  }, [theme.bg, theme.text, theme.name]);

  return (
    <ThemeCtx.Provider value={{ theme, tweaks }}>
      {children}
    </ThemeCtx.Provider>
  );
}

/**
 * useTheme — returns the current theme object.
 * Must be used inside a ThemeProvider.
 */
export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx.theme;
}

/**
 * useTweaksValue — returns the raw tweaks object (mode, accent, scheme, motion, shader).
 */
export function useTweaksValue() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTweaksValue must be used inside <ThemeProvider>');
  return ctx.tweaks;
}
