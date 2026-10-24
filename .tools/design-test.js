// Design regression: escort formation, weapon DPS spread, off-screen fairness,
// and the boss spell rotation / phase pressure. Drives the real game objects.
const { chromium } = require('playwright-core');
const path = require('path');
const { pathToFileURL } = require('url');
const URL = pathToFileURL(path.join(__dirname, '..', 'www', 'index.html')).href;
const SHOTS = path.join(__dirname, 'shots');

const step = (page, frames, perFrame) => page.evaluate(({ frames, perFrame }) => {
  const g = __SF.game;
  const dt = 1 / 60;
  const out = [];
  for (let i = 0; i < frames; i++) {
    if (perFrame) eval(perFrame)(g, dt, i, out);
    if (g.player && g.player.alive) g.player.update(dt, g.input);
    if (g.boss) g.boss.update(dt);
    for (let j = g.enemyBullets.length - 1; j >= 0; j--) if (!g.enemyBullets[j].update(dt, g.player)) g.enemyBullets.splice(j, 1);
    for (let j = g.playerBullets.length - 1; j >= 0; j--) if (!g.playerBullets[j].update(dt, g.player)) g.playerBullets.splice(j, 1);
    for (let j = g.enemies.length - 1; j >= 0; j--) if (!g.enemies[j].update(dt, g.player)) g.enemies.splice(j, 1);
    for (let j = g.lasers.length - 1; j >= 0; j--) if (!g.lasers[j].update(dt)) g.lasers.splice(j, 1);
    g.pointDefense();
    g.collide();
  }
  return out;
}, { frames, perFrame });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  const fail = (label, ok, info) => console.log((ok ? '  [OK]  ' : '  [FAIL]') + ' ' + label.padEnd(34) + JSON.stringify(info));

  await page.goto(URL);
  await page.waitForFunction(() => window.__SF_READY === true);
  await page.click('#btnStart');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const g = __SF.game;
    g.godMode = true;
    g.player.invuln = 9999;
    g.director.state = 'idle';
    g.director.pending.length = 0;
    g.director.script.length = 0;
    g.enemies.length = 0; g.enemyBullets.length = 0; g.playerBullets.length = 0;
    g.settings.lowFx = true;
  });

  /* ---------- 1. escort flies on the wings, it does not orbit ---------- */
  await page.evaluate(() => {
    const p = __SF.game.player;
    p.drones.length = 0;
    p.addDrone('gunner'); p.addDrone('lance'); p.addDrone('aegis');
  });
  const formation = await step(page, 180, `(function(g,dt,i,out){
    g.player.x += Math.sin(i/12)*1.6;
    if (i % 30 === 0) out.push(g.player.drones.map(d => ({
      kind: d.kind, dx: Math.round(d.x - g.player.x), dy: Math.round(d.y - g.player.y),
      ang: +d.angle.toFixed(2)
    })));
  })`);
  const slots = formation[formation.length - 1];
  const sideOk = slots[0].dx < -30 && slots[1].dx > 30 && Math.abs(slots[0].dy) < 40;
  const stable = formation.every(f => f.every((d, k) => Math.abs(d.dx - slots[k].dx) <= 14 && Math.abs(d.dy - slots[k].dy) <= 16));
  fail('wingmen hold side slots', sideOk && stable, { first: formation[0], last: slots });

  /* ---------- 2. main-ship and escort ammo differ ---------- */
  const ammo = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    g.playerBullets.length = 0;
    p.weapons.pulse.unlocked = true; p.selectWeapon('pulse'); p.level = 3; p.weapons.pulse.level = 3;
    for (let i = 0; i < 6; i++) p.shoot();
    const main = g.playerBullets.map(b => b.kind);
    g.playerBullets.length = 0;
    p.drones.length = 0;
    ['gunner', 'lance', 'swarm', 'aegis'].forEach(k => p.addDrone(k));
    const hullShoot = p.shoot;
    p.shoot = () => {};                       // isolate wing fire from hull fire
    for (let i = 0; i < 120; i++) p.update(1 / 60, g.input);
    p.shoot = hullShoot;
    const drone = g.playerBullets.map(b => b.kind);
    return { main, drone, mainKinds: [...new Set(main)], droneKinds: [...new Set(drone)] };
  });
  fail('hull and wing ammo differ',
    ammo.mainKinds.length >= 1 && ammo.droneKinds.length >= 2 && !ammo.droneKinds.some(k => ammo.mainKinds.includes(k)),
    { hull: ammo.mainKinds, wing: ammo.droneKinds });

  /* ---------- 3. off-screen grunts cannot be hunted down ---------- */
  const offscreen = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    g.enemies.length = 0; g.playerBullets.length = 0;
    p.drones.length = 0;
    p.weapons.swarm.unlocked = true; p.selectWeapon('swarm'); p.level = 5; p.weapons.swarm.level = 5;
    const far = __SF.spawn('drifter', SF.W * 0.5, -260);
    far.hp = far.maxHp = 400;
    const near = __SF.spawn('drifter', SF.W * 0.5, SF.H * 0.3);
    near.hp = near.maxHp = 400;
    near.y = SF.H * 0.3;
    const dt = 1 / 60;
    for (let i = 0; i < 420; i++) {
      p.update(dt, g.input);
      for (const e of g.enemies) e.update(dt, p);
      far.y = -260; far.x = SF.W * 0.5;           // pinned off-screen: it never legally enters
      for (let j = g.playerBullets.length - 1; j >= 0; j--) if (!g.playerBullets[j].update(dt, p)) g.playerBullets.splice(j, 1);
      g.collide();
    }
    return {
      farTargetable: far.targetable(), farHp: Math.round(far.hp), farY: Math.round(far.y),
      nearTargetable: near.targetable(), nearHp: Math.round(near.hp),
      offscreenShootable: far.hp < far.maxHp,
    };
  });
  fail('off-screen enemy takes no damage',
    !offscreen.offscreenShootable && !offscreen.farTargetable && offscreen.nearHp < 400,
    offscreen);

  /* ---------- 4. weapon levels are worth something ---------- */
  const dps = {};
  for (const weapon of ['pulse', 'prism', 'swarm']) {
    for (const level of [1, 3, 5]) {
      const dmg = await page.evaluate(({ weapon, level }) => {
        const g = __SF.game, p = g.player;
        g.enemies.length = 0; g.playerBullets.length = 0; g.enemyBullets.length = 0;
        p.drones.length = 0;
        p.weapons[weapon].unlocked = true;
        p.selectWeapon(weapon);
        p.level = level; p.weapons[weapon].level = level; p.overdrive = 0;
        __SF.startBoss();
        const waitBoss = async () => {
          for (let i = 0; i < 60 && !g.boss; i++) await new Promise(r => setTimeout(r, 50));
          return g.boss;
        };
        return waitBoss().then((b) => {
          b.entering = false; b.y = b.targetY;
          b.maxHp = b.hp = 1e9;
          b.hit = function (d) { if (!this.entering && !this.dying) this.hp -= d; };
          b.update = function () {};
          p.x = SF.W * 0.5; p.y = SF.H * 0.8;
          const before = b.hp;
          const dt = 1 / 60;
          for (let i = 0; i < 300; i++) {
            p.update(dt, g.input);
            for (let j = g.playerBullets.length - 1; j >= 0; j--) if (!g.playerBullets[j].update(dt, p)) g.playerBullets.splice(j, 1);
            g.collide();
          }
          const out = Math.round(before - b.hp);
          g.boss = null;
          return { weapon, level, dmg5s: out, dps: +(out / 5).toFixed(1) };
        });
      }, { weapon, level });
      dps[weapon + '_L' + level] = dmg;
    }
  }
  console.log('\nDPS 5s window');
  for (const k of Object.keys(dps)) console.log('  ' + k.padEnd(12) + JSON.stringify(dps[k]));
  const l1 = ['pulse', 'prism', 'swarm'].map(w => dps[w + '_L1'].dps);
  const l5 = ['pulse', 'prism', 'swarm'].map(w => dps[w + '_L5'].dps);
  fail('levels scale damage', l5.every((v, i) => v > l1[i] * 1.35), { lv1: l1, lv5: l5 });
  fail('no weapon is a dead pick', Math.max(...l5) / Math.min(...l5) < 2.2, { spread: +(Math.max(...l5) / Math.min(...l5)).toFixed(2), lv5: l5 });

  /* ---------- 5. every boss spell fires ---------- */
  await page.evaluate(() => {
    __SF.startBoss();
  });
  await page.waitForTimeout(3200);
  const allAttacks = await page.evaluate(() => Object.keys(SF.ATTACK_LABELS));
  const spellReport = [];
  for (const name of allAttacks) {
    const r = await page.evaluate((n) => {
      const g = __SF.game;
      g.enemyBullets.length = 0; g.lasers.length = 0;
      g.boss.maxHp = g.boss.hp = 1e9;
      g.boss.entering = false; g.boss.dying = false;
      g.boss.y = g.boss.targetY;
      g.boss.attack = null;
      g.boss.startAttack(n);
      const dt = 1 / 60;
      let lasers = 0, fired = 0;
      const seen = new Set();
      const eBefore = g.enemies.length;
      for (let i = 0; i < 300; i++) {
        g.boss.update(dt);
        for (let j = g.enemyBullets.length - 1; j >= 0; j--) {
          const b = g.enemyBullets[j];
          if (!seen.has(b)) { seen.add(b); fired++; }
          if (!b.update(dt, g.player)) g.enemyBullets.splice(j, 1);
        }
        for (let j = g.enemies.length - 1; j >= 0; j--) if (!g.enemies[j].update(dt, g.player)) g.enemies.splice(j, 1);
        for (const l of g.lasers) lasers = Math.max(lasers, g.lasers.length);
        for (let j = g.lasers.length - 1; j >= 0; j--) if (!g.lasers[j].update(dt)) g.lasers.splice(j, 1);
        if (!g.boss.attack) break;
      }
      const kinds = {};
      for (const b of g.enemyBullets) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
      const spawned = Math.max(0, g.enemies.length - eBefore);
      const out = { spell: n, label: SF.ATTACK_LABELS[n], fired, live: g.enemyBullets.length, kinds, lasers, spawned };
      g.enemies.length = 0;
      return out;
    }, name);
    spellReport.push(r);
    console.log('  BOSS ' + name.padEnd(14) + JSON.stringify(r));
  }
  const dead = spellReport.filter(r => r.fired === 0 && r.lasers === 0 && r.spawned === 0);
  fail('all ' + allAttacks.length + ' spells fire', dead.length === 0, dead);
  await page.screenshot({ path: path.join(SHOTS, '220-boss-spells.png') });

  /* ---------- 6. rotation, mercy and phase pressure ---------- */
  const rotation = await page.evaluate(() => {
    const g = __SF.game, b = g.boss;
    g.enemyBullets.length = 0; g.lasers.length = 0; g.enemies.length = 0;
    b.maxHp = b.hp = 1e9; b.phase = 1; b.seqIdx = 0; b.entering = false; b.dying = false;
    b.y = b.targetY; b.attack = null; b.attackCd = 0.2; b.desperate = false;
    const dt = 1 / 60;
    // 20s per HP tier: full health, phase 2, phase 3, desperation
    const tiers = [9e8, 6e8, 2.5e8, 1e8];
    const order = [];
    let lastCount = -1, mercy = null;
    const fired = { 1: 0, 2: 0, 3: 0 };
    const peak = { 1: 0, 2: 0, 3: 0 };
    const secs = { 1: 0, 2: 0, 3: 0 };
    const seenB = new Set();
    for (let i = 0; i < 60 * 80; i++) {
      b.hp = tiers[Math.min(3, (i / 1200) | 0)];
      const ph = b.phase;
      b.update(dt);
      if (b.spellCount !== lastCount) { lastCount = b.spellCount; if (b.attack) order.push(b.attack.name); }
      if (b.mercy > 1.1 && mercy === null) mercy = { phase: b.phase, liveAfterClear: g.enemyBullets.length };
      for (let j = g.enemyBullets.length - 1; j >= 0; j--) {
        const bl = g.enemyBullets[j];
        if (!seenB.has(bl)) { seenB.add(bl); fired[ph] = (fired[ph] || 0) + 1; }
        if (!bl.update(dt, g.player)) g.enemyBullets.splice(j, 1);
      }
      peak[b.phase] = Math.max(peak[b.phase] || 0, g.enemyBullets.length);
      secs[b.phase] = (secs[b.phase] || 0) + dt;
      for (let j = g.enemies.length - 1; j >= 0; j--) if (!g.enemies[j].update(dt, g.player)) g.enemies.splice(j, 1);
      for (let j = g.lasers.length - 1; j >= 0; j--) if (!g.lasers[j].update(dt)) g.lasers.splice(j, 1);
    }
    const rate = {};
    for (const k of Object.keys(fired)) rate[k] = +(fired[k] / Math.max(1, secs[k])).toFixed(1);
    return { order: order.slice(0, 12), finalPhase: b.phase, desperate: b.desperate, mercy, fireRatePerSec: rate, peakLive: peak };
  });
  console.log('\nROTATION ' + JSON.stringify(rotation));
  const expected = await page.evaluate(() => {
    const b = __SF.game.boss;
    return { def: b.def.phases, id: b.type };
  });
  const rot1 = rotation.order.slice(0, expected.def[0].length);
  const seqOk = rot1.every((n, i) => n === expected.def[0][i % expected.def[0].length]);
  fail('phase 1 rotation is scripted', seqOk, { boss: expected.id, seen: rot1, want: expected.def[0] });
  fail('phase change clears the board', !!rotation.mercy && rotation.mercy.liveAfterClear <= 4, rotation.mercy);
  const rate = rotation.fireRatePerSec;
  fail('pressure rises per phase', rate[2] > rate[1] && rate[3] >= rate[2], rotation.fireRatePerSec);
  fail('desperation overload fires', rotation.desperate === true, { desperate: rotation.desperate, phase: rotation.finalPhase });

  /* ---------- 7. a real fight ends in a sane window ---------- */
  async function fightRun(label, cfg) {
    const out = await page.evaluate((cfg) => {
      const g = __SF.game, p = g.player;
      g.boss = null; g.enemies.length = 0; g.enemyBullets.length = 0; g.playerBullets.length = 0; g.lasers.length = 0;
      g.sector = cfg.sector;
      __SF.startBoss();
      const waitBoss = async () => {
        for (let i = 0; i < 60 && !g.boss; i++) await new Promise(r => setTimeout(r, 50));
        return g.boss;
      };
      return waitBoss().then((b) => {
        b.entering = false; b.y = b.targetY;
        p.drones.length = 0;
        cfg.drones.forEach(k => p.addDrone(k));
        p.x = SF.W * 0.5; p.y = SF.H * 0.82;
        b.x = SF.W * 0.5;
        for (const w of Object.keys(cfg.levels)) { p.weapons[w].unlocked = true; p.weapons[w].level = cfg.levels[w]; }
        p.selectWeapon(cfg.weapon); p.level = cfg.levels[cfg.weapon];
        const dt = 1 / 60;
        let t = 0, hits = 0;
        g.playerHit = () => { hits++; };          // immortal rig: only measure the clock
        while (!b.dying && t < 120) {
          p.x = SF.W * 0.5; p.y = SF.H * 0.82;      // stationary rig: pure race-against-clock
          p.update(dt, g.input); b.update(dt); t += dt;
          for (let j = g.enemyBullets.length - 1; j >= 0; j--) if (!g.enemyBullets[j].update(dt, p)) g.enemyBullets.splice(j, 1);
          for (let j = g.playerBullets.length - 1; j >= 0; j--) if (!g.playerBullets[j].update(dt, p)) g.playerBullets.splice(j, 1);
          for (let j = g.enemies.length - 1; j >= 0; j--) if (!g.enemies[j].update(dt, p)) g.enemies.splice(j, 1);
          for (let j = g.lasers.length - 1; j >= 0; j--) if (!g.lasers[j].update(dt)) g.lasers.splice(j, 1);
          g.collide();
        }
        return { maxHp: Math.round(b.maxHp), seconds: +t.toFixed(1), kills: b.dying, phaseReached: b.phase, hullHits: hits };
      });
    }, cfg);
    console.log('  FIGHT ' + label.padEnd(22) + JSON.stringify(out));
    return out;
  }
  const fresh = await fightRun('S1 rookie L2, no wingmen', { sector: 1, weapon: 'pulse', levels: { pulse: 2 }, drones: [] });
  const mid = await fightRun('S3 mid L3 + 2 wingmen', { sector: 3, weapon: 'pulse', levels: { pulse: 3 }, drones: ['gunner', 'lance'] });
  const maxed = await fightRun('S5 maxed + 3 wingmen', { sector: 5, weapon: 'prism', levels: { pulse: 5, prism: 5, swarm: 5 }, drones: ['gunner', 'lance', 'aegis'] });
  fail('rookie sees all 3 phases in 25-60s', fresh.kills && fresh.seconds > 25 && fresh.seconds < 60 && fresh.phaseReached >= 3, fresh);
  fail('mid build fight is 15-50s', mid.kills && mid.seconds > 15 && mid.seconds < 50 && mid.phaseReached >= 3, mid);
  fail('maxed build fight is 12-45s', maxed.kills && maxed.seconds > 12 && maxed.seconds < 45 && maxed.phaseReached >= 3, maxed);

  /* ---------- 8. an idle hull actually dies ---------- */
  const risk = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    g.boss = null; g.enemies.length = 0; g.enemyBullets.length = 0; g.playerBullets.length = 0; g.lasers.length = 0;
    g.godMode = false;
    __SF.startBoss();
    const waitBoss = async () => {
      for (let i = 0; i < 60 && !g.boss; i++) await new Promise(r => setTimeout(r, 50));
      return g.boss;
    };
    return waitBoss().then((b) => {
      b.entering = false; b.y = b.targetY;
      b.maxHp = 1e9;                              // pin the hull to the desperation window
      p.drones.length = 0; p.shoot = () => {};    // measure the boss alone
      let hits = 0;
      g.playerHit = function () { hits++; p.grantInvuln(0.2); };
      const dt = 1 / 60;
      for (let i = 0; i < 60 * 30; i++) {
        p.x = SF.W * 0.5; p.y = SF.H * 0.82;      // a player who never dodges
        p.invuln = 0; p.shieldCharges = 0; p.reflectT = 0; p.dashT = 0;
        b.hp = 1e8;                               // 10% => phase 3, then overload
        b.update(dt);
        for (let j = g.enemyBullets.length - 1; j >= 0; j--) if (!g.enemyBullets[j].update(dt, p)) g.enemyBullets.splice(j, 1);
        for (let j = g.lasers.length - 1; j >= 0; j--) if (!g.lasers[j].update(dt)) g.lasers.splice(j, 1);
        g.collide();
      }
      g.godMode = true;
      return { seconds: 30, hitsWhileStationary: hits, phase: b.phase, desperate: b.desperate };
    });
  });
  console.log('RISK ' + JSON.stringify(risk));
  fail('boss punishes a hull that never dodges', risk.hitsWhileStationary >= 4, risk);

  console.log('\nERRORS', errors.length, errors.slice(0, 6).join('\n---\n'));
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
