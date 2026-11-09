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
import { publicErrorMessage } from "./request-errors.js";
var icons = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  repeat: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24L21 8"/><polyline points="21 3 21 8 16 8"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  radio: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  sportsBall: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20"/>',
  gamepad: '<rect width="20" height="12" x="2" y="6" rx="6"/><path d="M6 12h4m-2-2v4"/><circle cx="14.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10" r="1.3" fill="currentColor" stroke="none"/>',
  dice: '<rect width="18" height="18" x="3" y="3" rx="3"/><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="16.5" cy="7.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="7.5" cy="16.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="16.5" cy="16.5" r="1.4" fill="currentColor" stroke="none"/>',
  cards: '<rect x="3" y="5" width="12" height="16" rx="2"/><path d="M7 5V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-2"/><polygon points="9 10.5 11.5 13.5 9 16.5 6.5 13.5" fill="currentColor" stroke="none"/>',
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
  chevron: '<path d="m6 9 6 6 6-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m11.5 11.5 8.5-8.5M16 7l3 3M18 5l2 2"/>',
  copy: '<rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  store: '<path d="m2 7 4-5h12l4 5v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/><path d="M2 7h20"/><path d="M10 21v-7h4v7"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>'
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
var categoryIconName = (category) => {
  const cat = String(category || "").toLowerCase();
  if (/card/i.test(cat)) return "cards";
  if (/board|puzzle/i.test(cat)) return "dice";
  if (/sport|ball|outdoor|fitness/i.test(cat)) return "sportsBall";
  if (/tech|consol|game|electron|device|gadget/i.test(cat)) return "gamepad";
  return "box";
};
var categoryThemeClass = (category) => {
  const cat = String(category || "").toLowerCase();
  if (/card/i.test(cat)) return "cat-cards";
  if (/board|puzzle/i.test(cat)) return "cat-board";
  if (/sport|ball|outdoor|fitness/i.test(cat)) return "cat-sports";
  if (/tech|consol|game|electron|device|gadget/i.test(cat)) return "cat-tech";
  return "cat-default";
};
var symbol = (category) => `<span class="category-glyph ${categoryThemeClass(category)}" aria-hidden="true">${icon(categoryIconName(category))}</span>`;
function CategorySymbol({ category }) {
  return /* @__PURE__ */ React.createElement("span", { className: `category-glyph ${categoryThemeClass(category)}`, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: categoryIconName(category) }));
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
var cleanErrorMessage = (problem) => problem ? publicErrorMessage(problem) : "";

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
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Signing in\u2026';
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

// src/react/AnalyticsPulse.jsx
import { calculateDashboardPulse } from "./dashboard-analytics.js";
var dateLabel = (key) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(/* @__PURE__ */ new Date(`${key}T00:00:00Z`));
function AnalyticsPulse({ data, onNavigate }) {
  const p = calculateDashboardPulse(data, new Date(data.refreshedAt || Date.now()));
  const overdue = Number(data.stats?.overdue || 0);
  const pending = data.pending?.length || 0;
  const reviewPage = overdue ? "Rentals" : pending ? "ESP32 terminal" : p.utilization >= 60 ? "Returns" : "Reports";
  const action = overdue ? `Follow up on ${overdue} overdue return${overdue === 1 ? "" : "s"}.` : pending ? `Review ${pending} pending terminal handover${pending === 1 ? "" : "s"}.` : p.utilization >= 60 ? "Review incoming returns before the next handover." : "No overdue rentals or pending terminal handovers.";
  const peak = Math.max(1, ...p.recent.map((row) => row.fees), p.forecast || 0);
  const top = Math.ceil(peak / 10 ** Math.floor(Math.log10(peak))) * 10 ** Math.floor(Math.log10(peak));
  const x = (index) => 55 + index * 455 / Math.max(7, p.recent.length);
  const y = (value) => 155 - value / top * 125;
  const points = p.recent.map((row, index) => `${x(index)},${y(row.fees)}`).join(" ");
  const last = p.recent.at(-1);
  const share = (value) => p.channelTotal ? value / p.channelTotal * 100 : 0;
  return /* @__PURE__ */ React.createElement("section", { className: "panel analytics-pulse-panel", "aria-label": "Operations and fleet analytics" }, /* @__PURE__ */ React.createElement("div", { className: "panel-title" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, /* @__PURE__ */ React.createElement(Icon, { name: "chart" }), " Analytics pulse"), /* @__PURE__ */ React.createElement("p", null, "Recent rental activity and your next operational step")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "text-button", onClick: () => onNavigate("Reports") }, "Full analytics ", /* @__PURE__ */ React.createElement(Icon, { name: "arrow" }))), data.demo_data?.active ? /* @__PURE__ */ React.createElement("aside", { className: "pulse-demo-note" }, /* @__PURE__ */ React.createElement("strong", null, "Presentation demo data"), /* @__PURE__ */ React.createElement("span", null, data.demo_data.status === "ready" ? `${data.demo_data.record_count} simulated historical rentals included. Forecast accuracy here describes demo data.` : "Demo history is being prepared.")) : null, /* @__PURE__ */ React.createElement("div", { className: "pulse-overview" }, /* @__PURE__ */ React.createElement("div", { className: "pulse-outlook" }, /* @__PURE__ */ React.createElement("div", { className: "pulse-outlook-heading" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "pulse-caption" }, "Next-day rental fees"), /* @__PURE__ */ React.createElement("strong", null, p.forecast == null ? "\u2014" : money(p.forecast))), /* @__PURE__ */ React.createElement("span", { className: "pulse-model-badge" }, "SES \xB7 \u03B1 0.35")), /* @__PURE__ */ React.createElement("p", { className: "pulse-estimate-note" }, p.forecast == null ? "Building a usable history" : `${dateLabel(p.forecastDate)} \xB7 preliminary estimate`), p.recent.length ? /* @__PURE__ */ React.createElement("figure", { className: "pulse-history-chart" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 560 200", role: "img", "aria-labelledby": "pulse-history-title" }, /* @__PURE__ */ React.createElement("title", { id: "pulse-history-title" }, "Recorded daily rental fees for the last ", p.recent.length, " complete days", p.forecast == null ? "" : ` and next-day SES estimate ${money(p.forecast)}`, ". Today is excluded."), [0, 0.5, 1].map((fraction) => /* @__PURE__ */ React.createElement("g", { key: fraction }, /* @__PURE__ */ React.createElement("line", { x1: "55", x2: "525", y1: y(top * fraction), y2: y(top * fraction), className: "pulse-grid-line" }), /* @__PURE__ */ React.createElement("text", { x: "45", y: y(top * fraction) + 4, textAnchor: "end" }, new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 }).format(top * fraction)))), /* @__PURE__ */ React.createElement("polygon", { points: `${x(0)},155 ${points} ${x(p.recent.length - 1)},155`, className: "pulse-history-area" }), /* @__PURE__ */ React.createElement("polyline", { points, className: "pulse-history-line" }), p.recent.map((row, index) => /* @__PURE__ */ React.createElement("circle", { key: row.date, cx: x(index), cy: y(row.fees), r: "3", className: "pulse-history-point", tabIndex: "0" }, /* @__PURE__ */ React.createElement("title", null, dateLabel(row.date), ": ", money(row.fees), " \xB7 ", row.rentals, " confirmed rentals"))), p.forecast != null && last ? /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("line", { x1: x(p.recent.length - 1), y1: y(last.fees), x2: "510", y2: y(p.forecast), className: "pulse-estimate-line" }), /* @__PURE__ */ React.createElement("circle", { cx: "510", cy: y(p.forecast), r: "4", className: "pulse-estimate-point", tabIndex: "0" }, /* @__PURE__ */ React.createElement("title", null, dateLabel(p.forecastDate), " estimate: ", money(p.forecast))), /* @__PURE__ */ React.createElement("text", { x: "525", y: "180", textAnchor: "end" }, dateLabel(p.forecastDate), " est.")) : null, /* @__PURE__ */ React.createElement("text", { x: "55", y: "180" }, dateLabel(p.recent[0].date)), /* @__PURE__ */ React.createElement("text", { className: "pulse-last-complete-label", x: x(p.recent.length - 1), y: "180", textAnchor: "end" }, dateLabel(last.date))), /* @__PURE__ */ React.createElement("figcaption", null, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", null), " Recorded fees"), p.forecast != null ? /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "is-estimate" }), " Next-day estimate") : null, /* @__PURE__ */ React.createElement("span", null, "PHP \xB7 complete days only"))) : /* @__PURE__ */ React.createElement("div", { className: "pulse-no-history" }, /* @__PURE__ */ React.createElement(Icon, { name: "chart" }), /* @__PURE__ */ React.createElement("strong", null, "No completed activity history yet"), /* @__PURE__ */ React.createElement("span", null, "Recorded rental fees will appear here.")), /* @__PURE__ */ React.createElement("p", { className: "pulse-history-footnote" }, p.forecast == null ? p.reason : `${p.trainingDays} complete days \xB7 ${p.rentalSamples} rentals used \xB7 accuracy not yet validated`)), /* @__PURE__ */ React.createElement("div", { className: "pulse-operations" }, /* @__PURE__ */ React.createElement("div", { className: "pulse-live-heading" }, /* @__PURE__ */ React.createElement("span", { className: "pulse-caption" }, "Live operations"), /* @__PURE__ */ React.createElement("span", null, "Current snapshot")), /* @__PURE__ */ React.createElement("div", { className: "pulse-live-grid" }, /* @__PURE__ */ React.createElement("div", { className: "pulse-fleet-card" }, /* @__PURE__ */ React.createElement("h4", null, "Fleet in use"), /* @__PURE__ */ React.createElement("div", { className: "pulse-fleet-body" }, /* @__PURE__ */ React.createElement("div", { className: "pulse-fleet-donut" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 88 88", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "44", cy: "44", r: "35" }), /* @__PURE__ */ React.createElement("circle", { cx: "44", cy: "44", r: "35", className: "pulse-fleet-arc", strokeDasharray: `${p.utilization * 2.1991} 219.91`, transform: "rotate(-90 44 44)" })), /* @__PURE__ */ React.createElement("strong", null, Math.round(p.utilization), "%")), /* @__PURE__ */ React.createElement("p", null, /* @__PURE__ */ React.createElement("strong", null, p.rented, /* @__PURE__ */ React.createElement("small", null, " / ", p.totalUnits)), /* @__PURE__ */ React.createElement("span", null, "units rented now"))), /* @__PURE__ */ React.createElement("small", null, "All active units, including maintenance and reservations.")), /* @__PURE__ */ React.createElement("div", { className: "pulse-channels-card" }, /* @__PURE__ */ React.createElement("h4", null, "Active rental channels"), /* @__PURE__ */ React.createElement("strong", { className: "pulse-channel-total" }, p.channelTotal, /* @__PURE__ */ React.createElement("small", null, " ", p.channelTotal === 1 ? "rental" : "rentals", " in progress")), /* @__PURE__ */ React.createElement("div", { className: "pulse-channel-bar", role: "img", "aria-label": `${p.resort} resort delivery, ${p.counter} shop counter, ${p.unknown} unspecified` }, /* @__PURE__ */ React.createElement("span", { className: "pulse-channel-resort", style: { width: `${share(p.resort)}%` } }), /* @__PURE__ */ React.createElement("span", { className: "pulse-channel-counter", style: { width: `${share(p.counter)}%` } }), /* @__PURE__ */ React.createElement("span", { className: "pulse-channel-unknown", style: { width: `${share(p.unknown)}%` } })), /* @__PURE__ */ React.createElement("dl", null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, /* @__PURE__ */ React.createElement("i", { className: "pulse-dot resort" }), "Resort delivery"), /* @__PURE__ */ React.createElement("dd", null, p.resort)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, /* @__PURE__ */ React.createElement("i", { className: "pulse-dot counter" }), "Shop counter"), /* @__PURE__ */ React.createElement("dd", null, p.counter)), p.unknown > 0 ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Unspecified"), /* @__PURE__ */ React.createElement("dd", null, p.unknown)) : null))), /* @__PURE__ */ React.createElement("div", { className: `pulse-action-strip ${overdue ? "has-alert" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "pulse-action-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: overdue ? "clock" : "arrow" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "pulse-caption" }, overdue || pending ? "Needs attention" : p.utilization >= 60 ? "Capacity review" : "Current status"), /* @__PURE__ */ React.createElement("strong", null, action)), /* @__PURE__ */ React.createElement("button", { type: "button", className: "secondary", onClick: () => onNavigate(reviewPage, false, overdue ? "Overdue" : "All rentals") }, overdue || pending ? "Review" : "Explore", " ", /* @__PURE__ */ React.createElement(Icon, { name: "arrow" }))))));
}

// src/react/DashboardView.jsx
var prefersReducedMotion = () => {
  try {
    return typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
};
var useClientLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
function CountUp({ value, format = (v) => String(Math.round(v)), duration = 900 }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const shownRef = useRef(0);
  useClientLayoutEffect(() => {
    const from = shownRef.current;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
    if (from === target || !raf || prefersReducedMotion()) {
      shownRef.current = target;
      setDisplay(target);
      return void 0;
    }
    const startedAt = performance.now();
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const next = progress >= 1 ? target : Math.round(from + (target - from) * eased);
      shownRef.current = next;
      setDisplay(next);
      if (progress < 1) frame = raf(tick);
    };
    setDisplay(from);
    frame = raf(tick);
    return () => {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    };
  }, [target, duration]);
  return /* @__PURE__ */ React.createElement("span", { className: "count-up" }, format(display));
}
var DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
var manilaWeekdayIndex = () => (new Date(Date.now() + 8 * 36e5).getUTCDay() + 6) % 7;
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
    /* @__PURE__ */ React.createElement("strong", null, /* @__PURE__ */ React.createElement(CountUp, { value }), color === "red" && Number(value) > 0 ? /* @__PURE__ */ React.createElement("span", { className: "stat-pulse", "aria-hidden": "true" }) : null),
    /* @__PURE__ */ React.createElement("small", null, note)
  );
}
function getDueInfo(r) {
  if (["APPROVED", "PENDING_ADMIN_APPROVAL"].includes(r.status)) {
    return { badge: "Starts at handoff", isOverdue: false, isDueSoon: false };
  }
  if (!r.due_at) return { badge: "Philippine time", isOverdue: false, isDueSoon: false };
  const due = new Date(r.due_at).getTime();
  const now = Date.now();
  if (isNaN(due)) return { badge: "Philippine time", isOverdue: false, isDueSoon: false };
  const diffMs = due - now;
  if (diffMs < 0) {
    const minutes = Math.max(1, Math.floor(-diffMs / 6e4));
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return {
      badge: `Overdue by ${hours ? `${hours}h ` : ""}${mins ? `${mins}m` : ""}`.trim(),
      isOverdue: true,
      isDueSoon: false
    };
  }
  if (diffMs <= 2 * 36e5) {
    const mins = Math.max(1, Math.floor(diffMs / 6e4));
    return {
      badge: `Due in ${mins}m`,
      isOverdue: false,
      isDueSoon: true
    };
  }
  return { badge: "Philippine time", isOverdue: false, isDueSoon: false };
}
function TerminalPendingBanner({ data, workspaceUI, onNavigate }) {
  if (!data) return null;
  const pendingList = Array.isArray(data.pending) ? data.pending : [];
  const primaryTerminal = Array.isArray(data.terminals) ? data.terminals[0] : null;
  const terminalQueue = primaryTerminal ? pendingList.filter((p) => p.terminal_code === primaryTerminal.terminal_code) : [];
  const activeQueue = terminalQueue.length > 0 ? terminalQueue : pendingList;
  const firstPending = activeQueue[0];
  if (!activeQueue.length || !firstPending) return null;
  return /* @__PURE__ */ React.createElement("aside", { className: "terminal-live-action-banner", role: "alert" }, /* @__PURE__ */ React.createElement("div", { className: "terminal-banner-pulse", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { className: "pulse-ring" }), /* @__PURE__ */ React.createElement(Icon, { name: "chip" })), /* @__PURE__ */ React.createElement("div", { className: "terminal-banner-body" }, /* @__PURE__ */ React.createElement("div", { className: "terminal-banner-badge-row" }, /* @__PURE__ */ React.createElement("span", { className: "terminal-banner-badge" }, "Terminal confirmation needed"), /* @__PURE__ */ React.createElement("span", { className: "terminal-queue-count" }, activeQueue.length, " pending")), /* @__PURE__ */ React.createElement("strong", null, firstPending.item_name || "Equipment", " \xB7 ", firstPending.customer || "Customer"), /* @__PURE__ */ React.createElement("p", null, "Code: ", /* @__PURE__ */ React.createElement("code", null, firstPending.rental_code || firstPending.verification_code || firstPending.id), " \xB7", " ", "Terminal: ", /* @__PURE__ */ React.createElement("strong", null, firstPending.terminal_code || primaryTerminal?.terminal_code || "TERM-01"), " \xB7", " ", "Review the request, then press the terminal button to confirm.")), /* @__PURE__ */ React.createElement("div", { className: "terminal-banner-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "primary btn-open-terminal-gate",
      onClick: () => {
        const openDialog = workspaceUI?.showHandoff || workspaceUI?.openHandoff;
        if (openDialog) {
          const matchedRental = Array.isArray(data.rentals) ? data.rentals.find((r) => String(r.id) === String(firstPending.rental_id)) : void 0;
          openDialog(firstPending, matchedRental);
        } else {
          onNavigate?.("ESP32 terminal");
        }
      }
    },
    "Review request \u2192"
  )));
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
  showModal,
  workspaceUI,
  api,
  toast
}) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [hoverDay, setHoverDay] = useState(null);
  const chartRef = useRef(null);
  const [testingTerminal, setTestingTerminal] = useState(false);
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
    const enrichedRental = {
      ...r,
      customer_name: r.customer_name || r.customer
    };
    if (workspaceUI?.openTransaction) {
      workspaceUI.openTransaction(id, { rentalCode: r.rental_code, rental: enrichedRental });
      return;
    }
    const dueInfo = getDueInfo(r);
    const overdueLabel = dueInfo.isOverdue ? `Overdue by ${Math.max(1, Math.ceil((Date.now() - new Date(r.due_at).getTime()) / 36e5))}h` : "";
    showModal(
      "Rental details",
      `<div class="transaction-record-modal">
        <div class="transaction-detail-overview">
          <div class="transaction-detail-head">
            <div>
              <span class="eyebrow">${escape(r.rental_code || "RENTAL")}</span>
              <h3>${escape(r.item_name || "Equipment")}</h3>
              <p>Assigned unit &middot; ${escape(r.item_code || "Standard unit")}</p>
            </div>
            ${badge(r.displayStatus)}
          </div>
          <div class="transaction-detail-grid">
            <div>
              <small>Customer</small>
              <strong>${escape(r.customer || "Unknown customer")}</strong>
            </div>
            <div>
              <small>Due time</small>
              <strong>${escape(formatDate(r.due_at))}${overdueLabel ? `<small class="due-overdue-alert" style="display:block;margin-top:2px">${escape(overdueLabel)}</small>` : ""}</strong>
            </div>
          </div>
        </div>
        <div class="transaction-detail-scroll">
          <section class="record-section record-fees">
            <h3>Rental overview</h3>
            <dl class="record-fields">
              <div><dt>Rental fee</dt><dd><strong>${money(r.rental_fee)}</strong></dd></div>
              <div><dt>Rental confirmed</dt><dd>${escape(formatDate(r.confirmed_rental_at))}</dd></div>
              <div><dt>Fulfillment</dt><dd>${escape(r.delivery_location || (r.fulfillment_mode === "DELIVERY" ? "Resort delivery" : "Store pickup counter"))}</dd></div>
              <div><dt>Status</dt><dd>${escape(r.displayStatus || r.status || "Active")}</dd></div>
            </dl>
          </section>
          <div class="info-box" style="margin-top:16px">Use Returns to record physical receipt and inspect the unit. Physical receipt stops the timer; completing inspection updates availability or maintenance.</div>
        </div>
        <footer class="transaction-detail-footer">
          <div class="transaction-footer-copy">
            <strong>${["ACTIVE", "RETURN_PENDING_INSPECTION"].includes(r.status) || r.displayStatus === "Overdue" ? "Receive returned equipment" : "Rental record"}</strong>
            <small>Physical receipt stops the rental clock.</small>
          </div>
          <div class="form-actions">
            <button type="button" class="secondary" data-dashboard-nav-rentals>View in transactions</button>
            <button type="button" class="primary" data-dashboard-return-action>Receive equipment</button>
          </div>
        </footer>
      </div>`
    );
    const modalEl = document.querySelector("dialog[open]");
    if (modalEl) {
      modalEl.querySelector("[data-dashboard-nav-rentals]")?.addEventListener("click", () => {
        modalEl.close?.();
        onNavigate("Rentals");
      });
      modalEl.querySelector("[data-dashboard-return-action]")?.addEventListener("click", () => {
        modalEl.close?.();
        if (workspaceUI?.openQuickReturn) {
          workspaceUI.openQuickReturn();
        } else {
          onNavigate("Returns");
        }
      });
    }
  };
  const openWorkflowModal = () => {
    showModal(
      "How rentals work",
      "<p><strong>Store pickup.</strong> Create the rental, scan the assigned unit, and review the customer, payment, agreement, and equipment checks. Confirm handover at the counter terminal to start the timer.</p><p><strong>Resort delivery.</strong> Prepare and confirm dispatch at the shop. The timer starts after staff verifies the customer ticket and confirms handover at the resort.</p><p><strong>Returns.</strong> Record physical receipt to stop the timer, then inspect the equipment and complete the return.</p>"
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
  const compareKey = period === "This week" ? "Last week" : null;
  const compare = compareKey ? data.revenue[compareKey] || [] : [];
  const sum = (list) => list.reduce((a, b) => a + (Number(b) || 0), 0);
  const total = sum(amounts);
  const compareTotal = sum(compare);
  const delta = compareKey && compareTotal > 0 ? Math.round((total - compareTotal) / compareTotal * 100) : null;
  const max = Math.max(100, ...amounts, ...compare.map((v) => Number(v) || 0));
  const scale = Math.ceil(max / 100) * 100;
  const peak = Math.max(...amounts);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayIndex = period === "This week" ? manilaWeekdayIndex() : -1;
  const average = total / (todayIndex >= 0 ? todayIndex + 1 : 7);
  const pct = (value) => Math.max(0, Math.min(100, (Number(value) || 0) / scale * 100));
  const activeDay = hoverDay ?? selectedDay;
  const peakDayLabel = peak > 0 ? `${days[amounts.indexOf(peak)]} (${money(peak)})` : "\u2014";
  const focusBar = (index) => {
    setSelectedDay(index);
    chartRef.current?.querySelector(`[data-day="${index}"]`)?.focus();
  };
  const handleBarKeyDown = (event, index) => {
    const moves = { ArrowRight: (index + 1) % 7, ArrowLeft: (index + 6) % 7, Home: 0, End: 6 };
    if (event.key === "Escape") {
      setSelectedDay(null);
      setHoverDay(null);
      return;
    }
    if (!(event.key in moves)) return;
    event.preventDefault();
    focusBar(moves[event.key]);
  };
  const handleSpotlight = (event) => {
    const card = event.target.closest?.(".stat, .command-bar-btn");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    card.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };
  const t = data.terminals[0];
  const queue = t ? data.pending.filter((p) => p.terminal_code === t.terminal_code) : [];
  const collections = data.collections || {};
  const todayTotal = Number(collections.total || 0);
  const todayCash = Number(collections.cash || 0);
  const todayQr = Number(collections.qr || 0);
  const todayRefunds = Number(collections.refunds || 0);
  const todayExpenses = Number(collections.expenses || 0);
  const todayCashNet = Number(collections.cashNetMovement ?? todayCash);
  const todayNetAfterExpenses = Number(
    collections.netAfterExpenses ?? todayTotal - todayRefunds - todayExpenses
  );
  const cashShare = todayTotal > 0 ? Math.round(todayCash / todayTotal * 100) : 0;
  const qrShare = todayTotal > 0 ? Math.max(0, 100 - cashShare) : 0;
  return /* @__PURE__ */ React.createElement("div", { className: "dashboard-workspace", onPointerMove: handleSpotlight }, /* @__PURE__ */ React.createElement("section", { className: "counter-command-bar", role: "toolbar", "aria-label": "Counter command actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "command-bar-btn primary",
      id: "cmd-new-rental",
      onClick: () => {
        if (workspaceUI?.openWalkInRental) {
          workspaceUI.openWalkInRental();
        } else {
          onNavigate("Rentals", false, "All rentals", "", "");
        }
      }
    },
    /* @__PURE__ */ React.createElement("span", { className: "btn-icon-bubble" }, /* @__PURE__ */ React.createElement(Icon, { name: "plus" })),
    /* @__PURE__ */ React.createElement("div", { className: "btn-text-wrap" }, /* @__PURE__ */ React.createElement("strong", null, "New walk-in rental"), /* @__PURE__ */ React.createElement("small", null, "Create a rental at the counter"))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "command-bar-btn",
      id: "cmd-scan-qr",
      onClick: () => {
        if (workspaceUI?.openRentalLookup) {
          workspaceUI.openRentalLookup();
        } else {
          onNavigate("Rentals");
        }
      }
    },
    /* @__PURE__ */ React.createElement("span", { className: "btn-icon-bubble" }, /* @__PURE__ */ React.createElement(Icon, { name: "search" })),
    /* @__PURE__ */ React.createElement("div", { className: "btn-text-wrap" }, /* @__PURE__ */ React.createElement("strong", null, "Find rental"), /* @__PURE__ */ React.createElement("small", null, "Scan a QR code or enter a reference"))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "command-bar-btn",
      id: "cmd-quick-return",
      onClick: () => {
        if (workspaceUI?.openQuickReturn) {
          workspaceUI.openQuickReturn();
        } else {
          onNavigate("Returns");
        }
      }
    },
    /* @__PURE__ */ React.createElement("span", { className: "btn-icon-bubble" }, /* @__PURE__ */ React.createElement(Icon, { name: "undo" })),
    /* @__PURE__ */ React.createElement("div", { className: "btn-text-wrap" }, /* @__PURE__ */ React.createElement("strong", null, "Receive return"), /* @__PURE__ */ React.createElement("small", null, "Record receipt and inspect equipment"))
  )), /* @__PURE__ */ React.createElement(TerminalPendingBanner, { data, workspaceUI, onNavigate }), /* @__PURE__ */ React.createElement("div", { className: "stats" }, /* @__PURE__ */ React.createElement(
    StatCard,
    {
      label: "Active rentals",
      value: s.active,
      note: "Currently with customers",
      glyph: "clock",
      color: "blue",
      page: "Rentals",
      onNavigate
    }
  ), /* @__PURE__ */ React.createElement(
    StatCard,
    {
      label: "Available units",
      value: s.available,
      note: "Ready to rent",
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
      note: "Scheduled to return today",
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
      label: "Overdue",
      value: s.overdue,
      note: s.overdue ? "Follow up on these returns" : "No overdue rentals",
      glyph: "clock",
      color: "red",
      page: "Dashboard",
      target: "rental-panel",
      filter: "Overdue",
      onNavigate
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "dashboard-grid" }, /* @__PURE__ */ React.createElement("section", { className: "panel rental-panel", id: "rental-panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-title" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Rental activity"), /* @__PURE__ */ React.createElement("p", null, "Open rentals and requests that need your attention.")), /* @__PURE__ */ React.createElement("div", { className: "rental-panel-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "secondary",
      id: "rental-workflow",
      onClick: openWorkflowModal
    },
    "How rentals work"
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
  ))), /* @__PURE__ */ React.createElement("div", { className: "table-scroll" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "EQUIPMENT"), /* @__PURE__ */ React.createElement("th", null, "CUSTOMER"), /* @__PURE__ */ React.createElement("th", null, "DUE DATE"), /* @__PURE__ */ React.createElement("th", null, "STATUS"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, rows.length > 0 ? rows.map((r) => {
    const itemCategory = data.items.find((i) => String(i.id) === String(r.item_id))?.category || "";
    const label = r.rental_code || r.item_name;
    const dueInfo = getDueInfo(r);
    const isResort = r.fulfillment_mode === "DELIVERY" || Boolean(r.delivery_location);
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
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "customer-cell-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "mini-avatar" }, initials(r.customer)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", null, r.customer), isResort ? /* @__PURE__ */ React.createElement("small", { className: "fulfillment-tag resort", title: r.delivery_location || "Resort delivery" }, r.delivery_location ? r.delivery_location.split(",")[0].trim() : "Resort delivery") : /* @__PURE__ */ React.createElement("small", { className: "fulfillment-tag shop", title: "Shop counter handover" }, "Store pickup")))),
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, formatDate(r.due_at)), /* @__PURE__ */ React.createElement("small", { className: dueInfo.isOverdue ? "due-overdue-alert" : dueInfo.isDueSoon ? "due-soon-alert" : "" }, dueInfo.badge)),
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
  }) : /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "empty" }, "No open rentals match this view."))))), /* @__PURE__ */ React.createElement("div", { className: "table-footer" }, /* @__PURE__ */ React.createElement("span", null, allRows.length ? `${start + 1}\u2013${Math.min(start + pageSize, allRows.length)} of ${allRows.length}` : "0 rentals", " ", "\xB7 Page ", allRows.length ? clampedPage + 1 : 0, " of", " ", Math.ceil(allRows.length / pageSize)), pageCount > 1 && /* @__PURE__ */ React.createElement("div", { className: "inv-pagination" }, /* @__PURE__ */ React.createElement(
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
  )))), /* @__PURE__ */ React.createElement("section", { className: "panel terminal-panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-title" }, /* @__PURE__ */ React.createElement("h3", null, /* @__PURE__ */ React.createElement(Icon, { name: "chip" }), " ESP32 terminal")), /* @__PURE__ */ React.createElement("div", { className: "dashboard-terminal-status", "data-online": Boolean(t?.online) }, /* @__PURE__ */ React.createElement("span", { className: "dashboard-status-dot", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, t ? t.online ? "Connected" : "Offline" : "Not configured"), /* @__PURE__ */ React.createElement("span", null, t ? `${t.name || "Counter terminal"} \xB7 ${t.terminal_code}` : "Set up a terminal to confirm counter handovers."))), /* @__PURE__ */ React.createElement("div", { className: "terminal-meta" }, /* @__PURE__ */ React.createElement("span", null, "Awaiting confirmation"), /* @__PURE__ */ React.createElement("strong", null, queue.length)), /* @__PURE__ */ React.createElement("p", { className: "terminal-note" }, "Confirm counter handovers, delivery dispatches, and completed inspections."), /* @__PURE__ */ React.createElement("div", { className: "dashboard-terminal-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "secondary", id: "cmd-ping-terminal", disabled: !t || !api || testingTerminal, onClick: async () => {
    setTestingTerminal(true);
    try {
      await api("/terminals/test-ping", { method: "POST", body: JSON.stringify({ terminalCode: t.terminal_code }) });
      toast?.("Test sent. Check the terminal for a response.");
    } catch (err) {
      toast?.(err.message || "The terminal test could not be sent.");
    } finally {
      setTestingTerminal(false);
    }
  } }, testingTerminal ? "Sending test\u2026" : "Test terminal")), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "secondary wide",
      "data-page": "ESP32 terminal",
      onClick: () => onNavigate("ESP32 terminal")
    },
    "Open terminal ",
    /* @__PURE__ */ React.createElement(Icon, { name: "arrow" })
  )), /* @__PURE__ */ React.createElement("section", { className: "panel revenue-panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-title" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Rental fees"), /* @__PURE__ */ React.createElement("p", null, "Recorded charges by confirmation date. Not cash collected.")), /* @__PURE__ */ React.createElement("div", { className: "revenue-actions" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      id: "period",
      "aria-label": "Revenue period",
      value: period,
      onChange: (e) => {
        setSelectedDay(null);
        onPeriodChange(e.target.value);
      }
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
    "View analytics \u2192"
  ))), /* @__PURE__ */ React.createElement("div", { className: "revenue-total" }, /* @__PURE__ */ React.createElement(CountUp, { value: total, format: money }), /* @__PURE__ */ React.createElement("span", null, "Recorded rental charges"), delta !== null ? /* @__PURE__ */ React.createElement("em", { className: `revenue-delta ${delta >= 0 ? "up" : "down"}` }, delta >= 0 ? "\u25B2" : "\u25BC", " ", Math.abs(delta), "% vs last full week \xB7 this week is partial") : null, /* @__PURE__ */ React.createElement("div", { className: "revenue-summary-pills" }, /* @__PURE__ */ React.createElement("span", { className: "revenue-pill", title: todayIndex >= 0 ? "Average over calendar days so far, including partial today." : "Average over the full seven-day week." }, /* @__PURE__ */ React.createElement("small", null, "Daily avg"), /* @__PURE__ */ React.createElement("strong", null, money(Math.round(average)))), /* @__PURE__ */ React.createElement("span", { className: "revenue-pill" }, /* @__PURE__ */ React.createElement("small", null, "Peak day"), /* @__PURE__ */ React.createElement("strong", null, peakDayLabel)))), /* @__PURE__ */ React.createElement("div", { className: "chart-legend", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "swatch current" }), period), compareKey ? /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "swatch previous" }), compareKey) : null, average > 0 ? /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "swatch average" }), "Daily average") : null), /* @__PURE__ */ React.createElement("div", { className: "chart", ref: chartRef, onMouseLeave: () => setHoverDay(null) }, /* @__PURE__ */ React.createElement("div", { className: "axis" }, [1, 0.75, 0.5, 0.25, 0].map((x) => /* @__PURE__ */ React.createElement("span", { key: x }, money(scale * x)))), /* @__PURE__ */ React.createElement("div", { className: "bars", role: "group", "aria-label": "Rental fees by day. Use the arrow keys to move between days." }, /* @__PURE__ */ React.createElement("div", { className: "chart-gridlines", "aria-hidden": "true" }, [0, 0.25, 0.5, 0.75, 1].map((x) => /* @__PURE__ */ React.createElement("span", { key: x, style: { bottom: `${x * 100}%` } }))), average > 0 ? /* @__PURE__ */ React.createElement("div", { className: "chart-avg-line", style: { bottom: `${pct(average)}%` }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", null, "Avg ", money(Math.round(average)))) : null, amounts.map((amount, i) => {
    const columnClass = [
      "bar-column",
      i === 0 ? "is-first" : "",
      i === 6 ? "is-last" : "",
      i === todayIndex ? "is-today" : "",
      todayIndex >= 0 && i > todayIndex ? "is-future" : "",
      activeDay === i ? "is-active" : ""
    ].filter(Boolean).join(" ");
    return /* @__PURE__ */ React.createElement("div", { className: columnClass, key: days[i], style: { "--i": i } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: `bar ${amount === peak && peak > 0 ? "highlight" : ""}`,
        style: { height: "100%" },
        "data-day": i,
        "aria-label": `${days[i]}: ${money(amount)} in rental fees`,
        "aria-pressed": selectedDay === i,
        onClick: () => setSelectedDay(selectedDay === i ? null : i),
        onMouseEnter: () => setHoverDay(i),
        onFocus: () => setHoverDay(i),
        onBlur: () => setHoverDay(null),
        onKeyDown: (event) => handleBarKeyDown(event, i)
      },
      compareKey ? /* @__PURE__ */ React.createElement("span", { className: "dashboard-bar-ghost", style: { height: `${pct(compare[i])}%` } }) : null,
      /* @__PURE__ */ React.createElement("span", { className: "dashboard-bar-fill", style: { height: `${Math.max(2, pct(amount))}%` } }),
      activeDay === i ? /* @__PURE__ */ React.createElement("span", { className: "chart-tooltip", "aria-hidden": "true", style: { bottom: `calc(${Math.max(2, pct(amount))}% + 10px)` } }, /* @__PURE__ */ React.createElement("strong", null, money(amount)), /* @__PURE__ */ React.createElement("small", null, DAY_NAMES[i], i === todayIndex ? " \xB7 today" : "", compareKey ? ` \xB7 last wk ${money(Number(compare[i]) || 0)}` : "")) : null
    ), /* @__PURE__ */ React.createElement("span", null, days[i]));
  }))), /* @__PURE__ */ React.createElement("div", { className: "dashboard-chart-detail", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("div", { className: "chart-detail-inner", key: activeDay ?? "none" }, activeDay === null ? /* @__PURE__ */ React.createElement("span", null, "Hover a bar, or select one and use the arrow keys, to explore each day.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", null, DAY_NAMES[activeDay]), /* @__PURE__ */ React.createElement("strong", null, money(amounts[activeDay])), /* @__PURE__ */ React.createElement("span", null, "in recorded charges"), total > 0 ? /* @__PURE__ */ React.createElement("span", { className: "chart-detail-share" }, Math.round((Number(amounts[activeDay]) || 0) / total * 100), "% of the week") : null))), amounts.every((v) => v === 0) ? /* @__PURE__ */ React.createElement("p", { className: "chart-empty" }, "No confirmed rental fees in this period.") : null), /* @__PURE__ */ React.createElement("section", { className: "panel collections-panel", "aria-label": "Today's collections" }, /* @__PURE__ */ React.createElement("div", { className: "panel-title" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, /* @__PURE__ */ React.createElement(Icon, { name: "money" }), " Today\u2019s collections"), /* @__PURE__ */ React.createElement("p", null, "Confirmed receipts today \xB7 Philippine time"))), /* @__PURE__ */ React.createElement("div", { className: "collections-hero" }, /* @__PURE__ */ React.createElement("strong", null, /* @__PURE__ */ React.createElement(CountUp, { value: todayTotal, format: money })), /* @__PURE__ */ React.createElement("span", null, collections.entryCount ? `${collections.entryCount} ledger ${collections.entryCount === 1 ? "entry" : "entries"} today` : "No dated receipts yet today")), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "collections-split-bar",
      role: "img",
      "aria-label": `Cash ${cashShare}% (${money(todayCash)}), GCash and InstaPay QR ${qrShare}% (${money(todayQr)})`
    },
    /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "collections-split-cash",
        style: { width: `${todayTotal > 0 ? Math.max(cashShare, todayCash > 0 ? 6 : 0) : 50}%` }
      }
    ),
    /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "collections-split-qr",
        style: { width: `${todayTotal > 0 ? Math.max(qrShare, todayQr > 0 ? 6 : 0) : 50}%` }
      }
    )
  ), /* @__PURE__ */ React.createElement("dl", { className: "collections-breakdown" }, /* @__PURE__ */ React.createElement("div", { className: "collections-method-row" }, /* @__PURE__ */ React.createElement("dt", null, /* @__PURE__ */ React.createElement("span", { className: "collections-dot cash", "aria-hidden": "true" }), "Cash in person"), /* @__PURE__ */ React.createElement("dd", null, money(todayCash))), /* @__PURE__ */ React.createElement("div", { className: "collections-method-row" }, /* @__PURE__ */ React.createElement("dt", null, /* @__PURE__ */ React.createElement("span", { className: "collections-dot qr", "aria-hidden": "true" }), "GCash / InstaPay QR"), /* @__PURE__ */ React.createElement("dd", null, money(todayQr))), /* @__PURE__ */ React.createElement("div", { className: "collections-method-row net" }, /* @__PURE__ */ React.createElement("dt", null, "Drawer cash movement"), /* @__PURE__ */ React.createElement("dd", null, money(todayCashNet))), todayRefunds > 0 || todayExpenses > 0 ? /* @__PURE__ */ React.createElement("div", { className: "collections-method-row subtle" }, /* @__PURE__ */ React.createElement("dt", null, "After refunds & expenses"), /* @__PURE__ */ React.createElement("dd", null, money(todayNetAfterExpenses))) : null), /* @__PURE__ */ React.createElement("div", { className: "dashboard-terminal-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "secondary",
      id: "cmd-cash-drawer",
      onClick: () => {
        if (workspaceUI?.openCashDrawer) {
          workspaceUI.openCashDrawer(todayCashNet);
        } else {
          onNavigate("Payments");
        }
      }
    },
    "Cash drawer (Z-Reading)"
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "secondary wide",
      "data-page": "Payments",
      onClick: () => onNavigate("Payments")
    },
    "Open payments ",
    /* @__PURE__ */ React.createElement(Icon, { name: "arrow" })
  )), /* @__PURE__ */ React.createElement(AnalyticsPulse, { data, onNavigate }), /* @__PURE__ */ React.createElement("section", { className: "panel category-panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-title" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, /* @__PURE__ */ React.createElement(Icon, { name: "box" }), " Equipment by category"), /* @__PURE__ */ React.createElement("p", null, "Select a category to view its inventory.")), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "text-button",
      "data-page": "Inventory",
      onClick: () => onNavigate("Inventory", false, "All rentals", "")
    },
    "View all inventory ",
    /* @__PURE__ */ React.createElement(Icon, { name: "arrow" })
  )), /* @__PURE__ */ React.createElement("div", { className: "category-grid" }, data.categories.length > 0 ? data.categories.map((c, i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: c.name || i,
      type: "button",
      className: "category-card-btn",
      "data-category": i,
      onClick: () => onNavigate("Inventory", false, "All rentals", c.name)
    },
    /* @__PURE__ */ React.createElement("span", { className: `category-symbol ${categoryThemeClass(c.name)}` }, /* @__PURE__ */ React.createElement(CategorySymbol, { category: c.name })),
    /* @__PURE__ */ React.createElement("span", { className: "category-card-text" }, /* @__PURE__ */ React.createElement("strong", null, c.name), /* @__PURE__ */ React.createElement("small", null, c.count, " items in inventory")),
    /* @__PURE__ */ React.createElement(Icon, { name: "arrow" })
  )) : /* @__PURE__ */ React.createElement("p", null, "No categories recorded.")), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "secondary wide category-panel-footer-btn",
      "data-page": "Inventory",
      onClick: () => onNavigate("Inventory", false, "All rentals", "")
    },
    "View all inventory ",
    /* @__PURE__ */ React.createElement(Icon, { name: "arrow" })
  ))));
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
  const fileInputRef = useRef(null);
  const [copiedId, setCopiedId] = useState(false);
  const [customAvatar, setCustomAvatar] = useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem(`rent_play_avatar_${user?.id || user?.email || "active"}`) || "";
    }
    return "";
  });
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
          onUserUpdated({ ...result?.user || user, avatar: customAvatar });
          onSetProfileEditing(false);
          toast?.("Profile updated successfully.");
        } catch (problem) {
          error.textContent = problem.message;
          button.disabled = false;
        }
      }
    );
  }, [profileEditing, confirmSubmit, api, onUserUpdated, onSetProfileEditing, toast, user, customAvatar]);
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast?.("Please select an image file (PNG, JPG, or WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
          setCustomAvatar(dataUrl);
          if (typeof window !== "undefined" && window.localStorage) {
            localStorage.setItem(`rent_play_avatar_${user?.id || user?.email || "active"}`, dataUrl);
          }
          onUserUpdated?.({ ...user, avatar: dataUrl });
          toast?.("Profile picture updated.");
        } catch (_) {
          toast?.("Failed to process image.");
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  const handleRemovePhoto = () => {
    setCustomAvatar("");
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem(`rent_play_avatar_${user?.id || user?.email || "active"}`);
    }
    onUserUpdated?.({ ...user, avatar: "" });
    toast?.("Profile picture removed.");
  };
  const handleCopyId = () => {
    const code = user.account_code || "USER-003";
    if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2e3);
        toast?.(`Copied Account ID: ${code}`);
      }).catch(() => {
      });
    }
  };
  const isOwner = String(user.role || "").toUpperCase() === "OWNER";
  const roleDisplay = isOwner ? "Store Owner" : "Store Operator";
  const accountCode = user.account_code || "USER-003";
  return /* @__PURE__ */ React.createElement("div", { className: "profile-wrapper" }, /* @__PURE__ */ React.createElement("section", { className: "panel profile-single-card" }, /* @__PURE__ */ React.createElement("div", { className: "profile-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "profile-avatar-container" }, /* @__PURE__ */ React.createElement("div", { className: "profile-clean-avatar" }, customAvatar ? /* @__PURE__ */ React.createElement("img", { src: customAvatar, alt: user.name, className: "profile-clean-avatar-img" }) : /* @__PURE__ */ React.createElement("span", { className: "profile-clean-avatar-txt" }, initials(user.name)), /* @__PURE__ */ React.createElement(
    "label",
    {
      className: "profile-avatar-camera-btn",
      title: "Change profile picture",
      "aria-label": "Change profile picture"
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "camera" }),
    /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "file",
        accept: "image/png,image/jpeg,image/webp",
        ref: fileInputRef,
        onChange: handlePhotoSelect,
        hidden: true
      }
    )
  )), /* @__PURE__ */ React.createElement("div", { className: "profile-header-details" }, /* @__PURE__ */ React.createElement("div", { className: "profile-header-name-row" }, /* @__PURE__ */ React.createElement("h2", null, user.name), /* @__PURE__ */ React.createElement("span", { className: "profile-role-badge" }, /* @__PURE__ */ React.createElement(Icon, { name: "shield" }), " ", roleDisplay), /* @__PURE__ */ React.createElement("span", { className: "profile-status-pill" }, /* @__PURE__ */ React.createElement("span", { className: "profile-dot-indicator" }), " Active")), /* @__PURE__ */ React.createElement("p", { className: "profile-header-email" }, user.email), /* @__PURE__ */ React.createElement("div", { className: "profile-avatar-action-row" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "profile-photo-change-btn",
      onClick: () => fileInputRef.current?.click()
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "camera" }),
    " ",
    customAvatar ? "Change photo" : "Upload photo"
  ), customAvatar ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "profile-action-sep" }, "\u2022"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "profile-photo-remove-btn",
      onClick: handleRemovePhoto
    },
    "Remove photo"
  )) : null))), /* @__PURE__ */ React.createElement("div", { className: "profile-header-action" }, !profileEditing ? /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "primary profile-action-btn",
      id: "profile-edit",
      "data-profile-edit": "true",
      type: "button",
      onClick: () => onSetProfileEditing(true)
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "edit" }),
    " Edit profile"
  ) : /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "secondary profile-action-btn",
      type: "button",
      onClick: () => onSetProfileEditing(false)
    },
    "Cancel"
  ))), /* @__PURE__ */ React.createElement("div", { className: "profile-card-divider" }), profileEditing ? /* @__PURE__ */ React.createElement("div", { className: "profile-edit-body" }, /* @__PURE__ */ React.createElement("div", { className: "profile-edit-intro" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, "EDIT PROFILE"), /* @__PURE__ */ React.createElement("h3", null, "Update your details"), /* @__PURE__ */ React.createElement("p", null, "Your name appears across rental receipts and counter records. Your email is your workspace login.")), /* @__PURE__ */ React.createElement("form", { id: "profile-form", className: "profile-form", ref: formRef }, /* @__PURE__ */ React.createElement("div", { className: "profile-form-grid" }, /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", null, "Full name ", /* @__PURE__ */ React.createElement("b", { className: "required-star" }, "*")), /* @__PURE__ */ React.createElement(
    "input",
    {
      name: "fullName",
      defaultValue: user.name,
      minLength: 2,
      maxLength: 150,
      autoComplete: "name",
      placeholder: "e.g. Juan Dela Cruz",
      required: true
    }
  )), /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", null, "Login email ", /* @__PURE__ */ React.createElement("b", { className: "required-star" }, "*")), /* @__PURE__ */ React.createElement(
    "input",
    {
      name: "email",
      type: "email",
      defaultValue: user.email,
      maxLength: 254,
      autoComplete: "email",
      placeholder: "e.g. rentandplay0@gmail.com",
      required: true
    }
  ))), /* @__PURE__ */ React.createElement("label", { className: "profile-form-role-field" }, /* @__PURE__ */ React.createElement("span", null, "Account Role"), /* @__PURE__ */ React.createElement(
    "input",
    {
      defaultValue: isOwner ? "Store Owner (OWNER)" : "Store Operator (OPERATOR)",
      disabled: true
    }
  ), /* @__PURE__ */ React.createElement("small", null, "System roles are managed separately in Settings > Staff.")), /* @__PURE__ */ React.createElement("div", { className: "profile-form-notice" }, /* @__PURE__ */ React.createElement(Icon, { name: "mail" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, "Important note on email changes"), /* @__PURE__ */ React.createElement("p", null, "If you change your login email, use your new email the next time you sign into Rent & Play."))), /* @__PURE__ */ React.createElement("p", { className: "profile-error", role: "alert" }), /* @__PURE__ */ React.createElement("div", { className: "profile-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "secondary",
      id: "profile-cancel",
      type: "button",
      onClick: () => onSetProfileEditing(false)
    },
    "Cancel"
  ), /* @__PURE__ */ React.createElement("button", { className: "primary", type: "submit" }, /* @__PURE__ */ React.createElement(Icon, { name: "check" }), " Save changes")))) : /* @__PURE__ */ React.createElement("div", { className: "profile-grid-details" }, /* @__PURE__ */ React.createElement("div", { className: "profile-grid-cell" }, /* @__PURE__ */ React.createElement("div", { className: "profile-cell-header" }, /* @__PURE__ */ React.createElement("span", { className: "profile-cell-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: "users" })), /* @__PURE__ */ React.createElement("span", { className: "profile-cell-label" }, "Full Name")), /* @__PURE__ */ React.createElement("div", { className: "profile-cell-value" }, /* @__PURE__ */ React.createElement("strong", null, user.name))), /* @__PURE__ */ React.createElement("div", { className: "profile-grid-cell" }, /* @__PURE__ */ React.createElement("div", { className: "profile-cell-header" }, /* @__PURE__ */ React.createElement("span", { className: "profile-cell-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: "mail" })), /* @__PURE__ */ React.createElement("span", { className: "profile-cell-label" }, "Login Email")), /* @__PURE__ */ React.createElement("div", { className: "profile-cell-value" }, /* @__PURE__ */ React.createElement("strong", null, user.email), /* @__PURE__ */ React.createElement("span", { className: "profile-verified-badge" }, /* @__PURE__ */ React.createElement(Icon, { name: "check" }), " Verified"))), /* @__PURE__ */ React.createElement("div", { className: "profile-grid-cell" }, /* @__PURE__ */ React.createElement("div", { className: "profile-cell-header" }, /* @__PURE__ */ React.createElement("span", { className: "profile-cell-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: "store" })), /* @__PURE__ */ React.createElement("span", { className: "profile-cell-label" }, "Store Branch")), /* @__PURE__ */ React.createElement("div", { className: "profile-cell-value" }, /* @__PURE__ */ React.createElement("strong", null, "Rent & Play \xB7 Lakewood, Los Ba\xF1os"))), /* @__PURE__ */ React.createElement("div", { className: "profile-grid-cell" }, /* @__PURE__ */ React.createElement("div", { className: "profile-cell-header" }, /* @__PURE__ */ React.createElement("span", { className: "profile-cell-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: "shield" })), /* @__PURE__ */ React.createElement("span", { className: "profile-cell-label" }, "Account Role")), /* @__PURE__ */ React.createElement("div", { className: "profile-cell-value" }, /* @__PURE__ */ React.createElement("strong", null, roleDisplay), /* @__PURE__ */ React.createElement("span", { className: "profile-val-hint" }, isOwner ? "Full store control, rates & reports" : "Counter rentals & returns"))), /* @__PURE__ */ React.createElement("div", { className: "profile-grid-cell profile-grid-cell-full" }, /* @__PURE__ */ React.createElement("div", { className: "profile-cell-header" }, /* @__PURE__ */ React.createElement("span", { className: "profile-cell-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: "qr" })), /* @__PURE__ */ React.createElement("span", { className: "profile-cell-label" }, "Account ID")), /* @__PURE__ */ React.createElement("div", { className: "profile-cell-value" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "profile-copy-id-chip",
      onClick: handleCopyId,
      title: "Click to copy Account ID"
    },
    /* @__PURE__ */ React.createElement("code", null, accountCode),
    /* @__PURE__ */ React.createElement("span", { className: "profile-copy-txt" }, /* @__PURE__ */ React.createElement(Icon, { name: "copy" }), " ", copiedId ? "Copied!" : "Copy")
  ))))));
}

// src/react/MessagesView.jsx
var retryKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
var when = (value) => new Date(value).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
var initials2 = (name) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
};
var DEFAULT_QUICK_REPLIES = [
  { id: "qr-1", label: "\u{1FAAA} Accepted IDs", text: "Tumatanggap po kami ng National ID, Driver's License, Passport, UMID, Postal ID, o Valid School ID (basta currently enrolled with proof of registration)." },
  { id: "qr-2", label: "\u{1F4CB} Rental Requirements", text: "Kailangan lamang po ng 1 Valid ID (Government o School ID), pirma sa rental agreement, at active contact details." },
  { id: "qr-3", label: "\u23F0 Store Hours", text: "Bukas po ang aming rental desk mula 8:00 AM hanggang 8:00 PM araw-araw para sa pickup at return." },
  { id: "qr-4", label: "\u{1F4CD} Pickup & Return", text: "Maaari ninyong i-pickup at i-return ang equipment sa aming shop desk habang operating hours." }
];
function loadStoredQuickReplies() {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("rent-play-quick-replies");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {
  }
  return DEFAULT_QUICK_REPLIES;
}
function MessagesView({ api, user }) {
  const storageKey = `rental-support-drafts:${user.id}`;
  function saved(kind) {
    try {
      return new Map(JSON.parse(sessionStorage.getItem(`${storageKey}:${kind}`) || "[]"));
    } catch {
      return /* @__PURE__ */ new Map();
    }
  }
  const [threads, setThreads] = useState([]), [active, setActive] = useState(() => {
    try {
      const id = sessionStorage.getItem("rental-support-open");
      sessionStorage.removeItem("rental-support-open");
      return id;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState(""), [search, setSearch] = useState("");
  const [next, setNext] = useState(null), [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]), [older, setOlder] = useState(null);
  const [draft, setDraft] = useState(""), [pending, setPending] = useState(null);
  const [sending, setSending] = useState(false), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [synced, setSynced] = useState(null);
  const [listError, setListError] = useState("");
  const [typing, setTyping] = useState(null);
  const [quickReplies, setQuickReplies] = useState(loadStoredQuickReplies);
  const [showQrModal, setShowQrModal] = useState(false);
  const [editingQrId, setEditingQrId] = useState(null);
  const [formLabel, setFormLabel] = useState("");
  const [formText, setFormText] = useState("");
  const [qrError, setQrError] = useState("");
  function persistQuickReplies(next2) {
    setQuickReplies(next2);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("rent-play-quick-replies", JSON.stringify(next2));
      }
    } catch {
    }
  }
  function handleStartAddQr() {
    setEditingQrId("NEW");
    setFormLabel("");
    setFormText("");
    setQrError("");
  }
  function handleStartEditQr(qr) {
    setEditingQrId(qr.id || qr.label);
    setFormLabel(qr.label);
    setFormText(qr.text);
    setQrError("");
  }
  function handleCancelEditQr() {
    setEditingQrId(null);
    setQrError("");
  }
  function handleSaveQr(e) {
    e.preventDefault();
    const label = formLabel.trim();
    const text = formText.trim();
    if (!label) {
      setQrError("Please enter a label for this quick reply.");
      return;
    }
    if (!text) {
      setQrError("Please enter the quick reply message.");
      return;
    }
    if (editingQrId === "NEW") {
      const newQr = { id: "qr-" + Date.now(), label, text };
      persistQuickReplies([...quickReplies, newQr]);
    } else {
      persistQuickReplies(quickReplies.map((qr) => (qr.id || qr.label) === editingQrId ? { ...qr, label, text } : qr));
    }
    setEditingQrId(null);
    setQrError("");
  }
  function handleDeleteQr(targetId) {
    persistQuickReplies(quickReplies.filter((qr) => (qr.id || qr.label) !== targetId));
  }
  function handleResetQuickReplies() {
    persistQuickReplies(DEFAULT_QUICK_REPLIES);
    setEditingQrId(null);
    setQrError("");
  }
  useEffect(() => {
    if (!showQrModal) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowQrModal(false);
        setEditingQrId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showQrModal]);
  const listVersion = useRef(0), statusRef = useRef(status), retryConversation = useRef(() => {
  });
  statusRef.current = status;
  const generation = useRef(0), sequence = useRef(0), busy = useRef(false), listBusy = useRef(false), bottom = useRef(null);
  const drafts = useRef(saved("drafts")), failures = useRef(saved("pending"));
  const atBottom = useRef(true), hasOlderThreads = useRef(false);
  const typingTimer = useRef(0);
  function persist() {
    try {
      sessionStorage.setItem(`${storageKey}:drafts`, JSON.stringify([...drafts.current]));
      sessionStorage.setItem(`${storageKey}:pending`, JSON.stringify([...failures.current]));
    } catch {
    }
  }
  const currentId = useRef(active);
  currentId.current = active;
  const apiRef = useRef(api);
  apiRef.current = api;
  const request = (path, method, body) => apiRef.current(path, method ? { method, body: JSON.stringify(body) } : {});
  useEffect(() => {
    const open = (event) => setActive(event.detail);
    window.addEventListener("rental-support-open", open);
    return () => window.removeEventListener("rental-support-open", open);
  }, []);
  async function loadThreads(before = null) {
    const version = listVersion.current, selectedStatus = statusRef.current;
    if (listBusy.current?.version === version) return;
    const operation = { version };
    listBusy.current = operation;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStatus) params.set("status", selectedStatus);
      if (before) params.set("before", before);
      const result = await request(`/chat/threads?${params}`);
      if (version !== listVersion.current) return;
      setListError("");
      if (before) hasOlderThreads.current = true;
      setThreads((old) => before || hasOlderThreads.current ? [...new Map([...old, ...result.threads].map((row) => [row.id, row])).values()].sort((a, b) => b.sort_key.localeCompare(a.sort_key)) : result.threads);
      if (before || !hasOlderThreads.current) setNext(result.next_cursor);
    } catch (problem) {
      if (version === listVersion.current) setListError(problem.message);
    } finally {
      if (listBusy.current === operation) listBusy.current = null;
      if (version === listVersion.current) setLoading(false);
    }
  }
  useEffect(() => {
    hasOlderThreads.current = false;
    setThreads([]);
    setNext(null);
    setListError("");
    loadThreads();
    const timer = setInterval(() => {
      if (!document.hidden) loadThreads();
    }, 7e3);
    const refresh = () => {
      if (!document.hidden) loadThreads();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      listVersion.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [status]);
  useEffect(() => {
    const version = ++generation.current;
    sequence.current = 0;
    busy.current = false;
    atBottom.current = true;
    setMessages([]);
    setThread(null);
    setOlder(null);
    setError("");
    setSynced(null);
    setTyping(null);
    setDraft(drafts.current.get(active) || "");
    setPending(failures.current.get(active) || null);
    if (!active) return;
    async function sync() {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const last = sequence.current;
        const result = await request(`/chat/threads/${active}/messages${last ? `?after=${last}` : ""}`);
        if (version !== generation.current) return;
        setThread(result.thread);
        setTyping(result.typing || null);
        if (!last) setOlder(result.next_cursor);
        if (result.messages.length) {
          sequence.current = result.messages.at(-1).seq;
          setMessages((old) => [...new Map([...old, ...result.messages].map((row) => [row.id, row])).values()].sort((a, b) => a.seq - b.seq));
        }
        setError("");
        setSynced(/* @__PURE__ */ new Date());
        if (sequence.current && !document.hidden && atBottom.current) {
          const read = await request(`/chat/threads/${active}/read`, "POST", { through: sequence.current });
          if (version === generation.current) setThread(read.thread);
        }
        if (result.has_more && last) setTimeout(() => {
          if (version === generation.current) sync();
        }, 0);
      } catch (problem) {
        if (version === generation.current) setError(problem.message);
      } finally {
        if (version === generation.current) busy.current = false;
      }
    }
    retryConversation.current = sync;
    sync();
    const timer = setInterval(sync, 4e3);
    const wake = () => sync();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      generation.current++;
      retryConversation.current = () => {
      };
      clearInterval(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [active]);
  useEffect(() => {
    if (atBottom.current) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [active, messages.at(-1)?.id, typing?.is_typing]);
  function handleDraftChange(value) {
    setDraft(value);
    drafts.current.set(active, value);
    persist();
    if (!active || !value.trim()) return;
    const now = Date.now();
    if (now - typingTimer.current > 2500) {
      typingTimer.current = now;
      request(`/chat/threads/${active}/typing`, "POST", { typing: true }).catch(() => {
      });
    }
  }
  async function send(event) {
    if (event?.preventDefault) event.preventDefault();
    if (sending || !active) return;
    const operation = pending || { text: draft.trim(), requestKey: retryKey() };
    if (!operation.text) return;
    const id = active;
    setSending(true);
    setError("");
    failures.current.set(id, operation);
    setPending(operation);
    persist();
    try {
      const result = await request(`/chat/threads/${id}/messages`, "POST", operation);
      failures.current.delete(id);
      drafts.current.delete(id);
      persist();
      if (currentId.current === id) {
        setPending(null);
        setDraft("");
        setThread(result.thread);
        setMessages((old) => [...new Map([...old, result.message].map((row) => [row.id, row])).values()].sort((a, b) => a.seq - b.seq));
      }
      loadThreads();
    } catch (problem) {
      if (problem.status >= 400 && problem.status < 500) {
        failures.current.delete(id);
        persist();
        if (currentId.current === id) setPending(null);
      }
      if (currentId.current === id) setError(`${problem.message} Your message is kept; try again below.`);
    } finally {
      setSending(false);
    }
  }
  async function loadOlder() {
    const id = active, cursor = older;
    try {
      const result = await request(`/chat/threads/${id}/messages?before=${cursor}`);
      if (currentId.current !== id) return;
      setMessages((old) => [...new Map([...result.messages, ...old].map((row) => [row.id, row])).values()].sort((a, b) => a.seq - b.seq));
      setOlder(result.next_cursor);
    } catch (problem) {
      setError(problem.message);
    }
  }
  async function changeStatus() {
    const id = active;
    try {
      const result = await request(`/chat/threads/${id}/status`, "PATCH", { status: thread.status === "OPEN" ? "RESOLVED" : "OPEN" });
      if (currentId.current === id) setThread(result.thread);
      loadThreads();
    } catch (problem) {
      setError(problem.message);
    }
  }
  const filtered = threads.filter((row) => `${row.customer_name} ${row.subject} ${row.rental_code || ""}`.toLowerCase().includes(search.toLowerCase()));
  return /* @__PURE__ */ React.createElement("section", { className: "support-chat panel", "aria-label": "Customer rental support" }, /* @__PURE__ */ React.createElement("aside", { className: "support-inbox" }, /* @__PURE__ */ React.createElement("h2", null, "Customer inbox"), /* @__PURE__ */ React.createElement("label", null, "Search shown conversations", /* @__PURE__ */ React.createElement("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Customer or rental reference" })), /* @__PURE__ */ React.createElement("label", null, "Status", /* @__PURE__ */ React.createElement("select", { value: status, onChange: (e) => setStatus(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "All conversations"), /* @__PURE__ */ React.createElement("option", { value: "OPEN" }, "Open"), /* @__PURE__ */ React.createElement("option", { value: "RESOLVED" }, "Resolved"))), /* @__PURE__ */ React.createElement("div", { className: "support-thread-list" }, filtered.map((row) => /* @__PURE__ */ React.createElement("button", { key: row.id, className: `support-thread ${active === row.id ? "selected" : ""}`, onClick: () => setActive(row.id) }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, row.customer_name), row.unread_count > 0 && /* @__PURE__ */ React.createElement("b", { className: "support-unread" }, row.unread_count)), /* @__PURE__ */ React.createElement("span", null, row.subject), /* @__PURE__ */ React.createElement("small", null, row.rental_code || "General inquiry", " \xB7 ", row.status.toLowerCase()), /* @__PURE__ */ React.createElement("p", null, row.last_message || "No messages yet"), /* @__PURE__ */ React.createElement("time", null, when(row.updated_at))))), listError && /* @__PURE__ */ React.createElement("div", { role: "alert", className: "support-error" }, /* @__PURE__ */ React.createElement("p", null, listError, threads.length ? " Showing previously loaded conversations." : ""), /* @__PURE__ */ React.createElement("button", { type: "button", disabled: loading, onClick: () => loadThreads() }, "Try again")), !filtered.length && !listError && /* @__PURE__ */ React.createElement("p", { className: "support-muted", role: "status" }, loading ? "Loading conversations\u2026" : search ? "No conversations match your search. Try another name or rental reference." : "No conversations yet. Customer inquiries will appear here."), next && /* @__PURE__ */ React.createElement("button", { disabled: loading, onClick: () => loadThreads(next) }, loading ? "Loading\u2026" : "Load more conversations")), /* @__PURE__ */ React.createElement("div", { className: "support-conversation" }, error && /* @__PURE__ */ React.createElement("div", { role: "alert", className: "support-error" }, /* @__PURE__ */ React.createElement("p", null, error), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => retryConversation.current() }, "Refresh conversation")), !active ? /* @__PURE__ */ React.createElement("div", { className: "support-empty" }, /* @__PURE__ */ React.createElement("h2", null, "Rental support"), /* @__PURE__ */ React.createElement("p", null, "Select a conversation to help a customer."), /* @__PURE__ */ React.createElement("p", null, "Replies are saved and customers receive an alert. Staff share this inbox.")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("header", { className: "support-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, thread?.customer_name || "Loading conversation\u2026"), /* @__PURE__ */ React.createElement("p", null, thread?.subject, " ", thread?.rental_code && `\xB7 ${thread.rental_code}`), /* @__PURE__ */ React.createElement("small", null, synced ? `Last synced ${synced.toLocaleTimeString()}` : "Connecting\u2026")), thread && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: `support-thread-status-btn status-${thread.status.toLowerCase()}`,
      disabled: sending,
      onClick: changeStatus,
      title: thread.status === "OPEN" ? "Mark conversation as resolved" : "Reopen this conversation"
    },
    /* @__PURE__ */ React.createElement("span", { className: "status-btn-icon", "aria-hidden": "true" }, thread.status === "OPEN" ? "\u2713" : "\u21BA"),
    thread.status === "OPEN" ? "Resolve conversation" : "Reopen conversation"
  )), /* @__PURE__ */ React.createElement("div", { className: "support-conversation-body" }, /* @__PURE__ */ React.createElement("div", { className: "support-conversation-main" }, /* @__PURE__ */ React.createElement("div", { className: "support-messages", role: "log", "aria-label": "Messages", "aria-live": "polite", onScroll: (e) => {
    atBottom.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 80;
  } }, older && /* @__PURE__ */ React.createElement("button", { onClick: loadOlder }, "Load earlier messages"), messages.map((message) => /* @__PURE__ */ React.createElement("article", { key: message.id, className: `support-bubble ${message.sender_role === "STAFF" ? "outgoing" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "support-bubble-header" }, /* @__PURE__ */ React.createElement("strong", null, message.sender_role === "STAFF" ? `${message.sender_name}${message.sender_id === user?.id ? " (you)" : ""}` : thread?.customer_name), /* @__PURE__ */ React.createElement("span", { className: `support-role-tag role-${message.sender_role.toLowerCase()}` }, message.sender_role === "STAFF" ? "Staff" : "Customer")), /* @__PURE__ */ React.createElement("p", null, message.text), /* @__PURE__ */ React.createElement("small", null, when(message.created_at), message.sender_role === "STAFF" ? ` \xB7 ${thread?.customer_read_seq >= message.seq ? "Read" : "Sent"}` : ""))), typing?.is_typing && /* @__PURE__ */ React.createElement("article", { className: "support-bubble support-typing-bubble", role: "status", "aria-label": `${typing.name} is typing` }, /* @__PURE__ */ React.createElement("div", { className: "typing-indicator-row" }, /* @__PURE__ */ React.createElement("span", { className: "typing-dots" }, /* @__PURE__ */ React.createElement("span", { className: "dot" }), /* @__PURE__ */ React.createElement("span", { className: "dot" }), /* @__PURE__ */ React.createElement("span", { className: "dot" })), /* @__PURE__ */ React.createElement("span", { className: "typing-label" }, /* @__PURE__ */ React.createElement("strong", null, typing.name), " is typing\u2026"))), !messages.length && /* @__PURE__ */ React.createElement("p", { className: "support-muted" }, error ? "Messages could not be updated. Your reply is kept below." : thread ? "No messages yet." : "Loading messages\u2026"), /* @__PURE__ */ React.createElement("div", { ref: bottom })), thread?.status === "RESOLVED" && /* @__PURE__ */ React.createElement("p", { className: "support-muted" }, "Resolved. Reopen to reply. A new customer message also reopens this conversation."), /* @__PURE__ */ React.createElement("form", { className: "support-composer", onSubmit: send }, /* @__PURE__ */ React.createElement("div", { className: "support-composer-header" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "support-reply" }, "Reply to customer"), /* @__PURE__ */ React.createElement("div", { className: "support-quick-chips" }, quickReplies.map((qr) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: qr.id || qr.label,
      type: "button",
      className: "quick-chip-btn",
      disabled: !thread || thread?.status === "RESOLVED",
      onClick: () => handleDraftChange(qr.text),
      title: qr.text
    },
    qr.label
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "quick-chip-btn manage-qr-btn",
      onClick: () => {
        setEditingQrId(null);
        setQrError("");
        setShowQrModal(true);
      },
      title: "Add, edit, or customize quick replies"
    },
    "\u2699\uFE0F Customize"
  ))), /* @__PURE__ */ React.createElement("textarea", { id: "support-reply", rows: "3", maxLength: 2e3, value: pending?.text ?? draft, disabled: !!pending || !thread || thread?.status === "RESOLVED", onKeyDown: (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending && !pending && (pending?.text ?? draft).trim()) send(e);
    }
  }, onChange: (e) => handleDraftChange(e.target.value), placeholder: "Help with availability, pricing, or a rental\u2026 (Press Enter to send)" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("small", null, (pending?.text ?? draft).length, "/2000 \xB7 Press Enter to send, Shift+Enter for new line"), /* @__PURE__ */ React.createElement("button", { type: "submit", disabled: sending || !thread || thread.status === "RESOLVED" || !(pending?.text ?? draft).trim() }, sending ? "Sending\u2026" : pending ? "Retry message" : "Send reply")))), thread && /* @__PURE__ */ React.createElement("aside", { className: "support-context-rail" }, /* @__PURE__ */ React.createElement("div", { className: "context-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "context-avatar" }, initials2(thread.customer_name)), /* @__PURE__ */ React.createElement("h3", null, thread.customer_name), /* @__PURE__ */ React.createElement("span", { className: `context-status-pill status-${thread.status.toLowerCase()}` }, thread.status)), /* @__PURE__ */ React.createElement("div", { className: "context-details-group" }, /* @__PURE__ */ React.createElement("h4", null, "Inquiry Summary"), /* @__PURE__ */ React.createElement("div", { className: "context-row" }, /* @__PURE__ */ React.createElement("span", null, "Type"), /* @__PURE__ */ React.createElement("strong", null, thread.subject)), /* @__PURE__ */ React.createElement("div", { className: "context-row" }, /* @__PURE__ */ React.createElement("span", null, "Rental Reference"), /* @__PURE__ */ React.createElement("strong", null, thread.rental_code || "General inquiry")), /* @__PURE__ */ React.createElement("div", { className: "context-row" }, /* @__PURE__ */ React.createElement("span", null, "Last Updated"), /* @__PURE__ */ React.createElement("time", null, when(thread.updated_at)))), /* @__PURE__ */ React.createElement("div", { className: "context-details-group" }, /* @__PURE__ */ React.createElement("h4", null, "Operator Tips"), /* @__PURE__ */ React.createElement("p", { className: "context-tip-text" }, "Customer views replies live in the mobile app. Double-check equipment availability, condition, and valid ID before confirming pickup.")))))), showQrModal && /* @__PURE__ */ React.createElement("div", { className: "qr-modal-overlay", onClick: () => {
    setShowQrModal(false);
    setEditingQrId(null);
  } }, /* @__PURE__ */ React.createElement("div", { className: "qr-modal-window", onClick: (e) => e.stopPropagation(), role: "dialog", "aria-modal": "true", "aria-labelledby": "qr-modal-title" }, /* @__PURE__ */ React.createElement("div", { className: "qr-modal-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { id: "qr-modal-title" }, "Customize Quick Replies"), /* @__PURE__ */ React.createElement("p", { className: "qr-modal-subtitle" }, "Add or edit canned response snippets for faster customer support.")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "icon-button qr-modal-close", onClick: () => {
    setShowQrModal(false);
    setEditingQrId(null);
  }, "aria-label": "Close dialog" }, "\u2715")), editingQrId ? /* @__PURE__ */ React.createElement("form", { className: "qr-edit-form", onSubmit: handleSaveQr }, /* @__PURE__ */ React.createElement("div", { className: "qr-form-header" }, /* @__PURE__ */ React.createElement("h4", null, editingQrId === "NEW" ? "+ Add New Quick Reply" : "Edit Quick Reply")), qrError && /* @__PURE__ */ React.createElement("div", { className: "qr-form-error", role: "alert" }, qrError), /* @__PURE__ */ React.createElement("label", { className: "qr-field-label" }, /* @__PURE__ */ React.createElement("span", null, "Button / Chip Label"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      required: true,
      maxLength: 40,
      placeholder: "e.g. \u{1F4B3} GCash Payment, \u{1F4CD} Delivery Info",
      value: formLabel,
      onChange: (e) => setFormLabel(e.target.value)
    }
  ), /* @__PURE__ */ React.createElement("small", null, "Short name shown on the chip above the reply box.")), /* @__PURE__ */ React.createElement("label", { className: "qr-field-label" }, /* @__PURE__ */ React.createElement("span", null, "Quick Reply Message"), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      required: true,
      rows: 4,
      maxLength: 1500,
      placeholder: "The message that will be placed into the composer when clicked...",
      value: formText,
      onChange: (e) => setFormText(e.target.value)
    }
  ), /* @__PURE__ */ React.createElement("small", null, formText.length, "/1500 characters")), /* @__PURE__ */ React.createElement("div", { className: "qr-form-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "secondary", onClick: handleCancelEditQr }, "Cancel"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "primary" }, editingQrId === "NEW" ? "Add Quick Reply" : "Save Changes"))) : /* @__PURE__ */ React.createElement("div", { className: "qr-manager-body" }, /* @__PURE__ */ React.createElement("div", { className: "qr-items-list" }, quickReplies.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "qr-empty-notice" }, 'No quick replies yet. Click "+ Add Quick Reply" below or reset to defaults.') : quickReplies.map((qr) => /* @__PURE__ */ React.createElement("div", { key: qr.id || qr.label, className: "qr-card-item" }, /* @__PURE__ */ React.createElement("div", { className: "qr-card-content" }, /* @__PURE__ */ React.createElement("span", { className: "qr-chip-preview" }, qr.label), /* @__PURE__ */ React.createElement("p", { className: "qr-card-text" }, qr.text)), /* @__PURE__ */ React.createElement("div", { className: "qr-card-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "qr-btn-edit",
      onClick: () => handleStartEditQr(qr),
      title: "Edit this template"
    },
    "\u270F\uFE0F Edit"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "qr-btn-delete",
      onClick: () => handleDeleteQr(qr.id || qr.label),
      title: "Delete this template",
      "aria-label": `Delete ${qr.label}`
    },
    "\u{1F5D1}\uFE0F"
  ))))), /* @__PURE__ */ React.createElement("div", { className: "qr-manager-footer" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "text-button qr-reset-link", onClick: handleResetQuickReplies }, "Reset to defaults"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "primary qr-create-btn", onClick: handleStartAddQr }, "+ Add Quick Reply"))))));
}

// src/react/WorkspaceStatus.jsx
function WorkspaceStatus({ loading, error, offline, hasData, onRetry }) {
  if (hasData && !error && !offline) return null;
  if (hasData) return /* @__PURE__ */ React.createElement("div", { className: "workspace-recovery-notice", role: "status" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, offline ? "You\u2019re offline" : "Updates are temporarily paused"), /* @__PURE__ */ React.createElement("p", null, offline ? "Reconnect to get the latest updates." : error, " Showing the last loaded records; they may have changed.")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "secondary", onClick: onRetry, disabled: loading || offline }, loading ? "Checking\u2026" : "Try again"));
  const waiting = loading && !offline;
  return /* @__PURE__ */ React.createElement("section", { className: "panel workspace-status", role: waiting ? "status" : "alert", "aria-busy": waiting }, /* @__PURE__ */ React.createElement("div", { className: "workspace-status-symbol", "aria-hidden": "true" }, waiting ? /* @__PURE__ */ React.createElement("span", { className: "session-spinner" }) : /* @__PURE__ */ React.createElement(Icon, { name: "refresh" })), /* @__PURE__ */ React.createElement("h2", null, offline ? "You\u2019re offline" : waiting ? "Opening your workspace" : "We couldn\u2019t load your workspace"), /* @__PURE__ */ React.createElement("p", null, offline ? "Reconnect to the internet. We\u2019ll check for updates when you\u2019re back online." : waiting ? "Getting your latest rentals and equipment ready\u2026" : error || "Please try again. If this continues, contact your system administrator."), !waiting && /* @__PURE__ */ React.createElement("button", { type: "button", className: "primary", onClick: onRetry, disabled: offline }, "Try again"), waiting && /* @__PURE__ */ React.createElement("div", { className: "workspace-status-skeleton", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null)));
}

// src/react/WorkspaceErrorBoundary.jsx
var WorkspaceErrorBoundary = class extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return /* @__PURE__ */ React.createElement("section", { className: "panel workspace-status", role: "alert" }, /* @__PURE__ */ React.createElement("h2", null, "This page was interrupted"), /* @__PURE__ */ React.createElement("p", null, "Please try opening it again. If this continues, contact your system administrator."), /* @__PURE__ */ React.createElement("button", { className: "primary", type: "button", onClick: () => {
      this.setState({ failed: false });
      this.props.onRetry?.();
    } }, "Try again"), this.props.onHome && /* @__PURE__ */ React.createElement("button", { className: "secondary", type: "button", onClick: this.props.onHome }, "Go to Dashboard"));
  }
};

// src/react/WorkspaceLayout.jsx
var navGroups = [
  {
    id: "management",
    label: "Management",
    icon: "layers",
    items: [
      ["Equipment", "Inventory"],
      ["Customers", "Customers"],
      ["Messages", "Messages"],
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
  return `<section class="appearance-settings" aria-label="Appearance settings">
    <div class="settings-theme-previews" role="group" aria-label="Color theme">${["light", "dark"].map((mode) => `
      <button type="button" id="settings-theme-${mode}" class="settings-theme-example ${mode === theme ? "is-current" : ""}" data-settings-theme="${mode}" aria-pressed="${mode === theme}">
        <div class="settings-theme-canvas is-${mode}" aria-hidden="true"><div class="settings-theme-side"><i></i><i></i><i></i><i></i></div><div class="settings-theme-page"><i></i><div><span></span><span></span></div><p></p><p></p></div></div>
        <span>${mode === "light" ? "Light" : "Dark"}${mode === theme ? '<small aria-hidden="true">Current</small>' : ""}</span>
      </button>`).join("")}</div>
    <div class="theme-preference-note"><span id="theme-status" role="status">${theme === "dark" ? "Dark mode is on" : "Light mode is on"}</span><small>Saved on this browser</small></div>
  </section>`;
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
  return /* @__PURE__ */ React.createElement("div", { className: "page-heading", title: displayDesc }, /* @__PURE__ */ React.createElement("div", { className: "page-heading-copy" }, /* @__PURE__ */ React.createElement("span", { className: "sr-only" }, displayCaption), /* @__PURE__ */ React.createElement("h1", null, title)));
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
  const renderedRef = useRef(null);
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
    if (page !== "Payments" && renderedRef.current?.page === page && renderedRef.current?.html === html) {
      workspaceUI.syncIfNeeded(page, onTriggerRender);
      return;
    }
    container.innerHTML = html;
    renderedRef.current = { page, html };
    container.querySelectorAll("[data-settings-theme]").forEach((button) => {
      button.onclick = () => onSetTheme(button.dataset.settingsTheme);
    });
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
  workspaceLoading = false,
  offline = false,
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
  const prefetchTimer = useRef(null);
  useEffect(() => () => clearTimeout(prefetchTimer.current), []);
  const cancelPagePrefetch = () => clearTimeout(prefetchTimer.current);
  const queuePagePrefetch = (target) => {
    cancelPagePrefetch();
    if (target === page || navigator.connection?.saveData) return;
    prefetchTimer.current = setTimeout(() => {
      void workspaceUI.prefetch?.(target);
    }, 120);
  };
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" ? window.matchMedia("(max-width:720px)").matches : false
  );
  const sidebarRail = sidebarCollapsed && !isMobileViewport;
  const [sidebarFlyout, setSidebarFlyout] = useState(null);
  const flyoutCloseTimer = useRef(null);
  const keepFlyoutOpen = () => clearTimeout(flyoutCloseTimer.current);
  const openSidebarFlyout = (groupId) => {
    keepFlyoutOpen();
    if (sidebarRail) setSidebarFlyout(groupId);
  };
  const closeSidebarFlyout = () => {
    keepFlyoutOpen();
    flyoutCloseTimer.current = setTimeout(() => setSidebarFlyout(null), 180);
  };
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const sidebarRef = useRef(null);
  const sidebarFlyoutRef = useRef(null);
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
      setSidebarFlyout(null);
      if (!mobile) setMobileDrawerOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useLayoutEffect(() => {
    if (!sidebarRail || !sidebarFlyout) return;
    const button = document.getElementById(`nav-group-toggle-${sidebarFlyout}`);
    const flyout = sidebarFlyoutRef.current;
    if (!button || !flyout) return;
    const anchor = button.getBoundingClientRect();
    flyout.style.left = `${sidebarRef.current.getBoundingClientRect().right + 8}px`;
    flyout.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - flyout.getBoundingClientRect().height - 8))}px`;
  }, [sidebarRail, sidebarFlyout]);
  useEffect(() => {
    if (!sidebarRail) setSidebarFlyout(null);
    return keepFlyoutOpen;
  }, [sidebarRail]);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    const body = workspaceBodyRef.current;
    if (sidebar) sidebar.inert = Boolean(isMobileViewport && !mobileDrawerOpen);
    if (body) body.inert = Boolean(isMobileViewport && mobileDrawerOpen);
  }, [isMobileViewport, mobileDrawerOpen]);
  useEffect(() => {
    const handleDocClick = (event) => {
      setAccountMenuOpen(false);
      setNotificationsOpen(false);
      if (!sidebarRef.current?.contains(event.target) && !sidebarFlyoutRef.current?.contains(event.target)) setSidebarFlyout(null);
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
      setSidebarFlyout(null);
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
        rentalNotifications.markRead([entry.dataset.rentalNotification]).catch(() => {
        });
        if (entry.dataset.notificationChat) {
          window.dispatchEvent(new CustomEvent("rental-support-open", { detail: entry.dataset.notificationChat }));
          try {
            sessionStorage.setItem("rental-support-open", entry.dataset.notificationChat);
          } catch {
          }
          onNavigate("Messages");
        } else if (entry.dataset.notificationRental) {
          await workspaceUI.openTransaction(entry.dataset.notificationRental, {
            rentalCode: entry.dataset.rentalCode
          });
        } else if (entry.dataset.notificationPage) {
          onNavigate(entry.dataset.notificationPage);
        }
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
  const notifState = rentalNotifications.state();
  const unreadCount = notifState.unreadCount || 0;
  let notificationsSeen = "";
  try {
    notificationsSeen = localStorage.getItem("rent-play-notifications-seen") || "";
  } catch {
  }
  const showNotificationDot = !unreadCount && !notificationsOpen && Boolean(notificationFingerprint) && notificationFingerprint !== notificationsSeen;
  const mobileToggleLabel = isMobileViewport ? mobileDrawerOpen ? "Close navigation" : "Open navigation" : sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  const userAvatar = user?.avatar || (typeof window !== "undefined" && window.localStorage ? localStorage.getItem(`rent_play_avatar_${user?.id || user?.email || "active"}`) : "");
  const flyoutGroup = sidebarRail ? navGroups.find((group) => group.id === sidebarFlyout) : null;
  const renderGroupLinks = (group) => group.items.map(([label, target, section]) => {
    const active = section ? page === "Reports" && reportSection === section : page === target;
    const buttonLabel = section ? label : target;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: `${target}-${section || ""}`,
        type: "button",
        "data-page": target,
        "data-analytics-section": section || void 0,
        className: `nav-child${active ? " active" : ""}`,
        "aria-label": buttonLabel,
        title: buttonLabel,
        "aria-current": active ? "page" : void 0,
        onPointerEnter: () => queuePagePrefetch(target),
        onPointerLeave: cancelPagePrefetch,
        onFocus: () => queuePagePrefetch(target),
        onBlur: cancelPagePrefetch,
        onClick: (event) => {
          event.preventDefault();
          setMobileDrawerOpen(false);
          setSidebarFlyout(null);
          onNavigate(target, false, "All rentals", "", section || "");
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "sidebar-label" }, label),
      target === "Rentals" ? /* @__PURE__ */ React.createElement("span", { className: "nav-count" }, data?.rentals?.length ?? "\u2013") : null
    );
  });
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("a", { className: "skip-link", href: "#workspace-content" }, "Skip to main content"), /* @__PURE__ */ React.createElement("div", { className: `workspace${sidebarRail ? " sidebar-collapsed" : ""}` }, /* @__PURE__ */ React.createElement(
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
    /* @__PURE__ */ React.createElement("nav", { onScroll: () => setSidebarFlyout(null) }, /* @__PURE__ */ React.createElement(
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
          key: group.id,
          onPointerEnter: (event) => {
            if (event.pointerType !== "touch") openSidebarFlyout(group.id);
          },
          onPointerLeave: closeSidebarFlyout,
          onFocusCapture: () => openSidebarFlyout(group.id),
          onBlurCapture: (event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) closeSidebarFlyout();
          }
        },
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            id: `nav-group-toggle-${group.id}`,
            className: `nav-section-title${hasActiveChild ? " group-active" : ""}`,
            "data-nav-group": group.id,
            "aria-expanded": sidebarRail ? sidebarFlyout === group.id : expanded,
            "aria-controls": !sidebarRail || sidebarFlyout === group.id ? `nav-group-${group.id}` : void 0,
            "aria-label": group.label,
            title: group.label,
            onClick: () => sidebarRail ? openSidebarFlyout(group.id) : onToggleNavGroup(group.id)
          },
          /* @__PURE__ */ React.createElement("span", { className: "nav-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: group.icon || "box" })),
          /* @__PURE__ */ React.createElement("span", { className: "sidebar-label" }, group.label),
          /* @__PURE__ */ React.createElement("span", { className: "nav-group-chevron" }, /* @__PURE__ */ React.createElement(Icon, { name: "chevron" }))
        ),
        !sidebarRail && /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "nav-section-items",
            id: `nav-group-${group.id}`,
            hidden: !expanded
          },
          /* @__PURE__ */ React.createElement("div", { className: "nav-flyout-header", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", null, group.label)),
          renderGroupLinks(group)
        )
      );
    }), /* @__PURE__ */ React.createElement("div", { className: "nav-divider", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement(
      "button",
      {
        "data-page": "Settings",
        className: `nav-root${page === "Settings" ? " active" : ""}`,
        "aria-label": "Settings",
        title: "Settings",
        "aria-current": page === "Settings" ? "page" : void 0,
        onPointerEnter: () => queuePagePrefetch("Settings"),
        onPointerLeave: cancelPagePrefetch,
        onFocus: () => queuePagePrefetch("Settings"),
        onBlur: cancelPagePrefetch,
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
        type: "button",
        className: "nav-root",
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
    )),
    /* @__PURE__ */ React.createElement("div", { className: "sidebar-bottom" }, /* @__PURE__ */ React.createElement(
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
      /* @__PURE__ */ React.createElement("span", { className: "avatar" }, userAvatar ? /* @__PURE__ */ React.createElement("img", { src: userAvatar, alt: user.name, className: "avatar-img" }) : initials(user.name)),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, user.name), /* @__PURE__ */ React.createElement("small", null, user.role)),
      /* @__PURE__ */ React.createElement("span", { className: "nav-tooltip", "aria-hidden": "true" }, "Profile")
    ))
  ), flyoutGroup && /* @__PURE__ */ React.createElement(
    "nav",
    {
      key: flyoutGroup.id,
      ref: sidebarFlyoutRef,
      id: `nav-group-${flyoutGroup.id}`,
      className: "sidebar-flyout",
      "aria-label": `${flyoutGroup.label} pages`,
      onPointerEnter: keepFlyoutOpen,
      onPointerLeave: closeSidebarFlyout,
      onFocusCapture: keepFlyoutOpen,
      onBlurCapture: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeSidebarFlyout();
      },
      onKeyDown: handleSidebarKeyDown
    },
    /* @__PURE__ */ React.createElement("div", { className: "sidebar-flyout-title" }, flyoutGroup.label),
    renderGroupLinks(flyoutGroup)
  ), /* @__PURE__ */ React.createElement("div", { className: "workspace-body", ref: workspaceBodyRef }, /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", { className: "topbar-leading" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      ref: mobileToggleRef,
      className: "icon-button menu-toggle",
      id: "mobile-menu",
      "aria-controls": "workspace-navigation",
      "aria-expanded": isMobileViewport ? mobileDrawerOpen : !sidebarRail,
      "aria-label": mobileToggleLabel,
      title: mobileToggleLabel,
      onClick: handleMobileMenuClick,
      onKeyDown: (e) => {
        if (e.key === "Escape") setMobileDrawerOpen(false);
      }
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "menu" })
  ), /* @__PURE__ */ React.createElement(PageHeading, { page, reportSection })), /* @__PURE__ */ React.createElement("div", { className: "top-actions" }, /* @__PURE__ */ React.createElement("div", { className: "unified-top-pill", role: "toolbar", "aria-label": "Quick actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: `top-pill-btn top-pill-refresh${manualRefreshPending ? " spinning" : ""}`,
      id: "refresh",
      type: "button",
      disabled: manualRefreshPending,
      "aria-busy": manualRefreshPending ? "true" : void 0,
      "aria-label": manualRefreshPending ? "Refreshing data\u2026" : "Refresh data",
      title: manualRefreshPending ? "Refreshing\u2026" : "Refresh",
      onClick: onManualRefresh
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "refresh" })
  ), /* @__PURE__ */ React.createElement("span", { className: "top-pill-sep", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement(
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
        className: "top-pill-btn top-pill-bell",
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
  ), /* @__PURE__ */ React.createElement("span", { className: "top-pill-sep", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement(
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
        className: "top-pill-btn top-pill-profile profile-menu-toggle",
        id: "profile-menu-toggle",
        type: "button",
        "aria-label": "Open account menu",
        "aria-haspopup": "menu",
        "aria-expanded": accountMenuOpen,
        onClick: handleToggleAccountMenu
      },
      /* @__PURE__ */ React.createElement("span", { className: "avatar small" }, userAvatar ? /* @__PURE__ */ React.createElement("img", { src: userAvatar, alt: "", className: "avatar-img" }) : initials(user.name)),
      /* @__PURE__ */ React.createElement("span", { className: "top-pill-user-name" }, user.name ? user.name.split(" ")[0] : "Account"),
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
        " Sign out"
      )
    )
  )))), /* @__PURE__ */ React.createElement("main", { className: "content", id: "workspace-content", tabIndex: -1 }, page === "Dashboard" && /* @__PURE__ */ React.createElement(WorkspaceStatus, { loading: workspaceLoading, error: connectionError, offline, hasData: Boolean(data), onRetry: onManualRefresh }), page !== "Dashboard" && page !== "ESP32 terminal" && data ? /* @__PURE__ */ React.createElement(TerminalPendingBanner, { data, workspaceUI, onNavigate }) : null, /* @__PURE__ */ React.createElement(WorkspaceErrorBoundary, { key: page, onRetry: onManualRefresh, onHome: () => onNavigate("Dashboard") }, page === "Dashboard" ? data && /* @__PURE__ */ React.createElement(
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
      showModal,
      workspaceUI,
      api,
      toast
    }
  ) : page === "Inventory" ? /* @__PURE__ */ React.createElement(
    InventorySection,
    {
      category: typeof window !== "undefined" ? window.__rentPlayCategory || "" : "",
      inventoryController,
      renderTick
    }
  ) : page === "Messages" ? /* @__PURE__ */ React.createElement(MessagesView, { api, user }) : page === "Profile" ? /* @__PURE__ */ React.createElement(
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
  ) : /* @__PURE__ */ React.createElement("section", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, /* @__PURE__ */ React.createElement(Icon, { name: "box" }), /* @__PURE__ */ React.createElement("h3", null, "Page unavailable"), /* @__PURE__ */ React.createElement("p", null, "Choose another workspace section.")))), /* @__PURE__ */ React.createElement("footer", { className: "content-footer" }, /* @__PURE__ */ React.createElement("span", null, "\xA9 ", (/* @__PURE__ */ new Date()).getFullYear(), " Rent & Play"), /* @__PURE__ */ React.createElement("span", null, page === "Dashboard" && data?.refreshedAt && Number.isFinite(Date.parse(data.refreshedAt)) ? `Updated ${new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila"
  }).format(new Date(data.refreshedAt))}` : offline ? "Offline" : workspaceLoading ? "Loading latest records\u2026" : "Rent & Play workspace")))), /* @__PURE__ */ React.createElement(
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
import { initHardwareBarcodeScanner } from "./qr-reader.js";
import { installFormUX, prepareModalUX } from "./form-ux.js";
import { requestError } from "./request-errors.js";
var dashboardSnapshot = (value) => value ? JSON.stringify(
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== "refreshedAt"))
) : "";
var liveRentalPages = /* @__PURE__ */ new Set(["Rentals", "Returns", "Transaction History"]);
function App() {
  useEffect(() => installFormUX(document), []);
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [rememberSession, setRememberSession] = useState(false);
  const [data, setData] = useState(null);
  const [connectionError, setConnectionError] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [offline, setOffline] = useState(() => navigator.onLine === false);
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
      prepareModalUX(modal);
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
      )}</h2><button type="button" class="icon-button" id="close-modal" aria-label="Close dialog">\u2715</button></div>${body}`;
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
      refreshingRef.current = null;
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
        c.inventoryController?.invalidate();
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
      onReportSectionChange: setReportSection,
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
      if (!currentUser) return;
      if (refreshingRef.current) return refreshingRef.current;
      const sessionUser = currentUser;
      setWorkspaceLoading(true);
      const c = controllersRef.current;
      const pending = (async () => {
        try {
          const nextData = await api(
            "/dashboard",
            force ? { headers: { "Cache-Control": "no-cache" } } : {}
          );
          if (!nextData.stats || !nextData.revenue || !["rentals", "pending", "items", "categories", "terminals"].every((key) => Array.isArray(nextData[key]))) {
            throw requestError({ code: "INVALID_RESPONSE" });
          }
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
          if (userRef.current !== sessionUser) return;
          if (error.status === 401) {
            endSession();
          } else {
            setConnectionError(cleanErrorMessage(error));
          }
        } finally {
          if (refreshingRef.current === pending) refreshingRef.current = null;
          if (userRef.current === sessionUser) setWorkspaceLoading(false);
        }
      })();
      refreshingRef.current = pending;
      return pending;
    },
    [api, endSession, triggerRender]
  );
  useEffect(() => {
    if (!user || !connectionError || offline) return;
    const timer = setInterval(() => {
      const c = controllersRef.current;
      if (document.visibilityState === "visible" && !c.modal?.open && c.apiClient.canRefresh()) void refresh({ force: true });
    }, 3e4);
    return () => clearInterval(timer);
  }, [user, connectionError, offline, refresh]);
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
        if (c.modal?.querySelector("[data-handoff-request]")) {
          await c.workspaceUI.refreshPendingHandoff();
        }
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
              await c.workspaceUI.refresh();
              if (!c.modal?.open && pageRef.current === refreshedPage && userRef.current) {
                triggerRender();
              }
            } else if (currentPage === "Inventory") {
              await c.inventoryController.refresh({ force: true });
              await refresh({ force: true });
            } else if (workspacePages.has(currentPage)) {
              const refreshedPage = currentPage;
              await c.workspaceUI.refresh();
              if (!c.modal?.open && pageRef.current === refreshedPage && userRef.current) {
                triggerRender();
              }
            } else {
              const refreshedPage = currentPage;
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
      source.addEventListener("verification.changed", scheduleRentalEventSync);
      source.addEventListener("inventory.changed", scheduleRentalEventSync);
      source.addEventListener("maintenance.changed", scheduleRentalEventSync);
      source.addEventListener("customer.changed", (event) => {
        try {
          const payload = event?.data ? JSON.parse(event.data) : null;
          if (payload?.customerName && payload?.action === "registered") {
            toast(`New customer account registered: ${payload.customerName}`);
          }
        } catch (_) {
        }
        scheduleRentalEventSync();
      });
      source.addEventListener("finance.changed", scheduleRentalEventSync);
      source.addEventListener("data.changed", scheduleRentalEventSync);
      source.addEventListener("category.changed", scheduleRentalEventSync);
      source.addEventListener("settings.changed", scheduleRentalEventSync);
      source.addEventListener("security.alert", scheduleRentalEventSync);
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
    if (!user?.id || user.mustChangePassword) return;
    let active = true;
    const c = controllersRef.current;
    const warmPages = async () => {
      const current = pageRef.current;
      if (workspacePages.has(current) && current !== "Payments") await c.workspaceUI.load().catch(() => {
      });
      if (!active || userRef.current?.id !== user.id) return;
      await Promise.all([
        c.workspaceUI.preloadPages({ skipViews: [pageRef.current] }),
        c.inventoryController.prefetch()
      ]);
    };
    const timer = setTimeout(() => {
      void warmPages();
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
      c.workspaceUI.cancelPreload();
    };
  }, [user?.id, user?.mustChangePassword]);
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
      setOffline(false);
      if (userRef.current && !userRef.current.mustChangePassword) {
        void refresh({ force: true });
        rentalEventsDisabledRef.current = false;
        syncRentalEventStream(userRef.current.id);
        scheduleRentalEventSync();
      }
    };
    const handleOffline = () => setOffline(true);
    const handlePopState = () => {
      const nextPage = pageForPath(location.pathname);
      pageRef.current = nextPage;
      setPage(nextPage);
      if (nextPage === "Reports") {
        const sec = reportSectionForPath(location.pathname);
        c.workspaceUI.setReportSection(sec);
        setReportSection(sec);
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
    window.addEventListener("offline", handleOffline);
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
    const stopScanner = initHardwareBarcodeScanner({
      onScan: (code) => {
        if (!code) return;
        toast(`Scanned: ${code}`);
        if (/^R-[A-Z0-9]+$/i.test(code) || /^rp-rental-/i.test(code)) {
          c.workspaceUI?.openRentalLookup?.();
          const input = c.modal?.querySelector('input[name="code"], input[name="transactionCode"]');
          if (input) {
            input.value = code;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        } else if (/^EQ-[A-Z0-9]+$/i.test(code) || /^ITEM-[A-Z0-9]+$/i.test(code)) {
          c.workspaceUI?.openQuickReturn?.();
          const input = c.modal?.querySelector('input[name="code"], input[name="inventoryCode"]');
          if (input) {
            input.value = code;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      }
    });
    return () => {
      stopScanner();
      modal?.removeEventListener("close", handleModalClose);
      modal?.removeEventListener("click", handleModalClick);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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
              setLoginError("Sign-in is temporarily unavailable. Please try again shortly. If this continues, contact your system administrator.");
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
    setNavGroupExpanded((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem("rent-play-nav-groups", JSON.stringify(next));
      } catch {
      }
      return next;
    });
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
      workspaceLoading,
      offline,
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
  MessagesView,
  PageHeading,
  PasswordChangeView,
  ProfileView,
  SessionLoadingView,
  TerminalPendingBanner,
  WorkspaceModuleSection,
  WorkspaceShell,
  WorkspaceStatus,
  mountReactApp,
  navGroups,
  pageLabels,
  workspacePages
};
