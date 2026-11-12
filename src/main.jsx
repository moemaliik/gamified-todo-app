import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Surface any uncaught renderer error directly in the DOM instead of a
// silent blank parchment screen — cheap defensive UX, and it also makes
// bugs screenshot-visible during dev/QA without needing devtools open.
function showFatalError(label, err) {
  const el = document.getElementById('root');
  if (el) {
    el.innerHTML = `<pre style="color:#B33A3A;padding:16px;white-space:pre-wrap;font-family:monospace;font-size:12px;">${label}\n${err && err.stack ? err.stack : err}</pre>`;
  }
}
window.addEventListener('error', (e) => showFatalError('window error:', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showFatalError('unhandled rejection:', e.reason));

try {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  showFatalError('render threw:', err);
}
