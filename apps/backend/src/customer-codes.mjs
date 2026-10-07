const codeNumber = value => {
  const match = /^CUST-(\d+)$/i.exec(String(value || ''));
  return match ? Number(match[1]) : 0;
};

const customerCode = value => `CUST-${String(value).padStart(3, '0')}`;

// Keep the sequence in one Firestore counter so concurrent account creation
// cannot assign the same customer code. Bootstrap from existing CUST codes.
export async function allocateCustomerCode(db, now = new Date()) {
  const counterRef = db.collection('counters').doc('customer_codes_CUST');
  const initialCounter = await counterRef.get();
  let highestExisting = 0;
  if (!initialCounter.exists) {
    const customers = await db.collection('customers').get();
    highestExisting = customers.docs.reduce((max, doc) => Math.max(max, codeNumber(doc.data()?.customer_code)), 0);
  }
  return db.runTransaction(async tx => {
    const counter = await tx.get(counterRef);
    const stored = Number(counter.data()?.next_sequence);
    const sequence = Math.max(Number.isSafeInteger(stored) && stored > 0 ? stored : 1, highestExisting + 1);
    tx.set(counterRef, { next_sequence: sequence + 1, updated_at: now }, { merge: true });
    return customerCode(sequence);
  });
}
