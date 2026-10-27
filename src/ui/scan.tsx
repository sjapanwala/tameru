// Receipt scanning from anywhere: Activity's header buttons and the tab bar's hold
// menu. The file inputs live here, once, so a tap can open the camera straight away
// (iOS only allows that inside the tap itself).

import { useRef, useState } from 'preact/hooks';
import { S } from '../copy/strings';
import { RECEIPT_TYPES } from '../domain/receipt';
import { ReceiptScanner } from './ReceiptScanner';
import { Sheet } from './Sheet';

type Source = 'upload' | 'camera';
const inputs: Partial<Record<Source, HTMLInputElement | null>> = {};

/** Open the photo library or the camera, then read the receipt. Call from a tap. */
export function scanReceipt(source: Source): void {
  inputs[source]?.click();
}

export function ScanHost() {
  const [file, setFile] = useState<File | null>(null);
  const last = useRef<Source>('upload');
  const pick = (input: HTMLInputElement, source: Source) => {
    const f = input.files?.[0];
    if (!f) return;
    input.value = '';
    last.current = source;
    setFile(f);
  };
  return (
    <>
      <input ref={(el) => void (inputs.upload = el)} type="file" accept={RECEIPT_TYPES} hidden onChange={(e) => pick(e.target as HTMLInputElement, 'upload')} />
      <input ref={(el) => void (inputs.camera = el)} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target as HTMLInputElement, 'camera')} />
      {file && (
        <Sheet label={S.receipt.title} onClose={() => setFile(null)}>
          <ReceiptScanner
            key={file.name + file.size + file.lastModified}
            file={file}
            onClose={() => setFile(null)}
            onRetake={() => {
              setFile(null);
              scanReceipt(last.current);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
