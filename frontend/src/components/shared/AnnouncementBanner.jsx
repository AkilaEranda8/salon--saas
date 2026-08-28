import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../../context/AuthContext';

const TYPE_STYLE = {
  INFO:        { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  WARNING:     { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' },
  PAYMENT_DUE: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
};

/**
 * Shows platform announcements inside the tenant app shell.
 */
export default function AnnouncementBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [dismissing, setDismissing] = useState(null);

  const isAdmin = ['superadmin', 'admin'].includes(user?.role);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get('/announcements/active');
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  if (!isAdmin || !items.length) return null;

  const dismiss = async (id) => {
    setDismissing(id);
    try {
      await api.post(`/announcements/${id}/dismiss`);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch {
      /* keep visible */
    }
    setDismissing(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 16px 0' }}>
      {items.map((a) => {
        const style = TYPE_STYLE[a.type] || TYPE_STYLE.INFO;
        return (
          <div
            key={a.id}
            style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: style.text, marginBottom: 4 }}>
                {a.title}
              </div>
              <div style={{ fontSize: 13, color: '#344054', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {a.body}
              </div>
              {a.type === 'PAYMENT_DUE' && (
                <button
                  type="button"
                  onClick={() => navigate('/billing')}
                  style={{
                    marginTop: 10,
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: style.text,
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Open Billing
                </button>
              )}
            </div>
            {a.dismissible !== false && (
              <button
                type="button"
                onClick={() => dismiss(a.id)}
                disabled={dismissing === a.id}
                aria-label="Dismiss"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#64748B',
                  cursor: 'pointer',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 4,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
