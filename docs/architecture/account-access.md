# Accounts, validation, and access

## Roles

The API returns `OWNER`, `OPERATOR`, or `CUSTOMER`. Existing `SUPER_ADMIN`, `ADMIN`, and `USER` records are read as Owner, Operator, and Customer respectively. No account migration is required before starting the updated server.

Owners manage business settings and create staff accounts. Operators run daily rental operations and manage customer accounts. Customers use their own customer profile and rental records. Role changes supplied by customers are rejected.

## Input rules

- Web, mobile, and backend email inputs are normalized to lowercase and checked for email format and whitespace only. No login, registration, password-reset, account-creation, or email-check flow performs DNS/domain lookup. Registration OTP verifies mailbox ownership when its code is entered; the email-check endpoint remains for compatibility and checks syntax only.
- Names accept Unicode letters, spaces, apostrophes, hyphens, and middle initials. First and last names need at least two letters. Numbers, unsupported symbols, and four or more consecutive repetitions of the same letter are rejected. This catches the reported repeated-character example; it does not claim to identify every invented name.
- New passwords require 8–128 characters, at least one ASCII capital letter and one digit. Confirmation must match. Existing login passwords are not revalidated against new-password rules.
- Customer registration requires a valid Philippine mobile number. Existing customer contact edits can leave the phone blank.

Web and mobile forms display inline errors. The backend checks submitted account details independently. Customer registration retains email-code verification to confirm mailbox ownership.

Web login shows a small spinner and **Logging in…** inside the login button until authentication and the initial workspace request finish. The form is disabled during the request, and errors restore login controls. Even a fast response shows at least half a second of progress feedback.

## Staff account creation

In the web workspace, select **Settings → Staff → Add account**. Enter the full name, email, and Owner or Operator role. Choose either a generated temporary password emailed to the recipient, or a manually entered password with confirmation.

Generated credentials use cryptographic randomness and satisfy the password policy. SMTP uses the same backend-only `SMTP_USER` and `SMTP_PASSWORD` settings as registration email. Passwords are not saved in Firestore, returned in the API response, or included in audit records. If email delivery fails, the newly created Firebase identity is removed and no staff profile is committed. Manual mode does not send email; the Owner shares that temporary password with its intended recipient.

New staff profiles have `must_change_password: true`. Web and mobile route the account to **Secure your account**. Protected staff endpoints reject access with `403 PASSWORD_CHANGE_REQUIRED` until the account owner supplies the current temporary password and chooses a different, compliant password with matching confirmation. The backend verifies the current Firebase identity, updates the password, revokes existing refresh sessions, records the change, and clears the flag. Web renews its session; mobile asks the user to log in with the new password.

## Forgot password

**Forgot password?** opens a three-step recovery flow shared by web and Android: enter the account email, verify the six-digit code from the email, then choose and confirm a new password. Recovery checks email format only, so a DNS failure cannot block a code request. The professional Rent & Play security email states that the code expires after 10 minutes, is single-use, and must not be shared. The screens provide resend cooldown and recovery errors without revealing whether an active account exists. The backend limits requests and guesses, stores only keyed code/proof digests, revokes existing Firebase sessions after a successful password change, clears any temporary-password flag, and records an audit event without the password. The new password form is only shown after successful code verification.

The signed-in Settings shortcut and the `/api/auth/password-reset` compatibility endpoint continue to send a Firebase reset link for older clients. New Forgot password screens use `/api/auth/password-reset/request`, `/verify`, and `/complete`.

## Firebase password enforcement

Run from `apps/backend`:

```powershell
npm run auth:password-policy
npm run auth:password-policy -- --apply
```

The first command reads the project policy; the second applies the required 8–128 character, uppercase, and numeric constraints. Enforcement does not force old accounts to upgrade during normal login. This provider policy also covers Firebase's hosted password-reset form and direct Firebase sign-up. The configured `rent-and-play` project was updated on 2026-10-10.

Restart the backend and rebuild the web assets and Android app after applying source changes. For a physical Android phone, build with a reachable `API_BASE_URL`, usually the laptop's Wi-Fi address on port 3000. The SMTP settings remain backend-only.

## Checks completed

The account-focused backend checks passed (26 checks), and the Flutter account validation/widget checks passed (4 checks). A local browser preview using in-memory identities covered inline errors, lowercase emails, the reset recipient and instructions, login progress, and staff creation options. No real test staff accounts were created and no test credential emails were sent. A real inbox and physical-phone check remain deployment acceptance steps.

The earlier deposit-related suite failures were resolved in the later rental audit. See [the current system verification](../testing/system-audit-2026-10-14.md), including Owner/Operator access checks for web cookies and mobile bearer tokens.
