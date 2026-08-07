/**
 * Shared Accounting UI primitives — matches Expenses / Commission page look
 * (StatCard-friendly panels, tinted badges, soft form shells — not plain white).
 */
import usePageTheme from '../../hooks/usePageTheme';

export const ACCT = {
  primary: '#2563EB',
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  purple: '#7C3AED',
  cyan: '#0891B2',
  slate: '#64748B',
};

const STATUS_TONE = {
  posted: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  open: { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
  closed: { bg: '#F1F5F9', fg: '#475467', border: '#E2E8F0' },
  voided: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
  void: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
  paid: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  settled: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  pending: { bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A' },
  deposit: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  withdrawal: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
  expense: { bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA' },
  float_in: { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
  float_out: { bg: '#F5F3FF', fg: '#6D28D9', border: '#DDD6FE' },
};

export function toneFor(key) {
  const k = String(key || '').toLowerCase();
  return STATUS_TONE[k] || { bg: '#F8FAFC', fg: '#475467', border: '#E2E8F0' };
}

export function StatusPill({ status, children }) {
  const t = toneFor(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
      background: t.bg, color: t.fg, border: `1px solid ${t.border}`, whiteSpace: 'nowrap',
    }}>
      {children || String(status || '—').replace(/_/g, ' ')}
    </span>
  );
}

export function SoftPanel({ children, accent = ACCT.primary, title, subtitle, style, bodyStyle }) {
  const { C } = usePageTheme();
  return (
    <div style={{
      background: C.cardBg,
      borderRadius: 14,
      border: `1px solid ${C.border}`,
      boxShadow: C.shadow,
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        height: 4,
        background: `linear-gradient(90deg, ${accent} 0%, ${accent}55 70%, transparent 100%)`,
      }} />
      {(title || subtitle) && (
        <div style={{
          padding: '12px 16px 0',
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
        }}>
          <div>
            {title && (
              <h4 style={{
                margin: 0, fontSize: 14, fontWeight: 700, color: C.label,
                fontFamily: "'Inter',sans-serif",
              }}>{title}</h4>
            )}
            {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
      )}
      <div style={{ padding: 16, ...bodyStyle }}>{children}</div>
    </div>
  );
}

export function FormShell({ children, title, accent = ACCT.primary, style }) {
  const { C } = usePageTheme();
  return (
    <div style={{
      background: C.isDark
        ? 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)'
        : 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 55%, #F5F3FF 100%)',
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 16,
      boxShadow: C.shadow,
      marginBottom: 16,
      ...style,
    }}>
      {title && (
        <div style={{
          fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: accent, marginBottom: 12,
        }}>{title}</div>
      )}
      {children}
    </div>
  );
}

export function ListShell({ children, empty, emptySub }) {
  const { C } = usePageTheme();
  const hasKids = Array.isArray(children) ? children.filter(Boolean).length > 0 : !!children;
  return (
    <div style={{
      background: C.cardBg,
      borderRadius: 14,
      border: `1px solid ${C.border}`,
      boxShadow: C.shadow,
      overflow: 'hidden',
    }}>
      {hasKids ? children : (
        <div style={{ padding: '28px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{empty || 'Nothing here yet'}</div>
          {emptySub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{emptySub}</div>}
        </div>
      )}
    </div>
  );
}

export function ListRow({ children, onClick }) {
  const { C } = usePageTheme();
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: `1px solid ${C.rowBorder || C.border}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      background: C.cardBg,
      cursor: onClick ? 'pointer' : 'default',
    }}
      onClick={onClick}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = C.isDark ? '#172033' : '#EEF4FF'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.cardBg; }}
    >
      {children}
    </div>
  );
}

export function SegmentTabs({ tabs, value, onChange }) {
  const { C } = usePageTheme();
  return (
    <div style={{
      display: 'inline-flex', flexWrap: 'wrap', gap: 6, marginBottom: 14,
      padding: 4, borderRadius: 12,
      background: C.isDark ? '#0F172A' : '#F1F5F9',
      border: `1px solid ${C.border}`,
    }}>
      {tabs.map((t) => {
        const on = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              padding: '7px 14px',
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 12,
              background: on
                ? `linear-gradient(135deg, ${t.color || ACCT.primary} 0%, ${t.color || ACCT.primary}CC 100%)`
                : 'transparent',
              color: on ? '#fff' : C.muted,
              boxShadow: on ? `0 4px 12px ${(t.color || ACCT.primary)}40` : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function ReportTable({ headers, rows, alignRightFrom = -1 }) {
  const { C } = usePageTheme();
  return (
    <div style={{
      overflowX: 'auto',
      background: C.cardBg,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      marginBottom: 16,
      boxShadow: C.shadow,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
        <thead>
          <tr style={{ background: C.headerGrad }}>
            {headers.map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: alignRightFrom >= 0 && i >= alignRightFrom ? 'right' : 'left',
                  padding: '11px 14px',
                  borderBottom: `1.5px solid ${C.border}`,
                  color: C.label,
                  fontWeight: 700,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.cardBg : (C.isDark ? '#172033' : '#FAFBFC') }}>
              {r.map((c, j) => (
                <td
                  key={j}
                  style={{
                    padding: '11px 14px',
                    borderBottom: `1px solid ${C.rowBorder || C.border}`,
                    color: C.text,
                    textAlign: alignRightFrom >= 0 && j >= alignRightFrom ? 'right' : 'left',
                    fontWeight: alignRightFrom >= 0 && j >= alignRightFrom ? 600 : 400,
                  }}
                >{c}</td>
              ))}
            </tr>
          ))}
          {!rows?.length && (
            <tr>
              <td colSpan={headers.length} style={{ padding: 20, color: C.muted, textAlign: 'center' }}>No rows</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function SectionTitle({ children, color = ACCT.primary }) {
  const { C } = usePageTheme();
  return (
    <h3 style={{
      margin: '0 0 10px',
      fontSize: 14,
      fontWeight: 800,
      color: C.text,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: 99, background: color, display: 'inline-block',
        boxShadow: `0 0 0 3px ${color}22`,
      }} />
      {children}
    </h3>
  );
}

export function inputStyle(C) {
  return {
    padding: '8px 12px',
    borderRadius: 10,
    border: `1.5px solid ${C.inputBorder || C.border}`,
    background: C.inputBg || (C.isDark ? '#0F172A' : '#fff'),
    color: C.text,
    fontSize: 13,
    outline: 'none',
    minWidth: 0,
  };
}

export function TypeChip({ type, map }) {
  const colors = map || {};
  const [bg, fg] = colors[type] || ['#F2F4F7', '#475467'];
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, background: bg, color: fg, textTransform: 'capitalize',
    }}>
      {String(type || '').replace(/_/g, ' ')}
    </span>
  );
}
