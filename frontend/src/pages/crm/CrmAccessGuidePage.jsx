import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

/**
 * Dedicated guide: what access the salon must grant so WhatsApp AI CRM works,
 * what the AI can / cannot touch, and live connection checklist.
 */
export default function CrmAccessGuidePage() {
  const { C } = usePageTheme();
  const [wa, setWa] = useState({ status: 'unknown' });
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [waRes, aiRes] = await Promise.all([
        api.get('/notifications/whatsapp/status').catch(() => ({ data: {} })),
        api.get('/crm/ai-settings').catch(() => ({ data: null })),
      ]);
      setWa(waRes.data || {});
      setAi(aiRes.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const waOk = wa.status === 'connected';
  const geminiOk = ai?.provider === 'gemini' ? !!ai?.gemini_api_key_set : true;
  const openaiOk = ai?.provider === 'openai' ? !!ai?.openai_api_key_set : true;
  const keyOk = ai ? (ai.provider === 'gemini' ? geminiOk : ai.provider === 'openai' ? openaiOk : true) : false;

  return (
    <PageWrapper
      title="AI Access & Permissions"
      subtitle="Decide what to grant the system. This page lists every access the WhatsApp AI needs — and what it can never touch."
      actions={(
        <button type="button" onClick={load} style={ghostBtn(C)}>
          {loading ? 'Refreshing…' : 'Refresh status'}
        </button>
      )}
    >
      <div style={{ display: 'grid', gap: 16, maxWidth: 860 }}>
        {/* Live checklist */}
        <Card C={C} title="Setup checklist" subtitle="Green = ready. Fix red items before customers message you.">
          <CheckRow
            C={C}
            ok={waOk}
            title="WhatsApp Linked Device"
            detail={waOk
              ? `Connected as +${wa.phone || '—'}${wa.push_name ? ` (${wa.push_name})` : ''}`
              : 'Not connected — AI cannot send or receive WhatsApp messages.'}
            to="/crm/whatsapp-cloud"
            cta="Open WhatsApp"
          />
          <CheckRow
            C={C}
            ok={keyOk}
            title={`AI provider key (${ai?.provider || '—'})`}
            detail={keyOk
              ? `Using ${ai?.provider} / ${ai?.model || 'default model'}`
              : 'No API key saved — AI will only send limited template replies.'}
            to="/crm/ai-settings"
            cta="AI Settings"
          />
          <CheckRow
            C={C}
            ok
            title="Salon data access (automatic)"
            detail="Once CRM is enabled, AI may read this salon’s services, staff, packages, appointments, customers, knowledge, and rules only."
            to="/crm/rules"
            cta="AI Rules"
          />
        </Card>

        {/* What YOU must grant */}
        <Card C={C} title="What you must grant" subtitle="These are the only external permissions you approve.">
          <AccessBlock
            C={C}
            step="1"
            title="WhatsApp → Linked Devices (required)"
            body={[
              'Open WhatsApp on the salon phone → Settings → Linked Devices → Link a device.',
              'Scan the QR from CRM → WhatsApp. This lets HEXAONE send and receive chats as that WhatsApp number.',
              'You can unlink anytime from the phone. After unlink, AI stops until you scan again.',
            ]}
            grant="Access granted: read inbound messages + send replies from this WhatsApp account."
            link={{ to: '/crm/whatsapp-cloud', label: 'Connect WhatsApp QR' }}
          />
          <AccessBlock
            C={C}
            step="2"
            title="Google Gemini (or OpenAI) API key (required for smart replies)"
            body={[
              'Create a key in Google AI Studio (Gemini) or OpenAI.',
              'Paste it only in CRM → AI Settings for THIS salon. Keys are encrypted at rest.',
              'The key is used only to generate replies for your customers — not shared with other salons.',
            ]}
            grant="Access granted: call the AI provider to draft WhatsApp replies for your salon."
            link={{ to: '/crm/ai-settings', label: 'Paste API key' }}
          />
          <AccessBlock
            C={C}
            step="3"
            title="Optional — Meta WhatsApp Cloud API"
            body={[
              'Only if you use official Meta Business / WABA instead of (or with) QR.',
              'You paste WABA ID, Phone Number ID, access token, and app secret yourself.',
              'Skip this if QR Linked Devices is enough.',
            ]}
            grant="Access granted: send/receive via Meta Cloud API using your token."
            link={{ to: '/crm/whatsapp-cloud', label: 'Cloud API settings' }}
          />
        </Card>

        {/* What AI can access inside salon */}
        <Card C={C} title="What the AI can access inside your salon" subtitle="Tenant-isolated — only this salon’s data.">
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              ['Services & prices', 'List matching services; never invent prices'],
              ['Staff & availability', 'Help book / reschedule using live slots'],
              ['Packages & offers', 'Mention active packages/promotions when relevant'],
              ['Customer profile', 'Recognize returning customers by WhatsApp phone'],
              ['Appointments', 'Book, cancel, reschedule when the customer asks'],
              ['Knowledge Base', 'Answer FAQs/policies you published'],
              ['AI Rules', 'Follow your mandatory salon rules on every reply'],
              ['Chat history', 'Continue the same WhatsApp conversation naturally'],
            ].map(([t, d]) => (
              <div key={t} style={pillRow(C)}>
                <strong style={{ color: C.text }}>{t}</strong>
                <span style={{ color: C.muted }}>{d}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* What AI cannot access */}
        <Card C={C} title="What the AI cannot access" subtitle="Hard limits — even if a customer asks.">
          <ul style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 13.5, lineHeight: 1.55 }}>
            <li>Other salons / tenants (strict isolation)</li>
            <li>Your bank, payroll, accounting ledgers, or admin passwords</li>
            <li>Staff personal devices or non-linked WhatsApp accounts</li>
            <li>Medical diagnosis — it will send the guest to in-salon staff</li>
            <li>Inventing discounts, free services, or policies you did not publish</li>
          </ul>
        </Card>

        {/* How to decide */}
        <Card C={C} title="How to decide" subtitle="Simple policy for Salon Larvendo-style setups.">
          <ol style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 13.5, lineHeight: 1.6 }}>
            <li><strong>Must grant:</strong> WhatsApp Linked Device + Gemini/OpenAI key — without these, AI CRM cannot work.</li>
            <li><strong>Should grant:</strong> Publish Knowledge Base FAQs + AI Rules so replies match your salon voice.</li>
            <li><strong>Optional:</strong> Meta Cloud API when you want official WABA templates for marketing outside the 24h window.</li>
            <li><strong>Human takeover:</strong> Inbox → claim chat anytime; AI pauses until you release it.</li>
          </ol>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <Link to="/crm/whatsapp-cloud" style={primaryLink(C)}>1. Connect WhatsApp</Link>
            <Link to="/crm/ai-settings" style={primaryLink(C)}>2. AI Settings</Link>
            <Link to="/crm/ai-training" style={ghostLink(C)}>3. Train / Knowledge</Link>
            <Link to="/crm/rules" style={ghostLink(C)}>4. AI Rules</Link>
            <Link to="/crm/inbox" style={ghostLink(C)}>5. Inbox</Link>
          </div>
        </Card>
      </div>
    </PageWrapper>
  );
}

function Card({ C, title, subtitle, children }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: C.shadow }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, background: C.headerGrad }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: C.label, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  );
}

function CheckRow({ C, ok, title, detail, to, cta }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 999, flexShrink: 0, marginTop: 1,
          background: ok ? '#DCFCE7' : '#FEE2E2', color: ok ? '#166534' : '#991B1B',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
        }}>
          {ok ? '✓' : '!'}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 13.5 }}>{title}</div>
          <div style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{detail}</div>
        </div>
      </div>
      {to && (
        <Link to={to} style={{ ...ghostLink(C), whiteSpace: 'nowrap', fontSize: 12 }}>
          {cta}
        </Link>
      )}
    </div>
  );
}

function AccessBlock({ C, step, title, body, grant, link }) {
  return (
    <div style={{
      padding: '14px 0',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 8, background: C.headerGrad || '#EEF2FF',
          color: C.text, fontWeight: 800, fontSize: 12,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}`,
        }}>
          {step}
        </span>
        <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{title}</div>
      </div>
      <ul style={{ margin: '0 0 8px', paddingLeft: 28, color: C.muted, fontSize: 13, lineHeight: 1.55 }}>
        {body.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <div style={{
        marginLeft: 28, marginBottom: 8, fontSize: 12.5, color: '#166534',
        background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 10px',
      }}>
        {grant}
      </div>
      {link && (
        <div style={{ marginLeft: 28 }}>
          <Link to={link.to} style={ghostLink(C)}>{link.label} →</Link>
        </div>
      )}
    </div>
  );
}

function pillRow(C) {
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(120px, 180px) 1fr',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    fontSize: 13,
  };
}

function ghostBtn(C) {
  return {
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

function ghostLink(C) {
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
    textDecoration: 'none',
  };
}

function primaryLink(C) {
  return {
    ...ghostLink(C),
    background: '#111827',
    borderColor: '#111827',
    color: '#fff',
  };
}
