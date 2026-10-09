import { useRef, type ChangeEvent } from 'react';
import { DownloadSimple, Image as ImageIcon, Plus, UploadSimple, X } from '@phosphor-icons/react';
import type { Pricing, Settings } from '../lib/types';
import { uid } from '../lib/format';
import { prepareLogo } from '../lib/logo';
import { Logo, NumberInput } from './fields';
import { SyncSection } from './SyncSection';
import type { SyncApi } from '../useSync';

type TextKey = 'yourName' | 'businessName' | 'abn' | 'phone' | 'email' | 'accountName' | 'bsb' | 'accountNumber' | 'payId';

interface Props {
  st: Settings;
  onUpdate: (fn: (st: Settings) => void) => void;
  onDone: () => void;
  onBackup: () => void;
  onRestore: (file: File) => void;
  onMessage: (msg: string) => void;
  sync: SyncApi;
}

export function SettingsView({ st, onUpdate, onDone, onBackup, onRestore, onMessage, sync }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const logo = await prepareLogo(f);
      onUpdate(s => { s.logo = logo; });
    } catch (err) {
      onMessage((err as Error).message);
    }
  };

  const field = (key: TextKey, label: string, extra?: { placeholder?: string; type?: string; inputMode?: 'numeric' | 'email' | 'tel' }) => (
    <div className="field">
      <label htmlFor={`set-${key}`}>{label}</label>
      <input
        id={`set-${key}`}
        className="input"
        value={st[key]}
        onChange={e => { const v = e.target.value; onUpdate(s => { s[key] = v; }); }}
        {...extra}
      />
    </div>
  );

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) onRestore(f);
  };

  return (
    <div className="settings">
      <div className="settings-head">
        <h2>Settings</h2>
        <button className="btn btn-secondary" onClick={onDone}>Done</button>
      </div>

      <section className="settings-section">
        <h4>Your details</h4>
        <p className="settings-note">Your name or business name and your ABN must appear on every invoice.</p>
        <div className="fields">
          {field('yourName', 'Your name')}
          {field('businessName', 'Business name')}
          {field('abn', 'ABN', { placeholder: '11 digits', inputMode: 'numeric' })}
          {field('phone', 'Phone', { type: 'tel' })}
          {field('email', 'Email', { type: 'email' })}
        </div>
      </section>

      <section className="settings-section logo-section">
        <h4>Logo</h4>
        <p className="settings-note">Shown at the top of every invoice. PNG with a transparent background works best.</p>
        {st.logo && (
          <div className="logo-tile">
            <Logo className="sheet-logo" src={st.logo} alt={`${st.businessName || st.yourName} logo`} />
          </div>
        )}
        <div className="data-actions">
          <button className="btn btn-secondary" onClick={() => logoRef.current?.click()}>
            <ImageIcon size={17} className="icon-accent" />{st.logo ? 'Replace logo' : 'Upload logo'}
          </button>
          {st.logo && <button className="btn btn-ghost logo-remove" onClick={() => onUpdate(s => { s.logo = ''; })}>Remove logo</button>}
          <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onLogo} hidden />
        </div>
      </section>

      <section className="settings-section">
        <h4>How clients pay you</h4>
        <div className="fields">
          {field('accountName', 'Account name')}
          {field('bsb', 'BSB', { inputMode: 'numeric' })}
          {field('accountNumber', 'Account number', { inputMode: 'numeric' })}
          {field('payId', 'PayID')}
        </div>
      </section>

      <section className="settings-section services">
        <h4>Services and prices</h4>
        <div className="service-grid service-head"><span>Service</span><span>Pricing</span><span>Price</span><span>Usual length</span><span /></div>
        {st.services.map((sv, idx) => (
          <div className="service-grid" key={sv.id}>
            <input className="input sv-name" value={sv.name} onChange={e => { const v = e.target.value; onUpdate(s => { s.services[idx].name = v; }); }} aria-label="Service name" />
            <select className="input sv-pricing" value={sv.pricing} onChange={e => { const v = e.target.value as Pricing; onUpdate(s => { s.services[idx].pricing = v; }); }} aria-label="Pricing">
              <option value="fixed">Fixed price</option>
              <option value="hourly">Hourly rate</option>
            </select>
            <div className="with-unit sv-price">
              <NumberInput className="input" min={0} value={sv.price} onCommit={n => onUpdate(s => { s.services[idx].price = n; })} aria-label="Price" />
              {sv.pricing === 'hourly' && <span className="unit">/ hour</span>}
            </div>
            <div className="with-unit sv-length">
              <NumberInput className="input" min={5} step={5} value={sv.duration} onCommit={n => onUpdate(s => { s.services[idx].duration = n; })} aria-label="Usual length" />
              <span className="unit">min</span>
            </div>
            <button className="btn btn-ghost btn-icon remove sv-remove" onClick={() => onUpdate(s => { s.services.splice(idx, 1); })} aria-label="Remove service">
              <X size={16} />
            </button>
          </div>
        ))}
        <button className="btn btn-ghost add-service" onClick={() => onUpdate(s => { s.services.push({ id: uid(), name: 'New service', pricing: 'fixed', price: 0, duration: 45 }); })}>
          <Plus size={16} />Add service
        </button>
        <div className="field travel-fee">
          <label htmlFor="set-travel">Home visit travel fee ($)</label>
          <NumberInput id="set-travel" className="input" min={0} value={st.travelFee} onCommit={n => onUpdate(s => { s.travelFee = n; })} />
        </div>
      </section>

      <SyncSection sync={sync} onMessage={onMessage} />

      <section className="settings-section data">
        <h4>Your data</h4>
        <p className="settings-body">
          Everything is saved in this browser on this device{sync.config ? ', and an encrypted copy is kept in your private GitHub repository.' : ' and nowhere else. Without sync, your phone and your Mac keep separate copies; use a backup to move them across.'} Clearing your browser's website data deletes this device's copy, so download a backup now and then and keep it somewhere safe.
        </p>
        <div className="data-actions">
          <button className="btn btn-secondary" onClick={onBackup}><DownloadSimple size={17} className="icon-accent" />Download backup</button>
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><UploadSimple size={17} className="icon-accent" />Restore from backup</button>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} hidden />
        </div>
      </section>
    </div>
  );
}
