import { openDB, type DBSchema } from "idb";
import { authClient, cloudConfigured } from "./cloud";
import { keepPrivateFile, privateFile, removePrivateFile } from "./private-files";
import { awayEventSchema, type AwayEvent, type AwayEventBody, type AwayImage } from "./process/away-days";
import { processApi } from "./process/storage";
import { screenshotBucket, screenshotExtension, screenshotUrl } from "./screenshots";

interface AwayDB extends DBSchema {
  events: {
    key: [string, string];
    value: { owner: string; id: string; event: AwayEvent; pending: number };
    indexes: { owner: string };
  };
  uploads: { key: [string, string]; value: { owner: string; imageId: string } };
}
const db = () => openDB<AwayDB>("still-signal-away-days-v1", 1, {
  upgrade(d) {
    d.createObjectStore("events", { keyPath: ["owner", "id"] }).createIndex("owner", "owner");
    d.createObjectStore("uploads", { keyPath: ["owner", "imageId"] });
  },
});

export const createAwayEvent = (body: AwayEventBody, now = Date.now()): AwayEvent =>
  awayEventSchema.parse({ id: crypto.randomUUID(), createdAt: now, body });

export async function readAwayEvents(owner: string) {
  return (await (await db()).getAllFromIndex("events", "owner", owner)).map(row => row.event);
}

export async function saveAwayEvents(owner: string, events: AwayEvent[], pending = true) {
  const parsed = events.map(event => awayEventSchema.parse(event));
  const tx = (await db()).transaction("events", "readwrite");
  for (const event of parsed) {
    const old = await tx.store.get([owner, event.id]);
    if (!old) await tx.store.put({ owner, id: event.id, event, pending: pending ? 1 : 0 });
    else if (!pending && old.pending) await tx.store.put({ ...old, pending: 0 });
  }
  await tx.done;
}

const localImagePath = (owner: string, imageId: string) => `local-image:${owner}:${imageId}`;

/** Keeps the original on this device. The upload waits until a saved reflection refers to it. */
export async function keepAwayScreenshot(owner: string, file: File): Promise<AwayImage> {
  const extension = await screenshotExtension(file);
  const id = crypto.randomUUID();
  await keepPrivateFile(owner, id, "image", file);
  return { id, path: `${owner}/away-days/${id}.${extension}`, name: file.name.slice(0, 160), timeframe: "", caption: "" };
}

export const discardAwayScreenshot = (owner: string, image: AwayImage) =>
  removePrivateFile(localImagePath(owner, image.id), owner);

/** Prefers this device's copy, so a screenshot still opens offline. */
export async function awayScreenshotUrl(owner: string, image: AwayImage) {
  try {
    const url = URL.createObjectURL(await privateFile(localImagePath(owner, image.id), owner));
    return { url, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    if (!cloudConfigured) throw error;
    return { url: await screenshotUrl(image.path), release: () => {} };
  }
}

export type AwayTransport = {
  append: (events: AwayEvent[]) => Promise<unknown>;
  list: (after: string) => Promise<{ events: AwayEvent[]; cursor: string; more: boolean }>;
  upload: (image: AwayImage, blob: Blob) => Promise<void>;
};

async function uploadImages(owner: string, event: AwayEvent, transport: AwayTransport) {
  if (event.body.type !== "note") return;
  const d = await db();
  for (const image of event.body.images) {
    if (await d.get("uploads", [owner, image.id])) continue;
    const blob = await privateFile(localImagePath(owner, image.id), owner).catch(() => null);
    // Without the original there is nothing to retry. The words still sync.
    if (!blob) continue;
    await transport.upload(image, blob);
    await d.put("uploads", { owner, imageId: image.id });
  }
}

const cursors = new Map<string, string>();

export async function syncAwayEventsWith(owner: string, transport: AwayTransport) {
  const d = await db();
  const pending = (await d.getAllFromIndex("events", "owner", owner))
    .filter(row => row.pending)
    .map(row => row.event)
    .sort((a, b) => a.createdAt - b.createdAt);
  let uploadError: unknown;
  const ready: AwayEvent[] = [];
  for (const event of pending) {
    try {
      await uploadImages(owner, event, transport);
      ready.push(event);
    } catch (error) {
      // A reflection stays pending until its screenshots are safely stored.
      uploadError = error;
    }
  }
  try {
    for (let i = 0; i < ready.length;) {
      const batch: AwayEvent[] = [];
      while (i < ready.length && batch.length < 30) {
        if (batch.length && new TextEncoder().encode(JSON.stringify([...batch, ready[i]])).byteLength > 450000) break;
        batch.push(ready[i++]);
      }
      await transport.append(batch);
      await saveAwayEvents(owner, batch, false);
    }
  } catch (error) {
    uploadError = error;
  }
  let after = cursors.get(owner) ?? "0";
  for (;;) {
    const page = await transport.list(after);
    await saveAwayEvents(owner, page.events, false);
    after = page.cursor;
    cursors.set(owner, after);
    if (!page.more) break;
  }
  if (uploadError) throw uploadError;
  return (await d.getAllFromIndex("events", "owner", owner)).filter(row => row.pending).length;
}

const cloudTransport = (owner: string): AwayTransport => ({
  append: events => processApi({ action: "away-append", events }, owner),
  list: after => processApi({ action: "away-list", after }, owner),
  async upload(image, blob) {
    const client = authClient();
    if (!client) throw new Error("Sign in to sync screenshots.");
    const extension = image.path.split(".").at(-1);
    const { error } = await client.storage.from(screenshotBucket).upload(image.path, blob, {
      contentType: `image/${extension === "jpg" ? "jpeg" : extension}`,
      upsert: false,
    });
    // A retry after a lost response finds the object already stored.
    if (error && !/exists|duplicate/i.test(error.message)) throw new Error("Screenshot upload failed. It will retry.");
  },
});

const locks = new Map<string, Promise<number>>();
const queued = new Map<string, Promise<number>>();
export function syncAwayDays(owner: string): Promise<number> {
  const running = locks.get(owner);
  if (running) {
    // A change saved during a sync may have missed its upload list, so run once more afterwards.
    const next = queued.get(owner) ?? running.catch(() => 0).then(() => {
      queued.delete(owner);
      return syncAwayDays(owner);
    });
    queued.set(owner, next);
    return next;
  }
  const promise = (async () => {
    if (!cloudConfigured || !navigator.onLine)
      return (await (await db()).getAllFromIndex("events", "owner", owner)).filter(row => row.pending).length;
    return syncAwayEventsWith(owner, cloudTransport(owner));
  })().finally(() => locks.delete(owner));
  locks.set(owner, promise);
  return promise;
}
