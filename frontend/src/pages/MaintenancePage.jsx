import React from 'react';

export default function MaintenancePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0F172A', color: '#E2E8F0' }}>
      <div style={{ maxWidth: 520, width: '100%', border: '1px solid #334155', borderRadius: 20, padding: 32, background: '#111827', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, color: '#94A3B8', marginBottom: 12 }}>Maintenance</div>
        <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.1 }}>We'll be back soon</h1>
        <p style={{ marginTop: 14, marginBottom: 0, color: '#94A3B8', lineHeight: 1.6 }}>
          The system is temporarily unavailable while updates are being applied.
        </p>
      </div>
    </div>
  );
}
