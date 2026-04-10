import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

const PLAN_META = {
  basic: { label: 'Basic', price: 'LKR 2,900 / mo' },
  pro: { label: 'Pro', price: 'LKR 7,900 / mo' },
  enterprise: { label: 'Enterprise', price: 'Custom pricing' },
};

const cardStyle = {
  background: '#fff',
  border: '1px solid #E4E7EC',
  borderRadius: 14,
  padding: 20,
  boxShadow: '0 2px 10px rgba(16,24,40,0.06)',
};

const methodBtn = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid #D0D5DD',
  background: '#fff',
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
  color: '#1F2937',
};

export default function BillingPaymentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loadingMethod, setLoadingMethod] = useState('');

  const plan = (searchParams.get('plan') || '').toLowerCase();
  const planMeta = useMemo(() => PLAN_META[plan], [plan]);

  const handleCardPayment = async () => {
    if (!planMeta) {
      toast.error('Invalid plan selected. Please choose a plan again.');
      navigate('/billing');
      return;
    }

    setLoadingMethod('card');
    try {
      const res = await api.post('/billing/checkout', { plan });
      window.location.href = res.data.url;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start card checkout.');
      setLoadingMethod('');
    }
  };

  const handleBankTransfer = () => {
    if (!planMeta) {
      toast.error('Invalid plan selected. Please choose a plan again.');
      navigate('/billing');
      return;
    }
    navigate(`/bank-slip-upload?plan=${plan}`);
  };

  return (
    <PageWrapper
      title="Choose Payment Method"
      subtitle="Select how you want to pay for your subscription"
    >
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontWeight: 600 }}>
            Selected Plan
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#111827', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
              {planMeta?.label || 'Unknown Plan'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#2563EB' }}>
              {planMeta?.price || '-'}
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 12 }}>
          <button
            onClick={handleCardPayment}
            disabled={loadingMethod === 'card'}
            style={{
              ...methodBtn,
              border: '1px solid #BFDBFE',
              background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
              opacity: loadingMethod === 'card' ? 0.6 : 1,
              cursor: loadingMethod === 'card' ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>💳</span>
              Card Payment (Stripe)
            </span>
            <span style={{ color: '#1D4ED8', fontWeight: 800 }}>
              {loadingMethod === 'card' ? 'Opening...' : 'Continue'}
            </span>
          </button>

          <button
            onClick={handleBankTransfer}
            disabled={loadingMethod === 'card'}
            style={{
              ...methodBtn,
              border: '1px solid #A7F3D0',
              background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
              opacity: loadingMethod === 'card' ? 0.6 : 1,
              cursor: loadingMethod === 'card' ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🏦</span>
              Bank Transfer + Slip Upload
            </span>
            <span style={{ color: '#047857', fontWeight: 800 }}>Continue</span>
          </button>
        </div>

        <div style={{ ...cardStyle, background: '#F8FAFC' }}>
          <div style={{ fontSize: 13, color: '#475467', lineHeight: 1.6 }}>
            Card payments redirect to Stripe checkout.
            Bank transfer payments require slip upload and admin approval before activation.
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
