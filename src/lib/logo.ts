// Logos are trimmed and scaled down in the browser, then kept as a data URL
// in Settings, so they live in localStorage and travel with backups.
//
// Logos come in every shape, from a wide one-line wordmark to a stacked
// badge, so they're sized by area rather than by height: each gets about
// the same visual weight, within a maximum width and height. They're stored
// at four times that size so the PDF prints sharply.
export const LOGO = { area: 14_000, maxWidth: 260, maxHeight: 96 };
const SCALE = 4;
/** Largest working canvas while trimming; bigger sources are scaled down first. */
const WORK_MAX = 2000;
const MAX_BYTES = 1_500_000;

/** Display size in CSS px (also used for the PDF) for an image of w × h. */
export function logoSize(w: number, h: number) {
  const aspect = w / h;
  const height = Math.sqrt(LOGO.area / aspect);
  const width = height * aspect;
  const k = Math.min(1, LOGO.maxWidth / width, LOGO.maxHeight / height);
  return { width: Math.round(width * k), height: Math.round(height * k) };
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

/** Trim the empty margin, then scale to four times the display size (never up). */
function process(img: HTMLImageElement, jpeg: boolean): { data: string; trimmed: boolean } {
  const sw = img.naturalWidth || LOGO.maxWidth;
  const sh = img.naturalHeight || LOGO.maxHeight;
  const k0 = Math.min(1, WORK_MAX / sw, WORK_MAX / sh);
  const work = document.createElement('canvas');
  work.width = Math.max(1, Math.round(sw * k0));
  work.height = Math.max(1, Math.round(sh * k0));
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  wctx.drawImage(img, 0, 0, work.width, work.height);
  const box = contentBounds(wctx.getImageData(0, 0, work.width, work.height).data, work.width, work.height);

  const target = logoSize(box.width, box.height);
  const k = Math.min(1, (target.width * SCALE) / box.width);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(box.width * k));
  out.height = Math.max(1, Math.round(box.height * k));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  // Photos stay JPEG; everything else becomes PNG so transparency survives.
  if (jpeg) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(work, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
  const data = jpeg ? out.toDataURL('image/jpeg', 0.9) : out.toDataURL('image/png');
  // A few pixels of soft edge don't count, so re-trimming an already trimmed logo is a no-op.
  return { data, trimmed: work.width - box.width > 4 || work.height - box.height > 4 };
}

export async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or SVG image.');
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await decode(url);
  } catch {
    throw new Error('That image couldn’t be read.');
  } finally {
    URL.revokeObjectURL(url);
  }
  const { data } = process(img, file.type === 'image/jpeg');
  if (data.length > MAX_BYTES) throw new Error('That image is too large. Try a simpler logo.');
  return data;
}

/** For logos saved before trimming existed: the trimmed version, or null if there was nothing to trim. */
export async function retrimLogo(logo: string): Promise<string | null> {
  try {
    const { data, trimmed } = process(await decode(logo), logo.startsWith('data:image/jpeg'));
    return trimmed ? data : null;
  } catch {
    return null;
  }
}
