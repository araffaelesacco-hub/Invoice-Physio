import { describe, expect, it } from 'vitest';
import type { Data, Invoice } from './types';
import { createInvoice } from './invoice';
import { seed } from './seed';
import { canonical, fixDuplicateNumbers, mergeData, toPayload } from './syncCore';
import { deriveKey, open, seal, sha256, WrongKeyError } from './crypto';
import { connect, LOGO_FILE, MAIN_FILE, syncOnce, type SyncConfig } from './sync';
import type { FetchLike } from './github';

// ── A pretend GitHub: one private repository held in memory ──────────────
function fakeGitHub(opts: { private?: boolean } = {}) {
  const files = new Map<string, { text: string; sha: number }>();
  let version = 0;
  const calls: string[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl: FetchLike = async (url, init = {}) => {
    const path = url.replace('https://api.github.com/repos/me/data', '');
    const method = init.method || 'GET';
    calls.push(`${method} ${path}`);
    if ((init.headers as Record<string, string>).Authorization !== 'Bearer good-token') return json(401, {});
    if (path === '') return json(200, { private: opts.private ?? true });
    const name = path.replace('/contents/', '');
    const file = files.get(name);
    if (method === 'GET') {
      if (!file) return json(404, {});
      return json(200, { sha: String(file.sha), encoding: 'base64', content: btoa(file.text) });
    }
    const body = JSON.parse(String(init.body)) as { content: string; sha?: string };
    if (file ? body.sha !== String(file.sha) : body.sha) return json(409, {});
    files.set(name, { text: atob(body.content), sha: ++version });
    return json(200, { content: { sha: String(version) } });
  };
  return { fetchImpl, files, calls };
}

const PASS = 'correct horse battery';
const fastConnect = (f: FetchLike) => connect({ repo: 'me/data', token: 'good-token', passphrase: PASS }, f);

/** A device: its own book plus the sync loop the app runs. */
function device(data: Data, cfg: SyncConfig, f: FetchLike) {
  const d = { data, cfg };
  return {
    get data() { return d.data; },
    edit(fn: (data: Data) => void) { const next = structuredClone(d.data); fn(next); d.data = next; },
    async sync() { const r = await syncOnce(d.cfg, () => d.data, f); d.data = r.data; return r; },
  };
}

const realBook = (): Data => {
  const d = seed();
  d.invoices = [];
  d.settingsUpdatedAt = 1000;
  return d;
};

describe('encryption', () => {
  it('round-trips, and a wrong passphrase cannot open it', async () => {
    const salt = btoa('0123456789abcdef');
    const key = await deriveKey(PASS, salt, 1000);
    const env = await seal(key, salt, 'Margaret Lee owes $415', 1000);
    expect(env.data).not.toContain('Margaret');
    expect(await open(key, env)).toBe('Margaret Lee owes $415');
    await expect(open(await deriveKey('wrong passphrase', salt, 1000), env)).rejects.toBeInstanceOf(WrongKeyError);
  });
});

describe('merging two books', () => {
  const inv = (id: string, number: string, updatedAt: number, extra: Partial<Invoice> = {}): Invoice => ({
    id, number, issued: '2026-10-09', client: { name: id, email: '' }, lines: [],
    sentAt: null, sentVia: null, paidAt: null, paidVia: null, receiptSentAt: null, createdAt: updatedAt, updatedAt, ...extra,
  });

  it('keeps the newer copy of each invoice and adds the other side’s new ones', () => {
    const local = realBook();
    local.invoices = [inv('a', '2026-001', 10, { client: { name: 'old', email: '' } }), inv('b', '2026-002', 10)];
    const remote = toPayload({ ...realBook(), invoices: [inv('a', '2026-001', 20, { client: { name: 'new', email: '' } }), inv('c', '2026-003', 5)] }, '');
    const { data } = mergeData(local, remote);
    expect(data.invoices.map(i => i.id).sort()).toEqual(['a', 'b', 'c']);
    expect(data.invoices.find(i => i.id === 'a')!.client.name).toBe('new');
  });

  it('carries deletes across, unless the invoice was changed afterwards', () => {
    const local = realBook();
    local.invoices = [inv('a', '2026-001', 10), inv('b', '2026-002', 50)];
    const remote = toPayload({ ...realBook(), deleted: { a: 20, b: 30 } }, '');
    const { data } = mergeData(local, remote);
    expect(data.invoices.map(i => i.id)).toEqual(['b']);
    expect(data.deleted).toEqual({ a: 20, b: 30 });
  });

  it('never uploads sample invoices, and drops them once the shared book has real ones', () => {
    const sampleBook = seed();
    expect(toPayload(sampleBook, '').invoices).toEqual([]);
    const remote = toPayload({ ...realBook(), invoices: [inv('r', '2026-001', 1)] }, '');
    const { data, settingsFrom } = mergeData(sampleBook, remote);
    expect(data.invoices.map(i => i.id)).toEqual(['r']);
    expect(settingsFrom).toBe('remote'); // the samples' settings never beat real ones
  });

  it('takes the synced settings when neither side has been edited since sync was added', () => {
    const phone = seed();
    phone.invoices = []; // samples cleared, but the sample details never edited
    const macBook: Data = { ...realBook(), settingsUpdatedAt: 0 };
    macBook.settings = { ...macBook.settings, yourName: 'Raf Sacco' };
    const { data, settingsFrom } = mergeData(phone, toPayload(macBook, ''));
    expect(settingsFrom).toBe('remote');
    expect(data.settings.yourName).toBe('Raf Sacco');
  });

  it('renumbers the newer of two unsent invoices that got the same number offline', () => {
    const { invoices, renumbered } = fixDuplicateNumbers([inv('a', '2026-020', 10), inv('b', '2026-020', 20), inv('c', '2026-019', 1)]);
    expect(invoices.find(i => i.id === 'a')!.number).toBe('2026-020');
    expect(invoices.find(i => i.id === 'b')!.number).toBe('2026-021');
    expect(renumbered).toEqual([{ from: '2026-020', to: '2026-021', client: 'b' }]);
  });

  it('never renumbers a sent invoice; a clash between two sent ones is reported', () => {
    const sent = { sentAt: '2026-10-09' };
    const r1 = fixDuplicateNumbers([inv('a', '2026-020', 10), inv('b', '2026-020', 20, sent)]);
    expect(r1.invoices.find(i => i.id === 'b')!.number).toBe('2026-020');
    expect(r1.invoices.find(i => i.id === 'a')!.number).toBe('2026-021');
    const r2 = fixDuplicateNumbers([inv('a', '2026-020', 10, sent), inv('b', '2026-020', 20, sent)]);
    expect(r2.clashes).toEqual(['2026-020']);
  });

  it('compares payloads regardless of order', () => {
    const a = toPayload({ ...realBook(), invoices: [inv('a', '1', 1), inv('b', '2', 1)] }, '');
    const b = toPayload({ ...realBook(), invoices: [inv('b', '2', 1), inv('a', '1', 1)] }, '');
    expect(canonical(a)).toBe(canonical(b));
  });
});

describe('syncing two devices through GitHub', () => {
  it('refuses a public repository, a bad key and a wrong passphrase', async () => {
    await expect(connect({ repo: 'me/data', token: 'good-token', passphrase: PASS }, fakeGitHub({ private: false }).fetchImpl)).rejects.toThrow(/public/);
    await expect(connect({ repo: 'me/data', token: 'bad', passphrase: PASS }, fakeGitHub().fetchImpl)).rejects.toThrow(/access key/);
    const gh = fakeGitHub();
    const cfg = await fastConnect(gh.fetchImpl);
    await device(realBook(), cfg, gh.fetchImpl).sync();
    await expect(connect({ repo: 'me/data', token: 'good-token', passphrase: 'not the passphrase' }, gh.fetchImpl)).rejects.toBeInstanceOf(WrongKeyError);
  }, 30_000);

  it('keeps the Mac and the phone in step, with progressive numbers and no plaintext on GitHub', async () => {
    const gh = fakeGitHub();
    const macCfg = await fastConnect(gh.fetchImpl);
    const mac = device(realBook(), macCfg, gh.fetchImpl);
    mac.edit(d => { d.settings.yourName = 'Raf'; d.settingsUpdatedAt = 2000; d.invoices.push({ ...createInvoice(d, '2026-10-09'), client: { name: 'Margaret Lee', email: '' } }); });
    expect((await mac.sync()).pushed).toBe(true);
    expect(gh.files.get(MAIN_FILE)!.text).not.toContain('Margaret');

    // The phone connects with the same passphrase, starting from the sample book.
    const phoneCfg = await fastConnect(gh.fetchImpl);
    const phone = device(seed(), phoneCfg, gh.fetchImpl);
    await phone.sync();
    expect(phone.data.settings.yourName).toBe('Raf');
    expect(phone.data.invoices.map(i => i.client.name)).toEqual(['Margaret Lee']); // samples gone

    // A new invoice on the phone continues the numbering from the Mac's.
    const macNumber = mac.data.invoices[0].number;
    phone.edit(d => { d.invoices.push({ ...createInvoice(d, '2026-10-09'), client: { name: 'Tom Nguyen', email: '' } }); });
    await phone.sync();
    await mac.sync();
    const numbers = mac.data.invoices.map(i => i.number).sort();
    expect(numbers).toEqual([macNumber, `2026-${String(Number(macNumber.slice(5)) + 1).padStart(3, '0')}`]);
    expect(mac.data.invoices.map(i => i.client.name).sort()).toEqual(['Margaret Lee', 'Tom Nguyen']);

    // A delete on the Mac reaches the phone.
    const tom = mac.data.invoices.find(i => i.client.name === 'Tom Nguyen')!;
    mac.edit(d => { d.invoices = d.invoices.filter(i => i.id !== tom.id); d.deleted = { ...d.deleted, [tom.id]: Date.now() }; });
    await mac.sync();
    await phone.sync();
    expect(phone.data.invoices.map(i => i.client.name)).toEqual(['Margaret Lee']);
  }, 30_000);

  it('sorts out two devices that both made invoice offline with the same number', async () => {
    const gh = fakeGitHub();
    const cfg = await fastConnect(gh.fetchImpl);
    const mac = device(realBook(), cfg, gh.fetchImpl);
    const phone = device(realBook(), cfg, gh.fetchImpl);
    await mac.sync();
    await phone.sync();
    mac.edit(d => { d.invoices.push({ ...createInvoice(d, '2026-10-09'), client: { name: 'Mac client', email: '' }, createdAt: 1, updatedAt: 1 }); });
    phone.edit(d => { d.invoices.push({ ...createInvoice(d, '2026-10-09'), client: { name: 'Phone client', email: '' }, createdAt: 2, updatedAt: 2 }); });
    expect(mac.data.invoices[0].number).toBe(phone.data.invoices[0].number);
    await mac.sync();
    const r = await phone.sync();
    expect(r.renumbered).toEqual([{ from: '2026-001', to: '2026-002', client: 'Phone client' }]);
    await mac.sync();
    expect(mac.data.invoices.map(i => `${i.number} ${i.client.name}`).sort()).toEqual(['2026-001 Mac client', '2026-002 Phone client']);
  }, 30_000);

  it('retries when the other device saved in between, without losing either change', async () => {
    const gh = fakeGitHub();
    const cfg = await fastConnect(gh.fetchImpl);
    const mac = device(realBook(), cfg, gh.fetchImpl);
    const phone = device(realBook(), cfg, gh.fetchImpl);
    await mac.sync();
    await phone.sync();
    mac.edit(d => { d.invoices.push({ ...createInvoice(d, '2026-10-09'), client: { name: 'From Mac', email: '' } }); });
    phone.edit(d => { d.invoices.push({ ...createInvoice(d, '2026-10-09', 'phone-1'), number: '2026-050', client: { name: 'From phone', email: '' } }); });
    // The phone saves while the Mac is between reading and writing.
    let raced = false;
    const racing: FetchLike = async (url, init) => {
      if (!raced && init?.method === 'PUT' && url.endsWith(MAIN_FILE)) { raced = true; await phone.sync(); }
      return gh.fetchImpl(url, init);
    };
    const r = await syncOnce(cfg, () => mac.data, racing);
    expect(r.pushed).toBe(true);
    expect(r.data.invoices.map(i => i.client.name).sort()).toEqual(['From Mac', 'From phone']);
  }, 30_000);

  it('syncs the logo in its own file, only when it changes', async () => {
    const gh = fakeGitHub();
    const cfg = await fastConnect(gh.fetchImpl);
    const mac = device(realBook(), cfg, gh.fetchImpl);
    mac.edit(d => { d.settings.logo = 'data:image/png;base64,AAAA'; d.settingsUpdatedAt = 5000; });
    await mac.sync();
    expect(gh.files.has(LOGO_FILE)).toBe(true);
    const phone = device(seed(), cfg, gh.fetchImpl);
    await phone.sync();
    expect(phone.data.settings.logo).toBe('data:image/png;base64,AAAA');
    const writes = gh.calls.filter(c => c === `PUT /contents/${LOGO_FILE}`).length;
    mac.edit(d => { d.settings.yourName = 'Changed'; d.settingsUpdatedAt = 6000; });
    await mac.sync();
    expect(gh.calls.filter(c => c === `PUT /contents/${LOGO_FILE}`).length).toBe(writes);
    expect(await sha256('')).toBe('');
  }, 30_000);
});
