import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import {
  IconPkg, IconCheck, IconDollar, IconUsers, IconTag,
  StatCard, PKModal as Modal,
  FilterBar, SearchBar, DataTable,
} from '../components/ui/PageKit';

/*  constants  */
const ACCENT_COLOR  = { bundle:'#2563EB', membership:'#7C3AED' };
const TYPE_BADGE    = { bundle:{ bg:'#EFF6FF', color:'#1D4ED8' }, membership:{ bg:'#EDE9FE', color:'#7C3AED' } };
const STATUS_BADGE  = {
  active:    { bg:'#D1FAE5', color:'#059669' },
  expired:   { bg:'#FEE2E2', color:'#DC2626' },
  completed: { bg:'#F1F5F9', color:'#475467' },
};
const PAYMENT_METHODS = ['Cash','Card','Online Transfer','Bank Transfer'];
const EMPTY_PKG  = { name:'', description:'', type:'bundle', services:[], sessions_count:'', validity_days:'90', package_price:'', is_active:true, branch_id:'' };
const EMPTY_SELL = { customer_id:'', package_id:'', branch_id:'', payment_method:'Cash', notes:'' };
const EMPTY_CREATE_ACTIVATE = { customer_id:'', payment_method:'Cash', notes:'', activate_all:false };
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
function PackageCard({ pkg, canEdit, onEdit, onToggle, onDelete, onSell }) {
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
          <span style={{ color:'#64748B', display:'flex' }}><IconUsers /></span>
          <div>
            <div style={{ fontSize:11, color:MUTED, fontFamily:"'Inter',sans-serif" }}>Sessions</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#344054', fontFamily:"'Outfit',sans-serif" }}>{pkg.sessions_count || ''}</div>
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
          <button onClick={() => onSell(pkg)}
            style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #BFDBFE', background:'#EFF6FF', cursor:'pointer', fontSize:12, fontWeight:600, color:'#2563EB', fontFamily:"'Inter',sans-serif" }}>Sell</button>
          <button onClick={() => onDelete(pkg.id)}
            style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:600, color:'#DC2626', marginLeft:'auto', fontFamily:"'Inter',sans-serif" }}>Delete</button>
        </div>
      )}
    </div>
  );
}

/*  inline form styles  */
const inp  = { width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:'#101828', background:'#fff' };
const head = { fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.6px', paddingBottom:8, borderBottom:'1px solid #F2F4F7', marginBottom:4 };
function Lbl({ children }) { return <div style={{ fontSize:12, fontWeight:700, color:'#344054', marginBottom:5, fontFamily:"'Inter',sans-serif" }}>{children}</div>; }

/*  Page  */
export default function PackagesPage() {
  const { user } = useAuth();
  const isAdmin  = ['superadmin','admin'].includes(user?.role);
  const canEdit  = ['superadmin','admin','manager'].includes(user?.role);
  const [activeTab, setActiveTab] = useState('templates');

  const [branches,    setBranches]    = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [customers,   setCustomers]   = useState([]);
  const [custSearch,  setCustSearch]  = useState('');

  const [packages,   setPackages]   = useState([]);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgError,   setPkgError]   = useState('');

  const [showPkgModal, setShowPkgModal] = useState(false);
  const [editPkg,      setEditPkg]      = useState(null);
  const [pkgForm,      setPkgForm]      = useState(EMPTY_PKG);
  const [createActivate, setCreateActivate] = useState(EMPTY_CREATE_ACTIVATE);
  const [pkgSaving,    setPkgSaving]    = useState(false);
  const [pkgFormError, setPkgFormError] = useState('');

  const [soldPkgs,     setSoldPkgs]     = useState([]);
  const [soldTotal,    setSoldTotal]    = useState(0);
  const [soldPage,     setSoldPage]     = useState(1);
  const [soldLoading,  setSoldLoading]  = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [soldSearch,   setSoldSearch]   = useState('');

  const [showSellModal,  setShowSellModal]  = useState(false);
  const [sellStep,       setSellStep]       = useState(1);
  const [sellForm,       setSellForm]       = useState(EMPTY_SELL);
  const [sellSaving,     setSellSaving]     = useState(false);
  const [sellError,      setSellError]      = useState('');

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
    api.get('/customers?limit=500').then(r => setCustomers(r.data.data || r.data || [])).catch(() => {});
  }, [isAdmin]);

  const originalPrice = useMemo(() => {
    const sessions = Number(pkgForm.sessions_count) || 1;
    return pkgForm.services.reduce((sum, sid) => {
      const svc = allServices.find(s => s.id === Number(sid));
      return sum + (svc ? Number(svc.price) : 0);
    }, 0) * sessions;
  }, [pkgForm.services, pkgForm.sessions_count, allServices]);

  const discountPct = useMemo(() => {
    if (!originalPrice || !pkgForm.package_price) return 0;
    return Math.max(0, ((originalPrice - Number(pkgForm.package_price)) / originalPrice) * 100);
  }, [originalPrice, pkgForm.package_price]);

  const filteredCustomers = useMemo(() => {
    if (!custSearch.trim()) return customers;
    const q = custSearch.toLowerCase();
    return customers.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q));
  }, [customers, custSearch]);

  const sellSelectedPkg  = packages.find(p => String(p.id) === String(sellForm.package_id));
  const sellSelectedCust = customers.find(c => String(c.id) === String(sellForm.customer_id));
  const soldPages        = Math.ceil(soldTotal / 20);

  const activeCount    = packages.filter(p => p.is_active).length;
  const bundleCount    = packages.filter(p => p.type === 'bundle').length;
  const memberCount    = packages.filter(p => p.type === 'membership').length;

  const visibleSold = useMemo(() => {
    if (!soldSearch.trim()) return soldPkgs;
    const q = soldSearch.toLowerCase();
    return soldPkgs.filter(cp => cp.customer?.name?.toLowerCase().includes(q) || cp.package?.name?.toLowerCase().includes(q));
  }, [soldPkgs, soldSearch]);

  /*  package CRUD  */
  const openCreatePkg = () => {
    setEditPkg(null);
    setPkgForm({ ...EMPTY_PKG, branch_id: user.branchId ? String(user.branchId) : '' });
    setCreateActivate(EMPTY_CREATE_ACTIVATE);
    setPkgFormError('');
    setShowPkgModal(true);
  };
  const openEditPkg = (pkg) => {
    setEditPkg(pkg);
    setPkgForm({
      name:          pkg.name         || '',
      description:   pkg.description  || '',
      type:          pkg.type         || 'bundle',
      services:      (pkg.services || []).map(String),
      sessions_count:pkg.sessions_count != null ? String(pkg.sessions_count) : '',
      validity_days: pkg.validity_days  != null ? String(pkg.validity_days)  : '90',
      package_price: pkg.package_price  != null ? String(pkg.package_price)  : '',
      is_active:     pkg.is_active !== false,
      branch_id:     pkg.branch_id ? String(pkg.branch_id) : '',
    });
    setCreateActivate(EMPTY_CREATE_ACTIVATE);
    setPkgFormError('');
    setShowPkgModal(true);
  };

  const handleActivateAllExisting = async () => {
    if (!editPkg) return;
    const branchId = pkgForm.branch_id || user.branchId || null;
    const label    = branchId ? 'customers in the selected branch' : 'ALL customers across all branches';
    if (!window.confirm(`Activate "${editPkg.name}" for ${label}?`)) return;
    setPkgSaving(true); setPkgFormError('');
    try {
      const res = await api.post('/packages/purchase-all', {
        packageId:     editPkg.id,
        branchId:      branchId ? Number(branchId) : undefined,
        paymentMethod: createActivate.payment_method || 'Cash',
        notes:         createActivate.notes || undefined,
      });
      setShowPkgModal(false);
      loadPackages();
      alert(res.data?.message || 'Activation complete.');
    } catch (err) {
      setPkgFormError(err.response?.data?.message || 'Activation failed.');
    } finally {
      setPkgSaving(false);
    }
  };
  const toggleService = (sid) => {
    const s = String(sid);
    setPkgForm(f => ({ ...f, services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s] }));
  };
  const handleSavePkg = async (activationMode = 'none') => {
    const activateForSingle = activationMode === 'single';
    const activateForAll = activationMode === 'all';
    setPkgFormError('');
    if (!pkgForm.name.trim())          { setPkgFormError('Package name is required.');   return; }
    if (!pkgForm.package_price)        { setPkgFormError('Package price is required.');  return; }
    if (pkgForm.services.length === 0) { setPkgFormError('Select at least one service.'); return; }
    if (!editPkg && activateForSingle && !createActivate.customer_id) {
      setPkgFormError('Please select a customer to activate this package.');
      return;
    }
    if (!editPkg && activateForSingle) {
      const selectedCustomer = customers.find(c => String(c.id) === String(createActivate.customer_id));
      const preBranchId = (pkgForm.branch_id ? Number(pkgForm.branch_id) : null) || user.branchId || selectedCustomer?.branch_id || selectedCustomer?.branchId;
      if (!preBranchId) {
        setPkgFormError('Please select a branch to activate this package.');
        return;
      }
    }
    if (!editPkg && activateForAll) {
      const ok = window.confirm('Activate this package for ALL customers in the selected branch?');
      if (!ok) return;
    }
    setPkgSaving(true);
    try {
      const payload = {
        name:            pkgForm.name.trim(),
        description:     pkgForm.description.trim(),
        type:            pkgForm.type,
        services:        pkgForm.services.map(Number),
        sessions_count:  Number(pkgForm.sessions_count) || pkgForm.services.length,
        validity_days:   Number(pkgForm.validity_days)  || 90,
        package_price:   Number(pkgForm.package_price),
        original_price:  originalPrice || Number(pkgForm.package_price),
        discount_percent:Number(discountPct.toFixed(2)),
        is_active:       pkgForm.is_active,
        branch_id:       pkgForm.branch_id ? Number(pkgForm.branch_id) : null,
      };
      let createdPkg = null;
      if (editPkg) {
        await api.put(`/packages/${editPkg.id}`, payload);
      } else {
        const res = await api.post('/packages', payload);
        createdPkg = res.data || null;
      }
      if (!editPkg && activateForSingle) {
        const selectedCustomer = customers.find(c => String(c.id) === String(createActivate.customer_id));
        const activationBranchId = payload.branch_id || user.branchId || selectedCustomer?.branch_id || selectedCustomer?.branchId;
        if (!activationBranchId) {
          setPkgFormError('Please select a branch to activate this package.');
          return;
        }
        await api.post('/packages/purchase', {
          customer_id: Number(createActivate.customer_id),
          package_id: Number(createdPkg?.id),
          branch_id: Number(activationBranchId),
          payment_method: createActivate.payment_method || 'Cash',
          notes: createActivate.notes || undefined,
        });
      }
      if (!editPkg && activateForAll) {
        const activationBranchId = payload.branch_id || user.branchId || null;
        await api.post('/packages/purchase-all', {
          packageId:     Number(createdPkg?.id),
          branchId:      activationBranchId ? Number(activationBranchId) : undefined,
          paymentMethod: createActivate.payment_method || 'Cash',
          notes:         createActivate.notes || undefined,
        });
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

  /*  sell  */
  const openSellModal = (preselectedPkg = null) => {
    setSellStep(1);
    setSellForm({ ...EMPTY_SELL, branch_id:user.branchId?String(user.branchId):'', package_id:preselectedPkg?String(preselectedPkg.id):'' });
    setSellError('');
    setCustSearch('');
    setShowSellModal(true);
  };
  const handleSell = async () => {
    setSellError('');
    if (!sellForm.customer_id) { setSellError('Please select a customer.'); return; }
    if (!sellForm.package_id)  { setSellError('Please select a package.');  return; }
    const branchId = sellForm.branch_id || user.branchId;
    if (!branchId) { setSellError('Please select a branch.'); return; }
    setSellSaving(true);
    try {
      await api.post('/packages/purchase', {
        customer_id:    Number(sellForm.customer_id),
        package_id:     Number(sellForm.package_id),
        branch_id:      Number(branchId),
        payment_method: sellForm.payment_method,
        notes:          sellForm.notes || undefined,
      });
      setShowSellModal(false);
      if (activeTab === 'sold') loadSold();
    } catch (err) { setSellError(err.response?.data?.message || 'Purchase failed.'); }
    finally { setSellSaving(false); }
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
        <div style={{ display:'flex', gap:8 }}>
          {canEdit && (
            <button onClick={() => openSellModal()}
              style={{ display:'flex', alignItems:'center', gap:6, background:'#2563EB', color:'#fff', border:'none', borderRadius:10, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
              <IconDollar /> Sell Package
            </button>
          )}
          {canEdit && activeTab === 'templates' && (
            <button onClick={openCreatePkg}
              style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', color:'#344054', border:'1.5px solid #E4E7EC', borderRadius:10, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
              + New Package
            </button>
          )}
        </div>
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
          {pkgLoading ? (
            <div style={{ textAlign:'center', padding:60, color:'#64748B', fontFamily:"'Inter',sans-serif" }}>Loading packages</div>
          ) : packages.length === 0 ? (
            <div style={{ textAlign:'center', padding:80 }}>
              <div style={{ color:'#CBD5E1', marginBottom:12 }}><IconPkg /></div>
              <div style={{ fontSize:18, fontWeight:700, color:'#344054', marginBottom:6, fontFamily:"'Inter',sans-serif" }}>No packages yet</div>
              <div style={{ fontSize:14, color:'#64748B', marginBottom:20, fontFamily:"'Inter',sans-serif" }}>Create your first package template to get started</div>
              {canEdit && <button onClick={openCreatePkg} style={{ background:'#2563EB', color:'#fff', border:'none', borderRadius:10, padding:'9px 20px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>+ Create Package</button>}
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:20 }}>
              {packages.map(pkg => (
                <PackageCard key={pkg.id} pkg={pkg} canEdit={canEdit}
                  onEdit={openEditPkg} onToggle={handleTogglePkg} onDelete={handleDeletePkg} onSell={openSellModal} />
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB: Sold Packages */}
      {activeTab === 'sold' && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #EAECF0', overflow:'hidden', boxShadow:'0 1px 4px rgba(16,24,40,0.07)' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #F2F4F7' }}>
            <FilterBar>
              <SearchBar value={soldSearch} onChange={setSoldSearch} placeholder="Search customer or package" />
              {[['','All'],['active','Active'],['expired','Expired'],['completed','Completed']].map(([val,label]) => (
                <button key={val} onClick={() => { setFilterStatus(val); setSoldPage(1); }}
                  style={{ padding:'6px 14px', borderRadius:10, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:"'Inter',sans-serif", border:'1.5px solid', transition:'all 0.15s',
                    borderColor:filterStatus===val?'#2563EB':'#E4E7EC',
                    background:  filterStatus===val?'#EFF6FF':'#fff',
                    color:       filterStatus===val?'#2563EB':'#64748B' }}>
                  {label}
                </button>
              ))}
              {isAdmin && (
                <select value={filterBranch} onChange={e=>{ setFilterBranch(e.target.value); setSoldPage(1); }}
                  style={{ padding:'6px 10px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
                  <option value="">All Branches</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <span style={{ marginLeft:'auto', fontSize:13, color:'#64748B', fontFamily:"'Inter',sans-serif" }}>{soldTotal} record{soldTotal!==1?'s':''}</span>
            </FilterBar>
          </div>

          <DataTable noShell
            columns={[
              { id:'customer', header:'Customer', meta:{ width:'20%' },
                accessorFn: r => r.customer?.name || '',
                cell: ({ row }) => {
                  const cp = row.original;
                  return (
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:34, height:34, borderRadius:'50%', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:700, fontSize:14, color:'#2563EB', fontFamily:"'Outfit',sans-serif" }}>
                        {(cp.customer?.name||'?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600, color:'#101828', fontFamily:"'Inter',sans-serif" }}>{cp.customer?.name||''}</div>
                        <div style={{ fontSize:12, color:'#64748B', fontFamily:"'Inter',sans-serif" }}>{cp.customer?.phone||''}</div>
                      </div>
                    </div>
                  );
                }
              },
              { id:'package', header:'Package', meta:{ width:'18%' },
                accessorFn: r => r.package?.name || '',
                cell: ({ row }) => {
                  const cp = row.original;
                  const tb2 = TYPE_BADGE[cp.package?.type] || TYPE_BADGE.bundle;
                  return (
                    <>
                      <div style={{ fontSize:13, fontWeight:600, color:'#101828', marginBottom:3, fontFamily:"'Inter',sans-serif" }}>{cp.package?.name||''}</div>
                      <span style={{ padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600, background:tb2.bg, color:tb2.color, fontFamily:"'Inter',sans-serif" }}>
                        {cp.package?.type}
                      </span>
                    </>
                  );
                }
              },
              { id:'purchased', header:'Purchased', meta:{ width:'13%' },
                accessorFn: r => r.purchase_date || '',
                cell: ({ getValue }) => <span style={{ fontSize:13, color:'#344054', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
                  {getValue() ? new Date(getValue()).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}) : ''}
                </span>
              },
              { id:'expiry', header:'Expiry', meta:{ width:'13%' },
                accessorFn: r => r.expiry_date || '',
                cell: ({ row }) => {
                  const cp = row.original;
                  const dl = daysLeft(cp.expiry_date);
                  return (
                    <div style={{ whiteSpace:'nowrap' }}>
                      <div style={{ fontSize:13, color:'#344054', fontFamily:"'Inter',sans-serif" }}>
                        {cp.expiry_date ? new Date(cp.expiry_date).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}) : ''}
                      </div>
                      {dl !== null && (
                        <div style={{ fontSize:12, fontWeight:600, marginTop:2, fontFamily:"'Inter',sans-serif", color:dl<0?'#DC2626':dl<7?'#D97706':'#059669' }}>
                          {dl<0?'Expired':dl===0?'Expires today':`${dl} days left`}
                        </div>
                      )}
                    </div>
                  );
                }
              },
              { id:'sessions', header:'Sessions', meta:{ width:'18%', padding:'12px 16px' },
                cell: ({ row }) => <SessionBar used={row.original.sessions_used||0} total={row.original.sessions_total||0} />
              },
              { id:'status', header:'Status', meta:{ width:'12%', align:'center' },
                accessorFn: r => r.status || '',
                cell: ({ row }) => {
                  const sb = STATUS_BADGE[row.original.status] || STATUS_BADGE.active;
                  return (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:10, fontSize:11, fontWeight:700, background:sb.bg, color:sb.color, fontFamily:"'Inter',sans-serif" }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:sb.color }} />
                      {row.original.status}
                    </span>
                  );
                }
              },
              { id:'action', header:'Action', meta:{ width:'6%', align:'center' },
                cell: ({ row }) => {
                  const cp = row.original;
                  if (!canEdit || cp.status !== 'active') return null;
                  return (
                    <button onClick={() => openRedeemModal(cp)} title="Redeem Session"
                      style={{ padding:'5px 10px', borderRadius:8, border:'1.5px solid #E4E7EC', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#059669', fontFamily:"'Inter',sans-serif" }}>
                      Redeem
                    </button>
                  );
                }
              },
            ]}
            data={visibleSold}
            loading={soldLoading}
            emptyMessage="No sold packages found"
            emptySub="Sold packages will appear here"
          />

          {soldPages > 1 && (
            <div style={{ display:'flex', gap:6, padding:'12px 16px', justifyContent:'center', borderTop:'1px solid #F2F4F7' }}>
              {Array.from({ length:Math.min(soldPages,10) }, (_,i) => (
                <button key={i} onClick={() => setSoldPage(i+1)}
                  style={{ width:34, height:34, borderRadius:8, border:'1.5px solid', cursor:'pointer', fontWeight:600, fontSize:13, fontFamily:"'Inter',sans-serif", transition:'all 0.15s',
                    borderColor:soldPage===i+1?'#2563EB':'#E4E7EC',
                    background:  soldPage===i+1?'#2563EB':'#fff',
                    color:       soldPage===i+1?'#fff':'#344054' }}>
                  {i+1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/*  Package Modal  */}
      <Modal open={showPkgModal} onClose={() => setShowPkgModal(false)} title={editPkg ? 'Edit Package' : 'Create Package'} width={1280}
        footer={<>
          <button onClick={() => setShowPkgModal(false)} style={{ padding:'8px 20px', borderRadius:10, border:'1.5px solid #E4E7EC', background:'#fff', color:'#344054', fontWeight:600, cursor:'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>Cancel</button>
          {editPkg && (
            <button onClick={handleActivateAllExisting} disabled={pkgSaving}
              style={{ padding:'8px 22px', borderRadius:10, border:'1.5px solid #86EFAC', background:pkgSaving?'#E5E7EB':'#F0FDF4', color:pkgSaving?'#64748B':'#166534', fontWeight:700, cursor:pkgSaving?'not-allowed':'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
              {pkgSaving ? 'Activating...' : '\u2713 Activate All Customers'}
            </button>
          )}
          {!editPkg && (
            <button onClick={() => handleSavePkg(createActivate.activate_all ? 'all' : 'single')} disabled={pkgSaving}
              style={{ padding:'8px 22px', borderRadius:10, border:'1.5px solid #BFDBFE', background:pkgSaving?'#E5E7EB':'#EFF6FF', color:pkgSaving?'#64748B':'#1D4ED8', fontWeight:700, cursor:pkgSaving?'not-allowed':'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
              {pkgSaving ? 'Saving' : createActivate.activate_all ? 'Create & Activate All Customers' : 'Create & Activate'}
            </button>
          )}
          <button onClick={handleSavePkg} disabled={pkgSaving}
            style={{ padding:'8px 22px', borderRadius:10, border:'none', background:pkgSaving?'#93C5FD':'#2563EB', color:'#fff', fontWeight:700, cursor:pkgSaving?'not-allowed':'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
            {pkgSaving ? 'Saving' : editPkg ? 'Save Changes' : 'Create Package'}
          </button>
        </>}>
        <div style={{ display:'flex', flexDirection:'column', gap:22 }}>
          {/* §1 */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={head}>1. Basic Information</div>
            <div><Lbl>Package Name</Lbl><input value={pkgForm.name} onChange={e=>setPkgForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Hair Care Bundle" style={inp} /></div>
            <div>
              <Lbl>Type</Lbl>
              <div style={{ display:'flex', gap:10 }}>
                {[['bundle','Bundle'],['membership','Membership']].map(([val,label]) => (
                  <button key={val} type="button" onClick={() => setPkgForm(f=>({...f,type:val}))}
                    style={{ flex:1, padding:'10px 16px', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', transition:'all 0.15s', fontFamily:"'Inter',sans-serif",
                      border:     pkgForm.type===val?`2px solid ${ACCENT_COLOR[val]}`:'1.5px solid #D0D5DD',
                      background: pkgForm.type===val?(val==='bundle'?'#EFF6FF':'#EDE9FE'):'#fff',
                      color:      pkgForm.type===val?ACCENT_COLOR[val]:'#344054' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div><Lbl>Description</Lbl>
              <textarea value={pkgForm.description} onChange={e=>setPkgForm(f=>({...f,description:e.target.value}))} placeholder="Optional description" rows={2} style={{ ...inp, resize:'vertical' }} />
            </div>
          </div>
          {/* §2 Services */}
          <div>
            <div style={head}>2. Included Services</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, maxHeight:220, overflowY:'auto', padding:2 }}>
              {allServices.map(svc => {
                const sel = pkgForm.services.includes(String(svc.id));
                return (
                  <div key={svc.id} onClick={() => toggleService(svc.id)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, cursor:'pointer', transition:'all 0.15s',
                      border:     sel?'2px solid #2563EB':'1.5px solid #E4E7EC',
                      background: sel?'#EFF6FF':'#fff' }}>
                    <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${sel?'#2563EB':'#D0D5DD'}`, background:sel?'#2563EB':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div style={{ flex:1, fontSize:13, fontWeight:600, color:'#344054', fontFamily:"'Inter',sans-serif" }}>{svc.name}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#64748B', fontFamily:"'Outfit',sans-serif" }}>Rs.{Number(svc.price).toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
            {originalPrice > 0 && (
              <div style={{ marginTop:8, padding:'7px 12px', background:'#F9FAFB', borderRadius:8, fontSize:13, color:'#344054', fontFamily:"'Inter',sans-serif" }}>
                Total value: <strong style={{ fontFamily:"'Outfit',sans-serif" }}>Rs. {originalPrice.toLocaleString()}</strong>
              </div>
            )}
          </div>
          {/* §3 Terms */}
          <div>
            <div style={head}>3. Terms</div>
            <div style={{ display:'grid', gridTemplateColumns:pkgForm.type==='bundle'?'1fr 1fr':'1fr', gap:12 }}>
              {pkgForm.type === 'bundle' && (
                <div><Lbl>Sessions Count</Lbl>
                  <input type="number" min="1" value={pkgForm.sessions_count} onChange={e=>setPkgForm(f=>({...f,sessions_count:e.target.value}))} placeholder={String(pkgForm.services.length||1)} style={inp} />
                </div>
              )}
              <div><Lbl>Validity (days)</Lbl>
                <input type="number" min="1" value={pkgForm.validity_days} onChange={e=>setPkgForm(f=>({...f,validity_days:e.target.value}))} placeholder="90" style={inp} />
              </div>
            </div>
            {isAdmin && (
              <div style={{ marginTop:12 }}>
                <Lbl>Branch</Lbl>
                <select value={pkgForm.branch_id} onChange={e=>setPkgForm(f=>({...f,branch_id:e.target.value}))} style={inp}>
                  <option value="">All Branches</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {/* §4 Pricing */}
          <div>
            <div style={head}>4. Pricing</div>
            <Lbl>Package Price (Rs.)</Lbl>
            <input type="number" min="0" value={pkgForm.package_price} onChange={e=>setPkgForm(f=>({...f,package_price:e.target.value}))} placeholder="0" style={inp} />
            {originalPrice>0 && pkgForm.package_price && (
              <div style={{ marginTop:8, padding:'10px 14px', borderRadius:10, background:discountPct>0?'#D1FAE5':'#F9FAFB', border:`1px solid ${discountPct>0?'#A7F3D0':'#E4E7EC'}`, fontSize:13, fontWeight:600, color:discountPct>0?'#065F46':'#64748B', fontFamily:"'Inter',sans-serif" }}>
                {discountPct>0 ? `Saving customers Rs. ${Math.round(originalPrice-Number(pkgForm.package_price)).toLocaleString()} (${discountPct.toFixed(1)}% off)` : 'No discount applied'}
              </div>
            )}
          </div>
          {!editPkg && (
            <div>
              <div style={head}>5. Activation Options</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <Lbl>Customer (for single activation)</Lbl>
                  <select value={createActivate.customer_id} onChange={e=>setCreateActivate(f=>({...f,customer_id:e.target.value}))} style={{ ...inp, opacity:createActivate.activate_all ? 0.6 : 1 }} disabled={createActivate.activate_all}>
                    <option value="">Select customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <Lbl>Payment Method</Lbl>
                  <select value={createActivate.payment_method} onChange={e=>setCreateActivate(f=>({...f,payment_method:e.target.value}))} style={inp}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop:10 }}>
                <Lbl>Activation Notes (optional)</Lbl>
                <textarea value={createActivate.notes} onChange={e=>setCreateActivate(f=>({...f,notes:e.target.value}))} placeholder="Notes for package activation" rows={2} style={{ ...inp, resize:'vertical' }} />
              </div>
              <label style={{ marginTop:10, display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:600, color:'#065F46', fontFamily:"'Inter',sans-serif" }}>
                <input type="checkbox" checked={createActivate.activate_all} onChange={e=>setCreateActivate(f=>({...f,activate_all:e.target.checked}))} style={{ width:14, height:14, accentColor:'#059669' }} />
                Activate for all customers in selected branch
              </label>
            </div>
          )}
          {editPkg && (
            <div>
              <div style={head}>5. Activate for All Customers</div>
              <div style={{ padding:'12px 14px', background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:10, fontSize:13, color:'#166534', marginBottom:12, fontFamily:"'Inter',sans-serif" }}>
                Activate <strong>"{editPkg.name}"</strong> for {pkgForm.branch_id ? 'all customers in the selected branch' : 'ALL customers across all branches'}.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <Lbl>Payment Method</Lbl>
                  <select value={createActivate.payment_method} onChange={e=>setCreateActivate(f=>({...f,payment_method:e.target.value}))} style={inp}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <Lbl>Notes (optional)</Lbl>
                  <input value={createActivate.notes} onChange={e=>setCreateActivate(f=>({...f,notes:e.target.value}))} placeholder="Activation notes" style={inp} />
                </div>
              </div>
            </div>
          )}
          {/* Active toggle */}
          <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:4, borderTop:'1px solid #F2F4F7' }}>
            <button type="button" onClick={() => setPkgForm(f=>({...f,is_active:!f.is_active}))}
              style={{ width:44, height:24, borderRadius:12, background:pkgForm.is_active?'#2563EB':'#D0D5DD', border:'none', cursor:'pointer', position:'relative', transition:'background 0.2s' }}>
              <span style={{ position:'absolute', top:2, left:pkgForm.is_active?22:2, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
            <span style={{ fontSize:14, fontWeight:600, color:'#344054', fontFamily:"'Inter',sans-serif" }}>Active</span>
          </div>
          {pkgFormError && <div style={{ padding:'8px 12px', background:'#FEE2E2', borderRadius:8, color:'#DC2626', fontSize:13, fontFamily:"'Inter',sans-serif" }}>{pkgFormError}</div>}
        </div>
      </Modal>

      {/*  Sell Modal (3-step)  */}
      <Modal open={showSellModal} onClose={() => setShowSellModal(false)} title="Sell Package" width={560}>
        {/* Stepper */}
        <div style={{ display:'flex', alignItems:'center', marginBottom:24 }}>
          {[1,2,3].map((step,i) => {
            const labels = ['Customer','Package','Payment'];
            const done   = sellStep > step;
            const active = sellStep === step;
            return (
              <Fragment key={step}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, fontFamily:"'Outfit',sans-serif",
                    background: done?'#2563EB':active?'#EFF6FF':'#F2F4F7',
                    border:     active?'2px solid #2563EB':done?'none':'2px solid #D0D5DD',
                    color:      done?'#fff':active?'#2563EB':'#64748B' }}>
                    {done ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : step}
                  </div>
                  <span style={{ fontSize:11, fontWeight:600, color:active?'#2563EB':'#64748B', fontFamily:"'Inter',sans-serif" }}>{labels[i]}</span>
                </div>
                {i < 2 && <div style={{ flex:1, height:2, background:done?'#2563EB':'#E4E7EC', margin:'0 8px', marginBottom:20 }} />}
              </Fragment>
            );
          })}
        </div>
        {/* Step 1 */}
        {sellStep === 1 && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div><Lbl>Search Customer</Lbl>
              <input value={custSearch} onChange={e=>setCustSearch(e.target.value)} placeholder="Search by name or phone" style={inp} />
            </div>
            <div style={{ maxHeight:230, overflowY:'auto', border:'1px solid #E4E7EC', borderRadius:10, overflow:'hidden' }}>
              {filteredCustomers.slice(0,20).map(c => {
                const sel = String(c.id) === String(sellForm.customer_id);
                return (
                  <div key={c.id} onClick={() => setSellForm(f=>({...f,customer_id:String(c.id)}))}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:sel?'#EFF6FF':'#fff', borderBottom:'1px solid #F2F4F7', cursor:'pointer', borderLeft:sel?'3px solid #2563EB':'3px solid transparent', transition:'background 0.1s' }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:700, fontSize:15, color:'#2563EB', fontFamily:"'Outfit',sans-serif" }}>
                      {(c.name||'?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'#101828', fontFamily:"'Inter',sans-serif" }}>{c.name}</div>
                      <div style={{ fontSize:12, color:'#64748B', fontFamily:"'Inter',sans-serif" }}>{c.phone||'No phone'}</div>
                    </div>
                    {sel && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                );
              })}
              {filteredCustomers.length === 0 && <div style={{ textAlign:'center', padding:'24px 16px', color:'#64748B', fontSize:13, fontFamily:"'Inter',sans-serif" }}>No customers found</div>}
            </div>
            {sellSelectedCust && (
              <div style={{ padding:'12px 16px', background:'linear-gradient(135deg,#2563EB,#7C3AED)', borderRadius:12, color:'#fff' }}>
                <div style={{ fontSize:15, fontWeight:700, fontFamily:"'Outfit',sans-serif" }}>{sellSelectedCust.name}</div>
                <div style={{ fontSize:12, opacity:0.8, marginTop:2, fontFamily:"'Inter',sans-serif" }}>{sellSelectedCust.phone||''}</div>
              </div>
            )}
          </div>
        )}
        {/* Step 2 */}
        {sellStep === 2 && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {packages.filter(p=>p.is_active).map(p => {
              const sel    = String(p.id) === String(sellForm.package_id);
              const accent = ACCENT_COLOR[p.type] || ACCENT_COLOR.bundle;
              return (
                <div key={p.id} onClick={() => setSellForm(f=>({...f,package_id:String(p.id)}))}
                  style={{ padding:'14px 16px', borderRadius:12, cursor:'pointer', position:'relative', transition:'all 0.15s',
                    borderTop:  `3px solid ${accent}`,
                    border:     sel?`2px solid ${accent}`:'1.5px solid #E4E7EC',
                    background: sel?(p.type==='bundle'?'#EFF6FF':'#EDE9FE'):'#fff' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#101828', marginBottom:4, fontFamily:"'Inter',sans-serif" }}>{p.name}</div>
                  <div style={{ fontSize:11, color:'#64748B', fontFamily:"'Inter',sans-serif" }}>{p.sessions_count} sessions  {p.validity_days} days</div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#101828', marginTop:6, fontFamily:"'Outfit',sans-serif" }}>Rs. {Number(p.package_price).toLocaleString()}</div>
                  {Number(p.discount_percent) > 0 && (
                    <span style={{ position:'absolute', top:8, right:8, padding:'2px 8px', borderRadius:10, background:'#D1FAE5', color:'#059669', fontSize:10, fontWeight:700, fontFamily:"'Inter',sans-serif" }}>
                      {Math.round(p.discount_percent)}% OFF
                    </span>
                  )}
                </div>
              );
            })}
            {packages.filter(p=>p.is_active).length === 0 && (
              <div style={{ gridColumn:'1/-1', textAlign:'center', padding:24, color:'#64748B', fontFamily:"'Inter',sans-serif" }}>No active packages available</div>
            )}
          </div>
        )}
        {/* Step 3 */}
        {sellStep === 3 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {sellSelectedPkg && (
              <div style={{ padding:16, background:'linear-gradient(135deg,#2563EB 0%,#7C3AED 100%)', borderRadius:14, color:'#fff', marginBottom:4 }}>
                <div style={{ fontSize:11, opacity:0.8, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:4, fontFamily:"'Inter',sans-serif" }}>Package Summary</div>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:10, fontFamily:"'Outfit',sans-serif" }}>{sellSelectedPkg.name}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {[[sellSelectedPkg.sessions_count,'Sessions'],[`${sellSelectedPkg.validity_days}d`,'Validity'],[`Rs.${Number(sellSelectedPkg.package_price).toLocaleString()}`,'Price']].map(([val,lbl]) => (
                    <div key={lbl} style={{ textAlign:'center', background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'6px 4px' }}>
                      <div style={{ fontSize:15, fontWeight:800, fontFamily:"'Outfit',sans-serif" }}>{val}</div>
                      <div style={{ fontSize:10, opacity:0.8, fontFamily:"'Inter',sans-serif" }}>{lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!user.branchId && (
              <div><Lbl>Branch</Lbl>
                <select value={sellForm.branch_id} onChange={e=>setSellForm(f=>({...f,branch_id:e.target.value}))} style={inp}>
                  <option value="">Select branch</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div><Lbl>Payment Method</Lbl>
              <select value={sellForm.payment_method} onChange={e=>setSellForm(f=>({...f,payment_method:e.target.value}))} style={inp}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div><Lbl>Notes (optional)</Lbl>
              <textarea value={sellForm.notes} onChange={e=>setSellForm(f=>({...f,notes:e.target.value}))} placeholder="Any notes" rows={2} style={{ ...inp, resize:'vertical' }} />
            </div>
          </div>
        )}
        {sellError && <div style={{ marginTop:12, padding:'8px 12px', background:'#FEE2E2', borderRadius:8, color:'#DC2626', fontSize:13, fontFamily:"'Inter',sans-serif" }}>{sellError}</div>}
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:20 }}>
          <button onClick={() => sellStep>1 ? setSellStep(s=>s-1) : setShowSellModal(false)}
            style={{ padding:'8px 20px', borderRadius:10, border:'1.5px solid #E4E7EC', background:'#fff', color:'#344054', fontWeight:600, cursor:'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
            {sellStep === 1 ? 'Cancel' : ' Back'}
          </button>
          {sellStep < 3 ? (
            <button onClick={() => {
              if (sellStep===1 && !sellForm.customer_id) { setSellError('Please select a customer.'); return; }
              if (sellStep===2 && !sellForm.package_id)  { setSellError('Please select a package.');  return; }
              setSellError(''); setSellStep(s=>s+1);
            }} style={{ padding:'8px 22px', borderRadius:10, border:'none', background:'#2563EB', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
              Next 
            </button>
          ) : (
            <button onClick={handleSell} disabled={sellSaving}
              style={{ padding:'8px 22px', borderRadius:10, border:'none', background:sellSaving?'#93C5FD':'#2563EB', color:'#fff', fontWeight:700, cursor:sellSaving?'not-allowed':'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
              {sellSaving ? 'Processing' : `Sell${sellSelectedPkg ? `  Rs. ${Number(sellSelectedPkg.package_price).toLocaleString()}` : ''}`}
            </button>
          )}
        </div>
      </Modal>

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
