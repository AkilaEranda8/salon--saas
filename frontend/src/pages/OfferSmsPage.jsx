import { useCallback, useEffect, useMemo, useState } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { LOYALTY_TIERS, getTier, loyaltyTierCounts } from '../utils/loyaltyTiers';

export default function OfferSmsPage({ kind = 'offer' }) {
  const isOffice = kind === 'office';
  const eventType = isOffice ? 'office_sms' : 'offer_sms';
  const apiPath = isOffice ? '/notifications/office-sms' : '/notifications/offer-sms';
  const pageTitle = isOffice ? 'Office SMS' : 'Offer SMS';
  const pageSubtitle = isOffice
    ? 'Send office / operational SMS to selected customers'
    : 'Group by loyalty tier or −50 pts and send promotional SMS';
  const sendButtonLabel = isOffice ? 'Send Office SMS' : 'Send Offer SMS';
  const messagePlaceholder = isOffice
    ? 'Type your office message here... (supports Sinhala / සිංහල / emojis 😊)'
    : 'Type your offer message here... (supports Sinhala / සිංහල / emojis 😊)';

  const REDUCED_50 = 'Reduced50';

  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === 'superadmin';

  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(isSuperAdmin ? '' : String(user?.branch_id || ''));
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('All'); // All | Bronze | Silver | Gold | Platinum | Reduced50
  const [reduced50Ids, setReduced50Ids] = useState(() => new Set());
  const [reduced50Count, setReduced50Count] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [message, setMessage] = useState('');

  const isUnicode  = /[^\u0000-\u007F]/.test(message);
  const maxLen     = isUnicode ? 335 : 480;
  const cpLen      = [...message].length;
  const ucs2Len    = message.length;
  const charsLeft  = maxLen - cpLen;
  const smsParts   = isUnicode
    ? Math.ceil(ucs2Len / 70)  || 1
    : Math.ceil(ucs2Len / 160) || 1;
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastBatch, setLastBatch] = useState(null);
  const [reportRows, setReportRows] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportStatus, setReportStatus] = useState('');

  const loadDeliveryReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const { data } = await api.get('/notifications/log', {
        params: {
          event_type: eventType,
          channel: 'sms',
          limit: 100,
          ...(reportStatus ? { status: reportStatus } : {}),
        },
      });
      setReportRows(Array.isArray(data?.data) ? data.data : []);
    } catch {
      toast('Failed to load delivery report.', 'error');
    } finally {
      setReportLoading(false);
    }
  }, [eventType, reportStatus, toast]);

  useEffect(() => {
    loadDeliveryReport();
  }, [loadDeliveryReport]);

  const loadReduced50 = useCallback(async () => {
    try {
      const { data } = await api.get('/loyalty/marked', { params: { mark: 'reduced_50' } });
      const rows = Array.isArray(data?.data) ? data.data : [];
      setReduced50Ids(new Set(rows.map((r) => Number(r.id))));
      setReduced50Count(typeof data?.total === 'number' ? data.total : rows.length);
    } catch {
      setReduced50Ids(new Set());
      setReduced50Count(0);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const branchParams = branchId ? { branchId } : {};
      const pageLimit = 500;
      let page = 1;
      let all = [];
      let total = Infinity;

      while (all.length < total) {
        const { data } = await api.get('/customers', {
          params: { limit: pageLimit, page, ...branchParams },
        });
        const rows = Array.isArray(data) ? data : (data?.data || []);
        total = typeof data?.total === 'number' ? data.total : rows.length;
        all = all.concat(rows);
        if (!rows.length || rows.length < pageLimit) break;
        page += 1;
      }

      const brR = await api.get('/branches', { params: { limit: 100 } });
      const branchList = Array.isArray(brR.data) ? brR.data : (brR.data?.data || []);
      setCustomers(all);
      setBranches(branchList);
      setSelectedIds([]);
      await loadReduced50();
    } catch {
      toast('Failed to load customers.', 'error');
    } finally {
      setLoading(false);
    }
  }, [branchId, loadReduced50, toast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const isReduced50Customer = useCallback(
    (c) => reduced50Ids.has(Number(c.id)) || c.loyalty_mark === 'reduced_50',
    [reduced50Ids]
  );

  const tierCounts = useMemo(() => loyaltyTierCounts(customers), [customers]);

  const visibleCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (tierFilter === REDUCED_50) {
        if (!isReduced50Customer(c)) return false;
      } else if (tierFilter !== 'All') {
        if (getTier(c.loyalty_points || 0).name !== tierFilter) return false;
      }
      if (!q) return true;
      return (
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.phone || '').toLowerCase().includes(q) ||
        String(c.email || '').toLowerCase().includes(q)
      );
    });
  }, [customers, search, tierFilter, isReduced50Customer]);

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

  const selectTier = (tierName) => {
    setTierFilter(tierName);
    if (tierName === REDUCED_50) {
      setSelectedIds(customers.filter(isReduced50Customer).map((c) => c.id));
      return;
    }
    const ids = customers
      .filter((c) => getTier(c.loyalty_points || 0).name === tierName)
      .map((c) => c.id);
    setSelectedIds(ids);
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
    if (!cleanMsg) return toast(isOffice ? 'Type an office SMS message.' : 'Type an offer SMS message.', 'error');
    setSending(true);
    try {
      const res = await api.post(apiPath, {
        customerIds: selectedIds,
        message: cleanMsg,
      });
      toast(res.data?.message || `${pageTitle} sent.`, 'success');
      setLastBatch({
        sentAt: res.data?.sentAt || new Date().toISOString(),
        totals: res.data?.totals || null,
        results: Array.isArray(res.data?.results) ? res.data.results : [],
        preview: cleanMsg.slice(0, 120),
      });
      setMessage('');
      loadDeliveryReport();
    } catch (err) {
      toast(err?.response?.data?.message || `Failed to send ${pageTitle}.`, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <PageWrapper
      title={pageTitle}
      subtitle={pageSubtitle}
      actions={
        <Button onClick={handleSend} disabled={sending || loading}>
          {sending ? 'Sending...' : `Send SMS (${selectedIds.length})`}
        </Button>
      }
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => { setTierFilter('All'); setSelectedIds([]); }}
          style={{
            minWidth: 110, padding: '12px 14px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
            border: `1.5px solid ${tierFilter === 'All' ? '#2563EB' : '#E4E7EC'}`,
            background: tierFilter === 'All' ? '#EFF6FF' : '#fff',
            fontFamily: "'Inter',sans-serif",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB' }}>{customers.length}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#667085', marginTop: 2 }}>ALL</div>
        </button>
        {LOYALTY_TIERS.map((t) => {
          const active = tierFilter === t.name;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => selectTier(t.name)}
              title={`Select all ${t.name} customers (${t.range})`}
              style={{
                minWidth: 120, padding: '12px 14px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                border: `1.5px solid ${active ? t.color : '#E4E7EC'}`,
                background: active ? t.bg : '#fff',
                fontFamily: "'Inter',sans-serif",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: t.color }}>{tierCounts[t.name]}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.color, marginTop: 2 }}>{t.name.toUpperCase()}</div>
              <div style={{ fontSize: 10, color: '#98A2B3', marginTop: 2 }}>{t.range} · tap to select</div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => selectTier(REDUCED_50)}
          title="Customers marked after −50 points reduction — tap to select all"
          style={{
            minWidth: 120, padding: '12px 14px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
            border: `1.5px solid ${tierFilter === REDUCED_50 ? '#DC2626' : '#E4E7EC'}`,
            background: tierFilter === REDUCED_50 ? '#FEF2F2' : '#fff',
            fontFamily: "'Inter',sans-serif",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: '#DC2626' }}>{reduced50Count}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', marginTop: 2 }}>−50 PTS</div>
          <div style={{ fontSize: 10, color: '#98A2B3', marginTop: 2 }}>marked · tap to select</div>
        </button>
      </div>

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
              visibleCustomers.map((c) => {
                const tier = getTier(c.loyalty_points || 0);
                const isReduced50 = isReduced50Customer(c);
                return (
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
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#101828', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        {isReduced50 && (
                          <span style={{
                            flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#DC2626',
                            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 4, padding: '1px 5px',
                          }}>−50</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#667085' }}>{c.phone || 'No phone number'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: tier.bg, color: tier.color,
                      }}>{tier.name}</span>
                      <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 3 }}>
                        {Number(c.loyalty_points || 0).toLocaleString()} pts
                      </div>
                    </div>
                  </label>
                );
              })
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
            placeholder={messagePlaceholder}
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
            <span>
              Selected: <strong>{selectedIds.length}</strong>
              {tierFilter !== 'All' ? ` · ${tierFilter}` : ''}
            </span>
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
              {sending ? 'Sending...' : sendButtonLabel}
            </Button>
            <Button variant="ghost" onClick={() => setMessage('')}>
              Clear Message
            </Button>
          </div>
        </div>
      </div>

      {/* Last send report */}
      {lastBatch && (
        <div style={{ marginTop: 16, background: '#fff', border: '1px solid #EAECF0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F2F4F7', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>Last send report</div>
              <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>
                {new Date(lastBatch.sentAt).toLocaleString()}
                {lastBatch.preview ? ` · “${lastBatch.preview}${lastBatch.preview.length >= 120 ? '…' : ''}”` : ''}
              </div>
            </div>
            {lastBatch.totals && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, fontWeight: 700 }}>
                <span style={{ padding: '4px 10px', borderRadius: 20, background: '#ECFDF5', color: '#059669' }}>Sent {lastBatch.totals.sent}</span>
                <span style={{ padding: '4px 10px', borderRadius: 20, background: '#FEF2F2', color: '#DC2626' }}>Failed {lastBatch.totals.failed}</span>
                <span style={{ padding: '4px 10px', borderRadius: 20, background: '#F8FAFC', color: '#64748B' }}>Skipped {lastBatch.totals.skipped}</span>
              </div>
            )}
          </div>
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', color: '#667085', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '8px 12px', color: '#667085', fontWeight: 600 }}>Phone</th>
                  <th style={{ padding: '8px 12px', color: '#667085', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '8px 12px', color: '#667085', fontWeight: 600 }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {lastBatch.results.map((r) => (
                  <tr key={`${r.customerId}-${r.phone}`} style={{ borderTop: '1px solid #F2F4F7' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '8px 12px', color: '#667085' }}>{r.phone || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: r.status === 'sent' ? '#ECFDF5' : r.status === 'failed' ? '#FEF2F2' : '#F8FAFC',
                        color: r.status === 'sent' ? '#059669' : r.status === 'failed' ? '#DC2626' : '#64748B',
                      }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#98A2B3', fontSize: 12 }}>{r.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delivery history */}
      <div style={{ marginTop: 16, background: '#fff', border: '1px solid #EAECF0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #F2F4F7', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>Delivery report</div>
            <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>Offer SMS history (last 100)</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={reportStatus}
              onChange={(e) => setReportStatus(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E4E7EC', fontSize: 13 }}
            >
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
            <Button variant="ghost" onClick={loadDeliveryReport} disabled={reportLoading}>
              {reportLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          {reportLoading && !reportRows.length ? (
            <div style={{ padding: 18, fontSize: 13, color: '#667085' }}>Loading delivery report...</div>
          ) : reportRows.length === 0 ? (
            <div style={{ padding: 18, fontSize: 13, color: '#667085' }}>No offer SMS deliveries yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', color: '#667085', fontWeight: 600 }}>When</th>
                  <th style={{ padding: '8px 12px', color: '#667085', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '8px 12px', color: '#667085', fontWeight: 600 }}>Phone</th>
                  <th style={{ padding: '8px 12px', color: '#667085', fontWeight: 600 }}>Message</th>
                  <th style={{ padding: '8px 12px', color: '#667085', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid #F2F4F7' }}>
                    <td style={{ padding: '8px 12px', color: '#667085', whiteSpace: 'nowrap' }}>
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{row.customer_name || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#667085' }}>{row.phone || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#98A2B3', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.message_preview || '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: row.status === 'sent' ? '#ECFDF5' : '#FEF2F2',
                        color: row.status === 'sent' ? '#059669' : '#DC2626',
                      }}>{row.status}</span>
                      {row.error_message ? (
                        <div style={{ fontSize: 11, color: '#F97316', marginTop: 4 }}>{row.error_message}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
