import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

/* ── Plan accents (matches BillingPaymentPage) ───────────────────────────── */
const PLAN_ACCENT = {
  basic:      { color: '#2563EB', gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)' },
  pro:        { color: '#7C3AED', gradient: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)' },
  enterprise: { color: '#059669', gradient: 'linear-gradient(135deg, #064E3B 0%, #059669 100%)' },
};
const ACCENT_DEFAULT = { color: '#047857', gradient: 'linear-gradient(135deg, #064E3B 0%, #047857 100%)' };

/* ── SVG Icons ────────────────────────────────────────────────────────────── */
const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const IconUpload = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const IconFile = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
);
const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconArrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const IconShield = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
  </svg>
);
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconBank = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18"/><path d="M3 10h18"/><path d="M12 3l9 7H3l9-7z"/>
    <line x1="5" y1="10" x2="5" y2="21"/><line x1="9" y1="10" x2="9" y2="21"/>
    <line x1="15" y1="10" x2="15" y2="21"/><line x1="19" y1="10" x2="19" y2="21"/>
  </svg>
);

/* ── Shared input style ───────────────────────────────────────────────────── */
const inputBase = {
  width: '100%', padding: '11px 14px',
  border: '1.5px solid #E5E7EB', borderRadius: 12,
  fontSize: 13.5, fontWeight: 500, color: '#1F2937',
  outline: 'none', boxSizing: 'border-box',
  fontFamily: "'Inter', sans-serif",
  background: '#FAFBFC',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};
const inputFocusStyle = (accent) => ({
  borderColor: accent, boxShadow: `0 0 0 3px ${accent}18`,
});

/* ═══════════════════════════════════════════════════════════════════════════ */
const BankSlipUploadPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planParam = searchParams.get('plan');
  const fileInputRef = useRef(null);

  const accent = PLAN_ACCENT[planParam] || ACCENT_DEFAULT;

  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [bankSlips, setBankSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [focusedField, setFocusedField] = useState(null);
  const [apiPlans, setApiPlans] = useState([]);

  useEffect(() => { fetchBankSlipStatus(); }, []);

  useEffect(() => {
    api.get('/public/plans')
      .then((res) => setApiPlans(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  const planMeta = useMemo(() => {
    const found = apiPlans.find((p) => p.key === planParam);
    if (!found) return null;
    const now = new Date();
    const offerLive = found.offer_active && found.offer_price_display &&
      (!found.offer_ends_at || new Date(found.offer_ends_at) > now);
    return {
      label: found.label,
      price: offerLive ? found.offer_price_display : (found.price_display || 'Custom'),
      originalPrice: offerLive ? found.price_display : null,
      offerBadge: offerLive ? (found.offer_badge || null) : null,
      period: found.price_period || '',
    };
  }, [planParam, apiPlans]);

  const planPrice = planMeta?.price;
  useEffect(() => {
    if (!planPrice) return;
    const numeric = planPrice.replace(/[^0-9]/g, '');
    if (numeric) setAmount(numeric);
  }, [planPrice]);

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

  /* ── File handling ─────── */
  const validateFile = (f) => {
    if (f.size > 5 * 1024 * 1024) { toast.error('File size exceeds 5 MB limit'); return false; }
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(f.type)) {
      toast.error('Only JPEG, PNG, and PDF files are allowed'); return false;
    }
    return true;
  };
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f && validateFile(f)) setFile(f);
  };
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && validateFile(f)) setFile(f);
  };

  /* ── Submit ─────── */
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
      setFile(null); setAmount(''); setBankName(''); setTransactionDate(''); setNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchBankSlipStatus();
      const invoiceId = res.data?.invoice?.id;
      navigate(invoiceId ? `/billing/invoices?new=${invoiceId}` : '/billing/invoices');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  /* ── Status helpers ─────── */
  const statusConfig = {
    approved: { bg: '#ECFDF5', border: '#A7F3D0', color: '#047857', label: 'Approved', icon: <IconCheck /> },
    rejected: { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', label: 'Rejected', icon: <IconX /> },
    pending:  { bg: '#FFFBEB', border: '#FDE68A', color: '#B45309', label: 'Pending', icon: <IconClock /> },
  };

  const fileSize = file ? (file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(0)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`) : '';

  return (
    <PageWrapper
      title=""
      subtitle=""
      actions={
        <button
          onClick={() => navigate('/billing')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: '#fff',
            border: '1.5px solid #E5E7EB', borderRadius: 10,
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            color: '#667085', fontFamily: "'Inter', sans-serif",
            transition: 'all 0.15s',
          }}
        >
          <IconBack /> Back to Payment
        </button>
      }
    >
      <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Plan Hero (if plan selected) ──────────────────────────────────── */}
        {planParam && (
          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            style={{
              background: accent.gradient, borderRadius: 20, padding: '26px 28px',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -20, right: 60, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-block', background: 'rgba(255,255,255,0.18)',
                color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '3px 10px', borderRadius: 99,
                border: '1px solid rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif",
              }}>
                Bank Transfer
              </span>
              {planMeta?.offerBadge && (
                <span style={{
                  display: 'inline-block',
                  background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
                  color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
                  textTransform: 'uppercase', padding: '3px 10px', borderRadius: 99,
                  boxShadow: '0 2px 8px rgba(239,68,68,0.4)', fontFamily: "'Inter', sans-serif",
                }}>
                  🔥 {planMeta.offerBadge}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 24, fontWeight: 900, color: '#fff', fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.4px' }}>
                {planMeta?.label || (planParam.charAt(0).toUpperCase() + planParam.slice(1))}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 30, fontWeight: 900, color: '#fff', fontFamily: "'Sora', sans-serif" }}>
                {planMeta?.price || '—'}
              </span>
              {planMeta?.originalPrice && (
                <span style={{
                  fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
                  textDecoration: 'line-through', fontFamily: "'Sora', sans-serif",
                }}>
                  {planMeta.originalPrice}
                </span>
              )}
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
                {planMeta?.period || ''}
              </span>
            </div>
            <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
              Upload your bank transfer slip below. Your subscription will be activated after admin approval.
            </p>
          </motion.div>
        )}

        {/* ── Upload Form Card ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          style={{
            background: '#fff', borderRadius: 20, padding: '28px 28px 24px',
            border: '1.5px solid #E5E7EB',
            boxShadow: '0 1px 4px rgba(16,24,40,0.04)',
          }}
        >
          {/* Section header */}
          <div style={{ marginBottom: 22 }}>
            <h2 style={{
              margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#101828',
              fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.3px',
            }}>
              Upload Payment Proof
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: '#667085', fontFamily: "'Inter', sans-serif" }}>
              Fill in the details and attach your bank slip.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* ── Drag-and-drop file zone ── */}
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: '#344054', fontFamily: "'Inter', sans-serif", letterSpacing: '0.01em' }}>
                Bank Slip Document <span style={{ color: '#DC2626' }}>*</span>
              </label>

              <AnimatePresence mode="wait">
                {!file ? (
                  <motion.div
                    key="dropzone"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? accent.color : '#D0D5DD'}`,
                      borderRadius: 16, padding: '32px 20px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                      cursor: 'pointer',
                      background: dragOver ? `${accent.color}08` : '#FAFBFC',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ color: dragOver ? accent.color : '#98A2B3', transition: 'color 0.2s' }}>
                      <IconUpload />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: accent.color, fontFamily: "'Inter', sans-serif" }}>
                        Click to upload
                      </span>
                      <span style={{ fontSize: 13.5, color: '#667085', fontFamily: "'Inter', sans-serif" }}>
                        {' '}or drag and drop
                      </span>
                    </div>
                    <span style={{ fontSize: 11.5, color: '#98A2B3', fontFamily: "'Inter', sans-serif" }}>
                      JPEG, PNG or PDF (max 5 MB)
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="filecard"
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', borderRadius: 14,
                      background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                      border: '1.5px solid #A7F3D0',
                    }}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                      background: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                    }}>
                      <IconFile />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: '#065F46',
                        fontFamily: "'Inter', sans-serif",
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#059669', fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
                        {fileSize} — Ready to upload
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      style={{
                        width: 30, height: 30, borderRadius: 8, border: 'none',
                        background: 'rgba(220,38,38,0.1)', color: '#DC2626',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
                      }}
                    >
                      <IconX />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Two-column: Amount + Bank ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: '#344054', fontFamily: "'Inter', sans-serif" }}>
                  Amount (LKR) <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="number" step="0.01"
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  onFocus={() => setFocusedField('amount')} onBlur={() => setFocusedField(null)}
                  placeholder="e.g. 2900.00"
                  style={{ ...inputBase, ...(focusedField === 'amount' ? inputFocusStyle(accent.color) : {}) }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: '#344054', fontFamily: "'Inter', sans-serif" }}>
                  Bank Name
                </label>
                <input
                  type="text"
                  value={bankName} onChange={(e) => setBankName(e.target.value)}
                  onFocus={() => setFocusedField('bank')} onBlur={() => setFocusedField(null)}
                  placeholder="e.g. Bank of Ceylon"
                  style={{ ...inputBase, ...(focusedField === 'bank' ? inputFocusStyle(accent.color) : {}) }}
                />
              </div>
            </div>

            {/* ── Transaction Date + Notes ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: '#344054', fontFamily: "'Inter', sans-serif" }}>
                  Transaction Date <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="date"
                  value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)}
                  onFocus={() => setFocusedField('date')} onBlur={() => setFocusedField(null)}
                  style={{ ...inputBase, ...(focusedField === 'date' ? inputFocusStyle(accent.color) : {}) }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: '#344054', fontFamily: "'Inter', sans-serif" }}>
                  Additional Notes
                </label>
                <input
                  type="text"
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  onFocus={() => setFocusedField('notes')} onBlur={() => setFocusedField(null)}
                  placeholder="Any additional info…"
                  style={{ ...inputBase, ...(focusedField === 'notes' ? inputFocusStyle(accent.color) : {}) }}
                />
              </div>
            </div>

            {/* ── Submit Button ── */}
            <motion.button
              type="submit"
              disabled={uploading || !file || !amount || !transactionDate}
              whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.995 }}
              style={{
                width: '100%', padding: '14px 0', marginTop: 4,
                background: (uploading || !file || !amount || !transactionDate) ? '#D0D5DD' : accent.color,
                color: '#fff', border: 'none', borderRadius: 14,
                fontSize: 15, fontWeight: 800,
                cursor: (uploading || !file || !amount || !transactionDate) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: (uploading || !file || !amount || !transactionDate) ? 'none' : `0 6px 24px ${accent.color}40`,
                transition: 'all 0.2s ease',
                fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '0.01em',
                opacity: uploading ? 0.7 : 1,
              }}
            >
              {uploading ? 'Uploading…' : 'Upload Bank Slip'} <IconArrow />
            </motion.button>
          </form>
        </motion.div>

        {/* ── Upload History ────────────────────────────────────────────────── */}
        {(!loading && bankSlips.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.16 }}
            style={{
              background: '#fff', borderRadius: 20, padding: '24px 28px',
              border: '1.5px solid #E5E7EB',
              boxShadow: '0 1px 4px rgba(16,24,40,0.04)',
            }}
          >
            <h3 style={{
              margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: '#101828',
              fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.2px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <IconClock /> Upload History
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bankSlips.map((slip, i) => {
                const sc = statusConfig[slip.status] || statusConfig.pending;
                return (
                  <motion.div
                    key={slip.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', borderRadius: 14,
                      border: `1.5px solid ${sc.border}`,
                      background: sc.bg,
                    }}
                  >
                    {/* Bank icon */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: '#fff', border: `1.5px solid ${sc.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: sc.color,
                    }}>
                      <IconBank />
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#1F2937', fontFamily: "'Sora', sans-serif" }}>
                          LKR {parseFloat(slip.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 9px', borderRadius: 99,
                          fontSize: 10.5, fontWeight: 700,
                          background: `${sc.color}15`, color: sc.color,
                          border: `1px solid ${sc.color}30`,
                          fontFamily: "'Inter', sans-serif",
                        }}>
                          {sc.icon} {sc.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#667085', marginTop: 4, fontFamily: "'Inter', sans-serif" }}>
                        {slip.bank_name || 'Unknown bank'} · {new Date(slip.transaction_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </div>

                    {/* Upload date */}
                    <div style={{ fontSize: 11, color: '#98A2B3', fontFamily: "'Inter', sans-serif", flexShrink: 0, textAlign: 'right' }}>
                      {new Date(slip.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Security footer ── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 0', color: '#98A2B3', fontSize: 12, fontFamily: "'Inter', sans-serif",
          }}
        >
          <IconShield />
          <span>Your files are encrypted and securely stored.</span>
        </motion.div>
      </div>
    </PageWrapper>
  );
};

export default BankSlipUploadPage;
