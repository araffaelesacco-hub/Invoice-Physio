import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconContext } from '@phosphor-icons/react';
import type { Data, Invoice, Settings } from './lib/types';
import { todayISO } from './lib/format';
import { clientDirectory, createInvoice, fileName, message, normalizeData, sortDesc, warningsFor } from './lib/invoice';
import { downloadBlob, load, save } from './lib/storage';
import { Sidebar } from './components/Sidebar';
import { InvoiceView } from './components/InvoiceView';
import { SettingsView } from './components/SettingsView';

type View = 'invoice' | 'settings' | 'empty';

const latestId = (data: Data) => [...data.invoices].sort(sortDesc)[0]?.id ?? null;
const pdfKey = (inv: Invoice | undefined, st: Settings) => (inv ? JSON.stringify([inv, st]) : null);

export default function App() {
  const [data, setDataState] = useState<Data>(load);
  const [currentId, setCurrentId] = useState<string | null>(() => latestId(data));
  const [view, setView] = useState<View>(() => (currentId ? 'invoice' : 'empty'));
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<number>();
  const pdfTimer = useRef<number>();
  const pdfCache = useRef<{ key: string; blob: Blob } | null>(null);
  const saveFailed = useRef(false);

  const today = todayISO();
  const st = data.settings;
  const cur = data.invoices.find(i => i.id === currentId);

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 7000);
  }, []);

  // Every change is saved straight away.
  useEffect(() => {
    const ok = save(data);
    if (!ok && !saveFailed.current) showToast('This browser isn’t letting the invoice book save. Download a backup so nothing is lost.');
    saveFailed.current = !ok;
  }, [data, showToast]);

  const setData = useCallback((fn: (d: Data) => void) => {
    setDataState(prev => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const updInv = useCallback(
    (fn: (inv: Invoice) => void) =>
      setData(d => {
        const inv = d.invoices.find(i => i.id === currentId);
        if (inv) fn(inv);
      }),
    [currentId, setData],
  );

  // PDF: build once per version of the invoice and keep it. Safari only lets
  // navigator.share run straight after a click, so the PDF is made in the
  // background shortly after each edit and is ready when Send is pressed.
  const getPdf = useCallback(async (inv: Invoice, settings: Settings) => {
    const key = pdfKey(inv, settings)!;
    if (pdfCache.current?.key === key) return pdfCache.current.blob;
    // pdf-lib and the font tools are large, so they load on first use.
    const [{ buildInvoicePdf }, { loadPdfFonts }] = await Promise.all([import('./lib/pdf'), import('./lib/pdfFonts')]);
    const bytes = await buildInvoicePdf(inv, settings, await loadPdfFonts());
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    pdfCache.current = { key, blob };
    return blob;
  }, []);

  useEffect(() => {
    window.clearTimeout(pdfTimer.current);
    const key = pdfKey(cur, st);
    if (!cur || !key || pdfCache.current?.key === key) return;
    pdfTimer.current = window.setTimeout(() => getPdf(cur, st).catch(() => {}), 1200);
  }, [cur, st, getPdf]);

  useEffect(() => () => {
    window.clearTimeout(pdfTimer.current);
    window.clearTimeout(toastTimer.current);
  }, []);

  const warnings = useMemo(() => (cur ? warningsFor(cur, st) : []), [cur, st]);
  const clients = useMemo(() => clientDirectory(data.invoices), [data.invoices]);

  const openInvoice = (id: string) => {
    setCurrentId(id);
    setView('invoice');
  };

  const newInvoice = () => {
    const inv = createInvoice(data, today);
    setData(d => { d.invoices.push(inv); });
    setCurrentId(inv.id);
    setView('invoice');
    setMonth(today.slice(0, 7));
  };

  const markSent = (via: 'Shared' | 'Email') => updInv(inv => { inv.sentAt = todayISO(); inv.sentVia = via; });

  const emailFallback = (inv: Invoice, blob: Blob) => {
    const m = message(inv, st);
    downloadBlob(blob, fileName(inv));
    window.open(`mailto:${encodeURIComponent(inv.client.email || '')}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}`, '_blank');
    markSent('Email');
    showToast('This browser can’t attach files when sharing. The PDF has been downloaded: attach it to the email that just opened. Safari on Mac attaches it for you.');
  };

  const share = async () => {
    if (!cur || warnings.length) return;
    const inv = cur;
    const ready = pdfCache.current?.key === pdfKey(inv, st);
    let blob: Blob;
    try {
      if (ready) blob = pdfCache.current!.blob;
      else {
        setBusy(true);
        blob = await getPdf(inv, st);
      }
    } catch (e) {
      showToast(`Couldn’t create the PDF. ${(e as Error).message || ''}`);
      return;
    } finally {
      setBusy(false);
    }
    const file = new File([blob], fileName(inv), { type: 'application/pdf' });
    const m = message(inv, st);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: m.subject, text: m.text });
        markSent('Shared');
      } catch (e) {
        const name = (e as Error).name;
        if (name === 'AbortError') return;
        // The PDF took long enough that Safari no longer counts this as a click.
        if (name === 'NotAllowedError' && !ready) {
          showToast('The PDF is ready. Click Send again to choose Mail, Messages or WhatsApp.');
          return;
        }
        emailFallback(inv, blob);
      }
    } else emailFallback(inv, blob);
  };

  const download = async () => {
    if (!cur) return;
    try {
      setBusy(true);
      downloadBlob(await getPdf(cur, st), fileName(cur));
    } catch (e) {
      showToast(`Couldn’t create the PDF. ${(e as Error).message || ''}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteInvoice = () => {
    if (!cur) return;
    if (!window.confirm(`Delete invoice ${cur.number}? This can't be undone.`)) return;
    const rest = data.invoices.filter(i => i.id !== cur.id).sort(sortDesc);
    const next = rest.find(i => i.issued.slice(0, 7) === month) || rest[0];
    setData(d => { d.invoices = d.invoices.filter(i => i.id !== cur.id); });
    setCurrentId(next ? next.id : null);
    setView(next ? 'invoice' : 'empty');
  };

  const clearSamples = () => {
    const keep = data.invoices.find(i => i.id === currentId && !i.sample);
    setData(d => { d.invoices = d.invoices.filter(i => !i.sample); });
    setCurrentId(keep ? keep.id : null);
    if (view !== 'settings') setView(keep ? 'invoice' : 'empty');
  };

  const backup = () => {
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `invoice-book-backup-${todayISO()}.json`);
  };

  const restore = async (f: File) => {
    let restored: Data | null = null;
    try {
      restored = normalizeData(JSON.parse(await f.text()));
    } catch {
      // Not JSON.
    }
    if (!restored) {
      showToast('That file isn’t an invoice book backup.');
      return;
    }
    if (!window.confirm(`Replace everything with this backup (${restored.invoices.length} invoices)?`)) return;
    setDataState(restored);
    setCurrentId(latestId(restored));
    setView('settings');
    showToast('Backup restored.');
  };

  const showInvoice = view === 'invoice' && !!cur;

  return (
    <IconContext.Provider value={{ weight: 'duotone' }}>
      <div className="app">
        <Sidebar
          data={data}
          today={today}
          month={month}
          currentId={currentId}
          showingInvoice={showInvoice}
          onMonth={setMonth}
          onOpen={openInvoice}
          onNew={newInvoice}
          onClearSamples={clearSamples}
          onSettings={() => setView('settings')}
          onBackup={backup}
        />

        <main className="main">
          {showInvoice && cur && (
            <InvoiceView
              inv={cur}
              st={st}
              today={today}
              clients={clients}
              warnings={warnings}
              busy={busy}
              onUpdate={updInv}
              onIssued={iso => {
                updInv(inv => { inv.issued = iso; });
                setMonth(iso.slice(0, 7));
              }}
              onShare={share}
              onDownload={download}
              onDelete={deleteInvoice}
              onSettings={() => setView('settings')}
            />
          )}

          {view === 'settings' && (
            <SettingsView
              st={st}
              onUpdate={fn => setData(d => fn(d.settings))}
              onDone={() => setView(cur ? 'invoice' : 'empty')}
              onBackup={backup}
              onRestore={restore}
            />
          )}

          {!showInvoice && view !== 'settings' && (
            <div className="empty">
              <h2>No invoice open</h2>
              <p>Pick one from the list, or start a new one.</p>
              <button className="btn btn-primary" onClick={newInvoice}>New invoice</button>
            </div>
          )}
        </main>

        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </IconContext.Provider>
  );
}
