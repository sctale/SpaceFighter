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

  /* ---------- 3.5 speed/power triangle, charge, resonance, hit penalty ---------- */
  const tri = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    const out = {};
    for (const wname of ['pulse', 'prism', 'swarm']) {
      g.playerBullets.length = 0;
      p.weapons[wname].unlocked = true;
      p.selectWeapon(wname);
      p.level = 5; p.weapons[wname].level = 5;
      p.weapons[wname].charge = 100; p.weapons[wname].detuned = false;
      p.overdrive = 0; p.resonance = 0; p.resT = 0;
      p.shoot();
      const bs = g.playerBullets;
      out[wname] = {
        kinds: [...new Set(bs.map(b => b.kind))],
        avgSpeed: Math.round(bs.reduce((s, b) => s + Math.hypot(b.vx, b.vy), 0) / bs.length),
        maxDmg: Math.max(...bs.map(b => b.dmg)),
      };
    }
    return out;
  });
  fail('speed triangle pulse > swarm > prism',
    tri.pulse.avgSpeed > tri.swarm.avgSpeed && tri.swarm.avgSpeed > tri.prism.avgSpeed, tri);
  fail('power triangle prism > swarm > pulse',
    tri.prism.maxDmg > tri.swarm.maxDmg && tri.swarm.maxDmg > tri.pulse.maxDmg, tri);

  const charge = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    for (const k of ['pulse', 'prism', 'swarm']) {
      p.weapons[k].unlocked = true;
      p.weapons[k].charge = 100; p.weapons[k].detuned = false;
    }
    p.selectWeapon('pulse'); p.level = 5; p.weapons.pulse.level = 5;
    p.resonance = 0; p.resT = 0; p.overdrive = 0;
    p.x = SF.W * 0.5; p.y = SF.H * 0.8;
    const dt = 1 / 60;
    let t = 0, detunedAt = null;
    while (t < 30) {
      p.update(dt, g.input);
      for (let j = g.playerBullets.length - 1; j >= 0; j--) if (!g.playerBullets[j].update(dt, p)) g.playerBullets.splice(j, 1);
      if (p.weapons.pulse.detuned && detunedAt === null) detunedAt = +t.toFixed(1);
      t += dt;
    }
    const detunedMul = p.damageMul();
    p.selectWeapon('prism');                        // rested line -> resonance
    const resonanceAfterSwap = p.resonance;
    const swapMul = p.damageMul();
    const pulseBefore = p.weapons.pulse.charge;
    for (let i = 0; i < 60 * 5; i++) p.update(dt, g.input);   // keep firing prism
    const pulseRecovered = Math.round(p.weapons.pulse.charge - pulseBefore);
    p.addDrone('gunner');
    const before = { level: p.level, drones: p.drones.length, charge: Math.round(p.weapons.prism.charge), res: p.resonance };
    const lost = p.applyHitPenalty();
    const after = { level: p.level, drones: p.drones.length, charge: Math.round(p.weapons.prism.charge), res: p.resonance };
    return { detunedAt, detunedMul, resonanceAfterSwap, swapMul, pulseRecovered, before, after, lost };
  });
  fail('sustained fire detunes a line (8-20s) at a softer bite',
    charge.detunedAt > 8 && charge.detunedAt < 20 && Math.abs(charge.detunedMul - 0.55) < 0.01, charge);
  fail('swapping to a charged line stacks resonance',
    charge.resonanceAfterSwap === 1 && charge.swapMul > charge.detunedMul, charge);
  fail('holstered lines refill', charge.pulseRecovered > 40, charge);
  fail('a hit costs charge, resonance and a wingman',
    charge.after.drones === charge.before.drones - 1 && charge.after.res === 0
    && charge.after.charge < charge.before.charge && charge.lost === 'gunner', charge);

  const droneAmmo = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    const out = {};
    p.drones.length = 0;
    ['gunner', 'lance'].forEach(k => p.addDrone(k));
    for (const wname of ['pulse', 'prism', 'swarm']) {
      p.weapons[wname].unlocked = true;
      p.selectWeapon(wname); p.level = 3; p.weapons[wname].level = 3;
      p.weapons[wname].charge = 100; p.weapons[wname].detuned = false;
      g.playerBullets.length = 0;
      p.drones.forEach(d => { d.fireT = 0; });
      for (let i = 0; i < 100; i++) p.update(1 / 60, g.input);
      out[wname] = [...new Set(g.playerBullets.map(b => b.kind))];
    }
    p.drones.length = 0;
    return out;
  });
  fail('wingmen change ammo with the active line',
    droneAmmo.pulse.includes('drone') && droneAmmo.prism.includes('beam') && droneAmmo.swarm.includes('micro'),
    droneAmmo);

  const tints = await page.evaluate(() => {
    const p = __SF.game.player;
    return {
      pulse: SF.WEAPON_LINES.pulse.tint, prism: SF.WEAPON_LINES.prism.tint, swarm: SF.WEAPON_LINES.swarm.tint,
      current: p.line().tint, active: p.activeWeapon,
    };
  });
  fail('each line paints the hull its own colour',
    new Set([tints.pulse, tints.prism, tints.swarm]).size === 3 && tints.current === tints[tints.active], tints);

  const novaEco = await page.evaluate(() => {
    const p = __SF.game.player;
    p.overdrive = 0; p.resonance = 0;
    p.weapons.swarm.charge = 0; p.weapons.swarm.detuned = true;
    p.selectWeapon('swarm');
    p.nova = 0; p.addNova(10);
    const detunedGain = p.nova;
    p.weapons.swarm.charge = 100; p.weapons.swarm.detuned = false;
    p.nova = 0; p.addNova(10);
    return { detunedGain, healthyGain: p.nova };
  });
  fail('a detuned line feeds nova slower', novaEco.detunedGain < novaEco.healthyGain * 0.6, novaEco);

  const regen = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    p.overdrive = 0; p.nova = 0; p.invuln = 9999;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 10; i++) p.update(dt, g.input);
    return { after10s: Math.round(p.nova) };
  });
  fail('nova builds up on its own (~1.8/s)', regen.after10s >= 14 && regen.after10s <= 22, regen);

  const tiers = await page.evaluate(() => {
    const mk = (s) => { const b = new SF.Boss(s); return { tier: b.tier, spd: Math.round(b.bulletSpeed()) }; };
    return { s1: mk(1), s5: mk(5), s6: mk(6), s10: mk(10), s11: mk(11) };
  });
  fail('intensity ramps in 5-sector tiers',
    tiers.s1.tier === 0 && tiers.s5.tier === 0 && tiers.s6.tier === 1 && tiers.s10.tier === 1 && tiers.s11.tier === 2
    && tiers.s1.spd === tiers.s5.spd && tiers.s6.spd > tiers.s5.spd, tiers);

  const hitNova = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    g.godMode = false;
    p.nova = 0; p.overdrive = 0;
    p.invuln = 0; p.dashT = 0; p.shieldCharges = 0; p.reflectT = 0;
    g.playerHit();
    const hullGain = Math.round(p.nova);
    p.nova = 0; p.overdrive = 0; p.invuln = 0; p.dashT = 0;
    p.shieldCharges = 1; p.reflectT = 0;
    g.playerHit();
    const shieldGain = Math.round(p.nova);
    g.godMode = true;
    p.shieldCharges = 0;
    p.invuln = 9999;
    return { hullGain, shieldGain, lives: g.lives };
  });
  fail('taking damage feeds the star core (hull > shield > 0)',
    hitNova.hullGain >= 20 && hitNova.shieldGain >= 5 && hitNova.shieldGain < hitNova.hullGain, hitNova);

  const hud = await page.evaluate(() => {
    const btn = document.getElementById('btnNova');
    const chip = document.getElementById('weaponChip');
    const strip = document.getElementById('hudBottom');
    const r = btn ? btn.getBoundingClientRect() : null;
    return {
      hasStrip: !!strip, hasRingBtn: !!btn, hasChip: !!chip,
      ringConic: btn ? getComputedStyle(btn, '::before').backgroundImage.includes('conic-gradient') : false,
      novaPctVar: btn ? btn.style.getPropertyValue('--pct') : null,
      legacyGone: !document.getElementById('touchActions') && !document.querySelector('.nova-track'),
      ringBottomGap: r ? Math.round(innerHeight - r.bottom) : null,
      stripH: strip ? Math.round(strip.getBoundingClientRect().height) : null,
    };
  });
  fail('nova charges on the ring itself, legacy cards gone',
    hud.hasRingBtn && hud.ringConic && hud.legacyGone && hud.hasChip, hud);

  const clampY = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    p.y = SF.H - 10;
    p.update(1 / 60, g.input);
    return {
      maxY: Math.round(p.y),
      floor: SF.H - 104,
      stripH: Math.round(document.getElementById('hudBottom').getBoundingClientRect().height),
    };
  });
  fail('the hull stays clear of the instrument strip',
    clampY.maxY <= clampY.floor + 2 && clampY.stripH <= 70, clampY);

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
        p.resonance = 0; p.resT = 0;
        for (const k of ['pulse', 'prism', 'swarm']) { p.weapons[k].charge = 100; p.weapons[k].detuned = false; }
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
      let lasers = 0, fired = 0, firedAt = null;
      const seen = new Set();
      const eBefore = g.enemies.length;
      for (let i = 0; i < 240; i++) {
        g.boss.update(dt);
        for (let j = g.enemyBullets.length - 1; j >= 0; j--) {
          const b = g.enemyBullets[j];
          if (!seen.has(b)) { seen.add(b); fired++; if (firedAt === null) firedAt = i; }
          if (!b.update(dt, g.player)) g.enemyBullets.splice(j, 1);
        }
        for (let j = g.enemies.length - 1; j >= 0; j--) if (!g.enemies[j].update(dt, g.player)) g.enemies.splice(j, 1);
        for (const l of g.lasers) lasers = Math.max(lasers, g.lasers.length);
        for (let j = g.lasers.length - 1; j >= 0; j--) if (!g.lasers[j].update(dt)) g.lasers.splice(j, 1);
      }
      const kinds = {};
      for (const b of g.enemyBullets) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
      const spawned = Math.max(0, g.enemies.length - eBefore);
      const out = {
        spell: n, label: SF.ATTACK_LABELS[n], fired, firedAt, live: g.enemyBullets.length,
        kinds, lasers, spawned,
        state: { attack: g.boss.attack && g.boss.attack.name, phase: g.boss.phase, entering: g.boss.entering, dying: g.boss.dying },
      };
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
          // rotate lines the way the charge economy demands
          const cur = p.weapons[p.activeWeapon];
          if (cur.detuned || cur.charge < 22) {
            let best = null;
            for (const k of p.unlockedWeapons()) {
              if (k !== p.activeWeapon && p.weapons[k].charge > 55 && (!p.weapons[k].detuned)) {
                if (!best || p.weapons[k].charge > p.weapons[best].charge) best = k;
              }
            }
            if (best) p.selectWeapon(best);
          }
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
  const mid = await fightRun('S3 mid, 3 lines L3 + 2 wingmen', { sector: 3, weapon: 'pulse', levels: { pulse: 3, prism: 3, swarm: 3 }, drones: ['gunner', 'lance'] });
  const maxed = await fightRun('S5 maxed + 3 wingmen', { sector: 5, weapon: 'prism', levels: { pulse: 5, prism: 5, swarm: 5 }, drones: ['gunner', 'lance', 'aegis'] });
  fail('rookie sees all 3 phases in 15-60s', fresh.kills && fresh.seconds > 15 && fresh.seconds < 60 && fresh.phaseReached >= 3, fresh);
  fail('mid build fight is 20-65s', mid.kills && mid.seconds > 20 && mid.seconds < 65 && mid.phaseReached >= 3, mid);
  fail('maxed build fight is 20-60s', maxed.kills && maxed.seconds > 20 && maxed.seconds < 60 && maxed.phaseReached >= 3, maxed);

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

  /* ---------- 9. precise mode, graze economy, clear bonus, result card ---------- */
  const precise = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    delete p.shoot;                       // earlier rigs stubbed it out
    p.x = SF.W * 0.5; p.y = SF.H * 0.8;
    p.weapons.pulse.unlocked = true; p.selectWeapon('pulse');
    p.level = 5; p.weapons.pulse.level = 5;
    p.weapons.pulse.charge = 100; p.weapons.pulse.detuned = false;
    p.overdrive = 0; p.resonance = 0; p.invuln = 9999;
    const spread = () => {
      g.playerBullets.length = 0;
      p.shoot();
      return Math.round(Math.max(...g.playerBullets.map((b) => Math.abs(b.x - p.x))));
    };
    p.focus = false;
    const wide = spread();
    p.focus = true;
    const tight = spread();
    p.focus = false;
    g.playerBullets.length = 0;
    return { wide, tight };
  });
  fail('precise mode tightens the pattern', precise.tight > 0 && precise.tight < precise.wide * 0.6, precise);

  const graze = await page.evaluate(() => {
    const g = __SF.game, p = g.player;
    p.x = SF.W * 0.5; p.y = SF.H * 0.6;
    p.invuln = 0; p.dashT = 0;
    g.grazes = 0; g.score = 0;
    g.enemyBullets.length = 0;
    g.enemyBullets.push(new SF.Bullet(p.x + 16, p.y, 0, 0, { kind: 'orb', r: 5, life: 4 }));
    const before = g.grazes;
    g.collide();
    if (g.uiReady) g.ui.update(g);
    return {
      gained: g.grazes - before,
      hud: document.getElementById('hudGraze').textContent,
      score: g.score,
    };
  });
  fail('grazing counts on the HUD and pays score', graze.gained === 1 && graze.hud === '1' && graze.score >= 4, graze);

  const clear = await page.evaluate(() => {
    const g = __SF.game;
    g.sector = 2; g.score = 0;
    g.sectorHits = 0; g.sectorGrazes = 40;
    g.sectorStartTime = g.runTime - 30;
    g.pickups.length = 0;
    g.onBossDefeated({ x: SF.W * 0.5, y: SF.H * 0.3, def: { color: '#fff' } });
    const el = document.getElementById('announce');
    return {
      gained: g.score,
      title: document.getElementById('announceTitle').textContent,
      sub: document.getElementById('announceSub').textContent,
      bottom: el.classList.contains('is-bottom'),
    };
  });
  fail('sector clear pays time/clean/graze bonuses in a bottom banner',
    clear.gained > 9000 && clear.title === 'SECTOR CLEAR' && clear.sub.includes('无伤')
    && clear.sub.includes('擦弹') && clear.bottom, clear);

  const result = await page.evaluate(() => {
    const g = __SF.game;
    g.grazes = 123; g.novasFired = 2; g.hitsTaken = 1;
    g.player.weapons.prism.unlocked = true;
    g.player.drones.length = 0;
    g.player.addDrone('lance');
    g.gameOver();
    const q = (id) => document.getElementById(id);
    return {
      graze: q('finalGraze').textContent,
      novas: q('finalNovas').textContent,
      hits: q('finalHits').textContent,
      mult: q('finalMult').textContent,
      rank: document.querySelector('#resultRank b').textContent,
      rule: q('rankRule').textContent,
      build: q('resultBuild').textContent,
      overflow: document.documentElement.scrollHeight > innerHeight + 1,
    };
  });
  fail('result card shows graze/nova/hits/rank/build',
    result.graze === '123' && result.novas === '2' && result.hits === '1' && result.mult.startsWith('×')
    && ['S', 'A', 'B', 'C'].includes(result.rank) && result.rule.length > 4
    && result.build.includes('脉冲') && result.build.includes('僚机') && !result.overflow, result);

  console.log('\nERRORS', errors.length, errors.slice(0, 6).join('\n---\n'));
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
