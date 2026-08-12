import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFeatureGate } from '../hooks/useFeatureGate';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  IconEye, IconEdit, IconTrash, IconPlus,
  ActionBtn, PKModal as Modal,
  FilterBar, DataTable,
} from '../components/ui/PageKit';

const CAT_COLOR = { Hair: '#2563EB', Beard: '#7C3AED', Skin: '#EA580C', Nail: '#D97706', Massage: '#059669', Other: '#64748B' };
const CAT_BG    = { Hair: '#EFF6FF', Beard: '#F5F3FF', Skin: '#FFF7ED', Nail: '#FFFBEB', Massage: '#ECFDF5', Other: '#F8FAFC' };
const EMPTY = {
  name: '', category: '', subcategory: '', duration_minutes: 30, price: '',
  description: '', image_url: '', is_active: true, available_online: true,
  commission_type: 'percentage', commission_value: '',
};

function formatCommission(type, value) {
  if (value == null || value === '') return '—';
  return type === 'fixed'
    ? `Rs. ${Number(value).toLocaleString()}`
    : `${value}%`;
}

export default function ServicesPage() {
  const { user }  = useAuth();
  const { allowed: serviceWiseCommission } = useFeatureGate('service_wise_commission');
  const { allowed: franchiseCommission } = useFeatureGate('franchise_commission');
  const showServiceCommission = serviceWiseCommission || franchiseCommission;
  const { toast } = useToast();
  const canEdit   = ['superadmin', 'admin', 'manager'].includes(user?.role);
  const [services, setServices] = useState([]);
  const [allSvcs, setAllSvcs]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filterCat, setFilterCat] = useState('All');
  const [filterSub, setFilterSub] = useState('All');
  const [categories, setCategories] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showView, setShowView] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState('');
  const [newCategory, setNewCategory] = useState(false);

  const CATS = categories.length ? categories : ['Other'];

  const load = useCallback(async () => {
    setLoading(true);
    const unfiltered = filterCat === 'All' && filterSub === 'All';
    const params = {
      limit: unfiltered ? 500 : 200,
      ...(filterCat !== 'All' ? { category: filterCat } : {}),
      ...(filterCat !== 'All' && filterSub !== 'All' ? { subcategory: filterSub } : {}),
    };

    // Avoid duplicate /services calls when showing the full list (was 2× every load).
    const requests = [
      api.get('/services', { params }),
      api.get('/services/categories'),
    ];
    if (!unfiltered) {
      requests.push(api.get('/services', { params: { limit: 500 } }));
    }

    const settled = await Promise.allSettled(requests);
    const filteredRes = settled[0];
    const catsRes = settled[1];
    const allRes = unfiltered ? filteredRes : settled[2];

    if (filteredRes.status === 'fulfilled') {
      setServices(Array.isArray(filteredRes.value.data) ? filteredRes.value.data : (filteredRes.value.data?.data ?? []));
    } else {
      setServices([]);
    }

    const allRows = allRes?.status === 'fulfilled'
      ? (Array.isArray(allRes.value.data) ? allRes.value.data : (allRes.value.data?.data ?? []))
      : [];
    setAllSvcs(allRows);

    let catNames = [];
    let tree = [];
    if (catsRes.status === 'fulfilled') {
      const catRows = Array.isArray(catsRes.value.data) ? catsRes.value.data : [];
      tree = catRows;
      catNames = catRows.map(c => c.category).filter(Boolean);
    }
    if (!catNames.length) {
      catNames = Array.from(new Set(allRows.map(s => s?.category).filter(Boolean)));
      const byCat = new Map();
      allRows.forEach((s) => {
        if (!s?.category) return;
        if (!byCat.has(s.category)) byCat.set(s.category, { category: s.category, count: 0, subcategories: [] });
        const entry = byCat.get(s.category);
        entry.count += 1;
        if (s.subcategory) {
          const existing = entry.subcategories.find((x) => x.name === s.subcategory);
          if (existing) existing.count += 1;
          else entry.subcategories.push({ name: s.subcategory, count: 1 });
        }
      });
      tree = [...byCat.values()];
    }
    setCategories(catNames);
    setCategoryTree(tree);

    if (filteredRes.status !== 'fulfilled') {
      toast('Could not load services from server.', 'error');
    } else if (catsRes.status !== 'fulfilled') {
      toast('Service categories failed to load. Using fallback list.', 'warn');
    }
    setLoading(false);
  }, [filterCat, filterSub, toast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!form.category && CATS.length > 0 && !newCategory) {
      setForm(f => ({ ...f, category: CATS[0] }));
    }
  }, [form.category, CATS, newCategory]);

  const catCounts = allSvcs.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {});

  const subOptions = useMemo(() => {
    const entry = categoryTree.find((c) => c.category === filterCat);
    return entry?.subcategories || [];
  }, [categoryTree, filterCat]);

  const formSubOptions = useMemo(() => {
    const entry = categoryTree.find((c) => c.category === form.category);
    const names = (entry?.subcategories || []).map((s) => s.name);
    if (form.subcategory && !names.includes(form.subcategory)) names.push(form.subcategory);
    return names;
  }, [categoryTree, form.category, form.subcategory]);

  const openAdd = () => {
    setEditItem(null);
    setNewCategory(false);
    setForm({ ...EMPTY, category: CATS[0] || 'Other', subcategory: '' });
    setFormErr('');
    setShowForm(true);
  };
  const openEdit = (row) => {
    setEditItem(row);
    setNewCategory(false);
    setForm({
      ...row,
      subcategory: row.subcategory || '',
      available_online: row.available_online !== false,
      commission_type: row.commission_type || 'percentage',
      commission_value: row.commission_value ?? '',
    });
    setFormErr('');
    setShowForm(true);
  };
  const openView = (row) => { setViewItem(row); setShowView(true); };

  const buildPayload = () => {
    const payload = {
      name: form.name,
      category: form.category,
      subcategory: form.subcategory || null,
      duration_minutes: form.duration_minutes,
      price: form.price,
      description: form.description || '',
      image_url: form.image_url?.trim() || null,
      is_active: form.is_active !== false,
      available_online: form.available_online !== false,
    };
    if (showServiceCommission) {
      payload.commission_type = form.commission_type || 'percentage';
      payload.commission_value = form.commission_value === '' || form.commission_value == null
        ? null
        : form.commission_value;
    }
    return payload;
  };

  const handleSave = async () => {
    if (!form.name || !form.price) return setFormErr('Name and price are required');
    if (!form.category?.trim()) return setFormErr('Category is required');
    setSaving(true);
    try {
      const payload = buildPayload();
      editItem ? await api.put(`/services/${editItem.id}`, payload) : await api.post('/services', payload);
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this service?')) return;
    await api.delete(`/services/${id}`);
    load();
  };

  const selectCats = [...new Set([...(form.category ? [form.category] : []), ...CATS])];

  const columns = [
    {
      id: 'name',
      header: 'Service',
      accessorFn: (row) => `${row.name || ''} ${row.category || ''} ${row.subcategory || ''} ${row.description || ''}`.trim(),
      meta: { width: '22%' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight: 600, color: '#101828', fontSize: 14 }}>{row.name}</span>,
    },
    {
      id: 'category',
      header: 'Category',
      accessorFn: (row) => `${row.category || ''} ${row.subcategory || ''}`,
      meta: { width: '18%' },
      cell: ({ row: { original: row } }) => (
        <div>
          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: CAT_BG[row.category] || '#F2F4F7', color: CAT_COLOR[row.category] || '#475467' }}>{row.category || '—'}</span>
          {row.subcategory ? (
            <div style={{ fontSize: 11, color: '#667085', marginTop: 4, fontWeight: 600 }}>{row.subcategory}</div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      accessorFn: (row) => row.duration_minutes,
      meta: { width: '10%', align: 'center' },
      cell: ({ row: { original: row } }) => <span style={{ color: '#475467', fontSize: 13 }}>{row.duration_minutes} min</span>,
    },
    {
      id: 'price',
      header: 'Price',
      accessorFn: (row) => row.price,
      meta: { width: '12%', align: 'right' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight: 700, color: '#2563EB' }}>Rs. {Number(row.price).toLocaleString()}</span>,
    },
    ...(showServiceCommission ? [{
      id: 'commission',
      header: 'Commission',
      accessorFn: (row) => row.commission_value,
      meta: { width: '12%', align: 'right' },
      cell: ({ row: { original: row } }) => (
        <span style={{ fontWeight: 600, color: '#059669', fontSize: 13 }}>
          {formatCommission(row.commission_type, row.commission_value)}
        </span>
      ),
    }] : []),
    {
      id: 'description',
      header: 'Description',
      accessorFn: (row) => row.description,
      meta: { width: showServiceCommission ? '12%' : '20%' },
      cell: ({ row: { original: row } }) => <span style={{ color: '#475467', fontSize: 13 }}>{String(row.description || '').slice(0, 60)}</span>,
    },
    {
      id: 'available_online',
      header: 'Online',
      accessorFn: (row) => row.available_online !== false ? 'Yes' : 'No',
      meta: { width: '10%', align: 'center' },
      cell: ({ row: { original: row } }) => {
        const on = row.available_online !== false;
        return (
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 99,
            fontSize: 11, fontWeight: 700,
            background: on ? '#ECFDF5' : '#F2F4F7',
            color: on ? '#059669' : '#667085',
            border: `1px solid ${on ? '#A7F3D0' : '#E4E7EC'}`,
          }}>
            {on ? 'Online' : 'Salon only'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { width: '10%', align: 'center' },
      cell: ({ row: { original: row } }) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <ActionBtn onClick={() => openView(row)} title="View" color="#2563EB"><IconEye /></ActionBtn>
          {canEdit && <ActionBtn onClick={() => openEdit(row)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>}
          {canEdit && <ActionBtn onClick={() => handleDelete(row.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>}
        </div>
      ),
    },
  ];

  return (
    <PageWrapper title="Services" subtitle="Manage service catalogue and pricing"
      actions={canEdit && <Button variant="primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconPlus /> Add Service</Button>}>

      <FilterBar>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['All', ...CATS].map((cat) => {
              const active = filterCat === cat;
              const color  = active ? (cat === 'All' ? '#2563EB' : CAT_COLOR[cat]) : '#667085';
              const bg     = active ? (cat === 'All' ? '#EFF6FF' : CAT_BG[cat])   : '#fff';
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setFilterCat(cat); setFilterSub('All'); }}
                  style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${active ? color : '#E4E7EC'}`, background: bg, color, fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif", whiteSpace: 'nowrap' }}
                >
                  {cat}{cat !== 'All' && catCounts[cat] ? ` (${catCounts[cat]})` : ''}
                </button>
              );
            })}
          </div>
          {filterCat !== 'All' && subOptions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#98A2B3', marginRight: 4 }}>SUB</span>
              {[{ name: 'All', count: catCounts[filterCat] || 0 }, ...subOptions].map((sub) => {
                const name = sub.name;
                const active = filterSub === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setFilterSub(name)}
                    style={{ padding: '4px 12px', borderRadius: 16, border: `1.5px solid ${active ? '#2563EB' : '#E4E7EC'}`, background: active ? '#EFF6FF' : '#fff', color: active ? '#2563EB' : '#667085', fontWeight: active ? 700 : 500, fontSize: 11, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}
                  >
                    {name}{name !== 'All' && sub.count ? ` (${sub.count})` : ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={services}
        loading={loading}
        emptyMessage="No services found"
        emptySub="Try adjusting your filters or add a new service"
        searchableColumns={[{ id: 'name', title: 'Service' }]}
        filterableColumns={[{
          id: 'category',
          title: 'Category',
          options: CATS.map((c) => ({ label: c, value: c })),
        }]}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Edit Service' : 'Add Service'} size="md"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} disabled={!form.name?.trim() || !form.price || !form.category?.trim()} onClick={handleSave}>{editItem ? 'Save' : 'Add Service'}</Button></>}>
        {formErr && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 16, fontSize: 13, border: '1px solid #FEE2E2' }}>{formErr}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormGroup label="Service Name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Hair Cut & Style" /></FormGroup>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Category" required>
              {newCategory ? (
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subcategory: '' }))}
                  placeholder="New category name"
                />
              ) : (
                <Select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subcategory: '' }))}
                  style={{ flex: 1 }}
                >
                  {selectCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
              <button
                type="button"
                onClick={() => {
                  setNewCategory((v) => !v);
                  if (!newCategory) setForm((f) => ({ ...f, category: '', subcategory: '' }));
                  else setForm((f) => ({ ...f, category: CATS[0] || 'Other', subcategory: '' }));
                }}
                style={{ marginTop: 6, background: 'none', border: 'none', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                {newCategory ? 'Pick existing category' : '+ New category'}
              </button>
            </FormGroup>
            <FormGroup label="Subcategory">
              <Input
                list="service-subcategory-options"
                value={form.subcategory || ''}
                onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
                placeholder="Optional — e.g. Ladies / Gents"
              />
              <datalist id="service-subcategory-options">
                {formSubOptions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </FormGroup>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Duration (min)">
              <Input type="number" value={form.duration_minutes} min="5" onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Price (Rs.)" required>
              <Input type="number" value={form.price} placeholder="1500" onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </FormGroup>
          </div>
          {showServiceCommission && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormGroup label="Commission Type">
                <Select value={form.commission_type || 'percentage'} onChange={(e) => setForm((f) => ({ ...f, commission_type: e.target.value }))}>
                  <option value="percentage">Percentage %</option>
                  <option value="fixed">Fixed (Rs.)</option>
                </Select>
              </FormGroup>
              <FormGroup label={form.commission_type === 'fixed' ? 'Commission (Rs.)' : 'Commission %'}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.commission_value ?? ''}
                  placeholder={form.commission_type === 'fixed' ? 'e.g. 500' : 'e.g. 10'}
                  onChange={(e) => setForm((f) => ({ ...f, commission_value: e.target.value }))}
                />
              </FormGroup>
            </div>
          )}
          {showServiceCommission && (
            <p style={{ fontSize: 12, color: '#667085', margin: 0, lineHeight: 1.45 }}>
              Optional default commission for this service. Staff-specific overrides still apply when set.
            </p>
          )}
          <FormGroup label="Description"><Input value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief description" /></FormGroup>
          <FormGroup label="Image URL (customer app card)">
            <Input
              value={form.image_url || ''}
              onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
              placeholder="https://… service photo"
            />
          </FormGroup>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            padding: '12px 14px', borderRadius: 10, border: '1.5px solid #E4E7EC', background: '#F9FAFB',
          }}>
            <input
              type="checkbox"
              checked={form.available_online !== false}
              onChange={(e) => setForm((f) => ({ ...f, available_online: e.target.checked }))}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2563EB' }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: '#101828' }}>
                Available for online booking
              </span>
              <span style={{ display: 'block', fontSize: 12, color: '#667085', marginTop: 3, lineHeight: 1.4 }}>
                Show this service on the website / WordPress booking form. Turn off for salon-only services.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <Modal open={showView} onClose={() => setShowView(false)} title={viewItem?.name} size="sm">
        {viewItem && (
          <div style={{ textAlign: 'center' }}>
            <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, background: CAT_BG[viewItem.category] || '#F2F4F7', color: CAT_COLOR[viewItem.category] || '#475467', marginBottom: 8 }}>{viewItem.category}</span>
            {viewItem.subcategory ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: '#667085', marginBottom: 16 }}>{viewItem.subcategory}</div>
            ) : <div style={{ marginBottom: 16 }} />}
            <div style={{ fontSize: 28, fontWeight: 800, color: '#2563EB', marginBottom: 8 }}>Rs. {Number(viewItem.price).toLocaleString()}</div>
            <div style={{ fontSize: 14, color: '#667085', marginBottom: 16 }}>{viewItem.duration_minutes} minutes</div>
            {showServiceCommission && (
              <div style={{ fontSize: 13, color: '#059669', fontWeight: 600, marginBottom: 12 }}>
                Commission: {formatCommission(viewItem.commission_type, viewItem.commission_value)}
              </div>
            )}
            {viewItem.description && <p style={{ fontSize: 13, color: '#475467', lineHeight: 1.5 }}>{viewItem.description}</p>}
            <div style={{ marginTop: 14, fontSize: 13, color: '#667085' }}>
              Online booking:{' '}
              <strong style={{ color: viewItem.available_online !== false ? '#059669' : '#667085' }}>
                {viewItem.available_online !== false ? 'Available' : 'Salon only'}
              </strong>
            </div>
          </div>
        )}
      </Modal>
    </PageWrapper>
  );
}
