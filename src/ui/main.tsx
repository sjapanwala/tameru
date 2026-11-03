import { render } from 'preact';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './styles/tokens.css';
import './styles/app.css';
import { resetIosBlur } from '../pwa/iosBlurReset';
import { listenForInstallPrompt } from '../pwa/install';
import { runAppInThisWindow } from '../pwa/standalone';
import { keepUpdated } from '../pwa/update';
import { InstallGate } from './gate/InstallGate';
import { hideSplash } from './splash';

keepUpdated();
resetIosBlur();

const root = document.getElementById('app')!;

if (runAppInThisWindow()) {
  // Loaded lazily so the gate never opens the database.
  import('./App').then(({ mountApp }) => mountApp(root));
} else {
  listenForInstallPrompt();
  render(<InstallGate />, root);
  hideSplash();
}
