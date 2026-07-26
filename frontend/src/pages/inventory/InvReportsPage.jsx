import { useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { DataTable } from '../../components/ui/PageKit';
import { useToast } from '../../components/ui/Toast';
import { INV_API, exportCsv, fmtQty } from './invApi';

const REPORTS = [
  { value: 'daily_consumption', label: 'Daily Consumption' },
  { value: 'monthly_consumption', label: 'Monthly Consumption' },
  { value: 'product_usage', label: 'Product Usage' },
  { value: 'branch_consumption', label: 'Branch Consumption' },
  { value: 'stylist_consumption', label: 'Stylist Consumption' },
  { value: 'purchase_report', label: 'Purchase Report' },
  { value: 'adjustment_report', label: 'Adjustment Report' },
  { value: 'inventory_ledger', label: 'Inventory Ledger' },
  { value: 'low_stock', label: 'Low Stock Report' },
];

export default function InvReportsPage() {
  const { toast } = useToast();
  const [type, setType] = useState('daily_consumption');
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const r = await api.get(`${INV_API}/reports`, { params: { type, from, to } });
      const data = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
      setRows(data);
    } catch { toast.error('Report failed'); }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'end' }}>
        <FormGroup label="Report"><Select value={type} onChange={(e) => setType(e.target.value)}>{REPORTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></FormGroup>
        <FormGroup label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormGroup>
        <FormGroup label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormGroup>
        <Button variant="primary" loading={loading} onClick={run}>Run Report</Button>
        <Button variant="secondary" onClick={() => exportCsv(`${type}.csv`, rows, [
          { header: 'JSON', accessor: (r) => JSON.stringify(r) },
        ])}>Export</Button>
      </div>
      <DataTable
        columns={
          type === 'low_stock'
            ? [
              { id: 'name', header: 'Product', accessorFn: (r) => r.name },
              { id: 'stock', header: 'Stock', accessorFn: (r) => fmtQty(r.current_stock, r.unit) },
              { id: 'min', header: 'Min', accessorFn: (r) => fmtQty(r.min_stock, r.unit) },
            ]
            : type.includes('consumption') || type.includes('usage')
              ? [
                { id: 'date', header: 'Date', accessorFn: (r) => r.consumption_date },
                { id: 'product', header: 'Product', accessorFn: (r) => r.product?.name },
                { id: 'qty', header: 'Qty', accessorFn: (r) => fmtQty(r.quantity_used, r.unit) },
                { id: 'staff', header: 'Stylist', accessorFn: (r) => r.staff?.name || '—' },
                { id: 'branch', header: 'Branch', accessorFn: (r) => r.branch?.name || '—' },
              ]
              : type === 'inventory_ledger'
                ? [
                  { id: 'when', header: 'When', accessorFn: (r) => new Date(r.moved_at).toLocaleString() },
                  { id: 'product', header: 'Product', accessorFn: (r) => r.product?.name },
                  { id: 'type', header: 'Type', accessorFn: (r) => r.movement_type },
                  { id: 'chg', header: 'Change', accessorFn: (r) => r.quantity_changed },
                ]
                : [
                  { id: 'id', header: 'ID', accessorFn: (r) => r.id },
                  { id: 'status', header: 'Status', accessorFn: (r) => r.status || '—' },
                ]
        }
        data={rows}
        loading={loading}
        emptyMessage="Run a report to see results"
      />
    </div>
  );
}
