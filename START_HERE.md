# START HERE

This scaffold is intentionally framework-light so you can choose/install the exact stack without deleting generated boilerplate.

## Recommended web stack

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Axios or Fetch
- Tailwind CSS

## Recommended first web milestones

1. Set up React + TypeScript + Vite inside `apps/web`
2. Create shared layout (sidebar/header)
3. Add routing
4. Add mock data in `apps/web/src/mocks`
5. Build Dashboard
6. Build Inventory
7. Build Customers
8. Build Active Rentals / Due Dates
9. Build Rates
10. Build Maintenance
11. Build ESP32 Terminal / Verification monitoring
12. Replace mock services with the real Backend API

## Important rule

Do NOT let the Web app, the Android app maintained in `../AndroidFiles`, or ESP32 connect directly to Cloud Firestore with privileged access.

Use:

Web / Android app / ESP32 -> Backend REST API -> Firebase Authentication + Cloud Firestore

## Shared statuses to agree on early

Item:
- AVAILABLE
- RENTED
- UNDER_MAINTENANCE

Verification:
- PENDING
- CONFIRMED
- REJECTED
- EXPIRED

Rental:
- PENDING_VERIFICATION
- ACTIVE
- COMPLETED
- REJECTED
- EXPIRED
