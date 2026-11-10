# Rent & Play — Comprehensive System Security Architecture

> **Document Version:** 1.0 (Production / Thesis Ready)  
> **Evaluation Reference:** Laguna University — College of Computing Studies  
> **System Architecture:** Web Dashboard + Native Mobile App + ESP32 Hardware Verification Terminal + Node.js REST API + Firebase / Supabase

---

## 1. Executive Summary

Ang **Rent & Play** ay binuo gamit ang prinsipyo ng **Defense-in-Depth (Multi-Layered Security)** at **Zero-Trust Architecture**. Hindi lamang ito nakadepende sa simpleng login form; bawat layer — mula sa browser/mobile clients, network transport, REST API, IoT hardware station, hanggang sa cloud database — ay may nakatalagang security controls at automated fail-safes.

---

## 2. The 8 Layers of Security in Rent & Play

```
[Layer 1: Client & Input Hardening]   ---> Form validation, Regex, Philippine mobile format, Image magic bytes
[Layer 2: Network & Transport]        ---> HTTPS/TLS, Strict CORS whitelist, OWASP Security Headers (HSTS, nosniff, SAMEORIGIN)
[Layer 3: Authentication & Identity]  ---> Firebase Auth Admin SDK, strong password policies, OTP with HMAC-SHA256 & timing-safe checks
[Layer 4: Session Management]         ---> HttpOnly SameSite=Strict cookies, multi-device tracking, active session revocation
[Layer 5: Role-Based Access Control]  ---> 4 strict roles (OWNER, OPERATOR, CUSTOMER, DEVICE), server-side route guards
[Layer 6: IoT & Physical Verification]---> Cryptographic Bearer keys, timingSafeEqual, 10-min reservation TTL, push button confirmation gate
[Layer 7: Anti-Fraud & Forensics]     ---> Dynamic Rolling QR & TOTP PIN, GCash photo metadata inspection (Photoshop check), duplicate hash detection
[Layer 8: Database & Data Lockdown]   ---> Zero-Trust Firestore Security Rules (allow read, write: if false), Supabase Row Level Security (RLS)
```

---

## 3. Deep Dive into Security Implementations

### A. Authentication & Credential Protection
1. **Password Policy Enforcement:**
   - Minimum 8 to 128 characters, requires at least one uppercase letter and one numeric digit.
   - Credentials (passwords/hashes) are **never** stored in plaintext, never returned in API payloads, and never logged in audit trails.
2. **First-Login Mandatory Password Change:**
   - Bawat bagong gawang staff account (Owner/Operator) ay may `must_change_password: true`.
   - Ang backend ay nagbabalik ng `403 PASSWORD_CHANGE_REQUIRED` sa lahat ng administrative routes hangga't hindi napapalitan ang temporary password.
3. **Single-Use Registration & Reset OTPs:**
   - 6-digit codes na may 10-minute validity.
   - Binuo gamit ang `createHmac('sha256', PEPPER)` at kinukumpara gamit ang `crypto.timingSafeEqual()` upang maiwasan ang **Timing Attacks**.
   - May rate limiting (max attempts at cooldowns) upang maiwasan ang brute-force enumeration.

### B. Session Security & Multi-Device Control
1. **Secure Cookies:**
   - `HttpOnly` (hindi mababasa ng malicious JavaScript / XSS).
   - `SameSite=Strict` (proteksyon laban sa Cross-Site Request Forgery / CSRF).
   - Awtomatikong `Secure` attribute sa HTTPS / production environments.
2. **Active Device Session Management:**
   - Sinusubaybayan ang bawat active session gamit ang SHA-256 fingerprint, IP address, at browser/device user-agent.
   - May kakayahan ang Owner at Operators na mag-revoke ng specific session o i-click ang **"Revoke all other sessions"**.
   - Awtomatikong pinapawalang-bisa ang Firebase refresh tokens kapag nagbago ng password.

### C. Role-Based Access Control (RBAC)
May 4 na hiwalay at mahigpit na access levels:
- **`OWNER`:** Full access sa web dashboard, financial reports, pricing rate adjustments, staff creation, at business settings.
- **`OPERATOR`:** Limitado sa counter rental operations, equipment check-in/out, return inspection, at maintenance logs. Hindi maaaring baguhin ang rates o bank details.
- **`CUSTOMER`:** Mobile app lamang. Ang anumang pagtatangkang mag-access sa web workspace endpoints ay binablock ng server na may `403 Forbidden`.
- **`DEVICE` (ESP32):** Limitado lamang sa `/pending` at `/confirm` endpoints gamit ang device key.

### D. IoT Hardware & Anti-Replay Verification
1. **Pre-Shared Cryptographic Key:**
   - Ang ESP32 terminal ay may provisioned 256-bit key.
   - Bina-validate sa backend gamit ang SHA-256 hash at `crypto.timingSafeEqual`.
2. **Reservation TTL (Time-To-Live):**
   - Bawat pending rental o return ay may 10-minute reservation window.
   - May background worker (`createExpirySweep`) na awtomatikong nagre-release ng gamit kung hindi makumpirma sa takdang oras upang maiwasan ang double-booking at stuck inventory.
3. **Physical Confirmation Gate:**
   - Pinipigilan ang remote fraud: kailangang pisikal na pindutin ng staff ang push button sa ESP32 terminal bago magsimula ang rental timer.

### E. Dynamic Rolling QR & TOTP PIN
- Ang customer rental ticket ay hindi static screenshot.
- Gumagawa ito ng time-based rolling QR token at 6-digit rolling PIN na nagre-refresh kada window.
- Kapag nag-expire ang QR o na-forward ang screenshot sa ibang tao, hindi ito tatanggapin ng scanner counter at magti-trigger ng `SECURITY_QR_VERIFICATION_FAILED` security alert.

### F. Payment Anti-Fraud & Metadata Forensics
Para sa online GCash / InstaPay payments:
1. **Metadata Forensics:**
   - Iniinspeksyon ang binary metadata ng in-upload na resibo.
   - Kung may bakas ng editing software (hal. *Adobe Photoshop*), awtomatikong mina-marka ang proof bilang `FLAGGED` na may `EDITED_IMAGE_METADATA`.
2. **Duplicate Detection:**
   - **Duplicate Reference Number:** Binablock kapag ginamit muli ang parehong reference code.
   - **Duplicate Screenshot:** Kino-compute ang hash ng image data upang mahuli ang recycled screenshots.
3. **Double Verification Prevention:**
   - Hindi maaaring i-verify nang dalawang beses ang parehong payment proof.

### G. HTTP Hardening & OWASP Compliance
Idinagdag sa backend response engine:
- **`X-Content-Type-Options: nosniff`** — Pinipigilan ang browsers sa MIME sniffing exploits.
- **`X-Frame-Options: SAMEORIGIN`** — Proteksyon laban sa Clickjacking / UI Redressing.
- **`Referrer-Policy: strict-origin-when-cross-origin`** — Pinipigilan ang pagtagas ng sensitive URLs.
- **`Strict-Transport-Security: max-age=31536000; includeSubDomains`** — HSTS para sa secure HTTPS connections.
- **`Permissions-Policy: camera=(self), microphone=(), geolocation=()`** — Limitasyon sa browser sensor access.
- **Prototype Pollution Guard:**
  - Ang JSON body parser ay gumagamit ng reviver na nag-aalis ng `__proto__`, `constructor`, at `prototype` properties upang maiwasan ang Object prototype poisoning sa Node.js.

### H. Cloud Database Lockdown (Zero-Trust)
- **Firestore Security Rules:** `allow read, write: if false;`
  - Lahat ng client access ay kailangang dumaan sa trusted Node.js API server.
  - Walang sinumang user o attacker ang makakapag-query o makakapagbago ng database gamit ang public Firebase credentials.
- **Supabase PostgreSQL RLS:**
  - Naka-enable ang Row Level Security sa lahat ng 38 system tables.
  - Ang mga critical RPC functions ay naka-grant lamang sa `service_role` (backend).

---

## 4. Summary Table for Thesis Defense

| Security Threat / Risk | Paano Pinoprotektahan ng Rent & Play? |
| :--- | :--- |
| **Brute-Force Password Guessing** | Rate-limit (max 10 attempts/15 mins per IP), automatic `SECURITY_BRUTE_FORCE_LOGIN` alert. |
| **Session Hijacking / Stolen Cookies** | HttpOnly, SameSite=Strict, SHA-256 session fingerprints, active session viewer & instant revocation. |
| **Privilege Escalation** | Strict server-side RBAC; customers cannot access admin routes kahit i-edit ang frontend code. |
| **Fake / Photoshopped GCash Receipts** | Automated metadata inspection (Photoshop signature detection) at cross-booking duplicate checks. |
| **Screenshot Sharing / Ticket Replay** | Time-based rolling dynamic QR tokens at 6-digit TOTP PINs na nag-eexpire. |
| **Database Tampering via Client SDK** | Zero-Trust Firestore Rules (`allow read, write: if false`), lahat ng transaksyon ay dumadaan sa backend. |
| **Timing Attacks on Keys & OTPs** | Paggamit ng Node.js `crypto.timingSafeEqual` sa halip na standard `===`. |
| **Clickjacking & MIME-Sniffing** | OWASP HTTP Headers (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`). |
| **Prototype Pollution Exploits** | Recursive JSON parsing reviver na sumasala sa `__proto__` at `constructor` keys. |
