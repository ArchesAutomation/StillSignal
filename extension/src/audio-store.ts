// Origin-local IndexedDB survives offscreen/panel closure and worker suspension.
// Audio is erased immediately after a transcription succeeds, or explicit cancel.
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("trade-pulse-voice", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("audio", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export type AudioRecord = {
  id: string;
  userId: string;
  chunks: Blob[];
  mime: string;
  finished: boolean;
  durationMs: number;
};
export async function audioRead(id: string): Promise<AudioRecord | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("audio").objectStore("audio").get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function audioWrite(value: AudioRecord) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("audio", "readwrite");
      t.objectStore("audio").put(value);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
export async function audioRemove(id: string) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("audio", "readwrite");
      t.objectStore("audio").delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
