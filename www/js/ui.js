/* ============================================================
   ui.js — screens, HUD, settings
   ============================================================ */
(function () {
  'use strict';
  const SF = window.SF;

  const WEAPON_NAMES = {
    pulse: ['脉冲炮', '双联脉冲', '三叉星流', '四象阵列', '星瀑'],
    prism: ['棱镜', '双棱', '棱镜矩阵', '裂光', '终焉棱镜'],
    swarm: ['蜂群', '双子蜂', '三蜂', '五蜂', '蜂后'],
  };
  const WEAPON_MODE_NAMES = { pulse: '脉冲', prism: '棱镜', swarm: '蜂群' };

  class UI {
    constructor() {
      this.game = null;
      this.el = {};
      this.ready = false;
      this.bestValue = 0;
      this.bestSectorValue = 1;
      this.cache = { score: -1, best: -1, sector: -1, lives: -1, weapon: -1, weaponMode: '', weaponMod: '', shield: -1, nova: -1, ready: null, combo: -1, mult: -1, bossPhase: 0, bossName: '', bossPattern: '' };
      this.announceTimer = null;
      this.hintTimer = null;
      this.toastTimer = null;
      this.comboPopTimer = null;
    }

    init(game) {
      this.game = game;
      const $ = (id) => document.getElementById(id);
      this.el = {
        stage: $('stage'),
        score: $('hudScore'), best: $('hudBest'), hudBest: $('hudBest'), sector: $('hudSector'), sectorName: $('hudSectorName'),
        lives: $('hudLives'), weaponChip: $('weaponChip'), weaponName: $('weaponName'), weaponPips: $('weaponPips'), weaponMod: $('weaponMod'),
        shieldChip: $('shieldChip'), shieldPips: $('shieldPips'),
        comboBox: $('comboBox'), comboMult: $('comboMult'), comboCount: $('comboCount'), comboFill: $('comboFill'),
        novaCluster: $('novaCluster'), novaPct: $('novaPct'), novaFill: $('novaFill'), novaKey: $('novaKey'),
        dashChip: $('dashChip'), dashFill: $('dashChip').querySelector('b'),
        bossPanel: $('bossPanel'), bossName: $('bossName'), bossTitle: $('bossTitle'), bossPhase: $('bossPhase'), bossFill: $('bossFill'), bossPattern: $('bossPattern'),
        announce: $('announce'), announceTitle: $('announceTitle'), announceSub: $('announceSub'),
        hint: $('gameHint'), toast: $('toast'),
        menuBest: $('menuBest'), menuSector: $('menuSector'),
        screenMenu: $('screenMenu'), screenPause: $('screenPause'), screenOver: $('screenOver'),
        finalScore: $('finalScore'), finalSector: $('finalSector'), finalKills: $('finalKills'),
        finalChain: $('finalChain'), finalTime: $('finalTime'), newRecord: $('newRecord'), overSub: $('overSub'),
        resultRank: $('resultRank'),
        btnPause: $('btnPause'), btnStart: $('btnStart'), btnRetry: $('btnRetry'), btnMenu: $('btnMenu'),
        btnResume: $('btnResume'), btnRestart: $('btnRestart'), btnQuit: $('btnQuit'),
        btnDash: $('btnDash'), btnNova: $('btnNova'),
        buildSummary: $('buildSummary'),
        toggleSound: $('toggleSound'), toggleShake: $('toggleShake'), toggleFx: $('toggleFx'), toggleHaptic: $('toggleHaptic'),
        hud: $('hud'), touchActions: $('touchActions'),
      };

      this.buildWeaponPips();
      this.buildShieldPips();
      this.bind();
      this.applySettings();
      this.updateMenuStats();
      this.setState('menu');
      this.showScreen('menu');
      this.ready = true;
    }

    bind() {
      const g = this.game;
      const click = (el, fn) => {
        if (!el) return;
        el.addEventListener('click', (e) => {
          e.preventDefault();
          SF.Audio.sfx('ui');
          fn(e);
        });
      };
      click(this.el.btnStart, () => g.start());
      click(this.el.btnRetry, () => g.start());
      click(this.el.btnRestart, () => g.start());
      click(this.el.btnResume, () => g.resume());
      click(this.el.btnPause, () => g.pause());
      click(this.el.btnMenu, () => g.toMenu());
      click(this.el.btnQuit, () => g.toMenu());
      click(this.el.btnDash, () => g.tryDash());
      click(this.el.btnNova, () => g.tryNova());
      click(this.el.weaponChip, () => {
        if (g.player && g.player.cycleWeapon()) this.toast('武器切换 · ' + (WEAPON_MODE_NAMES[g.player.activeWeapon] || ''));
      });

      click(this.el.toggleSound, () => {
        const next = !g.settings.sound;
        g.setSetting('sound', next);
        this.toast(next ? '音乐与音效已开启' : '音乐与音效已关闭');
      });
      click(this.el.toggleShake, () => {
        const next = !g.settings.shake;
        g.setSetting('shake', next);
        this.toast(next ? '屏幕震动已开启' : '屏幕震动已关闭');
      });
      click(this.el.toggleFx, () => {
        const next = !g.settings.lowFx;
        g.setSetting('lowFx', next);
        this.toast(next ? '已切换轻柔特效' : '已切换标准特效');
      });
      click(this.el.toggleHaptic, () => {
        const next = !g.settings.haptic;
        g.setSetting('haptic', next);
        if (next) SF.vibrate(20);
        this.toast(next ? '触感反馈已开启' : '触感反馈已关闭');
      });

      // prevent touch-actions from dragging the ship
      ['btnDash', 'btnNova'].forEach((k) => {
        const el = this.el[k];
        if (!el) return;
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
      });
    }

    buildWeaponPips() {
      const wrap = this.el.weaponPips;
      wrap.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const b = document.createElement('b');
        wrap.appendChild(b);
      }
    }

    buildShieldPips() {
      const wrap = this.el.shieldPips;
      if (!wrap) return;
      wrap.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const b = document.createElement('b');
        wrap.appendChild(b);
      }
    }

    setState(state) {
      this.el.stage.dataset.state = state;
      const visible = state === 'playing' || state === 'paused';
      this.el.hud.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    showScreen(name) {
      const screens = { menu: this.el.screenMenu, pause: this.el.screenPause, over: this.el.screenOver };
      Object.keys(screens).forEach((key) => {
        const el = screens[key];
        const on = key === name;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      if (name === 'pause') this.renderBuildSummary();
      this.hideToast();
    }

    renderBuildSummary() {
      const p = this.game && this.game.player;
      if (!p || !this.el.buildSummary) return;
      const droneLabels = { gunner: '脉冲', lance: '棱镜', aegis: '守护', swarm: '蜂群' };
      const chips = [];
      const names = WEAPON_NAMES[p.activeWeapon] || WEAPON_NAMES.pulse;
      chips.push(`<span class="is-weapon">${names[p.level - 1] || names[0]} LV.${p.level}</span>`);
      if (p.unlockedWeapons().length > 1) chips.push(`<span>武器 ${p.unlockedWeapons().length}/3</span>`);
      if (p.shieldCharges > 0) chips.push(`<span class="is-shield">护盾 ${p.shieldCharges}/3</span>`);
      if (p.reflectT > 0) chips.push(`<span class="is-shield">力场 ${Math.ceil(p.reflectT)}s</span>`);
      p.drones.forEach((d) => chips.push(`<span>僚机 ${droneLabels[d.kind] || d.kind}</span>`));
      this.el.buildSummary.innerHTML = chips.join('');
    }

    updateMenuStats() {
      this.bestValue = SF.Storage.get('best', 0);
      this.bestSectorValue = SF.Storage.get('bestSector', 1);
      this.el.menuBest.textContent = this.fmt(this.bestValue);
      this.el.menuSector.textContent = SF.pad2(this.bestSectorValue);
      this.el.hudBest.textContent = this.fmt(this.bestValue);
    }

    fmt(n) {
      return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    resetRun() {
      this.cache = { score: -1, best: -1, sector: -1, lives: -1, weapon: -1, weaponMode: '', weaponMod: '', shield: -1, nova: -1, ready: null, combo: -1, mult: -1, bossPhase: 0, bossName: '', bossPattern: '' };
      this.el.bossPanel.hidden = true;
      this.el.comboBox.classList.remove('is-live');
      this.el.hint.classList.remove('is-show');
      this.el.announce.classList.remove('is-show');
      if (this.announceTimer) clearTimeout(this.announceTimer);
      if (this.hintTimer) clearTimeout(this.hintTimer);
      this.updateMenuStats();
    }

    update(game) {
      const el = this.el;
      const p = game.player;
      const score = game.score;
      if (score !== this.cache.score) {
        el.score.textContent = this.fmt(score);
        this.cache.score = score;
      }
      const best = Math.max(this.bestValue, score);
      if (best !== this.cache.best) {
        el.best.textContent = this.fmt(best);
        this.cache.best = best;
      }
      if (game.sector !== this.cache.sector) {
        el.sector.textContent = SF.pad2(game.sector);
        const info = SF.sectorInfo(game.sector);
        el.sectorName.textContent = info.name;
        this.cache.sector = game.sector;
      }
      if (game.lives !== this.cache.lives) {
        this.renderLives(game.lives);
        this.cache.lives = game.lives;
      }
      if (p && (p.level !== this.cache.weapon || p.activeWeapon !== this.cache.weaponMode)) {
        const names = WEAPON_NAMES[p.activeWeapon] || WEAPON_NAMES.pulse;
        el.weaponName.textContent = names[Math.min(p.level - 1, 4)];
        Array.from(el.weaponPips.children).forEach((b, i) => b.classList.toggle('is-on', i < p.level));
        el.weaponChip.disabled = p.unlockedWeapons().length < 2;
        this.cache.weapon = p.level;
        this.cache.weaponMode = p.activeWeapon;
      }
      if (p) {
        const unlocked = p.unlockedWeapons().length;
        const mod = unlocked > 1 ? '切换 ' + unlocked + ' 种' : '';
        if (mod !== this.cache.weaponMod) {
          this.cache.weaponMod = mod;
          el.weaponMod.hidden = !mod;
          el.weaponMod.textContent = mod;
        }
        if (p.shieldCharges !== this.cache.shield) {
          this.cache.shield = p.shieldCharges;
          el.shieldChip.hidden = p.shieldCharges <= 0;
          Array.from(el.shieldPips.children).forEach((b, i) => b.classList.toggle('is-on', i < p.shieldCharges));
        }
        const novaRounded = Math.round(p.nova);
        if (novaRounded !== this.cache.nova) {
          el.novaPct.textContent = novaRounded + '%';
          el.novaFill.style.width = p.nova + '%';
          this.cache.nova = novaRounded;
        }
        const ready = p.nova >= 100 && p.overdrive <= 0;
        if (ready !== this.cache.ready) {
          el.novaCluster.classList.toggle('is-ready', ready);
          el.btnNova.classList.toggle('is-ready', ready);
          this.cache.ready = ready;
        }
        const dashRatio = Math.max(0, 1 - p.dashCd / 1.7);
        el.dashFill.style.transform = 'scaleX(' + dashRatio + ')';
        el.btnDash.classList.toggle('is-cooling', p.dashCd > 0.05);
        el.btnDash.style.opacity = p.dashCd > 0.05 ? '0.4' : '';
      }

      if (game.combo > 0) {
        el.comboBox.classList.add('is-live');
        if (game.combo !== this.cache.combo) {
          el.comboCount.textContent = game.combo;
          this.cache.combo = game.combo;
          el.comboBox.classList.add('is-pop');
          if (this.comboPopTimer) clearTimeout(this.comboPopTimer);
          this.comboPopTimer = setTimeout(() => el.comboBox.classList.remove('is-pop'), 130);
        }
        const mult = game.multiplier();
        if (mult !== this.cache.mult) {
          el.comboMult.textContent = '×' + mult;
          this.cache.mult = mult;
        }
        el.comboFill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, game.comboTimer / game.comboMax)) + ')';
      } else {
        if (this.cache.combo !== 0) {
          el.comboBox.classList.remove('is-live');
          this.cache.combo = 0;
          el.comboCount.textContent = '0';
          this.cache.mult = -1;
        }
      }

      // boss bar
      el.comboBox.classList.toggle('is-boss', !!game.boss);
      if (game.boss) {
        const b = game.boss;
        if (el.bossPanel.hidden) el.bossPanel.hidden = false;
        const title = b.title + ' // ' + b.en;
        if (this.cache.bossName !== b.name + b.sector) {
          el.bossName.textContent = b.name;
          el.bossTitle.textContent = title;
          this.cache.bossName = b.name + b.sector;
        }
        const fill = Math.max(0, b.hp / b.maxHp);
        el.bossFill.style.transform = 'scaleX(' + fill + ')';
        const phaseTag = 'P' + b.phase + (b.desperate ? ' · 临界' : '');
        if (b.phase !== this.cache.bossPhase || this.cache.bossDesperate !== !!b.desperate) {
          el.bossPhase.textContent = phaseTag;
          el.bossPhase.classList.toggle('is-critical', !!b.desperate);
          this.cache.bossPhase = b.phase;
          this.cache.bossDesperate = !!b.desperate;
        }
        const pattern = b.attack ? (b.attackLabel || '') : (b.mercy > 0 ? '核心重载' : '蓄招');
        if (pattern !== this.cache.bossPattern) {
          el.bossPattern.textContent = pattern;
          el.bossPattern.classList.toggle('is-live', !!pattern);
          this.cache.bossPattern = pattern;
        }
      } else if (!el.bossPanel.hidden) {
        el.bossPanel.hidden = true;
        el.bossPattern.textContent = '';
        this.cache.bossPattern = '';
      }
    }

    renderLives(lives) {
      const slots = Math.max(3, lives);
      const wrap = this.el.lives;
      const prev = wrap.children.length;
      if (prev !== slots) {
        wrap.innerHTML = '';
        for (let i = 0; i < slots; i++) {
          const s = document.createElement('span');
          s.className = 'life';
          if (i === slots - 1 && slots > prev) s.classList.add('is-new');
          wrap.appendChild(s);
        }
      }
      Array.from(wrap.children).forEach((el, i) => {
        el.classList.toggle('is-empty', i >= lives);
      });
    }

    announce(title, sub, opts) {
      opts = opts || {};
      const el = this.el;
      el.announceTitle.textContent = title;
      el.announceSub.textContent = sub || '';
      el.announce.classList.toggle('is-alert', !!opts.alert);
      el.announce.classList.add('is-show');
      el.hint.classList.remove('is-show');
      if (this.announceTimer) clearTimeout(this.announceTimer);
      this.announceTimer = setTimeout(() => {
        el.announce.classList.remove('is-show');
      }, opts.duration || 2400);
    }

    hideAnnounce() {
      this.el.announce.classList.remove('is-show');
      if (this.announceTimer) clearTimeout(this.announceTimer);
    }

    hint(html, duration) {
      const el = this.el;
      el.hint.innerHTML = html;
      el.hint.classList.add('is-show');
      if (this.hintTimer) clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => el.hint.classList.remove('is-show'), duration || 3800);
    }

    hideHint() {
      this.el.hint.classList.remove('is-show');
      if (this.hintTimer) clearTimeout(this.hintTimer);
    }

    toast(msg) {
      const el = this.el.toast;
      el.textContent = msg;
      el.classList.add('is-show');
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => el.classList.remove('is-show'), 1800);
    }

    hideToast() {
      this.el.toast.classList.remove('is-show');
    }

    applySettings() {
      const s = this.game.settings;
      this.el.toggleSound.classList.toggle('is-on', !!s.sound);
      this.el.toggleSound.setAttribute('aria-checked', s.sound ? 'true' : 'false');
      this.el.toggleShake.classList.toggle('is-on', !!s.shake);
      this.el.toggleShake.setAttribute('aria-checked', s.shake ? 'true' : 'false');
      this.el.toggleFx.classList.toggle('is-on', !!s.lowFx);
      this.el.toggleFx.setAttribute('aria-checked', s.lowFx ? 'true' : 'false');
      if (this.el.toggleHaptic) {
        this.el.toggleHaptic.classList.toggle('is-on', s.haptic !== false);
        this.el.toggleHaptic.setAttribute('aria-checked', s.haptic !== false ? 'true' : 'false');
      }
      document.body.classList.toggle('reduce-fx', !!s.lowFx);
      this.el.novaKey.textContent = 'X';
    }

    showResult(data) {
      this.el.finalScore.textContent = this.fmt(data.score);
      this.el.finalSector.textContent = SF.pad2(data.sector);
      this.el.finalKills.textContent = this.fmt(data.kills);
      this.el.finalChain.textContent = data.maxCombo;
      this.el.finalTime.textContent = SF.fmtTime(data.time);
      this.el.newRecord.hidden = !data.newRecord;
      const rank = data.score >= 120000 || data.sector >= 8 ? 'S'
        : data.score >= 60000 || data.sector >= 5 ? 'A'
        : data.score >= 22000 || data.sector >= 3 ? 'B' : 'C';
      this.el.resultRank.textContent = rank;
      this.el.resultRank.className = 'result-rank rank-' + rank.toLowerCase();
      const flavors = [
        '信号消失在裂隙深处。',
        '深空收回了你的航迹。',
        '战机沉默，星光仍在。',
        '下一次，穿过那道裂隙。',
      ];
      this.el.overSub.textContent = data.newRecord ? '新的巡航纪录已写入星图。' : flavors[data.sector % flavors.length];
      this.updateMenuStats();
    }

    bossWarn() {
      this.el.bossPanel.hidden = true;
    }

    onOverdriveEnd() {
      this.toast('星爆超频结束');
    }
  }

  SF.UI = new UI();
})();
