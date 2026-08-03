import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'nvidia', label: 'NVIDIA NIM (env)' },
  { value: 'local', label: 'Local LLM (later)' },
];

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  nvidia: 'meta/llama-3.3-70b-instruct',
  local: 'local',
};

function SectionCard({ title, subtitle, children }) {
  const { C } = usePageTheme();
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: C.shadow }}>
      <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border}`, background: C.headerGrad }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: C.label, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '20px 22px' }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint, type = 'text', secret }) {
  const { C } = usePageTheme();
  const [show, setShow] = useState(false);
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
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', borderRadius: 10, border: `1.5px solid ${C.inputBdr}`,
            background: C.inputBg, color: C.text, padding: secret ? '10px 40px 10px 13px' : '10px 13px',
            fontSize: 13.5, outline: 'none', boxSizing: 'border-box',
          }}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && <div style={{ marginTop: 5, fontSize: 12, color: C.muted }}>{hint}</div>}
    </label>
  );
}

export default function CrmAiSettingsPage() {
  const { C } = usePageTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({
    provider: 'openai',
    model: 'gpt-4o-mini',
    openai_api_key: '',
    openai_api_key_set: false,
    gemini_api_key: '',
    gemini_api_key_set: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/ai-settings');
      setForm({
        provider: data.provider || 'openai',
        model: data.model || DEFAULT_MODELS[data.provider] || 'gpt-4o-mini',
        openai_api_key: data.openai_api_key || '',
        openai_api_key_set: !!data.openai_api_key_set,
        gemini_api_key: data.gemini_api_key || '',
        gemini_api_key_set: !!data.gemini_api_key_set,
      });
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load AI settings';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setProvider = (provider) => {
    setForm((f) => ({
      ...f,
      provider,
      model: DEFAULT_MODELS[provider] || f.model,
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        provider: form.provider,
        model: form.model,
      };
      // Only send keys if user typed a new value (not masked placeholder)
      if (form.openai_api_key && !String(form.openai_api_key).startsWith('••••')) {
        payload.openai_api_key = form.openai_api_key;
      }
      if (form.gemini_api_key && !String(form.gemini_api_key).startsWith('••••')) {
        payload.gemini_api_key = form.gemini_api_key;
      }
      const { data } = await api.put('/crm/ai-settings', payload);
      setForm({
        provider: data.provider,
        model: data.model,
        openai_api_key: data.openai_api_key || '',
        openai_api_key_set: !!data.openai_api_key_set,
        gemini_api_key: data.gemini_api_key || '',
        gemini_api_key_set: !!data.gemini_api_key_set,
      });
      toast.success('AI settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const payload = {
        provider: form.provider,
        model: form.model,
      };
      if (form.openai_api_key && !String(form.openai_api_key).startsWith('••••')) {
        payload.openai_api_key = form.openai_api_key;
      }
      if (form.gemini_api_key && !String(form.gemini_api_key).startsWith('••••')) {
        payload.gemini_api_key = form.gemini_api_key;
      }
      const { data } = await api.post('/crm/ai-settings/test', payload);
      if (data.ok) toast.success(data.message || 'Connection OK');
      else toast.error(data.message || 'Test failed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <PageWrapper
      title="AI Engine Settings"
      subtitle="Configure OpenAI / Gemini keys for the WhatsApp AI CRM engine (per salon)."
    >
      {loading ? (
        <div style={{ color: C.muted, padding: 24 }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: 18, maxWidth: 720 }}>
          <SectionCard
            title="Provider"
            subtitle="AI Engine uses this provider for WhatsApp receptionist replies. Legacy AI Chat bot is unchanged."
          >
            <div style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.label, marginBottom: 6 }}>
                  Provider
                </div>
                <select
                  value={form.provider}
                  onChange={(e) => setProvider(e.target.value)}
                  style={{
                    width: '100%', borderRadius: 10, border: `1.5px solid ${C.inputBdr}`,
                    background: C.inputBg, color: C.text, padding: '10px 13px', fontSize: 13.5,
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <Field
                label="Model"
                value={form.model}
                onChange={(v) => setForm((f) => ({ ...f, model: v }))}
                placeholder={DEFAULT_MODELS[form.provider]}
                hint="e.g. gpt-4o-mini or gemini-2.0-flash"
              />
            </div>
          </SectionCard>

          <SectionCard title="API Keys" subtitle="Keys are encrypted at rest. GET responses are masked.">
            <div style={{ display: 'grid', gap: 14 }}>
              <Field
                label="OpenAI API Key"
                value={form.openai_api_key}
                onChange={(v) => setForm((f) => ({ ...f, openai_api_key: v }))}
                placeholder={form.openai_api_key_set ? 'Key saved — paste to replace' : 'sk-...'}
                secret
                hint={form.openai_api_key_set ? 'A key is already saved for this salon.' : 'Required when provider is OpenAI.'}
              />
              <Field
                label="Gemini API Key"
                value={form.gemini_api_key}
                onChange={(v) => setForm((f) => ({ ...f, gemini_api_key: v }))}
                placeholder={form.gemini_api_key_set ? 'Key saved — paste to replace' : 'AIza...'}
                secret
                hint={form.gemini_api_key_set ? 'A key is already saved for this salon.' : 'Required when provider is Gemini.'}
              />
            </div>
          </SectionCard>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: C.primary || '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13.5,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            <button
              type="button"
              onClick={test}
              disabled={testing}
              style={{
                padding: '10px 18px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
                background: C.cardBg, color: C.text, fontWeight: 600, fontSize: 13.5,
                opacity: testing ? 0.7 : 1,
              }}
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button
              type="button"
              onClick={load}
              style={{
                padding: '10px 18px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
                background: 'transparent', color: C.muted, fontWeight: 600, fontSize: 13.5,
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
