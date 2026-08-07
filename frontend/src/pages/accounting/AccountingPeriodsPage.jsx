import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout from './AccountingLayout';
import Button from '../../components/ui/Button';
import { ListRow, ListShell, StatusPill, ACCT } from './AccountingUI';
import { StatCard, IconCalendar } from '../../components/ui/PageKit';

export default function AccountingPeriodsPage() {
  const [rows, setRows] = useState([]);

  const load = async () => {
    try {
      const { data } = await api.get('/accounting/periods');
      setRows(data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Load failed');
    }
  };
  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    try {
      await api.post(`/accounting/periods/${id}/${action}`);
      toast.success(action === 'close' ? 'Period closed' : 'Period reopened');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const openCount = rows.filter((p) => p.status === 'open').length;
  const closedCount = rows.filter((p) => p.status === 'closed').length;

  return (
    <AccountingLayout title="Periods">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Periods" value={rows.length} color={ACCT.slate} icon={<IconCalendar />} />
        <StatCard label="Open" value={openCount} color={ACCT.success} icon={<IconCalendar />} />
        <StatCard label="Closed" value={closedCount} color={ACCT.danger} icon={<IconCalendar />} />
      </div>

      <ListShell empty="No periods yet" emptySub="Open books by visiting Overview — periods seed automatically">
        {rows.map((p) => (
          <ListRow key={p.id}>
            <div>
              <div style={{ fontWeight: 800, color: '#101828', fontSize: 15 }}>{p.period_key}</div>
              <div style={{ marginTop: 6 }}><StatusPill status={p.status} /></div>
            </div>
            {p.status === 'open'
              ? <Button variant="secondary" onClick={() => act(p.id, 'close')}>Close period</Button>
              : <Button variant="secondary" onClick={() => act(p.id, 'reopen')}>Reopen</Button>}
          </ListRow>
        ))}
      </ListShell>
    </AccountingLayout>
  );
}
