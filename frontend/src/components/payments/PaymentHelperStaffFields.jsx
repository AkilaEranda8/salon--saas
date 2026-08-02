import Button from '../ui/Button';
import { Input, Select, FormGroup } from '../ui/FormElements';

const emptyHelper = () => ({
  staff_id: '',
  commission_type: 'percentage_of_main',
  commission_value: '20',
});

/**
 * Main staff + optional helper staff (commission taken from main).
 * Used by Collect Payment, Walk-in payment, and Record Payment.
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
  const tipBg = isDark ? 'rgba(37,99,235,0.12)' : '#EFF6FF';
  const tipBorder = isDark ? 'rgba(96,165,250,0.35)' : '#BFDBFE';
  const tipText = isDark ? '#93C5FD' : '#1D4ED8';

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

  return (
    <div style={{
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: 14,
      background: panel,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      minWidth: 0,
      width: '100%',
      boxSizing: 'border-box',
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: title }}>Staff & commission</div>
        <div style={{
          marginTop: 8,
          padding: '8px 10px',
          borderRadius: 8,
          background: tipBg,
          border: `1px solid ${tipBorder}`,
          fontSize: 11,
          color: tipText,
          lineHeight: 1.45,
        }}>
          Main staff gets the service commission first. Helpers are optional —
          their share is taken from the main commission (not added on top).
        </div>
      </div>

      {/* 1. Main staff */}
      <FormGroup label="1. Main staff" required>
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

      {/* 2. Helpers toggle */}
      <label style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
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
          style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2563EB', flexShrink: 0 }}
        />
        <span>
          <div style={{ fontWeight: 700, fontSize: 13, color: title }}>
            2. Helper staff <span style={{ fontWeight: 500, color: muted }}>(optional)</span>
          </div>
          <div style={{ fontSize: 11, color: muted, marginTop: 2, lineHeight: 1.4 }}>
            Turn on if another staff helped on this payment.
          </div>
        </span>
      </label>

      {helpersOn && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {(helpers || []).map((h, idx) => {
            const options = staffOptions.filter((s) => {
              const sid = String(s.id);
              if (sid === mainId) return false;
              if (sid === String(h.staff_id)) return true;
              return !usedIds.has(sid);
            });
            const isFixed = h.commission_type === 'fixed';
            return (
              <div
                key={`helper-${idx}`}
                style={{
                  background: soft,
                  border: `1px solid ${border}`,
                  borderRadius: 10,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: title }}>
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

                {/* Order: staff → type → amount */}
                <FormGroup label="Helper staff">
                  <Select
                    value={h.staff_id || ''}
                    onChange={(e) => updateHelper(idx, { staff_id: e.target.value })}
                  >
                    <option value="">Select helper</option>
                    {options.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </FormGroup>

                <FormGroup label="Commission type">
                  <Select
                    value={h.commission_type || 'percentage_of_main'}
                    onChange={(e) => updateHelper(idx, { commission_type: e.target.value })}
                  >
                    <option value="percentage_of_main">% of main commission</option>
                    <option value="fixed">Fixed amount (Rs)</option>
                  </Select>
                </FormGroup>

                <FormGroup label={isFixed ? 'Amount (Rs)' : 'Percent (%)'}>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={h.commission_value ?? ''}
                    onChange={(e) => updateHelper(idx, { commission_value: e.target.value })}
                    placeholder={isFixed ? 'e.g. 200' : 'e.g. 20'}
                  />
                </FormGroup>

                <div style={{ fontSize: 11, color: muted, lineHeight: 1.4 }}>
                  {isFixed
                    ? 'This Rs amount is taken from the main staff commission.'
                    : 'This % of the main staff commission goes to the helper.'}
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
