// Shown when Tameru is opened in a normal browser tab. Must not import the app or storage.

import { useEffect, useState } from 'preact/hooks';
import { S } from '../../copy/strings';
import { canPromptInstall, onInstallAvailabilityChange, promptInstall } from '../../pwa/install';
import { detectPlatform } from '../../pwa/standalone';

export function InstallGate() {
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  useEffect(() => onInstallAvailabilityChange(() => setCanInstall(canPromptInstall())), []);

  const steps = platform === 'ios' ? S.gate.iosSteps : platform === 'android' ? S.gate.androidSteps : S.gate.otherSteps;
  return (
    <main>
      <h1>{S.gate.title}</h1>
      <p>{S.gate.intro}</p>
      <ol>
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {canInstall && (
        <button type="button" onClick={() => promptInstall()}>
          {S.gate.installButton}
        </button>
      )}
      <p>
        <small>{S.gate.devHint}</small>
      </p>
    </main>
  );
}
