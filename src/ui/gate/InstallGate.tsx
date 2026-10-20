// Shown when Tameru is opened in a normal browser tab. Must not import the app or storage.
// A short landing page in the product site's look; the install goes through <pwa-install>. On Apple devices it shows
// its native-looking sheet (with the Add to Home Screen steps), opened automatically. On
// Chrome/Android the button goes straight to the browser's own install prompt; the
// package's sheet (which can't be restyled there) only appears as a fallback with steps.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { PWAInstallElement } from '@khmyznikov/pwa-install';
import { S } from '../../copy/strings';
import { takeInstallPrompt } from '../../pwa/install';
import { versionLabel } from '../version';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'pwa-install': preact.HTMLAttributes<HTMLElement> & Record<string, unknown>;
    }
  }
}

/** On Apple devices the install sheet opens by itself shortly after the page settles. */
const AUTO_OPEN_MS = 900;

/** The Plan screen's ring of 100 ticks, two-thirds lit, like the logo. */
function Dial() {
  return (
    <svg class="gate__dial" viewBox="-100 -100 200 200">
      {Array.from({ length: 100 }, (_, i) => {
        const a = (i / 100) * Math.PI * 2 - Math.PI / 2;
        const r1 = i % 10 === 0 ? 84 : 88;
        return (
          <line
            key={i}
            class={i < 68 ? 'lit' : undefined}
            style={{ '--i': i }}
            x1={(Math.cos(a) * r1).toFixed(2)}
            y1={(Math.sin(a) * r1).toFixed(2)}
            x2={(Math.cos(a) * 95).toFixed(2)}
            y2={(Math.sin(a) * 95).toFixed(2)}
          />
        );
      })}
    </svg>
  );
}

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
    <main class="gate">
      <header class="gate__bar">
        <img src="./icons/apple-touch-icon.png" alt="" width={30} height={30} />
        tameru
        <span class="gate__ver">{versionLabel}</span>
      </header>

      {/* On iPhone this is everything above the install sheet. */}
      <section class="gate__hero">
        <div class="gate__copy">
          <p class="gate__eyebrow">{S.gate.eyebrow}</p>
          <h1>
            {S.gate.headline} <mark>{S.gate.highlight}</mark>
          </h1>
          <p class="gate__lede">{S.gate.lede}</p>
        </div>
        <div class="gate__stage" aria-hidden="true">
          <Dial />
          <div class="gate__phone">
            <img src="./screenshots/home.png" alt="" width={780} height={1688} />
          </div>
        </div>
      </section>

      <section class="gate__rest">
        <ul class="gate__points">
          {S.gate.points.map(([title, body]) => (
            <li key={title}>
              <span>
                <strong>{title}</strong>
                <small>{body}</small>
              </span>
            </li>
          ))}
        </ul>
        <div class="gate__cta">
          <button type="button" disabled={!ready} onClick={install}>
            {S.gate.installButton}
          </button>
          <p class="gate__fine">{S.gate.fine}</p>
          <p class="gate__fine gate__legal">
            <a href="https://tameru.cc/privacy/">{S.gate.privacy}</a> · <a href="https://tameru.cc/terms/">{S.gate.terms}</a>
          </p>
        </div>
      </section>

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
