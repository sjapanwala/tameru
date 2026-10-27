import { describe, expect, it } from 'vitest';
import {
  applyCovers,
  cardLabels,
  cardsOf,
  customInstitutionId,
  continents,
  defaultContinent,
  dominantColor,
  institutionInitials,
  institutionName,
  institutions,
  kindFrom,
  networkFrom,
  parseManifest,
  shortCardName,
  textOn,
} from './cardCatalog';

const NOTE = 'jpeg: the file is jpeg format, needs a png format version.';
const manifest = parseManifest([
  { id: 'td/aeroplan', label: 'TD Aeroplane', group: [NOTE, 'United States', 'Others', 'Credit Cards'], file: 'td/aeroplan.jpeg', bank: 'td' },
  { id: 'td/debit-us', label: 'TD Bank', group: [NOTE, 'United States', 'Others', 'Debit Cards'], file: 'td/debit-us.png', bank: 'td' },
  { id: 'bmo/cashback', label: 'BMO Cashback', group: [NOTE, 'Canada'], file: 'bmo/cashback.png', bank: 'bmo' },
  { id: 'rbc/avion-visa-infinite', label: 'RBC Avion VI', group: [NOTE, 'Canada'], file: 'rbc/avion.png', bank: 'rbc' },
  { id: 'american-express/blue-cash-everyday', label: 'Blue Cash Everyday', group: [NOTE, 'United States', 'American Express', 'Personal'], file: 'american-express/bce.png', bank: 'american-express' },
  { id: 'bad' },
  { id: 'td/aeroplan', label: 'dupe', file: 'x.png', bank: 'td' },
  { id: 'evil', label: 'x', file: '../../etc/passwd', bank: 'x' },
]);

describe('continents', () => {
  it('groups Canada and the US together, and filters institutions and cards by continent', () => {
    expect(continents(manifest)).toEqual(['North America']);
    expect(institutions(manifest, [], 'North America').map((i) => i.id)).toEqual(['american-express', 'bmo', 'rbc', 'td']);
    expect(institutions(manifest, [{ id: 'custom/koho', name: 'Koho' }], 'North America').map((i) => i.id)).toContain('custom/koho');
    // TD's US and Canadian cards show together
    expect(cardsOf(manifest, 'td', 'North America').map((c) => c.id)).toEqual(['td/aeroplan', 'td/debit-us']);
    expect(cardsOf(manifest, 'bmo', 'Europe').map((c) => c.id)).toEqual(['bmo/cashback']); // none there: show them all
  });
  it('opens on the institution’s continent, else the home currency’s', () => {
    expect(defaultContinent(manifest, 'CAD')).toBe('North America');
    expect(defaultContinent(manifest, 'USD', 'td')).toBe('North America');
    expect(defaultContinent(manifest, 'GBP', 'bmo')).toBe('North America');
    expect(defaultContinent(manifest, 'GBP')).toBeUndefined(); // no European art in this sample
    expect(defaultContinent(manifest, 'XYZ')).toBeUndefined();
  });
  it('maps each country in the dataset to its continent', () => {
    const regions = parseManifest(
      ['UK', 'EU?', 'Netherlands', 'Japan', 'Greater China', 'Singapore', 'Australia', 'Canada'].map((r, i) => ({ id: `x/${i}`, label: 'x', group: [NOTE, r], file: 'x.png', bank: 'x' })),
    ).map((c) => c.region);
    expect(regions).toEqual(['Europe', 'Europe', 'Europe', 'Asia', 'Asia', 'Asia', 'Oceania', 'North America']);
  });
});

describe('manifest', () => {
  it('parses entries and skips bad, duplicate and path-escaping ones', () => {
    expect(manifest.map((c) => c.id)).toEqual(['td/aeroplan', 'td/debit-us', 'bmo/cashback', 'rbc/avion-visa-infinite', 'american-express/blue-cash-everyday']);
    expect(manifest[0]).toMatchObject({ institutionId: 'td', kind: 'credit', region: 'North America', file: 'td/aeroplan.jpeg' });
    expect(manifest[1]!.kind).toBe('debit');
    expect(parseManifest({ cards: [] })).toEqual([]);
  });
  it('infers network and kind', () => {
    expect(networkFrom('RBC Avion VI', 'rbc')).toBe('visa');
    expect(networkFrom('Blue Cash Everyday', 'american-express')).toBe('amex');
    expect(networkFrom('BMO Mcgill Student Mastercard', 'bmo')).toBe('mastercard');
    expect(networkFrom('MBNA Rewards WE', 'mbna')).toBe('other');
    expect(kindFrom('BMO Harris Debit', [NOTE, 'Canada'])).toBe('debit');
    expect(kindFrom('金穗借记卡普卡', [NOTE])).toBe('debit');
  });
});

describe('institutions', () => {
  it('names institutions from folder slugs', () => {
    expect(institutionName('td')).toBe('TD');
    expect(institutionName('bank-of-china-hong-kong')).toBe('Bank of China Hong Kong');
    expect(institutionName('american-express')).toBe('American Express');
    expect(institutionName('crypto-com')).toBe('Crypto.com');
    expect(institutionName('us-bank')).toBe('U.S. Bank');
  });
  it('lists bundled and custom institutions together, sorted', () => {
    const list = institutions(manifest, [{ id: customInstitutionId('Koho Financial'), name: 'Koho Financial', color: '#6b2d8f' }]);
    expect(list.map((i) => i.name)).toEqual(['American Express', 'BMO', 'Koho Financial', 'RBC', 'TD']);
    expect(list.find((i) => i.custom)).toMatchObject({ id: 'custom/koho-financial', color: '#6b2d8f' });
  });
  it('groups cards and shortens names', () => {
    expect(cardsOf(manifest, 'td').map((c) => c.id)).toEqual(['td/aeroplan', 'td/debit-us']);
    expect(shortCardName(manifest[2]!)).toBe('Cashback');
    expect(shortCardName(manifest[1]!)).toBe('TD Bank');
    expect(shortCardName({ name: 'TD', institutionId: 'td' })).toBe('TD');
    const dupes = parseManifest([
      { id: 'td/debit-us', label: 'TD Bank', file: 'a.png', bank: 'td' },
      { id: 'td/debit-us-2', label: 'TD Bank', file: 'b.png', bank: 'td' },
      { id: 'td/aeroplan', label: 'TD Aeroplane', file: 'c.png', bank: 'td' },
    ]);
    expect([...cardLabels(dupes).values()]).toEqual(['TD Bank · Debit Us', 'TD Bank · Debit Us 2', 'Aeroplane']);
    expect(institutionInitials('Bank of America')).toBe('BA');
    expect(institutionInitials('TD')).toBe('TD');
  });
});

describe('printed-detail covers', () => {
  it('attaches clean images and labels, ignoring junk', () => {
    const r = applyCovers(manifest, {
      'td/aeroplan': { method: 'clean', file: 'clean/td/aeroplan.png', box: [0.02, 0.84, 0.28, 0.95] },
      'bmo/cashback': { method: 'label', box: [0.02, 0.84, 0.28, 0.95], color: '#484e54' },
      'rbc/avion-visa-infinite': { method: 'label', box: [0.5, 0.9, 0.1, 0.95] }, // x0 > x1
      'td/debit-us': { method: 'clean', file: '../x.png', box: [0, 0, 1, 1] },
      nope: { method: 'label', box: [0, 0, 1, 1] },
    });
    expect(r.filter((c) => c.cover).map((c) => [c.id, c.cover!.method])).toEqual([['td/aeroplan', 'clean'], ['bmo/cashback', 'label']]);
    expect(r.find((c) => c.id === 'bmo/cashback')!.cover).toMatchObject({ color: '#484e54' });
    expect(applyCovers(manifest, null).some((c) => c.cover)).toBe(false);
  });
});

describe('colour', () => {
  const px = (r: number, g: number, b: number, n: number, a = 255) => Array.from({ length: n }, () => [r, g, b, a]).flat();
  it('finds the brand colour, ignoring white text, black and transparency', () => {
    const img = [...px(0, 120, 60, 50), ...px(255, 255, 255, 80), ...px(5, 5, 5, 40), ...px(200, 0, 0, 30, 0)];
    expect(dominantColor(img)).toBe('#00783c');
  });
  it('prefers saturated colour over a larger grey area', () => {
    expect(dominantColor([...px(120, 120, 120, 60), ...px(200, 30, 40, 30)])).toBe('#c81e28');
  });
  it('falls back for greyscale or empty art', () => {
    expect(dominantColor(px(255, 255, 255, 10))).toBe('#ffffff');
    expect(dominantColor([])).toBe('#2b2b2b');
  });
  it('picks readable text', () => {
    expect(textOn('#e8e4dc')).toBe('#111111');
    expect(textOn('#1d3b6e')).toBe('#ffffff');
  });
});
