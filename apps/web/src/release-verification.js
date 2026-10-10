// Shop preparation has already matched the physical unit. At delivery, the
// operator scans only the customer's rental handoff QR.
export function createReleaseVerification({ api, rentalId, onChange = () => {} }) {
  let revision = 0;
  let state = { step: 1, transactionCode: '', manualLookup: false, manualReason: '', bookingVerified: false, inventoryVerified: false, busy: false, error: '', item: null };
  const snapshot = () => ({ ...state });
  const emit = () => onChange(snapshot());
  function update(name, value) {
    if (!['transactionCode', 'manualLookup', 'manualReason'].includes(name) || state[name] === value) return;
    revision++;
    const next = { ...state, [name]: value, busy: false, error: '', bookingVerified: false, inventoryVerified: false, item: null, step: 1 };
    if (name === 'transactionCode') {
      const code = value.trim();
      if (/^R-[A-Z0-9]+$/i.test(code)) next.manualLookup = true;
      else if (/^rp-rental-/i.test(code)) next.manualLookup = false;
    } else if (name === 'manualLookup' && /^R-[A-Z0-9]+$/i.test(state.transactionCode.trim())) {
      next.manualLookup = true;
    }
    state = next;
    emit();
  }
  async function verifyBooking() {
    if (state.busy) return false;
    if (!state.transactionCode.trim()) { state.error = 'Scan or enter the customer rental QR.'; emit(); return false; }
    const attempt = ++revision;
    const input = { transactionCode: state.transactionCode.trim(), ...(state.manualLookup ? { manualLookup: true, ...(state.manualReason.trim() ? { manualReason: state.manualReason.trim() } : {}) } : {}) };
    state = { ...state, busy: true, error: '' }; emit();
    try {
      const result = await api(`/rentals/${encodeURIComponent(rentalId)}/release-verification`, { method: 'POST', body: JSON.stringify(input) });
      if (attempt !== revision) return false;
      if (String(result.rental?.id) !== String(rentalId) || result.booking_verified !== true || result.delivery_prepared !== true) throw new Error('This rental QR is not ready for handoff.');
      state = { ...state, busy: false, bookingVerified: true, inventoryVerified: true, step: 2, item: result.item };
      emit(); return true;
    } catch (error) {
      if (attempt !== revision) return false;
      state = { ...state, busy: false, error: error.message, bookingVerified: false, inventoryVerified: false, step: 1 };
      emit(); return false;
    }
  }
  function goBack() { if (state.busy) return; state.step = 1; state.error = ''; emit(); }
  function releaseCodes() {
    if (state.busy || !state.bookingVerified || state.step !== 2) throw new Error('Verify the customer rental QR before confirming handoff.');
    return { transactionCode: state.transactionCode.trim(), ...(state.manualLookup ? { manualLookup: true, ...(state.manualReason.trim() ? { manualReason: state.manualReason.trim() } : {}) } : {}) };
  }
  function dispose() { revision++; }
  return { snapshot, update, verifyBooking, verifyInventory: verifyBooking, goBack, releaseCodes, dispose };
}
