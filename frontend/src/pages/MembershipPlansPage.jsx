import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { StatCard } from '../components/ui/PageKit';


const Rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const CYCLES = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', one_time: 'One-time' };
const STATUS_COLOR = {
  active:    { bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
  expired:   { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  cancelled: { bg: '#F3F4F6', text: '#374151', border: '#E5E7EB' },
  paused:    { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
};

const PLAN_COLORS = [
  { gradient: 'linear-gradient(135deg, #2563EB, #3B82F6)', light: '#EFF6FF', border: '#BFDBFE', text: '#2563EB' },
  { gradient: 'linear-gradient(135deg, #7C3AED, #A855F7)', light: '#FAF5FF', border: '#DDD6FE', text: '#7C3AED' },
  { gradient: 'linear-gradient(135deg, #059669, #10B981)', light: '#ECFDF5', border: '#A7F3D0', text: '#059669' },
  { gradient: 'linear-gradient(135deg, #DC2626, #EF4444)', light: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
  { gradient: 'linear-gradient(135deg, #D97706, #F59E0B)', light: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  { gradient: 'linear-gradient(135deg, #0891B2, #06B6D4)', light: '#ECFEFF', border: '#A5F3FC', text: '#0891B2' },
];

const getPlanTheme = (color, idx) => {
  const hex = (color || '').toLowerCase();
  if (hex.includes('7c3aed') || hex.includes('6366f1') || hex.includes('8b5cf6')) return PLAN_COLORS[1];
  if (hex.includes('059669') || hex.includes('10b981') || hex.includes('22c55e')) return PLAN_COLORS[2];
  if (hex.includes('dc2626') || hex.includes('ef4444') || hex.includes('f43f5e')) return PLAN_COLORS[3];
  if (hex.includes('d97706') || hex.includes('f59e0b') || hex.includes('eab308')) return PLAN_COLORS[4];
  if (hex.includes('0891b2') || hex.includes('06b6d4') || hex.includes('0ea5e9')) return PLAN_COLORS[5];
  return PLAN_COLORS[idx % PLAN_COLORS.length];
};

export default function MembershipPlansPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canAdmin = ['superadmin', 'admin'].includes(user?.role);

  const [plans, setPlans]             = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [customers, setCustomers]     = useState([]);
  const [tab, setTab]                 = useState('plans');
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editPlan, setEditPlan]       = useState(null);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [loading, setLoading]         = useState(true);

  const blankPlan = { name: '', description: '', price: '', billing_cycle: 'monthly', discount_percent: 0, free_services_count: 0, bonus_loyalty_points: 0, color: '#6366f1' };
  const [planForm, setPlanForm]       = useState(blankPlan);
  const [enrollForm, setEnrollForm]   = useState({ customer_id: '', plan_id: '', start_date: new Date().toISOString().slice(0, 10), amount_paid: '', notes: '' });

  const loadPlans = useCallback(() => api.get('/membership/plans').then((r) => setPlans(Array.isArray(r.data) ? r.data : [])).catch(() => {}), []);
  const loadEnrollments = useCallback(() => {
    setLoading(true);
    api.get('/membership/enrollments').then((r) => setEnrollments(Array.isArray(r.data) ? r.data : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPlans(); loadEnrollments(); }, [loadPlans, loadEnrollments]);
  useEffect(() => {
    api.get('/customers').then((r) => {
      const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      setCustomers(list);
    }).catch(() => {});
  }, []);

  const savePlan = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editPlan) {
        await api.put(`/membership/plans/${editPlan.id}`, planForm);
        addToast('Plan updated', 'success');
      } else {
        await api.post('/membership/plans', planForm);
        addToast('Plan created', 'success');
      }
      setShowPlanForm(false);
      setEditPlan(null);
      setPlanForm(blankPlan);
      loadPlans();
    } catch (err) { addToast(err.response?.data?.message || 'Error', 'error'); }
    setSaving(false);
  };

  const deletePlan = async (id) => {
    if (!window.confirm('Delete/deactivate this plan?')) return;
    try {
      await api.delete(`/membership/plans/${id}`);
      addToast('Plan removed', 'success');
      loadPlans();
    } catch { addToast('Error', 'error'); }
  };

  const saveEnroll = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/membership/enroll', enrollForm);
      addToast('Customer enrolled!', 'success');
      setShowEnrollForm(false);
      setEnrollForm({ customer_id: '', plan_id: '', start_date: new Date().toISOString().slice(0, 10), amount_paid: '', notes: '' });
      loadEnrollments();
    } catch (err) { addToast(err.response?.data?.message || 'Error', 'error'); }
    setSaving(false);
  };

  const updateEnrollStatus = async (id, status) => {
    try {
      await api.patch(`/membership/enrollments/${id}/status`, { status });
      addToast('Updated', 'success');
      loadEnrollments();
    } catch { addToast('Error', 'error'); }
  };

  const activeEnrollments = enrollments.filter((e) => e.status === 'active').length;
  const activePlans = plans.filter((p) => p.is_active !== false).length;

  const inp = {
    padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 13.5,
    width: '100%', boxSizing: 'border-box', fontFamily: "'Inter', sans-serif",
    outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
    background: '#FAFBFC',
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: '#344054', marginBottom: 6, display: 'block', fontFamily: "'Inter', sans-serif" };

  const actionBtn = (
    <div style={{ display: 'flex', gap: 8 }}>
      {canAdmin && tab === 'plans' && (
        <button
          onClick={() => { setEditPlan(null); setPlanForm(blankPlan); setShowPlanForm(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', background: 'linear-gradient(135deg, #2563EB, #3B82F6)',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700, color: '#fff',
            boxShadow: '0 2px 10px rgba(37,99,235,0.35)',
            transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
          }}
        >
          + New Plan
        </button>
      )}
      {tab === 'enrollments' && (
        <button
          onClick={() => setShowEnrollForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700, color: '#fff',
            boxShadow: '0 2px 10px rgba(124,58,237,0.35)',
            transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
          }}
        >
          + Enroll Customer
        </button>
      )}
    </div>
  );

  return (
    <PageWrapper
      title="Membership Plans"
      subtitle="Create and manage customer loyalty membership plans. Reward your best customers with exclusive benefits."
      actions={actionBtn}
    >

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <StatCard label="Total Plans"         value={plans.length}       color="#2563EB" />
        <StatCard label="Active Plans"        value={activePlans}        color="#059669" />
        <StatCard label="Active Members"      value={activeEnrollments}  color="#7C3AED" />
        <StatCard label="Total Enrollments"   value={enrollments.length} color="#D97706" />
      </div>

      {/* ── Hero Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
          borderRadius: 18, padding: '28px 32px',
          boxShadow: '0 8px 32px rgba(37,99,235,0.22)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-30, right:80, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16, position:'relative' }}>
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.07em',
              textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99,
              border: '1px solid rgba(255,255,255,0.25)',
              fontFamily: "'Inter', sans-serif",
            }}>
              Membership
            </span>
            <h2 style={{
              margin: '12px 0 2px', fontSize: 28, fontWeight: 900, color: '#fff',
              lineHeight: 1.1, fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.5px',
            }}>
              Membership Overview
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.72)', fontFamily: "'Inter', sans-serif", maxWidth: 480 }}>
              {plans.length === 0
                ? 'Get started by creating your first membership plan to reward loyal customers.'
                : `You have ${activePlans} active plan${activePlans !== 1 ? 's' : ''} with ${activeEnrollments} enrolled member${activeEnrollments !== 1 ? 's' : ''}.`}
            </p>
            {/* Enrollment bar */}
            {plans.length > 0 && (
              <div style={{ marginTop: 16, maxWidth: 360 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
                    Enrollment rate
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
                    {activeEnrollments} active member{activeEnrollments !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ height: 7, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, enrollments.length > 0 ? (activeEnrollments / enrollments.length) * 100 : 0)}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    style={{ height: '100%', background: 'rgba(255,255,255,0.85)', borderRadius: 99 }}
                  />
                </div>
              </div>
            )}
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 99, padding: '6px 16px',
            fontSize: 12, fontWeight: 700, color: '#fff',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: "'Inter', sans-serif",
          }}>
            {activePlans} Active
          </div>
        </div>
      </motion.div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { key: 'plans', label: 'Plans', icon: '📋' },
          { key: 'enrollments', label: 'Enrollments', icon: '👥' },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', border: tab === key ? 'none' : '1.5px solid #EAECF0',
              background: tab === key ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : '#fff',
              color: tab === key ? '#fff' : '#344054',
              boxShadow: tab === key ? '0 2px 10px rgba(37,99,235,0.30)' : '0 1px 4px rgba(16,24,40,0.06)',
              transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── Plan Form Modal ── */}
      {showPlanForm && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 18,
            padding: '26px 28px', boxShadow: '0 4px 20px rgba(16,24,40,0.08)',
          }}
        >
          <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
            {editPlan ? 'Edit Plan' : 'New Membership Plan'}
          </h3>
          <form onSubmit={savePlan}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Plan Name *</label>
                <input style={inp} value={planForm.name} onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))} required placeholder="e.g. Gold Membership" />
              </div>
              <div>
                <label style={lbl}>Price (Rs.) *</label>
                <input type="number" style={inp} value={planForm.price} onChange={(e) => setPlanForm((p) => ({ ...p, price: e.target.value }))} min="0" step="0.01" required placeholder="0.00" />
              </div>
              <div>
                <label style={lbl}>Billing Cycle</label>
                <select style={inp} value={planForm.billing_cycle} onChange={(e) => setPlanForm((p) => ({ ...p, billing_cycle: e.target.value }))}>
                  {Object.entries(CYCLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Service Discount (%)</label>
                <input type="number" style={inp} value={planForm.discount_percent} onChange={(e) => setPlanForm((p) => ({ ...p, discount_percent: e.target.value }))} min="0" max="100" step="0.01" placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Free Service Credits</label>
                <input type="number" style={inp} value={planForm.free_services_count} onChange={(e) => setPlanForm((p) => ({ ...p, free_services_count: e.target.value }))} min="0" placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Bonus Loyalty Points</label>
                <input type="number" style={inp} value={planForm.bonus_loyalty_points} onChange={(e) => setPlanForm((p) => ({ ...p, bonus_loyalty_points: e.target.value }))} min="0" placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Color</label>
                <input type="color" style={{ ...inp, height: 42, padding: 4, cursor: 'pointer' }} value={planForm.color} onChange={(e) => setPlanForm((p) => ({ ...p, color: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Description</label>
                <textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={planForm.description} onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))} placeholder="Describe the benefits of this plan..." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '10px 24px', background: 'linear-gradient(135deg, #2563EB, #3B82F6)',
                  color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                  boxShadow: '0 2px 10px rgba(37,99,235,0.35)', transition: 'all 0.15s',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {saving ? 'Saving…' : editPlan ? 'Update Plan' : 'Create Plan'}
              </button>
              <button
                type="button"
                onClick={() => { setShowPlanForm(false); setEditPlan(null); }}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: '1.5px solid #EAECF0',
                  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: '#344054', fontFamily: "'Inter', sans-serif",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* ── Plans Grid ── */}
      {tab === 'plans' && (
        <>
          {plans.length > 0 && (
            <div>
              <h2 style={{
                margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#101828',
                fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.3px',
              }}>
                Your Membership Plans
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#667085', fontFamily: "'Inter', sans-serif" }}>
                Manage plans and customize benefits for your customers.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {plans.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  width: '100%', textAlign: 'center', padding: '50px 20px',
                  background: 'linear-gradient(135deg, #F9FAFB, #F3F4F6)',
                  borderRadius: 18, border: '2px dashed #D1D5DB',
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>
                  No membership plans yet
                </div>
                <div style={{ fontSize: 13, color: '#667085', fontFamily: "'Inter', sans-serif" }}>
                  Create your first plan to start enrolling customers.
                </div>
              </motion.div>
            )}

            {plans.map((plan, i) => {
              const theme = getPlanTheme(plan.color, i);
              const features = [];
              if (plan.discount_percent > 0) features.push(`${plan.discount_percent}% off all services`);
              if (plan.free_services_count > 0) features.push(`${plan.free_services_count} free service credits`);
              if (plan.bonus_loyalty_points > 0) features.push(`${plan.bonus_loyalty_points} bonus loyalty points`);
              if (plan.billing_cycle) features.push(`Billed ${CYCLES[plan.billing_cycle]?.toLowerCase() || plan.billing_cycle}`);

              const isMostExpensive = plans.length > 1 && plan.price === Math.max(...plans.map(p => Number(p.price || 0)));

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.07 }}
                  whileHover={{ translateY: -3 }}
                  style={{
                    flex: 1, minWidth: 250,
                    background: isMostExpensive ? `linear-gradient(160deg, ${theme.light} 0%, ${theme.light}CC 100%)` : '#fff',
                    border: `1.5px solid ${isMostExpensive ? theme.text : '#EAECF0'}`,
                    borderRadius: 18, padding: '26px 22px',
                    position: 'relative',
                    boxShadow: isMostExpensive ? `0 8px 32px ${theme.text}22` : '0 2px 8px rgba(16,24,40,0.06)',
                    display: 'flex', flexDirection: 'column',
                    transition: 'box-shadow 0.18s',
                  }}
                >
                  {isMostExpensive && (
                    <div style={{
                      position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                      background: theme.gradient,
                      color: '#fff', fontSize: 11, fontWeight: 800,
                      padding: '4px 16px', borderRadius: 99,
                      letterSpacing: '0.07em', textTransform: 'uppercase',
                      boxShadow: `0 2px 8px ${theme.text}55`,
                      whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif",
                    }}>
                      Most Popular
                    </div>
                  )}

                  {/* Plan header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: 17, fontWeight: 800, color: theme.text, fontFamily: "'Sora', 'Manrope', sans-serif" }}>
                        {plan.name}
                      </span>
                      {plan.is_active === false && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 8px', borderRadius: 99 }}>
                          INACTIVE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {plan.description && (
                    <p style={{ fontSize: 12.5, color: '#667085', margin: '0 0 14px', lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
                      {plan.description}
                    </p>
                  )}

                  {/* Price */}
                  <div style={{ marginBottom: 18 }}>
                    <span style={{ fontSize: 29, fontWeight: 900, color: '#101828', fontFamily: "'Sora', sans-serif" }}>
                      {Rs(plan.price)}
                    </span>
                    <span style={{ fontSize: 13.5, color: '#98A2B3', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
                      {' '}/ {CYCLES[plan.billing_cycle] || plan.billing_cycle}
                    </span>
                  </div>

                  {/* Features */}
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', flexGrow: 1 }}>
                    {features.map((f) => (
                      <li key={f} style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '5px 0', fontSize: 13.5, color: '#344054',
                        borderBottom: '1px solid #F2F4F7',
                        fontFamily: "'Inter', sans-serif",
                      }}>
                        <span style={{ color: theme.text, flexShrink: 0, fontSize: 13 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* Action Buttons */}
                  {canAdmin && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setEditPlan(plan); setPlanForm(plan); setShowPlanForm(true); }}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: 10,
                          background: theme.light, border: `1.5px solid ${theme.border}`,
                          cursor: 'pointer', fontSize: 13, fontWeight: 700,
                          color: theme.text, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 6, transition: 'all 0.15s',
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deletePlan(plan.id)}
                        style={{
                          padding: '10px 14px', borderRadius: 10,
                          border: '1.5px solid #FECACA', background: '#FEF2F2',
                          cursor: 'pointer', color: '#DC2626', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Enroll Form Modal ── */}
      {showEnrollForm && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 18,
            padding: '26px 28px', boxShadow: '0 4px 20px rgba(16,24,40,0.08)',
          }}
        >
          <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
            Enroll Customer
          </h3>
          <form onSubmit={saveEnroll}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div>
                <label style={lbl}>Customer *</label>
                <select style={inp} value={enrollForm.customer_id} onChange={(e) => setEnrollForm((p) => ({ ...p, customer_id: e.target.value }))} required>
                  <option value="">Select customer</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Plan *</label>
                <select style={inp} value={enrollForm.plan_id} onChange={(e) => setEnrollForm((p) => ({ ...p, plan_id: e.target.value }))} required>
                  <option value="">Select plan</option>
                  {plans.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} — {Rs(p.price)}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Start Date *</label>
                <input type="date" style={inp} value={enrollForm.start_date} onChange={(e) => setEnrollForm((p) => ({ ...p, start_date: e.target.value }))} required />
              </div>
              <div>
                <label style={lbl}>Amount Paid (Rs.)</label>
                <input type="number" style={inp} value={enrollForm.amount_paid} onChange={(e) => setEnrollForm((p) => ({ ...p, amount_paid: e.target.value }))} min="0" step="0.01" placeholder="0.00" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Notes</label>
                <input style={inp} value={enrollForm.notes} onChange={(e) => setEnrollForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '10px 24px', background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                  color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                  boxShadow: '0 2px 10px rgba(124,58,237,0.35)', transition: 'all 0.15s',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {saving ? 'Saving…' : 'Enroll'}
              </button>
              <button
                type="button"
                onClick={() => setShowEnrollForm(false)}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: '1.5px solid #EAECF0',
                  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: '#344054', fontFamily: "'Inter', sans-serif",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* ── Enrollments Table ── */}
      {tab === 'enrollments' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: 50, color: '#6B7280' }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>Loading…</motion.div>
          </div>
        ) : enrollments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              textAlign: 'center', padding: '50px 20px',
              background: 'linear-gradient(135deg, #FAF5FF, #F3E8FF)',
              borderRadius: 18, border: '2px dashed #DDD6FE',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>
              No enrollments yet
            </div>
            <div style={{ fontSize: 13, color: '#667085', fontFamily: "'Inter', sans-serif" }}>
              Enroll your first customer in a membership plan.
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: '#fff', borderRadius: 18, border: '1.5px solid #EAECF0',
              boxShadow: '0 2px 10px rgba(16,24,40,0.06)', overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Inter', sans-serif" }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    {['Customer', 'Plan', 'Start', 'End', 'Credits', 'Amount Paid', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'left', fontWeight: 700,
                        color: '#344054', fontSize: 11, textTransform: 'uppercase',
                        letterSpacing: '0.05em', borderBottom: '2px solid #EAECF0',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e, idx) => {
                    const sc = STATUS_COLOR[e.status] || STATUS_COLOR.active;
                    return (
                      <motion.tr
                        key={e.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        style={{ borderBottom: '1px solid #F2F4F7' }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, color: '#101828' }}>{e.customer?.name || '—'}</div>
                          <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 1 }}>{e.customer?.phone}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontWeight: 600, color: '#344054',
                          }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: e.plan?.color || '#6366f1', flexShrink: 0,
                            }} />
                            {e.plan?.name || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#667085' }}>{e.start_date}</td>
                        <td style={{ padding: '12px 16px', color: '#667085' }}>{e.end_date || '—'}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#101828' }}>{e.free_credits_remaining}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{Rs(e.amount_paid)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                            background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
                            textTransform: 'capitalize',
                          }}>
                            {e.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {e.status === 'active' && (
                            <button
                              onClick={() => updateEnrollStatus(e.id, 'cancelled')}
                              style={{
                                padding: '5px 12px', borderRadius: 8,
                                border: '1.5px solid #FECACA', background: '#FEF2F2',
                                color: '#DC2626', cursor: 'pointer', fontSize: 11,
                                fontWeight: 700, transition: 'all 0.15s',
                                fontFamily: "'Inter', sans-serif",
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )
      )}

      {/* ── Footer ── */}
      <p style={{ margin: 0, fontSize: 12, color: '#98A2B3', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
        Membership plans help retain customers with exclusive benefits and rewards.
      </p>
    </PageWrapper>
  );
}
