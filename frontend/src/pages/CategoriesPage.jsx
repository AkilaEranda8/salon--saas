import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  IconPlus, IconEdit, IconTrash, IconTag,
  ActionBtn, StatCard, PKModal as Modal, DataTable,
} from '../components/ui/PageKit';

const DEFAULT_COLORS = {
  Hair:    { bg: '#EFF6FF', color: '#2563EB' },
  Beard:   { bg: '#F5F3FF', color: '#7C3AED' },
  Skin:    { bg: '#FFF7ED', color: '#EA580C' },
  Nail:    { bg: '#FFFBEB', color: '#D97706' },
  Massage: { bg: '#ECFDF5', color: '#059669' },
  Other:   { bg: '#F8FAFC', color: '#64748B' },
};
const PALETTE = ['#2563EB','#7C3AED','#EA580C','#D97706','#059669','#DC2626','#0891B2','#DB2777','#4F46E5','#64748B'];

function getCatStyle(name) {
  if (DEFAULT_COLORS[name]) return DEFAULT_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const c = PALETTE[Math.abs(hash) % PALETTE.length];
  return { bg: c + '18', color: c };
}

export default function CategoriesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = ['superadmin', 'admin'].includes(user?.role);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameCat, setRenameCat] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/services/categories');
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch { }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const totalServices = categories.reduce((s, c) => s + Number(c.count || 0), 0);

  const columns = useMemo(() => [
    {
      id: 'category',
      header: 'Category',
      accessorKey: 'category',
      cell: ({ row: { original: cat } }) => {
        const s = getCatStyle(cat.category);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconTag />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#101828' }}>{cat.category}</span>
          </div>
        );
      },
    },
    {
      id: 'count',
      header: 'Services',
      accessorKey: 'count',
      meta: { align: 'center', width: '100px' },
      cell: ({ getValue }) => (
        <span style={{ fontWeight: 700, color: '#059669' }}>{getValue()} service{Number(getValue()) !== 1 ? 's' : ''}</span>
      ),
    },
    ...(canEdit ? [{
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { width: '100px', align: 'center' },
      cell: ({ row: { original: cat } }) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <ActionBtn onClick={() => { setRenameCat(cat.category); setRenameVal(cat.category); setFormErr(''); setShowRename(true); }} title="Rename" color="#D97706"><IconEdit /></ActionBtn>
          <ActionBtn onClick={() => handleDelete(cat.category)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>
        </div>
      ),
    }] : []),
  ], [canEdit]);

  const handleAdd = async () => {
    if (!newName.trim()) return setFormErr('Enter category name');
    if (categories.some(c => c.category?.toLowerCase() === newName.trim().toLowerCase()))
      return setFormErr('Category already exists');
    setSaving(true);
    try {
      // Create a placeholder service then delete it — or just create via service
      // Better: Create an actual service with that category so it exists
      await api.post('/services', { name: `${newName.trim()} - Default`, category: newName.trim(), price: 0, duration_minutes: 30 });
      setShowAdd(false); setNewName(''); setFormErr('');
      toast('Category added!', 'success');
      load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Failed to add'); }
    setSaving(false);
  };

  const handleRename = async () => {
    if (!renameVal.trim()) return setFormErr('Enter new name');
    if (renameVal.trim() === renameCat) return setFormErr('Name is the same');
    if (categories.some(c => c.category?.toLowerCase() === renameVal.trim().toLowerCase() && c.category !== renameCat))
      return setFormErr('Category already exists');
    setSaving(true);
    try {
      await api.put('/services/categories/rename', { oldName: renameCat, newName: renameVal.trim() });
      setShowRename(false); setRenameCat(null); setRenameVal(''); setFormErr('');
      toast('Category renamed!', 'success');
      load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Failed to rename'); }
    setSaving(false);
  };

  const handleDelete = async (name) => {
    if (!window.confirm(`Delete "${name}"? All services in this category will be moved to "Other".`)) return;
    try {
      await api.post('/services/categories/delete', { name });
      toast('Category deleted', 'success');
      load();
    } catch { toast('Failed to delete', 'error'); }
  };

  return (
    <PageWrapper title="Categories" subtitle="Manage service categories"
      actions={canEdit && <Button variant="primary" onClick={() => { setNewName(''); setFormErr(''); setShowAdd(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconPlus /> Add Category</Button>}>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Categories" value={categories.length} color="#6366F1" icon={<IconTag />} />
        <StatCard label="Total Services" value={totalServices} color="#059669" icon={<IconTag />} />
      </div>

      <DataTable
        columns={columns}
        data={categories}
        loading={loading}
        emptyMessage="No categories found"
        emptySub="Add a category to organize your services"
        searchableColumns={[{ id: 'category', title: 'Category' }]}
      />

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Category" size="sm"
        footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleAdd}>Add Category</Button></>}>
        {formErr && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 14, fontSize: 13, border: '1px solid #FEE2E2' }}>{formErr}</div>}
        <FormGroup label="Category Name" required>
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Facial, Spa, Bridal" autoFocus />
        </FormGroup>
      </Modal>

      {/* Rename Modal */}
      <Modal open={showRename} onClose={() => setShowRename(false)} title={`Rename "${renameCat}"`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setShowRename(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleRename}>Rename</Button></>}>
        {formErr && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 14, fontSize: 13, border: '1px solid #FEE2E2' }}>{formErr}</div>}
        <FormGroup label="New Name" required>
          <Input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus />
        </FormGroup>
      </Modal>
    </PageWrapper>
  );
}
