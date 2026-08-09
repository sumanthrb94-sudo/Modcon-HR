/**
 * Screenshots of the test runs themselves.
 *
 * Two kinds, because the suites are two kinds:
 *
 *   - Playwright ships an HTML report, so that one is photographed as it is —
 *     a real report page, opened in a browser.
 *   - The rules and simulation suites are node:test, whose output is a TAP
 *     stream. There is nothing to photograph, so their **actual captured
 *     stdout** is rendered in a terminal-styled page and photographed. The text
 *     is the real output, unedited; only the presentation is added.
 *
 * Takes the captured output as arguments so it cannot drift from a run:
 *   node tests/screenshots/capture-reports.mjs <dir-with-txt-files> <out-dir>
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , inputDir, outDir = 'screenshots'] = process.argv;
if (!inputDir) {
  console.error('usage: capture-reports.mjs <dir-with-txt-files> [out-dir]');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const escapeHtml = (text) =>
  text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** A terminal-looking page around real captured output. */
function terminalPage(title, subtitle, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    body { margin:0; background:#0d1117; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; padding:28px; }
    .frame { max-width:1100px; margin:0 auto; background:#161b22; border:1px solid #30363d; border-radius:12px; overflow:hidden; }
    .bar { display:flex; align-items:center; gap:8px; padding:12px 16px; background:#21262d; border-bottom:1px solid #30363d; }
    .dot { width:12px; height:12px; border-radius:50%; }
    .title { color:#e6edf3; font-size:13px; font-weight:600; margin-left:8px; }
    .sub { color:#8b949e; font-size:12px; margin-left:auto; }
    pre { margin:0; padding:20px; color:#c9d1d9; font-family:'SF Mono',Menlo,Consolas,monospace;
          font-size:12.5px; line-height:1.65; white-space:pre-wrap; word-break:break-word; }
    .ok { color:#3fb950; font-weight:600; }
    .fail { color:#f85149; font-weight:600; }
    .dim { color:#8b949e; }
  </style></head><body><div class="frame">
    <div class="bar">
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="title">${escapeHtml(title)}</span>
      <span class="sub">${escapeHtml(subtitle)}</span>
    </div>
    <pre>${body}</pre>
  </div></body></html>`;
}

/**
 * Colour the lines a reader looks for first, and nothing else.
 *
 * The text itself is never changed — this only wraps spans around lines that
 * are already there. What *is* filtered, upstream of this script, is the
 * Firebase SDK's own connection log: every denial the rules suite asserts is
 * also logged by the client, which is noise rather than result.
 */
function highlight(text) {
  return escapeHtml(text)
    .split('\n')
    .map((line) => {
      if (/^\s*✔/.test(line) || /\d+ passed/.test(line) || /^ℹ (pass|tests|suites)\b/.test(line)) {
        return `<span class="ok">${line}</span>`;
      }
      if (/^ℹ fail 0/.test(line)) return `<span class="ok">${line}</span>`;
      if (/^\s*✘/.test(line) || /^ℹ fail [1-9]/.test(line) || /\d+ failed/.test(line)) {
        return `<span class="fail">${line}</span>`;
      }
      if (/^ℹ /.test(line) || /^▶/.test(line) || /^\s+\(\d/.test(line)) {
        return `<span class="dim">${line}</span>`;
      }
      return line;
    })
    .join('\n');
}

const PANELS = [
  { file: 'rules.txt', out: '08-tests-rules.png', title: 'npm run test:rules', sub: 'Firestore security rules · emulator' },
  { file: 'sim.txt', out: '09-tests-simulation.png', title: 'npm run test:sim', sub: 'Two-organisation domain simulation' },
  { file: 'e2e.txt', out: '10-tests-e2e.png', title: 'npm run test:e2e', sub: 'Playwright · Chromium · live Firebase' },
  { file: 'build.txt', out: '11-build.png', title: 'npm run build', sub: 'tsc -b && vite build' },
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1160, height: 900 }, deviceScaleFactor: 2 });

for (const panel of PANELS) {
  const path = resolve(inputDir, panel.file);
  if (!existsSync(path)) {
    console.warn(`skipped ${panel.file} — not captured`);
    continue;
  }
  const html = terminalPage(panel.title, panel.sub, highlight(readFileSync(path, 'utf8').trimEnd()));
  const tmp = resolve(inputDir, `${panel.file}.html`);
  writeFileSync(tmp, html);
  await page.goto(pathToFileURL(tmp).href);
  await page.locator('.frame').screenshot({ path: `${outDir}/${panel.out}` });
  console.log(`wrote ${outDir}/${panel.out}`);
}

// Playwright's own report, photographed as the page it is.
const report = resolve('playwright-report/index.html');
if (existsSync(report)) {
  // Not fullPage: 93 tests makes a strip several thousand pixels tall that is
  // illegible once scaled to fit anything. The viewport holds the summary and
  // the first rows, which is what the report is read for.
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto(pathToFileURL(report).href);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/12-playwright-report.png` });
  console.log(`wrote ${outDir}/12-playwright-report.png`);
}

await browser.close();
