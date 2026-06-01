import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { DataTable } from '../components/ui/PageKit';

const STATUS_CFG = {
  draft:     { label: 'Draft',     bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF' },
  issued:    { label: 'Issued',    bg: '#EFF6FF', color: '#2563EB', dot: '#3B82F6' },
  paid:      { label: 'Paid',      bg: '#ECFDF5', color: '#047857', dot: '#10B981' },
  overdue:   { label: 'Overdue',   bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  cancelled: { label: 'Cancelled', bg: '#F9FAFB', color: '#9CA3AF', dot: '#D1D5DB' },
};

const fmt = (n, cur = 'LKR') => `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

const downloadPdf = async (url, filename) => {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to download PDF.');
  }
};

const IconReceipt = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
);
const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IconMail = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
);

export default function BillingInvoicesPage() {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailing, setEmailing] = useState(null);

  useEffect(() => {
    if (searchParams.get('new')) toast.success('Invoice created from your bank-slip upload.');
    api.get('/billing/invoices')
      .then((res) => setInvoices(res.data?.invoices || []))
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load invoices.'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEmail = useCallback(async (inv) => {
    setEmailing(inv.id);
    try {
      await api.post(`/billing/invoices/${inv.id}/email`);
      toast.success('Invoice emailed successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to email invoice.');
    } finally {
      setEmailing(null);
    }
  }, []);

  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalDue  = invoices.filter(i => ['issued', 'overdue'].includes(i.status)).reduce((s, i) => s + Number(i.amount || 0), 0);
  const currency  = invoices[0]?.currency || 'LKR';

  const columns = useMemo(() => [
    {
      id: 'invoice_number',
      header: 'Invoice #',
      accessorKey: 'invoice_number',
      cell: ({ row: { original: inv } }) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{inv.invoice_number}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>ID #{inv.id}</div>
        </div>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      accessorFn: row => row.amount,
      meta: { align: 'right' },
      cell: ({ row: { original: inv } }) => (
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{fmt(inv.amount, inv.currency || 'LKR')}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: ({ getValue }) => {
        const cfg = STATUS_CFG[getValue()] || STATUS_CFG.draft;
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: cfg.bg, color: cfg.color,
            borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {cfg.label}
          </span>
        );
      },
    },
    {
      id: 'issued_at',
      header: 'Issued',
      accessorFn: row => row.issued_at || '',
      cell: ({ getValue }) => <span style={{ fontSize: 12, color: '#6B7280' }}>{fmtDate(getValue())}</span>,
    },
    {
      id: 'document',
      header: 'Document',
      enableSorting: false,
      cell: ({ row: { original: inv } }) => inv.pdf_url ? (
        <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563EB', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
          <IconFile /> View
        </a>
      ) : <span style={{ fontSize: 12, color: '#D1D5DB' }}>—</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { width: '200px' },
      cell: ({ row: { original: inv } }) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => downloadPdf(`/billing/invoices/${inv.id}/pdf`, `invoice-${inv.invoice_number || inv.id}.pdf`)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8',
              borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
            <IconDownload /> PDF
          </button>
          <button
            type="button"
            onClick={() => handleEmail(inv)}
            disabled={emailing === inv.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              border: '1px solid #A7F3D0', background: '#ECFDF5', color: '#047857',
              borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600,
              cursor: emailing === inv.id ? 'not-allowed' : 'pointer',
              opacity: emailing === inv.id ? 0.6 : 1,
            }}>
            <IconMail /> {emailing === inv.id ? '…' : 'Email'}
          </button>
        </div>
      ),
    },
  ], [emailing, handleEmail]);

  return (
    <PageWrapper
      title="Billing & Invoices"
      subtitle="Manage your subscription invoices and payment history"
      actions={(
        <Link to="/billing/payment?plan=basic"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563EB', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          + New Payment
        </Link>
      )}
    >

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Invoices', value: invoices.length,           sub: 'All time',         color: '#2563EB' },
          { label: 'Total Paid',     value: fmt(totalPaid, currency),   sub: 'Paid invoices',    color: '#047857' },
          { label: 'Outstanding',    value: fmt(totalDue,  currency),   sub: 'Issued / Overdue', color: '#B45309' },
        ].map((c) => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color, lineHeight: 1.1 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={invoices}
        loading={loading}
        emptyMessage="No invoices yet"
        emptySub="Invoices will appear here after payments are processed."
        searchableColumns={[{ id: 'invoice_number', title: 'Invoice #' }]}
        filterableColumns={[{
          id: 'status',
          title: 'Status',
          options: Object.entries(STATUS_CFG).map(([value, cfg]) => ({ label: cfg.label, value })),
        }]}
      />
    </PageWrapper>
  );
}
