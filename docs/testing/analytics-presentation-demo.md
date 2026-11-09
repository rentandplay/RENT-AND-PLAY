# Analytics presentation data

The dataset is synthetic presentation history linked to existing test customer accounts and equipment. It is not evidence of actual business demand, revenue or predictive accuracy.

The importer uses 49 complete days before the current Philippine business day. It respects equipment creation dates, existing rental intervals, open maintenance and stock availability. It creates completed historical rentals only. Fees use the current configured rate sheet, with a mix of weekdays, weekends, durations, fulfillment modes and on-time/late returns.

Customer profiles, account credentials, current stock custody, hardware verification and payment receipts are not changed. Demo rental charges are unpaid simulated charges; no collection or payment receipt is fabricated. Each record has `is_demo`, `demo_batch_id`, a demo note and a recovery fingerprint.

While the batch is active, Analytics opens with 90 days and a daily interval so the available history can support walk-forward comparisons. The dashboard, report and CSV identify the inclusion of demo history. Model fit scores describe this synthetic dataset.

From the repository root, preview or import:

```powershell
npm --prefix apps/backend run demo:analytics
npm --prefix apps/backend run demo:analytics -- --apply
```

The import saves a recovery plan under `apps/backend/backups/`, which is excluded from Git. Repeating an import reuses the active batch and does not duplicate rentals. Normal rental reference counters remain monotonic.

To preview removing the active batch after the presentation:

```powershell
npm --prefix apps/backend run demo:analytics:cleanup
```

To remove that batch and reverse its derived analytics contributions:

```powershell
npm --prefix apps/backend run demo:analytics:cleanup -- --apply
```

Cleanup retains a recovery copy and refuses to remove demo records that have been materially edited or linked to payment receipts. Existing rentals remain in place. Restart the local backend after importing or removing a batch to clear cached workspace snapshots, then refresh the browser.
