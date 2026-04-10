import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import AiChatWidget from '../components/ui/AiChatWidget';
import { resolveBrandName } from '../utils/branding';

const colors = {
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  accent: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  dark: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0',
  bg: '#f8fafc',
  white: '#ffffff',
  card: '#ffffff',
};

const STEPS = ['Branch', 'Service', 'Staff & Time', 'Your Details', 'Confirmation'];

const generateTimeSlots = (start = 9, end = 18, interval = 30) => {
  const slots = [];
  for (let h = start; h < end; h++) {
    for (let m = 0; m < 60; m += interval) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

export default function BookingPage() {
  const [step, setStep] = useState(0);
  const [branding, setBranding] = useState({});
  const [branches, setBranches] = useState([]);
  const [services, setServices] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);

  const [form, setForm] = useState({
    branch: null,
    service: null,
    staff: null,
    date: '',
    time: '',
    customer_name: '',
    phone: '',
    email: '',
    notes: '',
  });

  // Fetch branches on mount
  useEffect(() => {
    axios.get('/api/public/branches').then((r) => setBranches(r.data)).catch(() => {});
    axios.get('/api/branding/public').then((r) => setBranding(r.data?.data || r.data || {})).catch(() => {});
  }, []);

  // Fetch services when step = 1
  useEffect(() => {
    if (step === 1 && services.length === 0) {
      axios.get('/api/public/services').then((r) => setServices(r.data)).catch(() => {});
    }
  }, [step]);

  // Fetch staff when branch selected and step = 2
  useEffect(() => {
    if (step === 2 && form.branch) {
      axios
        .get(`/api/public/staff?branchId=${form.branch.id}`)
        .then((r) => setStaffList(r.data))
        .catch(() => {});
    }
  }, [step, form.branch]);

  // Fetch availability when staff + date selected
  useEffect(() => {
    if (form.staff && form.date) {
      axios
        .get(`/api/public/availability?staffId=${form.staff.id}&date=${form.date}`)
        .then((r) => setBookedSlots(r.data))
        .catch(() => {});
    }
  }, [form.staff, form.date]);

  const canContinue = () => {
    switch (step) {
      case 0: return !!form.branch;
      case 1: return !!form.service;
      case 2: return !!form.staff && !!form.date && !!form.time;
      case 3: return form.customer_name.trim() && form.phone.trim();
      default: return false;
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await axios.post('/api/public/bookings', {
        branch_id: form.branch.id,
        service_id: form.service.id,
        staff_id: form.staff.id,
        customer_name: form.customer_name,
        phone: form.phone,
        email: form.email,
        date: form.date,
        time: form.time,
        notes: form.notes,
      });
      setBookingResult(res.data);
      setStep(4);
    } catch (err) {
      alert(err.response?.data?.message || 'Booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({ branch: null, service: null, staff: null, date: '', time: '', customer_name: '', phone: '', email: '', notes: '' });
    setBookingResult(null);
    setStep(0);
  };

  const getMinDate = () => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  };

  const categories = [...new Set(services.map((s) => s.category).filter(Boolean))];
  const filteredServices = categoryFilter ? services.filter((s) => s.category === categoryFilter) : services;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    page: { minHeight: '100vh', background: `linear-gradient(135deg, ${colors.bg} 0%, #e0e7ff 100%)`, fontFamily: "'DM Sans', sans-serif", padding: '20px' },
    container: { maxWidth: 800, margin: '0 auto' },
    header: { textAlign: 'center', marginBottom: 32 },
    logo: { fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 700, color: colors.dark, margin: 0 },
    subtitle: { color: colors.muted, fontSize: 14, marginTop: 4 },
    progressBar: { display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 },
    progressStep: (active, done) => ({
      width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 600, cursor: 'default',
      background: done ? colors.success : active ? colors.primary : colors.white,
      color: done || active ? colors.white : colors.muted,
      border: `2px solid ${done ? colors.success : active ? colors.primary : colors.border}`,
      transition: 'all .2s',
    }),
    progressLine: (done) => ({
      width: 40, height: 2, alignSelf: 'center',
      background: done ? colors.success : colors.border,
    }),
    stepLabel: { display: 'flex', justifyContent: 'center', gap: 48, marginBottom: 24, flexWrap: 'wrap' },
    stepLabelItem: (active) => ({ fontSize: 12, color: active ? colors.primary : colors.muted, fontWeight: active ? 600 : 400, textAlign: 'center', width: 80 }),
    card: { background: colors.white, borderRadius: 16, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,.06)' },
    cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 },
    selectCard: (selected) => ({
      background: selected ? `${colors.primary}08` : colors.white,
      border: `2px solid ${selected ? colors.primary : colors.border}`,
      borderRadius: 12, padding: 20, cursor: 'pointer', transition: 'all .15s',
      transform: selected ? 'scale(1.02)' : 'scale(1)',
    }),
    badge: (bg, text) => ({
      display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: bg, color: text,
    }),
    summaryStrip: {
      background: colors.white, borderRadius: 12, padding: '12px 20px', marginTop: 24,
      display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
      border: `1px solid ${colors.border}`, fontSize: 13, color: colors.muted,
    },
    summaryValue: { fontWeight: 600, color: colors.dark },
    navRow: { display: 'flex', justifyContent: 'space-between', marginTop: 24 },
    btn: (variant = 'primary') => ({
      padding: '10px 28px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
      background: variant === 'primary' ? colors.primary : variant === 'success' ? colors.success : colors.white,
      color: variant === 'outline' ? colors.muted : colors.white,
      border: variant === 'outline' ? `1px solid ${colors.border}` : 'none',
      opacity: 1, transition: 'opacity .15s',
    }),
    filterRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    filterChip: (active) => ({
      padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
      background: active ? colors.primary : `${colors.primary}12`,
      color: active ? colors.white : colors.primary,
    }),
    input: { width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' },
    label: { display: 'block', fontSize: 13, fontWeight: 600, color: colors.dark, marginBottom: 6 },
    timeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 },
    timeSlot: (selected, booked) => ({
      padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 500, textAlign: 'center', cursor: booked ? 'not-allowed' : 'pointer',
      background: booked ? '#f1f5f9' : selected ? colors.primary : colors.white,
      color: booked ? '#94a3b8' : selected ? colors.white : colors.dark,
      border: `1px solid ${booked ? '#e2e8f0' : selected ? colors.primary : colors.border}`,
      textDecoration: booked ? 'line-through' : 'none',
      opacity: booked ? 0.5 : 1,
    }),
    confirmBox: { textAlign: 'center', padding: '40px 0' },
    checkmark: {
      width: 72, height: 72, borderRadius: '50%', background: `${colors.success}15`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
      fontSize: 36, color: colors.success,
    },
    summaryTable: { width: '100%', borderCollapse: 'collapse', marginTop: 20, textAlign: 'left' },
    summaryRow: { borderBottom: `1px solid ${colors.border}` },
    summaryTh: { padding: '10px 12px', fontSize: 13, color: colors.muted, fontWeight: 500 },
    summaryTd: { padding: '10px 12px', fontSize: 14, color: colors.dark, fontWeight: 600 },
    adminLink: { position: 'fixed', top: 12, right: 20, fontSize: 12, color: colors.muted, textDecoration: 'none' },
  };

  // ── Step Renderers ──────────────────────────────────────────────────────────

  const renderBranch = () => (
    <div>
      <h2 style={{ fontSize: 20, color: colors.dark, marginBottom: 4 }}>Choose a Branch</h2>
      <p style={{ color: colors.muted, fontSize: 13, marginBottom: 20 }}>Select the salon location you'd like to visit</p>
      <div style={S.cardGrid}>
        {branches.map((b) => (
          <div key={b.id} style={S.selectCard(form.branch?.id === b.id)} onClick={() => setForm((p) => ({ ...p, branch: b, staff: null, time: '' }))}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: b.color || colors.primary, marginBottom: 10 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.dark }}>{b.name}</div>
            {b.address && <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{b.address}</div>}
            {b.phone && <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>📞 {b.phone}</div>}
          </div>
        ))}
      </div>
      {branches.length === 0 && <p style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>No branches available at the moment.</p>}
    </div>
  );

  const renderService = () => (
    <div>
      <h2 style={{ fontSize: 20, color: colors.dark, marginBottom: 4 }}>Choose a Service</h2>
      <p style={{ color: colors.muted, fontSize: 13, marginBottom: 20 }}>Select the treatment you'd like</p>
      {categories.length > 0 && (
        <div style={S.filterRow}>
          <button style={S.filterChip(!categoryFilter)} onClick={() => setCategoryFilter('')}>All</button>
          {categories.map((c) => (
            <button key={c} style={S.filterChip(categoryFilter === c)} onClick={() => setCategoryFilter(c)}>{c}</button>
          ))}
        </div>
      )}
      <div style={S.cardGrid}>
        {filteredServices.map((s) => (
          <div key={s.id} style={S.selectCard(form.service?.id === s.id)} onClick={() => setForm((p) => ({ ...p, service: s }))}>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.dark }}>{s.name}</div>
            {s.category && <span style={S.badge(`${colors.accent}18`, colors.accent)}>{s.category}</span>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
              <span style={{ color: colors.muted }}>⏱ {s.duration_minutes} min</span>
              <span style={{ fontWeight: 700, color: colors.primary }}>₹{Number(s.price).toFixed(0)}</span>
            </div>
            {s.description && <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>{s.description}</div>}
          </div>
        ))}
      </div>
    </div>
  );

  const renderStaffTime = () => (
    <div>
      <h2 style={{ fontSize: 20, color: colors.dark, marginBottom: 4 }}>Select Staff & Time</h2>
      <p style={{ color: colors.muted, fontSize: 13, marginBottom: 20 }}>Pick your preferred stylist and available time slot</p>

      {/* Staff selection */}
      <label style={S.label}>Stylist</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {staffList.map((s) => (
          <div
            key={s.id}
            style={{
              ...S.selectCard(form.staff?.id === s.id),
              padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 160,
            }}
            onClick={() => setForm((p) => ({ ...p, staff: s, time: '' }))}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: `${colors.accent}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: colors.accent, fontSize: 14,
            }}>
              {s.name.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.dark }}>{s.name}</div>
              {s.role_title && <div style={{ fontSize: 11, color: colors.muted }}>{s.role_title}</div>}
            </div>
          </div>
        ))}
        {staffList.length === 0 && <p style={{ color: colors.muted }}>No staff available for this branch.</p>}
      </div>

      {/* Date picker */}
      <div style={{ marginBottom: 20 }}>
        <label style={S.label}>Date</label>
        <input
          type="date"
          style={S.input}
          value={form.date}
          min={getMinDate()}
          onChange={(e) => setForm((p) => ({ ...p, date: e.target.value, time: '' }))}
        />
      </div>

      {/* Time slots */}
      {form.staff && form.date && (
        <div>
          <label style={S.label}>Available Time Slots</label>
          <div style={S.timeGrid}>
            {TIME_SLOTS.map((t) => {
              const booked = bookedSlots.includes(t);
              return (
                <div
                  key={t}
                  style={S.timeSlot(form.time === t, booked)}
                  onClick={() => !booked && setForm((p) => ({ ...p, time: t }))}
                >
                  {t}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderDetails = () => (
    <div>
      <h2 style={{ fontSize: 20, color: colors.dark, marginBottom: 4 }}>Your Details</h2>
      <p style={{ color: colors.muted, fontSize: 13, marginBottom: 20 }}>Please provide your contact information</p>
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label style={S.label}>Full Name *</label>
          <input style={S.input} value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} placeholder="John Doe" />
        </div>
        <div>
          <label style={S.label}>Phone Number *</label>
          <input style={S.input} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" />
        </div>
        <div>
          <label style={S.label}>Email (optional)</label>
          <input style={S.input} type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="you@email.com" />
        </div>
        <div>
          <label style={S.label}>Notes (optional)</label>
          <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Any special requests..." />
        </div>
      </div>
    </div>
  );

  const renderConfirmation = () => (
    <div style={S.confirmBox}>
      <div style={S.checkmark}>✓</div>
      <h2 style={{ fontSize: 24, color: colors.dark, marginBottom: 4, fontFamily: "'Cormorant Garamond', serif" }}>Booking Confirmed!</h2>
      <p style={{ color: colors.muted, fontSize: 14, marginBottom: 8 }}>
        Your appointment has been submitted and is <strong style={{ color: colors.warning }}>pending confirmation</strong>.
      </p>
      {bookingResult?.id && (
        <p style={{ fontSize: 13, color: colors.muted }}>Booking Reference: <strong style={{ color: colors.dark }}>#{bookingResult.id}</strong></p>
      )}

      <table style={S.summaryTable}>
        <tbody>
          <tr style={S.summaryRow}><td style={S.summaryTh}>Branch</td><td style={S.summaryTd}>{form.branch?.name}</td></tr>
          <tr style={S.summaryRow}><td style={S.summaryTh}>Service</td><td style={S.summaryTd}>{form.service?.name}</td></tr>
          <tr style={S.summaryRow}><td style={S.summaryTh}>Stylist</td><td style={S.summaryTd}>{form.staff?.name}</td></tr>
          <tr style={S.summaryRow}><td style={S.summaryTh}>Date & Time</td><td style={S.summaryTd}>{form.date} at {form.time}</td></tr>
          <tr style={S.summaryRow}><td style={S.summaryTh}>Duration</td><td style={S.summaryTd}>{form.service?.duration_minutes} minutes</td></tr>
          <tr style={S.summaryRow}><td style={S.summaryTh}>Price</td><td style={S.summaryTd}>₹{Number(form.service?.price || 0).toFixed(0)}</td></tr>
          <tr style={S.summaryRow}><td style={S.summaryTh}>Customer</td><td style={S.summaryTd}>{form.customer_name}</td></tr>
          <tr style={S.summaryRow}><td style={S.summaryTh}>Phone</td><td style={S.summaryTd}>{form.phone}</td></tr>
        </tbody>
      </table>

      <div style={{ marginTop: 28, padding: 16, background: `${colors.success}08`, borderRadius: 10, border: `1px solid ${colors.success}30`, textAlign: 'left' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.success, marginBottom: 6 }}>📋 Cancellation Policy</div>
        <p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>
          Please contact us at least 2 hours before your appointment if you need to cancel or reschedule.
        </p>
      </div>

      <button style={{ ...S.btn('primary'), marginTop: 24 }} onClick={resetForm}>Book Another Appointment</button>
    </div>
  );

  const stepRenderers = [renderBranch, renderService, renderStaffTime, renderDetails, renderConfirmation];

  return (
    <>
    <div style={S.page}>
      {/* Admin link */}
      <a href="/login" style={S.adminLink}>← Back to Management</a>

      <div style={S.container}>
        {/* Header */}
        <div style={S.header}>
          <h1 style={S.logo}>{resolveBrandName(branding)}</h1>
          <p style={S.subtitle}>Book your appointment online</p>
        </div>

        {/* Progress indicator */}
        {step < 4 && (
          <>
            <div style={S.progressBar}>
              {STEPS.slice(0, -1).map((_, i) => (
                <React.Fragment key={i}>
                  <div style={S.progressStep(i === step, i < step)}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  {i < STEPS.length - 2 && <div style={S.progressLine(i < step)} />}
                </React.Fragment>
              ))}
            </div>
            <div style={S.stepLabel}>
              {STEPS.slice(0, -1).map((label, i) => (
                <span key={i} style={S.stepLabelItem(i === step)}>{label}</span>
              ))}
            </div>
          </>
        )}

        {/* Step content */}
        <div style={S.card}>
          {stepRenderers[step]()}
        </div>

        {/* Booking summary strip */}
        {step > 0 && step < 4 && (
          <div style={S.summaryStrip}>
            {form.branch && <span>📍 <span style={S.summaryValue}>{form.branch.name}</span></span>}
            {form.service && <span>✂️ <span style={S.summaryValue}>{form.service.name}</span> — ₹{Number(form.service.price).toFixed(0)}</span>}
            {form.staff && <span>👤 <span style={S.summaryValue}>{form.staff.name}</span></span>}
            {form.date && <span>📅 <span style={S.summaryValue}>{form.date}</span></span>}
            {form.time && <span>🕐 <span style={S.summaryValue}>{form.time}</span></span>}
          </div>
        )}

        {/* Navigation */}
        {step < 4 && (
          <div style={S.navRow}>
            <button
              style={{ ...S.btn('outline'), visibility: step === 0 ? 'hidden' : 'visible' }}
              onClick={() => setStep((s) => s - 1)}
            >
              ← Back
            </button>

            {step < 3 ? (
              <button
                style={{ ...S.btn('primary'), opacity: canContinue() ? 1 : 0.5, cursor: canContinue() ? 'pointer' : 'not-allowed' }}
                disabled={!canContinue()}
                onClick={() => setStep((s) => s + 1)}
              >
                Continue →
              </button>
            ) : (
              <button
                style={{ ...S.btn('success'), opacity: canContinue() && !submitting ? 1 : 0.5, cursor: canContinue() && !submitting ? 'pointer' : 'not-allowed' }}
                disabled={!canContinue() || submitting}
                onClick={handleSubmit}
              >
                {submitting ? 'Booking...' : 'Confirm Booking ✓'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
    <AiChatWidget />
    </>
  );
}
