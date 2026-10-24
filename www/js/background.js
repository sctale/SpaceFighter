/* ============================================================
   background.js — nebula, aurora, parallax starfield, menu scene
   ============================================================ */
(function () {
  'use strict';
  const SF = window.SF;
  const P = SF.PALETTE;
  const TAU = SF.TAU;

  class Background {
    constructor() {
      this.t = 0;
      this.stars = [];
      this.dust = [];
      this.meteors = [];
      this.meteorTimer = 3;
      this.menuTraffic = [];
      this.trafficTimer = 1.5;
      this.auroraOffset = 0;
      this.nebula = null;
      this.aurora = null;
      this.lastH = 0;
      this.resize();
    }

    resize() {
      const W = SF.W, H = SF.H;
      this.lastH = H;
      this.nebula = this.buildNebula(W, H);
      this.aurora = this.buildAurora(W, Math.max(1200, H * 1.5));
      this.stars = [];
      const layers = [
        { n: Math.round(W * H / 5600), speed: 16, size: [0.7, 1.2], alpha: [0.22, 0.5] },
        { n: Math.round(W * H / 9000), speed: 42, size: [1.0, 1.7], alpha: [0.35, 0.8] },
        { n: Math.round(W * H / 18000), speed: 92, size: [1.3, 2.3], alpha: [0.5, 1] },
      ];
      layers.forEach((L, li) => {
        for (let i = 0; i < L.n; i++) {
          this.stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            z: li,
            speed: L.speed * SF.rand(0.7, 1.35),
            r: SF.rand(L.size[0], L.size[1]),
            a: SF.rand(L.alpha[0], L.alpha[1]),
            phase: Math.random() * TAU,
            tw: SF.rand(0.6, 2.2),
            tint: Math.random() < 0.14 ? 'violet' : Math.random() < 0.1 ? 'teal' : 'white',
            streak: li === 2,
          });
        }
      });
      this.dust = [];
      for (let i = 0; i < 22; i++) {
        this.dust.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: SF.rand(-4, 4),
          vy: SF.rand(6, 22),
          r: SF.rand(0.6, 1.8),
          a: SF.rand(0.06, 0.2),
          col: Math.random() < 0.5 ? P.teal : P.violet,
        });
      }
      this.meteors = [];
    }

    buildNebula(W, H) {
      const S = 1.5;
      const c = document.createElement('canvas');
      c.width = Math.ceil(W * S);
      c.height = Math.ceil(H * S);
      const g = c.getContext('2d');
      g.scale(S, S);

      // deep space base
      const base = g.createLinearGradient(0, 0, 0, H);
      base.addColorStop(0, '#050713');
      base.addColorStop(0.42, '#070b1c');
      base.addColorStop(0.78, '#05060f');
      base.addColorStop(1, '#03040b');
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);

      // diagonal galactic band
      g.save();
      g.translate(W * 0.44, H * 0.38);
      g.rotate(-0.62);
      const band = g.createLinearGradient(0, -W * 0.5, 0, W * 0.5);
      band.addColorStop(0, 'rgba(155,140,255,0)');
      band.addColorStop(0.35, 'rgba(155,140,255,.045)');
      band.addColorStop(0.5, 'rgba(220,225,255,.075)');
      band.addColorStop(0.66, 'rgba(105,245,220,.045)');
      band.addColorStop(1, 'rgba(105,245,220,0)');
      g.fillStyle = band;
      g.fillRect(-W, -W * 0.5, W * 2, W);
      g.restore();

      // nebula clouds
      const clouds = [
        { x: 0.12, y: 0.14, r: 0.68, col: '105,245,220', a: 0.18 },
        { x: 0.86, y: 0.30, r: 0.58, col: '155,140,255', a: 0.22 },
        { x: 0.22, y: 0.56, r: 0.52, col: '155,140,255', a: 0.13 },
        { x: 0.9, y: 0.78, r: 0.5, col: '255,111,145', a: 0.11 },
        { x: 0.44, y: 0.88, r: 0.6, col: '105,245,220', a: 0.1 },
        { x: 0.58, y: 0.16, r: 0.34, col: '255,210,122', a: 0.09 },
        { x: 0.36, y: 0.36, r: 0.44, col: '90,150,255', a: 0.1 },
      ];
      for (const cl of clouds) {
        const cx = cl.x * W, cy = cl.y * H, r = cl.r * W;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(${cl.col},${cl.a})`);
        grad.addColorStop(0.32, `rgba(${cl.col},${cl.a * 0.7})`);
        grad.addColorStop(0.68, `rgba(${cl.col},${cl.a * 0.22})`);
        grad.addColorStop(1, `rgba(${cl.col},0)`);
        g.fillStyle = grad;
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }

      // star haze specks
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        const r = Math.random() < 0.92 ? Math.random() * 0.8 + 0.2 : Math.random() * 1.4 + 0.6;
        g.fillStyle = `rgba(226,236,255,${Math.random() * 0.25 + 0.03})`;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }

      // distant planet
      this.paintPlanet(g, W * 0.99, H * 0.09, W * 0.155);

      // atmosphere glow bottom
      const bottomGlow = g.createRadialGradient(W * 0.5, H * 1.02, 0, W * 0.5, H * 1.02, H * 0.4);
      bottomGlow.addColorStop(0, 'rgba(155,140,255,.08)');
      bottomGlow.addColorStop(1, 'rgba(155,140,255,0)');
      g.fillStyle = bottomGlow;
      g.fillRect(0, H * 0.6, W, H * 0.4);

      // edge darkening
      const vg = g.createRadialGradient(W / 2, H * 0.45, H * 0.15, W / 2, H * 0.45, H * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,.42)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);

      return c;
    }

    paintPlanet(g, cx, cy, r) {
      // halo
      const halo = g.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.55);
      halo.addColorStop(0, 'rgba(105,245,220,.10)');
      halo.addColorStop(0.5, 'rgba(105,245,220,.035)');
      halo.addColorStop(1, 'rgba(105,245,220,0)');
      g.fillStyle = halo;
      g.fillRect(cx - r * 1.6, cy - r * 1.6, r * 3.2, r * 3.2);

      // ring (behind)
      g.save();
      g.translate(cx, cy);
      g.rotate(-0.42);
      g.strokeStyle = 'rgba(160,180,255,.14)';
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(0, 0, r * 1.62, r * 0.47, 0, 0, TAU);
      g.stroke();
      g.strokeStyle = 'rgba(255,210,122,.08)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(0, 0, r * 1.78, r * 0.54, 0, 0, TAU);
      g.stroke();
      g.restore();

      // body
      const body = g.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.1, cx, cy, r);
      body.addColorStop(0, '#2a3452');
      body.addColorStop(0.42, '#161e34');
      body.addColorStop(0.78, '#0a0f1e');
      body.addColorStop(1, '#05070f');
      g.fillStyle = body;
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.fill();

      // bands clipped
      g.save();
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.clip();
      for (let i = 0; i < 5; i++) {
        g.fillStyle = `rgba(${i % 2 ? '155,140,255' : '105,245,220'},${0.025 + i * 0.006})`;
        g.beginPath();
        g.ellipse(cx + r * 0.1, cy - r * 0.3 + i * r * 0.24, r * 0.95, r * 0.07, -0.2, 0, TAU);
        g.fill();
      }
      // limb light
      const lim = g.createRadialGradient(cx - r * 0.55, cy - r * 0.6, r * 0.2, cx, cy, r);
      lim.addColorStop(0, 'rgba(0,0,0,0)');
      lim.addColorStop(0.78, 'rgba(0,0,0,0)');
      lim.addColorStop(1, 'rgba(0,0,0,.5)');
      g.fillStyle = lim;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
      g.restore();

      // rim arc
      g.strokeStyle = 'rgba(105,245,220,.45)';
      g.lineWidth = 1.1;
      g.beginPath();
      g.arc(cx, cy, r - 0.6, Math.PI * 1.02, Math.PI * 1.72);
      g.stroke();
      g.strokeStyle = 'rgba(155,140,255,.2)';
      g.beginPath();
      g.arc(cx, cy, r + 1.5, Math.PI * 0.95, Math.PI * 1.9);
      g.stroke();
    }

    buildAurora(W, H) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const bands = [
        { y: H * 0.18, amp: 60, h: 130, col: '105,245,220', a: 0.09, freq: 0.006, phase: 0.4 },
        { y: H * 0.36, amp: 90, h: 100, col: '155,140,255', a: 0.075, freq: 0.004, phase: 2.2 },
        { y: H * 0.62, amp: 70, h: 160, col: '155,140,255', a: 0.045, freq: 0.005, phase: 4.1 },
      ];
      bands.forEach((b) => {
        const grad = g.createLinearGradient(0, b.y - b.amp - b.h / 2, 0, b.y + b.amp + b.h / 2);
        grad.addColorStop(0, `rgba(${b.col},0)`);
        grad.addColorStop(0.35, `rgba(${b.col},${b.a})`);
        grad.addColorStop(0.5, `rgba(${b.col},${b.a * 1.5})`);
        grad.addColorStop(0.68, `rgba(${b.col},${b.a * 0.7})`);
        grad.addColorStop(1, `rgba(${b.col},0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, b.y);
        for (let x = 0; x <= W; x += 12) {
          g.lineTo(x, b.y + Math.sin(x * b.freq + b.phase) * b.amp + Math.sin(x * b.freq * 2.7 + b.phase * 2) * b.amp * 0.28);
        }
        for (let x = W; x >= 0; x -= 12) {
          g.lineTo(x, b.y + b.h + Math.sin(x * b.freq * 1.3 + b.phase + 1) * b.amp * 0.6);
        }
        g.closePath();
        g.fill();
      });
      return c;
    }

    addMeteor() {
      const W = SF.W;
      const x = SF.rand(W * 0.1, W * 0.9);
      this.meteors.push({
        x, y: SF.rand(-40, SF.H * 0.25),
        vx: SF.rand(-70, 70), vy: SF.rand(260, 420),
        life: 1, len: SF.rand(30, 80),
      });
    }

    addTraffic() {
      const W = SF.W;
      const dir = SF.chance(0.5) ? 1 : -1;
      this.menuTraffic.push({
        x: dir > 0 ? -80 : W + 80,
        y: SF.rand(SF.H * 0.2, SF.H * 0.66),
        vx: dir * SF.rand(26, 52),
        vy: SF.rand(-8, 8),
        scale: SF.rand(0.45, 0.85),
        bank: SF.rand(-0.5, 0.5),
        alpha: SF.rand(0.16, 0.32),
      });
    }

    update(dt, opts) {
      opts = opts || {};
      const speed = opts.speed === undefined ? 1 : opts.speed;
      this.t += dt;
      const H = SF.H, W = SF.W;
      const play = opts.mode === 'game';

      for (const s of this.stars) {
        s.y += s.speed * dt * (play ? 1.15 : 0.55);
        if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
        if (s.streak && play && s.y > -4) {
          // subtle streaking during play handled in draw
        }
      }
      this.auroraOffset = (this.auroraOffset + dt * 9 * (play ? 1 : 0.5)) % (this.aurora.height / 1);

      for (let i = this.dust.length - 1; i >= 0; i--) {
        const d = this.dust[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt * (play ? 1.4 : 0.5);
        if (d.y > H + 10) { d.y = -10; d.x = Math.random() * W; }
        if (d.x < -10) d.x = W + 10;
        if (d.x > W + 10) d.x = -10;
      }

      this.meteorTimer -= dt;
      if (this.meteorTimer <= 0) {
        this.meteorTimer = SF.rand(play ? 6 : 3.5, play ? 12 : 7);
        this.addMeteor();
      }
      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const m = this.meteors[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life -= dt * 0.7;
        if (m.life <= 0 || m.y > H + 80) this.meteors.splice(i, 1);
      }

      if (opts.mode === 'menu') {
        this.trafficTimer -= dt;
        if (this.trafficTimer <= 0) {
          this.trafficTimer = SF.rand(4, 8);
          this.addTraffic();
        }
        for (let i = this.menuTraffic.length - 1; i >= 0; i--) {
          const tr = this.menuTraffic[i];
          tr.x += tr.vx * dt;
          tr.y += tr.vy * dt;
          if (tr.x < -160 || tr.x > W + 160) this.menuTraffic.splice(i, 1);
        }
      }
    }

    draw(ctx, opts) {
      opts = opts || {};
      const W = SF.W, H = SF.H;
      const t = this.t;
      const play = opts.mode === 'game';
      const danger = opts.danger || 0;

      // baked nebula
      if (this.nebula) ctx.drawImage(this.nebula, 0, 0, W, H);

      // aurora (scrolling, additive)
      if (this.aurora) {
        const ah = this.aurora.height;
        const oy = -(this.auroraOffset % ah);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = play ? 0.82 : 1;
        ctx.drawImage(this.aurora, 0, oy, W, ah);
        ctx.drawImage(this.aurora, 0, oy + ah, W, ah);
        if (danger > 0) {
          ctx.globalAlpha = 1;
          const dg = ctx.createLinearGradient(0, 0, 0, H);
          dg.addColorStop(0, 'rgba(255,111,145,' + (danger * 0.12) + ')');
          dg.addColorStop(0.45, 'rgba(255,111,145,' + (danger * 0.05) + ')');
          dg.addColorStop(1, 'rgba(255,111,145,0)');
          ctx.fillStyle = dg;
          ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
      }

      // star field
      ctx.save();
      for (const s of this.stars) {
        const tw = 0.62 + Math.sin(t * s.tw + s.phase) * 0.38;
        let col = '255,255,255';
        if (s.tint === 'teal') col = '125,255,235';
        else if (s.tint === 'violet') col = '180,168,255';
        ctx.fillStyle = `rgba(${col},${s.a * tw})`;
        if (s.z === 2) {
          ctx.fillRect(s.x, s.y, s.r, s.r * 1.7);
          ctx.fillStyle = `rgba(${col},${s.a * tw * 0.18})`;
          ctx.fillRect(s.x - s.r * 0.4, s.y - s.r * 0.8, s.r * 1.8, s.r * 3.2);
        } else {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();

      // dust motes
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const d of this.dust) {
        ctx.fillStyle = d.col;
        ctx.globalAlpha = d.a;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // meteors
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const m of this.meteors) {
        const alpha = Math.max(0, m.life) * 0.5;
        const len = m.len * Math.min(1, m.life * 2);
        const nx = m.vx / Math.hypot(m.vx, m.vy);
        const ny = m.vy / Math.hypot(m.vx, m.vy);
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - nx * len, m.y - ny * len);
        grad.addColorStop(0, `rgba(235,245,255,${alpha})`);
        grad.addColorStop(0.4, `rgba(155,140,255,${alpha * 0.5})`);
        grad.addColorStop(1, 'rgba(155,140,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - nx * len, m.y - ny * len);
        ctx.stroke();
      }
      ctx.restore();

      if (opts.mode === 'menu') this.drawMenuScene(ctx, t);

      // sector-specific nebula wash
      const sectorTints = [
        '105,245,220', '155,140,255', '255,111,145', '255,210,122',
        '105,180,255', '220,140,255', '105,245,220', '255,150,120',
        '160,220,255', '255,210,122',
      ];
      const tc = sectorTints[((opts.sector || 1) - 1) % sectorTints.length];
      const wash = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, H * 0.76);
      wash.addColorStop(0, `rgba(${tc},0.018)`);
      wash.addColorStop(0.45, `rgba(${tc},0.038)`);
      wash.addColorStop(1, `rgba(${tc},0)`);
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W, H);

      if (play) {
        const scrim = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.08, W / 2, H * 0.44, H * 0.68);
        scrim.addColorStop(0, 'rgba(3,5,12,0.05)');
        scrim.addColorStop(0.65, 'rgba(3,5,12,0.16)');
        scrim.addColorStop(1, 'rgba(3,5,12,0.32)');
        ctx.fillStyle = scrim;
        ctx.fillRect(0, 0, W, H);
      }

      // edge darkening — gentle enough to keep the nebula visible
      const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.22, W / 2, H * 0.45, H * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,.26)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    drawMenuScene(ctx, t) {
      const W = SF.W, H = SF.H;

      // distant traffic silhouettes
      ctx.save();
      for (const tr of this.menuTraffic) {
        ctx.save();
        ctx.translate(tr.x, tr.y);
        ctx.scale(tr.vx > 0 ? 1 : -1, 1);
        ctx.rotate(1.3);
        SF.Art.drawShip(ctx, 0, 0, { scale: tr.scale, bank: tr.bank, t, thrust: 0.6, alpha: tr.alpha });
        ctx.restore();
      }
      ctx.restore();

      // hero ship
      const heroY = H * 0.69;
      const heroX = W / 2 + Math.sin(t * 0.5) * 7;
      ctx.save();
      ctx.globalAlpha = 0.88;

      // under-glow pad
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pad = ctx.createRadialGradient(heroX, heroY + 52, 4, heroX, heroY + 52, 110);
      pad.addColorStop(0, 'rgba(105,245,220,.18)');
      pad.addColorStop(1, 'rgba(105,245,220,0)');
      ctx.fillStyle = pad;
      ctx.beginPath();
      ctx.ellipse(heroX, heroY + 52, 110, 26, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      SF.Art.drawShip(ctx, heroX, heroY + Math.sin(t * 1.2) * 4, {
        scale: 2.05,
        bank: Math.sin(t * 0.7) * 0.24,
        t,
        thrust: 0.72,
        alpha: 0.97,
      });

      // escort drones
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const ang = t * 0.8 + i * Math.PI;
        SF.Art.drawDrone(ctx, heroX + side * 108 + Math.cos(ang) * 9, heroY - 26 + Math.sin(ang) * 7, t, 0, i === 0 ? 'gunner' : 'aegis');
      }
      ctx.restore();

      // hairline horizon accents
      ctx.save();
      ctx.strokeStyle = 'rgba(155,140,255,.14)';
      ctx.lineWidth = 0.8;
      const y = H * 0.83;
      ctx.beginPath();
      ctx.moveTo(W * 0.12, y);
      ctx.lineTo(W * 0.38, y);
      ctx.moveTo(W * 0.62, y);
      ctx.lineTo(W * 0.88, y);
      ctx.stroke();
      ctx.restore();
    }
  }

  SF.Background = Background;
})();
