import type { FontBytes } from './pdf';
import regularUrl from '../assets/fonts/SourceSerif4-Regular.ttf?url';
import semiboldUrl from '../assets/fonts/SourceSerif4-Semibold.ttf?url';
import italicUrl from '../assets/fonts/SourceSerif4-Italic.ttf?url';

let fonts: Promise<FontBytes> | null = null;

/** The bundled Source Serif 4 faces, fetched once and kept for every PDF. */
export function loadPdfFonts(): Promise<FontBytes> {
  if (!fonts) {
    const get = (url: string) => fetch(url).then(r => {
      if (!r.ok) throw new Error('The invoice font could not be loaded.');
      return r.arrayBuffer();
    });
    fonts = Promise.all([get(regularUrl), get(semiboldUrl), get(italicUrl)])
      .then(([regular, semibold, italic]) => ({ regular, semibold, italic }))
      .catch(e => {
        fonts = null;
        throw e;
      });
  }
  return fonts;
}
