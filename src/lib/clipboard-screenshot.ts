const imageTypes = ["image/png", "image/jpeg", "image/webp"];

export function validateScreenshotFile(file: File) {
  if (!imageTypes.includes(file.type))
    throw new Error("Choose a PNG, JPEG or WebP screenshot.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose a screenshot smaller than 5 MB.");
  return file;
}

export async function readClipboardScreenshot(clipboard: Pick<Clipboard, "read"> | undefined) {
  if (!clipboard?.read)
    throw new Error("Click inside this panel and press Ctrl+V (or Command+V) to paste your screenshot.");
  let items: ClipboardItem[];
  try {
    items = await clipboard.read();
  } catch {
    throw new Error("Clipboard access is unavailable. Click inside this panel and press Ctrl+V (or Command+V), or choose an image file.");
  }
  for (const item of items) {
    const type = item.types.find((value) => imageTypes.includes(value));
    if (!type) continue;
    const blob = await item.getType(type);
    return validateScreenshotFile(new File([blob], `chart-${Date.now()}.${type.split("/")[1]}`, { type }));
  }
  throw new Error("No screenshot found. Take a screenshot that copies to your clipboard, then paste it here.");
}
