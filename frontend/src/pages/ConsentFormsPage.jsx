import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = ['general', 'chemical_treatment', 'skin_care', 'allergy', 'medical', 'other'];

export default function ConsentFormsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canAdmin = ['superadmin', 'admin'].includes(user?.role);

  const [tab, setTab]           = useState('forms');
  const [forms, setForms]       = useState([]);
  const [records, setRecords]   = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [showFormEditor, setShowFormEditor] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [expandedForm, setExpandedForm] = useState(null);

  const blank = { title: '', body_text: '', category: 'general', requires_signature: true, version: '1.0' };
  const [fData, setFData] = useState(blank);

  const loadForms = useCallback(() => {
    api.get('/consent/forms').then((r) => setForms(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const loadRecords = useCallback(() => {
    setLoading(true);
    api.get('/consent/records').then((r) => setRecords(Array.isArray(r.data) ? r.data : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadForms(); loadRecords(); }, [loadForms, loadRecords]);

  const saveForm = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editForm) {
        await api.put(`/consent/forms/${editForm.id}`, fData);
        addToast('Form updated', 'success');
      } else {
        await api.post('/consent/forms', fData);
        addToast('Form created', 'success');
      }
      setShowFormEditor(false);
      setEditForm(null);
      setFData(blank);
      loadForms();
    } catch (err) { addToast(err.response?.data?.message || 'Error', 'error'); }
    setSaving(false);
  };

  const viewRecord = async (id) => {
    try {
      const r = await api.get(`/consent/records/${id}`);
      setSelectedRecord(r.data);
    } catch { addToast('Could not load record', 'error'); }
  };

  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' };

  return (
    <PageWrapper
      title="Digital Consent Forms"
      subtitle="Manage consent form templates and view signed records"
      actions={
        canAdmin && tab === 'forms'
          ? <Button onClick={() => { setEditForm(null); setFData(blank); setShowFormEditor(true); }}>+ New Form</Button>
          : null
      }
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[{ k: 'forms', label: '📝 Form Templates' }, { k: 'records', label: '✅ Signed Records' }].map(({ k, label }) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 20px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: tab === k ? '#2563EB' : '#F3F4F6', color: tab === k ? '#fff' : '#374151' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Form Editor */}
      {showFormEditor && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>{editForm ? 'Edit Consent Form' : 'New Consent Form'}</h3>
          <form onSubmit={saveForm}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Form Title *</label>
                <input style={inp} value={fData.title} onChange={(e) => setFData((p) => ({ ...p, title: e.target.value }))} required placeholder="e.g. Chemical Treatment Consent" />
              </div>
              <div>
                <label style={lbl}>Category</label>
                <select style={inp} value={fData.category} onChange={(e) => setFData((p) => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Version</label>
                <input style={inp} value={fData.version} onChange={(e) => setFData((p) => ({ ...p, version: e.target.value }))} placeholder="1.0" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="req_sig" checked={fData.requires_signature} onChange={(e) => setFData((p) => ({ ...p, requires_signature: e.target.checked }))} />
                <label htmlFor="req_sig" style={{ fontSize: 13, cursor: 'pointer' }}>Requires digital signature</label>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Body Text / Form Content *</label>
                <textarea
                  style={{ ...inp, height: 180, resize: 'vertical', lineHeight: 1.6 }}
                  value={fData.body_text}
                  onChange={(e) => setFData((p) => ({ ...p, body_text: e.target.value }))}
                  required
                  placeholder="I, the undersigned, hereby consent to the following treatment procedures…"
                />
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Tip: Use {{customer_name}}, {{date}}, {{service_name}} placeholders — they will be auto-filled when signing.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editForm ? 'Update Form' : 'Create Form'}</Button>
              <button type="button" onClick={() => { setShowFormEditor(false); setEditForm(null); }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Form Templates list */}
      {tab === 'forms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {forms.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12 }}>No consent form templates yet.</div>
          )}
          {forms.map((f) => (
            <div key={f.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer' }} onClick={() => setExpandedForm(expandedForm === f.id ? null : f.id)}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#101828' }}>{f.title}</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 11, background: '#EFF6FF', color: '#1D4ED8', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>{f.category?.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>v{f.version}</span>
                    {f.requires_signature && <span style={{ fontSize: 11, background: '#F3E8FF', color: '#7C3AED', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>✍ Signature required</span>}
                    {!f.is_active && <span style={{ fontSize: 11, background: '#FEE2E2', color: '#DC2626', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>Inactive</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {canAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); setEditForm(f); setFData(f); setShowFormEditor(true); }}
                      style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Edit</button>
                  )}
                  <span style={{ color: '#9CA3AF', fontSize: 18 }}>{expandedForm === f.id ? '▲' : '▼'}</span>
                </div>
              </div>
              {expandedForm === f.id && (
                <div style={{ borderTop: '1px solid #F3F4F6', padding: '14px 18px', background: '#FAFAFA' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: '#374151', lineHeight: 1.7 }}>{f.body_text}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Signed Records */}
      {tab === 'records' && (
        loading ? <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>Loading…</div> : (
          <>
            {records.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12 }}>No signed consent records yet.</div>
            )}
            {records.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E7EB', background: '#F9FAFB' }}>
                      {['Customer', 'Form', 'Signed At', 'Appointment', 'Signature', 'Actions'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.customer?.name || '—'}<div style={{ fontSize: 11, color: '#9CA3AF' }}>{r.customer?.phone}</div></td>
                        <td style={{ padding: '10px 12px' }}>{r.form?.title || '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12 }}>{r.signed_at ? new Date(r.signed_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12 }}>#{r.appointment_id || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {r.signature_data ? <span style={{ fontSize: 11, background: '#D1FAE5', color: '#065F46', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>✅ Signed</span> : <span style={{ fontSize: 11, color: '#9CA3AF' }}>Unsigned</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button onClick={() => viewRecord(r.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}

      {/* Record Detail Modal */}
      {selectedRecord && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{selectedRecord.form?.title}</h2>
              <button onClick={() => setSelectedRecord(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6B7280' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>CUSTOMER</div>
                <div style={{ fontWeight: 700 }}>{selectedRecord.customer?.name}</div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>{selectedRecord.customer?.phone}</div>
              </div>
              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>SIGNED AT</div>
                <div style={{ fontWeight: 600 }}>{selectedRecord.signed_at ? new Date(selectedRecord.signed_at).toLocaleString() : '—'}</div>
              </div>
            </div>
            <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>FORM CONTENT AT TIME OF SIGNING</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
                {selectedRecord.form_snapshot
                  ? (typeof selectedRecord.form_snapshot === 'string' ? selectedRecord.form_snapshot : selectedRecord.form_snapshot?.body_text)
                  : selectedRecord.form?.body_text}
              </pre>
            </div>
            {selectedRecord.signature_data && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>DIGITAL SIGNATURE</div>
                <img
                  src={selectedRecord.signature_data.startsWith('data:') ? selectedRecord.signature_data : `data:image/png;base64,${selectedRecord.signature_data}`}
                  alt="Signature"
                  style={{ border: '1px solid #D1D5DB', borderRadius: 8, maxWidth: '100%', background: '#fff' }}
                />
              </div>
            )}
            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button onClick={() => setSelectedRecord(null)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
