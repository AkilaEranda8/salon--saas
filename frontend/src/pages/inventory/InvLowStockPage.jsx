import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { DataTable } from '../../components/ui/PageKit';
import { useToast } from '../../components/ui/Toast';
import { INV_API, exportCsv, fmtQty } from './invApi';

export default function InvLowStockPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get(`${INV_API}/low-stock`)
      .then((r) => setRows(r.data ?? []))
      .catch(() => toast.error('Failed to load low stock'));
  }, []);

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{
          fontSize: 13,
          color: 'var(--app-text-secondary, #475467)',
          fontFamily: "'Inter',sans-serif",
        }}>
          Products where current stock ≤ minimum stock. Suggested order helps restock.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => exportCsv('low-stock.csv', rows, [
            { header: 'Product', accessor: (r) => r.name },
            { header: 'Stock', accessor: (r) => r.current_stock },
            { header: 'Min', accessor: (r) => r.min_stock },
            { header: 'Suggested', accessor: (r) => r.suggested_order_qty },
          ])}>Export CSV</Button>
          <Button variant="primary" onClick={() => navigate('/inventory/purchase-orders')}>Create Purchase Order</Button>
        </div>
      </div>
      <DataTable
        columns={[
          { id: 'name', header: 'Product', accessorFn: (r) => r.name },
          { id: 'type', header: 'Type', accessorFn: (r) => r.product_type },
          { id: 'stock', header: 'Current', accessorFn: (r) => fmtQty(r.current_stock, r.unit) },
          { id: 'min', header: 'Minimum', accessorFn: (r) => fmtQty(r.min_stock, r.unit) },
          { id: 'suggest', header: 'Purchase Recommendation', accessorFn: (r) => fmtQty(r.suggested_order_qty, r.unit) },
          { id: 'supplier', header: 'Supplier', accessorFn: (r) => r.supplier?.name || '—' },
        ]}
        data={rows}
        emptyMessage="No low stock items"
      />
    </div>
  );
}
