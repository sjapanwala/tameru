// Scans a receipt photo on the device and shows what it found: vendor, total,
// card (matched to the user's account by its last four) and date. One tap hands
// it to the Add sheet to confirm.

import { useEffect, useState } from 'preact/hooks';
import { fmtWeekday, money, S } from '../copy/strings';
import type { OcrPhase } from '../data/ocr';
import { readReceipt, type ReceiptResult } from '../services/receipts';
import { useApp } from './hooks';
import { haptic } from './motion';
import { setAddPrefill } from './prefill';
import { go } from './router';

export function ReceiptScanner({ file, onClose, onRetake }: { file: File; onClose: () => void; onRetake: () => void }) {
  const { app } = useApp();
  const [url] = useState(() => URL.createObjectURL(file));
  const [progress, setProgress] = useState<{ phase: OcrPhase; fraction: number }>({ phase: 'preparing', fraction: 0 });
  const [result, setResult] = useState<ReceiptResult | null>(null);

  useEffect(() => {
    let live = true;
    readReceipt(app, file, (phase, fraction) => live && setProgress({ phase, fraction })).then((r) => {
      if (!live) return;
      setResult(r);
      haptic(r.status === 'read' ? 12 : 20);
    });
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const add = () => {
    if (result?.status !== 'read') return;
    const d = result.draft;
    setAddPrefill({
      ...(d.amountCents !== undefined ? { amountCents: d.amountCents } : {}),
      ...(d.merchant ? { merchant: d.merchant } : {}),
      ...(d.date ? { date: d.date } : {}),
      ...(result.account ? { accountId: result.account.id } : {}),
    });
    onClose();
    go('/add');
  };

  const enterManually = () => {
    onClose();
    go('/add');
  };

  return (
    <div class="scanner">
      <div class={`scanner__photo${result ? '' : ' scanner__photo--reading'}`}>
        <img src={url} alt={S.receipt.title} />
        {!result && <span class="scanner__beam" aria-hidden="true" />}
      </div>

      {!result && (
        <div class="scanner__status" aria-live="polite">
          <p>{progress.phase === 'reading' ? S.receipt.reading : S.receipt.preparing}</p>
          <span class="scanner__bar">
            <span style={{ width: `${Math.round((progress.phase === 'reading' ? 0.15 + progress.fraction * 0.85 : 0.08) * 100)}%` }} />
          </span>
        </div>
      )}

      {result?.status === 'read' && (
        <div class="scanner__result">
          <p class="eyebrow">{S.receipt.found}</p>
          <p class="scanner__total">{money(result.draft.amountCents!)}</p>
          <p class="scanner__vendor">{result.draft.merchant ?? S.receipt.noVendor}</p>
          <ul class="receipt">
            <li>
              <span>{S.receipt.card}</span>
              <span class="leader" />
              <span>
                {result.draft.last4 ? `•••• ${result.draft.last4}` : S.receipt.notShown}
                {result.account && <strong> · {result.account.name}</strong>}
              </span>
            </li>
            <li>
              <span>{S.receipt.date}</span>
              <span class="leader" />
              <span>{result.draft.date ? fmtWeekday(result.draft.date) : S.receipt.notShown}</span>
            </li>
          </ul>
          {result.draft.last4 && !result.account && <p class="note">{S.receipt.noCardMatch(result.draft.last4)}</p>}
          <div class="sheet__actions">
            <button type="button" class="primary block" onClick={add}>
              {S.receipt.add}
            </button>
            <button type="button" class="link scanner__again" onClick={onRetake}>
              {S.receipt.retake}
            </button>
          </div>
        </div>
      )}

      {result && result.status !== 'read' && (
        <div class="scanner__result">
          <h2>{S.receipt.problem[result.status]}</h2>
          <p class="muted">{S.receipt.problemHint[result.status]}</p>
          <button type="button" class="primary block" onClick={onRetake}>
            {S.receipt.retake}
          </button>
          <button type="button" class="link scanner__again" onClick={enterManually}>
            {S.receipt.enter}
          </button>
        </div>
      )}
    </div>
  );
}
