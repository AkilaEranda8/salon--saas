import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const PRIVACY = {
  title: 'Privacy Policy',
  updated: '10 August 2026',
  body: (
    <>
      <p>This Privacy Policy explains how Hexalyte collects, uses, and protects information when you use Hexalyte Salon (admin.hexalyte.com, tenant apps, and related APIs).</p>
      <h2>Information we collect</h2>
      <p>Account details, business/operational data you enter, usage logs for security, and billing/support records.</p>
      <h2>How we use it</h2>
      <p>To provide and secure the platform, authenticate users, process subscriptions, and support customers. We do not sell personal data.</p>
      <h2>Your rights</h2>
      <p>Contact <a href="mailto:support@hexalyte.com">support@hexalyte.com</a> for access, correction, or deletion requests. Full policy: <a href="https://salon.hexalyte.com/privacy">salon.hexalyte.com/privacy</a>.</p>
    </>
  ),
};

const TERMS = {
  title: 'Terms of Service',
  updated: '10 August 2026',
  body: (
    <>
      <p>These Terms govern use of Hexalyte Salon software and related services operated by Hexalyte.</p>
      <h2>Accounts</h2>
      <p>Keep credentials secure. You are responsible for activity under your tenant. Abuse, phishing, or unlawful use is prohibited.</p>
      <h2>Data</h2>
      <p>Tenants own business and customer data they enter. See our <Link to="/privacy">Privacy Policy</Link>.</p>
      <h2>Contact</h2>
      <p><a href="mailto:hello@hexalyte.com">hello@hexalyte.com</a> · Full terms: <a href="https://salon.hexalyte.com/terms">salon.hexalyte.com/terms</a>.</p>
    </>
  ),
};

export default function LegalPage({ kind }) {
  const location = useLocation();
  const doc = kind === 'terms' || location.pathname.startsWith('/terms') ? TERMS : PRIVACY;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#f8f7ff 0%,#fff 45%,#f3f4f6 100%)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
        <Link to="/login" style={{ color: '#7c3aed', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>← Hexalyte Salon</Link>
        <h1 style={{ margin: '24px 0 8px', fontSize: 28, fontWeight: 750, color: '#0f0a1e' }}>{doc.title}</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 28 }}>Last updated: {doc.updated} · Hexalyte</p>
        <div style={{ color: '#374151', fontSize: 15, lineHeight: 1.65 }}>
          <style>{`
            .legal-body h2 { font-size: 17px; font-weight: 650; margin: 24px 0 8px; color: #111827; }
            .legal-body p { margin: 0 0 12px; }
            .legal-body a { color: #7c3aed; }
          `}</style>
          <div className="legal-body">{doc.body}</div>
        </div>
      </div>
    </div>
  );
}
