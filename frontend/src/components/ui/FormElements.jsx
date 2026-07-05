import { useState } from 'react';

/* ─── Shared base styles ─────────────────────────────────────────────── */

const BASE = {
  border:      '1.5px solid var(--app-input-border, #D0D5DD)',
  borderRadius: 10,
  padding:     '9px 13px',
  fontSize:    14,
  color:       'var(--app-text, #101828)',
  outline:     'none',
  fontFamily:  "'Inter', sans-serif",
  background:  'var(--app-input-bg, #fff)',
  width:       '100%',
  boxSizing:   'border-box',
  transition:  'border-color 0.15s, box-shadow 0.15s',
  lineHeight:  1.5,
};

const FOCUS = {
  borderColor: 'var(--app-accent, #2563EB)',
  boxShadow:   '0 0 0 4px var(--app-accent-soft, rgba(37,99,235,0.12))',
};

const DISABLED = {
  background: 'var(--app-surface-soft, #F9FAFB)',
  cursor:     'not-allowed',
  color:      'var(--app-text-muted, #98A2B3)',
};

function useInputFocus() {
  const [focused, setFocused] = useState(false);
  return { focused, onFocus: () => setFocused(true), onBlur: () => setFocused(false) };
}

/* ─── Input ──────────────────────────────────────────────────────────── */

export function Input({ error, disabled, style: extra, onFocus, onBlur, ...props }) {
  const f = useInputFocus();
  return (
    <input
      {...props}
      disabled={disabled}
      onFocus={e => { f.onFocus(); onFocus?.(e); }}
      onBlur={e  => { f.onBlur();  onBlur?.(e);  }}
      style={{
        ...BASE,
        ...(f.focused && !disabled ? FOCUS    : {}),
        ...(disabled               ? DISABLED : {}),
        ...(error                  ? { borderColor: '#DC2626' } : {}),
        ...extra,
      }}
    />
  );
}

/* ─── Select ─────────────────────────────────────────────────────────── */

export function Select({ error, disabled, children, style: extra, onFocus, onBlur, ...props }) {
  const f = useInputFocus();
  return (
    <select
      {...props}
      disabled={disabled}
      onFocus={e => { f.onFocus(); onFocus?.(e); }}
      onBlur={e  => { f.onBlur();  onBlur?.(e);  }}
      style={{
        ...BASE,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...(f.focused && !disabled ? FOCUS    : {}),
        ...(disabled               ? DISABLED : {}),
        ...(error                  ? { borderColor: '#DC2626' } : {}),
        ...extra,
      }}
    >
      {children}
    </select>
  );
}

/* ─── Textarea ───────────────────────────────────────────────────────── */

export function Textarea({ error, disabled, rows = 3, style: extra, onFocus, onBlur, ...props }) {
  const f = useInputFocus();
  return (
    <textarea
      {...props}
      rows={rows}
      disabled={disabled}
      onFocus={e => { f.onFocus(); onFocus?.(e); }}
      onBlur={e  => { f.onBlur();  onBlur?.(e);  }}
      style={{
        ...BASE,
        resize:    'vertical',
        minHeight: 80,
        ...(f.focused && !disabled ? FOCUS    : {}),
        ...(disabled               ? DISABLED : {}),
        ...(error                  ? { borderColor: '#DC2626' } : {}),
        ...extra,
      }}
    />
  );
}

/* ─── Label ──────────────────────────────────────────────────────────── */

export function Label({ children, required, htmlFor }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display:       'block',
        fontSize:      12,
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color:         'var(--app-text-secondary, #344054)',
        marginBottom:  6,
        fontFamily:    "'Inter', sans-serif",
      }}
    >
      {children}
      {required && <span style={{ color: '#DC2626', marginLeft: 3 }}>*</span>}
    </label>
  );
}

/* ─── FormGroup ──────────────────────────────────────────────────────── */

export function FormGroup({ label, required, htmlFor, helper, error, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>{label}</Label>
      )}
      {children}
      {helper && !error && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--app-text-muted, #98A2B3)', fontFamily: "'Inter', sans-serif" }}>
          {helper}
        </p>
      )}
      {error && (
        <p style={{ margin: 0, fontSize: 12, color: '#DC2626', fontFamily: "'Inter', sans-serif" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/* ─── Toggle ─────────────────────────────────────────────────────────── */

export function Toggle({ checked, onChange, disabled, label }) {
  const [hov, setHov] = useState(false);

  return (
    <label style={{
      display:    'inline-flex',
      alignItems: 'center',
      gap:        8,
      cursor:     disabled ? 'not-allowed' : 'pointer',
      userSelect: 'none',
    }}>
      <span
        style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
      >
        {/* Hidden native checkbox for a11y */}
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        />
        {/* Track */}
        <span style={{
          display:    'block',
          width:      44,
          height:     24,
          borderRadius: 9999,
          background: checked ? '#2563EB' : '#D0D5DD',
          transition: 'background 0.2s',
          boxShadow:  hov && !disabled ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
          opacity:    disabled ? 0.5 : 1,
        }} />
        {/* Thumb */}
        <span style={{
          position:     'absolute',
          top:          2,
          left:         checked ? 22 : 2,
          width:        20,
          height:       20,
          borderRadius: '50%',
          background:   '#fff',
          boxShadow:    '0 1px 3px rgba(0,0,0,.25)',
          transition:   'left 0.2s',
        }} />
      </span>

      {label && (
        <span style={{ fontSize: 14, color: 'var(--app-text-secondary, #344054)', fontFamily: "'Inter', sans-serif" }}>
          {label}
        </span>
      )}
    </label>
  );
}

/* ─── SearchInput ────────────────────────────────────────────────────── */

export function SearchInput({ value, onChange, onClear, placeholder = 'Search...', style: extra }) {
  const f = useInputFocus();

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '100%' }}>
      {/* Magnifier icon */}
      <span style={{
        position:       'absolute',
        left:           11,
        top:            '50%',
        transform:      'translateY(-50%)',
        color:          '#98A2B3',
        pointerEvents:  'none',
        display:        'flex',
        alignItems:     'center',
      }}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="10" y1="10" x2="13.5" y2="13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>

      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        style={{
          ...BASE,
          paddingLeft:  34,
          paddingRight: value ? 34 : 13,
          ...(f.focused ? FOCUS : {}),
          ...extra,
        }}
      />

      {/* Clear button */}
      {value && (
        <button
          type="button"
          onClick={onClear}
          style={{
            position:   'absolute',
            right:      8,
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            padding:    4,
                  color:      'var(--app-text-muted, #98A2B3)',
            fontSize:   14,
            lineHeight: 1,
            display:    'flex',
            alignItems: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#475467'}
          onMouseLeave={e => e.currentTarget.style.color = '#98A2B3'}
        >
          ✕
        </button>
      )}
    </div>
  );
}
