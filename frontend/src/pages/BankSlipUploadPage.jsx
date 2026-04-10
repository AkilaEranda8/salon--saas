import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

const BankSlipUploadPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planParam = searchParams.get('plan');

  const PLAN_PRICES = { basic: '2900', pro: '7900', enterprise: '' };
  const PLAN_LABELS = { basic: 'Basic – LKR 2,900/mo', pro: 'Pro – LKR 7,900/mo', enterprise: 'Enterprise – Custom Pricing' };

  const [file, setFile] = useState(null);
  const [amount, setAmount] = useState(planParam ? (PLAN_PRICES[planParam] || '') : '');
  const [bankName, setBankName] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [bankSlips, setBankSlips] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch bank slip status on mount
  useEffect(() => {
    fetchBankSlipStatus();
  }, []);

  const fetchBankSlipStatus = async () => {
    try {
      const res = await api.get('/billing/bank-slip/status');
      setBankSlips(res.data.bankSlips || []);
    } catch (err) {
      console.error('Failed to fetch bank slip status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (selectedFile.size > maxSize) {
        toast.error('File size exceeds 5MB limit');
        return;
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(selectedFile.type)) {
        toast.error('Only JPEG, PNG, and PDF files are allowed');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !amount || !transactionDate) {
      toast.error('Please fill in all required fields and select a file');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('amount', amount);
      formData.append('bank_name', bankName);
      formData.append('transaction_date', transactionDate);
      formData.append('notes', notes);
      if (planParam) formData.append('plan', planParam);

      const res = await api.post('/billing/bank-slip/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success(res.data.message);
      setFile(null);
      setAmount('');
      setBankName('');
      setTransactionDate('');
      setNotes('');
      document.getElementById('fileInput').value = '';
      fetchBankSlipStatus();
      const invoiceId = res.data?.invoice?.id;
      navigate(invoiceId ? `/billing/invoices?new=${invoiceId}` : '/billing/invoices');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return '#10B981';
      case 'rejected': return '#EF4444';
      default: return '#F59E0B';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending Approval';
      case 'approved': return 'Approved ✓';
      case 'rejected': return 'Rejected ✗';
      default: return status;
    }
  };

  return (
    <PageWrapper title="Bank Slip Upload">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Plan info banner */}
        {planParam && PLAN_LABELS[planParam] && (
          <div style={{
            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
            border: '1.5px solid #BFDBFE',
            borderRadius: 12, padding: '14px 20px',
            marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ fontSize: 22 }}>💳</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1E40AF' }}>
                Upgrading to {PLAN_LABELS[planParam]}
              </div>
              <div style={{ fontSize: 12.5, color: '#3B82F6', marginTop: 2 }}>
                Upload your bank transfer slip below. Your subscription will be activated after admin approval.
              </div>
            </div>
          </div>
        )}
        {/* Upload Section */}
        <div style={{ 
          background: '#fff', 
          borderRadius: 12, 
          padding: 24, 
          marginBottom: 24,
          border: '1px solid #E5E7EB'
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, color: '#1F2937' }}>
            Upload Bank Slip Payment Proof
          </h2>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* File Upload */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                Bank Slip Document (JPEG, PNG, or PDF) *
              </label>
              <input
                id="fileInput"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={handleFileChange}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  fontSize: 13,
                }}
              />
              {file && (
                <div style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>
                  Selected: {file.name}
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                Amount (LKR) *
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 2900.00"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Bank Name */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                Bank Name
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Bank of Ceylon"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Transaction Date */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                Transaction Date *
              </label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                Additional Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional information..."
                rows="3"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={uploading}
              style={{
                padding: '10px 16px',
                background: uploading ? '#CCC' : '#2563EB',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {uploading ? 'Uploading...' : 'Upload Bank Slip'}
            </button>
          </form>
        </div>

        {/* Status Section */}
        <div style={{ 
          background: '#fff', 
          borderRadius: 12, 
          padding: 24,
          border: '1px solid #E5E7EB'
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#1F2937' }}>
            Upload History
          </h2>

          {loading ? (
            <div style={{ color: '#6B7280' }}>Loading...</div>
          ) : bankSlips.length === 0 ? (
            <div style={{ color: '#6B7280', textAlign: 'center', padding: '20px' }}>
              No bank slips uploaded yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                      Amount
                    </th>
                    <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                      Bank
                    </th>
                    <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                      Date
                    </th>
                    <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                      Status
                    </th>
                    <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                      Uploaded
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bankSlips.map((slip) => (
                    <tr key={slip.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '12px 0', fontSize: 13, color: '#1F2937' }}>
                        LKR {parseFloat(slip.amount).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 0', fontSize: 13, color: '#6B7280' }}>
                        {slip.bank_name || '-'}
                      </td>
                      <td style={{ padding: '12px 0', fontSize: 13, color: '#6B7280' }}>
                        {new Date(slip.transaction_date).toLocaleDateString('en-US')}
                      </td>
                      <td style={{ padding: '12px 0' }}>
                        <div style={{
                          display: 'inline-flex',
                          padding: '4px 8px',
                          background: getStatusColor(slip.status),
                          color: '#fff',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                        }}>
                          {getStatusText(slip.status)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 0', fontSize: 12, color: '#9CA3AF' }}>
                        {new Date(slip.createdAt).toLocaleDateString('en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};

export default BankSlipUploadPage;
