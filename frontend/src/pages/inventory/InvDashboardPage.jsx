import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { INV_API, fmtQty } from './invApi';
import { StatCard, IconBox } from '../../components/ui/PageKit';
import Button from '../../components/ui/Button';

const panel = {
  background: 'var(--app-panel, #fff)',
  border: '1px solid var(--app-border, #EAECF0)',
  borderRadius: 14,
  padding: 16,
  boxShadow: 'var(--app-shadow, 0 2px 8px rgba(16,24,40,0.06))',
};

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

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--app-text-muted, #98A2B3)', fontFamily: "'Inter',sans-serif" }}>
        Loading dashboard…
      </div>
    );
  }

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

      <div style={panel}>
        <div style={{
          fontWeight: 700,
          marginBottom: 12,
          fontSize: 15,
          color: 'var(--app-title, #101828)',
          fontFamily: "'Sora',sans-serif",
        }}>
          Low Stock Alerts
        </div>
        {!data?.lowStockItems?.length ? (
          <div style={{ color: 'var(--app-text-muted, #98A2B3)', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
            No low stock items right now.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.lowStockItems.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#FEF2F2',
                  border: '1px solid #FEE2E2',
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--app-text, #101828)' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--app-text-muted, #98A2B3)' }}>
                    {p.product_type} · Min {fmtQty(p.min_stock, p.unit)}
                  </div>
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
