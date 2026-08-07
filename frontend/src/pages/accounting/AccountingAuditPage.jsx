import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';

export default function AccountingAuditPage() {
  const { C } = usePageTheme();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/accounting/audit', { params: { limit: 200 } });
        setRows(data || []);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Load failed');
      }
    })();
  }, []);

  return (
    <AccountingLayout title="Audit Trail">
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, color: C.text }}>{r.action}</div>
            <div style={{ fontSize: 12, color: C.muted }}>
              {r.created_at || r.createdAt} · {r.entity_type} #{r.entity_id} · actor {r.actor_id || '—'}
            </div>
          </div>
        ))}
        {!rows.length && <div style={{ padding: 16, color: C.muted }}>No audit events.</div>}
      </div>
    </AccountingLayout>
  );
}
