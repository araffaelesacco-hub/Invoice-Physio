import { CaretLeft, CaretRight, FloppyDisk, GearSix, PenNib } from '@phosphor-icons/react';
import type { Data } from '../lib/types';
import { dateMasthead, dateShort, money, money0, monthName, monthYear, plural, shiftMonth } from '../lib/format';
import { invoiceTotal, sortDesc } from '../lib/invoice';
import { PlateNumeral } from './fields';

interface Props {
  data: Data;
  today: string;
  month: string;
  currentId: string | null;
  showingInvoice: boolean;
  onMonth: (month: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onClearSamples: () => void;
  onSettings: () => void;
  onBackup: () => void;
}

export function Sidebar({ data, today, month, currentId, showingInvoice, onMonth, onOpen, onNew, onClearSamples, onSettings, onBackup }: Props) {
  const st = data.settings;
  const inMonth = data.invoices.filter(i => i.issued.slice(0, 7) === month).sort(sortDesc);
  const total = inMonth.reduce((a, i) => a + invoiceTotal(i), 0);
  const sessions = inMonth.reduce((a, i) => a + i.lines.length, 0);
  const prev = shiftMonth(month, -1);
  const prevTotal = data.invoices.filter(i => i.issued.slice(0, 7) === prev).reduce((a, i) => a + invoiceTotal(i), 0);
  const summary = inMonth.length
    ? `${plural(inMonth.length, 'invoice')}, ${plural(sessions, 'session')}.`
    : `No invoices in ${monthName(month)}.`;
  const prevLine = prevTotal > 0 ? ` ${monthName(prev)} closed at ${money0(prevTotal)}.` : '';
  // The big figure stays what was invoiced; this says how much of it has come in.
  const received = inMonth.filter(i => i.paidAt).reduce((a, i) => a + invoiceTotal(i), 0);
  const owing = total - received;
  const paidLine = !inMonth.length ? '' : owing > 0.004 ? ` ${money0(received)} received, ${money0(owing)} still to come.` : ' All paid.';

  return (
    <aside className="side">
      <div className="masthead-thick"><div className="masthead-thin" /></div>
      <div className="masthead-rail">
        <span>{st.businessName || st.yourName || 'Invoice book'}</span>
        <span>{dateMasthead(today)}</span>
      </div>
      <div className="masthead-thin" />

      <div className="month-nav">
        <span className="month-label">{month === today.slice(0, 7) ? `${monthName(month)} so far` : monthYear(month)}</span>
        <div className="arrows">
          <button className="btn btn-ghost" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month"><CaretLeft size={18} /></button>
          <button className="btn btn-ghost" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month"><CaretRight size={18} /></button>
        </div>
      </div>
      <PlateNumeral className="month-total">{money0(total)}</PlateNumeral>
      <p className="month-summary">{summary}{paidLine}{prevLine}</p>

      {data.invoices.some(i => i.sample) && (
        <div className="sample-note">
          <span>These are sample invoices. Put your own details in Settings, then clear the samples.</span>
          <button className="btn btn-ghost" onClick={onClearSamples}>Clear sample invoices</button>
        </div>
      )}

      <button className="btn btn-primary new-invoice" onClick={onNew}><PenNib size={18} />New invoice</button>

      <div className="inv-list">
        {inMonth.map(i => (
          <button key={i.id} className={`inv-row${showingInvoice && i.id === currentId ? ' is-current' : ''}`} onClick={() => onOpen(i.id)}>
            <span className="inv-row-text">
              <span className={`inv-row-kicker${i.paidAt ? ' is-paid' : i.sentAt ? '' : ' is-unsent'}`}>
                {i.number} · {i.paidAt ? `Paid ${dateShort(i.paidAt)}` : i.sentAt ? `${dateShort(i.issued)} · Unpaid` : 'Not sent'}
              </span>
              <span className="inv-row-client">{i.client.name.trim() || 'New client'}</span>
            </span>
            <span className="inv-row-amount">{money(invoiceTotal(i))}</span>
          </button>
        ))}
      </div>

      <div className="side-foot">
        <button className="btn btn-ghost" onClick={onSettings}><GearSix size={17} />Settings</button>
        <button className="btn btn-ghost" onClick={onBackup}><FloppyDisk size={17} />Backup</button>
      </div>
    </aside>
  );
}
