// ================== context/ThemeContext.jsx ==================
// Light/Dark/System mode, accent colors, and wallpaper preferences.
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

export const ACCENTS = [
  { key: 'coral', label: 'Coral', swatch: '#e13742' },
  { key: 'indigo', label: 'Indigo', swatch: '#4f46e5' },
  { key: 'violet', label: 'Violet', swatch: '#7c3aed' },
  { key: 'sky', label: 'Sky', swatch: '#0284c7' },
  { key: 'emerald', label: 'Emerald', swatch: '#059669' },
  { key: 'rose', label: 'Rose', swatch: '#e11d48' },
  { key: 'amber', label: 'Amber', swatch: '#d97706' },
];

const MODE_KEY = 'theme-mode'; // 'light' | 'dark' | 'system'
const ACCENT_KEY = 'theme-accent';
const BG_KEY = 'theme-bg-style';
const MODES = ['light', 'dark', 'system'];

export const BG_STYLES = [
  { key: 'minimal', labelKey: 'theme.bg.minimal' },
  { key: 'blobs', labelKey: 'theme.bg.blobs' },
  { key: 'dots', labelKey: 'theme.bg.dots' },
  { key: 'mesh', labelKey: 'theme.bg.mesh' },
];

function readLocal(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage may be disabled, blocked, or unavailable in a private context.
    return null;
  }
}

function writeLocal(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preferences still work for the current session when persistence is unavailable.
  }
}

function getColorSchemeQuery() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return null;
  }
}

function getSystemPrefersDark() {
  return getColorSchemeQuery()?.matches === true;
}

function readInitialMode() {
  if (typeof window === 'undefined') return 'dark';
  const saved = readLocal(MODE_KEY);
  // Backward compatibility with the former DarkModeToggle key.
  const legacy = readLocal('theme');
  if (MODES.includes(saved)) return saved;
  if (legacy === 'light' || legacy === 'dark') return legacy;
  return 'dark';
}

function readInitialAccent() {
  const saved = readLocal(ACCENT_KEY);
  return ACCENTS.some((a) => a.key === saved) ? saved : 'coral';
}

function readInitialBgStyle() {
  const saved = readLocal(BG_KEY);
  return BG_STYLES.some((b) => b.key === saved) ? saved : 'minimal';
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readInitialMode);
  const [accent, setAccentState] = useState(readInitialAccent);
  const [bgStyle, setBgStyleState] = useState(readInitialBgStyle);
  const [systemDark, setSystemDark] = useState(getSystemPrefersDark);

  // Track OS/browser preference changes, including older Safari implementations.
  useEffect(() => {
    const query = getColorSchemeQuery();
    if (!query) return undefined;
    const handler = (event) => setSystemDark(event.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
      return () => query.removeEventListener('change', handler);
    }
    query.addListener?.(handler);
    return () => query.removeListener?.(handler);
  }, []);

  // Keep open tabs consistent when a preference changes in another tab.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === MODE_KEY && MODES.includes(event.newValue)) setModeState(event.newValue);
      if (event.key === ACCENT_KEY && ACCENTS.some((a) => a.key === event.newValue)) setAccentState(event.newValue);
      if (event.key === BG_KEY && BG_STYLES.some((b) => b.key === event.newValue)) setBgStyleState(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const resolvedDark = mode === 'system' ? systemDark : mode === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedDark);
    root.setAttribute('data-accent', accent);
    root.setAttribute('data-bg', bgStyle);
    root.style.colorScheme = resolvedDark ? 'dark' : 'light';
    const browserThemeColor = document.querySelector('meta[name="theme-color"]');
    if (browserThemeColor) browserThemeColor.setAttribute('content', resolvedDark ? '#0b0b0e' : '#f9fafb');
    writeLocal(MODE_KEY, mode);
    writeLocal(ACCENT_KEY, accent);
    writeLocal(BG_KEY, bgStyle);
    // Keep the legacy key for older parts of the application.
    writeLocal('theme', resolvedDark ? 'dark' : 'light');
  }, [mode, accent, bgStyle, resolvedDark]);

  const setMode = useCallback((value) => {
    if (MODES.includes(value)) setModeState(value);
  }, []);
  const setAccent = useCallback((value) => {
    if (ACCENTS.some((a) => a.key === value)) setAccentState(value);
  }, []);
  const setBgStyle = useCallback((value) => {
    if (BG_STYLES.some((b) => b.key === value)) setBgStyleState(value);
  }, []);
  const cycleMode = useCallback(() => {
    setModeState((previous) => (previous === 'light' ? 'dark' : previous === 'dark' ? 'system' : 'light'));
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      cycleMode,
      accent,
      setAccent,
      bgStyle,
      setBgStyle,
      resolvedDark,
      accents: ACCENTS,
      bgStyles: BG_STYLES,
    }),
    [mode, accent, bgStyle, resolvedDark, setMode, setAccent, setBgStyle, cycleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme অবশ্যই ThemeProvider এর ভেতরে ব্যবহার করতে হবে');
  return context;
}
