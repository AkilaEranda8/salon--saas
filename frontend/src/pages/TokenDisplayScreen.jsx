import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api/axios';
import { getWalkInServicesTitle } from '../utils/walkInHelpers';
import { useAuth } from '../context/AuthContext';
const C = {
  bg1: '#0a0f1e', bg2: '#0f172a', card: '#141b2d', cardHover: '#1a2340',
  border: '#1e293b', blue: '#2563eb', purple: '#7c3aed', gold: '#fbbf24',
  text: '#f1f5f9', muted: '#64748b', dim: '#334155', green: '#22c55e', red: '#ef4444',
};

// ── Colours ──────────────────────────────────────────────────────
const ANIMATIONS = `
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: .72; transform: scale(1.03); }
}
@keyframes glow {
  0%, 100% { text-shadow: 0 0 30px rgba(37,99,235,.5), 0 0 60px rgba(124,58,237,.3); }
  50%      { text-shadow: 0 0 50px rgba(37,99,235,.8), 0 0 90px rgba(124,58,237,.5); }
}
@keyframes flashIn {
  0%   { opacity: 0; transform: scale(.6); }
  50%  { opacity: 1; transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes liveBlink {
  0%, 100% { opacity: 1; }
  50%      { opacity: .4; }
}
`;

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtTime = (t) => {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hr = +h % 12 || 12;
  return `${hr}:${m} ${+h >= 12 ? 'PM' : 'AM'}`;
};
const initials = (n) => (n || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export default function TokenDisplayScreen() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryBranchId = searchParams.get('branchId');
  const userBranchId = user?.branchId ? String(user.branchId) : null;
  const branchId = userBranchId || queryBranchId;

  const [queue, setQueue]       = useState([]);
  const [stats, setStats]       = useState({ waiting: 0, serving: 0, completed: 0, cancelled: 0, total: 0 });
  const [clock, setClock]       = useState(new Date());
  const [connected, setConnected] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [branches, setBranches] = useState([]);
  const prevServingRef          = useRef(null);

  // ── Fetch branches ─────────────────────────────────────────────────
  useEffect(() => {
    api
      .get('/branches?limit=200')
      .then((r) => {
        const branchRows = Array.isArray(r?.data?.data)
          ? r.data.data
          : Array.isArray(r?.data)
            ? r.data
            : [];
        if (userBranchId) {
          setBranches(branchRows.filter((b) => String(b.id) === userBranchId));
          return;
        }
        setBranches(branchRows);
      })
      .catch(() => setBranches([]));
  }, [userBranchId]);

  useEffect(() => {
    if (!userBranchId) return;
    if (queryBranchId !== userBranchId) {
      setSearchParams({ branchId: userBranchId }, { replace: true });
    }
  }, [queryBranchId, setSearchParams, userBranchId]);

  const currentBranch = branches.find((b) => String(b.id) === String(branchId));

  // ── Clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Fetch data ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!branchId) return;
    try {
      const [qRes, sRes] = await Promise.all([
        api.get(`/walkin?branchId=${branchId}`),
        api.get(`/walkin/stats?branchId=${branchId}`),
      ]);
      setQueue(qRes.data || []);
      setStats(sRes.data || { waiting: 0, serving: 0, completed: 0, cancelled: 0, total: 0 });
    } catch { /* silent */ }
  }, [branchId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Fallback polling every 30 s ────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [fetchData]);

  // ── Socket.io ──────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io();
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.emit('join', { branchId });
    socket.on('queue:updated', () => fetchData());
    return () => { socket.disconnect(); };
  }, [branchId, fetchData]);

  // ── Derived ────────────────────────────────────────────────────────────
  const serving = queue.find((e) => e.status === 'serving');
  const waiting = queue.filter((e) => e.status === 'waiting');

  // Flash animation when serving token changes
  useEffect(() => {
    const curToken = serving?.token || null;
    if (curToken && curToken !== prevServingRef.current) setFlashKey((k) => k + 1);
    prevServingRef.current = curToken;
  }, [serving?.token]);

  // ── Date string ────────────────────────────────────────────────────────
  const dateStr = clock.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = clock.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  if (!branchId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(160deg, ${C.bg1} 0%, ${C.bg2} 100%)`, color: C.text,
        fontFamily: "'DM Sans', sans-serif", flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <p style={{ fontSize: 18, color: C.muted }}>No branch selected. Add <code>?branchId=&lt;id&gt;</code> to the URL.</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: `linear-gradient(160deg, ${C.bg1} 0%, ${C.bg2} 100%)`,
      color: C.text, fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column',
    }}>
      <style>{ANIMATIONS}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 32px', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>✂️</span>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700, color: C.text }}>
            HEXA SALON
          </span>
          <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>Queue Display</span>
          {branches.length > 1 && !userBranchId && (
            <select
              value={branchId}
              onChange={(e) => setSearchParams({ branchId: e.target.value })}
              style={{
                marginLeft: 8, padding: '4px 10px', borderRadius: 8,
                background: C.card, color: C.text, border: `1px solid ${C.border}`,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none',
                fontFamily: 'inherit',
              }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          {branches.length <= 1 && currentBranch && (
            <span style={{
              marginLeft: 8, padding: '3px 12px', borderRadius: 8,
              background: C.card, border: `1px solid ${C.border}`,
              fontSize: 13, fontWeight: 600, color: C.blue,
            }}>
              {currentBranch.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, letterSpacing: 2, color: C.text }}>
            {timeStr}
          </span>
          <span style={{ fontSize: 13, color: C.muted }}>{dateStr}</span>
        </div>
      </div>

      {/* ── MAIN GRID ──────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr',
        gap: 0, overflow: 'hidden',
      }}>
        {/* ── LEFT — NOW SERVING ────────────────────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 32px 24px', borderRight: `1px solid ${C.border}`, position: 'relative',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, color: C.muted, marginBottom: 12 }}>
            Now Serving
          </div>

          {serving ? (
            <div key={flashKey} style={{ textAlign: 'center', animation: 'flashIn .6s ease-out' }}>
              <div style={{
                fontSize: 'clamp(80px, 14vw, 200px)', fontWeight: 900,
                fontFamily: "'Cormorant Garamond', serif",
                background: `linear-gradient(135deg, ${C.blue}, ${C.purple})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                animation: 'glow 2.5s ease-in-out infinite',
                lineHeight: 1,
              }}>
                {serving.token}
              </div>

              <div style={{ fontSize: 'clamp(22px, 3vw, 40px)', fontWeight: 700, color: C.text, marginTop: 10 }}>
                {serving.customer_name}
              </div>

              <div style={{ fontSize: 'clamp(16px, 2vw, 24px)', color: C.blue, marginTop: 8, fontWeight: 500, textAlign: 'center', maxWidth: '90vw', lineHeight: 1.35 }}>
                {getWalkInServicesTitle(serving) || serving.service?.name || 'Service'}
              </div>

              {serving.staff && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14,
                  padding: '6px 18px', borderRadius: 20, background: C.card, border: `1px solid ${C.border}`,
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: C.purple, color: '#fff', fontSize: 11, fontWeight: 700,
                  }}>{initials(serving.staff.name)}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{serving.staff.name}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: C.dim }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 20, fontWeight: 500 }}>No one in service</div>
            </div>
          )}

          {/* Stats row at bottom of left column */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0,
            padding: '16px 32px', borderTop: `1px solid ${C.border}`,
          }}>
            {[
              { label: 'Completed Today', value: stats.completed },
              { label: 'Still Waiting', value: stats.waiting },
              { label: 'Total Today', value: stats.total },
            ].map((s, i, arr) => (
              <div key={s.label} style={{
                flex: 1, textAlign: 'center',
                borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.muted, fontWeight: 500, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT — WAITING QUEUE ─────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '24px 28px', overflow: 'hidden' }}>
          <div style={{
            fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3,
            color: C.muted, marginBottom: 18,
          }}>
            Waiting Queue
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
            {waiting.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: C.dim }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>Queue is empty!</div>
              </div>
            ) : (
              waiting.map((entry, idx) => {
                const isNext = idx === 0;
                return (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 12,
                    background: isNext ? C.cardHover : C.card,
                    border: `1px solid ${isNext ? C.blue + '44' : C.border}`,
                    animation: `slideUp .35s ease-out ${idx * .06}s both`,
                    ...(isNext ? { animation: `slideUp .35s ease-out both, pulse 2s ease-in-out infinite` } : {}),
                  }}>
                    {/* Position circle */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isNext ? C.gold : C.border,
                      color: isNext ? '#000' : C.muted,
                      fontSize: 14, fontWeight: 800,
                    }}>
                      {idx + 1}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                        <span style={{
                          fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: C.blue,
                        }}>{entry.token}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.customer_name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: C.muted }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getWalkInServicesTitle(entry) || entry.service?.name || 'Service'}</span>
                        <span>·</span>
                        <span>{fmtTime(entry.check_in_time)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 32px', borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.muted,
      }}>
        <span>HEXA SALON Queue Management System</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? C.green : C.red,
            animation: 'liveBlink 1.5s ease-in-out infinite',
          }} />
          <span style={{ fontWeight: 600, color: connected ? C.green : C.red }}>
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
        <span>Please wait for your token to be called</span>
      </div>
    </div>
  );
}
