import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { PKModal as Modal, StatCard, IconUsers, IconCheck, IconStop, DataTable, ActionBtn } from '../components/ui/PageKit';

const EMPTY = { name:'', address:'', phone:'', manager_name:'', status:'active', color:'#2563EB' };
const BRANCH_COLORS = ['#2563EB','#7C3AED','#0891B2','#059669','#DC2626','#D97706','#DB2777'];

function EditIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}

export default function BranchesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'superadmin';
  const [branches, setBranches] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/branches', { params: { limit:100 } });
      setBranches(Array.isArray(r.data) ? r.data : (r.data?.data ?? []));
    } catch { }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEditItem(null); setForm(EMPTY); setFormErr(''); setShowForm(true); };
  const openEdit = row => { setEditItem(row); setForm({...row}); setFormErr(''); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name) return setFormErr('Branch name is required');
    setSaving(true);
    try {
      editItem ? await api.put(`/branches/${editItem.id}`, form) : await api.post('/branches', form);
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };

  const handleToggle = async branch => {
    const action = branch.status === 'active' ? 'Deactivate' : 'Activate';
    if (!window.confirm(`${action} branch "${branch.name}"?`)) return;
    await api.put(`/branches/${branch.id}`, { ...branch, status: branch.status === 'active' ? 'inactive' : 'active' });
    load();
  };

  const active = branches.filter(b => b.status === 'active');

  const columns = useMemo(() => [
    {
      id: 'name',
      header: 'Branch',
      accessorKey: 'name',
      cell: ({ row: { original: b } }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: b.color || '#2563EB', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#101828' }}>{b.name}</div>
            <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{b.address || '—'}</div>
          </div>
        </div>
      ),
    },
    { id: 'phone', header: 'Phone', accessorKey: 'phone', cell: ({ getValue }) => getValue() || '—' },
    { id: 'manager_name', header: 'Manager', accessorKey: 'manager_name', cell: ({ getValue }) => getValue() || '—' },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: ({ getValue }) => {
        const active = getValue() === 'active';
        return (
          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: active ? '#ECFDF5' : '#F9FAFB', color: active ? '#059669' : '#6B7280' }}>
            {active ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    ...(canEdit ? [{
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { width: '120px', align: 'center' },
      cell: ({ row: { original: b } }) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <ActionBtn onClick={() => openEdit(b)} title="Edit" color="#D97706"><EditIcon /></ActionBtn>
          <ActionBtn onClick={() => handleToggle(b)} title={b.status === 'active' ? 'Deactivate' : 'Activate'} color={b.status === 'active' ? '#6B7280' : '#059669'}>
            {b.status === 'active' ? <IconStop /> : <IconCheck />}
          </ActionBtn>
        </div>
      ),
    }] : []),
  ], [canEdit]);

  return (
    <PageWrapper title="Branches" subtitle={`${branches.length} branch${branches.length !== 1 ? 'es' : ''} configured`}
      actions={canEdit && <Button variant="primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Branch
      </Button>}>

      {/* Stat Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Total Branches" value={branches.length}          color="#2563EB" icon={<IconUsers />} />
        <StatCard label="Active"         value={active.length}            color="#059669" icon={<IconCheck />} />
        <StatCard label="Inactive"       value={branches.length - active.length} color="#6B7280" icon={<IconStop />} />
      </div>

      <DataTable
        columns={columns}
        data={branches}
        loading={loading}
        emptyMessage="No branches configured"
        emptySub="Add your first branch to get started"
        searchableColumns={[
          { id: 'name', title: 'Branch' },
          { id: 'manager_name', title: 'Manager' },
        ]}
        filterableColumns={[{
          id: 'status',
          title: 'Status',
          options: [
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
          ],
        }]}
      />

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Edit Branch' : 'Add Branch'} size="md"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{editItem ? 'Save' : 'Add Branch'}</Button></>}>
        {formErr && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'9px 13px', borderRadius:9, marginBottom:14, fontSize:13, border:'1px solid #FEE2E2' }}>{formErr}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <FormGroup label="Branch Name" required>
            <Input value={form.name} onChange={e => setForm(f=>({...f, name:e.target.value}))} placeholder="e.g. Main Branch" />
          </FormGroup>
          <FormGroup label="Address">
            <Input value={form.address||''} onChange={e => setForm(f=>({...f, address:e.target.value}))} placeholder="Full address" />
          </FormGroup>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Phone">
              <Input value={form.phone||''} onChange={e => setForm(f=>({...f, phone:e.target.value}))} placeholder="0XX XXX XXXX" />
            </FormGroup>
            <FormGroup label="Status">
              <Select value={form.status||'active'} onChange={e => setForm(f=>({...f, status:e.target.value}))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </FormGroup>
          </div>
          <FormGroup label="Manager Name">
            <Input value={form.manager_name||''} onChange={e => setForm(f=>({...f, manager_name:e.target.value}))} />
          </FormGroup>
          <FormGroup label="Branch Color">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
              {BRANCH_COLORS.map(c => (
                <button key={c} onClick={() => setForm(f=>({...f, color:c}))}
                  style={{ width:28, height:28, borderRadius:'50%', background:c, border:`3px solid ${form.color===c?'#101828':'transparent'}`, cursor:'pointer' }} />
              ))}
              <input type="color" value={form.color||'#2563EB'} onChange={e => setForm(f=>({...f, color:e.target.value}))}
                style={{ width:28, height:28, borderRadius:'50%', border:'2px solid #E4E7EC', cursor:'pointer', padding:1 }} />
            </div>
          </FormGroup>
        </div>
      </Modal>
    </PageWrapper>
  );
}
