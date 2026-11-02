import { createHash } from 'node:crypto';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

const EDITING_SIGNATURES = [
  'Adobe Photoshop',
  'GIMP',
  'Canva',
  'PicsArt',
  'Snapseed',
  'Photopea',
  'Paint.NET',
  'Figma',
  'Lightroom',
  'Pixelmator'
];

export function hashPaymentImageDataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return createHash('sha256').update(value).digest('hex');
  const bytes = Buffer.from(match[2], 'base64');
  return createHash('sha256').update(bytes).digest('hex');
}

export function normalizePaymentReference(reference) {
  if (typeof reference !== 'string') return null;
  const cleaned = reference.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.length >= 4 ? cleaned : null;
}

export function inspectPaymentImage(value) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value || ''));
  if (!match) return { image_hash: null, byte_length: 0, mime_type: null, software_signature: null, tamper_warnings: [] };
  const bytes = Buffer.from(match[2], 'base64');
  const image_hash = createHash('sha256').update(bytes).digest('hex');
  const asciiSample = bytes.subarray(0, Math.min(bytes.length, 65536)).toString('latin1');
  const detectedSoftware = EDITING_SIGNATURES.find(sig => asciiSample.toLowerCase().includes(sig.toLowerCase())) || null;
  const tamper_warnings = [];
  if (detectedSoftware) {
    tamper_warnings.push({
      code: 'EDITED_IMAGE_METADATA',
      severity: 'HIGH',
      message: `Image metadata contains editing software signature (${detectedSoftware}). Verify transfer details carefully.`
    });
  }
  return {
    image_hash,
    byte_length: bytes.length,
    mime_type: `image/${match[1]}`,
    software_signature: detectedSoftware,
    tamper_warnings
  };
}

export function validatePaymentImage(value, label, maxBytes) {
  if (typeof value !== 'string') fail(400, `Upload a ${label}.`);
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) fail(400, `The ${label} must be a PNG or JPEG image.`);
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== match[2]) fail(400, `The ${label} must be smaller than ${Math.ceil(maxBytes / 1024)} KB.`);
  const valid = match[1] === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) fail(400, `The ${label} image is invalid.`);
  return value;
}

export function validatePaymentProof(input = {}) {
  const image_data_url = validatePaymentImage(input.imageDataUrl, 'payment proof', 350_000);
  const reference = typeof input.reference === 'string' ? input.reference.trim().slice(0, 100) : '';
  const inspection = inspectPaymentImage(image_data_url);
  const normalized_reference = normalizePaymentReference(reference);
  return {
    image_data_url,
    reference: reference || null,
    normalized_reference,
    image_hash: inspection.image_hash,
    security_checks: {
      ...inspection,
      normalized_reference
    }
  };
}

export function evaluatePaymentProofSecurity(existingProofs = [], currentProof = {}, currentRentalId = '') {
  const rentalId = String(currentRentalId || '');
  const flags = [...(currentProof.security_checks?.tamper_warnings || [])];
  const imageHash = currentProof.image_hash || hashPaymentImageDataUrl(currentProof.image_data_url);
  const normRef = currentProof.normalized_reference ?? normalizePaymentReference(currentProof.reference);

  for (const row of existingProofs) {
    if (!row || String(row.rental_id || row.id || '') === rentalId) continue;
    const otherHash = row.image_hash || hashPaymentImageDataUrl(row.image_data_url);
    if (imageHash && otherHash && imageHash === otherHash && !flags.some(f => f.code === 'DUPLICATE_IMAGE_HASH')) {
      flags.push({
        code: 'DUPLICATE_IMAGE_HASH',
        severity: 'HIGH',
        matched_rental_id: String(row.rental_id || row.id || ''),
        message: `Duplicate screenshot detected: this exact image was already submitted on rental ${row.rental_code || row.rental_id || row.id}.`
      });
    }
    const otherRef = row.normalized_reference ?? normalizePaymentReference(row.reference);
    if (normRef && otherRef && normRef === otherRef && !flags.some(f => f.code === 'DUPLICATE_REFERENCE')) {
      flags.push({
        code: 'DUPLICATE_REFERENCE',
        severity: 'HIGH',
        matched_rental_id: String(row.rental_id || row.id || ''),
        message: `Duplicate transfer reference (${currentProof.reference}) already used on rental ${row.rental_code || row.rental_id || row.id}.`
      });
    }
  }

  return {
    image_hash: imageHash,
    normalized_reference: normRef,
    security_status: flags.length > 0 ? 'FLAGGED' : 'CLEAN',
    security_flags: flags
  };
}

export function validateInstapayQr(input = {}) {
  const image_data_url = input.imageDataUrl == null || input.imageDataUrl === ''
    ? null
    : validatePaymentImage(input.imageDataUrl, 'InstaPay / GCash QR', 500_000);
  const account_name = typeof input.accountName === 'string' ? input.accountName.trim().slice(0, 120) : '';
  const account_number = typeof input.accountNumber === 'string' ? input.accountNumber.trim().slice(0, 80) : '';
  const instructions = typeof input.instructions === 'string' ? input.instructions.trim().slice(0, 500) : '';
  if (input.imageDataUrl && !account_name) fail(400, 'Enter the account name shown on the InstaPay / GCash QR.');
  if (input.imageDataUrl && !account_number) fail(400, 'Enter the account number shown on the InstaPay / GCash QR.');
  return {
    instapay_qr_data_url: image_data_url,
    gcash_qr_data_url: image_data_url,
    instapay_account_name: account_name,
    instapay_account_number: account_number,
    instapay_instructions: instructions
  };
}
