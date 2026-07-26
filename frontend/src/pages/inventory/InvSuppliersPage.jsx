import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { ActionBtn, DataTable, IconEdit, IconPlus, IconTrash, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API } from './invApi';

const EMPTY = { name: '', contact_person: '', phone: '', email: '', address: '', notes: '' };

export default function InvSuppliersPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => { const r = await api.get(`${INV_API}/suppliers`); setRows(r.data ?? []); };
  useEffect(() => { load().catch(() => toast.error('Load failed')); }, []);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      if (edit) await api.put(`${INV_API}/suppliers/${edit.id}`, form);
      else await api.post(`${INV_API}/suppliers`, form);
      setShow(false); load(); toast.success('Saved');
    } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="primary" onClick={() => { setEdit(null); setForm(EMPTY); setShow(true); }}><IconPlus /> Add Supplier</Button>
      </div>
      <DataTable
        columns={[
          { id: 'name', header: 'Supplier', accessorFn: (r) => r.name },
          { id: 'contact', header: 'Contact', accessorFn: (r) => r.contact_person || '—' },
          { id: 'phone', header: 'Phone', accessorFn: (r) => r.phone || '—' },
          { id: 'email', header: 'Email', accessorFn: (r) => r.email || '—' },
          { id: 'actions', header: 'Actions', enableSorting: false, cell: ({ row: { original: r } }) => (
            <div style={{ display: 'flex', gap: 4 }}>
              <ActionBtn onClick={() => { setEdit(r); setForm({ ...EMPTY, ...r }); setShow(true); }} color="#D97706"><IconEdit /></ActionBtn>
              <ActionBtn onClick={async () => { if (window.confirm('Delete?')) { await api.delete(`${INV_API}/suppliers/${r.id}`); load(); } }} color="#DC2626"><IconTrash /></ActionBtn>
            </div>
          ) },
        ]}
        data={rows}
        emptyMessage="No suppliers"
      />
      <Modal open={show} onClose={() => setShow(false)} title={edit ? 'Edit Supplier' : 'Add Supplier'}
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <FormGroup label="Name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FormGroup>
          <FormGroup label="Contact Person"><Input value={form.contact_person || ''} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} /></FormGroup>
          <FormGroup label="Phone"><Input value={form.phone || ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></FormGroup>
          <FormGroup label="Email"><Input value={form.email || ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></FormGroup>
          <FormGroup label="Address"><Input value={form.address || ''} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></FormGroup>
        </div>
      </Modal>
    </div>
  );
}
