// Builds the whole app into one self-contained HTML file that opens by
// double-clicking, with no server: scripts, styles, fonts and the design
// system bundle are all inlined. Output: dist-single/Invoice Book.html
import { build } from 'vite';
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = 'dist-single';
rmSync(outDir, { recursive: true, force: true });

await build({
  logLevel: 'warn',
  build: {
    outDir,
    assetsInlineLimit: () => true, // fonts become data: URLs
    chunkSizeWarningLimit: 5000,
    rolldownOptions: { output: { codeSplitting: false } }, // the PDF code too
  },
});

const read = p => readFileSync(join(outDir, p), 'utf8');
// Keep inlined code from closing its own <script> tag early.
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1');
let html = read('index.html');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, href) => `<style>\n${read(href)}\n</style>`);
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g, (_, src) => `<script type="module">\n${safe(read(src))}\n</script>`);
html = html.replace(/<link rel="modulepreload"[^>]*>\n?/g, '');

const leftovers = html.match(/(src|href)="\.?\/?(assets|ds)\/[^"]+"/g);
if (leftovers) throw new Error(`Not inlined: ${leftovers.join(', ')}`);

writeFileSync(join(outDir, 'Invoice Book.html'), html);
for (const f of readdirSync(outDir)) if (f !== 'Invoice Book.html') rmSync(join(outDir, f), { recursive: true, force: true });
console.log(`${outDir}/Invoice Book.html  ${(html.length / 1024 / 1024).toFixed(2)} MB`);
