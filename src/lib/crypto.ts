// Encryption for sync, with the browser's own Web Crypto. Data is gzipped,
// then sealed with AES-256-GCM under a key stretched from the passphrase with
// PBKDF2 (SHA-256). Only ciphertext ever leaves the device.

export const KDF_ITERATIONS = 600_000;

export interface Envelope {
  format: 'invoice-book-sync';
  version: 1;
  kdf: { name: 'PBKDF2-SHA256'; iterations: number; salt: string };
  cipher: { name: 'AES-256-GCM'; iv: string };
  gzip: boolean;
  data: string;
}

export class WrongKeyError extends Error {
  constructor() {
    super('That passphrase doesn’t open the synced invoices.');
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

type Bytes = Uint8Array<ArrayBuffer>;

export function fromBase64(b64: string): Bytes {
  const s = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const randomBytes = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

/** The 256-bit key for a passphrase and salt, as base64 (kept on the device so the passphrase isn't). */
export async function deriveKey(passphrase: string, salt: string, iterations = KDF_ITERATIONS): Promise<string> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')) as Bytes, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations }, base, 256);
  return toBase64(new Uint8Array(bits));
}

const aesKey = (key: string) => crypto.subtle.importKey('raw', fromBase64(key), 'AES-GCM', false, ['encrypt', 'decrypt']);

const canGzip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(bytes: Bytes, stream: CompressionStream | DecompressionStream): Promise<Bytes> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function seal(key: string, salt: string, plaintext: string, iterations = KDF_ITERATIONS): Promise<Envelope> {
  const gzip = canGzip();
  let bytes: Bytes = enc.encode(plaintext) as Bytes;
  if (gzip) bytes = await pipe(bytes, new CompressionStream('gzip'));
  const iv = randomBytes(12);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key), bytes);
  return {
    format: 'invoice-book-sync',
    version: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations, salt },
    cipher: { name: 'AES-256-GCM', iv: toBase64(iv) },
    gzip,
    data: toBase64(new Uint8Array(sealed)),
  };
}

export async function open(key: string, env: Envelope): Promise<string> {
  let bytes: Bytes;
  try {
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(env.cipher.iv) }, await aesKey(key), fromBase64(env.data)));
  } catch {
    throw new WrongKeyError();
  }
  if (env.gzip) {
    if (!canGzip()) throw new Error('This browser is too old to read the synced invoices. Update it and try again.');
    bytes = await pipe(bytes, new DecompressionStream('gzip'));
  }
  return dec.decode(bytes);
}

export function parseEnvelope(text: string): Envelope {
  const env = JSON.parse(text) as Envelope;
  if (env?.format !== 'invoice-book-sync' || !env.kdf?.salt || !env.cipher?.iv || typeof env.data !== 'string') {
    throw new Error('The synced file isn’t an Invoice Book file.');
  }
  return env;
}

export async function sha256(text: string): Promise<string> {
  if (!text) return '';
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text) as Bytes));
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
}
