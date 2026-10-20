import { render } from 'preact';
import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-sans/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import './styles/tokens.css';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { listenForInstallPrompt } from '../pwa/install';
import { runAppInThisWindow } from '../pwa/standalone';
import { InstallGate } from './gate/InstallGate';

registerSW({ immediate: true });

const root = document.getElementById('app')!;

if (runAppInThisWindow()) {
  // Loaded lazily so the gate never opens the database.
  import('./App').then(({ mountApp }) => mountApp(root));
} else {
  listenForInstallPrompt();
  render(
    <div class="shell shell--bare">
      <InstallGate />
    </div>,
    root,
  );
}
