import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import usePageTheme from '../hooks/usePageTheme';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { Input, Label, Select } from '../components/ui/FormElements';
import {
  IconPkg, IconCheck, IconDollar, IconUsers, IconTag, IconClose,
  StatCard, PKModal as Modal,
  FilterBar, DataTable, ActionBtn, IconEdit, IconTrash, IconStop,
} from '../components/ui/PageKit';

/*  constants  */
const ACCENT_COLOR  = { bundle:'#2563EB', membership:'#7C3AED' };
const TYPE_BADGE    = { bundle:{ bg:'#EFF6FF', color:'#1D4ED8' }, membership:{ bg:'#EDE9FE', color:'#7C3AED' } };
const STATUS_BADGE  = {
  active:    { bg:'#D1FAE5', color:'#059669' },
  expired:   { bg:'#FEE2E2', color:'#DC2626' },
  completed: { bg:'#F1F5F9', color:'#475467' },
};
const EMPTY_PKG  = { name:'', type:'bundle', services:[], validity_days:'90', package_price:'', is_active:true, branch_id:'' };
const MUTED = '#64748B';

/*  helpers  */
function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

/*  SessionBar  */
function SessionBar({ used, total }) {
  const pct  = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const done = used >= total && total > 0;
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ fontSize:12, color:MUTED }}>{used} / {total} sessions</span>
        <span style={{ fontSize:11, fontWeight:700, color:done?'#DC2626':'#059669' }}>
          {done ? 'Depleted' : `${total - used} left`}
        </span>
      </div>
      <div style={{ height:6, background:'#E4E7EC', borderRadius:4, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:done?'#DC2626':'#10b981', borderRadius:4, transition:'width 0.3s' }} />
      </div>
    </div>
  );
}

/*  PackageCard  */
function PackageCard({ pkg, canEdit, onEdit, onToggle, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const accent   = ACCENT_COLOR[pkg.type] || ACCENT_COLOR.bundle;
  const tb       = TYPE_BADGE[pkg.type]   || TYPE_BADGE.bundle;
  const svcList  = pkg.serviceDetails || [];
  const shown    = svcList.slice(0, 3);
  const extra    = svcList.length - 3;
  const discPct  = Number(pkg.discount_percent) || 0;
  const savings  = (Number(pkg.original_price) || 0) - (Number(pkg.package_price) || 0);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:'#fff', border:'1px solid #EAECF0', borderRadius:16, padding:24,
        position:'relative', opacity:pkg.is_active ? 1 : 0.6,
        boxShadow: hovered ? '0 8px 28px rgba(0,0,0,0.13)' : '0 1px 6px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition:'all 0.2s ease', overflow:'hidden',
        display:'flex', flexDirection:'column', gap:16,
      }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:4, background:accent }} />
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginTop:4 }}>
        <div style={{ flex:1, paddingRight:12 }}>
          <div style={{ fontSize:19, fontWeight:800, color:'#101828', letterSpacing:'-0.3px', lineHeight:1.25, fontFamily:"'Outfit',sans-serif" }}>{pkg.name}</div>
          {pkg.description && <div style={{ fontSize:13, color:MUTED, marginTop:4, lineHeight:1.45, fontFamily:"'Inter',sans-serif" }}>{pkg.description}</div>}
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
          <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:tb.bg, color:tb.color, fontFamily:"'Inter',sans-serif" }}>
            {pkg.type === 'bundle' ? 'Bundle' : 'Membership'}
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:pkg.is_active?'#10b981':'#94a3b8' }} />
            <span style={{ fontSize:11, color:pkg.is_active?'#059669':'#64748b', fontWeight:600, fontFamily:"'Inter',sans-serif" }}>
              {pkg.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>
      {/* Service chips */}
      {svcList.length > 0 && (
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:MUTED, letterSpacing:'0.6px', textTransform:'uppercase', marginBottom:6, fontFamily:"'Inter',sans-serif" }}>Included Services</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {shown.map(s => (
              <span key={s.id} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:12, background:'#F8FAFC', border:'1px solid #E8ECF0', fontSize:12, color:'#344054', fontFamily:"'Inter',sans-serif" }}>
                {s.name}
              </span>
            ))}
            {extra > 0 && (
              <span style={{ padding:'4px 10px', borderRadius:12, background:'#EFF6FF', border:'1px solid #BFDBFE', fontSize:12, color:'#2563EB', fontWeight:700, fontFamily:"'Inter',sans-serif" }}>+{extra} more</span>
            )}
          </div>
        </div>
      )}
      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#F8FAFC', borderRadius:10 }}>
          <span style={{ color:'#64748B', display:'flex' }}><IconTag /></span>
          <div>
            <div style={{ fontSize:11, color:MUTED, fontFamily:"'Inter',sans-serif" }}>Validity</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#344054', fontFamily:"'Outfit',sans-serif" }}>{pkg.validity_days} days</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#F8FAFC', borderRadius:10 }}>
          <span style={{ color:'#64748B', display:'flex' }}><IconTag /></span>
          <div>
            <div style={{ fontSize:11, color:MUTED, fontFamily:"'Inter',sans-serif" }}>Services</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#344054', fontFamily:"'Outfit',sans-serif" }}>{svcList.length || 0}</div>
          </div>
        </div>
      </div>
      {/* Pricing */}
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div>
          {discPct > 0 && (
            <div style={{ fontSize:12, color:MUTED, textDecoration:'line-through', fontFamily:"'Inter',sans-serif" }}>
              Rs. {Number(pkg.original_price || 0).toLocaleString()}
            </div>
          )}
          <div style={{ fontSize:22, fontWeight:800, color:'#101828', fontFamily:"'Outfit',sans-serif" }}>
            Rs. {Number(pkg.package_price).toLocaleString()}
          </div>
        </div>
        {discPct > 0 ? (
          <span style={{ padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700, background:'#D1FAE5', color:'#065F46', fontFamily:"'Inter',sans-serif" }}>
            SAVE {Math.round(discPct)}%
          </span>
        ) : savings > 0 ? (
          <span style={{ fontSize:12, color:'#059669', fontWeight:600, fontFamily:"'Inter',sans-serif" }}>Save Rs. {savings.toLocaleString()}</span>
        ) : null}
      </div>
      {/* Actions */}
      {canEdit && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:4, borderTop:'1px solid #EAECF0' }}>
          <button onClick={() => onEdit(pkg)}
            style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #E4E7EC', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#344054', fontFamily:"'Inter',sans-serif" }}>Edit</button>
          <button onClick={() => onToggle(pkg)}
            style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #E4E7EC', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:pkg.is_active?'#D97706':'#059669', fontFamily:"'Inter',sans-serif" }}>
            {pkg.is_active ? 'Deactivate' : 'Activate'}</button>
          <button onClick={() => onDelete(pkg.id)}
            style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:600, color:'#DC2626', marginLeft:'auto', fontFamily:"'Inter',sans-serif" }}>Delete</button>
        </div>
      )}
    </div>
  );
}

/*  inline form styles (redeem modal)  */
const inp  = { width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:'#101828', background:'#fff' };
function Lbl({ children }) { return <div style={{ fontSize:12, fontWeight:700, color:'#344054', marginBottom:5, fontFamily:"'Inter',sans-serif" }}>{children}</div>; }

function PkgSection({ title, desc, children, dark = false }) {
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

function PkgModal({ open, onClose, title, subtitle, children, footer, size = 'lg', dark = false }) {
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
        maxHeight: '92vh', animation: 'pkg-modal-pop 0.2s ease',
        border: dark ? '1px solid #334155' : '1px solid #E4E7EC',
      }}>
        <style>{'@keyframes pkg-modal-pop { from { opacity:0; transform:scale(0.97) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }'}</style>
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
              <IconPkg />
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
            display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0,
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

/*  Page  */
export default function PackagesPage() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { C } = usePageTheme();
  const isAdmin  = ['superadmin','admin'].includes(user?.role);
  const canEdit  = ['superadmin','admin','manager'].includes(user?.role);
  const [activeTab, setActiveTab] = useState('templates');

  const [branches,    setBranches]    = useState([]);
  const [allServices, setAllServices] = useState([]);

  const [packages,   setPackages]   = useState([]);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgError,   setPkgError]   = useState('');

  const [showPkgModal, setShowPkgModal] = useState(false);
  const [editPkg,      setEditPkg]      = useState(null);
  const [pkgForm,      setPkgForm]      = useState(EMPTY_PKG);
  const [pkgSaving,    setPkgSaving]    = useState(false);
  const [pkgFormError, setPkgFormError] = useState('');
  const [servicePicker, setServicePicker] = useState('');

  const [soldPkgs,     setSoldPkgs]     = useState([]);
  const [soldTotal,    setSoldTotal]    = useState(0);
  const [soldPage,     setSoldPage]     = useState(1);
  const [soldLoading,  setSoldLoading]  = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterPkgType, setFilterPkgType] = useState('');

  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeemTarget,    setRedeemTarget]    = useState(null);
  const [redeemSvcId,     setRedeemSvcId]     = useState('');
  const [redeemNotes,     setRedeemNotes]     = useState('');
  const [redeemSaving,    setRedeemSaving]    = useState(false);
  const [redeemError,     setRedeemError]     = useState('');

  const loadPackages = useCallback(async () => {
    setPkgLoading(true); setPkgError('');
    try {
      const res = await api.get('/packages?activeOnly=false');
      setPackages(Array.isArray(res.data) ? res.data : (res.data.data || []));
    } catch { setPkgError('Failed to load packages.'); }
    finally { setPkgLoading(false); }
  }, []);

  const loadSold = useCallback(async () => {
    setSoldLoading(true);
    try {
      const p = new URLSearchParams({ page:soldPage, limit:20 });
      if (filterStatus) p.set('status', filterStatus);
      if (filterBranch) p.set('branchId', filterBranch);
      const res = await api.get(`/packages/customer-packages?${p}`);
      setSoldPkgs(res.data.data || []);
      setSoldTotal(res.data.total || 0);
    } catch {}
    setSoldLoading(false);
  }, [soldPage, filterStatus, filterBranch]);

  useEffect(() => { loadPackages(); }, [loadPackages]);
  useEffect(() => { if (activeTab === 'sold') loadSold(); }, [activeTab, loadSold]);

  useEffect(() => {
    if (isAdmin) api.get('/branches').then(r => setBranches(r.data.data || r.data || [])).catch(() => {});
    api.get('/services?limit=500').then(r => setAllServices(r.data.data || r.data || [])).catch(() => {});
  }, [isAdmin]);

  const originalPrice = useMemo(() => (
    pkgForm.services.reduce((sum, sid) => {
      const svc = allServices.find((s) => s.id === Number(sid));
      return sum + (svc ? Number(svc.price) : 0);
    }, 0)
  ), [pkgForm.services, allServices]);

  const discountPct = useMemo(() => {
    if (!originalPrice || !pkgForm.package_price) return 0;
    return Math.max(0, ((originalPrice - Number(pkgForm.package_price)) / originalPrice) * 100);
  }, [originalPrice, pkgForm.package_price]);

  const soldPages        = Math.ceil(soldTotal / 20);

  const activeCount    = packages.filter(p => p.is_active).length;
  const bundleCount    = packages.filter(p => p.type === 'bundle').length;
  const memberCount    = packages.filter(p => p.type === 'membership').length;

  const displayedPackages = useMemo(() => {
    if (!filterPkgType) return packages;
    return packages.filter((p) => p.type === filterPkgType);
  }, [packages, filterPkgType]);

  const templateColumns = useMemo(() => [
    {
      accessorKey: 'name',
      header: 'Package',
      meta: { width: '22%' },
      cell: ({ row }) => {
        const pkg = row.original;
        return (
          <>
            <div style={{ fontWeight: 600, color: '#101828', fontSize: 14 }}>{pkg.name}</div>
            {pkg.description && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{pkg.description}</div>}
          </>
        );
      },
    },
    {
      accessorKey: 'type',
      header: 'Type',
      meta: { width: '10%' },
      cell: ({ getValue }) => {
        const tb = TYPE_BADGE[getValue()] || TYPE_BADGE.bundle;
        return (
          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: tb.bg, color: tb.color }}>
            {getValue() === 'bundle' ? 'Bundle' : 'Membership'}
          </span>
        );
      },
    },
    {
      id: 'services',
      accessorFn: (pkg) => (pkg.serviceDetails || []).map((s) => s.name).join(', '),
      header: 'Services',
      meta: { width: '24%' },
      cell: ({ row }) => {
        const svcList = row.original.serviceDetails || [];
        if (!svcList.length) return <span style={{ color: MUTED }}>—</span>;
        return (
          <span style={{ fontSize: 13, color: '#475467' }}>
            {svcList.map((s) => s.name).join(', ')}
          </span>
        );
      },
    },
    {
      accessorKey: 'package_price',
      header: 'Price',
      meta: { width: '12%', align: 'right' },
      cell: ({ row }) => {
        const pkg = row.original;
        const discPct = Number(pkg.discount_percent) || 0;
        return (
          <div style={{ textAlign: 'right' }}>
            {discPct > 0 && (
              <div style={{ fontSize: 11, color: MUTED, textDecoration: 'line-through' }}>
                Rs. {Number(pkg.original_price || 0).toLocaleString()}
              </div>
            )}
            <div style={{ fontWeight: 700, color: '#101828' }}>Rs. {Number(pkg.package_price).toLocaleString()}</div>
          </div>
        );
      },
    },
    {
      id: 'validity',
      accessorFn: (pkg) => `${pkg.validity_days || 0}d · ${(pkg.serviceDetails || []).length} services`,
      header: 'Validity',
      meta: { width: '14%' },
      cell: ({ row }) => {
        const pkg = row.original;
        const svcCount = (pkg.serviceDetails || []).length;
        return <span style={{ fontSize: 13, color: '#344054' }}>{pkg.validity_days} days · {svcCount} service{svcCount !== 1 ? 's' : ''}</span>;
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      meta: { width: '10%', align: 'center' },
      cell: ({ getValue }) => {
        const active = getValue() !== false;
        return (
          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: active ? '#ECFDF5' : '#F9FAFB', color: active ? '#059669' : '#6B7280' }}>
            {active ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { width: '8%', align: 'center' },
      enableSorting: false,
      cell: ({ row }) => {
        const pkg = row.original;
        if (!canEdit) return null;
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            <ActionBtn onClick={() => openEditPkg(pkg)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>
            <ActionBtn onClick={() => handleTogglePkg(pkg)} title={pkg.is_active ? 'Deactivate' : 'Activate'} color={pkg.is_active ? '#6B7280' : '#059669'}>
              {pkg.is_active ? <IconStop /> : <IconCheck />}
            </ActionBtn>
            <ActionBtn onClick={() => handleDeletePkg(pkg.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>
          </div>
        );
      },
    },
  ], [canEdit]);

  const soldColumns = useMemo(() => [
    {
      id: 'customer',
      header: 'Customer',
      meta: { width: '20%' },
      accessorFn: (r) => `${r.customer?.name || ''} ${r.customer?.phone || ''}`.trim(),
      cell: ({ row }) => {
        const cp = row.original;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: 14, color: '#2563EB' }}>
              {(cp.customer?.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#101828' }}>{cp.customer?.name || ''}</div>
              <div style={{ fontSize: 12, color: MUTED }}>{cp.customer?.phone || ''}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'package',
      header: 'Package',
      meta: { width: '18%' },
      accessorFn: (r) => r.package?.name || '',
      cell: ({ row }) => {
        const cp = row.original;
        const tb2 = TYPE_BADGE[cp.package?.type] || TYPE_BADGE.bundle;
        return (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#101828', marginBottom: 3 }}>{cp.package?.name || ''}</div>
            <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: tb2.bg, color: tb2.color }}>
              {cp.package?.type}
            </span>
          </>
        );
      },
    },
    {
      id: 'purchased',
      header: 'Purchased',
      meta: { width: '13%' },
      accessorFn: (r) => r.purchase_date || '',
      cell: ({ getValue }) => (
        <span style={{ fontSize: 13, color: '#344054', whiteSpace: 'nowrap' }}>
          {getValue() ? new Date(getValue()).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
        </span>
      ),
    },
    {
      id: 'expiry',
      header: 'Expiry',
      meta: { width: '13%' },
      accessorFn: (r) => r.expiry_date || '',
      cell: ({ row }) => {
        const cp = row.original;
        const dl = daysLeft(cp.expiry_date);
        return (
          <div style={{ whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 13, color: '#344054' }}>
              {cp.expiry_date ? new Date(cp.expiry_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
            </div>
            {dl !== null && (
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: dl < 0 ? '#DC2626' : dl < 7 ? '#D97706' : '#059669' }}>
                {dl < 0 ? 'Expired' : dl === 0 ? 'Expires today' : `${dl} days left`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'sessions',
      header: 'Sessions',
      meta: { width: '18%' },
      cell: ({ row }) => <SessionBar used={row.original.sessions_used || 0} total={row.original.sessions_total || 0} />,
    },
    {
      id: 'status',
      header: 'Status',
      meta: { width: '12%', align: 'center' },
      accessorFn: (r) => r.status || '',
      cell: ({ row }) => {
        const sb = STATUS_BADGE[row.original.status] || STATUS_BADGE.active;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: sb.bg, color: sb.color }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: sb.color }} />
            {row.original.status}
          </span>
        );
      },
    },
    {
      id: 'action',
      header: 'Action',
      meta: { width: '6%', align: 'center' },
      enableSorting: false,
      cell: ({ row }) => {
        const cp = row.original;
        if (!canEdit || cp.status !== 'active') return null;
        return (
          <button type="button" onClick={() => openRedeemModal(cp)} title="Redeem Session"
            style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #E4E7EC', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#059669' }}>
            Redeem
          </button>
        );
      },
    },
  ], [canEdit]);

  /*  package CRUD  */
  const openCreatePkg = () => {
    setEditPkg(null);
    setPkgForm({ ...EMPTY_PKG, branch_id: user.branchId ? String(user.branchId) : '' });
    setServicePicker('');
    setPkgFormError('');
    setShowPkgModal(true);
  };
  const openEditPkg = (pkg) => {
    setEditPkg(pkg);
    setPkgForm({
      name:          pkg.name         || '',
      type:          pkg.type         || 'bundle',
      services:      (pkg.services || []).map(String),
      validity_days: pkg.validity_days  != null ? String(pkg.validity_days)  : '90',
      package_price: pkg.package_price  != null ? String(pkg.package_price)  : '',
      is_active:     pkg.is_active !== false,
      branch_id:     pkg.branch_id ? String(pkg.branch_id) : '',
    });
    setServicePicker('');
    setPkgFormError('');
    setShowPkgModal(true);
  };

  const addServiceFromPicker = (serviceId) => {
    const s = String(serviceId);
    if (!s) return;
    setPkgForm((f) => (
      f.services.includes(s) ? f : { ...f, services: [...f.services, s] }
    ));
    setServicePicker('');
  };
  const removeService = (sid) => {
    const s = String(sid);
    setPkgForm((f) => ({ ...f, services: f.services.filter((x) => x !== s) }));
  };
  const handleSavePkg = async () => {
    setPkgFormError('');
    if (!pkgForm.name.trim())          { setPkgFormError('Package name is required.');   return; }
    if (!pkgForm.package_price)        { setPkgFormError('Package price is required.');  return; }
    if (pkgForm.services.length === 0) { setPkgFormError('Select at least one service.'); return; }
    setPkgSaving(true);
    try {
      const payload = {
        name:            pkgForm.name.trim(),
        description:     '',
        type:            pkgForm.type || 'bundle',
        services:        pkgForm.services.map(Number),
        sessions_count:  pkgForm.services.length,
        validity_days:   Number(pkgForm.validity_days)  || 90,
        package_price:   Number(pkgForm.package_price),
        original_price:  originalPrice || Number(pkgForm.package_price),
        discount_percent:Number(discountPct.toFixed(2)),
        is_active:       pkgForm.is_active,
        branch_id:       pkgForm.branch_id ? Number(pkgForm.branch_id) : null,
      };
      if (editPkg) {
        await api.put(`/packages/${editPkg.id}`, payload);
      } else {
        await api.post('/packages', payload);
      }
      setShowPkgModal(false);
      loadPackages();
    } catch (err) { setPkgFormError(err.response?.data?.message || 'Failed to save package.'); }
    finally { setPkgSaving(false); }
  };
  const handleDeletePkg = async (id) => {
    if (!window.confirm('Deactivate this package?')) return;
    try { await api.delete(`/packages/${id}`); loadPackages(); } catch {}
  };
  const handleTogglePkg = async (pkg) => {
    try { await api.put(`/packages/${pkg.id}`, { is_active: !pkg.is_active }); loadPackages(); } catch {}
  };

  /*  redeem  */
  const openRedeemModal = (cp) => {
    setRedeemTarget(cp); setRedeemSvcId(''); setRedeemNotes(''); setRedeemError(''); setShowRedeemModal(true);
  };
  const handleRedeem = async () => {
    setRedeemError('');
    if (!redeemSvcId) { setRedeemError('Please select a service.'); return; }
    setRedeemSaving(true);
    try {
      await api.post('/packages/redeem', { customerPackageId:redeemTarget.id, serviceId:Number(redeemSvcId), notes:redeemNotes||undefined });
      setShowRedeemModal(false); loadSold();
    } catch (err) { setRedeemError(err.response?.data?.message || 'Redeem failed.'); }
    finally { setRedeemSaving(false); }
  };

  /*  render  */
  return (
    <PageWrapper title="Packages" subtitle="Manage package templates and customer subscriptions"
      actions={
        canEdit && activeTab === 'templates' ? (
          <button onClick={openCreatePkg}
            style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', color:'#344054', border:'1.5px solid #E4E7EC', borderRadius:10, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
            + New Package
          </button>
        ) : null
      }
    >
      {/* Stat Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:16 }}>
        <StatCard label="Total Packages" value={packages.length}  icon={<IconPkg />}   color="#2563EB" />
        <StatCard label="Active"          value={activeCount}      icon={<IconCheck />} color="#059669" />
        <StatCard label="Bundles"         value={bundleCount}      icon={<IconTag />}   color="#D97706" />
        <StatCard label="Memberships"     value={memberCount}      icon={<IconUsers />} color="#7C3AED" />
        <StatCard label="Sold"            value={soldTotal}        icon={<IconDollar/>} color="#0891B2" />
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'2px solid #E4E7EC', gap:0 }}>
        {[['templates','Package Templates'],['sold','Sold Packages']].map(([key,label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{ padding:'10px 22px', background:'none', border:'none', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:"'Inter',sans-serif", transition:'all 0.2s',
              color:       activeTab===key ? '#2563EB' : '#64748B',
              borderBottom:activeTab===key ? '2px solid #2563EB' : '2px solid transparent',
              marginBottom:-2 }}>
            {label}
          </button>
        ))}
      </div>

      {/* TAB: Templates */}
      {activeTab === 'templates' && (
        <>
          {pkgError && <div style={{ padding:'12px 16px', background:'#FEE2E2', borderRadius:10, color:'#DC2626', fontSize:13 }}>{pkgError}</div>}
          <FilterBar>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[
                { val: '', label: 'All' },
                { val: 'bundle', label: 'Bundles' },
                { val: 'membership', label: 'Memberships' },
              ].map(({ val, label }) => {
                const active = filterPkgType === val;
                const tb = val ? TYPE_BADGE[val] : null;
                return (
                  <button key={val || 'all'} type="button" onClick={() => setFilterPkgType(val)}
                    style={{ padding:'6px 14px', borderRadius:20, border:'1.5px solid', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:"'Inter',sans-serif",
                      borderColor: active ? (tb?.color || '#2563EB') : '#E4E7EC',
                      background: active ? (tb?.bg || '#EFF6FF') : '#fff',
                      color: active ? (tb?.color || '#2563EB') : '#64748B' }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </FilterBar>
          <DataTable
            columns={templateColumns}
            data={displayedPackages}
            loading={pkgLoading}
            emptyMessage="No packages yet"
            emptySub="Create your first package template to get started"
            searchableColumns={[
              { id: 'name', title: 'Package' },
              { id: 'services', title: 'Service' },
            ]}
            filterableColumns={[{
              id: 'type',
              title: 'Type',
              options: [
                { label: 'Bundle', value: 'bundle' },
                { label: 'Membership', value: 'membership' },
              ],
            }]}
          />
        </>
      )}

      {/* TAB: Sold Packages */}
      {activeTab === 'sold' && (
        <>
          <FilterBar>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[['','All'],['active','Active'],['expired','Expired'],['completed','Completed']].map(([val,label]) => (
                <button key={val} type="button" onClick={() => { setFilterStatus(val); setSoldPage(1); }}
                  style={{ padding:'6px 14px', borderRadius:20, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:"'Inter',sans-serif", border:'1.5px solid',
                    borderColor:filterStatus===val?'#2563EB':'#E4E7EC',
                    background:  filterStatus===val?'#EFF6FF':'#fff',
                    color:       filterStatus===val?'#2563EB':'#64748B' }}>
                  {label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <select value={filterBranch} onChange={e=>{ setFilterBranch(e.target.value); setSoldPage(1); }}
                className="pk-filter-control">
                <option value="">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </FilterBar>

          <DataTable
            columns={soldColumns}
            data={soldPkgs}
            loading={soldLoading}
            emptyMessage="No sold packages found"
            emptySub="Sold packages will appear here"
            pagination={false}
            searchableColumns={[
              { id: 'customer', title: 'Customer' },
              { id: 'package', title: 'Package' },
            ]}
          />

          <div style={{ padding:'4px 4px 0', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:12, color:'#64748B' }}>Showing {soldPkgs.length} of {soldTotal}</span>
            {soldPages > 1 && (
              <div style={{ display:'flex', gap:6 }}>
                {Array.from({ length:Math.min(soldPages,10) }, (_,i) => (
                  <button key={i} type="button" onClick={() => setSoldPage(i+1)}
                    style={{ width:34, height:34, borderRadius:8, border:'1.5px solid', cursor:'pointer', fontWeight:600, fontSize:13, fontFamily:"'Inter',sans-serif",
                      borderColor:soldPage===i+1?'#2563EB':'#E4E7EC',
                      background:  soldPage===i+1?'#2563EB':'#fff',
                      color:       soldPage===i+1?'#fff':'#344054' }}>
                    {i+1}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/*  Package Modal  */}
      <PkgModal
        open={showPkgModal}
        onClose={() => setShowPkgModal(false)}
        title={editPkg ? 'Edit Package' : 'Create Package'}
        subtitle={editPkg ? 'Update services, price, and validity' : 'Select services and set a discounted bundle price'}
        size="lg"
        dark={isDark}
        footer={(
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 'auto', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={pkgForm.is_active}
                onChange={(e) => setPkgForm((f) => ({ ...f, is_active: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: '#7C3AED' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#E2E8F0' : '#344054' }}>Active</span>
            </label>
            <Button variant="secondary" onClick={() => setShowPkgModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSavePkg} loading={pkgSaving} disabled={pkgSaving}>
              {editPkg ? 'Save Changes' : 'Create Package'}
            </Button>
          </>
        )}
      >
        {pkgFormError && (
          <div style={{
            background: isDark ? '#450A0A' : '#FEE2E2', color: isDark ? '#FCA5A5' : '#DC2626',
            padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13,
            border: `1px solid ${isDark ? '#7F1D1D' : '#FECACA'}`, fontWeight: 500,
          }}>
            {pkgFormError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PkgSection title="Package details" desc="Name, validity, and optional branch scope" dark={isDark}>
            <div>
              <Label>Package name *</Label>
              <Input
                value={pkgForm.name}
                onChange={(e) => setPkgForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Hair Care Bundle"
              />
            </div>
            <div>
              <Label>Validity (days) *</Label>
              <Input
                type="number"
                min="1"
                value={pkgForm.validity_days}
                onChange={(e) => setPkgForm((f) => ({ ...f, validity_days: e.target.value }))}
                placeholder="90"
              />
            </div>
            {isAdmin && (
              <div>
                <Label>Branch</Label>
                <Select value={pkgForm.branch_id} onChange={(e) => setPkgForm((f) => ({ ...f, branch_id: e.target.value }))}>
                  <option value="">All branches</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </div>
            )}
          </PkgSection>

          <PkgSection title="Services *" desc="Add each service included in this package" dark={isDark}>
            <div>
              <Label>Service</Label>
              <Select
                value={servicePicker}
                onChange={(e) => addServiceFromPicker(e.target.value)}
              >
                <option value="">Select a service to add…</option>
                {allServices
                  .filter((s) => s.is_active !== false && !pkgForm.services.includes(String(s.id)))
                  .map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name} — Rs. {Number(svc.price || 0).toLocaleString()}
                    </option>
                  ))}
              </Select>
            </div>
            {pkgForm.services.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pkgForm.services.map((sid) => {
                  const svc = allServices.find((s) => String(s.id) === String(sid));
                  if (!svc) return null;
                  return (
                    <div
                      key={sid}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        padding: '10px 12px', borderRadius: 10,
                        border: `1px solid ${isDark ? '#334155' : '#E4E7EC'}`,
                        background: isDark ? '#1E293B' : '#F8FAFC',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.title }}>{svc.name}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginTop: 2 }}>
                          Rs. {Number(svc.price || 0).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeService(sid)}
                        aria-label="Remove service"
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: isDark ? '#FCA5A5' : '#DC2626', fontSize: 18, lineHeight: 1, padding: 4,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                <div style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: isDark ? '#0F172A' : '#fff',
                  border: `1px solid ${isDark ? '#334155' : '#E4E7EC'}`,
                  fontSize: 13, color: C.muted,
                }}>
                  {pkgForm.services.length} service{pkgForm.services.length !== 1 ? 's' : ''} · List value{' '}
                  <strong style={{ color: '#059669' }}>Rs. {originalPrice.toLocaleString()}</strong>
                </div>
              </div>
            )}
          </PkgSection>

          <PkgSection title="Bundle price" desc="Discounted price for this package bundle" dark={isDark}>
            <div>
              <Label>Package price (Rs.) *</Label>
              <Input
                type="number"
                min="0"
                value={pkgForm.package_price}
                onChange={(e) => setPkgForm((f) => ({ ...f, package_price: e.target.value }))}
                placeholder="0"
              />
            </div>
            {originalPrice > 0 && pkgForm.package_price && (
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: discountPct > 0 ? (isDark ? '#064E3B' : '#ECFDF5') : (isDark ? '#1E293B' : '#F9FAFB'),
                border: `1px solid ${discountPct > 0 ? (isDark ? '#065F46' : '#A7F3D0') : (isDark ? '#334155' : '#E4E7EC')}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ fontSize: 13, color: discountPct > 0 ? (isDark ? '#A7F3D0' : '#065F46') : C.muted }}>
                  {discountPct > 0
                    ? `Customer saves Rs. ${Math.round(originalPrice - Number(pkgForm.package_price)).toLocaleString()}`
                    : 'No discount vs list price'}
                </div>
                {discountPct > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>{discountPct.toFixed(1)}% off</span>
                )}
              </div>
            )}
          </PkgSection>
        </div>
      </PkgModal>

      {/*  Redeem Modal  */}
      <Modal open={showRedeemModal} onClose={() => setShowRedeemModal(false)} title="Redeem Session" width={420}
        footer={<>
          <button onClick={() => setShowRedeemModal(false)} style={{ padding:'8px 20px', borderRadius:10, border:'1.5px solid #E4E7EC', background:'#fff', color:'#344054', fontWeight:600, cursor:'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>Cancel</button>
          <button onClick={handleRedeem} disabled={redeemSaving}
            style={{ padding:'8px 22px', borderRadius:10, border:'none', background:redeemSaving?'#93C5FD':'#059669', color:'#fff', fontWeight:700, cursor:redeemSaving?'not-allowed':'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
            {redeemSaving ? 'Redeeming' : 'Redeem Session'}
          </button>
        </>}>
        {redeemTarget && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ padding:'10px 14px', background:'#F8FAFC', borderRadius:10, fontSize:13, fontFamily:"'Inter',sans-serif" }}>
              <strong>{redeemTarget.customer?.name}</strong>  {redeemTarget.package?.name}
              <div style={{ color:'#64748B', marginTop:4 }}>Sessions remaining: {(redeemTarget.sessions_total||0)-(redeemTarget.sessions_used||0)}</div>
            </div>
            <div><Lbl>Service</Lbl>
              <select value={redeemSvcId} onChange={e=>setRedeemSvcId(e.target.value)} style={inp}>
                <option value="">Select service</option>
                {(redeemTarget.package?.services||[]).map(sid => {
                  const svc = allServices.find(s => s.id === Number(sid));
                  return svc ? <option key={sid} value={sid}>{svc.name}</option> : null;
                })}
              </select>
            </div>
            <div><Lbl>Notes (optional)</Lbl>
              <textarea value={redeemNotes} onChange={e=>setRedeemNotes(e.target.value)} placeholder="Optional notes" rows={2} style={{ ...inp, resize:'vertical' }} />
            </div>
            {redeemError && <div style={{ padding:'8px 12px', background:'#FEE2E2', borderRadius:8, color:'#DC2626', fontSize:13, fontFamily:"'Inter',sans-serif" }}>{redeemError}</div>}
          </div>
        )}
      </Modal>
    </PageWrapper>
  );
}
