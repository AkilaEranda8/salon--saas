import { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';
import { useFeatureGate } from '../hooks/useFeatureGate';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import {
  IconEye, IconEdit, IconTrash, IconPlus, IconUsers,
  StaffAvatar, ActionBtn, StatCard, Drawer, PKModal as Modal,
  FilterBar, DataTable,
} from '../components/ui/PageKit';
import { LOYALTY_TIERS, getTier, getNextTier, loyaltyTierCounts } from '../utils/loyaltyTiers';
import { phoneSearchTokens } from '../utils/phoneMatch';
import { isWalkInCustomer } from '../utils/walkInCustomer';

const EMPTY      = { name: '', phone: '', email: '', branch_id: '' };
const DEFAULT_LOYALTY_RULES = {
  earn_per_amount: 100,
  earn_points: 1,
  redeem_points: 100,
  redeem_value: 50,
  min_points_redeem: 100,
  expiry_days: '',
  is_active: true,
};

function LoyaltyBar({ pts }) {
  const tier = getTier(pts);
  const next = getNextTier(pts);
  const pct = next
    ? Math.min(100, ((pts - tier.min) / (next.min - tier.min)) * 100)
    : 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ padding: '2px 8px', borderRadius: 6, background: tier.bg, color: tier.color, fontWeight: 700, fontSize: 11 }}>{tier.name}</span>
        <span style={{ fontSize: 11, color: '#98A2B3' }}>{pts} pts{next ? ` / ${next.min}` : ''}</span>
      </div>
      <div style={{ height: 5, background: '#F1F5F9', borderRadius: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tier.color, borderRadius: 6, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { user } = useAuth();
  const { allowed: loyaltyAllowed } = useFeatureGate('loyalty');
  const canEdit      = ['superadmin', 'admin', 'manager', 'staff'].includes(user?.role);
  const canManageLoyalty = loyaltyAllowed && ['superadmin', 'admin'].includes(user?.role);
  const isSuperAdmin = user?.role === 'superadmin';

  const [customers, setCustomers]   = useState([]);
  const [branches, setBranches]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filterBranch, setFilterBranch] = useState(isSuperAdmin ? '' : user?.branch_id || '');
  const [showForm, setShowForm]     = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [profileItem, setProfileItem] = useState(null);
  const [form, setForm]             = useState(EMPTY);
  const [saving, setSaving]         = useState(false);
  const [formErr, setFormErr]       = useState('');
  const [custPayments, setCustPayments] = useState([]);
  const [custPayLoading, setCustPayLoading] = useState(false);
  const [custDetail, setCustDetail] = useState(null);
  const [custDetailLoading, setCustDetailLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrErr, setQrErr] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrMeta, setQrMeta] = useState(null);
  const [showLoyaltyRules, setShowLoyaltyRules] = useState(false);
  const [loyaltyRules, setLoyaltyRules] = useState(DEFAULT_LOYALTY_RULES);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltySaving, setLoyaltySaving] = useState(false);
  const [loyaltyErr, setLoyaltyErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const branchParams = filterBranch ? { branchId: filterBranch } : {};
      const pageLimit = 500;
      let page = 1;
      let all = [];
      let total = Infinity;

      while (all.length < total) {
        const { data } = await api.get('/customers', {
          params: { limit: pageLimit, page, ...branchParams },
        });
        const rows = Array.isArray(data) ? data : (data?.data ?? []);
        total = typeof data?.total === 'number' ? data.total : rows.length;
        all = all.concat(rows);
        if (!rows.length || rows.length < pageLimit) break;
        page += 1;
      }

      const brR = await api.get('/branches', { params: { limit: 100 } });
      setCustomers(all);
      setBranches(Array.isArray(brR.data) ? brR.data : (brR.data?.data ?? []));
    } catch { }
    setLoading(false);
  }, [filterBranch]);
  useEffect(() => { load(); }, [load]);

  const openAdd     = () => { setEditItem(null); setForm({ ...EMPTY, branch_id: user?.branch_id || '' }); setFormErr(''); setShowForm(true); };
  const openEdit    = row => { setEditItem(row); setForm({ name: row.name, phone: row.phone, email: row.email || '', branch_id: row.branch_id || '' }); setFormErr(''); setShowForm(true); };
  const openProfile = row => {
    setProfileItem(row);
    setCustPayments([]);
    setCustDetail(null);
    setQrDataUrl('');
    setQrMeta(null);
    setQrErr('');
    setShowProfile(true);
    setCustPayLoading(true);
    setCustDetailLoading(true);
    api.get('/payments', { params: { customerId: row.id, limit: 50 } })
      .then(r => setCustPayments(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => {})
      .finally(() => setCustPayLoading(false));
    api.get(`/customers/${row.id}`)
      .then(r => setCustDetail(r.data || null))
      .catch(() => setCustDetail(null))
      .finally(() => setCustDetailLoading(false));
    loadCustomerQr(row);
  };

  const loadCustomerQr = async (customerOrId) => {
    const customer = typeof customerOrId === 'object' && customerOrId
      ? customerOrId
      : (profileItem?.id === customerOrId ? profileItem : { id: customerOrId });
    const customerId = customer?.id;
    if (!customerId) return;

    const phone = String(customer?.phone || '').trim();
    if (!phone) {
      setQrDataUrl('');
      setQrMeta(null);
      setQrLoading(false);
      setQrErr(
        isWalkInCustomer(customer)
          ? 'Walk-in Customer has no phone — check-in QR needs a customer with a phone number.'
          : 'Add a phone number to this customer before generating a check-in QR.',
      );
      return;
    }

    setQrLoading(true);
    setQrErr('');
    try {
      const { data } = await api.get(`/customers/${customerId}/checkin-qr`, {
        params: { ttlDays: 90 },
      });
      const code = String(data?.code || '').trim();
      if (!code) throw new Error('No QR code returned');
      const dataUrl = await QRCode.toDataURL(code, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#101828', light: '#FFFFFF' },
      });
      setQrDataUrl(dataUrl);
      setQrMeta({
        expiresAt: data.expires_at,
        ttlDays: data.ttl_days,
        name: data.customer?.name,
        phone: data.customer?.phone,
      });
    } catch (e) {
      setQrDataUrl('');
      setQrMeta(null);
      setQrErr(e.response?.data?.message || e.message || 'Failed to load check-in QR.');
    } finally {
      setQrLoading(false);
    }
  };

  const downloadCustomerQr = () => {
    if (!qrDataUrl || !profileItem) return;
    const safe = String(profileItem.name || 'customer')
      .replace(/[^\w\-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 40);
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `checkin-qr-${safe || profileItem.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSave = async () => {
    if (!form.name || !form.phone) return setFormErr('Name and phone are required');
    setSaving(true);
    try {
      const payload = {
        ...form,
        email: form.email?.trim() ? form.email.trim() : null,
      };
      editItem ? await api.put(`/customers/${editItem.id}`, payload) : await api.post('/customers', payload);
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this customer?')) return;
    await api.delete(`/customers/${id}`); load();
  };

  const openLoyaltyRules = async () => {
    setShowLoyaltyRules(true);
    setLoyaltyLoading(true);
    setLoyaltyErr('');
    try {
      const { data } = await api.get('/loyalty/rules');
      setLoyaltyRules({
        ...DEFAULT_LOYALTY_RULES,
        ...(data || {}),
        expiry_days: data?.expiry_days ?? '',
      });
    } catch (e) {
      setLoyaltyErr(e.response?.data?.message || 'Failed to load loyalty rules.');
    } finally {
      setLoyaltyLoading(false);
    }
  };

  const saveLoyaltyRules = async () => {
    const earnAmount = Number(loyaltyRules.earn_per_amount);
    const earnPoints = Number(loyaltyRules.earn_points);
    const redeemPoints = Number(loyaltyRules.redeem_points);
    const redeemValue = Number(loyaltyRules.redeem_value);
    const minRedeem = Number(loyaltyRules.min_points_redeem || 0);
    if (earnAmount <= 0 || earnPoints <= 0 || redeemPoints <= 0 || redeemValue <= 0 || minRedeem < 0) {
      return setLoyaltyErr('Enter valid positive earning and redemption values.');
    }
    setLoyaltySaving(true);
    setLoyaltyErr('');
    try {
      const payload = {
        earn_per_amount: earnAmount,
        earn_points: earnPoints,
        redeem_points: redeemPoints,
        redeem_value: redeemValue,
        min_points_redeem: minRedeem,
        expiry_days: loyaltyRules.expiry_days === '' ? null : Number(loyaltyRules.expiry_days),
        is_active: Boolean(loyaltyRules.is_active),
      };
      const { data } = await api.put('/loyalty/rules', payload);
      setLoyaltyRules({ ...payload, ...(data || {}), expiry_days: data?.expiry_days ?? '' });
      setShowLoyaltyRules(false);
    } catch (e) {
      setLoyaltyErr(e.response?.data?.message || 'Failed to save loyalty rules.');
    } finally {
      setLoyaltySaving(false);
    }
  };

  const tierCounts = loyaltyTierCounts(customers);

  const p = profileItem;

  const columns = [
    {
      id: 'name',
      header: 'Customer',
      // Include 0… / 94… phone variants so table search finds either format.
      accessorFn: row => {
        const tokens = phoneSearchTokens(row.phone).join(' ');
        return `${row.name || ''} ${row.email || ''} ${tokens}`.trim().toLowerCase();
      },
      meta: { width: '22%' },
      cell: ({ row: { original: row } }) => {
        const tier = getTier(row.loyalty_points || 0);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: tier.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {row.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#101828', fontSize: 14 }}>{row.name}</div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 1 }}>{row.phone}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'loyalty',
      header: 'Loyalty',
      accessorFn: row => row.loyalty_points,
      meta: { width: '22%' },
      cell: ({ row: { original: row } }) => <div style={{ minWidth: 120 }}><LoyaltyBar pts={row.loyalty_points || 0} /></div>,
    },
    {
      id: 'visits',
      header: 'Visits',
      accessorFn: row => row.visits,
      meta: { width: '10%', align: 'center' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight: 700, color: '#101828' }}>{row.visits || 0}</span>,
    },
    {
      id: 'spent',
      header: 'Total Spent',
      accessorFn: row => row.total_spent,
      meta: { width: '15%', align: 'right' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight: 700, color: '#2563EB' }}>Rs. {Number(row.total_spent || 0).toLocaleString()}</span>,
    },
    {
      id: 'last_visit',
      header: 'Last Visit',
      accessorFn: row => row.last_visit,
      meta: { width: '15%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize: 12, color: '#98A2B3' }}>{row.last_visit ? new Date(row.last_visit).toLocaleDateString() : 'Never'}</span>,
    },
    {
      id: 'branch',
      header: 'Branch',
      accessorFn: row => row.branch?.name,
      meta: { width: '8%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize: 13, color: '#475467' }}>{row.branch?.name || ''}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { width: '8%', align: 'center' },
      cell: ({ row: { original: row } }) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <ActionBtn onClick={() => openProfile(row)} title="View Profile" color="#2563EB"><IconEye /></ActionBtn>
          {canEdit && <ActionBtn onClick={() => openEdit(row)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>}
          {canEdit && <ActionBtn onClick={() => handleDelete(row.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>}
        </div>
      ),
    },
  ];

  return (
    <PageWrapper title="Customers" subtitle={`${customers.length} customers registered`}
      actions={(canEdit || canManageLoyalty) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {canManageLoyalty && (
            <Button
              variant="secondary"
              onClick={openLoyaltyRules}
              icon={(
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.5 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.08A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.12.6.64 1.03 1.25 1.04H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
                </svg>
              )}
            >
              Loyalty Rules
            </Button>
          )}
          {canEdit && <Button variant="primary" onClick={openAdd} icon={<IconPlus />}>Add Customer</Button>}
        </div>
      )}>

      {/* Stat Cards — same tiers as Loyalty page */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Total Customers" value={customers.length} color="#2563EB" icon={<IconUsers />} />
        {LOYALTY_TIERS.map((t) => (
          <StatCard
            key={t.name}
            label={`${t.name} Members`}
            value={tierCounts[t.name]}
            color={t.color}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
          />
        ))}
      </div>

      {/* Filter Bar */}
      <FilterBar>
        {isSuperAdmin && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="pk-filter-control">
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={customers}
        loading={loading}
        emptyMessage="No customers found"
        emptySub="Try adjusting your search or add a new customer"
        searchableColumns={[{ id: 'name', title: 'Customer' }]}
      />

      {/* Add / Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Edit Customer' : 'Add Customer'} size="sm"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>{editItem ? 'Save' : 'Add Customer'}</Button></>}>
        {formErr && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 16, fontSize: 13, border: '1px solid #FEE2E2' }}>{formErr}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormGroup label="Full Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" /></FormGroup>
          <FormGroup label="Phone" required><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07X XXX XXXX" /></FormGroup>
          <FormGroup label="Email" helper="Optional"><Input type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="customer@email.com (optional)" /></FormGroup>
          <FormGroup label="Branch">
            <Select value={form.branch_id || ''} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
              <option value="">Select branch</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormGroup>
        </div>
      </Modal>

      {/* Salon-level loyalty earning and redemption rules */}
      <Modal
        open={showLoyaltyRules}
        onClose={() => setShowLoyaltyRules(false)}
        title="Customer Loyalty Rules"
        size="md"
        footer={!loyaltyLoading && (
          <>
            <Button variant="secondary" onClick={() => setShowLoyaltyRules(false)}>Cancel</Button>
            <Button variant="primary" loading={loyaltySaving} onClick={saveLoyaltyRules}>Save Rules</Button>
          </>
        )}
      >
        {loyaltyErr && (
          <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 16, fontSize: 13, border: '1px solid #FEE2E2' }}>
            {loyaltyErr}
          </div>
        )}
        {loyaltyLoading ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#98A2B3' }}>Loading loyalty rules…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E3A8A', fontSize: 13, lineHeight: 1.5 }}>
              Current rule: Every <strong>Rs. {Number(loyaltyRules.earn_per_amount || 0).toLocaleString()}</strong> spent earns{' '}
              <strong>{loyaltyRules.earn_points || 0} point(s)</strong>.
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#101828', marginBottom: 10 }}>Earning points</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormGroup label="Amount spent (Rs.)" required>
                  <Input type="number" min="1" step="0.01" value={loyaltyRules.earn_per_amount ?? ''} onChange={e => setLoyaltyRules(r => ({ ...r, earn_per_amount: e.target.value }))} placeholder="100" />
                </FormGroup>
                <FormGroup label="Points awarded" required>
                  <Input type="number" min="1" step="1" value={loyaltyRules.earn_points ?? ''} onChange={e => setLoyaltyRules(r => ({ ...r, earn_points: e.target.value }))} placeholder="1" />
                </FormGroup>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#101828', marginBottom: 10 }}>Redeeming points</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormGroup label="Points to redeem" required>
                  <Input type="number" min="1" step="1" value={loyaltyRules.redeem_points ?? ''} onChange={e => setLoyaltyRules(r => ({ ...r, redeem_points: e.target.value }))} placeholder="100" />
                </FormGroup>
                <FormGroup label="Discount value (Rs.)" required>
                  <Input type="number" min="1" step="0.01" value={loyaltyRules.redeem_value ?? ''} onChange={e => setLoyaltyRules(r => ({ ...r, redeem_value: e.target.value }))} placeholder="50" />
                </FormGroup>
                <FormGroup label="Minimum points to redeem">
                  <Input type="number" min="0" step="1" value={loyaltyRules.min_points_redeem ?? ''} onChange={e => setLoyaltyRules(r => ({ ...r, min_points_redeem: e.target.value }))} placeholder="100" />
                </FormGroup>
                <FormGroup label="Expiry days (blank = never)">
                  <Input type="number" min="0" step="1" value={loyaltyRules.expiry_days ?? ''} onChange={e => setLoyaltyRules(r => ({ ...r, expiry_days: e.target.value }))} placeholder="Never" />
                </FormGroup>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#344054' }}>
              <input type="checkbox" checked={Boolean(loyaltyRules.is_active)} onChange={e => setLoyaltyRules(r => ({ ...r, is_active: e.target.checked }))} style={{ width: 17, height: 17, accentColor: '#2563EB' }} />
              Loyalty program active
            </label>
          </div>
        )}
      </Modal>

      {/* Profile Drawer */}
      <Drawer open={showProfile} onClose={() => setShowProfile(false)} title="Customer Profile"
        footer={canEdit && <Button variant="primary" onClick={() => { setShowProfile(false); openEdit(p); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconEdit /> Edit Customer</Button>}>
        {p && (
          <div style={{ fontFamily: "'Inter',sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, padding: 16, background: '#F9FAFB', borderRadius: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: getTier(p.loyalty_points || 0).color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#101828' }}>{p.name}</div>
                <div style={{ fontSize: 13, color: '#667085', marginTop: 2 }}>{p.phone}</div>
                {p.email && <div style={{ fontSize: 13, color: '#667085' }}>{p.email}</div>}
              </div>
            </div>
            <LoyaltyBar pts={p.loyalty_points || 0} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
              {[
                { label: 'Visits',      value: p.visits || 0,                                          color: '#2563EB', bg: '#EFF6FF' },
                { label: 'Total Spent', value: `Rs. ${Number(p.total_spent || 0).toLocaleString()}`,   color: '#059669', bg: '#ECFDF5' },
                { label: 'Loyalty Pts', value: p.loyalty_points || 0,                                   color: '#D97706', bg: '#FFFBEB' },
                { label: 'Last Visit',  value: p.last_visit ? new Date(p.last_visit).toLocaleDateString() : 'Never', color: '#64748B', bg: '#F8FAFC' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {p.branch?.name && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: '#F9FAFB', borderRadius: 10, fontSize: 13, color: '#475467' }}>
                Branch: <strong>{p.branch.name}</strong>
              </div>
            )}

            {/* Visit history */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#98A2B3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Recent visits
              </div>
              {custDetailLoading ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#98A2B3', fontSize: 13 }}>Loading…</div>
              ) : !(custDetail?.appointments?.length) ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#98A2B3', fontSize: 13 }}>No visits found</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {custDetail.appointments.slice(0, 10).map((a) => (
                    <div key={a.id} style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px', border: '1px solid #EAECF0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#101828' }}>
                            {a.service?.name || 'Service'}
                          </div>
                          <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 2 }}>
                            {a.date ? new Date(a.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                            {a.time ? ` · ${String(a.time).slice(0, 5)}` : ''}
                            {a.staff?.name ? ` · ${a.staff.name}` : ''}
                          </div>
                        </div>
                        <span style={{
                          alignSelf: 'flex-start',
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          color: '#475467',
                          background: '#EEF2F6',
                          borderRadius: 6,
                          padding: '2px 8px',
                        }}>
                          {a.status || '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Previously used products */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#98A2B3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Previously used products
              </div>
              {custDetailLoading ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#98A2B3', fontSize: 13 }}>Loading…</div>
              ) : !(custDetail?.used_products_summary?.length) ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#98A2B3', fontSize: 13 }}>
                  No products recorded for this customer yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {custDetail.used_products_summary.map((prod) => (
                    <div key={prod.product_id} style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px', border: '1px solid #EAECF0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#101828' }}>{prod.name}</div>
                          <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 2 }}>
                            {prod.product_type || 'product'}
                            {prod.sku ? ` · ${prod.sku}` : ''}
                            {' · '}used {prod.times_used}×
                            {prod.total_qty != null ? ` · ${Number(prod.total_qty)} ${prod.unit || ''}` : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#667085', whiteSpace: 'nowrap' }}>
                          {prod.last_used
                            ? new Date(prod.last_used).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                            : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!custDetailLoading && Array.isArray(custDetail?.used_products) && custDetail.used_products.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#98A2B3', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Recent usage log
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {custDetail.used_products.slice(0, 12).map((row) => (
                      <div key={row.id} style={{ fontSize: 12, color: '#475467', padding: '6px 10px', background: '#FFF', borderRadius: 8, border: '1px solid #F2F4F7' }}>
                        <strong style={{ color: '#101828' }}>{row.product?.name || 'Product'}</strong>
                        {' · '}{Number(row.quantity_used)} {row.unit}
                        {row.service?.name ? ` · ${row.service.name}` : ''}
                        {row.staff?.name ? ` · ${row.staff.name}` : ''}
                        {row.consumption_date ? ` · ${new Date(row.consumption_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Check-in QR — printable / downloadable */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#98A2B3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Check-in QR
              </div>
              <div style={{ background: '#F9FAFB', border: '1px solid #EAECF0', borderRadius: 12, padding: 16 }}>
                {qrLoading ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#98A2B3', fontSize: 13 }}>Generating QR…</div>
                ) : qrErr ? (
                  <div>
                    <div style={{ color: String(p.phone || '').trim() ? '#DC2626' : '#667085', fontSize: 13, marginBottom: 10 }}>{qrErr}</div>
                    {String(p.phone || '').trim() ? (
                      <Button variant="secondary" onClick={() => loadCustomerQr(p)}>Retry</Button>
                    ) : null}
                  </div>
                ) : qrDataUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <img
                      src={qrDataUrl}
                      alt="Customer check-in QR"
                      style={{ width: 200, height: 200, borderRadius: 8, background: '#fff', border: '1px solid #EAECF0' }}
                    />
                    <div style={{ textAlign: 'center', fontSize: 12, color: '#667085' }}>
                      Staff scan this to check the customer in.
                      {qrMeta?.expiresAt && (
                        <div style={{ marginTop: 4 }}>
                          Valid until {new Date(qrMeta.expiresAt).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                          {qrMeta.ttlDays ? ` (${qrMeta.ttlDays} days)` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <Button variant="primary" onClick={downloadCustomerQr}>Download PNG</Button>
                      <Button variant="secondary" onClick={() => loadCustomerQr(p)}>Regenerate</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Payment History */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#98A2B3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Payment History</div>
              {custPayLoading ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#98A2B3', fontSize: 13 }}>Loading…</div>
              ) : custPayments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#98A2B3', fontSize: 13 }}>No payments found</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {custPayments.map(pay => (
                    <div key={pay.id} style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px', border: '1px solid #EAECF0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#101828' }}>
                            {pay.service?.name || pay.customer_name || 'Service'}
                          </div>
                          <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 2 }}>
                            {pay.date ? new Date(pay.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                            {pay.staff?.name ? ` · ${pay.staff.name}` : ''}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#059669', fontFamily: "'Outfit',sans-serif" }}>
                          Rs. {Number(pay.total_amount || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </PageWrapper>
  );
}
