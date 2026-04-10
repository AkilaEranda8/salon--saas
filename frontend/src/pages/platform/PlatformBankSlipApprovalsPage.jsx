import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const BankSlipApprovalsPage = () => {
  const [bankSlips, setBankSlips] = useState([]);
  const [filteredSlips, setFilteredSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    fetchBankSlips();
  }, [filterStatus]);

  const fetchBankSlips = async () => {
    try {
      setLoading(true);
      const res = await api.get('/billing/bank-slip/list', {
        params: { status: filterStatus !== 'all' ? filterStatus : undefined },
      });
      setBankSlips(res.data.bankSlips || []);
      setFilteredSlips(res.data.bankSlips || []);
    } catch (err) {
      console.error('Failed to fetch bank slips:', err);
      toast.error('Failed to load bank slips');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (slip) => {
    if (!window.confirm(`Approve bank slip for ${slip.tenant.name}?`)) return;

    setApproving(true);
    try {
      const res = await api.patch(`/billing/bank-slip/${slip.id}/approve`);
      toast.success(res.data.message);
      setSelectedSlip(null);
      fetchBankSlips();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (slip) => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setRejecting(true);
    try {
      const res = await api.patch(`/billing/bank-slip/${slip.id}/reject`, {
        rejection_reason: rejectReason,
      });
      toast.success(res.data.message);
      setSelectedSlip(null);
      setRejectReason('');
      fetchBankSlips();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject');
    } finally {
      setRejecting(false);
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      pending: { bg: '#FEF3C7', color: '#92400E' },
      approved: { bg: '#D1FAE5', color: '#065F46' },
      rejected: { bg: '#FEE2E2', color: '#991B1B' },
    };
    const style = colors[status] || colors.pending;
    return (
      <div style={{
        display: 'inline-block',
        padding: '4px 8px',
        background: style.bg,
        color: style.color,
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
      }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#1F2937' }}>Bank Slip Approvals</h1>

      {/* Filters */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
        {['all', 'pending', 'approved', 'rejected'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            style={{
              padding: '8px 14px',
              background: filterStatus === status ? '#2563EB' : '#E5E7EB',
              color: filterStatus === status ? '#fff' : '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: '#6B7280' }}>Loading...</div>
      ) : filteredSlips.length === 0 ? (
        <div style={{ color: '#6B7280', textAlign: 'center', padding: '40px' }}>
          No {filterStatus === 'all' ? 'bank slips' : `${filterStatus} bank slips`} found.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  Salon
                </th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  Amount
                </th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  Bank
                </th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  Plan
                </th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  Document
                </th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  Date
                </th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  Status
                </th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSlips.map((slip) => (
                <tr key={slip.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                  <td style={{ padding: '12px', fontSize: 13, color: '#1F2937' }}>
                    <div style={{ fontWeight: 600 }}>{slip.tenant.name}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>{slip.tenant.email}</div>
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#1F2937', fontWeight: 600 }}>
                    LKR {parseFloat(slip.amount).toFixed(2)}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#6B7280' }}>
                    {slip.bank_name || '-'}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13 }}>
                    {slip.requested_plan ? (
                      <span style={{
                        background: slip.requested_plan === 'pro' ? '#F3E8FF' : slip.requested_plan === 'enterprise' ? '#ECFDF5' : '#EFF6FF',
                        color: slip.requested_plan === 'pro' ? '#7C3AED' : slip.requested_plan === 'enterprise' ? '#059669' : '#2563EB',
                        padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                      }}>{slip.requested_plan}</span>
                    ) : <span style={{ color: '#9CA3AF' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13 }}>
                    {slip.file_url ? (
                      <a href={slip.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'underline' }}>
                        View
                      </a>
                    ) : <span style={{ color: '#9CA3AF' }}>-</span>}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#6B7280' }}>
                    {new Date(slip.transaction_date).toLocaleDateString('en-US')}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {getStatusBadge(slip.status)}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {slip.status === 'pending' ? (
                      <button
                        onClick={() => setSelectedSlip(slip)}
                        style={{
                          padding: '6px 10px',
                          background: '#2563EB',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Review
                      </button>
                    ) : (
                      <div style={{ fontSize: 12, color: '#6B7280' }}>
                        {slip.approval_date && `Approved ${new Date(slip.approval_date).toLocaleDateString()}`}
                        {slip.rejection_reason && `Rejected`}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review Modal */}
      {selectedSlip && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            maxWidth: 500,
            width: '90%',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#1F2937' }}>
              Review Bank Slip
            </h2>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Salon</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2937' }}>{selectedSlip.tenant.name}</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Amount</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2937' }}>
                LKR {parseFloat(selectedSlip.amount).toFixed(2)}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Bank</div>
              <div style={{ fontSize: 14, color: '#1F2937' }}>{selectedSlip.bank_name || '-'}</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>File</div>
              <a href={selectedSlip.file_url} target="_blank" rel="noopener noreferrer"
                style={{ color: '#2563EB', textDecoration: 'underline', fontSize: 13 }}>
                View {selectedSlip.file_name}
              </a>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Notes</div>
              <div style={{ fontSize: 13, color: '#1F2937' }}>
                {selectedSlip.notes || 'No notes provided'}
              </div>
            </div>

            {/* Rejection Reason Input */}
            {rejecting && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#374151' }}>
                  Rejection Reason *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why are you rejecting this slip?"
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #E5E7EB',
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setSelectedSlip(null);
                  setRejectReason('');
                }}
                style={{
                  padding: '8px 14px',
                  background: '#E5E7EB',
                  color: '#1F2937',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {rejecting ? 'Cancel' : 'Close'}
              </button>

              {!rejecting && (
                <>
                  <button
                    onClick={() => setRejecting(true)}
                    style={{
                      padding: '8px 14px',
                      background: '#EF4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Reject
                  </button>

                  <button
                    onClick={() => handleApprove(selectedSlip)}
                    disabled={approving}
                    style={{
                      padding: '8px 14px',
                      background: approving ? '#9CA3AF' : '#10B981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: approving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {approving ? 'Approving...' : 'Approve & Enable'}
                  </button>
                </>
              )}

              {rejecting && (
                <button
                  onClick={() => handleReject(selectedSlip)}
                  disabled={rejecting}
                  style={{
                    padding: '8px 14px',
                    background: rejecting ? '#9CA3AF' : '#EF4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: rejecting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankSlipApprovalsPage;
