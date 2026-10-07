import { PageHeader } from '../ui/PageHeader';

function Placeholder({ title, lede, points }: { title: string; lede: string; points: string[] }) {
  return (
    <>
      <PageHeader title={title} />
      <section className="card">
        <p className="card__eyebrow">Not built yet</p>
        <p className="card__text">{lede}</p>
        <ul className="plain-list">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function Forecast() {
  return (
    <Placeholder
      title="Forecast"
      lede="A look ahead at your cash flow."
      points={[
        'Recurring bills and paydays',
        '30, 60 and 90-day balance forecast',
        'What-if: see how a purchase changes the picture',
      ]}
    />
  );
}

export function Plan() {
  return (
    <Placeholder
      title="Plan"
      lede="Where your money is meant to go."
      points={['Monthly budgets by category', 'Savings goals', 'Bills coming up']}
    />
  );
}
