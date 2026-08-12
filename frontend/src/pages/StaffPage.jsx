import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
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
  STAFF_ROLE_TITLES, STAFF_ROLE_OTHER, staffRoleSelectValue,
} from '../constants/staffRoleTitles';
import { useToast } from '../components/ui/Toast';

const EMPTY = { name:'', phone:'', email:'', role_title:'', branch_ids:[], commission_type:'percentage', commission_value:'', salary_type:'commission_only', base_salary:'', join_date:'', is_active:true, available_online:false };

const WEEKDAYS = [
  { key: '0', label: 'Sunday' },
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
];

/** Searchable multi-select with checkboxes for assignable services. */
function AssignableServicesSelect({ services, selected, onChange, dark = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const selectedIds = useMemo(
    () => Array.from(new Set((selected || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))),
    [selected],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => {
      const hay = `${s.name || ''} ${s.category || ''} ${s.subcategory || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [services, search]);

  const toggle = (id) => {
    const n = Number(id);
    onChange(selectedIds.includes(n) ? selectedIds.filter((x) => x !== n) : [...selectedIds, n]);
  };

  const setOpenState = (next) => {
    const value = typeof next === 'function' ? next(open) : next;
    setOpen(value);
    if (!value) setSearch('');
  };

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const update = () => {
      const rect = rootRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchRef.current?.focus?.(), 0);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', minWidth: 0 }}>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenState((o) => !o); } }}
        onClick={() => setOpenState((o) => !o)}
        style={{
          height: 42, padding: '0 12px', borderRadius: 10,
          border: `1.5px solid ${open ? '#2563EB' : (dark ? '#334155' : '#D0D5DD')}`,
          background: dark ? '#0B1220' : '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
          boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none',
        }}
      >
        <span style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: selectedIds.length ? (dark ? 'rgba(37,99,235,0.25)' : '#EFF6FF') : (dark ? '#1E293B' : '#F2F4F7'),
          color: selectedIds.length ? '#2563EB' : (dark ? '#64748B' : '#98A2B3'),
          fontSize: 11, fontWeight: 800,
        }}>
          {selectedIds.length || '0'}
        </span>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: selectedIds.length ? 600 : 500,
          color: selectedIds.length ? (dark ? '#E2E8F0' : '#101828') : (dark ? '#64748B' : '#98A2B3'),
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'none',
        }}>
          {selectedIds.length === 0
            ? 'Select services…'
            : selectedIds.length === services.length
              ? `All ${services.length} services selected`
              : `${selectedIds.length} of ${services.length} services selected`}
        </span>
        <span style={{ fontSize: 12, color: '#98A2B3', userSelect: 'none', flexShrink: 0 }}>
          {open ? '▴' : '▾'}
        </span>
      </div>
      {open && createPortal(
        <>
          <div onClick={() => setOpenState(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: Math.max(menuPos.width, 280),
            zIndex: 9999,
            background: dark ? '#1E293B' : '#fff',
            border: `1.5px solid ${dark ? '#334155' : '#E4E7EC'}`,
            borderRadius: 12,
            boxShadow: dark ? '0 12px 32px rgba(2,6,23,0.5)' : '0 12px 32px rgba(16,24,40,0.14)',
            maxHeight: 360,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px 8px', borderBottom: `1px solid ${dark ? '#334155' : '#F2F4F7'}`, flexShrink: 0 }}>
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search services…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '9px 12px', borderRadius: 8, fontSize: 13,
                  border: `1px solid ${dark ? '#475569' : '#D0D5DD'}`,
                  background: dark ? '#0B1220' : '#F9FAFB',
                  color: dark ? '#E2E8F0' : '#101828',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: dark ? '#64748B' : '#98A2B3' }}>
                  {selectedIds.length} selected
                </span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => onChange(services.map((s) => Number(s.id)))}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, color: '#2563EB', padding: 0,
                    }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, color: dark ? '#94A3B8' : '#64748B', padding: 0,
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: 260 }}>
              {services.length === 0 && (
                <div style={{ padding: '14px 14px', fontSize: 13, color: dark ? '#64748B' : '#98A2B3' }}>No services found</div>
              )}
              {services.length > 0 && filtered.length === 0 && (
                <div style={{ padding: '14px 14px', fontSize: 13, color: dark ? '#64748B' : '#98A2B3' }}>
                  No services match “{search.trim()}”
                </div>
              )}
              {filtered.map((s) => {
                const checked = selectedIds.includes(Number(s.id));
                return (
                  <label
                    key={s.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer',
                      background: checked ? (dark ? 'rgba(37,99,235,0.15)' : '#F0F9FF') : 'transparent',
                      borderBottom: `1px solid ${dark ? '#1E293B' : '#F8FAFC'}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      style={{ accentColor: '#2563EB', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                    />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: dark ? '#E2E8F0' : '#344054', fontWeight: checked ? 600 : 400 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      {(s.category || s.subcategory) ? (
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: dark ? '#64748B' : '#98A2B3', marginTop: 1 }}>
                          {[s.category, s.subcategory].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function defaultWorkingHours() {
  const day = { closed: false, start: '09:00', end: '18:00' };
  return WEEKDAYS.reduce((acc, d) => {
    acc[d.key] = { ...day };
    return acc;
  }, {});
}

function normalizeWorkingHours(input) {
  const base = defaultWorkingHours();
  if (!input || typeof input !== 'object') return base;
  WEEKDAYS.forEach(({ key }) => {
    const raw = input[key] ?? input[Number(key)];
    if (!raw || typeof raw !== 'object') return;
    if (raw.closed) {
      base[key] = { closed: true, start: '09:00', end: '18:00' };
    } else {
      base[key] = {
        closed: false,
        start: raw.start || '09:00',
        end: raw.end || '18:00',
      };
    }
  });
  return base;
}

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

const SALARY_TYPE_LABELS = {
  commission_only: 'Commission Only',
  salary_only: 'Fixed Salary Only',
  salary_plus_commission: 'Salary + Commission',
  daily_salary_plus_commission: 'Per-day Salary + Commission',
};

function ProfileField({ label, value }) {
  return (
    <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#98A2B3', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#101828', wordBreak: 'break-word' }}>{value || '—'}</div>
    </div>
  );
}

function StaffSection({ title, desc, children, dark = false }) {
  return (
    <div style={{
      border: `1px solid ${dark ? '#334155' : '#E4E7EC'}`,
      borderRadius: 14,
      background: dark ? '#0F172A' : '#fff',
      minWidth: 0,
      maxWidth: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
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
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>{children}</div>
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
  const widths = { sm: 420, md: 560, lg: 720, xl: 980 };
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
        <style>{`
          @keyframes staff-modal-pop { from { opacity:0; transform:scale(0.97) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
          @media (max-width: 820px) {
            .staff-form-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
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
  const { toast }    = useToast();
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
  const [workingHours, setWorkingHours] = useState(() => defaultWorkingHours());
  const [offDays, setOffDays]           = useState([]);
  const [offDateDraft, setOffDateDraft] = useState('');
  const [offReasonDraft, setOffReasonDraft] = useState('');
  const [showServiceRates, setShowServiceRates] = useState(false);
  /** Per-service override rates keyed by service_id. Empty value = catalogue/default fallback. */
  const [specRates, setSpecRates]       = useState({});
  const [saving, setSaving]             = useState(false);
  const [formErr, setFormErr]           = useState('');
  const [loadErr, setLoadErr]         = useState('');
  const [photoFile, setPhotoFile]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [removePhoto, setRemovePhoto]   = useState(false);
  const [appInfo, setAppInfo]           = useState(null);
  const [appDownloading, setAppDownloading] = useState(false);
  const [roleTitles, setRoleTitles]     = useState(STAFF_ROLE_TITLES);
  const [newRoleDraft, setNewRoleDraft] = useState('');
  const [addingRole, setAddingRole]     = useState(false);
  const [showNewRoleInput, setShowNewRoleInput] = useState(false);

  const loadRoles = useCallback(async () => {
    try {
      const res = await api.get('/staff/roles');
      const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      if (list.length) setRoleTitles(list);
      else setRoleTitles(STAFF_ROLE_TITLES);
    } catch {
      setRoleTitles(STAFF_ROLE_TITLES);
    }
  }, []);

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
      const svcPayload = svR.data;
      const svcRows = Array.isArray(svcPayload)
        ? svcPayload
        : (Array.isArray(svcPayload?.data) ? svcPayload.data : (Array.isArray(svcPayload?.rows) ? svcPayload.rows : []));
      setServices(svcRows);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Failed to load data';
      setLoadErr(msg);
      setStaff([]);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); loadRoles(); }, [load, loadRoles]);

  useEffect(() => {
    let active = true;
    api.get('/staff/app-info')
      .then((r) => { if (active) setAppInfo(r.data || null); })
      .catch(() => { if (active) setAppInfo({ available: false }); });
    return () => { active = false; };
  }, []);

  const downloadStaffApp = async () => {
    setAppDownloading(true);
    try {
      const response = await api.get('/staff/app-download', {
        responseType: 'blob',
        timeout: 300000,
        params: { t: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });
      const version = response.headers?.['x-staff-app-version'] || appInfo?.version || 'latest';
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hexaone-staff-app-${version}.apk`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('Staff app download started', 'success');
    } catch (e) {
      toast(e.response?.data?.message || 'Staff app download failed', 'error');
    } finally {
      setAppDownloading(false);
    }
  };

  const refreshServices = useCallback(async () => {
    try {
      const svR = await api.get('/services', { params: { limit: 200 } });
      const svcPayload = svR.data;
      const svcRows = Array.isArray(svcPayload)
        ? svcPayload
        : (Array.isArray(svcPayload?.data) ? svcPayload.data : (Array.isArray(svcPayload?.rows) ? svcPayload.rows : []));
      setServices(svcRows);
    } catch {
      /* keep existing list */
    }
  }, []);

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
    if (form.salary_type === 'salary_only') {
      setSpecs([]);
      setSpecRates({});
    }
  }, [showForm, form.salary_type]);

  const openAdd  = () => {
    setEditItem(null);
    const initial = { ...EMPTY, branch_ids: myBranchId != null ? [String(myBranchId)] : [], join_date: new Date().toISOString().slice(0,10) };
    setForm(initial);
    setSpecRates({});
    setWorkingHours(defaultWorkingHours());
    setOffDays([]);
    setOffDateDraft('');
    setOffReasonDraft('');
    setShowServiceRates(false);
    // Start with no services — admin assigns only what this staff performs (drives online booking).
    setSpecs([]);
    setPhotoFile(null);
    setPhotoPreview('');
    setRemovePhoto(false);
    setFormErr('');
    setNewRoleDraft('');
    setShowNewRoleInput(false);
    refreshServices();
    loadRoles();
    setShowForm(true);
  };
  const openEdit = async (row) => {
    try {
      await refreshServices();
      const { data } = await api.get(`/staff/${row.id}`);
      const full = data || row;
      const fromM2m = (full.branches && full.branches.length)
        ? full.branches.map((b) => String(b.id))
        : (full.branch_id != null || full.branch?.id != null ? [String(full.branch_id ?? full.branch?.id)] : []);
      setEditItem(full);
      setForm({ ...full, branch_ids: fromM2m, join_date: full.join_date?.slice(0,10)||'', available_online: full.available_online !== false });
      const specsList = full.specializations || [];
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
      setWorkingHours(normalizeWorkingHours(full.working_hours));
      setOffDays(
        Array.isArray(full.offDays)
          ? full.offDays.map((d) => ({ date: d.date, reason: d.reason || '' }))
          : []
      );
      setShowServiceRates(Object.keys(rates).length > 0);
      setOffDateDraft('');
      setOffReasonDraft('');
      setPhotoFile(null);
      setPhotoPreview(full.photo_url || '');
      setRemovePhoto(false);
      setFormErr('');
      setNewRoleDraft('');
      setShowNewRoleInput(false);
      loadRoles();
      setShowForm(true);
    } catch (err) {
      setFormErr(err?.response?.data?.message || 'Failed to load staff profile.');
    }
  };
  const openProfile = async (row) => {
    try {
      const { data } = await api.get(`/staff/${row.id}`);
      setProfileItem(data || row);
    } catch {
      setProfileItem(row);
    }
    setShowProfile(true);
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
    let roleTitle = String(form.role_title || '').trim();
    if (!roleTitle && String(newRoleDraft || '').trim()) {
      roleTitle = String(newRoleDraft).trim();
      try {
        const res = await api.post('/staff/roles', { title: roleTitle });
        const list = Array.isArray(res.data?.data) ? res.data.data : roleTitles;
        if (list.length) setRoleTitles(list);
        roleTitle = res.data?.title || roleTitle;
        setForm((f) => ({ ...f, role_title: roleTitle }));
        setNewRoleDraft('');
      } catch (e) {
        return setFormErr(e.response?.data?.message || 'Failed to add role.');
      }
    }
    if (!roleTitle) return setFormErr('Select a role for this staff member.');
    const paysCommission = form.salary_type !== 'salary_only';
    const effectiveSpecs = specs;
    if (paysCommission && (form.commission_value === '' || form.commission_value == null)) {
      return setFormErr('Set a default commission rate for this staff member.');
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone || '',
        email: form.email || '',
        role_title: roleTitle,
        branch_ids: form.branch_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n)),
        salary_type: form.salary_type || 'commission_only',
        join_date: form.join_date || null,
        is_active: form.is_active !== false,
        available_online: form.available_online !== false,
        working_hours: workingHours,
        off_days: offDays.map((d) => ({ date: d.date, reason: d.reason || null })),
        specializations: effectiveSpecs.map((id) => {
          const rate = specRates[String(id)];
          const hasOverride = serviceWiseForUser && rate && rate.commission_value !== '' && rate.commission_value != null;
          return {
            service_id: Number(id),
            ...(hasOverride ? {
              commission_type: rate.commission_type || 'percentage',
              commission_value: parseFloat(rate.commission_value),
            } : {}),
          };
        }),
      };
      if (form.salary_type !== 'salary_only') {
        payload.commission_type = form.commission_type || 'percentage';
        if (form.commission_value !== '' && form.commission_value != null) {
          payload.commission_value = parseFloat(form.commission_value);
        }
      }
      if (form.salary_type === 'salary_only' || form.salary_type === 'salary_plus_commission' || form.salary_type === 'daily_salary_plus_commission') {
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
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this staff member? Payments and appointments stay, but staff link is cleared.')) return;
    try {
      await api.delete(`/staff/${id}`);
      toast('Staff deleted.', 'success');
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Failed to delete staff.', 'error');
    }
  };

  const activeCount = staff.filter(s => s.is_active !== false).length;
  const p = profileItem;
  const roleSelectValue = showNewRoleInput
    ? STAFF_ROLE_OTHER
    : staffRoleSelectValue(form.role_title, roleTitles);

  const addRoleToSystem = async () => {
    const title = String(newRoleDraft || '').trim();
    if (!title) return setFormErr('Enter a role name to add.');
    setAddingRole(true);
    setFormErr('');
    try {
      const res = await api.post('/staff/roles', { title });
      const list = Array.isArray(res.data?.data) ? res.data.data : roleTitles;
      setRoleTitles(list.length ? list : [...roleTitles, title]);
      setForm((f) => ({ ...f, role_title: res.data?.title || title }));
      setNewRoleDraft('');
      setShowNewRoleInput(false);
      toast(res.data?.message || 'Role added.', 'success');
    } catch (e) {
      setFormErr(e.response?.data?.message || 'Failed to add role.');
    }
    setAddingRole(false);
  };

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
        : <span style={{ color:'#D0D5DD', fontSize:13 }}>All</span>,
    },
    {
      id: 'online',
      header: 'Online',
      accessorFn: row => row.available_online !== false,
      meta: { width: '10%' },
      cell: ({ row: { original: row } }) => {
        const on = row.available_online !== false;
        return (
          <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:on?'#EFF6FF':'#F8FAFC', color:on?'#2563EB':'#64748B' }}>
            {on ? 'Booking' : 'Off'}
          </span>
        );
      },
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
        <StatCard label="Branches"     value={branchChoices.length} color="#D97706" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>} />
      </div>

      <div style={{
        marginTop: 4,
        padding: '14px 18px',
        borderRadius: 12,
        border: `1px solid ${isDark ? '#334155' : '#BFDBFE'}`,
        background: isDark ? '#0F172A' : '#EFF6FF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#E2E8F0' : '#1E3A8A' }}>
            Staff mobile app (Android)
          </div>
          <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#475569', marginTop: 4, maxWidth: 560 }}>
            Download the APK, install on staff phones, then sign in with their salon account.
            {appInfo?.version ? ` Current version: v${appInfo.version}.` : ''}
            {appInfo && !appInfo.available ? ' Package not uploaded yet — contact support if this persists.' : ''}
          </div>
        </div>
        <Button
          variant="primary"
          disabled={appDownloading || appInfo?.available === false}
          onClick={downloadStaffApp}
          style={{ whiteSpace: 'nowrap' }}
        >
          {appDownloading ? 'Downloading…' : '↓ Download Staff App'}
        </Button>
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

        <div
          className="staff-form-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
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
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                padding: '12px 14px', borderRadius: 10,
                border: `1.5px solid ${isDark ? '#334155' : '#E4E7EC'}`,
                background: isDark ? '#0B1220' : '#F9FAFB',
              }}>
                <input
                  type="checkbox"
                  checked={form.available_online !== false}
                  onChange={(e) => setForm((f) => ({ ...f, available_online: e.target.checked }))}
                  style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2563EB', flexShrink: 0 }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: isDark ? '#E2E8F0' : '#101828' }}>
                    Available for online booking
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>
                    Show this staff member on the website / WordPress booking form. Turn off for salon-only staff.
                  </span>
                </span>
              </label>
            </StaffSection>

            <StaffSection title="Working hours" desc="Weekly schedule for booking slots and Attendance (late / overtime)" dark={isDark}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                {WEEKDAYS.map(({ key, label }) => {
                  const day = workingHours[key] || { closed: false, start: '09:00', end: '18:00' };
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <span style={{
                        width: 88, flexShrink: 0, fontSize: 13, fontWeight: 600,
                        color: isDark ? '#E2E8F0' : '#344054',
                      }}>
                        {label}
                      </span>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                        fontSize: 12, color: C.muted, cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={!!day.closed}
                          onChange={(e) => setWorkingHours((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], closed: e.target.checked },
                          }))}
                        />
                        Off
                      </label>
                      <div style={{ display: 'flex', gap: 6, flex: '1 1 160px', minWidth: 0 }}>
                        <Input
                          type="time"
                          disabled={!!day.closed}
                          value={day.start || '09:00'}
                          onChange={(e) => setWorkingHours((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], closed: false, start: e.target.value },
                          }))}
                          style={{ minWidth: 0, flex: 1 }}
                        />
                        <Input
                          type="time"
                          disabled={!!day.closed}
                          value={day.end || '18:00'}
                          onChange={(e) => setWorkingHours((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], closed: false, end: e.target.value },
                          }))}
                          style={{ minWidth: 0, flex: 1 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </StaffSection>

            <StaffSection title="Off days" desc="Mark specific dates when this staff is unavailable" dark={isDark}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <FormGroup label="Date">
                    <Input type="date" value={offDateDraft} onChange={(e) => setOffDateDraft(e.target.value)} />
                  </FormGroup>
                </div>
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <FormGroup label="Reason (optional)">
                    <Input value={offReasonDraft} onChange={(e) => setOffReasonDraft(e.target.value)} placeholder="Leave / holiday" />
                  </FormGroup>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!offDateDraft) return;
                    setOffDays((prev) => {
                      if (prev.some((d) => d.date === offDateDraft)) return prev;
                      return [...prev, { date: offDateDraft, reason: offReasonDraft.trim() }].sort((a, b) => a.date.localeCompare(b.date));
                    });
                    setOffDateDraft('');
                    setOffReasonDraft('');
                  }}
                >
                  Add
                </Button>
              </div>
              {offDays.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted }}>No off days marked.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {offDays.map((d) => (
                    <div
                      key={d.date}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                        padding: '8px 10px', borderRadius: 8, minWidth: 0,
                        background: isDark ? '#0B1220' : '#F8FAFC',
                        border: `1px solid ${isDark ? '#1E293B' : '#EEF2F7'}`,
                      }}
                    >
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: isDark ? '#E2E8F0' : '#344054',
                        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {d.date}{d.reason ? ` · ${d.reason}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOffDays((prev) => prev.filter((x) => x.date !== d.date))}
                        style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', fontWeight: 700, fontSize: 12, flexShrink: 0 }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </StaffSection>

          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
            <StaffSection
              title="Assignable services"
              desc="Choose which services this staff can do. Online booking only shows this staff for these services."
              dark={isDark}
            >
              {activeServices.length > 0 ? (
                <AssignableServicesSelect
                  services={activeServices}
                  selected={specs}
                  dark={isDark}
                  onChange={(ids) => {
                    const next = (ids || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0);
                    setSpecs(next);
                    setSpecRates((prev) => {
                      const keep = {};
                      next.forEach((id) => {
                        if (prev[String(id)]) keep[String(id)] = prev[String(id)];
                      });
                      return keep;
                    });
                  }}
                />
              ) : (
                <div style={{
                  padding: '12px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.45,
                  background: isDark ? '#0B1220' : '#FFF7ED',
                  border: `1px solid ${isDark ? '#334155' : '#FED7AA'}`,
                  color: isDark ? '#CBD5E1' : '#9A3412',
                }}>
                  No active services found. Add services under <strong>Services</strong> first, then assign them here.
                </div>
              )}
              {form.available_online !== false && specs.length === 0 && (
                <div style={{ fontSize: 12, color: '#D97706', fontWeight: 600 }}>
                  Online booking is on, but no services are assigned — this staff will not appear for any service online.
                </div>
              )}
            </StaffSection>

            <StaffSection title="Role & Branches" desc="Job title from system roles, and assigned locations" dark={isDark}>
              <FormGroup label="Role" required>
                    <Select
                      value={roleSelectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === STAFF_ROLE_OTHER) {
                          setShowNewRoleInput(true);
                          setNewRoleDraft('');
                          setForm((f) => ({ ...f, role_title: '' }));
                        } else {
                          setShowNewRoleInput(false);
                          setNewRoleDraft('');
                          setForm((f) => ({ ...f, role_title: v }));
                        }
                      }}
                    >
                      <option value="">Select role...</option>
                      {roleTitles.map((r) => <option key={r} value={r}>{r}</option>)}
                      <option value={STAFF_ROLE_OTHER}>+ Add new role…</option>
                    </Select>
                    {showNewRoleInput && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#667085', marginBottom: 6 }}>
                          Type new role name
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <Input
                            autoFocus
                            value={newRoleDraft}
                            onChange={(e) => setNewRoleDraft(e.target.value)}
                            placeholder="e.g. Spa Therapist"
                            style={{ flex: 1 }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRoleToSystem(); } }}
                          />
                          <Button type="button" variant="primary" loading={addingRole} onClick={addRoleToSystem} style={{ whiteSpace: 'nowrap' }}>
                            Add role
                          </Button>
                        </div>
                      </div>
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
                  <option value="daily_salary_plus_commission">Per-day Salary + Commission</option>
                </Select>
              </FormGroup>
              {(form.salary_type === 'salary_only' || form.salary_type === 'salary_plus_commission') && (
                <FormGroup label="Base Salary (Rs./month)">
                  <Input type="number" min="0" value={form.base_salary || ''} onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} placeholder="e.g. 30000" />
                </FormGroup>
              )}
              {form.salary_type === 'daily_salary_plus_commission' && (
                <>
                  <FormGroup label="Per-day Salary (Rs./day)">
                    <Input type="number" min="0" value={form.base_salary || ''} onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} placeholder="e.g. 1500" />
                  </FormGroup>
                  <div style={{
                    padding: '10px 12px', borderRadius: 10, background: '#FDF2F8', border: '1px solid #FBCFE8',
                    fontSize: 12, color: '#9D174D', lineHeight: 1.5, marginBottom: 4,
                  }}>
                    Monthly pay uses <strong>Attendance</strong>: Present or Late days × this rate, plus commission.
                    Absent / Leave days are not paid.{' '}
                    <a href="/attendance" style={{ color: '#BE185D', fontWeight: 700 }}>Open Attendance →</a>
                  </div>
                </>
              )}
              {form.salary_type !== 'salary_only' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
                  <FormGroup label="Commission Type">
                    <Select value={form.commission_type || 'percentage'} onChange={e => setForm(f => ({ ...f, commission_type: e.target.value }))}>
                      <option value="percentage">Percentage %</option>
                      {serviceWiseForUser && <option value="fixed">Fixed per Service</option>}
                    </Select>
                  </FormGroup>
                  <FormGroup label={form.commission_type === 'percentage' ? 'Default Commission %' : 'Default Commission (Rs.)'}>
                    <Input
                      type="number" min="0" step="0.01"
                      value={form.commission_value || ''}
                      onChange={e => setForm(f => ({ ...f, commission_value: e.target.value }))}
                      placeholder="e.g. 10"
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
                <div>
                  <label style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                    padding: '12px 14px', borderRadius: 10, marginBottom: showServiceRates ? 10 : 0,
                    border: `1.5px solid ${isDark ? '#334155' : '#E4E7EC'}`,
                    background: isDark ? '#0B1220' : '#F9FAFB',
                  }}>
                    <input
                      type="checkbox"
                      checked={showServiceRates}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setShowServiceRates(on);
                        if (!on) setSpecRates({});
                      }}
                      style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2563EB' }}
                    />
                    <span>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: isDark ? '#E2E8F0' : '#101828' }}>
                        Service Rates (optional)
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>
                        Tick to set a different commission rate per assigned service. Leave off to use the catalogue / default rate.
                      </span>
                    </span>
                  </label>
                  {showServiceRates && (
                    <FormGroup label="Custom rates for assigned services">
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.45 }}>
                        Only services selected under Assignable services appear here. Blank rate = fallback to catalogue or staff default.
                      </div>
                      {!specs.length ? (
                        <div style={{ fontSize: 12, color: C.muted, padding: '10px 0' }}>
                          Select at least one assignable service first.
                        </div>
                      ) : (
                        <div style={{
                          border: `1px solid ${isDark ? '#334155' : '#E4E7EC'}`,
                          borderRadius: 12,
                          overflow: 'hidden',
                          maxHeight: 280,
                          overflowY: 'auto',
                          background: isDark ? '#0B1220' : '#fff',
                          minWidth: 0,
                        }}>
                          {activeServices
                            .filter((sv) => specs.some((id) => Number(id) === Number(sv.id)))
                            .map((sv, idx, list) => {
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
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 8,
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    borderBottom: idx !== list.length - 1 ? `1px solid ${isDark ? '#1E293B' : '#F1F5F9'}` : 'none',
                                    background: isDark ? 'rgba(37,99,235,0.08)' : '#F8FBFF',
                                    minWidth: 0,
                                  }}
                                >
                                  <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                                    <div style={{
                                      fontSize: 13, fontWeight: 700, color: isDark ? '#E2E8F0' : '#0F172A',
                                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                      {sv.name}
                                    </div>
                                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                                      {value !== '' ? `Custom ${formatCommission(type, value)}` : `Fallback ${fallback}`}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, flex: '0 1 auto', minWidth: 0 }}>
                                    <Select
                                      value={type}
                                      onChange={(e) => setSpecRate(sv.id, { commission_type: e.target.value })}
                                      style={{ fontSize: 12, padding: '6px 8px', width: 92, flexShrink: 0 }}
                                    >
                                      <option value="percentage">%</option>
                                      <option value="fixed">Fixed Rs.</option>
                                    </Select>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={value}
                                      onChange={(e) => setSpecRate(sv.id, { commission_value: e.target.value })}
                                      placeholder="Rate"
                                      style={{ fontSize: 12, padding: '6px 8px', width: 88, flexShrink: 0 }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </FormGroup>
                  )}
                </div>
              )}
              {form.salary_type !== 'salary_only' && (
                <div style={{
                  padding: '12px 14px',
                  background: serviceWiseForUser ? (isDark ? 'rgba(37,99,235,0.12)' : '#F0F9FF') : (isDark ? 'rgba(5,150,105,0.12)' : '#F0FDF4'),
                  border: `1px solid ${serviceWiseForUser ? (isDark ? 'rgba(96,165,250,0.25)' : '#BAE6FD') : (isDark ? 'rgba(52,211,153,0.25)' : '#BBF7D0')}`,
                  borderRadius: 12, fontSize: 12, color: C.tipText || (isDark ? '#CBD5E1' : '#374151'), lineHeight: 1.5,
                }}>
                  {serviceWiseForUser ? (
                    <>
                      Tick <strong>Service Rates (optional)</strong> only if this staff needs custom per-service commission. Otherwise the default / catalogue rate is used.
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
      <Drawer open={showProfile} onClose={() => setShowProfile(false)} title="Staff Profile" width={560}
        footer={canEdit && <Button variant="primary" onClick={() => { setShowProfile(false); openEdit(p); }} style={{ display:'flex', alignItems:'center', gap:6 }}><IconEdit /> Edit Profile</Button>}>
        {p && (() => {
          const salaryType = p.salary_type || 'commission_only';
          const paysCommission = salaryType !== 'salary_only';
          const baseSalary = Number(p.base_salary || 0);
          const baseSalaryLabel = salaryType === 'daily_salary_plus_commission'
            ? (baseSalary > 0 ? `Rs. ${baseSalary.toLocaleString()}/day` : '—')
            : (baseSalary > 0 ? `Rs. ${baseSalary.toLocaleString()}/month` : '—');
          const showBaseSalary = salaryType === 'salary_only'
            || salaryType === 'salary_plus_commission'
            || salaryType === 'daily_salary_plus_commission';
          return (
          <div style={{ fontFamily:"'Inter',sans-serif" }}>
            <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:20, padding:16, background:'#F9FAFB', borderRadius:12 }}>
              <StaffAvatar name={p.name} size={64} photoUrl={p.photo_url} />
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:'#101828' }}>{p.name}</h2>
                <p style={{ margin:'4px 0 8px', color:'#475467', fontSize:14 }}>{p.role_title || '—'}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: '#EEF2FF', color: '#4338CA',
                  }}>
                    {SALARY_TYPE_LABELS[salaryType] || salaryType}
                  </span>
                  {paysCommission && (p.commission_value != null && p.commission_value !== '') && (
                    <CommBadge type={p.commission_type || 'percentage'} value={p.commission_value} />
                  )}
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: p.is_active !== false ? '#ECFDF5' : '#F2F4F7',
                    color: p.is_active !== false ? '#059669' : '#667085',
                  }}>
                    {p.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            <h4 style={{ margin:'0 0 10px', fontSize:13, fontWeight:700, color:'#475467', textTransform:'uppercase' }}>
              Basic details
            </h4>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
              <ProfileField label="Role" value={p.role_title} />
              <ProfileField
                label="Branches"
                value={(p.branches && p.branches.length) ? p.branches.map((b) => b.name).join(', ') : (p.branch?.name || '')}
              />
              <ProfileField label="Phone" value={p.phone} />
              <ProfileField label="Email" value={p.email} />
              <ProfileField label="Joined" value={p.join_date ? new Date(p.join_date).toLocaleDateString() : ''} />
              <ProfileField label="Online booking" value={p.available_online !== false ? 'Available' : 'Off'} />
              {p.user?.username && (
                <ProfileField label="Linked login" value={`${p.user.name || p.user.username} (${p.user.role || 'user'})`} />
              )}
            </div>

            <h4 style={{ margin:'0 0 10px', fontSize:13, fontWeight:700, color:'#475467', textTransform:'uppercase' }}>
              Pay & commission
            </h4>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
              <ProfileField label="Salary type" value={SALARY_TYPE_LABELS[salaryType] || salaryType} />
              {showBaseSalary && (
                <ProfileField
                  label={salaryType === 'daily_salary_plus_commission' ? 'Per-day salary' : 'Base salary'}
                  value={baseSalaryLabel}
                />
              )}
              {paysCommission ? (
                <>
                  <ProfileField
                    label="Commission type"
                    value={(p.commission_type || 'percentage') === 'fixed' ? 'Fixed per service' : 'Percentage %'}
                  />
                  <ProfileField
                    label={(p.commission_type || 'percentage') === 'fixed' ? 'Default commission (Rs.)' : 'Default commission %'}
                    value={(p.commission_type || 'percentage') === 'fixed'
                      ? `Rs. ${Number(p.commission_value || 0).toLocaleString()}`
                      : `${p.commission_value ?? '—'}%`}
                  />
                </>
              ) : (
                <ProfileField label="Commission" value="Not applicable (salary only)" />
              )}
              {salaryType === 'daily_salary_plus_commission' && (
                <ProfileField
                  label="Attendance link"
                  value="Present / Late days × per-day rate + commission"
                />
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin:'0 0 10px', fontSize:13, fontWeight:700, color:'#475467', textTransform:'uppercase' }}>
                Working Hours
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {WEEKDAYS.map(({ key, label }) => {
                  const hours = normalizeWorkingHours(p.working_hours);
                  const day = hours[key];
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F9FAFB', borderRadius: 8, fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: '#344054' }}>{label}</span>
                      <span style={{ color: day.closed ? '#EF4444' : '#059669', fontWeight: 600 }}>
                        {day.closed ? 'Off' : `${day.start} – ${day.end}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin:'0 0 10px', fontSize:13, fontWeight:700, color:'#475467', textTransform:'uppercase' }}>
                Off Days
              </h4>
              {Array.isArray(p.offDays) && p.offDays.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {p.offDays.map((d) => (
                    <div key={d.id || d.date} style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 8, fontSize: 13, color: '#B91C1C', fontWeight: 600 }}>
                      {d.date}{d.reason ? ` · ${d.reason}` : ''}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '10px 12px', background: '#F9FAFB', borderRadius: 8, fontSize: 13, color: '#98A2B3' }}>
                  No off days set
                </div>
              )}
            </div>
            <div>
              <h4 style={{ margin:'0 0 10px', fontSize:13, fontWeight:700, color:'#475467', textTransform:'uppercase' }}>
                {serviceWiseForUser && paysCommission ? 'Linked Services' : 'Assignable Services'}
              </h4>
              {(p.specializations || []).length > 0 ? (
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
                      <div key={s.id || s.service_id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#F9FAFB', borderRadius:8, fontSize:13, gap: 8 }}>
                        <span style={{ fontWeight:600, color:'#344054' }}>{s.service?.name || svc?.name || s.service_id}</span>
                        {serviceWiseForUser && paysCommission && (
                          <span style={{ fontSize:12, color: staffOverride ? '#059669' : '#667085', fontWeight: staffOverride ? 700 : 500, flexShrink: 0 }}>
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
              ) : (
                <div style={{ padding: '10px 12px', background: '#F9FAFB', borderRadius: 8, fontSize: 13, color: '#98A2B3' }}>
                  No services assigned
                </div>
              )}
            </div>
          </div>
          );
        })()}
      </Drawer>
    </PageWrapper>
  );
}
