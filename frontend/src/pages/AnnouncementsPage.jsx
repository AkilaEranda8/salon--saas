import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { StatCard } from '../components/ui/PageKit';

const TYPE_STYLE = {
  INFO:        { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', label: 'Info' },
  WARNING:     { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', label: 'Warning' },
  PAYMENT_DUE: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', label: 'Payment due' },
};

function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString([], {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AnnouncementsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/announcements');
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const dismiss = async (id) => {
    setDismissing(id);
    try {
      await api.post(`/announcements/${id}/dismiss`);
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a)));
    } catch {
      /* ignore */
    }
    setDismissing(null);
  };

  const active = items.filter((a) => !a.dismissed);
  const dismissed = items.filter((a) => a.dismissed);

  return (
    <PageWrapper
      title="Announcements"
      subtitle="Messages from Hexalyte about billing, updates, and your salon account"
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Active" value={active.length} color="#2563EB" />
        <StatCard label="Dismissed" value={dismissed.length} color="#64748B" />
      </div>

      {loading && (
        <div style={{ padding: 24, color: '#98A2B3', fontSize: 14 }}>Loading announcements…</div>
      )}

      {!loading && !items.length && (
        <div style={{
          padding: 32, borderRadius: 14, border: '1px dashed #E4E7EC', textAlign: 'center',
          color: '#98A2B3', fontSize: 14, background: '#FAFBFC',
        }}>
          No announcements yet. Platform messages will appear here.
        </div>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {items.map((a) => {
          const style = TYPE_STYLE[a.type] || TYPE_STYLE.INFO;
          return (
            <article
              key={a.id}
              style={{
                borderRadius: 14,
                border: `1px solid ${a.dismissed ? '#E4E7EC' : style.border}`,
                background: a.dismissed ? '#F9FAFB' : style.bg,
                padding: '16px 18px',
                opacity: a.dismissed ? 0.75 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div>
                  <span style={{
                    display: 'inline-block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: 0.5, color: style.text, marginBottom: 6,
                  }}>
                    {style.label}
                  </span>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#101828' }}>{a.title}</h3>
                </div>
                <div style={{ fontSize: 12, color: '#98A2B3', whiteSpace: 'nowrap' }}>
                  {formatWhen(a.sent_at)}
                  {a.dismissed && ' · Dismissed'}
                </div>
              </div>

              <div style={{ fontSize: 14, color: '#344054', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {a.body}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                {a.type === 'PAYMENT_DUE' && !a.dismissed && (
                  <Button variant="primary" onClick={() => navigate('/billing')}>
                    Complete payment
                  </Button>
                )}
                {a.dismissible !== false && !a.dismissed && (
                  <Button
                    variant="secondary"
                    loading={dismissing === a.id}
                    onClick={() => dismiss(a.id)}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </PageWrapper>
  );
}
