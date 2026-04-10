import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  FilterBar, SearchBar, DataTable, StaffAvatar, PKModal as Modal,
  IconUsers, IconCheck, IconStop, IconClock, IconPlus,
} from '../components/ui/PageKit';

/* ── helpers ─────────────────────────────────────────────────────────── */
const STATUS_COLOR = { present:'#059669', absent:'#DC2626', leave:'#D97706', late:'#7C3AED' };
const STATUS_BG    = { present:'#ECFDF5', absent:'#FEF2F2', leave:'#FFFBEB', late:'#F5F3FF' };
const STATUSES     = ['present','absent','leave','late'];
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const fmtTime = t => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hh = parseInt(h);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${String(hh % 12 || 12).padStart(2,'0')}:${m} ${ampm}`;
};

const calcDuration = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return null;
  const [h1,m1] = checkIn.split(':').map(Number);
  const [h2,m2] = checkOut.split(':').map(Number);
  let diff = (h2*60+m2) - (h1*60+m1);
  if (diff < 0) diff += 24*60;
  const hrs = Math.floor(diff/60);
  const mins = diff%60;
  return `${hrs}h ${mins}m`;
};

const calcOvertime = (checkIn, checkOut, standardHrs = 8) => {
  if (!checkIn || !checkOut) return null;
  const [h1,m1] = checkIn.split(':').map(Number);
  const [h2,m2] = checkOut.split(':').map(Number);
  let diff = (h2*60+m2) - (h1*60+m1);
  if (diff < 0) diff += 24*60;
  const overMins = diff - standardHrs*60;
  if (overMins <= 0) return null;
  const hrs = Math.floor(overMins/60);
  const mins = overMins%60;
  return `${hrs}h ${mins}m`;
};

const dayLabel = dateStr => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
};

const shiftDate = (dateStr, delta) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0,10);
};

/* ── SummaryCard ─────────────────────────────────────────────────────── */
const SummaryCard = ({ title, color, items }) => (
  <div style={{ flex:1, minWidth:240, background:'#fff', border:`1.5px solid ${color}20`, borderRadius:14, overflow:'hidden' }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 18px', borderBottom:`1px solid ${color}15` }}>
      <div style={{ width:10, height:10, borderRadius:'50%', background:color }} />
      <span style={{ fontSize:14, fontWeight:700, color:'#101828' }}>{title}</span>
    </div>
    <div style={{ display:'flex', padding:'16px 18px', gap:24 }}>
      {items.map(it => (
        <div key={it.label}>
          <div style={{ fontSize:11, color:'#98A2B3', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>{it.label}</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#101828' }}>{it.value}</div>
        </div>
      ))}
    </div>
  </div>
);

/* ── component ───────────────────────────────────────────────────────── */
export default function AttendancePage() {
  const { user }     = useAuth();
  const { toast }    = useToast();
  const isSuperAdmin = ['superadmin','admin'].includes(user?.role);
  const canEdit      = ['superadmin','admin','manager'].includes(user?.role);
  const today        = new Date().toISOString().slice(0,10);

  const [date, setDate]               = useState(today);
  const [filterBranch, setFilterBranch] = useState(isSuperAdmin ? '' : user?.branch_id || '');
  const [search, setSearch]           = useState('');
  const [records, setRecords]         = useState([]);
  const [branches, setBranches]       = useState([]);
  const [staffList, setStaffList]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState({});
  const [showAdd, setShowAdd]         = useState(false);
  const [addForm, setAddForm]         = useState({ staff_id:'', status:'present', check_in:'', check_out:'', note:'' });

  /* ── load ─────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [attR, brR, stR] = await Promise.all([
        api.get('/attendance', { params: { date, ...(filterBranch ? { branchId: filterBranch } : {}) } }),
        api.get('/branches',  { params: { limit:100 } }),
        api.get('/staff',     { params: { limit:200, ...(filterBranch ? { branchId: filterBranch } : {}), is_active:true } }),
      ]);
      setRecords(Array.isArray(attR.data) ? attR.data : (attR.data?.data ?? []));
      setBranches(Array.isArray(brR.data) ? brR.data : (brR.data?.data ?? []));
      setStaffList(Array.isArray(stR.data) ? stR.data : (stR.data?.data ?? []));
    } catch { }
    setLoading(false);
  }, [date, filterBranch]);
  useEffect(() => { load(); }, [load]);

  /* ── helpers ──────────────────────────────────────────────────────── */
  const getRecord = staffId => records.find(r => r.staff_id === staffId || r.staff?.id === staffId);

  const handleStatusChange = async (staffId, status) => {
    const existing = getRecord(staffId);
    setSaving(s => ({ ...s, [staffId]: true }));
    try {
      if (existing) {
        await api.put(`/attendance/${existing.id}`, { status });
      } else {
        await api.post('/attendance', { staff_id: staffId, date, status, check_in: null, check_out: null, note: '' });
      }
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save attendance');
    }
    setSaving(s => ({ ...s, [staffId]: false }));
  };

  const handleTimeChange = async (staffId, field, value) => {
    const existing = getRecord(staffId);
    if (!existing) return;
    setSaving(s => ({ ...s, [staffId]: true }));
    try {
      await api.put(`/attendance/${existing.id}`, { [field]: value });
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update time');
    }
    setSaving(s => ({ ...s, [staffId]: false }));
  };

  const handleNoteChange = async (staffId, note) => {
    const existing = getRecord(staffId);
    if (!existing) return;
    try {
      await api.put(`/attendance/${existing.id}`, { note });
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save note');
    }
  };

  const handleAddAttendance = async () => {
    if (!addForm.staff_id) return;
    try {
      await api.post('/attendance', { ...addForm, date });
      toast.success('Attendance added');
      setShowAdd(false);
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  /* ── summary ─────────────────────────────────────────────────────── */
  const presentCount = records.filter(r => r.status === 'present').length;
  const lateCount    = records.filter(r => r.status === 'late').length;
  const absentCount  = records.filter(r => r.status === 'absent').length;
  const leaveCount   = records.filter(r => r.status === 'leave').length;
  const noClockIn    = records.filter(r => r.status === 'present' && !r.check_in).length;
  const noClockOut   = records.filter(r => r.check_in && !r.check_out).length;

  /* ── filter ──────────────────────────────────────────────────────── */
  const displayed = staffList.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.role_title?.toLowerCase().includes(q) || s.phone?.includes(q);
  });

  /* ── columns ─────────────────────────────────────────────────────── */
  const columns = [
    {
      id: 'staff',
      header: 'Staff Member',
      accessorFn: row => row.name,
      meta: { width: '20%' },
      cell: ({ row: { original: staff } }) => {
        const isSaving = saving[staff.id];
        return (
          <div style={{ display:'flex', alignItems:'center', gap:10, opacity:isSaving?0.6:1, transition:'opacity 0.15s' }}>
            <StaffAvatar name={staff.name} />
            <div>
              <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>{staff.name}</div>
              <div style={{ fontSize:11, color:'#98A2B3' }}>{staff.phone || staff.role_title || ''}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      meta: { width: '24%' },
      cell: ({ row: { original: staff } }) => {
        const rec = getRecord(staff.id);
        const isSaving = saving[staff.id];
        return canEdit ? (
          <div style={{ display:'flex', gap:4 }}>
            {STATUSES.map(s => (
              <button key={s} onClick={() => handleStatusChange(staff.id, s)} disabled={isSaving}
                style={{
                  padding:'5px 12px', borderRadius:8, border:'1.5px solid', cursor:'pointer', transition:'all 0.15s',
                  fontSize:12, fontWeight: rec?.status===s ? 700 : 500,
                  borderColor: rec?.status===s ? STATUS_COLOR[s] : '#E4E7EC',
                  background:  rec?.status===s ? STATUS_BG[s] : 'transparent',
                  color:       rec?.status===s ? STATUS_COLOR[s] : '#98A2B3',
                  fontFamily: "'Inter',sans-serif",
                }}>{cap(s)}</button>
            ))}
          </div>
        ) : (
          <span style={{ padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:600,
            background: STATUS_BG[rec?.status]||'#F9FAFB', color: STATUS_COLOR[rec?.status]||'#98A2B3' }}>
            {cap(rec?.status) || 'Not marked'}
          </span>
        );
      },
    },
    {
      id: 'clockInOut',
      header: 'Clock-in & Out',
      enableSorting: false,
      meta: { width: '22%' },
      cell: ({ row: { original: staff } }) => {
        const rec = getRecord(staff.id);
        if (!rec) return <span style={{ fontSize:12, color:'#D0D5DD' }}>—</span>;
        const dur = calcDuration(rec.check_in, rec.check_out);
        return (
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            {canEdit ? (
              <>
                <input type="time" defaultValue={rec.check_in||''} onBlur={e => handleTimeChange(staff.id,'check_in',e.target.value)}
                  style={{ padding:'4px 6px', border:'1.5px solid #E4E7EC', borderRadius:7, fontSize:12, outline:'none', width:90, fontFamily:"'Inter',sans-serif", color: rec.check_in ? '#059669' : '#D0D5DD', fontWeight:600 }} />
                <span style={{ color:'#D0D5DD', fontSize:11 }}>→</span>
                <span style={{ fontSize:11, color:'#98A2B3', minWidth:42, textAlign:'center' }}>{dur || '—'}</span>
                <span style={{ color:'#D0D5DD', fontSize:11 }}>→</span>
                <input type="time" defaultValue={rec.check_out||''} onBlur={e => handleTimeChange(staff.id,'check_out',e.target.value)}
                  style={{ padding:'4px 6px', border:'1.5px solid #E4E7EC', borderRadius:7, fontSize:12, outline:'none', width:90, fontFamily:"'Inter',sans-serif", color: rec.check_out ? '#DC2626' : '#D0D5DD', fontWeight:600 }} />
              </>
            ) : (
              <>
                <span style={{ fontSize:13, fontWeight:600, color:'#059669' }}>{fmtTime(rec.check_in)}</span>
                {dur && <span style={{ fontSize:11, color:'#98A2B3', padding:'0 6px' }}>— {dur} —</span>}
                <span style={{ fontSize:13, fontWeight:600, color:'#DC2626' }}>{fmtTime(rec.check_out)}</span>
              </>
            )}
          </div>
        );
      },
    },
    {
      id: 'overtime',
      header: 'Overtime',
      enableSorting: false,
      meta: { width: '10%', align: 'center' },
      cell: ({ row: { original: staff } }) => {
        const rec = getRecord(staff.id);
        const ot = rec ? calcOvertime(rec.check_in, rec.check_out) : null;
        return ot
          ? <span style={{ padding:'3px 10px', borderRadius:20, background:'#FFF7ED', color:'#EA580C', fontSize:12, fontWeight:700 }}>{ot}</span>
          : <span style={{ color:'#D0D5DD', fontSize:12 }}>—</span>;
      },
    },
    {
      id: 'branch',
      header: 'Branch',
      accessorFn: row => row.branch?.name,
      meta: { width: '12%' },
      cell: ({ row: { original: staff } }) => (
        <span style={{ fontSize:12, color:'#475467' }}>{staff.branch?.name || ''}</span>
      ),
    },
    {
      id: 'note',
      header: 'Note',
      enableSorting: false,
      meta: { width: '12%' },
      cell: ({ row: { original: staff } }) => {
        const rec = getRecord(staff.id);
        return canEdit && rec ? (
          <input defaultValue={rec.note||''} placeholder="Add note..." onBlur={e => { if (e.target.value !== (rec.note||'')) handleNoteChange(staff.id, e.target.value); }}
            style={{ padding:'4px 8px', border:'1.5px solid #E4E7EC', borderRadius:7, fontSize:12, outline:'none', width:'100%', fontFamily:"'Inter',sans-serif", color:'#344054', background:'transparent' }} />
        ) : (
          <span style={{ fontSize:12, color:'#667085', fontStyle: rec?.note ? 'normal' : 'italic' }}>
            {rec?.note || ''}
          </span>
        );
      },
    },
  ];

  /* ── unmarked staff for add modal ───────────────────────────────── */
  const unmarkedStaff = staffList.filter(s => !getRecord(s.id));

  return (
    <PageWrapper title="Attendance"
      subtitle="Daily staff attendance tracker"
      actions={canEdit && (
        <Button variant="primary" onClick={() => { setAddForm({ staff_id:'', status:'present', check_in:'', check_out:'', note:'' }); setShowAdd(true); }}
          style={{ display:'flex', alignItems:'center', gap:6 }}><IconPlus /> Add Attendance</Button>
      )}>

      {/* ── Date Navigator ──────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:4 }}>
        <button onClick={() => setDate(d => shiftDate(d, -1))}
          style={{ width:34, height:34, borderRadius:8, border:'1.5px solid #E4E7EC', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#475467', fontSize:16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ fontSize:16, fontWeight:700, color:'#101828', fontFamily:"'Inter',sans-serif", minWidth:220, textAlign:'center' }}>
          {dayLabel(date)}
        </div>
        <button onClick={() => { if (date < today) setDate(d => shiftDate(d, 1)); }}
          style={{ width:34, height:34, borderRadius:8, border:'1.5px solid #E4E7EC', background:'#fff', cursor: date < today ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', color: date < today ? '#475467' : '#D0D5DD', fontSize:16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        {date !== today && (
          <button onClick={() => setDate(today)}
            style={{ padding:'5px 14px', borderRadius:8, border:'1.5px solid #2563EB', background:'#EFF6FF', color:'#2563EB', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
            Today
          </button>
        )}
      </div>

      {/* ── Summary Cards ───────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
        <SummaryCard title="Present Summary" color="#059669" items={[
          { label:'On Time', value: presentCount },
          { label:'Late Clock-in', value: lateCount },
          { label:'Total', value: presentCount + lateCount },
        ]} />
        <SummaryCard title="Not Present Summary" color="#DC2626" items={[
          { label:'Absent', value: absentCount },
          { label:'No Clock-in', value: noClockIn },
          { label:'No Clock-out', value: noClockOut },
        ]} />
        <SummaryCard title="Away Summary" color="#D97706" items={[
          { label:'Leave', value: leaveCount },
          { label:'Total Staff', value: staffList.length },
          { label:'Recorded', value: records.length },
        ]} />
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────── */}
      <FilterBar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search staff..." />
        {isSuperAdmin && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {records.length > 0 && (
          <span style={{ padding:'4px 12px', borderRadius:6, background:'#ECFDF5', color:'#059669', fontSize:12, fontWeight:600, whiteSpace:'nowrap' }}>
            {records.length} / {staffList.length} recorded
          </span>
        )}
      </FilterBar>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={displayed}
        loading={loading}
        emptyMessage="No staff found"
        emptySub="Add staff or select a specific branch"
      />

      {/* ── Add Attendance Modal ────────────────────────────────────── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Attendance" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleAddAttendance}>Save</Button>
        </>}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <FormGroup label="Staff Member" required>
            <select value={addForm.staff_id} onChange={e => setAddForm(f => ({...f, staff_id: e.target.value}))}
              style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1.5px solid #D0D5DD', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
              <option value="">Select staff</option>
              {unmarkedStaff.map(s => <option key={s.id} value={s.id}>{s.name} — {s.branch?.name||''}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Status">
            <div style={{ display:'flex', gap:6 }}>
              {STATUSES.map(s => (
                <button key={s} onClick={() => setAddForm(f => ({...f, status: s}))}
                  style={{
                    flex:1, padding:'7px 0', borderRadius:8, border:'1.5px solid', cursor:'pointer', fontSize:12, fontWeight:600,
                    borderColor: addForm.status===s ? STATUS_COLOR[s] : '#E4E7EC',
                    background:  addForm.status===s ? STATUS_BG[s] : 'transparent',
                    color:       addForm.status===s ? STATUS_COLOR[s] : '#98A2B3',
                    fontFamily:"'Inter',sans-serif",
                  }}>{cap(s)}</button>
              ))}
            </div>
          </FormGroup>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Clock In"><Input type="time" value={addForm.check_in} onChange={e => setAddForm(f => ({...f, check_in: e.target.value}))} /></FormGroup>
            <FormGroup label="Clock Out"><Input type="time" value={addForm.check_out} onChange={e => setAddForm(f => ({...f, check_out: e.target.value}))} /></FormGroup>
          </div>
          <FormGroup label="Note"><Input value={addForm.note} onChange={e => setAddForm(f => ({...f, note: e.target.value}))} placeholder="Optional note..." /></FormGroup>
        </div>
      </Modal>
    </PageWrapper>
  );
}
