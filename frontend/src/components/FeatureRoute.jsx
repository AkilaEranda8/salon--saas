import React, { useEffect } from 'react';
import { useFeatureGate } from '../hooks/useFeatureGate';
import PageWrapper from './layout/PageWrapper';
import usePageTheme from '../hooks/usePageTheme';

/**
 * Wrap a CRM (or other) route so tenants without the plan feature see an upgrade prompt.
 */
export default function FeatureRoute({ feature, children, title = 'Feature locked' }) {
  const { C } = usePageTheme();
  const { allowed, minPlanLabel, featureLabel, minPlan } = useFeatureGate(feature);

  useEffect(() => {
    if (allowed) return;
    if (typeof window.__showUpgradeModal === 'function') {
      window.__showUpgradeModal({
        code: 'FEATURE_GATED',
        feature,
        minPlan,
        requiredPlan: minPlan,
        message: `${featureLabel} requires the ${minPlanLabel} plan (or an admin enable).`,
      });
    }
  }, [allowed, feature, featureLabel, minPlan, minPlanLabel]);

  if (allowed) return children;

  return (
    <PageWrapper title={title} subtitle={`${featureLabel} is not enabled on your plan.`}>
      <div
        style={{
          maxWidth: 480,
          padding: 24,
          borderRadius: 14,
          border: `1px solid ${C.border}`,
          background: C.cardBg,
          color: C.text,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{featureLabel}</div>
        <p style={{ margin: '0 0 16px', color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
          This module needs the {minPlanLabel} plan (or your platform admin must enable it for your salon).
        </p>
        <button
          type="button"
          onClick={() => window.__showUpgradeModal?.({
            code: 'FEATURE_GATED',
            feature,
            minPlan,
            requiredPlan: minPlan,
          })}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            background: C.primary || '#2563EB',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          View upgrade options
        </button>
      </div>
    </PageWrapper>
  );
}
