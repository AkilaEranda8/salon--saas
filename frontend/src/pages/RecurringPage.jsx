import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import {
  PKModal as Modal, StatCard, StaffAvatar, ActionBtn, DataTable,
  IconEye, IconStop, IconClock, IconCalendar, IconUsers,
} from '../components/ui/PageKit';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const ACCENT = '#2563EB';

function pad(n) { return String(n).padStart(2, '0'); }
function toKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function buildMonthGrid(y, m) {
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

function nextCountdown(nextDate) {
  if (!nextDate) return null;
  const diff = Math.ceil((new Date(`${nextDate}T00:00:00`) - Date.now()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `in ${diff}d`;
}

function custName(c) {
  if (!c) return '';
  if (c.name) return c.name;
  return `${c.first_name || ''} ${c.last_name || ''}`.trim();
}

function staffName(s) {
  if (!s) return '';
  if (s.name) return s.name;
  return `${s.first_name || ''} ${s.last_name || ''}`.trim();
}

/** Map API `{ parent, children, nextScheduled, ... }` → flat row for table/UI */
function mapChain(row) {
  const parent = row.parent || row;
  const children = row.children || [];
  const next = row.nextScheduled || null;
  const nextDate = next?.date || null;
  const nextTime = next?.time || parent.time || null;
  const appointments = [
    {
      id: parent.id,
      appointment_date: parent.date,
      status: parent.status,
      time: parent.time,
    },
    ...children.map((a) => ({
      id: a.id,
      appointment_date: a.date,
      status: a.status,
      time: a.time,
    })),
  ];
  return {
    id: parent.id,
    customer: parent.customer,
    service: parent.service,
    staff: parent.staff,
    branch: parent.branch,
    next_date: nextDate,
    appointment_time: nextTime,
    count: row.totalBookings ?? appointments.length,
    stopped: row.isActive === false,
    appointments,
    parent,
  };
}

export default function RecurringPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ['superadmin', 'admin'].includes(user?.role);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [chains, setChains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewChain, setViewChain] = useState(null);
  const [stopId, setStopId] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [tab, setTab] = useState('list');
  const now = new Date();
  const [viewY, setViewY] = useState(now.getFullYear());
  const [viewM, setViewM] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    if (isAdmin) api.get('/branches').then((r) => setBranches(r.data || [])).catch(() => {});
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = branchId ? `?branchId=${branchId}` : '';
      const res = await api.get(`/appointments/recurring${params}`);
      const raw = Array.isArray(res.data) ? res.data : [];
      setChains(raw.map(mapChain));
    } catch {
      toast('Failed to load recurring appointments.', 'error');
    }
    setLoading(false);
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  const handleStop = async () => {
    if (!stopId) return;
    setStopping(true);
    try {
      await api.patch(`/appointments/${stopId}/stop-recurring`);
      toast('Recurring series stopped.', 'success');
      setStopId(null);
      load();
    } catch {
      toast('Failed to stop recurring series.', 'error');
    }
    setStopping(false);
  };

  const active = chains.filter((c) => !c.stopped).length;
  const total = chains.reduce((s, c) => s + (c.count || 0), 0);
  const thisWeek = chains.filter((c) => {
    if (!c.next_date) return false;
    const diff = Math.ceil((new Date(`${c.next_date}T00:00:00`) - Date.now()) / 86400000);
    return diff >= 0 && diff <= 7;
  }).length;

  const byDate = useMemo(() => {
    const map = {};
    for (const c of chains) {
      if (!c.next_date) continue;
      if (!map[c.next_date]) map[c.next_date] = [];
      map[c.next_date].push(c);
    }
    return map;
  }, [chains]);

  const cells = useMemo(() => buildMonthGrid(viewY, viewM), [viewY, viewM]);
  const dayChains = selectedDay ? (byDate[selectedDay] || []) : [];

  return (
    <PageWrapper
      title="Recurring Appointments"
      subtitle="Auto-booking chains — SMS on visit day"
      actions={isAdmin && branches.length > 0 && (
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="pk-filter-control">
          <option value="">All Branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Active Series" value={active} color="#2563EB" icon={<IconCalendar />} />
        <StatCard label="Total Auto-created" value={total} color="#7C3AED" icon={<IconUsers />} />
        <StatCard label="This Week" value={thisWeek} color="#0891B2" icon={<IconClock />} />
      </div>

      <div style={{ display: 'flex', borderBottom: '2px solid var(--app-border, #E4E7EC)', marginBottom: 16 }}>
        {[['list', 'List'], ['calendar', 'Calendar']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "'Inter',sans-serif",
              color: tab === key ? ACCENT : '#64748B',
              borderBottom: tab === key ? `2px solid ${ACCENT}` : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'calendar' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{
            padding: 14,
            borderRadius: 14,
            border: '1px solid var(--app-border, #EAECF0)',
            background: 'var(--app-panel, #fff)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <button type="button" onClick={() => {
                if (viewM === 0) { setViewY((y) => y - 1); setViewM(11); }
                else setViewM((m) => m - 1);
              }} style={navBtn}>‹</button>
              <div style={{ fontWeight: 700 }}>{MONTHS[viewM]} {viewY}</div>
              <button type="button" onClick={() => {
                if (viewM === 11) { setViewY((y) => y + 1); setViewM(0); }
                else setViewM((m) => m + 1);
              }} style={navBtn}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {DOW.map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#98A2B3', padding: 4 }}>{d}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={`e-${i}`} />;
                const key = toKey(viewY, viewM, day);
                const count = (byDate[key] || []).length;
                const on = selectedDay === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    style={{
                      height: 40,
                      borderRadius: 8,
                      border: on ? `2px solid ${ACCENT}` : '1px solid transparent',
                      background: count ? '#EFF6FF' : on ? '#F8FAFC' : 'transparent',
                      cursor: 'pointer',
                      fontWeight: count || on ? 700 : 500,
                      color: on ? ACCENT : '#101828',
                      fontSize: 13,
                      position: 'relative',
                    }}
                  >
                    {day}
                    {count > 0 && (
                      <span style={{
                        position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                        width: 5, height: 5, borderRadius: '50%', background: ACCENT,
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{
            padding: 14,
            borderRadius: 14,
            border: '1px solid var(--app-border, #EAECF0)',
            background: 'var(--app-panel, #fff)',
            minHeight: 200,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--app-title, #101828)' }}>
              {selectedDay
                ? `Series on ${selectedDay}`
                : 'Select a day with upcoming recurring visits'}
            </div>
            {!selectedDay && (
              <div style={{ color: '#98A2B3', fontSize: 13 }}>Click a highlighted day to view series.</div>
            )}
            {selectedDay && !dayChains.length && (
              <div style={{ color: '#98A2B3', fontSize: 13 }}>No recurring visits on this day.</div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {dayChains.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: 10, border: '1px solid #EAECF0', cursor: 'pointer',
                  }}
                  onClick={() => setViewChain(c)}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{custName(c.customer)}</div>
                    <div style={{ fontSize: 12, color: '#98A2B3' }}>
                      {c.service?.name || '—'} · {(c.appointment_time || '').slice(0, 5)}
                    </div>
                  </div>
                  <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setViewChain(c); }}>View</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'list' && (
        <DataTable
          columns={[
            {
              id: 'customer', header: 'Customer', meta: { width: '18%' },
              accessorFn: (r) => custName(r.customer),
              cell: ({ getValue }) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StaffAvatar name={getValue()} size={32} />
                  <div style={{ fontWeight: 600, color: '#101828', fontSize: 14 }}>{getValue()}</div>
                </div>
              ),
            },
            {
              id: 'service', header: 'Service', meta: { width: '14%' },
              accessorFn: (r) => r.service?.name || '',
              cell: ({ getValue }) => <span style={{ fontSize: 13, color: '#344054' }}>{getValue()}</span>,
            },
            {
              id: 'staff', header: 'Staff', meta: { width: '14%' },
              accessorFn: (r) => staffName(r.staff),
              cell: ({ getValue }) => <span style={{ fontSize: 13, color: '#344054' }}>{getValue() || '—'}</span>,
            },
            {
              id: 'schedule', header: 'Schedule', meta: { width: '14%' },
              accessorFn: (r) => r.next_date || '',
              cell: ({ row }) => {
                const c = row.original;
                const day = c.next_date ? DAYS[new Date(`${c.next_date}T00:00:00`).getDay()] : '';
                const timeStr = c.appointment_time ? String(c.appointment_time).slice(0, 5) : '';
                return (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{day ? `Every ${day}` : '—'}</div>
                    <div style={{ fontSize: 12, color: '#98A2B3' }}>{timeStr}</div>
                  </>
                );
              },
            },
            {
              id: 'branch', header: 'Branch', meta: { width: '12%' },
              accessorFn: (r) => r.branch?.name || '',
              cell: ({ getValue }) => <span style={{ fontSize: 13, color: '#64748B' }}>{getValue()}</span>,
            },
            {
              id: 'nextBooking', header: 'Next Booking', meta: { width: '14%' },
              accessorFn: (r) => r.next_date || '',
              cell: ({ row }) => {
                const c = row.original;
                if (!c.next_date) return <span style={{ color: '#98A2B3', fontSize: 13 }}>—</span>;
                const countdown = nextCountdown(c.next_date);
                return (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>
                      {new Date(`${c.next_date}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </div>
                    <div style={{
                      fontSize: 11, marginTop: 2,
                      color: countdown && countdown.startsWith('in') ? '#16A34A' : '#98A2B3',
                    }}>{countdown}</div>
                  </>
                );
              },
            },
            {
              id: 'series', header: 'Series', meta: { width: '8%', align: 'center' },
              accessorFn: (r) => r.count || 0,
              cell: ({ getValue }) => (
                <span style={{
                  padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: '#F0FDF4', color: '#16A34A',
                }}>{getValue()}</span>
              ),
            },
            {
              id: 'actions', header: 'Actions', meta: { width: '6%', align: 'center' },
              cell: ({ row }) => {
                const c = row.original;
                return (
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <ActionBtn onClick={() => setViewChain(c)} title="View history" color="#2563EB"><IconEye /></ActionBtn>
                    {!c.stopped && <ActionBtn onClick={() => setStopId(c.id)} title="Stop recurring" color="#DC2626"><IconStop /></ActionBtn>}
                  </div>
                );
              },
            },
          ]}
          data={chains}
          loading={loading}
          emptyMessage="No recurring appointments found"
          emptySub="Enable Recurring on Walk-In or Payments checkout"
          searchableColumns={[
            { id: 'customer', title: 'Customer' },
            { id: 'service', title: 'Service' },
          ]}
        />
      )}

      {viewChain && (
        <Modal
          open
          title="Recurring History"
          onClose={() => setViewChain(null)}
          size="md"
          footer={<Button variant="secondary" onClick={() => setViewChain(null)}>Close</Button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {[
              ['Customer', custName(viewChain.customer)],
              ['Service', viewChain.service?.name || '—'],
              ['Staff', staffName(viewChain.staff) || '—'],
              ['Branch', viewChain.branch?.name || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, fontSize: 14 }}>
                <span style={{ fontWeight: 600, color: '#98A2B3', width: 80 }}>{k}:</span>
                <span style={{ color: '#101828' }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, fontSize: 14 }}>
              <span style={{ fontWeight: 600, color: '#98A2B3', width: 80 }}>Next:</span>
              <span style={{ color: '#101828' }}>
                {viewChain.next_date || '—'}
                {viewChain.appointment_time ? ` at ${String(viewChain.appointment_time).slice(0, 5)}` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 14 }}>
              <span style={{ fontWeight: 600, color: '#98A2B3', width: 80 }}>Series:</span>
              <span style={{ color: '#101828' }}>{viewChain.count || 0} booking{(viewChain.count !== 1) ? 's' : ''}</span>
            </div>
          </div>
          {viewChain.appointments?.length > 0 && (
            <>
              <div style={{
                fontWeight: 700, marginBottom: 8, fontSize: 11, color: '#98A2B3',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>Booking History</div>
              <div style={{ borderRadius: 10, border: '1px solid #EAECF0', overflow: 'hidden' }}>
                {viewChain.appointments.slice(0, 10).map((a, i) => (
                  <div
                    key={a.id || i}
                    style={{
                      display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
                      borderTop: i > 0 ? '1px solid #F2F4F7' : 'none', fontSize: 13,
                      background: i % 2 === 0 ? '#fff' : '#FAFAFA',
                    }}
                  >
                    <span style={{ color: '#344054' }}>
                      {a.appointment_date
                        ? new Date(`${a.appointment_date}T00:00:00`).toLocaleDateString('en-US', {
                          weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                        })
                        : '—'}
                    </span>
                    <span style={{
                      fontWeight: 600,
                      color: ({ confirmed: '#2563EB', completed: '#16A34A', cancelled: '#DC2626', pending: '#D97706' })[a.status] || '#64748B',
                    }}>{a.status}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}

      {stopId && (
        <Modal
          open
          title="Stop Recurring Series"
          onClose={() => setStopId(null)}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setStopId(null)}>Cancel</Button>
              <Button variant="danger" loading={stopping} onClick={handleStop}>Stop Series</Button>
            </>
          )}
        >
          <p style={{ fontSize: 14, color: '#344054', margin: 0 }}>
            Are you sure you want to stop this recurring series? No future appointments will be auto-created.
          </p>
        </Modal>
      )}
    </PageWrapper>
  );
}

const navBtn = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid #E4E7EC',
  background: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1,
};
