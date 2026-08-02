import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup, Textarea } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { computePromoFromDiscount } from '../utils/promoDiscount';
import {
  stripPackageLine,
  parsePackageSelection,
  buildPackageNoteLine,
  resolvePackageServiceIds,
  formatCustomerPackageLabel,
  packageCoversAllServices,
  fetchActiveCustomerPackages,
  fetchDiscountedPackageTemplates,
  ensureCustomerPackageForTemplate,
  findCustomerPackageForTemplate,
  resolveTemplateServiceIds,
  applyPackageSelection,
  formatPackageTemplateLabel,
  getPackageBundlePrice,
  formatPackageAppliedMessage,
  formatPackageBillAmount,
  resolveAppointmentAmountDisplay,
  appointmentServiceIds,
} from '../utils/packageHelpers';
import {
  DataTable, ActionBtn, StaffAvatar, PagBtn,
  IconEye, IconEdit, IconTrash, IconPlus, IconCalendar,
  StatCard, FilterBar, PKModal as Modal, Drawer,
} from '../components/ui/PageKit';
import usePageTheme, { PAGE_STAT_COLORS as SC } from '../hooks/usePageTheme';
import { useNavigate } from 'react-router-dom';
import RecurringDateCalendar, { defaultRecurringNextDate } from '../components/ui/RecurringDateCalendar';
import RecurringTemplateCheckboxes from '../components/ui/RecurringTemplateCheckboxes';
import PaymentHelperStaffFields, { helpersPayload } from '../components/payments/PaymentHelperStaffFields';

const IconMoney    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;

const APPT_STATUSES = ['pending','confirmed','in_service','completed','cancelled','no_show'];
const APPT_EXTRA_SERVICES_PREFIX = 'Additional services:';
const stripAdditionalServicesLine = (notes = '') =>
  String(notes)
    .split('\n')
    .filter((line) => !/^\s*additional\s+services?\s*[:\-]?\s*/i.test(line))
    .join('\n')
    .trim();
const parseAdditionalServiceNames = (notes = '') => {
  const line = String(notes).split('\n').find((line) => /^\s*additional\s+services?\s*[:\-]?\s*/i.test(line));
  if (!line) return [];
  const raw = line.replace(/^\s*additional\s+services?\s*[:\-]?\s*/i, '');
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};
const normalizeServiceName = (name = '') =>
  String(name)
    .toLowerCase()
    .replace(/rs\.?\s*[\d,]+/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const getAllServiceNamesForAppt = (row) => {
  const primary = row.service?.name || '';
  const extra = parseAdditionalServiceNames(row.notes || '');
  return Array.from(new Set([primary, ...extra].filter(Boolean)));
};
const inferExtraServiceIdsFromAmount = ({ primaryId, totalAmount, services }) => {
  const target = Number(totalAmount || 0);
  if (!target || target <= 0) return [];
  const primaryPrice = Number(services.find((s) => Number(s.id) === Number(primaryId))?.price || 0);
  const remaining = target - primaryPrice;
  if (remaining <= 0) return [];

  const candidates = services
    .filter((s) => Number(s.id) !== Number(primaryId) && Number(s.price || 0) > 0)
    .map((s) => ({ id: Number(s.id), price: Number(s.price || 0) }));

  // Exact 1-service match
  const single = candidates.find((c) => c.price === remaining);
  if (single) return [single.id];

  // Exact 2-service match fallback
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      if ((candidates[i].price + candidates[j].price) === remaining) {
        return [candidates[i].id, candidates[j].id];
      }
    }
  }
  return [];
};
const getInitialPaymentServiceIds = (row, services) => {
  const svcId = Number(row?.service_id || row?.service?.id || 0);
  if (Array.isArray(row?.service_ids) && row.service_ids.length) {
    const fromApi = Array.from(new Set(
      row.service_ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ));
    const mergedFromApi = Array.from(new Set([...(svcId ? [svcId] : []), ...fromApi]));
    const inferred = inferExtraServiceIdsFromAmount({
      primaryId: svcId,
      totalAmount: row?.amount,
      services,
    });
    return Array.from(new Set([...mergedFromApi, ...inferred]));
  }
  const extraNames = parseAdditionalServiceNames(row?.notes || '');
  const byExactName = extraNames
    .map((name) => services.find((s) => String(s.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase())?.id)
    .filter(Boolean)
    .map(Number)
    .filter((id) => id !== svcId);
  const fallbackExtraIds = byExactName.length
    ? []
    : inferExtraServiceIdsFromAmount({ primaryId: svcId, totalAmount: row?.amount, services });
  return Array.from(new Set([...(svcId ? [svcId] : []), ...byExactName, ...fallbackExtraIds]));
};
const STATUS_META = {
  pending:   { color:'#D97706', bg:'#FFFBEB', label:'Pending'   },
  confirmed: { color:'#2563EB', bg:'#EFF6FF', label:'Confirmed' },
  in_service:{ color:'#1D4ED8', bg:'#DBEAFE', label:'In Service' },
  completed: { color:'#059669', bg:'#ECFDF5', label:'Completed' },
  cancelled: { color:'#DC2626', bg:'#FEF2F2', label:'Cancelled' },
  no_show:   { color:'#64748B', bg:'#F8FAFC', label:'No Show'   },
};
const EMPTY = {
  branch_id: '',
  customer_id: '',
  customer_name: '',
  phone: '',
  service_id: '',
  staff_id: '',
  date: '',
  time: '',
  amount: '',
  notes: '',
  status: 'pending',
  is_recurring: false,
  recurrence_frequency: 'weekly',
  recurring_next_date: '',
  recurring_message_template_ids: [],
};
const LIMIT = 20;

function StatusBadge({ status, dark = false }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  const bg = dark ? `${m.color}22` : m.bg;
  const border = dark ? `${m.color}40` : 'transparent';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:bg, color:m.color, whiteSpace:'nowrap', border: `1px solid ${border}` }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:m.color, flexShrink:0 }} />
      {m.label}
    </span>
  );
}

function ApptSection({ title, desc, children, dark = false }) {
  const { C } = usePageTheme();
  return (
    <div style={{
      border: `1px solid ${dark ? '#334155' : C.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      background: dark ? '#0F172A' : C.cardBg,
    }}>
      <div style={{
        padding: '12px 16px',
        background: dark ? '#1E293B' : C.soft,
        borderBottom: `1px solid ${dark ? '#334155' : C.border}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#E2E8F0' : C.title }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: dark ? '#94A3B8' : C.muted, marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function ApptTableShell({ title, subtitle, children, footer, action }) {
  const { C } = usePageTheme();
  const showHeader = !!(title || subtitle || action);
  return (
    <div style={{ background: C.cardBg, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: C.shadow }}>
      {showHeader && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 12, flexWrap:'wrap', padding:'16px 20px', borderBottom:`1px solid ${C.border}`, background: C.headerGrad }}>
          <div>
            {title && <div style={{ fontSize: 15, fontWeight: 700, color: C.title }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: title ? 2 : 0 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
      {footer && (
        <div style={{ padding:'12px 20px', borderTop:`1px solid ${C.border}`, background: C.soft, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap: 8 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

export default function AppointmentsPage() {
  const { user }     = useAuth();
  const { isDark }   = useTheme();
  const { C }        = usePageTheme();
  const navigate     = useNavigate();
  const canEdit      = ['superadmin','admin','manager','staff'].includes(user?.role);
  const isSuperAdmin = user?.role === 'superadmin';
  const today        = new Date().toISOString().slice(0,10);

  const [appts, setAppts]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [branches, setBranches]   = useState([]);
  const [services, setServices]   = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterBranch, setFilterBranch] = useState(isSuperAdmin ? '' : user?.branch_id||'');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate]     = useState('');
  const [page, setPage]           = useState(1);
  const [showForm, setShowForm]       = useState(false);
  const [showDetail, setShowDetail]   = useState(false);
  const [editItem, setEditItem]       = useState(null);
  const [detailItem, setDetailItem]   = useState(null);
  const [form, setForm]               = useState(EMPTY);
  const [saving, setSaving]           = useState(false);
  const [formErr, setFormErr]         = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [showPayment, setShowPayment]     = useState(false);
  const [paymentAppt, setPaymentAppt]     = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentAmt, setPaymentAmt]       = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentErr, setPaymentErr]       = useState('');
  const [paymentOk, setPaymentOk]         = useState(false);
  const [paymentServices, setPaymentServices] = useState([]);
  const [paymentDiscountId, setPaymentDiscountId] = useState('');
  const [paymentDiscounts, setPaymentDiscounts] = useState([]);
  const [paymentRecurring, setPaymentRecurring] = useState(false);
  const [paymentRecurringDate, setPaymentRecurringDate] = useState(defaultRecurringNextDate());
  const [paymentRecurringTemplateIds, setPaymentRecurringTemplateIds] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [apptServiceIds, setApptServiceIds] = useState([]);
  /** Per-service staff/date/time for multi-booking (new appointment only). */
  const [serviceAssignments, setServiceAssignments] = useState({});
  const [serviceSearch, setServiceSearch] = useState('');
  const [multiBooking, setMultiBooking] = useState(false);
  const [collectAdvance, setCollectAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState('Cash');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [bookingCustPackages, setBookingCustPackages] = useState([]);
  const [bookingCustPackageId, setBookingCustPackageId] = useState('');
  const [bookingPackageTemplateId, setBookingPackageTemplateId] = useState('');
  const [loadingBookingPkgs, setLoadingBookingPkgs] = useState(false);
  const [packageSelectSaving, setPackageSelectSaving] = useState(false);
  const [packageTemplates, setPackageTemplates] = useState([]);
  const [paymentCustPackages, setPaymentCustPackages] = useState([]);
  const [paymentCustPackageId, setPaymentCustPackageId] = useState('');
  const [loadingPaymentPkgs, setLoadingPaymentPkgs] = useState(false);
  const [paymentMainStaffId, setPaymentMainStaffId] = useState('');
  const [paymentHelpers, setPaymentHelpers] = useState([]);
  const [apptPackageCache, setApptPackageCache] = useState({});
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  /** Per-service slots for multi-booking: { [serviceId]: string[] } */
  const [multiSlots, setMultiSlots] = useState({});
  const [multiSlotsLoading, setMultiSlotsLoading] = useState({});

  useEffect(() => {
    if (!canEdit) return;
    api.get('/notifications/templates/options', { params: { event_type: 'recurring_reminder' } })
      .then(({ data }) => setRecurringTemplates(Array.isArray(data?.options) ? data.options : []))
      .catch(() => setRecurringTemplates([]));
  }, [canEdit]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apR, brR, svR, stR, cuR] = await Promise.all([
        api.get('/appointments', { params:{ page, limit:LIMIT, ...(filterBranch?{branchId:filterBranch}:{}), ...(filterStatus?{status:filterStatus}:{}), ...(filterDate?{date:filterDate}:{}) } }),
        api.get('/branches',     { params:{ limit:100 } }),
        api.get('/services',     { params:{ limit:1000 } }),
        api.get('/staff',        { params:{ limit:200, ...(filterBranch?{branchId:filterBranch}:{}) } }),
        api.get('/customers',    { params:{ limit:500, ...(filterBranch?{branchId:filterBranch}:{}) } }),
      ]);
      const d = apR.data?.data ?? apR.data ?? [];
      const rows = Array.isArray(d) ? d : [];
      setAppts(rows);
      setTotal(apR.data?.total || 0);
      const pkgCustomerIds = [...new Set(
        rows
          .filter((r) => parsePackageSelection(r.notes || '').id && r.customer_id)
          .map((r) => r.customer_id),
      )];
      if (pkgCustomerIds.length) {
        Promise.all(
          pkgCustomerIds.map(async (cid) => {
            const pkgs = await fetchActiveCustomerPackages(api, cid);
            return [cid, pkgs];
          }),
        )
          .then((entries) => setApptPackageCache(Object.fromEntries(entries)))
          .catch(() => setApptPackageCache({}));
      } else {
        setApptPackageCache({});
      }
      setBranches(Array.isArray(brR.data) ? brR.data : (brR.data?.data??[]));
      setServices(Array.isArray(svR.data) ? svR.data : (svR.data?.data??[]));
      setStaffList(Array.isArray(stR.data) ? stR.data : (stR.data?.data??[]));
      setCustomers(Array.isArray(cuR.data) ? cuR.data : (cuR.data?.data??[]));
    } catch {}
    setLoading(false);
  }, [filterBranch, filterStatus, filterDate, page]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showForm) return;
    setCustomerLoading(true);
    api.get('/customers', { params: { limit: 500, ...(form.branch_id ? { branchId: form.branch_id } : {}) } })
      .then((r) => setCustomers(Array.isArray(r.data) ? r.data : (r.data?.data ?? [])))
      .catch(() => setCustomers([]))
      .finally(() => setCustomerLoading(false));
  }, [showForm, form.branch_id]);

  useEffect(() => {
    if (!showForm) return;
    const branchId = form.branch_id || user?.branch_id;
    fetchDiscountedPackageTemplates(api, branchId)
      .then(setPackageTemplates)
      .catch(() => setPackageTemplates([]));
  }, [showForm, form.branch_id, user?.branch_id]);

  const calcServiceTotal = (ids) => ids.reduce((sum, sid) => { const s = services.find(x => Number(x.id) === Number(sid)); return sum + Number(s?.price || 0); }, 0);
  const getBookingBundlePrice = () => {
    if (bookingCustPackageId) {
      return getPackageBundlePrice(bookingCustPackages.find((cp) => String(cp.id) === String(bookingCustPackageId)));
    }
    if (bookingPackageTemplateId) {
      return getPackageBundlePrice(packageTemplates.find((p) => String(p.id) === String(bookingPackageTemplateId)));
    }
    return 0;
  };
  const resolveBookingAmount = (serviceIds, packageTemplateId = bookingPackageTemplateId) => {
    if (packageTemplateId || bookingCustPackageId) {
      const bundle = getBookingBundlePrice();
      return bundle > 0 ? String(bundle) : '0';
    }
    const total = calcServiceTotal(serviceIds);
    return total > 0 ? String(total) : '';
  };
  const openPayment = async (row) => {
    setPaymentAppt(row);
    let sourceRow = row;
    try {
      // Use latest appointment data so payment modal always reflects saved services.
      const r = await api.get(`/appointments/${row.id}`);
      if (r?.data?.id) sourceRow = r.data;
    } catch { /* fallback to row data */ }
    setPaymentAppt(sourceRow);
    setPaymentRecurring(Boolean(sourceRow.is_recurring));
    setPaymentRecurringDate(
      sourceRow.recurring_next_date
      || defaultRecurringNextDate(sourceRow.date?.slice(0, 10)),
    );
    setPaymentRecurringTemplateIds(
      Array.isArray(sourceRow.recurring_message_template_ids)
        ? sourceRow.recurring_message_template_ids.map(String)
        : (sourceRow.recurring_message_template_id ? [String(sourceRow.recurring_message_template_id)] : []),
    );
    const ids = getInitialPaymentServiceIds(sourceRow, services);
    setPaymentServices(ids);
    setPaymentMethod('Cash');
    setPaymentDiscountId('');
    setPaymentErr('');
    setPaymentOk(false);
    setPaymentCustPackages([]);
    setPaymentCustPackageId('');
    setPaymentMainStaffId(String(sourceRow.staff_id || sourceRow.staff?.id || ''));
    setPaymentHelpers([]);
    const custId = sourceRow.customer_id || sourceRow.customer?.id;
    if (custId) {
      setLoadingPaymentPkgs(true);
      const pkgSel = parsePackageSelection(sourceRow.notes || '');
      fetchActiveCustomerPackages(api, custId)
        .then((pkgs) => {
          setPaymentCustPackages(pkgs);
          if (pkgSel.id && pkgs.find((p) => String(p.id) === String(pkgSel.id))) {
            applyPackageSelection({
              customerPackageId: String(pkgSel.id),
              customerPackages: pkgs,
              allServices: services,
              onServices: setPaymentServices,
              onPackageId: setPaymentCustPackageId,
              onMethod: setPaymentMethod,
              onAmount: setPaymentAmt,
            });
          }
        })
        .catch(() => {})
        .finally(() => setLoadingPaymentPkgs(false));
    }
    const bid = sourceRow.branch_id || sourceRow.branch?.id || user?.branch_id;
    if (bid) {
      try {
        const dr = await api.get('/discounts/payment', { params: { branchId: bid } });
        setPaymentDiscounts(Array.isArray(dr.data) ? dr.data : (dr.data?.data ?? []));
      } catch {
        setPaymentDiscounts([]);
      }
    } else {
      setPaymentDiscounts([]);
    }
    setShowPayment(true);
  };
  const togglePaymentService = (id) => {
    const nid = Number(id);
    setPaymentServices((prev) => {
      const next = prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid];
      return next;
    });
  };

  useEffect(() => {
    if (!showPayment || !paymentAppt) return;
    if (paymentMethod === 'Package' && paymentCustPackageId) {
      const cp = paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId));
      const bundle = getPackageBundlePrice(cp);
      const alreadyPaid = Number(paymentAppt.advance_paid || paymentAppt.amount_paid || 0);
      const due = Math.max(0, (bundle > 0 ? bundle : 0) - alreadyPaid);
      setPaymentAmt(String(due));
      return;
    }
    const gross = calcServiceTotal(paymentServices);
    const sel = paymentDiscountId
      ? paymentDiscounts.find((d) => String(d.id) === String(paymentDiscountId))
      : null;
    const promo = sel ? computePromoFromDiscount(sel, gross) : 0;
    const alreadyPaid = Number(paymentAppt.advance_paid || paymentAppt.amount_paid || 0);
    const net = Math.max(0, gross - promo - alreadyPaid);
    setPaymentAmt(net > 0 ? String(net) : (alreadyPaid > 0 ? '0' : ''));
  }, [showPayment, paymentAppt, paymentServices, paymentDiscountId, paymentDiscounts, services, paymentMethod, paymentCustPackageId]);
  const handlePayment = async () => {
    if (paymentAppt?.status !== 'in_service') {
      return setPaymentErr('Payment can be collected only when status is In Service.');
    }
    if (paymentMethod === 'Package') {
      if (!paymentCustPackageId) return setPaymentErr('Select a customer package.');
      const cp = paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId));
      if (!cp) return setPaymentErr('Selected package not found.');
      if (!packageCoversAllServices(paymentServices, cp)) {
        return setPaymentErr('All selected services must be included in the package.');
      }
    } else if (Number(paymentAmt) < 0 || paymentAmt === '' || paymentAmt == null) {
      return setPaymentErr('Amount is required');
    }
    const alreadyPaid = Number(paymentAppt.advance_paid || paymentAppt.amount_paid || 0);
    if (Number(paymentAmt) === 0 && !(alreadyPaid > 0) && paymentMethod !== 'Package') {
      return setPaymentErr('Amount is required');
    }
    if (!paymentServices.length) return setPaymentErr('At least one service is required');
    if (!paymentMainStaffId) return setPaymentErr('Select main staff.');
    const helperRows = helpersPayload(paymentHelpers);
    if (paymentHelpers.some((h) => !h.staff_id || !(Number(h.commission_value) > 0))) {
      return setPaymentErr('Each helper needs a staff member and commission value.');
    }
    if (paymentRecurring && !paymentRecurringDate) {
      return setPaymentErr('Select the next recurring appointment date.');
    }
    setPaymentSaving(true);
    try {
      const subtotal = paymentMethod === 'Package' && paymentCustPackageId
        ? getPackageBundlePrice(paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId)))
        : calcServiceTotal(paymentServices);
      const collectNow = Number(paymentAmt) || 0;
      const alreadyPaidAmt = Number(paymentAppt.advance_paid || 0);
      const settleAdvance = alreadyPaidAmt > 0;

      const mergePaymentSplits = (extras = []) => {
        const map = new Map();
        const push = (method, amount, extraFields = {}) => {
          const amt = Number(amount) || 0;
          if (!(amt > 0) && method !== 'Package') return;
          const key = `${method}:${extraFields.customer_package_id || ''}`;
          if (map.has(key)) map.get(key).amount += amt;
          else map.set(key, { method, amount: amt, ...extraFields });
        };
        for (const sp of (paymentAppt.advance_splits || [])) {
          push(
            sp.method,
            sp.amount,
            sp.customer_package_id ? { customer_package_id: Number(sp.customer_package_id) } : {},
          );
        }
        if (!(paymentAppt.advance_splits || []).length && alreadyPaidAmt > 0) {
          push('Cash', alreadyPaidAmt);
        }
        for (const sp of extras) {
          push(
            sp.method,
            sp.amount,
            sp.customer_package_id ? { customer_package_id: Number(sp.customer_package_id) } : {},
          );
        }
        return [...map.values()];
      };

      let splits = [];
      if (paymentMethod === 'Package' && paymentCustPackageId) {
        const pkgSplit = {
          method: 'Package',
          amount: collectNow || subtotal,
          customer_package_id: Number(paymentCustPackageId),
        };
        splits = settleAdvance ? mergePaymentSplits([pkgSplit]) : [pkgSplit];
      } else if (settleAdvance) {
        splits = mergePaymentSplits(collectNow > 0 ? [{ method: paymentMethod, amount: collectNow }] : []);
      } else if (collectNow > 0) {
        splits = [{ method: paymentMethod, amount: collectNow }];
      }

      if (splits.length) {
        await api.post('/payments', {
          branch_id: paymentAppt.branch_id || paymentAppt.branch?.id || user?.branch_id,
          staff_id: Number(paymentMainStaffId) || null,
          helpers: helperRows,
          customer_id: paymentAppt.customer_id || null,
          service_id: paymentServices[0] || null,
          service_ids: paymentServices,
          appointment_id: paymentAppt.id,
          customer_name: paymentAppt.customer_name,
          subtotal,
          loyalty_discount: 0,
          is_recurring: paymentRecurring,
          recurring_next_date: paymentRecurring ? paymentRecurringDate : null,
          recurring_message_template_ids: paymentRecurring ? paymentRecurringTemplateIds : [],
          replace_appointment_payments: settleAdvance,
          ...(paymentDiscountId ? { discount_id: Number(paymentDiscountId) } : {}),
          splits,
        });
      } else if (paymentRecurring) {
        // Advance already covers total — still allow completing + optional recurring seed via appointment update.
      }
      if (paymentAppt?.id) {
        const primaryId = Number(paymentServices[0] || 0);
        const extraNames = paymentServices
          .slice(1)
          .map((id) => services.find((s) => Number(s.id) === Number(id))?.name)
          .filter(Boolean);
        const updatedNotes = [
          stripAdditionalServicesLine(paymentAppt.notes || ''),
          extraNames.length ? `${APPT_EXTRA_SERVICES_PREFIX} ${extraNames.join(', ')}` : '',
        ].filter(Boolean).join('\n');
        await api.put(`/appointments/${paymentAppt.id}`, {
          service_id: primaryId || paymentAppt.service_id,
          service_ids: paymentServices,
          amount: paymentMethod === 'Package' && paymentCustPackageId
            ? getPackageBundlePrice(paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId)))
            : (subtotal || Number(paymentAppt.amount) || collectNow),
          customer_package_id: paymentMethod === 'Package' && paymentCustPackageId
            ? Number(paymentCustPackageId)
            : undefined,
          notes: updatedNotes,
          ...(paymentRecurring ? {
            is_recurring: true,
            recurring_next_date: paymentRecurringDate,
            recurring_message_template_ids: paymentRecurringTemplateIds,
          } : {}),
        });
        await api.patch(`/appointments/${paymentAppt.id}/status`, { status: 'completed' });
      }
      setPaymentOk(true);
      load();
      setTimeout(() => { setShowPayment(false); setPaymentOk(false); }, 1200);
    } catch (e) { setPaymentErr(e.response?.data?.message || 'Payment failed'); }
    setPaymentSaving(false);
  };

  const openAdd    = () => {
    setEditItem(null);
    setForm({ ...EMPTY, branch_id: user?.branch_id || '', date: today });
    setApptServiceIds([]);
    setServiceAssignments({});
    setServiceSearch('');
    setMultiBooking(false);
    setCollectAdvance(false);
    setAdvanceAmount('');
    setAdvanceMethod('Cash');
    setCustomerSearch('');
    setShowCustomerDrop(false);
    setFormErr('');
    setBookingCustPackages([]);
    setBookingCustPackageId('');
    setBookingPackageTemplateId('');
    setShowForm(true);
  };
  const openEdit   = row => {
    const sid = Number(row.service?.id || row.service_id || 0);
    const extraNames = parseAdditionalServiceNames(row.notes || '');
    const extraIds = extraNames
      .map(name => services.find(s => s.name === name)?.id)
      .filter(Boolean)
      .map(Number);
    const selectedIds = Array.from(new Set([...(sid ? [sid] : []), ...extraIds]));
    const totalAmount = selectedIds.reduce((sum, id) => {
      const s = services.find(x => Number(x.id) === Number(id));
      return sum + Number(s?.price || 0);
    }, 0);
    const pkgSel = parsePackageSelection(row.notes || '');
    setEditItem(row);
    setForm({
      ...row,
      customer_id: row.customer?.id || row.customer_id || '',
      service_id: row.service?.id || row.service_id,
      staff_id: row.staff?.id || row.staff_id,
      date: row.date?.slice(0,10) || '',
      amount: pkgSel.id ? String(row.amount ?? '') : (totalAmount || row.amount || ''),
      notes: stripPackageLine(stripAdditionalServicesLine(row.notes || '')),
      is_recurring: Boolean(row.is_recurring),
      recurrence_frequency: row.recurrence_frequency || 'weekly',
      recurring_next_date: row.recurring_next_date || defaultRecurringNextDate(row.date?.slice(0, 10)),
      recurring_message_template_ids: Array.isArray(row.recurring_message_template_ids)
        ? row.recurring_message_template_ids.map(String)
        : (row.recurring_message_template_id ? [String(row.recurring_message_template_id)] : []),
    });
    setApptServiceIds(selectedIds);
    setCustomerSearch(row.customer_name || '');
    setServiceSearch('');
    setBookingCustPackageId(pkgSel.id ? String(pkgSel.id) : '');
    setBookingPackageTemplateId('');
    setBookingCustPackages([]);
    const custId = row.customer?.id || row.customer_id;
    if (custId) {
      setLoadingBookingPkgs(true);
      fetchActiveCustomerPackages(api, custId)
        .then((pkgs) => {
          setBookingCustPackages(pkgs);
          if (pkgSel.id) {
            const cp = pkgs.find((p) => String(p.id) === String(pkgSel.id));
            if (cp) {
              setBookingPackageTemplateId(String(cp.package_id || cp.package?.id || ''));
              setForm((f) => ({ ...f, amount: String(getPackageBundlePrice(cp) || f.amount || '0') }));
            }
          }
        })
        .catch(() => setBookingCustPackages([]))
        .finally(() => setLoadingBookingPkgs(false));
    }
    setShowCustomerDrop(false);
    setFormErr('');
    setShowForm(true);
  };
  const openDetail = row => { setDetailItem(row); setShowDetail(true); };

  const handleSave = async () => {
    if (!form.customer_name || !apptServiceIds.length) {
      return setFormErr('Customer and at least one service are required');
    }

    // New booking
    if (!editItem) {
      const advanceNum = Number(advanceAmount);
      if (collectAdvance && (!(advanceNum > 0) || !Number.isFinite(advanceNum))) {
        return setFormErr('Enter a valid advance payment amount');
      }
      const bookingTotal = Number(bookingUsesPackage ? getBookingBundlePrice() : calcServiceTotal(apptServiceIds)) || 0;
      if (collectAdvance && bookingTotal > 0 && advanceNum > bookingTotal) {
        return setFormErr(`Advance cannot exceed booking total (Rs. ${bookingTotal.toLocaleString()})`);
      }

      const usesPackage = !!(bookingPackageTemplateId || bookingCustPackageId);
      const pkgLine = bookingCustPackageId
        ? buildPackageNoteLine(
          bookingCustPackageId,
          bookingCustPackages.find((cp) => String(cp.id) === String(bookingCustPackageId))?.package?.name,
        )
        : '';

      // Multi-booking: each service has its own staff + time
      if (multiBooking) {
        const missing = apptServiceIds.find((id) => {
          const a = serviceAssignments[String(id)] || {};
          return !a.date || !a.time;
        });
        if (missing) {
          const svc = services.find((s) => Number(s.id) === Number(missing));
          return setFormErr(`Set date and time for ${svc?.name || 'each service'}`);
        }
        setSaving(true);
        try {
          const notes = [
            stripPackageLine(stripAdditionalServicesLine(form.notes || '')),
            pkgLine,
          ].filter(Boolean).join('\n');
          const items = apptServiceIds.map((id) => {
            const a = serviceAssignments[String(id)] || {};
            return {
              service_id: Number(id),
              staff_id: a.staff_id || null,
              date: a.date,
              time: a.time,
            };
          });
          const payload = {
            branch_id: form.branch_id || user?.branch_id,
            customer_id: form.customer_id || null,
            customer_name: form.customer_name,
            phone: form.phone || '',
            notes,
            status: form.status || 'pending',
            customer_package_id: usesPackage ? Number(bookingCustPackageId) || undefined : undefined,
            amount: Number(usesPackage ? getBookingBundlePrice() : 0) || undefined,
            is_recurring: !!form.is_recurring,
            recurrence_frequency: form.is_recurring ? (form.recurrence_frequency || 'weekly') : null,
            recurring_next_date: form.is_recurring ? (form.recurring_next_date || null) : null,
            recurring_message_template_ids: form.is_recurring
              ? (form.recurring_message_template_ids || [])
              : null,
            recurring_message_template_id: null,
            items,
            ...(collectAdvance && advanceNum > 0
              ? { advance_amount: advanceNum, advance_method: advanceMethod }
              : {}),
          };
          await api.post('/appointments', payload);
          setShowForm(false);
          load();
        } catch (e) {
          setFormErr(e.response?.data?.message || 'Save failed');
        }
        setSaving(false);
        return;
      }

      // Default single booking: one staff + one time for all selected services
      if (!form.date || !form.time) return setFormErr('Customer, service, date and time are required');
      setSaving(true);
      try {
        const selectedSvcs = services.filter((s) => apptServiceIds.includes(Number(s.id)));
        const [primary, ...extras] = selectedSvcs;
        const extraNote = extras.length ? `${APPT_EXTRA_SERVICES_PREFIX} ${extras.map((s) => s.name).join(', ')}` : '';
        const payload = {
          branch_id: form.branch_id || user?.branch_id,
          customer_id: form.customer_id || null,
          customer_name: form.customer_name,
          phone: form.phone || '',
          staff_id: form.staff_id || null,
          date: form.date,
          time: form.time,
          status: form.status || 'pending',
          service_id: primary?.id || form.service_id,
          service_ids: apptServiceIds,
          customer_package_id: usesPackage ? Number(bookingCustPackageId) || undefined : undefined,
          amount: Number(usesPackage ? getBookingBundlePrice() : (selectedSvcs.reduce((sum, s) => sum + Number(s.price || 0), 0) || form.amount || 0)),
          notes: [
            stripPackageLine(stripAdditionalServicesLine(form.notes || '')),
            pkgLine,
            extraNote,
          ].filter(Boolean).join('\n'),
          is_recurring: !!form.is_recurring,
          recurrence_frequency: form.is_recurring ? (form.recurrence_frequency || 'weekly') : null,
          recurring_next_date: form.is_recurring ? (form.recurring_next_date || null) : null,
          recurring_message_template_ids: form.is_recurring
            ? (form.recurring_message_template_ids || [])
            : null,
          recurring_message_template_id: null,
          ...(collectAdvance && advanceNum > 0
            ? { advance_amount: advanceNum, advance_method: advanceMethod }
            : {}),
        };
        await api.post('/appointments', payload);
        setShowForm(false);
        load();
      } catch (e) {
        setFormErr(e.response?.data?.message || 'Save failed');
      }
      setSaving(false);
      return;
    }

    if (!form.date || !form.time) return setFormErr('Customer, service, date and time are required');
    setSaving(true);
    try {
      const selectedSvcs = services.filter(s => apptServiceIds.includes(Number(s.id)));
      const [primary, ...extras] = selectedSvcs;
      const extraNote = extras.length ? `${APPT_EXTRA_SERVICES_PREFIX} ${extras.map(s => s.name).join(', ')}` : '';
      const usesPackage = !!(bookingPackageTemplateId || bookingCustPackageId);
      const pkgLine = bookingCustPackageId
        ? buildPackageNoteLine(
          bookingCustPackageId,
          bookingCustPackages.find((cp) => String(cp.id) === String(bookingCustPackageId))?.package?.name,
        )
        : '';
      const payload = {
        ...form,
        service_id: primary?.id || form.service_id,
        service_ids: apptServiceIds,
        customer_package_id: usesPackage ? Number(bookingCustPackageId) || undefined : undefined,
        amount: Number(usesPackage ? getBookingBundlePrice() : (selectedSvcs.reduce((sum, s) => sum + Number(s.price || 0), 0) || form.amount || 0)),
        notes: [
          stripPackageLine(stripAdditionalServicesLine(form.notes || '')),
          pkgLine,
          extraNote,
        ].filter(Boolean).join('\n'),
      };
      if (!payload.is_recurring) {
        payload.recurrence_frequency = null;
        payload.recurring_message_template_id = null;
        payload.recurring_message_template_ids = null;
      } else {
        payload.recurring_message_template_id = null;
      }
      await api.put(`/appointments/${editItem.id}`, payload);
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message||'Save failed'); }
    setSaving(false);
  };
  const handleStatusChange = async (id, status) => { await api.patch(`/appointments/${id}/status`, { status }); load(); };
  const confirmDelete = id => setDeleteId(id);
  const handleDelete = async () => {
    if (!deleteId) return;
    try { await api.delete(`/appointments/${deleteId}`); } catch {}
    setDeleteId(null); load();
  };

  const updateServiceAssignment = (serviceId, patch) => {
    const key = String(serviceId);
    setServiceAssignments((prev) => ({
      ...prev,
      [key]: { staff_id: '', date: form.date || today, time: '', ...(prev[key] || {}), ...patch },
    }));
  };

  const bookingDurationMinutes = useMemo(() => {
    const selected = services.filter((s) => apptServiceIds.includes(Number(s.id)));
    const sum = selected.reduce((acc, s) => acc + (Number(s.duration_minutes) || 0), 0);
    return sum > 0 ? sum : 30;
  }, [services, apptServiceIds]);

  const fetchSlots = useCallback(async ({ staffId, date, duration }) => {
    if (!staffId || !date) return [];
    try {
      const { data } = await api.get('/appointments/availability', {
        params: {
          staffId,
          date,
          duration: Math.max(5, Number(duration) || 30),
        },
      });
      if (Array.isArray(data?.slots)) return data.slots;
      if (Array.isArray(data)) return data;
      return [];
    } catch {
      return [];
    }
  }, []);

  // Single-booking available slots (sum of selected service durations)
  useEffect(() => {
    if (!showForm || multiBooking) {
      setAvailableSlots([]);
      return;
    }
    if (!form.staff_id || !form.date) {
      setAvailableSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    fetchSlots({ staffId: form.staff_id, date: form.date, duration: bookingDurationMinutes })
      .then((slots) => {
        if (cancelled) return;
        setAvailableSlots(slots);
        if (form.time && !slots.includes(form.time)) {
          setForm((f) => ({ ...f, time: '' }));
        }
      })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [showForm, multiBooking, form.staff_id, form.date, bookingDurationMinutes, fetchSlots]);

  // Multi-booking: load slots per service when staff/date change
  const multiSlotDeps = useMemo(
    () => Object.entries(serviceAssignments)
      .map(([sid, a]) => `${sid}:${a?.staff_id || ''}:${a?.date || ''}`)
      .sort()
      .join('|'),
    [serviceAssignments],
  );

  useEffect(() => {
    if (!showForm || !multiBooking) {
      setMultiSlots({});
      setMultiSlotsLoading({});
      return;
    }
    let cancelled = false;
    const run = async () => {
      const nextSlots = {};
      const nextLoading = {};
      const entries = Object.entries(serviceAssignments);
      await Promise.all(entries.map(async ([sid, a]) => {
        if (!a?.staff_id || !a?.date) return;
        nextLoading[sid] = true;
        const svc = services.find((s) => Number(s.id) === Number(sid));
        const duration = Number(svc?.duration_minutes) || 30;
        nextSlots[sid] = await fetchSlots({ staffId: a.staff_id, date: a.date, duration });
        nextLoading[sid] = false;
      }));
      if (cancelled) return;
      setMultiSlots(nextSlots);
      setMultiSlotsLoading(nextLoading);
      setServiceAssignments((prev) => {
        let changed = false;
        const out = { ...prev };
        Object.entries(nextSlots).forEach(([sid, slots]) => {
          if (out[sid]?.time && Array.isArray(slots) && !slots.includes(out[sid].time)) {
            out[sid] = { ...out[sid], time: '' };
            changed = true;
          }
        });
        return changed ? out : prev;
      });
    };
    run();
    return () => { cancelled = true; };
  }, [showForm, multiBooking, multiSlotDeps, services, fetchSlots]);

  const renderSlotChips = ({ slots, loading, value, onPick, durationLabel, isDarkMode }) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#94A3B8' : '#64748B', marginBottom: 6 }}>
        Available slots{durationLabel ? ` · ${durationLabel}` : ''}
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: isDarkMode ? '#94A3B8' : '#64748B' }}>Loading slots…</div>
      ) : !slots.length ? (
        <div style={{ fontSize: 12, color: '#D97706' }}>
          No free slots for this staff/date. Pick another staff or day, or enter a time manually below.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {slots.map((t) => {
            const active = value === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onPick(t)}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${active ? '#2563EB' : (isDarkMode ? '#334155' : '#E4E7EC')}`,
                  background: active ? (isDarkMode ? 'rgba(37,99,235,0.25)' : '#EFF6FF') : (isDarkMode ? '#0B1220' : '#fff'),
                  color: active ? '#2563EB' : (isDarkMode ? '#E2E8F0' : '#344054'),
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const toggleApptService = (id) => {
    const nid = Number(id);
    setApptServiceIds(prev => {
      const next = prev.includes(nid) ? prev.filter(x => x !== nid) : [...prev, nid];
      setForm(f => ({
        ...f,
        service_id: next[0] || '',
        amount: resolveBookingAmount(next),
      }));
      setServiceAssignments((prevAssign) => {
        const out = { ...prevAssign };
        if (!next.includes(nid)) {
          delete out[String(nid)];
        } else if (!out[String(nid)]) {
          out[String(nid)] = {
            staff_id: form.staff_id || '',
            date: form.date || today,
            time: form.time || '',
          };
        }
        // Drop removed services
        Object.keys(out).forEach((k) => {
          if (!next.includes(Number(k))) delete out[k];
        });
        return out;
      });
      return next;
    });
  };
  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    return c.name?.toLowerCase().includes(q) || c.phone?.includes(q);
  });
  const selectCustomer = (c) => {
    setForm(f => ({ ...f, customer_id: c.id, customer_name: c.name || '', phone: c.phone || f.phone }));
    setCustomerSearch(c.name || '');
    setShowCustomerDrop(false);
    setBookingCustPackageId('');
    setBookingPackageTemplateId('');
    setBookingCustPackages([]);
    if (c.id) {
      setLoadingBookingPkgs(true);
      fetchActiveCustomerPackages(api, c.id)
        .then(setBookingCustPackages)
        .catch(() => setBookingCustPackages([]))
        .finally(() => setLoadingBookingPkgs(false));
    }
  };
  const applyBookingPackageTemplate = async (templateId) => {
    setBookingPackageTemplateId(templateId);
    if (!templateId) {
      setBookingCustPackageId('');
      setForm((f) => ({ ...f, amount: resolveBookingAmount(apptServiceIds, '') }));
      return;
    }
    const tpl = packageTemplates.find((p) => String(p.id) === String(templateId));
    if (!tpl) return;
    const nextIds = resolveTemplateServiceIds(tpl, services);
    if (nextIds.length) {
      setApptServiceIds(nextIds);
      setServiceAssignments((prev) => {
        const out = {};
        nextIds.forEach((id) => {
          out[String(id)] = prev[String(id)] || {
            staff_id: form.staff_id || '',
            date: form.date || today,
            time: form.time || '',
          };
        });
        return out;
      });
      setForm((f) => ({
        ...f,
        service_id: nextIds[0] || '',
        amount: String(getPackageBundlePrice(tpl) || '0'),
      }));
    } else {
      setForm((f) => ({ ...f, amount: String(getPackageBundlePrice(tpl) || '0') }));
    }
    if (!form.customer_id) return;
    const existing = findCustomerPackageForTemplate(bookingCustPackages, templateId);
    if (existing?.id) {
      setBookingCustPackageId(String(existing.id));
      return;
    }
    setPackageSelectSaving(true);
    setFormErr('');
    try {
      const cp = await ensureCustomerPackageForTemplate(api, {
        customerId: form.customer_id,
        templateId,
        branchId: form.branch_id || user?.branch_id,
      });
      if (cp?.id) {
        setBookingCustPackageId(String(cp.id));
        const pkgs = await fetchActiveCustomerPackages(api, form.customer_id);
        setBookingCustPackages(pkgs);
      }
    } catch (e) {
      setFormErr(e.response?.data?.message || 'Failed to link package to customer.');
      setBookingPackageTemplateId('');
      setBookingCustPackageId('');
    } finally {
      setPackageSelectSaving(false);
    }
  };
  const applyPaymentPackage = (customerPackageId) => {
    if (!customerPackageId) {
      setPaymentCustPackageId('');
      setPaymentMethod('Cash');
      return;
    }
    applyPackageSelection({
      customerPackageId,
      customerPackages: paymentCustPackages,
      allServices: services,
      onServices: setPaymentServices,
      onPackageId: setPaymentCustPackageId,
      onMethod: setPaymentMethod,
      onAmount: setPaymentAmt,
    });
    setPaymentDiscountId('');
  };

  const filteredStaff = form.branch_id ? staffList.filter(s => s.branch_id==form.branch_id) : staffList;
  const counts = APPT_STATUSES.reduce((acc,s) => { acc[s]=appts.filter(a=>a.status===s).length; return acc; }, {});
  const totalPages = Math.ceil(total / LIMIT);

  const bookingUsesPackage = !!(bookingPackageTemplateId || bookingCustPackageId);
  const bookingBundlePrice = getBookingBundlePrice();
  const paymentListTotal = calcServiceTotal(paymentServices);
  const paymentSelectedCp = paymentCustPackageId
    ? paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId))
    : null;
  const paymentBundlePrice = getPackageBundlePrice(paymentSelectedCp);
  const paymentUsesPackage = paymentMethod === 'Package' && !!paymentCustPackageId;

  const apptColumns = useMemo(() => [
    {
      id: 'customer_name',
      accessorFn: (r) => [r.customer_name, r.phone, getAllServiceNamesForAppt(r).join(' '), r.staff?.name].filter(Boolean).join(' '),
      header: 'Customer',
      meta: { width: '20%' },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <>
            <div style={{ fontWeight: 600, color: C.title, fontSize: 14 }}>{r.customer_name}</div>
            {r.phone && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{r.phone}</div>}
          </>
        );
      },
    },
    {
      id: 'services',
      accessorFn: (r) => getAllServiceNamesForAppt(r).join(', '),
      header: 'Service',
      meta: { width: '16%' },
      cell: ({ getValue }) => (
        <span style={{ background: isDark ? '#1E293B' : C.soft, padding: '3px 9px', borderRadius: 6, fontSize: 13, fontWeight: 500, color: C.label, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getValue()}
        </span>
      ),
    },
    {
      id: 'staff',
      accessorFn: (r) => r.staff?.name || '',
      header: 'Staff',
      meta: { width: '14%' },
      cell: ({ row }) => {
        const r = row.original;
        return r.staff?.name ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <StaffAvatar name={r.staff.name} size={32} />
            <span style={{ fontSize: 13, fontWeight: 500, color: C.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.staff.name}</span>
          </div>
        ) : <span style={{ fontSize: 13, color: C.muted }}>—</span>;
      },
    },
    {
      id: 'date',
      accessorFn: (r) => `${r.date || ''} ${r.time || ''}`,
      header: 'Date & Time',
      meta: { width: '14%' },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <>
            <div style={{ fontWeight: 600, color: C.title, fontSize: 13 }}>
              {r.date ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
            </div>
            {r.time && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{r.time}</div>}
          </>
        );
      },
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      meta: { width: '11%', align: 'right' },
      cell: ({ row }) => {
        const pkgs = apptPackageCache[row.original.customer_id] || [];
        const bill = resolveAppointmentAmountDisplay(row.original, { services, customerPackages: pkgs });
        const paid = Number(row.original.advance_paid || row.original.amount_paid || 0);
        return (
          <div style={{ textAlign: 'right' }}>
            {bill.listTotal != null && bill.isPackage && (
              <div style={{ fontSize: 11, color: '#94A3B8', textDecoration: 'line-through' }}>
                List Rs. {bill.listTotal.toLocaleString()}
              </div>
            )}
            <span style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>
              {bill.primary}
            </span>
            {bill.isPackage && (
              <div style={{ fontSize: 10, fontWeight: 700, color: '#047857', marginTop: 2 }}>Package</div>
            )}
            {paid > 0 && row.original.status !== 'completed' && (
              <div style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', marginTop: 2 }}>
                Advance Rs. {paid.toLocaleString()}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      meta: { width: '13%' },
      cell: ({ row }) => {
        const r = row.original;
        const s = r.status;
        const meta = STATUS_META[s] ?? STATUS_META.pending;
        if (!canEdit || s === 'completed' || s === 'cancelled') return <StatusBadge status={s} dark={isDark} />;
        return (
          <select value={s} onChange={(e) => handleStatusChange(r.id, e.target.value)}
            style={{
              padding: '4px 10px', borderRadius: 20, maxWidth: '100%',
              border: `1.5px solid ${meta.color}40`,
              background: isDark ? `${meta.color}22` : meta.bg,
              color: meta.color, fontWeight: 700, fontSize: 12,
              fontFamily: "'Inter',sans-serif", outline: 'none', cursor: 'pointer',
            }}>
            {APPT_STATUSES.filter((st) => st !== 'completed').map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
          </select>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { width: '10%', align: 'center' },
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const s = r.status;
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <ActionBtn onClick={() => openDetail(r)} title="View" color="#2563EB"><IconEye /></ActionBtn>
            {canEdit && s === 'in_service' && <ActionBtn onClick={() => openPayment(r)} title="Collect Payment" color="#059669"><IconMoney /></ActionBtn>}
            {canEdit && <ActionBtn onClick={() => openEdit(r)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>}
            {canEdit && <ActionBtn onClick={() => confirmDelete(r.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>}
          </div>
        );
      },
    },
  ], [canEdit, isDark, C, services, apptPackageCache]);

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const activeFilterLabel = filterStatus
    ? STATUS_META[filterStatus]?.label
    : filterDate
      ? (filterDate === today ? 'Today' : filterDate === tomorrow ? 'Tomorrow' : filterDate)
      : 'All statuses';

  return (
    <PageWrapper
      title="Appointments"
      subtitle={`Manage bookings · ${total.toLocaleString()} total · ${activeFilterLabel}`}
      actions={canEdit && (
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <Button variant="secondary" onClick={() => navigate('/calendar')} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <IconCalendar /> Calendar
          </Button>
          <Button variant="primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <IconPlus /> New Appointment
          </Button>
        </div>
      )}
    >

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <StatCard label="Total" value={total.toLocaleString()} color={SC.primary} icon={<IconCalendar />} />
        <StatCard label="Pending" value={counts.pending || 0} color={SC.warning} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        <StatCard label="Confirmed" value={counts.confirmed || 0} color={SC.primary} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
        <StatCard label="In Service" value={counts.in_service || 0} color={SC.purple} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>} />
        <StatCard label="Completed" value={counts.completed || 0} color={SC.success} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>} />
      </div>

      {/* Filters */}
      <FilterBar>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {[{ val: '', label: 'All' }, ...APPT_STATUSES.map((s) => ({ val: s, label: STATUS_META[s].label }))].map(({ val, label }) => {
            const active = filterStatus === val;
            const meta = val ? STATUS_META[val] : null;
            const cnt = val ? counts[val] : appts.length;
            return (
              <button
                key={val || 'all'}
                type="button"
                onClick={() => { setFilterStatus(val); setPage(1); }}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer',
                  borderColor: active ? (meta?.color ?? SC.primary) : (isDark ? '#334155' : C.border),
                  background: active
                    ? (isDark ? (meta ? `${meta.color}22` : 'rgba(37,99,235,0.2)') : (meta?.bg ?? '#EFF6FF'))
                    : (isDark ? '#0F172A' : C.cardBg),
                  color: active ? (meta?.color ?? SC.primary) : C.muted,
                  fontWeight: active ? 700 : 500, fontSize: 12, fontFamily: "'Inter',sans-serif", whiteSpace: 'nowrap',
                }}
              >
                {label}{cnt > 0 ? <span style={{ marginLeft: 5, opacity: 0.7 }}>({cnt})</span> : ''}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: 'Today', value: today },
            { label: 'Tomorrow', value: tomorrow },
            { label: 'All dates', value: '' },
          ].map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => { setFilterDate(value); setPage(1); }}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: filterDate === value ? 700 : 500,
                border: `1.5px solid ${filterDate === value ? SC.primary : (isDark ? '#334155' : C.border)}`,
                background: filterDate === value ? (isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF') : (isDark ? '#0F172A' : C.soft),
                color: filterDate === value ? SC.primary : C.muted, cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
          <input type="date" value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setPage(1); }} className="pk-filter-control" style={{ width: 145 }} />
          {isSuperAdmin && (
            <select value={filterBranch} onChange={(e) => { setFilterBranch(e.target.value); setPage(1); }} className="pk-filter-control" style={{ minWidth: 140 }}>
              <option value="">All Branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
      </FilterBar>

      {/* Table */}
      <ApptTableShell
        title="Appointments"
        subtitle={loading ? 'Loading…' : `${appts.length} shown · ${total.toLocaleString()} total`}
        footer={(
          <>
            <span style={{ fontSize:12, color: C.muted }}>Showing {appts.length} of {total}</span>
            {totalPages > 1 && (
              <div style={{ display:'flex', gap:4 }}>
                <PagBtn onClick={() => setPage(1)} disabled={page === 1} label="«" />
                <PagBtn onClick={() => setPage((p) => p - 1)} disabled={page === 1} label="‹" />
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return <PagBtn key={p} onClick={() => setPage(p)} active={p === page} label={p} />;
                })}
                <PagBtn onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} label="›" />
                <PagBtn onClick={() => setPage(totalPages)} disabled={page === totalPages} label="»" />
              </div>
            )}
          </>
        )}
      >
        <div style={{ padding: '0 4px 4px' }}>
          <DataTable
            noShell
            compact
            columns={apptColumns}
            data={appts}
            loading={loading}
            emptyMessage="No appointments found"
            emptySub="Try adjusting your filters or book a new appointment"
            pagination={false}
            showRowNumbers={false}
            enableColumnVisibility={false}
            searchableColumns={[{ id: 'customer_name', title: 'Appointments', placeholder: 'Search customer, service, staff…' }]}
          />
        </div>
      </ApptTableShell>

      {/* New / Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? 'Edit Appointment' : 'New Appointment'}
        width={860}
        footer={(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B' }}>
              {apptServiceIds.length > 0 ? (
                <span style={{ fontWeight: 800, color: bookingUsesPackage ? '#047857' : '#059669' }}>
                  {(() => {
                    const total = bookingUsesPackage
                      ? Number(bookingBundlePrice || 0)
                      : Number(form.amount || 0);
                    const adv = (!editItem && collectAdvance && Number(advanceAmount) > 0) ? Number(advanceAmount) : 0;
                    const remain = Math.max(0, total - adv);
                    if (adv > 0) {
                      return `Remain Rs. ${remain.toLocaleString()}`;
                    }
                    return bookingUsesPackage
                      ? formatPackageBillAmount(bookingBundlePrice)
                      : `Rs. ${total.toLocaleString()}`;
                  })()}
                  <span style={{ fontWeight: 500, color: isDark ? '#94A3B8' : '#64748B', marginLeft: 8 }}>
                    · {apptServiceIds.length} service{apptServiceIds.length !== 1 ? 's' : ''}
                    {bookingUsesPackage ? ' · Package' : ''}
                    {!editItem && collectAdvance && Number(advanceAmount) > 0
                      ? ` · Advance Rs. ${Number(advanceAmount).toLocaleString()}`
                      : ''}
                    {!editItem && multiBooking && apptServiceIds.length > 1 ? ' · separate bookings' : ''}
                    {editItem && form.date && form.time ? ` · ${form.date} ${form.time}` : ''}
                    {!editItem && !multiBooking && form.date && form.time ? ` · ${form.date} ${form.time}` : ''}
                    {!editItem && multiBooking && apptServiceIds.length === 1 && serviceAssignments[String(apptServiceIds[0])]?.date
                      ? ` · ${serviceAssignments[String(apptServiceIds[0])].date} ${serviceAssignments[String(apptServiceIds[0])].time || ''}`
                      : ''}
                  </span>
                </span>
              ) : (
                <span>Select at least one service</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" loading={saving} onClick={handleSave}>
                {editItem
                  ? 'Save Changes'
                  : (multiBooking && apptServiceIds.length > 1
                    ? `Create ${apptServiceIds.length} Bookings`
                    : 'Create Appointment')}
              </Button>
            </div>
          </div>
        )}
      >
        {formErr && (
          <div style={{
            background: isDark ? '#450A0A' : '#FEF2F2', color: isDark ? '#FCA5A5' : '#DC2626', padding: '10px 14px', borderRadius: 10,
            marginBottom: 16, fontSize: 13, border: `1px solid ${isDark ? '#7F1D1D' : '#FEE2E2'}`, fontWeight: 500,
          }}>
            {formErr}
          </div>
        )}
        <p style={{ margin: '0 0 16px', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
          {editItem
            ? 'Update booking details, services, and schedule.'
            : 'Book a customer — select services, staff, and time. Tick Multiple bookings to assign different staff/time per service.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ApptSection title="Customer" desc="Search existing customer or enter walk-in details" dark={isDark}>
              {form.customer_id && form.customer_name ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  border: '1px solid #86EFAC', background: isDark ? '#052e16' : '#ECFDF3',
                  borderRadius: 12, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', background: '#16A34A', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0,
                    }}>
                      {form.customer_name?.charAt(0)?.toUpperCase() || 'C'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? '#BBF7D0' : '#065F46', lineHeight: 1.2 }}>{form.customer_name}</div>
                      {form.phone && <div style={{ fontSize: 12, color: isDark ? '#86EFAC' : '#047857', marginTop: 2 }}>{form.phone}</div>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setForm((f) => ({ ...f, customer_id: '', customer_name: '', phone: '' }));
                      setCustomerSearch('');
                      setBookingCustPackages([]);
                      setBookingCustPackageId('');
                      setBookingPackageTemplateId('');
                      setShowCustomerDrop(true);
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Input
                    value={customerSearch}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerSearch(v);
                      setForm((f) => ({ ...f, customer_id: '', customer_name: v }));
                      setBookingCustPackages([]);
                      setBookingCustPackageId('');
                      setBookingPackageTemplateId('');
                      setShowCustomerDrop(true);
                    }}
                    onFocus={() => setShowCustomerDrop(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDrop(false), 200)}
                    placeholder={customerLoading ? 'Loading customers…' : 'Search by name or phone…'}
                  />
                  {showCustomerDrop && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30,
                      background: isDark ? '#1E293B' : '#fff',
                      border: `1.5px solid ${isDark ? '#475569' : '#E4E7EC'}`,
                      borderRadius: 12, boxShadow: '0 12px 32px rgba(16,24,40,0.14)',
                      maxHeight: 240, overflowY: 'auto',
                    }}>
                      {customerLoading ? (
                        <div style={{ padding: '12px 14px', fontSize: 12, color: '#98A2B3' }}>Loading…</div>
                      ) : filteredCustomers.length === 0 ? (
                        <div style={{ padding: '14px', fontSize: 12, color: '#98A2B3', textAlign: 'center' }}>
                          No customer found — name will be saved as walk-in
                        </div>
                      ) : (
                        filteredCustomers.slice(0, 80).map((c) => (
                          <div
                            key={c.id}
                            onMouseDown={() => selectCustomer(c)}
                            style={{
                              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                              borderBottom: `1px solid ${isDark ? '#334155' : '#F2F4F7'}`,
                            }}
                          >
                            <div style={{
                              width: 34, height: 34, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB',
                              fontWeight: 700, fontSize: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {c.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#E2E8F0' : '#101828' }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: '#98A2B3' }}>{c.phone || 'No phone'}</div>
                            </div>
                            {c.loyalty_points > 0 && (
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#FEF9C3', color: '#854D0E', fontWeight: 700 }}>
                                ★ {c.loyalty_points}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, flexShrink: 0 }}>Select →</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {!form.customer_id && (
                <div style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginTop: 6 }}>
                  Select customer from list to use their package bundle
                </div>
              )}

              <FormGroup label="Phone">
                <Input value={form.phone || ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="07X XXX XXXX" />
              </FormGroup>

              {form.customer_id && (
                <FormGroup label="Package">
                  {(loadingBookingPkgs || packageSelectSaving) && !packageTemplates.length ? (
                    <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', padding: '4px 0' }}>
                      {packageSelectSaving ? 'Linking package…' : 'Loading packages…'}
                    </div>
                  ) : packageTemplates.length > 0 ? (
                    <Select
                      value={bookingPackageTemplateId}
                      onChange={(e) => applyBookingPackageTemplate(e.target.value)}
                      disabled={packageSelectSaving}
                    >
                      <option value="">No package — pay normally</option>
                      {packageTemplates.map((p) => (
                        <option key={p.id} value={p.id}>{formatPackageTemplateLabel(p)}</option>
                      ))}
                    </Select>
                  ) : (
                    <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', padding: '4px 0' }}>
                      No packages available — create a package with a bundle price first.
                    </div>
                  )}
                  {bookingUsesPackage && !packageSelectSaving && (
                    <div style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857', marginTop: 6, fontWeight: 600 }}>
                      {formatPackageAppliedMessage(bookingBundlePrice)}
                    </div>
                  )}
                </FormGroup>
              )}
            </ApptSection>

            <ApptSection title="Services" desc={editItem ? 'Select one or more — first service is primary' : 'Select one or more services'} dark={isDark}>
              {!editItem && (
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 12,
                  border: `1px solid ${multiBooking ? '#86EFAC' : (isDark ? '#334155' : '#E2E8F0')}`,
                  background: multiBooking ? (isDark ? '#052e16' : '#F0FDF4') : (isDark ? '#0F172A' : '#F8FAFC'),
                }}>
                  <input
                    type="checkbox"
                    checked={multiBooking}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setMultiBooking(on);
                      if (on) {
                        setServiceAssignments((prev) => {
                          const out = { ...prev };
                          apptServiceIds.forEach((id) => {
                            if (!out[String(id)]) {
                              out[String(id)] = {
                                staff_id: form.staff_id || '',
                                date: form.date || today,
                                time: form.time || '',
                              };
                            }
                          });
                          return out;
                        });
                      }
                    }}
                    style={{ width: 16, height: 16, marginTop: 2, accentColor: '#059669' }}
                  />
                  <span>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#E2E8F0' : '#0F172A' }}>
                      Multiple bookings
                    </div>
                    <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>
                      Tick to assign a different staff member and time for each service
                    </div>
                  </span>
                </label>
              )}
              <Input
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="Search services by name or category…"
              />
              <div style={{
                border: `1px solid ${isDark ? '#334155' : '#DCE6F3'}`,
                borderRadius: 12, overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
                background: isDark ? '#0F172A' : '#fff',
              }}>
                {(() => {
                  const q = serviceSearch.trim().toLowerCase();
                  const filtered = services.filter((s) => {
                    if (s.is_active === false) return false;
                    if (!q) return true;
                    const hay = `${s.name || ''} ${s.category || ''} ${s.subcategory || ''}`.toLowerCase();
                    return hay.includes(q);
                  });
                  if (!filtered.length) {
                    return (
                      <div style={{ padding: '14px', fontSize: 12, color: '#98A2B3', textAlign: 'center' }}>
                        {q ? `No services match “${serviceSearch.trim()}”` : 'No active services'}
                      </div>
                    );
                  }
                  return filtered.map((s, idx, arr) => {
                    const active = apptServiceIds.includes(Number(s.id));
                    return (
                      <label
                        key={s.id}
                        style={{
                          display: 'grid', gridTemplateColumns: '24px 1fr auto auto', alignItems: 'center', gap: 10,
                          padding: '10px 14px',
                          borderBottom: idx !== arr.length - 1 ? `1px solid ${isDark ? '#334155' : '#EEF2F6'}` : 'none',
                          background: active ? (isDark ? '#1e3a5f' : '#F0F9FF') : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <input type="checkbox" checked={active} onChange={() => toggleApptService(s.id)} style={{ width: 16, height: 16, accentColor: '#2563EB' }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, color: isDark ? '#E2E8F0' : '#0F172A', fontWeight: active ? 700 : 500 }}>{s.name}</span>
                          {(s.category || s.subcategory) && (
                            <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                              {[s.category, s.subcategory].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>{s.duration_minutes || 30} min</span>
                        <span style={{ fontSize: 14, color: '#059669', fontWeight: 800 }}>Rs.{Number(s.price || 0).toLocaleString()}</span>
                      </label>
                    );
                  });
                })()}
              </div>
              {apptServiceIds.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {services.filter((s) => apptServiceIds.includes(Number(s.id))).map((s) => (
                    <span key={s.id} style={{ fontSize: 11, color: '#047857', background: '#D1FAE5', border: '1px solid #A7F3D0', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </ApptSection>

            <ApptSection title="Notes" dark={isDark}>
              <FormGroup label="Notes">
                <Textarea value={form.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Special requests, allergies, preferences…" rows={2} />
              </FormGroup>
            </ApptSection>

            {!editItem && (
              <ApptSection title="Advance payment" desc="Optional — collect a deposit when booking" dark={isDark}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={collectAdvance}
                    onChange={(e) => {
                      setCollectAdvance(e.target.checked);
                      if (!e.target.checked) setAdvanceAmount('');
                    }}
                    style={{ width: 16, height: 16, accentColor: '#2563EB' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#E2E8F0' : '#0F172A' }}>
                    Collect advance payment now
                  </span>
                </label>
                {collectAdvance && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <FormGroup label="Advance amount (Rs.)" required>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(e.target.value)}
                        placeholder="e.g. 1000"
                      />
                    </FormGroup>
                    <FormGroup label="Payment method" required>
                      <Select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value)}>
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                        <option value="Online Transfer">Online Transfer</option>
                      </Select>
                    </FormGroup>
                  </div>
                )}
                {collectAdvance && (() => {
                  const total = Number(bookingUsesPackage ? getBookingBundlePrice() : calcServiceTotal(apptServiceIds)) || 0;
                  const adv = Number(advanceAmount) || 0;
                  if (!(total > 0)) return null;
                  return (
                    <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>
                      Booking total Rs. {total.toLocaleString()}
                      {adv > 0 && (
                        <> · Remaining Rs. {Math.max(0, total - adv).toLocaleString()}</>
                      )}
                    </div>
                  );
                })()}
              </ApptSection>
            )}
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {isSuperAdmin && (
              <ApptSection title="Branch" dark={isDark}>
                <FormGroup label="Branch">
                  <Select value={form.branch_id || ''} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value, staff_id: '' }))}>
                    <option value="">Select branch</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </FormGroup>
              </ApptSection>
            )}

            {!editItem && multiBooking ? (
              <ApptSection
                title="Staff & schedule"
                desc="Assign a stylist and time for each service — creates separate bookings"
                dark={isDark}
              >
                {!apptServiceIds.length ? (
                  <div style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B' }}>
                    Select services first.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {services.filter((s) => apptServiceIds.includes(Number(s.id))).map((s) => {
                      const a = serviceAssignments[String(s.id)] || { staff_id: '', date: form.date || today, time: '' };
                      const ready = !!(a.date && a.time);
                      return (
                        <div
                          key={s.id}
                          style={{
                            border: `1px solid ${ready ? '#86EFAC' : (isDark ? '#334155' : '#E2E8F0')}`,
                            borderRadius: 12,
                            padding: 12,
                            background: ready ? (isDark ? '#052e16' : '#F0FDF4') : (isDark ? '#0F172A' : '#F8FAFC'),
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#E2E8F0' : '#0F172A' }}>{s.name}</div>
                              <div style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>{s.duration_minutes || 30} min · Rs.{Number(s.price || 0).toLocaleString()}</div>
                            </div>
                            {ready && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#047857' }}>Ready</span>
                            )}
                          </div>
                          <FormGroup label="Staff">
                            <Select
                              value={a.staff_id || ''}
                              onChange={(e) => updateServiceAssignment(s.id, { staff_id: e.target.value, time: '' })}
                            >
                              <option value="">Any available staff</option>
                              {filteredStaff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                            </Select>
                          </FormGroup>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                            <FormGroup label="Date" required>
                              <Input
                                type="date"
                                value={a.date || ''}
                                onChange={(e) => updateServiceAssignment(s.id, { date: e.target.value, time: '' })}
                              />
                            </FormGroup>
                            <FormGroup label="Time" required>
                              <Input
                                type="time"
                                value={a.time || ''}
                                onChange={(e) => updateServiceAssignment(s.id, { time: e.target.value })}
                              />
                            </FormGroup>
                          </div>
                          {!!a.staff_id && !!a.date && renderSlotChips({
                            slots: multiSlots[String(s.id)] || [],
                            loading: !!multiSlotsLoading[String(s.id)],
                            value: a.time || '',
                            onPick: (t) => updateServiceAssignment(s.id, { time: t }),
                            durationLabel: `${s.duration_minutes || 30} min`,
                            isDarkMode: isDark,
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                  <FormGroup label="Status">
                    <Select value={form.status || 'pending'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                      {APPT_STATUSES.filter((s) => s !== 'completed').map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                    </Select>
                  </FormGroup>
                  <FormGroup label={bookingUsesPackage ? 'Bundle price (Rs.)' : 'Amount (Rs.)'}>
                    <Input
                      type="number"
                      value={bookingUsesPackage ? String(bookingBundlePrice || form.amount || '0') : (form.amount || '')}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder={bookingUsesPackage ? 'Package bundle' : 'Auto per service'}
                      disabled={!!bookingUsesPackage}
                    />
                  </FormGroup>
                </div>
              </ApptSection>
            ) : (
              <>
                <ApptSection title="Staff & Notes" dark={isDark}>
                  <FormGroup label="Assign Staff">
                    <Select
                      value={form.staff_id || ''}
                      onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value, time: '' }))}
                    >
                      <option value="">Any available staff</option>
                      {filteredStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </FormGroup>
                </ApptSection>
                <ApptSection title="Schedule" desc={`Date, time, and booking status · ${bookingDurationMinutes} min total`} dark={isDark}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <FormGroup label="Date" required>
                      <Input
                        type="date"
                        value={form.date || ''}
                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, time: '' }))}
                      />
                    </FormGroup>
                    <FormGroup label="Time" required>
                      <Input type="time" value={form.time || ''} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
                    </FormGroup>
                  </div>
                  {!!form.staff_id && !!form.date && renderSlotChips({
                    slots: availableSlots,
                    loading: slotsLoading,
                    value: form.time || '',
                    onPick: (t) => setForm((f) => ({ ...f, time: t })),
                    durationLabel: `${bookingDurationMinutes} min`,
                    isDarkMode: isDark,
                  })}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <FormGroup label="Status">
                      <Select value={form.status || 'pending'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                        {APPT_STATUSES.filter((s) => s !== 'completed').map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </Select>
                    </FormGroup>
                    <FormGroup label={bookingUsesPackage ? 'Bundle price (Rs.)' : 'Amount (Rs.)'}>
                      <Input
                        type="number"
                        value={bookingUsesPackage ? String(bookingBundlePrice || form.amount || '0') : (form.amount || '')}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                        placeholder={bookingUsesPackage ? 'Package bundle' : 'Auto from services'}
                        disabled={!!bookingUsesPackage}
                      />
                    </FormGroup>
                  </div>
                </ApptSection>
              </>
            )}

            <ApptSection title="Recurring" desc="Auto-book next visit when completed" dark={isDark}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!form.is_recurring}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    is_recurring: e.target.checked,
                    recurrence_frequency: e.target.checked ? (f.recurrence_frequency || 'weekly') : 'weekly',
                    recurring_next_date: e.target.checked
                      ? (f.recurring_next_date || defaultRecurringNextDate(f.date))
                      : '',
                  }))}
                  style={{ width: 18, height: 18, accentColor: '#2563EB' }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#E2E8F0' : '#0F172A' }}>Repeat this appointment</span>
              </label>
              {form.is_recurring && (
                <>
                  <RecurringDateCalendar
                    value={form.recurring_next_date || defaultRecurringNextDate(form.date)}
                    minDate={form.date || undefined}
                    onChange={(date) => setForm((f) => ({ ...f, recurring_next_date: date }))}
                    label="Next appointment date"
                  />
                  <FormGroup label="Reminder messages">
                    <RecurringTemplateCheckboxes
                      templates={recurringTemplates}
                      value={form.recurring_message_template_ids}
                      onChange={(ids) => setForm((f) => ({ ...f, recurring_message_template_ids: ids }))}
                      isDark={isDark}
                    />
                  </FormGroup>
                </>
              )}
            </ApptSection>

            {/* Summary card */}
            <div style={{
              borderRadius: 14, padding: '16px 18px',
              background: isDark ? 'linear-gradient(135deg,#064e3b,#065f46)' : 'linear-gradient(135deg,#ECFDF5,#D1FAE5)',
              border: `1px solid ${isDark ? '#047857' : '#A7F3D0'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#86EFAC' : '#047857', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Booking Summary
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: isDark ? '#D1FAE5' : '#065F46' }}>
                  <span>Customer</span>
                  <span style={{ fontWeight: 700, textAlign: 'right', maxWidth: '55%' }}>{form.customer_name || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: isDark ? '#D1FAE5' : '#065F46' }}>
                  <span>Services</span>
                  <span style={{ fontWeight: 700 }}>{apptServiceIds.length || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: isDark ? '#D1FAE5' : '#065F46' }}>
                  <span>Date & Time</span>
                  <span style={{ fontWeight: 700, textAlign: 'right', maxWidth: '60%' }}>
                    {!editItem && multiBooking
                      ? (apptServiceIds.length
                        ? `${apptServiceIds.filter((id) => {
                          const a = serviceAssignments[String(id)];
                          return a?.date && a?.time;
                        }).length}/${apptServiceIds.length} scheduled`
                        : '—')
                      : (form.date && form.time ? `${form.date} · ${form.time}` : '—')}
                  </span>
                </div>
                <div style={{ height: 1, background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(5,150,105,0.2)', margin: '4px 0' }} />
                {(() => {
                  const summaryTotal = bookingUsesPackage
                    ? Number(bookingBundlePrice || 0)
                    : Number(form.amount || calcServiceTotal(apptServiceIds) || 0);
                  const summaryAdvance = (!editItem && collectAdvance && Number(advanceAmount) > 0)
                    ? Number(advanceAmount)
                    : 0;
                  const summaryRemaining = Math.max(0, summaryTotal - summaryAdvance);
                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#BBF7D0' : '#064E3B' }}>
                          {bookingUsesPackage ? 'Bundle price' : 'Estimated Total'}
                        </span>
                        <div style={{ textAlign: 'right' }}>
                          {bookingUsesPackage && apptServiceIds.length > 0 && (
                            <div style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', fontWeight: 600, marginBottom: 2, textDecoration: 'line-through' }}>
                              List Rs. {calcServiceTotal(apptServiceIds).toLocaleString()}
                            </div>
                          )}
                          <span style={{ fontSize: 18, fontWeight: 800, color: isDark ? '#fff' : '#047857', letterSpacing: '-0.02em' }}>
                            {bookingUsesPackage
                              ? formatPackageBillAmount(bookingBundlePrice)
                              : `Rs. ${summaryTotal.toLocaleString()}`}
                          </span>
                        </div>
                      </div>
                      {summaryAdvance > 0 && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: isDark ? '#93C5FD' : '#1D4ED8' }}>
                            <span>Advance payment ({advanceMethod})</span>
                            <span style={{ fontWeight: 700 }}>- Rs. {summaryAdvance.toLocaleString()}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: isDark ? '#BBF7D0' : '#064E3B' }}>
                              Remaining to pay
                            </span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: isDark ? '#fff' : '#047857', letterSpacing: '-0.02em' }}>
                              Rs. {summaryRemaining.toLocaleString()}
                            </span>
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Appointment" size="sm"
        footer={<>
          <Button variant="secondary" onClick={()=>setDeleteId(null)}>No</Button>
          <Button variant="danger" onClick={handleDelete} style={{ background:'#DC2626', color:'#fff' }}>Yes, Delete</Button>
        </>}>
        <div style={{ textAlign:'center', padding:'12px 0' }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </div>
          <div style={{ fontSize:15, fontWeight:600, color:isDark?'#E2E8F0':'#101828', marginBottom:6 }}>Are you sure?</div>
          <div style={{ fontSize:13, color:isDark?'#94A3B8':'#667085' }}>This appointment will be permanently deleted.<br/>This action cannot be undone.</div>
        </div>
      </Modal>

      {/* Collect Payment Modal */}
      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="Collect Payment" size="md"
        footer={!paymentOk&&<><Button variant="secondary" onClick={()=>setShowPayment(false)}>Cancel</Button><Button variant="primary" loading={paymentSaving} onClick={handlePayment}>Confirm Payment</Button></>}>
        {paymentAppt && (
          paymentOk ? (
            <div style={{ textAlign:'center', padding:'28px 0' }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:isDark?'#064E3B':'#ECFDF5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div style={{ fontSize:16, fontWeight:700, color:'#059669' }}>Payment Recorded!</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {paymentErr && <div style={{ background:isDark?'#450A0A':'#FEF2F2', color:isDark?'#FCA5A5':'#DC2626', padding:'9px 13px', borderRadius:9, fontSize:13, border:`1px solid ${isDark?'#7F1D1D':'#FEE2E2'}` }}>{paymentErr}</div>}
              <div style={{ background:isDark?'#1E293B':'#F9FAFB', borderRadius:12, padding:'14px 16px', border:isDark?'1px solid #334155':'none' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:isDark?'#E2E8F0':'#101828' }}>{paymentAppt.customer_name}</div>
                    <div style={{ fontSize:13, color:isDark?'#94A3B8':'#667085', marginTop:2 }}>{paymentAppt.phone||''}</div>
                  </div>
                </div>
                {Number(paymentAppt.advance_paid || paymentAppt.amount_paid || 0) > 0 && (
                  <div style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 10,
                    background: isDark ? '#1e3a5f' : '#EFF6FF',
                    border: `1px solid ${isDark ? '#1d4ed8' : '#BFDBFE'}`,
                    fontSize: 13, color: isDark ? '#93C5FD' : '#1D4ED8', fontWeight: 600,
                  }}>
                    Advance already paid: Rs. {Number(paymentAppt.advance_paid || paymentAppt.amount_paid || 0).toLocaleString()}
                    <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2, opacity: 0.9 }}>
                      Collect the remaining balance below.
                    </div>
                  </div>
                )}
              </div>
              <div style={{
                border: `1px solid ${isDark ? '#334155' : '#E5EAF0'}`,
                borderRadius: 12,
                padding: 12,
                background: isDark ? '#0F172A' : '#fff',
              }}>
                <label style={{ display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer' }}>
                  <input
                    type="checkbox"
                    checked={paymentRecurring}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPaymentRecurring(checked);
                      if (checked && !paymentRecurringDate) {
                        setPaymentRecurringDate(defaultRecurringNextDate(paymentAppt.date?.slice(0, 10)));
                      }
                    }}
                    style={{ marginTop:3, width:16, height:16, accentColor:'#2563EB' }}
                  />
                  <span>
                    <div style={{ fontWeight:700, fontSize:14, color:isDark?'#E2E8F0':'#101828' }}>Recurring Appointment</div>
                    <div style={{ fontSize:12, color:isDark?'#94A3B8':'#667085', marginTop:2 }}>Book the next appointment on the selected date</div>
                  </span>
                </label>
                {paymentRecurring && (
                  <>
                    <RecurringDateCalendar
                      value={paymentRecurringDate}
                      minDate={today}
                      onChange={setPaymentRecurringDate}
                      label="Next appointment date"
                    />
                    <FormGroup label="Reminder messages">
                      <RecurringTemplateCheckboxes
                        templates={recurringTemplates}
                        value={paymentRecurringTemplateIds}
                        onChange={setPaymentRecurringTemplateIds}
                        isDark={isDark}
                      />
                    </FormGroup>
                  </>
                )}
              </div>
              <PaymentHelperStaffFields
                mainStaffId={paymentMainStaffId}
                onMainStaffChange={setPaymentMainStaffId}
                helpers={paymentHelpers}
                onHelpersChange={setPaymentHelpers}
                staffOptions={(() => {
                  const bid = paymentAppt.branch_id || paymentAppt.branch?.id;
                  if (!bid) return staffList;
                  return staffList.filter((s) => String(s.branch_id) === String(bid)
                    || (s.branches || []).some((b) => String(b.id) === String(bid)));
                })()}
                isDark={isDark}
              />
              <FormGroup label="Services" required>
                <div style={{ border:`1px solid ${isDark?'#334155':'#DCE6F3'}`, borderRadius:12, overflow:'hidden', maxHeight:180, overflowY:'auto', background:isDark?'#0F172A':'#fff' }}>
                  {services.filter(s => s.is_active !== false).map((s, idx, arr) => {
                    const active = paymentServices.includes(Number(s.id));
                    return (
                      <label key={s.id} style={{ display:'grid', gridTemplateColumns:'24px 1fr auto', alignItems:'center', gap:10, padding:'9px 12px', borderBottom:idx!==arr.length-1?`1px solid ${isDark?'#334155':'#EEF2F6'}`:'none', background:active?(isDark?'#1e3a5f':'#F0F9FF'):'transparent', cursor:'pointer' }}>
                        <input type="checkbox" checked={active} onChange={() => togglePaymentService(s.id)} style={{ width:16, height:16, accentColor:'#2563EB' }} />
                        <span style={{ fontSize:14, color:isDark?'#E2E8F0':'#0F172A', fontWeight:active?700:500 }}>{s.name}</span>
                        <span style={{ fontSize:14, color:'#059669', fontWeight:800 }}>Rs.{Number(s.price||0).toLocaleString()}</span>
                      </label>
                    );
                  })}
                </div>
                {paymentServices.length===0 && <div style={{ fontSize:12, color:'#DC2626', marginTop:4 }}>Select at least one service</div>}
              </FormGroup>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, alignItems:'start' }}>
                <FormGroup label={paymentUsesPackage ? 'Bundle price (Rs.)' : 'Subtotal (Rs.)'}>
                  <div style={{ padding:'10px 12px', background:isDark?'#1E293B':'#F9FAFB', borderRadius:10, border:`1px solid ${isDark?'#334155':'#E5E7EB'}` }}>
                    {paymentUsesPackage && paymentListTotal > 0 && (
                      <div style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', textDecoration: 'line-through', marginBottom: 4 }}>
                        List Rs. {paymentListTotal.toLocaleString()}
                      </div>
                    )}
                    <div style={{ fontWeight:800, color:'#059669' }}>
                      Rs. {(paymentUsesPackage ? paymentBundlePrice : paymentListTotal).toLocaleString()}
                    </div>
                  </div>
                </FormGroup>
                {paymentDiscounts.length > 0 && paymentMethod !== 'Package' && !paymentCustPackageId && (
                  <FormGroup label="Promo discount">
                    <Select value={paymentDiscountId || ''} onChange={e => setPaymentDiscountId(e.target.value)}>
                      <option value="">None</option>
                      {paymentDiscounts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.discount_type === 'fixed' ? `Rs.${d.value}` : `${d.value}%`})
                        </option>
                      ))}
                    </Select>
                  </FormGroup>
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <FormGroup label="Paid (Rs.)" required>
                  <Input type="number" value={paymentAmt} onChange={e=>setPaymentAmt(e.target.value)} placeholder="0" disabled={paymentMethod === 'Package'} />
                </FormGroup>
                <FormGroup label="Payment Method" required>
                  <Select value={paymentMethod} onChange={e=>{ setPaymentMethod(e.target.value); if (e.target.value !== 'Package') { setPaymentCustPackageId(''); } }}>
                    {['Cash','Card','Bank Transfer','Online','Package'].map(m=><option key={m} value={m}>{m}</option>)}
                  </Select>
                </FormGroup>
              </div>
              {(paymentAppt.customer_id || paymentAppt.customer?.id) && (
                <FormGroup label="Customer Package">
                  {loadingPaymentPkgs ? (
                    <div style={{ fontSize:12, color:isDark?'#94A3B8':'#94A3B8', padding:'4px 0' }}>Loading packages...</div>
                  ) : paymentCustPackages.length > 0 ? (
                    <Select value={paymentCustPackageId} onChange={(e) => applyPaymentPackage(e.target.value)}>
                      <option value="">No package — pay normally</option>
                      {paymentCustPackages.map((cp) => (
                        <option key={cp.id} value={cp.id}>{formatCustomerPackageLabel(cp)}</option>
                      ))}
                    </Select>
                  ) : (
                    <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', padding: '4px 0' }}>
                      No package for this customer — use promo discount or select a package when booking.
                    </div>
                  )}
                  {paymentCustPackageId && (
                    <div style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857', marginTop: 6, fontWeight: 600 }}>
                      {formatPackageAppliedMessage(getPackageBundlePrice(paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId))))}
                    </div>
                  )}
                </FormGroup>
              )}
              <div style={{ background:isDark?'#064E3B':'#F0FDF4', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', border:`1px solid ${isDark?'#065F46':'#BBF7D0'}` }}>
                <span style={{ fontSize:13, fontWeight:600, color:isDark?'#A7F3D0':'#166534' }}>
                  {paymentUsesPackage ? 'Final amount (bundle)' : 'Collected'}
                </span>
                <span style={{ fontSize:18, fontWeight:800, color:'#059669' }}>
                  Rs. {(paymentUsesPackage ? paymentBundlePrice : Number(paymentAmt || 0)).toLocaleString()}
                </span>
              </div>
            </div>
          )
        )}
      </Modal>

      {/* Detail Drawer */}
      <Drawer
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={detailItem ? `Appointment · ${detailItem.date || ''} ${detailItem.time || ''}`.trim() : 'Appointment Details'}
        width={500}
        footer={canEdit && detailItem && (
          <div style={{ display:'flex', gap:8 }}>
            {detailItem.status!=='completed'&&detailItem.status!=='cancelled'&&<Button variant="primary" onClick={()=>{setShowDetail(false);openEdit(detailItem);}} style={{ display:'flex', alignItems:'center', gap:6 }}><IconEdit /> Edit</Button>}
            {detailItem.status==='in_service'&&<Button variant="primary" onClick={()=>{setShowDetail(false);openPayment(detailItem);}} style={{ display:'flex', alignItems:'center', gap:6, background:'#059669' }}><IconMoney /> Collect Payment</Button>}
          </div>
        )}>
        {detailItem && (
          <div style={{ fontFamily:"'Inter',sans-serif" }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, padding:'16px', background:isDark?'#1E293B':'#fff', borderRadius:14, border:`1px solid ${isDark?'#334155':C.border}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(16,24,40,0.04)' }}>
              <div style={{ display:'flex', alignItems:'center', gap: 12, minWidth: 0 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#4F46E5)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                  {detailItem.customer_name?.charAt(0)?.toUpperCase() || 'C'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize:17, fontWeight:700, color:isDark?'#E2E8F0':'#101828' }}>{detailItem.customer_name}</div>
                  <div style={{ fontSize:13, color:isDark?'#94A3B8':'#667085', marginTop:2 }}>{detailItem.phone || 'No phone'}</div>
                </div>
              </div>
              <StatusBadge status={detailItem.status} dark={isDark} />
            </div>
            {(() => {
              const extraServiceNames = parseAdditionalServiceNames(detailItem.notes || '');
              const allServiceNames = Array.from(new Set([detailItem.service?.name, ...extraServiceNames].filter(Boolean)));
              const bill = resolveAppointmentAmountDisplay(detailItem, {
                services,
                customerPackages: apptPackageCache[detailItem.customer_id] || [],
              });
              const rows = [
                { icon:'✂️', label:'Services', value: allServiceNames.join(', ') || '—' },
                { icon:'👤', label:'Staff', value: detailItem.staff?.name || '—' },
                { icon:'📅', label:'Date', value: detailItem.date ? new Date(detailItem.date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : '—' },
                { icon:'🕐', label:'Time', value: detailItem.time || '—' },
                { icon:'🏢', label:'Branch', value: detailItem.branch?.name || '—' },
                {
                  icon:'💰',
                  label: bill.isPackage ? 'Bundle price' : 'Amount',
                  value: bill.listTotal != null
                    ? `List Rs. ${bill.listTotal.toLocaleString()} → ${bill.primary}`
                    : bill.primary,
                  highlight: true,
                },
              ];
              return (
                <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
                  {rows.map(({ icon, label, value, highlight }) => (
                    <div key={label} style={{ display:'flex', alignItems:'center', gap: 12, padding:'12px 14px', background: isDark ? '#0F172A' : '#fff', borderRadius: 12, border:`1px solid ${isDark?'#334155':C.border}` }}>
                      <span style={{ fontSize: 18, width: 28, textAlign:'center', flexShrink: 0 }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
                        <div style={{ fontSize: 14, color: highlight ? '#059669' : C.title, fontWeight: highlight ? 800 : 600, marginTop: 2 }}>{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {detailItem.notes && (
              <div style={{ marginTop:20, padding:'14px 16px', background:isDark?'#422006':'#FFFBEB', borderRadius:10, border:`1px solid ${isDark?'#92400E':'#FDE68A'}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#D97706', textTransform:'uppercase', marginBottom:6 }}> Notes</div>
                <div style={{ fontSize:13, color:isDark?'#FDE68A':'#475467', lineHeight:1.6 }}>{detailItem.notes}</div>
              </div>
            )}
            <div style={{ marginTop:20, textAlign:'right' }}>
              <span style={{ fontSize:11, color:isDark?'#64748B':'#D0D5DD', fontFamily:'monospace' }}>ID #{detailItem.id}</span>
            </div>
          </div>
        )}
      </Drawer>
    </PageWrapper>
  );
}
