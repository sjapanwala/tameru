// Four quick-add slots on Home. Tap a filled slot to log it (with Undo);
// hold it (or right-click) to edit; tap an empty slot to set one up.

import { useRef, useState } from 'preact/hooks';
import { money, S } from '../copy/strings';
import { quickLabel } from '../domain/quick';
import type { QuickAction } from '../domain/types';
import { logQuick, quickSlots, undoQuick } from '../services/quick';
import { ChipSelect } from './components';
import { useApp, useLoad } from './hooks';
import { PlusIcon } from './Icons';
import { haptic } from './motion';
import { QuickIcon } from './quickIcons';
import { go } from './router';
import { Sheet } from './Sheet';
import { toast } from './toast';
import { orderedAccounts } from '../services/accounts';

const HOLD_MS = 450;

export function QuickRow() {
  const { app, bump } = useApp();
  const slots = useLoad(quickSlots);
  const accounts = useLoad(orderedAccounts)?.filter((a) => !a.archived && a.type !== 'investing') ?? [];
  const [asking, setAsking] = useState<QuickAction | null>(null);
  const held = useRef(false);
  const timer = useRef(0);
  if (!slots) return <div class="quick" />;

  const edit = (slot: number) => go(`/quick?slot=${slot}`);
  const log = async (q: QuickAction, accountId?: string) => {
    const tx = await logQuick(app, q.id, accountId);
    haptic(12);
    bump();
    toast(S.quick.logged(quickLabel(q), q.amountCents), {
      label: S.common.undo,
      run: async () => {
        await undoQuick(app, tx.id);
        toast(S.quick.undone);
        bump();
      },
    });
  };
  const tap = (q: QuickAction) => {
    if (held.current) return; // the press was a hold: the editor already opened
    if (q.accountId === 'ask') setAsking(q);
    else void log(q);
  };
  const startHold = (slot: number) => {
    held.current = false;
    timer.current = window.setTimeout(() => {
      held.current = true;
      haptic(15);
      edit(slot);
    }, HOLD_MS);
  };
  const endHold = () => window.clearTimeout(timer.current);

  return (
    <>
      <div class="quick" role="group" aria-label={S.quick.title}>
        {slots.map((q, i) =>
          q ? (
            <button
              type="button"
              key={i}
              class="quick__slot"
              aria-label={`${quickLabel(q)} ${money(q.amountCents)}`}
              onPointerDown={() => startHold(i)}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onPointerCancel={endHold}
              onContextMenu={(e) => {
                e.preventDefault();
                endHold();
                edit(i);
              }}
              onClick={() => tap(q)}
            >
              <span class="quick__disc">
                <QuickIcon name={q.icon} />
              </span>
              <span class="quick__label">{quickLabel(q)}</span>
              <span class="quick__price">{money(q.amountCents)}</span>
            </button>
          ) : (
            <button type="button" key={i} class="quick__slot quick__slot--empty" aria-label={S.quick.setUp} onClick={() => edit(i)}>
              <span class="quick__disc">
                <PlusIcon />
              </span>
              <span class="quick__label">&nbsp;</span>
              <span class="quick__price">&nbsp;</span>
            </button>
          ),
        )}
      </div>
      {asking && (
        <Sheet label={S.quick.whichAccount(quickLabel(asking))} onClose={() => setAsking(null)}>
          <p class="field-label">{S.quick.whichAccount(quickLabel(asking))}</p>
          <ChipSelect
            label={S.quick.from}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            onChange={(id) => {
              const q = asking;
              setAsking(null);
              void log(q, id);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
