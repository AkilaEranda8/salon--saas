import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { getSurface } from './appThemeTokens';

export default function Modal({ open, onClose, title, children, width = 520 }) {
  const { isDark } = useTheme();
  const s = getSurface(isDark);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: s.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="app-modal-panel"
        style={{
          background: s.panel,
          borderRadius: 16,
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: s.shadow,
          border: `1px solid ${s.border}`,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: `1px solid ${s.border}`,
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: s.text }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 22, color: s.muted, lineHeight: 1, padding: '0 4px',
            }}
          >×</button>
        </div>

        <div style={{ padding: '1.5rem' }}>{children}</div>
      </div>
    </div>
  );
}
