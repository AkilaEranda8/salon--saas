import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }    from '../context/AuthContext';
import api            from '../api/axios';
import { useToast }   from '../components/ui/Toast';
import { Select }     from '../components/ui/FormElements';
import usePageTheme   from '../hooks/usePageTheme';

/* ── design tokens ──────────────────────────────────── */
const ACCENT  = '#6D28D9';        // purple – today / active
const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const HOURS  = Array.from({ length: 15 }, (_, i) => i + 7);  // 7 am → 9 pm
const HOUR_H = 72;  // px per hour

const STATUS_COLOR = {
  pending:   { bg:'#FEF9EC', text:'#92400E',  dot:'#F59E0B', accent:'#F59E0B' },
  confirmed: { bg:'#EFF6FF', text:'#1E40AF',  dot:'#3B82F6', accent:'#3B82F6' },
  completed: { bg:'#F0FDF4', text:'#065F46',  dot:'#10B981', accent:'#10B981' },
  cancelled: { bg:'#FFF1F2', text:'#991B1B',  dot:'#EF4444', accent:'#EF4444' },
};

const CARD_PAL = [
  { accent:'#FB923C', bg:'#FFFBF7', text:'#7C2D12' },
  { accent:'#8B5CF6', bg:'#F9F7FF', text:'#3B1FA8' },
  { accent:'#3B82F6', bg:'#F5F9FF', text:'#1E3A8A' },
  { accent:'#10B981', bg:'#F2FDF8', text:'#064E3B' },
  { accent:'#EC4899', bg:'#FFF5FA', text:'#831843' },
  { accent:'#F59E0B', bg:'#FEFCE8', text:'#78350F' },
];

/** Same hues lifted for dark surfaces — tinted panels instead of near-white fills. */
const CARD_PAL_DARK = [
  { accent:'#FB923C', bg:'rgba(251,146,60,0.16)', text:'#FED7AA' },
  { accent:'#A78BFA', bg:'rgba(167,139,250,0.16)', text:'#DDD6FE' },
  { accent:'#60A5FA', bg:'rgba(96,165,250,0.16)', text:'#BFDBFE' },
  { accent:'#34D399', bg:'rgba(52,211,153,0.16)', text:'#A7F3D0' },
  { accent:'#F472B6', bg:'rgba(244,114,182,0.16)', text:'#FBCFE8' },
  { accent:'#FBBF24', bg:'rgba(251,191,36,0.16)', text:'#FDE68A' },
];

function cardPalette(isDark) {
  return isDark ? CARD_PAL_DARK : CARD_PAL;
}

/* ── helpers ────────────────────────────────────────── */
function pad(n)       { return String(n).padStart(2, '0'); }
function dateKey(d)   { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function sameDay(a,b) { return a.toDateString() === b.toDateString(); }

function getWeekDates(anchor) {
  const d = new Date(anchor);
  d.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => { const n = new Date(d); n.setDate(d.getDate()+i); return n; });
}

function buildMonthGrid(y, m) {
  const first = new Date(y, m, 1).getDay();
  const days  = new Date(y, m+1, 0).getDate();
  return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i+1)];
}

function fmtHour(h) {
  if (h === 0)  return '12:00 am';
  if (h === 12) return '12:00 pm';
  return h < 12 ? `${pad(h)}:00 am` : `${pad(h-12)}:00 pm`;
}

function fmtTime12(t) {
  if (!t) return '';
  const [hh, mm] = t.split(':').map(Number);
  const ampm = hh < 12 ? 'am' : 'pm';
  const h    = hh === 0 ? 12 : hh > 12 ? hh-12 : hh;
  return `${pad(h)}:${pad(mm||0)} ${ampm}`;
}

function timeToMin(t) {
  if (!t) return 9*60;
  const [h, m] = t.split(':').map(Number);
  return h*60 + (m||0);
}

function timeTopPx(t) {
  return Math.max(0, (timeToMin(t) - HOURS[0]*60) / 60 * HOUR_H);
}

function endTime(t, dur) {
  const m = timeToMin(t) + (dur || 60);
  return `${pad(Math.floor(m/60))}:${pad(m%60)}`;
}

function custName(a)  {
  return a.customer_name ||
    (a.customer ? `${a.customer.first_name||''} ${a.customer.last_name||''}`.trim() : '') ||
    '';
}
function staffName(a) {
  return (a.staff ? `${a.staff.first_name||''} ${a.staff.last_name||''}`.trim() : '') || a.staff?.name || '';
}
function apptTime(a)  { return a.time || a.appointment_time || ''; }
function salonNowMinutes() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  let hour = String(get('hour') || '00');
  if (hour === '24') hour = '00';
  return (Number(hour) || 0) * 60 + (Number(get('minute')) || 0);
}

function salonTodayKey() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Block length on the grid = sum of linked services, else primary, else 60. */
function apptDur(a) {
  const linked = Array.isArray(a?.services) ? a.services : [];
  if (linked.length) {
    const sum = linked.reduce((acc, s) => acc + (Number(s?.duration_minutes) || 0), 0);
    if (sum > 0) return sum;
  }
  const primary = Number(a?.service?.duration_minutes);
  if (Number.isFinite(primary) && primary > 0) return primary;
  const explicit = Number(a?.duration_minutes ?? a?.duration);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return 60;
}

/* ── EventCard ──────────────────────────────────────── */
function EventCard({ appt, colorIdx, heightPx, navigate }) {
  const [tab, setTab]  = useState('desc');
  const { isDark } = usePageTheme();
  const pal   = cardPalette(isDark);
  const col   = pal[colorIdx % pal.length];
  const titleColor  = isDark ? '#F8FAFC' : '#111827';
  const timeColor   = isDark ? '#94A3B8' : '#6B7280';
  const bodyColor   = isDark ? '#CBD5E1' : '#4B5563';
  const nameColor   = isDark ? '#E2E8F0' : '#374151';
  const idleTab     = isDark ? '#64748B' : '#9CA3AF';
  const divider     = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const restShadow  = isDark ? '0 1px 3px rgba(2,6,23,0.45)' : '0 1px 3px rgba(0,0,0,0.06)';
  const hoverShadow = isDark ? '0 4px 14px rgba(2,6,23,0.6)' : '0 3px 10px rgba(0,0,0,0.1)';
  const cName = custName(appt);
  const sName = staffName(appt);
  const t     = apptTime(appt);
  const dur   = apptDur(appt);
  const endT  = endTime(t, dur);
  const showTabs   = heightPx >= 96;
  const showDetail = heightPx >= 112;
  const showFoot   = heightPx >= 162;

  return (
    <div
      onClick={() => navigate(`/appointments/${appt.id}`)}
      style={{
        background: col.bg,
        borderLeft: `3px solid ${col.accent}`,
        borderRadius: '0 8px 8px 0',
        padding: '6px 9px',
        overflow: 'hidden',
        cursor: 'pointer',
        boxSizing: 'border-box',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        boxShadow: restShadow,
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow=hoverShadow}
      onMouseLeave={e => e.currentTarget.style.boxShadow=restShadow}
    >
      {/* colored dot + title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.accent, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: titleColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {appt.service?.name || 'Appointment'}
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: timeColor, paddingLeft: 11 }}>
        {fmtTime12(t)} – {fmtTime12(endT)}
      </div>

      {showTabs && (
        <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${divider}`, paddingBottom: 3, marginBottom: 1, paddingLeft: 11 }}>
          {['Desc', 'People'].map(tb => (
            <button
              key={tb}
              onClick={e => { e.stopPropagation(); setTab(tb.toLowerCase()); }}
              style={{
                background: tab === tb.toLowerCase() ? col.accent+'2E' : 'none',
                border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 700,
                color: tab === tb.toLowerCase() ? col.accent : idleTab,
                padding: '2px 7px', borderRadius: 6,
              }}
            >{tb}</button>
          ))}
        </div>
      )}

      {showDetail && tab === 'desc' && (
        <div style={{ fontSize: 11, color: bodyColor, lineHeight: 1.5, flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', paddingLeft: 11 }}>
          {appt.notes || `${appt.service?.name || 'Service'} appointment${sName ? ` with ${sName}` : ''}.`}
        </div>
      )}

      {showDetail && tab === 'people' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflow: 'hidden', paddingLeft: 4 }}>
          {cName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <div style={{ width: 20, height: 20, minWidth: 20, borderRadius: '50%', background: col.accent+(isDark?'33':'20'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: col.accent }}>
                {cName[0]?.toUpperCase() || '?'}
              </div>
              <span style={{ flex: 1, color: nameColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{cName}</span>
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700, flexShrink: 0,
                background: appt.status === 'cancelled'
                  ? (isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2')
                  : (isDark ? 'rgba(16,185,129,0.2)' : '#DCFCE7'),
                color: appt.status === 'cancelled'
                  ? (isDark ? '#FCA5A5' : '#B91C1C')
                  : (isDark ? '#6EE7B7' : '#15803D'),
              }}>
                {appt.status === 'cancelled' ? 'Rejected' : 'Accepted'}
              </span>
            </div>
          )}
          {sName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <div style={{ width: 20, height: 20, minWidth: 20, borderRadius: '50%', background: isDark ? 'rgba(56,189,248,0.2)' : '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: isDark ? '#7DD3FC' : '#0369A1' }}>
                {sName[0]?.toUpperCase() || '?'}
              </div>
              <span style={{ flex: 1, color: nameColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{sName}</span>
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: isDark ? 'rgba(59,130,246,0.2)' : '#EFF6FF', color: isDark ? '#93C5FD' : '#1D4ED8', fontWeight: 700, flexShrink: 0 }}>Staff</span>
            </div>
          )}
        </div>
      )}

      {showFoot && (
        <div style={{ marginTop: 'auto', paddingLeft: 11 }}>
          {appt.branch?.name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: idleTab, marginBottom: 5 }}>
              <span style={{ fontSize: 11 }}>📍</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: timeColor }}>{appt.branch.name}</span>
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); navigate(`/appointments/${appt.id}`); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: col.accent+(isDark?'2E':'15'), border: `1px solid ${col.accent}${isDark?'55':'30'}`, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: col.accent }}
          >🗓 View</button>
        </div>
      )}
    </div>
  );
}

/* ── MonthView ──────────────────────────────────────── */
function MonthView({ year, month, calData, todayDate, anchor, setAnchor, setViewMode }) {
  const { isDark } = usePageTheme();
  const shellBg = isDark ? '#1E293B' : '#fff';
  const shellBorder = isDark ? '#334155' : '#E5E7EB';
  const headBg = isDark ? '#0F172A' : '#FAFAFA';
  const cellBg = isDark ? '#1E293B' : '#fff';
  const cellBgEmpty = isDark ? '#0F172A' : '#FAFAFA';
  const cellBgWkd = isDark ? '#172033' : '#FAFAFA';
  const cellBgSel = isDark ? 'rgba(109,40,217,0.15)' : '#F5F3FF';
  const cellBgTod = isDark ? 'rgba(109,40,217,0.08)' : '#FDFCFF';
  const lineColor = isDark ? '#334155' : '#F3F4F6';
  const dayText = isDark ? '#E2E8F0' : '#111827';
  const cells    = buildMonthGrid(year, month);
  const todayKey = salonTodayKey();
  const DOW_H    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <div style={{ background: shellBg, borderRadius: 16, border: `1px solid ${shellBorder}`, overflow: 'hidden', boxShadow: isDark ? '0 4px 16px rgba(2,6,23,0.35)' : '0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* DOW header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: headBg, borderBottom: `1px solid ${shellBorder}` }}>
        {DOW_H.map((d, i) => (
          <div key={d} style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, fontWeight: 700, color: i===0||i===6 ? '#EF4444' : '#9CA3AF', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} style={{ minHeight: 100, borderRight: `1px solid ${lineColor}`, borderBottom: `1px solid ${lineColor}`, background: cellBgEmpty }} />;
          const d     = new Date(year, month, day);
          const k     = dateKey(d);
          const dow   = d.getDay();
          const appts = calData[k] || [];
          const isTod = k === todayKey;
          const isSel = sameDay(d, anchor);
          const isWkd = dow === 0 || dow === 6;
          return (
            <div
              key={day}
              onClick={() => { setAnchor(d); setViewMode('day'); }}
              style={{
                minHeight: 100, padding: '8px 8px 6px', boxSizing: 'border-box',
                borderRight: `1px solid ${lineColor}`, borderBottom: `1px solid ${lineColor}`,
                cursor: 'pointer',
                background: isSel ? cellBgSel : isTod ? cellBgTod : isWkd ? cellBgWkd : cellBg,
                transition: 'background .12s',
              }}
              onMouseEnter={e => { if (!isSel && !isTod) e.currentTarget.style.background = isDark ? '#243044' : '#F5F5F5'; }}
              onMouseLeave={e => e.currentTarget.style.background = isSel ? cellBgSel : isTod ? cellBgTod : isWkd ? cellBgWkd : cellBg}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
                background: isTod ? ACCENT : 'transparent',
                fontSize: 13, fontWeight: isTod || isSel ? 700 : 400,
                color: isTod ? '#fff' : isSel ? ACCENT : isWkd ? '#EF4444' : dayText,
              }}>{day}</div>
              {appts.slice(0, 3).map((a, ai) => {
                const pal = cardPalette(isDark);
                const cpx = pal[ai % pal.length];
                return (
                  <div key={a.id||ai} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: cpx.bg, borderLeft: `2.5px solid ${cpx.accent}`, marginBottom: 2, overflow: 'hidden' }}>
                    <span style={{ color: isDark ? '#94A3B8' : '#6B7280', flexShrink: 0 }}>{apptTime(a).slice(0,5)}</span>
                    <span style={{ color: isDark ? '#E2E8F0' : '#374151', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.service?.name || 'Appt'}</span>
                  </div>
                );
              })}
              {appts.length > 3 && (
                <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, padding: '1px 6px' }}>+{appts.length-3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── CalendarPage ───────────────────────────────────── */
export default function CalendarPage() {
  const { isDark } = usePageTheme();
  const shellBg = isDark ? '#1E293B' : '#fff';
  const shellBorder = isDark ? '#334155' : '#E5E7EB';
  const gridLine = isDark ? '#334155' : '#F1F5F9';
  const gridLineDash = isDark ? '#243044' : '#F8FAFC';
  const btnStyle = {
    padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${shellBorder}`,
    background: isDark ? '#0F172A' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
    color: isDark ? '#E2E8F0' : '#374151', whiteSpace: 'nowrap',
  };
  const navBtnStyle = {
    width: 30, height: 30, border: `1.5px solid ${shellBorder}`, background: isDark ? '#0F172A' : '#fff',
    cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: isDark ? '#E2E8F0' : '#374151',
  };
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const { toast } = useToast();
  const isAdmin   = ['superadmin','admin'].includes(user?.role);
  const todayDate = new Date();
  const todayKey = salonTodayKey();

  const [viewMode, setViewMode] = useState('week');
  const [anchor,   setAnchor]   = useState(new Date());
  const [calData,  setCalData]  = useState({});
  const [loading,  setLoading]  = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [nowMin,   setNowMin]   = useState(() => salonNowMinutes());

  useEffect(() => {
    const t = setInterval(() => setNowMin(salonNowMinutes()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (isAdmin) api.get('/branches').then(r => setBranches(r.data || [])).catch(() => {});
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const months = new Set();
      months.add(`${anchor.getFullYear()}-${anchor.getMonth()+1}`);
      if (viewMode === 'week') {
        getWeekDates(anchor).forEach(d => months.add(`${d.getFullYear()}-${d.getMonth()+1}`));
      }
      const results = await Promise.all([...months].map(ym => {
        const [y, m] = ym.split('-');
        const p = new URLSearchParams({ year: y, month: m });
        if (branchId) p.set('branchId', branchId);
        return api.get(`/appointments/calendar?${p}`).then(r => r.data || {});
      }));
      const merged = {};
      results.forEach(d => Object.assign(merged, d));
      setCalData(merged);
    } catch {
      toast('Failed to load calendar.', 'error');
    } finally {
      setLoading(false);
    }
  }, [anchor, viewMode, branchId]);

  useEffect(() => { load(); }, [load]);

  const goBack = () => {
    const d = new Date(anchor);
    if (viewMode==='day')   d.setDate(d.getDate()-1);
    else if (viewMode==='week')  d.setDate(d.getDate()-7);
    else d.setMonth(d.getMonth()-1);
    setAnchor(d);
  };
  const goNext = () => {
    const d = new Date(anchor);
    if (viewMode==='day')   d.setDate(d.getDate()+1);
    else if (viewMode==='week')  d.setDate(d.getDate()+7);
    else d.setMonth(d.getMonth()+1);
    setAnchor(d);
  };

  const weekDates  = getWeekDates(anchor);
  const displayDays = viewMode === 'day' ? [anchor] : weekDates;
  const nowTopPx   = Math.max(0, (nowMin - HOURS[0]*60) / 60 * HOUR_H);

  /* header label */
  const headerLabel = viewMode === 'day'
    ? anchor.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' }).replace(',', '')
    : viewMode === 'week'
      ? (() => {
          const s = weekDates[0], e = weekDates[6];
          if (s.getMonth() === e.getMonth())
            return `${s.getDate()} – ${e.getDate()} ${MONTHS_SHORT[s.getMonth()]} ${String(s.getFullYear()).slice(2)}`;
          return `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]} ${String(e.getFullYear()).slice(2)}`;
        })()
      : `${MONTHS_SHORT[anchor.getMonth()]} ${anchor.getFullYear()}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 108px)', fontFamily: "'Inter',sans-serif", userSelect: 'none' }}>

      {/* ── Top bar ────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 16px', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>

        {/* Left: Today + nav + date label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setAnchor(new Date())} style={btnStyle}>Today</button>
          <div style={{ display: 'flex', gap: 2 }}>
            <button onClick={goBack} style={{ ...navBtnStyle, borderRadius: '8px 0 0 8px', borderRight: 'none' }}>‹</button>
            <button onClick={goNext} style={{ ...navBtnStyle, borderRadius: '0 8px 8px 0' }}>›</button>
          </div>
          <span style={{ fontSize: 17, fontWeight: 800, color: isDark ? '#F1F5F9' : '#111827', letterSpacing: '-0.3px' }}>{headerLabel}</span>
        </div>

        {/* Center: View tabs */}
        <div style={{ display: 'flex', background: isDark ? '#0F172A' : '#F1F5F9', borderRadius: 10, padding: 3, gap: 2 }}>
          {['Day','Week','Month'].map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v.toLowerCase())}
              style={{
                padding: '5px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: viewMode === v.toLowerCase() ? 700 : 500,
                background: viewMode === v.toLowerCase() ? (isDark ? '#1E293B' : '#fff') : 'transparent',
                color: viewMode === v.toLowerCase() ? (isDark ? '#F1F5F9' : '#111827') : (isDark ? '#94A3B8' : '#64748B'),
                boxShadow: viewMode === v.toLowerCase() ? (isDark ? '0 1px 4px rgba(0,0,0,0.25)' : '0 1px 4px rgba(0,0,0,0.1)') : 'none',
                transition: 'all .15s',
              }}
            >{v}</button>
          ))}
        </div>

        {/* Right: Branch filter + Add */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isAdmin && branches.length > 0 && (
            <Select value={branchId} onChange={e => setBranchId(e.target.value)} style={{ width: 145, borderRadius: 10 }}>
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
        </div>
      </div>

      {/* ── Month view ─────────────────────────────── */}
      {viewMode === 'month' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <MonthView
            year={anchor.getFullYear()} month={anchor.getMonth()}
            calData={calData} todayDate={todayDate}
            anchor={anchor} setAnchor={setAnchor} setViewMode={setViewMode}
          />
        </div>
      )}

      {/* ── Week / Day view ────────────────────────── */}
      {viewMode !== 'month' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: shellBg, borderRadius: 16, border: `1px solid ${shellBorder}`, overflow: 'hidden', boxShadow: isDark ? '0 4px 16px rgba(2,6,23,0.35)' : '0 1px 4px rgba(0,0,0,0.04)' }}>

          {/* Sticky day headers */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${shellBorder}`, flexShrink: 0, background: shellBg, zIndex: 10 }}>
            <div style={{ width: 72, flexShrink: 0, borderRight: `1px solid ${shellBorder}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', paddingRight: 8, paddingBottom: 10 }}>
              {loading && <span style={{ fontSize: 10, color: '#9CA3AF' }}>…</span>}
            </div>
            {displayDays.map((d, di) => {
              const isTod = dateKey(d) === todayKey;
              const dow   = d.getDay();
              const isWkd = dow === 0 || dow === 6;
              return (
                <div
                  key={dateKey(d)}
                  onClick={() => { setAnchor(d); if (viewMode==='week') setViewMode('day'); }}
                  style={{
                    flex: 1, textAlign: 'center', padding: '12px 4px 10px',
                    borderRight: di < displayDays.length-1 ? `1px solid ${gridLine}` : 'none',
                    cursor: viewMode==='week' ? 'pointer' : 'default',
                    borderBottom: isTod ? `3px solid ${ACCENT}` : '3px solid transparent',
                    background: isTod ? `${ACCENT}06` : 'transparent',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => { if (!isTod) e.currentTarget.style.background = isDark ? 'rgba(109,40,217,0.08)' : '#F8F9FB'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isTod ? `${ACCENT}06` : 'transparent'; }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: isTod ? ACCENT : isWkd ? '#EF4444' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>
                    {DOW[d.getDay()]}
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 34, height: 34, borderRadius: '50%',
                    background: isTod ? ACCENT : 'transparent',
                    fontSize: 15, fontWeight: isTod ? 800 : 500,
                    color: isTod ? '#fff' : isWkd ? '#EF4444' : (isDark ? '#E2E8F0' : '#1F2937'),
                    boxShadow: isTod ? `0 2px 8px ${ACCENT}50` : 'none',
                  }}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Scrollable time grid */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
            )}
            {!loading && (
              <div style={{ display: 'flex', minHeight: HOURS.length * HOUR_H }}>

                {/* Time labels */}
                <div style={{ width: 72, flexShrink: 0, borderRight: `1px solid ${shellBorder}`, position: 'relative' }}>
                  {HOURS.map(h => (
                    <div key={h} style={{ height: HOUR_H, position: 'relative', boxSizing: 'border-box' }}>
                      <span style={{ position: 'absolute', top: -8, right: 10, fontSize: 10.5, color: isDark ? '#64748B' : '#94A3B8', whiteSpace: 'nowrap', fontWeight: 500 }}>{fmtHour(h)}</span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {displayDays.map((d, di) => {
                  const key   = dateKey(d);
                  const appts = calData[key] || [];
                  const isTod = dateKey(d) === todayKey;

                  return (
                    <div
                      key={key}
                      style={{ flex: 1, position: 'relative', borderRight: di < displayDays.length-1 ? `1px solid ${gridLine}` : 'none', background: isTod ? `${ACCENT}08` : 'transparent' }}
                    >
                      {/* Hour grid lines */}
                      {HOURS.map(h => (
                        <div key={h} style={{ height: HOUR_H, boxSizing: 'border-box', borderBottom: `1px solid ${gridLine}`, position: 'relative' }}>
                          {/* half-hour tick */}
                          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderBottom: `1px dashed ${gridLineDash}` }} />
                        </div>
                      ))}

                      {/* Now indicator */}
                      {isTod && nowTopPx > 0 && nowTopPx < HOURS.length * HOUR_H && (
                        <div style={{ position: 'absolute', top: nowTopPx, left: 0, right: 0, zIndex: 5, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                          <div style={{ width: 10, height: 10, minWidth: 10, borderRadius: '50%', background: '#EF4444', marginLeft: -5, boxShadow: `0 0 0 2px ${shellBg}` }} />
                          <div style={{ flex: 1, height: 2, background: '#EF4444', opacity: 0.75 }} />
                        </div>
                      )}

                      {/* Appointment cards */}
                      {appts.map((a, ai) => {
                        const t   = apptTime(a);
                        const dur = apptDur(a);
                        const top = timeTopPx(t);
                        const h   = Math.max(dur / 60 * HOUR_H - 4, 46);
                        return (
                          <div key={a.id || ai} style={{ position: 'absolute', top: top + 2, left: 4, right: 4, height: h, zIndex: 2 }}>
                            <EventCard
                              appt={a}
                              colorIdx={(di * 7 + ai) % CARD_PAL.length}
                              heightPx={h}
                              navigate={navigate}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}
