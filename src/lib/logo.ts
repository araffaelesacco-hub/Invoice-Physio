// Logos are trimmed to their artwork and scaled down in the browser, then kept
// as a PNG data URL in Settings, so they live in localStorage and travel with
// backups. On the invoice they're fitted into a box: 220 × 64 px on screen and
// 240 × 72 px in the PDF, never enlarged.
export const LOGO_STORE = { width: 600, height: 300 };
export const LOGO_SCREEN = { width: 220, height: 64 };
export const LOGO_PDF = { width: 240, height: 72 };
/** Largest working canvas while trimming; bigger sources are scaled down first. */
const WORK_MAX = 2000;
const MAX_BYTES = 1_500_000;

/** Fit w × h into a box, keeping its proportions and never enlarging it. */
export function fitLogo(w: number, h: number, box: { width: number; height: number }) {
  const k = Math.min(1, box.width / w, box.height / h);
  const r = (n: number) => Math.round(n * 100) / 100; // no float dust like 219.99999
  return { width: r(w * k), height: r(h * k) };
}

/** Bounds of the artwork in RGBA pixels: whatever isn't transparent, or, for
 *  an image without transparent corners, whatever differs from the corner colour. */
export function contentBounds(px: Uint8ClampedArray, w: number, h: number) {
  const at = (x: number, y: number) => (y * w + x) * 4;
  const corner = at(0, 0);
  const transparent = px[corner + 3] < 16;
  const bg = [px[corner], px[corner + 1], px[corner + 2]];
  const isInk = (i: number) =>
    transparent
      ? px[i + 3] >= 16
      : Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 36;
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isInk(at(x, y))) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return { x: 0, y: 0, width: w, height: h }; // blank: leave it alone
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

async function decode(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Trim the empty margin, then scale to fit 600 × 300 as a PNG (never up). */
function process(img: HTMLImageElement): { data: string; trimmed: boolean } {
  const sw = img.naturalWidth || LOGO_STORE.width;
  const sh = img.naturalHeight || LOGO_STORE.height;
  const k0 = Math.min(1, WORK_MAX / sw, WORK_MAX / sh);
  const work = document.createElement('canvas');
  work.width = Math.max(1, Math.round(sw * k0));
  work.height = Math.max(1, Math.round(sh * k0));
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  wctx.drawImage(img, 0, 0, work.width, work.height);
  const box = contentBounds(wctx.getImageData(0, 0, work.width, work.height).data, work.width, work.height);

  const size = fitLogo(box.width, box.height, LOGO_STORE);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(size.width));
  out.height = Math.max(1, Math.round(size.height));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(work, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
  // A few pixels of soft edge don't count, so re-trimming an already trimmed logo is a no-op.
  return { data: out.toDataURL('image/png'), trimmed: work.width - box.width > 4 || work.height - box.height > 4 };
}

export async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error('Choose a PNG, JPG or SVG image.');
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await decode(url);
  } catch {
    throw new Error('That image couldn’t be opened. Try a PNG or JPG.');
  } finally {
    URL.revokeObjectURL(url);
  }
  const { data } = process(img);
  if (data.length > MAX_BYTES) throw new Error('That image is too large. Try a simpler logo.');
  return data;
}

/** For logos saved before trimming existed: the trimmed version, or null if there was nothing to trim. */
export async function retrimLogo(logo: string): Promise<string | null> {
  try {
    const { data, trimmed } = process(await decode(logo));
    return trimmed ? data : null;
  } catch {
    return null;
  }
}
