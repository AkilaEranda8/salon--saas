import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { ActionBtn, DataTable, IconEdit, IconPlus, IconTrash, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, PRODUCT_TYPES } from './invApi';

export default function InvCategoriesPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'consumable', description: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await api.get(`${INV_API}/categories`);
    setRows(r.data ?? []);
  };
  useEffect(() => { load().catch(() => toast.error('Load failed')); }, []);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      if (edit) await api.put(`${INV_API}/categories/${edit.id}`, form);
      else await api.post(`${INV_API}/categories`, form);
      setShow(false); load(); toast.success('Saved');
    } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete category?')) return;
    await api.delete(`${INV_API}/categories/${id}`);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="primary" onClick={() => { setEdit(null); setForm({ name: '', type: 'consumable', description: '' }); setShow(true); }}><IconPlus /> Add Category</Button>
      </div>
      <DataTable
        columns={[
          { id: 'name', header: 'Name', accessorFn: (r) => r.name },
          { id: 'type', header: 'Type', accessorFn: (r) => r.type },
          { id: 'desc', header: 'Description', accessorFn: (r) => r.description || '—' },
          { id: 'actions', header: 'Actions', enableSorting: false, cell: ({ row: { original: r } }) => (
            <div style={{ display: 'flex', gap: 4 }}>
              <ActionBtn onClick={() => { setEdit(r); setForm({ name: r.name, type: r.type, description: r.description || '' }); setShow(true); }} color="#D97706"><IconEdit /></ActionBtn>
              <ActionBtn onClick={() => remove(r.id)} color="#DC2626"><IconTrash /></ActionBtn>
            </div>
          ) },
        ]}
        data={rows}
        emptyMessage="No categories"
      />
      <Modal open={show} onClose={() => setShow(false)} title={edit ? 'Edit Category' : 'Add Category'}
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}>
        <FormGroup label="Name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FormGroup>
        <FormGroup label="Type"><Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>{PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></FormGroup>
        <FormGroup label="Description"><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></FormGroup>
      </Modal>
    </div>
  );
}
