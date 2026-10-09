import type { Data } from './types';
import { normalizeData } from './invoice';
import { seed } from './seed';

export const STORAGE_KEY = 'physio-invoice-book-v1';

/** Everything lives in this browser's localStorage. Nothing leaves the Mac. */
export function load(): Data {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = normalizeData(JSON.parse(raw));
      if (data) return data;
    }
  } catch {
    // Storage blocked or unreadable: fall through to the sample book.
  }
  // Keep an unreadable book aside rather than letting the samples overwrite it.
  if (raw) {
    try {
      localStorage.setItem(`${STORAGE_KEY}-unreadable`, raw);
    } catch {
      // Nothing more we can do.
    }
  }
  return seed();
}

export function save(data: Data): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
