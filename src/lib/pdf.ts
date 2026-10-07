// Vector PDF of an invoice: the A4 sheet from the design, laid out in CSS
// pixels at 96dpi (794 × 1123) and drawn at 0.75pt per px, with Source
// Serif 4 embedded so the text stays selectable.

import { PDFDocument, PDFFont, PDFPage, rgb, setCharacterSpacing } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Invoice, Settings } from './types';
import { dateLong, dateMedium, money } from './format';
import { firstName, invoiceTotal, lineAmount, printService } from './invoice';

export interface FontBytes {
  regular: ArrayBuffer | Uint8Array;
  semibold: ArrayBuffer | Uint8Array;
  italic: ArrayBuffer | Uint8Array;
}

const PT = 0.75;
const W = 794;
const H = 1123;
const PAD_X = 68;
const PAD_T = 68;
const PAD_B = 56;
const LEFT = PAD_X;
const RIGHT = W - PAD_X;
const CONTENT = RIGHT - LEFT;
const LH = 1.55;

// Broadsheet tokens used on the sheet.
const C = {
  text: '#201e1d',
  muted: '#605d5d', // --color-neutral-700
  rule: '#d7d3d3', // --color-neutral-300
  accent: '#006786', // --color-accent-700
};

// Session table: 110px | 1fr | 80px | 96px, 14px gaps.
const COL_GAP = 14;
const COL_DATE = LEFT;
const COL_SERVICE = COL_DATE + 110 + COL_GAP;
const SERVICE_W = CONTENT - 110 - 80 - 96 - 3 * COL_GAP;
const COL_DURATION = COL_SERVICE + SERVICE_W + COL_GAP;

function color(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

interface TextStyle {
  font: PDFFont;
  size: number;
  color?: string;
  /** Line height in px; defaults to size × 1.55. */
  lh?: number;
  /** Letter spacing in px. */
  spacing?: number;
  upper?: boolean;
}

class Sheet {
  pages: PDFPage[] = [];
  page!: PDFPage;
  /** Cursor, in px from the top of the current page. */
  y = PAD_T;

  constructor(private doc: PDFDocument) {
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([W * PT, H * PT]);
    this.pages.push(this.page);
    this.y = PAD_T;
  }

  lh(s: TextStyle) {
    return s.lh ?? s.size * LH;
  }

  width(text: string, s: TextStyle) {
    const t = s.upper ? text.toUpperCase() : text;
    return s.font.widthOfTextAtSize(t, s.size) + (s.spacing || 0) * t.length;
  }

  /** Greedy word wrap; a word wider than the column breaks anywhere (overflow-wrap:anywhere). */
  wrap(text: string, s: TextStyle, max: number): string[] {
    if (!text) return [];
    const out: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (this.width(next, s) <= max) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      line = '';
      let rest = word;
      while (this.width(rest, s) > max && rest.length > 1) {
        let i = rest.length - 1;
        while (i > 1 && this.width(rest.slice(0, i), s) > max) i--;
        out.push(rest.slice(0, i));
        rest = rest.slice(i);
      }
      line = rest;
    }
    if (line) out.push(line);
    return out;
  }

  /** Draw one line whose line box starts at `top` px. CSS centres the glyphs' ascent+descent in the line box. */
  text(text: string, x: number, top: number, s: TextStyle, align: 'left' | 'right' = 'left') {
    if (!text) return;
    const t = s.upper ? text.toUpperCase() : text;
    const asc = s.font.heightAtSize(s.size, { descender: false });
    const full = s.font.heightAtSize(s.size);
    const baseline = top + (this.lh(s) - full) / 2 + asc;
    const w = this.width(t, { ...s, upper: false });
    // CSS letter-spacing trails every glyph, so a right-aligned run ends one spacing short of the edge.
    const left = align === 'right' ? x - w : x;
    if (s.spacing) this.page.pushOperators(setCharacterSpacing(s.spacing * PT));
    this.page.drawText(t, { x: left * PT, y: (H - baseline) * PT, size: s.size * PT, font: s.font, color: color(s.color || C.text) });
    if (s.spacing) this.page.pushOperators(setCharacterSpacing(0));
  }

  /** Wrapped paragraph; returns its height in px. */
  para(text: string, x: number, top: number, s: TextStyle, max: number, align: 'left' | 'right' = 'left') {
    const lines = this.wrap(text, s, max);
    lines.forEach((l, i) => this.text(l, align === 'right' ? x + max : x, top + i * this.lh(s), s, align));
    return lines.length * this.lh(s);
  }

  rule(top: number, x = LEFT, w = CONTENT) {
    this.page.drawRectangle({ x: x * PT, y: (H - top - 1) * PT, width: w * PT, height: 1 * PT, color: color(C.rule) });
  }
}

export async function buildInvoicePdf(inv: Invoice, st: Settings, fonts: FontBytes): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, semibold, italic] = await Promise.all([
    doc.embedFont(fonts.regular, { subset: true }),
    doc.embedFont(fonts.semibold, { subset: true }),
    doc.embedFont(fonts.italic, { subset: true }),
  ]);
  doc.setTitle(`Invoice ${inv.number}`);
  doc.setAuthor(st.businessName || st.yourName);
  doc.setSubject(`Invoice ${inv.number}`);
  doc.setCreator('Invoice Book');
  doc.setProducer('Invoice Book');

  const body: TextStyle = { font: regular, size: 14 };
  const muted: TextStyle = { ...body, color: C.muted };
  const kicker: TextStyle = { font: regular, size: 11, spacing: 0.88, upper: true, color: C.muted };
  const name: TextStyle = { font: semibold, size: 16 };

  const s = new Sheet(doc);

  // Header: "Invoice" left, Number / Issued / Due right.
  s.text('Invoice', LEFT, s.y, { font: semibold, size: 52, lh: 52, spacing: -1.04 });
  const meta: [string, string][] = [
    ['Number', inv.number],
    ['Issued', dateLong(inv.issued)],
    ['Due', 'On receipt'],
  ];
  const metaStyle: TextStyle = { ...body, lh: 21 };
  const labelW = Math.max(...meta.map(([l]) => s.width(l, metaStyle)));
  const valueW = Math.max(...meta.map(([, v]) => s.width(v, metaStyle)));
  const valueX = RIGHT - valueW;
  const labelX = valueX - 18 - labelW;
  meta.forEach(([l, v], i) => {
    const top = s.y + i * (21 + 3);
    s.text(l, labelX, top, { ...metaStyle, color: C.muted });
    s.text(v, valueX, top, metaStyle);
  });
  s.y += Math.max(52, meta.length * 21 + (meta.length - 1) * 3) + 52;

  // From / Bill to.
  const colW = (CONTENT - 32) / 2;
  const block = (x: number, title: string, head: string, rest: string[]) => {
    let y = s.y;
    s.text(title, x, y, kicker);
    y += s.lh(kicker) + 4;
    y += s.para(head, x, y, name, colW);
    for (const r of rest) y += s.para(r, x, y, body, colW);
    return y - s.y;
  };
  const contact = [st.phone, st.email].filter(Boolean).join(' · ');
  const fromH = block(LEFT, 'From', st.yourName, [st.businessName, `ABN ${st.abn}`, contact]);
  const toH = block(LEFT + colW + 32, 'Bill to', inv.client.name, [inv.client.email]);
  s.y += Math.max(fromH, toH) + 52;

  // Sessions.
  const tableHead = () => {
    s.text('Date', COL_DATE, s.y, kicker);
    s.text('Service', COL_SERVICE, s.y, kicker);
    s.text('Duration', COL_DURATION, s.y, kicker);
    s.text('Amount', RIGHT, s.y, kicker, 'right');
    s.y += s.lh(kicker) + 9;
    s.rule(s.y);
    s.y += 1;
  };
  const bottom = H - PAD_B;
  tableHead();
  for (const l of inv.lines) {
    const service = s.wrap(printService(l), body, SERVICE_W);
    const mainH = Math.max(1, service.length) * s.lh(body);
    const rowH = 9 + mainH + (l.travel ? 5 + s.lh(body) : 0) + 9;
    if (s.y + rowH > bottom) {
      s.addPage();
      tableHead();
    }
    let y = s.y + 9;
    s.text(dateMedium(l.date), COL_DATE, y, body);
    service.forEach((t, i) => s.text(t, COL_SERVICE, y + i * s.lh(body), body));
    s.text(`${l.duration} min`, COL_DURATION, y, body);
    s.text(money(lineAmount(l)), RIGHT, y, body, 'right');
    y += mainH;
    if (l.travel) {
      y += 5;
      s.text('Home visit travel', COL_SERVICE, y, muted);
      s.text(money(l.travelFee), RIGHT, y, muted, 'right');
    }
    s.y += rowH;
  }

  // Total, then the GST line.
  const totalBig: TextStyle = { font: semibold, size: 30 };
  const totalLabel: TextStyle = { font: regular, size: 15 };
  const gst: TextStyle = { font: regular, size: 12, color: C.muted };
  const totalH = 14 + 1 + 12 + s.lh(totalBig) + 4 + s.lh(gst);
  if (s.y + totalH > bottom) s.addPage();
  s.y += 14;
  s.rule(s.y);
  s.y += 1 + 12;
  const totalText = money(invoiceTotal(inv));
  const totalW = s.width(totalText, totalBig);
  // Baseline-aligned: both runs sit on the big figure's baseline.
  const bigAsc = semibold.heightAtSize(totalBig.size, { descender: false });
  const bigFull = semibold.heightAtSize(totalBig.size);
  const baseline = s.y + (s.lh(totalBig) - bigFull) / 2 + bigAsc;
  s.text(totalText, RIGHT, s.y, totalBig, 'right');
  const labAsc = regular.heightAtSize(totalLabel.size, { descender: false });
  const labFull = regular.heightAtSize(totalLabel.size);
  const labTop = baseline - labAsc - (s.lh(totalLabel) - labFull) / 2;
  s.text('Total (AUD)', RIGHT - totalW - 28, labTop, totalLabel, 'right');
  s.y += s.lh(totalBig) + 4;
  s.text('No GST has been charged.', RIGHT, s.y, gst, 'right');
  s.y += s.lh(gst);

  // Payment details and the thank-you line, pushed to the foot of the last page.
  const pay: [string, string[]][] = [
    ['Bank transfer', [st.accountName, `BSB ${st.bsb} · Account ${st.accountNumber}`, `Reference ${inv.number}`]],
    ['PayID', [st.payId, `Reference ${inv.number}`]],
  ];
  const payKicker: TextStyle = { ...kicker, color: C.accent };
  const payH = Math.max(
    ...pay.map(([, rows]) => s.lh(payKicker) + 4 + rows.reduce((a, r) => a + s.wrap(r, body, colW).length * s.lh(body), 0)),
  );
  const first = firstName(inv.client.name);
  const thanks = first ? `Thank you, ${first}.` : 'Thank you.';
  const thanksStyle: TextStyle = { font: italic, size: 14, color: C.muted };
  const footH = payH + 28 + s.lh(thanksStyle);
  if (s.y + 48 + footH > bottom) s.addPage();
  let top = bottom - footH;
  pay.forEach(([title, rows], i) => {
    const x = LEFT + i * (colW + 32);
    let y = top;
    s.text(title, x, y, payKicker);
    y += s.lh(payKicker) + 4;
    for (const r of rows) y += s.para(r, x, y, body, colW);
  });
  top += payH + 28;
  s.text(thanks, LEFT, top, thanksStyle);

  return doc.save();
}
