import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  IconEye, IconEdit, IconPlus, IconDollar, IconReceipt, IconCalendar,
  ActionBtn, StatCard, PKModal as Modal, FilterBar, SearchBar,
  DataTable,
} from '../components/ui/PageKit';
import { computePromoFromDiscount } from '../utils/promoDiscount';

const METHODS = ['Cash','Card','Online Transfer','Loyalty Points','Package'];
const METHOD_LABEL = { 'Cash':'Cash', 'Card':'Card', 'Online Transfer':'Bank Transfer', 'Loyalty Points':'Loyalty Pts', 'Package':'Package' };
const EMPTY_FORM = { branch_id:'', staff_id:'', customer_id:'', service_ids:[], total_amount:'', loyalty_discount:0, discount_id:'', splits:[{ method:'Cash', amount:'' }] };

function PrintIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
}

function printReceipt(payment) {
  const fmtDate = d => d ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
  const line = (label, value) => `<tr><td style="color:#555;padding:2px 0;font-size:12px;">${label}</td><td style="text-align:right;font-weight:600;font-size:12px;padding:2px 0;">${value||'—'}</td></tr>`;
  const dash = () => `<tr><td colspan="2"><div style="border-top:1px dashed #bbb;margin:6px 0;"></div></td></tr>`;

  const splits = (payment.splits||[]).map(sp =>
    `<tr><td style="color:#555;font-size:12px;padding:2px 0;">${METHOD_LABEL[sp.method]||sp.method}</td><td style="text-align:right;font-size:12px;font-weight:600;">Rs. ${Number(sp.amount||0).toLocaleString()}</td></tr>`
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Receipt</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; width:300px; margin:0 auto; padding:12px 10px; font-size:12px; color:#111; }
    h1 { text-align:center; font-size:16px; font-weight:900; letter-spacing:2px; margin-bottom:2px; }
    .subtitle { text-align:center; font-size:10px; color:#666; margin-bottom:10px; }
    table { width:100%; border-collapse:collapse; }
    .total-row td { font-size:14px; font-weight:900; padding-top:6px; border-top:2px solid #111; }
    .total-row td:last-child { text-align:right; }
    .footer { text-align:center; font-size:10px; color:#888; margin-top:12px; letter-spacing:1px; }
    @media print {
      @page { margin:0; size: 72mm auto; }
      body { padding:6px; }
    }
  </style></head><body>
  <h1>ZANE SALON</h1>
  <div class="subtitle">Payment Receipt</div>
  <div style="border-top:2px solid #111;border-bottom:1px dashed #bbb;padding:4px 0;margin-bottom:6px;font-size:10px;color:#555;text-align:center;">
    ${fmtDate(payment.date)} &nbsp;|&nbsp; #${payment.id||''}
  </div>
  <table>
    ${line('Customer', payment.customer?.name || payment.customer_name)}
    ${line('Staff', payment.staff?.name)}
    ${line('Branch', payment.branch?.name)}
    ${line('Service', payment.service?.name)}
    ${dash()}
    ${line('Subtotal', 'Rs. ' + Number(payment.total_amount||0).toLocaleString())}
    ${Number(payment.loyalty_discount||0) > 0 ? line('Loyalty Disc.', '- Rs. ' + Number(payment.loyalty_discount).toLocaleString()) : ''}
    ${Number(payment.promo_discount||0) > 0 ? line('Promo Disc.', '- Rs. ' + Number(payment.promo_discount).toLocaleString()) : ''}
    ${dash()}
    <tr><td colspan="2"><div style="border-top:1px dashed #bbb;margin:4px 0;"></div></td></tr>
    <tr class="total-row">
      <td>NET TOTAL</td>
      <td>Rs. ${(Number(payment.total_amount||0) - Number(payment.loyalty_discount||0) - Number(payment.promo_discount||0)).toLocaleString()}</td>
    </tr>
    ${dash()}
    ${splits}
    ${dash()}
  </table>
  <div class="footer">Thank you for visiting!<br>*** ZANE SALON ***</div>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close();},800);}<\/script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=340,height=550,scrollbars=no,toolbar=no,menubar=no');
  if (w) { w.document.write(html); w.document.close(); }
}

function InvoiceModal({ open, onClose, payment }) {
  if (!open || !payment) return null;
  const net = Number(payment.total_amount||0) - Number(payment.loyalty_discount||0) - Number(payment.promo_discount||0);
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(16,24,40,0.55)', backdropFilter:'blur(2px)' }}>
      <div style={{ background:'#fff', borderRadius:20, width:340, maxWidth:'95vw', boxShadow:'0 24px 64px rgba(16,24,40,0.25)', fontFamily:"'Courier New',monospace", overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'#101828', padding:'20px 24px 16px', textAlign:'center' }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px', color:'#fff' }}>
            <IconReceipt />
          </div>
          <div style={{ color:'#fff', fontWeight:900, fontSize:18, letterSpacing:3, fontFamily:"'Courier New',monospace" }}>ZANE SALON</div>
          <div style={{ color:'#98A2B3', fontSize:11, marginTop:2, letterSpacing:1 }}>PAYMENT RECEIPT</div>
          <div style={{ color:'#667085', fontSize:10, marginTop:6 }}>
            {payment.date ? new Date(payment.date).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}
            {payment.id ? ` · #${payment.id}` : ''}
          </div>
        </div>

        {/* Receipt Body */}
        <div style={{ padding:'16px 20px', background:'#FAFAFA', fontFamily:"'Courier New',monospace" }}>
          <div style={{ borderTop:'1px dashed #D0D5DD', marginBottom:12 }} />

          {/* Details */}
          {[
            { label:'Customer', value: payment.customer?.name || payment.customer_name },
            { label:'Staff',    value: payment.staff?.name },
            { label:'Branch',   value: payment.branch?.name },
            { label:'Service',  value: payment.service?.name },
          ].filter(r => r.value).map(({ label, value }) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12 }}>
              <span style={{ color:'#667085' }}>{label}</span>
              <span style={{ fontWeight:700, color:'#344054', maxWidth:180, textAlign:'right' }}>{value}</span>
            </div>
          ))}

          <div style={{ borderTop:'1px dashed #D0D5DD', margin:'10px 0' }} />

          {/* Amounts */}
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12 }}>
            <span style={{ color:'#667085' }}>Subtotal</span>
            <span style={{ fontWeight:600 }}>Rs. {Number(payment.total_amount||0).toLocaleString()}</span>
          </div>
          {Number(payment.loyalty_discount||0) > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12 }}>
              <span style={{ color:'#D97706' }}>Loyalty Disc.</span>
              <span style={{ fontWeight:600, color:'#D97706' }}>- Rs. {Number(payment.loyalty_discount).toLocaleString()}</span>
            </div>
          )}
          {Number(payment.promo_discount||0) > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12 }}>
              <span style={{ color:'#7C3AED' }}>Promo {payment.discount?.name ? `(${payment.discount.name})` : ''}</span>
              <span style={{ fontWeight:600, color:'#7C3AED' }}>- Rs. {Number(payment.promo_discount).toLocaleString()}</span>
            </div>
          )}

          <div style={{ borderTop:'2px solid #101828', margin:'10px 0 8px' }} />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontWeight:900, fontSize:13, letterSpacing:1 }}>NET TOTAL</span>
            <span style={{ fontWeight:900, fontSize:16, color:'#101828' }}>Rs. {net.toLocaleString()}</span>
          </div>

          {/* Payment splits */}
          {(payment.splits||[]).length > 0 && (
            <>
              <div style={{ borderTop:'1px dashed #D0D5DD', margin:'8px 0' }} />
              {(payment.splits||[]).map((sp, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12 }}>
                  <span style={{ color:'#475467' }}>{METHOD_LABEL[sp.method]||sp.method}</span>
                  <span style={{ fontWeight:600 }}>Rs. {Number(sp.amount||0).toLocaleString()}</span>
                </div>
              ))}
            </>
          )}

          <div style={{ borderTop:'1px dashed #D0D5DD', margin:'12px 0 8px' }} />
          <div style={{ textAlign:'center', fontSize:10, color:'#98A2B3', letterSpacing:1 }}>THANK YOU FOR VISITING!</div>
        </div>

        {/* Buttons */}
        <div style={{ padding:'12px 20px 16px', display:'flex', gap:8, background:'#fff', borderTop:'1px solid #F2F4F7' }}>
          <Button variant="secondary" fullWidth onClick={onClose}>Close</Button>
          <Button variant="primary" fullWidth onClick={() => printReceipt(payment)} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <PrintIcon /> Print
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ServiceMultiSelect({ services, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const selSvcs = services.filter(s => selected.includes(s.id));
  const toggle = id => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return (
    <div style={{ position:'relative' }}>
      {open && <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:99 }} />}
      <div onClick={() => setOpen(o => !o)} style={{
        minHeight:38, padding:'6px 10px', borderRadius:10, border:'1.5px solid #D0D5DD',
        background:'#fff', cursor:'pointer', display:'flex', flexWrap:'wrap', gap:5, alignItems:'center',
      }}>
        {selSvcs.length === 0
          ? <span style={{ color:'#98A2B3', fontSize:13, userSelect:'none' }}>Select services…</span>
          : selSvcs.map(s => (
            <span key={s.id} style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 8px 2px 10px', borderRadius:99, background:'#EFF6FF', color:'#2563EB', fontSize:12, fontWeight:600 }}>
              {s.name}
              <span onMouseDown={e => { e.stopPropagation(); toggle(s.id); }} style={{ cursor:'pointer', color:'#93C5FD', fontWeight:700, fontSize:14, lineHeight:1, marginLeft:3 }}>×</span>
            </span>
          ))}
        <span style={{ marginLeft:'auto', fontSize:11, color:'#98A2B3', userSelect:'none', paddingLeft:4 }}>▾</span>
      </div>
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:100,
          background:'#fff', border:'1.5px solid #E4E7EC', borderRadius:10,
          boxShadow:'0 8px 24px rgba(16,24,40,0.12)', maxHeight:230, overflowY:'auto',
        }}>
          {services.length === 0 && <div style={{ padding:'12px 14px', fontSize:13, color:'#98A2B3' }}>No services found</div>}
          {services.map(s => (
            <label key={s.id} style={{
              display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer',
              background: selected.includes(s.id) ? '#F0F9FF' : 'transparent',
              borderBottom:'1px solid #F8FAFC',
            }}>
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
                style={{ accentColor:'#2563EB', width:15, height:15, flexShrink:0, cursor:'pointer' }} />
              <span style={{ flex:1, fontSize:13, color:'#344054', fontWeight: selected.includes(s.id) ? 600 : 400 }}>{s.name}</span>
              <span style={{ fontSize:12, color:'#059669', fontWeight:700, fontFamily:"'Outfit',sans-serif" }}>Rs. {Number(s.price||0).toLocaleString()}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit  = ['superadmin','admin','manager','staff'].includes(user?.role);
  const isAdmin  = ['superadmin','admin'].includes(user?.role);
  const hasFixedBranch = !!user?.branchId;
  const today = new Date().toISOString().slice(0,10);
  const curMonth = today.slice(0,7);
  const [payments, setPayments]   = useState([]);
  const [summary, setSummary]     = useState(null);
  const [branches, setBranches]   = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [services, setServices]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterBranch, setFilterBranch] = useState(hasFixedBranch ? user.branchId : '');
  const [filterMonth, setFilterMonth]   = useState(curMonth);
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceItem, setInvoiceItem] = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formErr, setFormErr]     = useState('');
  const [custPackages, setCustPackages] = useState([]);
  const [loadingPkgs, setLoadingPkgs]   = useState(false);
  const [discounts, setDiscounts]       = useState([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [discountsLoadError, setDiscountsLoadError] = useState(false);

  // Load reference data once on mount (independent of payment filters)
  useEffect(() => {
    Promise.allSettled([
      api.get('/branches',  { params:{ limit:100 } }),
      api.get('/customers', { params:{ limit:500 } }),
      api.get('/staff',     { params:{ limit:200 } }),
      api.get('/services',  { params:{ limit:200 } }),
    ]).then(([brR, cuR, stR, svR]) => {
      if (brR.status === 'fulfilled') setBranches(Array.isArray(brR.value.data) ? brR.value.data : (brR.value.data?.data ?? []));
      if (cuR.status === 'fulfilled') setCustomers(Array.isArray(cuR.value.data) ? cuR.value.data : (cuR.value.data?.data ?? []));
      if (stR.status === 'fulfilled') setStaffList(Array.isArray(stR.value.data) ? stR.value.data : (stR.value.data?.data ?? []));
      if (svR.status === 'fulfilled') setServices(Array.isArray(svR.value.data) ? svR.value.data : (svR.value.data?.data ?? []));
    });
  }, []);

  // Branch for promo list: form row, logged-in user's branch, or Payments page filter
  const effectiveBranchForDiscounts = useMemo(
    () => String(form.branch_id || user?.branchId || filterBranch || '').trim(),
    [form.branch_id, user?.branchId, filterBranch],
  );
  useEffect(() => {
    if (!effectiveBranchForDiscounts || !showForm) return;
    let cancelled = false;
    setDiscountsLoading(true);
    setDiscountsLoadError(false);
    api.get('/discounts/payment', { params: { branchId: effectiveBranchForDiscounts } })
      .then((r) => {
        if (!cancelled) setDiscounts(Array.isArray(r.data?.data) ? r.data.data : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setDiscounts([]);
          setDiscountsLoadError(true);
          const msg = e.response?.data?.message || 'Could not load promos';
          toast(msg, 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setDiscountsLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveBranchForDiscounts, showForm]);

  // Load payments + summary whenever filters change
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit: 500,
        ...(filterBranch ? { branchId: filterBranch } : {}),
        ...(filterMonth  ? { month:    filterMonth  } : {}),
      };
      const [pmR, sumR] = await Promise.allSettled([
        api.get('/payments', { params }),
        api.get('/payments/summary', { params }),
      ]);
      if (pmR.status === 'fulfilled')
        setPayments(Array.isArray(pmR.value.data) ? pmR.value.data : (pmR.value.data?.data ?? []));
      // summary endpoint returns an array grouped by branch — aggregate it
      if (sumR.status === 'fulfilled') {
        const sumArr = Array.isArray(sumR.value.data) ? sumR.value.data : [];
        setSummary(sumArr.reduce((acc, b) => ({
          revenue:    acc.revenue    + Number(b.revenue    || 0),
          commission: acc.commission + Number(b.commission || 0),
          count:      acc.count      + Number(b.count      || 0),
        }), { revenue: 0, commission: 0, count: 0 }));
      }
    } catch { }
    setLoading(false);
  }, [filterBranch, filterMonth]);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, branch_id: user?.branchId || filterBranch || '' });
    setFormErr('');
    setCustPackages([]);
    setShowForm(true);
  };

  const openEdit = async (row) => {
    setFormErr('');
    try {
      const { data: p } = await api.get(`/payments/${row.id}`);
      const sid = p.service_id ?? p.service?.id;
      const serviceIds = sid ? [Number(sid)] : [];
      setForm({
        branch_id: String(p.branch_id || ''),
        staff_id: String(p.staff_id || ''),
        customer_id: String(p.customer_id || ''),
        service_ids: serviceIds.filter((x) => Number.isFinite(x) && x > 0),
        total_amount: p.total_amount != null ? String(p.total_amount) : '',
        loyalty_discount: Number(p.loyalty_discount || 0),
        discount_id: p.discount_id ? String(p.discount_id) : '',
        splits: (p.splits || []).map((sp) => ({
          method: sp.method,
          amount: sp.amount != null ? String(Number(sp.amount)) : '',
          customer_package_id: sp.customer_package_id,
        })),
      });
      setCustPackages([]);
      if (p.customer_id) {
        setLoadingPkgs(true);
        api.get(`/packages/customer/${p.customer_id}/active`)
          .then((r) => { setCustPackages(Array.isArray(r.data) ? r.data : []); })
          .catch(() => {})
          .finally(() => setLoadingPkgs(false));
      }
      setEditId(row.id);
      setShowForm(true);
    } catch (e) {
      toast(e.response?.data?.message || 'Could not load payment', 'error');
    }
  };
  const setSplit = (idx, field, val) => {
    setForm(f => {
      const s = [...f.splits];
      s[idx] = { ...s[idx], [field]: val };
      // Clear customer_package_id when method changes away from Package
      if (field === 'method' && val !== 'Package') delete s[idx].customer_package_id;
      return { ...f, splits: s };
    });
  };
  const addSplit    = () => setForm(f => ({ ...f, splits: [...f.splits, { method:'Cash', amount:'' }] }));
  const removeSplit = idx => setForm(f => ({ ...f, splits: f.splits.filter((_,i) => i!==idx) }));

  const handleSave = async () => {
    if (!String(form.customer_id || '').trim()) return setFormErr('Select a customer before recording payment.');
    if (!String(form.staff_id || '').trim()) return setFormErr('Select staff before recording payment.');
    if (!form.total_amount || !form.service_ids.length) return setFormErr('Total amount and at least one service are required');
    const subtotal = Number(form.total_amount);
    const loyalty = Number(form.loyalty_discount || 0);
    const selDisc = form.discount_id ? discounts.find(d => String(d.id) === String(form.discount_id)) : null;
    const promo = selDisc ? computePromoFromDiscount(selDisc, subtotal) : 0;
    const net = subtotal - loyalty - promo;
    const splitTotal = form.splits.reduce((s, sp) => s + Number(sp.amount||0), 0);
    if (Math.abs(splitTotal - net) > 0.02)
      return setFormErr(`Split total (Rs. ${splitTotal.toLocaleString()}) must equal net after discounts (Rs. ${net.toLocaleString()})`);
    setSaving(true);
    try {
      const { service_ids, ...rest } = form;
      const payload = {
        ...rest,
        service_id: service_ids[0] || null,
        service_ids,
        subtotal,
        discount_id: form.discount_id || null,
      };
      if (editId) {
        await api.put(`/payments/${editId}`, payload);
        toast('Payment updated successfully!', 'success');
      } else {
        await api.post('/payments', payload);
        toast('Payment recorded successfully!', 'success');
      }
      setShowForm(false);
      setEditId(null);
      load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };

  const promoPreview = useMemo(() => {
    const sub = Number(form.total_amount || 0);
    const d = form.discount_id ? discounts.find(x => String(x.id) === String(form.discount_id)) : null;
    return d ? computePromoFromDiscount(d, sub) : 0;
  }, [form.total_amount, form.discount_id, discounts]);

  useEffect(() => {
    if (!showForm || form.splits.length !== 1) return;
    const sub = Number(form.total_amount || 0);
    if (!sub) return;
    const loyalty = Number(form.loyalty_discount || 0);
    const d = form.discount_id ? discounts.find(x => String(x.id) === String(form.discount_id)) : null;
    const promo = d ? computePromoFromDiscount(d, sub) : 0;
    const net = Math.max(0, sub - loyalty - promo);
    const cur = Number(form.splits[0].amount || 0);
    if (Math.abs(cur - net) < 0.02) return;
    setForm(f => {
      if (f.splits.length !== 1) return f;
      return { ...f, splits: [{ ...f.splits[0], amount: String(net) }] };
    });
  }, [showForm, form.total_amount, form.loyalty_discount, form.discount_id, discounts, form.splits.length]);

  const displayed = payments.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.customer_name?.toLowerCase().includes(q) || p.service?.name?.toLowerCase().includes(q) || p.staff?.name?.toLowerCase().includes(q);
  });

  return (
    <PageWrapper title="Payments" subtitle="Revenue tracking and payment recording"
      actions={canEdit && <Button variant="primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}><IconPlus /> Record Payment</Button>}>

      {/* Stat Cards */}
      {summary && (
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <StatCard label="Revenue"      value={`Rs. ${Number(summary.revenue||0).toLocaleString()}`}                          color="#059669" icon={<IconDollar />} />
          <StatCard label="Commission"   value={`Rs. ${Number(summary.commission||0).toLocaleString()}`}                       color="#D97706" icon={<IconReceipt />} />
          <StatCard label="Transactions" value={summary.count||0}                                                               color="#2563EB" icon={<IconCalendar />} />
          <StatCard label="Avg Ticket"   value={`Rs. ${summary.count ? Math.round((summary.revenue||0)/(summary.count||1)).toLocaleString() : 0}`} color="#7C3AED" icon={<IconReceipt />} />
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search payments" />
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054' }} />
        {isAdmin && !hasFixedBranch && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={[
          { id:'date', header:'Date', meta:{ width:'12%' },
            accessorFn: r => r.date || '',
            cell: ({ row }) => {
              const d = row.original.date;
              return (
                <>
                  <div style={{ fontSize:13, fontWeight:600, color:'#344054' }}>{d ? new Date(d).toLocaleDateString('en-US',{day:'numeric',month:'short'}) : ''}</div>
                  <div style={{ fontSize:11, color:'#98A2B3' }}>{d ? new Date(d).getFullYear() : ''}</div>
                </>
              );
            }
          },
          { accessorKey:'customer_name', header:'Customer', meta:{ width:'18%' },
            cell: ({ row }) => (
              <>
                <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>{row.original.customer_name || 'Walk-in'}</div>
                <div style={{ fontSize:12, color:'#98A2B3' }}>{row.original.staff?.name || ''}</div>
              </>
            )
          },
          { id:'service', header:'Service', meta:{ width:'16%' },
            accessorFn: r => r.service?.name || '',
            cell: ({ getValue }) => <span style={{ fontSize:13, color:'#475467' }}>{getValue()}</span>
          },
          { id:'payment', header:'Payment', meta:{ width:'20%' },
            cell: ({ row }) => (
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {(row.original.splits||[]).map((sp, i) => (
                  <span key={i} style={{ padding:'2px 7px', borderRadius:5, background:'#F9FAFB', border:'1px solid #E4E7EC', fontSize:11, color:'#475467' }}>
                    {METHOD_LABEL[sp.method]||sp.method} Rs.{Number(sp.amount||0).toLocaleString()}
                  </span>
                ))}
              </div>
            )
          },
          { accessorKey:'total_amount', header:'Total', meta:{ width:'12%', align:'right' },
            cell: ({ getValue }) => <span style={{ fontWeight:800, color:'#059669', fontFamily:"'Outfit',sans-serif", fontSize:15 }}>Rs. {Number(getValue()||0).toLocaleString()}</span>
          },
          { accessorKey:'commission_amount', header:'Commission', meta:{ width:'12%', align:'right' },
            cell: ({ getValue }) => <span style={{ fontWeight:800, color:'#D97706', fontFamily:"'Outfit',sans-serif", fontSize:15 }}>Rs. {Number(getValue()||0).toLocaleString()}</span>
          },
          { id:'invoice', header:'Actions', meta:{ width:'14%', align:'center' },
            cell: ({ row }) => (
              <div style={{ display:'flex', gap:4, justifyContent:'center', flexWrap:'wrap' }}>
                {canEdit && (
                  <ActionBtn onClick={() => openEdit(row.original)} title="Edit payment" color="#D97706"><IconEdit /></ActionBtn>
                )}
                <ActionBtn onClick={() => { setInvoiceItem(row.original); setShowInvoice(true); }} title="View Receipt" color="#2563EB"><IconEye /></ActionBtn>
                <ActionBtn onClick={() => printReceipt(row.original)} title="Print Receipt" color="#059669"><PrintIcon /></ActionBtn>
              </div>
            )
          },
        ]}
        data={displayed}
        loading={loading}
        emptyMessage="No payments recorded"
        emptySub="Use the Record Payment button to add transactions"
      />

      {/* Record Payment Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditId(null); }} title={editId ? 'Edit Payment' : 'Record Payment'} size="lg"
        footer={
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', width:'100%' }}>
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={saving || !String(form.customer_id || '').trim() || !String(form.staff_id || '').trim()}
              onClick={handleSave}
            >
              <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                <IconDollar />{editId ? 'Save changes' : 'Record Payment'}
              </span>
            </Button>
          </div>
        }>
        {formErr && (
          <div style={{ background:'#FEF2F2', color:'#B91C1C', padding:'10px 14px', borderRadius:10, marginBottom:16, fontSize:13, border:'1px solid #FECACA', display:'flex', alignItems:'center', gap:8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {formErr}
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

          {/* ── Section: Who ── */}
          <div style={{ background:'#F8FAFC', borderRadius:12, border:'1px solid #EAECF0', padding:'14px 16px', marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#667085', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Customer & Staff
            </div>
            {(isAdmin && !hasFixedBranch) && (
              <FormGroup label="Branch" style={{ marginBottom:10 }}>
                <Select value={form.branch_id||''} disabled={!!editId} onChange={e => setForm(f=>({...f, branch_id:e.target.value, staff_id:''}))}>
                  <option value="">Select branch</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </FormGroup>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <FormGroup label="Customer *">
                <Select value={form.customer_id||''} onChange={e => {
                  const cid = e.target.value;
                  setForm(f=>({...f, customer_id:cid}));
                  setCustPackages([]);
                  if (cid) {
                    setLoadingPkgs(true);
                    api.get(`/packages/customer/${cid}/active`).then(r => {
                      setCustPackages(Array.isArray(r.data) ? r.data : []);
                    }).catch(() => {}).finally(() => setLoadingPkgs(false));
                  }
                }}>
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Staff *">
                <Select value={form.staff_id||''} onChange={e => setForm(f=>({...f, staff_id:e.target.value}))}>
                  <option value="">Select staff</option>
                  {(form.branch_id ? staffList.filter(s => s.branch_id == form.branch_id) : staffList).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </FormGroup>
            </div>
          </div>

          {/* ── Section: Services ── */}
          <div style={{ background:'#F8FAFC', borderRadius:12, border:'1px solid #EAECF0', padding:'14px 16px', marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#667085', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              Services <span style={{ color:'#EF4444', marginLeft:2 }}>*</span>
            </div>
            <ServiceMultiSelect
              services={services.filter(s => s.is_active !== false)}
              selected={form.service_ids}
              onChange={ids => {
                const svcs = services.filter(s => ids.includes(s.id));
                const total = svcs.reduce((sum, s) => sum + Number(s.price || 0), 0);
                setForm(f => ({
                  ...f,
                  service_ids: ids,
                  total_amount: total > 0 ? String(total) : '',
                  splits: total > 0 && f.splits.length === 1
                    ? [{ ...f.splits[0], amount: String(total) }]
                    : f.splits,
                }));
              }}
            />
            {form.service_ids.length > 0 && (
              <div style={{ marginTop:10, display:'flex', gap:6, flexWrap:'wrap' }}>
                {services.filter(s => form.service_ids.includes(s.id)).map(s => (
                  <span key={s.id} style={{ fontSize:11, color:'#344054', background:'#fff', border:'1px solid #D0D5DD', padding:'3px 10px', borderRadius:20, fontWeight:500 }}>
                    {s.name} <span style={{ color:'#667085' }}>Rs. {Number(s.price||0).toLocaleString()}</span>
                  </span>
                ))}
                {form.service_ids.length > 1 && (
                  <span style={{ fontSize:11, fontWeight:700, color:'#065F46', background:'#ECFDF5', border:'1px solid #6EE7B7', padding:'3px 10px', borderRadius:20 }}>
                    Total: Rs. {services.filter(s => form.service_ids.includes(s.id)).reduce((sum, s) => sum + Number(s.price||0), 0).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Section: Amount ── */}
          <div style={{ background:'#F8FAFC', borderRadius:12, border:'1px solid #EAECF0', padding:'14px 16px', marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#667085', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Amount
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <FormGroup label="Total Amount (Rs.)" required>
                <Input type="number" value={form.total_amount||''} onChange={e => setForm(f=>({...f, total_amount:e.target.value}))} />
              </FormGroup>
              <FormGroup label="Loyalty Discount (Rs.)">
                <Input type="number" value={form.loyalty_discount||0} onChange={e => setForm(f=>({...f, loyalty_discount:Number(e.target.value)}))} />
              </FormGroup>
            </div>
            <FormGroup label="Promo discount" style={{ marginTop:10 }}>
              <Select value={form.discount_id||''} onChange={e => setForm(f=>({...f, discount_id:e.target.value}))}>
                <option value="">None</option>
                {discounts.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.discount_type === 'fixed' ? `Rs.${d.value}` : `${d.value}%`})</option>
                ))}
              </Select>
              {discountsLoading && (
                <div style={{ fontSize:12, color:'#64748B', marginTop:6 }}>Loading promos…</div>
              )}
              {!discountsLoading && showForm && !effectiveBranchForDiscounts && (
                <div style={{ fontSize:12, color:'#B45309', marginTop:6 }}>
                  Select branch (above) or pick a branch in the Payments filter on this page, then reopen Record Payment — promos load per branch.
                </div>
              )}
              {!discountsLoading && !discountsLoadError && effectiveBranchForDiscounts && discounts.length === 0 && (
                <div style={{ fontSize:12, color:'#64748B', marginTop:6 }}>
                  No active promos for this branch. Add them under <strong>Discounts</strong> (dates, active, min bill).
                </div>
              )}
            </FormGroup>
            {form.total_amount && (
              <div style={{ marginTop:12, background: 'linear-gradient(135deg,#EFF6FF 0%,#F0FDF4 100%)', borderRadius:10, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid #BFDBFE' }}>
                <div style={{ fontSize:12, color:'#3B82F6' }}>
                  Rs. {Number(form.total_amount||0).toLocaleString()}
                  {Number(form.loyalty_discount||0) > 0 && <span style={{ color:'#EF4444', marginLeft:6 }}>− Rs. {Number(form.loyalty_discount).toLocaleString()}</span>}
                  {promoPreview > 0 && <span style={{ color:'#7C3AED', marginLeft:6 }}>− Rs. {promoPreview.toLocaleString()} promo</span>}
                </div>
                <div style={{ fontSize:14, fontWeight:800, color:'#1D4ED8', fontFamily:"'Outfit',sans-serif" }}>
                  Net: Rs. {(Number(form.total_amount||0) - Number(form.loyalty_discount||0) - promoPreview).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* ── Section: Payment Splits ── */}
          <div style={{ background:'#F8FAFC', borderRadius:12, border:'1px solid #EAECF0', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#667085', textTransform:'uppercase', letterSpacing:'0.06em', display:'flex', alignItems:'center', gap:6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                Payment Method
              </div>
              <button onClick={addSplit} style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', color:'#1D4ED8', borderRadius:8, padding:'4px 12px', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:16, lineHeight:1 }}>+</span> Add Split
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {form.splits.map((sp, i) => (
                <div key={i} style={{ background:'#fff', borderRadius:10, border:'1px solid #E4E7EC', padding:'10px 12px' }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <Select value={sp.method} onChange={e => setSplit(i,'method',e.target.value)} style={{ flex:'0 0 148px' }}>
                      {METHODS.map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                    </Select>
                    <Input type="number" value={sp.amount} placeholder="Amount (Rs.)" onChange={e => setSplit(i,'amount',e.target.value)} style={{ flex:1 }} />
                    {form.splits.length > 1 && (
                      <button onClick={() => removeSplit(i)} style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:7, cursor:'pointer', color:'#DC2626', fontSize:15, width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
                    )}
                  </div>
                  {sp.method === 'Package' && (
                    <div style={{ marginTop:8 }}>
                      {!form.customer_id ? (
                        <div style={{ fontSize:12, color:'#92400E', background:'#FFFBEB', padding:'7px 10px', borderRadius:8, border:'1px solid #FDE68A', display:'flex', alignItems:'center', gap:6 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          Select a customer first to use package payment
                        </div>
                      ) : loadingPkgs ? (
                        <div style={{ fontSize:12, color:'#98A2B3', padding:'4px 0' }}>Loading packages...</div>
                      ) : custPackages.length === 0 ? (
                        <div style={{ fontSize:12, color:'#92400E', background:'#FFFBEB', padding:'7px 10px', borderRadius:8, border:'1px solid #FDE68A' }}>No active packages for this customer</div>
                      ) : (
                        <Select value={sp.customer_package_id||''} onChange={e => setSplit(i,'customer_package_id',e.target.value)} style={{ fontSize:12 }}>
                          <option value="">Select package…</option>
                          {custPackages.map(cp => (
                            <option key={cp.id} value={cp.id}>
                              {cp.package?.name || 'Package'} — {cp.sessions_remaining || (cp.sessions_total - cp.sessions_used)} sessions left (expires {new Date(cp.expiry_date).toLocaleDateString()})
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {form.splits.length > 0 && form.total_amount && (() => {
              const splitTotal = form.splits.reduce((s,sp)=>s+Number(sp.amount||0),0);
              const net = Number(form.total_amount||0) - Number(form.loyalty_discount||0) - promoPreview;
              const diff = net - splitTotal;
              const ok = Math.abs(diff) < 0.01;
              return (
                <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center', background: ok ? '#F0FDF4' : '#FFFBEB', border:`1px solid ${ok ? '#BBF7D0' : '#FDE68A'}`, borderRadius:8, padding:'7px 12px', fontSize:12 }}>
                  <span style={{ color: ok ? '#166534' : '#92400E', fontWeight:600 }}>
                    {ok ? '✓ Splits match net amount' : `Remaining: Rs. ${Math.abs(diff).toLocaleString()}`}
                  </span>
                  <span style={{ color:'#667085' }}>
                    Rs. {splitTotal.toLocaleString()} / Rs. {net.toLocaleString()}
                  </span>
                </div>
              );
            })()}
          </div>

        </div>
      </Modal>

      <InvoiceModal open={showInvoice} onClose={() => setShowInvoice(false)} payment={invoiceItem} />
    </PageWrapper>
  );
}
