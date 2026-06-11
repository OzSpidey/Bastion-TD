// Bastion TD — game engine: simulation, pathfinding, combat, rendering.

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function cellKey(c, r) { return c + ',' + r; }

// Deterministic RNG for daily challenges / wave generation.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ============ Sound (tiny WebAudio synth, no assets) ============
const Sound = {
  on: true, ctx: null, last: {},
  presets: {
    shoot:   [520, 220, 0.07, 'square', 0.025],
    boom:    [160, 40, 0.25, 'sawtooth', 0.07],
    build:   [330, 660, 0.12, 'triangle', 0.06],
    sell:    [440, 220, 0.15, 'triangle', 0.06],
    upgrade: [440, 880, 0.18, 'triangle', 0.07],
    leak:    [300, 80, 0.4, 'sawtooth', 0.09],
    wave:    [523, 784, 0.25, 'sine', 0.06],
    zap:     [900, 1400, 0.06, 'square', 0.025],
    cash:    [880, 1320, 0.1, 'sine', 0.05],
    lose:    [220, 55, 1.0, 'sawtooth', 0.1],
    win:     [523, 1046, 0.6, 'sine', 0.08],
    freeze:  [1200, 400, 0.3, 'sine', 0.06],
  },
  play(name) {
    if (!this.on) return;
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 50) return;
    this.last[name] = now;
    const p = this.presets[name] || [440, 440, 0.1, 'sine', 0.05];
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.connect(g); g.connect(this.ctx.destination);
    o.type = p[3];
    o.frequency.setValueAtTime(p[0], t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, p[1]), t + p[2]);
    g.gain.setValueAtTime(p[4], t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
    o.start(t); o.stop(t + p[2] + 0.02);
  },
};

const TARGET_MODES = ['First', 'Last', 'Strong', 'Close'];

// ============ Enemy ============
class Enemy {
  constructor(game, typeId, opts = {}) {
    this.game = game;
    this.type = typeId;
    this.def = ENEMIES[typeId];
    const hpMul = opts.hpMul != null ? opts.hpMul : game.hpScaleFor(game.wave);
    this.maxHp = Math.round(this.def.hp * hpMul);
    this.hp = this.maxHp;
    this.hpMul = hpMul;
    this.pathIndex = opts.pathIndex || 0;
    this.dead = false;
    this.finished = false;
    this.slowPct = 0; this.slowT = 0;
    this.stunT = 0;
    this.poisonDps = 0; this.poisonT = 0; this.poisonSpread = false;
    this.burnDps = 0; this.burnT = 0;
    this.shred = 0;
    this.markT = 0; this.markPct = 0;
    this.revealed = false;

    if (game.isMaze) {
      const spawn = game.map.spawns[this.pathIndex % game.map.spawns.length];
      this.x = opts.x != null ? opts.x : (spawn[0] + 0.5) * CELL;
      this.y = opts.y != null ? opts.y : (spawn[1] + 0.5) * CELL;
      this.tx = null; this.ty = null;
    } else {
      this.d = opts.d != null ? opts.d : 0;
      const p = game.pathPosAt(this.pathIndex, this.d);
      this.x = p.x; this.y = p.y;
    }
  }

  get cellC() { return clamp(Math.floor(this.x / CELL), 0, COLS - 1); }
  get cellR() { return clamp(Math.floor(this.y / CELL), 0, ROWS - 1); }

  get progress() {
    const g = this.game;
    if (!g.isMaze) return this.d;
    if (this.def.flying) return -dist(this.x, this.y, g.exitPx.x, g.exitPx.y);
    const f = g.flow[this.cellR * COLS + this.cellC];
    return -(isFinite(f) ? f : 9999) * CELL;
  }

  effSpeed() {
    let s = this.def.speed * this.game.speedMul;
    if (this.slowT > 0) s *= (1 - this.slowPct);
    return s;
  }

  update(dt) {
    const g = this.game;
    if (this.def.regen) this.hp = Math.min(this.maxHp, this.hp + this.def.regen * dt);
    if (this.poisonT > 0) { this.poisonT -= dt; this.hp -= this.poisonDps * dt; }
    if (this.burnT > 0) { this.burnT -= dt; this.hp -= this.burnDps * dt; }
    if (this.hp <= 0) { this.die(); return; }
    if (this.slowT > 0) this.slowT -= dt;
    if (this.markT > 0) this.markT -= dt;
    if (this.stunT > 0) { this.stunT -= dt; return; }

    const sp = this.effSpeed() * dt;
    if (!g.isMaze) {
      this.d += sp;
      if (this.d >= g.pathLens[this.pathIndex]) { this.leak(); return; }
      const p = g.pathPosAt(this.pathIndex, this.d);
      this.x = p.x; this.y = p.y;
    } else if (this.def.flying) {
      const ex = g.exitPx.x, ey = g.exitPx.y;
      const dd = dist(this.x, this.y, ex, ey);
      if (dd < 6) { this.leak(); return; }
      this.x += (ex - this.x) / dd * sp;
      this.y += (ey - this.y) / dd * sp;
    } else {
      if (this.tx == null) this.pickNext();
      if (this.tx == null) return;
      const dd = dist(this.x, this.y, this.tx, this.ty);
      if (dd <= sp + 0.5) {
        this.x = this.tx; this.y = this.ty;
        const c = this.cellC, r = this.cellR;
        if (c === g.exitCell[0] && r === g.exitCell[1]) { this.leak(); return; }
        this.pickNext();
      } else {
        this.x += (this.tx - this.x) / dd * sp;
        this.y += (this.ty - this.y) / dd * sp;
      }
    }
  }

  pickNext() {
    const g = this.game;
    const c = this.cellC, r = this.cellR;
    const cur = g.flow[r * COLS + c];
    let best = null, bestD = isFinite(cur) ? cur : Infinity;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dc, dr] of dirs) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const f = g.flow[nr * COLS + nc];
      if (f < bestD) { bestD = f; best = [nc, nr]; }
    }
    if (best) {
      this.tx = (best[0] + 0.5) * CELL;
      this.ty = (best[1] + 0.5) * CELL;
    } else if (cur === 0) {
      this.tx = (c + 0.5) * CELL; this.ty = (r + 0.5) * CELL;
    } else {
      // No path (should not happen thanks to placement checks): drift to exit.
      this.tx = this.game.exitPx.x; this.ty = this.game.exitPx.y;
    }
  }

  damage(amount, opts = {}) {
    if (this.dead || this.finished) return;
    let dealt;
    if (opts.ignoreArmor) {
      dealt = amount;
    } else {
      const armor = Math.max(0, (this.def.armor || 0) - this.shred - (opts.pierce || 0));
      dealt = Math.max(1, amount - armor);
    }
    if (this.markT > 0) dealt *= (1 + this.markPct);
    this.hp -= dealt;
    if (opts.armorShred) this.shred = Math.min((this.def.armor || 0), this.shred + opts.armorShred);
    if (this.hp <= 0) this.die();
  }

  applySlow(pct, dur) {
    if (pct >= this.slowPct || this.slowT <= 0) { this.slowPct = pct; this.slowT = Math.max(this.slowT, dur); }
  }
  applyPoison(dps, dur, spread) {
    if (dps >= this.poisonDps) { this.poisonDps = dps; this.poisonT = dur; if (spread) this.poisonSpread = true; }
  }
  applyBurn(dps, dur) {
    if (dps >= this.burnDps) { this.burnDps = dps; this.burnT = dur; }
  }

  die() {
    if (this.dead || this.finished) return;
    this.dead = true;
    const g = this.game;
    const reward = Math.round(this.def.bounty * g.bountyScale());
    g.cash += reward;
    g.stats.kills++;
    g.stats.cashEarned += reward;
    if (this.def.boss) { g.stats.bossKills++; g.emit('onAch', 'bossKill'); Sound.play('boom'); }
    g.addFx({ type: 'boom', x: this.x, y: this.y, t: 0, dur: 0.3, r: this.def.radius * 2.2, color: this.def.color });
    if (this.def.spawnOnDeath) {
      const sd = this.def.spawnOnDeath;
      for (let i = 0; i < sd.count; i++) {
        const child = new Enemy(g, sd.type, {
          pathIndex: this.pathIndex, hpMul: this.hpMul,
          d: !g.isMaze ? Math.max(0, this.d - 8 - i * 10) : undefined,
          x: g.isMaze ? this.x + (Math.random() - 0.5) * 18 : undefined,
          y: g.isMaze ? this.y + (Math.random() - 0.5) * 18 : undefined,
        });
        g.enemies.push(child);
      }
    }
    if (this.poisonT > 0 && this.poisonSpread) {
      for (const e of g.enemies) {
        if (e === this || e.dead || e.finished) continue;
        if (dist2(e.x, e.y, this.x, this.y) < 60 * 60) e.applyPoison(this.poisonDps, 3, true);
      }
      g.addFx({ type: 'ring', x: this.x, y: this.y, t: 0, dur: 0.4, r: 60, color: '#a3e635' });
    }
  }

  leak() {
    if (this.dead || this.finished) return;
    this.finished = true;
    this.game.leak(this);
  }
}

// ============ Tower ============
class Tower {
  constructor(game, typeId, cx, cy, cost) {
    this.game = game;
    this.type = typeId;
    this.def = TOWERS[typeId];
    this.cx = cx; this.cy = cy;
    this.x = (cx + 0.5) * CELL; this.y = (cy + 0.5) * CELL;
    this.levels = [0, 0];
    this.spent = cost;
    this.cooldown = 0.3;
    this.targetMode = 0;
    this.aura = { dmg: 0, rate: 0, range: 0 };
    this.recompute();
  }

  recompute() {
    const s = {
      range: 0, rate: 1, dmg: 0, projSpeed: 400, canAir: true,
      pierce: 0, splash: 0, chain: 0, chainRange: 90,
      slowPct: 0, slowDur: 0, poisonDps: 0, poisonDur: 0,
      burnDps: 0, burnDur: 0, critCh: 0, stunCh: 0, stunDur: 0,
      armorShred: 0, seesStealth: false, ignoreArmor: false,
      income: 0, interestPct: 0, buffDmg: 0, buffRate: 0, buffRange: 0,
      multishot: 1, markPct: 0, markDur: 0, bonusVsAir: 1, spreadOnDeath: false,
    };
    Object.assign(s, this.def.base);
    for (let p = 0; p < 2; p++) {
      for (let i = 0; i < this.levels[p]; i++) this.def.paths[p].tiers[i].mod(s);
    }
    this.stats = s;
  }

  get effRange() { return this.stats.range * this.game.bonuses.rangeMul * (1 + this.aura.range); }
  get effDmg() { return this.stats.dmg * this.game.bonuses.dmgMul * (1 + this.aura.dmg); }
  get effRate() {
    let r = this.stats.rate / (1 + this.aura.rate);
    if (this.game.overclockT > 0) r *= 0.5;
    return r;
  }

  canTarget(e) {
    if (e.dead || e.finished) return false;
    if (e.def.flying && !this.stats.canAir) return false;
    if (e.def.stealth && !e.revealed && !this.stats.seesStealth) return false;
    return true;
  }

  acquire(n) {
    const r2 = this.effRange * this.effRange;
    const cands = this.game.enemies.filter(e => this.canTarget(e) && dist2(this.x, this.y, e.x, e.y) <= r2);
    if (!cands.length) return [];
    const mode = TARGET_MODES[this.targetMode];
    cands.sort((a, b) => {
      if (mode === 'First') return b.progress - a.progress;
      if (mode === 'Last') return a.progress - b.progress;
      if (mode === 'Strong') return b.hp - a.hp;
      return dist2(this.x, this.y, a.x, a.y) - dist2(this.x, this.y, b.x, b.y);
    });
    return cands.slice(0, n);
  }

  update(dt) {
    const k = this.def.kind;
    if (k === 'income' || k === 'support') return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (this.fire()) this.cooldown = this.effRate;
    else this.cooldown = 0.05;
  }

  fire() {
    const g = this.game, s = this.stats, k = this.def.kind;
    if (k === 'pulse') {
      const targets = this.acquire(999);
      if (!targets.length) return false;
      for (const e of targets) {
        e.applySlow(s.slowPct, s.slowDur);
        if (s.stunCh > 0 && Math.random() < s.stunCh) e.stunT = Math.max(e.stunT, s.stunDur);
        e.damage(this.effDmg, { pierce: s.pierce });
      }
      g.addFx({ type: 'ring', x: this.x, y: this.y, t: 0, dur: 0.35, r: this.effRange, color: '#7dd3fc' });
      Sound.play('freeze');
      return true;
    }
    if (k === 'chain') {
      const first = this.acquire(1)[0];
      if (!first) return false;
      const hit = [first];
      let cur = first;
      while (hit.length < s.chain) {
        let next = null, bd = s.chainRange * s.chainRange;
        for (const e of g.enemies) {
          if (hit.includes(e) || !this.canTarget(e)) continue;
          const d2 = dist2(cur.x, cur.y, e.x, e.y);
          if (d2 <= bd) { bd = d2; next = e; }
        }
        if (!next) break;
        hit.push(next); cur = next;
      }
      const pts = [[this.x, this.y]];
      for (const e of hit) {
        pts.push([e.x, e.y]);
        if (s.stunCh > 0 && Math.random() < s.stunCh) e.stunT = Math.max(e.stunT, s.stunDur);
        e.damage(this.effDmg, { pierce: s.pierce });
      }
      g.addFx({ type: 'zap', pts, t: 0, dur: 0.12 });
      Sound.play('zap');
      return true;
    }
    if (k === 'hitscan') {
      const e = this.acquire(1)[0];
      if (!e) return false;
      let dmg = this.effDmg;
      const crit = s.critCh > 0 && Math.random() < s.critCh;
      if (crit) dmg *= 3;
      if (s.markPct > 0) { e.markT = s.markDur; e.markPct = s.markPct; }
      e.damage(dmg, { pierce: s.pierce });
      g.addFx({ type: 'tracer', x1: this.x, y1: this.y, x2: e.x, y2: e.y, t: 0, dur: 0.09, color: crit ? '#fbbf24' : '#fde68a' });
      if (crit) g.addFx({ type: 'text', x: e.x, y: e.y - 14, t: 0, dur: 0.7, str: 'CRIT!', color: '#fbbf24' });
      Sound.play('shoot');
      return true;
    }
    // bullet / shell / missile: projectiles
    const n = (k === 'missile') ? s.multishot : 1;
    const shots = (k === 'shell') ? s.multishot : 1;
    const targets = this.acquire(Math.max(n, 1));
    if (!targets.length) return false;
    for (let i = 0; i < Math.max(n, shots); i++) {
      const tgt = targets[i % targets.length];
      g.projectiles.push(new Projectile(g, this, tgt, i * 6));
    }
    Sound.play('shoot');
    return true;
  }
}

// ============ Projectile ============
class Projectile {
  constructor(game, tower, target, jitter = 0) {
    this.game = game;
    this.tower = tower;
    this.target = target;
    this.x = tower.x + (Math.random() - 0.5) * jitter;
    this.y = tower.y + (Math.random() - 0.5) * jitter;
    this.speed = tower.stats.projSpeed;
    this.kind = tower.def.kind;
    this.dead = false;
    this.lastX = target.x; this.lastY = target.y;
  }

  update(dt) {
    const t = this.target;
    if (t && !t.dead && !t.finished) { this.lastX = t.x; this.lastY = t.y; }
    else if (!(this.tower.stats.splash > 0)) { this.dead = true; return; }
    const dd = dist(this.x, this.y, this.lastX, this.lastY);
    const step = this.speed * dt;
    if (dd <= step + 6) { this.hit(); return; }
    this.x += (this.lastX - this.x) / dd * step;
    this.y += (this.lastY - this.y) / dd * step;
  }

  hit() {
    this.dead = true;
    const g = this.game, s = this.tower.stats, tw = this.tower;
    const dmg = tw.effDmg;
    const opts = { pierce: s.pierce, ignoreArmor: s.ignoreArmor, armorShred: s.armorShred };
    if (s.splash > 0) {
      g.addFx({ type: 'boom', x: this.lastX, y: this.lastY, t: 0, dur: 0.3, r: s.splash, color: '#fca5a5' });
      Sound.play('boom');
      for (const e of g.enemies) {
        if (e.dead || e.finished) continue;
        if (e.def.flying && !s.canAir) continue;
        if (dist2(e.x, e.y, this.lastX, this.lastY) <= (s.splash + e.def.radius) * (s.splash + e.def.radius)) {
          let d = dmg;
          if (e.def.flying && s.bonusVsAir > 1) d *= s.bonusVsAir;
          e.damage(d, opts);
          if (s.burnDps > 0) e.applyBurn(s.burnDps, s.burnDur);
        }
      }
    } else {
      const e = this.target;
      if (e && !e.dead && !e.finished) {
        let d = dmg;
        if (e.def.flying && s.bonusVsAir > 1) d *= s.bonusVsAir;
        e.damage(d, opts);
        if (s.poisonDps > 0) e.applyPoison(s.poisonDps, s.poisonDur, s.spreadOnDeath);
        if (s.burnDps > 0) e.applyBurn(s.burnDps, s.burnDur);
      }
    }
  }
}

// ============ Game ============
class Game {
  constructor(opts) {
    this.map = opts.map;
    this.mode = opts.mode;
    this.difficulty = opts.difficulty || null;
    this.bonuses = opts.bonuses;
    this.events = opts.events || {};
    this.rng = mulberry32(opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0);
    this.isMaze = this.map.type === 'maze';

    // mode setup
    this.speedMul = 1; this.hpMul = 1; this.costMul = 1; this.bountyMul = 1; this.countMul = 1;
    let lives = 20, cash = 220;
    this.totalWaves = null;
    if (this.mode === 'campaign') {
      const d = this.difficulty;
      this.totalWaves = d.waves; lives = d.lives; cash = d.cash; this.hpMul = d.hpMul;
    } else if (this.mode === 'bossrush') {
      this.totalWaves = 15; cash = 420;
    } else if (this.mode === 'daily') {
      this.totalWaves = 25;
    } else if (this.mode === 'sandbox') {
      lives = 999; cash = 99999;
    }
    this.cash = cash + (this.mode === 'sandbox' ? 0 : this.bonuses.startCash);
    this.lives = lives + (this.mode === 'sandbox' ? 0 : this.bonuses.startLives);
    this.modifiers = (opts.modifierIds || []).map(id => MODIFIERS.find(m => m.id === id)).filter(Boolean);
    for (const m of this.modifiers) m.apply(this);
    this.startLives = this.lives;

    // state
    this.wave = 0;
    this.waveActive = false;
    this.waveTime = 0;
    this.autoTimer = 0; // 0 = waiting for player to send first wave
    this.enemies = [];
    this.towers = [];
    this.towerGrid = new Map();
    this.projectiles = [];
    this.fx = [];
    this.spawnQueue = [];
    this.over = false; this.won = false;
    this.paused = false;
    this.time = 0;
    this.selected = null;
    this.buildType = null;
    this.armedAbility = null;
    this.mouse = { x: -100, y: -100 };
    this.overclockT = 0;
    this.cds = {}; ABILITIES.forEach(a => { this.cds[a.id] = 0; });
    this.stats = { kills: 0, bossKills: 0, cashEarned: 0, leaks: 0 };
    this.richEmitted = false;

    // terrain precompute
    this.blockedSet = new Set((this.map.blocked || []).map(([c, r]) => cellKey(c, r)));
    if (this.isMaze) {
      this.exitCell = this.map.exit;
      this.exitPx = { x: (this.exitCell[0] + 0.5) * CELL, y: (this.exitCell[1] + 0.5) * CELL };
      this.flow = this.computeFlow();
    } else {
      this.pathsPx = this.map.paths.map(wps => wps.map(([c, r]) => [(c + 0.5) * CELL, (r + 0.5) * CELL]));
      this.pathLens = [];
      this.pathCum = [];
      for (const pts of this.pathsPx) {
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
        this.pathCum.push(cum);
        this.pathLens.push(cum[cum.length - 1]);
      }
      this.pathCells = new Set();
      for (const wps of this.map.paths) {
        for (let i = 1; i < wps.length; i++) {
          const [c1, r1] = wps[i - 1], [c2, r2] = wps[i];
          const dc = Math.sign(c2 - c1), dr = Math.sign(r2 - r1);
          let c = c1, r = r1;
          while (true) {
            if (c >= 0 && r >= 0 && c < COLS && r < ROWS) this.pathCells.add(cellKey(c, r));
            if (c === c2 && r === r2) break;
            c += dc; r += dr;
          }
        }
      }
    }
    this.terrain = this.renderTerrain();
  }

  emit(name, ...args) { if (this.events[name]) this.events[name](...args); }

  // ---- maze flow field (BFS from exit) ----
  computeFlow(extraKey = null) {
    const flow = new Array(COLS * ROWS).fill(Infinity);
    const [ec, er] = this.exitCell;
    const open = [[ec, er]];
    flow[er * COLS + ec] = 0;
    const walkable = (c, r) => {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
      const k = cellKey(c, r);
      if (this.blockedSet.has(k) || this.towerGrid.has(k) || k === extraKey) return false;
      return true;
    };
    let head = 0;
    while (head < open.length) {
      const [c, r] = open[head++];
      const d = flow[r * COLS + c];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (!walkable(nc, nr)) continue;
        if (flow[nr * COLS + nc] > d + 1) { flow[nr * COLS + nc] = d + 1; open.push([nc, nr]); }
      }
    }
    return flow;
  }

  rebuildFlow() {
    this.flow = this.computeFlow();
    for (const e of this.enemies) { if (!e.def.flying) { e.tx = null; e.ty = null; } }
  }

  pathPosAt(pathIndex, d) {
    const pts = this.pathsPx[pathIndex], cum = this.pathCum[pathIndex];
    if (d <= 0) return { x: pts[0][0], y: pts[0][1] };
    for (let i = 1; i < pts.length; i++) {
      if (d <= cum[i]) {
        const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
        return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t };
      }
    }
    const last = pts[pts.length - 1];
    return { x: last[0], y: last[1] };
  }

  // ---- building ----
  towerCost(typeId) { return Math.round(TOWERS[typeId].cost * this.costMul); }

  canPlace(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    const k = cellKey(c, r);
    if (this.towerGrid.has(k) || this.blockedSet.has(k)) return false;
    if (!this.isMaze) return !this.pathCells.has(k);
    if (c === this.exitCell[0] && r === this.exitCell[1]) return false;
    for (const s of this.map.spawns) if (s[0] === c && s[1] === r) return false;
    // never allow a placement that seals the maze for spawns or live ground enemies
    const f = this.computeFlow(k);
    for (const s of this.map.spawns) if (!isFinite(f[s[1] * COLS + s[0]])) return false;
    for (const e of this.enemies) {
      if (e.def.flying || e.dead || e.finished) continue;
      if (e.cellC === c && e.cellR === r) return false;
      if (!isFinite(f[e.cellR * COLS + e.cellC])) return false;
    }
    return true;
  }

  place(typeId, c, r) {
    const cost = this.towerCost(typeId);
    if (this.cash < cost || !this.canPlace(c, r)) return false;
    this.cash -= cost;
    const t = new Tower(this, typeId, c, r, cost);
    this.towers.push(t);
    this.towerGrid.set(cellKey(c, r), t);
    if (this.isMaze) this.rebuildFlow();
    Sound.play('build');
    return true;
  }

  sell(t) {
    const refund = Math.floor(t.spent * this.bonuses.sellRate);
    this.cash += refund;
    this.towers = this.towers.filter(x => x !== t);
    this.towerGrid.delete(cellKey(t.cx, t.cy));
    if (this.selected === t) this.selected = null;
    if (this.isMaze) this.rebuildFlow();
    this.addFx({ type: 'text', x: t.x, y: t.y, t: 0, dur: 0.8, str: '+$' + refund, color: '#fbbf24' });
    Sound.play('sell');
  }

  upgrade(t, p) {
    const lvl = t.levels[p];
    const tiers = t.def.paths[p].tiers;
    if (lvl >= tiers.length) return false;
    const cost = Math.round(tiers[lvl].cost * this.costMul);
    if (this.cash < cost) return false;
    this.cash -= cost;
    t.levels[p]++;
    t.spent += cost;
    t.recompute();
    if (t.levels[0] >= 3 && t.levels[1] >= 3) this.emit('onAch', 'maxTower');
    Sound.play('upgrade');
    return true;
  }

  // ---- waves ----
  hpScaleFor(n) {
    return this.hpMul * (1 + 0.10 * (n - 1)) * Math.pow(1.035, Math.max(0, n - 15));
  }
  bountyScale() {
    return Math.max(0.35, 1 - 0.012 * this.wave) * this.bonuses.bountyMul * this.bountyMul;
  }

  genWave(n) {
    const entries = [];
    const rng = this.rng;
    let spawnCounter = 0;
    const nPaths = this.isMaze ? this.map.spawns.length : this.map.paths.length;
    const push = (t, type) => entries.push({ t, type, pathIndex: (spawnCounter++) % nPaths });

    let budget = Math.round((40 + 22 * n + 1.1 * n * n) * this.countMul);
    let t = 0.5;

    if (this.mode === 'bossrush') {
      const bossType = (n % 2 === 0) ? 'wyvern' : 'juggernaut';
      const bosses = 1 + Math.floor(n / 6);
      for (let i = 0; i < bosses; i++) push(2 + i * 4, bossType);
      budget = Math.round(budget * 0.6);
      t = 4;
    } else if (n % 10 === 0) {
      const bossType = ((n / 10) % 2 === 1) ? 'juggernaut' : 'wyvern';
      push(2, bossType);
      budget = Math.round(budget * 0.55);
      t = 4;
    }

    const avail = Object.keys(ENEMIES).filter(k => !ENEMIES[k].boss && ENEMIES[k].minWave <= n);
    let guard = 0;
    while (budget > 0 && guard++ < 200) {
      const type = avail[Math.floor(rng() * avail.length)];
      const def = ENEMIES[type];
      const maxCount = Math.max(1, Math.ceil(budget / def.wcost));
      const count = Math.min(maxCount, (def.packs ? 6 : 3) + Math.floor(rng() * (def.packs ? 8 : 5)));
      const gap = def.packs ? 0.3 : 0.5 + rng() * 0.35;
      for (let i = 0; i < count; i++) { push(t, type); t += gap; }
      t += 1.1;
      budget -= count * def.wcost;
    }
    entries.sort((a, b) => a.t - b.t);
    return entries;
  }

  startWave() {
    if (this.waveActive || this.over) return;
    if (this.autoTimer > 0 && this.wave > 0) {
      const bonus = Math.floor(this.autoTimer * 2);
      if (bonus > 0) {
        this.cash += bonus;
        this.addFx({ type: 'text', x: COLS * CELL / 2, y: 60, t: 0, dur: 1.2, str: 'Early bonus +$' + bonus, color: '#4ade80' });
      }
    }
    this.autoTimer = 0;
    this.wave++;
    // bank income + interest at wave start
    let income = 0, pct = this.bonuses.interest;
    for (const tw of this.towers) { income += tw.stats.income; pct += tw.stats.interestPct; }
    if (income > 0 || pct > 0) {
      const interest = Math.min(500, Math.floor(this.cash * pct));
      const total = income + interest;
      if (total > 0) {
        this.cash += total;
        this.addFx({ type: 'text', x: COLS * CELL / 2, y: 84, t: 0, dur: 1.2, str: 'Income +$' + total, color: '#fbbf24' });
        Sound.play('cash');
      }
    }
    this.spawnQueue = this.genWave(this.wave);
    this.waveActive = true;
    this.waveTime = 0;
    const isBoss = this.mode === 'bossrush' || this.wave % 10 === 0;
    this.addFx({ type: 'text', x: COLS * CELL / 2, y: CELL * ROWS / 2 - 30, t: 0, dur: 1.5, str: (isBoss ? '☠ BOSS ' : '') + 'WAVE ' + this.wave, color: isBoss ? '#ff5577' : '#e2e8f0', big: true });
    Sound.play('wave');
    this.emit('onWave', this.wave);
  }

  leak(enemy) {
    this.lives -= enemy.def.lives;
    this.stats.leaks++;
    this.addFx({ type: 'flash', t: 0, dur: 0.25 });
    Sound.play('leak');
    if (this.lives <= 0 && !this.over) { this.lives = 0; this.end(false); }
  }

  damageArea(x, y, r, dmg) {
    for (const e of this.enemies) {
      if (e.dead || e.finished) continue;
      if (dist2(e.x, e.y, x, y) <= (r + e.def.radius) * (r + e.def.radius)) e.damage(dmg, { pierce: 99 });
    }
  }

  useAbility(id) {
    if (this.over || this.cds[id] > 0) return;
    const def = ABILITIES.find(a => a.id === id);
    const cd = def.cd * this.bonuses.cdMul;
    if (id === 'airstrike') {
      this.armedAbility = this.armedAbility === 'airstrike' ? null : 'airstrike';
      return;
    }
    if (id === 'frostnova') {
      for (const e of this.enemies) e.applySlow(0.6, 5);
      this.addFx({ type: 'ring', x: COLS * CELL / 2, y: ROWS * CELL / 2, t: 0, dur: 0.6, r: 600, color: '#7dd3fc' });
      Sound.play('freeze');
    } else if (id === 'overclock') {
      this.overclockT = 8;
      this.addFx({ type: 'text', x: COLS * CELL / 2, y: 110, t: 0, dur: 1.2, str: '⚙ OVERCLOCK', color: '#38bdf8' });
      Sound.play('upgrade');
    }
    this.cds[id] = cd;
  }

  castAirstrike(x, y) {
    const def = ABILITIES.find(a => a.id === 'airstrike');
    this.cds.airstrike = def.cd * this.bonuses.cdMul;
    this.armedAbility = null;
    for (let i = 0; i < 3; i++) {
      const ox = x + (Math.random() - 0.5) * 70, oy = y + (Math.random() - 0.5) * 70;
      this.damageArea(ox, oy, 60, 120);
      this.addFx({ type: 'boom', x: ox, y: oy, t: -i * 0.12, dur: 0.4, r: 60, color: '#fdba74' });
    }
    Sound.play('boom');
  }

  handleClick(px, py) {
    if (this.over) return;
    if (this.armedAbility === 'airstrike') { this.castAirstrike(px, py); return; }
    const c = Math.floor(px / CELL), r = Math.floor(py / CELL);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    const t = this.towerGrid.get(cellKey(c, r));
    if (t) { this.selected = t; this.buildType = null; return; }
    if (this.buildType) {
      if (!this.place(this.buildType, c, r)) {
        if (this.cash < this.towerCost(this.buildType)) {
          this.addFx({ type: 'text', x: px, y: py, t: 0, dur: 0.8, str: 'Need $' + this.towerCost(this.buildType), color: '#f87171' });
        }
      }
      return;
    }
    this.selected = null;
  }

  addFx(f) { this.fx.push(f); }

  end(won) {
    if (this.over) return;
    this.over = true;
    this.won = won;
    const cleared = this.waveActive ? this.wave - 1 : this.wave;
    let rp = 0;
    if (this.mode !== 'sandbox') {
      rp = cleared;
      if (won) {
        if (this.mode === 'campaign') rp += this.difficulty.rp;
        else if (this.mode === 'bossrush') rp += 25;
        else if (this.mode === 'daily') rp += 40;
      }
    }
    let stars = 0;
    if (won) {
      stars = this.lives >= this.startLives ? 3 : this.lives >= Math.ceil(this.startLives / 2) ? 2 : 1;
    }
    Sound.play(won ? 'win' : 'lose');
    this.emit('onEnd', { won, wavesCleared: cleared, rp, stars, kills: this.stats.kills, leaks: this.stats.leaks, noLeaks: this.lives >= this.startLives });
  }

  // ---- main update ----
  update(dt) {
    if (this.over || this.paused) return;
    this.time += dt;
    for (const id in this.cds) this.cds[id] = Math.max(0, this.cds[id] - dt);
    if (this.overclockT > 0) this.overclockT -= dt;

    if (!this.waveActive && this.autoTimer > 0) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) this.startWave();
    }

    if (this.waveActive) {
      this.waveTime += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveTime) {
        const s = this.spawnQueue.shift();
        this.enemies.push(new Enemy(this, s.type, { pathIndex: s.pathIndex }));
      }
    }

    // aura + stealth reveal pass
    for (const e of this.enemies) e.revealed = false;
    for (const t of this.towers) { t.aura.dmg = 0; t.aura.rate = 0; t.aura.range = 0; }
    for (const b of this.towers) {
      if (b.def.kind !== 'support') continue;
      const r2 = b.effRange * b.effRange;
      for (const t of this.towers) {
        if (t === b || t.def.kind === 'support' || t.def.kind === 'income') continue;
        if (dist2(b.x, b.y, t.x, t.y) <= r2) {
          t.aura.dmg = Math.max(t.aura.dmg, b.stats.buffDmg);
          t.aura.rate = Math.max(t.aura.rate, b.stats.buffRate);
          t.aura.range = Math.max(t.aura.range, b.stats.buffRange);
        }
      }
      for (const e of this.enemies) {
        if (dist2(b.x, b.y, e.x, e.y) <= r2) e.revealed = true;
      }
    }

    for (const e of this.enemies) { if (!e.dead && !e.finished) e.update(dt); }
    this.enemies = this.enemies.filter(e => !e.dead && !e.finished);

    for (const t of this.towers) t.update(dt);

    for (const p of this.projectiles) { if (!p.dead) p.update(dt); }
    this.projectiles = this.projectiles.filter(p => !p.dead);

    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < f.dur);

    if (!this.richEmitted && this.cash >= 5000 && this.mode !== 'sandbox') {
      this.richEmitted = true;
      this.emit('onAch', 'rich');
    }

    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      const bonus = 30 + 4 * this.wave;
      this.cash += bonus;
      this.addFx({ type: 'text', x: COLS * CELL / 2, y: 60, t: 0, dur: 1.4, str: 'Wave cleared +$' + bonus, color: '#4ade80' });
      this.emit('onWaveCleared', this.wave);
      if (this.totalWaves && this.wave >= this.totalWaves) { this.end(true); return; }
      this.autoTimer = 12;
    }
  }

  // ---- rendering ----
  renderTerrain() {
    const cv = document.createElement('canvas');
    cv.width = COLS * CELL; cv.height = ROWS * CELL;
    const x = cv.getContext('2d');
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = cellKey(c, r);
        const onPath = !this.isMaze && this.pathCells.has(k);
        if (onPath) x.fillStyle = (c + r) % 2 ? '#3d3526' : '#423a2a';
        else x.fillStyle = (c + r) % 2 ? '#131b25' : '#16202c';
        x.fillRect(c * CELL, r * CELL, CELL, CELL);
        if (this.blockedSet.has(k)) {
          x.fillStyle = '#2c3a4d';
          x.fillRect(c * CELL + 4, r * CELL + 4, CELL - 8, CELL - 8);
          x.fillStyle = '#3d506b';
          x.fillRect(c * CELL + 10, r * CELL + 10, CELL - 20, CELL - 20);
        }
      }
    }
    // grid lines
    x.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let c = 0; c <= COLS; c++) { x.beginPath(); x.moveTo(c * CELL, 0); x.lineTo(c * CELL, ROWS * CELL); x.stroke(); }
    for (let r = 0; r <= ROWS; r++) { x.beginPath(); x.moveTo(0, r * CELL); x.lineTo(COLS * CELL, r * CELL); x.stroke(); }
    // spawn / exit markers
    x.font = '22px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (this.isMaze) {
      for (const [c, r] of this.map.spawns) {
        x.fillStyle = 'rgba(74,222,128,0.25)';
        x.fillRect(c * CELL, r * CELL, CELL, CELL);
        x.fillText('🚪', (c + 0.5) * CELL, (r + 0.5) * CELL);
      }
      const [ec, er] = this.exitCell;
      x.fillStyle = 'rgba(248,113,113,0.25)';
      x.fillRect(ec * CELL, er * CELL, CELL, CELL);
      x.fillText('🌀', (ec + 0.5) * CELL, (er + 0.5) * CELL);
    } else {
      for (const pts of this.pathsPx) {
        const a = pts[0], z = pts[pts.length - 1];
        x.fillText('🚪', clamp(a[0], 20, COLS * CELL - 20), clamp(a[1], 20, ROWS * CELL - 20));
        x.fillText('🏠', clamp(z[0], 20, COLS * CELL - 20), clamp(z[1], 20, ROWS * CELL - 20));
      }
    }
    return cv;
  }

  render(ctx) {
    const W = COLS * CELL, H = ROWS * CELL;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.terrain, 0, 0);

    // build ghost
    if (this.buildType && !this.over) {
      const c = Math.floor(this.mouse.x / CELL), r = Math.floor(this.mouse.y / CELL);
      if (c >= 0 && r >= 0 && c < COLS && r < ROWS) {
        const ok = this.canPlace(c, r) && this.cash >= this.towerCost(this.buildType);
        const cx = (c + 0.5) * CELL, cy = (r + 0.5) * CELL;
        ctx.fillStyle = ok ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.20)';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        const def = TOWERS[this.buildType];
        if (def.base.range > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, def.base.range * this.bonuses.rangeMul, 0, Math.PI * 2);
          ctx.strokeStyle = ok ? 'rgba(74,222,128,0.45)' : 'rgba(248,113,113,0.45)';
          ctx.stroke();
        }
      }
    }

    // selected tower range
    if (this.selected) {
      const t = this.selected;
      if (t.stats.range > 0) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.effRange, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56,189,248,0.07)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(56,189,248,0.5)';
        ctx.stroke();
      }
    }

    // towers
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.towers) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#1f2c3d';
      ctx.fill();
      ctx.strokeStyle = this.selected === t ? '#38bdf8' : '#33455e';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = '17px serif';
      ctx.fillText(t.def.icon, t.x, t.y - 1);
      // tier pips: path A green (left), path B blue (right)
      for (let i = 0; i < t.levels[0]; i++) {
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(t.x - 14 + i * 7, t.y + 14, 5, 4);
      }
      for (let i = 0; i < t.levels[1]; i++) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(t.x + 10 - i * 7, t.y + 14, 5, 4);
      }
      if (this.overclockT > 0 && t.stats.dmg > 0) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, 21, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56,189,248,0.6)';
        ctx.stroke();
      }
    }

    // enemies
    for (const e of this.enemies) {
      const stealthHidden = e.def.stealth && !e.revealed;
      ctx.globalAlpha = stealthHidden ? 0.45 : 1;
      const yOff = e.def.flying ? -6 : 0;
      if (e.def.flying) {
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 8, e.def.radius * 0.8, e.def.radius * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(e.x, e.y + yOff, e.def.radius, 0, Math.PI * 2);
      ctx.fillStyle = e.def.color;
      ctx.fill();
      if (e.def.armor) {
        ctx.beginPath();
        ctx.arc(e.x, e.y + yOff, e.def.radius + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = e.shred >= e.def.armor ? 'rgba(148,163,184,0.25)' : '#94a3b8';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      if (e.slowT > 0) {
        ctx.beginPath();
        ctx.arc(e.x, e.y + yOff, e.def.radius - 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(125,211,252,0.5)';
        ctx.fill();
      }
      if (e.poisonT > 0) {
        ctx.beginPath();
        ctx.arc(e.x, e.y + yOff - e.def.radius, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#a3e635';
        ctx.fill();
      }
      if (e.burnT > 0) {
        ctx.beginPath();
        ctx.arc(e.x + e.def.radius * 0.6, e.y + yOff - e.def.radius, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fb923c';
        ctx.fill();
      }
      if (e.stunT > 0) {
        ctx.font = '10px serif';
        ctx.fillText('💫', e.x, e.y + yOff - e.def.radius - 8);
      }
      // hp bar
      const w = e.def.boss ? 40 : 20;
      const frac = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, e.y + yOff - e.def.radius - 7, w, 4);
      ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
      ctx.fillRect(e.x - w / 2, e.y + yOff - e.def.radius - 7, w * frac, 4);
      ctx.globalAlpha = 1;
    }

    // projectiles
    for (const p of this.projectiles) {
      ctx.beginPath();
      if (p.kind === 'missile') {
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fdba74';
      } else if (p.kind === 'shell') {
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#cbd5e1';
      } else {
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.tower.type === 'venom' ? '#a3e635' : '#fde68a';
      }
      ctx.fill();
    }

    // fx
    for (const f of this.fx) {
      if (f.t < 0) continue;
      const k = f.t / f.dur;
      if (f.type === 'ring') {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * k, 0, Math.PI * 2);
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      } else if (f.type === 'boom') {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * k), 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.globalAlpha = 0.7 * (1 - k);
        ctx.fill();
      } else if (f.type === 'zap') {
        ctx.beginPath();
        ctx.moveTo(f.pts[0][0], f.pts[0][1]);
        for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
        ctx.strokeStyle = '#e0f2fe';
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      } else if (f.type === 'tracer') {
        ctx.beginPath();
        ctx.moveTo(f.x1, f.y1);
        ctx.lineTo(f.x2, f.y2);
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = 1 - k;
        ctx.stroke();
      } else if (f.type === 'text') {
        ctx.font = f.big ? 'bold 34px "Segoe UI", sans-serif' : 'bold 13px "Segoe UI", sans-serif';
        ctx.fillStyle = f.color;
        ctx.globalAlpha = 1 - k * k;
        ctx.fillText(f.str, f.x, f.y - k * 22);
      } else if (f.type === 'flash') {
        ctx.fillStyle = 'rgba(248,113,113,' + (0.25 * (1 - k)) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
    }

    // airstrike reticle
    if (this.armedAbility === 'airstrike') {
      ctx.beginPath();
      ctx.arc(this.mouse.x, this.mouse.y, 65, 0, Math.PI * 2);
      ctx.strokeStyle = '#fbbf24';
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('AIRSTRIKE — click target', this.mouse.x, this.mouse.y - 75);
    }
  }
}
