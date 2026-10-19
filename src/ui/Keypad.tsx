// Number pad for amount entry. The hardware keyboard works too (handled by the caller).

import type { KeypadKey } from '../domain/amountEntry';
import { haptic } from './motion';

const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

export function Keypad({ onKey, backLabel }: { onKey: (k: KeypadKey) => void; backLabel: string }) {
  return (
    <div class="keypad">
      {KEYS.map((k) => (
        <button
          type="button"
          key={k}
          class="keypad__key"
          aria-label={k === 'back' ? backLabel : k}
          onClick={() => {
            haptic(5);
            onKey(k);
          }}
        >
          {k === 'back' ? '⌫' : k}
        </button>
      ))}
    </div>
  );
}
