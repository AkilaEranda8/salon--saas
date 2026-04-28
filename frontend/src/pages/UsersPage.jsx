import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import {
  IconEdit, IconTrash, IconPlus, IconUsers, IconCheck, IconStop,
  ActionBtn, StatCard, PKModal as Modal, FilterBar, SearchBar,
  DataTable, StaffAvatar,
} from '../components/ui/PageKit';

const ROLES = ['superadmin','admin','manager','staff'];
const EMPTY = { username:'', password:'', name:'', email:'', role:'staff', branch_id:'', is_active:true };

function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function IconRefresh() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>;
}

function IconEye({ off }) {
  return off
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
}

const ROLE_COLOR = { superadmin:'#7C3AED', admin:'#2563EB', manager:'#059669', staff:'#475467' };
const ROLE_BG    = { superadmin:'#F5F3FF', admin:'#EFF6FF', manager:'#ECFDF5', staff:'#F9FAFB' };

function IconKey() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>;
}

export default function UsersPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const isAdmin      = ['superadmin','admin'].includes(user?.role);
  const [users, setUsers]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [branches, setBranches]   = useState([]);
  const [filterRole, setFilterRole]     = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [showPwd, setShowPwd]     = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [newPwd, setNewPwd]       = useState('');
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');
  const [pwdTarget, setPwdTarget] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [showFormPwd, setShowFormPwd]   = useState(false);
  const [showNewPwd, setShowNewPwd]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit:20 });
      if (filterRole)   params.set('role', filterRole);
      if (filterBranch) params.set('branchId', filterBranch);
      const res = await api.get(`/users?${params}`);
      setUsers(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch { }
    setLoading(false);
  }, [page, filterRole, filterBranch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/branches?limit=100').then(r => setBranches(r.data.data || [])).catch(() => {});
    api.get('/staff?limit=200').then(r => setStaffList(r.data.data || [])).catch(() => {});
  }, []);

  const openCreate = () => { setEditItem(null); setForm(EMPTY); setFormError(''); setShowFormPwd(false); setShowForm(true); };
  const openEdit   = u  => { setEditItem(u); setForm({ username:u.username, password:'', name:u.name, email:u.email, role:u.role, branch_id:u.branch_id||'', is_active:u.is_active }); setFormError(''); setShowForm(true); };
  const openPwd    = u  => { setPwdTarget(u); setNewPwd(''); setShowNewPwd(false); setShowPwd(true); };

  const handleSave = async () => {
    setFormError('');
    if (!form.name || !form.username) return setFormError('Name and username are required.');
    if (!editItem && !form.password)  return setFormError('Password is required for new user.');
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      editItem ? await api.put(`/users/${editItem.id}`, payload) : await api.post('/users', payload);
      setShowForm(false); load();
    } catch (err) { setFormError(err.response?.data?.message || 'Save failed.'); }
    setSaving(false);
  };

  const handleChangePwd = async () => {
    if (!newPwd || newPwd.length < 6) { alert('Password must be at least 6 characters.'); return; }
    setSaving(true);
    try {
      await api.patch(`/users/${pwdTarget.id}/password`, { password: newPwd });
      setShowPwd(false);
    } catch (err) { alert(err.response?.data?.message || 'Failed.'); }
    setSaving(false);
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this user?')) return;
    try { await api.delete(`/users/${id}`); load(); }
    catch (err) { alert(err.response?.data?.message || 'Delete failed.'); }
  };

  const handleToggle = async u => {
    try { await api.put(`/users/${u.id}`, { ...u, is_active: !u.is_active }); load(); }
    catch { alert('Update failed.'); }
  };

  const pages = Math.ceil(total / 20);
  const filterRoles = isSuperadmin ? ROLES : ROLES.filter(r => r !== 'superadmin');

  const displayed = search
    ? users.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()) || u.username?.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <PageWrapper title="Users" subtitle="Manage portal accounts and access"
      actions={isAdmin && <Button variant="primary" onClick={openCreate} style={{ display:'flex', alignItems:'center', gap:6 }}><IconPlus /> Add User</Button>}>

      {/* Stat Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Total Users"  value={total}   color="#2563EB" icon={<IconUsers />} />
        <StatCard label="Active"       value={users.filter(u => u.is_active).length}  color="#059669" icon={<IconCheck />} />
        <StatCard label="Inactive"     value={users.filter(u => !u.is_active).length} color="#DC2626" icon={<IconStop />} />
      </div>

      {/* Filter Bar */}
      <FilterBar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search users" />
        <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1); }}
          style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
          <option value="">All Roles</option>
          {filterRoles.map(r => <option key={r} value={r} style={{ textTransform:'capitalize' }}>{r}</option>)}
        </select>
        <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setPage(1); }}
          style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
          <option value="">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={[
          { accessorKey:'name', header:'User', meta:{ width:'24%' },
            cell: ({ row }) => {
              const u = row.original;
              const isMe = u.id === user?.id;
              return (
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <StaffAvatar name={u.name} size={34} />
                  <div>
                    <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>{u.name}</div>
                    {isMe && <span style={{ fontSize:10, background:'#EFF6FF', color:'#2563EB', padding:'1px 6px', borderRadius:4, fontWeight:700 }}>You</span>}
                  </div>
                </div>
              );
            }
          },
          { accessorKey:'username', header:'Username', meta:{ width:'16%' },
            cell: ({ getValue }) => <span style={{ fontSize:13, fontFamily:'monospace', color:'#475467', background:'#F9FAFB', padding:'2px 6px', borderRadius:4 }}>{getValue()}</span>
          },
          { accessorKey:'role', header:'Role', meta:{ width:'14%' },
            cell: ({ getValue }) => {
              const r = getValue();
              return <span style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:700, textTransform:'capitalize',
                background:ROLE_BG[r]||'#F9FAFB', color:ROLE_COLOR[r]||'#475467' }}>{r}</span>;
            }
          },
          { id:'branch', header:'Branch', meta:{ width:'16%' },
            accessorFn: r => r.branch?.name || '',
            cell: ({ getValue }) => <span style={{ fontSize:13, color:'#475467' }}>{getValue()}</span>
          },
          { accessorKey:'is_active', header:'Status', meta:{ width:'12%', align:'center' },
            cell: ({ getValue }) => {
              const a = getValue();
              return <span style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600,
                background:a?'#ECFDF5':'#F9FAFB', color:a?'#059669':'#6B7280' }}>{a?'Active':'Inactive'}</span>;
            }
          },
          { id:'actions', header:'Actions', meta:{ width:'18%', align:'center' },
            cell: ({ row }) => {
              const u = row.original;
              const isMe = u.id === user?.id;
              const canManage = isSuperadmin || (isAdmin && u.role !== 'superadmin');
              if (!canManage || isMe) return null;
              return (
                <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                  <ActionBtn onClick={() => openEdit(u)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>
                  <ActionBtn onClick={() => openPwd(u)} title="Change Password" color="#2563EB"><IconKey /></ActionBtn>
                  <ActionBtn onClick={() => handleToggle(u)} title={u.is_active?'Disable':'Enable'} color={u.is_active?'#6B7280':'#059669'}>
                    {u.is_active ? <IconStop /> : <IconCheck />}
                  </ActionBtn>
                  {isSuperadmin && <ActionBtn onClick={() => handleDelete(u.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>}
                </div>
              );
            }
          },
        ]}
        data={displayed}
        loading={loading}
        emptyMessage="No users found"
        emptySub="Try adjusting your filters or add a new user"
      />

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:4 }}>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} onClick={() => setPage(i+1)}
              style={{ width:34, height:34, borderRadius:8, border:'1.5px solid', cursor:'pointer', fontWeight:600, fontSize:13, fontFamily:"'Inter',sans-serif", transition:'all 0.15s',
                borderColor: page===i+1 ? '#2563EB' : '#E4E7EC',
                background:  page===i+1 ? '#2563EB' : '#fff',
                color:       page===i+1 ? '#fff' : '#344054' }}>
              {i+1}
            </button>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Edit User' : 'Add User'} size="md"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{editItem ? 'Update' : 'Create'}</Button></>}>
        {formError && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'9px 13px', borderRadius:9, marginBottom:16, fontSize:13, border:'1px solid #FEE2E2' }}>{formError}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

          {/* Staff picker — only on create */}
          {!editItem && staffList.length > 0 && (
            <div style={{ gridColumn:'1/-1' }}>
              <FormGroup label="Link Staff Member">
                <Select value={form._staffId || ''} onChange={e => {
                  const sid = e.target.value;
                  if (!sid) { setForm(f => ({ ...f, _staffId: '' })); return; }
                  const s = staffList.find(x => String(x.id) === sid);
                  if (!s) return;
                  const autoUser = s.name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
                  setForm(f => ({ ...f, _staffId: sid, name: s.name, branch_id: String(s.branch_id || ''), username: f.username || autoUser }));
                }}>
                  <option value="">— Select staff member —</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.name}{s.branch?.name ? ` (${s.branch.name})` : ''}</option>)}
                </Select>
              </FormGroup>
            </div>
          )}

          <FormGroup label="Full Name" required><Input value={form.name} onChange={e => setForm({...form, name:e.target.value})} /></FormGroup>
          <FormGroup label="Username" required><Input value={form.username} onChange={e => setForm({...form, username:e.target.value})} autoComplete="off" /></FormGroup>
          <div style={{ gridColumn:'1/-1' }}>
            <FormGroup label="Email" helperText="Used for password reset emails">
              <Input type="email" value={form.email || ''} onChange={e => setForm({...form, email:e.target.value})} placeholder="staff@example.com" autoComplete="off" />
            </FormGroup>
          </div>

          {/* Password with generate button */}
          {!editItem && (
            <div style={{ gridColumn:'1/-1' }}>
              <FormGroup label="Password" required>
                <div style={{ display:'flex', gap:6 }}>
                  <div style={{ position:'relative', flex:1 }}>
                    <Input
                      type={showFormPwd ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm({...form, password:e.target.value})}
                      autoComplete="new-password"
                      style={{ paddingRight:34, fontFamily: showFormPwd ? 'monospace' : undefined }}
                    />
                    <button type="button" onClick={() => setShowFormPwd(v => !v)}
                      style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#6B7280', padding:2, display:'flex' }}>
                      <IconEye off={showFormPwd} />
                    </button>
                  </div>
                  <button type="button"
                    onClick={() => { const p = generatePassword(); setForm(f => ({...f, password:p})); setShowFormPwd(true); }}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'0 12px', borderRadius:8, border:'1.5px solid #2563EB', background:'#EFF6FF', color:'#2563EB', fontWeight:600, fontSize:12, cursor:'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
                    <IconRefresh /> Generate
                  </button>
                </div>
              </FormGroup>
            </div>
          )}

          <FormGroup label="Role">
            <Select value={form.role} onChange={e => setForm({...form, role:e.target.value})}>
              {filterRoles.map(r => <option key={r} value={r} style={{ textTransform:'capitalize' }}>{r}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Branch">
            <Select value={form.branch_id} onChange={e => setForm({...form, branch_id:e.target.value})}>
              <option value="">No branch</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormGroup>
          <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" id="userActive" checked={form.is_active} onChange={e => setForm({...form, is_active:e.target.checked})} />
            <label htmlFor="userActive" style={{ fontSize:13, color:'#344054', fontFamily:"'Inter',sans-serif" }}>Active account</label>
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal open={showPwd} onClose={() => setShowPwd(false)} title={`Change Password — ${pwdTarget?.name}`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setShowPwd(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleChangePwd}>Change Password</Button></>}>
        <FormGroup label="New Password (min 6 chars)">
          <div style={{ display:'flex', gap:6 }}>
            <div style={{ position:'relative', flex:1 }}>
              <Input
                type={showNewPwd ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                autoComplete="new-password"
                style={{ paddingRight:34, fontFamily: showNewPwd ? 'monospace' : undefined }}
              />
              <button type="button" onClick={() => setShowNewPwd(v => !v)}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#6B7280', padding:2, display:'flex' }}>
                <IconEye off={showNewPwd} />
              </button>
            </div>
            <button type="button"
              onClick={() => { const p = generatePassword(); setNewPwd(p); setShowNewPwd(true); }}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'0 12px', borderRadius:8, border:'1.5px solid #2563EB', background:'#EFF6FF', color:'#2563EB', fontWeight:600, fontSize:12, cursor:'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
              <IconRefresh /> Generate
            </button>
          </div>
        </FormGroup>
      </Modal>
    </PageWrapper>
  );
}
