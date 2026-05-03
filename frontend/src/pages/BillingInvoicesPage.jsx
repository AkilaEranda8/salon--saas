import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

const STATUS_COLORS = {
  draft: '#6B7280',
  issued: '#2563EB',
  paid: '#10B981',
  overdue: '#F59E0B',
  cancelled: '#9CA3AF',
};

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

export default function BillingInvoicesPage() {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const justCreated = searchParams.get('new');
    if (justCreated) {
      toast.success('Invoice created from your bank-slip upload.');
    }

    api.get('/billing/invoices')
      .then((res) => setInvoices(res.data?.invoices || []))
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load invoices.'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageWrapper
      title="Billing Invoices"
      subtitle="Invoices created for your billing and bank transfer uploads"
    >
      <div style={{ maxWidth: 980, margin: '0 auto', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#6B7280' }}>
            {loading ? 'Loading invoices...' : `${invoices.length} invoice(s)`}
          </div>
          <Link to="/billing/payment?plan=basic" style={{ color: '#2563EB', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            + New Payment
          </Link>
        </div>

        {loading ? (
          <div style={{ color: '#6B7280', padding: '14px 0' }}>Loading...</div>
        ) : invoices.length === 0 ? (
          <div style={{ color: '#6B7280', textAlign: 'center', padding: '20px 0' }}>No invoices yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, color: '#6B7280' }}>Invoice #</th>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, color: '#6B7280' }}>Amount</th>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, color: '#6B7280' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, color: '#6B7280' }}>Issued</th>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, color: '#6B7280' }}>Document</th>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, color: '#6B7280' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '12px 0', fontSize: 13, color: '#1F2937', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: '12px 0', fontSize: 13, color: '#1F2937' }}>{inv.currency || 'LKR'} {Number(inv.amount || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px 0', fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: STATUS_COLORS[inv.status] || '#374151' }}>{inv.status}</td>
                    <td style={{ padding: '12px 0', fontSize: 13, color: '#6B7280' }}>{inv.issued_at ? new Date(inv.issued_at).toLocaleString('en-US') : '-'}</td>
                    <td style={{ padding: '12px 0', fontSize: 13 }}>
                      {inv.pdf_url ? (
                        <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'underline' }}>
                          View Upload
                        </a>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 0', fontSize: 13 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => downloadPdf(`/billing/invoices/${inv.id}/pdf`, `invoice-${inv.invoice_number || inv.id}.pdf`)}
                          style={{
                            border: '1px solid #BFDBFE',
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                            borderRadius: 7,
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Download PDF
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await api.post(`/billing/invoices/${inv.id}/email`);
                              toast.success('Invoice emailed successfully.');
                            } catch (err) {
                              toast.error(err.response?.data?.message || 'Failed to email invoice.');
                            }
                          }}
                          style={{
                            border: '1px solid #A7F3D0',
                            background: '#ECFDF5',
                            color: '#047857',
                            borderRadius: 7,
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Email
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
