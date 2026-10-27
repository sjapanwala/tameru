import { describe, expect, it } from 'vitest';
import { findDate, findLast4, findTotal, findVendor, findWallet, mergeDrafts, parseReceipt } from './receiptParse';

const TODAY = '2026-10-19';

// Shaped like real Tesseract output: uneven spacing, stray symbols, a 0 for an O.
const COFFEE = `
  TIM HORTONS #4412
  123 Queen St W
  Toronto ON M5H 2M9
  (416) 555-0123
  Welcome!
  10/19/26   08:42
  1 Med Dbl Dbl          2.45
  1 Bagel BLT            5.29
  SUBTOTAL               7.74
  HST 13%                1.01
  T0TAL                $ 8.75
  VISA     ************4821
  APPROVED   AUTH 0042
`;

const GROCERY = `
LOBLAWS
Store 1022
2026-10-17 18:31
BANANAS        1.29
MILK 2% 4L     6.49
TOTAL SAVINGS  1.50
Subtotal      7.78
GST/HST         0.00
TOTAL         7.78
INTERAC
Card #: XXXX XXXX XXXX 0937
`;

const RESTAURANT = `
The Burger Joint
Order #77  Table 4
Oct 12, 2026
Burger            18.00
Fries              6.00
Subtotal          24.00
Tax                3.12
Amount Due       27.12
Tip               5.00
MASTERCARD ending in 5005
`;

describe('receipt parsing', () => {
  it('reads a coffee shop receipt', () => {
    expect(parseReceipt(COFFEE, TODAY)).toEqual({ merchant: 'Tim Hortons', amountCents: 875, last4: '4821', network: 'visa', date: '2026-10-19', confidence: 1 });
  });
  it('reads a grocery receipt, ignoring savings and subtotal', () => {
    expect(parseReceipt(GROCERY, TODAY)).toMatchObject({ merchant: 'Loblaws', amountCents: 778, last4: '0937', network: 'interac', date: '2026-10-17' });
  });
  it('reads a restaurant receipt: amount due, not the tip', () => {
    expect(parseReceipt(RESTAURANT, TODAY)).toMatchObject({ merchant: 'The Burger Joint', amountCents: 2712, last4: '5005', network: 'mastercard', date: '2026-10-12' });
  });
  it('finds the total on the next line when it wraps', () => {
    expect(findTotal(['Item 3.00', 'TOTAL', '$3.39'])).toBe(339);
    expect(findTotal(['Balance Due: 1,204.50'])).toBe(120450);
    expect(findTotal(['Montant total 12,45'])).toBe(1245);
  });
  it('falls back to the payment line, then the largest amount', () => {
    expect(findTotal(['Coffee 3.00', 'Muffin 2.50', 'VISA 5.50'])).toBe(550);
    expect(findTotal(['a 3.00', 'b 9.10'])).toBe(910);
    expect(findTotal(['no amounts here'])).toBeUndefined();
  });
  it('finds masked card numbers but not other long numbers', () => {
    expect(findLast4(['ACCT: ****1234'])).toBe('1234');
    expect(findLast4(['Card number •••• 7788'])).toBe('7788');
    expect(findLast4(['Phone 416 555 0123', 'Auth 004211'])).toBeUndefined();
    // real Tesseract output: the asterisks came back as letters
    expect(findLast4(['VISA            sorpkorkkokkokkk4821'])).toBe('4821');
    expect(findLast4(['VISA            sorskskokkokkkkkxk4 821'])).toBe('4821');
    expect(findLast4(['VISA            sctorkokokokokok 4821'])).toBe('4821');
    expect(findLast4(['VISA            sctorkokokokokok 4821 5'])).toBeUndefined(); // more digits follow: not a last four
    expect(findLast4(['Reference ABCDEFGH1234'])).toBeUndefined(); // not a payment line
  });
  it('picks plausible dates only', () => {
    expect(findDate(['31/12/2025'], TODAY)).toBe('2025-12-31'); // DD/MM when MM/DD is impossible
    expect(findDate(['12/31/2030'], TODAY)).toBeUndefined(); // in the future
    expect(findDate(['Sep 3 2026'], TODAY)).toBe('2026-09-03');
  });
  it('skips addresses, phones and banners for the vendor; keeps short acronyms', () => {
    expect(findVendor(['Welcome to', '55 King St', 'LCBO', 'Store #12'])).toBe('LCBO');
    expect(findVendor(['(905) 555-1234', 'SHOPPERS DRUG MART'])).toBe('Shoppers Drug Mart');
    expect(findVendor(['12.00', '***'])).toBeUndefined();
    expect(findVendor(['Ce eee', 'TIM HORTONS #4412'])).toBe('Tim Hortons'); // edge-of-paper noise
    expect(findVendor(['IKEA'])).toBe('IKEA');
  });
  it('fixes letters misread inside prices', () => {
    expect(findTotal(['TOTAL 1O.4S'])).toBe(1045);
    expect(findTotal(['TOTAL $l2.99'])).toBe(1299);
  });
  it('checks the total against subtotal plus tax', () => {
    // total misread, but the card line shows the real amount
    expect(findTotal(['Subtotal 7.74', 'HST 1.01', 'TOTAL 8.15', 'VISA 8.75'])).toBe(875);
    // the sum isn't printed anywhere else: trust the total
    expect(findTotal(['Subtotal 7.74', 'HST 1.01', 'TOTAL 8.15'])).toBe(815);
    // no total line at all
    expect(findTotal(['Subtotal 10.00', 'GST 0.50', 'PST 0.70'])).toBe(1120);
  });
  it('spots tap-to-pay from a phone or watch', () => {
    expect(findWallet(['VISA CONTACTLESS', 'APPLE PAY'])).toBe('apple_pay');
    expect(findWallet(['Google Pay'])).toBe('google_pay');
    expect(findWallet(['DPAN ****1234'])).toBe('device');
    expect(findWallet(['VISA ****1234'])).toBeUndefined();
    expect(findLast4(['DPAN ....1234'])).toBe('1234');
  });
  it('reads written-out month dates', () => {
    expect(findDate(['27-Sep-2026'], TODAY)).toBe('2026-09-27');
    expect(findDate(['14 Oct 26 12:01'], TODAY)).toBe('2026-10-14');
  });
  it('reports how much it found', () => {
    expect(parseReceipt('nothing useful', TODAY).confidence).toBe(0.25);
    expect(parseReceipt('', TODAY)).toEqual({ confidence: 0 });
  });
  it('fills what one read missed from the other', () => {
    const photo = { amountCents: 875, merchant: 'Tim Hortons', confidence: 0.5 };
    const sharp = { amountCents: 815, last4: '4821', date: '2026-10-19', confidence: 0.75 };
    // the fuller read leads; the other fills its gaps
    expect(mergeDrafts(photo, sharp)).toEqual({ amountCents: 815, merchant: 'Tim Hortons', last4: '4821', date: '2026-10-19', confidence: 1 });
    // a read with no total never leads over one with a total
    expect(mergeDrafts(photo, { last4: '1', date: '2026-10-19', merchant: 'x', confidence: 0.75 }).amountCents).toBe(875);
  });
});
