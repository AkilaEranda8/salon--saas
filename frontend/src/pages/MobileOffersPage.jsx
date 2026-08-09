import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  IconPlus, IconEdit, IconTrash,
  ActionBtn, PKModal as Modal,
  FilterBar, DataTable,
} from '../components/ui/PageKit';

const EMPTY = {
  title: '',
  body: '',
  image_url: '',
  category: '',
  badge_text: '',
  original_price: '',
  offer_price: '',
  starts_at: '',
  ends_at: '',
  is_published: false,
};

const STATUS_TABS = ['All', 'Live', 'Draft', 'Upcoming', 'Expired'];

function getStatus(row) {
  const today = new Date().toISOString().slice(0, 10);
  if (!row.is_published) return 'draft';
  if (row.starts_at && String(row.starts_at).slice(0, 10) > today) return 'upcoming';
  if (row.ends_at && String(row.ends_at).slice(0, 10) < today) return 'expired';
  return 'live';
}

const STATUS_STYLE = {
  live: { bg: '#ECFDF5', color: '#059669', label: 'Live' },
  draft: { bg: '#F2F4F7', color: '#667085', label: 'Draft' },
  upcoming: { bg: '#FFFBEB', color: '#D97706', label: 'Upcoming' },
  expired: { bg: '#F2F4F7', color: '#98A2B3', label: 'Expired' },
};

export default function MobileOffersPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/mobile-offers', { params: { limit: 200 } });
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch {
      toast('Failed to load mobile offers.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditId(null);
    setForm({ ...EMPTY });
    setErr('');
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditId(row.id);
    setForm({
      title: row.title || '',
      body: row.body || '',
      image_url: row.image_url || '',
      category: row.category || '',
      badge_text: row.badge_text || '',
      original_price: row.original_price != null ? String(row.original_price) : '',
      offer_price: row.offer_price != null ? String(row.offer_price) : '',
      starts_at: row.starts_at ? String(row.starts_at).slice(0, 10) : '',
      ends_at: row.ends_at ? String(row.ends_at).slice(0, 10) : '',
      is_published: !!row.is_published,
    });
    setErr('');
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setErr('Title and message are required.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        image_url: form.image_url.trim() || null,
        category: form.category.trim() || null,
        badge_text: form.badge_text.trim() || null,
        original_price: form.original_price === '' ? null : Number(form.original_price),
        offer_price: form.offer_price === '' ? null : Number(form.offer_price),
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        is_published: !!form.is_published,
      };
      if (editId) {
        await api.patch(`/mobile-offers/${editId}`, payload);
        toast('Offer updated.', 'success');
      } else {
        await api.post('/mobile-offers', payload);
        toast('Offer created.', 'success');
      }
      setShowForm(false);
      load();
    } catch (e) {
      setErr(e?.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete offer "${row.title}"?`)) return;
    try {
      await api.delete(`/mobile-offers/${row.id}`);
      toast('Offer deleted.', 'success');
      load();
    } catch {
      toast('Delete failed.', 'error');
    }
  };

  const togglePublish = async (row) => {
    try {
      await api.patch(`/mobile-offers/${row.id}`, { is_published: !row.is_published });
      toast(row.is_published ? 'Unpublished.' : 'Published to customer app.', 'success');
      load();
    } catch {
      toast('Update failed.', 'error');
    }
  };

  const displayed = useMemo(() => {
    if (filterStatus === 'All') return rows;
    const key = filterStatus.toLowerCase();
    return rows.filter((r) => getStatus(r) === key);
  }, [rows, filterStatus]);

  const columns = [
    {
      id: 'title',
      accessorKey: 'title',
      header: 'Offer',
      cell: ({ row: { original: r } }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.title}</div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 2, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.body}
          </div>
        </div>
      ),
    },
    {
      id: 'window',
      header: 'Validity',
      enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <span style={{ fontSize: 13, color: '#475467' }}>
          {(r.starts_at || '—').toString().slice(0, 10)} → {(r.ends_at || '—').toString().slice(0, 10)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row: { original: r } }) => {
        const s = STATUS_STYLE[getStatus(r)] || STATUS_STYLE.draft;
        return (
          <span style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
            {s.label}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { width: '18%', align: 'center' },
      cell: ({ row: { original: r } }) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
          <Button
            variant="secondary"
            onClick={() => togglePublish(r)}
            style={{ height: 30, padding: '0 10px', fontSize: 12 }}
          >
            {r.is_published ? 'Unpublish' : 'Publish'}
          </Button>
          <ActionBtn onClick={() => openEdit(r)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>
          <ActionBtn onClick={() => remove(r)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>
        </div>
      ),
    },
  ];

  return (
    <PageWrapper
      title="Mobile Offers"
      subtitle="Publish promotional offers to the customer mobile app"
      actions={(
        <Button variant="primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconPlus /> New offer
        </Button>
      )}
    >
      <FilterBar>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_TABS.map((tab) => {
            const active = filterStatus === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterStatus(tab)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: `1.5px solid ${active ? '#2563EB' : '#E4E7EC'}`,
                  background: active ? '#EFF6FF' : '#fff',
                  color: active ? '#2563EB' : '#667085',
                  fontWeight: active ? 700 : 500,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={displayed}
        loading={loading}
        emptyMessage="No mobile offers yet"
        emptySub="Create an offer and publish it for customers to see in the app"
        searchableColumns={[{ id: 'title', title: 'Offer' }]}
      />

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? 'Edit mobile offer' : 'New mobile offer'}
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>{editId ? 'Save Changes' : 'Create Offer'}</Button>
          </>
        )}
      >
        {err && (
          <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 16, fontSize: 13, border: '1px solid #FEE2E2' }}>
            {err}
          </div>
        )}
        <FormGroup label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Weekend Glow Special" />
        </FormGroup>
        <FormGroup label="Message">
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={4}
            placeholder="Offer details shown in the customer app…"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #E4E7EC',
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </FormGroup>
        <FormGroup label="Image URL (optional)">
          <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" />
        </FormGroup>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormGroup label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Hair, Packages" />
          </FormGroup>
          <FormGroup label="Badge text">
            <Input value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} placeholder="e.g. 25% off" />
          </FormGroup>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormGroup label="Original price">
            <Input type="number" min="0" step="0.01" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} placeholder="480" />
          </FormGroup>
          <FormGroup label="Offer price">
            <Input type="number" min="0" step="0.01" value={form.offer_price} onChange={(e) => setForm({ ...form, offer_price: e.target.value })} placeholder="360" />
          </FormGroup>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormGroup label="Starts">
            <Input type="date" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
          </FormGroup>
          <FormGroup label="Ends">
            <Input type="date" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
          </FormGroup>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={!!form.is_published}
            onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
          />
          Publish to customer app
        </label>
      </Modal>
    </PageWrapper>
  );
}
