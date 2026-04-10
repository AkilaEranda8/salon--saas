import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

const C = {
  border:  '#EAECF0',
  cardBg:  '#FFFFFF',
  label:   '#667085',
  text:    '#101828',
  muted:   '#98A2B3',
  green:   '#059669',
  orange:  '#D97706',
  red:     '#DC2626',
  purple:  '#7C3AED',
};

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(16,24,40,0.06)', marginBottom: 24 }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '20px 24px 24px' }}>{children}</div>
    </div>
  );
}

function StatusBadge({ verified }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: verified ? '#D1FAE5' : '#FEF3C7',
      color: verified ? C.green : C.orange,
      border: `1px solid ${verified ? '#6EE7B7' : '#FCD34D'}`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: verified ? C.green : C.orange, display: 'inline-block' }} />
      {verified ? 'Verified' : 'Pending DNS'}
    </span>
  );
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: C.purple, fontWeight: 600, padding: '2px 6px' }}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

const DomainSettingsPage = () => {
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [data, setData] = useState({
    slug: '',
    subdomain_url: '',
    custom_domain: '',
    domain_verified: false,
  });
  const [inputDomain, setInputDomain] = useState('');

  useEffect(() => {
    api.get('/branding/domain')
      .then((res) => {
        setData(res.data);
        setInputDomain(res.data.custom_domain || '');
      })
      .catch(() => toast.error('Failed to load domain settings.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const cleaned = inputDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    setSaving(true);
    try {
      const res = await api.patch('/branding/domain', { custom_domain: cleaned });
      setData((d) => ({ ...d, custom_domain: res.data.custom_domain, domain_verified: false }));
      setInputDomain(res.data.custom_domain || '');
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await api.post('/branding/domain/verify');
      setData((d) => ({ ...d, domain_verified: res.data.domain_verified }));
      if (res.data.domain_verified) {
        toast.success(res.data.message);
      } else {
        toast.error(res.data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove custom domain? Your salon will only be accessible via the salon.hexalyte.com subdomain.')) return;
    setSaving(true);
    try {
      await api.patch('/branding/domain', { custom_domain: '' });
      setData((d) => ({ ...d, custom_domain: null, domain_verified: false }));
      setInputDomain('');
      toast.success('Custom domain removed.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper title="Domain Settings">
        <div style={{ color: C.muted, padding: 40, textAlign: 'center' }}>Loading...</div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Domain Settings" subtitle="Manage how customers access your salon dashboard">

      {/* ── Current Subdomain ── */}
      <SectionCard title="Your Subdomain" subtitle="Included with every Zane Salon account — always active">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <code style={{ fontSize: 15, fontWeight: 700, color: C.purple, background: '#F5F3FF', padding: '8px 16px', borderRadius: 8, border: '1px solid #DDD6FE' }}>
            {data.subdomain_url}
          </code>
          <CopyButton value={data.subdomain_url} />
          <a href={data.subdomain_url} target="_blank" rel="noreferrer"
            style={{ fontSize: 13, color: C.green, fontWeight: 600, textDecoration: 'none' }}>
            Open ↗
          </a>
        </div>
      </SectionCard>

      {/* ── Custom Domain ── */}
      <SectionCard
        title="Custom Domain"
        subtitle="Point your own domain (e.g. booking.mysalon.com) to your salon dashboard"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Input row */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.label, display: 'block', marginBottom: 6 }}>
              Custom Domain
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={inputDomain}
                onChange={(e) => setInputDomain(e.target.value.trim().toLowerCase())}
                placeholder="e.g. booking.mysalon.com"
                style={{ flex: 1, padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'monospace' }}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '9px 18px', background: '#1E1B4B', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {data.custom_domain && (
                <button
                  onClick={handleRemove}
                  disabled={saving}
                  style={{ padding: '9px 14px', background: '#FEE2E2', color: C.red, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Remove
                </button>
              )}
            </div>
            {inputDomain && !inputDomain.includes('hexalyte.com') && (
              <div style={{ marginTop: 5, fontSize: 12, color: C.muted }}>
                Will be accessible at: <span style={{ color: C.purple, fontFamily: 'monospace', fontWeight: 600 }}>{inputDomain}</span>
              </div>
            )}
          </div>

          {/* Status row */}
          {data.custom_domain && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', background: '#F9FAFB', borderRadius: 10, border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, color: C.text, fontFamily: 'monospace', fontWeight: 600 }}>{data.custom_domain}</span>
              <StatusBadge verified={data.domain_verified} />
              {!data.domain_verified && (
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  style={{ padding: '6px 14px', background: C.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: verifying ? 'not-allowed' : 'pointer' }}>
                  {verifying ? 'Checking DNS…' : 'Verify DNS'}
                </button>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── DNS Setup Instructions ── */}
      {data.custom_domain && !data.domain_verified && (
        <SectionCard title="DNS Setup Instructions" subtitle="Add these records in your domain registrar / Cloudflare">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            <div style={{ padding: '14px 16px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, fontSize: 13, color: '#92400E' }}>
              ⚠ Your custom domain won't work until these DNS records are set up and DNS propagates (up to 24h).
            </div>

            {/* CNAME record */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  {['Type', 'Name', 'Value', 'TTL'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: C.label, border: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 12px', border: `1px solid ${C.border}`, fontFamily: 'monospace', color: C.purple, fontWeight: 700 }}>CNAME</td>
                  <td style={{ padding: '8px 12px', border: `1px solid ${C.border}`, fontFamily: 'monospace' }}>
                    {data.custom_domain.startsWith('www.') ? 'www' : data.custom_domain.split('.')[0]}
                    <CopyButton value={data.custom_domain.startsWith('www.') ? 'www' : data.custom_domain.split('.')[0]} />
                  </td>
                  <td style={{ padding: '8px 12px', border: `1px solid ${C.border}`, fontFamily: 'monospace' }}>
                    salon.hexalyte.com
                    <CopyButton value="salon.hexalyte.com" />
                  </td>
                  <td style={{ padding: '8px 12px', border: `1px solid ${C.border}`, color: C.muted }}>Auto</td>
                </tr>
              </tbody>
            </table>

            <div style={{ fontSize: 12, color: C.muted }}>
              After saving the DNS record, click <strong>Verify DNS</strong> above. If your DNS provider doesn't support CNAME on root domains, use an A record pointing to your server IP.
            </div>
          </div>
        </SectionCard>
      )}

      {data.custom_domain && data.domain_verified && (
        <SectionCard title="Domain Active" subtitle="">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.green }}>
            <span style={{ fontSize: 22 }}>✓</span>
            <div>
              <div style={{ fontWeight: 700 }}>Custom domain is live!</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Your salon dashboard is now accessible at{' '}
                <a href={`https://${data.custom_domain}`} target="_blank" rel="noreferrer" style={{ color: C.purple, fontFamily: 'monospace', fontWeight: 600 }}>
                  {data.custom_domain}
                </a>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

    </PageWrapper>
  );
};

export default DomainSettingsPage;
