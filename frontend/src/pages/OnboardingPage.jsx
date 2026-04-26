import React, { useState } from 'react';
import api from '../api/axios';

/**
 * OnboardingPage
 *
 * Multi-step self-service registration for new salon businesses.
 * Creates a new tenant + branch + admin user via POST /api/onboarding/register.
 * On success, redirects to the new tenant's subdomain.
 *
 * This page is served at salon.hexalyte.com/signup or admin.hexalyte.com/signup.
 */
const STEPS = ['Business', 'Account', 'Done'];

const OnboardingPage = () => {
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [slugAvailable, setSlugAvailable] = useState(null);
  const [checkingSlug, setCheckingSlug]   = useState(false);

  const [form, setForm] = useState({
    businessName: '',
    slug:         '',
    ownerEmail:   '',
    ownerName:    '',
    password:     '',
    phone:        '',
  });

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (field === 'slug') setSlugAvailable(null);
  };

  // Auto-generate slug from business name
  const handleBusinessNameBlur = () => {
    if (!form.slug && form.businessName) {
      const auto = form.businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      setForm((f) => ({ ...f, slug: auto }));
    }
  };

  const checkSlug = async () => {
    if (!form.slug) return;
    setCheckingSlug(true);
    try {
      const res = await api.get(`/onboarding/check-slug?slug=${encodeURIComponent(form.slug)}`);
      setSlugAvailable(res.data.available);
    } catch {
      setSlugAvailable(null);
    } finally {
      setCheckingSlug(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/onboarding/register', form);
      const { slug } = res.data.tenant;
      // Clear theme preferences so the new account starts with clean defaults
      ['salon-theme-mode', 'salon-sidebar-style', 'salon-primary-color', 'salon-font-family', 'salon-sidebar-appearance', 'salon-table-style'].forEach((k) => localStorage.removeItem(k));
      // Redirect to the new tenant subdomain
      window.location.href = `https://${slug}.salon.hexalyte.com/dashboard`;
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Header */}
        <div style={s.logo}>💇 Zane Salon Platform</div>
        <h2 style={s.title}>Create your salon account</h2>

        {/* Step indicator */}
        <div style={s.steps}>
          {STEPS.map((label, i) => (
            <div key={label} style={s.step(i === step)}>
              <span style={s.stepDot(i <= step)}>{i + 1}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Step 0: Business Info */}
          {step === 0 && (
            <div>
              <label style={s.label}>Business Name *</label>
              <input
                style={s.input}
                value={form.businessName}
                onChange={set('businessName')}
                onBlur={handleBusinessNameBlur}
                placeholder="Zane Beauty Salon"
                required
              />

              <label style={s.label}>Your URL (Slug) *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...s.input, flex: 1, margin: 0 }}
                  value={form.slug}
                  onChange={set('slug')}
                  onBlur={checkSlug}
                  placeholder="zane-salon"
                  pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]"
                  required
                />
                <button type="button" style={s.checkBtn} onClick={checkSlug} disabled={checkingSlug}>
                  {checkingSlug ? '...' : 'Check'}
                </button>
              </div>
              <div style={s.urlPreview}>
                {form.slug ? `https://${form.slug}.salon.hexalyte.com` : 'Enter a slug above'}
              </div>
              {slugAvailable === true  && <div style={s.ok}>✓ Available</div>}
              {slugAvailable === false && <div style={s.bad}>✗ Already taken</div>}

              <label style={s.label}>Business Phone (optional)</label>
              <input style={s.input} value={form.phone} onChange={set('phone')} placeholder="+94 77 123 4567" />

              <button
                type="button"
                style={s.btn}
                disabled={!form.businessName || !form.slug || slugAvailable === false}
                onClick={() => setStep(1)}
              >
                Next →
              </button>
            </div>
          )}

          {/* Step 1: Account Info */}
          {step === 1 && (
            <div>
              <label style={s.label}>Your Name *</label>
              <input style={s.input} value={form.ownerName} onChange={set('ownerName')} placeholder="Akila Eranda" required />

              <label style={s.label}>Email Address *</label>
              <input style={s.input} type="email" value={form.ownerEmail} onChange={set('ownerEmail')} placeholder="you@example.com" required />

              <label style={s.label}>Password * (min 8 characters)</label>
              <input style={s.input} type="password" value={form.password} onChange={set('password')} minLength={8} required />

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="button" style={{ ...s.btn, background: '#6b7280', flex: 1 }} onClick={() => setStep(0)}>
                  ← Back
                </button>
                <button type="submit" style={{ ...s.btn, flex: 2 }} disabled={loading}>
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </div>

              <p style={s.note}>
                By creating an account you agree to our Terms of Service. Your 14-day free trial starts now.
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

const s = {
  page:    { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 20 },
  card:    { background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 480, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' },
  logo:    { fontSize: 22, fontWeight: 700, marginBottom: 8, textAlign: 'center' },
  title:   { fontSize: 20, fontWeight: 600, textAlign: 'center', marginBottom: 24, color: '#1e293b' },
  steps:   { display: 'flex', gap: 8, marginBottom: 24 },
  step:    (active) => ({ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: active ? '#6366f1' : '#94a3b8', fontWeight: active ? 600 : 400 }),
  stepDot: (done)   => ({ width: 22, height: 22, borderRadius: '50%', background: done ? '#6366f1' : '#e2e8f0', color: done ? '#fff' : '#94a3b8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }),
  label:   { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4, marginTop: 14 },
  input:   { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', marginBottom: 4 },
  btn:     { width: '100%', padding: '10px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 20 },
  checkBtn: { padding: '9px 14px', background: '#e2e8f0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  urlPreview: { fontSize: 12, color: '#6b7280', marginTop: 4, marginBottom: 2 },
  ok:      { fontSize: 12, color: '#16a34a', fontWeight: 600 },
  bad:     { fontSize: 12, color: '#dc2626', fontWeight: 600 },
  error:   { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 },
  note:    { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 16 },
};

export default OnboardingPage;
