# Invoice Book

Invoicing for a sole-trader physiotherapist in Australia (home visits, not registered for GST). You edit the invoice in place, see what you've earned this month, and send the PDF to clients through the macOS share sheet (Mail, Messages, WhatsApp).

There is no server. Everything is stored in the browser's `localStorage` on your Mac. Use **Backup** to download a JSON copy now and then, and **Settings → Restore from backup** to bring one back.

## Using it without installing anything

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

- **Invoices** are numbered `{YYYY}-{NNN}` and issued today by default. Each session has a date, service, duration and amount. The car icon adds or removes the home-visit travel fee for that visit. Prices are copied into each session, so changing a price in Settings doesn't alter old invoices.
- **Australian rules:** the heading is "Invoice" (not "Tax invoice"). Every invoice carries your name or business name, ABN, issue date, number, each service and the total, plus "No GST has been charged." Send stays disabled until the invoice has a name or business name, an ABN, a client name and at least one session.
- **Privacy:** only the client's name and email are stored, and services are named without conditions or treatment notes. The app makes no network requests (fonts and icons are bundled), with no analytics and no cloud.
- **PDF:** a vector A4 PDF with Source Serif 4 embedded, so the text is selectable. It is generated in the browser with pdf-lib and runs onto extra pages for long invoices. It's built in the background shortly after each edit, because Safari only allows `navigator.share` straight after a click.
- **Send** opens the share sheet with the PDF attached and marks the invoice as sent. In browsers that can't share files, it downloads the PDF and opens a pre-filled email instead.
- **Logo (optional):** add one in Settings → Your details as PNG, JPEG or SVG. Empty margins around the artwork are trimmed off, and the logo is sized by area so that a wide wordmark and a stacked badge get about the same visual weight (up to 260 × 96 px). It's saved with your data (so it's included in backups) and printed above the "Invoice" heading, aligned with it, on screen and in the PDF. Without a logo, the invoice is exactly the original design.
- **Sample data:** the first run shows sample settings and invoices. Put your own details in Settings, then use **Clear sample invoices**.

## Code layout

| Path | What's there |
| --- | --- |
| `src/App.tsx` | App state, saving, PDF caching, Send / Download / Delete / Backup / Restore |
| `src/components/` | Sidebar, invoice editor, settings, number field, plate numeral |
| `src/lib/invoice.ts` | Amounts, numbering, validation, email text, backup checks |
| `src/lib/pdf.ts` | The A4 PDF layout |
| `src/lib/format.ts` | Local dates (`YYYY-MM-DD`) and AUD formatting |
| `src/ds/styles.css`, `public/ds/_ds_bundle.js` | The Broadsheet design system (tokens, components, print-plate filters) |
| `src/assets/fonts/` | Source Serif 4 (SIL Open Font License, `OFL.txt`) |
| `design_handoff_invoice_book/` | The Claude Design handoff this was built from: the HTML prototype, its runtime, the design-system files and the handoff notes |
