import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

/* ── Icons ─────────────────────────────────────────────────────────────────── */
const IconSave    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconRefresh = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
const IconEye     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconEyeOff  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

/* ── Tokens ─────────────────────────────────────────────────────────────────── */
const C = {
  primary: '#2563EB', border: '#EAECF0', cardBg: '#FFFFFF',
  label: '#667085', muted: '#98A2B3', text: '#101828', inputBdr: '#D0D5DD',
};

/* ── Sub-components ─────────────────────────────────────────────────────────── */
function SectionCard({ title, subtitle, badge, children }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(16,24,40,0.06)' }}>
      <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border}`, background: 'linear-gradient(180deg,#F8F9FC,#F1F3F9)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            {title}
            {badge && <span style={{ fontSize: 11, fontWeight: 700, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', borderRadius: 99, padding: '2px 10px' }}>{badge}</span>}
          </div>
          {subtitle && <div style={{ fontSize: 12.5, color: C.label, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: '20px 22px' }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint, type = 'text', secret }) {
  const [focused, setFocused] = useState(false);
  const [show,    setShow]    = useState(false);
  const inputType = secret ? (show ? 'text' : 'password') : type;

  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.label, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', borderRadius: 10, border: `1.5px solid ${focused ? C.primary : C.inputBdr}`,
            background: '#fff', color: C.text, padding: secret ? '10px 40px 10px 13px' : '10px 13px',
            fontSize: 13.5, outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
            boxShadow: focused ? '0 0 0 3px rgba(37,99,235,0.10)' : 'none',
            fontFamily: "'Inter',sans-serif",
          }}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4 }}
          >
            {show ? <IconEyeOff /> : <IconEye />}
          </button>
        )}
      </div>
      {hint && <div style={{ marginTop: 5, fontSize: 12, color: C.muted }}>{hint}</div>}
    </label>
  );
}

const EMPTY = {
  helapay_business_id: '',
  helapay_merchant_id: '',
  helapay_app_id: '',
  helapay_app_secret: '',
  helapay_notify_url: '',
};

/* ── Main Page ───────────────────────────────────────────────────────────────── */
export default function PaymentSettingsPage() {
  const [form,    setForm]    = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/branding/payment-settings');
      setForm({
        helapay_business_id: data.helapay_business_id || '',
        helapay_merchant_id: data.helapay_merchant_id || '',
        helapay_app_id:      data.helapay_app_id      || '',
        helapay_app_secret:  '',
        helapay_notify_url:  data.helapay_notify_url  || '',
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load payment settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        helapay_business_id: form.helapay_business_id.trim() || null,
        helapay_merchant_id: form.helapay_merchant_id.trim() || null,
        helapay_app_id:      form.helapay_app_id.trim()      || null,
        helapay_notify_url:  form.helapay_notify_url.trim()  || null,
      };
      if (form.helapay_app_secret.trim()) {
        payload.helapay_app_secret = form.helapay_app_secret.trim();
      }
      await api.put('/branding/payment-settings', payload);
      toast.success('Payment settings saved!');
      setForm(f => ({ ...f, helapay_app_secret: '' }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save payment settings.');
    } finally {
      setSaving(false);
    }
  };

  const actions = (
    <div style={{ display: 'flex', gap: 10 }}>
      <button onClick={load} disabled={loading}
        style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', background:'#fff', border:`1.5px solid ${C.border}`, borderRadius:10, fontSize:13, fontWeight:700, color:'#344054', cursor: loading?'not-allowed':'pointer', opacity: loading?0.6:1, boxShadow:'0 1px 4px rgba(16,24,40,0.06)' }}>
        <IconRefresh /> Reload
      </button>
      <button onClick={save} disabled={saving || loading}
        style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', background:'linear-gradient(135deg,#1D4ED8,#2563EB)', border:'none', borderRadius:10, fontSize:13, fontWeight:700, color:'#fff', cursor: saving||loading?'not-allowed':'pointer', opacity: saving||loading?0.7:1, boxShadow:'0 2px 8px rgba(37,99,235,0.30)' }}>
        <IconSave /> {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );

  return (
    <PageWrapper
      title="Payment Settings"
      subtitle="Configure HelaPay / LankaQR integration credentials for your salon."
      actions={actions}
    >
      {loading ? (
        <div style={{ display:'flex', gap:16 }}>
          {[1,2].map(i => <div key={i} style={{ flex:1, height:180, borderRadius:14, background:'linear-gradient(90deg,#F1F3F9 25%,#E9ECF3 50%,#F1F3F9 75%)' }} />)}
        </div>
      ) : (
        <>
          {/* ── HelaPay / LankaQR ── */}
          <SectionCard
            title="HelaPay / LankaQR"
            subtitle="Credentials from your HelaPOS merchant account — used to generate dynamic QR codes."
            badge="LankaQR"
          >
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:18 }}>
              <Field
                label="Business ID"
                value={form.helapay_business_id}
                onChange={v => set('helapay_business_id', v)}
                placeholder="e.g. 223"
                hint='The "b" parameter used when generating a QR code.'
              />
              <Field
                label="Merchant ID"
                value={form.helapay_merchant_id}
                onChange={v => set('helapay_merchant_id', v)}
                placeholder="e.g. HLPM-00123"
                hint="Your HelaPOS merchant account ID."
              />
              <Field
                label="App ID"
                value={form.helapay_app_id}
                onChange={v => set('helapay_app_id', v)}
                placeholder="App ID from HelaPOS"
                hint="Used together with App Secret to generate the Base64 auth token."
              />
              <Field
                label="App Secret"
                value={form.helapay_app_secret}
                onChange={v => set('helapay_app_secret', v)}
                placeholder="Leave blank to keep existing secret"
                hint="Stored securely. Leave blank to keep the current secret unchanged."
                secret
              />
              <Field
                label="Notify URL (Webhook)"
                value={form.helapay_notify_url}
                onChange={v => set('helapay_notify_url', v)}
                placeholder="https://api.salon.hexalyte.com/api/helapay/callback"
                hint="HelaPay will POST payment status updates to this URL."
              />
            </div>
          </SectionCard>

          {/* ── Info box ── */}
          <div style={{ padding:'14px 18px', borderRadius:12, background:'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border:'1px solid #BFDBFE', display:'flex', alignItems:'flex-start', gap:12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ fontSize:13, color:'#1D4ED8', lineHeight:1.6 }}>
              <strong>How to get credentials:</strong> Register on the HelaPOS app → Settings → API Credentials.
              Then email <a href="mailto:support@helapay.lk" style={{ color:'#1D4ED8', fontWeight:700 }}>support@helapay.lk</a> to register your Notify URL.
              The webhook URL should be: <code style={{ background:'#DBEAFE', padding:'1px 6px', borderRadius:5, fontSize:12 }}>https://api.salon.hexalyte.com/api/helapay/callback</code>
            </div>
          </div>

          {/* ── QR Test hint ── */}
          <div style={{ padding:'12px 16px', borderRadius:12, background:'#F8FAFC', border:'1px solid #EAECF0', display:'flex', alignItems:'center', gap:10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/></svg>
            <span style={{ fontSize:13, color:'#475467' }}>
              Once saved, go to <strong>Payments → Record Payment</strong> or <strong>Walk-in → Collect Payment</strong> and select <strong>LankaQR</strong> as the payment method to generate a QR code.
            </span>
          </div>
        </>
      )}
    </PageWrapper>
  );
}
