import { useState } from 'react';
import api from '../../api/axios';

const TYPE_STYLES = {
  positive: { bg: '#F0FDF4', border: '#86EFAC', badge: '#16A34A', badgeBg: '#DCFCE7', label: 'Good' },
  warning:  { bg: '#FFFBEB', border: '#FDE68A', badge: '#D97706', badgeBg: '#FEF3C7', label: 'Note' },
  negative: { bg: '#FEF2F2', border: '#FECACA', badge: '#DC2626', badgeBg: '#FEE2E2', label: 'Alert' },
  info:     { bg: '#EFF6FF', border: '#BFDBFE', badge: '#2563EB', badgeBg: '#DBEAFE', label: 'Info' },
};

const CSS = `
@keyframes aiSlideIn {
  from { opacity:0; transform:translateY(10px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes aiPulse {
  0%,100% { opacity:1; }
  50%     { opacity:0.4; }
}
`;

function InsightCard({ insight, index }) {
  const s = TYPE_STYLES[insight.type] || TYPE_STYLES.info;
  return (
    <div style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      gap: 12,
      animation: `aiSlideIn 0.3s ease ${index * 0.06}s both`,
    }}>
      <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.4 }}>{insight.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#101828' }}>{insight.title}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: s.badge,
            background: s.badgeBg, padding: '1px 7px', borderRadius: 20,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>{s.label}</span>
        </div>
        <p style={{ fontSize: 13, color: '#475467', margin: 0, lineHeight: 1.55 }}>{insight.body}</p>
      </div>
    </div>
  );
}

export default function AiInsightsPanel({ reportData }) {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [generated, setGenerated] = useState(false);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/ai/insights', reportData);
      setInsights(res.data.insights || []);
      setGenerated(true);
    } catch {
      setError('Could not generate insights. Make sure the AI bot is running.');
    } finally {
      setLoading(false);
    }
  }

  const counts = {
    positive: insights.filter(i => i.type === 'positive').length,
    warning:  insights.filter(i => i.type === 'warning').length,
    negative: insights.filter(i => i.type === 'negative').length,
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #E4E7EC',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1E40AF 0%, #7C3AED 100%)',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>🤖</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>AI Insights</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
                Powered by HEXA SALON AI
              </div>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={loading}
            style={{
              background: loading ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              borderRadius: 10,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              transition: 'background 0.2s',
            }}
          >
            {loading ? (
              <>
                <span style={{ animation: 'aiPulse 1s infinite' }}>⏳</span>
                Analyzing...
              </>
            ) : (
              <>{generated ? '🔄 Refresh' : '✨ Generate Insights'}</>
            )}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {!generated && !loading && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94A3B8' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🧠</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#475467', marginBottom: 6 }}>
                AI-Powered Business Analysis
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                Click <strong>"Generate Insights"</strong> to analyze your revenue,
                services, staff performance, and customers.
              </div>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <div style={{ fontSize: 32, marginBottom: 12, animation: 'aiPulse 1s infinite' }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#475467' }}>
                Analyzing your salon data...
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 10, padding: '12px 16px',
              fontSize: 13, color: '#DC2626',
            }}>
              ⚠️ {error}
            </div>
          )}

          {generated && !loading && insights.length > 0 && (
            <>
              {/* Summary badges */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>{insights.length} insights found:</span>
                {counts.positive > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#16A34A', background: '#DCFCE7', padding: '2px 10px', borderRadius: 20 }}>
                    {counts.positive} positive
                  </span>
                )}
                {counts.warning > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#D97706', background: '#FEF3C7', padding: '2px 10px', borderRadius: 20 }}>
                    {counts.warning} warnings
                  </span>
                )}
                {counts.negative > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', background: '#FEE2E2', padding: '2px 10px', borderRadius: 20 }}>
                    {counts.negative} alerts
                  </span>
                )}
              </div>

              {/* Insight cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insights.map((ins, i) => (
                  <InsightCard key={i} insight={ins} index={i} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
