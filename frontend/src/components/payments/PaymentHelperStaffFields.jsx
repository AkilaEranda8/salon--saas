import Button from '../ui/Button';
import { Select, FormGroup } from '../ui/FormElements';

/** Equal share of commission pool for each person (main + helpers). */
export function equalHelperPercent(helperCount) {
  const n = Math.max(1, Number(helperCount) || 1);
  return Math.round((100 / (n + 1)) * 100) / 100;
}

const emptyHelper = () => ({
  staff_id: '',
  commission_type: 'percentage_of_main',
  commission_value: '50',
});

/**
 * Main staff + optional helpers.
 * Commission pool (from main rate) is always split equally — % or fixed are not used.
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
  const sharePct = equalHelperPercent((helpers || []).length || 1);

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
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: title }}>Staff & commission</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4, lineHeight: 1.45 }}>
          Main staff rate makes the commission pool. Helpers always split that pool equally
          (percentage / fixed same result). Example: pool Rs. 1000 + 1 helper → Rs. 500 each.
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
          Helper staff <span style={{ fontWeight: 500, color: muted }}>(optional · equal split)</span>
        </span>
      </label>

      {helpersOn && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            fontSize: 12,
            color: muted,
            background: soft,
            border: `1px solid ${border}`,
            borderRadius: 8,
            padding: '8px 10px',
          }}>
            Each person gets <strong style={{ color: title }}>{sharePct}%</strong> of the pool
            (main + {(helpers || []).length} helper{(helpers || []).length === 1 ? '' : 's'}).
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
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: title }}>
                    Helper {idx + 1}
                    <span style={{ fontWeight: 500, color: muted, marginLeft: 8 }}>
                      · {sharePct}% equal share
                    </span>
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

                <div>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: muted,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                  >
                    Helper
                  </div>
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
  const list = (helpers || []).filter((h) => h.staff_id);
  const pct = equalHelperPercent(list.length || 1);
  return list.map((h) => ({
    staff_id: Number(h.staff_id),
    commission_type: 'percentage_of_main',
    commission_value: pct,
  }));
}
