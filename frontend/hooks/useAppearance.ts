'use client';

import { useCallback, useEffect, useState } from 'react';

export type RadiusPref = 'soft' | 'rounded' | 'sharp';
export type MotionPref = 'slow' | 'normal' | 'fast' | 'none';
export type DensityPref = 'comfortable' | 'compact';
export type GlassPref = 'subtle' | 'medium' | 'strong';
export type WallpaperPref = 'default' | 'aurora' | 'mist' | 'none';

export interface AppearancePrefs {
  radius: RadiusPref;
  motion: MotionPref;
  density: DensityPref;
  glass: GlassPref;
  wallpaper: WallpaperPref;
}

const STORAGE_KEY = 'vani-appearance';

const DEFAULTS: AppearancePrefs = {
  radius: 'rounded',
  motion: 'normal',
  density: 'comfortable',
  glass: 'medium',
  wallpaper: 'default',
};

function applyAppearance(prefs: AppearancePrefs) {
  const root = document.documentElement;
  root.dataset.radius = prefs.radius;
  root.dataset.motion = prefs.motion;
  root.dataset.density = prefs.density;
  root.dataset.glass = prefs.glass;
  root.dataset.wallpaper = prefs.wallpaper;
}

function readStored(): AppearancePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function useAppearance() {
  const [prefs, setPrefsState] = useState<AppearancePrefs>(DEFAULTS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only
    setMounted(true);
    const stored = readStored();
    setPrefsState(stored);
    applyAppearance(stored);
  }, []);

  const setPrefs = useCallback((patch: Partial<AppearancePrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      applyAppearance(next);
      return next;
    });
  }, []);

  return { prefs, setPrefs, mounted };
}
