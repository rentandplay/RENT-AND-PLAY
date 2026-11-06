export const settingsTabs = isOwner => [
  { id: 'business', label: 'Business', icon: 'box' },
  { id: 'appearance', label: 'Appearance', icon: 'sun' },
  { id: 'preferences', label: 'Preferences', icon: 'settings' },
  ...(isOwner ? [{ id: 'users', label: 'Staff', icon: 'users' }] : []),
  { id: 'account', label: 'Account & security', icon: 'out' }
];

export const defaultTermsAndConditions = `1. Account details
Provide accurate name and contact details, and keep your password and verification codes private. Use your account for your own rental requests.

2. Rental requests, charges, and reservation policy
Rent & Play operates on a strict First-Come, First-Served (Walk-In / Immediate Use) policy due to limited equipment stock across resorts. Advance multi-day reservations are not offered; approved requests hold the unit for 30 minutes pending physical handoff. A rental request is not confirmed until its status is approved in the app. Before submitting, review the item, rental duration, due time, rental fee, declared replacement value, and payment instructions shown at checkout.

3. ID and handoff
Show the required physical Government or Student ID to the admin during handoff. The rental timer starts when the admin verifies and releases the equipment. Check the item and included accessories with the admin.

4. Return, inspection, and lost/damaged item liability
Return the same equipment and all included accessories by the due time. A return request alone does not stop the timer; it stops when the admin records physical receipt. The admin inspects the returned item. Late returns, damage, loss, or missing accessories may result in additional charges up to the item's Declared Replacement Value shown in the catalog and checkout summary.

5. Personal information
Your name, email, phone number, and ID verification details are used to manage your account, verify rental handoffs, and communicate about rentals and returns. Please provide only accurate information needed for these purposes.`;

export const defaultRentalTerms = `1. Approval, Handoff & Reservation Policy
Rentals follow a First-Come, First-Served policy due to limited stock (no advance booking). Once approved, your unit is held for 30 minutes for preparation and handoff. The rental timer starts only when staff verifies and physically hands over the equipment.

2. Due Time & Returns
Return the same equipment and all included accessories by the confirmed due time. A return request alone does not stop the timer; staff must record physical receipt of the item.

3. Rates, Penalties & Replacement Liability
Late returns incur additional overtime fees at the rates shown. Severe damage, unreturned equipment, or missing accessories are subject to the equipment's Declared Replacement Value (Item Liability Cost) after physical inspection.

4. Identification & Payment
Show one physical Government or Student ID at handoff. For InstaPay / GCash QR transfers, upload the successful payment receipt for staff verification before release.`;

export const defaultPrivacyPolicy = `1. Collection of Personal Data
Rent & Play collects your personal information (full name, Philippine contact number, email, government/student ID photo, and handoff condition photos) strictly for verification and rental tracking.

2. Purpose and Usage
Your details are used solely to confirm identity, record equipment handoffs, track rental time, prevent loss or theft, and communicate regarding returns or overdue reminders.

3. Data Storage & Protection
Personal data and photos are stored securely using cloud infrastructure with restricted staff-only access. Your sensitive credentials are never sold or shared with third-party advertisers.

4. Customer Rights & Retention
Records of completed rentals and inspection photos are retained only as long as necessary for administrative auditing, dispute resolution, and regulatory compliance. Customers may request review of their personal account information at any time.`;

export const defaultRefundPolicy = `1. Cancellation Before Release
If a customer cancels an approved rental request before the unit is physically verified and released by staff, a full refund of any advance payment or deposit is issued.

2. Cancellations After Release
Once the equipment is physically released and the rental timer has started, the base rental fee is non-refundable.

3. Defective Equipment Replacement
If rented equipment experiences a mechanical or technical fault within 15 minutes of release through no fault of the customer, staff will provide an immediate replacement or issue a full refund.

4. Security Deposit Return
Refundable security deposits are refunded immediately upon return inspection, provided no physical damage, missing accessories, or unpaid overtime fees exist.`;

export const defaultAcceptedIds = `Philippine National ID (PhilSys), Driver's License, Philippine Passport, Student ID (Current Semester with Proof of Enrollment), UMID, SSS ID, PRC ID, Postal ID, Voter's ID`;

export const defaultSecurityDepositNote = `Refundable security deposit (₱1,000 - ₱2,000) may be required for high-value items such as PlayStation 5 or Nintendo Switch consoles. The deposit is refunded immediately upon post-rental inspection.`;

export const defaultDamagePolicyNote = `All equipment and accessories are inspected before release and upon return. Any missing parts, broken accessories, liquid damage, or physical cracks will be billed according to the item's Declared Replacement Value.`;

export const defaultReceiptFooter = `Keep this rental reference. Timer stops when staff receives the item. Return is subject to inspection. Damage or missing parts may affect final charges.`;

export function renderActiveSessionsList(sessions = [], { escape: e, formatDate = v => String(v || '') } = {}) {
  if (!Array.isArray(sessions) || !sessions.length) {
    return '<p class="settings-draft-note">Active browser session verified. Other signed-in devices will appear here.</p>';
  }
  return `<div class="active-sessions-list">${sessions.map(session => {
    const current = session.is_current === true;
    return `<div class="active-session-row ${current ? 'is-current-session' : ''}" data-session-row="${e(session.id)}">
      <div class="active-session-info">
        <div class="active-session-header">
          <strong>${e(session.device_label || 'Web Browser')}</strong>
          ${current ? '<span class="session-badge current-session-badge">Current session</span>' : '<span class="session-badge">Signed in</span>'}
        </div>
        <small>IP: ${e(session.ip || 'Local')} · Last active: ${e(formatDate(session.last_active_at || session.created_at))}</small>
      </div>
      ${current ? '' : `<button type="button" class="secondary danger-outline" data-revoke-session="${e(session.id)}">Revoke</button>`}
    </div>`;
  }).join('')}</div>`;
}

export function renderSecurityAlertsList(alerts = [], { escape: e, formatDate = v => String(v || '') } = {}) {
  if (!Array.isArray(alerts) || !alerts.length) {
    return '<p class="settings-draft-note">No security alerts triggered recently. Brute-force login blocks, duplicate payment proofs, and tampered QR scans appear here in real time.</p>';
  }
  return `<div class="security-alerts-feed">${alerts.map(alert => {
    const high = String(alert.severity || 'HIGH').toUpperCase() === 'HIGH';
    return `<div class="security-alert-item ${high ? 'severity-high' : 'severity-medium'}" data-security-alert="${e(alert.id)}">
      <div class="security-alert-header">
        <span class="security-severity-badge ${high ? 'high' : 'medium'}">${e(alert.severity || 'HIGH')}</span>
        <strong>${e(alert.title)}</strong>
        <small class="security-alert-time">${e(formatDate(alert.created_at))}</small>
      </div>
      <p>${e(alert.message)}</p>
      ${alert.rental_id ? `<div class="security-alert-actions"><button type="button" class="secondary small-btn" data-security-open-rental="${e(alert.rental_id)}">Inspect rental ${e(alert.rental_code || alert.rental_id)}</button></div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

export function renderSettings({ model, user, appearance, tab, draft, dirty, saving, preferences, users, activeSessions = null, securityAlerts = null, businessSubTab = 'profile' }, h) {
  const { escape: e, icon, formatDate = v => String(v || '') } = h, isAdmin = ['OPERATOR', 'ADMIN', 'OWNER'].includes(String(user.role).toUpperCase()), owner = String(user.role).toUpperCase() === 'OWNER', s = model.settings || {}, tabs = settingsTabs(owner);
  const active = tabs.some(row => row.id === tab) ? tab : 'business';
  const values = draft || {
    businessName: s.business_name || 'Rent & Play',
    location: s.location || 'Los Baños, Laguna',
    currency: s.currency || 'PHP',
    timezone: s.timezone || 'Asia/Manila',
    defaultLateGraceHours: s.default_late_grace_hours ?? 0,
    contactPhone: s.contact_phone || '0992-768-5192',
    contactChannels: s.contact_channels || 'Call / Text / Viber',
    opensAt: s.opens_at || '08:00',
    closesAt: s.closes_at || '20:00',
    reservationHoldMinutes: s.reservation_hold_minutes ?? 30,
    maxActiveRentalsPerCustomer: s.max_active_rentals_per_customer ?? 2,
    announcementEnabled: Boolean(s.announcement_enabled),
    announcementText: s.announcement_text || ''
  };
  const title = (eyebrow, name, note) => `<div class="settings-section-title"><span class="eyebrow">${eyebrow}</span><h3>${name}</h3><p>${note}</p></div>`;
  const options = (rows, selected) => rows.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  let content = '';

  if (active === 'business') {
    const qrImage = s.instapay_qr_data_url || s.gcash_qr_data_url || '';

    // 1. BUSINESS PROFILE & OPERATIONAL SCHEDULE
    const sectionProfile = `<section class="panel settings-card" data-subtab="profile" data-state="${dirty || saving ? 'edit' : 'view'}">
      <div class="settings-card-header">
        <div class="settings-section-title">
          <span class="eyebrow">BUSINESS PROFILE &amp; SCHEDULE</span>
          <h3>Your rental workspace &amp; operating hours</h3>
          <p>${owner ? 'Business details, operating hours, and booking hold rules are shared with staff and customers.' : 'Workspace details and schedules are managed by the owner.'}</p>
        </div>
        ${owner ? `<div class="settings-card-actions">
          <button type="button" class="secondary small-btn settings-edit-toggle-btn" data-toggle-edit="profile">
            <span class="view-state-label">${icon('settings')} <span>Edit settings</span></span>
            <span class="edit-state-label"><span>Close editor</span></span>
          </button>
        </div>` : '<div class="settings-card-actions"><span class="settings-readonly-badge">Read-only</span></div>'}
      </div>

      <div class="settings-summary-view">
        <dl class="settings-account-details">
          <div><dt>Business name</dt><dd>${e(values.businessName)}</dd></div>
          <div><dt>Hub / Location</dt><dd>${e(values.location)}</dd></div>
          <div><dt>Operating hours</dt><dd>${e(values.opensAt)} – ${e(values.closesAt)} <small class="settings-tag">Daily</small></dd></div>
          <div><dt>Customer contact phone</dt><dd>${e(values.contactPhone)}</dd></div>
          <div><dt>Support channels</dt><dd>${e(values.contactChannels)}</dd></div>
          <div><dt>Reservation hold window</dt><dd>${e(values.reservationHoldMinutes)} minutes</dd></div>
          <div><dt>Late grace period</dt><dd>${e(values.defaultLateGraceHours)} hours</dd></div>
          <div><dt>Max active rentals</dt><dd>${e(values.maxActiveRentalsPerCustomer)} per customer</dd></div>
          <div><dt>Currency &amp; Timezone</dt><dd>${e(values.currency)} (${e(values.timezone)})</dd></div>
          <div style="grid-column: 1 / -1;">
            <dt>Live broadcast announcement</dt>
            <dd>${values.announcementEnabled ? `<span class="settings-status-pill pill-active">Active</span> <span class="settings-announcement-inline">${e(values.announcementText)}</span>` : '<span class="settings-status-pill pill-muted">Inactive / Off</span>'}</dd>
          </div>
        </dl>
        ${owner ? '' : '<div class="info-box">Only owners can edit business settings.</div>'}
      </div>

      ${owner ? `<div class="settings-edit-view">
        <form id="business-form" class="admin-form"><fieldset ${saving ? 'disabled' : ''}>
          <div class="form-grid">
            <label>Business name<input name="businessName" value="${e(values.businessName)}" maxlength="150" required/></label>
            <label>Hub / Location<input name="location" value="${e(values.location)}" maxlength="255" required/></label>
            <label>Customer contact phone<input name="contactPhone" value="${e(values.contactPhone)}" maxlength="40" placeholder="0992-768-5192"/></label>
            <label>Support &amp; order channels<input name="contactChannels" value="${e(values.contactChannels)}" maxlength="100" placeholder="Call / Text / Viber"/></label>
            <label>Opening time<input name="opensAt" type="time" value="${e(values.opensAt)}" required/><small>Walk-in desk &amp; customer booking opens.</small></label>
            <label>Closing time<input name="closesAt" type="time" value="${e(values.closesAt)}" required/><small>Daily rental service closing time.</small></label>
            <label>Reservation hold window (minutes)<input name="reservationHoldMinutes" type="number" min="5" max="1440" value="${e(values.reservationHoldMinutes)}" required/><small>Approved reservation hold duration before expiration.</small></label>
            <label>Default late grace period (hours)<input name="defaultLateGraceHours" type="number" min="0" max="168" step="0.25" value="${e(values.defaultLateGraceHours)}" required/><small>Palugit bago pumatak ang late overtime charges (0.25 = 15m).</small></label>
            <label>Max active rentals per customer<input name="maxActiveRentalsPerCustomer" type="number" min="1" max="20" value="${e(values.maxActiveRentalsPerCustomer)}" required/><small>Maximum concurrent equipment allowed per customer.</small></label>
            <label>Currency<input name="currency" value="${e(values.currency)}" readonly/><small>Philippine Pesos (PHP).</small></label>
            <label>Timezone<input name="timezone" value="${e(values.timezone)}" readonly/><small>Philippine Time (Asia/Manila).</small></label>
          </div>
          <div class="settings-divider"></div>
          <h4>Live broadcast announcement banner</h4>
          <p>Broadcast an urgent notice or advisory message shown on mobile checkout and staff screens.</p>
          <label class="settings-checkbox-row">
            <input name="announcementEnabled" type="checkbox" ${values.announcementEnabled ? 'checked' : ''}/>
            <span>Enable live announcement banner<small>Turn on to display this banner to all users.</small></span>
          </label>
          <label>Banner message
            <textarea name="announcementText" rows="2" maxlength="500" placeholder="e.g. Notice: Rainy weather advisory - outdoor bike and racket rentals may be temporarily suspended.">${e(values.announcementText)}</textarea>
          </label>
          <p class="settings-draft-note" role="status">${saving ? 'Saving changes…' : dirty ? 'You have unsaved changes. Your draft is kept while switching tabs.' : 'Changes apply after you select Save business settings.'}</p>
          <p class="form-error" role="alert"></p>
          <div class="settings-form-footer">
            <button class="secondary" type="button" data-cancel-edit="profile">Cancel</button>
            <button class="secondary" id="business-discard" type="button" ${dirty ? '' : 'disabled'}>Discard changes</button>
            <button class="primary" type="submit">${saving ? 'Saving…' : 'Save business settings'}</button>
          </div>
        </fieldset></form>
      </div>` : ''}
    </section>`;

    // 2. CUSTOMER PAYMENTS & QR
    const sectionPayment = `<section class="panel settings-card" data-subtab="payment" data-state="view">
      <div class="settings-card-header">
        <div class="settings-section-title">
          <span class="eyebrow">CUSTOMER PAYMENTS</span>
          <h3>InstaPay / GCash QR &amp; Cash Options</h3>
          <p>${owner ? 'Customers can pay via InstaPay or GCash QR transfer, upload their transfer screenshot, or pay cash at handover.' : 'Active payment credentials used by customers at checkout.'}</p>
        </div>
        ${owner ? `<div class="settings-card-actions">
          <button type="button" class="secondary small-btn settings-edit-toggle-btn" data-toggle-edit="payment">
            <span class="view-state-label">${icon('settings')} <span>Edit payment options</span></span>
            <span class="edit-state-label"><span>Close editor</span></span>
          </button>
        </div>` : '<div class="settings-card-actions"><span class="settings-readonly-badge">Read-only</span></div>'}
      </div>

      <div class="settings-summary-view">
        <div class="settings-payment-summary-layout">
          <dl class="settings-account-details">
            <div><dt>Account name</dt><dd>${e(s.instapay_account_name || s.gcash_account_name || 'Not configured')}</dd></div>
            <div><dt>Account / GCash number</dt><dd>${e(s.instapay_account_number || s.gcash_account_number || 'Not configured')}</dd></div>
            <div><dt>Cash accepted</dt><dd>${s.accept_cash !== false ? '<span class="settings-status-pill pill-active">Accepted at handover</span>' : '<span class="settings-status-pill pill-muted">Disabled (Electronic only)</span>'}</dd></div>
            <div><dt>Payment instructions</dt><dd>${e(s.instapay_instructions || 'Standard checkout instructions')}</dd></div>
          </dl>
          <div class="settings-qr-card-preview">
            <strong>Customer QR code</strong>
            ${qrImage ? `<div class="settings-qr-thumb-wrap"><img class="rental-payment-qr-preview" alt="Saved owner InstaPay / GCash QR" src="${e(qrImage)}"/><span class="settings-status-pill pill-active">Active QR</span></div>` : '<div class="settings-qr-empty"><span>No QR uploaded</span><small>Cash only</small></div>'}
          </div>
        </div>
      </div>

      ${owner ? `<div class="settings-edit-view">
        <form id="payment-settings-form" class="admin-form"><input type="hidden" name="imageDataUrl" value="${e(qrImage)}"/>
          <div class="form-grid">
            <label>Account name<input name="accountName" value="${e(s.instapay_account_name || s.gcash_account_name || '')}" maxlength="120" autocomplete="off"/></label>
            <label>Account / GCash number<input name="accountNumber" value="${e(s.instapay_account_number || s.gcash_account_number || '')}" maxlength="80" autocomplete="off"/></label>
          </div>
          <label class="settings-checkbox-row">
            <input name="acceptCash" type="checkbox" ${s.accept_cash !== false ? 'checked' : ''}/>
            <span>Accept in-person cash payment at equipment handover<small>Allow customers to choose cash payment during checkout or walk-in registration.</small></span>
          </label>
          <label>Payment instructions<textarea name="instructions" maxlength="500" rows="3">${e(s.instapay_instructions || 'Pay the exact total shown. Upload a screenshot after the transfer succeeds.')}</textarea></label>
          <label>Upload or replace the InstaPay / GCash QR<input type="file" accept="image/png,image/jpeg" data-payment-qr/><small>PNG or JPEG, up to 500 KB. Customers will see this QR in checkout.</small></label>
          <div data-payment-qr-preview>${qrImage ? `<img class="rental-payment-qr-preview" alt="Saved owner InstaPay / GCash QR" src="${e(qrImage)}"/>` : '<p class="settings-draft-note">No owner QR configured. Customers can choose cash until one is saved.</p>'}</div>
          <button type="button" class="secondary" data-payment-qr-remove ${qrImage ? '' : 'hidden'}>Remove saved QR</button>
          <p class="form-error" role="alert"></p>
          <div class="settings-form-footer">
            <button type="button" class="secondary" data-cancel-edit="payment">Cancel</button>
            <button class="primary" type="submit">Save payment instructions</button>
          </div>
        </form>
      </div>` : ''}
    </section>`;

    // 3. RENTAL RULES, PENALTIES & LIABILITY MATRIX
    const sectionRules = `<section class="panel settings-card" data-subtab="rules" data-state="view">
      <div class="settings-card-header">
        <div class="settings-section-title">
          <span class="eyebrow">RATES, PENALTIES &amp; LIABILITY</span>
          <h3>Overtime penalties, missing parts &amp; security deposits</h3>
          <p>${owner ? 'Define default hourly overtime rates, missing component fees, and security deposit instructions.' : 'Rental rules and penalties are managed by the owner.'}</p>
        </div>
        ${owner ? `<div class="settings-card-actions">
          <button type="button" class="secondary small-btn settings-edit-toggle-btn" data-toggle-edit="rules">
            <span class="view-state-label">${icon('settings')} <span>Edit rates &amp; rules</span></span>
            <span class="edit-state-label"><span>Close editor</span></span>
          </button>
        </div>` : '<div class="settings-card-actions"><span class="settings-readonly-badge">Read-only</span></div>'}
      </div>

      <div class="settings-summary-view">
        <dl class="settings-account-details">
          <div><dt>Default overtime rate</dt><dd>PHP ${e(s.default_overtime_rate ?? 100)} / hr</dd></div>
          <div><dt>Standard lost piece fee</dt><dd>PHP ${e(s.lost_piece_fee ?? 50)}</dd></div>
          <div><dt>Security deposit policy note</dt><dd>${e(s.security_deposit_note || defaultSecurityDepositNote)}</dd></div>
          <div><dt>Equipment damage &amp; replacement liability disclaimer</dt><dd>${e(s.damage_policy_note || defaultDamagePolicyNote)}</dd></div>
        </dl>
      </div>

      ${owner ? `<div class="settings-edit-view">
        <form id="rules-settings-form" class="admin-form">
          <div class="form-grid">
            <label>Default overtime rate (PHP / started hour)<input name="defaultOvertimeRate" type="number" min="0" max="5000" step="10" value="${e(s.default_overtime_rate ?? 100)}" required/><small>Base hourly penalty applied after the late grace period.</small></label>
            <label>Standard lost piece / accessory fee (PHP)<input name="lostPieceFee" type="number" min="0" max="5000" step="10" value="${e(s.lost_piece_fee ?? 50)}" required/><small>Standard fee for missing cables, paddles, or game cards.</small></label>
          </div>
          <label>Refundable security deposit policy note
            <textarea name="securityDepositNote" rows="2" maxlength="1000" placeholder="Deposit terms for high-value tech items...">${e(s.security_deposit_note || defaultSecurityDepositNote)}</textarea>
            <small>Displayed during checkout for consoles (e.g. PS5, Nintendo Switch).</small>
          </label>
          <label>Equipment damage &amp; replacement liability disclaimer
            <textarea name="damagePolicyNote" rows="2" maxlength="1000" placeholder="Damage inspection and liability policy...">${e(s.damage_policy_note || defaultDamagePolicyNote)}</textarea>
            <small>Policy disclaimer for equipment return condition and replacement costs.</small>
          </label>
          <p class="form-error" role="alert"></p>
          <div class="settings-form-footer">
            <button type="button" class="secondary" data-cancel-edit="rules">Cancel</button>
            <button class="primary" type="submit">Save rental &amp; penalty rules</button>
          </div>
        </form>
      </div>` : ''}
    </section>`;

    // 4. LEGAL & CUSTOMER POLICIES
    const sectionTerms = `<section class="panel settings-card" data-subtab="terms" data-state="view">
      <div class="settings-card-header">
        <div class="settings-section-title">
          <span class="eyebrow">LEGAL &amp; POLICIES</span>
          <h3>Terms &amp; Conditions</h3>
          <p>${owner ? 'Set the terms and rental policies presented to customers during sign-up and rental checkout.' : 'Workspace terms and conditions are managed by the owner.'}</p>
        </div>
        ${owner ? `<div class="settings-card-actions">
          <button type="button" class="secondary small-btn settings-edit-toggle-btn" data-toggle-edit="terms">
            <span class="view-state-label">${icon('settings')} <span>Edit terms &amp; policies</span></span>
            <span class="edit-state-label"><span>Close editor</span></span>
          </button>
        </div>` : '<div class="settings-card-actions"><span class="settings-readonly-badge">Read-only</span></div>'}
      </div>

      <div class="settings-summary-view">
        <div class="settings-terms-grid">
          <div class="settings-term-item">
            <div class="settings-term-item-head">
              <strong>General Terms &amp; Conditions</strong>
              <span class="settings-status-pill pill-active">Account Registration</span>
            </div>
            <p class="settings-term-snippet">${e(s.terms_and_conditions || defaultTermsAndConditions)}</p>
          </div>
          <div class="settings-term-item">
            <div class="settings-term-item-head">
              <strong>Rental Checkout Terms</strong>
              <span class="settings-status-pill pill-active">Checkout Agreement</span>
            </div>
            <p class="settings-term-snippet">${e(s.rental_terms || defaultRentalTerms)}</p>
          </div>
          <div class="settings-term-item">
            <div class="settings-term-item-head">
              <strong>Privacy Policy</strong>
              <span class="settings-status-pill pill-active">Data Privacy Act</span>
            </div>
            <p class="settings-term-snippet">${e(s.privacy_policy || defaultPrivacyPolicy)}</p>
          </div>
          <div class="settings-term-item">
            <div class="settings-term-item-head">
              <strong>Cancellation &amp; Refund Policy</strong>
              <span class="settings-status-pill pill-active">Refund Rules</span>
            </div>
            <p class="settings-term-snippet">${e(s.refund_policy || defaultRefundPolicy)}</p>
          </div>
          <div class="settings-term-item full-width">
            <div class="settings-term-item-head">
              <strong>Accepted Valid Identification Types</strong>
              <span class="settings-status-pill pill-active">Verification</span>
            </div>
            <p class="settings-term-snippet">${e(s.accepted_id_types || defaultAcceptedIds)}</p>
          </div>
        </div>
        ${owner ? '' : '<div class="info-box">Only owners can edit Terms & Conditions.</div>'}
      </div>

      ${owner ? `<div class="settings-edit-view">
        <form id="terms-settings-form" class="admin-form">
          <label>General Terms &amp; Conditions (Account Registration)
            <textarea name="termsAndConditions" rows="8" placeholder="Enter terms &amp; conditions for account registration..." required>${e(s.terms_and_conditions || defaultTermsAndConditions)}</textarea>
            <small>These terms are displayed to customers when creating their Rent &amp; Play account.</small>
          </label>
          <label>Rental Checkout Terms &amp; Agreement
            <textarea name="rentalTerms" rows="6" placeholder="Enter rental checkout agreement terms...">${e(s.rental_terms || defaultRentalTerms)}</textarea>
            <small>These terms are displayed to customers before confirming a rental booking.</small>
          </label>
          <label>Privacy Policy (Data Privacy Act of 2012)
            <textarea name="privacyPolicy" rows="6" placeholder="Enter customer privacy policy...">${e(s.privacy_policy || defaultPrivacyPolicy)}</textarea>
            <small>Explains how customer valid ID pictures, photos, and contact info are securely processed.</small>
          </label>
          <label>Cancellation &amp; Refund Policy
            <textarea name="refundPolicy" rows="6" placeholder="Enter cancellation and refund policy...">${e(s.refund_policy || defaultRefundPolicy)}</textarea>
            <small>Rules regarding advance cancellations, defective equipment replacement, and deposit returns.</small>
          </label>
          <label>Accepted Valid Identification Types
            <textarea name="acceptedIdTypes" rows="3" placeholder="Enter accepted IDs...">${e(s.accepted_id_types || defaultAcceptedIds)}</textarea>
            <small>List of valid IDs shown to customers during the mandatory physical ID verification step.</small>
          </label>
          <p class="form-error" role="alert"></p>
          <div class="settings-form-footer">
            <button type="button" class="secondary" data-cancel-edit="terms">Cancel</button>
            <button type="button" id="terms-restore-default" class="secondary">Reset to default</button>
            <button class="primary" type="submit">Save Terms &amp; Conditions</button>
          </div>
        </form>
      </div>` : ''}
    </section>`;

    // 5. THERMAL RECEIPT PRINTER SETTINGS
    const sectionReceipt = `<section class="panel settings-card" data-subtab="receipt" data-state="view">
      <div class="settings-card-header">
        <div class="settings-section-title">
          <span class="eyebrow">RECEIPT PRINTER (MX10)</span>
          <h3>55mm continuous roll header &amp; footer</h3>
          <p>${owner ? 'Customize the store header, branch contact info, and return reminders printed on customer thermal receipts.' : 'Thermal receipt settings are managed by the owner.'}</p>
        </div>
        ${owner ? `<div class="settings-card-actions">
          <button type="button" class="secondary small-btn settings-edit-toggle-btn" data-toggle-edit="receipt">
            <span class="view-state-label">${icon('settings')} <span>Edit receipt layout</span></span>
            <span class="edit-state-label"><span>Close editor</span></span>
          </button>
        </div>` : '<div class="settings-card-actions"><span class="settings-readonly-badge">Read-only</span></div>'}
      </div>

      <div class="settings-summary-view">
        <div class="settings-receipt-summary-layout">
          <dl class="settings-account-details">
            <div><dt>Receipt title</dt><dd>${e(s.receipt_header_title || s.business_name || 'RENT & PLAY')}</dd></div>
            <div><dt>Branch</dt><dd>${e(s.receipt_branch_line || 'Lakewoods Subdivision')}</dd></div>
            <div><dt>City</dt><dd>${e(s.receipt_city_line || s.location || 'Los Baños, Laguna')}</dd></div>
            <div><dt>Contact line</dt><dd>${e(s.receipt_contact_line || 'Not set')}</dd></div>
            <div style="grid-column: 1 / -1;"><dt>Footer disclaimer</dt><dd style="font-weight: 500; font-size: 12px; line-height: 1.6; color: var(--text-muted);">${e(s.receipt_footer_note || defaultReceiptFooter)}</dd></div>
          </dl>
          <div class="settings-receipt-preview-ticket">
            <div class="ticket-header">
              <strong>${e(s.receipt_header_title || s.business_name || 'RENT & PLAY')}</strong>
              <small>${e(s.receipt_branch_line || 'Lakewoods Subdivision')}</small>
              <small>${e(s.receipt_city_line || s.location || 'Los Baños, Laguna')}</small>
              <small>${e(s.receipt_contact_line || (s.contact_phone ? 'Contact: ' + s.contact_phone : 'Contact: 0992-768-5192'))}</small>
            </div>
            <div class="ticket-divider">- - - - - - - - - - - - - - - -</div>
            <div class="ticket-sample">
              <span>1x PS5 Console (2h)</span>
              <span>PHP 200.00</span>
            </div>
            <div class="ticket-divider">- - - - - - - - - - - - - - - -</div>
            <div class="ticket-footer">
              <small>${e(s.receipt_footer_note || defaultReceiptFooter)}</small>
            </div>
          </div>
        </div>
      </div>

      ${owner ? `<div class="settings-edit-view">
        <form id="receipt-settings-form" class="admin-form">
          <div class="form-grid">
            <label>Receipt header title<input name="receiptHeaderTitle" value="${e(s.receipt_header_title || s.business_name || 'RENT & PLAY')}" maxlength="80" required/></label>
            <label>Branch / subtitle line<input name="receiptBranchLine" value="${e(s.receipt_branch_line || 'Lakewoods Subdivision')}" maxlength="120"/></label>
            <label>City / province line<input name="receiptCityLine" value="${e(s.receipt_city_line || s.location || 'Los Baños, Laguna')}" maxlength="120"/></label>
            <label>Contact / TIN line<input name="receiptContactLine" value="${e(s.receipt_contact_line || (s.contact_phone ? 'Contact: ' + s.contact_phone : 'Contact: 0992-768-5192'))}" maxlength="120"/></label>
          </div>
          <label>Receipt return disclaimer footer note
            <textarea name="receiptFooterNote" rows="2" maxlength="500" placeholder="Custom note printed at the bottom of the receipt...">${e(s.receipt_footer_note || defaultReceiptFooter)}</textarea>
            <small>Printed at the bottom of customer receipts as proof of inspection terms.</small>
          </label>
          <p class="form-error" role="alert"></p>
          <div class="settings-form-footer">
            <button type="button" class="secondary" data-cancel-edit="receipt">Cancel</button>
            <button class="primary" type="submit">Save receipt layout</button>
          </div>
        </form>
      </div>` : ''}
    </section>`;

    const activeSub = ['profile', 'payment', 'rules', 'terms', 'receipt'].includes(businessSubTab) ? businessSubTab : 'profile';
    content = `<div class="settings-business-container" data-active-subtab="${activeSub}">
      <div class="settings-subnav" aria-label="Business settings subsections">
        <button type="button" class="settings-subnav-btn ${activeSub === 'profile' ? 'active' : ''}" data-business-subtab="profile">
          <span>Schedule &amp; Hub</span>
        </button>
        <button type="button" class="settings-subnav-btn ${activeSub === 'payment' ? 'active' : ''}" data-business-subtab="payment">
          <span>Payments &amp; QR</span>
        </button>
        <button type="button" class="settings-subnav-btn ${activeSub === 'rules' ? 'active' : ''}" data-business-subtab="rules">
          <span>Rates &amp; Rules</span>
        </button>
        <button type="button" class="settings-subnav-btn ${activeSub === 'terms' ? 'active' : ''}" data-business-subtab="terms">
          <span>Terms &amp; Policies</span>
        </button>
        <button type="button" class="settings-subnav-btn ${activeSub === 'receipt' ? 'active' : ''}" data-business-subtab="receipt">
          <span>Thermal Receipt</span>
        </button>
      </div>
      <div class="settings-cards-stack">
        ${sectionProfile}
        ${sectionPayment}
        ${sectionRules}
        ${sectionTerms}
        ${sectionReceipt}
      </div>
    </div>`;
  }

  if (active === 'appearance') content = `<section class="panel settings-card">${appearance}<div class="settings-tip"><strong>Personal to this browser</strong><p>Your appearance choice is remembered on this device. It does not change another staff member’s screen.</p></div></section>`;
  if (active === 'preferences') content = `<section class="panel settings-card">${title('YOUR WORKFLOW', 'Workspace preferences', 'Saved on this browser. These options do not change business data or other devices.')}<form id="preferences-form" class="admin-form"><label class="settings-checkbox-row"><input name="autoRefresh" type="checkbox" ${preferences.autoRefresh ? 'checked' : ''}/><span>Automatically refresh workspace data<small>Check for updates every 2 minutes while the page is visible. Paused in Settings and while editing. Manual Refresh is always available.</small></span></label><div class="settings-divider"></div><h4>Default analytics view</h4><p>Use these defaults when opening Reports in a new session. You can still adjust filters inside Reports.</p><div class="form-grid"><label>Default period<select name="reportPeriod">${options([['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['365d', 'Last 365 days']], preferences.reportPeriod)}</select></label><label>Default trend grouping<select name="reportGrouping">${options([['auto', 'Automatic'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']], preferences.reportGrouping)}</select></label></div><p class="form-error" role="alert"></p><div class="settings-form-footer"><button type="button" id="preferences-reset" class="secondary">Restore defaults</button><button type="submit" class="primary">Save preferences</button></div></form></section>`;
  if (active === 'users') content = `${users()}<div class="settings-tip"><strong>Customer accounts are managed separately</strong><p>This list contains staff accounts only: Operators and Owners. Manage customer profiles and mobile app access in the Customers section. Each account uses its own email and password.</p></div>`;
  if (active === 'account') {
    const roleLabel = owner ? 'Owner' : isAdmin ? 'Operator' : 'Customer';
    content = `<section class="panel settings-card">${title('ACCOUNT & SECURITY', 'Your account', 'Review your signed-in account and keep your access secure.')}<dl class="settings-account-details"><div><dt>Name</dt><dd>${e(user.name)}</dd></div><div><dt>Email</dt><dd>${e(user.email)}</dd></div><div><dt>Workspace role</dt><dd>${roleLabel}</dd></div><div><dt>Sign-in provider</dt><dd>Firebase Authentication</dd></div></dl><div class="settings-action-row"><div><h4>Profile details</h4><p>Update your name and personal profile information.</p></div><button class="secondary" data-page="Profile">View profile</button></div><div class="settings-action-row"><div><h4>Password reset</h4><p>Send a reset link to <strong>${e(user.email)}</strong>. Complete the password change in your email.</p></div><button class="secondary" id="settings-password-reset">Send reset email</button></div><p class="settings-security-status" role="status"></p><div class="settings-tip"><strong>On a shared computer?</strong><p>Sign out from the account menu when you finish. Your password is never shown on this page.</p></div></section>
    <section class="panel settings-card" id="settings-active-sessions-card">${title('ACTIVE SESSIONS MANAGEMENT', 'Signed-in devices & browsers', 'Monitor active browsers signed into your account and revoke access from other devices immediately.')}<div data-active-sessions-list>${activeSessions ? renderActiveSessionsList(activeSessions, { escape: e, formatDate }) : '<p class="settings-draft-note">Loading active sessions…</p>'}</div><div class="settings-form-footer"><button type="button" class="secondary" id="settings-refresh-sessions">Refresh sessions</button><button type="button" class="secondary" id="settings-revoke-other-sessions">Sign out of all other devices</button></div></section>
    <section class="panel settings-card" id="settings-security-alerts-card">${title('REAL-TIME SECURITY ALERTS', 'Security & anti-fraud monitor', 'Live feed of blocked brute-force logins, duplicate or edited payment proofs, and rolling QR verification failures.')}<div data-security-alerts-list>${securityAlerts ? renderSecurityAlertsList(securityAlerts, { escape: e, formatDate }) : '<p class="settings-draft-note">Loading recent security alerts…</p>'}</div></section>`;
  }
  return `<div class="settings-tabs" role="tablist" aria-label="Settings sections" aria-orientation="horizontal">${tabs.map(row => `<button type="button" role="tab" id="settings-tab-${row.id}" data-settings-tab="${row.id}" aria-controls="settings-panel-${row.id}" aria-selected="${row.id === active}" tabindex="${row.id === active ? 0 : -1}">${icon(row.icon)}<span>${row.label}</span></button>`).join('')}</div><div class="settings-tab-panel" role="tabpanel" id="settings-panel-${active}" aria-labelledby="settings-tab-${active}" tabindex="0">${content}</div>`;
}
