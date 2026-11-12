import { openDB, type DBSchema } from "idb";
import type { ProcessRecord, Kind } from "./model";
import { isLiveKind, kinds, recordSchema } from "./model";
import { authClient, cloudConfigured } from "../cloud";
interface ProcessDB extends DBSchema {
  records: {
    key: [string, string];
    value: {
      owner: string;
      id: string;
      record: ProcessRecord;
      pending: number;
      order: number;
    };
    indexes: { owner: string };
  };
}
const db = () =>
  openDB<ProcessDB>("still-signal-process-v1", 1, {
    upgrade(d) {
      const s = d.createObjectStore("records", { keyPath: ["owner", "id"] });
      s.createIndex("owner", "owner");
    },
  });
export async function readProcess(owner: string) {
  return (await (await db()).getAllFromIndex("records", "owner", owner))
    // Playbooks, trade assessments and rule evaluations are retired. Older copies may still be
    // stored on this device; they stay untouched but are no longer loaded or synced.
    .filter((r) => isLiveKind(r.record.kind))
    .sort((a, b) => a.order - b.order)
    .map((r) => r.record);
}
export async function saveProcess(
  owner: string,
  records: ProcessRecord[],
  pending = true,
) {
  // Validate the complete batch before opening a transaction. A thrown parser
  // error after an awaited put does not automatically abort IndexedDB writes.
  for (const record of records) recordSchema.parse(record);
  const d = await db(),
    tx = d.transaction("records", "readwrite");
  try {
    let order = (await tx.store.index("owner").getAll(owner)).reduce(
      (max, row) => Math.max(max, row.order),
      0,
    );
    for (const record of records) {
      const old = await tx.store.get([owner, record.id]);
      if (old && JSON.stringify(old.record) !== JSON.stringify(record)) {
        throw new Error(
          "Immutable record conflict. Your saved copy is preserved.",
        );
      }
      if (old) {
        if (!pending && old.pending) await tx.store.put({ ...old, pending: 0 });
        continue;
      }
      // Local writes are serialized by the IDB transaction; stale tabs cannot fork a revision.
      if (pending) {
        const siblings = (await tx.store.index("owner").getAll(owner)).filter(
          (r) => r.record.rootId === record.rootId,
        );
        const head = siblings.sort(
          (a, b) => b.record.revision - a.record.revision,
        )[0]?.record;
        if (
          head &&
          (record.previousId !== head.id || record.revision !== head.revision + 1)
        ) {
          throw new Error("A newer revision exists. Refresh before saving.");
        }
      }
      await tx.store.put({
        owner,
        id: record.id,
        record,
        pending: pending ? 1 : 0,
        order: ++order,
      });
    }
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The transaction may already have aborted. */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}
export async function processApi<T>(
  payload: unknown,
  expectedOwner: string,
): Promise<T> {
  const auth = await authClient()?.auth.getSession(),
    token = auth?.data.session?.access_token;
  if (!token) throw new Error("Sign in to sync your command center.");
  if (auth?.data.session?.user.id !== expectedOwner)
    throw new Error(
      "Workspace identity changed. Sign in to the original account to sync these records.",
    );
  const response = await fetch("/api/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const fields = Array.isArray(data.fields)
      ? data.fields.slice(0, 5).flatMap((issue: { field?: unknown; message?: unknown }) =>
          issue && typeof issue.field === "string" && typeof issue.message === "string"
            ? [`${issue.field}: ${issue.message}`]
            : [],
        ).join("; ")
      : "";
    throw new Error(
      (data.error || "Command center sync failed. Local changes are saved.") +
        (fields ? ` (${fields})` : ""),
    );
  }
  return data as T;
}
const locks = new Map<string, Promise<number>>();
export function syncProcess(owner: string) {
  const old = locks.get(owner);
  if (old) return old;
  const promise = (async () => {
    if (!cloudConfigured || !navigator.onLine)
      return (
        await (await db()).getAllFromIndex("records", "owner", owner)
      ).filter((r) => r.pending).length;
    // Append in dependency order. A batch is atomic and duplicate IDs are idempotent.
    const pending = (
      await (await db()).getAllFromIndex("records", "owner", owner)
    )
      .filter((r) => r.pending && isLiveKind(r.record.kind))
      .sort((a, b) => a.order - b.order);
    let uploadError: unknown;
    try {
      for (let i = 0; i < pending.length; ) {
        const records: ProcessRecord[] = [];
        while (i < pending.length && records.length < 30) {
          const next = pending[i].record;
          if (
            records.length &&
            new TextEncoder().encode(JSON.stringify([...records, next]))
              .byteLength > 450000
          )
            break;
          records.push(next);
          i++;
        }
        await processApi({ action: "append", records }, owner);
        await saveProcess(owner, records, false);
      }
    } catch (error) {
      // Keep rejected writes pending, but still download remote evidence.
      // Otherwise every Refresh retries the same rejection without ever
      // retrieving the newer records it tells the user to refresh for.
      uploadError = error;
    }
    try {
      for (const kind of kinds) {
        let after = "0";
        do {
          const result: { records: ProcessRecord[]; next?: string } =
            await processApi(
              { action: "list", kind: kind as Kind, after },
              owner,
            );
          await saveProcess(
            owner,
            result.records.map((r) => recordSchema.parse(r)),
            false,
          );
          after = result.next ?? "";
        } while (after);
      }
    } catch (error) {
      if (uploadError)
        throw new Error(
          `${uploadError instanceof Error ? uploadError.message : "Upload failed."} Cloud refresh also failed; local changes remain awaiting sync.`,
        );
      throw error;
    }
    if (uploadError) throw uploadError;
    return (
      await (await db()).getAllFromIndex("records", "owner", owner)
    ).filter((r) => r.pending).length;
  })().finally(() => locks.delete(owner));
  locks.set(owner, promise);
  return promise;
}
