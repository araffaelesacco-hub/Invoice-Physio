import { describe, expect, it } from 'vitest';
import { clientDirectory, createInvoice, invoiceTotal, lineAmount, message, nextLine, nextNumber, printService, warningsFor } from './invoice';
import { dateMasthead, dateMedium, dateLong, money, money0, parseISO, shiftMonth } from './format';
import { seed } from './seed';
import type { Invoice } from './types';

const inv = (number: string, issued = '2026-10-01'): Invoice => ({
  id: number, number, issued, client: { name: '', email: '' }, lines: [], sentAt: null, sentVia: null,
});

describe('amounts', () => {
  it('charges a fixed price whatever the length', () => {
    expect(lineAmount({ pricing: 'fixed', price: 110, duration: 90 })).toBe(110);
  });
  it('charges hourly services by the minute, rounded to cents', () => {
    expect(lineAmount({ pricing: 'hourly', price: 120, duration: 45 })).toBe(90);
    expect(lineAmount({ pricing: 'hourly', price: 100, duration: 35 })).toBe(58.33);
  });
  it('adds travel only when it is on', () => {
    const d = seed();
    const margaret = d.invoices.find(i => i.number === '2026-014')!;
    // 140 + 110 + 90 (45 min at $120/h) + 3 × $25 travel
    expect(invoiceTotal(margaret)).toBe(415);
    margaret.lines[0].travel = false;
    expect(invoiceTotal(margaret)).toBe(390);
  });
});

describe('numbering', () => {
  it('takes the highest number this year plus one, padded to three digits', () => {
    expect(nextNumber([inv('2026-009'), inv('2026-014'), inv('2025-120')], '2026')).toBe('2026-015');
    expect(nextNumber([inv('2025-120'), inv('custom')], '2026')).toBe('2026-001');
  });
  it('starts a new invoice dated today with one session and travel on', () => {
    const d = seed();
    const n = createInvoice(d, '2026-10-07');
    expect(n.number).toBe('2026-015');
    expect(n.issued).toBe('2026-10-07');
    expect(n.lines).toHaveLength(1);
    expect(n.lines[0]).toMatchObject({ serviceName: 'Initial assessment', price: 140, travel: true, travelFee: 25, date: '2026-10-07' });
  });
  it('copies the previous session when adding one', () => {
    const d = seed();
    const priya = d.invoices.find(i => i.number === '2026-010')!;
    priya.lines[1].travel = false;
    const l = nextLine(d.settings, priya, '2026-10-07');
    expect(l).toMatchObject({ serviceName: 'Exercise program', pricing: 'hourly', duration: 60, travel: false, date: '2026-10-07' });
  });
});

describe('validation', () => {
  it('lists every blocker in order', () => {
    const d = seed();
    Object.assign(d.settings, { yourName: ' ', businessName: '', abn: '' });
    expect(warningsFor(inv('2026-001'), d.settings)).toEqual([
      'Add your name or business name in Settings.',
      'Add your ABN in Settings.',
      'Add the client’s name.',
      'Add at least one session.',
    ]);
  });
  it('passes a complete invoice', () => {
    const d = seed();
    expect(warningsFor(d.invoices[0], d.settings)).toEqual([]);
  });
});

describe('wording', () => {
  it('names the service only', () => {
    const d = seed();
    const [a, b] = d.invoices.find(i => i.number === '2026-010')!.lines;
    expect(printService(a)).toBe('Physiotherapy: initial assessment');
    expect(printService(b)).toBe('Physiotherapy: exercise program ($120/h)');
  });
  it('writes the email', () => {
    const d = seed();
    const m = message(d.invoices.find(i => i.number === '2026-014')!, d.settings);
    expect(m.subject).toBe('Invoice 2026-014 from Harper Physiotherapy');
    expect(m.text).toBe('Hi Margaret,\n\nPlease find attached invoice 2026-014 for $415.00. Payment details are on the invoice.\n\nThank you,\nSam Harper');
  });
  it('remembers past clients and their email', () => {
    const d = seed();
    expect(clientDirectory(d.invoices)['Priya Shah']).toBe('priya.shah@email.com');
  });
});

describe('format', () => {
  it('formats en-AU dates and money', () => {
    expect(dateMedium('2026-09-30')).toBe('30 Sep 2026');
    expect(dateLong('2026-10-07')).toBe('7 October 2026');
    expect(dateMasthead('2026-10-07')).toBe('Wed 7 Oct 2026');
    expect(money(1245)).toBe('$1,245.00');
    expect(money0(6480)).toBe('$6,480');
  });
  it('parses dates as local days', () => {
    const d = parseISO('2026-10-07');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 7]);
  });
  it('steps months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('restoring', () => {
  it('rejects files that are not a book', async () => {
    const { normalizeData } = await import('./invoice');
    expect(normalizeData({ hello: 1 })).toBeNull();
    expect(normalizeData(null)).toBeNull();
  });
  it('fills in missing fields', async () => {
    const { normalizeData } = await import('./invoice');
    const d = normalizeData({ settings: { yourName: 'Sam' }, invoices: [{ number: '2026-001', issued: '2026-10-01', lines: [{ price: '110' }] }] })!;
    expect(d.settings.abn).toBe('');
    expect(d.settings.services).toEqual([]);
    expect(d.invoices[0].client).toEqual({ name: '', email: '' });
    expect(d.invoices[0].lines[0]).toMatchObject({ price: 110, pricing: 'fixed', travel: false });
  });
  it('keeps only image data URLs as the logo', async () => {
    const { normalizeData } = await import('./invoice');
    const withLogo = (logo: unknown) => normalizeData({ settings: { logo }, invoices: [] })!.settings.logo;
    expect(withLogo('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(withLogo('https://example.com/logo.png')).toBe('');
    expect(withLogo(undefined)).toBe('');
  });
});

describe('logo', () => {
  it('gives every shape of logo about the same weight', async () => {
    const { logoSize } = await import('./logo');
    expect(logoSize(240, 140)).toEqual({ width: 155, height: 90 }); // stacked badge
    expect(logoSize(600, 160)).toEqual({ width: 229, height: 61 }); // wide wordmark
    expect(logoSize(500, 500)).toEqual({ width: 96, height: 96 }); // square: capped height
    expect(logoSize(1000, 100)).toEqual({ width: 260, height: 26 }); // very wide: capped width
  });
  it('finds the artwork inside an empty margin', async () => {
    const { contentBounds } = await import('./logo');
    const w = 10, h = 8, px = new Uint8ClampedArray(w * h * 4); // all transparent
    for (let y = 2; y <= 5; y++) for (let x = 3; x <= 7; x++) px[(y * w + x) * 4 + 3] = 255;
    expect(contentBounds(px, w, h)).toEqual({ x: 3, y: 2, width: 5, height: 4 });
    // Opaque white background with one dark pixel
    const solid = new Uint8ClampedArray(w * h * 4).fill(255);
    solid.set([0, 0, 0, 255], (6 * w + 1) * 4);
    expect(contentBounds(solid, w, h)).toEqual({ x: 1, y: 6, width: 1, height: 1 });
  });
});
