/** Active branch filter for API calls (set by BranchContext). */
let activeBranchId = null;

export function setBranchFilterId(id) {
  activeBranchId = id != null && id !== '' ? String(id) : null;
}

export function getBranchFilterId() {
  return activeBranchId;
}
