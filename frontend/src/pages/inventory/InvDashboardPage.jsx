import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { INV_API, fmtQty } from './invApi';
import { StatCard, IconBox } from '../../components/ui/PageKit';
import Button from '../../components/ui/Button';

export default function InvDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get(`${INV_API}/dashboard`);
        if (alive) setData(r.data);
      } catch { /* ignore */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div style={{ padding: 24, color: '#98A2B3' }}>Loading dashboard…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Products" value={data?.totalProducts ?? 0} color="#2563EB" icon={<IconBox />} />
        <StatCard label="Low Stock" value={data?.lowStockCount ?? 0} color="#DC2626" icon={<IconBox />} />
        <StatCard label="Pending Consumption" value={data?.pendingConsumption ?? 0} color="#D97706" icon={<IconBox />} />
        <StatCard label="Open POs" value={data?.openPurchaseOrders ?? 0} color="#7C3AED" icon={<IconBox />} />
        <StatCard label="Stock Value" value={`Rs. ${Number(data?.stockValue || 0).toLocaleString()}`} color="#059669" icon={<IconBox />} />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <Button variant="primary" onClick={() => navigate('/inventory/products')}>Manage Products</Button>
        <Button variant="secondary" onClick={() => navigate('/inventory/consumption')}>Record Consumption</Button>
        <Button variant="secondary" onClick={() => navigate('/inventory/day-end')}>Day End Closing</Button>
        <Button variant="secondary" onClick={() => navigate('/inventory/low-stock')}>Low Stock</Button>
      </div>

      <div style={{
        background: '#fff', border: '1px solid #EAECF0', borderRadius: 12, padding: 16,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>Low Stock Alerts</div>
        {!data?.lowStockItems?.length ? (
          <div style={{ color: '#98A2B3', fontSize: 13 }}>No low stock items right now.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.lowStockItems.map((p) => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FEE2E2',
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#98A2B3' }}>{p.product_type} · Min {fmtQty(p.min_stock, p.unit)}</div>
                </div>
                <div style={{ fontWeight: 700, color: '#DC2626' }}>{fmtQty(p.current_stock, p.unit)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
