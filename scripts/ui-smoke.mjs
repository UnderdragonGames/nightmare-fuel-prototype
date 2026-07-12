/**
 * UI smoke test: boots the dev server, plays real moves through the actual
 * browser UI (hand click → color pick → source dot → destination dot), and
 * verifies lanes appear in the authoritative game state with zero console
 * errors.
 *
 *   node scripts/ui-smoke.mjs
 *
 * Requires a Chromium binary. Resolution order:
 *   1. $CHROME_PATH
 *   2. playwright's cached chromium headless shell (~/Library/Caches/ms-playwright)
 * Reads game state via the boardgame.io debug panel's save shortcut ('2') +
 * flatted parse of localStorage. NOTE: with multiplayer Local(), injected
 * states revert on the first move (client-only sync) — so this script plays
 * genuine moves from a fresh game instead of seeding a board.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 5197;
const ROOT = new URL('..', import.meta.url).pathname;

const findChromium = () => {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cache = join(process.env.HOME ?? '', 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const sub of ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = join(cache, dir, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  throw new Error('No Chromium found. Set CHROME_PATH or run: npx playwright install chromium');
};

const flattedPath = join(ROOT, 'node_modules/flatted/min.js');

const main = async () => {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const cleanup = () => { try { vite.kill(); } catch { /* already dead */ } };
  process.on('exit', cleanup);

  // Wait for the server
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
    if (i === 39) throw new Error('vite did not start');
  }

  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.addScriptTag({ path: flattedPath });

  const readState = async () => {
    await page.keyboard.press('2'); // debug panel: save
    await page.waitForTimeout(200);
    return page.evaluate(() => {
      const raw = localStorage.getItem('gamestate');
      return raw ? Flatted.parse(raw) : null;
    });
  };

  const panelVisible = () => page.evaluate(() => document.body.innerText.includes('reset') && document.body.innerText.includes('save'));
  const hidePanel = async () => { if (await panelVisible()) { await page.keyboard.press('.'); await page.waitForTimeout(250); } };
  const showPanel = async () => { if (!(await panelVisible())) { await page.keyboard.press('.'); await page.waitForTimeout(250); } };

  const clickCoord = async (q, r) => {
    const pt = await page.evaluate(({ q, r }) => {
      const svg = [...document.querySelectorAll('svg')].filter((s) => s.clientWidth > 400)[0];
      const size = 18;
      const x = size * 1.5 * q;
      const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
      const p = svg.createSVGPoint(); p.x = x; p.y = y;
      const sp = p.matrixTransform(svg.getScreenCTM());
      return { x: sp.x, y: sp.y };
    }, { q, r });
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(350);
  };

  // Play up to 3 legal placements through the real UI, using the app's own
  // enumerator (imported through vite) to choose moves.
  let placed = 0;
  for (let step = 0; step < 6 && placed < 3; step += 1) {
    await showPanel();
    const state = await readState();
    if (!state || state.ctx.currentPlayer !== '0') break;
    const pick = await page.evaluate(async (Gjson) => {
      const mod = await import('/src/game/ai.ts');
      const acts = mod.enumerateActions(Gjson, '0')
        .filter((a) => a.type === 'playCard' && !a.args.convert);
      return acts.length ? acts[0].args : null;
    }, state.G);
    if (!pick) break;

    await hidePanel();
    await page.locator('text=HAND').first().click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('.neural-card').nth(pick.handIndex).locator(`.neural-card__btn--${pick.pick}`).click({ timeout: 5000 });
    await page.waitForTimeout(300);
    const dim = page.locator('.zone-backdrop-dim');
    if (await dim.count()) { await dim.click({ position: { x: 5, y: 5 } }).catch(() => {}); await page.waitForTimeout(250); }
    await clickCoord(pick.source.q, pick.source.r);
    await clickCoord(pick.coord.q, pick.coord.r);

    await showPanel();
    const after = await readState();
    if (after && after.G.lanes.length > (state.G.lanes.length ?? 0)) placed += 1;
  }

  await browser.close();
  cleanup();

  const pass = placed >= 2 && errors.length === 0;
  console.log(`ui-smoke: placed ${placed} lanes via UI | errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  console.log(pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
};

main().catch((e) => { console.error('ui-smoke crashed:', e.message); process.exit(1); });
