// The only thing Tameru shows in a browser tab. It must stay self-contained:
// nothing here (or imported from here) may touch the database or the app's
// routes. src/gate/gate.test.ts enforces that.

import qrcode from 'qrcode-generator';
import { useMemo, useState, type ReactNode } from 'react';
import type { Platform } from '../domain/platform';
import { promptInstall, useCanPromptInstall, useJustInstalled } from '../pwa/install';
import { currentPlatform } from '../pwa/standalone';
import './gate.css';

/** The address to install from: this page, without hash or query. */
function appUrl(): string {
  return window.location.origin + window.location.pathname;
}

// ---- small pieces --------------------------------------------------------

function Glyph({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="install__glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const SHARE = (
  <>
    <path d="M12 15V3.5M8 7l4-4 4 4" />
    <path d="M7.5 10.5H6v10h12v-10h-1.5" />
  </>
);
const ADD_SQUARE = (
  <>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8.5v7M8.5 12h7" />
  </>
);
const CHECK = <path d="m5 12.5 4.5 4.5L19 7.5" />;
const COPY = (
  <>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </>
);

function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      // Some in-app browsers block the clipboard; the address below is selectable.
      setState('failed');
    }
  }

  return (
    <div className="install__copy">
      <button
        type="button"
        className="install__btn install__btn--outline"
        onClick={() => void copy()}
      >
        <Glyph size={18}>{state === 'copied' ? CHECK : COPY}</Glyph>
        {state === 'copied' ? 'Link copied' : 'Copy link'}
      </button>
      <p className="install__url" aria-live="polite">
        {state === 'failed' && <span>Couldn't copy. Select the address instead: </span>}
        <span className="install__url-text">{url.replace(/^https?:\/\//, '')}</span>
      </p>
    </div>
  );
}

function QrCode({ url }: { url: string }) {
  const { path, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { path: d, size: count };
  }, [url]);

  // Always dark-on-white with a quiet zone, whatever the theme: scanners need it.
  return (
    <svg
      className="install__qr"
      viewBox={`-3 -3 ${size + 6} ${size + 6}`}
      role="img"
      aria-label="QR code for this page's address"
      shapeRendering="crispEdges"
    >
      <rect x={-3} y={-3} width={size + 6} height={size + 6} rx={1.5} fill="#fff" />
      <path d={path} fill="#151714" />
    </svg>
  );
}

interface StepProps {
  title: string;
  children: ReactNode;
  art: ReactNode;
}

function Step({ title, children, art }: StepProps) {
  return (
    <li className="install__step">
      <div className="install__art" aria-hidden="true">
        {art}
      </div>
      <div className="install__step-text">
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </li>
  );
}

// ---- step illustrations (decorative) --------------------------------------

const ArtShare = (
  <svg viewBox="0 0 96 64" fill="none">
    <rect x="6" y="38" width="84" height="20" rx="10" className="art-fill" />
    <path d="M22 48h6M34 48h6M68 48h6" className="art-dim" />
    <circle cx="52" cy="48" r="13" className="art-accent-fill" />
    <path
      d="M52 51.500V42M48.500 45l3.500-3.500 3.500 3.500M48 48.500h-1.500v6h11v-6H56"
      className="art-on-accent"
    />
    <rect x="18" y="8" width="60" height="22" rx="6" className="art-line" />
    <path d="M28 16h26M28 22h16" className="art-dim" />
  </svg>
);

const ArtAdd = (
  <svg viewBox="0 0 96 64" fill="none">
    <rect x="8" y="6" width="80" height="52" rx="10" className="art-fill" />
    <path d="M18 18h30M18 46h24" className="art-dim" />
    <rect x="13" y="25" width="70" height="14" rx="5" className="art-accent-fill" />
    <path d="M20 32h28" className="art-on-accent" />
    <rect x="68" y="27.500" width="9" height="9" rx="2.500" className="art-on-accent" />
    <path d="M72.500 30v4M70.500 32h4" className="art-on-accent" />
  </svg>
);

const ArtHome = (
  <svg viewBox="0 0 96 64" fill="none">
    <rect x="26" y="4" width="44" height="56" rx="9" className="art-line" />
    <rect x="33" y="12" width="12" height="12" rx="3.500" className="art-fill" />
    <rect x="51" y="12" width="12" height="12" rx="3.500" className="art-fill" />
    <rect x="33" y="30" width="12" height="12" rx="3.500" className="art-accent-fill" />
    <rect x="51" y="30" width="12" height="12" rx="3.500" className="art-fill" />
    <path d="M36.500 34.500h5M39 34.500v5" className="art-on-accent" />
    <path d="M42 53h12" className="art-dim" />
  </svg>
);

// ---- per-platform content --------------------------------------------------

function IosSafari() {
  return (
    <ol className="install__steps">
      <Step title="Tap Share" art={ArtShare}>
        It's the <Glyph size={16}>{SHARE}</Glyph> button in Safari's toolbar. If you don't see it,
        tap ••• first.
      </Step>
      <Step title="Choose Add to Home Screen" art={ArtAdd}>
        Scroll down the list to find <Glyph size={16}>{ADD_SQUARE}</Glyph> Add to Home Screen, then
        tap Add.
      </Step>
      <Step title="Open Tameru from your home screen" art={ArtHome}>
        Close Safari and tap the Tameru icon. Setup takes under a minute.
      </Step>
    </ol>
  );
}

function OpenElsewhere({ browser, inApp }: { browser: 'Safari' | 'Chrome'; inApp: boolean }) {
  return (
    <section className="install__card">
      <h2>Open this page in {browser}</h2>
      <p>
        {inApp
          ? `This app's built-in browser can't install Tameru. Use its menu (••• or the compass icon) to open the page in ${browser}, or copy the link and paste it there.`
          : `Tameru installs from ${browser}. Copy the link, open ${browser}, and paste it into the address bar.`}
      </p>
      <CopyLink url={appUrl()} />
    </section>
  );
}

function AndroidChrome() {
  const canPrompt = useCanPromptInstall();
  const installed = useJustInstalled();

  if (installed) {
    return (
      <section className="install__card">
        <h2>Tameru is installed</h2>
        <p>Close this tab and open Tameru from your home screen or app drawer.</p>
      </section>
    );
  }

  return (
    <>
      {canPrompt && (
        <button type="button" className="install__btn" onClick={() => void promptInstall()}>
          Install Tameru
        </button>
      )}
      <section className="install__card">
        <h2>{canPrompt ? 'Or install by hand' : 'Install from the Chrome menu'}</h2>
        <ol className="install__list">
          <li>Tap the ⋮ menu at the top right of Chrome.</li>
          <li>
            Tap <strong>Add to Home screen</strong>, then <strong>Install</strong>.
          </li>
          <li>Open Tameru from your home screen.</li>
        </ol>
      </section>
    </>
  );
}

function Desktop() {
  const url = appUrl();
  return (
    <section className="install__card install__card--qr">
      <QrCode url={url} />
      <div>
        <h2>Scan to install</h2>
        <p>
          Point your phone's camera at the code, open the link, and follow the steps there to add
          Tameru to your home screen.
        </p>
        <CopyLink url={url} />
      </div>
    </section>
  );
}

const CONTENT: Record<Platform, () => ReactNode> = {
  ios_safari: () => <IosSafari />,
  ios_other_browser: () => <OpenElsewhere browser="Safari" inApp={false} />,
  ios_in_app_browser: () => <OpenElsewhere browser="Safari" inApp />,
  android_chrome: () => <AndroidChrome />,
  android_other: () => <OpenElsewhere browser="Chrome" inApp={false} />,
  desktop: () => <Desktop />,
};

export function InstallGate({ platform = currentPlatform() }: { platform?: Platform }) {
  const desktop = platform === 'desktop';
  return (
    <main className={`install${desktop ? ' install--desktop' : ''}`}>
      <header className="install__head">
        <img className="install__logo" src="icons/icon-192.png" alt="" width={64} height={64} />
        <h1>{desktop ? 'Tameru lives on your phone' : 'Install Tameru'}</h1>
        <p className="install__pitch">
          Know what you can safely spend today. Private, offline, and all on your device.
        </p>
      </header>

      {CONTENT[platform]()}

      <footer className="install__foot">
        <p>
          <strong>Already installed?</strong> Open Tameru from your home screen.
        </p>
        <p>No account. No tracking. Your data never leaves your phone.</p>
      </footer>
    </main>
  );
}
