// The few GitHub REST calls sync needs: check the repository is private and
// reachable, read a file with its version (sha), and write it back only if
// nobody else changed it meanwhile.

export interface Repo {
  owner: string;
  name: string;
  token: string;
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'missing' | 'public' | 'forbidden' | 'conflict' | 'offline' | 'other' = 'other',
  ) {
    super(message);
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const API = 'https://api.github.com';

export function parseRepo(text: string): { owner: string; name: string } | null {
  const m = /^\s*(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?\s*$/.exec(text);
  return m ? { owner: m[1], name: m[2] } : null;
}

export class GitHub {
  constructor(
    private repo: Repo,
    private fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  private async call(path: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}/repos/${this.repo.owner}/${this.repo.name}${path}`, {
        ...init,
        // Always ask GitHub: a cached copy would hide the other device's latest save.
        cache: 'no-store',
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.repo.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new SyncError('Can’t reach GitHub. It will sync when you’re back online.', 'offline');
    }
    if (res.status === 401) throw new SyncError('GitHub didn’t accept the access key. It may have expired: create a new one and reconnect.', 'auth');
    return res;
  }

  /** The repository must exist, be reachable with this key, and be private. */
  async checkRepo(): Promise<void> {
    const res = await this.call('');
    if (res.status === 404) throw new SyncError('Can’t find that repository. Check its name, and that the access key was given access to it.', 'missing');
    if (!res.ok) throw new SyncError(`GitHub answered ${res.status} when checking the repository.`);
    const info = (await res.json()) as { private?: boolean };
    if (!info.private) throw new SyncError('That repository is public. Use a private one, so nobody else can see even the encrypted file.', 'public');
  }

  /** A file's text and version, or null if it doesn't exist yet. */
  async read(path: string): Promise<{ text: string; sha: string } | null> {
    const res = await this.call(`/contents/${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new SyncError(`GitHub answered ${res.status} when reading the synced file.`);
    const meta = (await res.json()) as { sha: string; content?: string; encoding?: string };
    if (meta.encoding === 'base64' && meta.content) return { text: utf8(meta.content), sha: meta.sha };
    // Files over 1 MB come without content; ask for the raw bytes instead.
    const raw = await this.call(`/contents/${path}`, {}, 'application/vnd.github.raw+json');
    if (!raw.ok) throw new SyncError(`GitHub answered ${raw.status} when reading the synced file.`);
    return { text: await raw.text(), sha: meta.sha };
  }

  /** Writes a file. With a sha, only if it's still that version (else a 'conflict' SyncError). */
  async write(path: string, text: string, sha: string | null, message: string): Promise<string> {
    const res = await this.call(`/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(text))), ...(sha ? { sha } : {}) }),
    });
    if (res.status === 409 || res.status === 422) throw new SyncError('The synced file changed meanwhile.', 'conflict');
    if (res.status === 403 || res.status === 404) {
      throw new SyncError('The access key can’t save to that repository. Give it "Contents: Read and write" permission.', 'forbidden');
    }
    if (!res.ok) throw new SyncError(`GitHub answered ${res.status} when saving.`);
    const out = (await res.json()) as { content: { sha: string } };
    return out.content.sha;
  }
}

function utf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
}
