import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import './styles/tokens.css';
import './styles/app.css';
// Imported for its side effect: starts listening for the install prompt.
import './pwa/install';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initServiceWorker } from './pwa/sw';
import { gated, Root } from './Root';

// The gate has nothing to lose, so it takes updates immediately; the app asks first.
initServiceWorker(gated ? 'auto' : 'prompt');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
