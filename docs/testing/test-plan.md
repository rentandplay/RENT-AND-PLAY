# Test Plan

Automated tests in `apps/backend/tests/transactions.test.mjs`, `transaction-api.test.mjs`, and `apps/web/tests/transactions.test.mjs` cover pricing snapshots, cents, preserved inspections after repair, maintenance links, all attempts, missing-data labels, terminal authentication, inspection revisions, expiry/rejection, and duplicate/concurrent requests.

Before live rollout, run emulator integration checks and validate these physical handoffs:

1. Request a rental, inspect before release, poll the terminal, and press OK using the displayed revision. Verify one ACTIVE rental, RELEASE snapshot, and RENTED item.
2. Edit prices, return late, inspect damage, and enter an explicit penalty. Poll again and confirm. Verify original rate/package, actual return time, correct overtime/final charges, rental-fee-only pricing, and one linked maintenance record.
3. Complete repair. Verify Available equipment and the unchanged damaged-return snapshot and inspection notes.
4. Reject a rental and let another expire, then reserve the equipment again. Verify closed requests disappear from the queue and remain in history with reasons.
5. Reject and expire return attempts. Verify ACTIVE rental and RENTED equipment; submit another attempt and search all attempts using status/type/terminal filters.
6. Send duplicate confirmations and race confirmation against expiry. Verify only one state change and condition/maintenance record. Try mismatched device/code/revision, inactive credentials, and ordinary website cookies; verify no handoff update.
7. Open legacy records with blank penalty/inspection/pricing data. Verify missing-data labels; current prices never fabricate old charges.
