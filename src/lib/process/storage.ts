import { openDB, type DBSchema } from "idb";
import type { ProcessRecord, Kind } from "./model";
import { kinds, recordSchema } from "./model";
import { authClient, cloudConfigured } from "../cloud";
interface ProcessDB extends DBSchema {
  records: { key: [string, string]; value: { owner: string; id: string; record: ProcessRecord; pending: number; order: number }; indexes: { owner: string } };
}
const db = () => openDB<ProcessDB>("still-signal-process-v1", 1, { upgrade(d) { const s = d.createObjectStore("records", { keyPath: ["owner", "id"] }); s.createIndex("owner", "owner"); } });
export async function readProcess(owner: string) { return (await (await db()).getAllFromIndex("records", "owner", owner)).sort((a, b) => a.order - b.order).map(r => r.record); }
export async function saveProcess(owner: string, records: ProcessRecord[], pending = true) {
  const d = await db(), tx = d.transaction("records", "readwrite");
  for (const record of records) {
    recordSchema.parse(record);
    const old = await tx.store.get([owner, record.id]);
    if (old && JSON.stringify(old.record) !== JSON.stringify(record)) { tx.abort(); await tx.done.catch(() => {}); throw new Error("Immutable record conflict. Your saved copy is preserved."); }
    if (old) { if (!pending && old.pending) await tx.store.put({ ...old, pending: 0 }); continue; }
    // Local writes are serialized by the IDB transaction; stale tabs cannot fork a revision.
    if (pending) {
      const siblings = (await tx.store.index("owner").getAll(owner)).filter(r => r.record.rootId === record.rootId);
      const head = siblings.sort((a, b) => b.record.revision - a.record.revision)[0]?.record;
      if (head && (record.previousId !== head.id || record.revision !== head.revision + 1)) { tx.abort(); await tx.done.catch(() => {}); throw new Error("A newer revision exists. Refresh before saving."); }
    }
    await tx.store.put({ owner, id: record.id, record, pending: pending ? 1 : 0, order: Date.now() * 100 + records.indexOf(record) });
  }
  await tx.done;
}
export async function processApi<T>(payload: unknown): Promise<T> {
  const auth = await authClient()?.auth.getSession(), token = auth?.data.session?.access_token;
  if (!token) throw new Error("Sign in to sync your command center.");
  const response = await fetch("/api/process", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Command center sync failed. Local changes are saved.");
  return data as T;
}
const locks = new Map<string, Promise<number>>();
export function syncProcess(owner: string) {
  const old = locks.get(owner); if (old) return old;
  const promise = (async () => {
    if (!cloudConfigured || !navigator.onLine) return (await (await db()).getAllFromIndex("records", "owner", owner)).filter(r => r.pending).length;
    // Append in dependency order. A batch is atomic and duplicate IDs are idempotent.
    const pending = (await (await db()).getAllFromIndex("records", "owner", owner)).filter(r => r.pending).sort((a, b) => a.order - b.order);
    for (let i = 0; i < pending.length; i += 30) {
      const records = pending.slice(i, i + 30).map(r => r.record);
      await processApi({ action: "append", records });
      await saveProcess(owner, records, false);
    }
    for (const kind of kinds) {
      let after = "0";
      do {
        const result: { records: ProcessRecord[]; next?: string } = await processApi({ action: "list", kind: kind as Kind, after });
        await saveProcess(owner, result.records.map(r => recordSchema.parse(r)), false);
        after = result.next ?? "";
      } while (after);
    }
    return 0;
  })().finally(() => locks.delete(owner));
  locks.set(owner, promise); return promise;
}
