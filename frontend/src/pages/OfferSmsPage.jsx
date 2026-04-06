import { useCallback, useEffect, useMemo, useState } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';

export default function OfferSmsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === 'superadmin';

  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(isSuperAdmin ? '' : String(user?.branch_id || ''));
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [message, setMessage] = useState('');

  const isUnicode  = /[^\u0000-\u007F]/.test(message);
  const maxLen     = isUnicode ? 335 : 480;
  // Code-point length: emojis = 1, Sinhala = 1, ASCII = 1 (for display)
  const cpLen      = [...message].length;
  // UCS-2 length: emojis outside BMP cost 2, used for SMS part calculation
  const ucs2Len    = message.length;
  const charsLeft  = maxLen - cpLen;
  const smsParts   = isUnicode
    ? Math.ceil(ucs2Len / 70)  || 1
    : Math.ceil(ucs2Len / 160) || 1;
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const [cuR, brR] = await Promise.all([
        api.get('/customers', { params: { limit: 500, ...(branchId ? { branchId } : {}) } }),
        api.get('/branches', { params: { limit: 100 } }),
      ]);
      const list = Array.isArray(cuR.data) ? cuR.data : (cuR.data?.data || []);
      const branchList = Array.isArray(brR.data) ? brR.data : (brR.data?.data || []);
      setCustomers(list);
      setBranches(branchList);
      setSelectedIds([]);
    } catch {
      toast('Failed to load customers.', 'error');
    } finally {
      setLoading(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const visibleCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.phone || '').toLowerCase().includes(q) ||
      String(c.email || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  const visibleIds = visibleCustomers.map((c) => c.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const toggleOne = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) return prev.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const handleChangeMessage = (e) => {
    const val = e.target.value;
    const isUni = /[^\u0000-\u007F]/.test(val);
    const limit = isUni ? 335 : 480;
    if ([...val].length <= limit) setMessage(val);
  };

  const handleSend = async () => {
    const cleanMsg = message.trim();
    if (!selectedIds.length) return toast('Select at least one customer.', 'error');
    if (!cleanMsg) return toast('Type an offer SMS message.', 'error');
    setSending(true);
    try {
      const res = await api.post('/notifications/offer-sms', {
        customerIds: selectedIds,
        message: cleanMsg,
      });
      toast(res.data?.message || 'Offer SMS sent.', 'success');
      setMessage('');
    } catch (err) {
      toast(err?.response?.data?.message || 'Failed to send offer SMS.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <PageWrapper
      title="Offer SMS"
      subtitle="Select customers and send promotional SMS messages"
      actions={
        <Button onClick={handleSend} disabled={sending || loading}>
          {sending ? 'Sending...' : `Send SMS (${selectedIds.length})`}
        </Button>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid #F2F4F7', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name / phone"
              style={{ flex: 1, minWidth: 180, padding: '8px 10px', borderRadius: 8, border: '1px solid #E4E7EC', fontSize: 13 }}
            />
            {isSuperAdmin && (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                style={{ minWidth: 180, padding: '8px 10px', borderRadius: 8, border: '1px solid #E4E7EC', fontSize: 13 }}
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <Button variant="ghost" onClick={toggleAllVisible} disabled={!visibleIds.length}>
              {allVisibleSelected ? 'Unselect Visible' : 'Select Visible'}
            </Button>
          </div>

          <div style={{ maxHeight: 480, overflow: 'auto' }}>
            {loading ? (
              <div style={{ padding: 18, fontSize: 13, color: '#667085' }}>Loading customers...</div>
            ) : visibleCustomers.length === 0 ? (
              <div style={{ padding: 18, fontSize: 13, color: '#667085' }}>No customers found.</div>
            ) : (
              visibleCustomers.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderBottom: '1px solid #F8FAFC',
                    cursor: 'pointer',
                    background: selectedIds.includes(c.id) ? '#F5F8FF' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggleOne(c.id)}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#667085' }}>{c.phone || 'No phone number'}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>Message</div>
            {isUnicode && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A',
              }}>🇱🇰 සිංහල / Unicode</span>
            )}
          </div>
          <textarea
            value={message}
            onChange={handleChangeMessage}
            placeholder="Type your offer message here... (supports Sinhala / සිංහල / emojis 😊)"
            rows={12}
            style={{
              width: '100%',
              borderRadius: 10,
              border: `1px solid ${charsLeft < 20 ? '#FCA5A5' : '#E4E7EC'}`,
              padding: 12,
              fontSize: 13,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          {isUnicode && (
            <div style={{
              marginTop: 6, padding: '8px 10px', borderRadius: 8,
              background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 12, color: '#92400E',
            }}>
              ⚠️ Unicode SMS: 70 chars per part · Max 335 chars · Emojis count as 2 chars in SMS
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12, color: '#667085' }}>
            <span>Selected: <strong>{selectedIds.length}</strong> customers</span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: charsLeft < 20 ? '#DC2626' : '#667085' }}>
                {cpLen}/{maxLen}
              </span>
              <span style={{
                padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: '#EFF6FF', color: '#2563EB',
              }}>{smsParts} SMS part{smsParts > 1 ? 's' : ''}</span>
            </span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Button onClick={handleSend} disabled={sending || loading}>
              {sending ? 'Sending...' : 'Send Offer SMS'}
            </Button>
            <Button variant="ghost" onClick={() => setMessage('')}>
              Clear Message
            </Button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
