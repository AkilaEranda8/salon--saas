import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const s = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #4c1d95 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    background: '#fff',
    border: '1px solid #e4e7ec',
    borderRadius: 16,
    padding: 28,
    boxShadow: '0 10px 30px rgba(16, 24, 40, 0.18)',
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    fontSize: 22,
  },
  title: { margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#101828' },
  sub:   { margin: '0 0 22px', fontSize: 14, color: '#667085' },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 },
  input: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    border: '1.5px solid #d0d5dd',
    padding: '10px 13px',
    outline: 'none',
    fontSize: 14,
    boxSizing: 'border-box',
    transition: 'border .15s',
  },
  btn: {
    width: '100%',
    height: 44,
    border: 'none',
    borderRadius: 10,
    background: 'linear-gradient(90deg, #7c3aed, #4f46e5)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    marginTop: 4,
    transition: 'opacity .15s',
  },
  msg: (ok) => ({
    padding: '11px 14px',
    borderRadius: 9,
    fontSize: 13,
    marginBottom: 14,
    background: ok ? '#ecfdf3' : '#fef2f2',
    border: `1px solid ${ok ? '#a7f3d0' : '#fca5a5'}`,
    color: ok ? '#065f46' : '#dc2626',
  }),
  divider: { textAlign: 'center', color: '#9ca3af', fontSize: 13, margin: '18px 0' },
  link: { color: '#7c3aed', fontWeight: 600, textDecoration: 'none' },
  steps: { display: 'flex', gap: 6, marginBottom: 22 },
  step: (active, done) => ({
    flex: 1,
    height: 4,
    borderRadius: 99,
    background: done ? '#7c3aed' : active ? '#c4b5fd' : '#e5e7eb',
    transition: 'background .2s',
  }),
  otpNote: { fontSize: 12, color: '#667085', marginTop: 6 },
};

const STEPS = ['Details', 'Verify'];

export default function CustomerRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState({ text: '', ok: false });
  const [debugOtp, setDebugOtp] = useState('');
  const [form, setForm]         = useState({ name: '', phone: '', email: '' });
  const [otp, setOtp]           = useState('');

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const msg = (text, ok = false) => setMessage({ text, ok });

  const onRegister = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      msg('Name and phone number are required.');
      return;
    }
    setLoading(true);
    setMessage({ text: '', ok: false });
    setDebugOtp('');
    try {
      const res  = await fetch('/api/public/customer-portal/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { msg(data.message || 'Registration failed.'); return; }
      msg(data.message || 'OTP sent!', true);
      if (data.debug_otp) setDebugOtp(data.debug_otp);
      setStep(1);
    } catch {
      msg('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (e) => {
    e.preventDefault();
    if (!otp.trim()) { msg('Please enter the OTP.'); return; }
    setLoading(true);
    setMessage({ text: '', ok: false });
    try {
      const res  = await fetch('/api/public/customer-portal/verify-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: form.phone, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        msg(data.message || 'Invalid OTP.');
        return;
      }
      localStorage.setItem('portal_token', data.token);
      navigate('/customer-portal');
    } catch {
      msg('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setLoading(true);
    setMessage({ text: '', ok: false });
    try {
      const res  = await fetch('/api/public/customer-portal/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      msg(data.message || 'OTP resent.', res.ok);
      if (data.debug_otp) setDebugOtp(data.debug_otp);
    } catch {
      msg('Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>💇</div>

        <div style={s.steps}>
          {STEPS.map((_, i) => (
            <div key={i} style={s.step(i === step, i < step)} />
          ))}
        </div>

        <h2 style={s.title}>{step === 0 ? 'Create your account' : 'Verify your phone'}</h2>
        <p style={s.sub}>
          {step === 0
            ? 'Register to view your bookings, loyalty points and more.'
            : `We sent a 6-digit code to ${form.phone}.`}
        </p>

        {message.text && <div style={s.msg(message.ok)}>{message.text}</div>}

        {step === 0 && (
          <form onSubmit={onRegister} style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={s.label}>Full Name *</label>
              <input
                style={s.input}
                value={form.name}
                onChange={set('name')}
                placeholder="Nimesha Perera"
                required
                autoFocus
              />
            </div>
            <div>
              <label style={s.label}>Phone Number *</label>
              <input
                style={s.input}
                value={form.phone}
                onChange={set('phone')}
                placeholder="0771234567"
                type="tel"
                required
              />
            </div>
            <div>
              <label style={s.label}>Email Address <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input
                style={s.input}
                value={form.email}
                onChange={set('email')}
                placeholder="you@example.com"
                type="email"
              />
            </div>
            <button style={s.btn} type="submit" disabled={loading}>
              {loading ? 'Sending OTP…' : 'Continue →'}
            </button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={onVerify} style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={s.label}>6-Digit OTP *</label>
              <input
                style={{ ...s.input, letterSpacing: '0.2em', fontSize: 20, textAlign: 'center', fontWeight: 700 }}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="——————"
                maxLength={6}
                autoFocus
                required
              />
              <p style={s.otpNote}>Didn't receive it? <button type="button" onClick={onResend} disabled={loading} style={{ background: 'none', border: 'none', color: '#7c3aed', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 12 }}>Resend OTP</button></p>
              {debugOtp && <p style={{ ...s.otpNote, color: '#6941c6' }}>Dev OTP: <strong>{debugOtp}</strong></p>}
            </div>
            <button style={s.btn} type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify & Enter Portal'}
            </button>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#667085', fontSize: 13, cursor: 'pointer', marginTop: -6 }}
              onClick={() => { setStep(0); setOtp(''); setMessage({ text: '', ok: false }); }}
            >
              ← Change details
            </button>
          </form>
        )}

        <div style={s.divider}>
          Already registered?{' '}
          <Link to="/customer-portal/login" style={s.link}>Log in</Link>
        </div>
      </div>
    </div>
  );
}
