import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * Full-page owner guide: what access to grant WhatsApp AI CRM,
 * live readiness, and what the AI can / cannot touch.
 */
export default function CrmAccessGuidePage() {
  const { C } = usePageTheme();
  const { isMobile } = useBreakpoint();
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
  const keyOk = ai
    ? (ai.provider === 'gemini'
      ? !!ai.gemini_api_key_set
      : ai.provider === 'openai'
        ? !!ai.openai_api_key_set
        : true)
    : false;
  const readyCount = [waOk, keyOk].filter(Boolean).length;

  return (
    <PageWrapper
      title="AI Access & Permissions"
      subtitle="System එකට මොන access දෙන්නද — සහ AI ට මොනවා පෙනෙනවද / නොපෙනෙනවද — මේ full page එකේ තීරණය කරන්න."
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={load} style={ghostBtn(C)}>
            {loading ? 'Refreshing…' : 'Refresh status'}
          </button>
          <Link to="/crm/whatsapp-cloud" style={primaryBtn(C)}>Connect WhatsApp</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gap: isMobile ? 14 : 20, width: '100%' }}>
        {/* Hero status band — full width */}
        <section style={{
          ...band(C),
          background: C.isDark
            ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #0B1220 100%)'
            : 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 45%, #ECFDF5 100%)',
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 18, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.label, marginBottom: 8 }}>
                Salon owner decision page
              </div>
              <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 800, color: C.text, lineHeight: 1.25, letterSpacing: '-0.02em' }}>
                WhatsApp AI CRM වැඩ කරන්න ඕන access මෙතනින් තීරණය කරන්න
              </h2>
              <p style={{ margin: '10px 0 0', fontSize: 14.5, color: C.muted, lineHeight: 1.55, maxWidth: 640 }}>
                මේ page එකෙන් ඔයාට පේනවා: WhatsApp Linked Device, Gemini/OpenAI key, optional Meta Cloud —
                මොනවා <strong style={{ color: C.text }}>දෙන්න ඕනද</strong>, මොනවා <strong style={{ color: C.text }}>optional</strong> ද,
                සහ AI ට salon data එකෙන් මොනවා පෙනෙනවද.
              </p>
            </div>
            <div style={{
              display: 'grid', gap: 10, padding: 16, borderRadius: 14,
              background: C.cardBg, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                Readiness · {readyCount}/2 required
              </div>
              <StatusChip ok={waOk} label={waOk ? `WhatsApp · +${wa.phone || 'connected'}` : 'WhatsApp · not connected'} />
              <StatusChip ok={keyOk} label={keyOk ? `AI key · ${ai?.provider || 'ready'}` : 'AI key · missing'} />
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {waOk && keyOk
                  ? 'Required access ready. Customers can chat — AI can reply.'
                  : 'Fix red items below before promising AI replies to customers.'}
              </div>
            </div>
          </div>
        </section>

        {/* Checklist — full width 3 cols */}
        <section style={sectionShell(C)}>
          <SectionHead
            C={C}
            kicker="01 · Live checklist"
            title="දැන් status එක"
            subtitle="Green = ready. Red = customersට AI reply යන්නේ නැහැ."
          />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, padding: isMobile ? 14 : 18 }}>
            <StatusCard
              C={C}
              ok={waOk}
              title="WhatsApp Linked Device"
              detail={waOk
                ? `Connected as +${wa.phone || '—'}${wa.push_name ? ` (${wa.push_name})` : ''}`
                : 'Phone → Linked Devices → QR scan කරන්න. නැත්නම් AI messages යවන්න/ගන්න බෑ.'}
              to="/crm/whatsapp-cloud"
              cta={waOk ? 'Manage WhatsApp' : 'Connect now'}
            />
            <StatusCard
              C={C}
              ok={keyOk}
              title={`AI provider (${ai?.provider || '—'})`}
              detail={keyOk
                ? `Model: ${ai?.model || 'default'}. Key encrypted & salon-only.`
                : 'Gemini/OpenAI key save කරන්න — නැත්නම් limited template replies විතරයි.'}
              to="/crm/ai-settings"
              cta="Open AI Settings"
            />
            <StatusCard
              C={C}
              ok
              title="Salon data (automatic)"
              detail="CRM enable නම් AI ට මේ salon එකේ services, staff, bookings, customers, knowledge, rules පෙනෙනවා — වෙන salon එකකට නෙවෙයි."
              to="/crm/rules"
              cta="Review AI Rules"
            />
          </div>
        </section>

        {/* What you must grant — full steps */}
        <section style={sectionShell(C)}>
          <SectionHead
            C={C}
            kicker="02 · You grant"
            title="System එකට දෙන්න ඕන access"
            subtitle="External permissions තුනයි. ඔයා approve කරන ඒවා විතරයි."
          />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 0 }}>
            <GrantColumn
              C={C}
              step="1"
              required
              title="WhatsApp Linked Devices"
              sin="Salon phone එකෙන් QR scan"
              points={[
                'WhatsApp → Settings → Linked Devices → Link a device',
                'CRM → WhatsApp page එකේ QR scan කරන්න',
                'මේකෙන් HEXAONE ට ඒ number එකෙන් chat යවන්න/ගන්න පුළුවන්',
                'Phone එකෙන් Unlink කළොත් AI එක නවතිනවා',
              ]}
              grant="Inbound + outbound WhatsApp for this number"
              to="/crm/whatsapp-cloud"
              cta="Open WhatsApp page"
              borderRight={!isMobile}
            />
            <GrantColumn
              C={C}
              step="2"
              required
              title="Gemini / OpenAI API key"
              sin="Smart replies සඳහා"
              points={[
                'Google AI Studio (Gemini) හෝ OpenAI වලින් key එකක් හදන්න',
                'CRM → AI Settings එකේ මේ salon එකට විතරක් paste කරන්න',
                'Key encrypted store වෙනවා — වෙන salon එකකට share වෙන්නේ නැහැ',
                'Key නැත්නම් AI limited welcome විතරයි කියනවා',
              ]}
              grant="Call AI provider to draft customer replies"
              to="/crm/ai-settings"
              cta="Paste API key"
              borderRight={!isMobile}
            />
            <GrantColumn
              C={C}
              step="3"
              required={false}
              title="Meta Cloud API (optional)"
              sin="Official WABA අවශ්‍ය නම් විතරයි"
              points={[
                'QR එකෙන් වැඩ නම් මේක skip කරන්න පුළුවන්',
                'WABA ID, Phone Number ID, access token, app secret paste කරන්න',
                '24h window එකෙන් පිට marketing templates ඕන නම් ප්‍රයෝජනවත්',
                'Token ඔයාගේ Meta Business account එකෙන්ම එනවා',
              ]}
              grant="Send/receive via Meta using your token"
              to="/crm/whatsapp-cloud"
              cta="Cloud API settings"
            />
          </div>
        </section>

        {/* Can vs Cannot — full width split */}
        <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          <div style={sectionShell(C)}>
            <SectionHead
              C={C}
              kicker="03 · AI can see"
              title="AI ට පෙනෙන salon data"
              subtitle="මේ salon එකට විතරයි — tenant isolation."
            />
            <div style={{ padding: isMobile ? 14 : 18, displayTop: `1px solid ${C.border}`, display: 'grid', gap: 8 }}>
              {[
                ['Services & prices', 'Matching services පෙන්වනවා — prices invent කරන්නේ නැහැ'],
                ['Staff & availability', 'Book / reschedule සඳහා live slots'],
                ['Packages & offers', 'Active packages / promotions'],
                ['Customer profile', 'WhatsApp number එකෙන් returning guest හඳුනනවා'],
                ['Appointments', 'Book, cancel, reschedule (customer අහනකොට)'],
                ['Knowledge Base', 'ඔයා publish කළ FAQs / policies'],
                ['AI Rules', 'ඔයා දාපු mandatory rules හැම reply එකකටම'],
                ['Chat history', 'එකම conversation එක natural විදිහට continue'],
              ].map(([t, d]) => (
                <div key={t} style={rowItem(C, true)}>
                  <span style={dot(true)}>✓</span>
                  <div>
                    <div style={{ fontWeight: 700, color: C.text, fontSize: 13.5 }}>{t}</div>
                    <div style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={sectionShell(C)}>
            <SectionHead
              C={C}
              kicker="04 · AI cannot see"
              title="AI ට නොපෙනෙන / කරන්න බැරි දේ"
              subtitle="Customer අහුවත් මේවා block."
            />
            <div style={{ padding: isMobile ? 14 : 18, borderTop: `1px solid ${C.border}`, display: 'grid', gap: 8 }}>
              {[
                ['Other salons', 'වෙන tenant / salon data කිසිදාක නොපෙනෙයි'],
                ['Money systems', 'Bank, payroll, accounting ledgers, admin passwords නැහැ'],
                ['Other phones', 'Link නොකළ staff personal WhatsApp accounts නැහැ'],
                ['Medical advice', 'Skin/hair diagnosis නැහැ — in-salon staff ට යවනවා'],
                ['Fake offers', 'ඔයා publish නොකළ discounts / free services invent නැහැ'],
                ['Ignore your rules', 'AI Rules / handoff rules override soft defaults'],
              ].map(([t, d]) => (
                <div key={t} style={rowItem(C, false)}>
                  <span style={dot(false)}>✕</span>
                  <div>
                    <div style={{ fontWeight: 700, color: C.text, fontSize: 13.5 }}>{t}</div>
                    <div style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Decision + next actions — full width */}
        <section style={sectionShell(C)}>
          <SectionHead
            C={C}
            kicker="05 · Decide & go"
            title="කොහොමද තීරණය කරන්නේ"
            subtitle="Larvendo-style salon එකකට simple policy."
          />
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr',
            gap: 0,
            borderTop: `1px solid ${C.border}`,
          }}>
            <div style={{ padding: isMobile ? 14 : 20, borderRight: isMobile ? 'none' : `1px solid ${C.border}` }}>
              <ol style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 14, lineHeight: 1.7 }}>
                <li><strong>Must:</strong> WhatsApp Linked Device + Gemini/OpenAI key — නැත්නම් AI CRM වැඩ නැහැ.</li>
                <li><strong>Should:</strong> Knowledge Base FAQs + AI Rules — salon voice එකට match වෙන්න.</li>
                <li><strong>Optional:</strong> Meta Cloud API — official templates / WABA ඕන නම්.</li>
                <li><strong>Control:</strong> Inbox → claim chat කරලා human takeover කරන්න පුළුවන්; release කරනකන් AI නවතිනවා.</li>
              </ol>
            </div>
            <div style={{ padding: isMobile ? 14 : 20, display: 'grid', gap: 10, alignContent: 'start' }}>
              <Link to="/crm/whatsapp-cloud" style={bigCta(C, true)}>1 · Connect WhatsApp QR</Link>
              <Link to="/crm/ai-settings" style={bigCta(C, true)}>2 · AI Settings (API key)</Link>
              <Link to="/crm/ai-training" style={bigCta(C, false)}>3 · Train / Knowledge</Link>
              <Link to="/crm/rules" style={bigCta(C, false)}>4 · AI Rules</Link>
              <Link to="/crm/inbox" style={bigCta(C, false)}>5 · Open Inbox</Link>
            </div>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}

function SectionHead({ C, kicker, title, subtitle }) {
  return (
    <div style={{ padding: '16px 18px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.primary || '#2563EB', marginBottom: 6 }}>
        {kicker}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{title}</div>
      {subtitle && <div style={{ marginTop: 4, fontSize: 13.5, color: C.muted, lineHeight: 1.45 }}>{subtitle}</div>}
    </div>
  );
}

function StatusChip({ ok, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
      color: ok ? '#166534' : '#991B1B',
      background: ok ? '#F0FDF4' : '#FEF2F2',
      border: `1px solid ${ok ? '#BBF7D0' : '#FECACA'}`,
      borderRadius: 10, padding: '8px 10px',
    }}>
      <span>{ok ? '✓' : '!'}</span>
      <span>{label}</span>
    </div>
  );
}

function StatusCard({ C, ok, title, detail, to, cta }) {
  return (
    <div style={{
      border: `1px solid ${ok ? '#BBF7D0' : '#FECACA'}`,
      background: ok ? (C.isDark ? '#052e16' : '#F0FDF4') : (C.isDark ? '#450a0a' : '#FEF2F2'),
      borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 160,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 999, fontWeight: 800, fontSize: 12,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: ok ? '#166534' : '#991B1B', color: '#fff',
        }}>
          {ok ? '✓' : '!'}
        </span>
        <div style={{ fontWeight: 800, color: C.text, fontSize: 14 }}>{title}</div>
      </div>
      <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, flex: 1 }}>{detail}</div>
      <Link to={to} style={{ ...ghostBtn(C), textAlign: 'center', textDecoration: 'none', justifyContent: 'center' }}>{cta}</Link>
    </div>
  );
}

function GrantColumn({ C, step, required, title, sin, points, grant, to, cta, borderRight }) {
  return (
    <div style={{
      padding: 18,
      borderRight: borderRight ? `1px solid ${C.border}` : 'none',
      borderTop: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', gap: 12, minHeight: 320,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 13, color: C.text, background: C.soft || C.cardBg,
        }}>
          {step}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: required ? '#166534' : C.muted,
          background: required ? '#DCFCE7' : C.softer || '#F3F4F6',
          borderRadius: 999, padding: '3px 8px',
        }}>
          {required ? 'Required' : 'Optional'}
        </span>
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sin}</div>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: C.muted, fontSize: 13, lineHeight: 1.55, flex: 1 }}>
        {points.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <div style={{
        fontSize: 12.5, color: '#166534', background: '#F0FDF4', border: '1px solid #BBF7D0',
        borderRadius: 10, padding: '8px 10px', lineHeight: 1.4,
      }}>
        {grant}
      </div>
      <Link to={to} style={{ ...ghostBtn(C), textDecoration: 'none', justifyContent: 'center', textAlign: 'center' }}>{cta} →</Link>
    </div>
  );
}

function band(C) {
  return { borderRadius: 18, padding: '22px 20px', boxShadow: C.shadow };
}

function sectionShell(C) {
  return {
    background: C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 18,
    overflow: 'hidden',
    boxShadow: C.shadow,
    width: '100%',
  };
}

function rowItem(C, ok) {
  return {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    padding: '10px 12px', borderRadius: 12,
    border: `1px solid ${C.border}`,
    background: C.soft || 'transparent',
  };
}

function dot(ok) {
  return {
    width: 22, height: 22, borderRadius: 999, flexShrink: 0, marginTop: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 800,
    background: ok ? '#DCFCE7' : '#FEE2E2',
    color: ok ? '#166534' : '#991B1B',
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
    textDecoration: 'none',
  };
}

function bigCta(C, primary) {
  return {
    display: 'block',
    textAlign: 'center',
    textDecoration: 'none',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 700,
    border: `1px solid ${primary ? '#111827' : C.border}`,
    background: primary ? '#111827' : C.cardBg,
    color: primary ? '#fff' : C.text,
  };
}
