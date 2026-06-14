import { useState, useRef, useEffect } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';

/* ── Quick reply suggestions ── */
const SUGGESTIONS = [
  { label: 'Today appointments', text: 'how many appointments today',  icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Pending bookings',   text: 'show pending appointments',    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Today revenue',      text: "today's revenue",              icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Staff stats',        text: 'show staff performance',       icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { label: 'Low stock',          text: 'show low inventory',           icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4' },
  { label: 'Walk-in queue',      text: 'walk in queue status',         icon: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' },
  { label: 'Customers',          text: 'how many customers',           icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { label: 'Services',           text: 'show services',                icon: 'M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z' },
  { label: 'Help',               text: 'help',                         icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

/* ── Reusable SVG icon ── */
const Ico = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const IconSend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);

const IconBot = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M12 11V3m0 0L9 6m3-3l3 3" />
    <circle cx="8.5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
    <path d="M9 20h6" />
  </svg>
);

const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconSpark = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const CSS = `
@keyframes msgIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes dotBounce { 0%,80%,100% { transform:translateY(0); } 40% { transform:translateY(-6px); } }
@keyframes pulseGlow { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
`;

function renderInline(text, isDark) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={i} style={{
          background: isDark ? 'rgba(99,102,241,0.2)' : '#EFF6FF',
          color: isDark ? '#A5B4FC' : '#3730A3',
          padding: '1px 6px', borderRadius: 4,
          fontSize: '0.88em', fontFamily: 'monospace',
        }}>
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

function renderMarkdown(text, isDark) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Headings
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    if (h3) {
      result.push(<div key={i} style={{ fontWeight: 700, fontSize: 13.5, marginTop: 8, marginBottom: 2, color: isDark ? '#C4B5FD' : '#5B21B6' }}>{renderInline(h3[1], isDark)}</div>);
    } else if (h2) {
      result.push(<div key={i} style={{ fontWeight: 700, fontSize: 14, marginTop: 8, marginBottom: 2, color: isDark ? '#93C5FD' : '#1D4ED8' }}>{renderInline(h2[1], isDark)}</div>);
    } else if (h1) {
      result.push(<div key={i} style={{ fontWeight: 800, fontSize: 15, marginTop: 8, marginBottom: 4, color: isDark ? '#93C5FD' : '#1E3A5F' }}>{renderInline(h1[1], isDark)}</div>);
    // Bullet lists: -, *, •
    } else if (/^[-*•]\s+/.test(line)) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <span style={{ color: isDark ? '#A5B4FC' : '#6366F1', flexShrink: 0, marginTop: 1 }}>•</span>
          <span>{renderInline(line.replace(/^[-*•]\s+/, ''), isDark)}</span>
        </div>
      );
    // Numbered lists: 1. 2. etc
    } else if (/^\d+\.\s+/.test(line)) {
      const num = line.match(/^(\d+)\./)[1];
      result.push(
        <div key={i} style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <span style={{ color: isDark ? '#A5B4FC' : '#6366F1', flexShrink: 0, minWidth: 16, fontWeight: 600 }}>{num}.</span>
          <span>{renderInline(line.replace(/^\d+\.\s+/, ''), isDark)}</span>
        </div>
      );
    // Horizontal rule
    } else if (/^---+$/.test(line.trim())) {
      result.push(<hr key={i} style={{ border: 'none', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`, margin: '6px 0' }} />);
    // Empty line → spacing
    } else if (line.trim() === '') {
      result.push(<div key={i} style={{ height: 6 }} />);
    // Normal text
    } else {
      result.push(<span key={i}>{renderInline(line, isDark)}<br /></span>);
    }
    i++;
  }
  return result;
}

function Message({ msg, isDark, onRetry }) {
  const isBot = msg.from === 'bot';
  const isError = msg.error === true;
  return (
    <div style={{
      display: 'flex',
      justifyContent: isBot ? 'flex-start' : 'flex-end',
      animation: 'msgIn 0.25s ease',
      marginBottom: 4,
      gap: 8,
    }}>
      {isBot && (
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: isError ? '#FEE2E2' : 'linear-gradient(135deg, #2563EB, #7C3AED)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, alignSelf: 'flex-end',
          color: isError ? '#DC2626' : '#fff',
          border: isError ? '1px solid #FECACA' : 'none',
        }}>
          <IconBot />
        </div>
      )}
      <div style={{
        maxWidth: '72%',
        background: isBot
          ? (isDark ? '#1E293B' : '#FFFFFF')
          : 'linear-gradient(135deg, #2563EB, #7C3AED)',
        color: isBot
          ? (isDark ? '#E2E8F0' : '#101828')
          : '#FFFFFF',
        borderRadius: isBot ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
        padding: '11px 15px',
        fontSize: 13.5,
        lineHeight: 1.65,
        boxShadow: isBot
          ? (isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.07)')
          : '0 2px 12px rgba(37,99,235,0.28)',
        border: isBot
          ? `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#EAECF0'}`
          : 'none',
        wordBreak: 'break-word',
        fontFamily: "'Inter',sans-serif",
      }}>
        <div>{renderMarkdown(msg.text, isDark)}</div>
        {isError && onRetry && (
          <button
            onClick={() => onRetry(msg.originalText)}
            style={{
              marginTop: 8, padding: '4px 10px', fontSize: 11.5, fontWeight: 600,
              background: 'transparent', border: '1px solid #FECACA',
              borderRadius: 6, color: '#DC2626', cursor: 'pointer',
              fontFamily: "'Inter',sans-serif",
            }}
          >
            ↺ Retry
          </button>
        )}
        {msg.intent && isBot && !isError && (
          <div style={{
            marginTop: 8, fontSize: 10.5, fontStyle: 'italic',
            color: msg.confidence > 0.6 ? '#10B981' : msg.confidence > 0.35 ? '#F59E0B' : '#EF4444',
            opacity: 0.8, display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <IconSpark />
            {msg.intent.replace(/_/g, ' ')} · {(msg.confidence * 100).toFixed(0)}% confidence
          </div>
        )}
      </div>
      {!isBot && (
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: isDark ? 'rgba(37,99,235,0.2)' : 'linear-gradient(135deg, #EEF4FF, #DBEAFE)',
          border: `1.5px solid ${isDark ? 'rgba(37,99,235,0.4)' : '#BFDBFE'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, alignSelf: 'flex-end', color: '#2563EB',
        }}>
          <IconUser />
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: '#fff',
      }}>
        <IconBot />
      </div>
      <div style={{
        background: '#fff', borderRadius: '4px 16px 16px 16px',
        padding: '10px 16px', display: 'flex', gap: 5, alignItems: 'center',
        border: '1px solid #EAECF0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {[0, 0.2, 0.4].map((d, i) => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%', background: '#7C3AED',
            animation: `dotBounce 1.2s ${d}s infinite`,
          }} />
        ))}
        <span style={{ fontSize: 11, color: '#98A2B3', marginLeft: 4, fontFamily: "'Inter',sans-serif" }}>
          thinking…
        </span>
      </div>
    </div>
  );
}

export default function AiChatPage() {
  const { isDark } = useTheme();
  const [messages, setMessages] = useState([{
    from: 'bot',
    text: "Hello! Welcome to **HEXAONE AI**\n\nI understand natural language — just type what you need!\n\n• Book appointments\n• Services & prices\n• Branch locations\n• Today's schedule & revenue\n• Inventory alerts\n\nOr pick a quick option below",
  }]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [sessionId, setSessionId] = useState(() => sessionStorage.getItem('ai_session_id') || null);
  const [connected, setConnected] = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  /* Health check — initial + every 60s */
  useEffect(() => {
    const check = () =>
      api.get('/ai/health')
        .then(() => setConnected(true))
        .catch(() => setConnected(false));
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  const msgAreaRef = useRef(null);

  /* Auto-scroll — scroll the messages container directly, never the outer page */
  useEffect(() => {
    const el = msgAreaRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(m => [...m, { from: 'user', text: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post('/ai/chat', { session_id: sessionId, message: msg });
      const newSid = data.session_id;
      setSessionId(newSid);
      sessionStorage.setItem('ai_session_id', newSid);
      setMessages(m => [...m, {
        from: 'bot', text: data.reply,
        intent: data.intent, confidence: data.confidence,
      }]);
    } catch {
      setMessages(m => [...m, {
        from: 'bot',
        text: 'Sorry, I could not connect to the AI. Please try again.',
        error: true,
        originalText: msg,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function clearChat() {
    if (sessionId) {
      try { await api.delete(`/ai/chat/${sessionId}`); } catch {}
    }
    sessionStorage.removeItem('ai_session_id');
    setMessages([{ from: 'bot', text: 'Chat cleared. How can I help you?' }]);
    setSessionId(null);
  }

  return (
    <PageWrapper title="AI Chat Assistant">
      <style>{CSS}</style>

      <div style={{
        display: 'flex', flexDirection: 'column',
        flex: 1, minHeight: 0,
        borderRadius: 16, overflow: 'hidden',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#EAECF0'}`,
        boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(16,24,40,0.08)',
      }}>

        {/* ── Header bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px',
          background: 'linear-gradient(135deg, #1E3A5F 0%, #1D4ED8 50%, #7C3AED 100%)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
            }}>
              <IconBot />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: "'Sora','Manrope',sans-serif" }}>
                HEXAONE AI
              </div>
              <div style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: connected === null ? '#FCD34D' : connected ? '#34D399' : '#F87171',
                  animation: connected === null ? 'pulseGlow 1.2s infinite' : 'none',
                  flexShrink: 0,
                }} />
                <span style={{ color: 'rgba(255,255,255,0.75)', fontFamily: "'Inter',sans-serif" }}>
                  {connected === null ? 'Connecting…' : connected ? 'Online · Ready to chat' : 'Offline · Check AI bot'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={clearChat}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8, padding: '7px 13px',
              fontSize: 12, fontWeight: 600,
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer', fontFamily: "'Inter',sans-serif",
              backdropFilter: 'blur(6px)',
              transition: 'background 0.15s',
            }}
          >
            <IconTrash /> Clear chat
          </button>
        </div>

        {/* ── Messages area ── */}
        <div ref={msgAreaRef} style={{
          flex: 1, overflowY: 'auto', padding: '20px 18px',
          background: isDark ? '#0F172A' : '#F7F9FC',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ flex: 1 }} />
          {messages.map((msg, i) => <Message key={i} msg={msg} isDark={isDark} onRetry={send} />)}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* ── Quick reply chips ── */}
        <div style={{
          padding: '10px 14px',
          background: isDark ? '#1E293B' : '#fff',
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#EAECF0'}`,
          overflowX: 'auto',
          display: 'flex', gap: 6, flexWrap: 'nowrap',
          flexShrink: 0,
        }}>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s.text)}
              disabled={loading}
              style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 5,
                background: isDark ? '#0F172A' : '#F7F8FA',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#EAECF0'}`,
                borderRadius: 20, padding: '6px 13px',
                fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#344054',
                cursor: loading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: loading ? 0.5 : 1,
                fontFamily: "'Inter',sans-serif",
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.background = isDark ? 'rgba(37,99,235,0.15)' : '#EEF4FF';
                  e.currentTarget.style.borderColor = isDark ? 'rgba(37,99,235,0.4)' : '#BFDBFE';
                  e.currentTarget.style.color = '#2563EB';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isDark ? '#0F172A' : '#F7F8FA';
                e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#EAECF0';
                e.currentTarget.style.color = isDark ? '#94A3B8' : '#344054';
              }}
            >
              <Ico d={s.icon} size={12} />
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Input bar ── */}
        <div style={{
          display: 'flex', gap: 10, padding: '12px 14px',
          background: isDark ? '#1E293B' : '#fff',
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#EAECF0'}`,
          flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Type a message… (e.g. 'book a haircut for tomorrow')"
            disabled={loading}
            style={{
              flex: 1,
              border: `1.5px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#EAECF0'}`,
              borderRadius: 12,
              padding: '10px 16px', fontSize: 13.5, outline: 'none',
              color: isDark ? '#E2E8F0' : '#101828',
              background: isDark ? '#0F172A' : (loading ? '#F9FAFB' : '#fff'),
              fontFamily: "'Inter',sans-serif",
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#2563EB'}
            onBlur={e => e.target.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#EAECF0'}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: loading || !input.trim()
                ? '#F1F5F9'
                : 'linear-gradient(135deg, #1D4ED8, #2563EB)',
              border: 'none',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              color: loading || !input.trim() ? '#98A2B3' : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
              boxShadow: loading || !input.trim() ? 'none' : '0 2px 8px rgba(37,99,235,0.35)',
            }}
          >
            <IconSend />
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
