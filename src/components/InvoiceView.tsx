import { CarSimple, FilePdf, PaperPlaneTilt, Plus, Trash, X } from '@phosphor-icons/react';
import type { Invoice, Line, Settings } from '../lib/types';
import { dateLong, money } from '../lib/format';
import { firstName, invoiceTotal, lineAmount, lineFromService, nextLine, rateNote } from '../lib/invoice';
import { Logo, NumberInput } from './fields';

interface Props {
  inv: Invoice;
  st: Settings;
  today: string;
  clients: Record<string, string>;
  warnings: string[];
  busy: boolean;
  onUpdate: (fn: (inv: Invoice) => void) => void;
  onIssued: (iso: string) => void;
  onShare: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onSettings: () => void;
}

export function InvoiceView({ inv, st, today, clients, warnings, busy, onUpdate, onIssued, onShare, onDownload, onDelete, onSettings }: Props) {
  const updLine = (idx: number, patch: Partial<Line>) => onUpdate(i => Object.assign(i.lines[idx], patch));
  const names = st.services.map(s => s.name);
  const first = firstName(inv.client.name);

  return (
    <div className="invoice-view">
      <div className="toolbar">
        <div className="toolbar-title">
          <strong>Invoice {inv.number}</strong>
          <span className={`status${inv.sentAt ? '' : ' is-unsent'}`}>{inv.sentAt ? `Sent ${dateLong(inv.sentAt)}` : 'Not sent yet'}</span>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onDelete} title="Delete invoice" aria-label="Delete invoice" style={{ color: 'var(--color-neutral-700)' }}>
          <Trash size={18} />
        </button>
        <button className="btn btn-secondary" onClick={onDownload} disabled={busy}><FilePdf size={17} className="icon-accent" />Download PDF</button>
        <button className="btn btn-primary btn-send" onClick={onShare} disabled={busy || warnings.length > 0}>
          <PaperPlaneTilt size={17} />{busy ? 'Preparing…' : 'Send'}
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="warnings" role="status">
          <strong>Before you can send this invoice:</strong>
          {warnings.map(w => <div key={w}>{w}</div>)}
        </div>
      )}

      <div className="sheet">
        {st.logo && <Logo className="sheet-logo" src={st.logo} alt={st.businessName || st.yourName || 'Logo'} />}
        <div className="sheet-head">
          <div className="sheet-title">Invoice</div>
          <div className="sheet-meta">
            <span className="muted">Number</span>
            <input className="ed" value={inv.number} onChange={e => { const v = e.target.value; onUpdate(i => { i.number = v; }); }} aria-label="Invoice number" />
            <span className="muted">Issued</span>
            <input className="ed" type="date" value={inv.issued} onChange={e => e.target.value && onIssued(e.target.value)} aria-label="Issue date" />
            <span className="muted">Due</span>
            <span>On receipt</span>
          </div>
        </div>

        <div className="parties">
          <div className="from">
            <div className="kicker">From</div>
            <div className="party-name">{st.yourName}</div>
            <div>{st.businessName}</div>
            <div>ABN {st.abn}</div>
            <div>{[st.phone, st.email].filter(Boolean).join(' · ')}</div>
            <button className="btn btn-ghost change-settings" onClick={onSettings}>Change in Settings</button>
          </div>
          <div className="bill-to">
            <div className="kicker">Bill to</div>
            <input
              className="ed party-name"
              list="client-list"
              value={inv.client.name}
              onChange={e => {
                const v = e.target.value;
                onUpdate(i => {
                  i.client.name = v;
                  // Picking a known client fills in their email if it's empty.
                  if (clients[v.trim()] && !i.client.email) i.client.email = clients[v.trim()];
                });
              }}
              placeholder="Client name"
              aria-label="Client name"
              autoComplete="off"
            />
            <input
              className="ed"
              type="email"
              value={inv.client.email}
              onChange={e => { const v = e.target.value; onUpdate(i => { i.client.email = v; }); }}
              placeholder="Client email (optional)"
              aria-label="Client email"
              autoComplete="off"
            />
            <datalist id="client-list">
              {Object.keys(clients).map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>

        <div className="sessions">
          <div className="sessions-grid sessions-head"><span>Date</span><span>Service</span><span>Duration</span><span className="right">Amount</span></div>
          {inv.lines.map((l, idx) => (
            <div className="session" key={l.id}>
              <div className="sessions-grid">
                <input className="ed" type="date" value={l.date} onChange={e => updLine(idx, { date: e.target.value })} aria-label="Session date" />
                <span className="session-service">
                  <select
                    className="ed"
                    value={l.serviceName}
                    onChange={e => {
                      const sv = st.services.find(s => s.name === e.target.value);
                      // The price is copied in, so later price changes leave this invoice alone.
                      if (sv) updLine(idx, lineFromService(sv));
                    }}
                    aria-label="Service"
                  >
                    {(names.includes(l.serviceName) ? names : [l.serviceName, ...names]).map((o, k) => <option key={k} value={o}>{o}</option>)}
                  </select>
                  <span className="rate-note">{rateNote(l)}</span>
                </span>
                <span className="session-duration">
                  <NumberInput className="ed ed-duration" min={5} step={5} value={l.duration} onCommit={n => updLine(idx, { duration: n })} aria-label="Duration in minutes" />min
                </span>
                <span className="right">{money(lineAmount(l))}</span>
                <span className="session-tools">
                  <button
                    className={`btn btn-ghost ${l.travel ? 'travel-on' : 'travel-off'}`}
                    onClick={() => updLine(idx, { travel: !l.travel, travelFee: Number(st.travelFee) || 0 })}
                    title={l.travel ? 'Remove travel fee' : 'Add travel fee'}
                    aria-label={l.travel ? 'Remove travel fee' : 'Add travel fee'}
                    aria-pressed={l.travel}
                  >
                    <CarSimple size={18} />
                  </button>
                  <button className="btn btn-ghost remove" onClick={() => onUpdate(i => { i.lines.splice(idx, 1); })} title="Remove session" aria-label="Remove session">
                    <X size={16} />
                  </button>
                </span>
              </div>
              {l.travel && (
                <div className="sessions-grid travel-row"><span /><span>Home visit travel</span><span /><span className="right">{money(l.travelFee)}</span></div>
              )}
            </div>
          ))}
          <button className="btn btn-ghost add-session" onClick={() => onUpdate(i => { i.lines.push(nextLine(st, i, today)); })}>
            <Plus size={16} />Add session
          </button>
          <div className="total"><span className="total-label">Total (AUD)</span><span className="total-amount">{money(invoiceTotal(inv))}</span></div>
          <div className="gst">No GST has been charged.</div>
        </div>

        <div className="payment">
          <div>
            <div className="kicker">Bank transfer</div>
            <div>{st.accountName}</div>
            <div>BSB {st.bsb} · Account {st.accountNumber}</div>
            <div>Reference {inv.number}</div>
          </div>
          <div>
            <div className="kicker">PayID</div>
            <div>{st.payId}</div>
            <div>Reference {inv.number}</div>
          </div>
        </div>
        <div className="thanks">{first ? `Thank you, ${first}.` : 'Thank you.'}</div>
      </div>

      <div className="hint">Anything with a dashed underline can be edited. The car icon adds or removes the travel fee for that visit. Changes save automatically.</div>
    </div>
  );
}
