# Handoff: Invoice Book (physiotherapy invoicing, desktop)

## Overview
A single-user desktop web app for a sole-trader physiotherapist in Australia (home visits, not registered for GST). The user creates invoices by editing the invoice document in place, sees a monthly income figure plus invoice history, and sends the PDF to clients through the macOS share sheet (Mail, Messages, WhatsApp). The user works on a Mac (Safari). There is no backend: all data lives in the browser's localStorage, with JSON backup and restore.

## About the design files
`Invoice Book.dc.html` is a **working HTML prototype**. It is a design reference showing the intended look and behaviour, not production code to ship as is. Recreate it in the target codebase's environment. If there is no existing stack, a small static SPA works well (e.g. Vite + React or Svelte, deployable as static files or as an offline PWA). It needs no server.

To view the prototype, open `Invoice Book.dc.html` in a browser with `support.js` and `_ds/` beside it. The markup sits inside `<x-dc>`; the logic is the `class Component` in the `<script data-dc-script>` block. `{{ }}` holes are filled from `renderVals()`, `<sc-for>` is a loop and `<sc-if>` is a conditional.

## Fidelity
**High fidelity.** Final colours, type, spacing, copy and behaviour. Match them closely, using the Broadsheet tokens in `_ds/.../styles.css`.

## Australian invoice rules (must keep)
- Heading is **"Invoice"**, never "Tax invoice". The user is not registered for GST.
- Every invoice shows the practitioner's name or business name and **ABN**, the issue date, an invoice number, each service (date, type, duration, amount), and the total with the line **"No GST has been charged."**
- **Send is blocked** until the invoice has a name or business name, an ABN, a client name and at least one session (see Validation).
- **Privacy** (health providers are covered by the Privacy Act): name the service only, never a condition or treatment notes. Store only the client's name and email. No analytics, no third-party data transfer, no cloud.

## Layout
A two-column CSS grid: `grid-template-columns: minmax(260px,340px) minmax(0,1fr); min-height:100vh`. Body background is `--color-bg` (#f3f2f2). Everything is set in Source Serif 4.

### Sidebar (left)
`position: sticky; top: 0; height: 100vh; overflow: auto; padding: 28px 28px 24px`, flex column, top to bottom:
1. **Masthead rules:** a 3px solid `--color-text` rule, a 2px gap, a 1px rule. Then a rail (`padding: 6px 0`, 11px uppercase, letter-spacing .06em) with the business name on the left and today's date ("Wed 7 Oct 2026") on the right. Then another 1px rule.
2. **Month nav** (margin-top 28px): an italic 16px label, "October so far" for the current month or "September 2026" for a past month. On the right, two ghost icon buttons (Phosphor duotone `caret-left` and `caret-right`, 18px).
3. **Month total:** the DS `.cmyk-num` plate numeral at 84px, weight 600, letter-spacing -.03em, whole dollars ("$1,245"). Markup: `.cmyk-num > span.paper + span.plate.plate-c/.plate-m/.plate-y`, each holding the same text.
4. **Summary** (16px, line-height 1.45, margin-top 18px): "4 invoices, 11 sessions. September closed at $6,480." The second sentence appears only when the previous month's total is above 0. With no invoices: "No invoices in {Month}."
5. **Sample banner** (only while sample invoices exist): background `--color-accent-2-100`, text `--color-accent-2-800`, padding 12px 14px, radius 2px, 13px. Copy: "These are sample invoices. Put your own details in Settings, then clear the samples." Below it, a ghost button "Clear sample invoices".
6. **New invoice:** `.btn.btn-primary`, height 46px, 15px, Phosphor `pen-nib` icon, margin-top 24px.
7. **Invoice list** for the selected month, newest first. Each row is a full-width button with padding 10px 12px and radius 2px. Background is `--color-surface` when selected, `--color-neutral-200` on hover. Contents:
   - Kicker (11px uppercase): "2026-014 · 7 Oct" in `--color-neutral-700`, or "2026-015 · Not sent" in `--color-accent-2-700`.
   - Client name: 17px, weight 600, single line with ellipsis.
   - Amount ("$415.00") on the right, 15px.
8. **Footer** (pinned to the bottom with margin-top auto): ghost buttons "Settings" (`gear-six`) and "Backup" (`floppy-disk`).

### Main: Invoice view
`padding: 28px clamp(20px,3vw,48px) 64px`. The content column has max-width 794px, flex column, gap 18px.
- **Toolbar:** "Invoice {number}" (22px, 600). Under it, the status at 13px: "Not sent yet" in accent-2-700, or "Sent 7 October 2026" in neutral-700. On the right: a delete icon button (`trash`, ghost, with a confirm dialog), "Download PDF" (`.btn-secondary`, `file-pdf` icon), and "Send" (`.btn-primary`, `paper-plane-tilt`, min-width 120px). Send shows "Preparing…" while busy and is disabled while there are warnings.
- **Warnings box** (only when there are warnings): accent-2-100 background, accent-2-800 text, 14px. Bold heading "Before you can send this invoice:", then one line per problem.
- **Editable paper:** background `--color-neutral-100`, `--shadow-md`, padding `clamp(32px,5vw,64px) clamp(24px,4vw,64px) 56px`, min-height 1000px, flex column.
  - Header: "Invoice" on the left (48px, 600, letter-spacing -.02em). On the right, a 13px grid of label/value pairs: Number (editable text), Issued (editable date), Due ("On receipt", fixed).
  - From / Bill to: a 2-column grid (`minmax(0,1fr)` × 2, gap 32px, margin-top 48px, `overflow-wrap:anywhere`).
    - From shows name (15px/600), business name, "ABN …" and "phone · email", read from Settings. Below it, a ghost link "Change in Settings".
    - Bill to has an editable client name (15px/600, with a datalist of past client names; picking a known name fills the email if it's empty) and an editable email.
  - Sessions table: columns `112px minmax(120px,1fr) 64px 80px 56px`, gap 12px. Header is 11px uppercase neutral-700 (Date, Service, Duration, Amount) over a 1px `--color-neutral-300` rule. Each row (padding 8px 0) has:
    - Date input.
    - Service `<select>` (options from Settings services). Hourly services show the rate note "$120/h" (12px neutral-700) beside it.
    - Duration number input (step 5) followed by "min".
    - Amount, right-aligned.
    - Two ghost icon buttons: `car-simple` toggles travel (accent when on, neutral-400 when off), `x` removes the row.
    - If travel is on, a sub-row in neutral-700: "Home visit travel" with the travel amount.
  - Below the rows, a ghost button "+ Add session". It copies the previous row's service, duration and travel, with today's date.
  - Total row: a 1px neutral-300 rule above, right-aligned "Total (AUD)" at 14px and the amount at 28px/600. Beneath, "No GST has been charged." at 12px neutral-700.
  - Footer, pushed to the bottom: a 2-column grid. "Bank transfer" (11px uppercase, `--color-accent-700`) with account name, "BSB … · Account …" and "Reference {number}". "PayID" with the PayID and the reference.
  - Last line: "Thank you, {client first name}." in italic 13px neutral-700.
  - **Editable-field style:** inherit the font, transparent background, no border except `border-bottom: 1.5px dashed var(--color-accent-400)`, radius 0. Focus uses the DS `:focus-visible` 2px accent outline.
- **Hint under the paper** (13px neutral-700): "Anything with a dashed underline can be edited. The car icon adds or removes the travel fee for that visit. Changes save automatically."

### Main: Settings view
Max-width 760px, sections 44px apart. Title "Settings" (h2) with a "Done" `.btn-secondary` on the right. Fields use DS `.field > label + .input` in an auto-fit grid (`minmax(220px,1fr)`, gap 16px).
- **Your details:** Your name, Business name, ABN, Phone, Email. Helper text: "Your name or business name and your ABN must appear on every invoice."
- **How clients pay you:** Account name, BSB, Account number, PayID.
- **Services and prices:** rows in a grid (`minmax(0,1fr) 130px 110px 100px 36px`) with name, pricing (`select`: Fixed price / Hourly rate), price (shows "/ hour" when hourly), usual length (min) and a remove button. Then "+ Add service" and a "Home visit travel fee ($)" field.
- **Your data:** "Everything is saved in this browser on this Mac and nowhere else. Clearing your browser's website data deletes it, so download a backup now and then and keep it somewhere safe." Buttons: "Download backup" and "Restore from backup" (a hidden JSON file input, with a confirm before overwriting).

### Empty view
h2 "No invoice open", 16px neutral-700 "Pick one from the list, or start a new one.", then the primary button "New invoice".

### Toast
Fixed at bottom centre, max-width 520px, background `--color-neutral-900`, text `--color-bg`, radius 4px, `--shadow-lg`, 14px. It disappears after 7 seconds.

## PDF output (what the client receives)
- An A4 sheet, 794px wide at 96dpi (min-height 1123px), padding 68px 68px 56px, **white background**.
- Same structure as the editable paper, without inputs or controls:
  - Heading at 52px.
  - Body text at 14px.
  - Session columns `110px 1fr 80px 96px`.
  - Service text reads "Physiotherapy: follow-up", or "Physiotherapy: exercise program ($120/h)" for hourly services.
  - Dates print as "30 Sep 2026".
  - Issued prints as "7 October 2026".
  - Total at 30px.
- The prototype rasterises this sheet with html2canvas (scale 2) into jsPDF (A4, pt), slicing into extra pages if it's taller than one page. In production, generate a **vector PDF** if possible (e.g. pdf-lib or react-pdf with Source Serif 4 embedded) so the text is selectable.
- File name: `Invoice {number}.pdf`.

## Interactions and behaviour
- **Persistence:** the whole `data` object is saved to localStorage key `physio-invoice-book-v1` on every change.
- **New invoice:** number = `{YYYY}-{NNN}`, where NNN is the highest number for the current year plus 1, zero-padded to 3 digits. Issued = today. Client starts empty. One session: first service, today's date, travel on with the default travel fee. The sidebar jumps to the current month and selects the new invoice.
- **Line amount:** a fixed service charges its price; an hourly service charges price × duration / 60, rounded to cents. Travel adds `travelFee` as a separate line.
- **Prices are copied into each line** when a service is chosen, so later price changes don't alter old invoices. Toggling travel stores the current travel fee.
- **Changing the issue date** moves the sidebar to that month.
- **Send:**
  1. Generate the PDF, or reuse a cached copy. The prototype pre-generates it in the background 1.2s after each edit, because Safari only allows `navigator.share` straight after a click.
  2. If `navigator.canShare({files})`, call `navigator.share({files:[pdf], title, text})`. On success, mark it sent (`sentAt` = today, `sentVia` = 'Shared'). Ignore AbortError.
  3. If sharing isn't allowed after an async wait, show the toast "The PDF is ready. Click Send again to choose Mail, Messages or WhatsApp."
  4. Fallback when sharing isn't supported: download the PDF and open a `mailto:` link with the subject and body filled in, mark it sent ('Email'), and show the toast "This browser can't attach files when sharing. The PDF has been downloaded: attach it to the email that just opened. Safari on Mac attaches it for you."
- **Message text:**
  - Subject: "Invoice {number} from {businessName}".
  - Body: "Hi {first name},\n\nPlease find attached invoice {number} for {total}. Payment details are on the invoice.\n\nThank you,\n{yourName}".
- **Download PDF:** saves the file without marking it sent.
- **Delete:** asks for confirmation, then selects another invoice in the same month, or the newest overall, or shows the empty view.
- **Validation** (each warning is one line, in the order listed):
  - "Add your name or business name in Settings." when both are blank.
  - "Add your ABN in Settings."
  - "Add the client's name."
  - "Add at least one session."
- **Sample data:** the first run seeds sample settings ("Harper Physiotherapy", ABN 51 824 753 556) and 7 sample invoices flagged `sample: true`. "Clear sample invoices" removes only the flagged ones.

## State
```
data = {
  settings: { yourName, businessName, abn, phone, email, accountName, bsb, accountNumber, payId,
              travelFee: number,
              services: [{ id, name, pricing: 'fixed'|'hourly', price: number, duration: number }] },
  invoices: [{ id, number: '2026-015', issued: 'YYYY-MM-DD', client: { name, email },
               lines: [{ id, date, serviceName, pricing, price, duration, travel: bool, travelFee }],
               sentAt: 'YYYY-MM-DD'|null, sentVia: 'Shared'|'Email'|null, sample?: true }]
}
ui = { view: 'invoice'|'settings'|'empty', currentId, month: 'YYYY-MM', toast, busy }
```
Dates are handled as local `YYYY-MM-DD` strings; parse them with `new Date(y, m-1, d)` to avoid timezone shifts. Currency uses `en-AU` / AUD.

## Design tokens (Broadsheet; full set in `_ds/.../styles.css`)
- **Colours:**
  - bg #f3f2f2, surface #eae9e9, text #201e1d.
  - accent #0088b0, with 100 #e9f8ff, 400 #62c5ee, 600 #1186ac (hover), 700 #006786 (pressed and small accent text).
  - accent-2 #d6006c, with 100 #fff1f4, 700 #aa0b56, 800 #790e3d.
  - neutral 100 #f8f4f4, 200 #eae7e7, 300 #d7d3d3, 400 #bab6b6, 600 #7d7979, 700 #605d5d, 900 #2d2b2b.
  - process yellow #edbb00 (plate numeral only).
- **Type:** Source Serif 4 (400, 600, italic 400) for everything. No sans-serif. Base 15px/1.55. h2 32px, h4 20px. Headings weight 600, letter-spacing -.015em.
- **Spacing:** 5, 10, 15, 20, 30, 40px.
- **Radius:** 1, 2, 4px.
- **Shadows:**
  - sm: `0 1px 2px rgba(45,43,43,.14)`
  - md: `0 3px 10px rgba(45,43,43,.16)`
  - lg: `0 12px 32px rgba(45,43,43,.22)`
- **Components used:** `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon`, `.field`, `.input`, `.cmyk-num`. Hover and focus states come from the DS.
- **Structure:** no boxes or dividers for layout; whitespace separates sections. Rules appear only as masthead furniture and in the table.

## Assets
- Icons: Phosphor, duotone weight (`@phosphor-icons/web`): pen-nib, caret-left/right, gear-six, floppy-disk, trash, file-pdf, paper-plane-tilt, car-simple, x, plus, download-simple, upload-simple.
- Font: Source Serif 4 from Google Fonts (imported by `styles.css`).
- No images.

## Files
- `Invoice Book.dc.html`: the prototype (markup plus logic class).
- `support.js`: the runtime needed to open the prototype in a browser.
- `_ds/broadsheet-0c63b38f-3c66-4cb4-910d-3318cfd1f0b0/styles.css`: design tokens and component classes.
- `_ds/broadsheet-0c63b38f-3c66-4cb4-910d-3318cfd1f0b0/_ds_bundle.js`: the DS bundle (print-plate filters for `.cmyk-num`).
- `_ds/broadsheet-0c63b38f-3c66-4cb4-910d-3318cfd1f0b0/readme.md`: the design system guide.
