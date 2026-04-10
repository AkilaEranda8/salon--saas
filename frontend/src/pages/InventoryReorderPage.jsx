import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

const STATUS = ['draft', 'ordered', 'partial', 'received', 'cancelled'];
const STATUS_COLOR = {
  draft: '#6B7280',
  ordered: '#2563EB',
  partial: '#D97706',
  received: '#059669',
  cancelled: '#DC2626',
};

export default function InventoryReorderPage() {
  const { addToast } = useToast();

  const [tab, setTab] = useState('alerts');
  const [loading, setLoading] = useState(true);
  const [lowStock, setLowStock] = useState([]);
  const [reorders, setReorders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    inventory_id: '',
    quantity_requested: '',
    supplier_name: '',
    supplier_contact: '',
    unit_cost: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lowRes, rRes] = await Promise.all([
        api.get('/inventory/low-stock'),
        api.get('/inventory/reorders'),
      ]);
      const low = Array.isArray(lowRes.data) ? lowRes.data : (Array.isArray(lowRes.data?.data) ? lowRes.data.data : []);
      setLowStock(low);
      setReorders(Array.isArray(rRes.data) ? rRes.data : []);
    } catch {
      addToast('Failed to load inventory data', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const createReorder = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/inventory/reorders', {
        ...form,
        quantity_requested: Number(form.quantity_requested || 0),
        unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
      });
      addToast('Reorder created', 'success');
      setShowForm(false);
      setForm({ inventory_id: '', quantity_requested: '', supplier_name: '', supplier_contact: '', unit_cost: '', notes: '' });
      load();
      setTab('reorders');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create reorder', 'error');
    }
    setSaving(false);
  };

  const quickCreateFromLowStock = (item) => {
    const suggestedQty = Number(item.reorder_qty || item.min_quantity || 0) || Math.max(10, Number(item.min_quantity || 0));
    setForm({
      inventory_id: String(item.id),
      quantity_requested: String(suggestedQty),
      supplier_name: item.supplier_name || '',
      supplier_contact: item.supplier_contact || '',
      unit_cost: '',
      notes: `Auto-suggested reorder for low stock item: ${item.product_name}`,
    });
    setShowForm(true);
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/inventory/reorders/${id}`, { status });
      addToast('Reorder updated', 'success');
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update reorder', 'error');
    }
  };

  const input = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', boxSizing: 'border-box', fontSize: 13, fontFamily: 'inherit' };

  return (
    <PageWrapper
      title="Inventory Reorders"
      subtitle="Track low stock and manage reorder lifecycle"
      actions={<Button onClick={() => { setShowForm(true); setTab('reorders'); }}>+ New Reorder</Button>}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('alerts')} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, background: tab === 'alerts' ? '#2563EB' : '#F3F4F6', color: tab === 'alerts' ? '#fff' : '#374151' }}>
          ⚠️ Low Stock Alerts ({lowStock.length})
        </button>
        <button onClick={() => setTab('reorders')} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, background: tab === 'reorders' ? '#2563EB' : '#F3F4F6', color: tab === 'reorders' ? '#fff' : '#374151' }}>
          📦 Reorder History ({reorders.length})
        </button>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid #D1D5DB', cursor: 'pointer', fontWeight: 600, background: '#fff', color: '#374151' }}>
          🔄 Refresh
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Create Reorder</h3>
          <form onSubmit={createReorder}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Inventory Item *</label>
                <select style={input} value={form.inventory_id} onChange={(e) => setForm((p) => ({ ...p, inventory_id: e.target.value }))} required>
                  <option value="">Select item</option>
                  {lowStock.map((item) => (
                    <option key={item.id} value={item.id}>{item.product_name} ({item.quantity} left)</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Qty Requested *</label>
                <input type="number" min="1" style={input} value={form.quantity_requested} onChange={(e) => setForm((p) => ({ ...p, quantity_requested: e.target.value }))} required />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Supplier Name</label>
                <input style={input} value={form.supplier_name} onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Supplier Contact</label>
                <input style={input} value={form.supplier_contact} onChange={(e) => setForm((p) => ({ ...p, supplier_contact: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Unit Cost (optional)</label>
                <input type="number" min="0" step="0.01" style={input} value={form.unit_cost} onChange={(e) => setForm((p) => ({ ...p, unit_cost: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Notes</label>
                <input style={input} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Reorder'}</Button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: '#6B7280' }}>Loading inventory data…</div>
      ) : tab === 'alerts' ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB', background: '#F9FAFB' }}>
                {['Product', 'Current Qty', 'Min Qty', 'Reorder Qty', 'Supplier', 'Action'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#374151', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lowStock.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#9CA3AF' }}>All good. No low stock alerts.</td></tr>
              )}
              {lowStock.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.product_name}</td>
                  <td style={{ padding: '10px 12px', color: '#DC2626', fontWeight: 700 }}>{item.quantity}</td>
                  <td style={{ padding: '10px 12px' }}>{item.min_quantity}</td>
                  <td style={{ padding: '10px 12px' }}>{item.reorder_qty || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#6B7280' }}>{item.supplier_name || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <button onClick={() => quickCreateFromLowStock(item)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Create Reorder</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB', background: '#F9FAFB' }}>
                {['Date', 'Item', 'Qty', 'Supplier', 'Unit Cost', 'Status', 'Updated', 'Action'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#374151', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reorders.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: '#9CA3AF' }}>No reorders yet.</td></tr>
              )}
              {reorders.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 12px', color: '#6B7280' }}>{new Date(r.created_at || r.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.item?.product_name || r.inventory?.product_name || `#${r.inventory_id}`}</td>
                  <td style={{ padding: '10px 12px' }}>{r.quantity_requested}</td>
                  <td style={{ padding: '10px 12px' }}>{r.supplier_name || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{r.unit_cost ? `Rs. ${Number(r.unit_cost).toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', borderRadius: 20, padding: '3px 10px', background: STATUS_COLOR[r.status] || '#6B7280' }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12 }}>{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—')}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {r.status !== 'received' && r.status !== 'cancelled' && (
                      <select
                        value={r.status}
                        onChange={(e) => updateStatus(r.id, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 11 }}
                      >
                        {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10, fontSize: 11, color: '#9CA3AF' }}>
            Note: When status changes to "received", stock quantity is automatically increased in inventory.
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
