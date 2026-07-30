const CHANNEL_LABELS = { whatsapp: 'WhatsApp', sms: 'SMS' };

export default function RecurringTemplateCheckboxes({
  templates = [],
  value = [],
  onChange,
  isDark = false,
}) {
  const selected = Array.isArray(value) ? value.map(String) : [];

  const toggle = (template) => {
    const id = String(template.id);
    if (selected.includes(id)) {
      onChange(selected.filter((item) => item !== id));
      return;
    }

    // A recurring reminder can use one template per channel.
    const sameChannelIds = new Set(
      templates
        .filter((item) => item.channel === template.channel)
        .map((item) => String(item.id)),
    );
    onChange([...selected.filter((item) => !sameChannelIds.has(item)), id]);
  };

  if (!templates.length) {
    return (
      <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#667085' }}>
        No saved templates yet — add them in Notifications → Message Templates → Recurring Visit Reminder.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {templates.map((template) => {
        const checked = selected.includes(String(template.id));
        return (
          <label
            key={template.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 11px',
              borderRadius: 10,
              border: `1px solid ${checked ? '#2563EB' : (isDark ? '#334155' : '#DCE6F3')}`,
              background: checked ? (isDark ? '#172554' : '#EFF6FF') : (isDark ? '#0F172A' : '#fff'),
              color: isDark ? '#E2E8F0' : '#1E293B',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(template)}
              style={{ width: 17, height: 17, accentColor: '#2563EB' }}
            />
            <span style={{ fontWeight: 700 }}>{CHANNEL_LABELS[template.channel] || template.channel}</span>
            <span>— {template.name}</span>
            {template.is_default && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: isDark ? '#93C5FD' : '#2563EB' }}>
                default
              </span>
            )}
          </label>
        );
      })}
      <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#667085' }}>
        Tick one SMS and one WhatsApp template to send both. Leave all unticked to use the default recurring messages.
      </div>
    </div>
  );
}
