import { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { getKcAccessToken } from '../utils/kcTokenStore';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { FilterBar, DataTable, IconBell } from '../components/ui/PageKit';
import { useTheme } from '../context/ThemeContext';
import { getSurface } from '../components/shared/appThemeTokens';

function notifColors(isDark) {
  const s = getSurface(isDark);
  return {
    card: s.panel,
    border: s.border,
    borderLight: s.borderSubtle,
    title: s.text,
    label: s.textSecondary,
    muted: s.muted,
    faint: s.faint,
    soft: s.soft,
    shadow: isDark ? '0 8px 20px rgba(2,6,23,0.35)' : '0 1px 4px rgba(16,24,40,0.07)',
    code: isDark ? '#0F172A' : '#F1F5F9',
    overlay: s.overlay,
    inputBg: s.inputBg,
    inputBorder: s.inputBorder,
    inputText: s.text,
    inputReadonlyBg: isDark ? '#172033' : '#F9FAFB',
    inputReadonlyText: s.faint,
    ghostBtnBg: isDark ? '#172033' : '#F8FAFC',
    rowBorder: isDark ? s.borderSubtle : '#F9FAFB',
    theadBorder: isDark ? s.border : '#F2F4F7',
    sms: {
      hdr: isDark ? 'rgba(217,119,6,0.18)' : '#FFFBEB',
      hdrText: isDark ? '#FCD34D' : '#92400E',
      hdrStroke: isDark ? '#FCD34D' : '#92400E',
      body: isDark ? '#172033' : '#FFFDF0',
      bodyBorder: isDark ? 'rgba(217,119,6,0.35)' : '#FDE68A',
      bodyText: isDark ? '#FDE68A' : '#92400E',
      dashBorder: isDark ? 'rgba(217,119,6,0.35)' : '#FDE68A',
    },
    smtp: {
      hdr: isDark ? 'rgba(22,163,74,0.15)' : '#F0FDF4',
      hdrText: isDark ? '#86EFAC' : '#14532D',
      hdrStroke: isDark ? '#86EFAC' : '#14532D',
      body: isDark ? '#172033' : '#F7FFFE',
      bodyBorder: isDark ? 'rgba(22,163,74,0.35)' : '#BBF7D0',
      bodyText: isDark ? '#86EFAC' : '#15803D',
      dashBorder: isDark ? 'rgba(22,163,74,0.35)' : '#BBF7D0',
    },
    wa: {
      hdr: isDark ? 'rgba(22,163,74,0.15)' : '#F0FDF4',
      hdrText: isDark ? '#86EFAC' : '#166534',
      body: isDark ? '#172033' : s.panel,
      bodyBorder: s.border,
    },
    api: {
      hdr: isDark ? '#172033' : '#F8FAFC',
      hdrText: s.textSecondary,
    },
    tpl: {
      groupHdr: isDark ? '#0F172A' : '#F8FAFC',
      row: isDark ? s.panel : '#fff',
      rowBorder: isDark ? s.borderSubtle : '#F2F4F7',
    },
    modal: { bg: s.panel, footer: s.soft, border: s.border },
    pag: { border: s.borderSubtle, btnBg: s.panel, btnText: s.textSecondary },
  };
}

const EVENTS = ['customer_registered','appointment_confirmed','staff_appointment_assigned','appointment_completed','recurring_reminder','payment_receipt','loyalty_points','walk_in_checkin','walk_in_serving','walk_in_completed','test','review_request','staff_earnings_pdf_test','staff_monthly_earnings'];
const EVENT_LABELS = {
  customer_registered: 'Customer Registered',
  appointment_confirmed: 'Appointment Confirmed',
  staff_appointment_assigned: 'Staff — New Appointment',
  appointment_completed: 'Appointment Completed',
  recurring_reminder: 'Recurring Visit Reminder',
  payment_receipt: 'Payment Receipt',
  loyalty_points: 'Loyalty Points',
  walk_in_checkin: 'Walk-In — Check-In',
  walk_in_serving: 'Walk-In — Now Serving',
  walk_in_completed: 'Walk-In — Completed',
  test: 'Test / Offer SMS',
  review_request: 'Review Request',
  staff_earnings_pdf_test: 'Staff Earnings PDF (test)',
  staff_monthly_earnings: 'Staff Monthly Earnings',
};
const TEMPLATE_EVENT_ORDER = [
  'appointment_confirmed',
  'staff_appointment_assigned',
  'appointment_completed',
  'recurring_reminder',
  'payment_receipt',
  'loyalty_points',
  'walk_in_checkin',
  'walk_in_serving',
  'walk_in_completed',
  'review_request',
  'customer_registered',
];
const TEMPLATE_VARIABLES = {
  _common: [
    ['customer_name', 'Customer Name'],
    ['branch_name', 'Branch Name'],
    ['service_name', 'Service'],
  ],
  appointment_confirmed: [
    ['date', 'Date'],
    ['time', 'Time'],
    ['amount', 'Amount'],
  ],
  staff_appointment_assigned: [
    ['staff_name', 'Staff Name'],
    ['date', 'Date'],
    ['time', 'Time'],
  ],
  appointment_completed: [
    ['date', 'Date'],
    ['time', 'Time'],
  ],
  recurring_reminder: [
    ['date', 'Date'],
    ['time', 'Time'],
    ['amount', 'Amount'],
  ],
  payment_receipt: [
    ['date', 'Date'],
    ['amount', 'Amount Paid'],
    ['points_earned', 'Points Earned'],
    ['points_total', 'Total Points Balance'],
    ['loyalty_section', 'Loyalty block (auto)'],
    ['ticket_line', 'Walk-in ticket line'],
    ['payment_methods', 'Payment methods'],
  ],
  loyalty_points: [
    ['points_earned', 'Points Earned'],
    ['points_total', 'Points Total'],
  ],
  walk_in_checkin: [
    ['token', 'Queue Token'],
    ['wait_mins', 'Est. Wait (mins)'],
  ],
  walk_in_serving: [
    ['token', 'Queue Token'],
  ],
  walk_in_completed: [],
  review_request: [
    ['review_url', 'Review URL'],
  ],
  customer_registered: [],
};
function templateVariablesFor(eventType) {
  return [
    ...TEMPLATE_VARIABLES._common,
    ...(TEMPLATE_VARIABLES[eventType] || []),
  ];
}

/** Estimate billed SMS parts (GSM 160/153, Unicode 70/67). */
function estimateSmsParts(raw) {
  const text = String(raw || '')
    .replace(/[–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\u00A0/g, ' ')
    .trim();
  if (!text) return { chars: 0, encoding: 'GSM', parts: 0 };
  const isUnicode = /[^\u0000-\u007F]/.test(text);
  if (isUnicode) {
    const chars = [...text].length;
    return { chars, encoding: 'Unicode', parts: chars <= 70 ? 1 : Math.ceil(chars / 67) };
  }
  const chars = text.length;
  return { chars, encoding: 'GSM', parts: chars <= 160 ? 1 : Math.ceil(chars / 153) };
}
const EVENT_CHANNELS = {
  customer_registered:['email','sms'],
  appointment_confirmed:['email','whatsapp','sms'],
  staff_appointment_assigned:['whatsapp'],
  appointment_completed:['whatsapp','sms'],
  recurring_reminder:['whatsapp','sms'],
  payment_receipt:['email','whatsapp','sms'],
  loyalty_points:['whatsapp','sms'],
  walk_in_checkin:['whatsapp','sms'],
  walk_in_serving:['whatsapp','sms'],
  walk_in_completed:['whatsapp','sms'],
};
const SETTINGS_KEY = {
  customer_registered_email:'customer_registered_email', customer_registered_sms:'customer_registered_sms',
  appointment_confirmed_email:'appt_confirmed_email', appointment_confirmed_whatsapp:'appt_confirmed_whatsapp', appointment_confirmed_sms:'appt_confirmed_sms',
  staff_appointment_assigned_whatsapp:'staff_appt_assigned_whatsapp',
  appointment_completed_whatsapp:'appt_completed_whatsapp', appointment_completed_sms:'appt_completed_sms',
  recurring_reminder_sms:'recurring_reminder_sms',
  recurring_reminder_whatsapp:'recurring_reminder_whatsapp',
  payment_receipt_email:'payment_receipt_email', payment_receipt_whatsapp:'payment_receipt_whatsapp', payment_receipt_sms:'payment_receipt_sms',
  loyalty_points_whatsapp:'loyalty_points_whatsapp', loyalty_points_sms:'loyalty_points_sms',
  walk_in_checkin_whatsapp:'walkin_checkin_whatsapp',
  walk_in_checkin_sms:'walkin_checkin_sms',
  walk_in_serving_whatsapp:'walkin_serving_whatsapp',
  walk_in_serving_sms:'walkin_serving_sms',
  walk_in_completed_whatsapp:'walkin_completed_whatsapp',
  walk_in_completed_sms:'walkin_completed_sms',
};
const CH_COLOR = {
  email:    { bg:'#EFF6FF', color:'#1D4ED8', label:'Email' },
  whatsapp: { bg:'#DCFCE7', color:'#166534', label:'WhatsApp' },
  sms:      { bg:'#FEF3C7', color:'#B45309', label:'SMS' },
};
const ST_COLOR = { sent:{ bg:'#D1FAE5', color:'#059669' }, failed:{ bg:'#FEE2E2', color:'#DC2626' } };
const EV_COLOR = { appointment_confirmed:{ bg:'#EFF6FF', color:'#1D4ED8' }, payment_receipt:{ bg:'#D1FAE5', color:'#059669' }, loyalty_points:{ bg:'#FEF3C7', color:'#D97706' } };

function Toggle({ checked, onChange, isDark }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{ width:44, height:24, borderRadius:12, border:'none', background:checked?'#2563EB':(isDark?'#475569':'#D0D5DD'), cursor:'pointer', position:'relative', transition:'background .2s' }}>
      <span style={{ position:'absolute', top:3, left:checked?22:3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

export default function NotificationsPage() {
  const { user, tenant }  = useAuth();
  const { isDark } = useTheme();
  const C = notifColors(isDark);
  const waTenantId = tenant?.id ?? user?.tenant_id ?? user?.tenantId ?? null;
  const { toast } = useToast();
  const isAdmin   = ['superadmin','admin'].includes(user?.role);
  const canTestPush = ['superadmin','admin','manager'].includes(user?.role);
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
  const [testBusy, setTestBusy]           = useState({ smtp:false, sms:false, whatsapp:false, earningsPdf:false, push:false });
  const [logs, setLogs]                   = useState([]);
  const [logTotal, setLogTotal]           = useState(0);
  const [logPage, setLogPage]             = useState(1);
  const [logLoading, setLogLoading]       = useState(false);
  const [filterCh, setFilterCh]           = useState('');
  const [filterSt, setFilterSt]           = useState('');
  const [filterEv, setFilterEv]           = useState('');

  // ── Template editor state ──
  const [templates, setTemplates]         = useState([]);
  const [tplLoading, setTplLoading]       = useState(false);
  const [tplOpen, setTplOpen]             = useState(false);
  const [editTpl, setEditTpl]             = useState(null);
  const [editName, setEditName]           = useState('');
  const [editSubject, setEditSubject]     = useState('');
  const [editBody, setEditBody]           = useState('');
  const [tplBusy, setTplBusy]             = useState(false);

  const [waOpen, setWaOpen]               = useState(true);
  const [waStatus, setWaStatus]           = useState({ status: 'disconnected' });
  const [waQrImage, setWaQrImage]         = useState(null);
  const [waBusy, setWaBusy]               = useState(false);
  const waSocketRef = useRef(null);

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

  const loadTemplates = useCallback(async () => {
    if (!isAdmin) return;
    setTplLoading(true);
    try {
      const { data } = await api.get('/notifications/templates');
      setTemplates(data.templates || []);
    } catch { /* silent */ }
    finally { setTplLoading(false); }
  }, [isAdmin]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const loadWaStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/whatsapp/status');
      setWaStatus(data || { status: 'disconnected' });
      if (data?.qrImage) setWaQrImage(data.qrImage);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadWaStatus();

    const token = getKcAccessToken() || document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('token='))?.split('=')[1];
    const socket = io({ auth: { token } });
    waSocketRef.current = socket;
    socket.on('connect', () => {
      if (waTenantId) socket.emit('whatsapp:join', { tenantId: waTenantId });
    });
    socket.on('whatsapp:qr', ({ qrImage }) => { if (qrImage) setWaQrImage(qrImage); });
    socket.on('whatsapp:status', (payload) => {
      setWaStatus(prev => ({ ...prev, ...payload }));
      if (payload.status === 'connected') {
        setWaQrImage(null);
        toast('WhatsApp connected!', 'success');
      }
      if (payload.status === 'disconnected') setWaQrImage(null);
    });

    return () => { socket.disconnect(); waSocketRef.current = null; };
  }, [isAdmin, waTenantId, loadWaStatus, toast]);

  const handleWaConnect = async () => {
    setWaBusy(true);
    try {
      const { data } = await api.post('/notifications/whatsapp/connect');
      setWaStatus(data);
      if (data.qrImage) setWaQrImage(data.qrImage);
      toast(data.message || 'Scan QR with WhatsApp', 'info');
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to connect WhatsApp.', 'error');
    } finally { setWaBusy(false); }
  };

  const handleWaDisconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp? You will need to scan QR again.')) return;
    setWaBusy(true);
    try {
      await api.post('/notifications/whatsapp/disconnect');
      setWaStatus({ status: 'disconnected' });
      setWaQrImage(null);
      toast('WhatsApp disconnected.', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to disconnect.', 'error');
    } finally { setWaBusy(false); }
  };

  const openEditTpl = (tpl) => {
    setEditTpl(tpl);
    setEditName(tpl.name || '');
    setEditSubject(tpl.subject || '');
    setEditBody(tpl.body || '');
    setTplOpen(true);
  };

  const createTplVariant = (tpl) => {
    openEditTpl({
      ...tpl,
      id: null,
      name: '',
      is_custom: true,
      // New custom templates become the live send template on save.
      is_default: true,
    });
  };

  const saveTpl = async () => {
    if (!editTpl || tplBusy) return;
    if (!editName.trim()) { toast('Template name cannot be empty.', 'error'); return; }
    if (!editBody.trim()) { toast('Message body cannot be empty.', 'error'); return; }
    setTplBusy(true);
    try {
      await api.post('/notifications/templates', {
        id:          editTpl.id || null,
        event_type: editTpl.event_type,
        channel:    editTpl.channel,
        name:       editName.trim(),
        subject:    editSubject.trim() || null,
        body:       editBody.trim(),
        // Always activate the template being saved so SMS/WhatsApp/Email use it.
        is_default: true,
      });
      await loadTemplates();
      setTplOpen(false);
      toast(editTpl.id ? 'Template updated and set as active!' : 'Template created and set as active!', 'success');
    } catch (err) {
      toast(err?.response?.data?.message || 'Failed to save template.', 'error');
    } finally { setTplBusy(false); }
  };

  const deleteTpl = async (tpl) => {
    if (!tpl.id) return;
    if (!window.confirm(`Delete “${tpl.name || 'this template'}”?`)) return;
    try {
      await api.delete(`/notifications/templates/${tpl.id}`);
      await loadTemplates();
      if (tplOpen && editTpl?.event_type === tpl.event_type && editTpl?.channel === tpl.channel) setTplOpen(false);
      toast('Template deleted.', 'success');
    } catch { toast('Failed to delete template.', 'error'); }
  };

  const selectTpl = async (tpl) => {
    if (tpl.is_default) return;
    try {
      await api.post('/notifications/templates/select', {
        event_type: tpl.event_type,
        channel: tpl.channel,
        template_id: tpl.id,
      });
      await loadTemplates();
      toast(`“${tpl.name}” will be used for new messages.`, 'success');
    } catch (err) {
      toast(err?.response?.data?.message || 'Failed to select template.', 'error');
    }
  };

  const insertVar = (varName) => {
    setEditBody(b => b + `{${varName}}`);
  };

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

  const sendTestStaffEarningsPdf = async () => {
    const to = testTo.smtp?.trim();
    if (!to) { toast('Enter an email above (same field as SMTP test).', 'error'); return; }
    setTestBusy(b => ({ ...b, earningsPdf: true }));
    try {
      const res = await api.post('/notifications/test-staff-earnings-pdf', { to });
      toast(res.data.message || 'Test PDF sent!', 'success');
    } catch (err) {
      toast(err?.response?.data?.message || 'Test failed.', 'error');
    } finally {
      setTestBusy(b => ({ ...b, earningsPdf: false }));
    }
  };

  const sendTestPush = async () => {
    setTestBusy(b => ({ ...b, push: true }));
    try {
      const res = await api.post('/notifications/test-push', {});
      toast(res.data.message || 'Test push sent!', 'success');
    } catch (err) {
      toast(err?.response?.data?.message || 'Push test failed.', 'error');
    } finally {
      setTestBusy(b => ({ ...b, push: false }));
    }
  };

  const logPages = Math.ceil(logTotal / 20);

  const inputStyle = {
    width:'100%', padding:'8px 12px', borderRadius:8,
    border:`1.5px solid ${C.inputBorder}`, fontSize:13,
    fontFamily:"'Inter',sans-serif", color:C.inputText,
    background:C.inputBg, outline:'none', boxSizing:'border-box',
  };

  const ghostBtn = {
    padding:'0 10px', borderRadius:8, border:`1.5px solid ${C.ghostBtnBorder}`,
    background:C.ghostBtnBg, cursor:'pointer', fontSize:12,
  };

  return (
    <PageWrapper title="Notifications" subtitle="Delivery log and notification settings">

      {/* Settings Panel */}
      {isAdmin && (
        <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden', boxShadow:C.shadow }}>
          <button type="button" onClick={() => setSettingsOpen(o => !o)}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', background:'none', border:'none', cursor:'pointer', fontSize:15, fontWeight:700, color:C.title, fontFamily:"'Inter',sans-serif" }}>
            <span style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ color:'#2563EB' }}><IconBell /></span>
              Notification Settings
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" style={{ transform:settingsOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {settingsOpen && (
            <div style={{ padding:'0 24px 24px' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:`2px solid ${C.theadBorder}` }}>
                    <th style={{ textAlign:'left', padding:'10px 0', fontSize:11, fontWeight:700, color:C.faint, textTransform:'uppercase', letterSpacing:'0.05em', width:'40%' }}>Event</th>
                    <th style={{ textAlign:'center', padding:'10px 0', fontSize:11, fontWeight:700, color:C.faint, textTransform:'uppercase', letterSpacing:'0.05em', width:'20%' }}>Email</th>
                    <th style={{ textAlign:'center', padding:'10px 0', fontSize:11, fontWeight:700, color:C.faint, textTransform:'uppercase', letterSpacing:'0.05em', width:'20%' }}>WhatsApp</th>
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
                      <tr key={ev} style={{ borderBottom:`1px solid ${C.rowBorder}` }}>
                        <td style={{ padding:'14px 0', fontSize:14, fontWeight:600, color:C.title }}>{EVENT_LABELS[ev]}</td>
                        <td style={{ textAlign:'center', padding:'14px 0' }}>
                          {channels.includes('email')
                            ? <Toggle isDark={isDark} checked={!!settings[emailKey]} onChange={() => setSettings(s=>({...s,[emailKey]:!s[emailKey]}))} />
                            : <span style={{ color:C.border, fontSize:16 }}>—</span>}
                        </td>
                        <td style={{ textAlign:'center', padding:'14px 0' }}>
                          {channels.includes('whatsapp')
                            ? <Toggle isDark={isDark} checked={!!settings[waKey]} onChange={() => setSettings(s=>({...s,[waKey]:!s[waKey]}))} />
                            : <span style={{ color:C.border, fontSize:16 }}>—</span>}
                        </td>
                        <td style={{ textAlign:'center', padding:'14px 0' }}>
                          {channels.includes('sms')
                            ? <Toggle isDark={isDark} checked={!!settings[smsKey]} onChange={() => setSettings(s=>({...s,[smsKey]:!s[smsKey]}))} />
                            : <span style={{ color:C.border, fontSize:16 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Save button — right below toggles for easy access */}
              <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
                <Button onClick={saveSettings} disabled={settingsBusy}>{settingsBusy ? 'Saving…' : 'Save Settings'}</Button>
              </div>

              {/* SMS Provider */}
              <div style={{ marginTop:20, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
                <button type="button" onClick={() => setSmsOpen(o => !o)}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:C.sms.hdr, border:'none', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:C.sms.hdrText }}>
                    <span style={{ fontSize:16 }}>📱</span>
                    SMS Provider
                    {settings.sms_source === 'db'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#D1FAE5', color:'#065F46', padding:'2px 8px', borderRadius:6 }}>DB ✓</span>
                      : settings.sms_source === 'env'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'2px 8px', borderRadius:6 }}>.env</span>
                      : <span style={{ fontSize:10, fontWeight:700, background:'#FEE2E2', color:'#DC2626', padding:'2px 8px', borderRadius:6 }}>Not Set</span>
                    }
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.sms.hdrStroke} strokeWidth="2.5" strokeLinecap="round" style={{ transform:smsOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {smsOpen && (
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:14, borderTop:`1px solid ${C.sms.bodyBorder}`, background:C.sms.body }}>
                    <p style={{ margin:0, fontSize:12, color:C.sms.bodyText }}>
                      {(settings.sms_provider || 'notify_lk') === 'textit'
                        ? 'Textit.biz needs only the REST API Key (from Settings → REST API Credentials). Sender ID is optional.'
                        : 'Enter your SMS gateway User ID, API Key, and approved Sender ID below.'}
                    </p>

                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>SMS Gateway</label>
                      <select
                        value={settings.sms_provider || 'notify_lk'}
                        onChange={e => setSettings(s => ({ ...s, sms_provider: e.target.value }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        <option value="textit">Textit.biz (API Key only)</option>
                        <option value="notify_lk">Notify.lk (User ID + API Key)</option>
                      </select>
                    </div>

                    {/* User ID — Notify.lk only */}
                    {(settings.sms_provider || 'notify_lk') !== 'textit' && (
                      <div>
                        <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>User ID</label>
                        <input
                          type="text"
                          value={settings.sms_user_id || ''}
                          onChange={e => setSettings(s => ({ ...s, sms_user_id: e.target.value }))}
                          placeholder="e.g. 31293"
                          style={inputStyle}
                        />
                      </div>
                    )}

                    {/* API Key */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>
                        {(settings.sms_provider || 'notify_lk') === 'textit' ? 'REST API Key' : 'API Key'}
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
                            placeholder={(settings.sms_provider || 'notify_lk') === 'textit' ? 'Paste Textit API Key' : 'Paste new API key'}
                            style={{ ...inputStyle, flex:1 }}
                            autoFocus
                          />
                          <button type="button" onClick={() => setShowSmsKey(v => !v)}
                            style={{ ...ghostBtn, color:C.muted }}>
                            {showSmsKey ? 'Hide' : 'Show'}
                          </button>
                          <button type="button" onClick={() => { setEditingSmsKey(false); setNewSmsKey(''); }}
                            style={{ ...ghostBtn, color:'#DC2626' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <input type="password" readOnly value={settings.sms_api_key || ''}
                            style={{ ...inputStyle, flex:1, cursor:'not-allowed', background:C.inputReadonlyBg, color:C.inputReadonlyText }} />
                          <button type="button" onClick={() => { setEditingSmsKey(true); setNewSmsKey(''); }}
                            style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #D97706', background:'#FEF3C7', cursor:'pointer', fontSize:12, fontWeight:600, color:'#92400E', whiteSpace:'nowrap' }}>
                            Change
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Sender ID — required for Notify.lk, optional for Textit */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>
                        Sender ID
                        <span style={{ fontWeight:400, color:C.faint }}>
                          {(settings.sms_provider || 'notify_lk') === 'textit'
                            ? ' (optional — usually set in Textit account)'
                            : ' (approved Sender ID)'}
                        </span>
                      </label>
                      <input type="text" value={settings.sms_sender_id || ''}
                        onChange={e => setSettings(s => ({ ...s, sms_sender_id: e.target.value.trim() }))}
                        placeholder="e.g. Hexaone" style={inputStyle} />
                    </div>

                    {/* Test */}
                    <div style={{ display:'flex', gap:8, alignItems:'center', paddingTop:4, borderTop:`1px dashed ${C.sms.dashBorder}` }}>
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
              <div style={{ marginTop:12, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
                <button type="button" onClick={() => setSmtpOpen(o => !o)}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:C.smtp.hdr, border:'none', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:C.smtp.hdrText }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    SMTP / Email
                    {settings.smtp_source === 'db'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#D1FAE5', color:'#065F46', padding:'2px 8px', borderRadius:6 }}>DB ✓</span>
                      : settings.smtp_source === 'env'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'2px 8px', borderRadius:6 }}>.env</span>
                      : <span style={{ fontSize:10, fontWeight:700, background:'#FEE2E2', color:'#DC2626', padding:'2px 8px', borderRadius:6 }}>Not Set</span>
                    }
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.smtp.hdrStroke} strokeWidth="2.5" strokeLinecap="round" style={{ transform:smtpOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {smtpOpen && (
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:14, borderTop:`1px solid ${C.smtp.bodyBorder}`, background:C.smtp.body }}>
                    <p style={{ margin:0, fontSize:12, color:C.smtp.bodyText }}>
                      Configure your outgoing email server. Gmail users: use an <strong>App Password</strong> (not your Gmail password).
                    </p>

                    {/* Host + Port */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 100px', gap:10 }}>
                      <div>
                        <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>SMTP Host</label>
                        <input type="text" value={settings.smtp_host || ''}
                          onChange={e => setSettings(s => ({ ...s, smtp_host: e.target.value }))}
                          placeholder="smtp.gmail.com" style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>Port</label>
                        <input type="number" value={settings.smtp_port || ''}
                          onChange={e => setSettings(s => ({ ...s, smtp_port: e.target.value }))}
                          placeholder="587" style={inputStyle} />
                      </div>
                    </div>

                    {/* Email (username) */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>Email Address <span style={{ fontWeight:400, color:C.faint }}>(SMTP username)</span></label>
                      <input type="email" value={settings.smtp_user || ''}
                        onChange={e => setSettings(s => ({ ...s, smtp_user: e.target.value }))}
                        placeholder="youremail@gmail.com" style={inputStyle} />
                    </div>

                    {/* Password / App Password */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>
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
                            style={{ ...ghostBtn, color:C.muted }}>
                            {showSmtpPass ? 'Hide' : 'Show'}
                          </button>
                          <button type="button" onClick={() => { setEditingSmtpPass(false); setNewSmtpPass(''); }}
                            style={{ ...ghostBtn, color:'#DC2626' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <input type="password" readOnly value={settings.smtp_pass || ''}
                            style={{ ...inputStyle, flex:1, cursor:'not-allowed', background:C.inputReadonlyBg, color:C.inputReadonlyText }} />
                          <button type="button" onClick={() => { setEditingSmtpPass(true); setNewSmtpPass(''); }}
                            style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #16A34A', background:'#DCFCE7', cursor:'pointer', fontSize:12, fontWeight:600, color:'#14532D', whiteSpace:'nowrap' }}>
                            Change
                          </button>
                        </div>
                      )}
                    </div>

                    {/* From name */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>From Name / Address <span style={{ fontWeight:400, color:C.faint }}>(optional)</span></label>
                      <input type="text" value={settings.smtp_from || ''}
                        onChange={e => setSettings(s => ({ ...s, smtp_from: e.target.value }))}
                        placeholder={`HEXAONE <youremail@gmail.com>`} style={inputStyle} />
                    </div>

                    {/* Test */}
                    <div style={{ display:'flex', flexDirection:'column', gap:10, paddingTop:4, borderTop:`1px dashed ${C.smtp.dashBorder}` }}>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <input type="email" value={testTo.smtp} onChange={e => setTestTo(t => ({ ...t, smtp: e.target.value }))}
                          placeholder="Test recipient email" style={{ ...inputStyle, flex:1 }} />
                        <button type="button" disabled={testBusy.smtp} onClick={() => sendTestProvider('smtp')}
                          style={{ padding:'8px 16px', borderRadius:8, border:'none', background: testBusy.smtp ? '#D1FAE5' : '#16A34A', color:'#fff', fontWeight:700, fontSize:12, cursor: testBusy.smtp ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
                          {testBusy.smtp ? 'Sending…' : '▶ Send Test Email'}
                        </button>
                      </div>
                      <p style={{ margin:0, fontSize:11, color:C.smtp.bodyText }}>
                        <strong>Staff earnings report:</strong> sends a <strong>sample PDF</strong> (demo data, same layout as the real monthly email) to the address above — use this to verify SMTP + attachments.
                      </p>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <button type="button" disabled={testBusy.earningsPdf || testBusy.smtp} onClick={sendTestStaffEarningsPdf}
                          style={{ padding:'8px 16px', borderRadius:8, border:`1.5px solid ${isDark ? '#166534' : '#15803D'}`, background: testBusy.earningsPdf ? (isDark ? 'rgba(22,163,74,0.2)' : '#DCFCE7') : C.card, color:isDark ? '#86EFAC' : '#14532D', fontWeight:700, fontSize:12, cursor: (testBusy.earningsPdf || testBusy.smtp) ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
                          {testBusy.earningsPdf ? 'Sending PDF…' : '▶ Send test earnings PDF (report)'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* WhatsApp QR Connect */}
              <div style={{ marginTop:12, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
                <button type="button" onClick={() => setWaOpen(o => !o)}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:C.wa.hdr, border:'none', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:C.wa.hdrText }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                    WhatsApp — QR Connect
                    {waStatus.status === 'connected'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#DCFCE7', color:'#166534', padding:'2px 8px', borderRadius:6 }}>Connected</span>
                      : waStatus.status === 'connecting'
                        ? <span style={{ fontSize:10, fontWeight:700, background:'#FEF3C7', color:'#92400E', padding:'2px 8px', borderRadius:6 }}>Scan QR</span>
                        : <span style={{ fontSize:10, fontWeight:700, background:'#F3F4F6', color:'#6B7280', padding:'2px 8px', borderRadius:6 }}>Not connected</span>}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" style={{ transform:waOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {waOpen && (
                  <div style={{ padding:'16px 18px', borderTop:`1px solid ${C.wa.bodyBorder}`, display:'flex', flexDirection:'column', gap:16, background:C.wa.body }}>
                    <div style={{ padding:'12px 14px', background:isDark?'rgba(37,99,235,0.12)':'#EFF6FF', border:`1px solid ${isDark?'rgba(96,165,250,0.25)':'#BFDBFE'}`, borderRadius:10, fontSize:12, color:isDark?'#93C5FD':'#1E40AF', lineHeight:1.6 }}>
                      <strong>Per-salon isolation:</strong> Each tenant connects its own WhatsApp number.
                      Sessions, messages, and outgoing notifications are scoped to this salon only — other salons cannot access or use your connection.
                      Only Admin / Super Admin can connect or disconnect.
                    </div>
                    <p style={{ margin:0, fontSize:12, color:C.muted, lineHeight:1.6 }}>
                      Connect your salon WhatsApp by scanning a QR code. Once connected, system messages
                      (appointments, payments, walk-in queue) are sent from your number. Twilio is fallback only.
                    </p>

                    {waStatus.status === 'connected' ? (
                      <div style={{ padding:'12px 14px', background:isDark?'rgba(22,163,74,0.12)':'#F0FDF4', border:`1px solid ${isDark?'rgba(22,163,74,0.35)':'#BBF7D0'}`, borderRadius:10, fontSize:13, color:isDark?'#86EFAC':'#166534' }}>
                        <strong>Connected:</strong> +{waStatus.phone || '—'}
                        {waStatus.push_name ? ` (${waStatus.push_name})` : ''}
                        {waStatus.connected_at && (
                          <div style={{ fontSize:11, color:'#4ADE80', marginTop:4 }}>
                            Since {new Date(waStatus.connected_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : waQrImage ? (
                      <div style={{ textAlign:'center' }}>
                        <p style={{ fontSize:12, fontWeight:600, color:C.label, margin:'0 0 10px' }}>
                          Open WhatsApp → Linked Devices → Link a Device → Scan this QR
                        </p>
                        <img src={waQrImage} alt="WhatsApp QR" style={{ width:280, height:280, borderRadius:12, border:`1px solid ${C.border}` }} />
                      </div>
                    ) : null}

                    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                      {waStatus.status !== 'connected' && (
                        <button type="button" disabled={waBusy} onClick={handleWaConnect}
                          style={{ padding:'9px 18px', borderRadius:9, border:'none', background: waBusy ? '#86EFAC' : '#16A34A', color:'#fff', fontWeight:700, fontSize:13, cursor: waBusy ? 'not-allowed' : 'pointer' }}>
                          {waBusy ? 'Starting…' : waQrImage ? 'Refresh QR' : 'Connect WhatsApp'}
                        </button>
                      )}
                      {(waStatus.status === 'connected' || waStatus.status === 'connecting') && (
                        <button type="button" disabled={waBusy} onClick={handleWaDisconnect}
                          style={{ padding:'9px 18px', borderRadius:9, border:'1px solid #FECACA', background:'#FEF2F2', color:'#DC2626', fontWeight:600, fontSize:13, cursor: waBusy ? 'not-allowed' : 'pointer' }}>
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Twilio API Keys */}
              <div style={{ marginTop:12, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
                <button type="button" onClick={() => setApiOpen(o => !o)}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:C.api.hdr, border:'none', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:C.label }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Twilio API Keys
                    {settings.twilio_source === 'db'
                      ? <span style={{ fontSize:10, fontWeight:700, background:'#D1FAE5', color:'#065F46', padding:'2px 8px', borderRadius:6 }}>DB ✓</span>
                      : <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'2px 8px', borderRadius:6 }}>.env</span>
                    }
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" style={{ transform:apiOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {apiOpen && (
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:14, borderTop:`1px solid ${C.border}`, background:C.wa.body }}>
                    <p style={{ margin:0, fontSize:12, color:C.muted }}>
                      These credentials are used for WhatsApp &amp; SMS. Leave blank to use <code style={{ background:C.code, padding:'1px 5px', borderRadius:4 }}>.env</code> values.
                    </p>

                    {/* Account SID */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>Account SID</label>
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
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>
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
                            style={{ ...ghostBtn, color:C.muted }}>
                            {showToken ? 'Hide' : 'Show'}
                          </button>
                          <button type="button" onClick={() => { setEditingToken(false); setNewToken(''); }}
                            style={{ ...ghostBtn, color:'#DC2626' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <input type="password" readOnly value={settings.twilio_auth_token || ''}
                            style={{ ...inputStyle, flex:1, cursor:'not-allowed', background:C.inputReadonlyBg, color:C.inputReadonlyText }} />
                          <button type="button" onClick={() => { setEditingToken(true); setNewToken(''); }}
                            style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #6366F1', background:'#EEF2FF', cursor:'pointer', fontSize:12, fontWeight:600, color:'#4F46E5', whiteSpace:'nowrap' }}>
                            Change
                          </button>
                        </div>
                      )}
                    </div>

                    {/* WhatsApp From */}
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>WhatsApp From Number</label>
                      <input type="text" value={settings.twilio_whatsapp_from || ''}
                        onChange={e => setSettings(s => ({ ...s, twilio_whatsapp_from: e.target.value }))}
                        placeholder="whatsapp:+14155238886" style={inputStyle} />
                      <p style={{ margin:'4px 0 0', fontSize:11, color:C.faint }}>Twilio sandbox or approved WhatsApp number with <code style={{ background:C.code, padding:'1px 4px', borderRadius:3 }}>whatsapp:</code> prefix.</p>
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

      {canTestPush && (
        <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden', boxShadow:C.shadow, marginTop:16 }}>
          <div style={{ padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:C.title }}>Mobile Push (Staff App)</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
                Sends a test FCM notification to staff devices registered for the current branch. Staff must be signed in on the mobile app with notifications allowed.
              </div>
            </div>
            <button type="button" disabled={testBusy.push} onClick={sendTestPush}
              style={{ padding:'10px 18px', borderRadius:8, border:'none', background: testBusy.push ? '#BFDBFE' : '#2563EB', color:'#fff', fontWeight:700, fontSize:13, cursor: testBusy.push ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
              {testBusy.push ? 'Sending…' : '▶ Send Test Push'}
            </button>
          </div>
        </div>
      )}

      {/* ── Message Templates ────────────────────────────────────────────── */}
      {isAdmin && (
        <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`, boxShadow:C.shadow }}>
          {/* Header */}
          <div style={{ padding:'16px 24px', borderBottom:`1px solid ${C.borderLight}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:C.title }}>Message Templates</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>
                Customize all SMS, WhatsApp, and Email messages sent when connected — appointments, payments, walk-in queue, and more. Use <code style={{ background:C.code, padding:'1px 5px', borderRadius:4 }}>{'{variable}'}</code> placeholders.
              </div>
            </div>
            {tplLoading && <span style={{ fontSize:12, color:C.faint }}>Loading…</span>}
          </div>

          {/* Template cards grouped by event */}
          <div style={{ padding:'16px 24px', display:'flex', flexDirection:'column', gap:12 }}>
            {(() => {
              const groups = {};
              templates.forEach(t => {
                if (!groups[t.event_type]) groups[t.event_type] = [];
                groups[t.event_type].push(t);
              });
              const orderedEvents = [
                ...TEMPLATE_EVENT_ORDER.filter(evt => groups[evt]),
                ...Object.keys(groups).filter(evt => !TEMPLATE_EVENT_ORDER.includes(evt)).sort(),
              ];
              return orderedEvents.map((evt) => {
                const CH_ORDER = { email: 0, whatsapp: 1, sms: 2 };
                const list = [...groups[evt]].sort((a, b) => (CH_ORDER[a.channel] ?? 9) - (CH_ORDER[b.channel] ?? 9));
                return (
                <div key={evt} style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'10px 16px', background:C.tpl.groupHdr, borderBottom:`1px solid ${C.border}`, fontSize:13, fontWeight:700, color:C.title }}>
                    {EVENT_LABELS[evt] || evt}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                    {list.map((tpl, idx) => {
                      const CH = { email:{ bg:'#EFF6FF', color:'#1D4ED8', label:'Email' }, whatsapp:{ bg:'#DCFCE7', color:'#166534', label:'WhatsApp' }, sms:{ bg:'#FEF3C7', color:'#B45309', label:'SMS' } };
                      const ch = CH[tpl.channel] || { bg:'#F2F4F7', color:'#64748B', label:tpl.channel };
                      return (
                        <div key={`${tpl.channel}-${tpl.id || 'system'}`} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderTop: idx > 0 ? `1px solid ${C.tpl.rowBorder}` : 'none', background:C.tpl.row }}>
                          <span style={{ flexShrink:0, padding:'3px 10px', borderRadius:10, fontSize:11, fontWeight:700, background:ch.bg, color:ch.color, minWidth:72, textAlign:'center' }}>{ch.label}</span>
                          {tpl.is_default && (
                            <span style={{ flexShrink:0, padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, background:'#DCFCE7', color:'#166534' }}>Selected</span>
                          )}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:C.label }}>{tpl.name || 'Template'}</div>
                            <div style={{ fontSize:11, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>
                              {tpl.channel === 'email' && tpl.subject
                                ? `Subject: ${tpl.subject}`
                                : (tpl.body || '').replace(/<[^>]+>/g, '').slice(0, 100) + ((tpl.body || '').length > 100 ? '…' : '')}
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:8, marginLeft:'auto', flexShrink:0 }}>
                            {!tpl.is_default && (
                              <button type="button" onClick={() => selectTpl(tpl)}
                                style={{ padding:'5px 12px', borderRadius:7, border:'1.5px solid #16A34A', background:C.card, fontSize:12, fontWeight:700, color:'#15803D', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                                Use this
                              </button>
                            )}
                            {tpl.is_custom ? (
                              <>
                                <button type="button" onClick={() => openEditTpl(tpl)}
                                  style={{ padding:'5px 14px', borderRadius:7, border:'none', background:'#2563EB', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                                  Edit
                                </button>
                                <button type="button" onClick={() => deleteTpl(tpl)}
                                  style={{ padding:'5px 12px', borderRadius:7, border:'1.5px solid #FCA5A5', background:C.card, fontSize:12, fontWeight:600, color:'#DC2626', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                                  Delete
                                </button>
                              </>
                            ) : (
                              <button type="button" onClick={() => createTplVariant(tpl)}
                                style={{ padding:'5px 14px', borderRadius:7, border:'none', background:'#2563EB', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                                Edit / customize
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              });
            })()}
          </div>
        </div>
      )}

      {/* ── Template Edit Modal ─────────────────────────────────────────────── */}
      {tplOpen && editTpl && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, background:C.overlay, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => { if (e.target === e.currentTarget) setTplOpen(false); }}>
          <div style={{ background:C.modal.bg, borderRadius:16, width:'100%', maxWidth:680, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:C.shadow, border:`1px solid ${C.modal.border}` }}>
            {/* Modal header */}
            <div style={{ padding:'20px 24px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:C.title }}>
                  {editTpl.id ? 'Edit Template' : 'New Template'} — {EVENT_LABELS[editTpl.event_type] || editTpl.event_type}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                  {(() => { const CH={email:{bg:'#EFF6FF',color:'#1D4ED8',label:'Email'},whatsapp:{bg:'#DCFCE7',color:'#166534',label:'WhatsApp'},sms:{bg:'#FEF3C7',color:'#B45309',label:'SMS'}}; const ch=CH[editTpl.channel]||{bg:'#F2F4F7',color:'#64748B',label:editTpl.channel}; return <span style={{padding:'2px 10px',borderRadius:8,fontSize:11,fontWeight:700,background:ch.bg,color:ch.color}}>{ch.label}</span>; })()}
                  <span style={{ fontSize:12, color:C.faint }}>Channel</span>
                </div>
              </div>
              <button type="button" onClick={() => setTplOpen(false)}
                style={{ width:32, height:32, borderRadius:8, border:`1.5px solid ${C.inputBorder}`, background:C.ghostBtnBg, cursor:'pointer', fontSize:18, color:C.muted, display:'flex', alignItems:'center', justifyContent:'center' }}>
                ×
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding:'20px 24px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>Template Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="e.g. Friendly reminder, Holiday message"
                  maxLength={120}
                  style={{ ...inputStyle, width:'100%' }} />
              </div>

              {/* Subject (email only) */}
              {editTpl.channel === 'email' && (
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:600, color:C.label, marginBottom:5 }}>Subject Line</label>
                  <input type="text" value={editSubject} onChange={e => setEditSubject(e.target.value)}
                    placeholder="e.g. Appointment Confirmed — {branch_name}"
                    style={{ ...inputStyle, width:'100%' }} />
                </div>
              )}

              {/* Body */}
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                  <label style={{ fontSize:12, fontWeight:600, color:C.label }}>
                    Message Body {editTpl.channel === 'email' ? '(HTML supported)' : ''}
                  </label>
                  {editTpl.channel === 'sms' ? (() => {
                    const est = estimateSmsParts(editBody);
                    const costHint = est.parts > 0 ? ` · ~Rs ${(est.parts * 1.35).toFixed(2)}` : '';
                    const warn = est.parts > 1 || est.encoding === 'Unicode';
                    return (
                      <span style={{ fontSize:11, fontWeight:600, color: warn ? '#B45309' : C.faint }}>
                        {est.chars} chars · {est.encoding} · {est.parts} SMS part{est.parts === 1 ? '' : 's'}{costHint}
                      </span>
                    );
                  })() : (
                    <span style={{ fontSize:11, color:C.faint }}>{editBody.length} chars</span>
                  )}
                </div>
                <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={editTpl.channel === 'email' ? 12 : 8}
                  style={{ ...inputStyle, width:'100%', fontFamily:'monospace', fontSize:12, lineHeight:1.5, resize:'vertical' }} />
                {editTpl.channel === 'sms' && estimateSmsParts(editBody).parts > 1 && (
                  <div style={{ marginTop:8, padding:'8px 12px', background:'#FEF3C7', borderRadius:8, fontSize:11, color:'#92400E', lineHeight:1.45 }}>
                    This message bills as {estimateSmsParts(editBody).parts} parts (providers charge per part).
                    Keep English under 160 chars, no Sinhala/emoji — Unicode drops the limit to 70 chars/part.
                  </div>
                )}
              </div>

              {/* Variable hints */}
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:6 }}>Click to insert variable:</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {templateVariablesFor(editTpl.event_type).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => insertVar(key)}
                      style={{ padding:'4px 10px', borderRadius:6, border:'1.5px solid #C7D2FE', background:'#EEF2FF', fontSize:11, fontWeight:600, color:'#4338CA', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                      {'{' + key + '}'} <span style={{ fontWeight:400, color:'#6366F1', fontSize:10 }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview note */}
              {editTpl.channel === 'whatsapp' && (
                <div style={{ padding:'10px 14px', background:'#FEF3C7', borderRadius:8, fontSize:11, color:'#92400E' }}>
                  For WhatsApp: use *bold*, _italic_.
                </div>
              )}
              {editTpl.channel === 'sms' && (
                <div style={{ padding:'10px 14px', background:'#FEF3C7', borderRadius:8, fontSize:11, color:'#92400E' }}>
                  SMS tip: English only, under 160 chars = 1 part (~Rs 1.35). Sinhala/emoji = Unicode (70 chars/part) and cost doubles fast.
                </div>
              )}
              {editTpl.channel === 'email' && (
                <div style={{ padding:'10px 14px', background:'#EFF6FF', borderRadius:8, fontSize:11, color:'#1E40AF' }}>
                  💡 HTML is supported. The content is automatically wrapped in the branded email template. Use inline styles for formatting.
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding:'16px 24px', borderTop:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexShrink:0, background:C.modal.footer }}>
              <div style={{ display:'flex', gap:10, marginLeft:'auto' }}>
                <button type="button" onClick={() => setTplOpen(false)}
                  style={{ padding:'8px 18px', borderRadius:8, border:`1.5px solid ${C.inputBorder}`, background:C.card, fontSize:13, fontWeight:600, color:C.label, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  Cancel
                </button>
                <button type="button" onClick={saveTpl} disabled={tplBusy}
                  style={{ padding:'8px 22px', borderRadius:8, border:'none', background: tplBusy ? '#93C5FD' : '#2563EB', fontSize:13, fontWeight:700, color:'#fff', cursor: tplBusy ? 'not-allowed' : 'pointer', fontFamily:"'Inter',sans-serif" }}>
                  {tplBusy ? 'Saving…' : (editTpl.id ? 'Save Changes' : 'Create Template')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Table */}
      <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden', boxShadow:C.shadow }}>
        <div style={{ padding:'16px 24px', borderBottom:`1px solid ${C.borderLight}` }}>
          <div style={{ fontSize:15, fontWeight:700, color:C.title, marginBottom:12 }}>Notification Log</div>
          <FilterBar>
            <select value={filterEv} onChange={e=>{ setFilterEv(e.target.value); setLogPage(1); }} className="pk-filter-control">
              <option value="">All Events</option>
              {EVENTS.map(ev => <option key={ev} value={ev}>{EVENT_LABELS[ev]}</option>)}
            </select>
            <select value={filterCh} onChange={e=>{ setFilterCh(e.target.value); setLogPage(1); }} className="pk-filter-control">
              <option value="">All Channels</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
            <select value={filterSt} onChange={e=>{ setFilterSt(e.target.value); setLogPage(1); }} className="pk-filter-control">
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
            {(filterEv||filterCh||filterSt) && <Button variant="ghost" size="sm" onClick={() => { setFilterEv(''); setFilterCh(''); setFilterSt(''); setLogPage(1); }}>Clear</Button>}
            <span style={{ marginLeft:'auto', fontSize:13, color:C.muted, fontFamily:"'Inter',sans-serif" }}>{logTotal} record{logTotal!==1?'s':''}</span>
          </FilterBar>
        </div>

        <DataTable noShell compact
          columns={[
            { accessorKey:'event_type', header:'Event Type', meta:{ width:'15%' },
              cell: ({ getValue }) => {
                const t = getValue();
                const ev = EV_COLOR[t] || { bg:'#F2F4F7', color:'#64748B' };
                return <span style={{ padding:'3px 10px', borderRadius:10, fontSize:11, fontWeight:700, background:ev.bg, color:ev.color, whiteSpace:'nowrap' }}>{EVENT_LABELS[t]||t}</span>;
              }
            },
            { id:'company', header:'Branch / Company', meta:{ width:'14%' },
              accessorFn: r => r.company_name || r.branch?.name || '',
              cell: ({ getValue }) => <span style={{ fontSize:12, fontWeight:600, color:C.label }}>{getValue() || '—'}</span>
            },
            { id:'customer', header:'Customer', meta:{ width:'14%' },
              accessorFn: r => r.customer_name || '',
              cell: ({ getValue }) => <span style={{ fontSize:13, fontWeight:600, color:C.title }}>{getValue() || '—'}</span>
            },
            { accessorKey:'channel', header:'Channel', meta:{ width:'12%' },
              cell: ({ getValue }) => {
                const ch = CH_COLOR[getValue()] || { bg:'#F2F4F7', color:'#64748B', label:getValue()||'' };
                return <span style={{ padding:'3px 10px', borderRadius:10, fontSize:11, fontWeight:600, background:ch.bg, color:ch.color }}>{ch.label}</span>;
              }
            },
            { accessorKey:'message_preview', header:'Message', meta:{ width:'22%' },
              cell: ({ getValue }) => <span style={{ fontSize:12, color:C.muted, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{getValue()||''}</span>
            },
            { id:'sentAt', header:'Sent At', meta:{ width:'12%' },
              accessorFn: r => r.createdAt || '',
              cell: ({ getValue }) => <span style={{ fontSize:12, color:C.faint, whiteSpace:'nowrap' }}>{getValue() ? new Date(getValue()).toLocaleString('en-US',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</span>
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
          searchableColumns={[
            { id: 'customer', title: 'Customer' },
            { id: 'company', title: 'Branch' },
          ]}
        />

        {logPages > 1 && (
          <div style={{ display:'flex', gap:6, padding:'12px 16px', justifyContent:'center', borderTop:`1px solid ${C.pag.border}`, background:C.soft }}>
            {Array.from({ length: Math.min(logPages, 10) }, (_, i) => (
              <button key={i} onClick={() => setLogPage(i+1)}
                style={{ width:34, height:34, borderRadius:8, border:'1.5px solid', cursor:'pointer', fontWeight:600, fontSize:13, fontFamily:"'Inter',sans-serif", transition:'all 0.15s',
                  borderColor: logPage===i+1 ? '#2563EB' : C.inputBorder,
                  background:  logPage===i+1 ? '#2563EB' : C.pag.btnBg,
                  color:       logPage===i+1 ? '#fff' : C.pag.btnText }}>
                {i+1}
              </button>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
