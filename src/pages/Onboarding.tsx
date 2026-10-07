import { useState, type FormEvent } from 'react';
import { completeOnboarding } from '../db/repo';
import { CURRENCIES, DEFAULT_CATEGORIES, DEFAULT_CURRENCY } from '../domain/defaults';
import { parseMoneyInput } from '../domain/money';
import { CheckIcon } from '../ui/Icons';
import { ImportBackup } from '../ui/ImportBackup';

export function Onboarding() {
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [accountName, setAccountName] = useState('Chequing');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const startingBalanceCents = balance.trim() === '' ? 0 : parseMoneyInput(balance, currency);
    if (startingBalanceCents === null) {
      setError('Enter the balance as a number, like 1250.00');
      return;
    }
    setBusy(true);
    try {
      await completeOnboarding({ currency, accountName, startingBalanceCents });
    } catch (cause) {
      console.error(cause);
      setError('Could not save. Check that this browser allows storage and try again.');
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <h1 className="gate__title">Welcome to Tameru</h1>
      <p className="gate__lede">Three quick things and you're ready to log your first expense.</p>

      <form className="stack" onSubmit={(event) => void submit(event)}>
        <div className="card stack">
          <label className="field">
            <span className="field__label">Currency</span>
            <select
              className="input"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {CURRENCIES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {code} · {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Main account</span>
            <input
              className="input"
              type="text"
              required
              maxLength={40}
              autoComplete="off"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">Balance today</span>
            <input
              className="input num"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              aria-describedby={error ? 'balance-error' : 'balance-hint'}
              aria-invalid={error ? true : undefined}
              value={balance}
              onChange={(event) => {
                setBalance(event.target.value);
                setError(null);
              }}
            />
            {error ? (
              <span id="balance-error" className="field__error" role="alert">
                {error}
              </span>
            ) : (
              <span id="balance-hint" className="field__hint">
                What's in the account right now. You can leave it at zero.
              </span>
            )}
          </label>
        </div>

        <div className="card">
          <h2 className="card__title">Starter categories</h2>
          <ul className="chip-wrap chip-wrap--static">
            {DEFAULT_CATEGORIES.map((name) => (
              <li key={name} className="chip chip--static">
                <CheckIcon size={16} />
                {name}
              </li>
            ))}
          </ul>
        </div>

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Setting up…' : 'Start using Tameru'}
        </button>
      </form>

      <div className="gate__alt">
        <p>Moving from another device?</p>
        <ImportBackup
          label="Restore from a backup file"
          className="btn btn--quiet"
          onImported={() => {}}
        />
      </div>
    </main>
  );
}
