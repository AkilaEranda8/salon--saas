import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import usePageTheme from '../hooks/usePageTheme';
import { useFeatureGate } from '../hooks/useFeatureGate';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import {
  IconEye, IconEdit, IconTrash, IconPlus, IconUsers, IconClose,
  StaffAvatar, ActionBtn, StatCard, Drawer,
  DataTable,
} from '../components/ui/PageKit';
import {
  STAFF_ROLE_TITLES, STAFF_ROLE_OTHER, staffRoleSelectValue, MANAGEMENT_STAFF_ROLES,
} from '../constants/staffRoleTitles';

const EMPTY = { name:'', phone:'', email:'', role_title:'', branch_ids:[], commission_type:'percentage', commission_value:'', salary_type:'commission_only', base_salary:'', join_date:'', is_active:true };

function formatCommission(type, value) {
  if (value == null || value === '') return '—';
  return type === 'fixed'
    ? `Rs. ${Number(value).toLocaleString()}`
    : `${value}%`;
}

function CommBadge({ type, value, dark = false }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700,
      background: type === 'percentage' ? (dark ? 'rgba(37,99,235,0.2)' : '#EFF6FF') : (dark ? 'rgba(5,150,105,0.2)' : '#ECFDF5'),
      color: type === 'percentage' ? '#2563EB' : '#059669',
    }}>
      {type === 'percentage' ? `${value}%` : `Rs. ${Number(value).toLocaleString()}`}
    </span>
  );
}

function StaffSection({ title, desc, children, dark = false }) {
  return (
    <div style={{
      border: `1px solid ${dark ? '#334155' : '#E4E7EC'}`,
      borderRadius: 14,
      background: dark ? '#0F172A' : '#fff',
    }}>
      <div style={{
        padding: '12px 16px',
        background: dark ? '#1E293B' : '#F8FAFC',
        borderBottom: `1px solid ${dark ? '#334155' : '#EEF2F7'}`,
        borderRadius: '14px 14px 0 0',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#E2E8F0' : '#101828' }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: dark ? '#94A3B8' : '#64748B', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function StaffModal({ open, onClose, title, subtitle, children, footer, size = 'lg', dark = false }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  const widths = { sm: 420, md: 560, lg: 720, xl: 900 };
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,24,40,0.5)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: widths[size] ?? 720,
        background: dark ? '#111827' : '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column',
        boxShadow: dark ? '0 24px 64px rgba(2,6,23,0.55)' : '0 24px 64px rgba(16,24,40,0.2)',
        maxHeight: '92vh', animation: 'staff-modal-pop 0.2s ease',
        border: dark ? '1px solid #334155' : '1px solid #E4E7EC',
      }}>
        <style>{'@keyframes staff-modal-pop { from { opacity:0; transform:scale(0.97) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }'}</style>
        <div style={{
          padding: '18px 22px',
          background: dark
            ? 'linear-gradient(135deg,#4c1d95 0%,#1e3a8a 100%)'
            : 'linear-gradient(135deg,#EDE9FE 0%,#DDD6FE 45%,#EFF6FF 100%)',
          borderBottom: `1px solid ${dark ? '#334155' : '#C4B5FD'}`,
          borderRadius: '18px 18px 0 0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: dark ? 'rgba(255,255,255,0.12)' : '#fff',
              border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #C4B5FD',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: dark ? '#C4B5FD' : '#7C3AED',
              boxShadow: dark ? 'none' : '0 2px 8px rgba(124,58,237,0.15)',
            }}>
              <IconUsers />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: dark ? '#F8FAFC' : '#0F172A', fontFamily: "'Inter',sans-serif", letterSpacing: '-0.02em' }}>{title}</h3>
              {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: dark ? '#CBD5E1' : '#475569', lineHeight: 1.45 }}>{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{
              background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : '#E4E7EC'}`,
              cursor: 'pointer', color: dark ? '#E2E8F0' : '#64748B',
              display: 'flex', alignItems: 'center', borderRadius: 10, padding: 7, flexShrink: 0,
            }}>
            <IconClose />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', background: dark ? '#111827' : '#F8FAFC' }}>{children}</div>
        {footer && (
          <div style={{
            padding: '14px 22px', borderTop: `1px solid ${dark ? '#334155' : '#E4E7EC'}`,
            display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0,
            background: dark ? '#0F172A' : '#fff', borderRadius: '0 0 18px 18px', width: '100%', boxSizing: 'border-box',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function StaffPage() {
  const { user }     = useAuth();
  const { isDark }   = useTheme();
  const { C }        = usePageTheme();
  const photoInputRef = useRef(null);
  const { allowed: serviceWiseCommission } = useFeatureGate('service_wise_commission');
  const { allowed: franchiseCommission } = useFeatureGate('franchise_commission');
  const isManager    = user?.role === 'manager';
  const serviceWiseForUser = (serviceWiseCommission || franchiseCommission) && !isManager;
  const canEdit      = ['superadmin','admin','manager'].includes(user?.role);
  const isSuperAdmin = user?.role === 'superadmin';
  /** Superadmin + admin should load all branches by default; a home branch_id would hide staff in other branches. */
  const seesAllBranches = ['superadmin', 'admin'].includes(user?.role);
  const [staff, setStaff]               = useState([]);
  const [branches, setBranches]         = useState([]);
  const [services, setServices]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [showProfile, setShowProfile]   = useState(false);
  const [editItem, setEditItem]         = useState(null);
  const [profileItem, setProfileItem]   = useState(null);
  const [form, setForm]                 = useState(EMPTY);
  const [specs, setSpecs]               = useState([]);
  /** Per-service override rates keyed by service_id. Empty value = catalogue/default fallback. */
  const [specRates, setSpecRates]       = useState({});
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
        api.get('/staff',    { params: { limit:200 } }),
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
  }, []);
  useEffect(() => { load(); }, [load]);

  const myBranchId = user?.branch_id ?? user?.branchId;
  const branchChoices = (isSuperAdmin || user?.role === 'admin')
    ? branches
    : branches.filter((b) => String(b.id) === String(myBranchId ?? ''));

  const activeServices = services.filter((sv) => sv.is_active !== false);

  const linkAllSpecs = useCallback(() => {
    setSpecs(activeServices.map((sv) => sv.id));
  }, [activeServices]);

  const setSpecRate = (serviceId, patch) => {
    const key = String(serviceId);
    setSpecRates((prev) => ({
      ...prev,
      [key]: {
        commission_type: prev[key]?.commission_type || form.commission_type || 'percentage',
        commission_value: prev[key]?.commission_value ?? '',
        ...patch,
      },
    }));
  };

  const prevSalaryTypeRef = useRef(EMPTY.salary_type);
  useEffect(() => {
    if (!showForm) {
      prevSalaryTypeRef.current = form.salary_type || 'commission_only';
      return;
    }
    if ((form.salary_type || 'commission_only') === prevSalaryTypeRef.current) return;
    prevSalaryTypeRef.current = form.salary_type || 'commission_only';
    if (!serviceWiseForUser || form.salary_type === 'salary_only') {
      if (form.salary_type === 'salary_only') {
        setSpecs([]);
        setSpecRates({});
      }
      return;
    }
    linkAllSpecs();
  }, [showForm, form.salary_type, serviceWiseForUser, linkAllSpecs]);

  const openAdd  = () => {
    setEditItem(null);
    const initial = { ...EMPTY, branch_ids: myBranchId != null ? [String(myBranchId)] : [], join_date: new Date().toISOString().slice(0,10) };
    setForm(initial);
    setSpecRates({});
    if (serviceWiseForUser && initial.salary_type !== 'salary_only') {
      linkAllSpecs();
    } else {
      setSpecs([]);
    }
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
    const specsList = row.specializations || [];
    setSpecs(specsList.map((s) => s.service_id));
    const rates = {};
    specsList.forEach((s) => {
      if (s.commission_value != null && s.commission_value !== '') {
        rates[String(s.service_id)] = {
          commission_type: s.commission_type || 'percentage',
          commission_value: String(s.commission_value),
        };
      }
    });
    setSpecRates(rates);
    setPhotoFile(null);
    setPhotoPreview(row.photo_url || '');
    setRemovePhoto(false);
    setFormErr('');
    setShowForm(true);
  };
  const openProfile = row => { setProfileItem(row); setShowProfile(true); };
  const toggleSpec = (id) => {
    const nid = Number(id);
    setSpecs((sp) => {
      if (sp.includes(nid) || sp.includes(id)) {
        setSpecRates((prev) => {
          const copy = { ...prev };
          delete copy[String(id)];
          return copy;
        });
        return sp.filter((x) => Number(x) !== nid);
      }
      return [...sp, nid];
    });
  };
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
    if (!String(form.role_title || '').trim()) return setFormErr('Select a role for this staff member.');
    const paysCommission = form.salary_type !== 'salary_only';
    let effectiveSpecs = specs;
    if (serviceWiseForUser && paysCommission && !effectiveSpecs.length && activeServices.length) {
      effectiveSpecs = activeServices.map((sv) => sv.id);
    }
    if (paysCommission && (form.commission_value === '' || form.commission_value == null)) {
      return setFormErr('Set a default commission rate for this staff member.');
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone || '',
        email: form.email || '',
        role_title: form.role_title || '',
        branch_ids: form.branch_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n)),
        salary_type: form.salary_type || 'commission_only',
        join_date: form.join_date || null,
        is_active: form.is_active !== false,
        ...(serviceWiseForUser || form.salary_type === 'salary_only'
          ? {
            specializations: effectiveSpecs.map((id) => {
              const rate = specRates[String(id)];
              const hasOverride = rate && rate.commission_value !== '' && rate.commission_value != null;
              return {
                service_id: Number(id),
                ...(hasOverride ? {
                  commission_type: rate.commission_type || 'percentage',
                  commission_value: parseFloat(rate.commission_value),
                } : {}),
              };
            }),
          }
          : { specializations: [] }),
      };
      if (form.salary_type !== 'salary_only') {
        payload.commission_type = form.commission_type || 'percentage';
        if (form.commission_value !== '' && form.commission_value != null) {
          payload.commission_value = parseFloat(form.commission_value);
        }
      }
      if (form.salary_type === 'salary_only' || form.salary_type === 'salary_plus_commission') {
        if (form.base_salary !== '' && form.base_salary != null) {
          payload.base_salary = parseFloat(form.base_salary);
        }
      }
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
  const roleSelectValue = staffRoleSelectValue(form.role_title);
  const isManagementRole = MANAGEMENT_STAFF_ROLES.includes(form.role_title);
  const serviceRoles = STAFF_ROLE_TITLES.filter((r) => !MANAGEMENT_STAFF_ROLES.includes(r));

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
    ...(serviceWiseForUser ? [{
      id: 'services',
      header: 'Services',
      accessorFn: row => (row.specializations||[]).length,
      meta: { width: '13%' },
      cell: ({ row: { original: row } }) => (row.specializations||[]).length > 0
        ? <span style={{ fontSize:13, color:'#475467' }}>{row.specializations.length} service{row.specializations.length!==1?'s':''}</span>
        : <span style={{ color:'#D0D5DD', fontSize:13 }}></span>,
    }] : []),
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
      <StaffModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? 'Edit Staff Member' : 'Add Staff Member'}
        subtitle={editItem ? 'Update profile, branches, and pay settings.' : 'Create a team member — set role, branches, and commission.'}
        size="xl"
        dark={isDark}
        footer={(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              {form.name ? (
                <span style={{ fontWeight: 700, color: C.title }}>
                  {form.name}
                  {form.role_title && <span style={{ fontWeight: 500, color: C.muted, marginLeft: 8 }}>· {form.role_title}</span>}
                  {(form.branch_ids || []).length > 0 && (
                    <span style={{ fontWeight: 500, color: C.muted, marginLeft: 8 }}>
                      · {(form.branch_ids || []).length} branch{(form.branch_ids || []).length !== 1 ? 'es' : ''}
                    </span>
                  )}
                </span>
              ) : (
                <span>Enter staff details to continue</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" loading={saving} onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconUsers />{editItem ? 'Save Changes' : 'Add Staff'}
              </Button>
            </div>
          </div>
        )}
      >
        {formErr && (
          <div style={{
            background: isDark ? '#450a0a' : '#FEF2F2', color: isDark ? '#FCA5A5' : '#DC2626',
            padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13,
            border: `1px solid ${isDark ? '#7f1d1d' : '#FEE2E2'}`, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {formErr}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StaffSection title="Profile" desc="Photo and contact details" dark={isDark}>
              <div style={{
                display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
                padding: 14, borderRadius: 12,
                background: isDark ? '#172033' : '#F8FAFC',
                border: `1px solid ${isDark ? '#334155' : '#E4E7EC'}`,
              }}>
                <StaffAvatar
                  name={form.name || 'Staff'}
                  size={64}
                  photoUrl={removePhoto ? '' : (photoPreview || form.photo_url || '')}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 160 }}>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setPhotoFile(f || null);
                      if (f) {
                        setPhotoPreview(URL.createObjectURL(f));
                        setRemovePhoto(false);
                      }
                    }}
                  />
                  <Button variant="secondary" size="sm" onClick={() => photoInputRef.current?.click()}>
                    {photoPreview || form.photo_url ? 'Change Photo' : 'Upload Photo'}
                  </Button>
                  {(photoPreview || form.photo_url) && !removePhoto && (
                    <button
                      type="button"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(''); setRemovePhoto(true); }}
                      style={{ border: 'none', background: 'none', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                    >
                      Remove photo
                    </button>
                  )}
                  <span style={{ fontSize: 11, color: C.muted }}>JPG or PNG, max 2MB</span>
                </div>
              </div>
              <FormGroup label="Full Name" required>
                <Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Nimal Perera" />
              </FormGroup>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <FormGroup label="Phone">
                  <Input value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07X XXX XXXX" />
                </FormGroup>
                <FormGroup label="Email">
                  <Input type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
                </FormGroup>
              </div>
            </StaffSection>

            <StaffSection title="Employment" desc="Join date and account status" dark={isDark}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <FormGroup label="Join Date">
                  <Input type="date" value={form.join_date || ''} onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))} />
                </FormGroup>
                <FormGroup label="Status">
                  <Select value={form.is_active ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </FormGroup>
              </div>
              {form.salary_type === 'salary_only' && services.length > 0 && (
                <FormGroup label="Specializations">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {services.map(sv => {
                      const active = specs.includes(sv.id);
                      return (
                        <button
                          key={sv.id}
                          type="button"
                          onClick={() => toggleSpec(sv.id)}
                          style={{
                            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                            border: `1.5px solid ${active ? '#7C3AED' : (isDark ? '#334155' : '#E4E7EC')}`,
                            background: active ? (isDark ? 'rgba(124,58,237,0.2)' : '#F5F3FF') : (isDark ? '#0F172A' : '#fff'),
                            color: active ? '#7C3AED' : C.label,
                          }}
                        >
                          {sv.name}
                        </button>
                      );
                    })}
                  </div>
                </FormGroup>
              )}
            </StaffSection>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StaffSection title="Role & Branches" desc="Job title and assigned locations" dark={isDark}>
              <FormGroup label="Role" required>
                {franchiseCommission ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Branch management (override commission)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {MANAGEMENT_STAFF_ROLES.map((role) => {
                        const active = form.role_title === role;
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, role_title: role }))}
                            style={{
                              padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                              border: active ? '2px solid #D97706' : `1.5px solid ${isDark ? '#334155' : '#E4E7EC'}`,
                              background: active ? (isDark ? 'rgba(217,119,6,0.15)' : '#FFFBEB') : (isDark ? '#0F172A' : '#fff'),
                              color: active ? '#D97706' : C.label,
                            }}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Service staff
                    </div>
                    <Select
                      value={isManagementRole ? '' : roleSelectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        if (v === STAFF_ROLE_OTHER) setForm((f) => ({ ...f, role_title: '' }));
                        else setForm((f) => ({ ...f, role_title: v }));
                      }}
                    >
                      <option value="">Select service role...</option>
                      {serviceRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                      <option value={STAFF_ROLE_OTHER}>Other</option>
                    </Select>
                    {roleSelectValue === STAFF_ROLE_OTHER && (
                      <Input value={form.role_title || ''} onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))} placeholder="Enter custom role" />
                    )}
                  </div>
                ) : (
                  <>
                    <Select
                      value={roleSelectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === STAFF_ROLE_OTHER) setForm((f) => ({ ...f, role_title: '' }));
                        else setForm((f) => ({ ...f, role_title: v }));
                      }}
                    >
                      <option value="">Select role...</option>
                      {STAFF_ROLE_TITLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      <option value={STAFF_ROLE_OTHER}>Other</option>
                    </Select>
                    {roleSelectValue === STAFF_ROLE_OTHER && (
                      <Input value={form.role_title || ''} onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))} placeholder="Enter custom role" style={{ marginTop: 8 }} />
                    )}
                  </>
                )}
              </FormGroup>
              <FormGroup label="Branches" required>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {branchChoices.map(b => {
                    const active = (form.branch_ids || []).includes(String(b.id));
                    const locked = user?.role === 'manager' && branchChoices.length <= 1;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        disabled={locked}
                        onClick={() => toggleBranch(b.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: active ? 700 : 500,
                          cursor: locked ? 'default' : 'pointer',
                          border: `1.5px solid ${active ? '#2563EB' : (isDark ? '#334155' : '#E4E7EC')}`,
                          background: active ? (isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF') : (isDark ? '#0F172A' : '#fff'),
                          color: active ? '#2563EB' : C.label,
                          opacity: locked && !active ? 0.6 : 1,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color || '#2563EB', flexShrink: 0 }} />
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </FormGroup>
            </StaffSection>

            <StaffSection title="Pay & Commission" desc="Salary type, default rate, and optional per-service rates" dark={isDark}>
              <FormGroup label="Salary Type">
                <Select value={form.salary_type || 'commission_only'} onChange={e => setForm(f => ({ ...f, salary_type: e.target.value }))}>
                  <option value="commission_only">Commission Only</option>
                  <option value="salary_only">Fixed Salary Only</option>
                  <option value="salary_plus_commission">Salary + Commission</option>
                </Select>
              </FormGroup>
              {(form.salary_type === 'salary_only' || form.salary_type === 'salary_plus_commission') && (
                <FormGroup label="Base Salary (Rs./month)">
                  <Input type="number" min="0" value={form.base_salary || ''} onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} placeholder="e.g. 30000" />
                </FormGroup>
              )}
              {form.salary_type !== 'salary_only' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <FormGroup label="Commission Type">
                    <Select value={form.commission_type || 'percentage'} onChange={e => setForm(f => ({ ...f, commission_type: e.target.value }))}>
                      <option value="percentage">Percentage %</option>
                      {serviceWiseForUser && <option value="fixed">Fixed per Service</option>}
                    </Select>
                  </FormGroup>
                  <FormGroup label={
                    franchiseCommission && isManagementRole && form.commission_type === 'percentage'
                      ? 'Manager Override %'
                      : (form.commission_type === 'percentage' ? 'Default Commission %' : 'Default Commission (Rs.)')
                  }>
                    <Input
                      type="number" min="0" step="0.01" max={franchiseCommission && isManagementRole ? '100' : undefined}
                      value={form.commission_value || ''}
                      onChange={e => setForm(f => ({ ...f, commission_value: e.target.value }))}
                      placeholder={franchiseCommission && isManagementRole ? 'e.g. 5' : 'e.g. 10'}
                    />
                  </FormGroup>
                </div>
              )}
              {form.salary_type !== 'salary_only' && form.commission_value !== '' && form.commission_value != null && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 14px', borderRadius: 10,
                  background: isDark ? '#172033' : '#F0FDF4',
                  border: `1px solid ${isDark ? '#334155' : '#BBF7D0'}`,
                }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Preview</span>
                  <CommBadge type={form.commission_type || 'percentage'} value={form.commission_value} dark={isDark} />
                </div>
              )}
              {serviceWiseForUser && form.salary_type !== 'salary_only' && activeServices.length > 0 && (
                <FormGroup label="Service Rates (optional)">
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.45 }}>
                    Set a different rate for each service. Leave blank to use the service catalogue rate or this staff member&apos;s default.
                  </div>
                  <div style={{
                    border: `1px solid ${isDark ? '#334155' : '#E4E7EC'}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    maxHeight: 280,
                    overflowY: 'auto',
                    background: isDark ? '#0B1220' : '#fff',
                  }}>
                    {activeServices.map((sv, idx) => {
                      const linked = specs.some((id) => Number(id) === Number(sv.id));
                      const rate = specRates[String(sv.id)] || {};
                      const type = rate.commission_type || form.commission_type || 'percentage';
                      const value = rate.commission_value ?? '';
                      const catalogue = sv.commission_value != null && sv.commission_value !== ''
                        ? formatCommission(sv.commission_type, sv.commission_value)
                        : null;
                      const fallback = catalogue
                        || formatCommission(form.commission_type || 'percentage', form.commission_value);
                      return (
                        <div
                          key={sv.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '22px minmax(0, 1.2fr) 110px 100px',
                            gap: 8,
                            alignItems: 'center',
                            padding: '10px 12px',
                            borderBottom: idx !== activeServices.length - 1 ? `1px solid ${isDark ? '#1E293B' : '#F1F5F9'}` : 'none',
                            background: linked ? (isDark ? 'rgba(37,99,235,0.08)' : '#F8FBFF') : 'transparent',
                            opacity: linked ? 1 : 0.55,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={linked}
                            onChange={() => toggleSpec(sv.id)}
                            style={{ width: 16, height: 16, accentColor: '#2563EB' }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#E2E8F0' : '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {sv.name}
                            </div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                              {value !== '' ? `Custom ${formatCommission(type, value)}` : `Fallback ${fallback}`}
                            </div>
                          </div>
                          <Select
                            value={type}
                            disabled={!linked}
                            onChange={(e) => setSpecRate(sv.id, { commission_type: e.target.value })}
                            style={{ fontSize: 12, padding: '6px 8px' }}
                          >
                            <option value="percentage">%</option>
                            <option value="fixed">Fixed Rs.</option>
                          </Select>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!linked}
                            value={value}
                            onChange={(e) => setSpecRate(sv.id, { commission_value: e.target.value })}
                            placeholder="Rate"
                            style={{ fontSize: 12, padding: '6px 8px' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </FormGroup>
              )}
              {form.salary_type !== 'salary_only' && (
                <div style={{
                  padding: '12px 14px',
                  background: serviceWiseForUser ? (isDark ? 'rgba(37,99,235,0.12)' : '#F0F9FF') : (isDark ? 'rgba(5,150,105,0.12)' : '#F0FDF4'),
                  border: `1px solid ${serviceWiseForUser ? (isDark ? 'rgba(96,165,250,0.25)' : '#BAE6FD') : (isDark ? 'rgba(52,211,153,0.25)' : '#BBF7D0')}`,
                  borderRadius: 12, fontSize: 12, color: C.tipText || (isDark ? '#CBD5E1' : '#374151'), lineHeight: 1.5,
                }}>
                  {franchiseCommission && isManagementRole ? (
                    <>
                      <strong>Branch Manager / Salon Manager:</strong> override commission % applies to total service amount when other staff complete paid work.
                    </>
                  ) : serviceWiseForUser ? (
                    <>
                      Use <strong>Service Rates</strong> above for staff-specific amounts. Blank rows fall back to the service catalogue rate, then this staff default.
                    </>
                  ) : (
                    <>
                      Default commission applies to <strong>all services</strong> when this staff member completes work.
                    </>
                  )}
                </div>
              )}
            </StaffSection>
          </div>
        </div>
      </StaffModal>

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
            {((serviceWiseForUser && p.salary_type !== 'salary_only') || p.salary_type === 'salary_only')
              && (p.specializations||[]).length > 0 && (
              <div>
                <h4 style={{ margin:'0 0 10px', fontSize:13, fontWeight:700, color:'#475467', textTransform:'uppercase' }}>
                  {serviceWiseForUser && p.salary_type !== 'salary_only' ? 'Linked Services' : 'Specializations'}
                </h4>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {p.specializations.map((s) => {
                    const svc = services.find((sv) => sv.id === s.service_id || sv.id === s.service?.id);
                    const staffOverride = s.commission_value != null && s.commission_value !== ''
                      ? formatCommission(s.commission_type || 'percentage', s.commission_value)
                      : null;
                    const catalogue = !staffOverride && svc?.commission_value != null && svc.commission_value !== ''
                      ? formatCommission(svc.commission_type, svc.commission_value)
                      : null;
                    return (
                      <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#F9FAFB', borderRadius:8, fontSize:13 }}>
                        <span style={{ fontWeight:600, color:'#344054' }}>{s.service?.name || svc?.name || s.service_id}</span>
                        {serviceWiseForUser && p.salary_type !== 'salary_only' && (
                          <span style={{ fontSize:12, color: staffOverride ? '#059669' : '#667085', fontWeight: staffOverride ? 700 : 500 }}>
                            {staffOverride
                              ? staffOverride
                              : (catalogue
                                ? `Catalogue ${catalogue}`
                                : `Default ${p.commission_type === 'percentage' ? `${p.commission_value}%` : `Rs.${Number(p.commission_value||0).toLocaleString()}`}`)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </PageWrapper>
  );
}
