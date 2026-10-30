import { openDB, type DBSchema } from "idb";
interface Files extends DBSchema {
  files: {
    key: string;
    value: {
      key: string;
      owner: string;
      sessionId?: string;
      kind: "audio" | "csv" | "image";
      blob: Blob;
      expiresAt?: number;
    };
    indexes: { owner: string };
  };
}
const db = () =>
  openDB<Files>("still-signal-private-files", 1, {
    upgrade(d) {
      d.createObjectStore("files", { keyPath: "key" }).createIndex(
        "owner",
        "owner",
      );
    },
  });
export async function keepPrivateFile(
  owner: string,
  id: string,
  kind: "audio" | "csv" | "image",
  blob: Blob,
  sessionId?: string,
) {
  const key = `${kind === "audio" ? "local-audio" : kind === "image" ? "local-image" : "local-csv"}:${owner}:${id}`;
  const expiresAt = kind === "audio" ? Date.now() + 7 * 86400000 : undefined;
  await (
    await db()
  ).put("files", { key, owner, sessionId, kind, blob, expiresAt });
  return { path: key, expiresAt };
}
export async function privateFile(path: string, owner: string) {
  const d = await db(),
    row = await d.get("files", path);
  if (!row || row.owner !== owner)
    throw new Error("Original file is unavailable on this device.");
  if (row.expiresAt && row.expiresAt <= Date.now()) {
    await d.delete("files", path);
    throw new Error("The audio retention period has ended.");
  }
  return row.blob;
}
export async function removePrivateFile(path: string, owner: string) {
  const d = await db(),
    row = await d.get("files", path);
  if (row && row.owner !== owner)
    throw new Error("Workspace identity mismatch.");
  await d.delete("files", path);
}
export async function cleanPrivateFiles(
  owner: string,
  sessionId?: string,
  allAudio = false,
) {
  const d = await db(),
    tx = d.transaction("files", "readwrite");
  for await (const cursor of tx.store.index("owner").iterate(owner)) {
    const row = cursor.value;
    if (
      (row.expiresAt && row.expiresAt <= Date.now()) ||
      (sessionId && row.sessionId === sessionId) ||
      (allAudio && row.kind === "audio")
    )
      await cursor.delete();
  }
  await tx.done;
}
