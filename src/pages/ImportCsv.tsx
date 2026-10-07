import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type ChangeEvent } from 'react';
import {
  addTransactions,
  deleteTransactions,
  findImportProfile,
  listRules,
  listTransactions,
  saveImportProfile,
} from '../db/repo';
import { columnNames, csvSignature, guessMapping, parseCsv, planCsvImport } from '../domain/csv';
import { shortDate } from '../domain/dates';
import { formatMoney } from '../domain/money';
import type { CsvMapping } from '../domain/types';
import { useApp } from '../ui/context';
import { AlertIcon, CheckIcon } from '../ui/Icons';
import { PageHeader } from '../ui/PageHeader';
import { navigate } from '../ui/router';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PREVIEW_ROWS = 5;

interface Loaded {
  fileName: string;
  rows: string[][];
  signature: string;
  /** Name of the remembered layout this file matched, if any. */
  matchedProfile: string | null;
}

export function ImportCsv() {
  const { settings, accounts, categories, showToast } = useApp();
  const rules = useLiveQuery(listRules, []);
  const existing = useLiveQuery(() => listTransactions(), []);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [profileName, setProfileName] = useState('');
  const [accountId, setAccountId] = useState(settings.defaultAccountId ?? accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) return setError('That file is too large (limit 10 MB).');
    const rows = parseCsv(await file.text());
    if (rows.length < 2 || Math.max(...rows.map((row) => row.length)) < 2) {
      return setError("That doesn't look like a CSV of transactions.");
    }
    const guess = guessMapping(rows);
    const signature = csvSignature(rows, guess.hasHeader);
    const profile = await findImportProfile(signature);
    setLoaded({ fileName: file.name, rows, signature, matchedProfile: profile?.name ?? null });
    setMapping(profile?.mapping ?? guess);
    setProfileName(profile?.name ?? file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
  }

  const plan = useMemo(
    () =>
      loaded && mapping && rules && existing && accountId
        ? planCsvImport({
            rows: loaded.rows,
            mapping,
            accountId,
            currency: settings.currency,
            rules,
            existing,
          })
        : null,
    [loaded, mapping, rules, existing, accountId, settings.currency],
  );

  async function runImport() {
    if (!plan || !loaded || !mapping || plan.ready.length === 0) return;
    setBusy(true);
    try {
      const ids = await addTransactions(plan.ready);
      await saveImportProfile(loaded.signature, profileName.trim() || 'Bank import', mapping);
      const review = plan.ready.filter((tx) => tx.needsReview).length;
      showToast({
        message: `Imported ${ids.length} transactions${review ? `, ${review} to review` : ''}.`,
        actionLabel: 'Undo',
        onAction: () => deleteTransactions(ids),
      });
      navigate('/activity');
    } catch (cause) {
      console.error(cause);
      setError('Import failed. Nothing was added.');
      setBusy(false);
    }
  }

  const names = loaded && mapping ? columnNames(loaded.rows, mapping.hasHeader) : [];
  const set = (changes: Partial<CsvMapping>) =>
    setMapping((current) => (current ? { ...current, ...changes } : current));
  const split = mapping?.amountColumn === -1;

  const columnSelect = (label: string, value: number, onChange: (column: number) => void) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <select
        className="input"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {names.map((name, i) => (
          <option key={i} value={i}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <PageHeader title="Import CSV" backTo="/settings" />

      <section className="card stack">
        <p className="field__hint">
          Download a CSV of transactions from your bank's website, then choose it here. The file is
          read on this device and never uploaded.
        </p>
        <label className="btn btn--primary file-btn">
          {loaded ? 'Choose a different file' : 'Choose CSV file'}
          <input
            className="visually-hidden"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => void onFile(event)}
          />
        </label>
        {loaded && (
          <p className="field__hint">
            <strong>{loaded.fileName}</strong> · {loaded.rows.length - (mapping?.hasHeader ? 1 : 0)}{' '}
            rows
          </p>
        )}
        {error && (
          <p className="notice notice--warn" role="alert">
            <AlertIcon size={20} />
            <span>{error}</span>
          </p>
        )}
      </section>

      {loaded && mapping && (
        <section className="card stack" aria-labelledby="csv-columns">
          <h2 id="csv-columns" className="card__title">
            Columns
          </h2>
          {loaded.matchedProfile ? (
            <p className="notice notice--good">
              <CheckIcon size={20} />
              <span>
                Using your saved layout <strong>{loaded.matchedProfile}</strong>.
              </span>
            </p>
          ) : (
            <p className="field__hint">
              Tameru guessed these from the file. Check them against the preview below.
            </p>
          )}

          <div className="field-pair">
            {columnSelect('Date', mapping.dateColumn, (dateColumn) => set({ dateColumn }))}
            <label className="field">
              <span className="field__label">Date order</span>
              <select
                className="input"
                value={mapping.dateFormat}
                onChange={(event) =>
                  set({ dateFormat: event.target.value as CsvMapping['dateFormat'] })
                }
              >
                <option value="YMD">YYYY-MM-DD</option>
                <option value="MDY">MM/DD/YYYY</option>
                <option value="DMY">DD/MM/YYYY</option>
              </select>
            </label>
          </div>
          {columnSelect('Description', mapping.descriptionColumn, (descriptionColumn) =>
            set({ descriptionColumn }),
          )}

          <label className="field">
            <span className="field__label">Amounts are in</span>
            <select
              className="input"
              value={split ? 'split' : 'single'}
              onChange={(event) =>
                event.target.value === 'split'
                  ? set({
                      amountColumn: -1,
                      debitColumn: Math.max(mapping.debitColumn, 0),
                      creditColumn: Math.max(mapping.creditColumn, 0),
                    })
                  : set({ amountColumn: 0, debitColumn: -1, creditColumn: -1 })
              }
            >
              <option value="single">One amount column</option>
              <option value="split">Separate money-out and money-in columns</option>
            </select>
          </label>
          {split ? (
            <div className="field-pair">
              {columnSelect('Money out', mapping.debitColumn, (debitColumn) =>
                set({ debitColumn }),
              )}
              {columnSelect('Money in', mapping.creditColumn, (creditColumn) =>
                set({ creditColumn }),
              )}
            </div>
          ) : (
            <>
              {columnSelect('Amount', mapping.amountColumn, (amountColumn) =>
                set({ amountColumn }),
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={mapping.invertAmount}
                  onChange={(event) => set({ invertAmount: event.target.checked })}
                />
                <span>
                  Purchases are positive numbers
                  <span className="field__hint check__hint">
                    Common on credit card exports. Flips every sign.
                  </span>
                </span>
              </label>
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={mapping.hasHeader}
              onChange={(event) => set({ hasHeader: event.target.checked })}
            />
            <span>First row is a header</span>
          </label>

          {accounts.length > 1 && (
            <label className="field">
              <span className="field__label">Import into</span>
              <select
                className="input"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field__label">Remember this layout as</span>
            <input
              className="input"
              type="text"
              maxLength={40}
              autoComplete="off"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
            />
            <span className="field__hint">
              Next time a file from this bank is recognised automatically.
            </span>
          </label>
        </section>
      )}

      {plan && (
        <section className="card stack" aria-labelledby="csv-preview">
          <h2 id="csv-preview" className="card__title">
            Preview
          </h2>
          {plan.ready.length > 0 ? (
            <ul className="row-list">
              {plan.ready.slice(0, PREVIEW_ROWS).map((tx, i) => (
                <li key={i} className="due">
                  <span className="row-btn__main">
                    <span className="row-btn__title">{tx.merchant || 'No description'}</span>
                    <span className="row-btn__detail">
                      {shortDate(tx.date)} ·{' '}
                      {tx.amountCents > 0
                        ? 'Income'
                        : (categories.find((c) => c.id === tx.categoryId)?.name ?? 'Needs review')}
                    </span>
                  </span>
                  <span className={`tx__amount num${tx.amountCents > 0 ? ' tx__amount--in' : ''}`}>
                    {formatMoney(tx.amountCents, settings.currency, { signed: true })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field__hint">Nothing new to import with these settings.</p>
          )}
          <dl className="facts">
            <div>
              <dt>New transactions</dt>
              <dd className="num">{plan.ready.length}</dd>
            </div>
            <div>
              <dt>Already in Tameru (skipped)</dt>
              <dd className="num">{plan.duplicates}</dd>
            </div>
            <div>
              <dt>Unreadable rows (skipped)</dt>
              <dd className="num">{plan.errors.length}</dd>
            </div>
          </dl>
          {plan.errors.length > 0 && (
            <p className="notice notice--warn">
              <AlertIcon size={20} />
              <span>
                {plan.errors
                  .slice(0, 3)
                  .map((e) => `Row ${e.row}: ${e.reason.toLowerCase()}`)
                  .join('. ')}
                {plan.errors.length > 3 ? `, and ${plan.errors.length - 3} more.` : '.'} If most
                rows fail, check the date order and columns above.
              </span>
            </p>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || plan.ready.length === 0}
            onClick={() => void runImport()}
          >
            {busy
              ? 'Importing…'
              : `Import ${plan.ready.length} transaction${plan.ready.length === 1 ? '' : 's'}`}
          </button>
        </section>
      )}
    </>
  );
}
