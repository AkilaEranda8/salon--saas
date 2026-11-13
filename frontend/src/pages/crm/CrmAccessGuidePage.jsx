import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * Full advanced AI Access page (English only).
 * Owners tick the exact access they grant; required ticks must be on before AI replies.
 */
export default function CrmAccessGuidePage() {
  const { C } = usePageTheme();
  const { isMobile } = useBreakpoint();
  const [wa, setWa] = useState({ status: 'unknown' });
  const [ai, setAi] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [grants, setGrants] = useState({});
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [waRes, aiRes, accessRes] = await Promise.all([
        api.get('/notifications/whatsapp/status').catch(() => ({ data: {} })),
        api.get('/crm/ai-settings').catch(() => ({ data: null })),
        api.get('/crm/ai-access'),
      ]);
      setWa(waRes.data || {});
      setAi(aiRes.data || null);
      const access = accessRes.data || {};
      setCatalog(access.catalog || []);
      setGrants(access.grants || {});
      setReady(!!access.ready);
      setMissing(access.missing || []);
      setDirty(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load access settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const waOk = wa.status === 'connected';
  const keyOk = ai
    ? (ai.provider === 'gemini'
      ? !!ai.gemini_api_key_set
      : ai.provider === 'openai'
        ? !!ai.openai_api_key_set
        : true)
    : false;

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of catalog) {
      const g = item.group || 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(item);
    }
    return [...map.entries()];
  }, [catalog]);

  const requiredCount = catalog.filter((i) => i.required).length;
  const requiredOn = catalog.filter((i) => i.required && grants[i.key]).length;
  const optionalOn = catalog.filter((i) => !i.required && grants[i.key]).length;

  const toggle = (key) => {
    setGrants((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const setAllRequired = (value) => {
    setGrants((prev) => {
      const next = { ...prev };
      for (const item of catalog) {
        if (item.required) next[item.key] = value;
      }
      return next;
    });
    setDirty(true);
  };

  const setAllOptional = (value) => {
    setGrants((prev) => {
      const next = { ...prev };
      for (const item of catalog) {
        if (!item.required) next[item.key] = value;
      }
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/crm/ai-access', { grants });
      setGrants(data.grants || {});
      setCatalog(data.catalog || catalog);
      setReady(!!data.ready);
      setMissing(data.missing || []);
      setDirty(false);
      toast.success(data.ready ? 'Access saved — AI is allowed to reply' : 'Access saved — tick all Required items to enable AI');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWrapper
      title="AI Access & Permissions"
      subtitle="Tick every access you want to grant this salon’s WhatsApp AI. Required items must be enabled before AI replies customers."
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={load} style={ghostBtn(C)} disabled={loading || saving}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" onClick={save} style={primaryBtn(C)} disabled={!dirty || saving}>
            {saving ? 'Saving…' : dirty ? 'Save access' : 'Saved'}
          </button>
        </div>
      )}
    >
      <div style={{ display: 'grid', gap: isMobile ? 14 : 18, width: '100%' }}>
        {/* Top readiness */}
        <section style={{
          borderRadius: 18, padding: isMobile ? 16 : 22,
          border: `1px solid ${C.border}`,
          background: C.isDark
            ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
            : 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 50%, #ECFDF5 100%)',
          boxShadow: C.shadow,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: 16 }}>
            <div>
              <div style={kicker(C)}>Advanced access control</div>
              <h2 style={{ margin: '6px 0 0', fontSize: isMobile ? 22 : 26, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>
                Grant access with ticks — then connect WhatsApp & AI key
              </h2>
              <p style={{ margin: '10px 0 0', color: C.muted, fontSize: 14, lineHeight: 1.55, maxWidth: 620 }}>
                Use this page to decide exactly what the AI may do. Unticked required access blocks automated replies.
                Connection status below is separate: you still need WhatsApp Linked Device and an API key.
              </p>
            </div>
            <div style={{
              background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14,
              display: 'grid', gap: 8,
            }}>
              <Meter label="Required ticks" value={`${requiredOn}/${requiredCount || '—'}`} ok={requiredOn === requiredCount && requiredCount > 0} C={C} />
              <Meter label="Optional ticks" value={`${optionalOn}`} ok={optionalOn > 0} C={C} />
              <Meter label="WhatsApp link" value={waOk ? `+${wa.phone || 'connected'}` : 'Not connected'} ok={waOk} C={C} />
              <Meter label="AI API key" value={keyOk ? (ai?.provider || 'set') : 'Missing'} ok={keyOk} C={C} />
              <div style={{
                marginTop: 4, padding: '8px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                background: ready && waOk && keyOk ? '#DCFCE7' : '#FEF3C7',
                color: ready && waOk && keyOk ? '#166534' : '#92400E',
              }}>
                {ready && waOk && keyOk
                  ? 'Ready: access granted + WhatsApp + AI key'
                  : !ready
                    ? `Blocked: tick required access${missing.length ? ` (${missing.join(', ')})` : ''}`
                    : !waOk
                      ? 'Access OK — connect WhatsApp QR next'
                      : 'Access OK — add AI API key next'}
              </div>
            </div>
          </div>
        </section>

        {/* Tick panel */}
        <section style={shell(C)}>
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div>
              <div style={kicker(C)}>01 · Access grants</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Tick access to grant</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                Required items must all be ticked. Optional items refine what AI can do.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={ghostBtn(C)} onClick={() => setAllRequired(true)}>Tick all required</button>
              <button type="button" style={ghostBtn(C)} onClick={() => setAllOptional(true)}>Tick all optional</button>
              <button type="button" style={ghostBtn(C)} onClick={() => { setAllRequired(false); setAllOptional(false); }}>Clear all</button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 24, color: C.muted }}>Loading access catalog…</div>
          ) : (
            <div style={{ display: 'grid', gap: 0 }}>
              {groups.map(([group, items]) => (
                <div key={group} style={{ borderTop: `1px solid ${C.border}` }}>
                  <div style={{
                    padding: '12px 18px', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: C.label, background: C.headerGrad || C.soft,
                  }}>
                    {group}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 0 }}>
                    {items.map((item, idx) => (
                      <GrantTick
                        key={item.key}
                        C={C}
                        item={item}
                        checked={!!grants[item.key]}
                        onToggle={() => toggle(item.key)}
                        borderRight={!isMobile && idx % 2 === 0}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{
            padding: 16, borderTop: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
            </div>
            <button type="button" onClick={save} style={primaryBtn(C)} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save access grants'}
            </button>
          </div>
        </section>

        {/* Connection steps */}
        <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 14 }}>
          <ConnCard
            C={C}
            step="2"
            title="Connect WhatsApp"
            ok={waOk}
            body="Link the salon phone via WhatsApp → Linked Devices → scan CRM QR."
            to="/crm/whatsapp-cloud"
            cta={waOk ? 'Manage WhatsApp' : 'Connect WhatsApp'}
          />
          <ConnCard
            C={C}
            step="3"
            title="AI provider key"
            ok={keyOk}
            body={`Save a ${ai?.provider || 'Gemini/OpenAI'} API key in AI Settings for smart replies.`}
            to="/crm/ai-settings"
            cta="Open AI Settings"
          />
          <ConnCard
            C={C}
            step="4"
            title="Train & rules"
            ok
            body="Add Knowledge FAQs and AI Rules so replies match your salon voice."
            to="/crm/rules"
            cta="Open AI Rules"
          />
        </section>

        {/* Reference: can / cannot */}
        <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div style={shell(C)}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={kicker(C)}>Reference</div>
              <div style={{ fontWeight: 800, color: C.text, fontSize: 16 }}>What AI can use (when ticked)</div>
            </div>
            <ul style={{ margin: 0, padding: '14px 18px 18px 34px', color: C.muted, fontSize: 13.5, lineHeight: 1.6 }}>
              <li>This salon’s services, prices, packages, and offers</li>
              <li>Staff availability and appointment booking tools</li>
              <li>Customer recognition by WhatsApp phone</li>
              <li>Knowledge base articles and AI Rules you published</li>
              <li>Chat history for natural conversation continuity</li>
            </ul>
          </div>
          <div style={shell(C)}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={kicker(C)}>Reference</div>
              <div style={{ fontWeight: 800, color: C.text, fontSize: 16 }}>What AI never gets</div>
            </div>
            <ul style={{ margin: 0, padding: '14px 18px 18px 34px', color: C.muted, fontSize: 13.5, lineHeight: 1.6 }}>
              <li>Other salons / tenants</li>
              <li>Bank, payroll, accounting ledgers, admin passwords</li>
              <li>Unlinked personal staff WhatsApp accounts</li>
              <li>Medical diagnosis authority</li>
              <li>Permission to invent discounts you did not publish</li>
            </ul>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}

function GrantTick({ C, item, checked, onToggle, borderRight }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left',
        padding: '14px 16px', minHeight: 110, cursor: 'pointer',
        background: checked ? (C.isDark ? '#052e16' : '#F0FDF4') : C.cardBg,
        border: 'none',
        borderRight: borderRight ? `1px solid ${C.border}` : 'none',
        borderBottom: `1px solid ${C.border}`,
        width: '100%',
      }}
    >
      <span style={{
        width: 24, height: 24, borderRadius: 7, flexShrink: 0, marginTop: 1,
        border: `2px solid ${checked ? '#166534' : C.border}`,
        background: checked ? '#166534' : 'transparent',
        color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800,
      }}>
        {checked ? '✓' : ''}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, color: C.text, fontSize: 14 }}>{item.title}</span>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
            borderRadius: 999, padding: '2px 7px',
            background: item.required ? '#DCFCE7' : (C.softer || '#F3F4F6'),
            color: item.required ? '#166534' : C.muted,
          }}>
            {item.required ? 'Required' : 'Optional'}
          </span>
        </span>
        <span style={{ display: 'block', marginTop: 4, color: C.muted, fontSize: 12.5, lineHeight: 1.45 }}>
          {item.description}
        </span>
      </span>
    </button>
  );
}

function ConnCard({ C, step, title, ok, body, to, cta }) {
  return (
    <div style={{
      ...shell(C),
      padding: 16,
      borderColor: ok ? '#BBF7D0' : C.border,
      background: ok ? (C.isDark ? '#052e16' : '#F0FDF4') : C.cardBg,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.label, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Step {step}
      </div>
      <div style={{ fontWeight: 800, color: C.text, fontSize: 15, marginTop: 4 }}>{title}</div>
      <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, margin: '8px 0 12px', minHeight: 54 }}>{body}</div>
      <Link to={to} style={{ ...ghostBtn(C), textDecoration: 'none', justifyContent: 'center' }}>{cta}</Link>
    </div>
  );
}

function Meter({ label, value, ok, C }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: ok ? '#166534' : '#92400E' }}>{value}</span>
    </div>
  );
}

function shell(C) {
  return {
    background: C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 18,
    overflow: 'hidden',
    boxShadow: C.shadow,
    width: '100%',
  };
}

function kicker(C) {
  return {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: C.primary || '#2563EB',
  };
}

function ghostBtn(C) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    border: `1px solid ${C.border}`,
    background: C.cardBg,
    color: C.text,
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function primaryBtn(C) {
  return {
    ...ghostBtn(C),
    background: '#111827',
    borderColor: '#111827',
    color: '#fff',
  };
}
