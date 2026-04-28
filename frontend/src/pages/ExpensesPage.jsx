import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import {
  IconEdit, IconTrash, IconPlus, IconDollar, IconCalendar,
  ActionBtn, StatCard, PKModal as Modal,
  FilterBar, SearchBar, DataTable,
} from '../components/ui/PageKit';

const CATS    = ['Rent','Utilities','Supplies','Salary','Marketing','Maintenance','Other'];
const METHODS = ['cash','bank_transfer','cheque','card'];
const CAT_COLOR = { Rent:'#2563EB', Utilities:'#7C3AED', Supplies:'#D97706', Salary:'#059669', Marketing:'#EA580C', Maintenance:'#0284C7', Other:'#64748B' };
const CAT_BG    = { Rent:'#EFF6FF', Utilities:'#F5F3FF', Supplies:'#FFFBEB', Salary:'#ECFDF5', Marketing:'#FFF7ED', Maintenance:'#F0F9FF', Other:'#F8FAFC' };
const EMPTY = { branch_id:'', category:'Supplies', title:'', amount:'', date: new Date().toISOString().slice(0,10), paid_to:'', payment_method:'cash', receipt_number:'', notes:'' };

export default function ExpensesPage() {
  const { user }     = useAuth();
  const canEdit      = ['superadmin','admin','manager'].includes(user?.role);
  const canAdd       = user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';
  const today    = new Date().toISOString().slice(0,10);
  const curMonth = today.slice(0,7);
  const [items, setItems]       = useState([]);
  const [branches, setBranches] = useState([]);
  const [pl, setPl]             = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filterBranch, setFilterBranch] = useState(isSuperAdmin ? '' : user?.branch_id || '');
  const [filterMonth, setFilterMonth]   = useState(curMonth);
  const [search, setSearch]     = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [from, to] = filterMonth ? [`${filterMonth}-01`, `${filterMonth}-31`] : ['', ''];
      const params = { limit:200, ...(filterBranch ? { branchId:filterBranch } : {}), ...(from ? { from, to } : {}) };
      const [expR, brR, plR] = await Promise.all([
        api.get('/expenses', { params }),
        api.get('/branches', { params:{ limit:100 } }),
        api.get('/expenses/profit-loss', { params:{ ...(filterBranch ? { branchId:filterBranch } : {}), ...(from ? { from, to } : {}) } }),
      ]);
      setItems(Array.isArray(expR.data) ? expR.data : (expR.data?.data ?? []));
      setBranches(Array.isArray(brR.data) ? brR.data : (brR.data?.data ?? []));
      setPl(plR.data);
    } catch { }
    setLoading(false);
  }, [filterBranch, filterMonth]);
  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEditItem(null); setForm({ ...EMPTY, branch_id: user?.branch_id||'', date: today }); setFormErr(''); setShowForm(true); };
  const openEdit = row => { setEditItem(row); setForm({ ...row, date: row.date?.slice(0,10)||today }); setFormErr(''); setShowForm(true); };

  const handleSave = async () => {
    if (!form.title || !form.amount) return setFormErr('Title and amount are required');
    setSaving(true);
    try {
      editItem ? await api.put(`/expenses/${editItem.id}`, form) : await api.post('/expenses', form);
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };
  const handleDelete = async id => { if (!window.confirm('Delete this expense?')) return; await api.delete(`/expenses/${id}`); load(); };

  const catTotals = CATS.reduce((acc, c) => { acc[c] = items.filter(i=>i.category===c).reduce((s,i)=>s+Number(i.amount||0),0); return acc; }, {});
  const totalExp  = items.reduce((s, i) => s+Number(i.amount||0), 0);

  const displayed = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.title?.toLowerCase().includes(q) || i.paid_to?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q);
  });

  const columns = [
    {
      id: 'date',
      header: 'Date',
      accessorFn: row => row.date,
      meta: { width: '13%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize:13, color:'#475467' }}>{row.date ? new Date(row.date).toLocaleDateString() : ''}</span>,
    },
    {
      id: 'title',
      header: 'Expense',
      accessorFn: row => row.title,
      meta: { width: '22%' },
      cell: ({ row: { original: row } }) => (
        <>
          <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>{row.title}</div>
          {row.paid_to && <div style={{ fontSize:12, color:'#98A2B3', marginTop:1 }}>To: {row.paid_to}</div>}
        </>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      accessorFn: row => row.category,
      meta: { width: '13%' },
      cell: ({ row: { original: row } }) => (
        <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:CAT_BG[row.category]||'#F2F4F7', color:CAT_COLOR[row.category]||'#475467' }}>{row.category}</span>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      accessorFn: row => row.amount,
      meta: { width: '14%', align: 'right' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight:700, color:'#DC2626' }}>Rs. {Number(row.amount||0).toLocaleString()}</span>,
    },
    {
      id: 'payment',
      header: 'Payment',
      accessorFn: row => row.payment_method,
      meta: { width: '12%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize:12, color:'#475467', textTransform:'capitalize' }}>{String(row.payment_method||'').replace('_',' ')}</span>,
    },
    {
      id: 'receipt',
      header: 'Receipt #',
      accessorFn: row => row.receipt_number,
      meta: { width: '16%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize:12, color:'#98A2B3' }}>{row.receipt_number||''}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { width: '10%', align: 'center' },
      cell: ({ row: { original: row } }) => canEdit ? (
        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
          <ActionBtn onClick={() => openEdit(row)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>
          <ActionBtn onClick={() => handleDelete(row.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>
        </div>
      ) : null,
    },
  ];

  return (
    <PageWrapper title="Expenses" subtitle="Track and manage business expenses"
      actions={canAdd && <Button variant="primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}><IconPlus /> Add Expense</Button>}>

      {/* Stat Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Total Expenses" value={`Rs. ${totalExp.toLocaleString()}`} color="#DC2626" icon={<IconDollar />} />
        {pl && <>
          <StatCard label="Revenue"   value={`Rs. ${Number(pl.revenue||0).toLocaleString()}`}   color="#059669" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} />
          <StatCard label="Net Profit" value={`Rs. ${Number(pl.netProfit||0).toLocaleString()}`} color={(pl.netProfit||0)>=0?"#2563EB":"#DC2626"} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} />
        </>}
      </div>

      {/* Filter Bar */}
      <FilterBar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search expenses" />
        <span style={{ color:'#98A2B3', display:'flex' }}><IconCalendar /></span>
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          style={{ padding:'7px 10px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054' }}
          onFocus={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor='#E4E7EC'} />
        {isSuperAdmin && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>

      {/* P&L Panels */}
      {pl && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:20, border:'1px solid #EAECF0', boxShadow:'0 1px 4px rgba(16,24,40,0.04)' }}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:700, color:'#475467', fontFamily:"'Inter',sans-serif" }}>Profit & Loss</h4>
            {[
              { label:'Revenue',    value: pl.revenue||0,    color:'#059669', bg:'#ECFDF5' },
              { label:'Expenses',   value: pl.expenses||0,   color:'#DC2626', bg:'#FEF2F2' },
              { label:'Commission', value: pl.commission||0, color:'#D97706', bg:'#FFFBEB' },
              { label:'Net Profit', value: pl.netProfit||0,  color:(pl.netProfit||0)>=0?'#2563EB':'#DC2626', bg:(pl.netProfit||0)>=0?'#EFF6FF':'#FEF2F2' },
            ].map(row => (
              <div key={row.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                  <span style={{ fontSize:13, color:'#475467', minWidth:90 }}>{row.label}</span>
                  <div style={{ flex:1, height:6, background:'#F1F5F9', borderRadius:6, overflow:'hidden' }}>
                    <div style={{ width:`${Math.min(100, Math.abs(row.value)/Math.max(pl.revenue||1,1)*100)}%`, height:'100%', background:row.color, borderRadius:6, transition:'width 0.4s' }} />
                  </div>
                </div>
                <span style={{ fontWeight:700, color:row.color, marginLeft:14 }}>Rs. {Math.abs(Number(row.value)).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div style={{ background:'#fff', borderRadius:14, padding:20, border:'1px solid #EAECF0', boxShadow:'0 1px 4px rgba(16,24,40,0.04)' }}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:700, color:'#475467', fontFamily:"'Inter',sans-serif" }}>By Category</h4>
            {CATS.filter(c => catTotals[c]>0).map(c => (
              <div key={c} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:CAT_BG[c], color:CAT_COLOR[c], minWidth:80, textAlign:'center' }}>{c}</span>
                <div style={{ flex:1, height:6, background:'#F1F5F9', borderRadius:6, overflow:'hidden' }}>
                  <div style={{ width:`${totalExp>0?(catTotals[c]/totalExp)*100:0}%`, height:'100%', background:CAT_COLOR[c], borderRadius:6, transition:'width 0.4s' }} />
                </div>
                <span style={{ fontWeight:600, fontSize:13, color:'#101828', minWidth:80, textAlign:'right' }}>Rs. {Number(catTotals[c]).toLocaleString()}</span>
              </div>
            ))}
            {totalExp===0 && <p style={{ color:'#98A2B3', fontSize:13, margin:0 }}>No expenses this period</p>}
          </div>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={displayed}
        loading={loading}
        emptyMessage="No expenses recorded"
        emptySub="Try adjusting your filters or add a new expense"
      />

      {/* Add / Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Edit Expense' : 'Add Expense'} size="md"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>{editItem ? 'Save' : 'Add Expense'}</Button></>}>
        {formErr && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'9px 13px', borderRadius:9, marginBottom:16, fontSize:13, border:'1px solid #FEE2E2' }}>{formErr}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {isSuperAdmin && <FormGroup label="Branch"><Select value={form.branch_id||''} onChange={e => setForm(f=>({...f, branch_id:e.target.value}))}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</Select></FormGroup>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Category"><Select value={form.category} onChange={e => setForm(f=>({...f, category:e.target.value}))}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</Select></FormGroup>
            <FormGroup label="Date"><Input type="date" value={form.date||''} onChange={e => setForm(f=>({...f, date:e.target.value}))} /></FormGroup>
          </div>
          <FormGroup label="Title" required><Input value={form.title||''} onChange={e => setForm(f=>({...f, title:e.target.value}))} placeholder="e.g. Monthly Rent" /></FormGroup>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Amount (Rs.)" required><Input type="number" value={form.amount||''} onChange={e => setForm(f=>({...f, amount:e.target.value}))} /></FormGroup>
            <FormGroup label="Payment Method"><Select value={form.payment_method||'cash'} onChange={e => setForm(f=>({...f, payment_method:e.target.value}))}>{METHODS.map(m=><option key={m} value={m}>{m.replace('_',' ')}</option>)}</Select></FormGroup>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Paid To"><Input value={form.paid_to||''} onChange={e => setForm(f=>({...f, paid_to:e.target.value}))} placeholder="Vendor or person" /></FormGroup>
            <FormGroup label="Receipt #"><Input value={form.receipt_number||''} onChange={e => setForm(f=>({...f, receipt_number:e.target.value}))} /></FormGroup>
          </div>
          <FormGroup label="Notes"><Input value={form.notes||''} onChange={e => setForm(f=>({...f, notes:e.target.value}))} /></FormGroup>
        </div>
      </Modal>
    </PageWrapper>
  );
}
