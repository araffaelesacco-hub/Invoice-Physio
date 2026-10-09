import { PAYMENT_METHODS, type Data, type Invoice, type Line, type PaymentMethod, type Service, type Settings } from './types';
import { dateLong, dateMedium, money, money0, todayISO, uid } from './format';

/** A fixed service charges its price; an hourly one charges price × minutes / 60, rounded to cents. */
export function lineAmount(l: Pick<Line, 'pricing' | 'price' | 'duration'>): number {
  const price = Number(l.price) || 0;
  if (l.pricing !== 'hourly') return price;
  return Math.round(((price * (Number(l.duration) || 0)) / 60) * 100) / 100;
}

export function travelAmount(l: Line): number {
  return l.travel ? Number(l.travelFee) || 0 : 0;
}

export function invoiceTotal(inv: Invoice): number {
  // Sum in cents so totals never pick up float dust.
  const cents = inv.lines.reduce((a, l) => a + Math.round(lineAmount(l) * 100) + Math.round(travelAmount(l) * 100), 0);
  return cents / 100;
}

/** Newest first: by issue date, then by number. */
export function sortDesc(a: Invoice, b: Invoice): number {
  return b.issued.localeCompare(a.issued) || b.number.localeCompare(a.number);
}

/** {YYYY}-{NNN}: the highest number used this year plus one. */
export function nextNumber(invoices: Invoice[], year: string): string {
  const max = invoices.reduce((m, i) => {
    const mt = /^(\d{4})-(\d+)$/.exec(i.number || '');
    return mt && mt[1] === year ? Math.max(m, Number(mt[2])) : m;
  }, 0);
  return `${year}-${String(max + 1).padStart(3, '0')}`;
}

const FALLBACK_SERVICE: Omit<Service, 'id'> = { name: 'Physiotherapy session', pricing: 'fixed', price: 0, duration: 45 };

export function lineFromService(sv: Omit<Service, 'id'>): Pick<Line, 'serviceName' | 'pricing' | 'price' | 'duration'> {
  return { serviceName: sv.name, pricing: sv.pricing, price: sv.price, duration: sv.duration };
}

/** A new session: the first service, travel on at the current travel fee. */
export function newLine(st: Settings, date: string): Line {
  return {
    id: uid(),
    date,
    ...lineFromService(st.services[0] || FALLBACK_SERVICE),
    travel: true,
    travelFee: Number(st.travelFee) || 0,
  };
}

/** "Add session" copies the previous row's service, duration and travel, dated today. */
export function nextLine(st: Settings, inv: Invoice, today: string): Line {
  const l = newLine(st, today);
  const last = inv.lines[inv.lines.length - 1];
  if (last) Object.assign(l, { serviceName: last.serviceName, pricing: last.pricing, price: last.price, duration: last.duration, travel: last.travel });
  return l;
}

export function createInvoice(data: Data, today: string): Invoice {
  return {
    id: uid(),
    number: nextNumber(data.invoices, today.slice(0, 4)),
    issued: today,
    client: { name: '', email: '' },
    lines: [newLine(data.settings, today)],
    sentAt: null,
    sentVia: null,
    paidAt: null,
    paidVia: null,
    receiptSentAt: null,
  };
}

/** What stops an invoice from being sent, one line each, in this order. */
export function warningsFor(inv: Invoice, st: Settings): string[] {
  const w: string[] = [];
  if (!st.yourName.trim() && !st.businessName.trim()) w.push('Add your name or business name in Settings.');
  if (!st.abn.trim()) w.push('Add your ABN in Settings.');
  if (!inv.client.name.trim()) w.push('Add the client’s name.');
  if (!inv.lines.length) w.push('Add at least one session.');
  return w;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || '';

export function rateNote(l: Line): string {
  return l.pricing === 'hourly' ? `${money0(l.price)}/h` : '';
}

/** The service as the client reads it: name only, never a condition or treatment notes. */
export function printService(l: Line): string {
  const base = `Physiotherapy: ${l.serviceName.toLowerCase()}`;
  return l.pricing === 'hourly' ? `${base} (${rateNote(l)})` : base;
}

export function fileName(inv: Invoice): string {
  return inv.paidAt ? `Invoice ${inv.number} (paid).pdf` : `Invoice ${inv.number}.pdf`;
}

export function message(inv: Invoice, st: Settings): { subject: string; text: string } {
  const from = st.businessName || st.yourName;
  const hi = `Hi ${firstName(inv.client.name) || 'there'},`;
  const sign = `Thank you,\n${st.yourName}`;
  if (inv.paidAt) {
    return {
      subject: `Receipt for invoice ${inv.number} from ${from}`,
      text: `${hi}\n\nThank you for your payment. Please find attached your receipt for invoice ${inv.number} (${money(invoiceTotal(inv))}, paid ${dateLong(inv.paidAt)}).\n\n${sign}`,
    };
  }
  return {
    subject: `Invoice ${inv.number} from ${from}`,
    text: `${hi}\n\nPlease find attached invoice ${inv.number} for ${money(invoiceTotal(inv))}. Payment details are on the invoice.\n\n${sign}`,
  };
}

/** "Paid 12 Oct 2026 by bank transfer" */
export function paidLine(inv: Invoice): string {
  if (!inv.paidAt) return '';
  return `Paid ${dateMedium(inv.paidAt)}${inv.paidVia ? ` by ${inv.paidVia === 'PayID' ? 'PayID' : inv.paidVia.toLowerCase()}` : ''}`;
}

/** Sent or paid invoices are records the client may already hold, so they're locked against casual edits. */
export const isIssued = (inv: Invoice) => !!(inv.sentAt || inv.paidAt);

/** Past clients by name, with their most recent email, for the Bill to datalist. */
export function clientDirectory(invoices: Invoice[]): Record<string, string> {
  const clients: Record<string, string> = {};
  [...invoices].sort((a, b) => -sortDesc(a, b)).forEach(i => {
    const name = i.client.name.trim();
    if (name && (i.client.email || !(name in clients))) clients[name] = i.client.email;
  });
  return clients;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => Number(v) || 0;

/** Checks the shape of saved or restored data and fills any missing fields,
 *  so a hand-edited or older backup can't break the app. Returns null if it isn't a book at all. */
export function normalizeData(x: unknown): Data | null {
  const d = x as Partial<Data> | null;
  if (!d || typeof d !== 'object' || !d.settings || typeof d.settings !== 'object' || !Array.isArray(d.invoices)) return null;
  const s = d.settings as Partial<Settings>;
  const settings: Settings = {
    yourName: str(s.yourName),
    businessName: str(s.businessName),
    abn: str(s.abn),
    phone: str(s.phone),
    email: str(s.email),
    accountName: str(s.accountName),
    bsb: str(s.bsb),
    accountNumber: str(s.accountNumber),
    payId: str(s.payId),
    logo: /^data:image\/(png|jpeg);base64,/.test(str(s.logo)) ? str(s.logo) : '',
    travelFee: num(s.travelFee),
    services: (Array.isArray(s.services) ? s.services : []).map(sv => ({
      id: str(sv?.id) || uid(),
      name: str(sv?.name),
      pricing: sv?.pricing === 'hourly' ? 'hourly' : 'fixed',
      price: num(sv?.price),
      duration: num(sv?.duration),
    })),
  };
  const invoices: Invoice[] = d.invoices.filter(i => i && typeof i === 'object').map(i => ({
    ...i,
    id: str(i.id) || uid(),
    number: str(i.number),
    issued: /^\d{4}-\d{2}-\d{2}$/.test(str(i.issued)) ? i.issued : todayISO(),
    client: { name: str(i.client?.name), email: str(i.client?.email) },
    lines: (Array.isArray(i.lines) ? i.lines : []).map(l => ({
      id: str(l?.id) || uid(),
      date: str(l?.date),
      serviceName: str(l?.serviceName),
      pricing: l?.pricing === 'hourly' ? 'hourly' : 'fixed',
      price: num(l?.price),
      duration: num(l?.duration),
      travel: !!l?.travel,
      travelFee: num(l?.travelFee),
    })),
    sentAt: i.sentAt ? str(i.sentAt) : null,
    sentVia: i.sentVia === 'Shared' || i.sentVia === 'Email' ? i.sentVia : null,
    paidAt: /^\d{4}-\d{2}-\d{2}$/.test(str(i.paidAt)) ? str(i.paidAt) : null,
    paidVia: PAYMENT_METHODS.includes(i.paidVia as PaymentMethod) ? (i.paidVia as PaymentMethod) : null,
    receiptSentAt: i.receiptSentAt ? str(i.receiptSentAt) : null,
  }));
  return { settings, invoices };
}
