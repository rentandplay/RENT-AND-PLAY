import React from './react-shim.js';
import { Icon } from './icons.jsx';

export function WorkspaceStatus({ loading, error, offline, hasData, onRetry }) {
  if (hasData && !error && !offline) return null;
  if (hasData) return <div className="workspace-recovery-notice" role="status">
    <div><strong>{offline ? 'You’re offline' : 'Updates are temporarily paused'}</strong>
      <p>{offline ? 'Reconnect to get the latest updates.' : error} Showing the last loaded records; they may have changed.</p></div>
    <button type="button" className="secondary" onClick={onRetry} disabled={loading || offline}>{loading ? 'Checking…' : 'Try again'}</button>
  </div>;
  const waiting = loading && !offline;
  return <section className="panel workspace-status" role={waiting ? 'status' : 'alert'} aria-busy={waiting}>
    <div className="workspace-status-symbol" aria-hidden="true">{waiting ? <span className="session-spinner" /> : <Icon name="refresh" />}</div>
    <h2>{offline ? 'You’re offline' : waiting ? 'Opening your workspace' : 'We couldn’t load your workspace'}</h2>
    <p>{offline ? 'Reconnect to the internet. We’ll check for updates when you’re back online.' : waiting ? 'Getting your latest rentals and equipment ready…' : error || 'Please try again. If this continues, contact your system administrator.'}</p>
    {!waiting && <button type="button" className="primary" onClick={onRetry} disabled={offline}>Try again</button>}
    {waiting && <div className="workspace-status-skeleton" aria-hidden="true"><i /><i /><i /></div>}
  </section>;
}
