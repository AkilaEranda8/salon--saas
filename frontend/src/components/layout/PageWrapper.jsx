import { useBreakpoint } from '../../hooks/useBreakpoint';

export default function PageWrapper({ title, subtitle, actions, children }) {
  const { isMobile, isTablet } = useBreakpoint();
  const pad = isMobile ? 12 : isTablet ? 16 : 24;
  const gap = isMobile ? 16 : 24;

  return (
    <div
      className="page-enter"
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap,
        padding:       pad,
        minHeight:     '100%',
        boxSizing:     'border-box',
        fontFamily:    "'Manrope', sans-serif",
      }}
    >
      {/* Page header */}
      {(title || actions) && (
        <div style={{
          display:        'flex',
          alignItems:     'flex-start',
          justifyContent: 'space-between',
          gap:            16,
          flexWrap:       'wrap',
        }}>
          {/* Title block */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {/* Blue accent bar */}
            <div style={{
              width: 4, height: subtitle ? 44 : 30, borderRadius: 4,
              background: 'linear-gradient(180deg, #2563EB 0%, #60A5FA 100%)',
              flexShrink: 0, marginTop: 2,
            }} />
            <div>
              {title && (
                <h1 style={{
                  margin:     0,
                  fontSize:   24,
                  fontWeight: 800,
                  color:      'var(--app-text)',
                  fontFamily: "'Sora', 'Manrope', sans-serif",
                  lineHeight: 1.25,
                  letterSpacing: '-0.3px',
                }}>
                  {title}
                </h1>
              )}
              {subtitle && (
                <p style={{
                  margin:     '3px 0 0',
                  fontSize:   13.5,
                  color:      '#667085',
                  lineHeight: 1.5,
                  fontFamily: "'Inter', sans-serif",
                }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Actions slot */}
          {actions && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
              {actions}
            </div>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
