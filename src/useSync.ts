import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Data } from './lib/types';
import { canonical, mergeData, toPayload } from './lib/syncCore';
import { connect as connectRepo, loadConfig, saveConfig, syncOnce, type SyncConfig } from './lib/sync';
import { SyncError } from './lib/github';
import { WrongKeyError } from './lib/crypto';

export type SyncStatus =
  | { state: 'off' }
  | { state: 'syncing'; at?: number }
  | { state: 'ok'; at: number }
  | { state: 'offline'; at?: number }
  | { state: 'error'; message: string };

export interface SyncApi {
  config: SyncConfig | null;
  status: SyncStatus;
  connect: (input: { repo: string; token: string; passphrase: string }) => Promise<void>;
  disconnect: () => void;
  syncNow: () => Promise<void>;
  /** Syncs first (briefly) so a new invoice continues the numbering from the other devices. */
  freshen: () => Promise<void>;
}

/** Local changes wait this long for more typing before they're uploaded. */
const QUIET_MS = 3000;
/** Coming back to the app syncs, but not more often than this. */
const FOCUS_MS = 15000;

const fingerprint = (d: Data) => canonical(toPayload(d, ''));

/** Edits made while a sync was in flight are merged into what came back, never dropped. */
function keepLocalEdits(prev: Data, synced: Data): Data {
  const m = mergeData(prev, toPayload(synced, ''));
  return m.settingsFrom === 'remote' ? { ...m.data, settings: synced.settings } : m.data;
}

export function useSync(
  data: Data,
  dataRef: { current: Data },
  setDataState: Dispatch<SetStateAction<Data>>,
  notify: (msg: string) => void,
): SyncApi {
  const [config, setConfig] = useState<SyncConfig | null>(loadConfig);
  const [status, setStatus] = useState<SyncStatus>(() => (config ? { state: 'syncing' } : { state: 'off' }));
  const cfgRef = useRef(config);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const lastSynced = useRef(fingerprint(data));
  const lastRun = useRef(0);
  const quietTimer = useRef<number>();

  const run = useCallback((): Promise<void> => {
    const cfg = cfgRef.current;
    if (!cfg) return Promise.resolve();
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    window.clearTimeout(quietTimer.current);
    lastRun.current = Date.now();
    const job = (async () => {
      setStatus(s => ({ state: 'syncing', at: 'at' in s ? s.at : undefined }));
      try {
        let read: Data | null = null;
        const r = await syncOnce(cfg, () => (read = dataRef.current));
        if (cfgRef.current !== cfg) return; // disconnected meanwhile
        setDataState(prev => (prev === read ? r.data : keepLocalEdits(prev, r.data)));
        lastSynced.current = fingerprint(r.data);
        setStatus({ state: 'ok', at: Date.now() });
        for (const n of r.renumbered) {
          notify(`Both devices used invoice number ${n.from}, so ${n.client ? `${n.client}’s invoice` : 'the newer unsent one'} is now ${n.to}.`);
        }
        if (r.clashes.length) notify(`Invoice number ${r.clashes.join(', ')} was sent from both devices. Check those invoices.`);
      } catch (e) {
        if (e instanceof SyncError && e.kind === 'offline') setStatus(s => ({ state: 'offline', at: 'at' in s ? s.at : undefined }));
        else if (e instanceof WrongKeyError) {
          setStatus({ state: 'error', message: 'This device can’t open the synced invoices any more (the passphrase was changed elsewhere). Disconnect, then connect again with the current passphrase.' });
        } else setStatus({ state: 'error', message: (e as Error).message || 'Sync didn’t work.' });
      } finally {
        inflight.current = null;
        if (again.current) {
          again.current = false;
          void run();
        }
      }
    })();
    inflight.current = job;
    return job;
  }, [dataRef, notify, setDataState]);

  // Sync when the app opens.
  useEffect(() => {
    if (cfgRef.current) void run();
  }, [run]);

  // Upload local changes once typing pauses.
  useEffect(() => {
    if (!cfgRef.current || fingerprint(data) === lastSynced.current) return;
    window.clearTimeout(quietTimer.current);
    quietTimer.current = window.setTimeout(() => void run(), QUIET_MS);
  }, [data, run]);

  // Coming back to the app (or back online) picks up the other device's changes;
  // leaving it uploads straight away rather than waiting for the pause.
  useEffect(() => {
    const onShow = () => {
      if (cfgRef.current && Date.now() - lastRun.current > FOCUS_MS) void run();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onShow();
      else if (cfgRef.current && fingerprint(dataRef.current) !== lastSynced.current) void run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onShow);
    window.addEventListener('online', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onShow);
      window.removeEventListener('online', onShow);
      window.clearTimeout(quietTimer.current);
    };
  }, [run, dataRef]);

  const connect = useCallback(
    async (input: { repo: string; token: string; passphrase: string }) => {
      const cfg = await connectRepo(input);
      saveConfig(cfg);
      cfgRef.current = cfg;
      setConfig(cfg);
      lastSynced.current = '';
      await run();
    },
    [run],
  );

  const disconnect = useCallback(() => {
    saveConfig(null);
    cfgRef.current = null;
    setConfig(null);
    window.clearTimeout(quietTimer.current);
    setStatus({ state: 'off' });
  }, []);

  const freshen = useCallback(async () => {
    if (!cfgRef.current) return;
    await Promise.race([run(), new Promise(resolve => window.setTimeout(resolve, 4000))]);
  }, [run]);

  return { config, status, connect, disconnect, syncNow: run, freshen };
}
