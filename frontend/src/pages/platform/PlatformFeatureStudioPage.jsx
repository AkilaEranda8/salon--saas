import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

const RING_COLORS = {
  internal: '#6B7280',
  canary: '#F59E0B',
  beta: '#0EA5E9',
  ga: '#10B981',
};

function Surface({ title, subtitle, children, dark = false, rightAction = null }) {
  return (
    <section
      style={{
        borderRadius: 18,
        border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
        background: dark ? '#111827' : '#FFFFFF',
        boxShadow: dark ? '0 12px 26px rgba(2,6,23,0.34)' : '0 12px 24px rgba(15,23,42,0.07)',
        padding: '16px 16px 14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#F8FAFC' : '#0F172A' }}>{title}</div>
          {subtitle && <div style={{ marginTop: 4, fontSize: 12, color: dark ? '#94A3B8' : '#64748B' }}>{subtitle}</div>}
        </div>
        {rightAction}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, hint, dark = false, accent = '#2563EB' }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
        background: dark ? '#0B1220' : '#FFFFFF',
        padding: '14px 14px 12px',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.75, color: dark ? '#94A3B8' : '#64748B' }}>
        {label}
      </div>
      <div style={{ marginTop: 7, fontSize: 24, fontWeight: 800, lineHeight: 1, color: accent }}>{value}</div>
      {hint && <div style={{ marginTop: 6, fontSize: 12, color: dark ? '#64748B' : '#94A3B8' }}>{hint}</div>}
    </div>
  );
}

const toggleBtnStyle = (on) => ({
  width: 44,
  height: 24,
  borderRadius: 12,
  border: 'none',
  background: on ? '#2563EB' : '#CBD5E1',
  cursor: 'pointer',
  position: 'relative',
  transition: 'background .2s',
});

const toggleKnobStyle = (on) => ({
  position: 'absolute',
  top: 3,
  left: on ? 22 : 3,
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: '#fff',
  transition: 'left .2s',
  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
});

export default function PlatformFeatureStudioPage() {
  const { isDark } = useTheme();

  const [catalog, setCatalog] = useState([]);
  const [features, setFeatures] = useState({});
  const [rings, setRings] = useState(['internal', 'canary', 'beta', 'ga']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [meta, setMeta] = useState({ updatedAt: null, updatedBy: null });

  const loadData = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setNotice({ type: '', text: '' });
    try {
      const [featuresRes, statsRes] = await Promise.all([
        api.get('/features'),
        api.get('/platform/stats').catch(() => ({ data: null })),
      ]);

      const payload = featuresRes.data || {};
      const list = Array.isArray(payload.data) ? payload.data : [];
      const state = payload.state?.features || {};

      setCatalog(list);
      setFeatures(state);
      setRings(Array.isArray(payload.rings) && payload.rings.length ? payload.rings : ['internal', 'canary', 'beta', 'ga']);
      setMeta({ updatedAt: payload.state?.updatedAt || null, updatedBy: payload.state?.updatedBy || null, totalTenants: statsRes?.data?.totalTenants || 0 });
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to load feature studio state.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const categories = useMemo(() => {
    const set = new Set(catalog.map((c) => c.category).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [catalog]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.key || '').toLowerCase().includes(q) ||
        String(item.description || '').toLowerCase().includes(q)
      );
    });
  }, [catalog, query, category]);

  const activeCount = useMemo(() => (
    Object.values(features).filter((f) => f?.enabled && !f?.killSwitch).length
  ), [features]);

  const canaryCount = useMemo(() => (
    Object.values(features).filter((f) => f?.ring === 'canary' && f?.enabled && !f?.killSwitch).length
  ), [features]);

  const killSwitchCount = useMemo(() => (
    Object.values(features).filter((f) => !!f?.killSwitch).length
  ), [features]);

  const updateFeature = (key, patch) => {
    setFeatures((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...patch,
      },
    }));
  };

  const saveState = async () => {
    setSaving(true);
    setNotice({ type: '', text: '' });
    try {
      const res = await api.put('/features/state', { features });
      setFeatures(res.data?.state?.features || features);
      setMeta((m) => ({
        ...m,
        updatedAt: res.data?.state?.updatedAt || new Date().toISOString(),
        updatedBy: res.data?.state?.updatedBy || null,
      }));
      setNotice({ type: 'success', text: 'Feature rollout state saved.' });
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to save feature state.' });
    } finally {
      setSaving(false);
    }
  };

  const resetState = async () => {
    setSaving(true);
    setNotice({ type: '', text: '' });
    try {
      const res = await api.post('/features/reset');
      setFeatures(res.data?.state?.features || {});
      setMeta((m) => ({
        ...m,
        updatedAt: res.data?.state?.updatedAt || new Date().toISOString(),
        updatedBy: res.data?.state?.updatedBy || null,
      }));
      setNotice({ type: 'success', text: 'Feature rollout state reset to defaults.' });
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to reset feature state.' });
    } finally {
      setSaving(false);
    }
  };

  const pageBg = isDark
    ? 'radial-gradient(circle at top left, rgba(34,197,94,0.14), transparent 35%), linear-gradient(180deg,#0F172A 0%, #0B1220 100%)'
    : 'radial-gradient(circle at top left, rgba(34,197,94,0.11), transparent 35%), linear-gradient(180deg,#F6FFF8 0%, #F4F7F9 100%)';

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: '28px clamp(16px,2.4vw,34px) 44px', boxSizing: 'border-box', background: pageBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1, color: isDark ? '#86EFAC' : '#15803D' }}>Platform Operations</div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 34, lineHeight: 1.05, fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F2A34' }}>Feature Studio</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: isDark ? '#94A3B8' : '#5B6B70' }}>
            Control staged rollouts, kill switches, and release rings from one place.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing || saving || loading}
            style={{
              border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
              background: isDark ? '#0B1220' : '#fff',
              color: isDark ? '#E2E8F0' : '#1F2937',
              borderRadius: 12,
              padding: '10px 13px',
              fontSize: 13,
              fontWeight: 700,
              cursor: refreshing || saving || loading ? 'not-allowed' : 'pointer',
            }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={resetState}
            disabled={saving || loading}
            style={{
              border: '1px solid #FCA5A5',
              background: '#FEF2F2',
              color: '#B91C1C',
              borderRadius: 12,
              padding: '10px 13px',
              fontSize: 13,
              fontWeight: 700,
              cursor: saving || loading ? 'not-allowed' : 'pointer',
            }}
          >
            Reset
          </button>

          <button
            type="button"
            onClick={saveState}
            disabled={saving || loading}
            style={{
              border: 'none',
              background: '#2563EB',
              color: '#fff',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 700,
              cursor: saving || loading ? 'not-allowed' : 'pointer',
              opacity: saving || loading ? 0.75 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="Total Features" value={catalog.length} hint="catalog entries" dark={isDark} accent="#2563EB" />
        <Metric label="Active" value={activeCount} hint="enabled and not killed" dark={isDark} accent="#10B981" />
        <Metric label="Canary" value={canaryCount} hint="ring = canary" dark={isDark} accent="#F59E0B" />
        <Metric label="Kill Switches" value={killSwitchCount} hint={`tenants ${meta.totalTenants || 0}`} dark={isDark} accent="#EF4444" />
      </div>

      {notice.text && (
        <div
          style={{
            marginBottom: 14,
            borderRadius: 12,
            border: notice.type === 'error' ? '1px solid #FECACA' : '1px solid #A7F3D0',
            background: notice.type === 'error' ? '#FEF2F2' : '#ECFDF5',
            color: notice.type === 'error' ? '#B91C1C' : '#065F46',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {notice.text}
        </div>
      )}

      <Surface
        dark={isDark}
        title="Rollout Matrix"
        subtitle={meta.updatedAt ? `Last updated ${new Date(meta.updatedAt).toLocaleString()}${meta.updatedBy ? ` by user #${meta.updatedBy}` : ''}` : 'No changes yet'}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px', gap: 10, marginBottom: 12 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features by name, key, or description"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 10,
              border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
              background: isDark ? '#0B1220' : '#fff',
              color: isDark ? '#E2E8F0' : '#111827',
              padding: '10px 11px',
              fontSize: 13,
            }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 10,
              border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
              background: isDark ? '#0B1220' : '#fff',
              color: isDark ? '#E2E8F0' : '#111827',
              padding: '10px 11px',
              fontSize: 13,
            }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B' }}>Loading feature catalog...</div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B' }}>No features found for the current filter.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {rows.map((item) => {
              const f = features[item.key] || {
                enabled: false,
                rolloutPercentage: 0,
                ring: 'internal',
                killSwitch: false,
                notes: '',
              };

              const ringColor = RING_COLORS[f.ring] || '#6B7280';
              const liveTenants = Math.round(((meta.totalTenants || 0) * (f.rolloutPercentage || 0)) / 100);

              return (
                <div
                  key={item.key}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
                    background: isDark ? '#0B1220' : '#FFFFFF',
                    padding: '12px 12px 10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>{item.name}</div>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 999, background: isDark ? '#1E293B' : '#EEF2FF', color: isDark ? '#A5B4FC' : '#4338CA' }}>
                          {item.category}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 999, background: `${ringColor}22`, color: ringColor }}>
                          {String(f.ring || 'internal').toUpperCase()}
                        </span>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>{item.description}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: isDark ? '#64748B' : '#94A3B8' }}>{item.key}</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B' }}>Enabled</label>
                      <button type="button" style={toggleBtnStyle(!!f.enabled)} onClick={() => updateFeature(item.key, { enabled: !f.enabled })}>
                        <span style={toggleKnobStyle(!!f.enabled)} />
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 160px 110px', gap: 10, alignItems: 'end' }}>
                    <label>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>
                        Rollout {f.rolloutPercentage || 0}% ({liveTenants} tenants)
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={f.rolloutPercentage || 0}
                        onChange={(e) => updateFeature(item.key, { rolloutPercentage: Number(e.target.value || 0) })}
                        style={{ width: '100%' }}
                      />
                    </label>

                    <label>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>Release Ring</div>
                      <select
                        value={f.ring || 'internal'}
                        onChange={(e) => updateFeature(item.key, { ring: e.target.value })}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          borderRadius: 9,
                          border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
                          background: isDark ? '#0B1220' : '#fff',
                          color: isDark ? '#E2E8F0' : '#111827',
                          padding: '8px 10px',
                          fontSize: 12,
                        }}
                      >
                        {rings.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                      </select>
                    </label>

                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <button type="button" style={toggleBtnStyle(!!f.killSwitch)} onClick={() => updateFeature(item.key, { killSwitch: !f.killSwitch })}>
                        <span style={toggleKnobStyle(!!f.killSwitch)} />
                      </button>
                      <span style={{ fontSize: 11, fontWeight: 800, color: f.killSwitch ? '#DC2626' : (isDark ? '#94A3B8' : '#64748B') }}>Kill Switch</span>
                    </label>
                  </div>

                  <label style={{ marginTop: 10, display: 'block' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>Release Notes</div>
                    <textarea
                      rows={2}
                      value={f.notes || ''}
                      onChange={(e) => updateFeature(item.key, { notes: e.target.value })}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        borderRadius: 9,
                        border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
                        background: isDark ? '#0B1220' : '#fff',
                        color: isDark ? '#E2E8F0' : '#111827',
                        padding: '8px 10px',
                        fontSize: 12,
                        resize: 'vertical',
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </Surface>
    </div>
  );
}
