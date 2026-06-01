import { useTheme } from '../../context/ThemeContext';

/** TableCraft-style row density: comfortable (default) or compact. */
export default function TableDensityToggle({ style }) {
  const { tableDensity, setTableDensity } = useTheme();
  const opts = [
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'compact', label: 'Compact' },
  ];

  return (
    <div
      role="group"
      aria-label="Table row density"
      style={{
        display: 'inline-flex',
        borderRadius: 8,
        border: '1px solid #E4E7EC',
        overflow: 'hidden',
        ...style,
      }}
    >
      {opts.map(({ value, label }) => {
        const active = tableDensity === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTableDensity(value)}
            style={{
              padding: '7px 14px',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              background: active ? '#2563EB' : '#fff',
              color: active ? '#fff' : '#475467',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
