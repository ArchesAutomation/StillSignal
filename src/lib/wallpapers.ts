import { openDB } from "idb";

export type Wallpaper = { id: string; name: string; image: Blob };
export const WALLPAPER_EVENT = "still-signal-wallpapers";
export const BUILTIN_WALLPAPERS = [
  { id: "ocean", name: "Living ocean", background: "linear-gradient(145deg, #102b35, #080c0e 75%)" },
  { id: "aurora", name: "Aurora", background: "radial-gradient(ellipse at 20% 15%, #577f8d, transparent 55%), radial-gradient(ellipse at 85% 75%, #665783, transparent 65%), linear-gradient(130deg, #172933, #111821)" },
  { id: "dusk", name: "Dusk", background: "radial-gradient(ellipse at 75% 20%, #b38472, transparent 55%), radial-gradient(ellipse at 15% 85%, #505a7d, transparent 65%), linear-gradient(145deg, #473641, #1b2535)" },
] as const;
const database = () => openDB("still-signal-wallpapers", 1, {
  upgrade(db) { db.createObjectStore("images", { keyPath: "id" }); },
});
export async function listWallpapers(): Promise<Wallpaper[]> {
  const db = await database();
  try { return await db.getAll("images"); } finally { db.close(); }
}
export async function saveWallpaper(file: File): Promise<Wallpaper> {
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) throw new Error("Choose a JPG, PNG, WebP or AVIF image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not save this image.")), "image/webp", .9));
    const db = await database();
    try {
      const tx = db.transaction("images", "readwrite");
      if (await tx.store.count() >= 8) { await tx.done; throw new Error("Your library holds 8 wallpapers. Remove one to add another."); }
      const wallpaper = { id: `custom-${crypto.randomUUID()}`, name: file.name.replace(/\.[^.]+$/, ""), image };
      await tx.store.put(wallpaper);
      await tx.done;
      window.dispatchEvent(new Event(WALLPAPER_EVENT));
      return wallpaper;
    } finally { db.close(); }
  } finally { bitmap.close(); }
}
export async function deleteWallpaper(id: string) {
  const db = await database();
  try { await db.delete("images", id); } finally { db.close(); }
  window.dispatchEvent(new Event(WALLPAPER_EVENT));
}
