import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ToastContext = createContext(null);
let _id = 0;

const TYPE_CONFIG = {
  success: { icon: '✓', bg: '#D1FAE5', color: '#059669' },
  error:   { icon: '✕', bg: '#FEE2E2', color: '#DC2626' },
  warn:    { icon: '!', bg: '#FEF3C7', color: '#D97706' },
  info:    { icon: 'i', bg: '#EFF6FF', color: '#2563EB' },
};

function ToastItem({ id, type, message, onRemove }) {
  const [exiting, setExiting] = useState(false);
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onRemove(id), 280);
  }, [id, onRemove]);

  useEffect(() => {
    const t = setTimeout(dismiss, 4000);
    return () => clearTimeout(t);
  }, [dismiss]);

  return (
    <div
      onClick={dismiss}
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         10,
        minWidth:    280,
        maxWidth:    360,
        background:  '#fff',
        border:      '1px solid #EAECF0',
        borderRadius: 12,
        padding:     '12px 14px',
        boxShadow:   '0 4px 16px rgba(16,24,40,.12)',
        fontFamily:  "'Inter', sans-serif",
        cursor:      'pointer',
        animation:   exiting
          ? 'toast-out 0.28s ease forwards'
          : 'toast-in 0.28s ease forwards',
      }}
    >
      {/* Icon dot */}
      <span style={{
        width:          28,
        height:         28,
        borderRadius:   '50%',
        background:     cfg.bg,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        color:          cfg.color,
        fontSize:       13,
        fontWeight:     700,
        flexShrink:     0,
      }}>
        {cfg.icon}
      </span>

      {/* Message */}
      <span style={{ flex: 1, fontSize: 14, color: '#344054', lineHeight: 1.4 }}>
        {message}
      </span>

      {/* Close */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); dismiss(); }}
        style={{
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          color:      '#98A2B3',
          fontSize:   14,
          padding:    '2px 4px',
          lineHeight: 1,
          flexShrink: 0,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#475467'}
        onMouseLeave={e => e.currentTarget.style.color = '#98A2B3'}
      >
        ✕
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message) => {
    const id = ++_id;
    setToasts(prev => [...prev.slice(-3), { id, type, message }]); // max 4
  }, []);

  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Support both: toast('msg', 'type')  AND  toast.success('msg')
  const toast = Object.assign(
    (msg, type = 'info') => addToast(type, msg),
    {
      success: msg => addToast('success', msg),
      error:   msg => addToast('error',   msg),
      warn:    msg => addToast('warn',     msg),
      info:    msg => addToast('info',     msg),
    }
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Portal-like container fixed bottom-right */}
      <div style={{
        position:      'fixed',
        bottom:        24,
        right:         24,
        display:       'flex',
        flexDirection: 'column',
        gap:           8,
        zIndex:        9999,
        alignItems:    'flex-end',
        pointerEvents: toasts.length ? 'auto' : 'none',
      }}>
        <style>{`
          @keyframes toast-in {
            from { opacity: 0; transform: translateX(28px) scale(0.95); }
            to   { opacity: 1; transform: translateX(0)    scale(1);    }
          }
          @keyframes toast-out {
            from { opacity: 1; transform: translateX(0)    scale(1);    }
            to   { opacity: 0; transform: translateX(28px) scale(0.94); }
          }
        `}</style>

        {toasts.map(t => (
          <ToastItem key={t.id} {...t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
