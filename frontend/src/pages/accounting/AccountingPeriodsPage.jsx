import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';

export default function AccountingPeriodsPage() {
  const { C } = usePageTheme();
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

  return (
    <AccountingLayout title="Periods">
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        {rows.map((p) => (
          <div key={p.id} style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, color: C.text }}>{p.period_key}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{p.status}</div>
            </div>
            {p.status === 'open'
              ? <Button variant="secondary" onClick={() => act(p.id, 'close')}>Close</Button>
              : <Button variant="secondary" onClick={() => act(p.id, 'reopen')}>Reopen</Button>}
          </div>
        ))}
        {!rows.length && <div style={{ padding: 16, color: C.muted }}>No periods yet — open books by visiting Overview.</div>}
      </div>
    </AccountingLayout>
  );
}
