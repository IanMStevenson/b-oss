// TEMPORARY spike for b-oss#650: what GPS reaches the app from the Android picker. Not for merge.
import { useState } from 'react';
import { IonButton } from '@ionic/react';
import { Camera } from '@capacitor/camera';
import { EXIF_READ_BYTES, readExifGps } from '../../data/exifGps.js';

export function SpikeGps() {
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [...l, line]);

  async function viaPlugin(): Promise<void> {
    setLog([]);
    try {
      const res = await Camera.chooseFromGallery({ includeMetadata: true });
      const first = res.results[0];
      if (!first) return add('cancelled');
      add(`uri=${first.uri ?? '-'}`);
      add(`webPath=${first.webPath ?? '-'}`);
      const exif = first.metadata?.exif;
      add(`plugin exif string: ${exif ? exif.length + ' chars' : 'none'}`);
      if (exif) {
        add(`  has "GPS": ${/gps/i.test(exif)}`);
        add(`  head: ${exif.slice(0, 300)}`);
      }
      const url = first.webPath ?? first.uri;
      if (url) {
        const blob = await (await fetch(url)).blob();
        const bytes = new Uint8Array(await blob.slice(0, EXIF_READ_BYTES).arrayBuffer());
        add(`fetched ${blob.size} bytes, type ${blob.type}`);
        add(`my EXIF GPS parse: ${JSON.stringify(readExifGps(bytes))}`);
      }
    } catch (e) {
      add(`error: ${String(e)}`);
    }
  }

  async function viaInput(file: File | undefined): Promise<void> {
    setLog([]);
    if (!file) return add('no file');
    const bytes = new Uint8Array(await file.slice(0, EXIF_READ_BYTES).arrayBuffer());
    add(`file input: ${file.name}, ${file.size} bytes, ${file.type}`);
    add(`my EXIF GPS parse: ${JSON.stringify(readExifGps(bytes))}`);
  }

  return (
    <div style={{ padding: 12, fontSize: 12, border: '2px dashed red', margin: 8 }}>
      <strong>GPS spike (#650)</strong>
      <IonButton size="small" onClick={() => void viaPlugin()}>
        1. Plugin gallery picker
      </IonButton>
      <label style={{ display: 'block', margin: '8px 0' }}>
        2. WebView file input:{' '}
        <input type="file" accept="image/jpeg" onChange={(e) => void viaInput(e.target.files?.[0])} />
      </label>
      <pre style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>{log.join('\n')}</pre>
    </div>
  );
}
