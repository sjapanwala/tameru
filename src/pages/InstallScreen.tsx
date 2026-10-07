import { useState } from 'react';
import { promptInstall, useCanPromptInstall } from '../pwa/install';
import { detectPlatform, type Platform } from '../pwa/standalone';
import { AddSquareIcon, AlertIcon, DotsIcon, ShareIcon } from '../ui/Icons';

function Steps({ platform }: { platform: Platform }) {
  switch (platform) {
    case 'ios-safari':
      return (
        <ol className="steps">
          <li>
            Tap the <strong>Share</strong> button <ShareIcon size={20} /> in Safari's toolbar.
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong> <AddSquareIcon size={20} />.
          </li>
          <li>
            Tap <strong>Add</strong>, then open Tameru from your Home Screen.
          </li>
        </ol>
      );
    case 'ios-other':
      return (
        <ol className="steps">
          <li>
            For the most reliable install, open this page in <strong>Safari</strong>.
          </li>
          <li>
            Tap <strong>Share</strong> <ShareIcon size={20} />, then{' '}
            <strong>Add to Home Screen</strong> <AddSquareIcon size={20} />.
          </li>
          <li>
            Tap <strong>Add</strong>, then open Tameru from your Home Screen.
          </li>
        </ol>
      );
    case 'android':
      return (
        <ol className="steps">
          <li>
            Open the browser menu <DotsIcon size={20} />.
          </li>
          <li>
            Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </li>
          <li>Open Tameru from your home screen.</li>
        </ol>
      );
    case 'desktop':
      return (
        <ol className="steps">
          <li>Tameru is designed for your phone. Open this address there to install it.</li>
          <li>
            On a computer, use the install icon in the address bar, or the browser menu's{' '}
            <strong>Install Tameru</strong> option.
          </li>
        </ol>
      );
  }
}

export function InstallScreen({ onContinueInBrowser }: { onContinueInBrowser(): void }) {
  const platform = detectPlatform();
  const canPrompt = useCanPromptInstall();
  const [installed, setInstalled] = useState(false);

  async function install() {
    if ((await promptInstall()) === 'accepted') setInstalled(true);
  }

  return (
    <main className="gate">
      <img className="gate__icon" src="icons/icon-192.png" alt="" width={84} height={84} />
      <h1 className="gate__title">Install Tameru</h1>
      <p className="gate__lede">
        Tameru keeps your budget on this device only. Add it to your home screen so your data has a
        permanent home and the app works offline.
      </p>

      {installed ? (
        <div className="card">
          <p className="card__text">
            <strong>Installed.</strong> Close this tab and open Tameru from your home screen.
          </p>
        </div>
      ) : (
        <div className="card">
          <h2 className="card__title">Add to Home Screen</h2>
          {canPrompt && (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => void install()}
            >
              Install Tameru
            </button>
          )}
          {canPrompt && <p className="card__hint">Or install by hand:</p>}
          <Steps platform={platform} />
        </div>
      )}

      <div className="notice notice--warn">
        <AlertIcon size={20} />
        <p>
          <strong>Don't enter data here yet.</strong> A browser tab and the installed app keep
          separate storage, so anything you add in this tab won't appear in the installed app, and
          the browser may clear it.
        </p>
      </div>

      <button type="button" className="btn btn--quiet btn--block" onClick={onContinueInBrowser}>
        Continue in the browser anyway
      </button>
    </main>
  );
}
