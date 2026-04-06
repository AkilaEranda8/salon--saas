import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { FilterBar, DataTable, IconBell } from '../components/ui/PageKit';

const EVENTS = ['appointment_confirmed','payment_receipt','loyalty_points'];
const EVENT_LABELS = { appointment_confirmed:'Appointment Confirmed', payment_receipt:'Payment Receipt', loyalty_points:'Loyalty Points' };
const EVENT_CHANNELS = { appointment_confirmed:['email','whatsapp'], payment_receipt:['email','whatsapp'], loyalty_points:['whatsapp'] };
const SETTINGS_KEY = {
  appointment_confirmed_email:'appt_confirmed_email', appointment_confirmed_whatsapp:'appt_confirmed_whatsapp',
  payment_receipt_email:'payment_receipt_email', payment_receipt_whatsapp:'payment_receipt_whatsapp',
  loyalty_points_whatsapp:'loyalty_points_whatsapp',
};
const CH_COLOR = { email:{ bg:'#EFF6FF', color:'#1D4ED8', label:'Email' }, whatsapp:{ bg:'#DCFCE7', color:'#166534', label:'WhatsApp' } };
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
  const [settings, setSettings]       = useState({});
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [logs, setLogs]               = useState([]);
  const [logTotal, setLogTotal]       = useState(0);
  const [logPage, setLogPage]         = useState(1);
  const [logLoading, setLogLoading]   = useState(false);
  const [filterCh, setFilterCh]       = useState('');
  const [filterSt, setFilterSt]       = useState('');
  const [filterEv, setFilterEv]       = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/notifications/settings').then(r => setSettings(r.data||{})).catch(() => {});
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
    try { await api.put('/notifications/settings', settings); toast('Settings saved.', 'success'); }
    catch { toast('Failed to save settings.', 'error'); }
    setSettingsBusy(false);
  };

  const logPages = Math.ceil(logTotal / 20);

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
                    <th style={{ textAlign:'left', padding:'10px 0', fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', width:'55%' }}>Event</th>
                    <th style={{ textAlign:'center', padding:'10px 0', fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', width:'22.5%' }}>Email</th>
                    <th style={{ textAlign:'center', padding:'10px 0', fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', width:'22.5%' }}>WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {EVENTS.map(ev => {
                    const channels = EVENT_CHANNELS[ev] || [];
                    const emailKey = SETTINGS_KEY[`${ev}_email`];
                    const waKey    = SETTINGS_KEY[`${ev}_whatsapp`];
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
                <Button onClick={saveSettings} disabled={settingsBusy}>{settingsBusy ? 'Saving' : 'Save Settings'}</Button>
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
