import React, { useEffect, useRef } from './react-shim.js';
import { initials } from './icons.jsx';

export function ProfileView({
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
    form.querySelector('input')?.focus();
    confirmSubmit(
      form,
      {
        title: 'Save profile changes?',
        description:
          'Your name and login email will be updated. Use the new email the next time you sign in.',
        confirmLabel: 'Yes, save changes'
      },
      async () => {
        const button = form.querySelector('[type="submit"]');
        const error = form.querySelector('.profile-error');
        button.disabled = true;
        error.textContent = '';
        try {
          const values = Object.fromEntries(new FormData(form));
          const result = await api('/profile', {
            method: 'PATCH',
            body: JSON.stringify(values)
          });
          onUserUpdated(result.user);
          onSetProfileEditing(false);
          toast('Profile updated.');
        } catch (problem) {
          error.textContent = problem.message;
          button.disabled = false;
        }
      }
    );
  }, [profileEditing, confirmSubmit, api, onUserUpdated, onSetProfileEditing, toast]);

  return (
    <div className="profile-layout">
      <section className="panel profile-card">
        <span className="profile-avatar">{initials(user.name)}</span>
        <h2>{user.name}</h2>
        <p>{user.email}</p>
        <span className="profile-role">{user.role}</span>
        <small>Account ID</small>
        <code>{user.account_code || 'Not assigned'}</code>
      </section>

      {profileEditing ? (
        <section className="panel profile-form-card">
          <span className="eyebrow">EDIT PROFILE</span>
          <h2>Update your details</h2>
          <p>
            Your name appears throughout the workspace. Your email is also your Firebase login.
          </p>
          <form id="profile-form" className="profile-form" ref={formRef}>
            <label>
              Full name
              <input
                name="fullName"
                defaultValue={user.name}
                minLength={2}
                maxLength={150}
                autoComplete="name"
                required
              />
            </label>
            <label>
              Login email
              <input
                name="email"
                type="email"
                defaultValue={user.email}
                maxLength={254}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Role
              <input defaultValue={user.role} disabled />
              <small>Account roles are managed separately for security.</small>
            </label>
            <p className="profile-error" role="alert" />
            <div className="profile-actions">
              <button
                className="secondary"
                id="profile-cancel"
                type="button"
                onClick={() => onSetProfileEditing(false)}
              >
                Cancel
              </button>
              <button className="primary" type="submit">
                Save changes
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="panel profile-overview">
          <div className="profile-overview-heading">
            <button
              className="primary"
              id="profile-edit"
              type="button"
              onClick={() => onSetProfileEditing(true)}
            >
              Edit profile
            </button>
          </div>
          <dl className="profile-details">
            <div>
              <dt>Full name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Login email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Account role</dt>
              <dd>{user.role}</dd>
            </div>
            <div>
              <dt>Account status</dt>
              <dd>
                <span className="profile-active">Active</span>
              </dd>
            </div>
          </dl>
          <div className="profile-note">
            <strong>Login details</strong>
            <p>
              If you change the email address, use the new email the next time you sign in.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
