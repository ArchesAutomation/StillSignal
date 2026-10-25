import { openDB, type DBSchema } from "idb";
import type { Session, Sample } from "./model";
import { mergeSessions } from "./workspace";
interface Store extends DBSchema {
  sessions: { key: string; value: Session; indexes: { owner: string } };
  samples: {
    key: [string, number];
    value: Sample & { sessionId: string };
    indexes: { session: string };
  };
  outbox: {
    key: string;
    value: {
      id: string;
      owner: string;
      sessionId: string;
      samples: Sample[];
      createdAt: number;
    };
    indexes: { owner: string };
  };
}
const db = () =>
  openDB<Store>("trade-pulse-v1", 1, {
    upgrade(d) {
      const s = d.createObjectStore("sessions", { keyPath: "id" });
      s.createIndex("owner", "owner");
      const p = d.createObjectStore("samples", { keyPath: ["sessionId", "t"] });
      p.createIndex("session", "sessionId");
      const o = d.createObjectStore("outbox", { keyPath: "id" });
      o.createIndex("owner", "owner");
    },
  });
export async function saveSession(s: Session) {
  const d = await db();
  const tx = d.transaction("sessions", "readwrite");
  const existing = await tx.store.get(s.id);
  if (existing && existing.owner !== s.owner) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("Workspace identity mismatch.");
  }
  // Merge inside the write transaction, against the latest stored revision.
  // A cloud history fetch must not overwrite a note saved while it was in flight.
  const key = await tx.store.put(mergeSessions(existing, s));
  await tx.done;
  return key;
}
export async function listSessions(owner: string) {
  return (await (await db()).getAllFromIndex("sessions", "owner", owner)).sort(
    (a, b) => b.startedAt - a.startedAt,
  );
}
export async function getSession(id: string, owner: string) {
  const session = await (await db()).get("sessions",id);
  if (session && session.owner !== owner) throw new Error("Workspace identity mismatch.");
  return session;
}
export async function appendSamples(
  sessionId: string,
  samples: Sample[],
  owner: string,
  queue = true,
) {
  const d = await db();
  const tx = d.transaction(["sessions", "samples", "outbox"], "readwrite");
  const session = await tx.objectStore("sessions").get(sessionId);
  if (!session || session.owner !== owner) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("Workspace identity mismatch.");
  }
  for (const p of samples)
    await tx.objectStore("samples").put({ ...p, sessionId });
  if (queue) {
    const buckets = new Map<number, Sample[]>();
    for (const p of samples) {
      const bucket = Math.floor(p.t / 30000) * 30000;
      buckets.set(bucket, [...(buckets.get(bucket) || []), p]);
    }
    for (const [createdAt, points] of buckets) {
      const id =
        sessionId.slice(0, 24) +
        Math.floor(createdAt / 30000)
          .toString(16)
          .padStart(12, "0");
      const old = await tx.objectStore("outbox").get(id);
      const merged = [
        ...new Map(
          [...(old?.samples || []), ...points].map((p) => [p.t, p]),
        ).values(),
      ];
      await tx
        .objectStore("outbox")
        .put({ id, owner, sessionId, samples: merged, createdAt });
    }
  }
  await tx.done;
}
export async function getSamples(id: string, owner: string) {
  const d = await db();
  const tx = d.transaction(["sessions", "samples"], "readonly");
  const session = await tx.objectStore("sessions").get(id);
  if (!session) return [];
  if (session.owner !== owner) throw new Error("Workspace identity mismatch.");
  const rows = await tx.objectStore("samples").index("session").getAll(id);
  await tx.done;
  return rows.map(({ t, bpm }) => ({ t, bpm }));
}
export async function pending(owner: string) {
  return (await (await db()).getAllFromIndex("outbox", "owner", owner)).filter(
    (b) => b.createdAt + 30000 < Date.now(),
  );
}
export async function acknowledge(id: string) {
  return (await db()).delete("outbox", id);
}
export async function removeSession(id: string, owner: string) {
  const d = await db();
  const tx = d.transaction(["sessions", "samples", "outbox"], "readwrite");
  const session = await tx.objectStore("sessions").get(id);
  if (session && session.owner !== owner) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("Workspace identity mismatch.");
  }
  await tx.objectStore("sessions").delete(id);
  for await (const cursor of tx
    .objectStore("samples")
    .index("session")
    .iterate(id))
    await cursor.delete();
  for await (const cursor of tx.objectStore("outbox").iterate())
    if (cursor.value.sessionId === id) await cursor.delete();
  await tx.done;
}
