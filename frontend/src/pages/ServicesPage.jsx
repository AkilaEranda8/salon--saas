import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  IconEye, IconEdit, IconTrash, IconPlus, IconTag,
  ActionBtn, StatCard, PKModal as Modal,
  FilterBar, SearchBar, DataTable,
} from '../components/ui/PageKit';

const CAT_COLOR = { Hair: '#2563EB', Beard: '#7C3AED', Skin: '#EA580C', Nail: '#D97706', Massage: '#059669', Other: '#64748B' };
const CAT_BG    = { Hair: '#EFF6FF', Beard: '#F5F3FF', Skin: '#FFF7ED', Nail: '#FFFBEB', Massage: '#ECFDF5', Other: '#F8FAFC' };
const EMPTY = { name: '', category: '', duration_minutes: 30, price: '', description: '', is_active: true };

export default function ServicesPage() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const canEdit   = ['superadmin', 'admin'].includes(user?.role);
  const [services, setServices] = useState([]);
  const [allSvcs, setAllSvcs]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filterCat, setFilterCat] = useState('All');
  const [search, setSearch]     = useState('');
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showView, setShowView] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState('');

  // Category list comes from API (hardcoded list removed)
  const CATS = categories.length ? categories : ['Other'];

  const load = useCallback(async () => {
    setLoading(true);
    const [filteredRes, allRes, catsRes] = await Promise.allSettled([
      api.get('/services', { params: { limit: 200, ...(filterCat !== 'All' ? { category: filterCat } : {}) } }),
      api.get('/services', { params: { limit: 500 } }),
      api.get('/services/categories'),
    ]);

    if (filteredRes.status === 'fulfilled') {
      setServices(Array.isArray(filteredRes.value.data) ? filteredRes.value.data : (filteredRes.value.data?.data ?? []));
    } else {
      setServices([]);
    }

    const allRows = allRes.status === 'fulfilled'
      ? (Array.isArray(allRes.value.data) ? allRes.value.data : (allRes.value.data?.data ?? []))
      : [];
    setAllSvcs(allRows);

    let catNames = [];
    if (catsRes.status === 'fulfilled') {
      const catRows = Array.isArray(catsRes.value.data) ? catsRes.value.data : [];
      catNames = catRows.map(c => c.category).filter(Boolean);
    }
    if (!catNames.length) {
      catNames = Array.from(new Set(allRows.map(s => s?.category).filter(Boolean)));
    }
    setCategories(catNames);

    if (filteredRes.status !== 'fulfilled') {
      toast('Could not load services from server.', 'error');
    } else if (catsRes.status !== 'fulfilled') {
      toast('Service categories failed to load. Using fallback list.', 'warn');
    }
    setLoading(false);
  }, [filterCat, toast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!form.category && CATS.length > 0) {
      setForm(f => ({ ...f, category: CATS[0] }));
    }
  }, [form.category, CATS]);

  const catCounts  = allSvcs.reduce((acc, s) => { acc[s.category] = (acc[s.category] || 0) + 1; return acc; }, {});
  const openAdd    = () => { setEditItem(null); setForm({ ...EMPTY, category: CATS[0] || 'Other' }); setFormErr(''); setShowForm(true); };
  const openEdit   = row => { setEditItem(row); setForm({ ...row }); setFormErr(''); setShowForm(true); };
  const openView   = row => { setViewItem(row); setShowView(true); };

  const handleSave = async () => {
    if (!form.name || !form.price) return setFormErr('Name and price are required');
    setSaving(true);
    try {
      editItem ? await api.put(`/services/${editItem.id}`, form) : await api.post('/services', form);
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };
  const handleDelete = async id => { if (!window.confirm('Delete this service?')) return; await api.delete(`/services/${id}`); load(); };

  const displayed = services.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q);
  });

  const selectCats = [...new Set([...(form.category ? [form.category] : []), ...CATS])];

  const columns = [
    {
      id: 'name',
      header: 'Service',
      accessorFn: row => row.name,
      meta: { width: '24%' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight: 600, color: '#101828', fontSize: 14 }}>{row.name}</span>,
    },
    {
      id: 'category',
      header: 'Category',
      accessorFn: row => row.category,
      meta: { width: '14%' },
      cell: ({ row: { original: row } }) => (
        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: CAT_BG[row.category] || '#F2F4F7', color: CAT_COLOR[row.category] || '#475467' }}>{row.category}</span>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      accessorFn: row => row.duration_minutes,
      meta: { width: '12%', align: 'center' },
      cell: ({ row: { original: row } }) => <span style={{ color: '#475467', fontSize: 13 }}>{row.duration_minutes} min</span>,
    },
    {
      id: 'price',
      header: 'Price',
      accessorFn: row => row.price,
      meta: { width: '14%', align: 'right' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight: 700, color: '#2563EB' }}>Rs. {Number(row.price).toLocaleString()}</span>,
    },
    {
      id: 'description',
      header: 'Description',
      accessorFn: row => row.description,
      meta: { width: '26%' },
      cell: ({ row: { original: row } }) => <span style={{ color: '#475467', fontSize: 13 }}>{String(row.description || '').slice(0, 60)}</span>,
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

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Total Services" value={allSvcs.length} color="#2563EB" icon={<IconTag />} />
        {CATS.filter(c => catCounts[c] > 0).map(c => (
          <StatCard key={c} label={c} value={catCounts[c]} color={CAT_COLOR[c]}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>} />
        ))}
      </div>

      {/* Filter Bar */}
      <FilterBar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search services" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['All', ...CATS].map(cat => {
            const active = filterCat === cat;
            const color  = active ? (cat === 'All' ? '#2563EB' : CAT_COLOR[cat]) : '#667085';
            const bg     = active ? (cat === 'All' ? '#EFF6FF' : CAT_BG[cat])   : '#fff';
            return (
              <button key={cat} onClick={() => setFilterCat(cat)}
                style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${active ? color : '#E4E7EC'}`, background: bg, color, fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif", whiteSpace: 'nowrap' }}>
                {cat}{cat !== 'All' && catCounts[cat] ? ` (${catCounts[cat]})` : ''}
              </button>
            );
          })}
        </div>
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={displayed}
        loading={loading}
        emptyMessage="No services found"
        emptySub="Try adjusting your filters or add a new service"
      />

      {/* Add / Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Edit Service' : 'Add Service'} size="md"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>{editItem ? 'Save' : 'Add Service'}</Button></>}>
        {formErr && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 16, fontSize: 13, border: '1px solid #FEE2E2' }}>{formErr}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormGroup label="Service Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Hair Cut & Style" /></FormGroup>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Category">
              <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ flex: 1 }}>
                {selectCats.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Duration (min)">
              <Input type="number" value={form.duration_minutes} min="5" onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
            </FormGroup>
          </div>
          <FormGroup label="Price (Rs.)" required><Input type="number" value={form.price} placeholder="1500" onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></FormGroup>
          <FormGroup label="Description"><Input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" /></FormGroup>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal open={showView} onClose={() => setShowView(false)} title={viewItem?.name} size="sm">
        {viewItem && (
          <div style={{ textAlign: 'center' }}>
            <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, background: CAT_BG[viewItem.category] || '#F2F4F7', color: CAT_COLOR[viewItem.category] || '#475467', marginBottom: 16 }}>{viewItem.category}</span>
            <div style={{ display: 'flex', gap: 12, margin: '20px 0', justifyContent: 'center' }}>
              <div style={{ flex: 1, background: '#EFF6FF', borderRadius: 12, padding: '14px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB' }}>Rs. {Number(viewItem.price).toLocaleString()}</div>
                <div style={{ fontSize: 12, color: '#475467', marginTop: 2 }}>Price</div>
              </div>
              <div style={{ flex: 1, background: '#F0FDFA', borderRadius: 12, padding: '14px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0891B2' }}>{viewItem.duration_minutes} min</div>
                <div style={{ fontSize: 12, color: '#475467', marginTop: 2 }}>Duration</div>
              </div>
            </div>
            {viewItem.description && <p style={{ color: '#475467', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{viewItem.description}</p>}
            {canEdit && <div style={{ marginTop: 16 }}><Button variant="primary" onClick={() => { setShowView(false); openEdit(viewItem); }}>Edit Service</Button></div>}
          </div>
        )}
      </Modal>
    </PageWrapper>
  );
}
