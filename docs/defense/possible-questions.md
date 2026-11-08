# Possible Defense Questions and Prepared Answers (Rent & Play)

> **Laguna University — College of Computing Studies**  
> **System:** Rent & Play: An IoT-Integrated Equipment Rental and Due Date Management System with Mobile QR Scanning and ESP32 Counter Verification Terminal  

---

## 1. System Architecture & IoT Integration

### Q1: Bakit kinailangan pa ng ESP32 hardware terminal kung kaya namang gawin ang lahat sa Mobile App o Web Dashboard?
**Answer:**  
Ang purong software systems ay bulag sa pisikal na katotohanan sa tindahan — maaaring ma-click ng staff ang "Release" o "Return" nang hindi personal na naiinspeksyon ang gamit, o kahit wala pa ang customer sa harap ng counter. Ang ESP32 Counter Terminal ay nagsisilbing **authoritative physical confirmation gate**. Pinipilit nito na bago magsimula ang rental timer (o bago tapusin ang return), dapat ay personal na hawak ng staff ang kagamitan sa counter at pipindutin ang physical push button sa hardware station.

### Q2: Nasaan ang "Sensors" sa inyong system ayon sa evaluation rubric?
**Answer:**  
Ang aming sistema ay gumagamit ng dalawang lebel ng input sensing:
1. **Optical Image Sensing:** Ang camera sensor ng mobile device ay ginagamit para sa real-time optical image acquisition at QR decoding ng equipment at customer tickets.
2. **Tactile Hardware Sensing & Actuation:** Ang tactile push button (GPIO 35 na may active-low hardware interrupt) sa ESP32 ang pisikal na contact trigger, habang ang feedback ay pinangungunahan ng I2C SSD1306 OLED visual sensor/display, dual-frequency acoustic buzzers, at LED indicators.
*(Opsyonal kung may physical IR presence sensor sa counter box: "Mayroon ding IR obstacle sensor sa ilalim ng inspection counter bed upang tiyaking nakalapag ang kagamitan bago mag-confirm.")*

### Q3: Anong communication protocol ang gamit ng ESP32? Bakit HTTP REST at hindi MQTT?
**Answer:**  
Ang ESP32 terminal ay nakikipag-ugnayan sa pamamagitan ng **authenticated HTTP/HTTPS REST API** sa aming Node.js backend:
* Nagpo-poll ito sa `GET /api/terminals/:id/pending` tuwing 3 segundo.
* Nagpapadala ito ng `POST /api/terminals/:id/confirm` kapag napindot ang button.
Pinili namin ang HTTP REST dahil sapat ang 3-second polling rate para sa counter verification ng isang rental store, mas magaan ang overhead dahil iisa ang backend API server ng Web, Mobile, at Hardware, at hindi na kailangan ng hiwalay na external MQTT broker instance.

---

## 2. Security, Authentication & RBAC

### Q4: Paano ninyo ipinapatupad ang Role-Based Access Control (RBAC)?
**Answer:**  
Mayroon kaming 4 na malinaw at mahigpit na access levels:
1. **`OWNER` (Admin):** Buong access sa web workspace — mga financial reports, pricing rate matrix, paggawa ng staff accounts, at business settings.
2. **`OPERATOR` (Staff):** Limitado sa counter rental desk, mobile QR scanning, return inspection, at maintenance tickets. Bawal magbago ng rates o bank details.
3. **`CUSTOMER`:** Mobile app lang ang pwedeng gamitin. Kapag sinubukan nitong mag-login sa web admin, awtomatikong magbabalik ang backend ng `403 Forbidden`.
4. **`DEVICE` (ESP32):** May provisioned `TERMINAL_KEY`. Makaka-access lamang ito sa terminal-specific routes (`/pending` at `/confirm`). Wala itong access sa customer records o financial data.

### Q5: Paano pinoprotektahan ang mga sesyon at API calls?
**Answer:**  
* Sa **Web Dashboard**, gumagamit kami ng secure **HTTP-only session cookies** na may server-side session tracking at revocation feature.
* Sa **Mobile App**, gumagamit kami ng **Firebase Authentication ID Tokens (JWT)** na bina-validate ng Firebase Admin SDK sa backend bago mag-serve ng data.
* Sa **ESP32**, gumagamit kami ng pre-shared cryptographic Bearer token.
* Bawat rental request ay may kasamang cryptographic verification code at 10-minute Time-To-Live (TTL) upang maiwasan ang replay attacks.

---

## 3. Data Integrity & Business Rules

### Q6: Paano maiiwasan ang double-booking o sabay na pag-renta sa iisang gamit?
**Answer:**  
Kapag nag-checkout ang customer o nag-initiate ng walk-in rental ang staff, awtomatikong inilalagay ng backend ang unit sa status na `PENDING_VERIFICATION` at nagkakaroon ng temporary hold. Habang naka-hold ang unit, hindi na ito lilitaw na available sa ibang customer. Kung hindi makumpirma sa loob ng 10 minuto, kusa itong babawiin ng aming background expiry sweep worker upang maging available muli.

### Q7: Paano kinakalkula ang rental fee at overdue penalties?
**Answer:**  
Ang halaga ay kinakalkula **eksklusibo sa backend server** base sa naka-save na rate sheet (hourly, package, o whole-stay rate). Hindi pwedeng i-tamper o dayain ng mobile client ang presyo. Kapag lumampas sa due date ang customer, awtomatikong kinakalkula ng backend overtime engine ang penalty base sa eksaktong minuto/oras na lumipas sa Philippine Standard Time (`Asia/Manila`).

---

## 4. Reliability & Fail-safes

### Q8: Paano kung mawalan ng internet ang tindahan o masira ang ESP32 sa gitna ng transaksyon?
**Answer:**  
Mayroon kaming **Anti-Stuck Guarantee (Emergency Manual Bypass)**. Sa Web Rental Desk at Mobile App, kapag offline ang terminal, may explicit option ang staff:
*"I confirm the ESP32 terminal is offline and authorize manual release."*
Maaari pa ring matuloy ang rental o return nang hindi nabibinbin ang customer, at naitatala sa immutable Audit Trail na ang transaksyon ay dumaan sa authorized manual bypass.

### Q9: Gaano katatag (reliable) ang inyong source code? May mga testing ba kayong ginawa?
**Answer:**  
Napakataas po ng aming test coverage:
* **226 passing automated tests** sa backend (`Node.js test runner`).
* **209 passing automated tests** sa web frontend (`React / DOM testing`).
* Unit at integration tests sa Flutter mobile app para sa QR code validation, local sync, at thermal receipt printing.
Sinusubok ng mga automated tests na ito ang lahat ng edge cases: network timeout, duplicate confirmation attempts, expired holds, at invalid tokens.
