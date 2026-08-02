import Button from '../ui/Button';
import { Input, Select, FormGroup } from '../ui/FormElements';

const emptyHelper = () => ({
  staff_id: '',
  commission_type: 'percentage_of_main',
  commission_value: '20',
});

/**
 * Main staff + optional helper staff (commission taken from main).
 */
export default function PaymentHelperStaffFields({
  mainStaffId,
  onMainStaffChange,
  helpers,
  onHelpersChange,
  staffOptions = [],
  isDark = false,
}) {
  const border = isDark ? '#334155' : '#E5EAF0';
  const muted = isDark ? '#94A3B8' : '#667085';
  const title = isDark ? '#E2E8F0' : '#101828';
  const panel = isDark ? '#0F172A' : '#fff';
  const soft = isDark ? '#1E293B' : '#F8FAFC';

  const mainId = mainStaffId ? String(mainStaffId) : '';
  const helpersOn = (helpers || []).length > 0;
  const usedIds = new Set([
    mainId,
    ...(helpers || []).map((h) => String(h.staff_id || '')).filter(Boolean),
  ]);

  const setHelpersEnabled = (on) => {
    if (on) {
      if (!(helpers || []).length) onHelpersChange([emptyHelper()]);
    } else {
      onHelpersChange([]);
    }
  };

  const addHelper = () => {
    onHelpersChange([...(helpers || []), emptyHelper()]);
  };

  const updateHelper = (idx, patch) => {
    onHelpersChange((helpers || []).map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };

  const removeHelper = (idx) => {
    onHelpersChange((helpers || []).filter((_, i) => i !== idx));
  };

  const fieldLabel = {
    fontSize: 11,
    fontWeight: 700,
    color: muted,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    marginBottom: 4,
  };

  return (
    <div style={{
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: 14,
      background: panel,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: title }}>Staff & commission</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4, lineHeight: 1.4 }}>
          Helpers optional — their share comes from the main commission.
        </div>
      </div>

      <FormGroup label="Main staff" required>
        <Select
          value={mainId}
          onChange={(e) => {
            const next = e.target.value;
            onMainStaffChange(next);
            onHelpersChange((helpers || []).filter((h) => String(h.staff_id) !== String(next)));
          }}
        >
          <option value="">Select main staff</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </FormGroup>

      <label style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        cursor: mainId ? 'pointer' : 'not-allowed',
        opacity: mainId ? 1 : 0.55,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${border}`,
        background: soft,
      }}>
        <input
          type="checkbox"
          checked={helpersOn}
          disabled={!mainId}
          onChange={(e) => setHelpersEnabled(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: '#2563EB', flexShrink: 0 }}
        />
        <span style={{ fontWeight: 700, fontSize: 13, color: title }}>
          Helper staff <span style={{ fontWeight: 500, color: muted }}>(optional)</span>
        </span>
      </label>

      {helpersOn && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(helpers || []).map((h, idx) => {
            const options = staffOptions.filter((s) => {
              const sid = String(s.id);
              if (sid === mainId) return false;
              if (sid === String(h.staff_id)) return true;
              return !usedIds.has(sid);
            });
            const isPct = (h.commission_type || 'percentage_of_main') !== 'fixed';
            return (
              <div
                key={`helper-${idx}`}
                style={{
                  background: soft,
                  border: `1px solid ${border}`,
                  borderRadius: 10,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: title }}>
                    Helper {idx + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeHelper(idx)}
                    title="Remove helper"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: isDark ? '#FCA5A5' : '#DC2626',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    Remove
                  </button>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.85fr)',
                  gap: 10,
                  alignItems: 'end',
                }}>
                  <div>
                    <div style={fieldLabel}>Helper</div>
                    <Select
                      value={h.staff_id || ''}
                      onChange={(e) => updateHelper(idx, { staff_id: e.target.value })}
                    >
                      <option value="">Select helper</option>
                      {options.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <div style={fieldLabel}>Type</div>
                    <Select
                      value={h.commission_type || 'percentage_of_main'}
                      onChange={(e) => updateHelper(idx, { commission_type: e.target.value })}
                    >
                      <option value="percentage_of_main">% of main</option>
                      <option value="fixed">Fixed Rs</option>
                    </Select>
                  </div>
                  <div>
                    <div style={fieldLabel}>{isPct ? 'Percent (%)' : 'Amount (Rs)'}</div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={h.commission_value ?? ''}
                      onChange={(e) => updateHelper(idx, { commission_value: e.target.value })}
                      placeholder={isPct ? '20' : '200'}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <Button type="button" variant="secondary" size="sm" onClick={addHelper} disabled={!mainId}>
            + Add another helper
          </Button>
        </div>
      )}
    </div>
  );
}

export function helpersPayload(helpers) {
  return (helpers || [])
    .filter((h) => h.staff_id && Number(h.commission_value) > 0)
    .map((h) => ({
      staff_id: Number(h.staff_id),
      commission_type: h.commission_type === 'fixed' ? 'fixed' : 'percentage_of_main',
      commission_value: Number(h.commission_value),
    }));
}
