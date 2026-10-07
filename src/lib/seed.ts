import type { Data, Invoice, Service } from './types';
import { uid } from './format';

/** First-run sample data. Invoices are flagged `sample` so "Clear sample invoices" removes only these. */
export function seed(): Data {
  const services: Service[] = [
    { id: 's1', name: 'Initial assessment', pricing: 'fixed', price: 140, duration: 60 },
    { id: 's2', name: 'Follow-up', pricing: 'fixed', price: 110, duration: 45 },
    { id: 's3', name: 'Exercise program', pricing: 'hourly', price: 120, duration: 45 },
  ];
  const S = Object.fromEntries(services.map(s => [s.id, s]));
  const L = (date: string, sid: string, dur?: number) => ({
    id: uid(),
    date,
    serviceName: S[sid].name,
    pricing: S[sid].pricing,
    price: S[sid].price,
    duration: dur || S[sid].duration,
    travel: true,
    travelFee: 25,
  });
  const I = (number: string, issued: string, name: string, email: string, lines: Invoice['lines'], sent: boolean): Invoice => ({
    id: uid(),
    number,
    issued,
    client: { name, email },
    lines,
    sentAt: sent ? issued : null,
    sentVia: sent ? 'Shared' : null,
    sample: true,
  });
  return {
    settings: {
      yourName: 'Sam Harper',
      businessName: 'Harper Physiotherapy',
      abn: '51 824 753 556',
      phone: '0400 123 456',
      email: 'sam@harperphysio.com.au',
      accountName: 'Harper Physiotherapy',
      bsb: '062-000',
      accountNumber: '1234 5678',
      payId: 'sam@harperphysio.com.au',
      logo: '',
      travelFee: 25,
      services,
    },
    invoices: [
      I('2026-008', '2026-09-08', 'Helen Carter', 'helen.carter@email.com', [L('2026-09-01', 's1'), L('2026-09-04', 's2'), L('2026-09-08', 's2')], true),
      I('2026-009', '2026-09-18', 'Tom Nguyen', 'tom.nguyen@email.com', [L('2026-09-11', 's1'), L('2026-09-18', 's2')], true),
      I('2026-010', '2026-09-29', 'Priya Shah', 'priya.shah@email.com', [L('2026-09-22', 's1'), L('2026-09-29', 's3', 60)], true),
      I('2026-011', '2026-10-01', "Daniel O'Brien", 'daniel.obrien@email.com', [L('2026-10-01', 's1')], true),
      I('2026-012', '2026-10-02', 'Priya Shah', 'priya.shah@email.com', [L('2026-10-02', 's2')], true),
      I('2026-013', '2026-10-05', 'Tom Nguyen', 'tom.nguyen@email.com', [L('2026-10-02', 's2'), L('2026-10-05', 's2')], true),
      I('2026-014', '2026-10-07', 'Margaret Lee', 'margaret.lee@email.com', [L('2026-09-30', 's1'), L('2026-10-02', 's2'), L('2026-10-06', 's3')], false),
    ],
  };
}
