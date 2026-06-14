import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../api/axios';
import { setBranchFilterId } from '../utils/branchFilterStore';

const BranchContext = createContext(null);

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function canFilterBranchesByRole(role) {
  const r = normalizeRole(role);
  return r === 'superadmin' || r === 'admin';
}

function storageKeyFor(user) {
  if (!user?.id) return null;
  const tenant = user.tenant_id ?? user.tenantId ?? user.tenant?.id ?? 't';
  return `hexa_branch_filter_${tenant}_${user.id}`;
}

export function BranchProvider({ children }) {
  const { user } = useAuth();
  const canSelectBranch = canFilterBranchesByRole(user?.role);
  const lockedBranchId = useMemo(() => {
    if (canSelectBranch || !user) return '';
    const id = user.branch_id ?? user.branchId ?? user.branch?.id;
    return id != null && id !== '' ? String(id) : '';
  }, [canSelectBranch, user]);

  const storageKey = useMemo(() => storageKeyFor(user), [user]);

  const [selectedBranchId, setSelectedBranchIdState] = useState(() => {
    if (!canSelectBranch) return lockedBranchId;
    if (!storageKey) return '';
    try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
  });
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    if (!canSelectBranch) {
      setSelectedBranchIdState(lockedBranchId);
      return;
    }
    if (!storageKey) return;
    try {
      setSelectedBranchIdState(localStorage.getItem(storageKey) || '');
    } catch { /* ignore */ }
  }, [canSelectBranch, lockedBranchId, storageKey]);

  useEffect(() => {
    if (!user || !canSelectBranch) {
      setBranches([]);
      return;
    }
    let cancelled = false;
    api.get('/branches', { params: { limit: 200 } })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        setBranches(rows);
      })
      .catch(() => { if (!cancelled) setBranches([]); });
    return () => { cancelled = true; };
  }, [user, canSelectBranch]);

  const effectiveBranchId = canSelectBranch ? selectedBranchId : lockedBranchId;

  useEffect(() => {
    setBranchFilterId(effectiveBranchId || null);
  }, [effectiveBranchId]);

  useEffect(() => {
    if (!canSelectBranch || !storageKey) return;
    try {
      if (selectedBranchId) localStorage.setItem(storageKey, selectedBranchId);
      else localStorage.removeItem(storageKey);
    } catch { /* ignore */ }
  }, [selectedBranchId, canSelectBranch, storageKey]);

  const setSelectedBranchId = useCallback((id) => {
    if (!canSelectBranch) return;
    setSelectedBranchIdState(id == null || id === '' ? '' : String(id));
  }, [canSelectBranch]);

  const selectedBranch = useMemo(
    () => branches.find((b) => String(b.id) === String(effectiveBranchId)) || null,
    [branches, effectiveBranchId],
  );

  const branchFilterKey = effectiveBranchId || 'all';

  const value = useMemo(() => ({
    branches,
    selectedBranchId: effectiveBranchId,
    selectedBranch,
    setSelectedBranchId,
    canSelectBranch,
    branchFilterKey,
    seesAllBranches: canSelectBranch && !effectiveBranchId,
  }), [branches, effectiveBranchId, selectedBranch, setSelectedBranchId, canSelectBranch, branchFilterKey]);

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    throw new Error('useBranch must be used within BranchProvider');
  }
  return ctx;
}

export default BranchContext;
