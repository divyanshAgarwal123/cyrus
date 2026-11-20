import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root=process.env.PROJECT_ROOT; if(!root) throw Error('Set PROJECT_ROOT to the source checkout');
const {chromium}=await import(pathToFileURL(join(root,'node_modules/playwright/index.mjs')).href);
const {SignJWT}=await import(pathToFileURL(join(root,'node_modules/jose/dist/webapi/index.js')).href);
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const base = process.env.CYRUS_URL || 'http://127.0.0.1:5380';
const out = process.env.EVIDENCE_DIR || './pdf-browser-evidence';
await mkdir(out, { recursive: true });
const report = { checks: [], downloads: [], pageErrors: [], expectedAborts: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const secret = new TextEncoder().encode('cyrus-pdf-fixture-secret-only');
async function token(uid) {
  return new SignJWT({ name: 'Synthetic PDF Tester', provider: 'github' }).setProtectedHeader({ alg: 'HS256' }).setSubject(uid)
    .setIssuer('cyrus.ai').setIssuedAt().setExpirationTime('4h').sign(secret);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true, reducedMotion: "reduce" });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  page.on('requestfailed', (r) => { if (r.url().endsWith('/api/reports')) report.expectedAborts.push(r.failure()?.errorText); });
  await context.route('https://api.github.com/repos/**', (r) => r.fulfill({ contentType: 'application/json', body: r.request().url().includes('/languages') ? '{"JavaScript":100}' : '[]' }));
  await context.addInitScript(() => {
    localStorage.setItem('agenthub.user', JSON.stringify({ name: 'Synthetic PDF Tester', provider: 'GitHub' }));
    window.pdfUrls = new Set();
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => { const url = create(blob); window.pdfUrls.add(url); return url; };
    URL.revokeObjectURL = (url) => { window.pdfUrls.delete(url); revoke(url); };
  });
  const post = (value) => context.request.post(base + '/api/reports', { data: value });
  assert.equal((await post({ kind: 'activity' })).status(), 401);
  const cookie = async (uid) => context.addCookies([{ name: 'cyrus.session', value: await token(uid), url: base, httpOnly: true, sameSite: 'Lax' }]);
  await cookie('20202020-2020-4020-8020-202020202020');
  assert.equal((await post({ kind: 'activity' })).status(), 409);
  await cookie('99999999-9999-4999-8999-999999999999');
  assert.equal((await post({ kind: 'activity' })).status(), 401);
  await cookie('10101010-1010-4010-8010-101010101010');
  assert.equal((await post({ kind: 'activity', login: 'someone-else' })).status(), 400);
  assert.equal((await post({ kind: 'projects', ids: ['http://127.0.0.1/private'] })).status(), 404);
  report.checks.push('Actual Next route/JWT/database transport: signed-out and unknown-user 401, unlinked 409, arbitrary identity 400, noncatalog target 404');
  async function download(button, file, paper, contains) {
    const pending = page.waitForEvent('download'); await button.click(); const d = await pending;
    assert.equal(await d.failure(), null); const path = `${out}/${file}.pdf`; await d.saveAs(path);
    const bytes = await readFile(path); assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
    assert.match(info, paper === 'A4' ? /595\.28 x 841\.89/ : /612 x 792/);
    const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
    for (const expected of contains) assert.ok(text.replace(/\s+/g, ' ').includes(expected), `${file} missing ${expected}`);
    await writeFile(`${out}/${file}.txt`, text); report.downloads.push({ file, bytes: bytes.length, paper, pages: Number(info.match(/Pages:\s+(\d+)/)?.[1]) });
    await page.waitForTimeout(1100); assert.equal(await page.evaluate(() => window.pdfUrls.size), 0);
    assert.equal(await page.locator('a[download]').count(), 0);
  }
  await page.goto(base + '/repo/affaan-m%2FECC', {waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
  await download(page.getByRole('button', { name: 'Export PDF', exact: true }), 'project-a4', 'A4', ['affaan-m/ECC', '271,000', 'catalog data', 'Generated']);
  await page.waitForTimeout(600); await page.screenshot({ path: `${out}/repo-light.png`, fullPage: true });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('dark'); });
  await page.waitForTimeout(600); await page.screenshot({ path: `${out}/repo-dark.png`, fullPage: true });
  report.checks.push('Native project PDF download, source snapshot counts, A4, object URL/anchor cleanup and light/dark UI');
  await page.goto(base + '/programs');
  await page.getByRole('button', { name: 'Live now', exact: true }).click();
  const exportPrograms = page.getByRole('button', { name: 'Export filtered programs', exact: true });
  await download(exportPrograms, 'live-programs-a4', 'A4', ['Status: live', 'LFX Mentorship']);
  const filteredText = await readFile(`${out}/live-programs-a4.txt`, 'utf8'); assert.ok(!filteredText.includes('Google Summer of Code'));
  let release, notify;
  const released = new Promise((r) => { release = r; }), fetched = new Promise((r) => { notify = r; });
  const hold = async (route) => { const response = await route.fetch(); notify(); await released; await route.fulfill({ response }).catch(() => {}); };
  await page.route('**/api/reports', hold);
  let staleDownload = false; const listener = () => { staleDownload = true; }; page.on('download', listener);
  await exportPrograms.click(); await fetched;
  await page.getByRole('button', { name: 'Closed this cycle', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'canceled or timed out' }).waitFor(); release();
  await page.waitForTimeout(300); assert.equal(staleDownload, false); page.off('download', listener); await page.unroute('**/api/reports', hold);
  const fail = (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic renderer unavailable. Try again."}' });
  await page.route('**/api/reports', fail); await exportPrograms.click();
  await page.getByRole('status').filter({ hasText: 'Synthetic renderer unavailable' }).waitFor(); await page.unroute('**/api/reports', fail);
  assert.equal(await exportPrograms.isEnabled(), true);
  await page.getByLabel('PDF paper size for Export filtered programs', { exact: true }).focus();
  await page.getByLabel('PDF paper size for Export filtered programs', { exact: true }).selectOption('LETTER'); assert.equal(await page.getByLabel('PDF paper size for Export filtered programs').inputValue(), 'LETTER');
  await download(exportPrograms, 'closed-programs-letter', 'LETTER', ['Status: closed', 'Google Summer of Code']);
  await page.waitForTimeout(600); await page.screenshot({ path: `${out}/programs-light.png`, fullPage: true });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('dark'); });
  await page.waitForTimeout(600); await page.screenshot({ path: `${out}/programs-dark.png`, fullPage: true });
  report.checks.push('Actual status-filtered catalogs, native paper-size selection, selection-change abort without stale download, simulated UI error and real retry');
  await page.goto(base + '/programs/gsoc');
  await download(page.getByRole('button', { name: 'Export program PDF', exact: true }), 'single-program-a4', 'A4', ['Selected programs only', 'Google Summer of Code']);
  await page.goto(base + '/dashboard');
  await download(page.getByRole('button', { name: 'Export my recent activity', exact: true }), 'own-activity-a4', 'A4', ['pdf-fixture', 'Synthetic PR', 'not all-time history', 'Events in this response']);
  await page.getByText('Export followed project reports', { exact: true }).click();
  await page.getByLabel('affaan-m/ECC', { exact: true }).check(); await page.getByLabel('NousResearch/hermes-agent', { exact: true }).check();
  await download(page.getByRole('button', { name: 'Export selected projects', exact: true }), 'batch-projects-a4', 'A4', ['affaan-m/ECC', 'NousResearch/hermes-agent']);
  assert.equal(report.downloads.at(-1).pages, 2);
  await page.waitForTimeout(600); await page.screenshot({ path: `${out}/dashboard-light.png`, fullPage: true });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('dark'); });
  await page.waitForTimeout(600); await page.screenshot({ path: `${out}/dashboard-dark.png`, fullPage: true });
  report.checks.push('Real signed-session personal PDF and two independently selected project pages, using synthetic SQL/GitHub transport without changing production auth');
  for (const [name, path] of [['repo','/repo/affaan-m%2FECC'], ['programs','/programs'], ['dashboard','/dashboard']]) {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + path);
    await page.getByRole('button', { name: /Export/ }).first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} overflow`); for (const control of await page.getByRole('button', { name: /Export/ }).all()) { const b = await control.boundingBox(); if (b) assert.ok(b.x >= 0 && b.x + b.width <= 391, `${name} clipped export control`); }
    await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${name}-mobile.png`, fullPage: true });
  }
  assert.deepEqual(report.pageErrors, []); report.checks.push('390px mobile containment across all export entry points, zero page errors'); report.passed = true;
} finally { await writeFile(`${out}/browser-report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
