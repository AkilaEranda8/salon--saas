import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  IconEdit, IconTrash, IconPlus, IconBox,
  ActionBtn, StatCard, PKModal as Modal,
  FilterBar, SearchBar, DataTable,
} from '../components/ui/PageKit';

const DEFAULT_CATS = ['Shampoo','Conditioner','Color','Tools','Accessories','Consumables','Other'];
const EMPTY = { branch_id:'', name:'', category:'', quantity:0, min_quantity:5, unit:'pcs', cost_price:'', sell_price:'' };
const CAT_COLOR = { Shampoo:'#2563EB', Conditioner:'#7C3AED', Color:'#EA580C', Tools:'#D97706', Accessories:'#059669', Consumables:'#0284C7', Other:'#64748B' };
const CAT_BG    = { Shampoo:'#EFF6FF', Conditioner:'#F5F3FF', Color:'#FFF7ED',  Tools:'#FFFBEB', Accessories:'#ECFDF5', Consumables:'#F0F9FF',  Other:'#F8FAFC' };

function AdjustIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}

export default function InventoryPage() {
  const { user }     = useAuth();
  const { toast }    = useToast();
  const canEdit      = ['superadmin','admin','manager'].includes(user?.role);
  const isSuperAdmin = user?.role === 'superadmin';
  const [items, setItems]         = useState([]);
  const [branches, setBranches]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterBranch, setFilterBranch] = useState(isSuperAdmin ? '' : user?.branch_id || '');
  const [filterLow, setFilterLow]       = useState(false);
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [adjItem, setAdjItem]     = useState(null);
  const [adjAmt, setAdjAmt]       = useState('');
  const [adjDir, setAdjDir]       = useState('add');
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [formErr, setFormErr]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, brR] = await Promise.all([
        api.get('/inventory', { params: { limit:200, ...(filterBranch ? { branchId:filterBranch } : {}), ...(filterLow ? { lowStock:true } : {}) } }),
        api.get('/branches',  { params: { limit:100 } }),
      ]);
      setItems(Array.isArray(invR.data) ? invR.data : (invR.data?.data ?? []));
      setBranches(Array.isArray(brR.data) ? brR.data : (brR.data?.data ?? []));
    } catch { }
    setLoading(false);
  }, [filterBranch, filterLow]);
  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEditItem(null); setForm({ ...EMPTY, branch_id: user?.branch_id||'' }); setFormErr(''); setShowForm(true); };
  const openEdit = row => { setEditItem(row); setForm({ ...row }); setFormErr(''); setShowForm(true); };
  const openAdj  = row => { setAdjItem(row); setAdjAmt(''); setAdjDir('add'); setShowAdjust(true); };

  const handleSave = async () => {
    if (!form.name) return setFormErr('Name is required');
    setSaving(true);
    try {
      editItem ? await api.put(`/inventory/${editItem.id}`, form) : await api.post('/inventory', form);
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };
  const handleAdjust = async () => {
    if (!adjAmt || isNaN(Number(adjAmt)) || Number(adjAmt) <= 0) return;
    setSaving(true);
    try {
      await api.patch(`/inventory/${adjItem.id}/adjust`, { delta: adjDir==='add' ? Number(adjAmt) : -Number(adjAmt) });
      toast.success(`Stock ${adjDir==='add'?'added':'removed'} successfully`);
      setShowAdjust(false); load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Adjust failed');
    }
    setSaving(false);
  };
  const handleDelete = async id => { if (!window.confirm('Delete this item?')) return; await api.delete(`/inventory/${id}`); load(); };

  const lowCount = items.filter(i => i.quantity <= i.min_quantity).length;
  const allCats = [...new Set([...DEFAULT_CATS, ...items.map(i => i.category).filter(Boolean)])].sort();
  const displayed = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q);
  });

  const columns = [
    {
      id: 'name',
      header: 'Item',
      accessorFn: row => row.name,
      meta: { width: '22%' },
      cell: ({ row: { original: row } }) => {
        const isLow = row.quantity <= row.min_quantity;
        return (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>{row.name}</div>
              {isLow && <span style={{ background:'#FEF2F2', color:'#DC2626', borderRadius:4, padding:'1px 6px', fontSize:11, fontWeight:700 }}>LOW</span>}
            </div>
            {row.branch?.name && <div style={{ fontSize:12, color:'#98A2B3', marginTop:1 }}>{row.branch.name}</div>}
          </>
        );
      },
    },
    {
      id: 'category',
      header: 'Category',
      accessorFn: row => row.category,
      meta: { width: '14%' },
      cell: ({ row: { original: row } }) => (
        <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:CAT_BG[row.category]||'#F2F4F7', color:CAT_COLOR[row.category]||'#475467' }}>{row.category}</span>
      ),
    },
    {
      id: 'stock',
      header: 'Stock',
      accessorFn: row => row.quantity,
      meta: { width: '16%' },
      cell: ({ row: { original: row } }) => {
        const isLow = row.quantity <= row.min_quantity;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontWeight:700, color:isLow?'#DC2626':'#101828', fontSize:15 }}>{row.quantity}</span>
            <span style={{ fontSize:12, color:'#98A2B3' }}>{row.unit}</span>
            {canEdit && (
              <button onClick={() => openAdj(row)} style={{ background:'#EFF6FF', color:'#2563EB', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', display:'flex', alignItems:'center' }}>
                <AdjustIcon />
              </button>
            )}
          </div>
        );
      },
    },
    {
      id: 'min',
      header: 'Min',
      accessorFn: row => row.min_quantity,
      meta: { width: '10%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize:13, color:'#98A2B3' }}>{row.min_quantity} {row.unit}</span>,
    },
    {
      id: 'cost',
      header: 'Cost',
      accessorFn: row => row.cost_price,
      meta: { width: '12%', align: 'right' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize:13, color:'#475467' }}>Rs. {Number(row.cost_price||0).toLocaleString()}</span>,
    },
    {
      id: 'sell',
      header: 'Sell Price',
      accessorFn: row => row.sell_price,
      meta: { width: '14%', align: 'right' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight:600, color:'#2563EB' }}>Rs. {Number(row.sell_price||0).toLocaleString()}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { width: '12%', align: 'center' },
      cell: ({ row: { original: row } }) => canEdit ? (
        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
          <ActionBtn onClick={() => openEdit(row)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>
          <ActionBtn onClick={() => handleDelete(row.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>
        </div>
      ) : null,
    },
  ];

  return (
    <PageWrapper title="Inventory" subtitle="Track stock levels and manage supplies"
      actions={canEdit && <Button variant="primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}><IconPlus /> Add Item</Button>}>

      {/* Stat Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Total Items"    value={items.length}  color="#2563EB" icon={<IconBox />} />
        <StatCard label="Low Stock"      value={lowCount}      color="#DC2626" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
        <StatCard label="In Stock"       value={items.length - lowCount} color="#059669" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
      </div>

      {/* Filter Bar */}
      <FilterBar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search inventory" />
        {isSuperAdmin && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'#475467', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
          <input type="checkbox" checked={filterLow} onChange={e => setFilterLow(e.target.checked)} />
          Low stock only
        </label>
        {lowCount > 0 && (
          <span style={{ padding:'4px 10px', borderRadius:6, background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:600 }}>
            {lowCount} item{lowCount!==1?'s':''} low on stock
          </span>
        )}
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={displayed}
        loading={loading}
        emptyMessage="No inventory items found"
        emptySub="Try adjusting your filters or add a new item"
      />

      {/* Add / Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Edit Item' : 'Add Inventory Item'} size="md"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>{editItem ? 'Save' : 'Add Item'}</Button></>}>
        {formErr && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'9px 13px', borderRadius:9, marginBottom:16, fontSize:13, border:'1px solid #FEE2E2' }}>{formErr}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {isSuperAdmin && <FormGroup label="Branch"><Select value={form.branch_id||''} onChange={e => setForm(f=>({...f, branch_id:e.target.value}))}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</Select></FormGroup>}
          <FormGroup label="Item Name" required><Input value={form.name||''} onChange={e => setForm(f=>({...f, name:e.target.value}))} placeholder="e.g. Schwarzkopf Shampoo" /></FormGroup>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Category">
              <Input list="cat-list" value={form.category||''} onChange={e => setForm(f=>({...f, category:e.target.value}))} placeholder="Select or type new" />
              <datalist id="cat-list">{allCats.map(c=><option key={c} value={c} />)}</datalist>
            </FormGroup>
            <FormGroup label="Unit"><Input value={form.unit||'pcs'} onChange={e => setForm(f=>({...f, unit:e.target.value}))} placeholder="pcs, ml, kg" /></FormGroup>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Current Stock"><Input type="number" value={form.quantity||0} min="0" onChange={e => setForm(f=>({...f, quantity:Number(e.target.value)}))} /></FormGroup>
            <FormGroup label="Min Stock Alert"><Input type="number" value={form.min_quantity||5} min="0" onChange={e => setForm(f=>({...f, min_quantity:Number(e.target.value)}))} /></FormGroup>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Cost Price (Rs.)"><Input type="number" value={form.cost_price||''} onChange={e => setForm(f=>({...f, cost_price:e.target.value}))} /></FormGroup>
            <FormGroup label="Sell Price (Rs.)"><Input type="number" value={form.sell_price||''} onChange={e => setForm(f=>({...f, sell_price:e.target.value}))} /></FormGroup>
          </div>
        </div>
      </Modal>

      {/* Adjust Modal */}
      <Modal open={showAdjust} onClose={() => setShowAdjust(false)} title={`Adjust Stock  ${adjItem?.name}`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setShowAdjust(false)}>Cancel</Button>
          <Button variant={adjDir==='add'?'primary':'danger'} loading={saving} onClick={handleAdjust}>{adjDir==='add'?'+ Add Stock':' Remove Stock'}</Button></>}>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[{val:'add',label:'Add Stock'},{val:'remove',label:'Remove Stock'}].map(d => (
            <button key={d.val} onClick={() => setAdjDir(d.val)} style={{ flex:1, padding:'8px 0', borderRadius:8, border:'1.5px solid', borderColor:adjDir===d.val?(d.val==='add'?'#2563EB':'#DC2626'):'#E4E7EC', background:adjDir===d.val?(d.val==='add'?'#EFF6FF':'#FEF2F2'):'#fff', color:adjDir===d.val?(d.val==='add'?'#2563EB':'#DC2626'):'#475467', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>{d.label}</button>
          ))}
        </div>
        <FormGroup label="Quantity"><Input type="number" value={adjAmt} min="1" placeholder="Enter amount" onChange={e => setAdjAmt(e.target.value)} /></FormGroup>
        {adjItem && (
          <div style={{ marginTop:12, padding:'10px 14px', background:adjDir==='add'?'#EFF6FF':'#FEF2F2', borderRadius:8, fontSize:13, color:'#475467' }}>
            Current: <strong>{adjItem.quantity} {adjItem.unit}</strong>  New: <strong style={{ color:adjDir==='add'?'#2563EB':'#DC2626' }}>{adjDir==='add'?(adjItem.quantity+(Number(adjAmt)||0)):(adjItem.quantity-(Number(adjAmt)||0))} {adjItem.unit}</strong>
          </div>
        )}
      </Modal>
    </PageWrapper>
  );
}
