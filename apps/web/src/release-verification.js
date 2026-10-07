// The server validates the booking and its exact assigned physical unit at each
// step. Changing a code or fallback reason invalidates dependent verification.
export function createReleaseVerification({ api, rentalId, onChange = () => {} }) {
  let revision = 0, state = { step: 1, transactionCode: '', inventoryCode: '', manualLookup: false, manualReason: '', bookingVerified: false, inventoryVerified: false, busy: false, error: '', item: null };
  const snapshot = () => ({ ...state });
  const emit = () => onChange(snapshot());
  function update(name, value) {
    if (!['transactionCode', 'inventoryCode', 'manualLookup', 'manualReason'].includes(name) || state[name] === value) return;
    revision++;
    state = { ...state, [name]: value, busy: false, error: '', inventoryVerified: false };
    if (name === 'inventoryCode') state.step = state.bookingVerified ? 2 : 1;
    else state = { ...state, bookingVerified: false, inventoryCode: '', item: null, step: 1 };
    emit();
  }
  async function verify(kind) {
    if (state.busy) return false;
    if (kind === 'INVENTORY' && !state.bookingVerified) { state.error = 'Verify the customer transaction QR first.'; emit(); return false; }
    const step = kind === 'INVENTORY' ? 2 : 1;
    if (!state.transactionCode.trim() || step === 2 && !state.inventoryCode.trim()) {
      state.error = step === 1 ? 'Scan or enter the customer transaction QR.' : 'Scan or enter the assigned equipment QR.'; emit(); return false;
    }
    if (state.manualLookup && !state.manualReason.trim()) { state.error = 'Enter a reason for using printed codes.'; emit(); return false; }
    const attempt = ++revision;
    const input = { transactionCode: state.transactionCode.trim(), ...(step === 2 ? { inventoryCode: state.inventoryCode.trim() } : {}), ...(state.manualLookup ? { manualReason: state.manualReason.trim() } : {}) };
    state = { ...state, busy: true, error: '' }; emit();
    try {
      const result = await api(`/rentals/${encodeURIComponent(rentalId)}/release-verification`, { method: 'POST', body: JSON.stringify(input) });
      if (attempt !== revision) return false;
      if (String(result.rental?.id) !== String(rentalId) || result.booking_verified !== true || step === 2 && result.inventory_verified !== true) throw new Error('The scanned codes could not be verified for this booking.');
      state = { ...state, busy: false, bookingVerified: true, inventoryVerified: step === 2, step: step + 1, item: result.item };
      emit(); return true;
    } catch (error) {
      if (attempt !== revision) return false;
      state = { ...state, busy: false, error: error.message, inventoryVerified: false, ...(step === 1 ? { bookingVerified: false } : {}), step };
      emit(); return false;
    }
  }
  function goBack() { if (state.busy) return; state.step = Math.max(1, state.step - 1); state.error = ''; emit(); }
  function releaseCodes() {
    if (state.busy || !state.bookingVerified || !state.inventoryVerified || state.step !== 3) throw new Error('Verify the transaction QR and matching equipment QR before release.');
    return { transactionCode: state.transactionCode.trim(), inventoryCode: state.inventoryCode.trim(), ...(state.manualLookup ? { manualReason: state.manualReason.trim() } : {}) };
  }
  function dispose() { revision++; }
  return { snapshot, update, verifyBooking: () => verify('BOOKING'), verifyInventory: () => verify('INVENTORY'), goBack, releaseCodes, dispose };
}
