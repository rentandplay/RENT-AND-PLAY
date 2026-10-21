// src/react/react-shim.js
import {
  React,
  React as React2,
  createElement,
  Fragment,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  createContext,
  useContext,
  createRoot,
  flushSync
} from "./react-vendor.js";

// src/react/icons.jsx
var icons = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  repeat: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  radio: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  sportsBall: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20"/>',
  gamepad: '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="6"/>',
  dice: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5l1.5 1.5M5 19l1.5-1.5M17.5 6.5l1.5-1.5"/>',
  moon: '<path d="M20.5 13a9 9 0 0 1-9.5-9.5A9 9 0 1 0 20.5 13Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 3v17h17M8 16v-5M13 16V7M18 16v-8"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5"/><rect x="10" y="10" width="4" height="4"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4"/>',
  out: '<path d="M10 4H4v16h6M8 12h13m-4-4 4 4-4 4"/>',
  money: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h1M17 12h1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM14 5l5 5"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  bluetooth: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',
  print: '<path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/><path d="M17 11h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>'
};
var icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.box}</svg>`;
function Icon({ name }) {
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      "aria-hidden": "true",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.7",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      dangerouslySetInnerHTML: { __html: icons[name] || icons.box }
    }
  );
}
var escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var money = (v) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
}).format(Number(v || 0));
var initials = (name) => String(name || "").trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
var categoryIconName = (category) => /sport/i.test(category) ? "sportsBall" : /board/i.test(category) ? "dice" : /consol/i.test(category) ? "gamepad" : "box";
var symbol = (category) => `<span class="category-glyph" aria-hidden="true">${icon(categoryIconName(category))}</span>`;
function CategorySymbol({ category }) {
  return /* @__PURE__ */ React.createElement("span", { className: "category-glyph", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: categoryIconName(category) }));
}
var date = (v) => v ? new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(v)) ? String(v) : String(v).replace(" ", "T") + "+08:00") : null;
var formatDate = (v) => date(v) && Number.isFinite(date(v).getTime()) ? new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila"
}).format(date(v)) : "Not recorded";
var badge = (status) => `<span class="badge ${escape(String(status || "").toLowerCase().replaceAll(" ", "-"))}">${escape(status)}</span>`;
function StatusBadge({ status }) {
  const cls = String(status || "").toLowerCase().replaceAll(" ", "-");
  return /* @__PURE__ */ React.createElement("span", { className: `badge ${cls}` }, status);
}
var stateLabel = (status) => ({
  AVAILABLE: "Available",
  RENTED: "Rented",
  UNDER_MAINTENANCE: "Under maintenance",
  RESERVED_PENDING: "Pending",
  INACTIVE: "Inactive"
})[status] || status;
function BrandLogo() {
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("img", { src: "/public/logo.png", alt: "Rent and Play logo" }), /* @__PURE__ */ React.createElement("span", null, "rent", /* @__PURE__ */ React.createElement("span", { className: "orange" }, "&"), "play", /* @__PURE__ */ React.createElement("small", null, "RENTAL MANAGEMENT")));
}
function SportArtSvg() {
  return /* @__PURE__ */ React.createElement("svg", { className: "sport-art", viewBox: "0 0 320 230", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: "#efbe8b" }, /* @__PURE__ */ React.createElement("circle", { cx: "188", cy: "106", r: "100" }), /* @__PURE__ */ React.createElement("circle", { cx: "188", cy: "106", r: "80" }), /* @__PURE__ */ React.createElement("path", { d: "M50 210 280 12M94 230 320 34" })), /* @__PURE__ */ React.createElement("g", { transform: "rotate(-18 187 100)" }, /* @__PURE__ */ React.createElement("circle", { cx: "190", cy: "95", r: "66", fill: "#f99235", stroke: "#b7561b", strokeWidth: "3" }), /* @__PURE__ */ React.createElement(
    "path",
    {
      d: "M124 95h132M190 29v132M144 47c55 10 64 86 9 103M227 41c-53 23-54 87-6 112",
      stroke: "#a74918",
      strokeWidth: "3",
      fill: "none"
    }
  )), /* @__PURE__ */ React.createElement("g", { transform: "rotate(21 92 166)" }, /* @__PURE__ */ React.createElement("rect", { x: "39", y: "127", width: "109", height: "67", rx: "29", fill: "#223957" }), /* @__PURE__ */ React.createElement("path", { d: "M62 148v23M50 159h24", stroke: "#fff", strokeWidth: "5" }), /* @__PURE__ */ React.createElement("circle", { cx: "122", cy: "153", r: "5", fill: "#fb9b50" }), /* @__PURE__ */ React.createElement("circle", { cx: "112", cy: "166", r: "5", fill: "#91b7aa" })), /* @__PURE__ */ React.createElement("g", { transform: "rotate(14 263 166)" }, /* @__PURE__ */ React.createElement("rect", { x: "236", y: "136", width: "54", height: "54", rx: "10", fill: "#fff", stroke: "#ddc6b0" }), /* @__PURE__ */ React.createElement("g", { fill: "#203750" }, /* @__PURE__ */ React.createElement("circle", { cx: "249", cy: "149", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "277", cy: "149", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "263", cy: "163", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "249", cy: "177", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "277", cy: "177", r: "3" }))));
}
function cleanErrorMessage(msg) {
  if (!msg) return "";
  const str = String(msg);
  const lower = str.toLowerCase();
  if (lower.includes("npm run dev") || lower.includes("backend is not running") || lower.includes("apps/backend") || lower.includes("failed to fetch") || lower.includes("econnrefused") || lower.includes("cannot reach the server")) {
    return "Unable to connect to the server. Please check your connection or try again later.";
  }
  return str;
}

// src/react/LoginView.jsx
import {
  bindAccountValidation,
  emailError,
  passwordError,
  passwordMatchError,
  passwordHelp
} from "./account-validation.js";
function SessionLoadingView() {
  return /* @__PURE__ */ React.createElement("main", { className: "session-loading", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("div", { className: "session-loading-card" }, /* @__PURE__ */ React.createElement("img", { className: "session-logo", src: "/public/logo.png", alt: "Rent and Play" }), /* @__PURE__ */ React.createElement("div", { className: "session-brand-copy" }, /* @__PURE__ */ React.createElement("strong", null, "rent", /* @__PURE__ */ React.createElement("span", { className: "orange" }, "&"), "play"), /* @__PURE__ */ React.createElement("small", null, "RENTAL MANAGEMENT")), /* @__PURE__ */ React.createElement("span", { className: "session-spinner", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("p", null, "Opening your workspace\u2026")));
}
function LoginView({
  initialError = "",
  theme,
  onToggleTheme,
  api,
  modal,
  showModal,
  onLoginSuccess,
  setPasswordResetCountdown
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState(cleanErrorMessage(initialError));
  const formRef = useRef(null);
  const validationRef = useRef(null);
  useEffect(() => {
    document.title = "Sign in \xB7 Rent & Play";
  }, []);
  useEffect(() => {
    setErrorMsg(cleanErrorMessage(initialError));
  }, [initialError]);
  useEffect(() => {
    if (!formRef.current) return;
    validationRef.current = bindAccountValidation(formRef.current, {
      email: emailError,
      password: (value) => value ? "" : "Enter your password."
    });
  }, []);
  const openForgotPassword = () => {
    const emailInput = formRef.current?.querySelector("#email");
    const state = {
      step: "email",
      email: (emailInput?.value || "").trim().toLowerCase(),
      code: "",
      token: "",
      requestKey: "",
      newPassword: "",
      confirmPassword: "",
      notice: "",
      error: "",
      busy: false,
      resendAt: 0
    };
    const resetSteps = [
      ["email", "Verify email"],
      ["code", "Enter code"],
      ["password", "New password"]
    ];
    const spinner = (label) => `<span class="button-spinner" aria-hidden="true"></span> ${label}`;
    function updateResend() {
      const button = modal.querySelector("[data-reset-resend]");
      if (!button) {
        setPasswordResetCountdown(null);
        return;
      }
      const seconds = Math.max(0, Math.ceil((state.resendAt - Date.now()) / 1e3));
      button.disabled = state.busy || seconds > 0;
      button.textContent = seconds ? `Resend code in ${seconds}s` : "Resend code";
      if (!seconds) setPasswordResetCountdown(null);
    }
    async function sendCode() {
      if (state.busy) return;
      state.busy = true;
      state.error = "";
      state.notice = "";
      renderResetModal();
      try {
        const result = await api("/auth/password-reset/request", {
          method: "POST",
          body: JSON.stringify({ email: state.email })
        });
        state.step = "code";
        state.code = "";
        state.token = "";
        state.requestKey = "";
        state.notice = result.message || "If an active account exists for this email, a verification code has been sent.";
        state.resendAt = Date.now() + 3e4;
      } catch (problem) {
        state.error = problem.message;
      } finally {
        state.busy = false;
        renderResetModal();
      }
      if (state.step === "code") {
        const timer = setInterval(() => {
          if (!modal.open) {
            setPasswordResetCountdown(null);
            return;
          }
          updateResend();
        }, 1e3);
        setPasswordResetCountdown(timer);
      }
    }
    function renderResetModal() {
      const currentStep = resetSteps.findIndex(([id]) => id === state.step);
      const steps = currentStep < 0 ? "" : `<ol class="password-reset-steps" aria-label="Password reset steps">${resetSteps.map(
        ([id, label], index) => `<li class="${state.step === id ? "current" : index < currentStep ? "complete" : ""}" data-reset-step="${id}"${state.step === id ? ' aria-current="step"' : ""}><span>${index + 1}</span>${label}</li>`
      ).join("")}</ol>`;
      const stepContent = state.step === "email" ? `<div class="password-reset-intro"><span class="reset-step-icon">${icon("mail")}</span><p class="eyebrow">ACCOUNT RECOVERY</p><h3>Reset your password</h3><p>Enter the email address linked to your account. We\u2019ll send a one-time code to verify it\u2019s you.</p></div><form id="reset-form" class="admin-form password-reset-form"><label for="reset-email">Account email</label><input id="reset-email" name="email" type="email" autocomplete="email" autocapitalize="none" maxlength="254" value="${escape(state.email)}" placeholder="you@example.com" required/><p class="form-error" role="alert">${escape(state.error)}</p><button class="primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? spinner("Sending code\u2026") : "Send verification code"}</button><button class="text-button reset-back-link" type="button" data-reset-close>Back to sign in</button></form>` : state.step === "code" ? `<div class="password-reset-intro"><span class="reset-step-icon">${icon("mail")}</span><p class="eyebrow">VERIFY YOUR EMAIL</p><h3>Enter your code</h3><p>Enter the 6-digit code to continue. Check your inbox and spam folder if it doesn\u2019t appear.</p></div><div class="reset-email-notice" role="status">${escape(state.notice || "If an active account exists for this email, a verification code has been sent.")}</div><form id="reset-form" class="admin-form password-reset-form"><label for="reset-code">6-digit verification code for <strong>${escape(state.email)}</strong></label><input id="reset-code" class="password-reset-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" value="${escape(state.code)}" aria-describedby="reset-code-help" required/><small id="reset-code-help">The code expires in 10 minutes. Never share it with anyone.</small><p class="form-error" role="alert">${escape(state.error)}</p><button class="primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? spinner("Verifying\u2026") : "Verify code"}</button><div class="reset-secondary-actions"><button class="text-button" type="button" data-reset-resend>Resend code</button><button class="text-button" type="button" data-reset-edit-email>Use another email</button></div></form>` : state.step === "password" ? `<div class="password-reset-intro"><span class="reset-step-icon">${icon("lock")}</span><p class="eyebrow">EMAIL VERIFIED</p><h3>Choose a new password</h3><p>Your code was verified. Set a new password to finish securing your account.</p></div><form id="reset-form" class="admin-form password-reset-form"><label for="reset-password">New password</label><input id="reset-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" value="${escape(state.newPassword)}" required/><small>${passwordHelp}</small><label for="reset-confirm">Confirm new password</label><input id="reset-confirm" name="confirmPassword" type="password" autocomplete="new-password" maxlength="128" value="${escape(state.confirmPassword)}" required/><label class="checkbox reset-show-password"><input type="checkbox" id="reset-show-password"/> Show passwords</label><p class="form-error" role="alert">${escape(state.error)}</p><button class="primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? spinner("Updating password\u2026") : "Update password"}</button><button class="text-button reset-back-link" type="button" data-reset-restart ${state.busy ? "disabled" : ""}>Start over</button></form>` : `<div class="password-reset-complete"><span class="reset-step-icon success">${icon("check")}</span><p class="eyebrow">PASSWORD UPDATED</p><h3>You\u2019re all set</h3><p>Your password has been changed. Sign in with your new password to continue.</p><button class="primary" type="button" data-reset-finished>Back to sign in</button></div>`;
      showModal("Account recovery", `<div class="password-reset-flow">${steps}${stepContent}</div>`);
      const form = modal.querySelector("#reset-form");
      if (form && state.step === "email") {
        const validation = bindAccountValidation(form, { email: emailError });
        form.onsubmit = async (event) => {
          event.preventDefault();
          if (state.busy || !validation.validate()) return;
          state.email = form.elements.email.value.trim().toLowerCase();
          await sendCode();
        };
      } else if (form && state.step === "code") {
        const code = form.elements.code;
        code.oninput = () => {
          code.value = code.value.replace(/\D/g, "").slice(0, 6);
          state.code = code.value;
        };
        form.onsubmit = async (event) => {
          event.preventDefault();
          if (state.busy || !form.reportValidity()) return;
          state.code = code.value;
          state.busy = true;
          state.error = "";
          renderResetModal();
          try {
            const result = await api("/auth/password-reset/verify", {
              method: "POST",
              body: JSON.stringify({ email: state.email, code: state.code })
            });
            state.token = result.verificationToken;
            state.requestKey = crypto.randomUUID();
            state.step = "password";
            state.code = "";
            state.newPassword = "";
            state.confirmPassword = "";
            state.notice = "";
            state.error = "";
          } catch (problem) {
            state.error = problem.message;
          } finally {
            state.busy = false;
            renderResetModal();
          }
        };
        modal.querySelector("[data-reset-resend]").onclick = () => sendCode();
        modal.querySelector("[data-reset-edit-email]").onclick = () => {
          state.step = "email";
          state.code = "";
          state.token = "";
          state.error = "";
          state.notice = "";
          state.resendAt = 0;
          renderResetModal();
        };
        updateResend();
      } else if (form && state.step === "password") {
        const validation = bindAccountValidation(form, {
          newPassword: passwordError,
          confirmPassword: (value) => passwordMatchError(form.elements.newPassword.value, value)
        });
        modal.querySelector("#reset-show-password").onchange = (event) => {
          for (const field of [form.elements.newPassword, form.elements.confirmPassword]) {
            field.type = event.target.checked ? "text" : "password";
          }
        };
        modal.querySelector("[data-reset-restart]").onclick = () => {
          state.step = "email";
          state.code = "";
          state.token = "";
          state.requestKey = "";
          state.newPassword = "";
          state.confirmPassword = "";
          state.error = "";
          state.notice = "";
          renderResetModal();
        };
        form.onsubmit = async (event) => {
          event.preventDefault();
          if (state.busy || !validation.validate()) return;
          state.busy = true;
          state.error = "";
          const values = Object.fromEntries(new FormData(form));
          state.newPassword = values.newPassword;
          state.confirmPassword = values.confirmPassword;
          renderResetModal();
          try {
            await api("/auth/password-reset/complete", {
              method: "POST",
              body: JSON.stringify({
                ...values,
                email: state.email,
                verificationToken: state.token,
                requestKey: state.requestKey
              })
            });
            state.step = "done";
            state.token = "";
            state.requestKey = "";
            state.newPassword = "";
            state.confirmPassword = "";
            state.error = "";
          } catch (problem) {
            state.error = problem.message;
          } finally {
            state.busy = false;
            renderResetModal();
          }
        };
      }
      modal.querySelector("[data-reset-close]")?.addEventListener("click", () => modal.close());
      modal.querySelector("[data-reset-finished]")?.addEventListener("click", () => {
        const loginEmail = document.querySelector("#email");
        if (loginEmail) loginEmail.value = state.email;
        modal.close();
      });
      modal.querySelector("#reset-email, #reset-code, #reset-password")?.focus({ preventScroll: true });
    }
    renderResetModal();
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validationRef.current?.validate()) return;
    const form = formRef.current;
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const rememberChecked = form.querySelector("#remember").checked;
    const body = {
      email: form.querySelector("#email").value,
      password: form.querySelector("#password").value,
      remember: rememberChecked
    };
    const loginStarted = performance.now();
    const controls = [...form.querySelectorAll("input, button")];
    controls.forEach((control) => {
      control.disabled = true;
    });
    button.setAttribute("aria-busy", "true");
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Logging in\u2026';
    setErrorMsg("");
    try {
      const result = await api("/auth/login", { method: "POST", body: JSON.stringify(body) });
      await onLoginSuccess(result.user, rememberChecked);
    } catch (error) {
      setErrorMsg(cleanErrorMessage(error.message));
    } finally {
      const remaining = 500 - (performance.now() - loginStarted);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (form.isConnected) {
        controls.forEach((control) => {
          control.disabled = false;
        });
        button.removeAttribute("aria-busy");
        button.textContent = "Sign in";
      }
    }
  };
  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return /* @__PURE__ */ React.createElement("main", { className: "login" }, /* @__PURE__ */ React.createElement("section", { className: "login-story" }, /* @__PURE__ */ React.createElement("a", { className: "brand", href: "#" }, /* @__PURE__ */ React.createElement(BrandLogo, null)), /* @__PURE__ */ React.createElement("div", { className: "story-body" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, "LESS PAPERWORK. MORE PLAY."), /* @__PURE__ */ React.createElement("h1", null, "Good times.", /* @__PURE__ */ React.createElement("br", null), "Greatly managed", /* @__PURE__ */ React.createElement("span", { className: "orange" }, ".")), /* @__PURE__ */ React.createElement("p", null, "Your equipment, rentals, and returns.", /* @__PURE__ */ React.createElement("br", null), "All together in one happy place."), /* @__PURE__ */ React.createElement("div", { className: "login-art" }, /* @__PURE__ */ React.createElement(SportArtSvg, null)), /* @__PURE__ */ React.createElement("div", { className: "story-features" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Icon, { name: "box" }), " Know what\u2019s available"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Icon, { name: "clock" }), " Stay ahead of due dates"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Icon, { name: "chip" }), " Verify every handoff"))), /* @__PURE__ */ React.createElement("footer", null, "Made for Rent & Play ", /* @__PURE__ */ React.createElement("span", null, "Los Ba\xF1os, Laguna"))), /* @__PURE__ */ React.createElement("section", { className: "login-form-side" }, /* @__PURE__ */ React.createElement("div", { className: "login-header" }, /* @__PURE__ */ React.createElement("span", { className: "workspace-label" }, "OWNER / OPERATOR WORKSPACE"), /* @__PURE__ */ React.createElement(
    "button",
    {
      id: "login-theme",
      className: "theme-button",
      type: "button",
      "aria-label": themeLabel,
      title: themeLabel,
      onClick: onToggleTheme
    },
    /* @__PURE__ */ React.createElement(Icon, { name: theme === "dark" ? "sun" : "moon" })
  )), /* @__PURE__ */ React.createElement("div", { className: "login-form-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "welcome-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: "grid" })), /* @__PURE__ */ React.createElement("h2", null, "Welcome back!"), /* @__PURE__ */ React.createElement("p", null, "Sign in to manage your rentals."), /* @__PURE__ */ React.createElement("form", { id: "login-form", ref: formRef, onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement("label", { htmlFor: "email" }, "Email address"), /* @__PURE__ */ React.createElement("input", { id: "email", type: "email", autoComplete: "username", maxLength: 254, required: true }), /* @__PURE__ */ React.createElement("div", { className: "label-line" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "password" }, "Password"), /* @__PURE__ */ React.createElement("button", { className: "text-button", type: "button", id: "forgot", onClick: openForgotPassword }, "Forgot password?")), /* @__PURE__ */ React.createElement("div", { className: "password-field" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      id: "password",
      type: showPassword ? "text" : "password",
      autoComplete: "current-password",
      placeholder: "Enter your password",
      maxLength: 1024,
      required: true
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      id: "show-password",
      "aria-label": showPassword ? "Hide password" : "Show password",
      onClick: () => setShowPassword((prev) => !prev)
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "eye" })
  )), /* @__PURE__ */ React.createElement("label", { className: "checkbox" }, /* @__PURE__ */ React.createElement("input", { id: "remember", type: "checkbox" }), " Remember me on this device"), /* @__PURE__ */ React.createElement("p", { id: "login-error", role: "alert" }, errorMsg), /* @__PURE__ */ React.createElement("button", { className: "primary login-submit", type: "submit" }, "Sign in")), /* @__PURE__ */ React.createElement("p", { className: "login-foot" }, "Your account. Your equipment. Your workspace.")), /* @__PURE__ */ React.createElement("footer", null, "\xA9 ", (/* @__PURE__ */ new Date()).getFullYear(), " Rent & Play ", /* @__PURE__ */ React.createElement("span", null, "Built for more play."))));
}

// src/react/PasswordChangeView.jsx
import {
  bindAccountValidation as bindAccountValidation2,
  passwordError as passwordError2,
  passwordMatchError as passwordMatchError2,
  passwordHelp as passwordHelp2
} from "./account-validation.js";
function PasswordChangeView({
  user,
  rememberSession,
  api,
  onPasswordUpdated,
  onSignOutAgain,
  onSignOut
}) {
  const [showPasswords, setShowPasswords] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const formRef = useRef(null);
  const validationRef = useRef(null);
  useEffect(() => {
    document.title = "Secure your account \xB7 Rent & Play";
  }, []);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    validationRef.current = bindAccountValidation2(form, {
      currentPassword: (value) => value ? "" : "Enter your current or temporary password.",
      newPassword: (value) => passwordError2(value) || (value === form.elements.currentPassword.value ? "Choose a different password." : ""),
      confirmPassword: (value) => passwordMatchError2(form.elements.newPassword.value, value)
    });
  }, []);
  const handleSignOut = async () => {
    const form = formRef.current;
    const buttons = form ? [...form.querySelectorAll("button")] : [];
    buttons.forEach((btn) => {
      btn.disabled = true;
    });
    try {
      await api("/auth/logout", { method: "POST" });
      onSignOut();
    } catch (problem) {
      setErrorMsg(problem.message);
    } finally {
      buttons.forEach((btn) => {
        btn.disabled = false;
      });
    }
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validationRef.current?.validate()) return;
    const form = formRef.current;
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const body = { ...Object.fromEntries(new FormData(form)), remember: rememberSession };
    const controls = [...form.querySelectorAll("input, button")];
    controls.forEach((control) => {
      control.disabled = true;
    });
    button.setAttribute("aria-busy", "true");
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Updating password\u2026';
    setErrorMsg("");
    try {
      const result = await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (result.signInAgain) {
        onSignOutAgain("Password updated. Sign in with your new password.");
        return;
      }
      await onPasswordUpdated(result.user);
    } catch (problem) {
      setErrorMsg(problem.message);
    } finally {
      if (form.isConnected) {
        controls.forEach((control) => {
          control.disabled = false;
        });
        button.removeAttribute("aria-busy");
        button.textContent = "Update password";
      }
    }
  };
  const inputType = showPasswords ? "text" : "password";
  return /* @__PURE__ */ React.createElement("main", { className: "password-change-page" }, /* @__PURE__ */ React.createElement("section", { className: "password-change-card" }, /* @__PURE__ */ React.createElement("img", { className: "session-logo", src: "/public/logo.png", alt: "Rent & Play" }), /* @__PURE__ */ React.createElement("h1", null, "Secure your account"), /* @__PURE__ */ React.createElement("p", null, "Choose your own password before opening your", " ", user.role === "OWNER" ? "Owner" : "Operator", " workspace."), /* @__PURE__ */ React.createElement("form", { id: "required-password-form", className: "admin-form", ref: formRef, onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement("label", null, "Current / temporary password", /* @__PURE__ */ React.createElement(
    "input",
    {
      name: "currentPassword",
      type: inputType,
      autoComplete: "current-password",
      maxLength: 1024,
      required: true
    }
  )), /* @__PURE__ */ React.createElement("label", null, "New password", /* @__PURE__ */ React.createElement(
    "input",
    {
      name: "newPassword",
      type: inputType,
      autoComplete: "new-password",
      minLength: 8,
      maxLength: 128,
      required: true
    }
  ), /* @__PURE__ */ React.createElement("small", null, passwordHelp2)), /* @__PURE__ */ React.createElement("label", null, "Confirm new password", /* @__PURE__ */ React.createElement(
    "input",
    {
      name: "confirmPassword",
      type: inputType,
      autoComplete: "new-password",
      maxLength: 128,
      required: true
    }
  )), /* @__PURE__ */ React.createElement("label", { className: "checkbox" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "checkbox",
      id: "change-show-passwords",
      checked: showPasswords,
      onChange: (e) => setShowPasswords(e.target.checked)
    }
  ), " ", "Show passwords"), /* @__PURE__ */ React.createElement("p", { className: "form-error", role: "alert" }, errorMsg), /* @__PURE__ */ React.createElement("button", { className: "primary", type: "submit" }, "Update password"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "secondary", id: "change-signout", onClick: handleSignOut }, "Sign out"))));
}

// src/react/WorkspaceLayout.jsx
import { pageInfo } from "./workspace-navigation.js";
import { renderRentalNotifications } from "./notifications.js";

// src/react/DashboardView.jsx
function StatCard({ label, value, note, glyph, color, page, target = "", filter = "", onNavigate }) {
  const handleClick = (e) => {
    e.preventDefault();
    onNavigate(page, false, filter || "All rentals", "", "");
    if (target) {
      requestAnimationFrame(() => {
        document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "stat stat-link",
      "data-page": page,
      "data-target": target || void 0,
      "data-filter": filter || void 0,
      "aria-label": `${label}: ${value}. ${note}`,
      onClick: handleClick
    },
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", null, label), /* @__PURE__ */ React.createElement("span", { className: `stat-icon ${color}` }, /* @__PURE__ */ React.createElement(Icon, { name: glyph }))),
    /* @__PURE__ */ React.createElement("strong", null, value),
    /* @__PURE__ */ React.createElement("small", null, note)
  );
}
function DashboardView({
  data,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  rentalPage,
  onRentalPageChange,
  period,
  onPeriodChange,
  onNavigate,
  showModal
}) {
  const s = data.stats;
  const pageSize = 5;
  const allRows = data.rentals.filter(
    (r) => (filter === "All rentals" || r.displayStatus === filter) && `${r.customer} ${r.rental_code} ${r.item_name}`.toLowerCase().includes(query.toLowerCase())
  );
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
  const clampedPage = Math.min(rentalPage, pageCount - 1);
  const start = clampedPage * pageSize;
  const rows = allRows.slice(start, start + pageSize);
  const openRental = (id) => {
    const r = data.rentals.find((item) => String(item.id) === String(id));
    if (!r) return;
    showModal(
      "Rental details",
      `<div class="detail-header"><div><h3>${escape(r.item_name)}</h3><p>${escape(r.rental_code)}</p></div>${badge(
        r.displayStatus
      )}</div><dl><dt>Customer</dt><dd>${escape(r.customer)}</dd><dt>Due</dt><dd>${escape(
        formatDate(r.due_at)
      )}</dd><dt>Rental fee</dt><dd>${money(r.rental_fee)}</dd><dt>Rental confirmed</dt><dd>${escape(
        formatDate(r.confirmed_rental_at)
      )}</dd></dl><div class="info-box">Use Returns to record physical receipt and inspect the unit. Physical receipt stops the timer; completing inspection updates availability or maintenance.</div>`
    );
  };
  const openWorkflowModal = () => {
    showModal(
      "Rental workflow",
      '<p>Review and approve the request, then scan the assigned equipment QR to prepare the unit. At handover, verify the customer rental QR, identity, payment, condition and accessories before confirming release.</p><div class="info-box">The timer starts at physical handover and stops when staff records physical receipt. Inspect returned equipment before making it available again.</div>'
    );
  };
  const handleRowClick = (e, rentalId) => {
    if (e.defaultPrevented || typeof e.button === "number" && e.button !== 0) return;
    if (String(window.getSelection?.() || "").trim()) return;
    const interactive = e.target.closest?.("button, a, input, select, textarea, label, summary");
    if (interactive) return;
    openRental(rentalId);
  };
  const handleRowKeyDown = (e, rentalId) => {
    if (e.defaultPrevented || e.repeat) return;
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openRental(rentalId);
    }
  };
  const amounts = data.revenue[period] || [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(100, ...amounts);
  const scale = Math.ceil(max / 100) * 100;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const t = data.terminals[0];
  const queue = t ? data.pending.filter((p) => p.terminal_code === t.terminal_code) : [];
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "stats" }, /* @__PURE__ */ React.createElement(
    StatCard,
    {
      label: "Active rentals",
      value: s.active,
      note: "Confirmed rentals currently out",
      glyph: "clock",
      color: "blue",
      page: "Rentals",
      onNavigate
    }
  ), /* @__PURE__ */ React.createElement(
    StatCard,
    {
      label: "Available items",
      value: s.available,
      note: "Ready for their next adventure",
      glyph: "box",
      color: "green",
      page: "Inventory",
      onNavigate
    }
  ), /* @__PURE__ */ React.createElement(
    StatCard,
    {
      label: "Due today",
      value: s.dueToday,
      note: `${s.overdue} overdue rental(s) need attention`,
      glyph: "bell",
      color: "amber",
      page: "Dashboard",
      target: "rental-panel",
      filter: "Due today",
      onNavigate
    }
  ), /* @__PURE__ */ React.createElement(
    StatCard,
    {
      label: "Rental fees",
      value: money(s.fees),
      note: "From current active rentals",
      glyph: "money",
      color: "purple",
      page: "Rentals",
      onNavigate
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "dashboard-grid" }, /* @__PURE__ */ React.createElement("div", { className: "main-column" }, /* @__PURE__ */ React.createElement("section", { className: "panel rental-panel", id: "rental-panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-title" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Rentals to keep an eye on"), /* @__PURE__ */ React.createElement("p", null, "Active rentals and requests awaiting verification.")), /* @__PURE__ */ React.createElement("div", { className: "rental-panel-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "secondary",
      id: "rental-workflow",
      onClick: openWorkflowModal
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "arrow" }),
    " Rental workflow"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "text-button",
      "data-page": "Rentals",
      onClick: () => onNavigate("Rentals")
    },
    "View all rentals \u2192"
  ))), /* @__PURE__ */ React.createElement("div", { className: "table-controls" }, /* @__PURE__ */ React.createElement("div", { className: "tabs" }, ["All rentals", "Due today", "Overdue"].map((tab) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: tab,
      "data-filter": tab,
      className: filter === tab ? "selected" : "",
      onClick: () => {
        onFilterChange(tab);
        onRentalPageChange(0);
      }
    },
    tab,
    tab === "Overdue" ? /* @__PURE__ */ React.createElement("span", null, data.stats.overdue) : null
  ))), /* @__PURE__ */ React.createElement("label", { className: "table-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search" }), /* @__PURE__ */ React.createElement(
    "input",
    {
      id: "rental-search",
      placeholder: "Search rentals",
      value: query,
      "aria-label": "Search rentals",
      onChange: (e) => {
        onQueryChange(e.target.value);
        onRentalPageChange(0);
      }
    }
  ))), /* @__PURE__ */ React.createElement("div", { className: "table-scroll" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "ITEM / RENTAL ID"), /* @__PURE__ */ React.createElement("th", null, "CUSTOMER"), /* @__PURE__ */ React.createElement("th", null, "DUE DATE"), /* @__PURE__ */ React.createElement("th", null, "STATUS"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, rows.length > 0 ? rows.map((r) => {
    const itemCategory = data.items.find((i) => String(i.id) === String(r.item_id))?.category || "";
    const label = r.rental_code || r.item_name;
    return /* @__PURE__ */ React.createElement(
      "tr",
      {
        key: r.id,
        className: "record-link-row",
        "data-record-type": "dashboard-rental",
        "data-record-id": r.id,
        tabIndex: 0,
        "aria-label": label ? `Open ${label}` : void 0,
        onClick: (e) => handleRowClick(e, r.id),
        onKeyDown: (e) => handleRowKeyDown(e, r.id)
      },
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "item-cell" }, /* @__PURE__ */ React.createElement("span", { className: "item-symbol" }, /* @__PURE__ */ React.createElement(CategorySymbol, { category: itemCategory })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, r.item_name), /* @__PURE__ */ React.createElement("small", null, r.rental_code)))),
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "mini-avatar" }, initials(r.customer)), r.customer),
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, formatDate(r.due_at)), /* @__PURE__ */ React.createElement("small", null, "Philippine time")),
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(StatusBadge, { status: r.displayStatus })),
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "row-button",
          "data-rental": r.id,
          "aria-label": `View ${r.rental_code}`,
          onClick: () => openRental(r.id)
        },
        /* @__PURE__ */ React.createElement(Icon, { name: "arrow" })
      ))
    );
  }) : /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "empty" }, "No open rentals match this view."))))), /* @__PURE__ */ React.createElement("div", { className: "table-footer" }, /* @__PURE__ */ React.createElement("span", null, allRows.length ? `${start + 1}\u2013${Math.min(start + pageSize, allRows.length)} of ${allRows.length}` : "0 rentals", " ", "\xB7 Page ", allRows.length ? clampedPage + 1 : 0, " of", " ", Math.ceil(allRows.length / pageSize)), /* @__PURE__ */ React.createElement("div", { className: "inv-pagination" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "secondary",
      id: "rental-prev",
      disabled: !clampedPage,
      onClick: () => onRentalPageChange(Math.max(0, clampedPage - 1))
    },
    "\u2190 Previous"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "secondary",
      id: "rental-next",
      disabled: start + pageSize >= allRows.length,
      onClick: () => onRentalPageChange(clampedPage + 1)
    },
    "Next \u2192"
  )))), /* @__PURE__ */ React.createElement("section", { className: "panel revenue-panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-title" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Confirmed rental fees"), /* @__PURE__ */ React.createElement("p", null, "Grouped by the date each rental was confirmed.")), /* @__PURE__ */ React.createElement("div", { className: "revenue-actions" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      id: "period",
      "aria-label": "Revenue period",
      value: period,
      onChange: (e) => onPeriodChange(e.target.value)
    },
    /* @__PURE__ */ React.createElement("option", { value: "This week" }, "This week"),
    /* @__PURE__ */ React.createElement("option", { value: "Last week" }, "Last week")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "text-button",
      "data-page": "Reports",
      onClick: () => onNavigate("Reports")
    },
    "Detailed analytics \u2192"
  ))), /* @__PURE__ */ React.createElement("div", { className: "revenue-total" }, money(amounts.reduce((a, b) => a + b, 0)), /* @__PURE__ */ React.createElement("span", null, "Recorded rental charges")), /* @__PURE__ */ React.createElement("div", { className: "chart" }, /* @__PURE__ */ React.createElement("div", { className: "axis" }, [1, 0.75, 0.5, 0.25, 0].map((x) => /* @__PURE__ */ React.createElement("span", { key: x }, money(scale * x)))), /* @__PURE__ */ React.createElement("div", { className: "bars" }, amounts.map((amount, i) => /* @__PURE__ */ React.createElement("div", { className: "bar-column", key: days[i] }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `bar ${amount === max ? "highlight" : ""}`,
      style: { height: `${amount / scale * 100}%` },
      title: `${days[i]}: ${money(amount)}`
    }
  ), /* @__PURE__ */ React.createElement("span", null, days[i]))))), amounts.every((v) => v === 0) ? /* @__PURE__ */ React.createElement("p", { className: "chart-empty" }, "No confirmed rental fees in this period.") : null)), /* @__PURE__ */ React.createElement("aside", { className: "right-column" }, /* @__PURE__ */ React.createElement("section", { className: "panel terminal-panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-title" }, /* @__PURE__ */ React.createElement("h3", null, /* @__PURE__ */ React.createElement(Icon, { name: "chip" }), " ESP32 terminal"), /* @__PURE__ */ React.createElement("span", { className: "offline-dot" }, "Standby")), /* @__PURE__ */ React.createElement("div", { className: "device" }, /* @__PURE__ */ React.createElement("span", null, t?.terminal_code || "HARDWARE NOT CONNECTED"), /* @__PURE__ */ React.createElement("strong", null, "ON STANDBY"), /* @__PURE__ */ React.createElement("small", null, t?.name || "Ready for future hardware setup"), /* @__PURE__ */ React.createElement("div", { className: "device-led" })), /* @__PURE__ */ React.createElement("div", { className: "terminal-meta" }, /* @__PURE__ */ React.createElement("span", null, "Saved pending attempts"), /* @__PURE__ */ React.createElement("strong", null, queue.length)), /* @__PURE__ */ React.createElement("p", { className: "terminal-note" }, /* @__PURE__ */ React.createElement(Icon, { name: "chip" }), " Admin confirms current releases and returns. The terminal is reserved for later hardware integration."), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "secondary wide",
      "data-page": "ESP32 terminal",
      onClick: () => onNavigate("ESP32 terminal")
    },
    "View terminal records ",
    /* @__PURE__ */ React.createElement(Icon, { name: "arrow" })
  )), /* @__PURE__ */ React.createElement("section", { className: "panel category-panel" }, /* @__PURE__ */ React.createElement("h3", null, "A little of everything"), /* @__PURE__ */ React.createElement("p", null, "Your equipment at a glance."), data.categories.length > 0 ? data.categories.map((c, i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: c.name || i,
      "data-category": i,
      onClick: () => onNavigate("Inventory", false, "All rentals", c.name)
    },
    /* @__PURE__ */ React.createElement("span", { className: "category-symbol" }, /* @__PURE__ */ React.createElement(CategorySymbol, { category: c.name })),
    /* @__PURE__ */ React.createElement("span", null, c.name, /* @__PURE__ */ React.createElement("small", null, c.count, " items in inventory")),
    /* @__PURE__ */ React.createElement(Icon, { name: "arrow" })
  )) : /* @__PURE__ */ React.createElement("p", null, "No categories recorded.")), /* @__PURE__ */ React.createElement("div", { className: "counter-tip" }, /* @__PURE__ */ React.createElement("span", null, "\u2726"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, "A small counter tip"), /* @__PURE__ */ React.createElement("p", null, "Check item condition before confirming a return."))))));
}

// src/react/ProfileView.jsx
function ProfileView({
  user,
  profileEditing,
  onSetProfileEditing,
  confirmSubmit,
  api,
  onUserUpdated,
  toast
}) {
  const formRef = useRef(null);
  useEffect(() => {
    if (!profileEditing || !formRef.current) return;
    const form = formRef.current;
    form.querySelector("input")?.focus();
    confirmSubmit(
      form,
      {
        title: "Save profile changes?",
        description: "Your name and login email will be updated. Use the new email the next time you sign in.",
        confirmLabel: "Yes, save changes"
      },
      async () => {
        const button = form.querySelector('[type="submit"]');
        const error = form.querySelector(".profile-error");
        button.disabled = true;
        error.textContent = "";
        try {
          const values = Object.fromEntries(new FormData(form));
          const result = await api("/profile", {
            method: "PATCH",
            body: JSON.stringify(values)
          });
          onUserUpdated(result.user);
          onSetProfileEditing(false);
          toast("Profile updated.");
        } catch (problem) {
          error.textContent = problem.message;
          button.disabled = false;
        }
      }
    );
  }, [profileEditing, confirmSubmit, api, onUserUpdated, onSetProfileEditing, toast]);
  return /* @__PURE__ */ React.createElement("div", { className: "profile-layout" }, /* @__PURE__ */ React.createElement("section", { className: "panel profile-card" }, /* @__PURE__ */ React.createElement("span", { className: "profile-avatar" }, initials(user.name)), /* @__PURE__ */ React.createElement("h2", null, user.name), /* @__PURE__ */ React.createElement("p", null, user.email), /* @__PURE__ */ React.createElement("span", { className: "profile-role" }, user.role), /* @__PURE__ */ React.createElement("small", null, "Account ID"), /* @__PURE__ */ React.createElement("code", null, user.account_code || "Not assigned")), profileEditing ? /* @__PURE__ */ React.createElement("section", { className: "panel profile-form-card" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, "EDIT PROFILE"), /* @__PURE__ */ React.createElement("h2", null, "Update your details"), /* @__PURE__ */ React.createElement("p", null, "Your name appears throughout the workspace. Your email is also your Firebase login."), /* @__PURE__ */ React.createElement("form", { id: "profile-form", className: "profile-form", ref: formRef }, /* @__PURE__ */ React.createElement("label", null, "Full name", /* @__PURE__ */ React.createElement(
    "input",
    {
      name: "fullName",
      defaultValue: user.name,
      minLength: 2,
      maxLength: 150,
      autoComplete: "name",
      required: true
    }
  )), /* @__PURE__ */ React.createElement("label", null, "Login email", /* @__PURE__ */ React.createElement(
    "input",
    {
      name: "email",
      type: "email",
      defaultValue: user.email,
      maxLength: 254,
      autoComplete: "email",
      required: true
    }
  )), /* @__PURE__ */ React.createElement("label", null, "Role", /* @__PURE__ */ React.createElement("input", { defaultValue: user.role, disabled: true }), /* @__PURE__ */ React.createElement("small", null, "Account roles are managed separately for security.")), /* @__PURE__ */ React.createElement("p", { className: "profile-error", role: "alert" }), /* @__PURE__ */ React.createElement("div", { className: "profile-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "secondary",
      id: "profile-cancel",
      type: "button",
      onClick: () => onSetProfileEditing(false)
    },
    "Cancel"
  ), /* @__PURE__ */ React.createElement("button", { className: "primary", type: "submit" }, "Save changes")))) : /* @__PURE__ */ React.createElement("section", { className: "panel profile-overview" }, /* @__PURE__ */ React.createElement("div", { className: "profile-overview-heading" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "primary",
      id: "profile-edit",
      type: "button",
      onClick: () => onSetProfileEditing(true)
    },
    "Edit profile"
  )), /* @__PURE__ */ React.createElement("dl", { className: "profile-details" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Full name"), /* @__PURE__ */ React.createElement("dd", null, user.name)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Login email"), /* @__PURE__ */ React.createElement("dd", null, user.email)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Account role"), /* @__PURE__ */ React.createElement("dd", null, user.role)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Account status"), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement("span", { className: "profile-active" }, "Active")))), /* @__PURE__ */ React.createElement("div", { className: "profile-note" }, /* @__PURE__ */ React.createElement("strong", null, "Login details"), /* @__PURE__ */ React.createElement("p", null, "If you change the email address, use the new email the next time you sign in."))));
}

// src/react/WorkspaceLayout.jsx
var navGroups = [
  {
    id: "management",
    label: "Management",
    icon: "layers",
    items: [
      ["Equipment", "Inventory"],
      ["Customers", "Customers"],
      ["Rates & Fees", "Rates & Fees"]
    ]
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: "repeat",
    items: [
      ["Rentals", "Rentals"],
      ["Returns", "Returns"],
      ["Rental History", "Transaction History"],
      ["Payments & expenses", "Payments"]
    ]
  },
  {
    id: "operations",
    label: "Operations",
    icon: "wrench",
    items: [
      ["Maintenance", "Maintenance"],
      ["ESP32 / Verification", "ESP32 terminal"]
    ]
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "chart",
    items: [
      ["Performance", "Reports", "performance"],
      ["Forecasting", "Reports", "forecast"],
      ["Recommendations", "Reports", "recommendations"]
    ]
  }
];
var pageLabels = {
  Inventory: "Equipment",
  "Transaction History": "Rental History",
  "ESP32 terminal": "ESP32 / Verification"
};
var workspacePages = /* @__PURE__ */ new Set([
  "Customers",
  "Rates & Fees",
  "Rentals",
  "Returns",
  "Transaction History",
  "Maintenance",
  "Reports",
  "Payments",
  "Settings",
  "ESP32 terminal"
]);
function appearanceSettingsHtml(theme) {
  return `<section class="appearance-settings" aria-label="Appearance settings"><p>A comfortable workspace, day or night.</p><div class="theme-setting"><span class="theme-setting-icon">${icon(
    "moon"
  )}</span><div><label id="dark-mode-label">Dark mode</label><small>Use a softer, darker palette across your workspace.</small></div><button id="dark-mode" class="theme-switch" type="button" role="switch" aria-labelledby="dark-mode-label" aria-checked="${theme === "dark"}"><span></span></button></div><div class="theme-preference-note"><span id="theme-status" role="status">${theme === "dark" ? "Dark mode is on" : "Light mode is on"}</span><small>Saved on this browser \xB7 Applies to login and dashboard</small></div></section>`;
}
function PageHeading({ page, reportSection }) {
  const [caption, description, glyph] = pageInfo[page] || pageInfo.Dashboard;
  const reportInfo = {
    performance: [
      "STORE PERFORMANCE",
      "Explore rental results, equipment demand, customer activity, and service quality."
    ],
    forecast: [
      "DEMAND & PLANNING ANALYTICS",
      "Compare recorded history with demand estimates, scenario projections, and equipment mix."
    ],
    recommendations: [
      "ACTION PRIORITIES",
      "Review priorities, supporting evidence, and practical next steps."
    ]
  }[reportSection];
  const title = page === "Reports" ? {
    performance: "Performance",
    forecast: "Forecasting",
    recommendations: "Recommendations"
  }[reportSection] || "Performance" : pageLabels[page] || page;
  const displayCaption = page === "Reports" && reportInfo ? reportInfo[0] : caption;
  const displayDesc = page === "Reports" && reportInfo ? reportInfo[1] : description;
  return /* @__PURE__ */ React.createElement("header", { className: "page-heading" }, /* @__PURE__ */ React.createElement("div", { className: "page-heading-copy" }, /* @__PURE__ */ React.createElement("span", { className: "page-eyebrow" }, displayCaption), /* @__PURE__ */ React.createElement("h1", null, title), displayDesc ? /* @__PURE__ */ React.createElement("p", null, displayDesc) : null), /* @__PURE__ */ React.createElement("span", { className: "page-heading-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: glyph })));
}
var SKELETON_HTML = `<div class="inv-loading-copy"><span class="inv-loading-spinner" aria-hidden="true"></span><div><strong>Loading your equipment</strong><small>Getting your collection and availability ready\u2026</small></div></div>
  <div class="inv-loading-stats" aria-hidden="true">${Array.from(
  { length: 4 },
  () => `<div class="panel inv-stat inv-skeleton-stat"><span class="inv-skeleton-block inv-skeleton-icon"></span><div><i class="inv-skeleton-block inv-skeleton-label"></i><i class="inv-skeleton-block inv-skeleton-value"></i></div></div>`
).join("")}</div>
  <section class="panel inv-collection inv-loading-collection" aria-hidden="true">
    <div class="inv-loading-toolbar"><i class="inv-skeleton-block inv-skeleton-search"></i><div><i class="inv-skeleton-block inv-skeleton-button"></i><i class="inv-skeleton-block inv-skeleton-button short"></i><i class="inv-skeleton-block inv-skeleton-add"></i></div></div>
    <div class="inv-loading-filters"><i class="inv-skeleton-block inv-skeleton-filter"></i><i class="inv-skeleton-block inv-skeleton-filter"></i><i class="inv-skeleton-block inv-skeleton-filter sort"></i><i class="inv-skeleton-block inv-skeleton-reset"></i><i class="inv-skeleton-block inv-skeleton-count"></i></div>
    <div class="inv-loading-table"><div class="inv-loading-table-head"><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i></div>${Array.from(
  { length: 5 },
  () => `<div class="inv-loading-row"><div class="inv-loading-equipment"><i class="inv-skeleton-block inv-skeleton-thumb"></i><div><i class="inv-skeleton-block inv-skeleton-name"></i><i class="inv-skeleton-block inv-skeleton-code"></i></div></div><div><i class="inv-skeleton-block inv-skeleton-status"></i><i class="inv-skeleton-block inv-skeleton-condition"></i></div><i class="inv-skeleton-block inv-skeleton-price"></i></div>`
).join("")}</div>
    <div class="inv-loading-footer"><i class="inv-skeleton-block"></i><div><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i></div></div>
  </section>`;
function InventorySection({ category, inventoryController, renderTick }) {
  const rootRef = useRef(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!el.hasChildNodes()) {
      el.innerHTML = SKELETON_HTML;
    }
    inventoryController.mount(el, category);
  }, [category, inventoryController, renderTick]);
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      id: "inventory-root",
      ref: rootRef,
      className: "inv-loading-shell",
      "aria-live": "polite",
      "aria-busy": "true"
    }
  );
}
function WorkspaceModuleSection({
  page,
  user,
  theme,
  onSetTheme,
  workspaceUI,
  renderTick,
  onTriggerRender,
  onNavigate
}) {
  const containerRef = useRef(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previousFocus = container.contains(document.activeElement) ? document.activeElement : null;
    const focusId = previousFocus?.id || "";
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    let selection = null;
    try {
      if (previousFocus && typeof previousFocus.selectionStart === "number") {
        selection = [previousFocus.selectionStart, previousFocus.selectionEnd];
      }
    } catch {
    }
    const html = workspaceUI.render(page, user, appearanceSettingsHtml(theme));
    container.innerHTML = html;
    const themeSwitch = container.querySelector("#dark-mode");
    if (themeSwitch) {
      themeSwitch.onclick = () => onSetTheme(theme === "dark" ? "light" : "dark");
    }
    container.querySelectorAll("[data-page]").forEach((el) => {
      el.onclick = (event) => {
        event.preventDefault();
        onNavigate(
          el.dataset.page,
          false,
          el.dataset.filter || "All rentals",
          "",
          el.dataset.analyticsSection || ""
        );
        if (el.dataset.target) {
          requestAnimationFrame(
            () => document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" })
          );
        }
      };
      if (el.getAttribute("role") === "button") {
        el.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            el.click();
          }
        };
      }
    });
    const boundPage = page;
    workspaceUI.bind(page, user, () => {
      if (boundPage === page) onTriggerRender();
    });
    const restoredFocus = focusId ? document.getElementById(focusId) : null;
    if (restoredFocus && container.contains(restoredFocus)) {
      restoredFocus.focus({ preventScroll: true });
      if (selection && restoredFocus.setSelectionRange) {
        try {
          restoredFocus.setSelectionRange(...selection);
        } catch {
        }
      }
    }
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo(scrollX, scrollY);
    }
  }, [page, user, theme, workspaceUI, renderTick, onSetTheme, onTriggerRender, onNavigate]);
  return /* @__PURE__ */ React.createElement("div", { className: "workspace-module-container", ref: containerRef });
}
function WorkspaceShell({
  user,
  data,
  page,
  reportSection,
  connectionError,
  theme,
  onSetTheme,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  rentalPage,
  onRentalPageChange,
  period,
  onPeriodChange,
  profileEditing,
  onSetProfileEditing,
  manualRefreshPending,
  onManualRefresh,
  onNavigate,
  onLogout,
  onUserUpdated,
  navGroupExpanded,
  onToggleNavGroup,
  sidebarCollapsed,
  onSetSidebarCollapsed,
  rentalNotifications,
  notificationVersion,
  notificationFingerprint,
  workspaceUI,
  inventoryController,
  showModal,
  confirmSubmit,
  api,
  toast,
  renderTick,
  onTriggerRender
}) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" ? window.matchMedia("(max-width:720px)").matches : false
  );
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const sidebarRef = useRef(null);
  const workspaceBodyRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const accountToggleRef = useRef(null);
  const accountDropdownRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const notificationDropdownRef = useRef(null);
  const notificationListRef = useRef(null);
  const notificationBellRef = useRef(null);
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.matchMedia("(max-width:720px)").matches;
      setIsMobileViewport(mobile);
      if (!mobile) setMobileDrawerOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    const body = workspaceBodyRef.current;
    if (sidebar) sidebar.inert = Boolean(isMobileViewport && !mobileDrawerOpen);
    if (body) body.inert = Boolean(isMobileViewport && mobileDrawerOpen);
  }, [isMobileViewport, mobileDrawerOpen]);
  useEffect(() => {
    const handleDocClick = () => {
      setAccountMenuOpen(false);
      setNotificationsOpen(false);
    };
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);
  useLayoutEffect(() => {
    const list = notificationListRef.current;
    if (!list) return;
    const state = rentalNotifications.state();
    const overdue = data?.rentals.filter((r) => r.displayStatus === "Overdue") || [];
    const pending = data?.pending || [];
    const snapshot = JSON.stringify([state, overdue, pending]);
    if (list.dataset.snapshot !== snapshot && !list.contains(document.activeElement)) {
      list.innerHTML = `${state.loading ? '<p class="notification-feedback">Loading rental updates\u2026</p>' : ""}${state.error ? `<p class="notification-feedback" role="alert">${escape(
        state.error
      )} <button type="button" data-notification-retry>Retry</button></p>` : ""}${renderRentalNotifications(state, { escape, formatDate })}${overdue.map(
        (r) => `<button type="button" data-notification-page="Rentals"><span class="notification-mark overdue-mark">!</span><span><strong>Overdue rental \xB7 ${escape(
          r.item_name
        )}</strong><small>${escape(r.customer)} \xB7 Due ${escape(
          formatDate(r.due_at)
        )}</small></span>${icon("arrow")}</button>`
      ).join("")}${pending.map(
        (r) => `<button type="button" data-notification-page="ESP32 terminal"><span class="notification-mark pending-mark">\u2022</span><span><strong>Verification waiting \xB7 ${escape(
          r.item_name
        )}</strong><small>${escape(r.customer)} \xB7 ${escape(
          r.transaction_type
        )}</small></span>${icon("arrow")}</button>`
      ).join("")}${state.nextCursor ? '<button type="button" class="notification-load-more" data-notification-older>Load older updates</button>' : ""}${!state.loading && !state.error && !state.notifications.length && !overdue.length && !pending.length ? '<div class="workspace-empty"><h3>You\u2019re all caught up</h3><p>New rental and return updates will appear here.</p></div>' : ""}`;
      list.dataset.snapshot = snapshot;
    }
  }, [data, rentalNotifications, notificationVersion, notificationsOpen]);
  const handleMobileMenuClick = () => {
    if (window.matchMedia("(max-width:720px)").matches) {
      const opening = !mobileDrawerOpen;
      setMobileDrawerOpen(opening);
      if (opening) {
        requestAnimationFrame(() => {
          sidebarRef.current?.querySelector(".active,nav button")?.focus();
        });
      }
    } else {
      const next = !sidebarCollapsed;
      onSetSidebarCollapsed(next);
    }
  };
  const handleSidebarKeyDown = (event) => {
    if (event.key === "Escape") {
      setMobileDrawerOpen(false);
      mobileToggleRef.current?.focus();
    }
    if (event.key === "Tab" && isMobileViewport && mobileDrawerOpen && sidebarRef.current) {
      const controls = [
        ...sidebarRef.current.querySelectorAll('a,button,[tabindex="0"]')
      ].filter((el) => !el.disabled && el.getClientRects().length);
      const next = event.shiftKey ? controls.at(-1) : controls[0];
      if (event.shiftKey && document.activeElement === controls[0] || !event.shiftKey && document.activeElement === controls.at(-1)) {
        event.preventDefault();
        next?.focus();
      }
    }
  };
  const handleToggleNotifications = (e) => {
    e.stopPropagation();
    setAccountMenuOpen(false);
    if (notificationsOpen) {
      setNotificationsOpen(false);
      return;
    }
    setNotificationsOpen(true);
    rentalNotifications.refresh();
    try {
      localStorage.setItem("rent-play-notifications-seen", notificationFingerprint);
    } catch {
    }
  };
  const handleNotificationMenuClick = async (event) => {
    event.stopPropagation();
    const entry = event.target.closest("[data-rental-notification]");
    if (entry) {
      setNotificationsOpen(false);
      try {
        await rentalNotifications.markRead([entry.dataset.rentalNotification]);
        await workspaceUI.openTransaction(entry.dataset.notificationRental);
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    if (event.target.closest("[data-notification-mark-read]")) {
      try {
        await rentalNotifications.markRead(
          rentalNotifications.state().notifications.map((row) => row.id)
        );
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    if (event.target.closest("[data-notification-retry]")) {
      rentalNotifications.refresh();
      return;
    }
    if (event.target.closest("[data-notification-older]")) {
      rentalNotifications.refresh({ older: true });
      return;
    }
    const target = event.target.closest("[data-notification-page]");
    if (target) {
      setNotificationsOpen(false);
      onNavigate(target.dataset.notificationPage);
    }
  };
  const handleNotificationKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setNotificationsOpen(false);
      notificationBellRef.current?.focus();
    }
    if (event.key === "ArrowDown" && event.target.id === "notifications") {
      event.preventDefault();
      if (!notificationsOpen) {
        setNotificationsOpen(true);
        rentalNotifications.refresh();
      }
      requestAnimationFrame(() => {
        notificationDropdownRef.current?.querySelector("button")?.focus();
      });
    }
  };
  const handleNotificationFocusOut = (event) => {
    if (!notificationMenuRef.current?.contains(event.relatedTarget)) {
      setNotificationsOpen(false);
    }
  };
  const handleToggleAccountMenu = (event) => {
    event.stopPropagation();
    setNotificationsOpen(false);
    const opening = !accountMenuOpen;
    setAccountMenuOpen(opening);
    if (opening) {
      requestAnimationFrame(() => {
        accountDropdownRef.current?.querySelector('[role="menuitem"]')?.focus();
      });
    }
  };
  const business = workspaceUI.business();
  const storeName = business.business_name || "Rent & Play";
  const storeLocation = business.location || "Los Ba\xF1os, Laguna";
  const notifState = rentalNotifications.state();
  const unreadCount = notifState.unreadCount || 0;
  let notificationsSeen = "";
  try {
    notificationsSeen = localStorage.getItem("rent-play-notifications-seen") || "";
  } catch {
  }
  const showNotificationDot = !unreadCount && !notificationsOpen && Boolean(notificationFingerprint) && notificationFingerprint !== notificationsSeen;
  const mobileToggleLabel = isMobileViewport ? mobileDrawerOpen ? "Close navigation" : "Open navigation" : sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("a", { className: "skip-link", href: "#workspace-content" }, "Skip to main content"), /* @__PURE__ */ React.createElement("div", { className: `workspace${sidebarCollapsed ? " sidebar-collapsed" : ""}` }, /* @__PURE__ */ React.createElement(
    "aside",
    {
      id: "workspace-navigation",
      ref: sidebarRef,
      className: `sidebar${isMobileViewport && mobileDrawerOpen ? " open" : ""}`,
      onKeyDown: handleSidebarKeyDown
    },
    /* @__PURE__ */ React.createElement(
      "a",
      {
        className: "brand",
        href: "/",
        "data-page": "Dashboard",
        "aria-label": "Rent & Play home",
        onClick: (e) => {
          e.preventDefault();
          setMobileDrawerOpen(false);
          onNavigate("Dashboard");
        }
      },
      /* @__PURE__ */ React.createElement(BrandLogo, null)
    ),
    /* @__PURE__ */ React.createElement("div", { className: "store" }, /* @__PURE__ */ React.createElement("span", { className: "store-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: "box" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, storeName), /* @__PURE__ */ React.createElement("small", null, storeLocation))),
    /* @__PURE__ */ React.createElement("nav", null, /* @__PURE__ */ React.createElement(
      "button",
      {
        "data-page": "Dashboard",
        className: `nav-root${page === "Dashboard" ? " active" : ""}`,
        "aria-label": "Dashboard",
        title: "Dashboard",
        "aria-current": page === "Dashboard" ? "page" : void 0,
        onClick: (e) => {
          e.preventDefault();
          setMobileDrawerOpen(false);
          onNavigate("Dashboard");
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "nav-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "home" })),
      /* @__PURE__ */ React.createElement("span", { className: "sidebar-label" }, "Dashboard"),
      /* @__PURE__ */ React.createElement("span", { className: "nav-tooltip", "aria-hidden": "true" }, "Dashboard")
    ), navGroups.map((group) => {
      const expanded = Boolean(navGroupExpanded[group.id]);
      const hasActiveChild = group.items.some(([label, target, section]) => {
        return section ? page === "Reports" && reportSection === section : page === target;
      });
      return /* @__PURE__ */ React.createElement(
        "section",
        {
          className: `nav-section${hasActiveChild ? " has-active-child" : ""}`,
          key: group.id
        },
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            id: `nav-group-toggle-${group.id}`,
            className: `nav-section-title${hasActiveChild ? " group-active" : ""}`,
            "data-nav-group": group.id,
            "aria-expanded": expanded,
            "aria-controls": `nav-group-${group.id}`,
            "aria-label": group.label,
            title: group.label,
            onClick: () => onToggleNavGroup(group.id)
          },
          /* @__PURE__ */ React.createElement("span", { className: "nav-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: group.icon || "box" })),
          /* @__PURE__ */ React.createElement("span", { className: "sidebar-label" }, group.label),
          /* @__PURE__ */ React.createElement("span", { className: "nav-group-chevron" }, /* @__PURE__ */ React.createElement(Icon, { name: "chevron" }))
        ),
        /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "nav-section-items",
            id: `nav-group-${group.id}`,
            hidden: !sidebarCollapsed && !expanded
          },
          /* @__PURE__ */ React.createElement("div", { className: "nav-flyout-header", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", null, group.label)),
          group.items.map(([label, target, section]) => {
            const active = section ? page === "Reports" && reportSection === section : page === target;
            const buttonLabel = section ? label : target;
            return /* @__PURE__ */ React.createElement(
              "button",
              {
                key: `${target}-${section || ""}`,
                "data-page": target,
                "data-analytics-section": section || void 0,
                className: `nav-child${active ? " active" : ""}`,
                "aria-label": buttonLabel,
                title: buttonLabel,
                "aria-current": active ? "page" : void 0,
                onClick: (e) => {
                  e.preventDefault();
                  setMobileDrawerOpen(false);
                  onNavigate(target, false, "All rentals", "", section || "");
                }
              },
              /* @__PURE__ */ React.createElement("span", { className: "sidebar-label" }, label),
              target === "Rentals" ? /* @__PURE__ */ React.createElement("span", { className: "nav-count" }, data?.rentals?.length ?? "\u2013") : null
            );
          })
        )
      );
    })),
    /* @__PURE__ */ React.createElement("div", { className: "sidebar-bottom" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        "data-page": "Settings",
        className: page === "Settings" ? "active" : "",
        "aria-label": "Settings",
        title: "Settings",
        "aria-current": page === "Settings" ? "page" : void 0,
        onClick: (e) => {
          e.preventDefault();
          setMobileDrawerOpen(false);
          onNavigate("Settings");
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "nav-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "settings" })),
      /* @__PURE__ */ React.createElement("span", { className: "sidebar-label" }, "Settings"),
      /* @__PURE__ */ React.createElement("span", { className: "nav-tooltip", "aria-hidden": "true" }, "Settings")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        id: "logout",
        "aria-label": "Logout",
        title: "Logout",
        onClick: () => {
          setMobileDrawerOpen(false);
          onLogout();
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "nav-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "out" })),
      /* @__PURE__ */ React.createElement("span", { className: "sidebar-label" }, "Logout"),
      /* @__PURE__ */ React.createElement("span", { className: "nav-tooltip", "aria-hidden": "true" }, "Logout")
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "operator",
        "data-page": "Profile",
        tabIndex: 0,
        role: "button",
        "aria-label": "Open profile",
        onClick: (e) => {
          e.preventDefault();
          setMobileDrawerOpen(false);
          onNavigate("Profile");
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setMobileDrawerOpen(false);
            onNavigate("Profile");
          }
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "avatar" }, initials(user.name)),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, user.name), /* @__PURE__ */ React.createElement("small", null, user.role)),
      /* @__PURE__ */ React.createElement("span", { className: "nav-tooltip", "aria-hidden": "true" }, "Profile")
    ))
  ), /* @__PURE__ */ React.createElement("div", { className: "workspace-body", ref: workspaceBodyRef }, /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      ref: mobileToggleRef,
      className: "icon-button menu-toggle",
      id: "mobile-menu",
      "aria-controls": "workspace-navigation",
      "aria-expanded": isMobileViewport ? mobileDrawerOpen : !sidebarCollapsed,
      "aria-label": mobileToggleLabel,
      title: mobileToggleLabel,
      onClick: handleMobileMenuClick,
      onKeyDown: (e) => {
        if (e.key === "Escape") setMobileDrawerOpen(false);
      }
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "menu" })
  ), /* @__PURE__ */ React.createElement("div", { className: "top-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "text-button",
      id: "refresh",
      disabled: manualRefreshPending,
      "aria-busy": manualRefreshPending ? "true" : void 0,
      onClick: onManualRefresh
    },
    manualRefreshPending ? "Refreshing\u2026" : "Refresh"
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "notification-menu",
      ref: notificationMenuRef,
      onClick: handleNotificationMenuClick,
      onKeyDown: handleNotificationKeyDown,
      onBlur: handleNotificationFocusOut
    },
    /* @__PURE__ */ React.createElement(
      "button",
      {
        ref: notificationBellRef,
        type: "button",
        className: "icon-button notification",
        id: "notifications",
        "aria-label": "View notifications",
        "aria-expanded": notificationsOpen,
        "aria-controls": "notification-dropdown",
        onClick: handleToggleNotifications
      },
      /* @__PURE__ */ React.createElement(Icon, { name: "bell" }),
      unreadCount > 0 ? /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "notification-count-badge",
          "aria-label": `${unreadCount} unread updates`
        },
        unreadCount > 99 ? "99+" : unreadCount
      ) : showNotificationDot ? /* @__PURE__ */ React.createElement("i", null) : null
    ),
    /* @__PURE__ */ React.createElement(
      "section",
      {
        ref: notificationDropdownRef,
        className: "notification-dropdown",
        id: "notification-dropdown",
        "aria-label": "Notifications",
        hidden: !notificationsOpen
      },
      /* @__PURE__ */ React.createElement("header", { className: "notification-dropdown-heading" }, /* @__PURE__ */ React.createElement("h2", null, "Notifications"), /* @__PURE__ */ React.createElement("span", { id: "notification-count" }, unreadCount ? `${unreadCount} unread` : "No unread updates")),
      /* @__PURE__ */ React.createElement("div", { className: "notification-toolbar" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "text-button",
          "data-notification-mark-read": true,
          disabled: !unreadCount
        },
        "Mark shown as read"
      )),
      /* @__PURE__ */ React.createElement("div", { className: "notification-list", ref: notificationListRef })
    )
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "profile-menu",
      onClick: (e) => e.stopPropagation(),
      onKeyDown: (e) => {
        if (e.key === "Escape") {
          setAccountMenuOpen(false);
          accountToggleRef.current?.focus();
        }
      }
    },
    /* @__PURE__ */ React.createElement(
      "button",
      {
        ref: accountToggleRef,
        className: "profile-menu-toggle",
        id: "profile-menu-toggle",
        type: "button",
        "aria-label": "Open account menu",
        "aria-haspopup": "menu",
        "aria-expanded": accountMenuOpen,
        onClick: handleToggleAccountMenu
      },
      /* @__PURE__ */ React.createElement("span", { className: "avatar small" }, initials(user.name)),
      /* @__PURE__ */ React.createElement("span", { className: "profile-menu-chevron", "aria-hidden": "true" }, "\u25BE")
    ),
    /* @__PURE__ */ React.createElement(
      "div",
      {
        ref: accountDropdownRef,
        className: "profile-dropdown",
        id: "profile-dropdown",
        role: "menu",
        hidden: !accountMenuOpen
      },
      /* @__PURE__ */ React.createElement("div", { className: "profile-dropdown-user" }, /* @__PURE__ */ React.createElement("strong", null, user.name), /* @__PURE__ */ React.createElement("small", null, user.email)),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          "data-page": "Profile",
          role: "menuitem",
          onClick: (e) => {
            e.preventDefault();
            setAccountMenuOpen(false);
            onNavigate("Profile");
          }
        },
        /* @__PURE__ */ React.createElement(Icon, { name: "users" }),
        " View profile"
      ),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          "data-page": "Settings",
          role: "menuitem",
          onClick: (e) => {
            e.preventDefault();
            setAccountMenuOpen(false);
            onNavigate("Settings");
          }
        },
        /* @__PURE__ */ React.createElement(Icon, { name: "settings" }),
        " Settings"
      ),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          "data-action": "logout",
          className: "profile-dropdown-logout",
          role: "menuitem",
          onClick: () => {
            setAccountMenuOpen(false);
            onLogout();
          }
        },
        /* @__PURE__ */ React.createElement(Icon, { name: "out" }),
        " Logout"
      )
    )
  ))), /* @__PURE__ */ React.createElement("main", { className: "content", id: "workspace-content", tabIndex: -1 }, /* @__PURE__ */ React.createElement(PageHeading, { page, reportSection }), connectionError ? /* @__PURE__ */ React.createElement("div", { className: "connection-banner dashboard-connection-banner", role: "alert" }, connectionError, data ? " Showing the last successfully loaded records." : "") : null, !data ? /* @__PURE__ */ React.createElement("section", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, /* @__PURE__ */ React.createElement(Icon, { name: "box" }), /* @__PURE__ */ React.createElement("h3", null, "Waiting for your database"), /* @__PURE__ */ React.createElement("p", null, "Check the backend connection, then select Refresh."))) : page === "Dashboard" ? /* @__PURE__ */ React.createElement(
    DashboardView,
    {
      data,
      filter,
      onFilterChange,
      query,
      onQueryChange,
      rentalPage,
      onRentalPageChange,
      period,
      onPeriodChange,
      onNavigate,
      showModal
    }
  ) : page === "Inventory" ? /* @__PURE__ */ React.createElement(
    InventorySection,
    {
      category: typeof window !== "undefined" ? window.__rentPlayCategory || "" : "",
      inventoryController,
      renderTick
    }
  ) : page === "Profile" ? /* @__PURE__ */ React.createElement(
    ProfileView,
    {
      user,
      profileEditing,
      onSetProfileEditing,
      confirmSubmit,
      api,
      onUserUpdated,
      toast
    }
  ) : workspacePages.has(page) ? /* @__PURE__ */ React.createElement(
    WorkspaceModuleSection,
    {
      page,
      user,
      theme,
      onSetTheme,
      workspaceUI,
      renderTick,
      onTriggerRender,
      onNavigate
    }
  ) : /* @__PURE__ */ React.createElement("section", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, /* @__PURE__ */ React.createElement(Icon, { name: "box" }), /* @__PURE__ */ React.createElement("h3", null, "Page unavailable"), /* @__PURE__ */ React.createElement("p", null, "Choose another workspace section."))), /* @__PURE__ */ React.createElement("footer", { className: "content-footer" }, /* @__PURE__ */ React.createElement("span", null, "\xA9 ", (/* @__PURE__ */ new Date()).getFullYear(), " Rent & Play"), /* @__PURE__ */ React.createElement("span", null, data ? `Updated ${new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila"
  }).format(new Date(data.refreshedAt))}` : "Waiting for database")))), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "sidebar-backdrop",
      "aria-label": "Close navigation",
      hidden: !(isMobileViewport && mobileDrawerOpen),
      onClick: () => {
        setMobileDrawerOpen(false);
        mobileToggleRef.current?.focus();
      }
    }
  )));
}

// src/react/App.jsx
import { createInventory } from "./inventory.js";
import { createWorkspaceUI } from "./workspace-ui.js";
import { createConfirmationDialog } from "./confirmation-dialog.js";
import {
  pageRoutes,
  pageForPath,
  reportPathForSection,
  reportSectionForPath
} from "./workspace-navigation.js";
import { createApiClient } from "./api-client.js";
import { createRentalNotifications, syncLiveRentalUpdate } from "./notifications.js";
var dashboardSnapshot = (value) => value ? JSON.stringify(
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== "refreshedAt"))
) : "";
var liveRentalPages = /* @__PURE__ */ new Set(["Rentals", "Returns", "Transaction History"]);
function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [rememberSession, setRememberSession] = useState(false);
  const [data, setData] = useState(null);
  const [connectionError, setConnectionError] = useState("");
  const [page, setPage] = useState(() => pageForPath(location.pathname));
  const [reportSection, setReportSection] = useState(
    () => reportSectionForPath(location.pathname)
  );
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("All rentals");
  const [query, setQuery] = useState("");
  const [rentalPage, setRentalPage] = useState(0);
  const [period, setPeriod] = useState("This week");
  const [profileEditing, setProfileEditing] = useState(false);
  const [manualRefreshPending, setManualRefreshPending] = useState(false);
  const [theme, setThemeState] = useState(
    () => document.documentElement.dataset.theme || "light"
  );
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() => {
    try {
      return localStorage.getItem("rent-play-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [navGroupExpanded, setNavGroupExpanded] = useState(() => {
    const initial = Object.fromEntries(navGroups.map((group) => [group.id, true]));
    try {
      const saved = JSON.parse(localStorage.getItem("rent-play-nav-groups") || "{}");
      for (const group of navGroups) {
        if (typeof saved[group.id] === "boolean") initial[group.id] = saved[group.id];
      }
    } catch {
    }
    return initial;
  });
  const [notificationVersion, setNotificationVersion] = useState(0);
  const [renderTick, setRenderTick] = useState(0);
  const userRef = useRef(user);
  userRef.current = user;
  const dataRef = useRef(data);
  dataRef.current = data;
  const pageRef = useRef(page);
  pageRef.current = page;
  const refreshingRef = useRef(false);
  const logoutPendingRef = useRef(false);
  const toastTimerRef = useRef(null);
  const passwordResetCountdownRef = useRef(null);
  const rentalEventSourceRef = useRef(null);
  const rentalEventAccountRef = useRef(null);
  const rentalEventsDisabledRef = useRef(false);
  const rentalEventSyncTimerRef = useRef(null);
  const rentalEventSyncingRef = useRef(false);
  const rentalEventSyncPendingRef = useRef(false);
  if (typeof window !== "undefined") {
    window.__rentPlayCategory = category;
  }
  const triggerRender = useCallback(() => {
    setRenderTick((t) => t + 1);
  }, []);
  const setPasswordResetCountdown = useCallback((timer) => {
    if (passwordResetCountdownRef.current) {
      clearInterval(passwordResetCountdownRef.current);
    }
    passwordResetCountdownRef.current = timer;
  }, []);
  const toast = useCallback((message) => {
    const el = document.querySelector("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => el.classList.remove("visible"), 4e3);
  }, []);
  const setTheme = useCallback((next) => {
    const resolved = next === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem("rent-play-theme", resolved);
    } catch {
    }
    setThemeState(resolved);
  }, []);
  const setSidebarCollapsed = useCallback((next) => {
    setSidebarCollapsedState(next);
    try {
      localStorage.setItem("rent-play-sidebar-collapsed", String(next));
    } catch {
    }
  }, []);
  const controllersRef = useRef(null);
  if (!controllersRef.current) {
    const modal = document.querySelector("#modal");
    const confirmDialog = document.querySelector("#confirmation-modal");
    const apiClient = createApiClient();
    const confirmation = createConfirmationDialog({
      dialog: confirmDialog,
      parentModal: modal,
      notify: (message) => toast(message)
    });
    const updateModalLayout = () => {
      if (!modal) return;
      const form = modal.querySelector(
        ":scope > .admin-form:not(.pricing-form):not(.customer-form):not(.rental-release-form)"
      );
      const fields = form ? [
        ...form.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
        )
      ].filter((field) => !field.closest("[hidden]")) : [];
      modal.classList.toggle("modal-compact", Boolean(form) && fields.length <= 4);
    };
    if (modal && typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(updateModalLayout);
      observer.observe(modal, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden", "type"]
      });
    }
    const showModal = (title, body) => {
      confirmation.cancel();
      modal.innerHTML = `<div class="modal-heading"><h2>${escape(
        title
      )}</h2><button class="icon-button" id="close-modal" aria-label="Close dialog">\u2715</button></div>${body}`;
      modal.setAttribute("aria-label", title);
      updateModalLayout();
      if (!modal.open) modal.showModal();
      modal.scrollTop = 0;
      const closeBtn = document.querySelector("#close-modal");
      if (closeBtn) closeBtn.onclick = () => modal.close();
    };
    controllersRef.current = {
      modal,
      apiClient,
      confirmation,
      showModal,
      inventoryController: null,
      workspaceUI: null,
      rentalNotifications: null,
      api: null,
      goTo: null,
      endSession: null
    };
  }
  const stopRentalEventStream = useCallback(() => {
    rentalEventSourceRef.current?.close();
    rentalEventSourceRef.current = null;
    rentalEventAccountRef.current = null;
    rentalEventsDisabledRef.current = false;
    rentalEventSyncPendingRef.current = false;
    clearTimeout(rentalEventSyncTimerRef.current);
    rentalEventSyncTimerRef.current = null;
  }, []);
  const endSession = useCallback(
    (msg = "Your session ended. Please sign in again.") => {
      if (!userRef.current) return;
      const c = controllersRef.current;
      c.confirmation.cancel();
      userRef.current = null;
      dataRef.current = null;
      setUser(null);
      setData(null);
      setConnectionError("");
      stopRentalEventStream();
      c.rentalNotifications?.setAccount(null);
      c.inventoryController?.reset();
      c.workspaceUI?.reset();
      c.modal?.close();
      setLoginError(msg);
    },
    [stopRentalEventStream]
  );
  const api = useCallback(
    async (path, options = {}) => {
      const c = controllersRef.current;
      let result;
      try {
        result = await c.apiClient.request(path, options);
      } catch (error) {
        if (error.code === "PASSWORD_CHANGE_REQUIRED" && userRef.current) {
          const updated = { ...userRef.current, mustChangePassword: true };
          userRef.current = updated;
          setUser(updated);
        } else if (error.status === 401 && userRef.current && !path.startsWith("/auth/")) {
          endSession();
        }
        throw error;
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(String(options.method || "GET").toUpperCase()) && path !== "/pricing/quote" && !path.startsWith("/notifications") && !path.startsWith("/auth/")) {
        c.workspaceUI?.invalidate();
      }
      return result;
    },
    [endSession]
  );
  const goTo = useCallback(
    (next, replace = false, nextFilter = "All rentals", nextCategory = "", nextReportSection = "") => {
      const c = controllersRef.current;
      const currentPage = pageRef.current;
      let resolvedSection = c.workspaceUI?.reportSection() || "performance";
      if (next === "Reports") {
        resolvedSection = nextReportSection || (currentPage === "Reports" ? c.workspaceUI?.reportSection() : "performance") || "performance";
        c.workspaceUI?.setReportSection(resolvedSection);
        setReportSection(resolvedSection);
      }
      if (workspacePages.has(next) && !(next === "Reports" && currentPage === "Reports")) {
        c.workspaceUI?.invalidate();
      }
      pageRef.current = next;
      setPage(next);
      setProfileEditing(false);
      setCategory(nextCategory);
      if (typeof window !== "undefined") {
        window.__rentPlayCategory = nextCategory;
      }
      setFilter(nextFilter);
      setQuery("");
      setRentalPage(0);
      const route = next === "Reports" ? reportPathForSection(resolvedSection) : pageRoutes[next] || "/";
      if (location.pathname !== route) {
        history[replace ? "replaceState" : "pushState"]({ page: next }, "", route);
      }
      const group = navGroups.find((grp) => grp.items.some(([, target]) => target === next));
      if (group) {
        setNavGroupExpanded((prev) => {
          const updated = { ...prev, [group.id]: true };
          try {
            localStorage.setItem("rent-play-nav-groups", JSON.stringify(updated));
          } catch {
          }
          return updated;
        });
      }
      triggerRender();
      window.scrollTo(0, 0);
      requestAnimationFrame(() => {
        document.querySelector("#workspace-content")?.focus({ preventScroll: true });
      });
    },
    [triggerRender]
  );
  controllersRef.current.api = api;
  controllersRef.current.goTo = goTo;
  controllersRef.current.endSession = endSession;
  if (!controllersRef.current.inventoryController) {
    const c = controllersRef.current;
    const { confirmAction, confirmSubmit } = c.confirmation;
    c.inventoryController = createInventory({
      api: (...args) => c.api(...args),
      escape,
      icon,
      symbol,
      badge,
      stateLabel,
      formatDate,
      showModal: c.showModal,
      modal: c.modal,
      toast,
      confirmAction,
      confirmSubmit,
      openMaintenance: (id, item) => c.workspaceUI.openMaintenanceForUnit(id, item)
    });
    c.workspaceUI = createWorkspaceUI({
      api: (...args) => c.api(...args),
      escape,
      icon,
      showModal: c.showModal,
      modal: c.modal,
      toast,
      money,
      formatDate,
      confirmAction,
      confirmSubmit,
      showEquipmentDetails: (id) => c.inventoryController.details(id),
      onMaintenanceSaved: () => c.inventoryController.refresh({ force: true }),
      navigate: (...args) => c.goTo(...args)
    });
    c.workspaceUI.setReportSection(reportSectionForPath(location.pathname));
    c.rentalNotifications = createRentalNotifications({
      api: (...args) => c.api(...args),
      onChange: () => setNotificationVersion((v) => v + 1),
      onAlert: (notification, count) => toast(
        count > 1 ? `${count} new rental updates. Open notifications to review them.` : `${notification.title}: ${notification.message}`
      )
    });
  }
  const refresh = useCallback(
    async ({ force = false } = {}) => {
      const currentUser = userRef.current;
      if (currentUser?.mustChangePassword) return;
      if (!currentUser || refreshingRef.current) return;
      const sessionUser = currentUser;
      refreshingRef.current = true;
      const c = controllersRef.current;
      try {
        const nextData = await api(
          "/dashboard",
          force ? { headers: { "Cache-Control": "no-cache" } } : {}
        );
        const changed = dashboardSnapshot(dataRef.current) !== dashboardSnapshot(nextData);
        if (userRef.current !== sessionUser) return;
        dataRef.current = nextData;
        setData(nextData);
        setConnectionError("");
        if (pageRef.current === "Inventory" && document.querySelector("#inventory-root")) {
          await c.inventoryController.refresh();
        } else if (changed && ["Dashboard", "ESP32 terminal"].includes(pageRef.current)) {
          triggerRender();
        }
      } catch (error) {
        if (error.status === 401) {
          endSession();
        } else {
          setConnectionError(error.message);
        }
      } finally {
        refreshingRef.current = false;
      }
    },
    [api, endSession, triggerRender]
  );
  const scheduleRentalEventSync = useCallback(() => {
    clearTimeout(rentalEventSyncTimerRef.current);
    rentalEventSyncTimerRef.current = setTimeout(async () => {
      rentalEventSyncTimerRef.current = null;
      const currentUser = userRef.current;
      const c = controllersRef.current;
      if (!currentUser || currentUser.mustChangePassword || logoutPendingRef.current) return;
      if (!c.apiClient.canRefresh() || document.visibilityState !== "visible") {
        rentalEventSyncPendingRef.current = true;
        return;
      }
      if (rentalEventSyncingRef.current) {
        rentalEventSyncPendingRef.current = true;
        return;
      }
      rentalEventSyncPendingRef.current = false;
      rentalEventSyncingRef.current = true;
      try {
        const synced = await syncLiveRentalUpdate({
          notifications: c.rentalNotifications,
          isDialogOpen: () => Boolean(c.modal?.open),
          refreshView: async () => {
            const currentPage = pageRef.current;
            if (currentPage === "Dashboard") {
              await refresh({ force: true });
              if (!c.modal?.open && pageRef.current === "Dashboard" && userRef.current) {
                triggerRender();
              }
            } else if (currentPage === "ESP32 terminal") {
              const refreshedPage = currentPage;
              await refresh({ force: true });
              await c.workspaceUI.refresh();
              if (!c.modal?.open && pageRef.current === refreshedPage && userRef.current) {
                triggerRender();
              }
            } else if (currentPage === "Inventory") {
              await c.inventoryController.refresh({ force: true });
              await refresh({ force: true });
            } else if (workspacePages.has(currentPage)) {
              const refreshedPage = currentPage;
              c.workspaceUI.invalidate();
              await c.workspaceUI.refresh();
              await refresh({ force: true });
              if (!c.modal?.open && pageRef.current === refreshedPage && userRef.current) {
                triggerRender();
              }
            }
          }
        });
        if (!synced) rentalEventSyncPendingRef.current = true;
      } catch (problem) {
        if (problem.status === 429 || !c.apiClient.canRefresh()) {
          rentalEventSyncPendingRef.current = true;
        }
        if (problem.status !== 401) toast(problem.message);
      } finally {
        rentalEventSyncingRef.current = false;
        if (rentalEventSyncPendingRef.current && document.visibilityState === "visible" && !c.modal?.open && c.apiClient.canRefresh()) {
          scheduleRentalEventSync();
        }
      }
    }, 180);
  }, [refresh, toast, triggerRender]);
  const syncRentalEventStream = useCallback(
    (accountId) => {
      if (rentalEventAccountRef.current !== accountId) {
        rentalEventSourceRef.current?.close();
        rentalEventSourceRef.current = null;
        rentalEventAccountRef.current = accountId;
        rentalEventsDisabledRef.current = false;
        rentalEventSyncPendingRef.current = false;
        clearTimeout(rentalEventSyncTimerRef.current);
        rentalEventSyncTimerRef.current = null;
      }
      if (!accountId || rentalEventsDisabledRef.current || typeof EventSource === "undefined" || rentalEventSourceRef.current && rentalEventSourceRef.current.readyState !== EventSource.CLOSED) {
        return;
      }
      const source = new EventSource("/api/rental-events");
      let receivedReady = false;
      rentalEventSourceRef.current = source;
      source.addEventListener("ready", () => {
        if (receivedReady) scheduleRentalEventSync();
        receivedReady = true;
      });
      source.addEventListener("rental.changed", scheduleRentalEventSync);
      source.addEventListener("inventory.changed", scheduleRentalEventSync);
      source.addEventListener("maintenance.changed", scheduleRentalEventSync);
      source.addEventListener("customer.changed", scheduleRentalEventSync);
      source.addEventListener("finance.changed", scheduleRentalEventSync);
      source.addEventListener("data.changed", scheduleRentalEventSync);
      source.addEventListener("category.changed", scheduleRentalEventSync);
      source.addEventListener("settings.changed", scheduleRentalEventSync);
      source.onerror = () => {
        if (rentalEventSourceRef.current === source && source.readyState === EventSource.CLOSED) {
          rentalEventSourceRef.current = null;
          setTimeout(() => {
            if (userRef.current && !rentalEventsDisabledRef.current) {
              syncRentalEventStream(userRef.current.id);
            }
          }, 5e3);
        }
      };
    },
    [scheduleRentalEventSync]
  );
  useEffect(() => {
    const c = controllersRef.current;
    if (!user || user.mustChangePassword) {
      stopRentalEventStream();
      c.rentalNotifications.setAccount(null);
      return;
    }
    syncRentalEventStream(user.id);
    c.rentalNotifications.setAccount(user.id);
  }, [user, stopRentalEventStream, syncRentalEventStream]);
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    const displayPage = page === "Reports" ? {
      performance: "Performance",
      forecast: "Forecasting",
      recommendations: "Recommendations"
    }[reportSection] || "Performance" : pageLabels[page] || page;
    document.title = `${displayPage} \xB7 Rent & Play`;
  }, [user, page, reportSection]);
  useEffect(() => {
    const c = controllersRef.current;
    const modal = c.modal;
    const handleModalClose = () => {
      setPasswordResetCountdown(null);
      if (rentalEventSyncPendingRef.current) scheduleRentalEventSync();
    };
    const handleModalClick = (e) => {
      if (e.target !== modal) return;
      const r = modal.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        modal.close();
      }
    };
    modal?.addEventListener("close", handleModalClose);
    modal?.addEventListener("click", handleModalClick);
    const handleVisibilityChange = () => {
      if (userRef.current && !userRef.current.mustChangePassword && document.visibilityState === "visible") {
        rentalEventsDisabledRef.current = false;
        c.rentalNotifications.refresh();
        syncRentalEventStream(userRef.current.id);
        if (rentalEventSyncPendingRef.current) scheduleRentalEventSync();
      }
    };
    const handleOnline = () => {
      if (userRef.current && !userRef.current.mustChangePassword) {
        rentalEventsDisabledRef.current = false;
        syncRentalEventStream(userRef.current.id);
        scheduleRentalEventSync();
      }
    };
    const handlePopState = () => {
      const nextPage = pageForPath(location.pathname);
      const sameReport = pageRef.current === "Reports" && nextPage === "Reports";
      pageRef.current = nextPage;
      setPage(nextPage);
      if (nextPage === "Reports") {
        const sec = reportSectionForPath(location.pathname);
        c.workspaceUI.setReportSection(sec);
        setReportSection(sec);
      }
      if (workspacePages.has(nextPage) && !sameReport) {
        c.workspaceUI.invalidate();
      }
      if (userRef.current) {
        triggerRender();
        requestAnimationFrame(() => {
          document.querySelector("#workspace-content")?.focus({ preventScroll: true });
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("popstate", handlePopState);
    const focusGuardSelector = "#rental-search:focus,#module-search:focus,.admin-form input:focus,.admin-form textarea:focus,.admin-form select:focus,#profile-form input:focus,.analytics-filters input:focus,.analytics-filters select:focus,#analytics-sort:focus,.sidebar.open,#profile-dropdown:not([hidden]),#notification-dropdown:not([hidden])";
    const liveRentalTimer = setInterval(() => {
      if (!userRef.current || !liveRentalPages.has(pageRef.current) || modal?.open || document.visibilityState !== "visible") {
        return;
      }
      if (document.querySelector(focusGuardSelector)) return;
      const scrollTop = document.querySelector(".content")?.scrollTop || 0;
      triggerRender();
      requestAnimationFrame(() => {
        const content = document.querySelector(".content");
        if (content) content.scrollTop = scrollTop;
      });
    }, 6e4);
    const terminalTimer = setInterval(async () => {
      if (c.confirmation.isOpen() || logoutPendingRef.current) return;
      if (!userRef.current || userRef.current.mustChangePassword || pageRef.current !== "ESP32 terminal" || modal?.open || document.visibilityState !== "visible" || !c.apiClient.canRefresh()) {
        return;
      }
      if (document.querySelector(
        "#module-search:focus,.admin-form input:focus,.admin-form textarea:focus,.admin-form select:focus,.sidebar.open,#profile-dropdown:not([hidden]),#notification-dropdown:not([hidden])"
      )) {
        return;
      }
      try {
        await c.workspaceUI.refresh();
        if (userRef.current && pageRef.current === "ESP32 terminal" && !modal?.open) {
          triggerRender();
        }
      } catch {
      }
    }, 8e3);
    const autoRefreshTimer = setInterval(async () => {
      if (c.confirmation.isOpen() || logoutPendingRef.current) return;
      if (!userRef.current || userRef.current.mustChangePassword || !c.apiClient.canRefresh() || !c.workspaceUI.autoRefreshEnabled() || pageRef.current === "Settings" || liveRentalPages.has(pageRef.current) || document.visibilityState !== "visible") {
        return;
      }
      if (pageRef.current !== "Inventory" && modal?.open) {
        await c.workspaceUI.refreshPendingHandoff();
        return;
      }
      if (document.querySelector(focusGuardSelector)) return;
      try {
        await refresh();
        const refreshedPage = pageRef.current;
        if (userRef.current && workspacePages.has(refreshedPage) && refreshedPage !== "Settings" && await c.workspaceUI.refresh() && pageRef.current === refreshedPage && userRef.current && !modal?.open) {
          triggerRender();
        }
      } catch (problem) {
        if (userRef.current && workspacePages.has(pageRef.current) && !modal?.open) {
          triggerRender();
        }
        if (problem.status !== 401) toast(problem.message);
      }
    }, 12e4);
    return () => {
      modal?.removeEventListener("close", handleModalClose);
      modal?.removeEventListener("click", handleModalClick);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("popstate", handlePopState);
      clearInterval(liveRentalTimer);
      clearInterval(terminalTimer);
      clearInterval(autoRefreshTimer);
    };
  }, [
    refresh,
    scheduleRentalEventSync,
    setPasswordResetCountdown,
    syncRentalEventStream,
    toast,
    triggerRender
  ]);
  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        localStorage.removeItem("rent-play-demo");
        sessionStorage.removeItem("rent-play-demo");
      } catch {
      }
      try {
        const result = await api("/auth/me");
        if (!active) return;
        userRef.current = result.user;
        setUser(result.user);
        setBooting(false);
        await refresh();
      } catch (error) {
        if (!active) return;
        if (error.status !== 401) {
          setLoginError(cleanErrorMessage(error.message));
          setBooting(false);
        } else {
          setLoginError("");
          setBooting(false);
          try {
            const health = await api("/health");
            if (health.database === false) {
              setLoginError(health.warning || "The database is temporarily unavailable.");
            }
          } catch (healthError) {
            setLoginError(cleanErrorMessage(healthError.message));
          }
        }
      }
    }
    boot();
    return () => {
      active = false;
    };
  }, [api, refresh]);
  const handleLoginSuccess = async (loggedInUser, rememberChecked) => {
    const c = controllersRef.current;
    setRememberSession(rememberChecked);
    userRef.current = loggedInUser;
    setUser(loggedInUser);
    const targetPage = pageForPath(location.pathname);
    pageRef.current = targetPage;
    setPage(targetPage);
    if (targetPage === "Reports") {
      const sec = reportSectionForPath(location.pathname);
      c.workspaceUI.setReportSection(sec);
      setReportSection(sec);
    }
    history.replaceState(
      { page: targetPage },
      "",
      targetPage === "Reports" ? reportPathForSection(c.workspaceUI.reportSection()) : pageRoutes[targetPage]
    );
    await refresh();
  };
  const handleManualRefresh = async () => {
    if (manualRefreshPending) return;
    setManualRefreshPending(true);
    const refreshedPage = pageRef.current;
    const c = controllersRef.current;
    try {
      await refresh({ force: true });
      if (userRef.current && workspacePages.has(refreshedPage)) {
        await c.workspaceUI.refresh();
      }
      if (userRef.current && pageRef.current === refreshedPage && !c.modal?.open) {
        triggerRender();
      }
    } catch (problem) {
      if (userRef.current && pageRef.current === refreshedPage && !c.modal?.open) {
        triggerRender();
      }
      toast(problem.message);
    } finally {
      setManualRefreshPending(false);
    }
  };
  const handleLogout = async () => {
    if (logoutPendingRef.current) return;
    logoutPendingRef.current = true;
    const c = controllersRef.current;
    try {
      const confirmed = await c.confirmation.confirmAction({
        title: "Log out of Rent & Play?",
        description: "Your session will end. You will need to sign in again to access the workspace.",
        confirmLabel: "Yes, log out",
        cancelLabel: "No, stay signed in"
      });
      if (!confirmed) return;
      await api("/auth/logout", { method: "POST" });
      userRef.current = null;
      dataRef.current = null;
      setUser(null);
      setData(null);
      setConnectionError("");
      stopRentalEventStream();
      c.rentalNotifications.setAccount(null);
      c.inventoryController.reset();
      c.workspaceUI.reset();
      history.replaceState({}, "", pageRoutes.Dashboard);
      c.modal?.close();
      setLoginError("");
    } catch (error) {
      toast(error.message);
    } finally {
      logoutPendingRef.current = false;
    }
  };
  const handleToggleNavGroup = (groupId) => {
    if (sidebarCollapsed && !window.matchMedia("(max-width:720px)").matches) {
      setSidebarCollapsed(false);
      setNavGroupExpanded((prev) => {
        const next = { ...prev, [groupId]: true };
        try {
          localStorage.setItem("rent-play-nav-groups", JSON.stringify(next));
        } catch {
        }
        return next;
      });
    } else {
      setNavGroupExpanded((prev) => {
        const next = { ...prev, [groupId]: !prev[groupId] };
        try {
          localStorage.setItem("rent-play-nav-groups", JSON.stringify(next));
        } catch {
        }
        return next;
      });
    }
    requestAnimationFrame(() => {
      document.getElementById(`nav-group-toggle-${groupId}`)?.focus();
    });
  };
  if (booting) {
    return /* @__PURE__ */ React.createElement(SessionLoadingView, null);
  }
  if (!user) {
    return /* @__PURE__ */ React.createElement(
      LoginView,
      {
        initialError: loginError,
        theme,
        onToggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
        api,
        modal: controllersRef.current.modal,
        showModal: controllersRef.current.showModal,
        onLoginSuccess: handleLoginSuccess,
        setPasswordResetCountdown
      }
    );
  }
  if (user.mustChangePassword) {
    return /* @__PURE__ */ React.createElement(
      PasswordChangeView,
      {
        user,
        rememberSession,
        api,
        onPasswordUpdated: async (updatedUser) => {
          userRef.current = updatedUser;
          setUser(updatedUser);
          await refresh();
          toast("Your password has been updated.");
        },
        onSignOutAgain: (msg) => endSession(msg),
        onSignOut: () => endSession("Your session ended. Please sign in again.")
      }
    );
  }
  const notificationFingerprint = data ? [
    ...data.rentals.filter((r) => r.displayStatus === "Overdue").map((r) => `r:${r.id}:${r.due_at}`),
    ...data.pending.map((r) => `v:${r.id}:${r.requested_at}`)
  ].sort().join("|") : "";
  return /* @__PURE__ */ React.createElement(
    WorkspaceShell,
    {
      user,
      data,
      page,
      reportSection,
      connectionError,
      theme,
      onSetTheme: setTheme,
      filter,
      onFilterChange: setFilter,
      query,
      onQueryChange: setQuery,
      rentalPage,
      onRentalPageChange: setRentalPage,
      period,
      onPeriodChange: setPeriod,
      profileEditing,
      onSetProfileEditing: setProfileEditing,
      manualRefreshPending,
      onManualRefresh: handleManualRefresh,
      onNavigate: goTo,
      onLogout: handleLogout,
      onUserUpdated: (updatedUser) => {
        userRef.current = updatedUser;
        setUser(updatedUser);
      },
      navGroupExpanded,
      onToggleNavGroup: handleToggleNavGroup,
      sidebarCollapsed,
      onSetSidebarCollapsed: setSidebarCollapsed,
      rentalNotifications: controllersRef.current.rentalNotifications,
      notificationVersion,
      notificationFingerprint,
      workspaceUI: controllersRef.current.workspaceUI,
      inventoryController: controllersRef.current.inventoryController,
      showModal: controllersRef.current.showModal,
      confirmSubmit: controllersRef.current.confirmation.confirmSubmit,
      api,
      toast,
      renderTick,
      onTriggerRender: triggerRender
    }
  );
}

// src/react/index.jsx
function mountReactApp(container = document.querySelector("#app")) {
  if (!container) return null;
  const root = createRoot(container);
  root.render(/* @__PURE__ */ React.createElement(App, null));
  return root;
}
export {
  App,
  DashboardView,
  InventorySection,
  LoginView,
  PageHeading,
  PasswordChangeView,
  ProfileView,
  SessionLoadingView,
  WorkspaceModuleSection,
  WorkspaceShell,
  mountReactApp,
  navGroups,
  pageLabels,
  workspacePages
};
