import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';

const PLAN_COLORS = {
  trial:      { bg: '#FEF3C7', text: '#92400E' },
  basic:      { bg: '#DBEAFE', text: '#1E40AF' },
  pro:        { bg: '#EDE9FE', text: '#5B21B6' },
  enterprise: { bg: '#D1FAE5', text: '#065F46' },
};

const SUB_STATUS_COLORS = {
  active:             { bg: '#D1FAE5', text: '#065F46' },
  past_due:           { bg: '#FEF3C7', text: '#92400E' },
  canceled:           { bg: '#FEE2E2', text: '#991B1B' },
  trialing:           { bg: '#EDE9FE', text: '#5B21B6' },
  incomplete:         { bg: '#F3F4F6', text: '#374151' },
  incomplete_expired: { bg: '#FEE2E2', text: '#991B1B' },
};

export default function PlatformSubscriptionsPage() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/platform/tenants?limit=200')
      .then(r => setTenants(r.data.tenants ?? r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Only show tenants with a Stripe subscription
  const withSub = tenants.filter(t => t.stripe_subscription_id || t.subscription);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, background: '#F5F3FF', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E1B4B', margin: 0 }}>Subscriptions</h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>Stripe-linked subscriptions across all tenants</p>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFF' }}>
                {['Tenant', 'Slug', 'Plan', 'Stripe Customer', 'Stripe Sub ID', 'Sub Status'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '11px 14px',
                    color: '#6B7280', fontWeight: 600, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>Loading…</td></tr>
              ) : withSub.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No Stripe subscriptions found.</td></tr>
              ) : withSub.map(t => {
                const pc = PLAN_COLORS[t.plan] ?? PLAN_COLORS.trial;
                const sub = t.subscription;
                const subStatusColors = SUB_STATUS_COLORS[sub?.status] ?? SUB_STATUS_COLORS.incomplete;
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #F9FAFB' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFAFF'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E1B4B' }}>{t.name}</td>
                    <td style={{ padding: '10px 14px', color: '#6366F1', fontFamily: 'monospace', fontSize: 12 }}>{t.slug}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: pc.bg, color: pc.text, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                        {t.plan}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6B7280', fontFamily: 'monospace', fontSize: 11 }}>
                      {t.stripe_customer_id ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6B7280', fontFamily: 'monospace', fontSize: 11 }}>
                      {t.stripe_subscription_id ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {sub?.status ? (
                        <span style={{ background: subStatusColors.bg, color: subStatusColors.text, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                          {sub.status}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
