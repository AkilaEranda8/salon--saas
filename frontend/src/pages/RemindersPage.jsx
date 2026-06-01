import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  IconEdit, IconTrash, IconPlus, IconCheck, IconBell,
  ActionBtn, StatCard, PKModal as Modal,
  FilterBar, DataTable,
} from '../components/ui/PageKit';

const PRI_COLOR = { low:'#64748B', medium:'#D97706', high:'#DC2626', urgent:'#7C3AED' };
const PRI_BG    = { low:'#F8FAFC', medium:'#FEF3C7', high:'#FEE2E2', urgent:'#F5F3FF' };

const BLANK = { title:'', body:'', priority:'medium', due_date:'', branch_id:'' };

export default function RemindersPage() {
  const { user }     = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';
  const { toast } = useToast();
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [filter, setFilter]         = useState('all');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(BLANK);
  const [busy, setBusy]             = useState(false);
  const [branches, setBranches]     = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, bRes] = await Promise.allSettled([
        api.get('/reminders'),
        api.get('/branches', { params:{ limit:100 } }),
      ]);
      setItems(rRes.status === 'fulfilled' ? rRes.value.data || [] : []);
      if (bRes.status === 'fulfilled') setBranches(Array.isArray(bRes.value.data) ? bRes.value.data : (bRes.value.data?.data ?? []));
    } catch { toast('Failed to load reminders.', 'error'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending  = items.filter(i => !i.is_done);
  const done     = items.filter(i =>  i.is_done);
  const overdue  = pending.filter(i => i.due_date && new Date(i.due_date) < new Date());
  const urgent   = pending.filter(i => i.priority === 'urgent');

  const tableData = useMemo(() => items.filter(i => {
    if (filter === 'pending' && i.is_done) return false;
    if (filter === 'done' && !i.is_done) return false;
    return true;
  }), [items, filter]);

  const openAdd  = () => { setEditing(null); setForm({ ...BLANK, branch_id: user?.branch_id || '' }); setModalOpen(true); };
  const openEdit = r  => { setEditing(r); setForm({ title:r.title||'', body:r.body||'', priority:r.priority||'medium', due_date:r.due_date?r.due_date.substring(0,10):'', branch_id:r.branch_id||'' }); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const save = async () => {
    if (!form.title.trim()) { toast('Title is required.', 'error'); return; }
    if (!form.branch_id && !user?.branch_id) { toast('Branch is required.', 'error'); return; }
    setBusy(true);
    try {
      const payload = { ...form, branch_id: form.branch_id || user?.branch_id };
      if (editing) { await api.put(`/reminders/${editing.id}`, payload); toast('Reminder updated.', 'success'); }
      else          { await api.post('/reminders', payload);              toast('Reminder created.', 'success'); }
      await load(); closeModal();
    } catch { toast('Failed to save reminder.', 'error'); }
    setBusy(false);
  };

  const remove = async id => {
    if (!confirm('Delete this reminder?')) return;
    try { await api.delete(`/reminders/${id}`); await load(); toast('Deleted.', 'success'); }
    catch { toast('Failed to delete.', 'error'); }
  };

  const toggle = async r => {
    try { await api.patch(`/reminders/${r.id}/toggle`); await load(); }
    catch { toast('Failed to update.', 'error'); }
  };

  const columns = useMemo(() => [
    {
      id: 'done',
      header: '',
      enableSorting: false,
      meta: { width: '48px', align: 'center' },
      cell: ({ row: { original: r } }) => {
        const done = !!r.is_done;
        const color = PRI_COLOR[r.priority] || '#64748B';
        return (
          <button type="button" onClick={() => toggle(r)} title={done ? 'Mark pending' : 'Mark done'}
            style={{
              width: 28, height: 28, borderRadius: '50%', border: `2px solid ${done ? '#059669' : color}`,
              background: done ? '#059669' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
            {done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
          </button>
        );
      },
    },
    {
      id: 'title',
      header: 'Reminder',
      accessorKey: 'title',
      cell: ({ row: { original: r } }) => {
        const done = !!r.is_done;
        const overdue = !done && r.due_date && new Date(r.due_date) < new Date();
        return (
          <div>
            <div style={{ fontWeight: 700, color: done ? '#98A2B3' : '#101828', textDecoration: done ? 'line-through' : 'none' }}>{r.title}</div>
            {r.body && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{r.body}</div>}
            {overdue && <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>Overdue</span>}
          </div>
        );
      },
    },
    {
      id: 'priority',
      header: 'Priority',
      accessorKey: 'priority',
      cell: ({ getValue }) => {
        const p = getValue();
        const color = PRI_COLOR[p] || '#64748B';
        return <span style={{ padding: '2px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: `${color}20`, color }}>{p}</span>;
      },
    },
    {
      id: 'due_date',
      header: 'Due',
      accessorFn: row => row.due_date || '',
      cell: ({ row: { original: r } }) => r.due_date
        ? new Date(r.due_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—',
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { width: '90px', align: 'center' },
      cell: ({ row: { original: r } }) => !r.is_done && (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <ActionBtn onClick={() => openEdit(r)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>
          <ActionBtn onClick={() => remove(r.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>
        </div>
      ),
    },
  ], []);

  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <PageWrapper title="Reminders" subtitle="Manage your team reminders and tasks">

      {/* Stat Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:16 }}>
        <StatCard label="Total" value={items.length} icon={<IconBell />} color="#2563EB" />
        <StatCard label="Pending" value={pending.length} icon={<IconBell />} color="#D97706" />
        <StatCard label="Done" value={done.length} icon={<IconCheck />} color="#059669" />
        <StatCard label="Overdue" value={overdue.length} icon={<IconBell />} color="#DC2626" />
        <StatCard label="Urgent" value={urgent.length} icon={<IconBell />} color="#7C3AED" />
      </div>

      <div style={{ marginBottom: 12 }}>
          <FilterBar>
            {/* Filter pills */}
            {['all','pending','done'].map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                style={{
                  padding:'6px 14px', borderRadius:10, border:'1.5px solid',
                  cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:"'Inter',sans-serif",
                  transition:'all 0.15s',
                  borderColor: filter===f ? '#2563EB' : '#E4E7EC',
                  background:  filter===f ? '#EFF6FF' : '#fff',
                  color:       filter===f ? '#2563EB' : '#64748B',
                }}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}

            {/* Alerts */}
            {overdue.length > 0 && (
              <span style={{ padding:'4px 12px', borderRadius:10, fontSize:11, fontWeight:700, background:'#FEE2E2', color:'#DC2626', flexShrink:0 }}>
                {overdue.length} overdue
              </span>
            )}
            {urgent.length > 0 && (
              <span style={{ padding:'4px 12px', borderRadius:10, fontSize:11, fontWeight:700, background:'#F5F3FF', color:'#7C3AED', flexShrink:0 }}>
                {urgent.length} urgent
              </span>
            )}

            <button onClick={openAdd}
              style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, background:'#2563EB', color:'#fff', border:'none', borderRadius:10, padding:'7px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
              <IconPlus /><span>Add Reminder</span>
            </button>
          </FilterBar>
      </div>

      <DataTable
        columns={columns}
        data={tableData}
        loading={loading}
        emptyMessage="No reminders found"
        emptySub="Add your first reminder to stay organised"
        searchableColumns={[{ id: 'title', title: 'Reminder' }]}
        filterableColumns={[{
          id: 'priority',
          title: 'Priority',
          options: ['low', 'medium', 'high', 'urgent'].map(p => ({ label: p, value: p })),
        }]}
      />

      {/* Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Reminder' : 'New Reminder'} width={480}
        footer={<>
          <button onClick={closeModal} style={{ padding:'8px 20px', borderRadius:10, border:'1.5px solid #E4E7EC', background:'#fff', color:'#344054', fontWeight:600, cursor:'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>Cancel</button>
          <button onClick={save} disabled={busy}
            style={{ padding:'8px 22px', borderRadius:10, border:'none', background:busy?'#93C5FD':'#2563EB', color:'#fff', fontWeight:700, cursor:busy?'not-allowed':'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
            {busy ? 'Saving' : editing ? 'Save Changes' : 'Create Reminder'}
          </button>
        </>}>
        {/* Form */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {isSuperAdmin && (
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'#344054', display:'block', marginBottom:5, fontFamily:"'Inter',sans-serif" }}>Branch <span style={{ color:'#DC2626' }}>*</span></label>
              <select value={form.branch_id} onChange={e=>fld('branch_id',e.target.value)}
                style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', background:'#fff', color:'#101828' }}>
                <option value="">Select branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#344054', display:'block', marginBottom:5, fontFamily:"'Inter',sans-serif" }}>Title <span style={{ color:'#DC2626' }}>*</span></label>
            <input value={form.title} onChange={e=>fld('title',e.target.value)} placeholder="Reminder title"
              style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:'#101828' }} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#344054', display:'block', marginBottom:5, fontFamily:"'Inter',sans-serif" }}>Priority</label>
            <select value={form.priority} onChange={e=>fld('priority',e.target.value)}
              style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', background:'#fff', color:'#101828' }}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#344054', display:'block', marginBottom:5, fontFamily:"'Inter',sans-serif" }}>Due Date</label>
            <input type="date" value={form.due_date} onChange={e=>fld('due_date',e.target.value)}
              style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:'#101828' }} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#344054', display:'block', marginBottom:5, fontFamily:"'Inter',sans-serif" }}>Notes</label>
            <textarea value={form.body} onChange={e=>fld('body',e.target.value)} rows={3} placeholder="Additional notes"
              style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', resize:'vertical', boxSizing:'border-box', color:'#101828' }} />
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
}
