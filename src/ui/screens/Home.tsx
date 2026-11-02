import { useEffect, useState } from 'preact/hooks';
import { fmtDate, S } from '../../copy/strings';
import { diffDays } from '../../domain/dates';
import type { FreshStartOffer } from '../../domain/freshStart';
import type { Notice } from '../../domain/notifications';
import type { CoverOption } from '../../domain/reabsorb';
import type { Account, Cents, Transaction } from '../../domain/types';
import { doFreshStart } from '../../services/freshStart';
import { getHome, isCard } from '../../services/home';
import { takeTodaysNotices } from '../../services/notifications';
import { applyCover } from '../../services/plan';
import { customInstitutions } from '../../services/institutions';
import { deleteTransaction, restoreTransaction } from '../../services/transactions';
import { useCatalog } from '../cards';
import { CardStack } from '../CardStack';
import { Amount, Message, monogram } from '../components';
import { useApp, useLoad } from '../hooks';
import { initials } from '../../domain/onboarding';
import { ArrowDownLeft, ArrowUpRight, BellIcon, PersonIcon, SwapIcon, TrashIcon } from '../Icons';
import { useCardColors } from '../institutionColor';
import { useTween } from '../motion';
import { QuickRow } from '../QuickRow';
import { Sheet } from '../Sheet';
import { SwipeRow } from '../SwipeRow';
import { toast } from '../toast';
import { orderedAccounts } from '../../services/accounts';

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
  const custom = useLoad(customInstitutions) ?? [];
  // Cards in the stack: credit and debit (chequing), in the user's order.
  const cards = (accounts ?? []).filter(isCard);
  const colors = useCardColors(cards, catalog, custom);
  const [stackIndex, setStackIndex] = useState(0);
  // The card on top of the stack (none for All accounts) picks the figures and activity shown.
  const index = Math.min(stackIndex, cards.length);
  const card: Account | undefined = index > 0 ? cards[index - 1] : undefined;
  const share = card ? data?.perCard[card.id] : undefined;
  const safeToday = share?.safeTodayCents ?? data?.safeTodayCents ?? 0;
  const shownSafe = useTween(safeToday, 'safe-to-spend');
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

  const activity = data.recent.filter((t) => !card || t.accountId === card.id || t.toAccountId === card.id).slice(0, 5);
  const spent = share?.spentTodayCents ?? data.spentTodayCents;
  const left = share?.leftCents ?? sts.safeCents;
  const allowance = Math.max(0, safeToday) + spent;
  const spentPct = allowance > 0 ? Math.min(100, (spent / allowance) * 100) : left < 0 ? 100 : 0;
  const now = new Date();
  const firstName = settings?.userName?.trim().split(/\s+/)[0];

  const swipeDelete = async (t: Transaction) => {
    const before = await deleteTransaction(app, t.id);
    bump();
    if (before)
      toast(t.originKey ? S.transactions.skipped : S.transactions.deleted, {
        label: S.common.undo,
        run: async () => {
          await restoreTransaction(app, before);
          bump();
        },
      });
  };

  const title = (t: Transaction) =>
    t.type === 'transfer' ? `${acctName(t.accountId)} → ${acctName(t.toAccountId)}` : (t.merchant ?? (catName(t.categoryId) || S.txType[t.type]));
  const when = (t: Transaction) => {
    const day = t.date === today ? S.home.today : diffDays(t.date, today) === 1 ? S.home.yesterday : fmtDate(t.date);
    const time = t.enteredAt && t.enteredAt.slice(0, 10) === t.date ? new Date(t.enteredAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    return time ? `${day}, ${time}` : day;
  };

  return (
    <section class="home">
      <div class="home-head">
        <div class="home-head__who">
          <span class="datetile" aria-hidden="true">
            <span>{new Date(`${today}T12:00`).toLocaleString('en-CA', { month: 'short' }).replace('.', '').toUpperCase()}</span>
            <span>{today.slice(8, 10)}</span>
          </span>
          <span class="home-head__text">
            <span class="home-head__greet">{S.home.greeting(now.getHours())}</span>
            {firstName && <span class="home-head__name">{firstName}</span>}
          </span>
        </div>
        <div class="head-actions">
          <a class="icon-btn icon-btn--line" href="#/recurring" aria-label={S.home.upcoming}>
            <BellIcon />
            {(data.upcoming.length > 0 || data.pendingCount > 0) && <span class="icon-btn__dot" />}
          </a>
          <a class="mark mark--line" href="#/settings" aria-label={S.home.profile}>
            {initials(settings?.userName) || <PersonIcon />}
          </a>
        </div>
      </div>

      {cards.length > 0 && <CardStack cards={cards} colors={colors} perCard={data.perCard} totalCents={data.safeTodayCents} catalog={catalog} index={index} onIndex={setStackIndex} />}

      <div class="today">
        <p class="today__label">{S.home.safeToday}</p>
        <button type="button" class="today__amount" aria-label={S.home.showBreakdown} onClick={() => setShowBreakdown(true)}>
          <Amount c={shownSafe} />
        </button>
        <div class={`today__bar${left < 0 ? ' today__bar--over' : ''}`}>
          <span style={{ width: `${spentPct}%` }} />
        </div>
        <p class="today__meta">
          <span>{S.home.spentOf(spent, allowance)}</span>
          <span>{S.home.leftUntil(left, data.period.end)}</span>
        </p>
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
        <h2>{card ? S.home.cardActivity(card.face?.cardName ?? card.name) : S.home.recentActivity}</h2>
        <a href="#/transactions">{S.home.viewAll}</a>
      </div>
      {activity.length === 0 ? (
        <p class="muted">{S.common.none}</p>
      ) : (
        <>
          <ul class="txlist">
            {activity.map((t) => (
              <li key={t.id}>
                <SwipeRow
                  onDelete={() => swipeDelete(t)}
                  deleteLabel={t.originKey ? S.transactions.skip : S.common.delete}
                  editLabel={S.common.edit}
                  deleteIcon={<TrashIcon />}
                  editIcon={null}
                >
                  <div class={`txrow${t.status === 'pending' ? ' txrow--pending' : ''}`}>
                    <span class="avatar" aria-hidden="true">
                      {t.type === 'transfer' ? <SwapIcon /> : t.type === 'income' ? <ArrowDownLeft /> : monogram(title(t))}
                    </span>
                    <span class="txlist__main">
                      <span class="txlist__title">{title(t)}</span>
                      <span class="txlist__meta">{[when(t), t.type === 'transfer' ? '' : catName(t.categoryId), card ? '' : acctName(t.accountId)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span class={`txlist__amt${t.type === 'income' || t.type === 'refund' ? ' txlist__amt--in' : ''}`}>
                      <Amount c={t.type === 'expense' ? -t.amountCents : t.amountCents} sign={t.type === 'income' || t.type === 'refund' ? '+' : undefined} />
                    </span>
                  </div>
                </SwipeRow>
              </li>
            ))}
          </ul>
          <p class="home-hint">{S.home.swipeToRemove}</p>
        </>
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
            {b.plannedCents > 0 && line(S.home.breakdown.planned, b.plannedCents, '−')}
            {b.plannedLines.map((l) => line(l.label, l.amountCents, undefined, 'sub'))}
            {line(S.home.breakdown.buffer, b.bufferCents, '−')}
            {line(S.home.safeToSpend, sts.safeCents, undefined, 'total')}
          </ul>
        </Sheet>
      )}
    </section>
  );
}

