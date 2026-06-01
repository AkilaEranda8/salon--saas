/**
 * PageKit – shared inline-UI primitives used across all management pages.
 * Import what you need: Drawer, Modal, ActionBtn, StatCard, StaffAvatar,
 * PagBtn, StatusBadge, SearchBar, icons …
 */
import { useState, useEffect, useMemo } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getPaginationRowModel, flexRender,
} from '@tanstack/react-table';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';

/* ─── Table style tokens ─────────────────────────────────────────────────── */
const TABLE_STYLE_TOKENS = {
  default: {
    shellBorder: '1px solid #EAECF0',
    shellRadius: 16,
    shellShadow: '0 2px 8px rgba(16,24,40,0.06)',
    headerBg: 'linear-gradient(180deg, #F9FAFB 0%, #F3F4F6 100%)',
    headerBorder: '1.5px solid #E4E7EC',
    headerColor: '#667085',
    thPadding: '12px 16px',
    thBorderRight: 'none',
    rowEven: '#fff',
    rowOdd: '#FAFBFC',
    rowHover: '#EEF4FF',
    rowBorder: '1px solid #F2F4F7',
    cellPadding: '13px 16px',
    cellBorderRight: 'none',
  },
  minimal: {
    shellBorder: '1px solid #F2F4F7',
    shellRadius: 12,
    shellShadow: '0 1px 3px rgba(16,24,40,0.03)',
    headerBg: '#fff',
    headerBorder: '2px solid #F0F2F5',
    headerColor: '#98A2B3',
    thPadding: '12px 16px',
    thBorderRight: 'none',
    rowEven: '#fff',
    rowOdd: '#fff',
    rowHover: '#F8FAFF',
    rowBorder: '1px solid #F7F8FA',
    cellPadding: '15px 16px',
    cellBorderRight: 'none',
  },
  bordered: {
    shellBorder: '1.5px solid #D0D5DD',
    shellRadius: 8,
    shellShadow: 'none',
    headerBg: '#F3F4F6',
    headerBorder: '2px solid #D0D5DD',
    headerColor: '#344054',
    thPadding: '10px 12px',
    thBorderRight: '1px solid #E4E7EC',
    rowEven: '#fff',
    rowOdd: '#F9FAFB',
    rowHover: '#EFF6FF',
    rowBorder: '1px solid #E4E7EC',
    cellPadding: '10px 12px',
    cellBorderRight: '1px solid #E4E7EC',
  },
  card: {
    shellBorder: 'none',
    shellRadius: 20,
    shellShadow: '0 4px 24px rgba(16,24,40,0.07)',
    headerBg: 'linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)',
    headerBorder: '2px solid #BFDBFE',
    headerColor: '#1D4ED8',
    thPadding: '13px 18px',
    thBorderRight: 'none',
    rowEven: '#fff',
    rowOdd: '#F8FAFF',
    rowHover: '#EEF4FF',
    rowBorder: '1px solid #EFF6FF',
    cellPadding: '15px 18px',
    cellBorderRight: 'none',
  },
  ink: {
    shellBorder: '1px solid #1E2A3A',
    shellRadius: 10,
    shellShadow: '0 4px 16px rgba(0,0,0,0.18)',
    headerBg: 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)',
    headerBorder: '2px solid #334155',
    headerColor: '#94A3B8',
    thPadding: '12px 16px',
    thBorderRight: 'none',
    rowEven: '#fff',
    rowOdd: '#F8FAFC',
    rowHover: '#EFF6FF',
    rowBorder: '1px solid #E2E8F0',
    cellPadding: '13px 16px',
    cellBorderRight: 'none',
  },
  violet: {
    shellBorder: '1px solid #EDE9FE',
    shellRadius: 16,
    shellShadow: '0 2px 12px rgba(124,58,237,0.08)',
    headerBg: 'linear-gradient(180deg, #F5F3FF 0%, #EDE9FE 100%)',
    headerBorder: '2px solid #DDD6FE',
    headerColor: '#6D28D9',
    thPadding: '12px 16px',
    thBorderRight: 'none',
    rowEven: '#fff',
    rowOdd: '#FDFCFF',
    rowHover: '#F5F3FF',
    rowBorder: '1px solid #F3F0FF',
    cellPadding: '13px 16px',
    cellBorderRight: 'none',
  },
  forest: {
    shellBorder: '1px solid #D1FAE5',
    shellRadius: 14,
    shellShadow: '0 2px 12px rgba(5,150,105,0.07)',
    headerBg: 'linear-gradient(180deg, #ECFDF5 0%, #D1FAE5 100%)',
    headerBorder: '2px solid #A7F3D0',
    headerColor: '#065F46',
    thPadding: '12px 16px',
    thBorderRight: 'none',
    rowEven: '#fff',
    rowOdd: '#F6FEFA',
    rowHover: '#ECFDF5',
    rowBorder: '1px solid #ECFDF5',
    cellPadding: '13px 16px',
    cellBorderRight: 'none',
  },
  sunset: {
    shellBorder: '1px solid #FEF3C7',
    shellRadius: 14,
    shellShadow: '0 2px 12px rgba(217,119,6,0.07)',
    headerBg: 'linear-gradient(180deg, #FFFBEB 0%, #FEF3C7 100%)',
    headerBorder: '2px solid #FDE68A',
    headerColor: '#92400E',
    thPadding: '12px 16px',
    thBorderRight: 'none',
    rowEven: '#fff',
    rowOdd: '#FFFDF7',
    rowHover: '#FFFBEB',
    rowBorder: '1px solid #FFF8E6',
    cellPadding: '13px 16px',
    cellBorderRight: 'none',
  },
  rose: {
    shellBorder: '1px solid #FCE7F3',
    shellRadius: 16,
    shellShadow: '0 2px 12px rgba(219,39,119,0.07)',
    headerBg: 'linear-gradient(180deg, #FDF2F8 0%, #FCE7F3 100%)',
    headerBorder: '2px solid #FBCFE8',
    headerColor: '#9D174D',
    thPadding: '12px 16px',
    thBorderRight: 'none',
    rowEven: '#fff',
    rowOdd: '#FFFAFD',
    rowHover: '#FDF2F8',
    rowBorder: '1px solid #FDF2F8',
    cellPadding: '13px 16px',
    cellBorderRight: 'none',
  },
  arctic: {
    shellBorder: '1px solid #E0F2FE',
    shellRadius: 14,
    shellShadow: '0 2px 10px rgba(14,165,233,0.07)',
    headerBg: 'linear-gradient(180deg, #F0F9FF 0%, #E0F2FE 100%)',
    headerBorder: '2px solid #BAE6FD',
    headerColor: '#0C4A6E',
    thPadding: '12px 16px',
    thBorderRight: 'none',
    rowEven: '#fff',
    rowOdd: '#F7FBFF',
    rowHover: '#F0F9FF',
    rowBorder: '1px solid #F0F9FF',
    cellPadding: '13px 16px',
    cellBorderRight: 'none',
  },
  craft: {
    isCraft: true,
    shellBorder: '1px solid #27272a',
    shellRadius: 12,
    shellShadow: '0 4px 24px rgba(0,0,0,0.45)',
    shellBg: '#09090b',
    headerBg: '#18181b',
    headerBorder: '1px solid #27272a',
    headerColor: '#a1a1aa',
    thPadding: '11px 14px',
    thBorderRight: 'none',
    thUppercase: true,
    rowEven: '#09090b',
    rowOdd: '#09090b',
    rowHover: '#18181b',
    rowBorder: '1px solid #27272a',
    cellPadding: '14px 14px',
    cellBorderRight: 'none',
    bodyColor: '#fafafa',
    bodyMuted: '#a1a1aa',
    toolbarBg: '#09090b',
    toolbarBorder: '1px solid #27272a',
    inputBg: '#18181b',
    inputBorder: '1px solid #3f3f46',
    inputColor: '#fafafa',
    inputPlaceholder: '#71717a',
    footerBg: '#09090b',
    footerBorder: '1px solid #27272a',
    footerText: '#a1a1aa',
    pagActiveBg: '#fafafa',
    pagActiveColor: '#09090b',
    pagBg: '#18181b',
    pagBorder: '1px solid #3f3f46',
    pagColor: '#d4d4d8',
    sortActive: '#fafafa',
    sortIdle: '#52525b',
  },
};

/* ─── Icons ─────────────────────────────────────────────────────────────── */
export const IconEye    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
export const IconEdit   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
export const IconTrash  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
export const IconSearch = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
export const IconClose  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
export const IconPlus   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
export const IconCheck  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
export const IconStop   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>;
export const IconRefresh= () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
export const IconStar   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
export const IconUsers  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
export const IconPkg    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
export const IconReceipt= () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
export const IconBox    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>;
export const IconTag    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
export const IconClock  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
export const IconDollar = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
export const IconBell   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
export const IconCalendar=()=> <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;

/* ─── Avatar Palette ─────────────────────────────────────────────────────── */
export const AVATAR_PALETTES = [
  { bg:'#EFF6FF', color:'#2563EB' },
  { bg:'#FDF4FF', color:'#9333EA' },
  { bg:'#FFF7ED', color:'#EA580C' },
  { bg:'#F0FDF4', color:'#16A34A' },
  { bg:'#FEF2F2', color:'#DC2626' },
  { bg:'#F0F9FF', color:'#0284C7' },
  { bg:'#FFFBEB', color:'#D97706' },
  { bg:'#F5F3FF', color:'#7C3AED' },
];

/* ─── StaffAvatar ─────────────────────────────────────────────────────────── */
export function StaffAvatar({ name = '', size = 32, photoUrl = '' }) {
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_PALETTES.length;
  const { bg, color } = AVATAR_PALETTES[idx];
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || 'Staff photo'}
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
          border: '2px solid #ffffff', boxShadow: '0 1px 6px rgba(16,24,40,.18)',
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      fontSize: size * 0.38, fontWeight: 700, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, border: `2px solid ${color}25`,
      fontFamily: "'Inter',sans-serif", letterSpacing: '0.02em', userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

/* ─── ActionBtn ──────────────────────────────────────────────────────────── */
export function ActionBtn({ onClick, title, color, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 30, height: 30, borderRadius: 8, border: `1.5px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s',
        background: hov ? `${color}20` : `${color}10`,
        color, transform: hov ? 'scale(1.1)' : 'scale(1)',
      }}>
      {children}
    </button>
  );
}

/* ─── PagBtn ─────────────────────────────────────────────────────────────── */
export function PagBtn({ onClick, disabled, active, label }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        minWidth: 32, height: 32, padding: '0 6px',
        border: active ? '1.5px solid #2563EB' : '1px solid #E4E7EC',
        borderRadius: 8,
        background: active ? '#EFF6FF' : hov && !disabled ? '#F2F4F7' : '#fff',
        color: active ? '#2563EB' : disabled ? '#D0D5DD' : '#344054',
        fontSize: 13, fontWeight: active ? 700 : 400,
        fontFamily: "'Inter',sans-serif", cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.1s',
      }}>
      {label}
    </button>
  );
}

/* ─── StatCard ───────────────────────────────────────────────────────────── */
export function StatCard({ label, value, color, icon }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#fff', borderRadius: 16, padding: '18px 20px',
        border: '1px solid #EAECF0', flex: 1, minWidth: 130,
        display: 'flex', alignItems: 'center', gap: 14,
        boxShadow: hov ? '0 8px 24px rgba(16,24,40,0.10)' : '0 1px 4px rgba(16,24,40,0.04)',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.2s ease',
        cursor: 'default',
      }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12,
        background: `linear-gradient(135deg, ${color}22 0%, ${color}10 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, flexShrink: 0,
        border: `1.5px solid ${color}20`,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#101828', lineHeight: 1.1, letterSpacing: '-0.5px' }}>{value}</div>
        <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      </div>
    </div>
  );
}

/* ─── Drawer ─────────────────────────────────────────────────────────────── */
export function Drawer({ open, onClose, title, children, footer, width = 480 }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,24,40,0.4)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'relative', width, maxWidth: '95vw', background: '#fff',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(16,24,40,0.15)', animation: 'pk-drawer 0.22s ease',
      }}>
        <style>{'@keyframes pk-drawer { from { transform:translateX(100%); } to { transform:translateX(0); } }'}</style>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAECF0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#fff' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#101828', fontFamily: "'Inter',sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#F2F4F7', border: '1px solid #E4E7EC', cursor: 'pointer', color: '#667085', display: 'flex', alignItems: 'center', borderRadius: 8, padding: 6 }}><IconClose /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>{children}</div>
        {footer && <div style={{ padding: '16px 24px', borderTop: '1px solid #EAECF0', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0, background: '#FAFBFC' }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
export function PKModal({ open, onClose, title, children, footer, size = 'md', width }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  const widths = { sm: 420, md: 560, lg: 720 };
  const modalMaxWidth = width ?? widths[size] ?? 560;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,24,40,0.45)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: modalMaxWidth,
        background: '#fff', borderRadius: 16, display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(16,24,40,0.18)', maxHeight: '90vh', animation: 'pk-modal 0.18s ease',
      }}>
        <style>{'@keyframes pk-modal { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }'}</style>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAECF0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#fff', borderRadius: '16px 16px 0 0' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#101828', fontFamily: "'Inter',sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#F2F4F7', border: '1px solid #E4E7EC', cursor: 'pointer', color: '#667085', display: 'flex', alignItems: 'center', borderRadius: 8, padding: 6 }}><IconClose /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>{children}</div>
        {footer && <div style={{ padding: '16px 24px', borderTop: '1px solid #EAECF0', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0, background: '#FAFBFC' }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ─── SearchBar ─────────────────────────────────────────────────────────── */
export function SearchBar({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#98A2B3', pointerEvents: 'none', display: 'flex' }}><IconSearch /></span>
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', boxSizing: 'border-box', color: '#101828', background: '#FAFAFA' }}
        onFocus={e => e.target.style.borderColor = '#2563EB'}
        onBlur={e => e.target.style.borderColor = '#E4E7EC'} />
    </div>
  );
}

/* ─── FilterBar wrapper ─────────────────────────────────────────────────── */
export function FilterBar({ children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #EAECF0', padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 2px 8px rgba(16,24,40,0.06)', backdropFilter: 'blur(4px)' }}>
      {children}
    </div>
  );
}

/* ─── Table shell ────────────────────────────────────────────────────────── */
export function TableShell({ children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #EAECF0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(16,24,40,0.06)' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", tableLayout: 'fixed' }}>
          {children}
        </table>
        <style>{'@keyframes pk-shimmer { to { background-position:-200% 0; } }'}</style>
      </div>
    </div>
  );
}

/* ─── Table header cell ──────────────────────────────────────────────────── */
export function Th({ children, align = 'left', onClick, sortActive, sortDir, ts, className }) {
  const t = ts || TABLE_STYLE_TOKENS.default;
  return (
    <th className={className} onClick={onClick} style={{
      padding: t.thPadding, textAlign: align, fontSize: 11, fontWeight: 600,
      color: t.headerColor, textTransform: t.thUppercase ? 'uppercase' : 'uppercase', letterSpacing: '0.05em',
      background: t.headerBg,
      borderBottom: t.headerBorder,
      borderRight: t.thBorderRight,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
    }}>
      {children}
      {onClick && (
        <span style={{ fontSize: 10, marginLeft: 4, color: sortActive ? (t.sortActive || '#2563EB') : (t.sortIdle || '#C4C9D4') }}>
          {sortDir === 'asc' ? '▲' : '▼'}
        </span>
      )}
    </th>
  );
}

/* ─── Table skeleton rows ────────────────────────────────────────────────── */
export function SkeletonRows({ cols = 5, rows = 5 }) {
  return Array.from({ length: rows }).map((_, i) => (
    <tr key={i}>{Array.from({ length: cols }).map((_, j) => (
      <td key={j} style={{ padding: '14px 16px' }}>
        <div style={{ height: 13, borderRadius: 6, width: `${50 + (j * 13) % 40}%`, background: 'linear-gradient(90deg,#F2F4F7 25%,#E8EAED 50%,#F2F4F7 75%)', backgroundSize: '200% 100%', animation: 'pk-shimmer 1.4s infinite' }} />
      </td>
    ))}</tr>
  ));
}

/* ─── Empty state row ────────────────────────────────────────────────────── */
export function EmptyRow({ cols = 5, message = 'No records found', sub = 'Try adjusting your filters' }) {
  return (
    <tr><td colSpan={cols} style={{ padding: '60px 16px', textAlign: 'center', background: '#FAFBFC' }}>
      <div style={{ color: '#344054', fontWeight: 700, fontSize: 15, fontFamily: "'Inter',sans-serif" }}>{message}</div>
      <div style={{ color: '#98A2B3', fontSize: 13, marginTop: 6, fontFamily: "'Inter',sans-serif" }}>{sub}</div>
    </td></tr>
  );
}

/* ─── Pagination bar ─────────────────────────────────────────────────────── */
export function Pagination({ page, total, limit, onPageChange }) {
  const totalPages = Math.ceil(total / limit);
  const shown = Math.min(limit, total - (page - 1) * limit);
  if (totalPages <= 1) return (
    <div style={{ padding: '12px 18px', borderTop: '1px solid #F2F4F7', background: '#FAFBFC' }}>
      <span style={{ fontSize: 12, color: '#98A2B3', fontFamily: "'Inter',sans-serif" }}>Showing {total} record{total !== 1 ? 's' : ''}</span>
    </div>
  );
  return (
    <div style={{ padding: '12px 18px', borderTop: '1px solid #F2F4F7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, background: '#FAFBFC' }}>
      <span style={{ fontSize: 12, color: '#98A2B3', fontFamily: "'Inter',sans-serif" }}>Showing <b style={{ color: '#344054' }}>{shown}</b> of <b style={{ color: '#344054' }}>{total}</b></span>
      <div style={{ display: 'flex', gap: 4 }}>
        <PagBtn onClick={() => onPageChange(1)} disabled={page === 1} label="«" />
        <PagBtn onClick={() => onPageChange(page - 1)} disabled={page === 1} label="‹" />
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
          return <PagBtn key={p} onClick={() => onPageChange(p)} active={p === page} label={p} />;
        })}
        <PagBtn onClick={() => onPageChange(page + 1)} disabled={page === totalPages} label="›" />
        <PagBtn onClick={() => onPageChange(totalPages)} disabled={page === totalPages} label="»" />
      </div>
    </div>
  );
}

/* ─── Detail row (Drawer content helper) ────────────────────────────────── */
export function DetailRow({ icon, label, value, highlight }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #F2F4F7' }}>
      {icon && <span style={{ fontSize: 16, width: 28, flexShrink: 0 }}>{icon}</span>}
      <span style={{ fontSize: 12, fontWeight: 600, color: '#98A2B3', textTransform: 'uppercase', width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: highlight ? '#059669' : '#101828', fontWeight: highlight ? 700 : 500 }}>{value}</span>
    </div>
  );
}

/* ─── Row hover wrapper ──────────────────────────────────────────────────── */
export function TR({ children, idx, ts }) {
  const [hov, setHov] = useState(false);
  const t = ts || TABLE_STYLE_TOKENS.default;
  return (
    <tr onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? t.rowHover : idx % 2 === 0 ? t.rowEven : t.rowOdd, transition: 'background 0.15s', borderBottom: t.rowBorder }}>
      {children}
    </tr>
  );
}

/* ─── Sortable column header (TableCraft-style helper) ───────────────────── */
export function DataTableColumnHeader({ column, title, ts }) {
  const sorted = column.getIsSorted();
  const t = ts || TABLE_STYLE_TOKENS.default;
  const sortColor = sorted ? (t.sortActive || '#2563EB') : (t.sortIdle || '#C4C9D4');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {title}
      {column.getCanSort() && (
        <span style={{ fontSize: 10, color: sortColor, opacity: sorted ? 1 : 0.7 }}>
          {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '⇅'}
        </span>
      )}
    </span>
  );
}

/** TableCraft-style status pill */
export function TableCraftStatusBadge({ status }) {
  const key = String(status || '').toLowerCase();
  const map = {
    active:   { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80',  border: 'rgba(34,197,94,0.35)' },
    inactive: { bg: 'rgba(113,113,122,0.2)', color: '#a1a1aa', border: 'rgba(113,113,122,0.4)' },
    pending:  { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.35)' },
  };
  const s = map[key] || map.inactive;
  const label = status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : '—';
  return (
    <span style={{
      display: 'inline-block', padding: '4px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {label}
    </span>
  );
}

function craftPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = [0];
  if (current > 2) pages.push('...');
  for (let i = Math.max(1, current - 1); i <= Math.min(total - 2, current + 1); i++) pages.push(i);
  if (current < total - 3) pages.push('...');
  pages.push(total - 1);
  return pages;
}

function IconColumns() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  );
}

function IconTableGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function IconLayoutCards() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

/* ─── Per-row actions menu (use column id: "actions") ────────────────────── */
export function TableActionsRow({ actions: actionsProp, showAction, editAction, deleteAction }) {
  const actions = actionsProp ?? [
    showAction && { label: showAction.label || 'View', onClick: showAction.action },
    editAction && { label: editAction.label || 'Edit', onClick: editAction.action },
    deleteAction && { label: deleteAction.label || 'Delete', onClick: deleteAction.action, variant: 'destructive' },
  ].filter(Boolean);
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="Row actions"
        style={{ border: '1px solid #E4E7EC', borderRadius: 6, background: '#fff', padding: '4px 8px', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: '#475467' }}>
        ⋯
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 41, minWidth: 140, background: '#fff', border: '1px solid #E4E7EC', borderRadius: 8, boxShadow: '0 4px 16px rgba(16,24,40,0.12)', overflow: 'hidden' }}>
            {actions.map((a, i) => (
              <button key={i} type="button" onClick={() => { setOpen(false); a.onClick?.(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif", color: a.variant === 'destructive' ? '#DC2626' : '#344054' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


/* ─── DataTable (powered by @tanstack/react-table) ──────────────────────── */
/*
 * TableCraft-equivalent props (Vite / no Tailwind):
 *   searchableColumns — [{ id, title }]
 *   filterableColumns — [{ id, title, options: [{ label, value }] }]
 *   pagination, pageSize, pageSizeOptions
 *   showRowNumbers, enableColumnVisibility
 */
/** Default TableCraft-style table props for list pages */
export const CRAFT_TABLE_DEFAULTS = {
  pagination: true,
  pageSize: 10,
  showRowNumbers: true,
  enableColumnVisibility: true,
};

function applyTableDensity(ts, density) {
  if (density !== 'compact') return ts;
  return {
    ...ts,
    thPadding: '5px 12px',
    cellPadding: '6px 12px',
  };
}

/** First 1–2 filterable text columns — enables TableCraft toolbar when searchableColumns omitted */
export function inferSearchableColumns(columns) {
  const out = [];
  for (const col of columns || []) {
    const id = col.id || col.accessorKey;
    if (!id || id === 'actions' || id === '_rowNum' || id === 'rank') continue;
    if (!col.accessorFn && !col.accessorKey) continue;
    const title = typeof col.header === 'string' ? col.header : String(id).replace(/_/g, ' ');
    out.push({ id, title: title.charAt(0).toUpperCase() + title.slice(1) });
    if (out.length >= 2) break;
  }
  return out.length ? out : null;
}

/** Convert legacy `{ key, label, render?, width?, align? }` columns to TanStack ColumnDef */
export function toColumnDefs(cols) {
  return (cols || []).map(col => {
    const id = col.id || col.key || col.accessorKey;
    return {
      id,
      accessorKey: col.accessorKey ?? col.key,
      accessorFn: col.accessorFn,
      header: col.header ?? col.label ?? id,
      meta: { width: col.width, align: col.align, padding: col.padding, ...(col.meta || {}) },
      enableSorting: col.enableSorting ?? (col.sortable !== false && col.id !== 'actions'),
      cell: col.cell ?? (col.render
        ? ({ row }) => col.render(row.original, row.index)
        : undefined),
    };
  });
}

/** Embedded / modal tables — toolbar & pagination off */
export const CRAFT_TABLE_COMPACT = {
  pagination: false,
  showRowNumbers: false,
  enableColumnVisibility: false,
};

/** TableCraft `ClientSideTable` alias — `pageCount` is optional and ignored (pagination is computed client-side). */
export function ClientSideTable({ pageCount: _pageCount, ...props }) {
  return <DataTable {...props} />;
}

export function DataTable({
  columns,
  data,
  loading,
  emptyMessage = 'No records found',
  emptySub     = 'Try adjusting your filters',
  footerRows,
  noShell = false,
  compact = false,
  pagination: paginationProp,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  searchableColumns: searchableColumnsProp = undefined,
  filterableColumns = null,
  showRowNumbers: showRowNumbersProp,
  enableColumnVisibility: enableColumnVisibilityProp,
}) {
  const pagination = compact ? false : (paginationProp ?? true);
  const showRowNumbers = compact ? false : (showRowNumbersProp ?? true);
  const enableColumnVisibility = compact ? false : (enableColumnVisibilityProp ?? true);
  const { tableStyle = 'default', tableDensity = 'comfortable' } = useTheme();
  const ts = applyTableDensity(TABLE_STYLE_TOKENS[tableStyle] || TABLE_STYLE_TOKENS.default, tableDensity);
  const craft = !!ts.isCraft;
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [viewMode, setViewMode] = useState('table');
  const [columnVisibility, setColumnVisibility] = useState({});
  const [showColMenu, setShowColMenu] = useState(false);
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize: pagination ? initialPageSize : 100_000,
  });

  const stableData = useMemo(() => data ?? [], [data]);

  const searchableColumns = useMemo(() => {
    if (searchableColumnsProp !== undefined) return searchableColumnsProp;
    if (compact || noShell) return null;
    return inferSearchableColumns(columns);
  }, [searchableColumnsProp, compact, noShell, columns]);

  const tableColumns = useMemo(() => {
    const facetIds = new Set((filterableColumns || []).map(f => f.id));
    const searchIds = new Set((searchableColumns || []).map(f => f.id));
    const base = columns.map(col => {
      const colId = col.id || col.accessorKey;
      const header = typeof col.header === 'string'
        ? ({ column }) => <DataTableColumnHeader column={column} title={col.header} ts={ts} />
        : col.header;
      return {
        ...col,
        header,
        enableSorting: col.enableSorting ?? (col.id !== 'actions' && col.id !== '_rowNum'),
        ...(facetIds.has(colId) ? { filterFn: 'equals' } : {}),
        ...(searchIds.has(colId) ? { filterFn: 'includesString' } : {}),
      };
    });
    const hasIndexCol = base.some(c => c.id === 'rank' || c.id === '_rowNum' || c.header === '#');
    if (!showRowNumbers || hasIndexCol) return base;
    return [{
      id: '_rowNum',
      header: craft ? 'NO' : '#',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row, table: tbl }) => {
        const { pageIndex, pageSize } = tbl.getState().pagination;
        return row.index + 1 + pageIndex * pageSize;
      },
      meta: { width: '48px', align: 'center' },
    }, ...base];
  }, [columns, showRowNumbers, craft, ts]);

  const setColFilter = (id, value) => {
    setColumnFilters(prev => {
      const rest = prev.filter(f => f.id !== id);
      return value ? [...rest, { id, value }] : rest;
    });
  };

  const table = useReactTable({
    data: stableData,
    columns: tableColumns,
    state: { sorting, columnFilters, columnVisibility, pagination: paginationState },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPaginationState,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
  });

  const colCount = table.getVisibleLeafColumns().length;
  const totalFiltered = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const hasToolbar = !!(searchableColumns?.length || filterableColumns?.length || enableColumnVisibility);
  const useCraftToolbar = hasToolbar && !compact;
  const tb = TABLE_STYLE_TOKENS.craft;

  const activeFilters = columnFilters.filter(f => f.value != null && f.value !== '');

  const filterLabel = (filterId, value) => {
    const fc = filterableColumns?.find(f => f.id === filterId);
    if (fc) {
      const opt = fc.options.find(o => String(o.value) === String(value));
      return opt ? `${fc.title}: ${opt.label}` : `${fc.title}: ${value}`;
    }
    const sc = searchableColumns?.find(f => f.id === filterId);
    if (sc) return `${sc.title}: "${value}"`;
    return String(value);
  };

  const inputStyle = useCraftToolbar ? {
    padding: '8px 12px', borderRadius: 8, border: tb.inputBorder, fontSize: 13,
    fontFamily: "'Inter',sans-serif", outline: 'none', color: tb.inputColor, background: tb.inputBg,
    minWidth: 160, flex: '0 1 200px', maxWidth: 240,
  } : {
    padding: '7px 12px', borderRadius: 8, border: '1.5px solid #E4E7EC', fontSize: 13,
    fontFamily: "'Inter',sans-serif", outline: 'none', color: '#344054', background: '#fff',
    minWidth: 140, flex: '1 1 160px', maxWidth: 220,
  };
  const searchInputStyle = {
    ...inputStyle,
    width: '100%',
    boxSizing: 'border-box',
    paddingLeft: 36,
    paddingRight: 12,
  };

  const inner = (
    <>
      {hasToolbar && (
        <div
          className={useCraftToolbar ? 'pk-table-toolbar' : undefined}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            padding: useCraftToolbar ? '12px 16px' : '12px 14px',
            borderBottom: useCraftToolbar ? tb.toolbarBorder : '1px solid #F2F4F7',
            background: useCraftToolbar ? tb.toolbarBg : '#FAFBFC',
          }}
        >
          {useCraftToolbar && (
            <div style={{ display: 'flex', borderRadius: 8, border: tb.inputBorder, overflow: 'hidden', flexShrink: 0 }}>
              {[
                { mode: 'table', label: 'Table', icon: <IconTableGrid /> },
                { mode: 'cards', label: 'Cards', icon: <IconLayoutCards /> },
              ].map(({ mode, label, icon }) => (
                <button key={mode} type="button" onClick={() => setViewMode(mode)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "'Inter',sans-serif",
                    background: viewMode === mode ? '#fafafa' : tb.inputBg,
                    color: viewMode === mode ? '#09090b' : tb.footerText,
                  }}>
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          )}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            flex: 1,
            alignItems: 'center',
            justifyContent: useCraftToolbar ? 'center' : 'flex-start',
            minWidth: 0,
          }}>
            {searchableColumns?.map(sc => (
              <div key={sc.id} style={{ position: 'relative', flex: '0 1 200px', minWidth: 160, maxWidth: 240 }}>
                <span style={{
                  position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                  color: useCraftToolbar ? tb.inputPlaceholder : '#98A2B3',
                  display: 'flex', alignItems: 'center', pointerEvents: 'none', zIndex: 1,
                }}>
                  <IconSearch />
                </span>
                <input
                  type="text"
                  value={String(columnFilters.find(f => f.id === sc.id)?.value ?? '')}
                  onChange={e => setColFilter(sc.id, e.target.value)}
                  placeholder={sc.placeholder || `Filter ${sc.title}…`}
                  style={searchInputStyle}
                />
              </div>
            ))}
            {filterableColumns?.map(fc => (
              <select key={fc.id} value={String(columnFilters.find(f => f.id === fc.id)?.value ?? '')}
                onChange={e => setColFilter(fc.id, e.target.value)}
                style={{ ...inputStyle, paddingLeft: 12, cursor: 'pointer' }}>
                <option value="">{fc.title}: All</option>
                {fc.options.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ))}
            {!useCraftToolbar && activeFilters.map(f => (
              <span key={f.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999,
                fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif",
                background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE',
              }}>
                {filterLabel(f.id, f.value)}
                <button type="button" aria-label={`Clear ${f.id} filter`}
                  onClick={() => setColFilter(f.id, '')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', fontSize: 14, opacity: 0.85 }}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: useCraftToolbar ? 0 : 'auto' }}>
            {activeFilters.length > 0 && (
              <button type="button" onClick={() => setColumnFilters([])}
                style={{
                  ...inputStyle, padding: '8px 12px', cursor: 'pointer', flex: '0 0 auto', minWidth: 'auto',
                  color: useCraftToolbar ? tb.inputColor : '#344054',
                }}>
                Reset
              </button>
            )}
            {enableColumnVisibility && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button type="button" onClick={() => setShowColMenu(o => !o)}
                  style={{
                    ...inputStyle,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 'auto',
                    flex: '0 0 auto',
                  }}>
                  {useCraftToolbar && <IconColumns />}
                  Columns
                </button>
                {showColMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowColMenu(false)} />
                    <div style={{
                      position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 41,
                      background: useCraftToolbar ? '#18181b' : '#fff',
                      border: useCraftToolbar ? tb.inputBorder : '1px solid #E4E7EC',
                      borderRadius: 8, padding: 8, minWidth: 160,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                    }}>
                      {table.getAllLeafColumns().filter(c => c.getCanHide()).map(col => (
                        <label key={col.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', fontSize: 13,
                          cursor: 'pointer', color: useCraftToolbar ? tb.bodyColor : '#344054',
                        }}>
                          <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} />
                          {typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {useCraftToolbar && activeFilters.length > 0 && (
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
              {activeFilters.map(f => (
                <span key={f.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999,
                  fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif",
                  background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)',
                }}>
                  {filterLabel(f.id, f.value)}
                  <button type="button" aria-label={`Clear ${f.id} filter`}
                    onClick={() => setColFilter(f.id, '')}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', fontSize: 14, opacity: 0.85 }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <div
        style={{ overflowX: 'auto' }}
        className={[
          'pk-data-table',
          craft ? 'pk-craft-table' : '',
          tableDensity === 'compact' ? 'table-compact' : 'table-comfortable',
        ].filter(Boolean).join(' ')}
      >
        {craft && (
          <style>{`
            .pk-craft-table tbody td { color: #fafafa; }
            .pk-craft-table tbody td [style*="color:#101828"],
            .pk-craft-table tbody td [style*="color: #101828"],
            .pk-craft-table tbody td [style*="color:#344054"],
            .pk-craft-table tbody td [style*="color: #344054"],
            .pk-craft-table tbody td [style*="color:#475467"],
            .pk-craft-table tbody td [style*="color: #475467"] { color: #e4e4e7 !important; }
            .pk-craft-table tbody td [style*="color:#98A2B3"],
            .pk-craft-table tbody td [style*="color: #98A2B3"] { color: #a1a1aa !important; }
          `}</style>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", tableLayout: 'fixed' }}>
          <colgroup>
            {table.getVisibleLeafColumns().map(col => (
              <col key={col.id} style={{ width: col.columnDef.meta?.width ?? 'auto' }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => {
                  const canSort = header.column.getCanSort();
                  const sorted  = header.column.getIsSorted();
                  return (
                    <Th key={header.id}
                      className="table-header"
                      ts={ts}
                      align={header.column.columnDef.meta?.align}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      sortActive={!!sorted}
                      sortDir={sorted || 'asc'}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </Th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows cols={colCount} rows={5} />
            ) : table.getRowModel().rows.length === 0 ? (
              <EmptyRow cols={colCount} message={emptyMessage} sub={emptySub} />
            ) : (
              <>
                {table.getRowModel().rows.map((row, idx) => (
                  <TR key={row.id} idx={idx} ts={ts}>
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="table-cell" style={{
                        padding: cell.column.columnDef.meta?.padding ?? ts.cellPadding,
                        textAlign: cell.column.columnDef.meta?.align ?? 'left',
                        borderRight: ts.cellBorderRight,
                        color: ts.bodyColor || '#101828',
                        fontSize: tableDensity === 'compact' ? 12 : 14,
                      }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </TR>
                ))}
                {footerRows}
              </>
            )}
          </tbody>
        </table>
        <style>{'@keyframes pk-shimmer { to { background-position:-200% 0; } }'}</style>
      </div>
      {pagination && !loading && totalFiltered > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          padding: '12px 14px', borderTop: craft ? ts.footerBorder : '1px solid #F2F4F7',
          background: craft ? ts.footerBg : '#FAFBFC',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: craft ? ts.footerText : '#475467' }}>
              Showing <strong style={{ color: craft ? ts.bodyColor : '#344054' }}>{pageIndex * pageSize + 1}-{Math.min((pageIndex + 1) * pageSize, totalFiltered)}</strong>
              {' '}of <strong style={{ color: craft ? ts.bodyColor : '#344054' }}>{totalFiltered}</strong> records
            </span>
            <label style={{ fontSize: 13, color: craft ? ts.footerText : '#475467', display: 'flex', alignItems: 'center', gap: 8 }}>
              Rows Per Page
              <select value={pageSize} onChange={e => table.setPageSize(Number(e.target.value))}
                style={{ ...inputStyle, padding: '6px 28px 6px 10px', minWidth: 64, flex: '0 0 auto' }}>
                {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {craft ? (
              <>
                <CraftPagBtn ts={ts} onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} label="«" />
                <CraftPagBtn ts={ts} onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} label="‹ Previous" />
                {craftPageNumbers(pageIndex, pageCount).map((n, i) => n === '...'
                  ? <span key={`e${i}`} style={{ padding: '0 4px', color: ts.footerText, fontSize: 13 }}>…</span>
                  : <CraftPagBtn key={n} ts={ts} onClick={() => table.setPageIndex(n)} active={n === pageIndex} label={String(n + 1)} />
                )}
                <CraftPagBtn ts={ts} onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} label="Next ›" />
                <CraftPagBtn ts={ts} onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()} label="»" />
              </>
            ) : (
              <>
                <PagBtn onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} label="«" />
                <PagBtn onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} label="‹" />
                <span style={{ fontSize: 12, color: '#475467' }}>{pageIndex + 1} / {Math.max(1, pageCount)}</span>
                <PagBtn onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} label="›" />
                <PagBtn onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()} label="»" />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (noShell) return inner;
  return (
    <div style={{
      background: ts.shellBg || '#fff',
      borderRadius: ts.shellRadius,
      border: ts.shellBorder,
      overflow: 'hidden',
      boxShadow: ts.shellShadow,
    }}>
      {useCraftToolbar && (
        <style>{`
          .pk-table-toolbar input::placeholder { color: #71717a; opacity: 1; }
          .pk-table-toolbar select option { background: #18181b; color: #fafafa; }
        `}</style>
      )}
      {inner}
    </div>
  );
}

function CraftPagBtn({ onClick, disabled, active, label, ts }) {
  const [hov, setHov] = useState(false);
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        minWidth: 32, height: 32, padding: '0 10px',
        border: active ? 'none' : ts.pagBorder,
        borderRadius: 8,
        background: active ? ts.pagActiveBg : (hov && !disabled ? '#27272a' : ts.pagBg),
        color: active ? ts.pagActiveColor : (disabled ? '#52525b' : ts.pagColor),
        fontSize: 13, fontWeight: active ? 700 : 500,
        fontFamily: "'Inter',sans-serif",
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.12s',
        opacity: disabled ? 0.45 : 1,
      }}>
      {label}
    </button>
  );
}
