import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useAuth } from '../context/AuthContext';
import usePageTheme from '../hooks/usePageTheme';

/* ── SVG icons ───────────────────────────────────────────────────────────── */
const IconUpload   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>;
const IconImage    = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const IconTag      = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const IconRefresh  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
const IconSave     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconLink     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;

const EMPTY = {
  name:             '',
  logo_sidebar_url: '',
  logo_header_url:  '',
  logo_login_url:   '',
  logo_public_url:  '',
  primary_color:    '#2563EB',
  sidebar_style:    'light',
  font_family:      'Inter',
  docs_page_enabled: false,
};

/* ── Sub-components ──────────────────────────────────────────────────────── */
function SectionCard({ title, subtitle, children }) {
  const { C } = usePageTheme();
  return (
    <div style={{
      background: C.cardBg,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: C.shadow,
    }}>
      {(title || subtitle) && (
        <div style={{
          padding: '16px 22px',
          borderBottom: `1px solid ${C.border}`,
          background: C.headerGrad,
        }}>
          {title && (
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Sora','Manrope',sans-serif" }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{ fontSize: 12.5, color: C.label, marginTop: 2, fontFamily: "'Inter',sans-serif" }}>
              {subtitle}
            </div>
          )}
        </div>
      )}
      <div style={{ padding: '20px 22px' }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint }) {
  const { C } = usePageTheme();
  const [focused, setFocused] = useState(false);
  return (
    <label style={{ display: 'block' }}>
      <div style={{
        fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: C.label, marginBottom: 7,
        fontFamily: "'Inter',sans-serif",
      }}>
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', borderRadius: 10,
          border: `1.5px solid ${focused ? C.primary : C.inputBdr}`,
          background: C.inputBg, color: C.text,
          padding: '10px 13px', fontSize: 13.5,
          outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
          fontFamily: "'Inter',sans-serif",
          boxShadow: focused ? `0 0 0 3px rgba(37,99,235,0.10)` : 'none',
        }}
      />
      {hint && (
        <div style={{ marginTop: 5, fontSize: 12, color: C.muted, fontFamily: "'Inter',sans-serif" }}>
          {hint}
        </div>
      )}
    </label>
  );
}

function UploadField({ label, value, onChange, placeholder, variant, onUpload, uploadingVariant }) {
  const { C, isDark } = usePageTheme();
  const isUploading = uploadingVariant === variant;
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: C.label, marginBottom: 7,
        fontFamily: "'Inter',sans-serif",
      }}>
        {label}
      </div>

      {/* URL input row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            color: C.muted, pointerEvents: 'none',
          }}>
            <IconLink />
          </span>
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              width: '100%', borderRadius: 10,
              border: `1.5px solid ${focused ? C.primary : C.inputBdr}`,
              background: C.inputBg, color: C.text,
              padding: '10px 12px 10px 30px', fontSize: 13,
              outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.15s',
              fontFamily: "'Inter',sans-serif",
              boxShadow: focused ? `0 0 0 3px rgba(37,99,235,0.10)` : 'none',
            }}
          />
        </div>

        {/* Upload button */}
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          borderRadius: 10, border: `1.5px solid ${C.inputBdr}`,
          background: C.soft, color: C.label,
          padding: '9px 13px', fontSize: 12.5, fontWeight: 700,
          cursor: isUploading ? 'not-allowed' : 'pointer',
          opacity: isUploading ? 0.65 : 1,
          whiteSpace: 'nowrap', flexShrink: 0,
          fontFamily: "'Inter',sans-serif",
          transition: 'background 0.15s, border-color 0.15s',
        }}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: 'none' }}
            disabled={isUploading}
            onChange={(e) => onUpload(variant, e.target.files?.[0] || null, e.currentTarget)}
          />
          <IconUpload />
          {isUploading ? 'Uploading\u2026' : 'Upload'}
        </label>
      </div>
    </div>
  );
}

const DEFAULT_LOGO_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#EFF6FF"/><circle cx="48" cy="38" r="14" fill="#BFDBFE"/><path d="M26 76c6-9 14-13 22-13s16 4 22 13" fill="none" stroke="#BFDBFE" stroke-width="6" stroke-linecap="round"/></svg>'
);

function LogoPreviewCard({ title, src, description }) {
  const { C, isDark } = usePageTheme();
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [src]);
  return (
    <motion.div
      whileHover={{ translateY: -2 }}
      style={{
        borderRadius: 14, border: `1px solid ${C.border}`,
        background: C.cardBg, padding: '16px',
        flex: '1 1 160px', minWidth: 150,
        boxShadow: '0 2px 8px rgba(16,24,40,0.05)',
        transition: 'box-shadow 0.15s',
      }}
    >
      <div style={{
        fontSize: 11.5, fontWeight: 700, color: C.label,
        marginBottom: 10, textTransform: 'uppercase',
        letterSpacing: '0.06em', fontFamily: "'Inter',sans-serif",
      }}>
        {title}
      </div>
      <div style={{
        height: 90, borderRadius: 10,
        border: `1.5px dashed ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isDark ? '#0B1220' : C.soft,
        overflow: 'hidden',
      }}>
        {src && !imgError ? (
          <img
            src={src}
            alt={`${title} preview`}
            onError={() => setImgError(true)}
            style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain', borderRadius: 6 }}
          />
        ) : (
          <span style={{ color: '#C4C9D4' }}><IconImage /></span>
        )}
      </div>
      {description && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif", lineHeight: 1.4 }}>
          {description}
        </div>
      )}
    </motion.div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function BrandingSettingsPage() {
  const { C } = usePageTheme();
  const [loading, setLoading]                   = useState(true);
  const [saving, setSaving]                     = useState(false);
  const [form, setForm]                         = useState(EMPTY);
  const [tenantId, setTenantId]                 = useState('');
  const [copiedTenantId, setCopiedTenantId]     = useState(false);
  const [uploadingVariant, setUploadingVariant] = useState('');

  const { refreshUser } = useAuth();

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const loadBranding = async () => {
    setLoading(true);
    try {
      const res = await api.get('/branding');
      const data = res.data?.data || {};
      setTenantId(data.id != null ? String(data.id) : '');
      setForm({
        name:             data.brand_name || data.name || '',
        logo_sidebar_url: data.logo_sidebar_url || '',
        logo_header_url:  data.logo_header_url  || '',
        logo_login_url:   data.logo_login_url   || '',
        logo_public_url:  data.logo_public_url  || '',
        primary_color:    data.primary_color    || '#2563EB',
        sidebar_style:    data.sidebar_style    || 'light',
        font_family:      data.font_family      || 'Inter',
        docs_page_enabled: data.docs_page_enabled === true,
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load branding settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBranding(); }, []);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Brand name is required.'); return; }
    setSaving(true);
    try {
      await api.put('/branding', {
        brand_name:        form.name.trim(),
        logo_sidebar_url:  form.logo_sidebar_url.trim() || null,
        logo_header_url:   form.logo_header_url.trim()  || null,
        logo_login_url:    form.logo_login_url.trim()   || null,
        logo_public_url:   form.logo_public_url.trim()  || null,
        primary_color:     form.primary_color,
        sidebar_style:     form.sidebar_style,
        font_family:       form.font_family,
        docs_page_enabled:  form.docs_page_enabled,
      });
      toast.success('Branding settings saved!');
      await Promise.all([loadBranding(), refreshUser()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save branding settings.');
    } finally {
      setSaving(false);
    }
  };

  const copyTenantId = async () => {
    if (!tenantId) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tenantId);
      } else {
        // Clipboard API needs a secure context; fall back for plain-HTTP hosts.
        const helper = document.createElement('textarea');
        helper.value = tenantId;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
      setCopiedTenantId(true);
      toast.success('Tenant ID copied!');
      window.setTimeout(() => setCopiedTenantId(false), 1600);
    } catch {
      toast.error('Could not copy the Tenant ID.');
    }
  };

  const uploadLogo = async (variant, file, inputEl) => {
    if (!file) return;
    setUploadingVariant(variant);
    try {
      const payload = new FormData();
      payload.append('file', file);
      payload.append('variant', variant);
      const res = await api.post(`/branding/upload?variant=${encodeURIComponent(variant)}`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploadedUrl = res.data?.data?.url;
      if (!uploadedUrl) throw new Error('Upload response missing URL.');
      const fieldMap = { sidebar: 'logo_sidebar_url', header: 'logo_header_url', login: 'logo_login_url', public: 'logo_public_url' };
      const targetField = fieldMap[variant];
      if (targetField) setForm((prev) => ({ ...prev, [targetField]: uploadedUrl }));
      toast.success('Logo uploaded!');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Upload failed.');
    } finally {
      setUploadingVariant('');
      if (inputEl) inputEl.value = '';
    }
  };

  /* Actions slot for PageWrapper */
  const actions = (
    <div style={{ display: 'flex', gap: 10 }}>
      <button
        onClick={loadBranding}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 16px', background: C.cardBg,
          border: `1.5px solid ${C.border}`, borderRadius: 10,
          fontSize: 13, fontWeight: 700, color: C.label,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          boxShadow: C.shadow,
          fontFamily: "'Inter',sans-serif",
        }}
      >
        <IconRefresh /> Reset
      </button>
      <button
        onClick={save}
        disabled={saving || loading}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 18px',
          background: 'linear-gradient(135deg, #1D4ED8, #2563EB)',
          border: 'none', borderRadius: 10,
          fontSize: 13, fontWeight: 700, color: '#fff',
          cursor: saving || loading ? 'not-allowed' : 'pointer',
          opacity: saving || loading ? 0.7 : 1,
          boxShadow: '0 2px 8px rgba(37,99,235,0.30)',
          fontFamily: "'Inter',sans-serif",
        }}
      >
        <IconSave /> {saving ? 'Saving\u2026' : 'Save Branding'}
      </button>
    </div>
  );

  return (
    <PageWrapper
      title="Branding Settings"
      subtitle="Update your salon identity across sidebar, topbar, login, and public booking pages."
      actions={actions}
    >
      {loading ? (
        <div style={{ display: 'flex', gap: 16 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ flex: 1, height: 180, borderRadius: 14, background: 'linear-gradient(90deg, #F1F3F9 25%, #E9ECF3 50%, #F1F3F9 75%)' }} />
          ))}
        </div>
      ) : (
        <>
          {/* ── Brand Identity ── */}
          <SectionCard
            title="Brand Identity"
            subtitle="The name displayed in the sidebar, headers, and login screen."
          >
            <div style={{ maxWidth: 480 }}>
              <Field
                label="Brand Name"
                value={form.name}
                onChange={(v) => updateField('name', v)}
                placeholder="Enter your salon brand name"
                hint="Shown throughout the app and on the public booking page."
              />
            </div>

            {/* Live preview */}
            {form.name && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                style={{
                  marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
                  border: '1px solid #BFDBFE', borderRadius: 12,
                  padding: '10px 16px',
                }}
              >
                <span style={{ color: C.primary }}><IconTag /></span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#1D4ED8', fontFamily: "'Sora','Manrope',sans-serif", letterSpacing: '-0.3px' }}>
                  {form.name}
                </span>
                <span style={{ fontSize: 11, color: '#93C5FD', fontFamily: "'Inter',sans-serif", fontWeight: 600 }}>
                  PREVIEW
                </span>
              </motion.div>
            )}
          </SectionCard>

          {/* ── Logo Images ── */}
          <SectionCard
            title="Logo Images"
            subtitle="Upload images or paste URLs for each context where your logo appears."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
              <UploadField
                label="Sidebar Logo"
                value={form.logo_sidebar_url}
                onChange={(v) => updateField('logo_sidebar_url', v)}
                placeholder="https://\u2026"
                variant="sidebar"
                onUpload={uploadLogo}
                uploadingVariant={uploadingVariant}
              />
              <UploadField
                label="Header Logo"
                value={form.logo_header_url}
                onChange={(v) => updateField('logo_header_url', v)}
                placeholder="https://\u2026"
                variant="header"
                onUpload={uploadLogo}
                uploadingVariant={uploadingVariant}
              />
              <UploadField
                label="Login Page Logo"
                value={form.logo_login_url}
                onChange={(v) => updateField('logo_login_url', v)}
                placeholder="https://\u2026"
                variant="login"
                onUpload={uploadLogo}
                uploadingVariant={uploadingVariant}
              />
              <UploadField
                label="Public Booking Logo"
                value={form.logo_public_url}
                onChange={(v) => updateField('logo_public_url', v)}
                placeholder="https://\u2026"
                variant="public"
                onUpload={uploadLogo}
                uploadingVariant={uploadingVariant}
              />
            </div>

            <div style={{ marginTop: 10, padding: '9px 14px', borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <span style={{ fontSize: 12, color: '#2563EB', fontFamily: "'Inter',sans-serif" }}>
                Accepted formats: PNG, JPG, WEBP, SVG \u00b7 Max size: 5 MB
              </span>
            </div>
          </SectionCard>

          {/* ── Logo Previews ── */}
          <SectionCard
            title="Logo Previews"
            subtitle="Live preview of your uploaded logos in each context."
          >
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <LogoPreviewCard
                title="Sidebar"
                src={form.logo_sidebar_url || DEFAULT_LOGO_PLACEHOLDER}
                description="Shown in the left navigation panel"
              />
              <LogoPreviewCard
                title="Header / Topbar"
                src={form.logo_header_url || DEFAULT_LOGO_PLACEHOLDER}
                description="Shown in the top bar of the app"
              />
              <LogoPreviewCard
                title="Login Screen"
                src={form.logo_login_url || DEFAULT_LOGO_PLACEHOLDER}
                description="Shown on the sign-in page"
              />
              <LogoPreviewCard
                title="Public Booking"
                src={form.logo_public_url || DEFAULT_LOGO_PLACEHOLDER}
                description="Shown on the public booking widget"
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Public Documentation"
            subtitle="Control access to your API reference and WordPress booking plugin guide."
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 20, padding: '4px 0',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                  Documentation page
                </div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                  When enabled, visitors can open <strong>/documentation</strong> to view API endpoints,
                  examples, and WordPress plugin installation instructions.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.docs_page_enabled}
                onClick={() => updateField('docs_page_enabled', !form.docs_page_enabled)}
                style={{
                  width: 50, height: 28, borderRadius: 999, border: 'none',
                  padding: 3, flexShrink: 0, cursor: 'pointer',
                  background: form.docs_page_enabled ? C.primary : C.border,
                  transition: 'background 0.2s',
                }}
              >
                <span style={{
                  display: 'block', width: 22, height: 22, borderRadius: '50%',
                  background: '#fff', boxShadow: '0 1px 4px rgba(15,23,42,.25)',
                  transform: form.docs_page_enabled ? 'translateX(22px)' : 'translateX(0)',
                  transition: 'transform 0.2s',
                }} />
              </button>
            </div>
            {tenantId && (
              <div style={{
                marginTop: 18, padding: '14px 16px',
                border: `1px solid ${C.border}`, borderRadius: 12,
                background: C.soft,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: C.label, marginBottom: 8,
                }}>
                  Your Tenant ID
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <code style={{
                    flex: 1, minWidth: 90, padding: '8px 12px',
                    border: `1px solid ${C.inputBdr}`, borderRadius: 8,
                    background: C.cardBg, color: C.text,
                    fontSize: 14, fontWeight: 800, letterSpacing: '0.04em',
                  }}>
                    {tenantId}
                  </code>
                  <button
                    type="button"
                    onClick={copyTenantId}
                    style={{
                      padding: '9px 15px', border: 'none', borderRadius: 8,
                      background: C.primary, color: '#fff',
                      fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Inter',sans-serif",
                    }}
                  >
                    {copiedTenantId ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                  Enter this ID in the WordPress plugin under Settings → Salon Booking, and use it as the
                  <code style={{ margin: '0 4px' }}>tenantId</code> query parameter on public API requests.
                </div>
              </div>
            )}
            {form.docs_page_enabled && (
              <a
                href="/documentation"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block', marginTop: 14, color: C.primary,
                  fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
                }}
              >
                Preview documentation ↗
              </a>
            )}
          </SectionCard>

          {/* ── Theme link ── */}
          <div style={{
            padding: '14px 18px', borderRadius: 12,
            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
            border: '1px solid #BFDBFE',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2m11-11h-2M3 12H1"/>
            </svg>
            <span style={{ fontSize: 13, color: '#1D4ED8', fontFamily: "'Inter',sans-serif", lineHeight: 1.5 }}>
              Accent colour, font, and sidebar appearance are managed in{' '}
              <a href="/themes" style={{ fontWeight: 700, color: '#1D4ED8', textDecoration: 'none' }}>Theme Options</a>.
            </span>
          </div>
        </>
      )}
    </PageWrapper>
  );
}
