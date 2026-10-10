// How two copies of the invoice book combine. Pure functions, no network or
// crypto, so every rule here is unit-tested.
//
// - Each invoice carries updatedAt; the newer copy wins.
// - A delete is recorded in `deleted` and wins over any copy not changed after it.
// - Settings win as a whole by settingsUpdatedAt, the shared copy on a tie
//   (the samples have 0, so they never beat settings already synced). The logo travels in its own file, so the
//   payload carries only its hash.
// - Sample invoices never leave the device, and are dropped once the synced
//   book has real invoices.
// - Two devices can hand out the same number while one is offline. After a
//   merge, the newer of two unsent invoices sharing a number is renumbered.

import type { Data, Invoice, Settings } from './types';
import { isIssued, nextNumber } from './invoice';

export type SyncedSettings = Omit<Settings, 'logo'>;

export interface SyncPayload {
  format: 'invoice-book-data';
  version: 1;
  settings: SyncedSettings;
  settingsUpdatedAt: number;
  /** SHA-256 of the logo data URL, or '' for no logo. */
  logoHash: string;
  invoices: Invoice[];
  deleted: Record<string, number>;
}

export function toPayload(data: Data, logoHash: string): SyncPayload {
  const { logo: _logo, ...settings } = data.settings;
  return {
    format: 'invoice-book-data',
    version: 1,
    settings,
    settingsUpdatedAt: data.settingsUpdatedAt || 0,
    logoHash,
    invoices: data.invoices.filter(i => !i.sample),
    deleted: { ...(data.deleted || {}) },
  };
}

/** A stable string for comparing payloads (order of invoices and keys doesn't matter). */
export function canonical(p: SyncPayload | null): string {
  if (!p) return '';
  const sortKeys = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sortKeys)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys((v as Record<string, unknown>)[k])]))
        : v;
  const invoices = [...p.invoices].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(sortKeys({ ...p, invoices }));
}

export interface Renumbered {
  from: string;
  to: string;
  client: string;
}

export interface MergeResult {
  data: Data;
  /** Whose settings (and so whose logo) won. */
  settingsFrom: 'local' | 'remote';
  renumbered: Renumbered[];
  /** Numbers still shared by more than one sent or paid invoice (can't be fixed automatically). */
  clashes: string[];
}

const stamp = (i: Invoice) => i.updatedAt || 0;

export function mergeData(local: Data, remote: SyncPayload | null, now = Date.now()): MergeResult {
  if (!remote) return { data: local, settingsFrom: 'local', renumbered: [], clashes: [] };

  const deleted: Record<string, number> = { ...(local.deleted || {}) };
  for (const [id, at] of Object.entries(remote.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, at);

  const byId = new Map<string, Invoice>();
  for (const inv of [...local.invoices.filter(i => !i.sample), ...remote.invoices]) {
    const have = byId.get(inv.id);
    if (!have || stamp(inv) > stamp(have)) byId.set(inv.id, inv);
  }
  let invoices = [...byId.values()].filter(i => !(deleted[i.id] >= stamp(i)));

  // On a tie the shared copy wins: books from before sync existed all have 0, and the
  // first device to sync sets the starting point for the rest.
  const settingsFrom = (remote.settingsUpdatedAt || 0) >= (local.settingsUpdatedAt || 0) ? 'remote' : 'local';
  const settings: Settings = settingsFrom === 'remote' ? { ...remote.settings, logo: local.settings.logo } : local.settings;
  const settingsUpdatedAt = Math.max(local.settingsUpdatedAt || 0, remote.settingsUpdatedAt || 0);

  // Samples are only for trying the app; once the shared book has real invoices they go.
  const samples = remote.invoices.length ? [] : local.invoices.filter(i => i.sample);

  const fixed = fixDuplicateNumbers(invoices, now);
  invoices = fixed.invoices;
  return {
    data: { settings, settingsUpdatedAt, invoices: [...samples, ...invoices], deleted },
    settingsFrom,
    renumbered: fixed.renumbered,
    clashes: fixed.clashes,
  };
}

/** Keeps invoice numbers unique: of two invoices sharing a number, a sent or paid one keeps it,
 *  then the older one; an unsent duplicate gets the next free number. */
export function fixDuplicateNumbers(invoices: Invoice[], now = Date.now()) {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) groups.set(inv.number, [...(groups.get(inv.number) || []), inv]);
  const out = [...invoices];
  const renumbered: Renumbered[] = [];
  const clashes: string[] = [];
  for (const [number, group] of groups) {
    if (group.length < 2 || !number) continue;
    const ranked = [...group].sort(
      (a, b) =>
        Number(isIssued(b)) - Number(isIssued(a)) ||
        (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0) ||
        a.id.localeCompare(b.id),
    );
    for (const dup of ranked.slice(1)) {
      if (isIssued(dup)) {
        if (!clashes.includes(number)) clashes.push(number);
        continue;
      }
      const to = nextNumber(out, (dup.issued || '').slice(0, 4) || number.slice(0, 4));
      const idx = out.findIndex(i => i.id === dup.id);
      out[idx] = { ...dup, number: to, updatedAt: now };
      renumbered.push({ from: number, to, client: dup.client.name.trim() });
    }
  }
  return { invoices: out, renumbered, clashes };
}
