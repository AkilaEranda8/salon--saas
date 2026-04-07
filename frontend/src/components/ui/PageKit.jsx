/**
 * PageKit – shared inline-UI primitives used across all management pages.
 * Import what you need: Drawer, Modal, ActionBtn, StatCard, StaffAvatar,
 * PagBtn, StatusBadge, SearchBar, icons …
 */
import { useState, useEffect, useMemo } from 'react';
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { createPortal } from 'react-dom';

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
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '16px 20px',
      border: '1px solid #EAECF0', flex: 1, minWidth: 130,
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 1px 4px rgba(16,24,40,0.04)',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10, background: `${color}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#101828', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2, fontWeight: 500 }}>{label}</div>
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
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #EAECF0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#101828', fontFamily: "'Inter',sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#98A2B3', display: 'flex', alignItems: 'center', borderRadius: 8, padding: 4 }}><IconClose /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>{children}</div>
        {footer && <div style={{ padding: '16px 24px', borderTop: '1px solid #EAECF0', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>{footer}</div>}
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
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #EAECF0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#101828', fontFamily: "'Inter',sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#98A2B3', display: 'flex', alignItems: 'center', borderRadius: 8, padding: 4 }}><IconClose /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>{children}</div>
        {footer && <div style={{ padding: '16px 24px', borderTop: '1px solid #EAECF0', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>{footer}</div>}
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
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #EAECF0', padding: '14px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 4px rgba(16,24,40,0.04)' }}>
      {children}
    </div>
  );
}

/* ─── Table shell ────────────────────────────────────────────────────────── */
export function TableShell({ children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #EAECF0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(16,24,40,0.04)' }}>
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
export function Th({ children, align = 'left', onClick, sortActive, sortDir }) {
  return (
    <th onClick={onClick} style={{
      padding: '11px 16px', textAlign: align, fontSize: 11, fontWeight: 700,
      color: '#98A2B3', textTransform: 'uppercase', letterSpacing: '0.05em',
      background: '#F9FAFB', borderBottom: '1px solid #EAECF0',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
    }}>
      {children}
      {onClick && (
        <span style={{ fontSize: 10, marginLeft: 4, color: sortActive ? '#2563EB' : 'transparent' }}>
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
    <tr><td colSpan={cols} style={{ padding: '52px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
      <div style={{ color: '#344054', fontWeight: 600, fontSize: 15 }}>{message}</div>
      <div style={{ color: '#98A2B3', fontSize: 13, marginTop: 4 }}>{sub}</div>
    </td></tr>
  );
}

/* ─── Pagination bar ─────────────────────────────────────────────────────── */
export function Pagination({ page, total, limit, onPageChange }) {
  const totalPages = Math.ceil(total / limit);
  const shown = Math.min(limit, total - (page - 1) * limit);
  if (totalPages <= 1) return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid #F2F4F7' }}>
      <span style={{ fontSize: 12, color: '#98A2B3' }}>Showing {total} record{total !== 1 ? 's' : ''}</span>
    </div>
  );
  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid #F2F4F7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#98A2B3' }}>Showing {shown} of {total}</span>
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
export function TR({ children, idx }) {
  const [hov, setHov] = useState(false);
  return (
    <tr onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? '#FAFBFF' : idx % 2 === 0 ? '#fff' : '#FAFAFA', transition: 'background 0.1s', borderBottom: '1px solid #F2F4F7' }}>
      {children}
    </tr>
  );
}

/* ─── DataTable (powered by @tanstack/react-table) ──────────────────────── */
/*
 * columns: TanStack column defs — use accessorKey/accessorFn + cell + meta:{ width, align }
 * data:    array of row objects
 * loading: boolean — shows skeleton rows
 * footerRows: optional JSX appended after data rows (e.g. a totals row)
 * noShell: skip the outer white card wrapper (use when embedded inside another card)
 */
export function DataTable({
  columns,
  data,
  loading,
  emptyMessage = 'No records found',
  emptySub     = 'Try adjusting your filters',
  footerRows,
  noShell = false,
}) {
  const [sorting, setSorting] = useState([]);
  const stableData = useMemo(() => data ?? [], [data]);

  const table = useReactTable({
    data: stableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const colCount = columns.length;

  const inner = (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", tableLayout: 'fixed' }}>
        <colgroup>
          {table.getAllColumns().map(col => (
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
                <TR key={row.id} idx={idx}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{
                      padding: cell.column.columnDef.meta?.padding ?? '13px 16px',
                      textAlign: cell.column.columnDef.meta?.align ?? 'left',
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
  );

  if (noShell) return inner;
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #EAECF0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(16,24,40,0.04)' }}>
      {inner}
    </div>
  );
}
