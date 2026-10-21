import React, { useState, useEffect, useRef } from './react-shim.js';
import {
  bindAccountValidation,
  passwordError,
  passwordMatchError,
  passwordHelp
} from '../account-validation.js';

export function PasswordChangeView({
  user,
  rememberSession,
  api,
  onPasswordUpdated,
  onSignOutAgain,
  onSignOut
}) {
  const [showPasswords, setShowPasswords] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const formRef = useRef(null);
  const validationRef = useRef(null);

  useEffect(() => {
    document.title = 'Secure your account · Rent & Play';
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    validationRef.current = bindAccountValidation(form, {
      currentPassword: value => (value ? '' : 'Enter your current or temporary password.'),
      newPassword: value =>
        passwordError(value) ||
        (value === form.elements.currentPassword.value ? 'Choose a different password.' : ''),
      confirmPassword: value => passwordMatchError(form.elements.newPassword.value, value)
    });
  }, []);

  const handleSignOut = async () => {
    const form = formRef.current;
    const buttons = form ? [...form.querySelectorAll('button')] : [];
    buttons.forEach(btn => {
      btn.disabled = true;
    });
    try {
      await api('/auth/logout', { method: 'POST' });
      onSignOut();
    } catch (problem) {
      setErrorMsg(problem.message);
    } finally {
      buttons.forEach(btn => {
        btn.disabled = false;
      });
    }
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (!validationRef.current?.validate()) return;
    const form = formRef.current;
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const body = { ...Object.fromEntries(new FormData(form)), remember: rememberSession };
    const controls = [...form.querySelectorAll('input, button')];
    controls.forEach(control => {
      control.disabled = true;
    });
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Updating password…';
    setErrorMsg('');
    try {
      const result = await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (result.signInAgain) {
        onSignOutAgain('Password updated. Sign in with your new password.');
        return;
      }
      await onPasswordUpdated(result.user);
    } catch (problem) {
      setErrorMsg(problem.message);
    } finally {
      if (form.isConnected) {
        controls.forEach(control => {
          control.disabled = false;
        });
        button.removeAttribute('aria-busy');
        button.textContent = 'Update password';
      }
    }
  };

  const inputType = showPasswords ? 'text' : 'password';

  return (
    <main className="password-change-page">
      <section className="password-change-card">
        <img className="session-logo" src="/public/logo.png" alt="Rent & Play" />
        <h1>Secure your account</h1>
        <p>
          Choose your own password before opening your{' '}
          {user.role === 'OWNER' ? 'Owner' : 'Operator'} workspace.
        </p>
        <form id="required-password-form" className="admin-form" ref={formRef} onSubmit={handleSubmit}>
          <label>
            Current / temporary password
            <input
              name="currentPassword"
              type={inputType}
              autoComplete="current-password"
              maxLength={1024}
              required
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type={inputType}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            <small>{passwordHelp}</small>
          </label>
          <label>
            Confirm new password
            <input
              name="confirmPassword"
              type={inputType}
              autoComplete="new-password"
              maxLength={128}
              required
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              id="change-show-passwords"
              checked={showPasswords}
              onChange={e => setShowPasswords(e.target.checked)}
            />{' '}
            Show passwords
          </label>
          <p className="form-error" role="alert">
            {errorMsg}
          </p>
          <button className="primary" type="submit">
            Update password
          </button>
          <button type="button" className="secondary" id="change-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
