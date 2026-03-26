import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const colors = {
  bg: '#f4f6fb',
  card: '#ffffff',
  text: '#101828',
  muted: '#667085',
  border: '#e4e7ec',
  primary: '#111827',
  accent: '#6d28d9',
  accentSoft: '#f3e8ff',
  successSoft: '#ecfdf3',
};

const styles = {
  page: {
    maxWidth: 1120,
    margin: '0 auto',
    padding: '24px 16px 40px',
    color: colors.text,
  },
  hero: {
    borderRadius: 18,
    padding: '22px 22px',
    marginBottom: 16,
    background:
      'linear-gradient(120deg, #111827 0%, #312e81 48%, #4c1d95 100%)',
    color: '#fff',
    boxShadow: '0 12px 32px rgba(17, 24, 39, 0.22)',
  },
  card: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    padding: 16,
    boxShadow: '0 6px 20px rgba(16, 24, 40, 0.06)',
  },
  sectionTitle: {
    margin: '0 0 12px',
    fontSize: 18,
    fontWeight: 700,
  },
  input: {
    width: '100%',
    height: 42,
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    outline: 'none',
    fontSize: 14,
  },
  button: {
    border: 'none',
    borderRadius: 10,
    height: 42,
    padding: '0 14px',
    background: colors.primary,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
  },
  mutedButton: {
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    height: 42,
    padding: '0 14px',
    background: '#fff',
    color: colors.text,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
  },
  status: {
    padding: '12px 14px',
    borderRadius: 10,
    background: '#fff',
    border: `1px solid ${colors.border}`,
    color: colors.text,
    marginBottom: 16,
  },
  sidebarItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    color: colors.text,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

const statusBadge = (status = '') => {
  const value = String(status).toLowerCase();
  if (value === 'completed') return { bg: '#ecfdf3', color: '#027a48', label: 'Completed' };
  if (value === 'cancelled') return { bg: '#fef3f2', color: '#b42318', label: 'Cancelled' };
  if (value === 'confirmed') return { bg: '#eff8ff', color: '#175cd3', label: 'Confirmed' };
  return { bg: '#f2f4f7', color: '#344054', label: status || 'Pending' };
};

export default function CustomerPortalPage() {
  const navigate = useNavigate();
  const [portalToken, setPortalToken] = useState(localStorage.getItem('portal_token') || '');
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [packages, setPackages] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [activeTab, setActiveTab] = useState('history');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [buyingId, setBuyingId] = useState(null);
  const [rebookDraft, setRebookDraft] = useState({ appointmentId: null, date: '', time: '' });
  const [screenWidth, setScreenWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const isMobile = screenWidth < 768;
  const isTablet = screenWidth >= 768 && screenWidth < 1024;

  const api = useMemo(() => ({
    async me(token) {
      const res = await fetch('/api/public/customer-portal/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: res.ok, data: await res.json() };
    },
    async bookings(token) {
      const res = await fetch('/api/public/customer-portal/bookings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: res.ok, data: await res.json() };
    },
    async packages(token, type) {
      const res = await fetch(`/api/public/customer-portal/packages?type=${encodeURIComponent(type)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: res.ok, data: await res.json() };
    },
    async rebook(token, payload) {
      const res = await fetch('/api/public/customer-portal/rebook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      return { ok: res.ok, data: await res.json() };
    },
    async purchase(token, packageId) {
      const res = await fetch('/api/public/customer-portal/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packageId, paymentMethod: 'Cash' }),
      });
      return { ok: res.ok, data: await res.json() };
    },
  }), []);

  const loadPortalData = async (token) => {
    const [meRes, bookingsRes, pkgRes, membershipRes] = await Promise.all([
      api.me(token),
      api.bookings(token),
      api.packages(token, 'bundle'),
      api.packages(token, 'membership'),
    ]);
    if (!meRes.ok || !bookingsRes.ok || !pkgRes.ok || !membershipRes.ok) {
      setMessage(
        meRes.data?.message ||
        bookingsRes.data?.message ||
        pkgRes.data?.message ||
        membershipRes.data?.message ||
        'Failed to load portal data.'
      );
      return;
    }
    setProfile(meRes.data);
    setBookings(Array.isArray(bookingsRes.data) ? bookingsRes.data : []);
    setPackages(Array.isArray(pkgRes.data) ? pkgRes.data : []);
    setMemberships(Array.isArray(membershipRes.data) ? membershipRes.data : []);
  };

  const clearPortalSession = () => {
    localStorage.removeItem('portal_token');
    setPortalToken('');
    setProfile(null);
    setBookings([]);
    setMessage('');
    navigate('/customer-portal/login');
  };

  useEffect(() => {
    const token = localStorage.getItem('portal_token') || '';
    if (!token) return;
    setPortalToken(token);
    setLoading(true);
    loadPortalData(token).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onRebook = async () => {
    if (!rebookDraft.appointmentId || !rebookDraft.date || !rebookDraft.time) {
      setMessage('Please select a booking, date, and time for rebooking.');
      return;
    }
    setLoading(true);
    try {
      const { ok, data } = await api.rebook(portalToken, rebookDraft);
      setMessage(data.message || (ok ? 'Rebook submitted.' : 'Rebook failed.'));
      if (ok) {
        setRebookDraft({ appointmentId: null, date: '', time: '' });
        await loadPortalData(portalToken);
      }
    } finally {
      setLoading(false);
    }
  };

  const onBuy = async (pkgId) => {
    setBuyingId(pkgId);
    setLoading(true);
    try {
      const { ok, data } = await api.purchase(portalToken, pkgId);
      setMessage(data.message || (ok ? 'Purchase successful.' : 'Purchase failed.'));
    } finally {
      setBuyingId(null);
      setLoading(false);
    }
  };

  const renderTab = () => {
    if (activeTab === 'packages') {
      return (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <h3 style={styles.sectionTitle}>Buy Packages</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {!packages.length && <p style={{ color: colors.muted, margin: 0 }}>No packages available right now.</p>}
            {packages.map((p) => (
              <div key={p.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div style={{ color: colors.muted, fontSize: 14 }}>{p.description || 'Bundle package'}</div>
                  </div>
                  <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                    <div style={{ fontWeight: 700 }}>Rs. {Number(p.package_price || 0).toFixed(2)}</div>
                    <div style={{ color: colors.muted, fontSize: 12 }}>{p.validity_days} days validity</div>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <button style={styles.button} disabled={loading} onClick={() => onBuy(p.id)}>
                    {buyingId === p.id ? 'Processing...' : 'Buy Package'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === 'memberships') {
      return (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <h3 style={styles.sectionTitle}>Buy Memberships</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {!memberships.length && <p style={{ color: colors.muted, margin: 0 }}>No memberships available right now.</p>}
            {memberships.map((p) => (
              <div key={p.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div style={{ color: colors.muted, fontSize: 14 }}>{p.description || 'Membership plan'}</div>
                  </div>
                  <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                    <div style={{ fontWeight: 700 }}>Rs. {Number(p.package_price || 0).toFixed(2)}</div>
                    <div style={{ color: colors.muted, fontSize: 12 }}>{p.validity_days} days validity</div>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <button style={styles.button} disabled={loading} onClick={() => onBuy(p.id)}>
                    {buyingId === p.id ? 'Processing...' : 'Buy Membership'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <>
        <div style={{ ...styles.card, marginTop: 16 }}>
          <h3 style={styles.sectionTitle}>One-Click Rebook</h3>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr auto', gap: 10 }}>
            <select
              value={rebookDraft.appointmentId || ''}
              onChange={(e) => setRebookDraft((d) => ({ ...d, appointmentId: Number(e.target.value) || null }))}
              style={styles.input}
            >
              <option value="">Select previous booking</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  #{b.id} - {b.date} {String(b.time || '').slice(0, 5)} - {b.service?.name || 'Service'}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={rebookDraft.date}
              onChange={(e) => setRebookDraft((d) => ({ ...d, date: e.target.value }))}
              style={styles.input}
            />
            <input
              type="time"
              value={rebookDraft.time}
              onChange={(e) => setRebookDraft((d) => ({ ...d, time: e.target.value }))}
              style={styles.input}
            />
            <button onClick={onRebook} style={{ ...styles.button, width: isMobile ? '100%' : 'auto' }} disabled={loading}>
              Rebook
            </button>
          </div>
        </div>

        <div style={{ ...styles.card, marginTop: 16 }}>
          <h3 style={styles.sectionTitle}>My Booking History</h3>
          {!bookings.length && <p style={{ color: colors.muted, margin: 0 }}>No bookings found yet.</p>}
          {bookings.map((b, idx) => {
            const badge = statusBadge(b.status);
            return (
              <div
                key={b.id}
                style={{
                  borderTop: idx === 0 ? 'none' : `1px solid ${colors.border}`,
                  padding: '12px 2px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{b.service?.name || 'Service'}</div>
                  <div style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>
                    {b.date} {String(b.time || '').slice(0, 5)} | {b.branch?.name || '-'} | {b.staff?.name || 'Any staff'}
                  </div>
                </div>
                <span
                  style={{
                    alignSelf: 'center',
                    background: badge.bg,
                    color: badge.color,
                    borderRadius: 999,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div style={{ background: colors.bg, minHeight: '100vh' }}>
      <div style={styles.page}>
        <div style={styles.hero}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28 }}>Customer Portal</h1>
          <p style={{ margin: '8px 0 0', opacity: 0.92 }}>
            Check your booking history, loyalty points, and rebook in seconds.
          </p>
        </div>

        {!!message && <div style={styles.status}>{message}</div>}

        {!portalToken && (
          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>Login Required</h3>
            <p style={{ marginTop: 0, color: colors.muted }}>
              Please sign in with your phone OTP to continue.
            </p>
            <button style={{ ...styles.button, width: isMobile ? '100%' : 'auto' }} onClick={() => navigate('/customer-portal/login')}>
              Go to Portal Login
            </button>
          </div>
        )}

        {!!portalToken && profile && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '250px 1fr', gap: 16 }}>
            <div style={{ ...styles.card, height: 'fit-content' }}>
              <h3 style={styles.sectionTitle}>Menu</h3>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 8, overflowX: isMobile ? 'auto' : 'visible' }}>
                <button
                  style={{ ...styles.sidebarItem, whiteSpace: 'nowrap', background: activeTab === 'history' ? colors.accentSoft : 'transparent' }}
                  onClick={() => setActiveTab('history')}
                >
                  Booking History
                </button>
                <button
                  style={{ ...styles.sidebarItem, whiteSpace: 'nowrap', background: activeTab === 'packages' ? colors.accentSoft : 'transparent' }}
                  onClick={() => setActiveTab('packages')}
                >
                  Buy Packages
                </button>
                <button
                  style={{ ...styles.sidebarItem, whiteSpace: 'nowrap', background: activeTab === 'memberships' ? colors.accentSoft : 'transparent' }}
                  onClick={() => setActiveTab('memberships')}
                >
                  Buy Memberships
                </button>
              </div>
              <div style={{ marginTop: 14, fontSize: 13, color: colors.muted }}>
                <div><strong>{profile.name}</strong></div>
                <div>{profile.phone}</div>
                <div style={{ marginTop: 6, color: '#027a48' }}>Points: {profile.loyalty_points}</div>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={clearPortalSession} style={{ ...styles.mutedButton, width: isMobile ? '100%' : 'auto' }} disabled={loading}>
                  Logout
                </button>
              </div>
            </div>

            <div>{renderTab()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
