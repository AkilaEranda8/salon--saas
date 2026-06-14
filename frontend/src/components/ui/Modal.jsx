import { useEffect, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';

const SIZE_MAP = {
  sm:   420,
  md:   560,
  lg:   720,
  xl:   900,
  full: '95vw',
};

/** All focusable selectors (focus-trap) */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Modal({
  open,
  onClose,
  title,
  size   = 'md',
  children,
  footer,
  /** Extra class for the backdrop */
  className,
}) {
  const titleId  = useId();
  const panelRef = useRef(null);
  const width    = SIZE_MAP[size] ?? SIZE_MAP.md;

  /*  Escape key + body scroll lock  */
  const handleKey = useCallback(e => {
    if (e.key === 'Escape') { onClose?.(); return; }

    /* Focus trap */
    if (e.key !== 'Tab' || !panelRef.current) return;
    const els = [...panelRef.current.querySelectorAll(FOCUSABLE)];
    if (els.length === 0) { e.preventDefault(); return; }
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);

    /* Auto-focus first focusable element */
    const raf = requestAnimationFrame(() => {
      if (!panelRef.current) return;
      const first = panelRef.current.querySelector(FOCUSABLE);
      first?.focus();
    });
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
      cancelAnimationFrame(raf);
    };
  }, [open, handleKey]);

  if (!open) return null;

  /*  Mobile: bottom-sheet, Desktop: centered  */
  const isMobile = window.innerWidth < 640;

  return createPortal(
    <div
      role="presentation"
      style={{
        position:            'fixed',
        inset:               0,
        zIndex:              1000,
        display:             'flex',
        alignItems:          isMobile ? 'flex-end' : 'center',
        justifyContent:      'center',
        background:          'rgba(16,24,40,0.62)',
        padding:             isMobile ? 0 : 16,
        animation:           'modal-bg-in 0.18s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <style>{`
        @keyframes modal-bg-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes modal-panel-in {
          from { opacity: 0; transform: scale(0.96) translateY(10px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
        @keyframes modal-sheet-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onClick={e => e.stopPropagation()}
        style={{
          background:    '#fff',
          borderRadius:  isMobile ? '20px 20px 0 0' : 20,
          boxShadow:     '0 20px 24px -4px rgba(16,24,40,.08), 0 8px 8px -4px rgba(16,24,40,.03)',
          width:         isMobile ? '100%' : (typeof width === 'number' ? `${width}px` : width),
          maxWidth:      isMobile ? '100%' : '100%',
          maxHeight:     isMobile ? '90vh' : '90vh',
          display:       'flex',
          flexDirection: 'column',
          fontFamily:    "'Inter', sans-serif",
          animation:     isMobile ? 'modal-sheet-up 0.25s ease' : 'modal-panel-in 0.2s ease',
        }}
      >
        {/* Handle bar (mobile only) */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D0D5DD' }} />
          </div>
        )}

        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        isMobile ? '12px 20px 12px' : '20px 24px',
          borderBottom:   '1px solid #EAECF0',
          flexShrink:     0,
        }}>
          {title && (
            <h3
              id={titleId}
              style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#101828' }}
            >
              {title}
            </h3>
          )}
          {!title && <div />}
          <button
            aria-label="Close dialog"
            onClick={onClose}
            style={{
              background:  'none',
              border:      'none',
              cursor:      'pointer',
              padding:     '4px 6px',
              borderRadius: 6,
              color:       '#98A2B3',
              fontSize:    18,
              lineHeight:  1,
              display:     'flex',
              alignItems:  'center',
              transition:  'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#475467'}
            onMouseLeave={e => e.currentTarget.style.color = '#98A2B3'}
          >
            
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: isMobile ? '16px 20px' : '20px 24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding:        isMobile ? '12px 20px 20px' : '16px 24px',
            borderTop:      '1px solid #EAECF0',
            display:        'flex',
            justifyContent: 'flex-end',
            gap:            8,
            flexShrink:     0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
