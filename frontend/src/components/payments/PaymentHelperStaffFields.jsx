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
    const next = (helpers || []).filter((_, i) => i !== idx);
    onHelpersChange(next);
  };

  return (
    <div style={{
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: 12,
      background: panel,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
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
          Tip: Main staff gets the service commission. Helper staff is optional —
          if you add helpers, their share is taken from the main commission (not extra on top).
        </div>
      </div>

      <FormGroup
        label="Main staff"
        required
        helper="Who mainly did the service. Their normal commission is calculated first."
      >
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
          style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2563EB' }}
        />
        <span>
          <div style={{ fontWeight: 700, fontSize: 13, color: title }}>
            Helper staff <span style={{ fontWeight: 600, color: muted }}>(optional)</span>
          </div>
          <div style={{ fontSize: 11, color: muted, marginTop: 2, lineHeight: 1.4 }}>
            Tip: Turn on only if another staff helped. You can add multiple helpers.
            Leave off for normal single-staff commission.
          </div>
        </span>
      </label>

      {helpersOn && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Button type="button" variant="secondary" size="sm" onClick={addHelper} disabled={!mainId}>
              + Add another helper
            </Button>
          </div>

          {(helpers || []).map((h, idx) => {
            const options = staffOptions.filter((s) => {
              const sid = String(s.id);
              if (sid === mainId) return false;
              if (sid === String(h.staff_id)) return true;
              return !usedIds.has(sid);
            });
            return (
              <div
                key={`helper-${idx}`}
                style={{
                  background: soft,
                  border: `1px solid ${border}`,
                  borderRadius: 10,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: muted }}>
                  Helper {idx + 1}
                </div>
                <FormGroup
                  label="Helper staff"
                  helper="Assistant who helped on this job. Cannot be the same as main staff."
                >
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
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr auto', gap: 8, alignItems: 'end' }}>
                  <FormGroup
                    label="Helper commission type"
                    helper="% of main = share of main’s commission. Fixed Rs = set amount from main."
                  >
                    <Select
                      value={h.commission_type || 'percentage_of_main'}
                      onChange={(e) => updateHelper(idx, { commission_type: e.target.value })}
                    >
                      <option value="percentage_of_main">% of main commission</option>
                      <option value="fixed">Fixed Rs</option>
                    </Select>
                  </FormGroup>
                  <FormGroup
                    label={h.commission_type === 'fixed' ? 'Amount (Rs)' : 'Percent (%)'}
                    helper={h.commission_type === 'fixed'
                      ? 'Tip: e.g. 200 → helper gets Rs 200 from main.'
                      : 'Tip: e.g. 20 → helper gets 20% of main commission.'}
                  >
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={h.commission_value ?? ''}
                      onChange={(e) => updateHelper(idx, { commission_value: e.target.value })}
                      placeholder={h.commission_type === 'fixed' ? '0' : '20'}
                    />
                  </FormGroup>
                  <button
                    type="button"
                    onClick={() => removeHelper(idx)}
                    title="Remove this helper"
                    style={{
                      height: 38,
                      padding: '0 10px',
                      borderRadius: 8,
                      border: `1px solid ${isDark ? '#7F1D1D' : '#FECACA'}`,
                      background: isDark ? '#450A0A' : '#FEF2F2',
                      color: isDark ? '#FCA5A5' : '#DC2626',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </>
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
