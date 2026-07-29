import { useMemo, useState } from 'react';

const ACCENT = '#2563EB';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function pad(n) { return String(n).padStart(2, '0'); }
function toKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function todayKey() {
  const n = new Date();
  return toKey(n.getFullYear(), n.getMonth(), n.getDate());
}
function buildMonthGrid(y, m) {
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}
function addDaysKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function defaultRecurringNextDate(baseDate) {
  return addDaysKey(baseDate || todayKey(), 7);
}

export default function RecurringDateCalendar({
  value,
  onChange,
  minDate,
  label = 'Next visit date',
}) {
  const selected = value || defaultRecurringNextDate();
  const min = minDate || todayKey();
  const initial = selected.split('-').map(Number);
  const [viewY, setViewY] = useState(initial[0]);
  const [viewM, setViewM] = useState(initial[1] - 1);

  const cells = useMemo(() => buildMonthGrid(viewY, viewM), [viewY, viewM]);

  const prev = () => {
    if (viewM === 0) { setViewY((y) => y - 1); setViewM(11); }
    else setViewM((m) => m - 1);
  };
  const next = () => {
    if (viewM === 11) { setViewY((y) => y + 1); setViewM(0); }
    else setViewM((m) => m + 1);
  };

  const navBtn = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid #E4E7EC',
    background: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1,
  };

  return (
    <div style={{
      marginTop: 10, padding: 12, borderRadius: 12,
      border: '1px solid var(--app-border, #EAECF0)',
      background: 'var(--app-panel, #fff)',
      fontFamily: "'Inter',sans-serif",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--app-text-muted, #667085)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" onClick={prev} style={navBtn}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--app-title, #101828)' }}>
          {MONTHS[viewM]} {viewY}
        </div>
        <button type="button" onClick={next} style={navBtn}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DOW.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#98A2B3', padding: 4 }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const key = toKey(viewY, viewM, day);
          const disabled = key < min;
          const isSelected = key === selected;
          const isToday = key === todayKey();
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(key)}
              style={{
                height: 34, borderRadius: 8,
                border: isSelected ? `2px solid ${ACCENT}` : isToday ? `1px solid ${ACCENT}` : '1px solid transparent',
                background: isSelected ? '#EFF6FF' : disabled ? 'transparent' : 'var(--app-surface-soft, #FAFBFC)',
                color: disabled ? '#D0D5DD' : isSelected ? ACCENT : 'var(--app-text, #101828)',
                fontWeight: isSelected || isToday ? 700 : 500,
                fontSize: 13,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--app-text-secondary, #475467)', marginTop: 8 }}>
        Selected: <strong>{selected}</strong>
        <div style={{ marginTop: 4, color: '#667085' }}>SMS will be sent on this selected day.</div>
      </div>
    </div>
  );
}
