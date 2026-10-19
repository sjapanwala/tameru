// On-device text recognition for receipts (Tesseract.js, WebAssembly).
// The worker, engine and English model are bundled with the app under ocr/ and
// loaded on the first scan; nothing is fetched from a CDN and images never leave
// the device. The service worker keeps the files for offline scanning.

import type { Worker } from 'tesseract.js';

export type OcrPhase = 'preparing' | 'reading';
export type OcrProgress = (phase: OcrPhase, fraction: number) => void;

const asset = (path: string) => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, document.baseURI).href;

let worker: Promise<Worker> | null = null;
let listener: OcrProgress | null = null;

function getWorker(): Promise<Worker> {
  worker ??= import('tesseract.js')
    .then(({ createWorker, OEM, PSM }) =>
      createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: asset('worker.min.js'),
        corePath: asset('core/'),
        langPath: asset('lang/'),
        workerBlobURL: false,
        logger: (m) => {
          const reading = m.status === 'recognizing text';
          listener?.(reading ? 'reading' : 'preparing', reading ? m.progress : 0);
        },
      }).then(async (w) => {
        // Receipts are one column of short lines; keep spacing so amounts stay on their line.
        await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN, preserve_interword_spaces: '1' });
        return w;
      }),
    )
    .catch((e) => {
      worker = null; // let the next scan try again
      throw e;
    });
  return worker;
}

/**
 * Scale to ~1600px wide, convert to greyscale and stretch the contrast. Phone photos
 * of receipts are usually large, slightly grey and unevenly lit; this helps a lot.
 */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, 1600 / bitmap.width) || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  // Greyscale, then stretch between the 2nd and 98th percentile of brightness.
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114);
    d[i] = g;
    hist[g]!++;
  }
  const cut = (d.length / 4) * 0.02;
  let lo = 0;
  let acc = 0;
  while (lo < 255 && acc + hist[lo]! < cut) acc += hist[lo++]!;
  let hi = 255;
  acc = 0;
  while (hi > 0 && acc + hist[hi]! < cut) acc += hist[hi--]!;
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i]! - lo) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Read the text on a receipt photo. */
export async function recognise(file: Blob, onProgress?: OcrProgress): Promise<string> {
  listener = onProgress ?? null;
  try {
    onProgress?.('preparing', 0);
    const [w, canvas] = await Promise.all([getWorker(), prepare(file)]);
    const { data } = await w.recognize(canvas);
    return data.text;
  } finally {
    listener = null;
  }
}
