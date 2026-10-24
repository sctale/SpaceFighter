/* ============================================================
   entities.js — player, bullets, enemies, bosses, pickups, fx
   ============================================================ */
(function () {
  'use strict';
  const SF = window.SF;
  const P = SF.PALETTE;
  const TAU = SF.TAU;
  const clamp = SF.clamp;

  const spriteFor = {
    bolt: 'bolt', drone: 'droneBolt', orb: 'orb', shard: 'shard', heavy: 'heavy', homing: 'homing',
    needle: 'needle', mine: 'mine', wave: 'wave', plasma: 'plasma',
    lance: 'lance', micro: 'micro', beam: 'beam',
  };

  /* ---------------- Bullet ---------------- */
  class Bullet {
    constructor(x, y, vx, vy, opts) {
      opts = opts || {};
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.kind = opts.kind || 'orb';
      this.friendly = !!opts.friendly;
      this.r = opts.r || (this.kind === 'heavy' ? 10 : this.kind === 'bolt' ? 5 : 6);
      this.dmg = opts.dmg || 1;
      this.life = opts.life || 8;
      this.maxLife = this.life;
      this.grazed = false;
      this.age = 0;
      this.angle = Math.atan2(vy, vx) + Math.PI / 2;
      this.spin = opts.spin || 0;
      this.seed = Math.random() * TAU;
      this.dead = false;
      this.homing = opts.homing || 0;
      this.turn = opts.turn || 2.4;
      this.scale = opts.scale || 1;
      this.pierce = opts.pierce || 0;
      this.hitSet = this.pierce > 0 ? new Set() : null;
      this.fuse = opts.fuse || 0;
      this.split = opts.split || 0;
      this.wave = opts.wave || 0;
      this.burstKind = opts.burstKind || 'shard';
      this.mineArmed = false;
      this.trailT = 0;
    }

    findFriendlyTarget() {
      const g = SF.Game;
      if (!g) return null;
      let best = null, bd = 1e9;
      if (g.boss && !g.boss.entering && !g.boss.dying) {
        const d = (g.boss.x - this.x) ** 2 + (g.boss.y - this.y) ** 2;
        if (d < bd) { bd = d; best = g.boss; }
      }
      for (const e of g.enemies) {
        if (e.dead) continue;
        const d = (e.x - this.x) ** 2 + (e.y - this.y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    burst() {
      if (this.friendly) return;
      if (this.kind === 'mine') {
        const n = this.split || 10;
        const sp = 128 + (SF.Game ? SF.Game.sector * 2 : 0);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + this.seed * 0.3;
          SF.Game.enemyBullets.push(new Bullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, {
            kind: 'shard', r: 5, life: 7, scale: 0.85,
          }));
        }
        SF.Game.fx.ring(this.x, this.y, P.gold, 8, 0.4, 82, 0.75);
        SF.Game.fx.spark(this.x, this.y, P.gold, 6, 110, 0.3);
        SF.Audio.sfx('hit');
      } else if (this.kind === 'plasma') {
        const n = this.split || 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + this.seed;
          SF.Game.enemyBullets.push(new Bullet(this.x, this.y, Math.cos(a) * 105, Math.sin(a) * 105, {
            kind: 'orb', r: 6, life: 7,
          }));
        }
        SF.Game.fx.ring(this.x, this.y, P.violet, 10, 0.45, 90, 0.7);
      }
    }

    update(dt, player) {
      this.age += dt;
      if (this.fuse > 0) {
        this.fuse -= dt;
        if (this.fuse <= 0) { this.burst(); return false; }
      }
      this.life -= dt;
      if (this.life <= 0) {
        if (this.kind === 'plasma') this.burst();
        return false;
      }

      if (this.kind === 'mine') {
        this.vx *= Math.exp(-3.8 * dt);
        this.vy *= Math.exp(-3.8 * dt);
        if (!this.mineArmed && this.fuse < 0.9) {
          this.mineArmed = true;
          if (SF.Game) SF.Game.fx.ring(this.x, this.y, P.gold, 4, 0.25, 34, 0.6);
        }
      } else if (this.wave) {
        const spd = Math.hypot(this.vx, this.vy);
        const cur = Math.atan2(this.vy, this.vx);
        const na = cur + Math.sin(this.age * 7.2 + this.seed) * this.wave * dt;
        this.vx = Math.cos(na) * spd;
        this.vy = Math.sin(na) * spd;
      }

      if (this.homing > 0) {
        let tx = null, ty = null;
        if (this.friendly) {
          const t = this.findFriendlyTarget();
          if (t) { tx = t.x; ty = t.y; }
        } else if (player && player.alive) {
          tx = player.x; ty = player.y;
        }
        if (tx !== null) {
          this.homing -= dt;
          const target = Math.atan2(ty - this.y, tx - this.x);
          const cur = Math.atan2(this.vy, this.vx);
          let diff = ((target - cur + Math.PI * 3) % TAU) - Math.PI;
          const maxTurn = this.turn * dt;
          diff = clamp(diff, -maxTurn, maxTurn);
          const speed = Math.hypot(this.vx, this.vy);
          const na = cur + diff;
          this.vx = Math.cos(na) * speed;
          this.vy = Math.sin(na) * speed;
        }
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.angle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
      if (this.kind === 'bolt' || this.kind === 'drone' || this.kind === 'lance' || this.kind === 'beam') {
        this.angle = 0;
      }

      this.trailT -= dt;
      if (this.trailT <= 0 && SF.Game && !SF.Game.settings.lowFx) {
        const special = this.kind === 'needle' || this.kind === 'wave' || this.kind === 'plasma'
          || this.kind === 'lance' || this.kind === 'micro' || this.kind === 'beam';
        if (special) {
          this.trailT = this.kind === 'plasma' ? 0.055 : 0.026;
          const col = this.friendly
            ? (this.kind === 'lance' ? P.teal : this.kind === 'beam' ? P.rose : P.gold)
            : (this.kind === 'wave' ? P.violet : this.kind === 'plasma' ? P.violet : P.white);
          SF.Game.fx.ember(
            this.x, this.y, col,
            this.kind === 'plasma' ? 3 : 1.4,
            this.kind === 'plasma' ? 0.34 : 0.17,
            -this.vx * 0.012, -this.vy * 0.012
          );
        }
      }

      const m = 70;
      return this.x > -m && this.x < SF.W + m && this.y > -m && this.y < SF.H + m;
    }

    draw(ctx) {
      const spr = SF.Art.sprites[spriteFor[this.kind] || 'orb'];
      if (!spr) return;
      let a = 0;
      if (this.kind === 'shard' || this.kind === 'needle' || this.kind === 'wave' || this.kind === 'micro') {
        a = this.angle;
      }
      let sc = this.scale;
      if (this.kind === 'mine') sc *= 1 + Math.sin(this.age * 9) * 0.08 + (this.mineArmed ? 0.1 : 0);
      if (this.kind === 'plasma') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        SF.Art.drawGlow(ctx, this.x, this.y, 30 * sc, P.violet, 0.18);
        ctx.restore();
      }
      SF.Art.drawSprite(ctx, spr, this.x, this.y, a, sc);
    }
  }
  SF.Bullet = Bullet;

  /* ---------------- Particle ---------------- */
  class Particle {
    constructor(x, y, opts) {
      opts = opts || {};
      this.x = x; this.y = y;
      this.vx = opts.vx || 0;
      this.vy = opts.vy || 0;
      this.life = opts.life || 0.6;
      this.maxLife = this.life;
      this.size = opts.size || 3;
      this.grow = opts.grow || 0;
      this.color = opts.color || P.teal;
      this.kind = opts.kind || 'ember';
      this.drag = opts.drag === undefined ? 1.6 : opts.drag;
      this.gravity = opts.gravity || 0;
      this.alpha = opts.alpha === undefined ? 1 : opts.alpha;
      this.rot = Math.random() * TAU;
      this.streak = opts.streak || 1;
    }

    update(dt) {
      this.life -= dt;
      if (this.life <= 0) return false;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= Math.exp(-this.drag * dt);
      this.vy *= Math.exp(-this.drag * dt);
      this.vy += this.gravity * dt;
      this.size += this.grow * dt;
      return true;
    }

    draw(ctx) {
      const t = Math.max(0, this.life / this.maxLife);
      const alpha = this.alpha * (this.kind === 'smoke' ? t * 0.55 : t);
      ctx.globalAlpha = alpha;
      if (this.kind === 'flash') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        SF.Art.drawGlow(ctx, this.x, this.y, this.size, this.color, alpha);
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(1.4, this.size * 0.12), 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (this.kind === 'ring') {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.6 * t + 0.4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, TAU);
        ctx.stroke();
      } else if (this.kind === 'spark') {
        const speed = Math.hypot(this.vx, this.vy) || 1;
        const nx = this.vx / speed, ny = this.vy / speed;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(0.6, this.size * 0.35) * (0.4 + t * 0.8);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - nx * this.size * this.streak, this.y - ny * this.size * this.streak);
        ctx.stroke();
      } else if (this.kind === 'smoke') {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (0.35 + t * 0.65), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  SF.Particle = Particle;

  /* ---------------- Floating text ---------------- */
  class FloatText {
    constructor(x, y, text, opts) {
      opts = opts || {};
      this.x = x; this.y = y;
      this.text = text;
      this.color = opts.color || P.gold;
      this.size = opts.size || 12;
      this.life = opts.life || 0.8;
      this.maxLife = this.life;
      this.vy = opts.vy === undefined ? -46 : opts.vy;
      this.vx = opts.vx || 0;
      this.drift = opts.drift || 0;
      this.outline = opts.outline || 'rgba(4,6,15,.7)';
      this.weight = opts.weight || 600;
    }
    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy *= Math.exp(-2.4 * dt);
      if (this.drift) this.x += Math.sin(this.life * 12) * this.drift * dt;
      return this.life > 0;
    }
    draw(ctx) {
      const t = clamp(this.life / this.maxLife, 0, 1);
      const alpha = t > 0.72 ? (1 - t) / 0.28 : t / 0.72;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.font = `${this.weight} ${this.size}px "Cascadia Code", "SF Mono", Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.outline;
      ctx.fillText(this.text, this.x + 1, this.y + 1);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
      ctx.globalAlpha = 1;
    }
  }
  SF.FloatText = FloatText;

  /* ---------------- Player ---------------- */
  class Player {
    constructor() {
      this.x = SF.W / 2;
      this.y = SF.H - 130;
      this.w = 46; this.h = 54;
      this.alive = true;
      this.level = 2;
      this.shieldCharges = 1;
      this.reflectT = 0;
      this.drones = [];
      this.droneAngle = 0;
      this.weaponMode = 'pulse';
      this.weaponTimer = 0;
      this.fireTimer = 0;
      this.invuln = 1.6;
      this.bank = 0;
      this.t = 0;
      this.nova = 0;
      this.overdrive = 0;
      this.dashT = 0;
      this.dashCd = 0;
      this.dashDirX = 0;
      this.dashDirY = -1;
      this.dragging = false;
      this.dragDX = 0;
      this.dragDY = 0;
      this.lastMX = 0; this.lastMY = 0;
      this.after = [];
      this.muzzle = 0;
      this.hitFlash = 0;
      this.trailTimer = 0;
    }

    reset() {
      this.x = SF.W / 2;
      this.y = SF.H - 130;
      this.alive = true;
      this.level = 2;
      this.shieldCharges = 1;
      this.reflectT = 0;
      this.drones = [];
      this.droneAngle = 0;
      this.weaponMode = 'pulse';
      this.weaponTimer = 0;
      this.fireTimer = 0;
      this.invuln = 1.8;
      this.nova = 0;
      this.overdrive = 0;
      this.dashT = 0;
      this.dashCd = 0;
      this.dragging = false;
      this.after.length = 0;
      this.bank = 0;
    }

    get hitR() { return 4.6; }
    get grazeR() { return 28; }

    grantInvuln(s) { this.invuln = Math.max(this.invuln, s); }

    addNova(v) {
      if (this.overdrive > 0) return;
      this.nova = clamp(this.nova + v, 0, 100);
    }

    addPower() {
      if (this.level < 5) { this.level++; return true; }
      return false;
    }

    addDrone(kind) {
      if (this.drones.length >= 3) return null;
      const kinds = ['gunner', 'lance', 'aegis', 'swarm'];
      const have = this.drones.map((d) => d.kind);
      const pool = kinds.filter((k) => !have.includes(k));
      const type = kind && kinds.includes(kind) ? kind : (pool.length ? SF.pick(pool) : SF.pick(kinds));
      this.drones.push({ kind: type, x: this.x, y: this.y, angle: 0, fireT: SF.rand(0.15, 0.5), pdT: 0 });
      return type;
    }

    addShield(n) {
      const before = this.shieldCharges;
      this.shieldCharges = Math.min(3, this.shieldCharges + (n || 1));
      return this.shieldCharges > before;
    }

    setWeapon(mode, seconds) {
      this.weaponMode = mode;
      this.weaponTimer = seconds || 24;
      this.fireTimer = Math.min(this.fireTimer, 0.06);
    }

    tryDash() {
      if (this.dashCd > 0 || !this.alive) return false;
      let dx = this.lastMX, dy = this.lastMY;
      if (Math.abs(dx) + Math.abs(dy) < 0.01) {
        dx = this.x - (SF.W / 2);
        dy = -1;
        if (Math.abs(dx) < 1) dx = 0;
      }
      const len = Math.hypot(dx, dy) || 1;
      this.dashDirX = dx / len;
      this.dashDirY = dy / len;
      this.dashT = 0.17;
      this.dashCd = 1.7;
      this.invuln = Math.max(this.invuln, 0.36);
      this.after = [];
      SF.Audio.sfx('dash');
      SF.Game.fx.ring(this.x, this.y, P.teal, 12, 0.35, 70);
      SF.Game.fx.rays(this.x, this.y, P.teal, 12, 330, 0.24);
      SF.Game.fx.spark(this.x, this.y, P.teal, 8, 120);
      SF.Game.fx.shake(3);
      return true;
    }

    fireNova() {
      if (this.nova < 100 || this.overdrive > 0 || !this.alive) return false;
      this.nova = 0;
      this.overdrive = 7;
      this.grantInvuln(0.9);
      SF.Game.novaBlast();
      return true;
    }

    takeHit() {
      if (!this.alive || this.invuln > 0 || this.dashT > 0) return false;
      SF.Game.playerHit();
      return true;
    }

    update(dt, input) {
      this.t += dt;
      this.muzzle = Math.max(0, this.muzzle - dt);
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      if (this.invuln > 0) this.invuln -= dt;
      if (this.overdrive > 0) {
        this.overdrive -= dt;
        if (this.overdrive <= 0) {
          this.overdrive = 0;
        }
      }
      if (this.dashCd > 0) this.dashCd = Math.max(0, this.dashCd - dt);
      if (this.dashT > 0) this.dashT -= dt;
      if (this.weaponTimer > 0) {
        this.weaponTimer = Math.max(0, this.weaponTimer - dt);
        if (this.weaponTimer === 0 && this.weaponMode !== 'pulse') {
          this.weaponMode = 'pulse';
          if (SF.Game.playerWeaponExpired) SF.Game.playerWeaponExpired();
        }
      }
      if (this.reflectT > 0) this.reflectT = Math.max(0, this.reflectT - dt);

      const mv = input.moveVector();
      const focus = input.focusHeld();
      const speed = focus ? 185 : 440;
      let movedX = 0, movedY = 0;
      const px = this.x, py = this.y;
      if (mv.active) {
        this.dragging = false;
        this.x += mv.x * speed * dt;
        this.y += mv.y * speed * dt;
        movedX = mv.x; movedY = mv.y;
        this.lastMX = mv.x; this.lastMY = mv.y;
      } else {
        const pt = input.pointer;
        if (pt.type === 'mouse' && pt.inside) {
          this.dragging = false;
          const tx = pt.x, ty = pt.y;
          const k = 1 - Math.exp(-26 * dt);
          this.x += (tx - this.x) * k;
          this.y += (ty - this.y) * k;
        } else if (pt.down && pt.type !== 'mouse') {
          if (!this.dragging) {
            this.dragging = true;
            this.dragDX = this.x - pt.x;
            this.dragDY = this.y - pt.y;
            // keep drag offset within a comfortable range so the ship never hides under the thumb
            this.dragDX = clamp(this.dragDX, -SF.W * 0.3, SF.W * 0.3);
            this.dragDY = clamp(this.dragDY, -140, 60);
          }
          const tx = clamp(pt.x + this.dragDX, 0, SF.W);
          const ty = clamp(pt.y + this.dragDY, 0, SF.H);
          const k = 1 - Math.exp(-30 * dt);
          this.x += (tx - this.x) * k;
          this.y += (ty - this.y) * k;
        } else if (!pt.down) {
          this.dragging = false;
        }
      }

      if (this.dashT > 0) {
        const k = this.dashT / 0.17;
        this.x += this.dashDirX * 1250 * dt;
        this.y += this.dashDirY * 1250 * dt;
        this.lastMX = this.dashDirX; this.lastMY = this.dashDirY;
        if (this.after.length < 7) {
          this.after.push({ x: this.x, y: this.y, bank: this.bank, life: 0.3 });
        }
        this.fireTimer = Math.min(this.fireTimer, 0.02);
      }

      this.x = clamp(this.x, 31, SF.W - 31);
      this.y = clamp(this.y, SF.H * 0.18, SF.H - 44);

      const movedDX = this.x - px;
      const movedDY = this.y - py;
      if (Math.abs(movedDX) + Math.abs(movedDY) > 0.5) {
        this.lastMX = movedDX;
        this.lastMY = movedDY;
      }
      this.bank = SF.damp(this.bank, clamp(movedDX / 6, -1, 1), 8, dt);

      if (this.after.length) {
        for (let i = this.after.length - 1; i >= 0; i--) {
          this.after[i].life -= dt;
          if (this.after[i].life <= 0) this.after.splice(i, 1);
        }
      }

      // engine trail
      this.trailTimer -= dt;
      if (this.trailTimer <= 0 && this.alive) {
        this.trailTimer = 0.045;
        const col = this.overdrive > 0 ? P.gold : P.teal;
        SF.Game.fx.ember(this.x + SF.rand(-9, 9), this.y + 30, col, SF.rand(1, 2.4), SF.rand(0.2, 0.4), SF.rand(10, 40), SF.rand(-40, -10));
      }

      // input actions
      if (input.consume('dash')) this.tryDash();
      if (input.consume('nova')) this.fireNova();

      // autofire
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && this.alive) {
        this.shoot();
        const od = this.overdrive > 0;
        let rate;
        if (this.weaponMode === 'prism') rate = od ? 0.12 : 0.17;
        else if (this.weaponMode === 'swarm') rate = od ? 0.085 : 0.135;
        else rate = od ? 0.07 : 0.1;
        this.fireTimer = rate;
      }

      // escort drones
      this.droneAngle += dt * 1.6;
      for (let i = 0; i < this.drones.length; i++) {
        const d = this.drones[i];
        const ang = this.droneAngle + (i / this.drones.length) * TAU;
        d.angle = ang + Math.PI / 2;
        d.x = this.x + Math.cos(ang) * 41;
        d.y = this.y + 8 + Math.sin(ang) * 24;
        d.pdT = Math.max(0, d.pdT - dt);
        d.fireT -= dt;
        if (d.fireT > 0) continue;

        if (d.kind === 'gunner') {
          d.fireT = 0.5;
          SF.Game.playerBullets.push(new Bullet(d.x, d.y - 6, 0, -780, {
            friendly: true, kind: 'drone', r: 4, dmg: 1, life: 2,
          }));
        } else if (d.kind === 'lance') {
          d.fireT = 0.95;
          SF.Game.playerBullets.push(new Bullet(d.x, d.y - 8, 0, -1020, {
            friendly: true, kind: 'beam', r: 5, dmg: 3, life: 2, pierce: 1,
          }));
        } else if (d.kind === 'swarm') {
          d.fireT = 1.2;
          for (const dir of [-1, 1]) {
            SF.Game.playerBullets.push(new Bullet(d.x, d.y - 5, dir * 75, -610, {
              friendly: true, kind: 'micro', r: 4, dmg: 1, life: 2.1,
              homing: 1.8, turn: 4.8,
            }));
          }
        } else if (d.kind === 'aegis') {
          d.fireT = 0.7;
          SF.Game.fx.ring(d.x, d.y, P.violet, 3, 0.28, 32, 0.5);
        }
        if (d.kind !== 'aegis') SF.Game.fx.spark(d.x, d.y - 8, d.kind === 'lance' ? P.rose : d.kind === 'swarm' ? P.gold : P.teal, 2, 44, 0.16);
      }

      // overdrive ready pulse
      if (this.nova >= 100 && Math.random() < dt * 8) {
        SF.Game.fx.ember(this.x + SF.rand(-26, 26), this.y + SF.rand(-20, 26), P.gold, SF.rand(1, 2), 0.5, 8, -20);
      }
    }

    shoot() {
      const lv = this.level;
      const od = this.overdrive > 0;
      const dmg = od ? 2 : 1;
      const speed = -880;
      const bx = this.x, by = this.y - 26;
      const mode = this.weaponMode;
      const fire = (x, y, vx, vy, opts) => {
        opts = opts || {};
        SF.Game.playerBullets.push(new Bullet(x, y, vx, vy, {
          friendly: true,
          kind: opts.kind || 'bolt',
          r: opts.r || 5,
          dmg: opts.dmg === undefined ? dmg : opts.dmg,
          life: opts.life || 2.2,
          pierce: opts.pierce || 0,
          homing: opts.homing || 0,
          turn: opts.turn || 2.4,
          scale: opts.scale || 1,
        }));
      };

      if (mode === 'prism') {
        // piercing star-lances: fewer bullets, much higher per-hit damage
        const pd = od ? 5 : 3;
        fire(bx - 7, by, 0, -1180, { kind: 'lance', r: 7, dmg: pd, pierce: 2, life: 2 });
        fire(bx + 7, by, 0, -1180, { kind: 'lance', r: 7, dmg: pd, pierce: 2, life: 2 });
        if (lv >= 4) fire(bx, by - 6, 0, -1260, { kind: 'lance', r: 9, dmg: pd + 2, pierce: 3, life: 2 });
        if (lv >= 5) {
          fire(bx - 17, by + 4, -150, -1110, { kind: 'lance', r: 6, dmg: pd, pierce: 1, life: 2 });
          fire(bx + 17, by + 4, 150, -1110, { kind: 'lance', r: 6, dmg: pd, pierce: 1, life: 2 });
        }
      } else if (mode === 'swarm') {
        // homing micro-missiles that seek the nearest target
        const n = lv >= 4 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2);
          fire(bx + off * 7, by + 4, off * 105, -640, {
            kind: 'micro', r: 4, dmg: od ? 2 : (lv >= 4 ? 2 : 1), homing: 2.2, turn: 5.0, life: 2.4,
          });
        }
        if (od) {
          for (const dir of [-1, 1]) {
            fire(bx + dir * 22, by + 8, dir * 180, -560, {
              kind: 'micro', r: 4, dmg: 2, homing: 2.2, turn: 5.0, life: 2.4,
            });
          }
        }
      } else {
        if (lv === 1) {
          fire(bx, by, 0, speed);
        } else if (lv === 2) {
          fire(bx - 7, by, 0, speed);
          fire(bx + 7, by, 0, speed);
        } else if (lv === 3) {
          fire(bx, by - 4, 0, speed);
          fire(bx - 9, by + 4, -40, speed);
          fire(bx + 9, by + 4, 40, speed);
        } else if (lv === 4) {
          fire(bx - 6, by - 2, 0, speed);
          fire(bx + 6, by - 2, 0, speed);
          fire(bx - 14, by + 4, -95, speed);
          fire(bx + 14, by + 4, 95, speed);
        } else {
          fire(bx, by - 6, 0, speed, { kind: 'bolt', r: 6, dmg: dmg + 1 });
          fire(bx - 8, by + 2, 0, speed);
          fire(bx + 8, by + 2, 0, speed);
          fire(bx - 16, by + 6, -125, speed);
          fire(bx + 16, by + 6, 125, speed);
        }
        if (od) {
          fire(bx - 22, by + 10, -190, speed * 0.94);
          fire(bx + 22, by + 10, 190, speed * 0.94);
        }
      }

      this.muzzle = 0.06;
      const mc = mode === 'prism' ? P.rose : mode === 'swarm' ? P.gold : od ? P.gold : P.teal;
      SF.Game.fx.spark(bx, by, mc, od ? 3 : 2, 40, 0.14);
      SF.Audio.sfx('shoot');
    }

    draw(ctx) {
      if (!this.alive) return;
      if (this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0) {
        // still draw a ghost to keep feedback
        SF.Art.drawShip(ctx, this.x, this.y, { scale: 1, bank: this.bank, t: this.t, thrust: 0.5, alpha: 0.45 });
      } else {
        // afterimages
        for (const a of this.after) {
          const al = a.life / 0.3;
          SF.Art.drawShip(ctx, a.x, a.y, { scale: 1, bank: a.bank, t: this.t, thrust: 0, alpha: al * 0.22 });
        }
        if (this.overdrive > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          SF.Art.drawGlow(ctx, this.x, this.y, 62, P.gold, 0.14 + Math.sin(this.t * 9) * 0.04);
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.rotate(this.t * 2.4);
          ctx.strokeStyle = 'rgba(255,210,122,.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([8, 12]);
          ctx.beginPath();
          ctx.arc(0, 0, 40, 0, TAU);
          ctx.stroke();
          ctx.restore();
          ctx.restore();
        }
        SF.Art.drawShip(ctx, this.x, this.y, { scale: 1, bank: this.bank, t: this.t, thrust: 1 });
        if (this.muzzle > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          SF.Art.drawGlow(ctx, this.x, this.y - 30, 16, P.gold, 0.6);
          ctx.restore();
        }

        // shield bubble — segmented, one lit arc per remaining charge
        if (this.shieldCharges > 0) {
          const rr = 35 + this.shieldCharges * 2;
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.globalCompositeOperation = 'lighter';
          const bubble = ctx.createRadialGradient(0, 0, rr * 0.5, 0, 0, rr + 4);
          bubble.addColorStop(0, 'rgba(155,140,255,0)');
          bubble.addColorStop(0.72, 'rgba(155,140,255,.09)');
          bubble.addColorStop(1, 'rgba(105,245,220,.22)');
          ctx.fillStyle = bubble;
          ctx.beginPath();
          ctx.arc(0, 0, rr + 4, 0, TAU);
          ctx.fill();
          ctx.rotate(this.t * 1.4);
          ctx.lineWidth = 1.8;
          for (let i = 0; i < 3; i++) {
            const a0 = i * (TAU / 3) + 0.16;
            ctx.strokeStyle = i < this.shieldCharges ? 'rgba(105,245,220,.85)' : 'rgba(155,140,255,.16)';
            ctx.beginPath();
            ctx.arc(0, 0, rr, a0, a0 + 0.72);
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(155,140,255,.32)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, rr, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }

        // prism field — destroys nearby bullets while active
        if (this.reflectT > 0) {
          const pulse = 0.55 + Math.sin(this.t * 8) * 0.16;
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.globalCompositeOperation = 'lighter';
          SF.Art.drawGlow(ctx, 0, 0, 66, P.gold, 0.13 + pulse * 0.08);
          ctx.rotate(-this.t * 2.2);
          ctx.strokeStyle = `rgba(255,210,122,${0.42 + pulse * 0.2})`;
          ctx.lineWidth = 1.4;
          ctx.setLineDash([13, 9]);
          ctx.beginPath();
          ctx.arc(0, 0, 50 + Math.sin(this.t * 4) * 2, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(105,245,220,.5)';
          ctx.rotate(this.t * 3.4);
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, 50, i * (TAU / 4), i * (TAU / 4) + 0.28);
            ctx.stroke();
          }
          ctx.restore();
        }

        // drone escorts
        for (const d of this.drones) {
          if (d.kind === 'aegis') {
            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.globalCompositeOperation = 'lighter';
            SF.Art.drawGlow(ctx, 0, 0, 28, P.violet, 0.2);
            ctx.strokeStyle = 'rgba(155,140,255,.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, 19 + Math.sin(this.t * 5) * 2, 0, TAU);
            ctx.stroke();
            ctx.restore();
          }
          SF.Art.drawDrone(ctx, d.x, d.y, this.t, d.angle, d.kind);
        }

        // hitbox core
        const pulse = 0.6 + Math.sin(this.t * 6) * 0.18;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        SF.Art.drawGlow(ctx, this.x, this.y, 12, P.white, pulse * 0.18);
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(this.x, this.y + 2, 2.2, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      if (this.hitFlash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        SF.Art.drawGlow(ctx, this.x, this.y, 70, P.rose, this.hitFlash * 1.6);
        ctx.restore();
      }
    }
  }
  SF.Player = Player;

  /* ---------------- Enemy types ---------------- */
  const ENEMY_TYPES = {
    drifter: {
      size: 17, hp: 4, score: 100,
      color: '#ff6f91', accent: '#ffd1dc', glow: '#ff6f91',
      pattern: 'sine', fire: 'aimed', fireCd: [1.6, 2.2], speed: 78, amp: 44,
      drop: 0.1,
    },
    wasp: {
      size: 15, hp: 3, score: 150,
      color: '#ff9ab4', accent: '#ffffff', glow: '#ff6f91',
      pattern: 'dive', fire: null, speed: 185, drop: 0.06,
    },
    lancer: {
      size: 23, hp: 15, score: 280,
      color: '#a597ff', accent: '#ffd27a', glow: '#9b8cff',
      pattern: 'hover', fire: 'fan', fireCd: [1.6, 2.1], speed: 55, targetY: 0.23,
      drop: 0.22,
    },
    orbiter: {
      size: 21, hp: 19, score: 340,
      color: '#9b8cff', accent: '#ffd27a', glow: '#9b8cff',
      pattern: 'orbit', fire: 'ring', fireCd: [2.0, 2.7], speed: 50, targetY: 0.27,
      drop: 0.26,
    },
    splitter: {
      size: 20, hp: 11, score: 230,
      color: '#ff6f91', accent: '#ffd27a', glow: '#ff6f91',
      pattern: 'sine', fire: 'spread', fireCd: [1.8, 2.4], speed: 64, amp: 32,
      drop: 0.2,
    },
    bulwark: {
      size: 30, hp: 46, score: 520,
      color: '#c3cbe0', accent: '#ffd27a', glow: '#ffd27a',
      pattern: 'hover', fire: 'heavy', fireCd: [1.8, 2.5], speed: 36, targetY: 0.2,
      drop: 0.4,
    },
    rock: {
      size: 23, hp: 14, score: 70,
      color: '#aab6cc', accent: '#ffffff', glow: '#9b8cff',
      pattern: 'rock', fire: null, speed: 48, drop: 0,
    },
    sniper: {
      size: 22, hp: 20, score: 320,
      color: '#69f5dc', accent: '#ffffff', glow: '#69f5dc',
      pattern: 'hover', fire: 'needle', fireCd: [1.6, 2.1], speed: 58, targetY: 0.17,
      charge: 0.55, drop: 0.24,
    },
    minekeeper: {
      size: 24, hp: 28, score: 380,
      color: '#ffd27a', accent: '#ff6f91', glow: '#ffd27a',
      pattern: 'hover', fire: 'mines', fireCd: [2.4, 3.1], speed: 42, targetY: 0.25,
      charge: 0.3, drop: 0.3,
    },
    sidewinder: {
      size: 21, hp: 17, score: 310,
      color: '#9b8cff', accent: '#ff6f91', glow: '#9b8cff',
      pattern: 'strafe', fire: 'wavefire', fireCd: [1.25, 1.75], speed: 135, targetY: 0.33,
      drop: 0.22,
    },
    carrier: {
      size: 34, hp: 78, score: 680,
      color: '#8fa4c9', accent: '#ffd27a', glow: '#9b8cff',
      pattern: 'hover', fire: 'carrier', fireCd: [2.0, 2.6], speed: 32, targetY: 0.13,
      drop: 0.55,
    },
    shardling: {
      size: 13, hp: 5, score: 90,
      color: '#ff9ab4', accent: '#ffffff', glow: '#ff6f91',
      pattern: 'dive', fire: null, speed: 215, drop: 0.03,
    },
  };
  SF.ENEMY_TYPES = ENEMY_TYPES;

  class Enemy {
    constructor(type, x, y, opts) {
      opts = opts || {};
      const def = ENEMY_TYPES[type] || ENEMY_TYPES.drifter;
      this.type = type;
      this.def = def;
      this.elite = !!opts.elite;
      this.sector = opts.sector || 1;
      this.size = def.size * (this.elite ? 1.22 : 1);
      this.maxHp = Math.round(def.hp * (1 + (this.sector - 1) * 0.16) * (this.elite ? 2.4 : 1));
      this.hp = this.maxHp;
      this.score = Math.round(def.score * (this.elite ? 3.2 : 1));
      this.color = this.elite ? P.gold : def.color;
      this.accent = def.accent;
      this.glowColor = this.elite ? P.gold : def.glow;
      this.x = x;
      this.baseX = x;
      this.y = y;
      this.vx = 0;
      this.vy = def.speed || 60;
      this.t = 0;
      this.age = 0;
      this.phase = opts.phase === undefined ? Math.random() * TAU : opts.phase;
      this.flash = 0;
      this.spin = Math.random() * TAU;
      this.seed = Math.random() * 10;
      this.angle = 0;
      this.fireTimer = def.fireCd ? SF.rand(0.9, 1.6) : 99;
      this.dead = false;
      this.leaving = false;
      this.life = opts.life || 16;
      this.drop = opts.drop === undefined ? def.drop : opts.drop;
      this.hoverDir = SF.chance(0.5) ? 1 : -1;
      this.diveTarget = null;
      this.entryDelay = opts.delay || 0.35;
      this.side = opts.side || 0;
      this.targetY = def.targetY ? SF.H * def.targetY : SF.H * 0.24;
      this.amp = def.amp || 40;
      this.rock = type === 'rock';
      this.dir = opts.dir || (x < SF.W / 2 ? 1 : -1);
      this.chargeT = 0;
      this.summonT = SF.rand(2.6, 3.6);
    }

    get radius() { return this.size * 0.78; }

    update(dt, player) {
      this.t += dt;
      this.age += dt;
      this.flash = Math.max(0, this.flash - dt);
      this.spin += dt * 0.4;
      const speedMul = 1 + (this.sector - 1) * 0.035;
      const def = this.def;

      switch (def.pattern) {
        case 'sine':
          this.y += this.vy * speedMul * dt;
          this.x = this.baseX + Math.sin(this.t * 1.5 + this.phase) * this.amp;
          this.angle = Math.sin(this.t * 1.5 + this.phase) * 0.2;
          break;
        case 'dive':
          if (this.age > this.entryDelay) {
            if (!this.diveTarget && player) {
              this.diveTarget = { x: player.x, y: player.y };
              const ang = Math.atan2(this.diveTarget.y - this.y, this.diveTarget.x - this.x);
              this.vx = Math.cos(ang) * this.vy * 1.5;
              this.vy = Math.sin(ang) * this.vy * 1.5;
            }
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.angle = Math.atan2(this.vy, this.vx) - Math.PI / 2;
          } else {
            this.y += 40 * dt;
          }
          break;
        case 'hover': {
          if (this.age > this.life) {
            this.y += 170 * dt;
            this.leaving = true;
          } else if (this.y < this.targetY) {
            this.y = Math.min(this.targetY, this.y + this.vy * dt);
            this.x = this.baseX + Math.sin(this.t * 0.9 + this.phase) * 12;
          } else {
            this.x = this.baseX + Math.sin(this.t * 0.7 + this.phase) * (this.type === 'bulwark' ? 55 : 88) + Math.sin(this.t * 0.23) * 20;
            this.y = this.targetY + Math.sin(this.t * 1.1 + this.phase) * 8;
            this.angle = Math.cos(this.t * 0.7 + this.phase) * 0.15;
          }
          break;
        }
        case 'strafe': {
          if (this.y < this.targetY) {
            this.y = Math.min(this.targetY, this.y + 120 * dt);
          } else {
            this.y = this.targetY + Math.sin(this.t * 1.8 + this.phase) * 16;
            this.x += this.dir * this.vy * speedMul * dt;
            this.angle = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          break;
        }
        case 'orbit': {
          if (this.age > this.life) {
            this.y += 160 * dt;
            this.leaving = true;
          } else if (this.y < this.targetY) {
            this.y = Math.min(this.targetY, this.y + this.vy * dt);
            this.x = this.baseX + Math.sin(this.t * 0.9 + this.phase) * 12;
          } else {
            const r = 62;
            this.x = this.baseX + Math.cos(this.t * 1.15 + this.phase) * r;
            this.y = this.targetY + Math.sin(this.t * 1.15 + this.phase) * 24;
            this.angle = 0;
          }
          break;
        }
        case 'rock':
          this.y += this.vy * speedMul * dt;
          this.x += Math.sin(this.t * 0.6 + this.phase) * 12 * dt;
          this.angle = 0;
          break;
      }

      // carrier launches small escorts from its hangar
      if (this.type === 'carrier' && !this.leaving && this.y > 20 && this.y < SF.H * 0.45) {
        this.summonT -= dt;
        if (this.summonT <= 0) {
          this.summonT = 3.6;
          if (SF.Game.enemies.length < 38) {
            const child = SF.Game.spawnEnemy(SF.chance(0.55) ? 'shardling' : 'wasp',
              clamp(this.x + SF.rand(-this.size, this.size), 30, SF.W - 30),
              this.y + this.size * 0.6, { sector: this.sector });
            if (child) child.entryDelay = 0.15;
            SF.Game.fx.ring(this.x, this.y + this.size * 0.5, P.violet, 5, 0.35, 44, 0.6);
            SF.Audio.sfx('hit');
          }
        }
      }

      // fire
      if (def.fire && !this.leaving && this.y > 20 && this.y < SF.H * 0.8) {
        this.fireTimer -= dt;
        if (this.chargeT > 0) {
          this.chargeT -= dt;
          if (this.chargeT <= 0) {
            this.fire(this.sector);
            const base = def.fireCd;
            this.fireTimer = SF.rand(base[0], base[1]) * Math.max(0.55, 1 - (this.sector - 1) * 0.045) * (this.elite ? 0.82 : 1);
            this.chargeT = 0;
          }
        } else if (this.fireTimer <= 0) {
          if (def.charge) {
            this.chargeT = def.charge * (this.elite ? 0.8 : 1);
            SF.Game.fx.ring(this.x, this.y, this.glowColor, 4, 0.3, this.size * 1.5, 0.7);
          } else {
            this.fire(this.sector);
            const base = def.fireCd;
            this.fireTimer = SF.rand(base[0], base[1]) * Math.max(0.55, 1 - (this.sector - 1) * 0.045) * (this.elite ? 0.82 : 1);
          }
        }
      }

      const m = 90;
      if (this.y > SF.H + m || this.y < -m * 2 || this.x < -m * 1.5 || this.x > SF.W + m * 1.5) return false;
      return true;
    }

    fire(sector) {
      if (!SF.Game.player) return;
      const pl = SF.Game.player;
      const dif = 1 + (sector - 1) * 0.035;
      const sp = Math.min(320, 165 * dif);
      const bx = this.x, by = this.y + this.size * 0.5;
      const aim = Math.atan2(pl.y - this.y, pl.x - this.x);
      const add = (ang, speed, kind, r, scale, extra) => {
        const o = { kind: kind || 'orb', r: r || 6, life: 9, scale: scale || 1 };
        if (extra) Object.assign(o, extra);
        SF.Game.enemyBullets.push(new Bullet(this.x, this.y + this.size * 0.4,
          Math.cos(ang) * speed, Math.sin(ang) * speed, o));
      };
      const fireAim = () => add(aim, sp, 'orb');
      const fireFan = (n, spread) => {
        for (let i = 0; i < n; i++) {
          const a = aim + (i - (n - 1) / 2) * spread;
          add(a, sp * 0.95, 'shard');
        }
      };
      const fireRing = (n, offset) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + offset;
          add(a, sp * 0.72, 'orb');
        }
      };
      const fireHeavy = () => {
        if (this.elite) {
          for (let i = 0; i < 2; i++) {
            const a = aim + (i ? 0.22 : -0.22);
            add(a, sp * 0.42, 'plasma', 13, 1.1, { life: 3.2, split: 6 });
          }
        }
        for (let i = 0; i < 3; i++) {
          const a = aim + (i - 1) * 0.26;
          add(a, sp * 0.55, 'heavy', 10);
        }
      };

      switch (this.def.fire) {
        case 'aimed':
          fireAim();
          if (this.elite) fireFan(3, 0.2);
          break;
        case 'fan':
          fireFan(this.elite ? 5 : 3, 0.18);
          SF.Audio.sfx('hit');
          break;
        case 'ring':
          fireRing(this.elite ? 14 : 10, this.t * 0.5);
          SF.Audio.sfx('hit');
          break;
        case 'spread':
          add(aim - 0.32, sp * 0.8, 'orb');
          add(aim + 0.32, sp * 0.8, 'orb');
          break;
        case 'heavy':
          fireHeavy();
          SF.Audio.sfx('hit');
          break;
        case 'needle': {
          const n = this.elite ? 5 : 3;
          for (let i = 0; i < n; i++) add(aim + (i - (n - 1) / 2) * 0.075, 330, 'needle', 5, 1.2);
          SF.Game.fx.ring(this.x, this.y, this.glowColor, 3, 0.25, this.size * 2.2, 0.6);
          SF.Game.fx.spark(this.x, this.y, P.white, 4, 110, 0.2);
          SF.Audio.sfx('hit');
          break;
        }
        case 'mines': {
          const n = this.elite ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const a = aim + (i - (n - 1) / 2) * 0.55;
            add(a, 105, 'mine', 9, 1.1, { fuse: SF.rand(1.8, 2.4), split: 10, life: 8 });
          }
          SF.Audio.sfx('hit');
          break;
        }
        case 'wavefire':
          add(aim - 0.36, sp * 0.82, 'wave', 7, 1.2, { wave: 2.6 });
          add(aim + 0.36, sp * 0.82, 'wave', 7, 1.2, { wave: 2.6 });
          add(aim, sp * 1.1, 'needle', 5, 1.2);
          SF.Audio.sfx('hit');
          break;
        case 'carrier':
          add(aim - 0.16, sp * 0.6, 'orb', 7);
          add(aim + 0.16, sp * 0.6, 'orb', 7);
          break;
      }
      // muzzle flash
      SF.Game.fx.ember(bx, by, this.glowColor, this.size * 0.4, 0.25, 0, 0);
    }

    hit(dmg, x, y) {
      if (this.dead) return true;
      this.hp -= dmg;
      this.flash = 0.07;
      SF.Audio.sfx('hit');
      SF.Game.fx.impact(x || this.x, y || this.y, this.glowColor, this.size > 25 ? 1.35 : 1);
      if (this.hp <= 0) {
        this.dead = true;
        return true;
      }
      return false;
    }

    draw(ctx, t) {
      if (this.chargeT > 0) {
        const k = clamp(1 - this.chargeT / (this.def.charge || 1), 0, 1);
        const pl = SF.Game.player;
        if (this.type === 'sniper' && pl) {
          ctx.save();
          ctx.strokeStyle = `rgba(105,245,220,${0.1 + k * 0.4})`;
          ctx.lineWidth = 0.8 + k * 1.2;
          ctx.setLineDash([5, 6]);
          ctx.beginPath();
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(pl.x, pl.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          SF.Art.drawGlow(ctx, this.x, this.y, this.size * (1.2 + k * 0.8), this.glowColor, 0.2 + k * 0.25);
          ctx.restore();
        }
      }
      SF.Art.drawEnemy(ctx, this, t);
      const showBar = this.elite || this.type === 'bulwark' || this.type === 'carrier';
      if (showBar && this.hp < this.maxHp) {
        const w = Math.max(24, this.size * 1.25);
        const y = this.y - this.size - 13;
        const ratio = clamp(this.hp / this.maxHp, 0, 1);
        ctx.save();
        ctx.fillStyle = 'rgba(4,6,15,.58)';
        ctx.fillRect(this.x - w / 2 - 1, y - 1, w + 2, 4);
        ctx.fillStyle = this.elite ? P.gold : P.rose;
        ctx.fillRect(this.x - w / 2, y, w * ratio, 2);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = this.elite ? 'rgba(255,210,122,.22)' : 'rgba(255,111,145,.18)';
        ctx.fillRect(this.x - w / 2, y, w * ratio, 2);
        ctx.restore();
      }
    }
  }
  SF.Enemy = Enemy;

  /* ---------------- Pickup ---------------- */
  class Pickup {
    constructor(x, y, type) {
      this.x = x; this.y = y;
      this.type = type;
      this.vy = type === 'gem' ? 50 : 38;
      this.t = Math.random() * 4;
      this.seed = Math.random() * 6;
      this.life = type === 'life' ? 14 : 16;
      this.dead = false;
      this.magnet = type === 'gem' ? 170 : 130;
    }

    update(dt, player) {
      this.t += dt;
      this.life -= dt;
      if (this.life <= 0) return false;
      if (player && player.alive) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d < this.magnet) {
          const k = this.type === 'gem' ? 9 : 5.5;
          const pull = (1 - d / this.magnet) * k * 60;
          this.x += (dx / (d || 1)) * pull * dt;
          this.y += (dy / (d || 1)) * pull * dt;
        } else {
          this.y += this.vy * dt;
          this.x += Math.sin(this.t * 1.8 + this.seed) * 14 * dt;
        }
      } else {
        this.y += this.vy * dt;
      }
      if (this.type !== 'gem' && SF.Game && SF.chance(dt * 1.6)) {
        const col = this.type === 'power' ? SF.PALETTE.teal
          : this.type === 'shield' ? SF.PALETTE.violet
          : this.type === 'drone' ? SF.PALETTE.violet
          : this.type === 'core' ? SF.PALETTE.gold
          : this.type === 'reflect' ? SF.PALETTE.gold : SF.PALETTE.rose;
        SF.Game.fx.ember(this.x + SF.rand(-9, 9), this.y + SF.rand(-8, 8), col, 1.2, 0.34, SF.rand(-8, 8), SF.rand(-18, -4));
      }
      return this.y < SF.H + 40;
    }

    draw(ctx) {
      if (this.type === 'gem') {
        const a = 0.7 + Math.sin(this.t * 5 + this.seed) * 0.2;
        SF.Art.drawSprite(ctx, SF.Art.sprites.gem, this.x, this.y, 0, 0.85, a);
        return;
      }
      SF.Art.drawPickup(ctx, this, this.t);
    }
  }
  SF.Pickup = Pickup;

  /* ---------------- Laser ---------------- */
  class Laser {
    constructor(x, y, angle, opts) {
      opts = opts || {};
      this.x = x; this.y = y;
      this.angle = angle;
      this.warn = opts.warn === undefined ? 0.9 : opts.warn;
      this.active = opts.active === undefined ? 0.7 : opts.active;
      this.t = 0;
      this.width = opts.width || 16;
      this.drawWidth = this.width;
      this.length = opts.length || SF.H * 2;
      this.sweep = opts.sweep || 0;
      this.color = opts.color || P.rose;
      this.dead = false;
      this.boss = opts.boss;
      this.sparks = 0;
    }

    update(dt) {
      this.t += dt;
      if (this.t > this.warn && this.t < this.warn + this.active && this.sweep) {
        this.angle += this.sweep * dt;
      }
      if (this.t > this.warn + this.active + 0.12) return false;
      if (this.boss && this.boss.dying) return false;
      return true;
    }

    isActive() { return this.t >= this.warn && this.t <= this.warn + this.active; }

    draw(ctx) {
      const cx = this.x, cy = this.y;
      const len = this.length;
      const width = this.width * clamp(SF.W / 540, 0.68, 1.08);
      this.drawWidth = width;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.angle);
      if (!this.isActive()) {
        const k = clamp(this.t / this.warn, 0, 1);
        ctx.strokeStyle = `rgba(255,111,145,${0.14 + k * 0.35})`;
        ctx.lineWidth = 1 + k * 1.6;
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = -this.t * 42;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        // charge glow
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        SF.Art.drawGlow(ctx, 0, 0, 34 + k * 20, this.color, 0.2 + k * 0.3);
        ctx.restore();
      } else {
        const env = Math.min(1, (this.t - this.warn) * 12, (this.warn + this.active - this.t) * 8);
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createLinearGradient(0, 0, len, 0);
        grad.addColorStop(0, 'rgba(255,255,255,.95)');
        grad.addColorStop(0.2, 'rgba(255,210,220,.8)');
        grad.addColorStop(1, 'rgba(255,111,145,.05)');
        ctx.strokeStyle = 'rgba(255,111,145,.24)';
        ctx.lineWidth = width * 2 * env;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.strokeStyle = grad;
        ctx.lineWidth = width * env;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.95)';
        ctx.lineWidth = Math.max(1.2, width * 0.18) * env;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,255,255,.28)';
        ctx.lineWidth = Math.max(1, width * 0.22) * env;
        ctx.setLineDash([18, 13]);
        ctx.lineDashOffset = -this.t * 170;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.restore();
        ctx.save();
        SF.Art.drawGlow(ctx, 0, 0, 50, this.color, 0.35 * env);
        ctx.restore();
      }
      ctx.restore();
    }
  }
  SF.Laser = Laser;

  /* ---------------- Boss ---------------- */
  const BOSS_TYPES = [
    {
      id: 'gatekeeper', name: '阿刻戎', title: '守门人', en: 'GATEKEEPER',
      size: 76, hp: 390, color: P.rose, glow: P.rose,
      attacks: ['fan', 'twinBeam', 'mineCurtain', 'sweep', 'spiral', 'barrage'], shape: 'hex',
    },
    {
      id: 'weaver', name: '薇尔', title: '织星者', en: 'STAR WEAVER',
      size: 80, hp: 560, color: P.violet, glow: P.violet,
      attacks: ['ring', 'homing', 'cross', 'blink', 'waveCurtain', 'summon'], shape: 'wing',
    },
    {
      id: 'helios', name: '赫利俄斯', title: '新星核心', en: 'NOVA CORE',
      size: 82, hp: 680, color: P.gold, glow: P.gold,
      attacks: ['spiral', 'barrage', 'laserWeb', 'mineCurtain', 'twinBeam', 'summon'], shape: 'core',
    },
  ];
  SF.BOSS_TYPES = BOSS_TYPES;

  const ATTACK_LABELS = {
    fan: '扇形齐射', spiral: '星旋回廊', ring: '环状爆发', homing: '追踪星群',
    sweep: '双生扫射', cross: '十字光牢', summon: '母舰召唤', barrage: '重弹压制',
    twinBeam: '双子光矛', mineCurtain: '雷区播种', blink: '相位闪现',
    laserWeb: '星网绞杀', waveCurtain: '波动弹幕',
  };
  SF.ATTACK_LABELS = ATTACK_LABELS;

  class Boss {
    constructor(sector) {
      const idx = (sector - 1) % BOSS_TYPES.length;
      const cycle = Math.floor((sector - 1) / BOSS_TYPES.length);
      const def = BOSS_TYPES[idx];
      this.def = def;
      this.type = def.id;
      this.name = def.name;
      this.title = def.title;
      this.en = def.en;
      this.sector = sector;
      this.size = def.size;
      this.maxHp = Math.round(def.hp * (1 + cycle * 0.42 + (sector - 1) * 0.045));
      this.hp = this.maxHp;
      this.glowColor = def.color;
      this.x = SF.W / 2;
      this.y = -this.size * 2.2;
      this.targetY = Math.max(SF.H * 0.27, 252);
      this.t = 0;
      this.age = 0;
      this.flash = 0;
      this.entering = true;
      this.dying = false;
      this.deathT = 0;
      this.burstTimer = 0.2;
      this.attack = null;
      this.attackCd = 1.4;
      this.phase = 1;
      this.attacksUsed = [];
      this.rewarded = false;
      this.bobPhase = Math.random() * TAU;
      this.lastPattern = '';
      this.lockMove = false;
      this.attackLabel = '';
    }

    get radius() { return this.size * 0.8; }

    update(dt) {
      this.t += dt;
      this.age += dt;
      this.flash = Math.max(0, this.flash - dt);
      if (this.entering) {
        this.y += (this.targetY - this.y) * (1 - Math.exp(-3.2 * dt));
        if (this.y > this.targetY - 4) {
          this.y = this.targetY;
          this.entering = false;
          SF.Game.onBossReady(this);
        }
        return;
      }
      if (this.dying) {
        this.deathT += dt;
        this.y += 6 * dt;
        if (SF.chance(dt * 16)) {
          SF.Game.fx.explosion(
            this.x + SF.rand(-this.size, this.size),
            this.y + SF.rand(-this.size * 0.7, this.size * 0.7),
            SF.rand(0.35, 0.95), this.def.color
          );
        }
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
          this.burstTimer = 0.42;
          const bx = this.x + SF.rand(-this.size * 0.9, this.size * 0.9);
          const by = this.y + SF.rand(-this.size * 0.6, this.size * 0.6);
          SF.Game.fx.explosion(bx, by, SF.rand(0.9, 1.6), this.def.color);
          SF.Game.fx.ring(bx, by, this.def.color, 12, 0.55, 150);
          SF.Game.fx.shake(5);
        }
        if (this.deathT > 2.6 && !this.rewarded) {
          this.rewarded = true;
          SF.Game.onBossDefeated(this);
        }
        return;
      }

      // phase
      const ratio = this.hp / this.maxHp;
      const newPhase = ratio < 0.28 ? 3 : ratio < 0.62 ? 2 : 1;
      if (newPhase !== this.phase) {
        this.phase = newPhase;
        this.flash = 0.4;
        SF.Game.onBossPhase(this);
        SF.Game.fx.ring(this.x, this.y, this.def.color, this.size * 0.6, 0.7, this.size * 3);
        SF.Audio.sfx('warn');
      }

      // hover — faster, wider arcs in later phases (unless a pattern is repositioning us)
      if (!this.lockMove) {
        const sway = this.phase === 3 ? 0.27 : this.phase === 2 ? 0.225 : 0.19;
        const rate = 0.55 + (this.phase - 1) * 0.08;
        this.x = SF.W / 2 + Math.sin(this.t * rate + this.bobPhase) * SF.W * sway;
        this.y = this.targetY + Math.sin(this.t * 1.1) * (this.phase === 3 ? 12 : 7);
      }

      if (this.attack) {
        this.updateAttack(dt);
      } else {
        this.attackCd -= dt;
        if (this.attackCd <= 0) this.chooseAttack();
      }

      if (Math.random() < dt * 5) {
        SF.Game.fx.ember(this.x + SF.rand(-this.size, this.size), this.y + SF.rand(-this.size, this.size), this.def.color, SF.rand(1, 2.4), 0.4, 0, -20);
      }
    }

    chooseAttack() {
      const cap = this.phase === 1 ? 4 : this.phase === 2 ? 5 : this.def.attacks.length;
      const base = this.def.attacks.slice(0, cap);
      const recent = this.attacksUsed.slice(-2);
      const fresh = base.filter((n) => !recent.includes(n));
      const use = SF.pick(fresh.length ? fresh : base);
      this.attacksUsed.push(use);
      if (this.attacksUsed.length > 5) this.attacksUsed.shift();
      this.startAttack(use);
    }

    startAttack(name) {
      this.attack = { name, t: 0, fired: {}, emit: 0, angle: Math.random() * TAU };
      this.lastPattern = name;
      this.attackLabel = ATTACK_LABELS[name] || '';
      this.lockMove = name === 'blink';
      this.attackDuration = ({
        fan: 1.25, spiral: 2.0, ring: 1.05, homing: 1.0,
        sweep: 2.5, cross: 2.0, summon: 1.0, barrage: 1.8,
        twinBeam: 2.2, mineCurtain: 2.0, blink: 2.2, laserWeb: 2.4, waveCurtain: 2.0,
      })[name] || 1.2;
    }

    at(a, time, fn) {
      if (a.t >= time && !a.fired[time]) { a.fired[time] = true; fn(); }
    }

    updateAttack(dt) {
      const a = this.attack;
      a.t += dt;
      const pl = SF.Game.player;
      const aim = pl ? Math.atan2(pl.y - this.y, pl.x - this.x) : Math.PI / 2;
      const speedBase = Math.min(280, 165 + (this.sector - 1) * 6);
      const spd = speedBase * (this.phase === 3 ? 1.15 : 1);

      const shot = (ang, speed, kind, opts) => {
        opts = opts || {};
        SF.Game.enemyBullets.push(new Bullet(
          this.x + (opts.ox || 0), this.y + this.size * 0.35 + (opts.oy || 0),
          Math.cos(ang) * speed, Math.sin(ang) * speed,
          { kind: kind || 'orb', r: opts.r || 6, life: opts.life || 10, homing: opts.homing || 0,
            turn: opts.turn || 2.2, scale: opts.scale || 1,
            fuse: opts.fuse || 0, split: opts.split || 0, wave: opts.wave || 0 }
        ));
      };
      const fan = (n, spread) => {
        for (let i = 0; i < n; i++) {
          shot(aim + (i - (n - 1) / 2) * spread, spd, 'shard');
        }
      };
      const ring = (n, offset) => {
        for (let i = 0; i < n; i++) shot((i / n) * TAU + offset, spd * 0.8, 'orb');
      };
      const warpTo = (nx, ny, count) => {
        SF.Game.fx.ring(this.x, this.y, this.def.color, this.size * 0.5, 0.4, this.size * 2.4, 0.8);
        SF.Game.fx.spark(this.x, this.y, this.def.color, 8, 130, 0.35);
        this.x = clamp(nx, this.size * 1.25, SF.W - this.size * 1.25);
        this.y = clamp(ny, this.size * 1.2, SF.H * 0.4);
        this.flash = 0.2;
        SF.Game.fx.ring(this.x, this.y, this.def.color, this.size * 0.4, 0.45, this.size * 3, 0.9);
        SF.Audio.sfx('hit');
        for (let i = 0; i < count; i++) shot((i / count) * TAU + aim, spd * 0.75, 'orb');
      };

      switch (a.name) {
        case 'fan':
          this.at(a, 0.1, () => { fan(this.phase >= 2 ? 7 : 5, 0.17); SF.Audio.sfx('hit'); });
          this.at(a, 0.55, () => { fan(this.phase >= 2 ? 7 : 5, 0.12); });
          this.at(a, 0.95, () => { fan(this.phase >= 3 ? 9 : 5, 0.2); });
          break;
        case 'spiral':
          a.emit -= dt;
          if (a.emit <= 0) {
            a.emit = this.phase >= 2 ? 0.065 : 0.085;
            const arms = this.phase >= 3 ? 4 : this.phase >= 2 ? 3 : 2;
            for (let i = 0; i < arms; i++) {
              const ang = a.angle + (i / arms) * TAU;
              shot(ang, spd * 0.72, 'orb');
            }
            a.angle += 0.21;
          }
          break;
        case 'ring':
          this.at(a, 0.15, () => {
            ring(this.phase >= 2 ? 26 : 20, Math.random() * TAU);
            SF.Audio.sfx('hit');
          });
          this.at(a, 0.6, () => ring(this.phase >= 3 ? 28 : 22, 0.2));
          break;
        case 'homing':
          this.at(a, 0.15, () => {
            for (let i = 0; i < (this.phase >= 2 ? 5 : 3); i++) {
              shot(aim + (i - 1) * 0.22, spd * 0.55, 'homing', { r: 7, homing: 1.6, turn: 2.1 });
            }
            SF.Audio.sfx('hit');
          });
          break;
        case 'sweep': {
          this.at(a, 0.1, () => {
            SF.Game.lasers.push(new Laser(this.x, this.y, aim - 0.55, {
              warn: 1.0, active: 0.9, width: 15, sweep: 0.85, boss: this, color: this.def.color,
            }));
            SF.Audio.sfx('warn');
          });
          this.at(a, 1.3, () => {
            SF.Game.lasers.push(new Laser(this.x, this.y, aim + 0.55, {
              warn: 0.85, active: 0.8, width: 13, sweep: -0.9, boss: this, color: this.def.color,
            }));
          });
          break;
        }
        case 'cross':
          this.at(a, 0.15, () => {
            const base = Math.random() * 0.6;
            for (let i = 0; i < 4; i++) {
              SF.Game.lasers.push(new Laser(this.x, this.y, base + i * Math.PI / 2, {
                warn: 1.0, active: 0.62, width: 11, boss: this, color: this.def.color,
              }));
            }
            SF.Audio.sfx('warn');
          });
          break;
        case 'summon':
          this.at(a, 0.2, () => {
            const roster = this.sector >= 4
              ? ['sniper', 'sidewinder', 'shardling']
              : this.sector >= 2 ? ['shardling', 'wasp'] : ['wasp'];
            const n = this.phase >= 3 ? 3 : 2;
            for (let i = 0; i < n; i++) {
              const ex = this.x + (i - (n - 1) / 2) * this.size * 1.5;
              SF.Game.spawnEnemy(roster[i % roster.length], ex, this.y + this.size * 0.8, { sector: this.sector });
            }
            SF.Audio.sfx('hit');
          });
          break;
        case 'barrage':
          this.at(a, 0.12, () => {
            for (let i = 0; i < 5; i++) {
              const ang = aim + (i - 2) * 0.23;
              shot(ang, spd * 0.6, 'heavy', { r: 10, scale: 1 });
            }
            if (this.phase >= 2) {
              shot(aim - 0.34, spd * 0.38, 'plasma', { r: 13, scale: 1.1, life: 3.4, split: 6 });
              shot(aim + 0.34, spd * 0.38, 'plasma', { r: 13, scale: 1.1, life: 3.4, split: 6 });
            }
            SF.Audio.sfx('hit');
          });
          this.at(a, 0.7, () => {
            for (let i = 0; i < 12; i++) shot((i / 12) * TAU + 0.3, spd * 0.7, 'shard');
          });
          this.at(a, 1.25, () => fan(5, 0.2));
          break;
        case 'twinBeam':
          this.at(a, 0.12, () => {
            SF.Game.lasers.push(new Laser(this.x, this.y, aim - 0.65, {
              warn: 1.0, active: 0.85, width: 13, sweep: 0.55, boss: this, color: this.def.color,
            }));
            SF.Game.lasers.push(new Laser(this.x, this.y, aim + 0.65, {
              warn: 1.0, active: 0.85, width: 13, sweep: -0.55, boss: this, color: this.def.color,
            }));
            SF.Audio.sfx('warn');
          });
          this.at(a, 1.15, () => {
            for (let i = 0; i < (this.phase >= 2 ? 5 : 3); i++) {
              shot(aim + (i - 1) * 0.18, spd * 1.05, 'needle', { r: 5, scale: 1.2 });
            }
            SF.Audio.sfx('hit');
          });
          break;
        case 'mineCurtain':
          this.at(a, 0.1, () => {
            for (let i = 0; i < 5; i++) {
              const ang = aim + (i - 2) * 0.26;
              shot(ang, 95, 'mine', { r: 9, fuse: 1.7, split: 9, scale: 1 });
            }
            SF.Audio.sfx('hit');
          });
          this.at(a, 0.85, () => {
            for (let i = 0; i < (this.phase >= 2 ? 7 : 5); i++) {
              const ang = Math.PI / 2 + (i - 2) * 0.3;
              shot(ang, 80, 'mine', { r: 8, fuse: 2.1, split: 8 });
            }
            SF.Game.fx.ring(this.x, this.y, this.def.color, 6, 0.35, 120, 0.5);
          });
          break;
        case 'blink':
          this.at(a, 0.15, () => warpTo(SF.W * 0.24, this.targetY - 18, 12));
          this.at(a, 0.82, () => warpTo(SF.W * 0.74, this.targetY + 26, 14));
          this.at(a, 1.5, () => warpTo(SF.W * 0.5, this.targetY - 8, 16));
          break;
        case 'laserWeb':
          this.at(a, 0.12, () => {
            const base = aim - 0.6;
            for (let i = 0; i < 4; i++) {
              SF.Game.lasers.push(new Laser(this.x, this.y, base + i * Math.PI / 2, {
                warn: 0.9, active: 0.65, width: 10, sweep: i % 2 ? -0.55 : 0.55,
                boss: this, color: this.def.color,
              }));
            }
            SF.Audio.sfx('warn');
          });
          this.at(a, 1.15, () => {
            for (let i = 0; i < 2; i++) {
              SF.Game.lasers.push(new Laser(this.x, this.y, aim + (i ? 0.5 : -0.5), {
                warn: 0.75, active: 0.55, width: 9, boss: this, color: this.def.color,
              }));
            }
            SF.Game.fx.ring(this.x, this.y, this.def.color, 6, 0.35, 120, 0.5);
          });
          break;
        case 'waveCurtain':
          this.at(a, 0.1, () => {
            for (let i = 0; i < 9; i++) {
              shot(aim + (i - 4) * 0.17, spd * 0.72, 'wave', { r: 7, wave: 2.1, scale: 1.15 });
            }
            SF.Audio.sfx('hit');
          });
          this.at(a, 0.95, () => {
            for (let i = 0; i < 7; i++) {
              shot(aim + (i - 3) * 0.2, spd * 0.62, 'wave', { r: 6, wave: -2.4, scale: 1.1 });
            }
          });
          break;
      }

      if (a.t >= this.attackDuration) {
        if (a.name === 'blink') {
          SF.Game.fx.ring(this.x, this.y, this.def.color, this.size * 0.5, 0.4, this.size * 2.4, 0.8);
          SF.Game.fx.spark(this.x, this.y, this.def.color, 8, 130, 0.35);
        }
        this.attack = null;
        this.attackLabel = '';
        this.lockMove = false;
        this.attackCd = Math.max(0.5, (this.phase === 3 ? 0.55 : this.phase === 2 ? 0.72 : 0.92));
        if (this.phase === 3 && SF.chance(0.55)) {
          // enrage ring
          const pl2 = SF.Game.player;
          const aim2 = pl2 ? Math.atan2(pl2.y - this.y, pl2.x - this.x) : Math.PI / 2;
          for (let i = 0; i < 16; i++) {
            const ang = (i / 16) * TAU + aim2;
            SF.Game.enemyBullets.push(new Bullet(this.x, this.y + this.size * 0.3,
              Math.cos(ang) * spd * 0.75, Math.sin(ang) * spd * 0.75, { kind: 'orb', r: 6, life: 9 }));
          }
        }
      }
    }

    hit(dmg) {
      if (this.entering || this.dying) return;
      this.hp -= dmg;
      this.flash = 0.055;
      if (this.hp <= 0) {
        this.hp = 0;
        this.dying = true;
        this.attack = null;
        SF.Game.onBossDying(this);
      }
    }

    draw(ctx) {
      SF.Art.drawBoss(ctx, this, this.t);
      if (this.entering) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,111,145,.25)';
        ctx.setLineDash([6, 10]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 1.35, this.t * 0.5, this.t * 0.5 + Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  SF.Boss = Boss;
})();
