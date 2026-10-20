import { useEffect, useState } from 'preact/hooks';
import { fmtDate, money, S } from '../../copy/strings';
import { diffDays } from '../../domain/dates';
import type { FreshStartOffer } from '../../domain/freshStart';
import type { Notice } from '../../domain/notifications';
import type { CoverOption } from '../../domain/reabsorb';
import type { Account, Cents, Transaction } from '../../domain/types';
import { doFreshStart } from '../../services/freshStart';
import { getHome } from '../../services/home';
import { takeTodaysNotices } from '../../services/notifications';
import { applyCover } from '../../services/plan';
import { useCatalog } from '../cards';
import { Amount, Message, monogram, Ticks } from '../components';
import { useApp, useLoad } from '../hooks';
import { initials } from '../../domain/onboarding';
import { ArrowDownLeft, ArrowUpRight, BellIcon, PersonIcon, SwapIcon } from '../Icons';
import { useTween } from '../motion';
import { QuickRow } from '../QuickRow';
import { useWalletPull, Wallet } from '../Wallet';
import { Sheet } from '../Sheet';
import { orderedAccounts, reorderAccounts } from '../../services/accounts';

export function Home(props: { offer: FreshStartOffer | null; clearOffer: () => void }) {
  const { app, bump } = useApp();
  const data = useLoad(getHome);
  const goals = useLoad((a) => a.repos.goals.all());
  const accounts = useLoad(orderedAccounts);
  const categories = useLoad((a) => a.repos.categories.all());
  const settings = useLoad((a) => a.repos.settings.get());
  const catalog = useCatalog();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [msg, setMsg] = useState<string>();
  const [showBreakdown, setShowBreakdown] = useState(false);
  useEffect(() => {
    takeTodaysNotices(app).then(setNotices);
  }, []);
  useHeroTop();
  const shownSafe = useTween(data?.sts.safeCents ?? 0, 'safe-to-spend');
  const pull = useWalletPull();
  const [walletOrder, setWalletOrder] = useState<string[] | null>(null);
  if (!data || !accounts) return <div class="placeholder" />;
  const { sts } = data;
  const b = sts.breakdown;
  const today = app.clock.today();
  const catName = (id?: string) => categories?.find((c) => c.id === id)?.name ?? '';
  const acctName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '';

  const cover = async (catId: string, opt: CoverOption) => {
    await applyCover(app, catId, opt);
    setMsg(S.cover.applied);
    bump();
  };
  const freshStart = async () => {
    const summary = await doFreshStart(app, props.offer?.daysAway ?? 0);
    props.clearOffer();
    setMsg(S.freshStart.summary(summary.count, summary.spentCents, summary.from, summary.to));
    bump();
  };

  const recovery = sts.recovery;
  const recoveryText = !recovery
    ? undefined
    : recovery.kind === 'pause_goal'
      ? S.recovery.pause_goal(goals?.find((g) => g.id === recovery.goalId)?.name ?? '', recovery.amountCents)
      : recovery.kind === 'move_bill'
        ? S.recovery.move_bill(b.billLines.find((l) => l.recurringId === recovery.recurringId)?.label ?? '', recovery.date)
        : S.recovery.ease_category(recovery.amountCents, data.easeCategory?.name);

  const line = (label: string, cents: Cents, sign?: '+' | '−', cls = '') => (
    <li class={cls}>
      <span>{label}</span>
      <span class="leader" />
      <Amount c={cents} sign={sign} />
    </li>
  );

  // Cards in the wallet: credit and debit (chequing), in the user's order.
  const cards = accounts.filter((a) => !a.archived && (a.type === 'credit_card' || a.type === 'chequing'));
  // Show a just-dropped order immediately, before the save round-trips.
  const walletCards: Account[] = walletOrder
    ? [...cards].sort((a, b) => (walletOrder.indexOf(a.id) + 1 || 99) - (walletOrder.indexOf(b.id) + 1 || 99))
    : cards;
  const periodDays = diffDays(data.period.start, data.period.end) + 1;
  const dayIndex = diffDays(data.period.start, today);

  const title = (t: Transaction) =>
    t.type === 'transfer' ? `${acctName(t.accountId)} → ${acctName(t.toAccountId)}` : (t.merchant ?? (catName(t.categoryId) || S.txType[t.type]));
  const when = (t: Transaction) => {
    const day = t.date === today ? S.home.today : diffDays(t.date, today) === 1 ? S.home.yesterday : fmtDate(t.date);
    const time = t.enteredAt && t.enteredAt.slice(0, 10) === t.date ? new Date(t.enteredAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    return time ? `${day}, ${time}` : day;
  };

  return (
    <section class="home">
      <div ref={pull.ref} class={`home-hero${pull.open ? ' home-hero--open' : ''}`} {...pull.bind}>
        <div class="home-hero__top">
          <a class="mark" href="#/settings" aria-label={S.home.profile}>
            {initials(settings?.userName) || <PersonIcon />}
          </a>
          <a class="icon-btn" href="#/recurring" aria-label={S.home.upcoming}>
            <BellIcon />
            {(data.upcoming.length > 0 || data.pendingCount > 0) && <span class="icon-btn__dot" />}
          </a>
        </div>
        <p class="home-hero__label">{S.home.safeToSpend}</p>
        <button type="button" class="home-hero__amount" aria-label={S.home.showBreakdown} onClick={() => setShowBreakdown(true)}>
          <Amount c={shownSafe} />
        </button>
        <p class="home-hero__pill">
          <span class="num">{money(sts.dailyCents)}</span> {S.home.perDayShort} · {S.home.daysLeft(sts.daysLeft)}
        </p>
        <div class="home-hero__ticks">
          <Ticks total={periodDays} done={dayIndex} label={S.home.daysLeft(sts.daysLeft)} />
        </div>
        <Wallet
          accounts={walletCards}
          catalog={catalog}
          pull={pull}
          onReorder={(ids) => {
            setWalletOrder(ids);
            reorderAccounts(app, ids).then(bump);
          }}
        />
      </div>

      <div class="actions">
        <a class="action" href="#/add?type=expense">
          <ArrowUpRight /> {S.home.actions.spent}
        </a>
        <a class="action" href="#/add?type=income">
          <ArrowDownLeft /> {S.home.actions.income}
        </a>
      </div>
      <QuickRow />

      {recoveryText && <p class="note">{recoveryText}</p>}
      <Message text={msg} />

      {props.offer && (
        <aside>
          <h3>{props.offer.reason === 'away' ? S.freshStart.awayTitle(props.offer.daysAway) : S.freshStart.backlogTitle(props.offer.backlog)}</h3>
          <p>{S.freshStart.body}</p>
          <div class="chips">
            <button type="button" class="primary" onClick={freshStart}>{S.freshStart.accept}</button>
            <button type="button" onClick={props.clearOffer}>{S.freshStart.later}</button>
          </div>
        </aside>
      )}

      {notices.map((n) => (
        <p class="note" key={n.id}>
          {S.notices[n.kind](n.params)}
        </p>
      ))}

      {data.overs.map((o) => (
        <div class="card" key={o.categoryId}>
          <p>{S.cover.title(catName(o.categoryId), o.overCents)}</p>
          <div class="chips">
            {o.options.map((opt, k) => (
              <button type="button" key={k} onClick={() => cover(o.categoryId, opt)}>
                {opt.kind === 'category'
                  ? S.cover.category(catName(opt.fromCategoryId), opt.amountCents, opt.coversAll)
                  : opt.kind === 'fund'
                    ? S.cover.fund(catName(opt.fromCategoryId), opt.amountCents, opt.coversAll)
                    : opt.kind === 'next_period'
                      ? S.cover.next_period(opt.amountCents)
                      : S.cover.leave}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div class="section-head">
        <h2>{S.home.recent}</h2>
        <a href="#/transactions">{S.home.viewAll}</a>
      </div>
      {data.recent.length === 0 ? (
        <p class="muted">{S.common.none}</p>
      ) : (
        <ul class="txlist">
          {data.recent.map((t) => (
            <li key={t.id}>
              <span class="avatar" aria-hidden="true">
                {t.type === 'transfer' ? <SwapIcon /> : t.type === 'income' ? <ArrowDownLeft /> : monogram(title(t))}
              </span>
              <span class="txlist__main">
                <span class="txlist__title">{title(t)}</span>
                <span class="txlist__meta">{when(t)}</span>
              </span>
              <span class={`txlist__amt${t.status === 'pending' ? ' muted' : ''}`}>
                <Amount c={t.type === 'expense' ? -t.amountCents : t.amountCents} sign={t.type === 'income' || t.type === 'refund' ? '+' : undefined} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {showBreakdown && (
        <Sheet label={S.home.showBreakdown} onClose={() => setShowBreakdown(false)}>
          <h2>{S.home.showBreakdown}</h2>
          <ul class="receipt">
            {line(S.home.breakdown.spendable, b.spendableCents + b.cardsOwingCents)}
            {b.cardsOwingCents > 0 && line(S.home.breakdown.cardsOwing, b.cardsOwingCents, '−')}
            {line(S.home.breakdown.income, b.incomeCents, '+')}
            {b.incomeLines.map((l) => line(`${l.label} · ${fmtDate(l.date)}`, l.amountCents, undefined, 'sub'))}
            {line(S.home.breakdown.bills, b.billsCents, '−')}
            {b.billLines.map((l) => line(`${l.label} · ${fmtDate(l.date)}`, l.amountCents, undefined, 'sub'))}
            {b.goalsCents > 0 && line(S.home.breakdown.goals, b.goalsCents, '−')}
            {line(S.home.breakdown.buffer, b.bufferCents, '−')}
            {line(S.home.safeToSpend, sts.safeCents, undefined, 'total')}
          </ul>
        </Sheet>
      )}
    </section>
  );
}

/** Roughly the hero gradient's colour along its top edge. */
const HERO_TOP = '#1c1c1c';

/**
 * While Home is showing, the dark hero runs up under the status bar: the browser /
 * status bar tint (theme-color) and the area revealed by pulling the page down
 * (the root background) both take the hero's colour.
 */
function useHeroTop() {
  useEffect(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map((m) => m.content);
    metas.forEach((m) => (m.content = HERO_TOP));
    document.documentElement.classList.add('hero-top');
    return () => {
      metas.forEach((m, i) => (m.content = before[i]!));
      document.documentElement.classList.remove('hero-top');
    };
  }, []);
}
