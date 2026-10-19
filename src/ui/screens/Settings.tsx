import { useState } from 'preact/hooks';
import { S } from '../../copy/strings';
import type { Settings as SettingsT } from '../../domain/types';
import { exportCsv, exportJson, importCsv, importJson } from '../../data/exportImport';
import { eraseAllData } from '../../services/app';
import { periodContext, setPeriodConfig } from '../../services/plan';
import { Message, MoneyInput, PageHeader, download } from '../components';
import { useApp, useLoad } from '../hooks';

export function Settings() {
  const { app, bump } = useApp();
  const settings = useLoad((a) => a.repos.settings.get());
  const ctx = useLoad(periodContext);
  const incomes = useLoad((a) => a.repos.recurring.all())?.filter((r) => r.kind === 'income' && !r.archived && r.schedule.freq !== 'irregular') ?? [];
  const [msg, setMsg] = useState<string>();
  const [erase, setErase] = useState('');
  if (!settings || !ctx) return <div class="placeholder" />;
  const update = (patch: Partial<SettingsT>) => app.repos.settings.update(patch).then(bump);
  const period = ctx.plan.period;
  const today = app.clock.today();

  const readFile = (accept: string, fn: (text: string) => Promise<void>) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) await fn(await f.text());
    };
    input.click();
  };

  return (
    <section>
      <PageHeader title={S.settings.title} />
      <label>
        {S.settings.name}
        <input
          value={settings.userName ?? ''}
          autoComplete="name"
          onChange={(e) => update({ userName: (e.target as HTMLInputElement).value.trim() || undefined })}
        />
      </label>
      <fieldset>
        <legend>{S.settings.period}</legend>
        <label>
          <input type="radio" checked={period.kind === 'monthly'} onChange={() => setPeriodConfig(app, { kind: 'monthly', startDay: 1 }).then(bump)} /> {S.settings.month}
        </label>
        {period.kind === 'monthly' && (
          <label>
            {S.settings.monthFrom}{' '}
            <input
              type="number"
              min="1"
              max="28"
              value={period.startDay}
              onChange={(e) => setPeriodConfig(app, { kind: 'monthly', startDay: Math.min(28, Math.max(1, Number((e.target as HTMLInputElement).value) || 1)) }).then(bump)}
            />
          </label>
        )}
        {incomes.map((r) => (
          <label key={r.id}>
            <input type="radio" checked={period.kind === 'payday' && period.recurringId === r.id} onChange={() => setPeriodConfig(app, { kind: 'payday', recurringId: r.id }).then(bump)} />{' '}
            {S.settings.payday} ({r.name})
          </label>
        ))}
      </fieldset>
      <MoneyInput label={S.settings.buffer} value={settings.bufferCents} onCommit={(c) => update({ bufferCents: c })} />
      <label>
        <input type="checkbox" checked={settings.subtractCardBalances} onChange={(e) => update({ subtractCardBalances: (e.target as HTMLInputElement).checked })} /> {S.settings.cards}
      </label>
      <label>
        <input type="checkbox" checked={settings.autoPostRecurring} onChange={(e) => update({ autoPostRecurring: (e.target as HTMLInputElement).checked })} /> {S.settings.autoPost}
      </label>
      <label>
        <input type="checkbox" checked={settings.notificationsEnabled} onChange={(e) => update({ notificationsEnabled: (e.target as HTMLInputElement).checked })} /> {S.settings.notifications}
      </label>
      <label>
        {S.settings.freshDays}{' '}
        <input type="number" min="1" value={settings.freshStartDays} onChange={(e) => update({ freshStartDays: Number((e.target as HTMLInputElement).value) || 10 })} />
      </label>
      <label>
        {S.settings.freshBacklog}{' '}
        <input type="number" min="1" value={settings.freshStartBacklog} onChange={(e) => update({ freshStartBacklog: Number((e.target as HTMLInputElement).value) || 15 })} />
      </label>

      <h2>{S.settings.data}</h2>
      <p>
        <button type="button" onClick={async () => download(`tameru-backup-${today}.json`, await exportJson(app), 'application/json')}>{S.settings.exportJson}</button>
      </p>
      <p>
        <button type="button" onClick={async () => download(`tameru-transactions-${today}.csv`, await exportCsv(app), 'text/csv')}>{S.settings.exportCsv}</button>
      </p>
      <p>
        <button
          type="button"
          onClick={() =>
            readFile('application/json,.json', async (text) => {
              const r = await importJson(app, text);
              setMsg(r.ok ? S.backup.imported(r.records) : S.errors.importInvalid(r.error));
              bump();
            })
          }
        >
          {S.settings.importJson}
        </button>
      </p>
      <p>
        <button
          type="button"
          onClick={() =>
            readFile('text/csv,.csv', async (text) => {
              const r = await importCsv(app, text);
              setMsg(S.backup.csvImported(r.imported, r.skipped.length));
              bump();
            })
          }
        >
          {S.settings.importCsv}
        </button>
      </p>
      <Message text={msg} />
      <h2>{S.settings.reset}</h2>
      <p>{S.backup.wipeConfirm}</p>
      <label>
        {S.settings.resetConfirm} <input value={erase} onInput={(e) => setErase((e.target as HTMLInputElement).value)} />
      </label>
      <button
        type="button"
        disabled={erase !== 'ERASE'}
        onClick={async () => {
          await eraseAllData(app);
          setErase('');
          window.location.hash = '/';
          window.location.reload();
        }}
      >
        {S.settings.reset}
      </button>
    </section>
  );
}
