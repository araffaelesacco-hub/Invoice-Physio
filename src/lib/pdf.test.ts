import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { buildInvoicePdf, type FontBytes } from './pdf';
import { seed } from './seed';

const font = (f: string) => readFileSync(new URL(`../assets/fonts/${f}`, import.meta.url));
const fonts: FontBytes = {
  regular: font('SourceSerif4-Regular.ttf'),
  semibold: font('SourceSerif4-Semibold.ttf'),
  italic: font('SourceSerif4-Italic.ttf'),
};

describe('invoice PDF', () => {
  it('is a one-page A4 document', async () => {
    const d = seed();
    const bytes = await buildInvoicePdf(d.invoices.find(i => i.number === '2026-014')!, d.settings, fonts);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.5, 0);
    expect(height).toBeCloseTo(842.25, 0);
    expect(doc.getTitle()).toBe('Invoice 2026-014');
  });

  it('runs onto more pages when the sessions do', async () => {
    const d = seed();
    const inv = d.invoices[0];
    inv.lines = Array.from({ length: 40 }, () => ({ ...inv.lines[0] }));
    const bytes = await buildInvoicePdf(inv, d.settings, fonts);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT.replace('.pdf', '-long.pdf'), bytes);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
});

describe('invoice PDF logo', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const hasImage = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1').includes('/Subtype /Image');

  it('leaves the logo out when none is set', async () => {
    const d = seed();
    expect(hasImage(await buildInvoicePdf(d.invoices[0], d.settings, fonts))).toBe(false);
  });

  it('embeds the logo when one is set', async () => {
    const d = seed();
    d.settings.logo = PNG;
    const bytes = await buildInvoicePdf(d.invoices[0], d.settings, fonts);
    expect(hasImage(bytes)).toBe(true);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
