// Dev-only: fake today, jump ahead, seed the sample student, wipe.

import { useState } from 'preact/hooks';
import { S } from '../../copy/strings';
import type { FreshStartOffer } from '../../domain/freshStart';
import { jumpDays, seed, setToday, wipe } from '../../services/debug';
import { scheduleNotices } from '../../services/notifications';
import { PageHeader } from '../components';
import { useApp, useLoad } from '../hooks';

export function Debug({ onOffer }: { onOffer: (o: FreshStartOffer | null) => void }) {
  const { app, bump } = useApp();
  const [date, setDate] = useState(app.clock.today());
  const notices = useLoad((a) => scheduleNotices(a));
  const events = useLoad((a) => a.repos.events.all());
  const jump = async (n: number) => {
    const r = await jumpDays(app, n);
    onOffer(r.freshStart);
    setDate(app.clock.today());
    bump();
  };
  return (
    <section>
      <PageHeader title={S.debug.title} />
      <p>{S.debug.today(app.clock.today(), app.clock.isPinned)}</p>
      <p>
        <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />{' '}
        <button type="button" onClick={() => setToday(app, date).then(bump)}>{S.debug.setToday}</button>{' '}
        <button type="button" onClick={() => setToday(app, null).then(() => (setDate(app.clock.today()), bump()))}>{S.debug.useReal}</button>
      </p>
      <p>
        {[1, 7, 14, 30].map((n) => (
          <button type="button" key={n} onClick={() => jump(n)}>{S.debug.jump(n)}</button>
        ))}
      </p>
      <p>
        <button type="button" onClick={() => seed(app).then(() => (onOffer(null), bump()))}>{S.debug.seed}</button>{' '}
        <button type="button" onClick={() => wipe(app).then(() => window.location.reload())}>{S.debug.wipe}</button>
      </p>
      <h2>{S.debug.notices}</h2>
      <ul>
        {(notices ?? []).map((n) => (
          <li key={n.id}>
            {n.fireOn}: {S.notices[n.kind](n.params)}
          </li>
        ))}
      </ul>
      <h2>{S.debug.events}</h2>
      <ul>
        {[...(events ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30).map((e) => (
          <li key={e.id}>
            {e.date} {e.type} <small>{JSON.stringify(e.payload).slice(0, 120)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
