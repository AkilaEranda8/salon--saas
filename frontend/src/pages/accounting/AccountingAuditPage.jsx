import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout from './AccountingLayout';
import { ListRow, ListShell, StatusPill, TypeChip, ACCT } from './AccountingUI';
import { StatCard, IconReceipt } from '../../components/ui/PageKit';

const ACTION_COLORS = {
  post: ['#ECFDF5', '#047857'],
  void: ['#FEF2F2', '#B91C1C'],
  create: ['#EFF6FF', '#1D4ED8'],
  update: ['#FFFBEB', '#B45309'],
  close: ['#F1F5F9', '#475467'],
  reopen: ['#F5F3FF', '#6D28D9'],
  settle: ['#ECFDF5', '#047857'],
};

export default function AccountingAuditPage() {
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
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Events" value={rows.length} color="#0284C7" icon={<IconReceipt />} />
      </div>

      <ListShell empty="No audit events" emptySub="Journal posts and voids will show up here">
        {rows.map((r) => (
          <ListRow key={r.id}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <TypeChip type={r.action} map={ACTION_COLORS} />
                <span style={{ fontWeight: 700, color: '#101828', fontSize: 14 }}>{r.action}</span>
              </div>
              <div style={{ fontSize: 12, color: '#98A2B3' }}>
                {r.created_at || r.createdAt} · {r.entity_type} #{r.entity_id} · actor {r.actor_id || '—'}
              </div>
            </div>
            <StatusPill status="open">{r.entity_type || 'event'}</StatusPill>
          </ListRow>
        ))}
      </ListShell>
    </AccountingLayout>
  );
}
