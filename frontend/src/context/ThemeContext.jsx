import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const THEME_MODE_KEY         = 'salon-theme-mode';
const SIDEBAR_STYLE_KEY      = 'salon-sidebar-style';
const PRIMARY_COLOR_KEY      = 'salon-primary-color';
const FONT_FAMILY_KEY        = 'salon-font-family';
const SIDEBAR_APPEARANCE_KEY = 'salon-sidebar-appearance';
const TABLE_STYLE_KEY        = 'salon-table-style';

const ThemeContext = createContext(null);

function getInitialMode() {
  if (typeof window === 'undefined') return 'light';
  const savedMode = window.localStorage.getItem(THEME_MODE_KEY);
  if (savedMode === 'light' || savedMode === 'dark') return savedMode;
  return 'light';
}

function getInitialSidebarStyle() {
  if (typeof window === 'undefined') return 'default';
  const savedStyle = window.localStorage.getItem(SIDEBAR_STYLE_KEY);
  const valid = ['default','compact','floating','glass','gradient','accent','pill','wide','minimal'];
  return valid.includes(savedStyle) ? savedStyle : 'default';
}

function getInitialPrimaryColor() {
  if (typeof window === 'undefined') return '#2563EB';
  return window.localStorage.getItem(PRIMARY_COLOR_KEY) || '#2563EB';
}

function getInitialFontFamily() {
  if (typeof window === 'undefined') return 'Inter';
  return window.localStorage.getItem(FONT_FAMILY_KEY) || 'Inter';
}

function getInitialSidebarAppearance() {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(SIDEBAR_APPEARANCE_KEY);
  return saved === 'dark' ? 'dark' : 'light';
}

function getInitialTableStyle() {
  if (typeof window === 'undefined') return 'default';
  const s = window.localStorage.getItem(TABLE_STYLE_KEY);
  return ['default', 'minimal', 'bordered', 'card', 'ink', 'violet', 'forest', 'sunset', 'rose', 'arctic'].includes(s) ? s : 'default';
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '37, 99, 235';
}

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  'family=Inter:wght@400;500;600;700;800' +
  '&family=Poppins:wght@400;500;600;700;800' +
  '&family=Roboto:wght@400;500;700' +
  '&family=Nunito:wght@400;600;700;800' +
  '&family=Lato:wght@400;700' +
  '&family=Montserrat:wght@400;500;600;700;800' +
  '&display=swap';

export function ThemeProvider({ children }) {
  const [mode, setMode]                       = useState(getInitialMode);
  const [sidebarStyle, setSidebarStyle]       = useState(getInitialSidebarStyle);
  const [primaryColor, setPrimaryColor]       = useState(getInitialPrimaryColor);
  const [fontFamily, setFontFamily]           = useState(getInitialFontFamily);
  const [sidebarAppearance, setSidebarAppearance] = useState(getInitialSidebarAppearance);
  const [tableStyle, setTableStyle]           = useState(getInitialTableStyle);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    window.localStorage.setItem(THEME_MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STYLE_KEY, sidebarStyle);
  }, [sidebarStyle]);

  useEffect(() => {
    const root = document.documentElement;
    const rgb = hexToRgb(primaryColor);
    root.style.setProperty('--app-accent', primaryColor);
    root.style.setProperty('--app-accent-soft', `rgba(${rgb}, 0.10)`);
    root.style.setProperty('--app-glow', `rgba(${rgb}, 0.18)`);
    window.localStorage.setItem(PRIMARY_COLOR_KEY, primaryColor);
  }, [primaryColor]);

  useEffect(() => {
    if (!document.getElementById('salon-dynamic-fonts')) {
      const link = document.createElement('link');
      link.id = 'salon-dynamic-fonts';
      link.rel = 'stylesheet';
      link.href = GOOGLE_FONTS_URL;
      document.head.appendChild(link);
    }
    document.body.style.fontFamily = `'${fontFamily}', 'Manrope', 'Segoe UI', sans-serif`;
    window.localStorage.setItem(FONT_FAMILY_KEY, fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_APPEARANCE_KEY, sidebarAppearance);
  }, [sidebarAppearance]);

  useEffect(() => {
    window.localStorage.setItem(TABLE_STYLE_KEY, tableStyle);
  }, [tableStyle]);

  const value = useMemo(() => ({
    mode,
    setMode,
    sidebarStyle,
    setSidebarStyle,
    isDark: mode === 'dark',
    toggleMode: () => setMode((currentMode) => (currentMode === 'dark' ? 'light' : 'dark')),
    primaryColor,
    setPrimaryColor,
    fontFamily,
    setFontFamily,
    sidebarAppearance,
    setSidebarAppearance,
    tableStyle,
    setTableStyle,
  }), [mode, sidebarStyle, primaryColor, fontFamily, sidebarAppearance, tableStyle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
