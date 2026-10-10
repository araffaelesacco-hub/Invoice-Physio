import { useState, type FormEvent } from 'react';
import { ArrowsClockwise, CloudArrowUp } from '@phosphor-icons/react';
import type { SyncApi } from '../useSync';

const clock = (at: number) => new Date(at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

/** Settings → Sync between devices: set it up once per device, then it runs on its own. */
export function SyncSection({ sync, onMessage }: { sync: SyncApi; onMessage: (msg: string) => void }) {
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (pass !== pass2) {
      setError('The two passphrases don’t match.');
      return;
    }
    setBusy(true);
    try {
      await sync.connect({ repo, token, passphrase: pass });
      setToken('');
      setPass('');
      setPass2('');
      onMessage('Sync is on. This device now keeps in step with your others.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sync.config) {
    const s = sync.status;
    return (
      <section className="settings-section sync-section">
        <h4>Sync between devices</h4>
        <p className="settings-body">
          Syncing with <strong>{sync.config.owner}/{sync.config.name}</strong>.{' '}
          {s.state === 'ok' && `Last synced at ${clock(s.at)}.`}
          {s.state === 'syncing' && 'Syncing now…'}
          {s.state === 'offline' && 'You’re offline: changes will sync when you’re back online.'}
        </p>
        {s.state === 'error' && <p className="sync-error" role="alert">{s.message}</p>}
        <div className="data-actions">
          <button className="btn btn-secondary" onClick={() => void sync.syncNow()} disabled={s.state === 'syncing'}>
            <ArrowsClockwise size={17} className="icon-accent" />Sync now
          </button>
          <button
            className="btn btn-ghost logo-remove"
            onClick={() => {
              if (window.confirm('Stop syncing on this device? Your invoices stay here, and the synced copy on GitHub isn’t touched.')) sync.disconnect();
            }}
          >
            Disconnect this device
          </button>
        </div>
        <p className="settings-note">
          Your invoices are encrypted on this device before they're saved, so GitHub only ever holds scrambled data. If you forget the passphrase the synced copy can't be opened, but each device keeps its own copy and Backup still works.
        </p>
      </section>
    );
  }

  return (
    <section className="settings-section sync-section">
      <h4>Sync between devices</h4>
      <p className="settings-body">
        Keep your invoices, settings and invoice numbers the same on your Mac and your phone. They're encrypted on this device with your passphrase and saved to a private GitHub repository, so only your devices can read them.
      </p>
      <ol className="sync-steps">
        <li>
          On GitHub, <a href="https://github.com/new" target="_blank" rel="noreferrer">create a new repository</a>, for example <em>invoice-book-data</em>, and choose <strong>Private</strong>.
        </li>
        <li>
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Create an access key</a> (a fine-grained token): under Repository access choose <strong>Only select repositories</strong> and pick that repository, then under Permissions set <strong>Contents</strong> to <strong>Read and write</strong>. Copy the key.
        </li>
        <li>Fill in the form below. On your other device, do the same with the same repository and passphrase.</li>
      </ol>
      <form className="fields sync-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="sync-repo">Repository</label>
          <input id="sync-repo" className="input" value={repo} onChange={e => setRepo(e.target.value)} placeholder="your-name/invoice-book-data" autoCapitalize="off" autoCorrect="off" spellCheck={false} required />
        </div>
        <div className="field">
          <label htmlFor="sync-token">Access key</label>
          <input id="sync-token" className="input" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" required />
        </div>
        <div className="field">
          <label htmlFor="sync-pass">Passphrase</label>
          <input id="sync-pass" className="input" type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="sync-pass2">Passphrase again</label>
          <input id="sync-pass2" className="input" type="password" value={pass2} onChange={e => setPass2(e.target.value)} autoComplete="new-password" minLength={8} required />
        </div>
        {error && <p className="sync-error" role="alert">{error}</p>}
        <div className="data-actions">
          <button type="submit" className="btn btn-secondary" disabled={busy}>
            <CloudArrowUp size={17} className="icon-accent" />{busy ? 'Connecting…' : 'Turn on sync'}
          </button>
        </div>
      </form>
      <p className="settings-note">
        Keep the passphrase in your password manager: it can't be reset, and the synced copy can't be opened without it.
      </p>
    </section>
  );
}
