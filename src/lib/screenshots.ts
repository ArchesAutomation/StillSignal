import { authClient } from "./cloud";
import type { JournalEntry } from "./model";
export const screenshotBucket = "pulse-screenshots";
export async function uploadScreenshot(
  file: File,
  owner: string,
  sessionId: string,
): Promise<NonNullable<JournalEntry["screenshot"]>> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose a screenshot smaller than 5 MB.");
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png =
    head[0] === 137 &&
    head[1] === 80 &&
    head[2] === 78 &&
    head[3] === 71 &&
    head[4] === 13 &&
    head[5] === 10 &&
    head[6] === 26 &&
    head[7] === 10;
  const jpg = head[0] === 255 && head[1] === 216 && head[2] === 255;
  const webp =
    String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  const extension = png ? "png" : jpg ? "jpg" : webp ? "webp" : null;
  if (!extension) throw new Error("Choose a PNG, JPEG or WebP screenshot.");
  const client = authClient();
  if (!client) throw new Error("Sign in and connect to upload a screenshot.");
  const path = `${owner}/${sessionId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage
    .from(screenshotBucket)
    .upload(path, file, {
      contentType: `image/${extension === "jpg" ? "jpeg" : extension}`,
      upsert: false,
    });
  if (error)
    throw new Error(
      "Screenshot upload failed. Check your connection and try again.",
    );
  return { path, name: file.name.slice(0, 160) };
}
export async function removeScreenshot(path: string) {
  const client = authClient();
  if (!client) throw new Error("Sign in to remove a screenshot.");
  const { error } = await client.storage.from(screenshotBucket).remove([path]);
  if (error) throw new Error("Could not remove the screenshot. Please retry.");
}
export async function screenshotUrl(path: string) {
  const client = authClient();
  if (!client) throw new Error("Sign in to view this screenshot.");
  const { data, error } = await client.storage
    .from(screenshotBucket)
    .createSignedUrl(path, 300);
  if (error) throw new Error("Could not load this screenshot.");
  return data.signedUrl;
}
export async function removeSessionScreenshots(
  owner: string,
  sessionId: string,
) {
  const client = authClient();
  if (!client) throw new Error("Sign in to remove screenshots.");
  const prefix = `${owner}/${sessionId}`;
  // Each session has at most 1,000 reflections. Paginate orphaned replacement uploads too.
  while (true) {
    const { data, error } = await client.storage
      .from(screenshotBucket)
      .list(prefix, { limit: 100 });
    if (error) throw error;
    if (!data?.length) break;
    const { error: deleted } = await client.storage
      .from(screenshotBucket)
      .remove(data.map((f) => `${prefix}/${f.name}`));
    if (deleted) throw deleted;
  }
}
