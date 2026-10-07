// Logos are scaled down in the browser and kept as a data URL in Settings,
// so they live in localStorage and travel with backups. Shown at most
// 240 × 56 px; stored at four times that so the PDF prints sharply.
export const LOGO_BOX = { width: 240, height: 56 };
const SCALE = 4;
const MAX_BYTES = 1_500_000;

export async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or SVG image.');
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    img.src = url;
    await img.decode();
  } catch {
    throw new Error('That image couldn\u2019t be read.');
  } finally {
    URL.revokeObjectURL(url);
  }
  const w = img.naturalWidth || LOGO_BOX.width;
  const h = img.naturalHeight || LOGO_BOX.height;
  const k = Math.min(1, (LOGO_BOX.width * SCALE) / w, (LOGO_BOX.height * SCALE) / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  // Photos stay JPEG; everything else becomes PNG so transparency survives.
  const jpeg = file.type === 'image/jpeg';
  if (jpeg) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = jpeg ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
  if (data.length > MAX_BYTES) throw new Error('That image is too large. Try a simpler logo.');
  return data;
}

/** Fit an image into the logo box, keeping its proportions. */
export function fitLogo(w: number, h: number) {
  const k = Math.min(LOGO_BOX.width / w, LOGO_BOX.height / h);
  return { width: w * k, height: h * k };
}
