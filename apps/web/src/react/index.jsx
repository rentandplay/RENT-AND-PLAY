import React, { createRoot } from './react-shim.js';
import { App } from './App.jsx';

export { App } from './App.jsx';
export { SessionLoadingView, LoginView } from './LoginView.jsx';
export { PasswordChangeView } from './PasswordChangeView.jsx';
export { DashboardView } from './DashboardView.jsx';
export { ProfileView } from './ProfileView.jsx';
export { MessagesView } from './MessagesView.jsx';
export {
  WorkspaceShell,
  PageHeading,
  InventorySection,
  WorkspaceModuleSection,
  navGroups,
  pageLabels,
  workspacePages
} from './WorkspaceLayout.jsx';

export function mountReactApp(container = document.querySelector('#app')) {
  if (!container) return null;
  const root = createRoot(container);
  root.render(<App />);
  return root;
}
