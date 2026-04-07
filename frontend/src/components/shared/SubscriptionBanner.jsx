import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * SubscriptionBanner
 *
 * Renders a dismissible banner inside AppShell when the tenant's
 * subscription needs attention (trial ending soon or suspended).
 *
 * Reads from AuthContext — no props needed.
 */
const SubscriptionBanner = () => {
  const { subscriptionWarning } = useAuth();
  const navigate = useNavigate();

  const warning = subscriptionWarning();
  if (!warning) return null;

  if (warning.type === 'suspended') {
    return (
      <div style={styles.banner('#dc2626')}>
        <span>
          Your subscription is <strong>suspended</strong>. Please update your billing to restore access.
        </span>
        <button style={styles.btn} onClick={() => navigate('/billing')}>
          Update Billing
        </button>
      </div>
    );
  }

  if (warning.type === 'trial_ending') {
    const days = warning.daysLeft;
    return (
      <div style={styles.banner('#d97706')}>
        <span>
          Your free trial ends in <strong>{days} day{days !== 1 ? 's' : ''}</strong>. Upgrade to keep access.
        </span>
        <button style={styles.btn} onClick={() => navigate('/billing')}>
          Upgrade Now
        </button>
      </div>
    );
  }

  return null;
};

const styles = {
  banner: (bg) => ({
    background:     bg,
    color:          '#fff',
    padding:        '10px 20px',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    fontSize:       '0.875rem',
    gap:            '12px',
  }),
  btn: {
    background:   'rgba(255,255,255,0.2)',
    border:       '1px solid rgba(255,255,255,0.5)',
    color:        '#fff',
    padding:      '4px 12px',
    borderRadius: '4px',
    cursor:       'pointer',
    fontWeight:   600,
    whiteSpace:   'nowrap',
  },
};

export default SubscriptionBanner;
