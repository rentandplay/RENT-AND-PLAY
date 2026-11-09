import React, { useState, useEffect, useRef } from './react-shim.js';
import { Icon, BrandLogo, SportArtSvg, escape, icon, cleanErrorMessage } from './icons.jsx';
import {
  bindAccountValidation,
  emailError,
  passwordError,
  passwordMatchError,
  passwordHelp
} from '../account-validation.js';

export function SessionLoadingView() {
  return (
    <main className="session-loading" aria-live="polite">
      <div className="session-loading-card">
        <img className="session-logo" src="/public/logo.png" alt="Rent and Play" />
        <div className="session-brand-copy">
          <strong>
            rent<span className="orange">&</span>play
          </strong>
          <small>RENTAL MANAGEMENT</small>
        </div>
        <span className="session-spinner" aria-hidden="true" />
        <p>Opening your workspace…</p>
      </div>
    </main>
  );
}

export function LoginView({
  initialError = '',
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
    document.title = 'Sign in · Rent & Play';
  }, []);

  useEffect(() => {
    setErrorMsg(cleanErrorMessage(initialError));
  }, [initialError]);

  useEffect(() => {
    if (!formRef.current) return;
    validationRef.current = bindAccountValidation(formRef.current, {
      email: emailError,
      password: value => (value ? '' : 'Enter your password.')
    });
  }, []);

  const openForgotPassword = () => {
    const emailInput = formRef.current?.querySelector('#email');
    const state = {
      step: 'email',
      email: (emailInput?.value || '').trim().toLowerCase(),
      code: '',
      token: '',
      requestKey: '',
      newPassword: '',
      confirmPassword: '',
      notice: '',
      error: '',
      busy: false,
      resendAt: 0
    };
    const resetSteps = [
      ['email', 'Verify email'],
      ['code', 'Enter code'],
      ['password', 'New password']
    ];
    const spinner = label => `<span class="button-spinner" aria-hidden="true"></span> ${label}`;

    function updateResend() {
      const button = modal.querySelector('[data-reset-resend]');
      if (!button) {
        setPasswordResetCountdown(null);
        return;
      }
      const seconds = Math.max(0, Math.ceil((state.resendAt - Date.now()) / 1000));
      button.disabled = state.busy || seconds > 0;
      button.textContent = seconds ? `Resend code in ${seconds}s` : 'Resend code';
      if (!seconds) setPasswordResetCountdown(null);
    }

    async function sendCode() {
      if (state.busy) return;
      state.busy = true;
      state.error = '';
      state.notice = '';
      renderResetModal();
      try {
        const result = await api('/auth/password-reset/request', {
          method: 'POST',
          body: JSON.stringify({ email: state.email })
        });
        state.step = 'code';
        state.code = '';
        state.token = '';
        state.requestKey = '';
        state.notice =
          result.message || 'If an active account exists for this email, a verification code has been sent.';
        state.resendAt = Date.now() + 30000;
      } catch (problem) {
        state.error = problem.message;
      } finally {
        state.busy = false;
        renderResetModal();
      }
      if (state.step === 'code') {
        const timer = setInterval(() => {
          if (!modal.open) {
            setPasswordResetCountdown(null);
            return;
          }
          updateResend();
        }, 1000);
        setPasswordResetCountdown(timer);
      }
    }

    function renderResetModal() {
      const currentStep = resetSteps.findIndex(([id]) => id === state.step);
      const steps =
        currentStep < 0
          ? ''
          : `<ol class="password-reset-steps" aria-label="Password reset steps">${resetSteps
              .map(
                ([id, label], index) =>
                  `<li class="${state.step === id ? 'current' : index < currentStep ? 'complete' : ''}" data-reset-step="${id}"${
                    state.step === id ? ' aria-current="step"' : ''
                  }><span>${index + 1}</span>${label}</li>`
              )
              .join('')}</ol>`;
      const stepContent =
        state.step === 'email'
          ? `<div class="password-reset-intro"><span class="reset-step-icon">${icon('mail')}</span><p class="eyebrow">ACCOUNT RECOVERY</p><h3>Reset your password</h3><p>Enter the email address linked to your account. We’ll send a one-time code to verify it’s you.</p></div><form id="reset-form" class="admin-form password-reset-form"><label for="reset-email">Account email</label><input id="reset-email" name="email" type="email" autocomplete="email" autocapitalize="none" maxlength="254" value="${escape(state.email)}" placeholder="you@example.com" required/><p class="form-error" role="alert">${escape(state.error)}</p><button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? spinner('Sending code…') : 'Send verification code'}</button><button class="text-button reset-back-link" type="button" data-reset-close>Back to sign in</button></form>`
          : state.step === 'code'
            ? `<div class="password-reset-intro"><span class="reset-step-icon">${icon('mail')}</span><p class="eyebrow">VERIFY YOUR EMAIL</p><h3>Enter your code</h3><p>Enter the 6-digit code to continue. Check your inbox and spam folder if it doesn’t appear.</p></div><div class="reset-email-notice" role="status">${escape(state.notice || 'If an active account exists for this email, a verification code has been sent.')}</div><form id="reset-form" class="admin-form password-reset-form"><label for="reset-code">6-digit verification code for <strong>${escape(state.email)}</strong></label><input id="reset-code" class="password-reset-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" value="${escape(state.code)}" aria-describedby="reset-code-help" required/><small id="reset-code-help">The code expires in 10 minutes. Never share it with anyone.</small><p class="form-error" role="alert">${escape(state.error)}</p><button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? spinner('Verifying…') : 'Verify code'}</button><div class="reset-secondary-actions"><button class="text-button" type="button" data-reset-resend>Resend code</button><button class="text-button" type="button" data-reset-edit-email>Use another email</button></div></form>`
            : state.step === 'password'
              ? `<div class="password-reset-intro"><span class="reset-step-icon">${icon('lock')}</span><p class="eyebrow">EMAIL VERIFIED</p><h3>Choose a new password</h3><p>Your code was verified. Set a new password to finish securing your account.</p></div><form id="reset-form" class="admin-form password-reset-form"><label for="reset-password">New password</label><input id="reset-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" value="${escape(state.newPassword)}" required/><small>${passwordHelp}</small><label for="reset-confirm">Confirm new password</label><input id="reset-confirm" name="confirmPassword" type="password" autocomplete="new-password" maxlength="128" value="${escape(state.confirmPassword)}" required/><label class="checkbox reset-show-password"><input type="checkbox" id="reset-show-password"/> Show passwords</label><p class="form-error" role="alert">${escape(state.error)}</p><button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? spinner('Updating password…') : 'Update password'}</button><button class="text-button reset-back-link" type="button" data-reset-restart ${state.busy ? 'disabled' : ''}>Start over</button></form>`
              : `<div class="password-reset-complete"><span class="reset-step-icon success">${icon('check')}</span><p class="eyebrow">PASSWORD UPDATED</p><h3>You’re all set</h3><p>Your password has been changed. Sign in with your new password to continue.</p><button class="primary" type="button" data-reset-finished>Back to sign in</button></div>`;

      showModal('Account recovery', `<div class="password-reset-flow">${steps}${stepContent}</div>`);
      const form = modal.querySelector('#reset-form');
      if (form && state.step === 'email') {
        const validation = bindAccountValidation(form, { email: emailError });
        form.onsubmit = async event => {
          event.preventDefault();
          if (state.busy || !validation.validate()) return;
          state.email = form.elements.email.value.trim().toLowerCase();
          await sendCode();
        };
      } else if (form && state.step === 'code') {
        const code = form.elements.code;
        code.oninput = () => {
          code.value = code.value.replace(/\D/g, '').slice(0, 6);
          state.code = code.value;
        };
        form.onsubmit = async event => {
          event.preventDefault();
          if (state.busy || !form.reportValidity()) return;
          state.code = code.value;
          state.busy = true;
          state.error = '';
          renderResetModal();
          try {
            const result = await api('/auth/password-reset/verify', {
              method: 'POST',
              body: JSON.stringify({ email: state.email, code: state.code })
            });
            state.token = result.verificationToken;
            state.requestKey = crypto.randomUUID();
            state.step = 'password';
            state.code = '';
            state.newPassword = '';
            state.confirmPassword = '';
            state.notice = '';
            state.error = '';
          } catch (problem) {
            state.error = problem.message;
          } finally {
            state.busy = false;
            renderResetModal();
          }
        };
        modal.querySelector('[data-reset-resend]').onclick = () => sendCode();
        modal.querySelector('[data-reset-edit-email]').onclick = () => {
          state.step = 'email';
          state.code = '';
          state.token = '';
          state.error = '';
          state.notice = '';
          state.resendAt = 0;
          renderResetModal();
        };
        updateResend();
      } else if (form && state.step === 'password') {
        const validation = bindAccountValidation(form, {
          newPassword: passwordError,
          confirmPassword: value => passwordMatchError(form.elements.newPassword.value, value)
        });
        modal.querySelector('#reset-show-password').onchange = event => {
          for (const field of [form.elements.newPassword, form.elements.confirmPassword]) {
            field.type = event.target.checked ? 'text' : 'password';
          }
        };
        modal.querySelector('[data-reset-restart]').onclick = () => {
          state.step = 'email';
          state.code = '';
          state.token = '';
          state.requestKey = '';
          state.newPassword = '';
          state.confirmPassword = '';
          state.error = '';
          state.notice = '';
          renderResetModal();
        };
        form.onsubmit = async event => {
          event.preventDefault();
          if (state.busy || !validation.validate()) return;
          state.busy = true;
          state.error = '';
          const values = Object.fromEntries(new FormData(form));
          state.newPassword = values.newPassword;
          state.confirmPassword = values.confirmPassword;
          renderResetModal();
          try {
            await api('/auth/password-reset/complete', {
              method: 'POST',
              body: JSON.stringify({
                ...values,
                email: state.email,
                verificationToken: state.token,
                requestKey: state.requestKey
              })
            });
            state.step = 'done';
            state.token = '';
            state.requestKey = '';
            state.newPassword = '';
            state.confirmPassword = '';
            state.error = '';
          } catch (problem) {
            state.error = problem.message;
          } finally {
            state.busy = false;
            renderResetModal();
          }
        };
      }
      modal.querySelector('[data-reset-close]')?.addEventListener('click', () => modal.close());
      modal.querySelector('[data-reset-finished]')?.addEventListener('click', () => {
        const loginEmail = document.querySelector('#email');
        if (loginEmail) loginEmail.value = state.email;
        modal.close();
      });
      modal.querySelector('#reset-email, #reset-code, #reset-password')?.focus({ preventScroll: true });
    }

    renderResetModal();
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validationRef.current?.validate()) return;
    const form = formRef.current;
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const rememberChecked = form.querySelector('#remember').checked;
    const body = {
      email: form.querySelector('#email').value,
      password: form.querySelector('#password').value,
      remember: rememberChecked
    };
    const loginStarted = performance.now();
    const controls = [...form.querySelectorAll('input, button')];
    controls.forEach(control => {
      control.disabled = true;
    });
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Signing in…';
    setErrorMsg('');
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(body) });
      await onLoginSuccess(result.user, rememberChecked);
    } catch (error) {
      setErrorMsg(cleanErrorMessage(error.message));
    } finally {
      const remaining = 500 - (performance.now() - loginStarted);
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
      if (form.isConnected) {
        controls.forEach(control => {
          control.disabled = false;
        });
        button.removeAttribute('aria-busy');
        button.textContent = 'Sign in';
      }
    }
  };

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <main className="login">
      <section className="login-story">
        <a className="brand" href="#">
          <BrandLogo />
        </a>
        <div className="story-body">
          <span className="eyebrow">LESS PAPERWORK. MORE PLAY.</span>
          <h1>
            Good times.
            <br />
            Greatly managed<span className="orange">.</span>
          </h1>
          <p>
            Your equipment, rentals, and returns.
            <br />
            All together in one happy place.
          </p>
          <div className="login-art">
            <SportArtSvg />
          </div>
          <div className="story-features">
            <span>
              <Icon name="box" /> Know what’s available
            </span>
            <span>
              <Icon name="clock" /> Stay ahead of due dates
            </span>
            <span>
              <Icon name="chip" /> Verify every handoff
            </span>
          </div>
        </div>
        <footer>
          Made for Rent &amp; Play <span>Los Baños, Laguna</span>
        </footer>
      </section>
      <section className="login-form-side">
        <div className="login-header">
          <span className="workspace-label">OWNER / OPERATOR WORKSPACE</span>
          <button
            id="login-theme"
            className="theme-button"
            type="button"
            aria-label={themeLabel}
            title={themeLabel}
            onClick={onToggleTheme}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
        <div className="login-form-wrap">
          <div className="welcome-icon">
            <Icon name="grid" />
          </div>
          <h2>Welcome back!</h2>
          <p>Sign in to manage your rentals.</p>
          <form id="login-form" ref={formRef} onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="username" maxLength={254} required />
            <div className="label-line">
              <label htmlFor="password">Password</label>
              <button className="text-button" type="button" id="forgot" onClick={openForgotPassword}>
                Forgot password?
              </button>
            </div>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                maxLength={1024}
                required
              />
              <button
                type="button"
                id="show-password"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(prev => !prev)}
              >
                <Icon name="eye" />
              </button>
            </div>
            <label className="checkbox">
              <input id="remember" type="checkbox" /> Remember me on this device
            </label>
            <p id="login-error" role="alert">
              {errorMsg}
            </p>
            <button className="primary login-submit" type="submit">
              Sign in
            </button>
          </form>
          <p className="login-foot">Your account. Your equipment. Your workspace.</p>
        </div>
        <footer>
          © {new Date().getFullYear()} Rent &amp; Play <span>Built for more play.</span>
        </footer>
      </section>
    </main>
  );
}
