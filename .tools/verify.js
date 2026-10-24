const { chromium } = require('playwright-core');
const path = require('path');
const { pathToFileURL } = require('url');
const GAME_URL = pathToFileURL(path.join(__dirname, '..', 'www', 'index.html')).href;
const SHOTS = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(GAME_URL);
  await page.waitForFunction(() => window.__SF_READY === true);
  await page.screenshot({ path: path.join(SHOTS, '50-menu-final.png') });
  await page.click('#btnStart');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(SHOTS, '51-play-level2.png') });
  console.log('START', JSON.stringify(await page.evaluate(() => __SF.snapshot())));

  // keyboard controls
  const x0 = await page.evaluate(() => __SF.game.player.x);
  await page.keyboard.down('d');
  await page.waitForTimeout(400);
  await page.keyboard.up('d');
  const x1 = await page.evaluate(() => __SF.game.player.x);
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  const dash = await page.evaluate(() => __SF.game.player.dashCd);
  await page.evaluate(() => { __SF.game.player.nova = 100; });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, '52-nova-ready.png') });
  await page.keyboard.press('x');
  await page.waitForTimeout(200);
  const novaState = await page.evaluate(() => ({ nova: __SF.game.player.nova, od: __SF.game.player.overdrive, score: __SF.game.score }));
  console.log('INPUT', JSON.stringify({ x0, x1, dash, novaState }));

  // pause screen with new setting
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, '53-pause-final.png') });
  const pauseState = await page.evaluate(() => __SF.snapshot().state);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const resumeState = await page.evaluate(() => __SF.snapshot().state);
  console.log('PAUSE', pauseState, resumeState);

  // mute toggle
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  console.log('MUTE', await page.evaluate(() => ({ muted: SF.Audio.muted, setting: __SF.game.settings.sound, ctx: SF.Audio.ctx && SF.Audio.ctx.state })));
  await page.keyboard.press('m');

  // boss + fps
  await page.evaluate(() => { __SF.game.player.invuln = 999; __SF.startBoss(); });
  await page.waitForTimeout(5500);
  const fps = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    await new Promise(res => { function tick(){ frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(); } requestAnimationFrame(tick); });
    return { fps: frames / ((performance.now() - t0) / 1000), boss: __SF.snapshot().boss, bullets: __SF.snapshot().counts.enemyBullets };
  });
  console.log('FPS', JSON.stringify(fps));
  await page.screenshot({ path: path.join(SHOTS, '54-boss-final.png') });
  // sustained fire: align player under boss by setting x every frame from the test
  await page.evaluate(() => { const g=__SF.game; g._alignTimer = setInterval(()=>{ if(g.boss){ g.player.x = g.boss.x; } }, 30); });
  await page.waitForTimeout(5000);
  console.log('BOSSHP', JSON.stringify(await page.evaluate(() => ({ snap: __SF.snapshot().boss, score: __SF.game.score }))));
  await page.screenshot({ path: path.join(SHOTS, '55-boss-hit.png') });
  await page.evaluate(() => clearInterval(__SF.game._alignTimer));

  // stress: long simulation from current state, forced sectors
  const stress = await page.evaluate(() => __SF.simulate(90, { boss: true }));
  console.log('STRESS', JSON.stringify(stress).slice(0, 1800));
  console.log('ERRORS', errors.length, errors.join('\n---\n'));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
