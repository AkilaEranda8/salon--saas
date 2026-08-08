import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import { ListRow, ListShell, SectionTitle, StatusPill, ACCT } from './AccountingUI';
import { StatCard, IconDollar, IconUsers, IconReceipt } from '../../components/ui/PageKit';
import usePageTheme from '../../hooks/usePageTheme';

export default function AccountingPayrollPage() {
  const { C } = usePageTheme();
  const [data, setData] = useState({ payouts: [], advances: [] });

  useEffect(() => {
    (async () => {
      try {
        const { data: d } = await api.get('/accounting/payroll-summary');
        setData(d);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Load failed');
      }
    })();
  }, []);

  const payoutTotal = (data.payouts || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const advanceTotal = (data.advances || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const glPosted = [...(data.payouts || []), ...(data.advances || [])].filter((r) => r.gl_posted).length;

  return (
    <AccountingLayout title="Payroll">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Commission payouts" value={formatLkr(payoutTotal)} color={ACCT.warning} icon={<IconDollar />} />
        <StatCard label="Advances" value={formatLkr(advanceTotal)} color={ACCT.purple} icon={<IconUsers />} />
        <StatCard label="GL posted" value={glPosted} color={ACCT.success} icon={<IconReceipt />} />
      </div>

      <SectionTitle color={ACCT.warning}>Commission payouts</SectionTitle>
      <ListShell empty="No payouts" emptySub="Payouts from Commission page appear here">
        {(data.payouts || []).map((r) => (
          <ListRow key={r.id}>
            <div>
              <div style={{ fontWeight: 700, color: C.text }}>
                {r.date} · <span style={{ color: ACCT.warning }}>{formatLkr(r.amount)}</span>
              </div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>Staff #{r.staff_id}</div>
            </div>
            <StatusPill status={r.gl_posted ? 'posted' : 'pending'}>
              {r.gl_posted ? 'GL posted' : 'Not in GL'}
            </StatusPill>
          </ListRow>
        ))}
      </ListShell>

      <div style={{ marginTop: 18 }}>
        <SectionTitle color={ACCT.purple}>Staff advances</SectionTitle>
        <ListShell empty="No advances" emptySub="Advances from Advances page appear here">
          {(data.advances || []).map((r) => (
            <ListRow key={r.id}>
              <div>
                <div style={{ fontWeight: 700, color: C.text }}>
                  {r.date} · <span style={{ color: ACCT.purple }}>{formatLkr(r.amount)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{r.status}</div>
              </div>
              <StatusPill status={r.gl_posted ? 'posted' : 'pending'}>
                {r.gl_posted
                  ? (r.status === 'deducted' || r.gl_recovered ? 'GL posted · recovered' : 'GL posted')
                  : 'Not in GL'}
              </StatusPill>
            </ListRow>
          ))}
        </ListShell>
      </div>
    </AccountingLayout>
  );
}
