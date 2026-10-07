const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

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
  return { image_data_url, reference: reference || null };
}

export function validateInstapayQr(input = {}) {
  const image_data_url = input.imageDataUrl == null || input.imageDataUrl === ''
    ? null
    : validatePaymentImage(input.imageDataUrl, 'InstaPay QR', 250_000);
  const account_name = typeof input.accountName === 'string' ? input.accountName.trim().slice(0, 120) : '';
  const account_number = typeof input.accountNumber === 'string' ? input.accountNumber.trim().slice(0, 80) : '';
  const instructions = typeof input.instructions === 'string' ? input.instructions.trim().slice(0, 500) : '';
  if (input.imageDataUrl && !account_name) fail(400, 'Enter the account name shown on the InstaPay QR.');
  if (input.imageDataUrl && !account_number) fail(400, 'Enter the account number shown on the InstaPay QR.');
  return { instapay_qr_data_url: image_data_url, instapay_account_name: account_name, instapay_account_number: account_number, instapay_instructions: instructions };
}
