export type Pricing = 'fixed' | 'hourly';

export interface Service {
  id: string;
  name: string;
  pricing: Pricing;
  price: number;
  /** Usual length in minutes. */
  duration: number;
}

export interface Settings {
  yourName: string;
  businessName: string;
  abn: string;
  phone: string;
  email: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
  payId: string;
  travelFee: number;
  services: Service[];
}

/** One session on an invoice. The price is copied in when the service is
 *  chosen, so later price changes in Settings don't alter old invoices. */
export interface Line {
  id: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  serviceName: string;
  pricing: Pricing;
  price: number;
  duration: number;
  travel: boolean;
  travelFee: number;
}

export interface Invoice {
  id: string;
  /** e.g. 2026-015 */
  number: string;
  /** Local date, YYYY-MM-DD. */
  issued: string;
  client: { name: string; email: string };
  lines: Line[];
  sentAt: string | null;
  sentVia: 'Shared' | 'Email' | null;
  sample?: true;
}

export interface Data {
  settings: Settings;
  invoices: Invoice[];
}
