# Rent & Play — Comprehensive Admin Dashboard Evaluation & Redesign Specification

**Project:** RENT & PLAY: An IoT-Integrated Equipment Rental and Due Date Management System with Mobile QR Scanning and ESP32 Counter Verification Terminal  
**Institution:** Laguna University — College of Computing Studies  
**Target Enterprise:** Rent & Play (Lakewood Subdivision, Los Baños, Laguna)  
**Evaluated Components:** `DashboardView.jsx`, `WorkspaceLayout.jsx`, `dashboard.mjs`, `styles.css`  
**Date:** October 2026  
**Document Status:** Code-Audited & Verified  

---

## 1. Executive Summary & Verification Basis

This evaluation is not a generic assessment. It is 100% verified against the active codebase across the frontend React components (`apps/web/src/react/`), the backend dashboard service (`apps/backend/src/dashboard.mjs`), the styling rules (`apps/web/src/styles.css`), and the approved project proposal (`docs/proposal/REVISED_PROJECT_PROPOSAL_ESP32.md`).

### The Verified Core Finding:
The current web dashboard operates as a **passive, read-only status viewer** rather than an **active Counter Command Center**. 

While all automated backend and frontend tests pass, the dashboard has significant operational and presentation gaps:
1. It contradicts the capstone's primary hardware innovation by hardcoding the ESP32 terminal as "Standby" and claiming the hardware is reserved for future integration, despite the backend already supporting live terminal heartbeats.
2. It lacks immediate operational triggers for counter staff, forcing them to navigate through nested sidebar menus to handle standard walk-in checkouts or returns.
3. It buries high-risk overdue items as tiny subtext while presenting initial rental fees instead of actual daily revenue and payment method breakdowns (Cash vs. InstaPay/GCash).
4. Its visual design relies on micro-typography (9px–11px) and low-contrast borders, resulting in poor legibility on counter displays and tablets.

---

## 2. Enterprise & Architectural Context

To evaluate the dashboard correctly, the specific business and technical realities of Rent & Play must be understood:

* **Business Location & Customer Base:** Located in Lakewood Subdivision, Los Baños, Laguna, managed by Reynold Pastor. It caters to two distinct customer types:
  1. Walk-in customers renting at the shop counter.
  2. Vacationers renting equipment for private hot spring resort villas inside the subdivision (requiring scheduled delivery and resort handoffs).
* **Database Rule:** Supabase PostgreSQL is the sole persistent database engine (`yuhforhnrnfpzzhulgzt.supabase.co`). All collections (items, rentals, categories, rates, customers, terminals, verification requests, maintenance records, and audit logs) reside in Supabase.
* **Storage Rule:** Supabase Storage (`rental-media` bucket) handles all media (receipts, condition inspection photos, QR codes).
* **Firebase Rule:** Firebase is restricted strictly to Authentication (JWT sessions, OTP) and Push Notifications (FCM).
* **IoT Hardware Role:** The ESP32 countertop terminal is an authoritative physical gate equipped with an OLED display, dual buzzers, alert LEDs, and a tactile push button. No rental or return may be finalized until staff physically inspects the unit and presses the button.

---

## 3. Verified Problems in the Current Dashboard

### Problem 1: Critical IoT Hardware Disconnect (Direct Proposal Mismatch)
* **Code Evidence:** In `apps/web/src/react/DashboardView.jsx` (lines 380–408), the ESP32 card renders:
  - `<span className="offline-dot">Standby</span>`
  - `<strong>ON STANDBY</strong>`
  - `<p className="terminal-note">Admin confirms current releases and returns. The terminal is reserved for later hardware integration.</p>`
* **Why this is a severe issue:** 
  In the backend (`apps/backend/src/dashboard.mjs`, line 75), the server actively evaluates live hardware connectivity:
  `online: terminal.status === 'ONLINE' && !!terminal.last_seen_at && (now - asDate(terminal.last_seen_at) < 25000)`
  The frontend completely ignores this live status and tells the user the terminal is "reserved for later hardware integration." During an academic capstone defense or live business operation, this gives the false impression that the core IoT component is non-functional or fake.
* **Missing Queue Alert:** The pending verification queue is displayed merely as a raw number (`queue.length`). When a customer is waiting at the counter for button confirmation, there is no real-time visual cue or prompt instructing staff to press the ESP32 button.

---

### Problem 2: Complete Absence of Counter Fast-Track Actions
* **Code Evidence:** `DashboardView.jsx` contains only two navigation buttons: "Rental workflow" (which opens an educational modal explaining rules) and "View all rentals →".
* **Operational Bottleneck:** Counter staff in Lakewood Subdivision frequently handle simultaneous walk-ins and phone calls from resort villas. On the dashboard, there are zero action buttons for:
  - Starting a Walk-in Rental (`+ New Rental`)
  - Scanning an equipment QR code via webcam or USB scanner (`Scan QR`)
  - Processing a fast equipment return (`Quick Return`)
  - Testing the physical ESP32 terminal (`Ping Hardware`)
* **Impact:** Staff are forced to open the sidebar, click nested menu items, wait for sub-pages to mount, and locate the record before taking action.

---

### Problem 3: Passive Read-Only Table & Legacy String Modals
* **Code Evidence:** In `DashboardView.jsx` (lines 71–84 & lines 222–294):
  - Table rows only provide an arrow button that invokes:
    `showModal('Rental details', '<div class="detail-header">...</div>')`
* **Operational Bottleneck:** Clicking a row opens an unstyled, read-only HTML string popup. The modal does not offer inline workflow buttons such as:
  - "Confirm Handover & Start Timer"
  - "Receive Unit & Start Inspection"
  - "Contact Customer" (SMS / Phone call for overdue units)
  - "Print Thermal Receipt"
* **Missing Resort Fulfillment Context:** Rentals in Lakewood Subdivision are divided into shop counter handovers (`SHOP_HANDOVER`) and resort deliveries (`RESORT_HANDOFF` with locations like "Villa 4" and statuses like `OUT_FOR_DELIVERY`). The dashboard table omits fulfillment type and delivery address entirely.

---

### Problem 4: Downplayed Overdue Risk & Incomplete Revenue Metrics
* **Understated Overdue Risk:** Overdue equipment is tucked away as minor subtext under the "Due Today" card (`${s.overdue} overdue rental(s) need attention`). Overdue items represent lost assets and uncollected penalty fees. They should be elevated to a high-priority operational alert showing duration (e.g., "Overdue by 3h 15m").
* **Misleading Revenue Card:** Card 4 displays `money(s.fees)` labeled as *"Rental fees: From current active rentals"*. This is only the sum of initial fees for units currently in the field. It fails to show:
  - Actual revenue collected today (Cash vs. InstaPay/GCash)
  - Uncollected overdue penalties
  - Active security deposits held on counter
* **Inflexible Revenue Chart:** The 7-bar CSS chart (`DashboardView.jsx`, lines 354–375) only compares "This week" vs. "Last week" using generic day names (`Mon`, `Tue`...) without dates. It lacks an hourly breakdown to monitor peak weekend resort traffic hours (typically 2:00 PM to 6:00 PM).

---

### Problem 5: UI/UX, Typography, and Visual Hierarchy Weaknesses
* **Wireframe Aesthetic:** The interface relies on flat white boxes, low-contrast `#e9edf1` borders, and generic pastel circles, resembling an unstyled early prototype.
* **Micro Typography:** Critical labels and notes use 9px and 11px font sizes (`apps/web/src/styles.css`, line 734). These are difficult to read on shop counter monitors, POS tablets, and mobile devices.
* **Asymmetrical Layout Gaps:** The grid layout (`minmax(0, 1fr) 284px`) leaves significant vertical whitespace on desktop screens because the right column contains only three short cards while the left column contains a full table and chart.
* **Static Tip Card Waste:** The *"A small counter tip"* box has static hardcoded text (*"Check item condition before confirming a return."*). It does not dynamically reflect real inventory alerts, such as low stock on basketballs or overdue maintenance.

---

## 4. Gap Analysis Matrix

| Feature / Area | Current Implementation | Confirmed Problem / Risk | Target Redesign Specification |
| :--- | :--- | :--- | :--- |
| **ESP32 IoT Status** | Static "ON STANDBY" text; states terminal is for later integration. | Fails capstone defense validation; hides working hardware integration. | Real-time connection card showing **ONLINE / OFFLINE**, Wi-Fi signal, latency, and active firmware state. |
| **Verification Gate** | Shows a static count of pending requests (`queue.length`). | Staff cannot see incoming customer verification at the counter. | Live interactive card showing customer name, item code, transaction type, and an animated prompt: *"Awaiting Physical Button Press"*. |
| **Counter Actions** | None on dashboard; only opens an explanatory workflow popup. | High friction during customer rush hours; staff must navigate away. | Prominent **Counter Command Bar**: `+ Walk-in Rental`, `Scan QR`, `Quick Return`, `Ping Hardware`. |
| **Fleet Monitoring** | 5-row table sorted by due date; read-only popup on click. | No inline actions; no countdown timers; no resort delivery info. | Actionable fleet table with tabs (`Due Soon`, `Overdue`, `Resort Deliveries`), countdown badges, and inline action buttons (`Handover`, `Inspect`). |
| **Financial KPIs** | Shows total fees of currently active rentals only. | Does not display actual daily intake or payment method breakdown. | Operational revenue widget: Today's Intake, Cash vs. InstaPay split, and outstanding penalty balances. |
| **Revenue Chart** | Fixed 7-day CSS bar chart without exact calendar dates. | Cannot monitor peak checkout hours or exact daily performance. | Interactive trend chart with exact calendar dates, tooltips, and an hourly toggle for peak resort rush monitoring. |
| **Category Overview** | Simple count of items per category. | Does not indicate counter availability or equipment utilization. | Category progress bars showing counter availability (e.g., *"Sports: 8/10 Available (80%)"*). |
| **Visual Hierarchy** | Monochromatic white cards, micro 9px fonts, basic outlines. | Poor legibility, dated aesthetic, unbalanced layout grid. | High-contrast visual hierarchy, modern card depth, accessible font sizing (min 12px/14px), and refined dark mode. |

---

## 5. The 5-Zone Target Redesign Blueprint

To transform the dashboard into a professional, defense-ready **Counter Command Center**, the redesign is structured into five distinct operational zones:

### Zone 1: Counter Command Bar (Top Priority)
Positioned at the very top of the dashboard for instant staff access:
1. `[ + New Walk-in Rental ]` — Opens a fast-checkout dialog pre-filling walk-in terms.
2. `[ Scan QR / Barcode ]` — Activates camera or listens for hardware scanner input to instantly load customer or item records.
3. `[ Quick Return & Inspect ]` — Opens the return intake dialog with condition grading.
4. `[ Ping ESP32 Terminal ]` — Triggers a test chime and OLED splash on the physical terminal to verify counter hardware readiness.

### Zone 2: Real-Time Operational KPI Ribbon
Replaces passive counts with live operational health metrics:
* **Fleet Utilization:** `Active Rentals / Total Catalog` with a circular percentage gauge.
* **Due Next 2 Hours:** Urgent returns scheduled for the current work shift.
* **Critical Overdue:** Prominent crimson warning banner showing overdue count and accumulated late fees.
* **Today's Collections:** Total revenue collected today, broken down into Cash on Hand vs. InstaPay / GCash digital payments.

### Zone 3: Live ESP32 IoT Station & Verification Hub
Dedicated real-time hardware status module:
* **Connection Heartbeat:** Live **ONLINE** (green pulse) or **OFFLINE** (amber alert) reading `terminal.online`.
* **Hardware Telemetry:** Displays terminal code (`TERM-01`), Wi-Fi signal strength, and last ping timestamp.
* **Active Handshake Card:** When a rental or return is initiated, this card lights up with:
  - Customer name and equipment name/code.
  - Inspection completion status.
  - Animated instruction banner: *"Awaiting Physical Button Press on ESP32 Counter Station"*.

### Zone 4: Action-Oriented Fleet & Resort Delivery Triage Table
Replaces the passive 5-row table:
* **Operational Tabs:** `All Active`, `Due Soon (Next 2h)`, `Overdue Alert`, and `Resort Deliveries`.
* **Relative Time Countdowns:** Dynamic badges (`Due in 45m`, `Overdue by 2h 15m`).
* **Fulfillment Tags:** Distinct visual badges for `Shop Counter` vs. `Resort Villa (e.g., Villa 4)`.
* **Direct Row Actions:** One-click action buttons per row (`Handover`, `Inspect Return`, `Contact Customer`).

### Zone 5: Dynamic Demand & Revenue Insights
* **Interactive Revenue Graph:** Supports **Today's Hourly View** (revealing peak rental hours between 2:00 PM and 6:00 PM) and **Daily View** with exact calendar dates.
* **Category Counter Availability:** Live inventory meters showing available stock vs. rented stock per category (e.g., *"Gaming Consoles: 2/5 Available"*, *"Sports Equipment: 8/10 Available"*).

---

## 6. Technical Implementation Roadmap

1. **Backend Service Enhancements (`apps/backend/src/dashboard.mjs`):**
   - Correctly expose `terminal.online` based on the 25-second heartbeat rule.
   - Aggregate today's actual payments (Cash vs. InstaPay) and breakdown by category.
   - Include relative due calculations and fulfillment metadata in `data.rentals`.
2. **React Component Modernization (`apps/web/src/react/DashboardView.jsx`):**
   - Replace raw HTML string modals with structured, accessible React dialogs.
   - Implement the Counter Command Bar with direct action routes.
   - Connect live SSE updates to highlight newly verified transactions without requiring manual page reload.
3. **Styles & Visual Polish (`apps/web/src/styles.css`):**
   - Introduce modern surface elevations, refined status badges, and brand orange accents.
   - Increase body and label typography to accessible standards (minimum 12px/14px).
   - Balance the responsive grid layout to eliminate empty vertical whitespace.
4. **Validation Suite:**
   - Execute `npm run check` and `npm test` in `apps/web` to ensure all 181 automated tests pass.
   - Validate responsive breakpoints (320px, 768px, 1024px, 1440px).
