import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getSurface } from '../components/shared/appThemeTokens';

/** Consistent stat-card accent colors across dashboard pages */
export const PAGE_STAT_COLORS = {
  primary: '#2563EB',
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  purple: '#7C3AED',
  muted: '#64748B',
  cyan: '#0891B2',
};

/** Shared page-level color tokens for inline-styled pages */
export function pageColors(isDark) {
  const s = getSurface(isDark);
  return {
    primary: '#2563EB',
    isDark,
    border: s.border,
    borderLight: s.borderSubtle,
    text: s.text,
    title: s.text,
    label: s.textSecondary,
    muted: s.muted,
    faint: s.faint,
    cardBg: s.panel,
    soft: s.soft,
    softer: s.softer,
    inputBg: s.inputBg,
    inputBorder: s.inputBorder,
    inputBdr: s.inputBorder,
    inputText: s.text,
    inputReadonlyBg: isDark ? '#172033' : '#F9FAFB',
    inputReadonlyText: s.faint,
    shadow: isDark ? '0 8px 20px rgba(2,6,23,0.35)' : '0 2px 8px rgba(16,24,40,0.06)',
    headerGrad: isDark
      ? 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)'
      : 'linear-gradient(180deg, #F8F9FC 0%, #F1F3F9 100%)',
    code: isDark ? '#0F172A' : '#F1F5F9',
    tipBg: isDark ? 'rgba(37,99,235,0.12)' : '#EFF6FF',
    tipBorder: isDark ? 'rgba(96,165,250,0.25)' : '#BFDBFE',
    tipText: isDark ? '#CBD5E1' : '#374151',
    infoBg: isDark ? '#172033' : '#F8FAFC',
    infoBorder: s.border,
    infoText: isDark ? '#CBD5E1' : '#374151',
    planCardBg: isDark ? '#1E293B' : '#fff',
    planCardBorder: isDark ? '#334155' : '#EAECF0',
    rowBorder: isDark ? s.borderSubtle : '#F2F4F7',
  };
}

export function usePageTheme() {
  const theme = useTheme();
  const { isDark } = theme;
  const C = useMemo(() => pageColors(isDark), [isDark]);
  return { ...theme, C };
}

export default usePageTheme;
