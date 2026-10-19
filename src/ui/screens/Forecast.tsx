import { useState } from 'preact/hooks';
import { fmtDate, money, S } from '../../copy/strings';
import { getForecast } from '../../services/forecast';
import { PageHeader } from '../components';
import { useLoad } from '../hooks';

export function Forecast() {
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);
  const data = useLoad((a) => getForecast(a, horizon), [horizon]);
  const cats = useLoad((a) => a.repos.categories.all()) ?? [];
  if (!data) return <div class="placeholder" />;
  const { forecast: f, outlook, accounts } = data;
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? '';
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? id;
  const topCats = Object.entries(outlook.perCategory)
    .filter(([id]) => cats.find((c) => c.id === id)?.group !== 'system')
    .sort((a, b) => b[1].projectedCents - a[1].projectedCents)
    .slice(0, 4);
  return (
    <section>
      <PageHeader title={S.forecast.title} />
      <p>
        {([30, 60, 90] as const).map((h) => (
          <button type="button" key={h} disabled={h === horizon} onClick={() => setHorizon(h)}>
            {S.forecast.horizon(h)}
          </button>
        ))}
      </p>
      <p>{S.forecast.onTrack(outlook.onTrackToSaveCents)}</p>
      <ul>
        {topCats.map(([id, c]) => (
          <li key={id}>{S.forecast.projected(catName(id), c.projectedCents)}</li>
        ))}
      </ul>
      <p>{S.forecast.lowestSpendable(f.lowestSpendable.balanceCents, f.lowestSpendable.date)}</p>
      {f.negatives.length === 0 ? <p>{S.forecast.noDips}</p> : f.negatives.map((n) => <p key={n.accountId}>{S.forecast.dips(name(n.accountId), n.date, n.balanceCents)}</p>)}
      <ul>
        {Object.entries(f.lowest).map(([id, l]) => (
          <li key={id}>{S.forecast.lowest(name(id), l.balanceCents, l.date)}</li>
        ))}
      </ul>
      <p><small>{S.forecast.estimate(data.estimate.dailyCents, data.estimate.source)}</small></p>
      <div class="scroll-x">
      <table>
        <thead>
          <tr>
            <th>{S.forecast.date}</th>
            {accounts.map((a) => <th key={a.id} class="num">{a.name}</th>)}
            <th class="num">{S.forecast.spendable}</th>
          </tr>
        </thead>
        <tbody>
          {f.days.map((d) => (
            <tr key={d.date}>
              <td>{fmtDate(d.date)}</td>
              {accounts.map((a) => <td key={a.id} class="num">{money(d.balances[a.id] ?? 0)}</td>)}
              <td class="num">{money(d.spendableCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
