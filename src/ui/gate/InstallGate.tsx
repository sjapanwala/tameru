// Shown when Tameru is opened in a normal browser tab. Must not import the app or storage.
// A short landing page; the install goes through <pwa-install>. On Apple devices it shows
// its native-looking sheet (with the Add to Home Screen steps), opened automatically. On
// Chrome/Android the button goes straight to the browser's own install prompt; the
// package's sheet (which can't be restyled there) only appears as a fallback with steps.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { PWAInstallElement } from '@khmyznikov/pwa-install';
import { S } from '../../copy/strings';
import { takeInstallPrompt } from '../../pwa/install';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'pwa-install': preact.HTMLAttributes<HTMLElement> & Record<string, unknown>;
    }
  }
}

/** On Apple devices the install sheet opens by itself shortly after the page settles. */
const AUTO_OPEN_MS = 900;

export function InstallGate() {
  const el = useRef<PWAInstallElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Loaded on demand so the app bundle never carries it.
    import('@khmyznikov/pwa-install').then(async () => {
      await customElements.whenDefined('pwa-install');
      const node = el.current!;
      node.externalPromptEvent = takeInstallPrompt(); // captured at boot, before this loaded
      node.styles = { '--tint-color': '#111111' };
      setReady(true);
      // Checked after the delay: the element finishes detecting the platform asynchronously.
      window.setTimeout(() => (node.isAppleMobilePlatform || node.isAppleDesktopPlatform) && node.showDialog(true), AUTO_OPEN_MS);
    });
  }, []);
  const install = () => {
    const node = el.current;
    if (!node) return;
    if (node.isInstallAvailable && !node.isAppleMobilePlatform && !node.isAppleDesktopPlatform) void node.install();
    else node.showDialog(true);
  };

  return (
    <main class="install">
      <section class="install__hero">
        <img class="install__icon" src="./icons/apple-touch-icon.png" alt="" width={88} height={88} />
        <h1>{S.gate.name}</h1>
        <p class="install__tagline">{S.gate.tagline}</p>
      </section>

      <ul class="install__points">
        {S.gate.points.map(([title, body]) => (
          <li key={title}>
            <span class="install__tick" aria-hidden="true" />
            <span>
              <strong>{title}</strong>
              <small>{body}</small>
            </span>
          </li>
        ))}
      </ul>

      <div class="install__cta">
        <button type="button" class="primary block" disabled={!ready} onClick={install}>
          {S.gate.installButton}
        </button>
        <p class="install__fine">{S.gate.fine}</p>
      </div>

      <pwa-install
        ref={el}
        manual-apple
        manual-chrome
        disable-screenshots-chrome
        manifest-url="./manifest.webmanifest"
        install-description={S.gate.installDescription}
      />
    </main>
  );
}
