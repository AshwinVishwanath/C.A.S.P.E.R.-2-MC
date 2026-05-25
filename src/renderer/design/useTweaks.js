import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'casper_tweaks_v1';

const DEFAULTS = {
  scheme: 'fusion',
  mode:   'dark',
  accent: 'auto',
  motion: true,
  shader: true,
};

/**
 * useTweaks — persists visual-system preferences to localStorage.
 *
 * Returns { tweaks, setTweak } where setTweak(key, value) updates a single key.
 */
export function useTweaks() {
  const [tweaks, setTweaks] = useState(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
    } catch {
      // Storage may be unavailable (private browsing, quota exceeded, etc.)
    }
  }, [tweaks]);

  const setTweak = useCallback((key, value) => {
    setTweaks((t) => ({ ...t, [key]: value }));
  }, []);

  return { tweaks, setTweak };
}
