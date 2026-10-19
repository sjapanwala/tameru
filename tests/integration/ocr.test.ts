// The real OCR engine (Tesseract.js, running in Node here) reading a photo-like
// receipt image, then the parser. Slower than the other tests, but it's the proof
// that scanning works end to end with the bundled English model.
import { resolve } from 'node:path';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../../src/domain/receiptParse';

describe('receipt OCR end to end', () => {
  it('reads vendor, total, card and date from a receipt photo', async () => {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
      langPath: resolve(__dirname, '../../node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
      cachePath: resolve(__dirname, '../../node_modules/.cache/tesseract'),
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN, preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(resolve(__dirname, '../fixtures/receipt-coffee.jpg'));
    await worker.terminate();
    const draft = parseReceipt(data.text, '2026-10-19');
    expect(draft).toMatchObject({ merchant: 'Tim Hortons', amountCents: 875, last4: '4821', network: 'visa', date: '2026-10-18' });
  }, 60_000);
});
