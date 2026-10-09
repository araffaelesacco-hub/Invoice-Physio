# Invoice Book

Invoicing for a sole-trader physiotherapist in Australia (home visits, not registered for GST). You edit the invoice in place, see what you've earned this month, and send the PDF to clients through the macOS share sheet (Mail, Messages, WhatsApp).

There is no server. Everything is stored in the browser's `localStorage` on your Mac. Use **Backup** to download a JSON copy now and then, and **Settings → Restore from backup** to bring one back.

## Using it

The app is published at **https://araffaelesacco-hub.github.io/Invoice-Physio/**. Open it in Safari and bookmark it, or use File → Add to Dock. Every change merged into `main` is tested, built and published by `.github/workflows/pages.yml`, so reloading the page picks it up. Your invoices are stored only in Safari on your Mac, for that address; the website serves only the app.

On a phone or a narrow window the layout switches to one column: the month figure and invoice list are one screen, and an open invoice or Settings is another, with a back button.

### Sync between devices (optional)

Each device keeps its own copy of your invoices. To keep the Mac and the phone in step, with invoice numbers that continue from one device to the other, turn on **Settings → Sync between devices**:

1. Create a **private** GitHub repository for the data, e.g. `invoice-book-data`. The app refuses a public one.
2. Create a fine-grained access token with access to **only that repository** and **Contents: Read and write**.
3. Enter the repository, token and a passphrase in Settings, then do the same on the other device with the same passphrase.

The book is gzipped and encrypted on the device (AES-256-GCM, key from the passphrase via PBKDF2-SHA256, 600,000 rounds) before it's uploaded, so GitHub only holds ciphertext. Each device stores the token and the derived key, never the passphrase; if the passphrase is lost, the synced copy can't be opened, but each device keeps its own copy and Backup still works. The logo travels in a separate file so the main file stays small.

Sync runs when the app opens, a few seconds after changes, when you return to the app or come back online, when you leave it, and just before **New invoice**, so numbers continue across devices. Each invoice carries the time it last changed and the newer copy wins; deletes are remembered so they reach the other device. If two devices hand out the same number while one is offline, the newer unsent invoice is renumbered and you're told; sent or paid invoices are never renumbered. Sample invoices never leave the device. The logic is in `src/lib/syncCore.ts` (merging), `src/lib/crypto.ts`, `src/lib/github.ts` and `src/lib/sync.ts`, with tests in `src/lib/sync.test.ts`.

Without sync, use **Backup** and **Restore from backup** to move your invoices between devices.

## Using it without a web address


A ready-built copy is in [`release/Invoice-Book.html`](release/Invoice-Book.html). Open that link on GitHub, click **Download raw file**, then double-click the downloaded file. To rebuild it after changing the code, run `npm run build:single` and copy the result over it.


`npm run build:single` makes one self-contained file, `dist-single/Invoice Book.html`. Put it somewhere permanent, such as Documents, and double-click it to open it in Safari. It needs no server or internet connection.

Safari keeps the invoices for that file at that location. If you move or rename the file, it opens empty, so take a **Backup** first and **Restore** it afterwards.

## Running it

Requires Node 22.12 or later (`node -v` to check).

```sh
npm install
npm run dev       # http://localhost:5173
npm test          # invoice rules and PDF output
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
```

`dist/` is a plain static site with relative paths. Open it from any static host or local web server. Safari on a Mac is the target browser, because its share sheet can attach the PDF directly.

## What it does

- **Invoices** are numbered `{YYYY}-{NNN}` and issued today by default. Each session has a date, service, duration and amount. Home-visit travel is never added automatically: each session shows a quiet "+ Add home visit travel ($25.00)" suggestion, and one click adds it to that visit. The car icon adds or removes it too. Prices are copied into each session, so changing a price in Settings doesn't alter old invoices.
- **Australian rules:** the heading is "Invoice" (not "Tax invoice"). Every invoice carries your name or business name, ABN, issue date, number, each service and the total, plus "No GST has been charged." Send stays disabled until the invoice has a name or business name, an ABN, a client name and at least one session.
- **Privacy:** only the client's name and email are stored, and services are named without conditions or treatment notes. The app makes no network requests (fonts and icons are bundled), with no analytics and no cloud.
- **PDF:** a vector A4 PDF with Source Serif 4 embedded, so the text is selectable. It is generated in the browser with pdf-lib and runs onto extra pages for long invoices. It's built in the background shortly after each edit, because Safari only allows `navigator.share` straight after a click.
- **Send** opens the share sheet with the PDF attached and marks the invoice as sent. In browsers that can't share files, it downloads the PDF and opens a pre-filled email instead.
- **Logo (optional):** upload one in Settings → Logo (PNG, JPG or SVG; a PNG with a transparent background works best). Empty margins around the artwork are trimmed off and it's stored as a PNG up to 600 × 300, saved with your data so backups include it. It sits 20px above the "Invoice" heading, fitted into 220 × 64 px on screen and 240 × 72 px in the PDF, never enlarged.
- **Paid and unpaid:** **Mark as paid** records the date and how the client paid (bank transfer, PayID, cash or card). The invoice list and the month summary show what's been received and what's still to come. A paid invoice's PDF becomes a receipt: "Paid" beside the heading and in place of the due date, the amount paid and "Balance due $0.00" under the total, and "Payment received" in place of the bank details. Send becomes **Send receipt**. Health funds generally want the amount and date paid on the receipt, and won't accept altered documents.
- **Records:** sent and paid invoices are locked until you click **Edit anyway**, so they stay the same as the copy your client has. Every invoice has a bin, in the list and in the toolbar, and deleting always asks you to confirm first. For a sent or paid invoice, you also type its number, because the ATO expects business records to be kept for five years.
- **Sample data:** the first run shows sample settings and invoices. Put your own details in Settings, then use **Clear sample invoices**.

## Code layout

| Path | What's there |
| --- | --- |
| `src/App.tsx` | App state, saving, PDF caching, Send / Download / Delete / Backup / Restore |
| `src/components/` | Sidebar, invoice editor, settings, number field, plate numeral |
| `src/lib/invoice.ts` | Amounts, numbering, validation, email text, backup checks |
| `src/lib/pdf.ts` | The A4 PDF layout |
| `src/lib/format.ts` | Local dates (`YYYY-MM-DD`) and AUD formatting |
| `src/ds/styles.css` | The Broadsheet design system (tokens and components) |
| `src/assets/fonts/` | Source Serif 4 (SIL Open Font License, `OFL.txt`) |
| `design_handoff_invoice_book/` | The Claude Design handoff this was built from: the HTML prototype, its runtime, the design-system files and the handoff notes |
