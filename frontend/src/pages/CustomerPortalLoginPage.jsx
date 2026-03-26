import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const card = {
  width: '100%',
  maxWidth: 440,
  background: '#fff',
  border: '1px solid #e4e7ec',
  borderRadius: 16,
  padding: 22,
  boxShadow: '0 10px 30px rgba(16, 24, 40, 0.08)',
};

const input = {
  width: '100%',
  height: 44,
  borderRadius: 10,
  border: '1px solid #d0d5dd',
  padding: '10px 12px',
  outline: 'none',
  fontSize: 14,
};

const button = {
  width: '100%',
  height: 44,
  border: 'none',
  borderRadius: 10,
  background: '#111827',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

export default function CustomerPortalLoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [debugOtp, setDebugOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;

  const onRequestOtp = async () => {
    setLoading(true);
    setMessage('');
    setDebugOtp('');
    try {
      const res = await fetch('/api/public/customer-portal/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      setMessage(data.message || 'OTP sent.');
      if (data.debug_otp) setDebugOtp(data.debug_otp);
    } catch (_err) {
      setMessage('Failed to request OTP.');
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/public/customer-portal/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        setMessage(data.message || 'OTP verification failed.');
        return;
      }
      localStorage.setItem('portal_token', data.token);
      navigate('/customer-portal');
    } catch (_err) {
      setMessage('Failed to verify OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #4c1d95 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 26, color: '#101828' }}>Customer Portal Login</h2>
        <p style={{ margin: '8px 0 18px', color: '#667085' }}>
          Login with your phone number to view bookings and loyalty points.
        </p>

        {!!message && (
          <div style={{ marginBottom: 12, fontSize: 14, color: '#344054' }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          <input
            style={input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
          />
          <button style={button} onClick={onRequestOtp} disabled={loading || !phone}>
            Request OTP
          </button>

          <input
            style={input}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Enter OTP"
          />
          <button style={button} onClick={onVerifyOtp} disabled={loading || !phone || !otp}>
            Verify OTP
          </button>

          {!!debugOtp && (
            <small style={{ color: '#6941c6' }}>Dev OTP: {debugOtp}</small>
          )}
        </div>
      </div>
    </div>
  );
}
