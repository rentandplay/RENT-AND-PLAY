import React from './react-shim.js';

// A rendering failure should leave navigation and recovery controls usable.
export class WorkspaceErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="panel workspace-status" role="alert">
      <h2>This page was interrupted</h2>
      <p>Please try opening it again. If this continues, contact your system administrator.</p>
      <button className="primary" type="button" onClick={() => { this.setState({ failed: false }); this.props.onRetry?.(); }}>Try again</button>
      {this.props.onHome && <button className="secondary" type="button" onClick={this.props.onHome}>Go to Dashboard</button>}
    </section>;
  }
}
