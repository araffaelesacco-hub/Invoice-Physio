import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '../lib/types';
import { money } from '../lib/format';
import { invoiceTotal, isIssued } from '../lib/invoice';

interface Props {
  inv: Invoice;
  onConfirm: () => void;
  onCancel: () => void;
}

/** "Are you sure?" before deleting. A sent or paid invoice is a record to keep,
 *  so deleting one also takes typing its number. Sample invoices never need that. */
export function DeleteDialog({ inv, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const strict = isIssued(inv) && !inv.sample;
  const ok = !strict || typed.trim() === inv.number;

  // A modal <dialog> keeps focus inside, makes the page behind inert and closes on Esc.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="delete-title"
      onCancel={e => { e.preventDefault(); onCancel(); }}
      onClick={e => { if (e.target === ref.current) onCancel(); }}
    >
      <form
        className="dialog"
        onSubmit={e => {
          e.preventDefault();
          if (ok) onConfirm();
        }}
      >
        <div className="dialog-title" id="delete-title">Delete invoice {inv.number}?</div>
        <div className="dialog-body">
          <p className="delete-what">{inv.client.name.trim() || 'New client'} · {money(invoiceTotal(inv))}</p>
          {strict ? (
            <>
              <p>
                This invoice has been {inv.paidAt ? 'paid' : 'sent'}. The ATO expects you to keep invoices for five years, so it's usually best to keep it.
              </p>
              <label className="field delete-confirm">
                <span>To delete it anyway, type {inv.number}</span>
                <input className="input" value={typed} onChange={e => setTyped(e.target.value)} autoFocus autoComplete="off" spellCheck={false} />
              </label>
            </>
          ) : (
            <p>This can't be undone.</p>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} autoFocus={!strict}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={!ok}>Delete</button>
        </div>
      </form>
    </dialog>
  );
}
