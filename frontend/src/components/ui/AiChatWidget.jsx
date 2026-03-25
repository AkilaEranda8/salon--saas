import { useState, useRef, useEffect } from 'react';

const BOT_URL = import.meta.env.VITE_AI_BOT_URL || 'http://localhost:8000';

const S = {
  bubble: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '12px',
    fontFamily: 'inherit',
  },
  toggleBtn: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(37,99,235,0.4)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    color: '#fff',
    fontSize: '22px',
  },
  window: {
    width: '360px',
    height: '520px',
    background: '#FFFFFF',
    borderRadius: '16px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.16)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'slideUp 0.25s ease',
  },
  header: {
    background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
    padding: '14px 16px',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    flexShrink: 0,
  },
  headerTitle: { fontWeight: 700, fontSize: '14px', lineHeight: 1.2 },
  headerSub:   { fontSize: '11px', opacity: 0.85 },
  closeBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '18px',
    opacity: 0.8,
    padding: '4px',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    background: '#F7F8FA',
  },
  msgBot: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    background: '#FFFFFF',
    border: '1px solid #EAECF0',
    borderRadius: '4px 14px 14px 14px',
    padding: '10px 12px',
    fontSize: '13px',
    lineHeight: 1.55,
    color: '#101828',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    whiteSpace: 'pre-wrap',
  },
  msgUser: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
    borderRadius: '14px 4px 14px 14px',
    padding: '10px 12px',
    fontSize: '13px',
    lineHeight: 1.55,
    color: '#FFFFFF',
  },
  typing: {
    alignSelf: 'flex-start',
    background: '#FFFFFF',
    border: '1px solid #EAECF0',
    borderRadius: '4px 14px 14px 14px',
    padding: '10px 16px',
    display: 'flex',
    gap: '5px',
    alignItems: 'center',
  },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#94A3B8',
    animation: 'bounce 1.2s infinite',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
    padding: '12px',
    borderTop: '1px solid #EAECF0',
    background: '#FFFFFF',
  },
  input: {
    flex: 1,
    border: '1px solid #EAECF0',
    borderRadius: '10px',
    padding: '9px 12px',
    fontSize: '13px',
    outline: 'none',
    color: '#101828',
    background: '#F9FAFB',
    transition: 'border-color 0.15s',
  },
  sendBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
    border: 'none',
    cursor: 'pointer',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    flexShrink: 0,
    transition: 'opacity 0.15s',
  },
};

const CSS_ANIM = `
@keyframes slideUp {
  from { opacity:0; transform:translateY(20px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes bounce {
  0%,80%,100% { transform:translateY(0); }
  40%         { transform:translateY(-5px); }
}
`;

function renderText(text) {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} style={{ background:'#EFF6FF', padding:'1px 5px', borderRadius:'4px', fontSize:'12px' }}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export default function AiChatWidget() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([
    { from: 'bot', text: 'Hello! Welcome to Zane Salon 💇\n\nI can help you book appointments, check services, prices, and more.\n\nHow can I help you today?' },
  ]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(m => [...m, { from: 'user', text }]);
    setLoading(true);

    try {
      const res = await fetch(`${BOT_URL}/chat`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ session_id: sessionId, message: text }),
      });
      const data = await res.json();
      setSessionId(data.session_id);
      setMessages(m => [...m, { from: 'bot', text: data.reply }]);
    } catch {
      setMessages(m => [...m, {
        from: 'bot',
        text: 'Sorry, I\'m having trouble connecting. Please try again in a moment.',
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <style>{CSS_ANIM}</style>
      <div style={S.bubble}>
        {open && (
          <div style={S.window}>
            {/* Header */}
            <div style={S.header}>
              <div style={S.headerAvatar}>💇</div>
              <div>
                <div style={S.headerTitle}>Zane Salon AI</div>
                <div style={S.headerSub}>● Online · Always here to help</div>
              </div>
              <button style={S.closeBtn} onClick={() => setOpen(false)}>✕</button>
            </div>

            {/* Messages */}
            <div style={S.messages}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={msg.from === 'bot' ? S.msgBot : S.msgUser}
                >
                  {msg.text.split('\n').map((line, j) => (
                    <span key={j}>{renderText(line)}{j < msg.text.split('\n').length - 1 && <br />}</span>
                  ))}
                </div>
              ))}
              {loading && (
                <div style={S.typing}>
                  <div style={{ ...S.dot, animationDelay: '0s' }} />
                  <div style={{ ...S.dot, animationDelay: '0.2s' }} />
                  <div style={{ ...S.dot, animationDelay: '0.4s' }} />
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={S.inputRow}>
              <input
                ref={inputRef}
                style={S.input}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type a message..."
                disabled={loading}
              />
              <button
                style={{ ...S.sendBtn, opacity: loading || !input.trim() ? 0.5 : 1 }}
                onClick={send}
                disabled={loading || !input.trim()}
              >
                ➤
              </button>
            </div>
          </div>
        )}

        {/* Toggle button */}
        <button
          style={S.toggleBtn}
          onClick={() => setOpen(o => !o)}
          title="Chat with AI Assistant"
        >
          {open ? '✕' : '💬'}
        </button>
      </div>
    </>
  );
}
