import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import usePageTheme from '../hooks/usePageTheme';

const G700 = '#2563EB';

function SectionCard({ title, subtitle, icon, children, C }) {
  return (
    <div style={{
      background: C.cardBg,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: C.shadow,
    }}>
      <div style={{
        padding: '16px 22px',
        borderBottom: `1px solid ${C.border}`,
        background: C.headerGrad,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Sora','Manrope',sans-serif" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, fontFamily: "'Inter',sans-serif" }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: '24px 22px' }}>{children}</div>
    </div>
  );
}

function pwStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLOR = ['', '#EF4444', '#F59E0B', '#3B82F6', '#10B981'];

function StrengthBar({ score }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 4,
            background: score >= i ? STRENGTH_COLOR[score] : '#475569',
            transition: 'background .2s',
          }} />
        ))}
      </div>
      {score > 0 && (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: STRENGTH_COLOR[score] }}>
          {STRENGTH_LABEL[score]}
        </span>
      )}
    </div>
  );
}

function PwInput({ label, value, onChange, disabled, placeholder, C }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: C.label }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder || ''}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 42px 10px 14px',
            borderRadius: 10, border: `1.5px solid ${C.inputBorder}`,
            fontSize: 14, outline: 'none',
            background: disabled ? C.inputReadonlyBg : C.inputBg,
            color: C.inputText,
            fontFamily: "'Inter',sans-serif",
          }}
          onFocus={e => { e.target.style.borderColor = G700; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,.1)'; }}
          onBlur={e => { e.target.style.borderColor = C.inputBorder; e.target.style.boxShadow = 'none'; }}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.faint, fontSize: 14, padding: 0,
          }}
        >{show ? '\uD83D\uDE48' : '\uD83D\uDC41'}</button>
      </div>
    </div>
  );
}

function SecurityScore({ twoFaEnabled, passwordChanged, isDark }) {
  const score = useMemo(() => {
    let s = 0;
    if (twoFaEnabled)   s += 50;
    if (passwordChanged) s += 50;
    return s;
  }, [twoFaEnabled, passwordChanged]);

  const level = score >= 100 ? 'Strong' : score >= 50 ? 'Moderate' : 'Weak';
  const palettes = {
    strong: { color: '#10B981', bg: isDark ? 'rgba(16,185,129,0.12)' : '#D1FAE5', bd: isDark ? 'rgba(16,185,129,0.35)' : '#6EE7B7' },
    moderate: { color: '#F59E0B', bg: isDark ? 'rgba(245,158,11,0.12)' : '#FEF3C7', bd: isDark ? 'rgba(245,158,11,0.35)' : '#FCD34D' },
    weak: { color: '#EF4444', bg: isDark ? 'rgba(239,68,68,0.12)' : '#FEE2E2', bd: isDark ? 'rgba(239,68,68,0.35)' : '#FCA5A5' },
  };
  const p = score >= 100 ? palettes.strong : score >= 50 ? palettes.moderate : palettes.weak;

  return (
    <div style={{
      background: p.bg, borderRadius: 18, padding: '22px 28px',
      border: `2px solid ${p.bd}`, boxShadow: '0 2px 12px rgba(16,24,40,.06)',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Security Score
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: isDark ? '#F8FAFC' : '#111827' }}>
            {score}<span style={{ fontSize: 15, fontWeight: 600, color: isDark ? '#94A3B8' : '#6B7280' }}>/100</span>
          </div>
          <div style={{ fontSize: 13, color: p.color, fontWeight: 700, marginTop: 2 }}>{level}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, maxWidth: 340 }}>
          <CheckItem ok={twoFaEnabled}    label="Two-factor authentication enabled" isDark={isDark} />
          <CheckItem ok={passwordChanged} label="Password meets strength requirements" isDark={isDark} />
        </div>
      </div>
    </div>
  );
}

function CheckItem({ ok, label, isDark }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ok ? (isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5') : (isDark ? '#334155' : '#F3F4F6'),
        fontSize: 11, fontWeight: 800, color: ok ? '#059669' : (isDark ? '#64748B' : '#9CA3AF'),
      }}>
        {ok ? '\u2713' : '\u2013'}
      </div>
      <span style={{ fontSize: 13, color: ok ? (isDark ? '#E2E8F0' : '#111827') : (isDark ? '#64748B' : '#9CA3AF'), fontWeight: ok ? 600 : 400 }}>
        {label}
      </span>
    </div>
  );
}

function Sk({ h = 20, w = '100%', isDark }) {
  return <div style={{ height: h, width: w, background: isDark ? '#334155' : '#E5E7EB', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />;
}

function CodeInput({ value, onChange, disabled, C }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      maxLength={6}
      disabled={disabled}
      style={{
        width: 160,
        textAlign: 'center',
        fontSize: 28,
        fontWeight: 800,
        letterSpacing: 10,
        padding: '14px 16px',
        border: `2px solid ${C.inputBorder}`,
        borderRadius: 14,
        outline: 'none',
        fontFamily: 'monospace',
        background: disabled ? C.inputReadonlyBg : C.inputBg,
        color: C.inputText,
      }}
      onFocus={e => { e.target.style.borderColor = G700; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,.15)'; }}
      onBlur={e => { e.target.style.borderColor = C.inputBorder; e.target.style.boxShadow = 'none'; }}
    />
  );
}

export default function TwoFactorPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isDark, C } = usePageTheme();

  const [statusLoading, setStatusLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [step, setStep] = useState('idle');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew,     setCpNew]     = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpBusy,    setCpBusy]    = useState(false);
  const [cpChanged, setCpChanged] = useState(false);

  useEffect(() => {
    api.get('/auth/2fa/status')
      .then(r => setEnabled(!!r.data.enabled))
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const r = await api.post('/auth/2fa/setup');
      setQr(r.data.qr);
      setSecret(r.data.secret);
      setCode('');
      setStep('scan');
    } catch (e) {
      toast(e?.response?.data?.message || 'Failed to start setup.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    if (code.length !== 6) { toast('Enter the 6-digit code from your app.', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/auth/2fa/enable', { code });
      setEnabled(true);
      setStep('idle');
      setQr('');
      setSecret('');
      setCode('');
      toast('2FA enabled! Your account is now protected.', 'success');
    } catch (e) {
      toast(e?.response?.data?.message || 'Invalid code. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startDisable = () => {
    setCode('');
    setStep('disable_confirm');
  };

  const confirmDisable = async () => {
    if (code.length !== 6) { toast('Enter the 6-digit code from your app.', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/auth/2fa/disable', { code });
      setEnabled(false);
      setStep('idle');
      setCode('');
      toast('2FA disabled.', 'success');
    } catch (e) {
      toast(e?.response?.data?.message || 'Invalid code.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelSetup = () => {
    setStep('idle');
    setCode('');
    setQr('');
    setSecret('');
  };

  const handleChangePassword = async () => {
    if (!cpCurrent) { toast('Enter your current password.', 'error'); return; }
    if (cpNew.length < 8) { toast('New password must be at least 8 characters.', 'error'); return; }
    if (cpNew !== cpConfirm) { toast('Passwords do not match.', 'error'); return; }
    setCpBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: cpCurrent, newPassword: cpNew });
      toast('Password changed successfully!', 'success');
      setCpCurrent(''); setCpNew(''); setCpConfirm('');
      setCpChanged(true);
    } catch (e) {
      toast(e?.response?.data?.message || 'Failed to change password.', 'error');
    } finally { setCpBusy(false); }
  };

  const strength  = pwStrength(cpNew);
  const canSubmit = cpCurrent && cpNew.length >= 8 && cpNew === cpConfirm;

  const ghostBtn = {
    padding: '10px 18px', borderRadius: 10, border: `1.5px solid ${C.inputBorder}`,
    background: C.cardBg, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <PageWrapper title="Account Security" subtitle="Manage your password and two-factor authentication">
      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:.45} }`}</style>

      {!statusLoading && (
        <SecurityScore twoFaEnabled={enabled} passwordChanged={cpChanged} isDark={isDark} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 24, marginBottom: 24 }}>

        <SectionCard C={C} icon="🔑" title="Change Password" subtitle="Use a strong, unique password with mixed case, numbers and symbols.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PwInput label="Current Password" value={cpCurrent} onChange={setCpCurrent} disabled={cpBusy} placeholder="Enter your current password" C={C} />
            <div>
              <PwInput label="New Password" value={cpNew} onChange={setCpNew} disabled={cpBusy} placeholder="At least 8 characters" C={C} />
              {cpNew.length > 0 && <StrengthBar score={strength} />}
            </div>
            <PwInput label="Confirm New Password" value={cpConfirm} onChange={setCpConfirm} disabled={cpBusy} placeholder="Re-enter new password" C={C} />
            {cpNew && cpConfirm && cpNew !== cpConfirm && (
              <div style={{ fontSize: 12.5, color: '#EF4444', fontWeight: 600 }}>
                Passwords do not match
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <motion.button
                whileHover={canSubmit ? { scale: 1.02 } : {}}
                whileTap={canSubmit ? { scale: 0.98 } : {}}
                onClick={handleChangePassword}
                disabled={cpBusy || !canSubmit}
                style={{
                  padding: '11px 28px', borderRadius: 12, border: 'none',
                  background: canSubmit ? 'linear-gradient(135deg,#1D4ED8,#2563EB)' : (isDark ? '#334155' : '#E5E7EB'),
                  color: canSubmit ? '#fff' : C.faint,
                  fontSize: 13.5, fontWeight: 700,
                  cursor: canSubmit && !cpBusy ? 'pointer' : 'not-allowed',
                  boxShadow: canSubmit ? '0 2px 8px rgba(37,99,235,.3)' : 'none',
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                {cpBusy ? 'Saving…' : 'Update Password'}
              </motion.button>
            </div>
          </div>
        </SectionCard>

        <SectionCard C={C}
          icon={enabled ? '🔒' : '🔓'}
          title="Two-Factor Authentication"
          subtitle="Require a time-based one-time code on every login for maximum protection."
        >
          {statusLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Sk isDark={isDark} h={20} w="60%" /><Sk isDark={isDark} h={16} w="80%" /><Sk isDark={isDark} h={38} w={120} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '6px 14px', borderRadius: 50,
                  background: enabled ? (isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5') : (isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2'),
                  fontSize: 12.5, fontWeight: 700,
                  color: enabled ? '#059669' : '#DC2626',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: enabled ? '#10B981' : '#EF4444',
                    display: 'inline-block',
                  }} />
                  {enabled ? 'Active' : 'Disabled'}
                </div>
                {enabled && (
                  <span style={{ fontSize: 12.5, color: C.muted }}>Your account is protected</span>
                )}
              </div>

              <div style={{
                background: C.infoBg, borderRadius: 12, padding: '14px 16px',
                border: `1px solid ${C.infoBorder}`,
                fontSize: 13, color: C.infoText, lineHeight: 1.7,
              }}>
                {enabled
                  ? 'Every login requires a 6-digit code from your authenticator app. Even if your password is stolen, your account stays safe.'
                  : 'Enable 2FA to require a 6-digit code from Google Authenticator or Authy on every login.'}
              </div>

              {step === 'idle' && (
                enabled
                  ? <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={startDisable}
                      style={{
                        alignSelf: 'flex-start',
                        padding: '10px 20px', borderRadius: 12, border: '1.5px solid #FCA5A5',
                        background: isDark ? 'rgba(239,68,68,0.1)' : '#FFF5F5', color: '#DC2626', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                      }}
                    >Disable 2FA</motion.button>
                  : <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={startSetup}
                      disabled={busy}
                      style={{
                        alignSelf: 'flex-start',
                        padding: '11px 24px', borderRadius: 12, border: 'none',
                        background: `linear-gradient(135deg,#1D4ED8,${G700})`,
                        color: '#fff', fontSize: 13, fontWeight: 700,
                        cursor: busy ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 8px rgba(37,99,235,.3)',
                        fontFamily: "'Inter',sans-serif",
                      }}
                    >{busy ? 'Starting…' : 'Enable 2FA'}</motion.button>
              )}

              {step === 'scan' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.title }}>Step 1 — Scan QR Code</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>
                    Open Google Authenticator, Authy, or any TOTP app and scan the code below.
                  </div>
                  {qr && (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <div style={{ padding: 10, background: '#fff', border: `2px solid ${C.border}`, borderRadius: 14 }}>
                        <img src={qr} alt="2FA QR Code" style={{ width: 180, height: 180, display: 'block' }} />
                      </div>
                    </div>
                  )}
                  <div style={{ background: C.infoBg, borderRadius: 10, padding: '12px 16px', border: `1px solid ${C.infoBorder}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Can't scan? Enter manually
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <code style={{
                        flex: 1, fontSize: 13, fontWeight: 700, color: C.title, wordBreak: 'break-all',
                        letterSpacing: showSecret ? 2 : 'normal',
                        filter: showSecret ? 'none' : 'blur(5px)',
                        userSelect: showSecret ? 'text' : 'none',
                        transition: 'filter .2s',
                      }}>{secret}</code>
                      <button onClick={() => setShowSecret(v => !v)}
                        style={{ ...ghostBtn, padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 600 }}
                      >{showSecret ? 'Hide' : 'Reveal'}</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={cancelSetup} style={ghostBtn}>Cancel</button>
                    <button onClick={() => setStep('confirm')}
                      style={{
                        flex: 1, padding: '10px 18px', borderRadius: 10, border: 'none',
                        background: `linear-gradient(135deg,#1D4ED8,${G700})`,
                        color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(37,99,235,.3)',
                      }}
                    >I've scanned the code →</button>
                  </div>
                </div>
              )}

              {step === 'confirm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.title }}>Step 2 — Verify Code</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>
                    Enter the 6-digit code shown in your authenticator app.
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <CodeInput value={code} onChange={setCode} disabled={busy} C={C} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={cancelSetup} style={ghostBtn}>Cancel</button>
                    <button onClick={confirmEnable} disabled={busy || code.length !== 6}
                      style={{
                        flex: 1, padding: '10px 18px', borderRadius: 10, border: 'none',
                        background: code.length === 6 ? 'linear-gradient(135deg,#059669,#10B981)' : (isDark ? '#334155' : '#E5E7EB'),
                        color: code.length === 6 ? '#fff' : C.faint,
                        fontSize: 13, fontWeight: 700, cursor: code.length === 6 ? 'pointer' : 'not-allowed',
                        boxShadow: code.length === 6 ? '0 2px 8px rgba(16,185,129,.3)' : 'none',
                      }}
                    >{busy ? 'Verifying…' : '✓ Activate 2FA'}</button>
                  </div>
                </div>
              )}

              {step === 'disable_confirm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{
                    background: isDark ? 'rgba(239,68,68,0.1)' : '#FFF9F9', borderRadius: 10, padding: '12px 14px',
                    border: '1px solid #FECACA', fontSize: 12.5, color: isDark ? '#FCA5A5' : '#7F1D1D',
                  }}>
                    ⚠ Disabling 2FA will make your account less secure. Enter your current authenticator code to confirm.
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <CodeInput value={code} onChange={setCode} disabled={busy} C={C} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={cancelSetup} style={ghostBtn}>Cancel</button>
                    <button onClick={confirmDisable} disabled={busy || code.length !== 6}
                      style={{
                        flex: 1, padding: '10px 18px', borderRadius: 10, border: 'none',
                        background: code.length === 6 ? '#DC2626' : (isDark ? '#334155' : '#E5E7EB'),
                        color: code.length === 6 ? '#fff' : C.faint,
                        fontSize: 13, fontWeight: 700, cursor: code.length === 6 ? 'pointer' : 'not-allowed',
                      }}
                    >{busy ? 'Disabling…' : 'Disable 2FA'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard C={C} icon="💡" title="Security Tips" subtitle="Best practices to keep your account safe.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { icon: '🔑', tip: 'Use a unique password not shared with other services.' },
            { icon: '💪', tip: 'Mix uppercase, lowercase, numbers and symbols for a strong password.' },
            { icon: '🛡', tip: 'Enable 2FA — even if your password is stolen, your account stays safe.' },
            { icon: '⏱', tip: 'The 2FA code changes every 30 seconds and cannot be reused.' },
            { icon: '🚫', tip: 'Never share your password or OTP codes with anyone.' },
            { icon: '🔄', tip: 'Change your password periodically or if you suspect a breach.' },
          ].map(({ icon, tip }) => (
            <div key={tip} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              background: C.tipBg, borderRadius: 12, padding: '14px 16px',
              border: `1px solid ${C.tipBorder}`,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 13, color: C.tipText, lineHeight: 1.65, fontFamily: "'Inter',sans-serif" }}>{tip}</span>
            </div>
          ))}
        </div>
      </SectionCard>

    </PageWrapper>
  );
}
