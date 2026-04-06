import { useState, useRef, useEffect } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import api from '../api/axios';

/* ── Quick reply suggestions ── */
const SUGGESTIONS = [
  { label: '📅 Today appointments', text: 'how many appointments today',  group: 'mgmt' },
  { label: '⏳ Pending bookings',   text: 'show pending appointments',    group: 'mgmt' },
  { label: '💰 Today revenue',      text: "today's revenue",              group: 'mgmt' },
  { label: '⭐ Staff stats',        text: 'show staff performance',       group: 'mgmt' },
  { label: '📦 Low stock',         text: 'show low inventory',           group: 'mgmt' },
  { label: '🚶 Walk-in queue',      text: 'walk in queue status',         group: 'mgmt' },
  { label: '👥 Customers',         text: 'how many customers',           group: 'mgmt' },
  { label: '📋 Services',          text: 'show services',                group: 'public' },
  { label: '❓ Help',              text: 'help',                         group: 'public' },
];

const CSS = `
@keyframes msgIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes dotBounce { 0%,80%,100% { transform:translateY(0); } 40% { transform:translateY(-6px); } }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
`;

function renderMarkdown(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2,-2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} style={{ background:'#EFF6FF', padding:'1px 6px', borderRadius:4, fontSize:'0.9em' }}>{part.slice(1,-1)}</code>;
    return part;
  });
}

function Message({ msg, isLast }) {
  const isBot = msg.from === 'bot';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isBot ? 'flex-start' : 'flex-end',
      animation: 'msgIn 0.25s ease',
      marginBottom: 4,
    }}>
      {isBot && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0, marginRight: 8, alignSelf: 'flex-end',
        }}>🤖</div>
      )}
      <div style={{
        maxWidth: '72%',
        background: isBot ? '#FFFFFF' : 'linear-gradient(135deg,#2563EB,#7C3AED)',
        color: isBot ? '#101828' : '#FFFFFF',
        borderRadius: isBot ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
        padding: '11px 15px',
        fontSize: 14,
        lineHeight: 1.6,
        boxShadow: isBot ? '0 2px 8px rgba(0,0,0,0.07)' : '0 2px 12px rgba(37,99,235,0.3)',
        border: isBot ? '1px solid #F0F0F0' : 'none',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.text.split('\n').map((line, i) => (
          <span key={i}>{renderMarkdown(line)}{i < msg.text.split('\n').length - 1 && <br/>}</span>
        ))}
        {msg.intent && isBot && (
          <div style={{
            marginTop: 8, fontSize: 10, fontStyle: 'italic',
            color: msg.confidence > 0.6 ? '#10B981' : msg.confidence > 0.35 ? '#F59E0B' : '#EF4444',
            opacity: 0.7,
          }}>
            {msg.intent.replace(/_/g,' ')} · {(msg.confidence * 100).toFixed(0)}% confidence
          </div>
        )}
      </div>
      {!isBot && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#E0E7FF', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0, marginLeft: 8, alignSelf: 'flex-end',
        }}>👤</div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
      <div style={{
        width:32, height:32, borderRadius:'50%',
        background:'linear-gradient(135deg,#2563EB,#7C3AED)',
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:14,
      }}>🤖</div>
      <div style={{
        background:'#fff', borderRadius:'4px 18px 18px 18px',
        padding:'10px 16px', display:'flex', gap:6, alignItems:'center',
        border:'1px solid #F0F0F0', boxShadow:'0 2px 8px rgba(0,0,0,0.07)',
      }}>
        {[0,0.2,0.4].map((d,i) => (
          <div key={i} style={{
            width:8, height:8, borderRadius:'50%', background:'#7C3AED',
            animation:`dotBounce 1.2s ${d}s infinite`,
          }}/>
        ))}
        <span style={{ fontSize:11, color:'#94A3B8', marginLeft:4 }}>thinking...</span>
      </div>
    </div>
  );
}

export default function AiChatPage() {
  const [messages, setMessages]     = useState([
    { from:'bot', text:'Hello! Welcome to **Zane Salon AI** 💇\n\nI understand natural language — just type what you need!\n\n• 📅 Book appointments\n• 💅 Services & prices\n• 📍 Branch locations\n• 📊 Today\'s schedule & revenue\n• 📦 Inventory alerts\n\nOr pick a quick option below 👇' },
  ]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [sessionId, setSessionId]   = useState(null);
  const [connected, setConnected]   = useState(null); // null=checking, true, false
  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  const messagesRef = useRef(null);

  /* Check bot connectivity */
  useEffect(() => {
    api.get('/ai/health')
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
  }, []);

  /* Auto-scroll to bottom */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(m => [...m, { from:'user', text: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post('/ai/chat', { session_id: sessionId, message: msg });
      setSessionId(data.session_id);
      setMessages(m => [...m, {
        from:'bot', text: data.reply,
        intent: data.intent, confidence: data.confidence,
      }]);
    } catch {
      setMessages(m => [...m, { from:'bot', text:'Sorry, I could not connect. Please try again.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function clearChat() {
    setMessages([{ from:'bot', text:'Hello again! How can I help you?' }]);
    setSessionId(null);
  }

  return (
    <PageWrapper title="AI Chat Assistant">
      <style>{CSS}</style>

      <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 140px)', gap:0 }}>

        {/* Status bar */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 16px',
          background:'#fff', borderRadius:'14px 14px 0 0',
          border:'1px solid #E4E7EC', borderBottom:'none',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              width:40, height:40, borderRadius:12,
              background:'linear-gradient(135deg,#2563EB,#7C3AED)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:20,
            }}>🤖</div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#101828' }}>Zane Salon AI</div>
              <div style={{ fontSize:12, display:'flex', alignItems:'center', gap:5 }}>
                <div style={{
                  width:7, height:7, borderRadius:'50%',
                  background: connected === null ? '#F59E0B' : connected ? '#10B981' : '#EF4444',
                  animation: connected === null ? 'dotBounce 1s infinite' : 'none',
                }}/>
                <span style={{ color:'#64748B' }}>
                  {connected === null ? 'Connecting...' : connected ? 'Online · Ready to chat' : 'Offline · Check AI bot'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={clearChat}
            style={{
              background:'#F1F5F9', border:'none', borderRadius:8,
              padding:'6px 14px', fontSize:12, fontWeight:600,
              color:'#475467', cursor:'pointer',
            }}
          >
            🗑️ Clear chat
          </button>
        </div>

        {/* Messages area */}
        <div
          ref={messagesRef}
          style={{
            flex:1, overflowY:'auto', padding:'20px 16px',
            background:'#F7F9FC',
            border:'1px solid #E4E7EC', borderTop:'none', borderBottom:'none',
            display:'flex', flexDirection:'column', gap:12,
          }}
        >
          {messages.map((msg, i) => (
            <Message key={i} msg={msg} isLast={i === messages.length - 1} />
          ))}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        <div style={{
          padding:'10px 16px',
          background:'#fff',
          border:'1px solid #E4E7EC', borderTop:'none', borderBottom:'none',
          overflowX:'auto',
          display:'flex', gap:8, flexWrap:'nowrap',
        }}>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s.text)}
              disabled={loading}
              style={{
                flexShrink: 0,
                background:'#F1F5F9', border:'1px solid #E4E7EC',
                borderRadius:20, padding:'5px 13px',
                fontSize:12, fontWeight:500, color:'#344054',
                cursor: loading ? 'not-allowed' : 'pointer',
                whiteSpace:'nowrap',
                transition:'background 0.15s',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Input bar */}
        <div style={{
          display:'flex', gap:10, padding:'12px 16px',
          background:'#fff',
          borderRadius:'0 0 14px 14px',
          border:'1px solid #E4E7EC', borderTop:'1px solid #E4E7EC',
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Type a message... (e.g. 'book a haircut for tomorrow')"
            disabled={loading}
            style={{
              flex:1, border:'1.5px solid #E4E7EC', borderRadius:12,
              padding:'10px 16px', fontSize:14, outline:'none',
              color:'#101828', background: loading ? '#F9FAFB' : '#fff',
              transition:'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#2563EB'}
            onBlur={e => e.target.style.borderColor = '#E4E7EC'}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{
              width:44, height:44, borderRadius:12,
              background: loading || !input.trim()
                ? '#E4E7EC'
                : 'linear-gradient(135deg,#2563EB,#7C3AED)',
              border:'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              color:'#fff', fontSize:18, display:'flex',
              alignItems:'center', justifyContent:'center',
              transition:'all 0.2s', flexShrink:0,
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
