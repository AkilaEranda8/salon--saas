import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import {
  IconEye, IconEdit, IconTrash, IconPlus, IconUsers,
  StaffAvatar, ActionBtn, StatCard, Drawer, PKModal as Modal,
  FilterBar, DataTable,
} from '../components/ui/PageKit';

const EMPTY = { name:'', phone:'', email:'', role_title:'', branch_ids:[], commission_type:'percentage', commission_value:'', salary_type:'commission_only', base_salary:'', join_date:'', is_active:true };

function CommBadge({ type, value }) {
  return (
    <span style={{ padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700, background:type==='percentage'?'#EFF6FF':'#ECFDF5', color:type==='percentage'?'#2563EB':'#059669' }}>
      {type==='percentage' ? `${value}%` : `Rs. ${Number(value).toLocaleString()}`}
    </span>
  );
}

export default function StaffPage() {
  const { user }     = useAuth();
  const canEdit      = ['superadmin','admin','manager'].includes(user?.role);
  const isSuperAdmin = user?.role === 'superadmin';
  /** Superadmin + admin should load all branches by default; a home branch_id would hide staff in other branches. */
  const seesAllBranches = ['superadmin', 'admin'].includes(user?.role);
  const [staff, setStaff]               = useState([]);
  const [branches, setBranches]         = useState([]);
  const [services, setServices]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filterBranch, setFilterBranch] = useState(
    seesAllBranches ? '' : (user?.branch_id ?? user?.branchId ?? ''),
  );
  const [showForm, setShowForm]         = useState(false);
  const [showProfile, setShowProfile]   = useState(false);
  const [editItem, setEditItem]         = useState(null);
  const [profileItem, setProfileItem]   = useState(null);
  const [form, setForm]                 = useState(EMPTY);
  const [specs, setSpecs]               = useState([]);
  const [saving, setSaving]             = useState(false);
  const [formErr, setFormErr]           = useState('');
  const [loadErr, setLoadErr]         = useState('');
  const [photoFile, setPhotoFile]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [removePhoto, setRemovePhoto]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr('');
    try {
      const [stR, brR, svR] = await Promise.all([
        api.get('/staff',    { params: { limit:200, ...(filterBranch ? { branchId: filterBranch } : {}) } }),
        api.get('/branches', { params: { limit:100 } }),
        api.get('/services', { params: { limit:200 } }),
      ]);
      setStaff(Array.isArray(stR.data) ? stR.data : (stR.data?.data ?? []));
      setBranches(Array.isArray(brR.data) ? brR.data : (brR.data?.data ?? []));
      setServices(Array.isArray(svR.data) ? svR.data : (svR.data?.data ?? []));
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Failed to load data';
      setLoadErr(msg);
      setStaff([]);
    }
    setLoading(false);
  }, [filterBranch]);
  useEffect(() => { load(); }, [load]);

  const myBranchId = user?.branch_id ?? user?.branchId;
  const branchChoices = (isSuperAdmin || user?.role === 'admin')
    ? branches
    : branches.filter((b) => String(b.id) === String(myBranchId ?? ''));

  const openAdd  = () => {
    setEditItem(null);
    setForm({ ...EMPTY, branch_ids: myBranchId != null ? [String(myBranchId)] : [], join_date: new Date().toISOString().slice(0,10) });
    setSpecs([]);
    setPhotoFile(null);
    setPhotoPreview('');
    setRemovePhoto(false);
    setFormErr('');
    setShowForm(true);
  };
  const openEdit = row => {
    const fromM2m = (row.branches && row.branches.length)
      ? row.branches.map((b) => String(b.id))
      : (row.branch_id != null || row.branch?.id != null ? [String(row.branch_id ?? row.branch?.id)] : []);
    setEditItem(row);
    setForm({ ...row, branch_ids: fromM2m, join_date: row.join_date?.slice(0,10)||'' });
    setSpecs((row.specializations||[]).map(s=>s.service_id));
    setPhotoFile(null);
    setPhotoPreview(row.photo_url || '');
    setRemovePhoto(false);
    setFormErr('');
    setShowForm(true);
  };
  const openProfile = row => { setProfileItem(row); setShowProfile(true); };
  const toggleSpec  = id => setSpecs(sp => sp.includes(id) ? sp.filter(x=>x!==id) : [...sp, id]);
  const toggleBranch = (id) => {
    const s = String(id);
    setForm((f) => {
      if (user?.role === 'manager' && branchChoices.length <= 1) {
        return { ...f, branch_ids: myBranchId != null ? [String(myBranchId)] : [] };
      }
      const set = new Set(f.branch_ids || []);
      if (set.has(s)) set.delete(s); else set.add(s);
      return { ...f, branch_ids: [...set] };
    });
  };

  const handleSave = async () => {
    if (!form.name || !form.branch_ids?.length) return setFormErr('Name and at least one branch are required');
    setSaving(true);
    try {
      const payload = {
        ...form,
        branch_ids: form.branch_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n)),
        specializations: specs.map((service_id) => ({
          service_id,
          commission_type: form.commission_type || 'percentage',
          commission_value: form.commission_value !== '' && form.commission_value != null
            ? parseFloat(form.commission_value)
            : null,
        })),
      };
      delete payload.branch_id;
      const saved = editItem ? await api.put(`/staff/${editItem.id}`, payload) : await api.post('/staff', payload);
      const staffId = editItem?.id || saved?.data?.id;
      if (staffId && removePhoto) {
        await api.delete(`/staff/${staffId}/photo`);
      }
      if (staffId && photoFile) {
        const fd = new FormData();
        fd.append('photo', photoFile);
        await api.post(`/staff/${staffId}/photo`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };
  const handleDelete = async id => { if (!window.confirm('Delete this staff member?')) return; await api.delete(`/staff/${id}`); load(); };

  const activeCount = staff.filter(s => s.is_active !== false).length;
  const p = profileItem;

  const columns = [
    {
      id: 'name',
      header: 'Staff Member',
      accessorFn: row => `${row.name || ''} ${row.role_title || ''} ${row.phone || ''} ${row.email || ''}`.trim(),
      meta: { width: '22%' },
      cell: ({ row: { original: row } }) => (
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <StaffAvatar name={row.name} size={36} photoUrl={row.photo_url} />
          <div>
            <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>{row.name}</div>
            <div style={{ fontSize:12, color:'#98A2B3', marginTop:1 }}>{row.role_title}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'branch',
      header: 'Branches',
      accessorFn: row => (row.branches && row.branches.length ? row.branches.map(b=>b.name).join(', ') : row.branch?.name),
      meta: { width: '18%' },
      cell: ({ row: { original: row } }) => {
        const list = (row.branches && row.branches.length) ? row.branches : (row.branch ? [row.branch] : []);
        if (!list.length) return null;
        return (
          <span style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:6 }}>
            {list.map((b) => (
              <span key={b.id} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:b.color||'#2563EB', display:'inline-block' }} />
                <span style={{ fontSize:13, color:'#475467' }}>{b.name}</span>
              </span>
            ))}
          </span>
        );
      },
    },
    {
      id: 'phone',
      header: 'Phone',
      accessorFn: row => row.phone,
      meta: { width: '12%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize:13, color:'#475467' }}>{row.phone||''}</span>,
    },
    {
      id: 'email',
      header: 'Email',
      accessorFn: row => row.email,
      meta: { width: '16%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize:13, color:'#475467' }}>{row.email||''}</span>,
    },
    {
      id: 'commission',
      header: 'Commission',
      accessorFn: row => row.commission_value,
      meta: { width: '14%' },
      cell: ({ row: { original: row } }) => <CommBadge type={row.commission_type} value={row.commission_value} />,
    },
    {
      id: 'services',
      header: 'Services',
      accessorFn: row => (row.specializations||[]).length,
      meta: { width: '13%' },
      cell: ({ row: { original: row } }) => (row.specializations||[]).length > 0
        ? <span style={{ fontSize:13, color:'#475467' }}>{row.specializations.length} service{row.specializations.length!==1?'s':''}</span>
        : <span style={{ color:'#D0D5DD', fontSize:13 }}></span>,
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: row => row.is_active,
      meta: { width: '12%' },
      cell: ({ row: { original: row } }) => (
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:row.is_active!==false?'#ECFDF5':'#F8FAFC', color:row.is_active!==false?'#059669':'#64748B' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:row.is_active!==false?'#059669':'#64748B' }} />
          {row.is_active!==false ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { width: '10%', align: 'center' },
      cell: ({ row: { original: row } }) => (
        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
          <ActionBtn onClick={() => openProfile(row)} title="View Profile" color="#2563EB"><IconEye /></ActionBtn>
          {canEdit && <ActionBtn onClick={() => openEdit(row)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>}
          {canEdit && <ActionBtn onClick={() => handleDelete(row.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>}
        </div>
      ),
    },
  ];

  return (
    <PageWrapper title="Staff" subtitle={`${staff.length} members, ${activeCount} active`}
      actions={canEdit && <Button variant="primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}><IconPlus /> Add Staff</Button>}>

      {/* Stat Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Total Staff"  value={staff.length}  color="#2563EB" icon={<IconUsers />} />
        <StatCard label="Active"       value={activeCount}   color="#059669" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
        <StatCard label="Inactive"     value={staff.length - activeCount} color="#DC2626" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>} />
        <StatCard label="Branches"     value={[...new Set(staff.flatMap(s => [...(s.branches||[]).map(b=>b.id), s.branch_id].filter(Boolean)))].length} color="#D97706" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>} />
      </div>

      {loadErr && (
        <div style={{ background:'#FEF2F2', color:'#B91C1C', padding:'10px 14px', borderRadius:9, marginBottom:12, fontSize:13, border:'1px solid #FECACA' }}>
          {loadErr}
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar>
        {seesAllBranches && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={staff}
        loading={loading}
        emptyMessage="No staff found"
        emptySub="Try adjusting your search or add a staff member"
        searchableColumns={[{ id: 'name', title: 'Staff' }]}
      />

      {/* Add / Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Edit Staff' : 'Add Staff Member'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>{editItem ? 'Save' : 'Add Staff'}</Button></>}>
        {formErr && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'9px 13px', borderRadius:9, marginBottom:16, fontSize:13, border:'1px solid #FEE2E2' }}>{formErr}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <FormGroup label="Profile Photo">
            <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
              <StaffAvatar
                name={form.name || 'Staff'}
                size={56}
                photoUrl={removePhoto ? '' : (photoPreview || form.photo_url || '')}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPhotoFile(f || null);
                  if (f) {
                    setPhotoPreview(URL.createObjectURL(f));
                    setRemovePhoto(false);
                  }
                }}
              />
              {(photoPreview || form.photo_url) && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoPreview('');
                    setRemovePhoto(true);
                  }}
                  style={{ border:'1px solid #FECACA', color:'#DC2626', background:'#FEF2F2', borderRadius:8, padding:'4px 10px', cursor:'pointer' }}
                >
                  Remove photo
                </button>
              )}
            </div>
          </FormGroup>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Full Name" required><Input value={form.name||''} onChange={e => setForm(f=>({...f, name:e.target.value}))} /></FormGroup>
            <FormGroup label="Phone"><Input value={form.phone||''} onChange={e => setForm(f=>({...f, phone:e.target.value}))} /></FormGroup>
          </div>
          <FormGroup label="Email"><Input type="email" value={form.email||''} onChange={e => setForm(f=>({...f, email:e.target.value}))} placeholder="name@example.com" /></FormGroup>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Role / Title"><Input value={form.role_title||''} onChange={e => setForm(f=>({...f, role_title:e.target.value}))} placeholder="e.g. Senior Stylist" /></FormGroup>
            <FormGroup label="Branches" required>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:4 }}>
                {branchChoices.map(b => (
                  <label key={b.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:(user?.role === 'manager' && branchChoices.length <= 1)?'default':'pointer', fontSize:13, color:'#344054' }}>
                    <input
                      type="checkbox"
                      checked={(form.branch_ids||[]).includes(String(b.id))}
                      onChange={() => toggleBranch(b.id)}
                      disabled={user?.role === 'manager' && branchChoices.length <= 1}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </FormGroup>
          </div>
          {/* Salary & Commission */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Salary Type">
              <Select value={form.salary_type||'commission_only'} onChange={e => setForm(f=>({...f, salary_type:e.target.value}))}>
                <option value="commission_only">Commission Only</option>
                <option value="salary_only">Fixed Salary Only</option>
                <option value="salary_plus_commission">Salary + Commission</option>
              </Select>
            </FormGroup>
            {(form.salary_type === 'salary_only' || form.salary_type === 'salary_plus_commission') && (
              <FormGroup label="Base Salary (Rs./month)">
                <Input type="number" min="0" value={form.base_salary||''} onChange={e => setForm(f=>({...f, base_salary:e.target.value}))} placeholder="e.g. 30000" />
              </FormGroup>
            )}
          </div>
          {form.salary_type !== 'salary_only' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <FormGroup label="Commission Type">
                <Select value={form.commission_type||'percentage'} onChange={e => setForm(f=>({...f, commission_type:e.target.value}))}>
                  <option value="percentage">Percentage %</option>
                  <option value="fixed">Fixed per Service</option>
                </Select>
              </FormGroup>
              <FormGroup label={form.commission_type==='percentage' ? 'Rate (%)' : 'Amount (Rs.)'}>
                <Input type="number" min="0" value={form.commission_value||''} onChange={e => setForm(f=>({...f, commission_value:e.target.value}))} />
              </FormGroup>
            </div>
          )}
          <FormGroup label="Join Date"><Input type="date" value={form.join_date||''} onChange={e => setForm(f=>({...f, join_date:e.target.value}))} /></FormGroup>
          {form.salary_type !== 'salary_only' && services.length > 0 && (
            <FormGroup label="Services (commission)">
              <p style={{ fontSize:12, color:'#667085', margin:'0 0 10px', lineHeight:1.45 }}>
                Select services this staff performs. The commission rate above applies to <strong>every selected service</strong>.
              </p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {services.filter((sv) => sv.is_active !== false).map(sv => {
                  const selected = specs.includes(sv.id);
                  return (
                    <label key={sv.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#344054', background:selected?'#EFF6FF':'#F9FAFB', border:selected?'1.5px solid #2563EB':'1.5px solid #E4E7EC', borderRadius:10, padding:'6px 12px' }}>
                      <input type="checkbox" checked={selected} onChange={()=>toggleSpec(sv.id)} />
                      <span>{sv.name}</span>
                      {selected && form.commission_value !== '' && form.commission_value != null && (
                        <CommBadge type={form.commission_type||'percentage'} value={form.commission_value} />
                      )}
                    </label>
                  );
                })}
              </div>
              {specs.length > 0 && (!form.commission_value && form.commission_value !== 0) && (
                <p style={{ fontSize:12, color:'#D97706', marginTop:8 }}>Set a commission rate so all selected services earn commission on payments.</p>
              )}
            </FormGroup>
          )}
          {form.salary_type === 'salary_only' && services.length > 0 && (
            <FormGroup label="Specializations">
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {services.map(sv => (
                  <label key={sv.id} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, color:'#344054', background:specs.includes(sv.id)?'#EFF6FF':'#F9FAFB', border:specs.includes(sv.id)?'1.5px solid #2563EB':'1.5px solid #E4E7EC', borderRadius:8, padding:'4px 10px' }}>
                    <input type="checkbox" checked={specs.includes(sv.id)} onChange={()=>toggleSpec(sv.id)} style={{ display:'none' }} />
                    {sv.name}
                  </label>
                ))}
              </div>
            </FormGroup>
          )}
          <FormGroup label="Status">
            <Select value={form.is_active ? 'true' : 'false'} onChange={e => setForm(f=>({...f, is_active:e.target.value==='true'}))}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </FormGroup>
        </div>
      </Modal>

      {/* Profile Drawer */}
      <Drawer open={showProfile} onClose={() => setShowProfile(false)} title="Staff Profile" width={520}
        footer={canEdit && <Button variant="primary" onClick={() => { setShowProfile(false); openEdit(p); }} style={{ display:'flex', alignItems:'center', gap:6 }}><IconEdit /> Edit Profile</Button>}>
        {p && (
          <div style={{ fontFamily:"'Inter',sans-serif" }}>
            <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24, padding:16, background:'#F9FAFB', borderRadius:12 }}>
              <StaffAvatar name={p.name} size={64} photoUrl={p.photo_url} />
              <div>
                <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:'#101828' }}>{p.name}</h2>
                <p style={{ margin:'4px 0 8px', color:'#475467', fontSize:14 }}>{p.role_title}</p>
                <CommBadge type={p.commission_type} value={p.commission_value} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
              {[
                { label:'Branches',  value: (p.branches && p.branches.length) ? p.branches.map(b=>b.name).join(', ') : (p.branch?.name||'') },
                { label:'Phone',   value: p.phone||'' },
                { label:'Email',   value: p.email||'' },
                { label:'Joined',  value: p.join_date ? new Date(p.join_date).toLocaleDateString() : '' },
                { label:'Status',  value: p.is_active!==false ? 'Active' : 'Inactive' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background:'#F9FAFB', borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#101828' }}>{value}</div>
                </div>
              ))}
            </div>
            {(p.specializations||[]).length > 0 && (
              <div>
                <h4 style={{ margin:'0 0 10px', fontSize:13, fontWeight:700, color:'#475467', textTransform:'uppercase' }}>Specializations</h4>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {p.specializations.map(s => (
                    <span key={s.id} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:16, background:'#EFF6FF', color:'#2563EB', fontSize:12, fontWeight:600 }}>
                      {s.service?.name || s.service_id}
                      <CommBadge type={s.commission_type || p.commission_type} value={s.commission_value ?? p.commission_value} />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </PageWrapper>
  );
}
