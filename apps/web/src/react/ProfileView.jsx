import React, { useState, useEffect, useRef } from './react-shim.js';
import { initials, Icon } from './icons.jsx';

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
  const fileInputRef = useRef(null);
  const [copiedId, setCopiedId] = useState(false);
  const [customAvatar, setCustomAvatar] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(`rent_play_avatar_${user?.id || user?.email || 'active'}`) || '';
    }
    return '';
  });

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
          onUserUpdated({ ...(result?.user || user), avatar: customAvatar });
          onSetProfileEditing(false);
          toast?.('Profile updated successfully.');
        } catch (problem) {
          error.textContent = problem.message;
          button.disabled = false;
        }
      }
    );
  }, [profileEditing, confirmSubmit, api, onUserUpdated, onSetProfileEditing, toast, user, customAvatar]);

  const handlePhotoSelect = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast?.('Please select an image file (PNG, JPG, or WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          setCustomAvatar(dataUrl);
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(`rent_play_avatar_${user?.id || user?.email || 'active'}`, dataUrl);
          }
          onUserUpdated?.({ ...user, avatar: dataUrl });
          toast?.('Profile picture updated.');
        } catch (_) {
          toast?.('Failed to process image.');
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setCustomAvatar('');
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(`rent_play_avatar_${user?.id || user?.email || 'active'}`);
    }
    onUserUpdated?.({ ...user, avatar: '' });
    toast?.('Profile picture removed.');
  };

  const handleCopyId = () => {
    const code = user.account_code || 'USER-003';
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
        toast?.(`Copied Account ID: ${code}`);
      }).catch(() => {});
    }
  };

  const isOwner = String(user.role || '').toUpperCase() === 'OWNER';
  const roleDisplay = isOwner ? 'Store Owner' : 'Store Operator';
  const accountCode = user.account_code || 'USER-003';

  return (
    <div className="profile-wrapper">
      <section className="panel profile-single-card">
        {/* PROFILE HEADER / AVATAR ROW */}
        <div className="profile-card-header">
          <div className="profile-avatar-container">
            <div className="profile-clean-avatar">
              {customAvatar ? (
                <img src={customAvatar} alt={user.name} className="profile-clean-avatar-img" />
              ) : (
                <span className="profile-clean-avatar-txt">{initials(user.name)}</span>
              )}
              <label
                className="profile-avatar-camera-btn"
                title="Change profile picture"
                aria-label="Change profile picture"
              >
                <Icon name="camera" />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                  hidden
                />
              </label>
            </div>

            <div className="profile-header-details">
              <div className="profile-header-name-row">
                <h2>{user.name}</h2>
                <span className="profile-role-badge">
                  <Icon name="shield" /> {roleDisplay}
                </span>
                <span className="profile-status-pill">
                  <span className="profile-dot-indicator" /> Active
                </span>
              </div>
              <p className="profile-header-email">{user.email}</p>
              <div className="profile-avatar-action-row">
                <button
                  type="button"
                  className="profile-photo-change-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="camera" /> {customAvatar ? 'Change photo' : 'Upload photo'}
                </button>
                {customAvatar ? (
                  <>
                    <span className="profile-action-sep">•</span>
                    <button
                      type="button"
                      className="profile-photo-remove-btn"
                      onClick={handleRemovePhoto}
                    >
                      Remove photo
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="profile-header-action">
            {!profileEditing ? (
              <button
                className="primary profile-action-btn"
                id="profile-edit"
                data-profile-edit="true"
                type="button"
                onClick={() => onSetProfileEditing(true)}
              >
                <Icon name="edit" /> Edit profile
              </button>
            ) : (
              <button
                className="secondary profile-action-btn"
                type="button"
                onClick={() => onSetProfileEditing(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="profile-card-divider" />

        {/* DETAILS GRID OR EDIT FORM */}
        {profileEditing ? (
          <div className="profile-edit-body">
            <div className="profile-edit-intro">
              <span className="eyebrow">EDIT PROFILE</span>
              <h3>Update your details</h3>
              <p>Your name appears across rental receipts and counter records. Your email is your workspace login.</p>
            </div>

            <form id="profile-form" className="profile-form" ref={formRef}>
              <div className="profile-form-grid">
                <label>
                  <span>Full name <b className="required-star">*</b></span>
                  <input
                    name="fullName"
                    defaultValue={user.name}
                    minLength={2}
                    maxLength={150}
                    autoComplete="name"
                    placeholder="e.g. Juan Dela Cruz"
                    required
                  />
                </label>

                <label>
                  <span>Login email <b className="required-star">*</b></span>
                  <input
                    name="email"
                    type="email"
                    defaultValue={user.email}
                    maxLength={254}
                    autoComplete="email"
                    placeholder="e.g. rentandplay0@gmail.com"
                    required
                  />
                </label>
              </div>

              <label className="profile-form-role-field">
                <span>Account Role</span>
                <input
                  defaultValue={isOwner ? 'Store Owner (OWNER)' : 'Store Operator (OPERATOR)'}
                  disabled
                />
                <small>System roles are managed separately in Settings &gt; Staff.</small>
              </label>

              <div className="profile-form-notice">
                <Icon name="mail" />
                <div>
                  <strong>Important note on email changes</strong>
                  <p>If you change your login email, use your new email the next time you sign into Rent &amp; Play.</p>
                </div>
              </div>

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
                  <Icon name="check" /> Save changes
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="profile-grid-details">
            <div className="profile-grid-cell">
              <div className="profile-cell-header">
                <span className="profile-cell-icon"><Icon name="users" /></span>
                <span className="profile-cell-label">Full Name</span>
              </div>
              <div className="profile-cell-value">
                <strong>{user.name}</strong>
              </div>
            </div>

            <div className="profile-grid-cell">
              <div className="profile-cell-header">
                <span className="profile-cell-icon"><Icon name="mail" /></span>
                <span className="profile-cell-label">Login Email</span>
              </div>
              <div className="profile-cell-value">
                <strong>{user.email}</strong>
                <span className="profile-verified-badge"><Icon name="check" /> Verified</span>
              </div>
            </div>

            <div className="profile-grid-cell">
              <div className="profile-cell-header">
                <span className="profile-cell-icon"><Icon name="store" /></span>
                <span className="profile-cell-label">Store Branch</span>
              </div>
              <div className="profile-cell-value">
                <strong>Rent &amp; Play · Lakewood, Los Baños</strong>
              </div>
            </div>

            <div className="profile-grid-cell">
              <div className="profile-cell-header">
                <span className="profile-cell-icon"><Icon name="shield" /></span>
                <span className="profile-cell-label">Account Role</span>
              </div>
              <div className="profile-cell-value">
                <strong>{roleDisplay}</strong>
                <span className="profile-val-hint">
                  {isOwner ? 'Full store control, rates & reports' : 'Counter rentals & returns'}
                </span>
              </div>
            </div>

            <div className="profile-grid-cell profile-grid-cell-full">
              <div className="profile-cell-header">
                <span className="profile-cell-icon"><Icon name="qr" /></span>
                <span className="profile-cell-label">Account ID</span>
              </div>
              <div className="profile-cell-value">
                <button
                  type="button"
                  className="profile-copy-id-chip"
                  onClick={handleCopyId}
                  title="Click to copy Account ID"
                >
                  <code>{accountCode}</code>
                  <span className="profile-copy-txt">
                    <Icon name="copy" /> {copiedId ? 'Copied!' : 'Copy'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
