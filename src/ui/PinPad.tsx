// Passcode entry (dots + a number pad) and the lock screen built on it.

import { useEffect, useState } from 'preact/hooks';
import { S } from '../copy/strings';
import type { AppLock } from '../domain/types';
import { eraseAllData } from '../services/app';
import { checkPasscode, passkeyUnlock } from '../services/lock';
import { useApp } from './hooks';
import { haptic } from './motion';
import { Sheet } from './Sheet';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'extra', '0', 'back'] as const;

/** Dots and a number pad. Calls onComplete once `digits` are entered; `error` shakes and clears it. */
export function PinEntry(props: { digits: number; title: string; sub?: string; error?: string; onComplete: (code: string) => void; extra?: { label: string; icon: preact.ComponentChildren; run: () => void } }) {
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(0);
  useEffect(() => {
    if (!props.error) return;
    setShake((n) => n + 1);
    setCode('');
    haptic(30);
  }, [props.error]);
  const press = (k: (typeof KEYS)[number]) => {
    if (k === 'extra') return props.extra?.run();
    haptic(5);
    if (k === 'back') return setCode((c) => c.slice(0, -1));
    const next = (code + k).slice(0, props.digits);
    setCode(next);
    if (next.length === props.digits) window.setTimeout(() => (props.onComplete(next), setCode('')), 120);
  };
  // A hardware keyboard works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div class="pin">
      <p class="pin__title">{props.title}</p>
      <p class={`pin__sub${props.error ? ' pin__sub--error' : ''}`}>{props.error ?? props.sub ?? ' '}</p>
      <div class={`pin__dots${shake ? ' pin__dots--shake' : ''}`} key={shake} aria-label={S.lock.entered(code.length, props.digits)}>
        {Array.from({ length: props.digits }, (_, i) => (
          <span key={i} class={i < code.length ? 'on' : ''} />
        ))}
      </div>
      <div class="pin__pad">
        {KEYS.map((k) =>
          k === 'extra' ? (
            props.extra ? (
              <button type="button" key={k} class="pin__key pin__key--icon" aria-label={props.extra.label} onClick={() => press(k)}>
                {props.extra.icon}
              </button>
            ) : (
              <span key={k} />
            )
          ) : (
            <button type="button" key={k} class={`pin__key${k === 'back' ? ' pin__key--icon' : ''}`} aria-label={k === 'back' ? S.add.backspace : k} onClick={() => press(k)}>
              {k === 'back' ? '⌫' : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

export const FaceIdIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1 3.6 1 5 0" />
  </svg>
);

/** Shown instead of the app while it's locked. */
export function LockScreen({ lock, onUnlock }: { lock: AppLock; onUnlock: () => void }) {
  const { app } = useApp();
  const [error, setError] = useState<string>();
  const [tries, setTries] = useState(0);
  const [forgot, setForgot] = useState(false);
  const [erase, setErase] = useState('');
  const faceId = async () => {
    if (await passkeyUnlock(lock)) onUnlock();
  };
  // Offer Face ID straight away when it's set up.
  useEffect(() => {
    if (lock.passkeyId) void faceId();
  }, []);
  return (
    <div class="lock">
      <img class="lock__icon" src="./icons/apple-touch-icon.png" alt="" width={56} height={56} />
      <PinEntry
        digits={lock.digits}
        title={S.lock.enter}
        error={error}
        onComplete={async (code) => {
          if (await checkPasscode(app, code)) return onUnlock();
          setTries((n) => n + 1);
          setError(S.lock.wrong);
          window.setTimeout(() => setError(undefined), 1200);
        }}
        extra={lock.passkeyId ? { label: S.lock.faceId, icon: <FaceIdIcon />, run: faceId } : undefined}
      />
      <button type="button" class="link lock__forgot" onClick={() => setForgot(true)}>
        {tries >= 3 ? S.lock.forgotAfterTries : S.lock.forgot}
      </button>
      {forgot && (
        <Sheet label={S.lock.forgot} onClose={() => setForgot(false)}>
          <div class="onb-sheet">
            <h2>{S.lock.forgotTitle}</h2>
            <p class="muted">{S.lock.forgotBody}</p>
            <label class="field">
              {S.settings.resetConfirm}
              <input value={erase} autoCapitalize="characters" onInput={(e) => setErase((e.target as HTMLInputElement).value)} />
            </label>
            <div class="sheet__actions">
              <button
                type="button"
                class="primary block danger"
                disabled={erase !== 'ERASE'}
                onClick={async () => {
                  await eraseAllData(app);
                  window.location.hash = '/';
                  window.location.reload();
                }}
              >
                {S.settings.reset}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
