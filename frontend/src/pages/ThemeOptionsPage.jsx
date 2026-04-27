import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import PageWrapper from '../components/layout/PageWrapper';
import api from '../api/axios';
import toast from 'react-hot-toast';

/* ── SVG icons ─────────────────────────────────────────────────────────────── */
const IconSun    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
const IconMoon   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
const IconLayout = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>;
const IconCheck  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconPalette = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>;
const IconType   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>;
const IconSave   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

/* ── Design tokens (always light — page itself is always light) ─────────────── */
const C = {
  primary:  '#2563EB',
  border:   '#EAECF0',
  text:     '#101828',
  label:    '#667085',
  muted:    '#98A2B3',
  cardBg:   '#FFFFFF',
  soft:     '#F7F8FA',
  inputBdr: '#D0D5DD',
};

const PRESET_COLORS = [
  { hex: '#2563EB', label: 'Indigo' },
  { hex: '#7C3AED', label: 'Violet' },
  { hex: '#DB2777', label: 'Pink' },
  { hex: '#DC2626', label: 'Red' },
  { hex: '#D97706', label: 'Amber' },
  { hex: '#059669', label: 'Emerald' },
  { hex: '#0891B2', label: 'Cyan' },
  { hex: '#101828', label: 'Slate' },
];

const FONT_OPTIONS = ['Inter', 'Poppins', 'Roboto', 'Nunito', 'Lato', 'Montserrat'];

/* ── SectionCard ───────────────────────────────────────────────────────────── */
function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: C.cardBg,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(16,24,40,0.06)',
    }}>
      <div style={{
        padding: '16px 22px',
        borderBottom: `1px solid ${C.border}`,
        background: 'linear-gradient(180deg, #F8F9FC 0%, #F1F3F9 100%)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Sora','Manrope',sans-serif" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: C.label, marginTop: 2, fontFamily: "'Inter',sans-serif" }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '24px 22px' }}>{children}</div>
    </div>
  );
}

/* ── AppearanceCard ────────────────────────────────────────────────────────── */
function AppearanceCard({ value, label, description, icon, active, onClick, previewBg, previewContent }) {
  const [hov, setHov] = useState(false);
  return (
    <motion.div
      whileHover={{ translateY: -3 }}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: '1 1 160px', minWidth: 150, maxWidth: 220,
        border: `2px solid ${active ? C.primary : hov ? '#C7D7F8' : C.border}`,
        borderRadius: 16, overflow: 'hidden',
        cursor: 'pointer',
        background: C.cardBg,
        boxShadow: active
          ? '0 4px 20px rgba(37,99,235,0.18)'
          : hov ? '0 4px 14px rgba(16,24,40,0.08)' : '0 1px 4px rgba(16,24,40,0.04)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
      }}
    >
      {/* Preview area */}
      <div style={{
        height: 100, background: previewBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: `1px solid ${C.border}`,
        position: 'relative',
      }}>
        {previewContent}
        {active && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            width: 22, height: 22, borderRadius: '50%',
            background: C.primary, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
          }}>
            <IconCheck />
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: active ? C.primary : C.label }}>{icon}</span>
          <span style={{
            fontSize: 13.5, fontWeight: 700,
            color: active ? C.primary : C.text,
            fontFamily: "'Sora','Manrope',sans-serif",
          }}>
            {label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 5, fontFamily: "'Inter',sans-serif", lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Mini mock-UI previews ─────────────────────────────────────────────────── */
function LightPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ width: 30, background: '#F9FAFB', borderRight: '1px solid #E5E7EB', padding: '5px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[C.primary, '#E5E7EB', '#E5E7EB'].map((bg, i) => <div key={i} style={{ height: 5, borderRadius: 2, background: bg }} />)}
      </div>
      <div style={{ flex: 1, background: '#F7F8FA', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ height: 6, width: '60%', background: '#D1D5DB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ marginTop: 4, height: 14, width: 40, background: C.primary, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function DarkPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #2A2540', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
      <div style={{ width: 30, background: '#16122A', borderRight: '1px solid #2A2540', padding: '5px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {['#6366F1', '#2A2540', '#2A2540'].map((bg, i) => <div key={i} style={{ height: 5, borderRadius: 2, background: bg }} />)}
      </div>
      <div style={{ flex: 1, background: '#1A1530', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ height: 6, width: '60%', background: '#3F3A5A', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#2A2540', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#2A2540', borderRadius: 3 }} />
        <div style={{ marginTop: 4, height: 14, width: 40, background: '#6366F1', borderRadius: 4 }} />
      </div>
    </div>
  );
}

function DefaultSidebarPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ width: 38, background: '#F9FAFB', borderRight: '1px solid #E5E7EB', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 5, background: C.primary, borderRadius: 2, marginBottom: 2 }} />
        {[C.primary + '33', '#E5E7EB', '#E5E7EB'].map((bg, i) => (
          <div key={i} style={{ height: 10, borderRadius: 4, background: bg, display: 'flex', alignItems: 'center', paddingLeft: 3 }}>
            <div style={{ width: 4, height: 4, borderRadius: 1, background: i === 0 ? C.primary : '#C4C9D4' }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: '#F7F8FA', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, width: '60%', background: '#D1D5DB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#E5E7EB', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function CompactSidebarPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid #E5E7EB', margin: '0 4px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ width: 28, background: '#F9FAFB', borderRight: '1px solid #E5E7EB', borderRadius: '10px 0 0 10px', padding: '5px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ width: 8, height: 5, background: C.primary, borderRadius: 2, marginBottom: 2 }} />
        {[C.primary + '33', '#E5E7EB', '#E5E7EB'].map((bg, i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 5, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 6, height: 6, borderRadius: 2, background: i === 0 ? C.primary : '#C4C9D4' }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: '#F7F8FA', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, width: '60%', background: '#D1D5DB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#E5E7EB', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function FloatingSidebarPreview() {
  return (
    <div style={{ display: 'flex', gap: 4, width: 130, height: 72, background: '#EFF1F7', borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', padding: '6px 4px 6px 0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ width: 32, background: '#F9FAFB', borderRadius: 8, padding: '5px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginLeft: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.10)', flexShrink: 0 }}>
        <div style={{ width: 8, height: 5, background: C.primary, borderRadius: 2, marginBottom: 2 }} />
        {[C.primary + '33', '#E5E7EB', '#E5E7EB'].map((bg, i) => (
          <div key={i} style={{ height: 10, width: '100%', borderRadius: 4, background: bg, display: 'flex', alignItems: 'center', paddingLeft: 2 }}>
            <div style={{ width: 4, height: 4, borderRadius: 1, background: i === 0 ? C.primary : '#C4C9D4' }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: '#F7F8FA', borderRadius: 6, padding: '6px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, width: '60%', background: '#D1D5DB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#E5E7EB', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function GlassSidebarPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', background: 'linear-gradient(135deg, #C7D2FE 0%, #E0F2FE 100%)' }}>
      <div style={{ width: 38, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(8px)', borderRight: '1px solid rgba(255,255,255,0.55)', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 5, background: C.primary, borderRadius: 2, marginBottom: 2 }} />
        {[C.primary + '33', 'rgba(229,231,235,0.7)', 'rgba(229,231,235,0.7)'].map((bg, i) => (
          <div key={i} style={{ height: 10, borderRadius: 4, background: bg, display: 'flex', alignItems: 'center', paddingLeft: 3 }}>
            <div style={{ width: 4, height: 4, borderRadius: 1, background: i === 0 ? C.primary : '#C4C9D4' }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: 'rgba(255,255,255,0.45)', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, width: '60%', background: 'rgba(209,213,219,0.8)', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: 'rgba(229,231,235,0.7)', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: 'rgba(229,231,235,0.7)', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function GradientSidebarPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #1E293B', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
      <div style={{ width: 38, background: 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 5, background: C.primary, borderRadius: 2, marginBottom: 2 }} />
        {[C.primary + '33', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.10)'].map((bg, i) => (
          <div key={i} style={{ height: 10, borderRadius: 4, background: bg, display: 'flex', alignItems: 'center', paddingLeft: 3 }}>
            <div style={{ width: 4, height: 4, borderRadius: 1, background: i === 0 ? C.primary : 'rgba(255,255,255,0.3)' }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: '#F7F8FA', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, width: '60%', background: '#D1D5DB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#E5E7EB', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function AccentSidebarPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ width: 38, background: '#F9FAFB', borderRight: '1px solid #E5E7EB', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 5, background: C.primary, borderRadius: 2, marginBottom: 2 }} />
        {[true, false, false].map((active, i) => (
          <div key={i} style={{ height: 10, borderRadius: 4, background: active ? C.primary + '14' : 'transparent', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
            {active && <div style={{ position: 'absolute', left: 0, top: 1, bottom: 1, width: 2, background: C.primary, borderRadius: 1 }} />}
            <div style={{ width: 4, height: 4, borderRadius: 1, background: active ? C.primary : '#C4C9D4', marginLeft: 4 }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: '#F7F8FA', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, width: '60%', background: '#D1D5DB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#E5E7EB', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function PillSidebarPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ width: 42, background: '#F9FAFB', borderRight: '1px solid #E5E7EB', padding: '5px 5px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 5, background: C.primary, borderRadius: 2, marginBottom: 2 }} />
        {[true, false, false].map((active, i) => (
          <div key={i} style={{ height: 10, borderRadius: 50, background: active ? C.primary : 'transparent', display: 'flex', alignItems: 'center', paddingLeft: 5 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: active ? '#fff' : '#C4C9D4' }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: '#F7F8FA', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, width: '60%', background: '#D1D5DB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#E5E7EB', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function WideSidebarPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ width: 50, background: '#F9FAFB', borderRight: '1px solid #E5E7EB', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 5, background: C.primary, borderRadius: 2, marginBottom: 2 }} />
        {[C.primary + '33', '#E5E7EB', '#E5E7EB'].map((bg, i) => (
          <div key={i} style={{ height: 10, borderRadius: 5, background: bg, display: 'flex', alignItems: 'center', paddingLeft: 3, gap: 2 }}>
            <div style={{ width: 4, height: 4, borderRadius: 1, background: i === 0 ? C.primary : '#C4C9D4', flexShrink: 0 }} />
            <div style={{ height: 3, width: i === 0 ? 18 : 12, background: i === 0 ? C.primary + '60' : '#E5E7EB', borderRadius: 2 }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: '#F7F8FA', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, width: '60%', background: '#D1D5DB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#E5E7EB', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function MinimalSidebarPreview() {
  return (
    <div style={{ display: 'flex', gap: 0, width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', background: '#F3F4F6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ width: 38, background: 'rgba(255,255,255,0.55)', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 5, background: C.primary, borderRadius: 2, marginBottom: 2, opacity: 0.8 }} />
        {[C.primary + '22', 'transparent', 'transparent'].map((bg, i) => (
          <div key={i} style={{ height: 10, borderRadius: 4, background: bg, display: 'flex', alignItems: 'center', paddingLeft: 3 }}>
            <div style={{ width: 4, height: 4, borderRadius: 1, background: i === 0 ? C.primary : '#D1D5DB' }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: 'rgba(255,255,255,0.4)', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, width: '60%', background: '#D1D5DB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '80%', background: '#E5E7EB', borderRadius: 3 }} />
        <div style={{ height: 4, width: '50%', background: '#E5E7EB', borderRadius: 3 }} />
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */
export default function ThemeOptionsPage() {
  const { mode, setMode, sidebarStyle, setSidebarStyle, primaryColor, setPrimaryColor, fontFamily, setFontFamily, sidebarAppearance, setSidebarAppearance, tableStyle, setTableStyle } = useTheme();
  const [layoutSaving, setLayoutSaving] = useState(false);
  const { user, refreshUser } = useAuth();
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  const [brandColor, setBrandColor]       = useState(primaryColor || '#2563EB');
  const [brandFont, setBrandFont]         = useState(fontFamily  || 'Inter');
  const [brandSidebar, setBrandSidebar]   = useState(sidebarAppearance || 'light');
  const [saving, setSaving]               = useState(false);

  // Keep local state in sync when ThemeContext changes (e.g. from BrandingSeeder on login)
  useEffect(() => { setBrandColor(primaryColor); }, [primaryColor]);
  useEffect(() => { setBrandFont(fontFamily); }, [fontFamily]);
  useEffect(() => { setBrandSidebar(sidebarAppearance); }, [sidebarAppearance]);

  // ── Auto-save brand theme to API whenever color/font/sidebar changes ─────
  const autoSaveRef = React.useRef(null);
  const autoSaveBrandTheme = (color, font, layout) => {
    if (!isAdmin) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.put('/branding', {
          primary_color: color,
          sidebar_style: layout,
          font_family:   font,
        });
        toast.success('Brand theme saved!');
        refreshUser().catch(() => {});
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to save brand theme.');
      } finally {
        setSaving(false);
      }
    }, 600);
  };

  const handleColorChange = (hex) => {
    setBrandColor(hex);
    setPrimaryColor(hex);
    autoSaveBrandTheme(hex, brandFont, sidebarStyle || 'default');
  };
  const handleFontChange = (font) => {
    setBrandFont(font);
    setFontFamily(font);
    autoSaveBrandTheme(brandColor, font, sidebarStyle || 'default');
  };
  const handleLayoutChange = (layout) => {
    setSidebarStyle(layout);
    if (!isAdmin) return;
    setLayoutSaving(true);
    api.put('/branding', {
      primary_color: brandColor,
      sidebar_style: layout,
      font_family:   brandFont,
    })
      .then(() => toast.success('Sidebar layout saved!'))
      .catch(err => toast.error(err.response?.data?.message || 'Failed to save layout.'))
      .finally(() => setLayoutSaving(false));
  };

  const activeCount = [
    mode === 'dark' ? 1 : 0,
    sidebarStyle && sidebarStyle !== 'default' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const actions = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 14px', borderRadius: 10,
      background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
      border: '1px solid #BFDBFE',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.primary }} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.primary, fontFamily: "'Inter',sans-serif" }}>
        {mode === 'dark' ? 'Dark Mode' : 'Light Mode'} · {((sidebarStyle || 'default').charAt(0).toUpperCase() + (sidebarStyle || 'default').slice(1))} Sidebar
      </span>
    </div>
  );

  return (
    <PageWrapper
      title="Theme Options"
      subtitle="Personalise how the app looks and feels on this device. Settings are saved locally."
      actions={actions}
    >
      {/* ── Appearance (Light / Dark) ── */}
      <SectionCard
        title="Appearance"
        subtitle="Choose a colour scheme. Your preference is saved per-device."
      >
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <AppearanceCard
            value="light"
            label="Light"
            description="Clean white interface, best for bright environments."
            icon={<IconSun />}
            active={mode === 'light'}
            onClick={() => setMode('light')}
            previewBg="linear-gradient(180deg, #F8F9FC 0%, #EFF1F7 100%)"
            previewContent={<LightPreview />}
          />
          <AppearanceCard
            value="dark"
            label="Dark"
            description="Dark violet theme, easy on the eyes at night."
            icon={<IconMoon />}
            active={mode === 'dark'}
            onClick={() => setMode('dark')}
            previewBg="linear-gradient(180deg, #1A1530 0%, #16122A 100%)"
            previewContent={<DarkPreview />}
          />
        </div>

        {/* Quick toggle strip */}
        <div style={{
          marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 14,
          padding: '10px 16px', borderRadius: 12,
          background: C.soft, border: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 13, color: C.label, fontFamily: "'Inter',sans-serif" }}>Quick switch:</span>
          <button
            onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 16px', borderRadius: 8,
              background: mode === 'dark' ? 'linear-gradient(135deg, #1D4ED8, #2563EB)' : 'linear-gradient(135deg, #16122A, #201C35)',
              color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 700, fontFamily: "'Inter',sans-serif",
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
          >
            {mode === 'dark' ? <><IconSun /> Switch to Light</> : <><IconMoon /> Switch to Dark</>}
          </button>
        </div>
      </SectionCard>

      {/* ── Sidebar Layout ── */}
      <SectionCard
        title="Sidebar Layout"
        subtitle="Choose how the sidebar looks. Pick from classic, floating, frosted glass, gradient, accent bar, pill, wide, or minimal."
      >
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <AppearanceCard
            value="default"
            label="Default"
            description="Full-width sidebar with icons and labels visible."
            icon={<IconLayout />}
            active={sidebarStyle === 'default'}
            onClick={() => handleLayoutChange('default')}
            previewBg="linear-gradient(180deg, #F8F9FC 0%, #F1F3F9 100%)"
            previewContent={<DefaultSidebarPreview />}
          />
          <AppearanceCard
            value="compact"
            label="Compact"
            description="Floating pill sidebar — icons only, hovers to reveal labels."
            icon={<IconLayout />}
            active={sidebarStyle === 'compact'}
            onClick={() => handleLayoutChange('compact')}
            previewBg="linear-gradient(180deg, #F8F9FC 0%, #F1F3F9 100%)"
            previewContent={<CompactSidebarPreview />}
          />
          <AppearanceCard
            value="floating"
            label="Floating"
            description="Detached, rounded sidebar that hovers above the background."
            icon={<IconLayout />}
            active={sidebarStyle === 'floating'}
            onClick={() => handleLayoutChange('floating')}
            previewBg="linear-gradient(180deg, #E8ECF4 0%, #DDE3EF 100%)"
            previewContent={<FloatingSidebarPreview />}
          />
          <AppearanceCard
            value="glass"
            label="Glass"
            description="Frosted glass sidebar with blur and transparency."
            icon={<IconLayout />}
            active={sidebarStyle === 'glass'}
            onClick={() => handleLayoutChange('glass')}
            previewBg="linear-gradient(135deg, #C7D2FE 0%, #BAE6FD 100%)"
            previewContent={<GlassSidebarPreview />}
          />
          <AppearanceCard
            value="gradient"
            label="Gradient"
            description="Dark navy gradient sidebar for a bold, professional look."
            icon={<IconLayout />}
            active={sidebarStyle === 'gradient'}
            onClick={() => handleLayoutChange('gradient')}
            previewBg="linear-gradient(180deg, #E2E8F0 0%, #CBD5E1 100%)"
            previewContent={<GradientSidebarPreview />}
          />
          <AppearanceCard
            value="accent"
            label="Accent"
            description="Active item highlighted with a coloured left bar indicator."
            icon={<IconLayout />}
            active={sidebarStyle === 'accent'}
            onClick={() => handleLayoutChange('accent')}
            previewBg="linear-gradient(180deg, #F8F9FC 0%, #F1F3F9 100%)"
            previewContent={<AccentSidebarPreview />}
          />
          <AppearanceCard
            value="pill"
            label="Pill"
            description="Active nav item shown as a full capsule/pill shape."
            icon={<IconLayout />}
            active={sidebarStyle === 'pill'}
            onClick={() => handleLayoutChange('pill')}
            previewBg="linear-gradient(180deg, #F8F9FC 0%, #F1F3F9 100%)"
            previewContent={<PillSidebarPreview />}
          />
          <AppearanceCard
            value="wide"
            label="Wide"
            description="Extra-wide sidebar with more breathing room for labels."
            icon={<IconLayout />}
            active={sidebarStyle === 'wide'}
            onClick={() => handleLayoutChange('wide')}
            previewBg="linear-gradient(180deg, #F8F9FC 0%, #F1F3F9 100%)"
            previewContent={<WideSidebarPreview />}
          />
          <AppearanceCard
            value="minimal"
            label="Minimal"
            description="Transparent, borderless sidebar that blends into the background."
            icon={<IconLayout />}
            active={sidebarStyle === 'minimal'}
            onClick={() => handleLayoutChange('minimal')}
            previewBg="linear-gradient(180deg, #F0F1F5 0%, #E8EAF0 100%)"
            previewContent={<MinimalSidebarPreview />}
          />
        </div>
      </SectionCard>

      {/* ── Table Style ── */}
      <SectionCard
        title="Table Style"
        subtitle="Choose how data tables look across all pages. Saved to this device."
      >
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            {
              value: 'default',
              label: 'Default',
              description: 'Zebra rows, soft gradient header, rounded card with shadow.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                  <div style={{ height: 16, background: 'linear-gradient(180deg,#F9FAFB 0%,#F3F4F6 100%)', borderBottom: '1.5px solid #E4E7EC', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 6 }}>
                    {['28%','30%','26%'].map((w,i) => <div key={i} style={{ height: 4, width: w, background: '#D1D5DB', borderRadius: 2 }} />)}
                  </div>
                  {[false, true, false, true].map((odd, i) => (
                    <div key={i} style={{ height: 14, background: odd ? '#FAFBFC' : '#fff', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 6 }}>
                      {['40%','30%','22%'].map((w,j) => <div key={j} style={{ height: 3, width: w, background: odd ? '#E5E7EB' : '#F3F4F6', borderRadius: 2 }} />)}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              value: 'minimal',
              label: 'Minimal',
              description: 'Clean flat rows with only thin dividers. No zebra.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #F2F4F7', background: '#fff' }}>
                  <div style={{ height: 16, background: '#fff', borderBottom: '2px solid #F0F2F5', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 6 }}>
                    {['28%','30%','26%'].map((w,i) => <div key={i} style={{ height: 3, width: w, background: '#C4C9D4', borderRadius: 2 }} />)}
                  </div>
                  {[0,1,2,3].map(i => (
                    <div key={i} style={{ height: 14, background: '#fff', borderBottom: '1px solid #F7F8FA', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 6 }}>
                      {['40%','30%','22%'].map((w,j) => <div key={j} style={{ height: 3, width: w, background: '#EAEDF1', borderRadius: 2 }} />)}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              value: 'bordered',
              label: 'Bordered',
              description: 'Full grid lines, dense layout, clear column spacing.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 6, overflow: 'hidden', border: '1.5px solid #D0D5DD' }}>
                  <div style={{ height: 16, background: '#F3F4F6', borderBottom: '2px solid #D0D5DD', display: 'flex', alignItems: 'center', padding: '0 0' }}>
                    {['42px','44px','44px'].map((w,i) => (
                      <div key={i} style={{ width: w, height: '100%', borderRight: i < 2 ? '1px solid #E4E7EC' : 'none', display: 'flex', alignItems: 'center', padding: '0 5px' }}>
                        <div style={{ height: 4, width: '70%', background: '#9CA3AF', borderRadius: 2 }} />
                      </div>
                    ))}
                  </div>
                  {[false, true, false, true].map((odd, i) => (
                    <div key={i} style={{ height: 14, background: odd ? '#F9FAFB' : '#fff', borderBottom: '1px solid #E4E7EC', display: 'flex', alignItems: 'center' }}>
                      {['42px','44px','44px'].map((w,j) => (
                        <div key={j} style={{ width: w, height: '100%', borderRight: j < 2 ? '1px solid #E4E7EC' : 'none', display: 'flex', alignItems: 'center', padding: '0 5px' }}>
                          <div style={{ height: 3, width: '60%', background: '#E5E7EB', borderRadius: 2 }} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              value: 'card',
              label: 'Card',
              description: 'Blue accent header, airy spacing, soft blue-tinted rows.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 14px rgba(16,24,40,0.10)' }}>
                  <div style={{ height: 16, background: 'linear-gradient(180deg,#EFF6FF 0%,#DBEAFE 100%)', borderBottom: '2px solid #BFDBFE', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                    {['28%','30%','26%'].map((w,i) => <div key={i} style={{ height: 4, width: w, background: '#93C5FD', borderRadius: 2 }} />)}
                  </div>
                  {[false, true, false, true].map((odd, i) => (
                    <div key={i} style={{ height: 14, background: odd ? '#F8FAFF' : '#fff', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                      {['40%','30%','22%'].map((w,j) => <div key={j} style={{ height: 3, width: w, background: odd ? '#DBEAFE' : '#EFF6FF', borderRadius: 2 }} />)}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              value: 'ink',
              label: 'Ink',
              description: 'Dark navy header with high-contrast column labels.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #1E2A3A', boxShadow: '0 4px 12px rgba(0,0,0,0.18)' }}>
                  <div style={{ height: 16, background: 'linear-gradient(180deg,#1E293B 0%,#0F172A 100%)', borderBottom: '2px solid #334155', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                    {['28%','30%','26%'].map((w,i) => <div key={i} style={{ height: 4, width: w, background: '#475569', borderRadius: 2 }} />)}
                  </div>
                  {[false, true, false, true].map((odd, i) => (
                    <div key={i} style={{ height: 14, background: odd ? '#F8FAFC' : '#fff', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                      {['40%','30%','22%'].map((w,j) => <div key={j} style={{ height: 3, width: w, background: odd ? '#E2E8F0' : '#F1F5F9', borderRadius: 2 }} />)}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              value: 'violet',
              label: 'Violet',
              description: 'Purple gradient header with soft lavender-tinted rows.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #EDE9FE', boxShadow: '0 2px 8px rgba(124,58,237,0.10)' }}>
                  <div style={{ height: 16, background: 'linear-gradient(180deg,#F5F3FF 0%,#EDE9FE 100%)', borderBottom: '2px solid #DDD6FE', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                    {['28%','30%','26%'].map((w,i) => <div key={i} style={{ height: 4, width: w, background: '#A78BFA', borderRadius: 2 }} />)}
                  </div>
                  {[false, true, false, true].map((odd, i) => (
                    <div key={i} style={{ height: 14, background: odd ? '#FDFCFF' : '#fff', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                      {['40%','30%','22%'].map((w,j) => <div key={j} style={{ height: 3, width: w, background: odd ? '#EDE9FE' : '#F5F3FF', borderRadius: 2 }} />)}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              value: 'forest',
              label: 'Forest',
              description: 'Emerald green header with fresh mint-tinted rows.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #D1FAE5', boxShadow: '0 2px 8px rgba(5,150,105,0.08)' }}>
                  <div style={{ height: 16, background: 'linear-gradient(180deg,#ECFDF5 0%,#D1FAE5 100%)', borderBottom: '2px solid #A7F3D0', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                    {['28%','30%','26%'].map((w,i) => <div key={i} style={{ height: 4, width: w, background: '#34D399', borderRadius: 2 }} />)}
                  </div>
                  {[false, true, false, true].map((odd, i) => (
                    <div key={i} style={{ height: 14, background: odd ? '#F6FEFA' : '#fff', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                      {['40%','30%','22%'].map((w,j) => <div key={j} style={{ height: 3, width: w, background: odd ? '#D1FAE5' : '#ECFDF5', borderRadius: 2 }} />)}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              value: 'sunset',
              label: 'Sunset',
              description: 'Warm amber header with golden-tinted alternating rows.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #FEF3C7', boxShadow: '0 2px 8px rgba(217,119,6,0.10)' }}>
                  <div style={{ height: 16, background: 'linear-gradient(180deg,#FFFBEB 0%,#FEF3C7 100%)', borderBottom: '2px solid #FDE68A', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                    {['28%','30%','26%'].map((w,i) => <div key={i} style={{ height: 4, width: w, background: '#FBBF24', borderRadius: 2 }} />)}
                  </div>
                  {[false, true, false, true].map((odd, i) => (
                    <div key={i} style={{ height: 14, background: odd ? '#FFFDF7' : '#fff', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                      {['40%','30%','22%'].map((w,j) => <div key={j} style={{ height: 3, width: w, background: odd ? '#FEF3C7' : '#FFFBEB', borderRadius: 2 }} />)}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              value: 'rose',
              label: 'Rose',
              description: 'Pink gradient header with soft blush-tinted rows.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #FCE7F3', boxShadow: '0 2px 8px rgba(219,39,119,0.08)' }}>
                  <div style={{ height: 16, background: 'linear-gradient(180deg,#FDF2F8 0%,#FCE7F3 100%)', borderBottom: '2px solid #FBCFE8', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                    {['28%','30%','26%'].map((w,i) => <div key={i} style={{ height: 4, width: w, background: '#F472B6', borderRadius: 2 }} />)}
                  </div>
                  {[false, true, false, true].map((odd, i) => (
                    <div key={i} style={{ height: 14, background: odd ? '#FFFAFD' : '#fff', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                      {['40%','30%','22%'].map((w,j) => <div key={j} style={{ height: 3, width: w, background: odd ? '#FCE7F3' : '#FDF2F8', borderRadius: 2 }} />)}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              value: 'arctic',
              label: 'Arctic',
              description: 'Icy sky-blue header with cool frosty row tints.',
              preview: (
                <div style={{ width: 130, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #E0F2FE', boxShadow: '0 2px 8px rgba(14,165,233,0.08)' }}>
                  <div style={{ height: 16, background: 'linear-gradient(180deg,#F0F9FF 0%,#E0F2FE 100%)', borderBottom: '2px solid #BAE6FD', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                    {['28%','30%','26%'].map((w,i) => <div key={i} style={{ height: 4, width: w, background: '#38BDF8', borderRadius: 2 }} />)}
                  </div>
                  {[false, true, false, true].map((odd, i) => (
                    <div key={i} style={{ height: 14, background: odd ? '#F7FBFF' : '#fff', display: 'flex', alignItems: 'center', padding: '0 7px', gap: 6 }}>
                      {['40%','30%','22%'].map((w,j) => <div key={j} style={{ height: 3, width: w, background: odd ? '#E0F2FE' : '#F0F9FF', borderRadius: 2 }} />)}
                    </div>
                  ))}
                </div>
              ),
            },
          ].map(({ value, label, description, preview }) => {
            const active = tableStyle === value;
            return (
              <AppearanceCard
                key={value}
                value={value}
                label={label}
                description={description}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>}
                active={active}
                onClick={() => setTableStyle(value)}
                previewBg="linear-gradient(180deg, #F8F9FC 0%, #F1F3F9 100%)"
                previewContent={preview}
              />
            );
          })}
        </div>
      </SectionCard>

      {/* ── Brand Theme (admins only) ── */}
      {isAdmin && (
        <SectionCard
          title="Brand Theme"
          subtitle="Set the accent colour, sidebar appearance, and font for all users of this salon."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 28 }}>

            {/* Primary colour */}
            <div>
              <div style={{
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: C.label, marginBottom: 10,
                fontFamily: "'Inter',sans-serif",
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <IconPalette /> Primary / Accent Color
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {PRESET_COLORS.map(({ hex, label }) => (
                  <button
                    key={hex}
                    title={label}
                    onClick={() => handleColorChange(hex)}
                    style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: hex, cursor: 'pointer',
                      border: brandColor === hex ? '3px solid #101828' : '2px solid transparent',
                      outline: brandColor === hex ? '2px solid #fff' : 'none',
                      outlineOffset: brandColor === hex ? -5 : 0,
                      transition: 'transform 0.1s, border-color 0.1s',
                      flexShrink: 0,
                    }}
                  />
                ))}
                <label title="Custom color" style={{
                  position: 'relative', width: 30, height: 30, borderRadius: 8,
                  border: `2px dashed ${C.inputBdr}`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden',
                  background: C.soft,
                }}>
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                  />
                  <span style={{ fontSize: 16, color: C.muted, pointerEvents: 'none' }}>+</span>
                </label>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', borderRadius: 8,
                background: C.soft, border: `1px solid ${C.border}`,
              }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: brandColor, border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontFamily: 'monospace', color: C.text, letterSpacing: '0.04em' }}>{brandColor}</span>
              </div>
            </div>

            {/* Sidebar appearance */}
            <div>
              <div style={{
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: C.label, marginBottom: 10,
                fontFamily: "'Inter',sans-serif",
              }}>
                Sidebar Appearance
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {['light', 'dark'].map((style) => {
                  const active = brandSidebar === style;
                  return (
                    <button
                      key={style}
                      onClick={() => handleSidebarChange(style)}
                      style={{
                        padding: '10px 22px', borderRadius: 10, cursor: 'pointer',
                        border: `2px solid ${active ? brandColor : C.inputBdr}`,
                        background: active ? `${brandColor}12` : '#fff',
                        color: active ? brandColor : C.label,
                        fontWeight: 700, fontSize: 13,
                        textTransform: 'capitalize',
                        fontFamily: "'Inter',sans-serif",
                        transition: 'all 0.15s',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        background: style === 'dark' ? '#101828' : '#F7F8FA',
                        border: `1.5px solid ${style === 'dark' ? '#334155' : '#D0D5DD'}`,
                      }} />
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                      {active && <span style={{ fontSize: 11, opacity: 0.6 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font family */}
            <div>
              <div style={{
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: C.label, marginBottom: 10,
                fontFamily: "'Inter',sans-serif",
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <IconType /> Font Family
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {FONT_OPTIONS.map((font) => {
                  const active = brandFont === font;
                  return (
                    <button
                      key={font}
                      onClick={() => handleFontChange(font)}
                      style={{
                        padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                        border: `1.5px solid ${active ? brandColor : C.inputBdr}`,
                        background: active ? `${brandColor}12` : '#fff',
                        color: active ? brandColor : C.label,
                        fontWeight: active ? 700 : 500, fontSize: 13,
                        fontFamily: `'${font}',sans-serif`,
                        transition: 'all 0.15s',
                      }}
                    >
                      {font}
                    </button>
                  );
                })}
              </div>
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 10,
                background: C.soft, border: `1px solid ${C.border}`,
                fontFamily: `'${brandFont}',sans-serif`,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>The quick brown fox</div>
                <div style={{ fontSize: 12, color: C.label, marginTop: 2 }}>Salon management made beautiful.</div>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div style={{ marginTop: 24 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: C.label, marginBottom: 10,
              fontFamily: "'Inter',sans-serif",
            }}>
              Live Preview
            </div>
            <div style={{
              display: 'flex', borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${C.border}`,
              boxShadow: '0 4px 16px rgba(16,24,40,0.08)',
              background: '#fff', maxWidth: 420,
              fontFamily: `'${brandFont}',sans-serif`,
            }}>
              <div style={{
                width: 90,
                background: brandSidebar === 'dark' ? '#101828' : '#F7F8FA',
                borderRight: `1px solid ${brandSidebar === 'dark' ? '#1E293B' : C.border}`,
                padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', color: brandColor, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Your Salon
                </div>
                {['Dashboard', 'Appointments', 'Clients'].map((item, i) => (
                  <div key={item} style={{
                    fontSize: 8.5, padding: '4px 7px', borderRadius: 5,
                    background: i === 0 ? `${brandColor}22` : 'transparent',
                    color: i === 0 ? brandColor : (brandSidebar === 'dark' ? '#94A3B8' : '#667085'),
                    fontWeight: i === 0 ? 700 : 500,
                  }}>
                    {item}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, padding: '14px' }}>
                <div style={{ height: 8, width: '55%', background: `linear-gradient(90deg, ${brandColor}, ${brandColor}88)`, borderRadius: 4, marginBottom: 8 }} />
                <div style={{ height: 5, width: '80%', background: '#F1F3F9', borderRadius: 3, marginBottom: 5 }} />
                <div style={{ height: 5, width: '60%', background: '#F1F3F9', borderRadius: 3, marginBottom: 14 }} />
                <div style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: 6, background: brandColor, color: '#fff', fontSize: 8, fontWeight: 700 }}>
                  Save Changes
                </div>
              </div>
            </div>
          </div>

          {/* Auto-save status */}
          {saving && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 14px', borderRadius: 8,
                background: `${brandColor}12`, border: `1px solid ${brandColor}40`,
                fontSize: 12.5, color: brandColor, fontWeight: 600,
                fontFamily: "'Inter',sans-serif",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.22-3.12"/>
                </svg>
                Saving…
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Info banner ── */}
      <div style={{
        padding: '14px 18px', borderRadius: 12,
        background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
        border: '1px solid #BFDBFE',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', fontFamily: "'Inter',sans-serif", marginBottom: 3 }}>
            Device preferences
          </div>
          <div style={{ fontSize: 12.5, color: '#3B82F6', fontFamily: "'Inter',sans-serif", lineHeight: 1.6 }}>
            Dark mode and sidebar layout are saved in your browser and apply only to this device.
            Brand colour, font, and sidebar appearance are saved to your account and apply to all users.
            To manage logos and brand name, go to{' '}
            <a href="/branding" style={{ color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>
              Branding Settings
            </a>.
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
