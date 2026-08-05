import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { ActionBtn, DataTable, FilterBar, IconPlus, IconTrash, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, UNITS, fmtQty, loadStaff, loadServices, todayStr, useInvBranch } from './invApi';

export default function InvConsumptionPage() {
  const { toast } = useToast();
  const { branches, branchId, setBranchId, multiBranch, ready } = useInvBranch();

  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [form, setForm] = useState({
    staff_id: '',
    customer_id: '',
    service_id: '',
    reason: '',
    consumption_date: todayStr(),
  });
  /** { [productId]: { selected, quantity_used, unit } } */
  const [lineMap, setLineMap] = useState({});

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [c, p, s, cust, svc] = await Promise.all([
        api.get(`${INV_API}/consumptions`, { params: { status: status || undefined, branchId: branchId || undefined } }),
        api.get(`${INV_API}/products`, { params: { limit: 5000, status: 'active', branchId: branchId || undefined } }),
        loadStaff().catch(() => []),
        api.get('/customers', { params: { limit: 500, ...(branchId ? { branchId } : {}) } }).then((r) => (
          Array.isArray(r.data) ? r.data : (r.data?.data ?? [])
        )).catch(() => []),
        loadServices().catch(() => []),
      ]);
      setRows(c.data ?? []);
      setProducts(p.data?.data ?? []);
      setStaff(s);
      setCustomers(cust);
      setServices(Array.isArray(svc) ? svc : []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load usage records');
    }
    setLoading(false);
  }, [ready, status, branchId, toast]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    const next = {};
    products.forEach((p) => {
      next[String(p.id)] = {
        selected: false,
        quantity_used: '',
        unit: UNITS.includes(p.unit) ? p.unit : 'pcs',
      };
    });
    setLineMap(next);
    setProductSearch('');
    setCustomerSearch('');
    setServiceSearch('');
    setForm({
      staff_id: '',
      customer_id: '',
      service_id: '',
      reason: '',
      consumption_date: todayStr(),
    });
    setShow(true);
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => String(p.name || '').toLowerCase().includes(q));
  }, [products, productSearch]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const name = String(c.name || '').toLowerCase();
      const phone = String(c.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [customers, customerSearch]);

  const filteredServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => {
      const name = String(s.name || '').toLowerCase();
      const cat = String(s.category || '').toLowerCase();
      return name.includes(q) || cat.includes(q);
    });
  }, [services, serviceSearch]);

  const selectedCount = useMemo(
    () => Object.values(lineMap).filter((l) => l.selected).length,
    [lineMap]
  );

  const toggleProduct = (productId, checked) => {
    const key = String(productId);
    setLineMap((prev) => {
      const cur = prev[key] || { selected: false, quantity_used: '', unit: 'pcs' };
      return {
        ...prev,
        [key]: { ...cur, selected: checked },
      };
    });
  };

  const setLineField = (productId, patch) => {
    const key = String(productId);
    setLineMap((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { selected: false, quantity_used: '', unit: 'pcs' }), ...patch },
    }));
  };

  const save = async () => {
    const lines = products
      .map((p) => {
        const line = lineMap[String(p.id)];
        if (!line?.selected) return null;
        return {
          product_id: Number(p.id),
          quantity_used: Number(line.quantity_used),
          unit: UNITS.includes(line.unit) ? line.unit : (p.unit || 'pcs'),
          name: p.name,
        };
      })
      .filter(Boolean);

    if (!lines.length) return toast.error('Tick at least one product');
    const invalid = lines.find((l) => !Number.isFinite(l.quantity_used) || l.quantity_used <= 0);
    if (invalid) return toast.error(`Enter a valid quantity for ${invalid.name}`);

    setSaving(true);
    try {
      const shared = {
        branch_id: branchId || undefined,
        staff_id: form.staff_id || null,
        customer_id: form.customer_id || null,
        service_id: form.service_id || null,
        reason: form.reason || null,
        consumption_date: form.consumption_date,
      };
      const results = await Promise.allSettled(
        lines.map((l) =>
          api.post(`${INV_API}/consumptions`, {
            ...shared,
            product_id: l.product_id,
            quantity_used: l.quantity_used,
            unit: l.unit,
          })
        )
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      setShow(false);
      if (ok && !fail) toast.success(`${ok} usage line(s) recorded — stock reduces at Day End Closing`);
      else if (ok && fail) toast.error(`${ok} saved, ${fail} failed`);
      else toast.error(results[0]?.reason?.response?.data?.message || 'Failed to record usage');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
    setSaving(false);
  };

  const cancel = async (row) => {
    if (!window.confirm(`Remove pending usage of ${row.product?.name}?`)) return;
    try {
      await api.post(`${INV_API}/consumptions/${row.id}/cancel`);
      toast.success('Removed');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div>
      <FilterBar>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="processed">Deducted</option>
          <option value="cancelled">Cancelled</option>
          <option value="">All</option>
        </Select>
        {multiBranch && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Button variant="primary" onClick={openAdd} style={{ marginLeft: 'auto' }}><IconPlus /> Record Usage</Button>
      </FilterBar>

      <DataTable
        columns={[
          { id: 'date', header: 'Date', accessorFn: (r) => r.consumption_date },
          { id: 'product', header: 'Product', accessorFn: (r) => r.product?.name },
          { id: 'qty', header: 'Qty Used', accessorFn: (r) => fmtQty(r.quantity_used, r.unit) },
          { id: 'customer', header: 'Customer', accessorFn: (r) => r.customer?.name || '—' },
          { id: 'service', header: 'Service', accessorFn: (r) => r.service?.name || '—' },
          { id: 'stylist', header: 'Stylist', accessorFn: (r) => r.staff?.name || '—' },
          { id: 'reason', header: 'Reason', accessorFn: (r) => r.reason || '—' },
          {
            id: 'status', header: 'Status', accessorFn: (r) => r.status,
            cell: ({ row: { original: r } }) => (
              <span style={{ textTransform: 'capitalize' }}>
                {r.status === 'processed' ? 'Deducted' : r.status}
              </span>
            ),
          },
          {
            id: 'actions', header: '', enableSorting: false,
            cell: ({ row: { original: r } }) => r.status === 'pending' ? (
              <ActionBtn onClick={() => cancel(r)} title="Remove" color="#DC2626"><IconTrash /></ActionBtn>
            ) : null,
          },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No usage recorded"
        emptySub="Record what staff used today — stock only drops at Day End Closing"
      />

      <Modal
        open={show}
        onClose={() => setShow(false)}
        title="Record Product Usage"
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Save{selectedCount ? ` (${selectedCount})` : ''}
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: multiBranch ? '1fr 1fr' : '1fr 1fr', gap: 10 }}>
            {multiBranch && (
              <FormGroup label="Branch">
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </FormGroup>
            )}
            <FormGroup label="Date">
              <Input type="date" value={form.consumption_date} onChange={(e) => setForm((f) => ({ ...f, consumption_date: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Stylist">
              <Select value={form.staff_id} onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Optional</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FormGroup>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormGroup label="Customer">
              <Input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search name or phone…"
                style={{ marginBottom: 6 }}
              />
              <Select value={form.customer_id} onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}>
                <option value="">Select customer (optional)</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.phone ? ` — ${c.phone}` : ''}
                  </option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup label="Service">
              <Input
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="Search service…"
                style={{ marginBottom: 6 }}
              />
              <Select value={form.service_id} onChange={(e) => setForm((f) => ({ ...f, service_id: e.target.value }))}>
                <option value="">Select service (optional)</option>
                {filteredServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.category ? ` — ${s.category}` : ''}
                  </option>
                ))}
              </Select>
            </FormGroup>
          </div>

          <FormGroup label="Reason">
            <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Hair wash" />
          </FormGroup>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-text-muted, #667085)', letterSpacing: '0.04em' }}>
                PRODUCTS — tick, enter qty, select unit
              </div>
              <div style={{ fontSize: 12, color: 'var(--app-text-muted, #98A2B3)' }}>
                {selectedCount} selected
              </div>
            </div>
            <Input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products…"
              style={{ marginBottom: 8 }}
            />
            <div
              style={{
                maxHeight: 340,
                overflow: 'auto',
                border: '1px solid var(--app-border, #E4E7EC)',
                borderRadius: 10,
                background: 'var(--app-panel, #fff)',
              }}
            >
              {filteredProducts.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13, color: 'var(--app-text-muted, #98A2B3)' }}>
                  {products.length ? 'No products match your search.' : 'No usable products in this branch — add one on the Products tab first.'}
                </div>
              ) : filteredProducts.map((p) => {
                const key = String(p.id);
                const line = lineMap[key] || {
                  selected: false,
                  quantity_used: '',
                  unit: UNITS.includes(p.unit) ? p.unit : 'pcs',
                };
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr 110px 100px',
                      gap: 10,
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--app-border, #F2F4F7)',
                      background: line.selected ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!line.selected}
                      onChange={(e) => toggleProduct(p.id, e.target.checked)}
                      aria-label={`Select ${p.name}`}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--app-text-muted, #98A2B3)' }}>
                        Stock {fmtQty(p.current_stock, p.unit)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--app-text-muted, #667085)', marginBottom: 4, letterSpacing: '0.04em' }}>QTY</div>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!line.selected}
                        value={line.quantity_used}
                        onChange={(e) => setLineField(p.id, { quantity_used: e.target.value, selected: true })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--app-text-muted, #667085)', marginBottom: 4, letterSpacing: '0.04em' }}>UNIT</div>
                      <Select
                        disabled={!line.selected}
                        value={line.unit}
                        onChange={(e) => setLineField(p.id, { unit: e.target.value, selected: true })}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--app-text-muted, #98A2B3)' }}>
            Tick every product used, type the quantity, and pick the unit (ml, g, kg, L, pcs). Stock only drops at Day End Closing.
          </div>
        </div>
      </Modal>
    </div>
  );
}
