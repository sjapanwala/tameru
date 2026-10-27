// Settings, as grouped lists: profile, budget, reminders, security (app lock), fresh
// start, data, and erasing. Anything that needs more than a switch opens a sheet.

import { useEffect, useState } from 'preact/hooks';
import { money, S } from '../../copy/strings';
import { exportCsv, exportJson, importCsv, importJson } from '../../data/exportImport';
import { initials } from '../../domain/onboarding';
import { THEME_IDS, type AppLock, type PeriodConfig, type Settings as SettingsT, type ThemeId } from '../../domain/types';
import { eraseAllData } from '../../services/app';
import { checkPasscode, enablePasskey, passkeyAvailable, RELOCK_OPTIONS_MS, removeLock, setPasscode, updateLock } from '../../services/lock';
import { periodContext, setPeriodConfig } from '../../services/plan';
import { download, Message, MoneyInput, PageHeader, Switch } from '../components';
import { useApp, useLoad } from '../hooks';
import { CheckIcon, ChevronRight, PersonIcon } from '../Icons';
import { PinEntry } from '../PinPad';
import { Sheet } from '../Sheet';
import { addAllToCalendar } from '../calendar';
import { versionLabel } from '../version';

type Editing = 'name' | 'period' | 'buffer' | 'lockOn' | 'lockChange' | 'lockOff' | 'relock' | 'erase';

export function Settings() {
  const { app, bump } = useApp();
  const settings = useLoad((a) => a.repos.settings.get());
  const ctx = useLoad(periodContext);
  const incomes = useLoad((a) => a.repos.recurring.all())?.filter((r) => r.kind === 'income' && !r.archived && r.schedule.freq !== 'irregular') ?? [];
  const [msg, setMsg] = useState<string>();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => void passkeyAvailable().then(setCanPasskey), []);
  if (!settings || !ctx) return <div class="placeholder" />;
  const update = (patch: Partial<SettingsT>) => app.repos.settings.update(patch).then(bump);
  const period = ctx.plan.period;
  const today = app.clock.today();
  const lock = settings.lock;
  const close = () => (setEditing(null), bump());

  const periodText =
    period.kind === 'monthly'
      ? S.settings.monthFromDay(period.startDay)
      : S.settings.paydayOf(incomes.find((r) => r.id === period.recurringId)?.name ?? S.settings.payday);

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
    <section class="settings">
      <PageHeader title={S.settings.title} />

      <button type="button" class="settings-profile" onClick={() => setEditing('name')}>
        <span class="mark settings-profile__mark">{initials(settings.userName) || <PersonIcon />}</span>
        <span class="settings-profile__text">
          <strong>{settings.userName || S.settings.addName}</strong>
          <small>{S.settings.profileSub}</small>
        </span>
        <ChevronRight />
      </button>

      <Group title={S.settings.groups.theme} note={S.settings.themeNote}>
        <ThemePicker value={settings.theme ?? 'ink'} onChange={(theme) => update({ theme: theme === 'ink' ? undefined : theme })} />
      </Group>

      <Group title={S.settings.groups.budget}>
        <Row label={S.settings.period} value={periodText} onClick={() => setEditing('period')} />
        <Row label={S.settings.buffer} value={money(settings.bufferCents)} onClick={() => setEditing('buffer')} />
        <Switch label={S.settings.cards} sub={S.settings.cardsSub} checked={settings.subtractCardBalances} onChange={(v) => update({ subtractCardBalances: v })} />
        <Switch label={S.settings.autoPost} sub={S.settings.autoPostSub} checked={settings.autoPostRecurring} onChange={(v) => update({ autoPostRecurring: v })} />
      </Group>

      <Group title={S.settings.groups.notifications} note={S.calendar.note}>
        <Switch label={S.settings.notifications} sub={S.settings.notificationsSub} checked={settings.notificationsEnabled} onChange={(v) => update({ notificationsEnabled: v })} />
        <Row label={S.calendar.addAll} sub={S.calendar.addAllSub} onClick={async () => setMsg(await addAllToCalendar(app))} />
      </Group>

      <Group title={S.settings.groups.security} note={S.settings.lockNote}>
        {!lock ? (
          <Row label={S.settings.lockOn} onClick={() => setEditing('lockOn')} />
        ) : (
          <>
            {canPasskey && (
              <Switch
                label={S.settings.faceId}
                sub={S.settings.faceIdSub}
                checked={!!lock.passkeyId}
                onChange={async (on) => {
                  try {
                    if (on) await enablePasskey(app, settings.userName ?? '');
                    else await updateLock(app, { passkeyId: undefined });
                  } catch {
                    setMsg(S.settings.faceIdFailed);
                  }
                  bump();
                }}
              />
            )}
            <Row label={S.settings.relock} value={S.settings.relockOption(lock.relockAfterMs)} onClick={() => setEditing('relock')} />
            <Row label={S.settings.lockChange} onClick={() => setEditing('lockChange')} />
            <Row label={S.settings.lockOff} onClick={() => setEditing('lockOff')} />
          </>
        )}
      </Group>

      <Group title={S.settings.groups.freshStart} note={S.settings.freshNote}>
        <Stepper label={S.settings.freshDays} value={settings.freshStartDays} min={3} max={60} onChange={(v) => update({ freshStartDays: v })} />
        <Stepper label={S.settings.freshBacklog} value={settings.freshStartBacklog} min={5} max={100} step={5} onChange={(v) => update({ freshStartBacklog: v })} />
      </Group>

      <Group title={S.settings.data} note={S.settings.dataNote}>
        <Row label={S.settings.exportJson} onClick={async () => download(`tameru-backup-${today}.json`, await exportJson(app), 'application/json')} />
        <Row label={S.settings.exportCsv} onClick={async () => download(`tameru-transactions-${today}.csv`, await exportCsv(app), 'text/csv')} />
        <Row
          label={S.settings.importJson}
          onClick={() =>
            readFile('application/json,.json', async (text) => {
              const r = await importJson(app, text);
              setMsg(r.ok ? S.backup.imported(r.records) : S.errors.importInvalid(r.error));
              bump();
            })
          }
        />
        <Row
          label={S.settings.importCsv}
          onClick={() =>
            readFile('text/csv,.csv', async (text) => {
              const r = await importCsv(app, text);
              setMsg(S.backup.csvImported(r.imported, r.skipped.length));
              bump();
            })
          }
        />
      </Group>

      <Group>
        <Row label={S.settings.reset} danger onClick={() => setEditing('erase')} />
      </Group>

      <p class="colophon">
        {S.more.colophon}
        <br />
        {versionLabel}
      </p>
      <Message text={msg} />

      {editing && (
        <Sheet label={S.settings.title} onClose={() => setEditing(null)}>
          <div class="onb-sheet">
            {editing === 'name' && <NameSheet name={settings.userName ?? ''} onSave={(userName) => update({ userName: userName || undefined }).then(() => setEditing(null))} />}
            {editing === 'period' && <PeriodSheet period={period} incomes={incomes} onPick={(p) => setPeriodConfig(app, p).then(close)} />}
            {editing === 'buffer' && <BufferSheet cents={settings.bufferCents} onSave={(bufferCents) => update({ bufferCents }).then(() => setEditing(null))} />}
            {editing === 'relock' && lock && <RelockSheet value={lock.relockAfterMs} onPick={(relockAfterMs) => updateLock(app, { relockAfterMs }).then(close)} />}
            {editing === 'lockOn' && <PasscodeSheet onDone={(m) => (setMsg(m), close())} />}
            {editing === 'lockChange' && lock && <PasscodeSheet current={lock} onDone={(m) => (setMsg(m), close())} />}
            {editing === 'lockOff' && lock && (
              <VerifySheet
                lock={lock}
                title={S.settings.lockOff}
                onVerified={async () => {
                  await removeLock(app);
                  setMsg(S.settings.lockRemoved);
                  close();
                }}
              />
            )}
            {editing === 'erase' && <EraseSheet onErase={() => eraseAllData(app).then(() => ((window.location.hash = '/'), window.location.reload()))} />}
          </div>
        </Sheet>
      )}
    </section>
  );
}

// ---------- list pieces ----------

/** One tile per theme, each drawn in its own colours: a little hero over two lines of text. */
function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (t: ThemeId) => void }) {
  return (
    <div class="theme-picker" role="radiogroup" aria-label={S.settings.groups.theme}>
      {THEME_IDS.map((id) => (
        <button type="button" key={id} role="radio" aria-checked={value === id} class={`theme-tile${value === id ? ' on' : ''}`} onClick={() => onChange(id)}>
          <span class="theme-tile__preview" data-theme={id} aria-hidden="true">
            <span class="theme-tile__hero">$24</span>
            <span class="theme-tile__line" />
            <span class="theme-tile__line theme-tile__line--short" />
            {value === id && (
              <span class="theme-tile__check">
                <CheckIcon />
              </span>
            )}
          </span>
          <span class="theme-tile__name">{S.settings.themes[id]}</span>
        </button>
      ))}
    </div>
  );
}

function Group(props: { title?: string; note?: string; children: preact.ComponentChildren }) {
  return (
    <div class="settings-group">
      {props.title && <p class="eyebrow settings-group__title">{props.title}</p>}
      <div class="settings-group__card">{props.children}</div>
      {props.note && <p class="settings-group__note">{props.note}</p>}
    </div>
  );
}

function Row(props: { label: string; sub?: string; value?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" class={`settings-row${props.danger ? ' settings-row--danger' : ''}`} onClick={props.onClick}>
      <span class="settings-row__label">
        {props.label}
        {props.sub && <small>{props.sub}</small>}
      </span>
      {props.value && <span class="settings-row__value">{props.value}</span>}
      {!props.danger && <ChevronRight />}
    </button>
  );
}

function Stepper(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const step = props.step ?? 1;
  return (
    <div class="settings-row settings-row--static">
      <span class="settings-row__label">{props.label}</span>
      <span class="stepper">
        <button type="button" aria-label={`${props.label} −`} disabled={props.value <= props.min} onClick={() => props.onChange(Math.max(props.min, props.value - step))}>
          −
        </button>
        <span class="num">{props.value}</span>
        <button type="button" aria-label={`${props.label} +`} disabled={props.value >= props.max} onClick={() => props.onChange(Math.min(props.max, props.value + step))}>
          +
        </button>
      </span>
    </div>
  );
}

function Choice(props: { label: string; sub?: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" class={`onb-option${props.on ? ' on' : ''}`} aria-pressed={props.on} onClick={props.onClick}>
      <span class="onb-option__text">
        <strong>{props.label}</strong>
        {props.sub && <small>{props.sub}</small>}
      </span>
      <span class="onb-option__end">{props.on && <CheckIcon />}</span>
    </button>
  );
}

// ---------- sheets ----------

function NameSheet(props: { name: string; onSave: (n: string) => void }) {
  const [name, setName] = useState(props.name);
  return (
    <form onSubmit={(e) => (e.preventDefault(), props.onSave(name.trim()))}>
      <h2>{S.settings.name}</h2>
      <label class="field">
        {S.onboarding.nameQ}
        <input value={name} autoFocus autoComplete="name" autoCapitalize="words" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <small>{S.settings.nameSub}</small>
      </label>
      <div class="sheet__actions">
        <button type="submit" class="primary block">
          {S.common.save}
        </button>
      </div>
    </form>
  );
}

function PeriodSheet(props: { period: PeriodConfig; incomes: { id: string; name: string }[]; onPick: (p: PeriodConfig) => void }) {
  const [day, setDay] = useState(props.period.kind === 'monthly' ? props.period.startDay : 1);
  return (
    <div>
      <h2>{S.settings.period}</h2>
      <div class="onb-options">
        <Choice label={S.settings.month} sub={S.settings.monthFromDay(day)} on={props.period.kind === 'monthly'} onClick={() => props.onPick({ kind: 'monthly', startDay: day })} />
        {props.incomes.map((r) => (
          <Choice key={r.id} label={S.settings.payday} sub={r.name} on={props.period.kind === 'payday' && props.period.recurringId === r.id} onClick={() => props.onPick({ kind: 'payday', recurringId: r.id })} />
        ))}
      </div>
      <div class="settings-group__card">
        <Stepper label={S.settings.monthFrom} value={day} min={1} max={28} onChange={(d) => (setDay(d), props.period.kind === 'monthly' && props.onPick({ kind: 'monthly', startDay: d }))} />
      </div>
    </div>
  );
}

function BufferSheet(props: { cents: number; onSave: (c: number) => void }) {
  const [c, setC] = useState<number | undefined>(props.cents);
  return (
    <form onSubmit={(e) => (e.preventDefault(), props.onSave(c ?? 0))}>
      <h2>{S.settings.buffer}</h2>
      <label class="field field--money">
        {S.common.amount}
        <span class="field__box">
          <span class="field__cur">$</span>
          <MoneyInput value={c} onChange={setC} autoFocus />
        </span>
        <small>{S.settings.bufferSub}</small>
      </label>
      <div class="sheet__actions">
        <button type="submit" class="primary block">
          {S.common.save}
        </button>
      </div>
    </form>
  );
}

function RelockSheet(props: { value: number; onPick: (ms: number) => void }) {
  return (
    <div>
      <h2>{S.settings.relock}</h2>
      <div class="onb-options">
        {RELOCK_OPTIONS_MS.map((ms) => (
          <Choice key={ms} label={S.settings.relockOption(ms)} on={props.value === ms} onClick={() => props.onPick(ms)} />
        ))}
      </div>
    </div>
  );
}

/** Turn the passcode on (pick 4 or 6 digits, enter, confirm), or change it (current first). */
function PasscodeSheet(props: { current?: AppLock; onDone: (msg: string) => void }) {
  const { app } = useApp();
  const [stage, setStage] = useState<'current' | 'new' | 'confirm'>(props.current ? 'current' : 'new');
  const [digits, setDigits] = useState<4 | 6>(props.current?.digits ?? 6);
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string>();
  const fail = (m: string) => (setError(m), window.setTimeout(() => setError(undefined), 1200));
  return (
    <div class="passcode-sheet">
      {stage === 'current' && props.current && (
        <PinEntry digits={props.current.digits} title={S.lock.currentTitle} error={error} onComplete={async (code) => ((await checkPasscode(app, code)) ? setStage('new') : fail(S.lock.wrong))} />
      )}
      {stage === 'new' && (
        <>
          <PinEntry key={`new-${digits}`} digits={digits} title={S.lock.newTitle} error={error} onComplete={(code) => (setFirst(code), setStage('confirm'))} />
          <button type="button" class="link passcode-sheet__switch" onClick={() => setDigits(digits === 6 ? 4 : 6)}>
            {S.settings.useDigits(digits === 6 ? 4 : 6)}
          </button>
        </>
      )}
      {stage === 'confirm' && (
        <PinEntry
          key="confirm"
          digits={digits}
          title={S.lock.confirmTitle}
          error={error}
          onComplete={async (code) => {
            if (code !== first) {
              setStage('new');
              return fail(S.lock.mismatch);
            }
            await setPasscode(app, code, digits);
            props.onDone(props.current ? S.settings.lockChanged : S.settings.lockAdded);
          }}
        />
      )}
    </div>
  );
}

function VerifySheet(props: { lock: AppLock; title: string; onVerified: () => void }) {
  const { app } = useApp();
  const [error, setError] = useState<string>();
  return (
    <div class="passcode-sheet">
      <PinEntry
        digits={props.lock.digits}
        title={S.lock.currentTitle}
        sub={props.title}
        error={error}
        onComplete={async (code) => {
          if (await checkPasscode(app, code)) return props.onVerified();
          setError(S.lock.wrong);
          window.setTimeout(() => setError(undefined), 1200);
        }}
      />
    </div>
  );
}

function EraseSheet(props: { onErase: () => void }) {
  const [text, setText] = useState('');
  return (
    <div>
      <h2>{S.settings.reset}</h2>
      <p class="muted">{S.backup.wipeConfirm}</p>
      <label class="field">
        {S.settings.resetConfirm}
        <input value={text} autoCapitalize="characters" onInput={(e) => setText((e.target as HTMLInputElement).value)} />
      </label>
      <div class="sheet__actions">
        <button type="button" class="primary block danger" disabled={text !== 'ERASE'} onClick={props.onErase}>
          {S.settings.reset}
        </button>
      </div>
    </div>
  );
}

