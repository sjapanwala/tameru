// Card faces and the card picker.
// A face is one of: bundled art (the image is the whole card), an institution's
// card that has no art (drawn in its colour with its badge), or the user's own
// card with a name and colour they chose.

import { useEffect, useState } from 'preact/hooks';
import { S } from '../copy/strings';
import { artImageUrl, cleanImageUrl, loadCatalog } from '../data/cardArt';
import {
  CARD_COLORS,
  cardLabels,
  cardsOf,
  continents,
  customInstitutionId,
  defaultContinent,
  institutionInitials,
  institutionName,
  institutions,
  shortCardName,
  textOn,
  type CatalogCard,
} from '../domain/cardCatalog';
import type { Account, CardFace as Face, CustomInstitution } from '../domain/types';
import { customInstitutions, saveCustomInstitution } from '../services/institutions';
import { useApp, useLoad } from './hooks';
import { useInstitutionColor } from './institutionColor';

export function useCatalog(): CatalogCard[] {
  const [cards, setCards] = useState<CatalogCard[]>([]);
  useEffect(() => {
    let live = true;
    loadCatalog().then((c) => live && setCards(c));
    return () => {
      live = false;
    };
  }, []);
  return cards;
}

const NETWORK_MARK: Record<string, string> = { visa: 'VISA', mastercard: 'mastercard', amex: 'AMEX', interac: 'Interac', discover: 'DISCOVER', unionpay: 'UnionPay' };

export function CardFace({ account, face, catalog, name }: { account?: Account; face?: Face; catalog: CatalogCard[]; name?: string }) {
  const f = face ?? account?.face;
  const custom = useLoad(customInstitutions) ?? [];
  const art = f?.artId ? catalog.find((c) => c.id === f.artId) : undefined;
  const instId = f?.institutionId ?? art?.institutionId;
  const customInst = instId ? custom.find((i) => i.id === instId) : undefined;
  const sampled = useInstitutionColor(customInst ? undefined : instId, catalog);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [art?.id]);
  const last4 = f?.last4 ? `•••• ${f.last4}` : '';

  if (art && !broken) {
    // Some art has a sample name or number printed on it: always use the cleaned copy, or
    // cover it with a label. Either way the user's own last four goes where it was.
    const cover = art.cover;
    const src = (cover && cleanImageUrl(art)) || artImageUrl(art);
    const [x0, y0, , y1] = cover?.box ?? [0.07, 0.82, 0, 0.94];
    const place = { left: `${Math.max(x0, 0.04) * 100}%`, top: `${((y0 + y1) / 2) * 100}%` };
    return (
      <div class="cardface cardface--art">
        <img src={src} alt={art.name} loading="lazy" decoding="async" onError={() => setBroken(true)} />
        {cover?.method === 'label' && (
          <span
            class="cardface__label"
            aria-hidden="true"
            style={{
              left: `${cover.box[0] * 100}%`,
              top: `${cover.box[1] * 100}%`,
              width: `${(cover.box[2] - cover.box[0]) * 100}%`,
              height: `${(cover.box[3] - cover.box[1]) * 100}%`,
              ...(cover.color ? { '--label': cover.color } : {}),
            }}
          />
        )}
        {last4 && (
          <span
            class={`cardface__last4${cover ? ' cardface__last4--placed' : ''}`}
            style={cover ? { ...place, ...(cover.method === 'label' && cover.color ? { color: textOn(cover.color), textShadow: 'none' } : {}) } : undefined}
          >
            {last4}
          </span>
        )}
      </div>
    );
  }

  const color = f?.color ?? customInst?.color ?? sampled;
  const instLabel = customInst?.name ?? (instId ? institutionName(instId) : undefined);
  const title = f?.cardName ?? (art ? shortCardName(art) : undefined) ?? name ?? account?.name ?? '';
  const style = color ? { '--card': color, '--card-ink': textOn(color) } : undefined;
  return (
    <div class={`cardface cardface--plain${color ? ' cardface--tinted' : ''}`} style={style}>
      <span class="cardface__top">
        {instLabel ? <span class="cardface__badge">{institutionInitials(instLabel)}</span> : <span />}
        <span class="cardface__name">{title}</span>
      </span>
      <span class="cardface__chip" />
      <span class="cardface__bottom">
        <span class="cardface__last4">{last4}</span>
        <span class="cardface__network">{art ? (NETWORK_MARK[art.network] ?? '') : (instLabel ?? (account ? S.accountType[account.type] : ''))}</span>
      </span>
    </div>
  );
}

const NEW_INSTITUTION = '__new__';
const NOT_LISTED = '__custom__';

/**
 * Pick the continent, then the institution, then the card, from dropdowns. The continent
 * starts on the current institution's (or the home currency's) so the list stays short.
 * - Card not listed: name it; it's drawn in the institution's colour with its badge.
 * - Institution not listed: add it with a name and a colour.
 */
/** The digits a face carries through a change of bank or card. */
const numbersOf = (f?: Face): Pick<Face, 'last4' | 'deviceLast4'> => ({
  ...(f?.last4 ? { last4: f.last4 } : {}),
  ...(f?.deviceLast4?.length ? { deviceLast4: f.deviceLast4 } : {}),
});

export function CardPicker({ value, onChange, kind, fallbackName }: { value?: Face; onChange: (f: Face) => void; kind: 'credit' | 'debit'; fallbackName: string }) {
  const { app, bump } = useApp();
  const catalog = useCatalog();
  const custom = useLoad(customInstitutions) ?? [];
  const currency = useLoad((a) => a.repos.settings.get())?.defaultCurrency ?? 'CAD';
  const instId = value?.institutionId ?? (value?.artId ? catalog.find((c) => c.id === value.artId)?.institutionId : undefined);
  const customInst: CustomInstitution | undefined = instId ? custom.find((i) => i.id === instId) : undefined;
  // undefined = not chosen yet (follow the default); '' = all countries.
  const [pickedCountry, setPickedCountry] = useState<string>();
  const countryList = continents(catalog);
  const country = pickedCountry ?? (customInst ? undefined : defaultContinent(catalog, currency, instId)) ?? '';
  const list = institutions(catalog, custom, country || undefined);
  const cards = instId ? cardsOf(catalog, instId, country || undefined) : [];
  const labels = cardLabels(cards);
  // Matching kind first (credit for cards, debit for chequing), the rest after.
  const primary = cards.filter((c) => c.kind === kind);
  const others = cards.filter((c) => c.kind !== kind);

  const [addingInstitution, setAddingInstitution] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CARD_COLORS[3]!);
  // After picking an institution we wait for a card choice; a saved face with an
  // institution but no art is a "not listed" card.
  const [awaitingCard, setAwaitingCard] = useState(false);
  const notListed = !!instId && !value?.artId && (!awaitingCard || cards.length === 0);

  const pickCountry = (c: string) => {
    setPickedCountry(c);
    // The chosen bank isn't in that country: start the bank over.
    if (instId && c && !institutions(catalog, custom, c).some((i) => i.id === instId)) {
      setAwaitingCard(false);
      onChange(numbersOf(value));
    }
  };
  const pickInstitution = (id: string) => {
    if (id === NEW_INSTITUTION) return setAddingInstitution(true);
    setAddingInstitution(false);
    setAwaitingCard(true);
    onChange({ ...numbersOf(value), ...(id ? { institutionId: id } : {}) });
  };
  const pickCard = (id: string) => {
    setAwaitingCard(false);
    if (id === NOT_LISTED) return onChange({ ...numbersOf(value), institutionId: instId, cardName: value?.cardName ?? '' });
    onChange({ ...numbersOf(value), institutionId: instId, ...(id ? { artId: id } : {}) }); // a new card starts from its catalog default
  };
  const addInstitution = async () => {
    if (!newName.trim()) return;
    const inst = await saveCustomInstitution(app, newName, newColor);
    bump();
    setAddingInstitution(false);
    setNewName('');
    setAwaitingCard(false);
    onChange({ ...numbersOf(value), institutionId: inst.id, cardName: value?.cardName ?? '' });
  };

  const previewFace: Face = addingInstitution
    ? { institutionId: customInstitutionId(newName || 'New'), cardName: value?.cardName || newName || fallbackName, color: newColor, ...numbersOf(value) }
    : { ...value, ...(notListed && !value?.cardName ? { cardName: fallbackName } : {}) };

  return (
    <div class="card-picker">
      <div class="card-picker__preview">
        <CardFace face={previewFace} catalog={catalog} name={fallbackName} />
      </div>

      <label>
        {S.cards.country}
        <select value={country} onChange={(e) => pickCountry((e.target as HTMLSelectElement).value)}>
          {countryList.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="">{S.cards.allCountries}</option>
        </select>
      </label>

      <label>
        {S.cards.institution}
        <select value={addingInstitution ? NEW_INSTITUTION : (instId ?? '')} onChange={(e) => pickInstitution((e.target as HTMLSelectElement).value)}>
          <option value="">{S.cards.chooseInstitution}</option>
          {list.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
          <option value={NEW_INSTITUTION}>{S.cards.newInstitution}</option>
        </select>
      </label>

      {addingInstitution && (
        <div class="card-picker__new">
          <label>
            {S.cards.institutionName}
            <input value={newName} placeholder={S.cards.institutionHint} onInput={(e) => setNewName((e.target as HTMLInputElement).value)} />
          </label>
          <ColorPicker value={newColor} onChange={setNewColor} />
          <button type="button" class="primary" disabled={!newName.trim()} onClick={addInstitution}>
            {S.cards.addInstitution}
          </button>
        </div>
      )}

      {instId && !addingInstitution && (
        <label>
          {S.cards.card}
          <select value={notListed ? NOT_LISTED : (value?.artId ?? '')} onChange={(e) => pickCard((e.target as HTMLSelectElement).value)}>
            {cards.length > 0 && <option value="">{S.cards.chooseCard}</option>}
            {primary.length > 0 && (
              <optgroup label={kind === 'credit' ? S.cards.creditCards : S.cards.debitCards}>
                {primary.map((c) => (
                  <option key={c.id} value={c.id}>
                    {labels.get(c.id)}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label={kind === 'credit' ? S.cards.debitCards : S.cards.creditCards}>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {labels.get(c.id)}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={NOT_LISTED}>{S.cards.notListed}</option>
          </select>
        </label>
      )}

      {notListed && !addingInstitution && (
        <>
          <label>
            {S.cards.cardName}
            <input value={value?.cardName ?? ''} placeholder={fallbackName} onInput={(e) => onChange({ ...value, cardName: (e.target as HTMLInputElement).value })} />
          </label>
          <ColorPicker
            value={value?.color}
            onChange={(color) => onChange({ ...value, color })}
            autoLabel={customInst ? undefined : S.cards.bankColour}
            onAuto={customInst ? undefined : () => onChange({ ...value, color: undefined })}
          />
        </>
      )}

      <label>
        {S.cards.last4}
        <input
          inputMode="numeric"
          maxLength={4}
          value={value?.last4 ?? ''}
          placeholder="1234"
          onInput={(e) => onChange({ ...value, last4: (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4) || undefined })}
        />
      </label>

      <DeviceNumbers value={value?.deviceLast4 ?? []} onChange={(deviceLast4) => onChange({ ...value, deviceLast4 })} />
    </div>
  );
}

/**
 * The last fours Apple Pay / Google Pay use for this card (Wallet → card → Device
 * Account Number). One box per number, with an empty box at the end for another.
 */
function DeviceNumbers({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const rows = value.length < 6 && value[value.length - 1] !== '' ? [...value, ''] : value;
  const set = (i: number, raw: string) => {
    const next = [...rows];
    next[i] = raw.replace(/\D/g, '').slice(0, 4);
    while (next.length && next[next.length - 1] === '') next.pop();
    onChange(next);
  };
  return (
    <label class="device-numbers">
      {S.cards.deviceLast4}
      <div class="device-numbers__boxes">
        {rows.map((d, i) => (
          <input key={i} inputMode="numeric" maxLength={4} value={d} placeholder={i === 0 ? '5678' : S.cards.deviceAnother} aria-label={S.cards.deviceLast4} onInput={(e) => set(i, (e.target as HTMLInputElement).value)} />
        ))}
      </div>
      <span class="device-numbers__hint">{S.cards.deviceHint}</span>
    </label>
  );
}

/** Swatches plus a custom colour. Card colours by default; `colors` swaps the palette (e.g. categories). */
export function ColorPicker(props: { value?: string; onChange: (c: string) => void; autoLabel?: string; onAuto?: () => void; colors?: readonly string[] }) {
  return (
    <div class="color-picker">
      <p class="field-label">{S.cards.colour}</p>
      <div class="color-picker__swatches" role="radiogroup" aria-label={S.cards.colour}>
        {props.onAuto && (
          <button type="button" role="radio" aria-checked={!props.value} class={`swatch swatch--auto${!props.value ? ' on' : ''}`} onClick={props.onAuto}>
            {props.autoLabel}
          </button>
        )}
        {(props.colors ?? CARD_COLORS).map((c) => (
          <button
            type="button"
            key={c}
            role="radio"
            aria-checked={props.value === c}
            aria-label={c}
            class={`swatch${props.value === c ? ' on' : ''}`}
            style={{ '--swatch': c }}
            onClick={() => props.onChange(c)}
          />
        ))}
        <label class="swatch swatch--custom" aria-label={S.cards.customColour}>
          <input type="color" value={props.value ?? '#3a3a3a'} onInput={(e) => props.onChange((e.target as HTMLInputElement).value)} />
        </label>
      </div>
    </div>
  );
}
