import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup, Textarea } from '../components/ui/FormElements';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import {
  StatCard, DataTable, FilterBar, PKModal as Modal,
  ActionBtn, IconEdit, IconTrash, IconPlus, IconUsers, IconStar, IconDollar, IconCheck,
} from '../components/ui/PageKit';
import usePageTheme, { PAGE_STAT_COLORS as SC } from '../hooks/usePageTheme';

const Rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const CYCLES = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', one_time: 'One-time' };

const STATUS_META = {
  active:    { color: '#059669', bg: '#ECFDF5', label: 'Active' },
  expired:   { color: '#DC2626', bg: '#FEF2F2', label: 'Expired' },
  cancelled: { color: '#64748B', bg: '#F8FAFC', label: 'Cancelled' },
  paused:    { color: '#D97706', bg: '#FFFBEB', label: 'Paused' },
};

const BLANK_PLAN = {
  name: '', description: '', price: '', billing_cycle: 'monthly',
  discount_percent: 0, free_services_count: 0, bonus_loyalty_points: 0, color: '#6366f1', is_active: true,
};

function StatusBadge({ status, dark = false }) {
  const m = STATUS_META[status] ?? STATUS_META.active;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600, background: dark ? `${m.color}22` : m.bg, color: m.color,
      whiteSpace: 'nowrap', border: dark ? `1px solid ${m.color}40` : '1px solid transparent',
      textTransform: 'capitalize',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

export default function MembershipPlansPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isDark, C } = usePageTheme();
  const canAdmin = ['superadmin', 'admin'].includes(user?.role);

  const [plans, setPlans] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tab, setTab] = useState('plans');
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [planFormError, setPlanFormError] = useState('');
  const [enrollFormError, setEnrollFormError] = useState('');

  const [planForm, setPlanForm] = useState(BLANK_PLAN);
  const [enrollForm, setEnrollForm] = useState({
    customer_id: '', plan_id: '', start_date: new Date().toISOString().slice(0, 10), amount_paid: '', notes: '',
  });

  const loadPlans = useCallback(() =>
    api.get('/membership/plans').then((r) => setPlans(Array.isArray(r.data) ? r.data : [])).catch(() => {}),
  []);

  const loadEnrollments = useCallback(() => {
    setLoading(true);
    api.get('/membership/enrollments')
      .then((r) => setEnrollments(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPlans(); loadEnrollments(); }, [loadPlans, loadEnrollments]);

  useEffect(() => {
    api.get('/customers').then((r) => {
      const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      setCustomers(list);
    }).catch(() => {});
  }, []);

  const activePlans = useMemo(() => plans.filter((p) => p.is_active !== false), [plans]);
  const activeEnrollments = useMemo(() => enrollments.filter((e) => e.status === 'active').length, [enrollments]);

  const displayedEnrollments = useMemo(() => {
    if (!filterStatus) return enrollments;
    return enrollments.filter((e) => e.status === filterStatus);
  }, [enrollments, filterStatus]);

  const openCreatePlan = () => {
    setEditPlan(null);
    setPlanForm(BLANK_PLAN);
    setPlanFormError('');
    setShowPlanForm(true);
  };

  const openEditPlan = (plan) => {
    setEditPlan(plan);
    setPlanForm({
      ...BLANK_PLAN,
      ...plan,
      price: plan.price != null ? String(plan.price) : '',
      discount_percent: plan.discount_percent != null ? String(plan.discount_percent) : '0',
      free_services_count: plan.free_services_count != null ? String(plan.free_services_count) : '0',
      bonus_loyalty_points: plan.bonus_loyalty_points != null ? String(plan.bonus_loyalty_points) : '0',
      is_active: plan.is_active !== false,
    });
    setPlanFormError('');
    setShowPlanForm(true);
  };

  const openEnrollModal = (planId = '') => {
    const plan = planId ? plans.find((p) => String(p.id) === String(planId)) : null;
    setEnrollForm({
      customer_id: '',
      plan_id: planId ? String(planId) : '',
      start_date: new Date().toISOString().slice(0, 10),
      amount_paid: plan?.price != null ? String(plan.price) : '',
      notes: '',
    });
    setShowEnrollForm(true);
  };

  const onEnrollPlanChange = (planId) => {
    const plan = plans.find((p) => String(p.id) === String(planId));
    setEnrollForm((p) => ({
      ...p,
      plan_id: planId,
      amount_paid: plan?.price != null ? String(plan.price) : p.amount_paid,
    }));
  };

  const handleSavePlan = async (e) => {
    e?.preventDefault?.();
    setPlanFormError('');
    if (!planForm.name?.trim()) {
      setPlanFormError('Plan name is required.');
      return;
    }
    if (planForm.price === '' || planForm.price == null || Number(planForm.price) < 0) {
      setPlanFormError('Enter a valid price (Rs.).');
      return;
    }
    const payload = {
      name: planForm.name.trim(),
      description: planForm.description?.trim() || '',
      price: Number(planForm.price),
      billing_cycle: planForm.billing_cycle || 'monthly',
      discount_percent: Number(planForm.discount_percent) || 0,
      free_services_count: Number(planForm.free_services_count) || 0,
      bonus_loyalty_points: Number(planForm.bonus_loyalty_points) || 0,
      color: planForm.color || '#6366f1',
      ...(editPlan ? { is_active: planForm.is_active !== false } : {}),
    };
    setSaving(true);
    try {
      if (editPlan) {
        await api.put(`/membership/plans/${editPlan.id}`, payload);
        toast.success('Plan updated');
      } else {
        await api.post('/membership/plans', payload);
        toast.success('Plan created');
      }
      setShowPlanForm(false);
      setEditPlan(null);
      setPlanForm(BLANK_PLAN);
      loadPlans();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save plan.';
      setPlanFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (id) => {
    if (!window.confirm('Delete/deactivate this plan?')) return;
    try {
      await api.delete(`/membership/plans/${id}`);
      toast.success('Plan removed');
      loadPlans();
    } catch {
      toast.error('Error');
    }
  };

  const handleSaveEnroll = async (e) => {
    e?.preventDefault?.();
    setEnrollFormError('');
    if (!enrollForm.customer_id) {
      setEnrollFormError('Select a customer.');
      return;
    }
    if (!enrollForm.plan_id) {
      setEnrollFormError('Select a membership plan.');
      return;
    }
    if (!enrollForm.start_date) {
      setEnrollFormError('Start date is required.');
      return;
    }
    const payload = {
      customer_id: Number(enrollForm.customer_id),
      plan_id: Number(enrollForm.plan_id),
      start_date: enrollForm.start_date,
      amount_paid: enrollForm.amount_paid !== '' ? Number(enrollForm.amount_paid) : undefined,
      notes: enrollForm.notes?.trim() || '',
    };
    setSaving(true);
    try {
      await api.post('/membership/enroll', payload);
      toast.success('Customer enrolled!');
      setShowEnrollForm(false);
      setEnrollForm({
        customer_id: '', plan_id: '', start_date: new Date().toISOString().slice(0, 10), amount_paid: '', notes: '',
      });
      setTab('enrollments');
      loadEnrollments();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to enroll customer.';
      setEnrollFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateEnrollStatus = async (id, status) => {
    try {
      await api.patch(`/membership/enrollments/${id}/status`, { status });
      toast.success('Updated');
      loadEnrollments();
    } catch {
      toast.error('Error');
    }
  };

  const tabBtn = (key, label) => {
    const active = tab === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setTab(key)}
        style={{
          padding: '10px 22px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 700, fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
          color: active ? SC.primary : C.muted,
          borderBottom: active ? `2px solid ${SC.primary}` : '2px solid transparent',
          marginBottom: -2,
        }}
      >
        {label}
      </button>
    );
  };

  const filterChip = (val, label) => {
    const active = filterStatus === val;
    return (
      <button
        key={val || 'all'}
        type="button"
        onClick={() => setFilterStatus(val)}
        style={{
          padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          fontFamily: "'Inter', sans-serif", border: '1.5px solid',
          borderColor: active ? SC.primary : C.border,
          background: active ? (isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF') : C.cardBg,
          color: active ? SC.primary : C.muted,
        }}
      >
        {label}
      </button>
    );
  };

  const enrollColumns = useMemo(() => [
    {
      id: 'customer',
      header: 'Customer',
      accessorFn: (row) => `${row.customer?.name || ''} ${row.customer?.phone || ''}`,
      cell: ({ row: { original: e } }) => (
        <>
          <div style={{ fontWeight: 700, color: C.text }}>{e.customer?.name || '—'}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{e.customer?.phone}</div>
        </>
      ),
    },
    {
      id: 'plan',
      header: 'Plan',
      accessorFn: (row) => row.plan?.name,
      cell: ({ row: { original: e } }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: C.text }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.plan?.color || '#6366f1' }} />
          {e.plan?.name || '—'}
        </span>
      ),
    },
    { id: 'start_date', header: 'Start', accessorKey: 'start_date' },
    { id: 'end_date', header: 'End', accessorFn: (row) => row.end_date || '—' },
    { id: 'credits', header: 'Credits', accessorKey: 'free_credits_remaining', meta: { align: 'center' } },
    {
      id: 'amount_paid',
      header: 'Amount Paid',
      accessorKey: 'amount_paid',
      cell: ({ row: { original: e } }) => <span style={{ fontWeight: 600, color: '#059669' }}>{Rs(e.amount_paid)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: ({ row: { original: e } }) => <StatusBadge status={e.status} dark={isDark} />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { width: '100px', align: 'center' },
      cell: ({ row: { original: e } }) => e.status === 'active' ? (
        <ActionBtn title="Cancel membership" color="#DC2626" onClick={() => updateEnrollStatus(e.id, 'cancelled')}>
          <IconTrash />
        </ActionBtn>
      ) : null,
    },
  ], [C, isDark]);

  const planColumns = useMemo(() => [
    {
      id: 'name',
      header: 'Plan',
      accessorKey: 'name',
      cell: ({ row: { original: plan } }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: plan.color || '#6366f1', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, color: C.text }}>{plan.name}</span>
          {plan.is_active === false && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: C.muted,
              background: isDark ? '#334155' : '#F3F4F6', padding: '2px 8px', borderRadius: 99,
            }}>
              INACTIVE
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'price',
      header: 'Price',
      accessorFn: (row) => row.price,
      cell: ({ row: { original: plan } }) => (
        <span style={{ fontWeight: 800, color: C.text }}>
          {Rs(plan.price)}
          <span style={{ fontWeight: 500, color: C.muted, fontSize: 12 }}>
            {' '}/ {CYCLES[plan.billing_cycle] || plan.billing_cycle}
          </span>
        </span>
      ),
    },
    { id: 'discount_percent', header: 'Discount %', accessorKey: 'discount_percent', meta: { align: 'center' } },
    { id: 'free_services_count', header: 'Free credits', accessorKey: 'free_services_count', meta: { align: 'center' } },
    {
      id: 'description',
      header: 'Description',
      accessorFn: (row) => row.description || '',
      cell: ({ getValue }) => <span style={{ fontSize: 13, color: C.muted }}>{getValue() || '—'}</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { width: canAdmin ? '160px' : '90px', align: 'center' },
      cell: ({ row: { original: plan } }) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {plan.is_active !== false && (
            <ActionBtn title="Enroll customer" color={SC.purple} onClick={() => openEnrollModal(plan.id)}>
              <IconUsers />
            </ActionBtn>
          )}
          {canAdmin && (
            <>
              <ActionBtn title="Edit plan" onClick={() => openEditPlan(plan)}>
                <IconEdit />
              </ActionBtn>
              <ActionBtn title="Delete plan" color="#DC2626" onClick={() => deletePlan(plan.id)}>
                <IconTrash />
              </ActionBtn>
            </>
          )}
        </div>
      ),
    },
  ], [canAdmin, C, isDark, plans]);

  const selectedEnrollPlan = plans.find((p) => String(p.id) === String(enrollForm.plan_id));

  return (
    <PageWrapper
      title="Membership Plans"
      subtitle="Create loyalty plans and enroll customers with discounts and free service credits."
      actions={
        tab === 'plans' && canAdmin ? (
          <button
            type="button"
            onClick={openCreatePlan}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: C.cardBg, color: C.text,
              border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '8px 18px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}
          >
            <IconPlus /> New Plan
          </button>
        ) : tab === 'enrollments' ? (
          <button
            type="button"
            onClick={() => openEnrollModal()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: C.cardBg, color: C.text,
              border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '8px 18px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}
          >
            <IconPlus /> Enroll Customer
          </button>
        ) : null
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <StatCard label="Total Plans" value={plans.length} icon={<IconStar />} color={SC.primary} />
        <StatCard label="Active Plans" value={activePlans.length} icon={<IconCheck />} color={SC.success} />
        <StatCard label="Active Members" value={activeEnrollments} icon={<IconUsers />} color={SC.purple} />
        <StatCard label="Total Enrollments" value={enrollments.length} icon={<IconDollar />} color={SC.warning} />
      </div>

      <div style={{ display: 'flex', borderBottom: `2px solid ${C.border}`, gap: 0 }}>
        {tabBtn('plans', 'Plans')}
        {tabBtn('enrollments', 'Enrollments')}
      </div>

      {tab === 'plans' && (
        loading ? (
          <DataTable
            columns={planColumns}
            data={[]}
            loading
            emptyMessage="No membership plans yet"
            searchableColumns={[{ id: 'name', title: 'Plan' }]}
          />
        ) : plans.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 20px', borderRadius: 14,
            border: `1.5px dashed ${C.border}`, background: isDark ? C.soft : '#F8FAFC',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>No membership plans yet</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
              {canAdmin ? 'Create your first plan to start enrolling customers.' : 'Ask an admin to create a membership plan.'}
            </div>
            {canAdmin && (
              <Button variant="primary" icon={<IconPlus />} onClick={openCreatePlan}>
                New Membership Plan
              </Button>
            )}
          </div>
        ) : (
          <DataTable
            columns={planColumns}
            data={plans}
            emptyMessage="No membership plans yet"
            searchableColumns={[{ id: 'name', title: 'Plan' }]}
          />
        )
      )}

      {tab === 'enrollments' && (
        <>
          <FilterBar>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {filterChip('', 'All')}
              {Object.keys(STATUS_META).map((s) => filterChip(s, STATUS_META[s].label))}
            </div>
          </FilterBar>
          <DataTable
            columns={enrollColumns}
            data={displayedEnrollments}
            loading={loading}
            emptyMessage="No enrollments yet"
            emptySub="Pick a plan and enroll a customer — amount fills in automatically from the plan price."
            searchableColumns={[
              { id: 'customer', title: 'Customer' },
              { id: 'plan', title: 'Plan' },
            ]}
          />
        </>
      )}

      {/* Plan modal */}
      <Modal
        open={showPlanForm}
        onClose={() => { setShowPlanForm(false); setEditPlan(null); setPlanFormError(''); }}
        title={editPlan ? 'Edit Membership Plan' : 'New Membership Plan'}
        width={640}
        footer={(
          <>
            {editPlan && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 'auto', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={planForm.is_active !== false}
                  onChange={(e) => setPlanForm((p) => ({ ...p, is_active: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: SC.primary }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Active</span>
              </label>
            )}
            <Button variant="secondary" onClick={() => { setShowPlanForm(false); setEditPlan(null); setPlanFormError(''); }}>Cancel</Button>
            <Button type="submit" form="plan-form" variant="primary" loading={saving} disabled={saving}>
              {editPlan ? 'Save Changes' : 'Create Plan'}
            </Button>
          </>
        )}
      >
        {planFormError && (
          <div style={{
            background: isDark ? '#450A0A' : '#FEF2F2', color: isDark ? '#FCA5A5' : '#DC2626',
            padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13,
            border: `1px solid ${isDark ? '#7F1D1D' : '#FECACA'}`, fontWeight: 500,
          }}>
            {planFormError}
          </div>
        )}
        <p style={{ margin: '0 0 16px', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
          {editPlan ? 'Update plan price, benefits, and availability.' : 'Set price, billing cycle, and member benefits. Active plans appear in the enroll flow.'}
        </p>
        <form id="plan-form" onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormGroup label="Plan Name" required>
            <Input
              value={planForm.name}
              onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))}
              required
              placeholder="e.g. Gold Membership"
            />
          </FormGroup>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Price (Rs.)" required>
              <Input
                type="number"
                value={planForm.price}
                onChange={(e) => setPlanForm((p) => ({ ...p, price: e.target.value }))}
                min="0"
                step="0.01"
                required
                placeholder="0.00"
              />
            </FormGroup>
            <FormGroup label="Billing Cycle">
              <Select
                value={planForm.billing_cycle}
                onChange={(e) => setPlanForm((p) => ({ ...p, billing_cycle: e.target.value }))}
              >
                {Object.entries(CYCLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Service Discount (%)">
              <Input
                type="number"
                value={planForm.discount_percent}
                onChange={(e) => setPlanForm((p) => ({ ...p, discount_percent: e.target.value }))}
                min="0"
                max="100"
                step="0.01"
              />
            </FormGroup>
            <FormGroup label="Free Service Credits">
              <Input
                type="number"
                value={planForm.free_services_count}
                onChange={(e) => setPlanForm((p) => ({ ...p, free_services_count: e.target.value }))}
                min="0"
              />
            </FormGroup>
            <FormGroup label="Bonus Loyalty Points">
              <Input
                type="number"
                value={planForm.bonus_loyalty_points}
                onChange={(e) => setPlanForm((p) => ({ ...p, bonus_loyalty_points: e.target.value }))}
                min="0"
              />
            </FormGroup>
            <FormGroup label="Color">
              <Input
                type="color"
                value={planForm.color}
                onChange={(e) => setPlanForm((p) => ({ ...p, color: e.target.value }))}
                style={{ height: 42, padding: 4, cursor: 'pointer' }}
              />
            </FormGroup>
          </div>
          <FormGroup label="Description">
            <Textarea
              value={planForm.description}
              onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Describe the benefits of this plan..."
              rows={3}
            />
          </FormGroup>
        </form>
      </Modal>

      {/* Enroll modal */}
      <Modal
        open={showEnrollForm}
        onClose={() => { setShowEnrollForm(false); setEnrollFormError(''); }}
        title="Enroll Customer"
        width={520}
        footer={(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              {selectedEnrollPlan ? (
                <span>
                  <strong style={{ color: '#059669' }}>{Rs(enrollForm.amount_paid || selectedEnrollPlan.price)}</strong>
                  <span style={{ marginLeft: 8 }}>· {selectedEnrollPlan.name}</span>
                </span>
              ) : (
                <span>Select a plan to see amount</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Button variant="secondary" onClick={() => { setShowEnrollForm(false); setEnrollFormError(''); }}>Cancel</Button>
              <Button type="submit" form="enroll-form" variant="primary" loading={saving} disabled={saving}>Enroll</Button>
            </div>
          </div>
        )}
      >
        {enrollFormError && (
          <div style={{
            background: isDark ? '#450A0A' : '#FEF2F2', color: isDark ? '#FCA5A5' : '#DC2626',
            padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13,
            border: `1px solid ${isDark ? '#7F1D1D' : '#FECACA'}`, fontWeight: 500,
          }}>
            {enrollFormError}
          </div>
        )}
        <p style={{ margin: '0 0 16px', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
          Choose customer and plan. Amount paid defaults to the plan price — adjust if needed.
        </p>
        <form id="enroll-form" onSubmit={handleSaveEnroll} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormGroup label="Customer" required>
            <Select
              value={enrollForm.customer_id}
              onChange={(e) => setEnrollForm((p) => ({ ...p, customer_id: e.target.value }))}
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup label="Plan" required>
            <Select
              value={enrollForm.plan_id}
              onChange={(e) => onEnrollPlanChange(e.target.value)}
              required
            >
              <option value="">Select plan</option>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {Rs(p.price)} / {CYCLES[p.billing_cycle] || p.billing_cycle}</option>
              ))}
            </Select>
          </FormGroup>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Start Date" required>
              <Input
                type="date"
                value={enrollForm.start_date}
                onChange={(e) => setEnrollForm((p) => ({ ...p, start_date: e.target.value }))}
                required
              />
            </FormGroup>
            <FormGroup label="Amount Paid (Rs.)">
              <Input
                type="number"
                value={enrollForm.amount_paid}
                onChange={(e) => setEnrollForm((p) => ({ ...p, amount_paid: e.target.value }))}
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </FormGroup>
          </div>
          <FormGroup label="Notes">
            <Input
              value={enrollForm.notes}
              onChange={(e) => setEnrollForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Optional notes..."
            />
          </FormGroup>
        </form>
      </Modal>
    </PageWrapper>
  );
}
