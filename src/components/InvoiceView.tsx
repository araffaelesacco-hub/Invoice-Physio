import { useState } from 'react';
import { CarSimple, CheckCircle, FilePdf, LockSimple, PaperPlaneTilt, Plus, Trash, X } from '@phosphor-icons/react';
import { PAYMENT_METHODS, type Invoice, type Line, type PaymentMethod, type Settings } from '../lib/types';
import { dateLong, money } from '../lib/format';
import { firstName, invoiceTotal, lineAmount, lineFromService, nextLine, paidLine, rateNote } from '../lib/invoice';
import { Logo, NumberInput } from './fields';

interface Props {
  inv: Invoice;
  st: Settings;
  today: string;
  clients: Record<string, string>;
  warnings: string[];
  busy: boolean;
  /** Sent or paid, and not unlocked for editing. */
  locked: boolean;
  onUnlock: () => void;
  onMarkPaid: (date: string, via: PaymentMethod) => void;
  onMarkUnpaid: () => void;
  onUpdate: (fn: (inv: Invoice) => void) => void;
  onIssued: (iso: string) => void;
  onShare: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onSettings: () => void;
}

export function InvoiceView(props: Props) {
  const { inv, st, today, clients, warnings, busy, locked, onUnlock, onMarkPaid, onMarkUnpaid, onUpdate, onIssued, onShare, onDownload, onDelete, onSettings } = props;
  const [paying, setPaying] = useState<{ date: string; via: PaymentMethod } | null>(null);
  const paid = !!inv.paidAt;
  const updLine = (idx: number, patch: Partial<Line>) => onUpdate(i => Object.assign(i.lines[idx], patch));
  const names = st.services.map(s => s.name);
  const first = firstName(inv.client.name);

  return (
    <div className="invoice-view">
      <div className="toolbar">
        <div className="toolbar-title">
          <strong>Invoice {inv.number}</strong>
          <span className={`status${paid ? ' is-paid' : inv.sentAt ? '' : ' is-unsent'}`}>{statusText(inv)}</span>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onDelete} title="Delete invoice" aria-label="Delete invoice" style={{ color: 'var(--color-neutral-700)' }}>
          <Trash size={18} />
        </button>
        {paid ? (
          <button className="btn btn-ghost" onClick={onMarkUnpaid}>Mark as unpaid</button>
        ) : (
          <button className="btn btn-secondary" onClick={() => setPaying(p => (p ? null : { date: today, via: 'Bank transfer' }))} aria-expanded={!!paying}>
            <CheckCircle size={17} className="icon-accent" />Mark as paid
          </button>
        )}
        <button className="btn btn-secondary" onClick={onDownload} disabled={busy}><FilePdf size={17} className="icon-accent" />Download PDF</button>
        <button className="btn btn-primary btn-send" onClick={onShare} disabled={busy || warnings.length > 0}>
          <PaperPlaneTilt size={17} />{busy ? 'Preparing\u2026' : paid ? 'Send receipt' : 'Send'}
        </button>
      </div>

      {paying && !paid && (
        <form
          className="pay-panel"
          onSubmit={e => {
            e.preventDefault();
            onMarkPaid(paying.date || today, paying.via);
            setPaying(null);
          }}
        >
          <strong>Payment received</strong>
          <label>
            <span className="muted">On</span>
            <input className="ed" type="date" value={paying.date} max={today} onChange={e => setPaying({ ...paying, date: e.target.value })} required aria-label="Date paid" />
          </label>
          <label>
            <span className="muted">By</span>
            <select className="ed" value={paying.via} aria-label="Paid by" onChange={e => setPaying({ ...paying, via: e.target.value as PaymentMethod })}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <span className="pay-panel-actions">
            <button type="submit" className="btn btn-primary">Mark as paid</button>
            <button type="button" className="btn btn-ghost" onClick={() => setPaying(null)}>Cancel</button>
          </span>
        </form>
      )}

      {locked && (
        <div className="locked-note">
          <LockSimple size={17} />
          <span>{paid ? 'This invoice has been paid' : 'This invoice has been sent'}, so it's locked to keep it the same as the copy your client has.</span>
          <button className="btn btn-ghost" onClick={onUnlock}>Edit anyway</button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="warnings" role="status">
          <strong>Before you can send this {paid ? 'receipt' : 'invoice'}:</strong>
          {warnings.map(w => <div key={w}>{w}</div>)}
        </div>
      )}

      <div className="sheet">
        {st.logo && <Logo className="sheet-logo" src={st.logo} alt={st.businessName || st.yourName || 'Logo'} />}
        <div className="sheet-head">
          <div className="sheet-title">Invoice{paid && <span className="paid-label">Paid</span>}</div>
          <div className="sheet-meta">
            <span className="muted">Number</span>
            <input className="ed" value={inv.number} readOnly={locked} onChange={e => { const v = e.target.value; onUpdate(i => { i.number = v; }); }} aria-label="Invoice number" />
            <span className="muted">Issued</span>
            <input className="ed" type="date" value={inv.issued} readOnly={locked} onChange={e => e.target.value && onIssued(e.target.value)} aria-label="Issue date" />
            <span className="muted">{paid ? 'Paid' : 'Due'}</span>
            <span>{paid ? dateLong(inv.paidAt!) : 'On receipt'}</span>
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
              list={locked ? undefined : 'client-list'}
              value={inv.client.name}
              readOnly={locked}
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
              readOnly={locked}
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
                <input className="ed cell-date" type="date" value={l.date} readOnly={locked} onChange={e => updLine(idx, { date: e.target.value })} aria-label="Session date" />
                <span className="session-service">
                  <select
                    className="ed"
                    value={l.serviceName}
                    disabled={locked}
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
                  <NumberInput className="ed ed-duration" min={5} step={5} readOnly={locked} value={l.duration} onCommit={n => updLine(idx, { duration: n })} aria-label="Duration in minutes" />min
                </span>
                <span className="right cell-amount">{money(lineAmount(l))}</span>
                <span className="session-tools" hidden={locked}>
                  <button
                    className={`btn btn-ghost ${l.travel ? 'travel-on' : 'travel-off'}`}
                    onClick={() => updLine(idx, { travel: !l.travel, travelFee: Number(st.travelFee) || 0 })}
                    title={l.travel ? 'Remove home visit travel' : `Add home visit travel (${money(Number(st.travelFee) || 0)})`}
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
              {l.travel ? (
                <div className="sessions-grid travel-row"><span className="cell-gap" /><span>Home visit travel</span><span className="cell-gap" /><span className="right">{money(l.travelFee)}</span></div>
              ) : (
                // Suggested, never added on its own: one click adds it to this visit.
                !locked && (
                  <div className="sessions-grid travel-suggest">
                    <span className="cell-gap" />
                    <button className="btn btn-ghost" onClick={() => updLine(idx, { travel: true, travelFee: Number(st.travelFee) || 0 })}>
                      <Plus size={13} />Add home visit travel ({money(Number(st.travelFee) || 0)})
                    </button>
                  </div>
                )
              )}
            </div>
          ))}
          <button className="btn btn-ghost add-session" hidden={locked} onClick={() => onUpdate(i => { i.lines.push(nextLine(st, i, today)); })}>
            <Plus size={16} />Add session
          </button>
          <div className="total"><span className="total-label">Total (AUD)</span><span className="total-amount">{money(invoiceTotal(inv))}</span></div>
          <div className="gst">No GST has been charged.</div>
          {paid && (
            <div className="settled">
              <span className="muted">{paidLine(inv)}</span><span>{money(invoiceTotal(inv))}</span>
              <span className="muted">Balance due</span><span>{money(0)}</span>
            </div>
          )}
        </div>

        <div className="payment">
          {paid ? (
            <div>
              <div className="kicker">Payment received</div>
              <div>{[dateLong(inv.paidAt!), inv.paidVia].filter(Boolean).join(' · ')}</div>
              <div>Reference {inv.number}</div>
            </div>
          ) : (<>
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
          </>)}
        </div>
        <div className="thanks">{first ? `Thank you, ${first}.` : 'Thank you.'}</div>
      </div>

      <div className="hint" hidden={locked}>Anything with a dashed underline can be edited. Home visit travel is only added to the sessions you choose; the car icon removes it again. Changes save automatically.</div>
    </div>
  );
}

function statusText(inv: Invoice): string {
  const parts: string[] = [];
  if (inv.sentAt) parts.push(`Sent ${dateLong(inv.sentAt)}`);
  if (inv.paidAt) {
    parts.push(`Paid ${dateLong(inv.paidAt)}`);
    if (inv.receiptSentAt) parts.push('Receipt sent');
  } else parts.push(inv.sentAt ? 'Awaiting payment' : 'Not sent yet');
  return parts.join(' \u00b7 ');
}
