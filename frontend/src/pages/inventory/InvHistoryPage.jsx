import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Select, Input } from '../../components/ui/FormElements';
import { DataTable, FilterBar } from '../../components/ui/PageKit';
import { useToast } from '../../components/ui/Toast';
import { INV_API, MOVEMENT_TYPES, exportCsv, fmtQty, useInvBranch } from './invApi';

const MOVEMENT_LABELS = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t.value, t.label]));

export default function InvHistoryPage() {
  const { toast } = useToast();
  const { branches, branchId, setBranchId, multiBranch, ready } = useInvBranch();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const r = await api.get(`${INV_API}/history`, {
        params: {
          movement_type: type || undefined,
          from: from || undefined,
          to: to || undefined,
          branchId: branchId || undefined,
          limit: 300,
        },
      });
      setRows(r.data ?? []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load history');
    }
    setLoading(false);
  }, [ready, type, from, to, branchId, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <FilterBar>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All movements</option>
          {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        {multiBranch && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="secondary" onClick={() => exportCsv('inventory-history.csv', rows, [
          { header: 'Date', accessor: (r) => r.moved_at },
          { header: 'Product', accessor: (r) => r.product?.name },
          { header: 'Movement', accessor: (r) => MOVEMENT_LABELS[r.movement_type] || r.movement_type },
          { header: 'Opening', accessor: (r) => r.opening_qty },
          { header: 'Change', accessor: (r) => r.quantity_changed },
          { header: 'Closing', accessor: (r) => r.closing_qty },
          { header: 'Remarks', accessor: (r) => r.remarks },
        ])} style={{ marginLeft: 'auto' }}>Export CSV</Button>
      </FilterBar>

      <DataTable
        columns={[
          { id: 'when', header: 'Date / Time', accessorFn: (r) => new Date(r.moved_at).toLocaleString() },
          { id: 'product', header: 'Product', accessorFn: (r) => r.product?.name },
          { id: 'type', header: 'Movement', accessorFn: (r) => MOVEMENT_LABELS[r.movement_type] || r.movement_type },
          { id: 'open', header: 'Before', accessorFn: (r) => fmtQty(r.opening_qty, r.product?.unit) },
          {
            id: 'chg', header: 'Change', accessorFn: (r) => Number(r.quantity_changed),
            cell: ({ row: { original: r } }) => {
              const n = Number(r.quantity_changed);
              return (
                <span style={{ fontWeight: 700, color: n < 0 ? '#B42318' : '#047857' }}>
                  {n > 0 ? '+' : ''}{fmtQty(n, r.product?.unit)}
                </span>
              );
            },
          },
          { id: 'close', header: 'After', accessorFn: (r) => fmtQty(r.closing_qty, r.product?.unit) },
          { id: 'user', header: 'By', accessorFn: (r) => r.user?.name || r.user?.username || '—' },
          { id: 'remarks', header: 'Remarks', accessorFn: (r) => r.remarks || '—' },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No stock movements yet"
        emptySub="Opening stock, goods received, day end usage and adjustments all appear here"
      />
    </div>
  );
}
