import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

const TAB = {
  birthday: '🎂 Birthday Campaign',
  inactive: '😴 Win-Back Campaign',
  rebook: '🔁 Rebook Suggestions',
};

export default function MarketingAutomationPage() {
  const { addToast } = useToast();

  const [tab, setTab] = useState('birthday');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [birthdayMsg, setBirthdayMsg] = useState('Happy Birthday {{name}}! Enjoy {{offer}} at our salon this week.');
  const [winbackMsg, setWinbackMsg] = useState('Hi {{name}}, we miss you! Come back this week and enjoy {{offer}}.');
  const [inactiveDays, setInactiveDays] = useState(45);

  const [birthdayCustomers, setBirthdayCustomers] = useState([]);
  const [inactiveCustomers, setInactiveCustomers] = useState([]);
  const [rebookSuggestions, setRebookSuggestions] = useState([]);

  const loadBirthday = useCallback(async () => {
    const r = await api.get('/marketing/birthday-customers');
    setBirthdayCustomers(Array.isArray(r.data) ? r.data : []);
  }, []);

  const loadInactive = useCallback(async () => {
    const r = await api.get(`/marketing/inactive-customers?days=${inactiveDays}`);
    setInactiveCustomers(Array.isArray(r.data) ? r.data : []);
  }, [inactiveDays]);

  const loadRebook = useCallback(async () => {
    const r = await api.get('/marketing/rebook-suggestions');
    setRebookSuggestions(Array.isArray(r.data) ? r.data : []);
  }, []);

  const reloadActiveTab = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'birthday') await loadBirthday();
      if (tab === 'inactive') await loadInactive();
      if (tab === 'rebook') await loadRebook();
    } catch {
      addToast('Failed to load marketing data', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, loadBirthday, loadInactive, loadRebook, addToast]);

  useEffect(() => { reloadActiveTab(); }, [reloadActiveTab]);

  const sendBirthday = async (customerId) => {
    setSending(true);
    try {
      await api.post('/marketing/send-birthday', { customer_id: customerId, message: birthdayMsg, offer: '10% OFF' });
      addToast('Birthday message sent', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to send', 'error');
    }
    setSending(false);
  };

  const sendBirthdayBulk = async () => {
    if (!birthdayCustomers.length) return;
    if (!window.confirm(`Send birthday message to ${birthdayCustomers.length} customer(s)?`)) return;
    setSending(true);
    let ok = 0;
    for (const c of birthdayCustomers) {
      try {
        await api.post('/marketing/send-birthday', { customer_id: c.id, message: birthdayMsg, offer: '10% OFF' });
        ok += 1;
      } catch {
        // Continue sending to others.
      }
    }
    setSending(false);
    addToast(`Birthday campaign sent to ${ok}/${birthdayCustomers.length}`, ok ? 'success' : 'error');
  };

  const sendWinback = async (customerId) => {
    setSending(true);
    try {
      await api.post('/marketing/send-winback', { customer_id: customerId, message: winbackMsg, offer: '15% OFF next visit' });
      addToast('Win-back message sent', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to send', 'error');
    }
    setSending(false);
  };

  const sendWinbackBulk = async () => {
    if (!inactiveCustomers.length) return;
    if (!window.confirm(`Send win-back message to ${inactiveCustomers.length} customer(s)?`)) return;
    setSending(true);
    let ok = 0;
    for (const c of inactiveCustomers) {
      try {
        await api.post('/marketing/send-winback', { customer_id: c.id, message: winbackMsg, offer: '15% OFF next visit' });
        ok += 1;
      } catch {
        // Continue sending to others.
      }
    }
    setSending(false);
    addToast(`Win-back campaign sent to ${ok}/${inactiveCustomers.length}`, ok ? 'success' : 'error');
  };

  const card = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 };
  const input = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', boxSizing: 'border-box', fontSize: 13, fontFamily: 'inherit' };

  return (
    <PageWrapper
      title="Marketing Automation"
      subtitle="Run birthday wishes, win-back offers, and rebook nudges"
      actions={<button onClick={reloadActiveTab} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>🔄 Refresh</button>}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(TAB).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: tab === k ? '#2563EB' : '#F3F4F6',
              color: tab === k ? '#fff' : '#374151',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: '#6B7280' }}>Loading campaign audience...</div>
      ) : (
        <>
          {tab === 'birthday' && (
            <>
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Birthday Template</div>
                <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} value={birthdayMsg} onChange={(e) => setBirthdayMsg(e.target.value)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>{birthdayCustomers.length} birthday customer(s) today</div>
                  <Button onClick={sendBirthdayBulk} disabled={sending || birthdayCustomers.length === 0}>{sending ? 'Sending...' : 'Send to All'}</Button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {birthdayCustomers.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 32, color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12 }}>No birthdays today</div>}
                {birthdayCustomers.map((c) => (
                  <div key={c.id} style={{ ...card, padding: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>{c.phone}</div>
                    <div style={{ fontSize: 11, marginBottom: 10, color: '#9CA3AF' }}>DOB: {c.dob || '—'}</div>
                    <button onClick={() => sendBirthday(c.id)} disabled={sending} style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Send Birthday SMS</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'inactive' && (
            <>
              <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Inactive Days</div>
                    <input type="number" min="7" style={input} value={inactiveDays} onChange={(e) => setInactiveDays(Number(e.target.value || 45))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Win-back Template</div>
                    <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} value={winbackMsg} onChange={(e) => setWinbackMsg(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <button onClick={reloadActiveTab} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Find Audience</button>
                  <Button onClick={sendWinbackBulk} disabled={sending || inactiveCustomers.length === 0}>{sending ? 'Sending...' : `Send to All (${inactiveCustomers.length})`}</Button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E7EB', background: '#F9FAFB' }}>
                      {['Customer', 'Phone', 'Last Visit', 'Days Inactive', 'Total Visits', 'Action'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#374151', fontWeight: 700 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveCustomers.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#9CA3AF' }}>No inactive customers found</td></tr>
                    )}
                    {inactiveCustomers.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{c.name}</td>
                        <td style={{ padding: '10px 12px', color: '#6B7280' }}>{c.phone}</td>
                        <td style={{ padding: '10px 12px', color: '#6B7280' }}>{c.last_visit ? new Date(c.last_visit).toLocaleDateString() : 'Never'}</td>
                        <td style={{ padding: '10px 12px', color: c.days_inactive > 90 ? '#DC2626' : '#D97706', fontWeight: 700 }}>{c.days_inactive}</td>
                        <td style={{ padding: '10px 12px' }}>{c.visit_count || 0}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <button onClick={() => sendWinback(c.id)} disabled={sending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Send Win-back</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'rebook' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {rebookSuggestions.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12 }}>
                  No rebooking opportunities found
                </div>
              )}
              {rebookSuggestions.map((item, i) => (
                <div key={i} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#101828' }}>{item.customer_name}</div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>{item.phone}</div>
                    </div>
                    <span style={{ fontSize: 10, background: '#E0E7FF', color: '#3730A3', borderRadius: 20, padding: '3px 8px', fontWeight: 700 }}>
                      {item.rebook_priority || 'normal'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}><strong>Last service:</strong> {item.last_service_name || 'N/A'}</div>
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}><strong>Last visit:</strong> {item.last_visit ? new Date(item.last_visit).toLocaleDateString() : 'N/A'}</div>
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: 10 }}><strong>Recommended in:</strong> {item.recommended_days || 30} days</div>
                  <button
                    disabled
                    title="Integrate this with your reminders/SMS flow"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', cursor: 'not-allowed', fontSize: 12, fontWeight: 600 }}
                  >
                    Rebook Nudges (auto)
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </PageWrapper>
  );
}
