/** Paint the built-in wallpaper colors into the optional renderer's texture. */
export function paintWallpaperBackdrop(canvas: HTMLCanvasElement, wallpaper: string, dim: number, image?: HTMLImageElement) {
  const width = innerWidth, height = innerHeight;
  const scale = Math.min(1, 1440 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  if (image) {
    const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * cover, h = image.naturalHeight * cover;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  } else {
    const dusk = wallpaper === 'dusk';
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, dusk ? '#473641' : '#172933'); base.addColorStop(1, dusk ? '#1b2535' : '#111821');
    ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
    const glow = (x: number, y: number, color: string, reach: number) => {
      ctx.save(); ctx.scale(width, height);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, reach);
      gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1, 1); ctx.restore();
    };
    glow(dusk ? .15 : .85, dusk ? .85 : .75, dusk ? '#505a7d' : '#665783', .65);
    glow(dusk ? .75 : .2, dusk ? .2 : .15, dusk ? '#b38472' : '#577f8d', .55);
  }
  ctx.fillStyle = `rgb(0 0 0 / ${Math.max(0, Math.min(100, dim)) / 100})`; ctx.fillRect(0, 0, width, height);
}
