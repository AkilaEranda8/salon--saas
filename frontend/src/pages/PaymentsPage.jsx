import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  IconEye, IconEdit, IconPlus, IconDollar, IconReceipt, IconCalendar,
  IconClose, ActionBtn, StatCard, FilterBar,
  DataTable,
} from '../components/ui/PageKit';
import { computePromoFromDiscount } from '../utils/promoDiscount';
import {
  resolvePackageServiceIds,
  packageCoversAllServices,
  fetchCustomerPackagesForPayment,
  packageCanRedeemNow,
  formatCustomerPackageOptionLabel,
  calcServiceListTotal,
  getPackageBundlePrice,
  formatPackageAppliedMessage,
  formatPackageBillAmount,
} from '../utils/packageHelpers';
import { useFeatureGate } from '../hooks/useFeatureGate';
import RecurringDateCalendar, { defaultRecurringNextDate } from '../components/ui/RecurringDateCalendar';
import RecurringTemplateCheckboxes from '../components/ui/RecurringTemplateCheckboxes';
import PaymentHelperStaffFields, { helpersPayload } from '../components/payments/PaymentHelperStaffFields';
import { pinWalkInFirst } from '../utils/walkInCustomer';
import { fetchAllServices } from '../utils/fetchAllServices';

const METHODS = ['Cash','Card','Online Transfer','Loyalty Points','Package','LankaQR'];
const METHOD_LABEL = { 'Cash':'Cash', 'Card':'Card', 'Online Transfer':'Bank Transfer', 'Loyalty Points':'Loyalty Pts', 'Package':'Package', 'LankaQR':'LankaQR' };
const EMPTY_FORM = {
  branch_id:'', staff_id:'', customer_id:'', service_ids:[], total_amount:'', loyalty_discount:0, discount_id:'',
  splits:[{ method:'Cash', amount:'' }],
  is_recurring: true,
  recurring_next_date: '',
  appointment_time: '08:00',
  recurring_message_template_ids: [],
};

// ── HelaPay QR Modal ─────────────────────────────────────────────────────────
function HelaPayQRModal({ amount, reference, onClose, onSuccess }) {
  const [qrData,      setQrData]      = useState(null);
  const [qrReference, setQrReference] = useState(null);
  const [status,      setStatus]      = useState('generating'); // generating | waiting | success | failed | error
  const [errMsg,      setErrMsg]      = useState('');
  const pollRef = useRef(null);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const startPolling = (ref, qrRef) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.post('/helapay/status', { reference: ref, qr_reference: qrRef });
        const ps = res.data?.sale?.payment_status;
        if (ps === 2)  { stopPoll(); setStatus('success'); setTimeout(onSuccess, 1500); }
        else if (ps === -1) { stopPoll(); setStatus('failed'); }
      } catch { }
    }, 3000);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await api.post('/helapay/qr', { reference: String(reference), amount: Number(amount) });
        setQrData(res.data.qr_data);
        setQrReference(res.data.qr_reference);
        setStatus('waiting');
        startPolling(res.data.reference, res.data.qr_reference);
      } catch (e) {
        setErrMsg(e.response?.data?.message || 'QR generation failed. Check HelaPay settings.');
        setStatus('error');
      }
    })();
    return stopPoll;
  }, []);

  const qrUrl = qrData
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&ecc=M&data=${encodeURIComponent(qrData)}`
    : null;

  const STATUS_UI = {
    generating: { icon: '⏳', color: '#2563EB', label: 'Generating QR…' },
    waiting:    { icon: '📱', color: '#D97706', label: 'Waiting for payment…' },
    success:    { icon: '✅', color: '#059669', label: 'Payment Received!' },
    failed:     { icon: '❌', color: '#DC2626', label: 'Payment Failed' },
    error:      { icon: '⚠️', color: '#DC2626', label: 'Error' },
  };
  const ui = STATUS_UI[status] || STATUS_UI.waiting;

  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}>
      <div style={{ background:'#fff', borderRadius:24, width:360, maxWidth:'95vw', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#1e3a5f,#0f2340)', padding:'20px 24px 16px', textAlign:'center' }}>
          <div style={{ color:'#fff', fontWeight:800, fontSize:17, letterSpacing:1 }}>LankaQR Payment</div>
          <div style={{ color:'#93C5FD', fontSize:13, marginTop:4 }}>Rs. {Number(amount||0).toLocaleString()}</div>
        </div>

        {/* Body */}
        <div style={{ padding:'24px 24px 20px', textAlign:'center' }}>
          {/* Status badge */}
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background: ui.color+'15', border:`1px solid ${ui.color}40`, borderRadius:99, padding:'6px 16px', marginBottom:20, fontSize:13, fontWeight:700, color: ui.color }}>
            <span>{ui.icon}</span> {ui.label}
            {status === 'waiting' && (
              <span style={{ display:'inline-block', width:14, height:14, border:`2px solid ${ui.color}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', marginLeft:4 }} />
            )}
          </div>

          {/* QR image */}
          {qrUrl && status !== 'success' && status !== 'failed' && (
            <div style={{ display:'inline-block', padding:12, background:'#fff', border:'1.5px solid #E4E7EC', borderRadius:16, boxShadow:'0 4px 16px rgba(0,0,0,0.08)', marginBottom:16 }}>
              <img src={qrUrl} alt="LankaQR" width={220} height={220} style={{ display:'block', borderRadius:8 }} />
            </div>
          )}

          {status === 'success' && (
            <div style={{ width:80, height:80, borderRadius:'50%', background:'#ECFDF5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
          )}

          {status === 'failed' && (
            <div style={{ width:80, height:80, borderRadius:'50%', background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
          )}

          {status === 'error' && (
            <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'12px 14px', fontSize:13, color:'#B91C1C', marginBottom:16 }}>{errMsg}</div>
          )}

          {status === 'waiting' && (
            <div style={{ fontSize:12, color:'#667085', marginTop:-8, marginBottom:4 }}>Ask the customer to scan with any LankaQR-supported app</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 24px 20px', display:'flex', gap:10, justifyContent:'center', borderTop:'1px solid #F2F4F7' }}>
          {(status === 'failed' || status === 'error') && (
            <button onClick={onClose} style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'#EF4444', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer' }}>Close</button>
          )}
          {status === 'waiting' && (
            <button onClick={() => { stopPoll(); onClose(); }} style={{ padding:'10px 24px', borderRadius:10, border:'1px solid #E5E7EB', background:'#fff', color:'#374151', fontWeight:600, fontSize:14, cursor:'pointer' }}>Cancel</button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body
  );
}

function CustomerTypeahead({ customers, value, onSelect, onNew, branchId }) {
  const [query,  setQuery]  = useState('');
  const [open,   setOpen]   = useState(false);
  const [phone,  setPhone]  = useState('');
  const [name,   setName]   = useState('');
  const [adding, setAdding] = useState(false);
  const [remote, setRemote] = useState([]);
  const [searching, setSearching] = useState(false);
  const ref = useRef(null);
  const searchTimer = useRef(null);

  const isPhone  = /^[\d+\-\s()]{3,}$/.test(query.trim());
  const selected = customers.find(c => String(c.id) === String(value))
    || remote.find(c => String(c.id) === String(value));

  // Merge local + API search results (API finds customers beyond the cached limit / other edge cases)
  const pool = useMemo(() => {
    const map = new Map();
    for (const c of [...customers, ...remote]) {
      if (c?.id != null) map.set(String(c.id), c);
    }
    return [...map.values()];
  }, [customers, remote]);

  const filtered = query.length > 0
    ? pool.filter(c =>
        c.name?.toLowerCase().includes(query.toLowerCase()) ||
        c.phone?.toLowerCase().includes(query.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 12)
    : pinWalkInFirst(pool).slice(0, 12);
  const hasExact = isPhone
    ? pool.some(c => c.phone === query.trim())
    : pool.some(c => c.name?.toLowerCase() === query.trim().toLowerCase());
  const showNew  = query.trim().length >= 2 && !hasExact && !searching;

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setRemote([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/customers', {
          params: {
            search: q,
            limit: 40,
            ...(branchId ? { branchId } : {}),
          },
        });
        const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        setRemote(rows);
      } catch {
        setRemote([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, branchId]);

  const pick  = c  => { onSelect(c.id, c); setQuery(''); setPhone(''); setName(''); setOpen(false); };
  const clear = e  => { e.stopPropagation(); onSelect(''); setQuery(''); setPhone(''); setName(''); setOpen(false); };

  const addNew = async () => {
    const custName  = isPhone ? name.trim()  : query.trim();
    const custPhone = isPhone ? query.trim() : phone.trim() || null;
    if (!custName) return;
    setAdding(true);
    try {
      const res = await api.post('/customers', {
        name: custName,
        phone: custPhone,
        ...(branchId ? { branch_id: branchId } : {}),
      });
      onNew(res.data);
      onSelect(res.data.id, res.data);
      setQuery(''); setPhone(''); setName(''); setOpen(false);
    } catch { }
    setAdding(false);
  };

  const INP = { width:'100%', boxSizing:'border-box' };
  return (
    <div ref={ref} style={{ position:'relative' }}>
      {selected && !query ? (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:9, border:'1.5px solid #2563EB', background:'#EFF6FF', cursor:'pointer' }}
             onClick={() => { setQuery(selected.name); setOpen(true); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span style={{ flex:1, fontSize:13, fontWeight:600, color:'#1D4ED8' }}>{selected.name}</span>
          <span style={{ fontSize:11, color:'#93C5FD' }}>{selected.phone}</span>
          <button onClick={clear} style={{ background:'none', border:'none', cursor:'pointer', color:'#60A5FA', fontSize:18, lineHeight:1, padding:0 }}>×</button>
        </div>
      ) : (
        <input className="pk-filter-control" style={INP} placeholder="Search name or phone…" value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} />
      )}
      {open && (filtered.length > 0 || showNew || searching) && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:999, background:'#fff', border:'1.5px solid #E4E7EC', borderRadius:9, boxShadow:'0 4px 16px rgba(0,0,0,0.10)', marginTop:2, maxHeight:220, overflowY:'auto' }}>
          {searching && filtered.length === 0 && (
            <div style={{ padding:'10px 12px', fontSize:12, color:'#94A3B8' }}>Searching…</div>
          )}
          {filtered.map(c => (
            <div key={c.id} onClick={() => pick(c)}
              style={{ padding:'8px 12px', cursor:'pointer', fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}
              onMouseEnter={e => e.currentTarget.style.background='#F1F5F9'}
              onMouseLeave={e => e.currentTarget.style.background=''}>
              <span style={{ fontWeight:600, color:'#344054' }}>{c.name}</span>
              <span style={{ fontSize:11, color:'#94A3B8' }}>{c.phone}</span>
            </div>
          ))}
          {showNew && (
            <div style={{ borderTop:'1px solid #F1F5F9', padding:'10px 12px' }}>
              <div style={{ fontSize:11, color:'#667085', marginBottom:6 }}>
                {isPhone ? 'New customer with this phone:' : 'Register new customer:'}
              </div>
              {isPhone ? (
                <input style={{ ...INP, marginBottom:6 }} placeholder="Full name *" value={name} onChange={e => setName(e.target.value)} />
              ) : (
                <input style={{ ...INP, marginBottom:6 }} placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} />
              )}
              <button onClick={addNew} disabled={adding || (isPhone && !name.trim())}
                style={{ width:'100%', padding:'7px 0', borderRadius:8, border:'none', background:'#2563EB', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity:(adding||(isPhone&&!name.trim()))?0.6:1 }}>
                {adding ? 'Saving…' : `Add "${isPhone ? name||'?' : query}"`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PrintIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
}

function printReceipt(payment) {
  // Escape any stored value (customer/staff/branch/service names) before it is
  // written into the receipt HTML, so a malicious name can't inject script (XSS).
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const fmtDate = d => d ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
  const line = (label, value) => `<tr><td style="color:#555;padding:2px 0;font-size:12px;">${esc(label)}</td><td style="text-align:right;font-weight:600;font-size:12px;padding:2px 0;">${value ? esc(value) : '—'}</td></tr>`;
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
  <h1>HEXAONE</h1>
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
    ${line('Bill', 'Rs. ' + (Number(payment.total_amount||0)+Number(payment.loyalty_discount||0)+Number(payment.promo_discount||0)).toLocaleString())}
    ${Number(payment.loyalty_discount||0) > 0 ? line('Loyalty Disc.', '- Rs. ' + Number(payment.loyalty_discount).toLocaleString()) : ''}
    ${Number(payment.promo_discount||0) > 0 ? line('Promo Disc.', '- Rs. ' + Number(payment.promo_discount).toLocaleString()) : ''}
    ${dash()}
    <tr><td colspan="2"><div style="border-top:1px dashed #bbb;margin:4px 0;"></div></td></tr>
    <tr class="total-row">
      <td>NET TOTAL</td>
      <td>Rs. ${Number(payment.total_amount||0).toLocaleString()}</td>
    </tr>
    ${dash()}
    ${splits}
    ${dash()}
  </table>
  <div class="footer">Thank you for visiting!<br>*** HEXAONE ***</div>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close();},800);}<\/script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=340,height=550,scrollbars=no,toolbar=no,menubar=no');
  if (w) { w.document.write(html); w.document.close(); }
}

function InvoiceModal({ open, onClose, payment }) {
  if (!open || !payment) return null;
  const totalDisc = Number(payment.loyalty_discount||0) + Number(payment.promo_discount||0);
  const net = Number(payment.total_amount||0);
  const grossBill = net + totalDisc;
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(16,24,40,0.55)', backdropFilter:'blur(2px)' }}>
      <div style={{ background:'#fff', borderRadius:20, width:340, maxWidth:'95vw', boxShadow:'0 24px 64px rgba(16,24,40,0.25)', fontFamily:"'Courier New',monospace", overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'#101828', padding:'20px 24px 16px', textAlign:'center' }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px', color:'#fff' }}>
            <IconReceipt />
          </div>
          <div style={{ color:'#fff', fontWeight:900, fontSize:18, letterSpacing:3, fontFamily:"'Courier New',monospace" }}>HEXAONE</div>
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
            <span style={{ color:'#667085' }}>Bill</span>
            <span style={{ fontWeight:600 }}>Rs. {grossBill.toLocaleString()}</span>
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

function PaySection({ title, desc, children, dark = false }) {
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

function PayModal({ open, onClose, title, subtitle, children, footer, size = 'lg', dark = false }) {
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
        maxHeight: '92vh', animation: 'pay-modal-pop 0.2s ease',
        border: dark ? '1px solid #334155' : '1px solid #E4E7EC',
      }}>
        <style>{'@keyframes pay-modal-pop { from { opacity:0; transform:scale(0.97) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }'}</style>
        <div style={{
          padding: '18px 22px',
          background: dark
            ? 'linear-gradient(135deg,#064e3b 0%,#1e3a8a 100%)'
            : 'linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 45%,#EFF6FF 100%)',
          borderBottom: `1px solid ${dark ? '#334155' : '#A7F3D0'}`,
          borderRadius: '18px 18px 0 0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: dark ? 'rgba(255,255,255,0.12)' : '#fff',
              border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #6EE7B7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: dark ? '#6EE7B7' : '#059669',
              boxShadow: dark ? 'none' : '0 2px 8px rgba(5,150,105,0.15)',
            }}>
              <IconDollar />
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
    document.body
  );
}

function ServiceMultiSelect({ services, selected, onChange, dark = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const selectedIds = useMemo(
    () => Array.from(new Set((selected || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))),
    [selected],
  );
  const selSvcs = services.filter((s) => selectedIds.includes(Number(s.id)));
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
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenState((o) => !o); } }}
        onClick={() => setOpenState((o) => !o)}
        style={{
          minHeight: 38, padding: '6px 10px', borderRadius: 10,
          border: `1.5px solid ${open ? '#2563EB' : (dark ? '#334155' : '#D0D5DD')}`,
          background: dark ? '#0B1220' : '#fff', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
        }}
      >
        {selSvcs.length === 0
          ? <span style={{ color: dark ? '#64748B' : '#98A2B3', fontSize: 13, userSelect: 'none' }}>Select services…</span>
          : selSvcs.map((s) => (
            <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px 2px 10px', borderRadius: 99, background: dark ? 'rgba(37,99,235,0.2)' : '#EFF6FF', color: dark ? '#93C5FD' : '#2563EB', fontSize: 12, fontWeight: 600 }}>
              {s.name}
              <span onMouseDown={(e) => { e.stopPropagation(); toggle(s.id); }} style={{ cursor: 'pointer', color: '#93C5FD', fontWeight: 700, fontSize: 14, lineHeight: 1, marginLeft: 3 }}>×</span>
            </span>
          ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#98A2B3', userSelect: 'none', paddingLeft: 4 }}>{open ? '▴' : '▾'}</span>
      </div>
      {open && createPortal(
        <>
          <div onClick={() => setOpenState(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            zIndex: 9999,
            background: dark ? '#1E293B' : '#fff',
            border: `1.5px solid ${dark ? '#334155' : '#E4E7EC'}`,
            borderRadius: 10,
            boxShadow: dark ? '0 8px 24px rgba(2,6,23,0.45)' : '0 8px 24px rgba(16,24,40,0.12)',
            maxHeight: 280,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${dark ? '#334155' : '#F2F4F7'}`, flexShrink: 0 }}>
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search by name or category…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '8px 10px', borderRadius: 8, fontSize: 13,
                  border: `1px solid ${dark ? '#475569' : '#D0D5DD'}`,
                  background: dark ? '#0B1220' : '#F9FAFB',
                  color: dark ? '#E2E8F0' : '#101828',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: 220 }}>
              {services.length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 13, color: dark ? '#64748B' : '#98A2B3' }}>No services found</div>
              )}
              {services.length > 0 && filtered.length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 13, color: dark ? '#64748B' : '#98A2B3' }}>
                  No services match “{search.trim()}”
                </div>
              )}
              {filtered.map((s) => {
                const checked = selectedIds.includes(Number(s.id));
                return (
                  <label key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer',
                    background: checked ? (dark ? 'rgba(37,99,235,0.15)' : '#F0F9FF') : 'transparent',
                    borderBottom: `1px solid ${dark ? '#334155' : '#F8FAFC'}`,
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(s.id)}
                      style={{ accentColor: '#2563EB', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{ flex: 1, fontSize: 13, color: dark ? '#E2E8F0' : '#344054', fontWeight: checked ? 600 : 400 }}>
                      {s.name}
                      {(s.category || s.subcategory) ? (
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: dark ? '#64748B' : '#98A2B3', marginTop: 1 }}>
                          {[s.category, s.subcategory].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </span>
                    <span style={{ fontSize: 12, color: '#059669', fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>Rs. {Number(s.price || 0).toLocaleString()}</span>
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

export default function PaymentsPage() {
  const { user } = useAuth();
  const { isDark } = useTheme();
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
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceItem, setInvoiceItem] = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [servicePrices, setServicePrices] = useState({});
  const [saving, setSaving]       = useState(false);
  const [formErr, setFormErr]     = useState('');
  const [qrModal, setQrModal]     = useState(null); // { amount, reference, splitIdx }
  const [custPackages, setCustPackages] = useState([]);
  const [loadingPkgs, setLoadingPkgs]   = useState(false);
  const [formPackageId, setFormPackageId] = useState('');
  const [formHelpers, setFormHelpers]   = useState([]);
  const [discounts, setDiscounts]       = useState([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [discountsLoadError, setDiscountsLoadError] = useState(false);
  const [receiptTemplates, setReceiptTemplates] = useState([]);
  const { allowed: recurringAllowed } = useFeatureGate('recurring');

  // Load reference data once on mount (independent of payment filters)
  useEffect(() => {
    Promise.allSettled([
      api.get('/branches',  { params:{ limit:100 } }),
      api.get('/customers', { params:{ limit:2000 } }),
      api.get('/staff',     { params:{ limit:200 } }),
      fetchAllServices(api),
    ]).then(([brR, cuR, stR, svR]) => {
      if (brR.status === 'fulfilled') setBranches(Array.isArray(brR.value.data) ? brR.value.data : (brR.value.data?.data ?? []));
      if (cuR.status === 'fulfilled') {
        const list = Array.isArray(cuR.value.data) ? cuR.value.data : (cuR.value.data?.data ?? []);
        setCustomers(pinWalkInFirst(list));
      }
      if (stR.status === 'fulfilled') setStaffList(Array.isArray(stR.value.data) ? stR.value.data : (stR.value.data?.data ?? []));
      if (svR.status === 'fulfilled') setServices(svR.value || []);
    });
  }, []);

  useEffect(() => {
    if (!canEdit || !recurringAllowed) return;
    api.get('/notifications/templates/options', { params: { event_type: 'recurring_reminder' } })
      .then(({ data }) => setReceiptTemplates(Array.isArray(data?.options) ? data.options : []))
      .catch(() => setReceiptTemplates([]));
  }, [canEdit, recurringAllowed]);

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

  useEffect(() => {
    if (!showForm || !form.customer_id) return;
    let cancelled = false;
    const customerId = String(form.customer_id).trim();
    setLoadingPkgs(true);
    fetchCustomerPackagesForPayment(api, customerId)
      .then((list) => { if (!cancelled) setCustPackages(list); })
      .catch(() => { if (!cancelled) setCustPackages([]); })
      .finally(() => { if (!cancelled) setLoadingPkgs(false); });
    return () => { cancelled = true; };
  }, [showForm, form.customer_id]);

  const openAdd = () => {
    setEditId(null);
    setForm({
      ...EMPTY_FORM,
      branch_id: user?.branchId || filterBranch || '',
      is_recurring: !!recurringAllowed,
      recurring_next_date: defaultRecurringNextDate(),
      appointment_time: '08:00',
    });
    setFormErr('');
    setCustPackages([]);
    setFormPackageId('');
    setFormHelpers([]);
    setServicePrices({});
    setShowForm(true);
  };
  const applyFormPackage = (packageId) => {
    setFormPackageId(packageId);
    if (!packageId) {
      setForm((f) => ({
        ...f,
        splits: f.splits.length === 1 ? [{ method: 'Cash', amount: f.total_amount || '' }] : f.splits,
      }));
      return;
    }
    const cp = custPackages.find((p) => String(p.id) === String(packageId));
    if (!cp) return;
    if (!packageCanRedeemNow(cp)) {
      setFormErr('This package has no sessions left or no services configured.');
      setFormPackageId('');
      return;
    }
    const ids = resolvePackageServiceIds(cp, services);
    const bundle = getPackageBundlePrice(cp);
    setForm((f) => ({
      ...f,
      service_ids: ids.length ? ids : f.service_ids,
      total_amount: bundle > 0 ? String(bundle) : '0',
      loyalty_discount: 0,
      discount_id: '',
      splits: [{ method: 'Package', amount: bundle > 0 ? String(bundle) : '0', customer_package_id: packageId }],
    }));
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
      const pkgSplit = (p.splits || []).find((sp) => sp.method === 'Package');
      setFormPackageId(pkgSplit?.customer_package_id ? String(pkgSplit.customer_package_id) : '');
      setFormHelpers([]);
      setCustPackages([]);
      if (p.customer_id) {
        setLoadingPkgs(true);
        fetchCustomerPackagesForPayment(api, p.customer_id)
          .then(setCustPackages)
          .catch(() => setCustPackages([]))
          .finally(() => setLoadingPkgs(false));
      }
      setEditId(row.id);
      setShowForm(true);
    } catch (e) {
      toast(e.response?.data?.message || 'Could not load payment', 'error');
    }
  };
  const setSplit = (idx, field, val) => {
    if (field === 'customer_package_id' && val) setFormPackageId(String(val));
    if (field === 'method' && val !== 'Package') setFormPackageId('');
    setForm(f => {
      const s = [...f.splits];
      s[idx] = { ...s[idx], [field]: val };
      if (field === 'method' && val !== 'Package') delete s[idx].customer_package_id;
      if (field === 'method' && val === 'Package') {
        const cpId = s[idx].customer_package_id || formPackageId;
        if (cpId) {
          s[idx].customer_package_id = cpId;
          const cp = custPackages.find((p) => String(p.id) === String(cpId));
          const bundle = getPackageBundlePrice(cp);
          s[idx].amount = bundle > 0 ? String(bundle) : '0';
        }
      }
      if (field === 'customer_package_id' && val) {
        const cp = custPackages.find((p) => String(p.id) === String(val));
        const bundle = getPackageBundlePrice(cp);
        s[idx].amount = bundle > 0 ? String(bundle) : '0';
      }
      const cpId = field === 'customer_package_id' ? val : (s[idx].customer_package_id || formPackageId);
      const usingPkg = s[idx].method === 'Package' && cpId;
      const bundle = usingPkg
        ? getPackageBundlePrice(custPackages.find((p) => String(p.id) === String(cpId)))
        : 0;
      return {
        ...f,
        splits: s,
        ...(usingPkg && bundle > 0 ? { total_amount: String(bundle), loyalty_discount: 0, discount_id: '' } : {}),
      };
    });
  };
  const addSplit    = () => setForm(f => ({ ...f, splits: [...f.splits, { method:'Cash', amount:'' }] }));
  const removeSplit = idx => setForm(f => ({ ...f, splits: f.splits.filter((_,i) => i!==idx) }));

  const handleSave = async () => {
    if (!String(form.customer_id || '').trim()) return setFormErr('Select a customer before recording payment.');
    if (!String(form.staff_id || '').trim()) return setFormErr('Select staff before recording payment.');
    const helperRows = helpersPayload(formHelpers);
    if (!editId && formHelpers.some((h) => !h.staff_id || !(Number(h.commission_value) > 0))) {
      return setFormErr('Each helper needs a staff member and commission value.');
    }
    if (!form.service_ids.length) return setFormErr('At least one service is required');
    const usingPackage = form.splits.some((sp) => sp.method === 'Package');
    const pkgSplit = usingPackage ? form.splits.find((sp) => sp.method === 'Package') : null;
    const pkgCp = pkgSplit?.customer_package_id
      ? custPackages.find((p) => String(p.id) === String(pkgSplit.customer_package_id))
      : null;
    const packageBundle = pkgCp ? getPackageBundlePrice(pkgCp) : packageBundlePrice;
    if (usingPackage) {
      if (!pkgSplit?.customer_package_id) return setFormErr('Select a customer package for Package payment.');
      if (pkgCp && !packageCoversAllServices(form.service_ids, pkgCp)) {
        return setFormErr('All selected services must be included in the package.');
      }
      if (pkgCp && !packageCanRedeemNow(pkgCp)) {
        return setFormErr('Selected package has no sessions remaining or cannot be used.');
      }
    }
    if (!usingPackage && (!form.total_amount || Number(form.total_amount) <= 0)) {
      return setFormErr('Total amount and at least one service are required');
    }
    const subtotal = usingPackage
      ? packageBundle
      : Number(form.total_amount);
    const loyalty = Number(form.loyalty_discount || 0);
    const selDisc = form.discount_id ? discounts.find(d => String(d.id) === String(form.discount_id)) : null;
    const promo = selDisc ? computePromoFromDiscount(selDisc, subtotal) : 0;
    const net = subtotal - loyalty - promo;
    const splitTotal = form.splits.reduce((s, sp) => s + Number(sp.amount||0), 0);
    if (!usingPackage && Math.abs(splitTotal - net) > 0.02)
      return setFormErr(`Split total (Rs. ${splitTotal.toLocaleString()}) must equal net after discounts (Rs. ${net.toLocaleString()})`);
    if (usingPackage && Math.abs(splitTotal - packageBundle) > 0.02)
      return setFormErr(`Package split must equal bundle price (Rs. ${packageBundle.toLocaleString()})`);
    setSaving(true);
    try {
      const { service_ids, is_recurring, recurring_next_date, appointment_time, recurring_message_template_ids, ...rest } = form;
      const selectedCustomer = customers.find((c) => String(c.id) === String(form.customer_id));
      const payload = {
        ...rest,
        customer_name: selectedCustomer?.name || rest.customer_name || undefined,
        service_id: service_ids[0] || null,
        service_ids,
        subtotal,
        promo_discount: promo,
        discount_id: form.discount_id || null,
      };
      if (!editId && recurringAllowed && is_recurring) {
        payload.is_recurring = true;
        payload.recurring_next_date = recurring_next_date || defaultRecurringNextDate();
        payload.appointment_time = appointment_time || '08:00';
        payload.recurring_sms_time = appointment_time || '08:00';
        payload.recurring_message_template_ids = recurring_message_template_ids;
      }
      if (editId) {
        await api.put(`/payments/${editId}`, payload);
        toast('Payment updated successfully!', 'success');
      } else {
        payload.helpers = helperRows;
        await api.post('/payments', payload);
        toast('Payment recorded successfully!', 'success');
      }
      setShowForm(false);
      setEditId(null);
      load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };

  const selectedPackage = formPackageId
    ? custPackages.find((p) => String(p.id) === String(formPackageId))
    : null;
  const serviceListTotal = useMemo(
    () => calcServiceListTotal(form.service_ids, services),
    [form.service_ids, services],
  );
  const packageBundlePrice = getPackageBundlePrice(selectedPackage);

  const promoPreview = useMemo(() => {
    const sub = formPackageId ? packageBundlePrice : Number(form.total_amount || 0);
    const d = form.discount_id ? discounts.find(x => String(x.id) === String(form.discount_id)) : null;
    return d ? computePromoFromDiscount(d, sub) : 0;
  }, [form.total_amount, form.discount_id, discounts, formPackageId, packageBundlePrice]);

  useEffect(() => {
    if (!showForm || form.splits.length !== 1) return;
    if (formPackageId || form.splits[0]?.method === 'Package') return;
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
  }, [showForm, form.total_amount, form.loyalty_discount, form.discount_id, discounts, form.splits.length, formPackageId, form.splits]);

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
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="pk-filter-control" />
        {isAdmin && !hasFixedBranch && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="pk-filter-control">
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
          { id:'search', header:'Customer', meta:{ width:'18%' },
            accessorFn: r => `${r.customer?.name || r.customer_name || ''} ${r.service?.name || ''} ${r.staff?.name || ''}`.trim(),
            cell: ({ row }) => (
              <>
                <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>
                  {row.original.customer?.name || row.original.customer_name || 'Walk-in'}
                </div>
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
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                {row.original.is_advance ? (
                  <span style={{ padding:'2px 7px', borderRadius:5, background:'#EFF8FF', border:'1px solid #B2DDFF', fontSize:11, color:'#175CD3', fontWeight:600 }}>
                    Advance
                  </span>
                ) : null}
                {(row.original.splits||[]).map((sp, i) => (
                  <span key={i} style={{ padding:'2px 7px', borderRadius:5, background:'#F9FAFB', border:'1px solid #E4E7EC', fontSize:11, color:'#475467' }}>
                    {sp.method === 'Package'
                      ? `Package Rs.${Number(sp.amount||0).toLocaleString()}`
                      : `${METHOD_LABEL[sp.method]||sp.method} Rs.${Number(sp.amount||0).toLocaleString()}`}
                  </span>
                ))}
              </div>
            )
          },
          { accessorKey:'total_amount', header:'Total', meta:{ width:'12%', align:'right' },
            cell: ({ row }) => (
              <span style={{ fontWeight:800, color:'#059669', fontFamily:"'Outfit',sans-serif", fontSize:15 }}>
                Rs. {Number(row.original.total_amount||0).toLocaleString()}
              </span>
            )
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
        data={payments}
        loading={loading}
        emptyMessage="No payments recorded"
        emptySub="Use the Record Payment button to add transactions"
        searchableColumns={[{ id: 'search', title: 'Payment' }]}
      />

      {/* Record Payment Modal */}
      <PayModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditId(null); }}
        title={editId ? 'Edit Payment' : 'Record Payment'}
        subtitle={editId ? 'Update transaction details, services, and payment splits.' : 'Record a sale — select customer, services, and how they paid.'}
        size="xl"
        dark={isDark}
        footer={(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B' }}>
              {form.total_amount || formPackageId ? (
                <span style={{ fontWeight: 800, color: '#059669' }}>
                  {formPackageId ? (
                    <>
                      Bundle: {formatPackageBillAmount(packageBundlePrice)}
                      <span style={{ fontWeight: 500, color: isDark ? '#94A3B8' : '#64748B', marginLeft: 8 }}>
                        · {form.service_ids.length} service{form.service_ids.length !== 1 ? 's' : ''} · covered by package
                      </span>
                    </>
                  ) : (
                    <>
                      Net: Rs. {(Number(form.total_amount || 0) - Number(form.loyalty_discount || 0) - promoPreview).toLocaleString()}
                      {form.service_ids.length > 0 && (
                        <span style={{ fontWeight: 500, color: isDark ? '#94A3B8' : '#64748B', marginLeft: 8 }}>
                          · {form.service_ids.length} service{form.service_ids.length !== 1 ? 's' : ''}
                          {(() => {
                            const net = Number(form.total_amount || 0) - Number(form.loyalty_discount || 0) - promoPreview;
                            const st = form.splits.reduce((s, sp) => s + Number(sp.amount || 0), 0);
                            const ok = Math.abs(net - st) < 0.01;
                            return ok && net > 0 ? ' · splits match' : net > 0 ? ` · Rs. ${st.toLocaleString()} allocated` : '';
                          })()}
                        </span>
                      )}
                    </>
                  )}
                </span>
              ) : (
                <span>Select services to calculate amount</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</Button>
              <Button
                variant="primary"
                loading={saving}
                disabled={saving || !String(form.customer_id || '').trim() || !String(form.staff_id || '').trim()}
                onClick={handleSave}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconDollar />{editId ? 'Save Changes' : 'Record Payment'}
                </span>
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

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PaySection title="Customer & Staff" desc="Who received the service and who served them" dark={isDark}>
              {(isAdmin && !hasFixedBranch) && (
                <FormGroup label="Branch">
                  <Select value={form.branch_id || ''} disabled={!!editId} onChange={e => {
                    setForm(f => ({ ...f, branch_id: e.target.value, staff_id: '' }));
                    setFormHelpers([]);
                  }}>
                    <option value="">Select branch</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </FormGroup>
              )}
              <FormGroup label="Customer *">
                <CustomerTypeahead
                  customers={customers}
                  value={form.customer_id}
                  branchId={form.branch_id || user?.branchId}
                  onSelect={(cid, cust) => {
                    if (cust) {
                      setCustomers((prev) => {
                        if (prev.some((c) => String(c.id) === String(cust.id))) return prev;
                        return [cust, ...prev];
                      });
                    }
                    setForm(f => ({ ...f, customer_id: cid }));
                    setFormPackageId('');
                    setCustPackages([]);
                  }}
                  onNew={newCust => setCustomers(prev => [newCust, ...prev])}
                />
              </FormGroup>
              {form.customer_id && (
                <FormGroup label="Customer Package">
                  {loadingPkgs ? (
                    <div style={{ fontSize: 12, color: isDark ? '#64748B' : '#64748B' }}>Loading packages…</div>
                  ) : custPackages.length > 0 ? (
                    <Select value={formPackageId} onChange={(e) => applyFormPackage(e.target.value)}>
                      <option value="">No package — pay normally</option>
                      {custPackages.map((cp) => (
                        <option key={cp.id} value={cp.id} disabled={!packageCanRedeemNow(cp)}>
                          {formatCustomerPackageOptionLabel(cp)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <div style={{ fontSize: 12, color: isDark ? '#64748B' : '#64748B' }}>
                      No sold packages for this customer.
                    </div>
                  )}
                  {formPackageId && (
                    <div style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857', marginTop: 6, fontWeight: 600 }}>
                      {formatPackageAppliedMessage(packageBundlePrice)}
                    </div>
                  )}
                </FormGroup>
              )}
              {editId ? (
                <FormGroup label="Staff *" helper="Staff cannot change helper commission on edit.">
                  <Select value={form.staff_id || ''} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                    <option value="">Select staff</option>
                    {(form.branch_id ? staffList.filter(s => s.branch_id == form.branch_id) : staffList).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </FormGroup>
              ) : (
                <PaymentHelperStaffFields
                  mainStaffId={form.staff_id}
                  onMainStaffChange={(id) => setForm((f) => ({ ...f, staff_id: id }))}
                  helpers={formHelpers}
                  onHelpersChange={setFormHelpers}
                  staffOptions={form.branch_id
                    ? staffList.filter((s) => String(s.branch_id) === String(form.branch_id)
                      || (s.branches || []).some((b) => String(b.id) === String(form.branch_id)))
                    : staffList}
                  isDark={isDark}
                />
              )}
              {!editId && recurringAllowed && (
                <div style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${isDark ? '#334155' : '#E5EAF0'}`,
                  background: isDark ? '#0F172A' : '#F8FAFC',
                }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!form.is_recurring}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        is_recurring: e.target.checked,
                        recurring_next_date: f.recurring_next_date || defaultRecurringNextDate(),
                      }))}
                      style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2563EB' }}
                    />
                    <span>
                      <div style={{ fontWeight: 700, fontSize: 14, color: isDark ? '#E2E8F0' : '#101828' }}>Recurring reminder</div>
                      <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#667085', marginTop: 2 }}>
                        SMS only on the selected day & time — does not book an appointment
                      </div>
                    </span>
                  </label>
                  {form.is_recurring && (
                    <>
                      <div style={{ marginTop: 10 }}>
                        <FormGroup label="SMS send time">
                          <Input
                            type="time"
                            value={(form.appointment_time || '08:00').slice(0, 5)}
                            onChange={(e) => setForm((f) => ({ ...f, appointment_time: e.target.value }))}
                          />
                        </FormGroup>
                      </div>
                      <RecurringDateCalendar
                        value={form.recurring_next_date || defaultRecurringNextDate()}
                        onChange={(d) => setForm((f) => ({ ...f, recurring_next_date: d }))}
                      />
                      <div style={{ marginTop: 10 }}>
                        <FormGroup label="Reminder messages">
                          <RecurringTemplateCheckboxes
                            templates={receiptTemplates}
                            value={form.recurring_message_template_ids}
                            onChange={(ids) => setForm((f) => ({ ...f, recurring_message_template_ids: ids }))}
                            isDark={isDark}
                          />
                        </FormGroup>
                      </div>
                    </>
                  )}
                </div>
              )}
            </PaySection>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PaySection title="Services" desc="Select services — change each service price after adding" dark={isDark}>
              <ServiceMultiSelect
                dark={isDark}
                services={services.filter(s => s.is_active !== false)}
                selected={form.service_ids}
                onChange={ids => {
                  if (formPackageId) return;
                  setServicePrices((prev) => {
                    const next = {};
                    ids.forEach((sid) => {
                      const key = Number(sid);
                      if (prev[key] !== undefined && prev[key] !== null && prev[key] !== '') {
                        next[key] = prev[key];
                      } else {
                        const s = services.find((x) => Number(x.id) === key);
                        next[key] = Number(s?.price || 0);
                      }
                    });
                    const total = ids.reduce((sum, sid) => sum + (Number(next[Number(sid)]) || 0), 0);
                    setForm((f) => ({
                      ...f,
                      service_ids: ids,
                      total_amount: total > 0 ? String(total) : '',
                      splits: total > 0 && f.splits.length === 1
                        ? [{ ...f.splits[0], amount: String(total) }]
                        : f.splits,
                    }));
                    return next;
                  });
                }}
              />
              {!formPackageId && form.service_ids.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.service_ids.map((sid) => {
                    const s = services.find((x) => Number(x.id) === Number(sid));
                    if (!s) return null;
                    return (
                      <div key={sid} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#E2E8F0' : '#0F172A' }}>{s.name}</span>
                        <Input
                          type="number"
                          value={servicePrices[Number(sid)] ?? Number(s.price || 0)}
                          onChange={(e) => {
                            const val = e.target.value;
                            setServicePrices((prev) => {
                              const next = { ...prev, [Number(sid)]: val };
                              const total = form.service_ids.reduce((sum, id) => sum + (Number(next[Number(id)]) || 0), 0);
                              setForm((f) => ({
                                ...f,
                                total_amount: total > 0 ? String(total) : '',
                                splits: f.splits.length === 1
                                  ? [{ ...f.splits[0], amount: total > 0 ? String(total) : f.splits[0].amount }]
                                  : f.splits,
                              }));
                              return next;
                            });
                          }}
                          style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              {form.service_ids.length > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                  padding: '10px 12px', borderRadius: 10, marginTop: 10,
                  background: isDark ? 'rgba(5,150,105,0.12)' : '#ECFDF5',
                  border: `1px solid ${isDark ? '#065F46' : '#6EE7B7'}`,
                }}>
                  <span style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857', fontWeight: 600 }}>
                    {form.service_ids.length} service{form.service_ids.length !== 1 ? 's' : ''} selected
                    {formPackageId && packageBundlePrice > 0 && (
                      <span style={{ marginLeft: 8, color: isDark ? '#94A3B8' : '#64748B' }}>
                        · Bundle Rs. {packageBundlePrice.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: formPackageId ? '#047857' : '#059669', fontFamily: "'Outfit',sans-serif" }}>
                    {formPackageId ? (
                      <>
                        {serviceListTotal > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, textDecoration: 'line-through', color: isDark ? '#94A3B8' : '#64748B', marginRight: 8 }}>
                            List Rs. {serviceListTotal.toLocaleString()}
                          </span>
                        )}
                        Bundle {formatPackageBillAmount(packageBundlePrice)}
                      </>
                    ) : (
                      <>Rs. {Number(form.total_amount || 0).toLocaleString()}</>
                    )}
                  </span>
                </div>
              )}
            </PaySection>

            <PaySection title="Amount & Discounts" desc="Edit bill total to charge any price — not locked to catalog" dark={isDark}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormGroup label={formPackageId ? 'Bundle price (Rs.)' : 'Total Amount (Rs.)'} required>
                  <Input
                    type="number"
                    value={formPackageId ? String(packageBundlePrice || 0) : (form.total_amount || '')}
                    onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))}
                    disabled={!!formPackageId}
                    placeholder="Change price if needed"
                  />
                </FormGroup>
                <FormGroup label="Loyalty Discount (Rs.)">
                  <Input type="number" value={form.loyalty_discount || 0} onChange={e => setForm(f => ({ ...f, loyalty_discount: Number(e.target.value) }))} disabled={!!formPackageId} />
                </FormGroup>
              </div>
              {!formPackageId && (
              <FormGroup label="Promo discount">
                <Select value={form.discount_id || ''} onChange={e => setForm(f => ({ ...f, discount_id: e.target.value }))}>
                  <option value="">None</option>
                  {discounts.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.discount_type === 'fixed' ? `Rs.${d.value}` : `${d.value}%`})</option>
                  ))}
                </Select>
                {discountsLoading && (
                  <div style={{ fontSize: 12, color: isDark ? '#64748B' : '#64748B', marginTop: 6 }}>Loading promos…</div>
                )}
                {!discountsLoading && showForm && !effectiveBranchForDiscounts && (
                  <div style={{ fontSize: 12, color: '#B45309', marginTop: 6 }}>
                    Select branch or set Payments filter — promos load per branch.
                  </div>
                )}
                {!discountsLoading && !discountsLoadError && effectiveBranchForDiscounts && discounts.length === 0 && (
                  <div style={{ fontSize: 12, color: isDark ? '#64748B' : '#64748B', marginTop: 6 }}>
                    No active promos for this branch.
                  </div>
                )}
              </FormGroup>
              )}
              {formPackageId && (
                <div style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857', marginTop: -4, marginBottom: 8, fontWeight: 600 }}>
                  {formatPackageAppliedMessage(packageBundlePrice)}
                </div>
              )}
              {(formPackageId || (form.total_amount !== '' && form.total_amount != null)) && (
                <div style={{
                  borderRadius: 12, padding: '12px 14px',
                  background: isDark ? 'linear-gradient(135deg,#172554,#1e293b)' : 'linear-gradient(135deg,#EFF6FF,#ECFDF5)',
                  border: `1px solid ${isDark ? '#334155' : '#BFDBFE'}`,
                }}>
                  {formPackageId ? (
                    <>
                      {serviceListTotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>
                          <span>List value</span>
                          <span style={{ textDecoration: 'line-through' }}>Rs. {serviceListTotal.toLocaleString()}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: serviceListTotal > 0 ? 8 : 0, marginTop: serviceListTotal > 0 ? 4 : 0, borderTop: serviceListTotal > 0 ? `1px dashed ${isDark ? '#334155' : '#BFDBFE'}` : 'none' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#E2E8F0' : '#101828' }}>Bundle price</span>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#059669', fontFamily: "'Outfit',sans-serif" }}>
                          {formatPackageBillAmount(packageBundlePrice)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>
                        <span>Subtotal</span>
                        <span>Rs. {Number(form.total_amount || 0).toLocaleString()}</span>
                      </div>
                      {Number(form.loyalty_discount || 0) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#EF4444', marginBottom: 4 }}>
                          <span>Loyalty</span>
                          <span>− Rs. {Number(form.loyalty_discount).toLocaleString()}</span>
                        </div>
                      )}
                      {promoPreview > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7C3AED', marginBottom: 4 }}>
                          <span>Promo</span>
                          <span>− Rs. {promoPreview.toLocaleString()}</span>
                        </div>
                      )}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        paddingTop: 8, marginTop: 4, borderTop: `1px dashed ${isDark ? '#334155' : '#BFDBFE'}`,
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#E2E8F0' : '#101828' }}>Net payable</span>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#059669', fontFamily: "'Outfit',sans-serif" }}>
                          Rs. {(Number(form.total_amount || 0) - Number(form.loyalty_discount || 0) - promoPreview).toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </PaySection>

            <PaySection title="Payment Method" desc="Cash, card, LankaQR, package, or split across methods" dark={isDark}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4, marginBottom: -4 }}>
                <button
                  type="button"
                  onClick={addSplit}
                  style={{
                    background: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF',
                    border: `1px solid ${isDark ? '#1E40AF' : '#BFDBFE'}`,
                    color: isDark ? '#93C5FD' : '#1D4ED8',
                    borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add Split
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {form.splits.map((sp, i) => (
                  <div key={i} style={{
                    borderRadius: 12,
                    border: `1px solid ${isDark ? '#334155' : '#E4E7EC'}`,
                    background: isDark ? '#0B1220' : '#FAFBFC',
                    padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        background: isDark ? '#1E293B' : '#E2E8F0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B',
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#CBD5E1' : '#475569' }}>Split payment</span>
                      {form.splits.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSplit(i)}
                          style={{
                            marginLeft: 'auto', background: isDark ? '#450a0a' : '#FEF2F2',
                            border: `1px solid ${isDark ? '#7f1d1d' : '#FECACA'}`,
                            borderRadius: 7, cursor: 'pointer', color: '#DC2626',
                            fontSize: 14, width: 28, height: 28,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Select value={sp.method} onChange={e => setSplit(i, 'method', e.target.value)} style={{ flex: '0 0 148px' }}>
                        {METHODS.map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                      </Select>
                      <Input type="number" value={sp.amount} placeholder="Amount (Rs.)" onChange={e => setSplit(i, 'amount', e.target.value)} style={{ flex: 1 }} />
                    </div>
                    {sp.method === 'LankaQR' && sp.amount && Number(sp.amount) > 0 && (
                      <button
                        type="button"
                        onClick={() => setQrModal({ amount: sp.amount, reference: `PAY-${Date.now()}`, splitIdx: i })}
                        style={{
                          width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 9, border: 'none',
                          background: 'linear-gradient(135deg,#1e3a5f,#2563EB)', color: '#fff',
                          fontWeight: 700, fontSize: 13, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/></svg>
                        Generate QR Code
                      </button>
                    )}
                    {sp.method === 'Package' && (
                      <div style={{ marginTop: 10 }}>
                        {!form.customer_id ? (
                          <div style={{
                            fontSize: 12, color: '#92400E',
                            background: isDark ? '#422006' : '#FFFBEB',
                            padding: '7px 10px', borderRadius: 8,
                            border: `1px solid ${isDark ? '#78350F' : '#FDE68A'}`,
                          }}>
                            Select a customer first to use package payment
                          </div>
                        ) : loadingPkgs ? (
                          <div style={{ fontSize: 12, color: isDark ? '#64748B' : '#98A2B3' }}>Loading packages…</div>
                        ) : custPackages.length === 0 ? (
                          <div style={{
                            fontSize: 12, color: '#92400E',
                            background: isDark ? '#422006' : '#FFFBEB',
                            padding: '7px 10px', borderRadius: 8,
                            border: `1px solid ${isDark ? '#78350F' : '#FDE68A'}`,
                          }}>
                            No sold packages for this customer
                          </div>
                        ) : (
                          <Select value={sp.customer_package_id || ''} onChange={e => setSplit(i, 'customer_package_id', e.target.value)} style={{ fontSize: 12 }}>
                            <option value="">Select package…</option>
                            {custPackages.map(cp => (
                              <option key={cp.id} value={cp.id} disabled={!packageCanRedeemNow(cp)}>
                                {formatCustomerPackageOptionLabel(cp)}
                              </option>
                            ))}
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {form.splits.length > 0 && (formPackageId || (form.total_amount !== '' && form.total_amount != null)) && (() => {
                const splitTotal = form.splits.reduce((s, sp) => s + Number(sp.amount || 0), 0);
                const net = formPackageId
                  ? packageBundlePrice
                  : Number(form.total_amount || 0) - Number(form.loyalty_discount || 0) - promoPreview;
                const diff = net - splitTotal;
                const ok = Math.abs(diff) < 0.01;
                return (
                  <div style={{
                    marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: ok ? (isDark ? '#052e16' : '#F0FDF4') : (isDark ? '#422006' : '#FFFBEB'),
                    border: `1px solid ${ok ? (isDark ? '#065F46' : '#BBF7D0') : (isDark ? '#78350F' : '#FDE68A')}`,
                    borderRadius: 10, padding: '8px 12px', fontSize: 12,
                  }}>
                    <span style={{ color: ok ? (isDark ? '#6EE7B7' : '#166534') : '#92400E', fontWeight: 600 }}>
                      {ok
                        ? (formPackageId ? '✓ Package split matches bundle price' : '✓ Splits match net amount')
                        : `Remaining: Rs. ${Math.abs(diff).toLocaleString()}`}
                    </span>
                    <span style={{ color: isDark ? '#94A3B8' : '#667085' }}>
                      Rs. {splitTotal.toLocaleString()} / Rs. {net.toLocaleString()}
                    </span>
                  </div>
                );
              })()}
            </PaySection>
          </div>
        </div>
      </PayModal>

      <InvoiceModal open={showInvoice} onClose={() => setShowInvoice(false)} payment={invoiceItem} />

      {qrModal && (
        <HelaPayQRModal
          amount={qrModal.amount}
          reference={qrModal.reference}
          onClose={() => setQrModal(null)}
          onSuccess={() => setQrModal(null)}
        />
      )}
    </PageWrapper>
  );
}
