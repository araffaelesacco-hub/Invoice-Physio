// Keeps the invoice book the same on every device, through one encrypted file
// in a private GitHub repository the user owns.
//
// A sync pulls the file, merges it with this device's book (syncCore), and
// pushes the result if it changed, only if nobody pushed meanwhile; on a
// clash it starts again. The logo lives in a second file so the main file
// stays small, and is only uploaded or downloaded when it actually changes.

import type { Data } from './types';
import { canonical, mergeData, toPayload, type MergeResult, type SyncPayload } from './syncCore';
import { deriveKey, KDF_ITERATIONS, open, parseEnvelope, randomBytes, seal, sha256, toBase64, WrongKeyError } from './crypto';
import { GitHub, parseRepo, SyncError, type FetchLike } from './github';

export const SYNC_KEY = 'physio-invoice-book-sync-v1';
export const MAIN_FILE = 'invoice-book.json';
export const LOGO_FILE = 'logo.json';
const MESSAGE = 'Invoice Book sync';

/** What a device keeps to sync: never the passphrase itself, only the key derived from it. */
export interface SyncConfig {
  owner: string;
  name: string;
  token: string;
  key: string;
  salt: string;
  iterations: number;
}

export function loadConfig(): SyncConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
    return c && c.owner && c.name && c.token && c.key && c.salt ? c : null;
  } catch {
    return null;
  }
}

export function saveConfig(c: SyncConfig | null) {
  try {
    if (c) localStorage.setItem(SYNC_KEY, JSON.stringify(c));
    else localStorage.removeItem(SYNC_KEY);
  } catch {
    // Storage blocked: sync just won't survive a reload.
  }
}

const github = (c: SyncConfig, f?: FetchLike) => new GitHub({ owner: c.owner, name: c.name, token: c.token }, f);

/** Checks the repository and passphrase, and returns the config to keep. Doesn't sync yet. */
export async function connect(
  input: { repo: string; token: string; passphrase: string },
  fetchImpl?: FetchLike,
): Promise<SyncConfig> {
  const repo = parseRepo(input.repo);
  if (!repo) throw new SyncError('Enter the repository as your-name/repository-name.');
  if (!input.token.trim()) throw new SyncError('Paste the access key from GitHub.');
  if (input.passphrase.length < 8) throw new SyncError('Use a passphrase of at least 8 characters.');
  const gh = new GitHub({ ...repo, token: input.token.trim() }, fetchImpl);
  await gh.checkRepo();
  const existing = await gh.read(MAIN_FILE);
  if (existing) {
    // Another device set sync up already: use its salt, and prove the passphrase opens it.
    const env = parseEnvelope(existing.text);
    const key = await deriveKey(input.passphrase, env.kdf.salt, env.kdf.iterations);
    await open(key, env);
    return { ...repo, token: input.token.trim(), key, salt: env.kdf.salt, iterations: env.kdf.iterations };
  }
  const salt = toBase64(randomBytes(16));
  const key = await deriveKey(input.passphrase, salt, KDF_ITERATIONS);
  return { ...repo, token: input.token.trim(), key, salt, iterations: KDF_ITERATIONS };
}

export interface SyncResult extends Omit<MergeResult, 'settingsFrom'> {
  /** Whether this device uploaded anything. */
  pushed: boolean;
}

/**
 * One full sync. `getLocal` is read after the network round trip, so edits made
 * while it was in flight are merged too. Returns the merged book for the device to keep.
 */
export async function syncOnce(cfg: SyncConfig, getLocal: () => Data, fetchImpl?: FetchLike): Promise<SyncResult> {
  const gh = github(cfg, fetchImpl);
  for (let attempt = 0; attempt < 4; attempt++) {
    const remoteFile = await gh.read(MAIN_FILE);
    let remote: SyncPayload | null = null;
    if (remoteFile) {
      const env = parseEnvelope(remoteFile.text);
      if (env.kdf.salt !== cfg.salt) throw new WrongKeyError();
      remote = JSON.parse(await open(cfg.key, env)) as SyncPayload;
    }

    const local = getLocal();
    const localLogoHash = await sha256(local.settings.logo);
    const merged = mergeData(local, remote);
    let logoHash = localLogoHash;

    if (remote && merged.settingsFrom === 'remote' && remote.logoHash !== localLogoHash) {
      // The other device's logo won: fetch it (or clear ours if it removed it).
      logoHash = remote.logoHash;
      merged.data = { ...merged.data, settings: { ...merged.data.settings, logo: await readLogo(gh, cfg, remote.logoHash) } };
    }

    const out = toPayload(merged.data, logoHash);
    let pushed = false;
    if (canonical(out) !== canonical(remote)) {
      try {
        if (logoHash && logoHash !== remote?.logoHash) await writeLogo(gh, cfg, merged.data.settings.logo);
        const env = await seal(cfg.key, cfg.salt, JSON.stringify(out), cfg.iterations);
        await gh.write(MAIN_FILE, JSON.stringify(env), remoteFile?.sha ?? null, MESSAGE);
        pushed = true;
      } catch (e) {
        if (e instanceof SyncError && e.kind === 'conflict') continue; // someone saved meanwhile: start again
        throw e;
      }
    }
    return { data: merged.data, renumbered: merged.renumbered, clashes: merged.clashes, pushed };
  }
  throw new SyncError('The other device kept saving at the same moment. Try Sync now in a minute.');
}

async function readLogo(gh: GitHub, cfg: SyncConfig, hash: string): Promise<string> {
  if (!hash) return '';
  const file = await gh.read(LOGO_FILE);
  if (!file) return '';
  const logo = (JSON.parse(await open(cfg.key, parseEnvelope(file.text))) as { logo: string }).logo || '';
  return (await sha256(logo)) === hash ? logo : '';
}

async function writeLogo(gh: GitHub, cfg: SyncConfig, logo: string) {
  const env = await seal(cfg.key, cfg.salt, JSON.stringify({ logo }), cfg.iterations);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await gh.read(LOGO_FILE);
    try {
      await gh.write(LOGO_FILE, JSON.stringify(env), current?.sha ?? null, MESSAGE);
      return;
    } catch (e) {
      if (!(e instanceof SyncError && e.kind === 'conflict')) throw e;
    }
  }
}
