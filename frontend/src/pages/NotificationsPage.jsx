import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { FilterBar, DataTable, IconBell } from '../components/ui/PageKit';

const EVENTS = ['appointment_confirmed','payment_receipt','loyalty_points'];
const EVENT_LABELS = { appointment_confirmed:'Appointment Confirmed', payment_receipt:'Payment Receipt', loyalty_points:'Loyalty Points' };
const EVENT_CHANNELS = { appointment_confirmed:['email','whatsapp','sms'], payment_receipt:['email','whatsapp','sms'], loyalty_points:['whatsapp','sms'] };
const SETTINGS_KEY = {
  appointment_confirmed_email:'appt_confirmed_email', appointment_confirmed_whatsapp:'appt_confirmed_whatsapp', appointment_confirmed_sms:'appt_confirmed_sms',
  payment_receipt_email:'payment_receipt_email', payment_receipt_whatsapp:'payment_receipt_whatsapp', payment_receipt_sms:'payment_receipt_sms',
  loyalty_points_whatsapp:'loyalty_points_whatsapp', loyalty_points_sms:'loyalty_points_sms',
};
const CH_COLOR = {
  email:    { bg:'#EFF6FF', color:'#1D4ED8', label:'Email' },
  whatsapp: { bg:'#DCFCE7', color:'#166534', label:'WhatsApp' },
  sms:      { bg:'#FEF3C7', color:'#B45309', label:'SMS' },
};
const ST_COLOR = { sent:{ bg:'#D1FAE5', color:'#059669' }, failed:{ bg:'#FEE2E2', color:'#DC2626' } };
const EV_COLOR = { appointment_confirmed:{ bg:'#EFF6FF', color:'#1D4ED8' }, payment_receipt:{ bg:'#D1FAE5', color:'#059669' }, loyalty_points:{ bg:'#FEF3C7', color:'#D97706' } };

function Toggle({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{ width:44, height:24, borderRadius:12, border:'none', background:checked?'#2563EB':'#D0D5DD', cursor:'pointer', position:'relative', transition:'background .2s' }}>
      <span style={{ position:'absolute', top:3, left:checked?22:3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

export default function NotificationsPage() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const isAdmin   = ['superadmin','admin'].includes(user?.role);
  const [settings, setSettings]           = useState({});
  const [settingsBusy, setSettingsBusy]   = useState(false);
  const [settingsOpen, setSettingsOpen]   = useState(true);
  const [apiOpen, setApiOpen]             = useState(false);
  const [smsOpen, setSmsOpen]             = useState(false);
  const [smtpOpen, setSmtpOpen]           = useState(false);
  const [showToken, setShowToken]         = useState(false);
  const [editingToken, setEditingToken]   = useState(false);
  const [newToken, setNewToken]           = useState('');
  const [editingSmsKey, setEditingSmsKey] = useState(false);
  const [newSmsKey, setNewSmsKey]         = useState('');
  const [showSmsKey, setShowSmsKey]       = useState(false);
  const [editingSmtpPass, setEditingSmtpPass] = useState(false);
  const [newSmtpPass, setNewSmtpPass]         = useState('');
  const [showSmtpPass, setShowSmtpPass]       = useState(false);
  const [testTo, setTestTo]               = useState({ smtp:'', sms:'', whatsapp:'' });
  const [testBusy, setTestBusy]           = useState({ smtp:false, sms:false, whatsapp:false });
  const [logs, setLogs]                   = useState([]);
  const [logTotal, setLogTotal]           = useState(0);
  const [logPage, setLogPage]             = useState(1);
  const [logLoading, setLogLoading]       = useState(false);
  const [filterCh, setFilterCh]           = useState('');
  const [filterSt, setFilterSt]           = useState('');
  const [filterEv, setFilterEv]           = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/notifications/settings').then(r => {
      setSettings(r.data || {});
    }).catch(() => {});
  }, [isAdmin]);

  const loadLogs = useCallback(async () => {
    setLogLoading(true);
    try {
      const p = new URLSearchParams({ page:logPage, limit:20 });
      if (filterCh) p.set('channel', filterCh);
      if (filterSt) p.set('status', filterSt);
      if (filterEv) p.set('event_type', filterEv);
      const res = await api.get(`/notifications/log?${p}`);
      setLogs(res.data.data || []);
      setLogTotal(res.data.total || 0);
    } catch { toast('Failed to load notification log.', 'error'); }
    setLogLoading(false);
  }, [logPage, filterCh, filterSt, filterEv]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  const saveSettings = async () => {
    setSettingsBusy(true);
    try {
      const payload = { ...settings };
      if (editingToken) payload.twilio_auth_token = newToken;
      else delete payload.twilio_auth_token;
      if (editingSmsKey) payload.sms_api_key = newSmsKey;
      else delete payload.sms_api_key;
      if (editingSmtpPass) payload.smtp_pass = newSmtpPass;
      else delete payload.smtp_pass;
      const res = await api.put('/notifications/settings', payload);
      setSettings(res.data || settings);
      setEditingToken(false); setNewToken('');
      setEditingSmsKey(false); setNewSmsKey('');
      setEditingSmtpPass(false); setNewSmtpPass('');
      toast('Settings saved.', 'success');
    } catch (err) {
      toast(err?.response?.data?.message || 'Failed to save settings.', 'error');
    } finally {
      setSettingsBusy(false);
    }
  };

  const sendTestProvider = async (provider) => {
    const to = testTo[provider]?.trim();
    if (!to) { toast(`Enter a ${provider === 'smtp' ? 'email' : 'phone number'} to test.`, 'error'); return; }
    setTestBusy(b => ({ ...b, [provider]: true }));
    try {
      const res = await api.post('/notifications/test-provider', { provider, to });
      toast(res.data.message || 'Test sent!', 'success');
    } catch (err) {
      toast(err?.response?.data?.message || 'Test failed.', 'error');
    } finally {
      setTestBusy(b => ({ ...b, [provider]: false }));
    }
  };

  const logPages = Math.ceil(logTotal / 20);

  const inputStyle = {
    width:'100%', padding:'8px 12px', borderRadius:8,
    border:'1.5px solid #E4E7EC', fontSize:13,
    fontFamily:"'Inter',sans-serif", color:'#344054',
    background:'#fff', outline:'none', boxSizing:'border-box',
  };

  return (
    <PageWrapper title="Notifications" subtitle="Delivery log and notification settings">

      {/* Settings Panel */}
      {isAdmin && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #EAECF0', overflow:'hidden', boxShadow:'0 1px 4px rgba(16,24,40,0.07)' }}>
          <button type="button" onClick={() => setSettingsOpen(o => !o)}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', background:'none', border:'none', cursor:'pointer', fontSize:15, fontWeight:700, color:'#101828', fontFamily:"'Inter',sans-serif" }}>
            <span style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ color:'#2563EB' }}><IconBell /></span>
              Notification Settings
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" style={{ transform:settingsOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {settingsOpen && (
            <div style={{ padding:'0 24px 24px' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid #F2F4F7' }}>
                    <th style={{ textAlign:'left', padding:'10px 0', fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', width:'40%' }}>Event</th>
                    <th style={{ textAlign:'center', padding:'10px 0', fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', width:'20%' }}>Email</th>
                    <th style={{ textAlign:'center', padding:'10px 0', fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', width:'20%' }}>WhatsApp</th>
                    <th style={{ textAlign:'center', padding:'10px 0', fontSize:11, fontWeight:700, color:'#B45309', textTransform:'uppercase', letterSpacing:'0.05em', width:'20%' }}>SMS</th>
                  </tr>
                </thead>
                <tbody>
                  {EVENTS.map(ev => {
                    const channels = EVENT_CHANNELS[ev] || [];
                    const emailKey = SETTINGS_KEY[`${ev}_email`];
                    const waKey    = SETTINGS_KEY[`${ev}_whatsapp`];
                    const smsKey   = SETTINGS_KEY[`${ev}_sms`];
                    return (
                      <tr key={ev} style={{ borderBottom:'1px solid #F9FAFB' }}>
                        <td style={{ padding:'14px 0', fontSize:14, fontWeight:600, color:'#344054' }}>{EVENT_LABELS[ev]}</td>
                        <td style={{ textAlign:'center', padding:'14px 0' }}>
                          {channels.includes('email')
                            ? <Toggle checked={!!settings[emailKey]} onChange={() => setSettings(s=>({...s,[emailKey]:!s[emailKey]}))} />
                            : <span style={{ color:'#E4E7EC', fontSize:16 }}></span>}
                        </td>
                        <td style={{ textAlign:'center', padding:'14px 0' }}>
                          {channels.includes('whatsapp')
                            ? <Toggle checked={!!settings[waKey]} onChange={() => setSettings(s=>({...s,[waKey]:!s[waKey]}))} />
                            : <span style={{ color:'#E4E7EC', fontSize:16 }}></span>}
                        </td>
                        <td style={{ textAlign:'center', padding:'14px 0' }}>
                          {channels.includes('sms')
                            ? <Toggle checked={!!settings[smsKey]} onChange={() => setSettings(s=>({...s,[smsKey]:!s[smsKey]}))} />
                            : <span style={{ color:'#E4E7EC', fontSize:16 }}></span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* SMS Provider (Notify.lk) */}
              <div style={{ marginTop:20, border:'1px solid #EAECF0', borderRadius:12, overflow:'hidden' }}>
                <button type="button" onClick={() => setSmsOpen(o => !o)}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:'#FFFBEB', border:'none', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:'#92400E' }}>
                    <span style={{ fontSize:16 }}>📱</span>
                    SMS Provider (Notify.lk)
                    {settings.sms_source === 'db'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#D1FAE5', color:'#065F46', padding:'2px 8px', borderRadius:6 }}>DB ✓</span>
                      : settings.sms_source === 'env'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'2px 8px', borderRadius:6 }}>.env</span>
                      : <span style={{ fontSize:10, fontWeight:700, background:'#FEE2E2', color:'#DC2626', padding:'2px 8px', borderRadius:6 }}>Not Set</span>
                    }
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.5" strokeLinecap="round" style={{ transform:smsOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {smsOpen && (
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:14, borderTop:'1px solid #FDE68A', background:'#FFFDF0' }}>
                    <p style={{ margin:0, fontSize:12, color:'#92400E' }}>
                      Enter credentials from <strong>app.notify.lk</strong> → Account → API Keys tab.
                    </p>

                    {/* User ID */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>User ID</label>
                      <input
                        type="text"
                        value={settings.sms_user_id || ''}
                        onChange={e => setSettings(s => ({ ...s, sms_user_id: e.target.value }))}
                        placeholder="e.g. 31293"
                        style={inputStyle}
                      />
                    </div>

                    {/* API Key */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>
                        API Key
                        {settings.sms_api_key_set && !editingSmsKey && (
                          <span style={{ marginLeft:8, fontSize:11, color:'#059669', fontWeight:500 }}>● Set</span>
                        )}
                      </label>
                      {editingSmsKey ? (
                        <div style={{ display:'flex', gap:8 }}>
                          <input
                            type={showSmsKey ? 'text' : 'password'}
                            value={newSmsKey}
                            onChange={e => setNewSmsKey(e.target.value)}
                            placeholder="Paste new API key"
                            style={{ ...inputStyle, flex:1 }}
                            autoFocus
                          />
                          <button type="button" onClick={() => setShowSmsKey(v => !v)}
                            style={{ padding:'0 10px', borderRadius:8, border:'1.5px solid #E4E7EC', background:'#F8FAFC', cursor:'pointer', fontSize:12, color:'#64748B' }}>
                            {showSmsKey ? 'Hide' : 'Show'}
                          </button>
                          <button type="button" onClick={() => { setEditingSmsKey(false); setNewSmsKey(''); }}
                            style={{ padding:'0 10px', borderRadius:8, border:'1.5px solid #E4E7EC', background:'#F8FAFC', cursor:'pointer', fontSize:12, color:'#DC2626' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <input type="password" readOnly value={settings.sms_api_key || ''}
                            style={{ ...inputStyle, flex:1, cursor:'not-allowed', background:'#F9FAFB', color:'#9CA3AF' }} />
                          <button type="button" onClick={() => { setEditingSmsKey(true); setNewSmsKey(''); }}
                            style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #D97706', background:'#FEF3C7', cursor:'pointer', fontSize:12, fontWeight:600, color:'#92400E', whiteSpace:'nowrap' }}>
                            Change
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Sender ID (Service ID) */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>Sender ID <span style={{ fontWeight:400, color:'#94A3B8' }}>(Service ID from Sender IDs tab)</span></label>
                      <input type="text" value={settings.sms_sender_id || ''}
                        onChange={e => setSettings(s => ({ ...s, sms_sender_id: e.target.value.trim() }))}
                        placeholder="e.g. NotifyDEMO" style={inputStyle} />
                    </div>

                    {/* Test */}
                    <div style={{ display:'flex', gap:8, alignItems:'center', paddingTop:4, borderTop:'1px dashed #FDE68A' }}>
                      <input type="tel" value={testTo.sms} onChange={e => setTestTo(t => ({ ...t, sms: e.target.value }))}
                        placeholder="Test phone (e.g. 0771234567)" style={{ ...inputStyle, flex:1 }} />
                      <button type="button" disabled={testBusy.sms} onClick={() => sendTestProvider('sms')}
                        style={{ padding:'8px 16px', borderRadius:8, border:'none', background: testBusy.sms ? '#FDE68A' : '#D97706', color:'#fff', fontWeight:700, fontSize:12, cursor: testBusy.sms ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
                        {testBusy.sms ? 'Sending…' : '▶ Send Test SMS'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SMTP / Email */}
              <div style={{ marginTop:12, border:'1px solid #EAECF0', borderRadius:12, overflow:'hidden' }}>
                <button type="button" onClick={() => setSmtpOpen(o => !o)}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:'#F0FDF4', border:'none', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:'#14532D' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    SMTP / Email
                    {settings.smtp_source === 'db'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#D1FAE5', color:'#065F46', padding:'2px 8px', borderRadius:6 }}>DB ✓</span>
                      : settings.smtp_source === 'env'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'2px 8px', borderRadius:6 }}>.env</span>
                      : <span style={{ fontSize:10, fontWeight:700, background:'#FEE2E2', color:'#DC2626', padding:'2px 8px', borderRadius:6 }}>Not Set</span>
                    }
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14532D" strokeWidth="2.5" strokeLinecap="round" style={{ transform:smtpOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {smtpOpen && (
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:14, borderTop:'1px solid #BBF7D0', background:'#F7FFFE' }}>
                    <p style={{ margin:0, fontSize:12, color:'#15803D' }}>
                      Configure your outgoing email server. Gmail users: use an <strong>App Password</strong> (not your Gmail password).
                    </p>

                    {/* Host + Port */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 100px', gap:10 }}>
                      <div>
                        <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>SMTP Host</label>
                        <input type="text" value={settings.smtp_host || ''}
                          onChange={e => setSettings(s => ({ ...s, smtp_host: e.target.value }))}
                          placeholder="smtp.gmail.com" style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>Port</label>
                        <input type="number" value={settings.smtp_port || ''}
                          onChange={e => setSettings(s => ({ ...s, smtp_port: e.target.value }))}
                          placeholder="587" style={inputStyle} />
                      </div>
                    </div>

                    {/* Email (username) */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>Email Address <span style={{ fontWeight:400, color:'#94A3B8' }}>(SMTP username)</span></label>
                      <input type="email" value={settings.smtp_user || ''}
                        onChange={e => setSettings(s => ({ ...s, smtp_user: e.target.value }))}
                        placeholder="youremail@gmail.com" style={inputStyle} />
                    </div>

                    {/* Password / App Password */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>
                        Password / App Password
                        {settings.smtp_pass_set && !editingSmtpPass && (
                          <span style={{ marginLeft:8, fontSize:11, color:'#059669', fontWeight:500 }}>● Set</span>
                        )}
                      </label>
                      {editingSmtpPass ? (
                        <div style={{ display:'flex', gap:8 }}>
                          <input
                            type={showSmtpPass ? 'text' : 'password'}
                            value={newSmtpPass}
                            onChange={e => setNewSmtpPass(e.target.value)}
                            placeholder="Enter new password / app password"
                            style={{ ...inputStyle, flex:1 }}
                            autoFocus
                          />
                          <button type="button" onClick={() => setShowSmtpPass(v => !v)}
                            style={{ padding:'0 10px', borderRadius:8, border:'1.5px solid #E4E7EC', background:'#F8FAFC', cursor:'pointer', fontSize:12, color:'#64748B' }}>
                            {showSmtpPass ? 'Hide' : 'Show'}
                          </button>
                          <button type="button" onClick={() => { setEditingSmtpPass(false); setNewSmtpPass(''); }}
                            style={{ padding:'0 10px', borderRadius:8, border:'1.5px solid #E4E7EC', background:'#F8FAFC', cursor:'pointer', fontSize:12, color:'#DC2626' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <input type="password" readOnly value={settings.smtp_pass || ''}
                            style={{ ...inputStyle, flex:1, cursor:'not-allowed', background:'#F9FAFB', color:'#9CA3AF' }} />
                          <button type="button" onClick={() => { setEditingSmtpPass(true); setNewSmtpPass(''); }}
                            style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #16A34A', background:'#DCFCE7', cursor:'pointer', fontSize:12, fontWeight:600, color:'#14532D', whiteSpace:'nowrap' }}>
                            Change
                          </button>
                        </div>
                      )}
                    </div>

                    {/* From name */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>From Name / Address <span style={{ fontWeight:400, color:'#94A3B8' }}>(optional)</span></label>
                      <input type="text" value={settings.smtp_from || ''}
                        onChange={e => setSettings(s => ({ ...s, smtp_from: e.target.value }))}
                        placeholder={`Zane Salon <youremail@gmail.com>`} style={inputStyle} />
                    </div>

                    {/* Test */}
                    <div style={{ display:'flex', gap:8, alignItems:'center', paddingTop:4, borderTop:'1px dashed #BBF7D0' }}>
                      <input type="email" value={testTo.smtp} onChange={e => setTestTo(t => ({ ...t, smtp: e.target.value }))}
                        placeholder="Test recipient email" style={{ ...inputStyle, flex:1 }} />
                      <button type="button" disabled={testBusy.smtp} onClick={() => sendTestProvider('smtp')}
                        style={{ padding:'8px 16px', borderRadius:8, border:'none', background: testBusy.smtp ? '#D1FAE5' : '#16A34A', color:'#fff', fontWeight:700, fontSize:12, cursor: testBusy.smtp ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
                        {testBusy.smtp ? 'Sending…' : '▶ Send Test Email'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Twilio API Keys */}
              <div style={{ marginTop:12, border:'1px solid #EAECF0', borderRadius:12, overflow:'hidden' }}>
                <button type="button" onClick={() => setApiOpen(o => !o)}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:'#F8FAFC', border:'none', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:'#344054' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Twilio API Keys
                    {settings.twilio_source === 'db'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#D1FAE5', color:'#065F46', padding:'2px 8px', borderRadius:6 }}>DB ✓</span>
                      : <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'2px 8px', borderRadius:6 }}>.env</span>
                    }
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" style={{ transform:apiOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {apiOpen && (
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:14, borderTop:'1px solid #EAECF0' }}>
                    <p style={{ margin:0, fontSize:12, color:'#64748B' }}>
                      These credentials are used for WhatsApp &amp; SMS. Leave blank to use <code style={{ background:'#F1F5F9', padding:'1px 5px', borderRadius:4 }}>.env</code> values.
                    </p>

                    {/* Account SID */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>Account SID</label>
                      <input
                        type="text"
                        value={settings.twilio_account_sid || ''}
                        onChange={e => setSettings(s => ({ ...s, twilio_account_sid: e.target.value }))}
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        style={inputStyle}
                      />
                    </div>

                    {/* Auth Token */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>
                        Auth Token
                        {settings.twilio_auth_token_set && !editingToken && (
                          <span style={{ marginLeft:8, fontSize:11, color:'#059669', fontWeight:500 }}>● Set</span>
                        )}
                      </label>
                      {editingToken ? (
                        <div style={{ display:'flex', gap:8 }}>
                          <input
                            type={showToken ? 'text' : 'password'}
                            value={newToken}
                            onChange={e => setNewToken(e.target.value)}
                            placeholder="Enter new auth token"
                            style={{ ...inputStyle, flex:1 }}
                            autoFocus
                          />
                          <button type="button" onClick={() => setShowToken(v => !v)}
                            style={{ padding:'0 10px', borderRadius:8, border:'1.5px solid #E4E7EC', background:'#F8FAFC', cursor:'pointer', fontSize:12, color:'#64748B' }}>
                            {showToken ? 'Hide' : 'Show'}
                          </button>
                          <button type="button" onClick={() => { setEditingToken(false); setNewToken(''); }}
                            style={{ padding:'0 10px', borderRadius:8, border:'1.5px solid #E4E7EC', background:'#F8FAFC', cursor:'pointer', fontSize:12, color:'#DC2626' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <input type="password" readOnly value={settings.twilio_auth_token || ''}
                            style={{ ...inputStyle, flex:1, cursor:'not-allowed', background:'#F9FAFB', color:'#9CA3AF' }} />
                          <button type="button" onClick={() => { setEditingToken(true); setNewToken(''); }}
                            style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #6366F1', background:'#EEF2FF', cursor:'pointer', fontSize:12, fontWeight:600, color:'#4F46E5', whiteSpace:'nowrap' }}>
                            Change
                          </button>
                        </div>
                      )}
                    </div>

                    {/* WhatsApp From */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#344054', marginBottom:5 }}>WhatsApp From Number</label>
                      <input type="text" value={settings.twilio_whatsapp_from || ''}
                        onChange={e => setSettings(s => ({ ...s, twilio_whatsapp_from: e.target.value }))}
                        placeholder="whatsapp:+14155238886" style={inputStyle} />
                      <p style={{ margin:'4px 0 0', fontSize:11, color:'#94A3B8' }}>Twilio sandbox or approved WhatsApp number with <code style={{ background:'#F1F5F9', padding:'1px 4px', borderRadius:3 }}>whatsapp:</code> prefix.</p>
                    </div>

                    {/* Test */}
                    <div style={{ display:'flex', gap:8, alignItems:'center', paddingTop:4, borderTop:'1px dashed #C7D2FE' }}>
                      <input type="tel" value={testTo.whatsapp} onChange={e => setTestTo(t => ({ ...t, whatsapp: e.target.value }))}
                        placeholder="Test phone (e.g. 0771234567)" style={{ ...inputStyle, flex:1 }} />
                      <button type="button" disabled={testBusy.whatsapp} onClick={() => sendTestProvider('whatsapp')}
                        style={{ padding:'8px 16px', borderRadius:8, border:'none', background: testBusy.whatsapp ? '#C7D2FE' : '#4F46E5', color:'#fff', fontWeight:700, fontSize:12, cursor: testBusy.whatsapp ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
                        {testBusy.whatsapp ? 'Sending…' : '▶ Send Test WhatsApp'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
                <Button onClick={saveSettings} disabled={settingsBusy}>{settingsBusy ? 'Saving…' : 'Save Settings'}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Log Table */}
      <div style={{ background:'#fff', borderRadius:16, border:'1px solid #EAECF0', overflow:'hidden', boxShadow:'0 1px 4px rgba(16,24,40,0.07)' }}>
        <div style={{ padding:'16px 24px', borderBottom:'1px solid #F2F4F7' }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#101828', marginBottom:12 }}>Notification Log</div>
          <FilterBar>
            <select value={filterEv} onChange={e=>{ setFilterEv(e.target.value); setLogPage(1); }}
              style={{ padding:'6px 10px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
              <option value="">All Events</option>
              {EVENTS.map(ev => <option key={ev} value={ev}>{EVENT_LABELS[ev]}</option>)}
            </select>
            <select value={filterCh} onChange={e=>{ setFilterCh(e.target.value); setLogPage(1); }}
              style={{ padding:'6px 10px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
              <option value="">All Channels</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
            <select value={filterSt} onChange={e=>{ setFilterSt(e.target.value); setLogPage(1); }}
              style={{ padding:'6px 10px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
            {(filterEv||filterCh||filterSt) && <Button variant="ghost" size="sm" onClick={() => { setFilterEv(''); setFilterCh(''); setFilterSt(''); setLogPage(1); }}>Clear</Button>}
            <span style={{ marginLeft:'auto', fontSize:13, color:'#64748B', fontFamily:"'Inter',sans-serif" }}>{logTotal} record{logTotal!==1?'s':''}</span>
          </FilterBar>
        </div>

        <DataTable noShell
          columns={[
            { accessorKey:'event_type', header:'Event Type', meta:{ width:'18%' },
              cell: ({ getValue }) => {
                const t = getValue();
                const ev = EV_COLOR[t] || { bg:'#F2F4F7', color:'#64748B' };
                return <span style={{ padding:'3px 10px', borderRadius:10, fontSize:11, fontWeight:700, background:ev.bg, color:ev.color, whiteSpace:'nowrap' }}>{EVENT_LABELS[t]||t}</span>;
              }
            },
            { id:'customer', header:'Customer', meta:{ width:'16%' },
              accessorFn: r => r.recipient_name || r.customer_id || '',
              cell: ({ getValue }) => <span style={{ fontSize:13, fontWeight:600, color:'#101828' }}>{getValue()}</span>
            },
            { accessorKey:'channel', header:'Channel', meta:{ width:'14%' },
              cell: ({ getValue }) => {
                const ch = CH_COLOR[getValue()] || { bg:'#F2F4F7', color:'#64748B', label:getValue()||'' };
                return <span style={{ padding:'3px 10px', borderRadius:10, fontSize:11, fontWeight:600, background:ch.bg, color:ch.color }}>{ch.label}</span>;
              }
            },
            { accessorKey:'message', header:'Message', meta:{ width:'28%' },
              cell: ({ getValue }) => <span style={{ fontSize:12, color:'#64748B', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{getValue()||''}</span>
            },
            { id:'sentAt', header:'Sent At', meta:{ width:'14%' },
              accessorFn: r => r.createdAt || '',
              cell: ({ getValue }) => <span style={{ fontSize:12, color:'#98A2B3', whiteSpace:'nowrap' }}>{getValue() ? new Date(getValue()).toLocaleString('en-US',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</span>
            },
            { accessorKey:'status', header:'Status', meta:{ width:'10%', align:'center' },
              cell: ({ getValue }) => {
                const st = ST_COLOR[getValue()] || { bg:'#F2F4F7', color:'#64748B' };
                return (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:10, fontSize:11, fontWeight:700, background:st.bg, color:st.color }}>
                    <span style={{ width:5, height:5, borderRadius:'50%', background:st.color }} />
                    {getValue()}
                  </span>
                );
              }
            },
          ]}
          data={logs}
          loading={logLoading}
          emptyMessage="No notifications found"
          emptySub="Notification delivery records will appear here"
        />

        {logPages > 1 && (
          <div style={{ display:'flex', gap:6, padding:'12px 16px', justifyContent:'center', borderTop:'1px solid #F2F4F7' }}>
            {Array.from({ length: Math.min(logPages, 10) }, (_, i) => (
              <button key={i} onClick={() => setLogPage(i+1)}
                style={{ width:34, height:34, borderRadius:8, border:'1.5px solid', cursor:'pointer', fontWeight:600, fontSize:13, fontFamily:"'Inter',sans-serif", transition:'all 0.15s',
                  borderColor: logPage===i+1 ? '#2563EB' : '#E4E7EC',
                  background:  logPage===i+1 ? '#2563EB' : '#fff',
                  color:       logPage===i+1 ? '#fff' : '#344054' }}>
                {i+1}
              </button>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
