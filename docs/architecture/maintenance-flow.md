# Unit maintenance

Maintenance belongs to a physical equipment unit, identified by its existing equipment code and QR sticker. The equipment catalog stays grouped. For five bicycles with one damaged unit, active stock remains five, available stock becomes four, and maintenance stock becomes one.

Use **Maintenance → Report issue**, or open a unit under **Equipment → Units & history**. Select its exact unit code, describe the issue, choose its condition and priority, and optionally assign an active staff member, target date and photos. For a pending hold, resolve its assignment in Rentals first. An equipment unit currently with a customer must go through receipt and inspection in Returns.

## Repair and inspection

1. **Reported:** assess the issue and start diagnosis or repair.
2. **In repair:** record work notes, assignment, target date, photos and actual repair cost. Leave cost blank if unknown; enter zero only when there was no cost.
3. **For inspection:** record the work performed and test the physical unit. Function, safety and required parts/accessories must all pass. A failed inspection returns the ticket to repair.
4. **Completed:** save the final findings and a Good or Fair condition. The unit becomes available when no other open maintenance ticket remains.

The unit remains unavailable throughout the first three stages. Only one new open ticket may be created per unit. Concurrent reports and stale updates are rejected. If older data contains multiple open tickets, completing one does not release a unit while another issue remains unresolved.

A damaged rental return creates a reported maintenance ticket automatically, linked to the rental and original return inspection. Completing the later repair does not rewrite that inspection or impose a customer damage charge. Rental settlement and repair expenses remain separate records.

## Retirement and history

**Retire this unit** requires a reason and explicit confirmation for the selected unit. It closes the unit's open maintenance tickets and removes that unit from active stock while keeping its code, QR token, condition and history. Standard stock increases create replacement units; they do not reactivate retired units. The normal archived-unit Restore action rejects retirement records.

Completed and retired tickets remain visible under **Closed history**. Staff can add an expense correction, photo or note without changing equipment availability, including when that unit is in a later rental or its inventory record was subsequently deleted. Repair cost is the full total for the ticket. Historical records without a full checklist are labelled as older inspection notes. Legacy tickets also use the new repair and inspection steps; the old completion shortcut is rejected.

## Web and Android

Web and Android staff manage the same workflow. On Android, open **Staff counter → Manage maintenance**, or open a ticket in Equipment details. Both clients support exact-unit issue reports, staff assignments, target dates, repair costs, photos, repair and inspection stages, failed inspection and retirement. Android completion requires the same three checks and Good or Fair condition. Closed tickets support expense corrections and notes. A stale revision prompts a refresh before another save. Customer checkout uses the backend's current available-unit checks; a unit with an open maintenance ticket or an unsafe condition cannot be quoted or assigned to a rental, even if older data incorrectly marked it available.

All maintenance endpoints require an active staff account. Photos are fetched separately through authenticated ticket-specific endpoints, rather than loading image bytes in every workspace response. Up to three photos may be added per update and six per ticket; web and Android resize uploads before saving.

Open tickets retain lifecycle `status: IN_PROGRESS`, with `workflow_stage` set to `REPORTED`, `IN_REPAIR` or `AWAITING_INSPECTION`. Closed statuses are `COMPLETED` and `RETIRED`. This preserves existing availability queries and analytics. Older `OPEN` records appear as Reported; older `IN_PROGRESS` records appear as In repair.

Relevant regression checks are in `apps/backend/tests/maintenance.test.mjs`, `apps/backend/tests/workspace.test.mjs`, `apps/web/tests/maintenance.test.mjs`, Android's `test/maintenance_ui_test.dart`, and the existing stock, rental/return and confirmation tests.
