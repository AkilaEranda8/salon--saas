import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Select, Input } from '../../components/ui/FormElements';
import { DataTable, FilterBar } from '../../components/ui/PageKit';
import { useToast } from '../../components/ui/Toast';
import { INV_API, exportCsv, fmtQty } from './invApi';

export default function InvHistoryPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    try {
      const r = await api.get(`${INV_API}/history`, {
        params: { movement_type: type || undefined, from: from || undefined, to: to || undefined, limit: 300 },
      });
      setRows(r.data ?? []);
    } catch { toast.error('Failed to load history'); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <FilterBar>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All movements</option>
          {['purchase', 'consumption', 'adjustment', 'stock_count', 'opening', 'damage', 'expired', 'transfer'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="secondary" onClick={load}>Filter</Button>
        <Button variant="secondary" onClick={() => exportCsv('inventory-history.csv', rows, [
          { header: 'Date', accessor: (r) => r.moved_at },
          { header: 'Product', accessor: (r) => r.product?.name },
          { header: 'Type', accessor: (r) => r.movement_type },
          { header: 'Opening', accessor: (r) => r.opening_qty },
          { header: 'Change', accessor: (r) => r.quantity_changed },
          { header: 'Closing', accessor: (r) => r.closing_qty },
        ])}>Export</Button>
      </FilterBar>
      <DataTable
        columns={[
          { id: 'when', header: 'Date / Time', accessorFn: (r) => new Date(r.moved_at).toLocaleString() },
          { id: 'product', header: 'Product', accessorFn: (r) => r.product?.name },
          { id: 'type', header: 'Movement', accessorFn: (r) => r.movement_type },
          { id: 'open', header: 'Opening', accessorFn: (r) => fmtQty(r.opening_qty, r.product?.unit) },
          { id: 'chg', header: 'Changed', accessorFn: (r) => {
            const n = Number(r.quantity_changed);
            return `${n > 0 ? '+' : ''}${fmtQty(n, r.product?.unit)}`;
          } },
          { id: 'close', header: 'Closing', accessorFn: (r) => fmtQty(r.closing_qty, r.product?.unit) },
          { id: 'ref', header: 'Reference', accessorFn: (r) => r.reference_type ? `${r.reference_type}#${r.reference_id}` : '—' },
          { id: 'user', header: 'User', accessorFn: (r) => r.user?.name || r.user?.username || '—' },
          { id: 'remarks', header: 'Remarks', accessorFn: (r) => r.remarks || '—' },
        ]}
        data={rows}
        emptyMessage="No stock movements yet"
      />
    </div>
  );
}
