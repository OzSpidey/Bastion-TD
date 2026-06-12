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

// ============ Art: sprite overrides + procedural vector fallback ============
// Drop transparent PNGs at www/assets/towers/<id>.png (top-down, facing right)
// or www/assets/enemies/<id>.png and they replace the built-in vector art.
const Sprites = {
  towers: {}, enemies: {}, heroes: {},
  load() {
    const tryLoad = (store, key, url) => {
      const img = new Image();
      img.onload = () => { store[key] = img; };
      img.src = url;
    };
    for (const id in TOWERS) tryLoad(this.towers, id, 'assets/towers/' + id + '.png');
    for (const id in ENEMIES) tryLoad(this.enemies, id, 'assets/enemies/' + id + '.png');
    for (const id in HEROES) tryLoad(this.heroes, id, 'assets/heroes/' + id + '.png');
  },
};
if (typeof document !== 'undefined') Sprites.load();

const TOWER_ACCENT = {
  gunner: '#cbd5e1', cannon: '#f87171', frost: '#7dd3fc', tesla: '#c084fc',
  venom: '#a3e635', sniper: '#fde68a', missile: '#fb923c', bank: '#fbbf24', beacon: '#4ade80',
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function muzzleFlash(ctx, x, y) {
  const g = ctx.createRadialGradient(x + 3, y, 0.5, x + 3, y, 8);
  g.addColorStop(0, 'rgba(255,247,192,0.85)');
  g.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x + 3, y, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff7c0';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 9, y - 4);
  ctx.lineTo(x + 6, y);
  ctx.lineTo(x + 9, y + 4);
  ctx.closePath();
  ctx.fill();
}

function iceCrystal(ctx, x, y, s) {
  const g = ctx.createLinearGradient(x, y - s, x, y + s);
  g.addColorStop(0, '#f0f9ff');
  g.addColorStop(0.5, '#7dd3fc');
  g.addColorStop(1, '#0ea5e9');
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.55, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s * 0.55, y);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(14,116,180,0.7)'; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
}

// Jagged lightning path via midpoint displacement.
function boltPts(x1, y1, x2, y2) {
  let pts = [[x1, y1], [x2, y2]];
  for (let iter = 0; iter < 3; iter++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
      const len = dist(ax, ay, bx, by);
      const off = (Math.random() - 0.5) * len * 0.55;
      let nx = -(by - ay), ny = bx - ax;
      const nl = Math.hypot(nx, ny) || 1;
      next.push([(ax + bx) / 2 + nx / nl * off, (ay + by) / 2 + ny / nl * off], [bx, by]);
    }
    pts = next;
  }
  return pts;
}

// Stone platform under every tower; grows fancier with total upgrade tier (0-6).
function towerBase(ctx, x, y, accent, tier) {
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 12, 18, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  // platform side wall (fakes the 2.5D depth)
  ctx.beginPath(); ctx.ellipse(x, y + 5, 17, 13.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#212a37'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y + 3, 17, 13.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3a4659'; ctx.fill();
  // top plate
  const g = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, 19);
  g.addColorStop(0, '#7e8ca2');
  g.addColorStop(0.65, '#57647a');
  g.addColorStop(1, '#394455');
  ctx.beginPath(); ctx.ellipse(x, y, 17, 13.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  // stone seams
  ctx.strokeStyle = 'rgba(15,23,42,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y, 11.5, 9, 0, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 11.5, y + Math.sin(a) * 9);
    ctx.lineTo(x + Math.cos(a) * 16.4, y + Math.sin(a) * 12.9);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.85; ctx.lineWidth = 2;
  ctx.strokeStyle = accent;
  ctx.beginPath(); ctx.ellipse(x, y, 16.6, 13.1, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  if (tier >= 2) {
    ctx.fillStyle = '#e7d8a5';
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 13.5, y + Math.sin(a) * 10.6, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (tier >= 4) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = accent;
    ctx.beginPath(); ctx.ellipse(x, y, 8, 6.3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawBanner(ctx, x, y, color, time) {
  ctx.strokeStyle = '#caa64a';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x, y - 6); ctx.stroke();
  ctx.lineWidth = 1;
  const wv = Math.sin(time * 6) * 1.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.quadraticCurveTo(x + 5, y - 5 + wv, x + 9, y - 4 + wv);
  ctx.lineTo(x + 7, y - 1 + wv * 0.5);
  ctx.quadraticCurveTo(x + 4, y, x, y + 1);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#caa64a';
  ctx.beginPath(); ctx.arc(x, y - 7, 1.6, 0, Math.PI * 2); ctx.fill();
}

function drawGem(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 2.6); ctx.lineTo(x + 2.2, y); ctx.lineTo(x, y + 2.6); ctx.lineTo(x - 2.2, y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
}

function drawTurret(ctx, t, time) {
  const rec = (t.recoil || 0) * 3;
  ctx.save();
  ctx.translate(t.x, t.y);
  switch (t.type) {
    case 'gunner': {
      ctx.rotate(t.angle);
      const bg = ctx.createLinearGradient(0, -6, 0, 6);
      bg.addColorStop(0, '#aab4c2'); bg.addColorStop(0.5, '#6b7686'); bg.addColorStop(1, '#3d4654');
      ctx.fillStyle = bg;
      ctx.strokeStyle = 'rgba(10,15,25,0.55)';
      for (const sy of [-4.8, 1.2]) {
        ctx.fillRect(2 - rec, sy, 16, 3.6);
        ctx.strokeRect(2 - rec, sy, 16, 3.6);
      }
      ctx.fillStyle = '#1f2733';
      ctx.fillRect(14.5 - rec, -5.4, 2.6, 10.8);
      const hg = ctx.createRadialGradient(-2, -3, 1, 0, 0, 9);
      hg.addColorStop(0, '#b7c2d0'); hg.addColorStop(1, '#5b6675');
      ctx.beginPath(); ctx.arc(0, 0, 8.4, 0, Math.PI * 2);
      ctx.fillStyle = hg; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2c3543';
      ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9fb0c4';
      ctx.beginPath(); ctx.arc(-1.4, -1.4, 1.5, 0, Math.PI * 2); ctx.fill();
      if (t.recoil > 0.7) muzzleFlash(ctx, 20 - rec, 0);
      break;
    }
    case 'cannon': {
      ctx.rotate(t.angle);
      const bg = ctx.createLinearGradient(0, -6, 0, 6);
      bg.addColorStop(0, '#5a6678'); bg.addColorStop(0.5, '#39424f'); bg.addColorStop(1, '#222a35');
      ctx.fillStyle = bg;
      ctx.fillRect(0 - rec, -6, 19, 12);
      ctx.fillStyle = '#10161f';
      ctx.fillRect(15 - rec, -6.8, 4.5, 13.6);
      ctx.fillStyle = '#4b5868';
      ctx.fillRect(6 - rec, -6.8, 3, 13.6);
      const hg = ctx.createRadialGradient(-3, -3, 1, 0, 0, 11);
      hg.addColorStop(0, '#3f4d61'); hg.addColorStop(1, '#1b2330');
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = hg; ctx.fill();
      ctx.strokeStyle = '#f87171'; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#8a97a8';
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      if (t.recoil > 0.7) muzzleFlash(ctx, 22 - rec, 0);
      break;
    }
    case 'frost': {
      const p = 0.7 + 0.3 * Math.sin(time * 3);
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 15);
      glow.addColorStop(0, 'rgba(186,230,253,' + (0.5 * p).toFixed(2) + ')');
      glow.addColorStop(1, 'rgba(125,211,252,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
      iceCrystal(ctx, 0, -2, 11);
      iceCrystal(ctx, -8, 4, 6);
      iceCrystal(ctx, 8, 5, 5);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.5 * Math.abs(Math.sin(time * 5))).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(3, -7, 1.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'tesla': {
      ctx.fillStyle = '#2c2140';
      ctx.fillRect(-6, -1, 12, 10);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? '#7c3aed' : '#4c1d95';
        ctx.fillRect(-8 + i, 1 + i * 3, 16 - i * 2, 2.4);
      }
      const orb = ctx.createRadialGradient(0, -8, 1, 0, -8, 9);
      orb.addColorStop(0, '#ffffff');
      orb.addColorStop(0.35, '#d8b4fe');
      orb.addColorStop(0.7, 'rgba(168,85,247,0.6)');
      orb.addColorStop(1, 'rgba(168,85,247,0)');
      ctx.fillStyle = orb;
      ctx.beginPath(); ctx.arc(0, -8, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(233,213,255,0.9)';
      for (let i = 0; i < 2; i++) {
        const a = time * 7 + i * Math.PI;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 3, -8 + Math.sin(a) * 3);
        ctx.lineTo(Math.cos(a) * 6 + Math.sin(time * 31 + i) * 1.5, -8 + Math.sin(a) * 6);
        ctx.stroke();
      }
      break;
    }
    case 'venom': {
      ctx.save();
      ctx.rotate(t.angle);
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(7, -2.2, 11, 4.4);
      ctx.fillStyle = '#1a2e05';
      ctx.fillRect(15, -2.6, 3, 5.2);
      ctx.restore();
      const pg = ctx.createRadialGradient(-3, -2, 1, 0, 1, 11);
      pg.addColorStop(0, '#2f4a1f'); pg.addColorStop(1, '#13250c');
      ctx.beginPath(); ctx.arc(0, 1, 9.5, 0, Math.PI * 2);
      ctx.fillStyle = pg; ctx.fill();
      ctx.strokeStyle = 'rgba(8,16,4,0.6)'; ctx.stroke();
      const gg = ctx.createRadialGradient(-2, -3, 1, 0, -2, 7);
      gg.addColorStop(0, '#d9f99d'); gg.addColorStop(1, '#65a30d');
      ctx.beginPath(); ctx.ellipse(0, -2, 7, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = gg; ctx.fill();
      const b1 = (time * 0.8) % 1, b2 = (time * 0.8 + 0.5) % 1;
      ctx.fillStyle = 'rgba(236,252,203,0.9)';
      ctx.beginPath(); ctx.arc(-3, -2 - b1 * 4, 1.6 * (1 - b1), 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -1 - b2 * 5, 1.3 * (1 - b2), 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'sniper': {
      ctx.rotate(t.angle);
      ctx.strokeStyle = 'rgba(248,113,113,' + (0.25 + 0.15 * Math.sin(time * 6)).toFixed(2) + ')';
      ctx.beginPath(); ctx.moveTo(26 - rec, 0); ctx.lineTo(64, 0); ctx.stroke();
      const bg = ctx.createLinearGradient(0, -3, 0, 3);
      bg.addColorStop(0, '#8b97a7'); bg.addColorStop(0.5, '#525e6e'); bg.addColorStop(1, '#303a47');
      ctx.fillStyle = bg;
      ctx.fillRect(-4 - rec, -2, 28, 4);
      ctx.fillStyle = '#0c1118';
      ctx.fillRect(21 - rec, -2.8, 4.5, 5.6);
      ctx.fillStyle = '#222b38';
      ctx.fillRect(4 - rec, -3.2, 5, 6.4);
      const hg = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
      hg.addColorStop(0, '#3b4757'); hg.addColorStop(1, '#161d28');
      ctx.beginPath(); ctx.arc(0, 0, 7.4, 0, Math.PI * 2);
      ctx.fillStyle = hg; ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath(); ctx.arc(2.5, -4, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(3.2, -4.7, 0.9, 0, Math.PI * 2); ctx.fill();
      if (t.recoil > 0.7) muzzleFlash(ctx, 28 - rec, 0);
      break;
    }
    case 'missile': {
      ctx.rotate(t.angle);
      const bg = ctx.createLinearGradient(0, -9, 0, 9);
      bg.addColorStop(0, '#4d5867'); bg.addColorStop(1, '#2c3440');
      ctx.fillStyle = bg;
      ctx.fillRect(-9, -9, 19, 18);
      ctx.strokeStyle = '#171d26';
      ctx.strokeRect(-9, -9, 19, 18);
      ctx.fillStyle = '#facc15';
      for (let i = 0; i < 3; i++) ctx.fillRect(-8.4, -7.5 + i * 6, 2.2, 3);
      for (const [mx, my] of [[3.5, -4.5], [3.5, 4.5], [-3.5, -4.5], [-3.5, 4.5]]) {
        ctx.fillStyle = '#10151d';
        ctx.beginPath(); ctx.arc(mx, my, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fb923c';
        ctx.beginPath(); ctx.arc(mx, my, 2.0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fed7aa';
        ctx.beginPath(); ctx.arc(mx - 0.6, my - 0.6, 0.7, 0, Math.PI * 2); ctx.fill();
      }
      if (t.recoil > 0.7) muzzleFlash(ctx, 14, 0);
      break;
    }
    case 'bank': {
      const wg = ctx.createLinearGradient(0, -6, 0, 10);
      wg.addColorStop(0, '#5b5444'); wg.addColorStop(1, '#37322a');
      ctx.fillStyle = wg;
      ctx.fillRect(-11, -4, 22, 14);
      ctx.fillStyle = '#6e6753';
      for (const cx of [-8, -3, 2, 7]) ctx.fillRect(cx, -3, 2.4, 12);
      const rg = ctx.createLinearGradient(0, -14, 0, -3);
      rg.addColorStop(0, '#fef08a'); rg.addColorStop(1, '#d6a516');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(-13, -4); ctx.lineTo(0, -14); ctx.lineTo(13, -4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#92670f'; ctx.stroke();
      const bob = Math.sin(time * 3) * 1.5;
      const cg = ctx.createRadialGradient(-1, 2 + bob, 1, 0, 3 + bob, 5);
      cg.addColorStop(0, '#fef9c3'); cg.addColorStop(1, '#eab308');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(0, 3 + bob, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a16207'; ctx.stroke();
      ctx.fillStyle = '#854d0e';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 3.4 + bob);
      break;
    }
    case 'beacon': {
      ctx.strokeStyle = 'rgba(74,222,128,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
      const a = time * 1.5;
      ctx.fillStyle = 'rgba(74,222,128,0.22)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 12, a, a + 1.0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#4ade80';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a + 1.0) * 12, Math.sin(a + 1.0) * 12);
      ctx.stroke();
      ctx.fillStyle = '#14532d';
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.rotate(a + 1.0);
      const dg = ctx.createLinearGradient(0, -6, 0, 6);
      dg.addColorStop(0, '#bbf7d0'); dg.addColorStop(1, '#4ade80');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.ellipse(3, 0, 2.5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(220,252,231,' + (0.4 + 0.6 * Math.abs(Math.sin(time * 4))).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawTower(ctx, t, time) {
  const accent = TOWER_ACCENT[t.type] || '#fff';
  const spr = Sprites.towers[t.type];
  if (spr) {
    // sprite art is a 3/4-view building: draw static, never rotate
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 14, 16, 5.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ctx.drawImage(spr, t.x - 24, t.y - 29, 48, 48);
  } else {
    towerBase(ctx, t.x, t.y, accent, t.levels[0] + t.levels[1]);
    drawTurret(ctx, t, time);
  }
  for (let i = 0; i < t.levels[0]; i++) drawGem(ctx, t.x - 13 + i * 6.5, t.y + 15.5, '#4ade80');
  for (let i = 0; i < t.levels[1]; i++) drawGem(ctx, t.x + 13 - i * 6.5, t.y + 19, '#38bdf8');
  if (t.levels[0] >= 3 && t.levels[1] >= 3) drawBanner(ctx, t.x + 15, t.y - 8, accent, time);
}

function drawEnemyBody(ctx, e, x, y, time) {
  const r = e.def.radius, c = e.def.color;
  const dk = shade(c, -45), lt = shade(c, 35);
  ctx.save();
  ctx.translate(x, y);
  switch (e.type) {
    case 'runt': {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
      g.addColorStop(0, lt); g.addColorStop(1, dk);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = dk; ctx.stroke();
      ctx.fillStyle = '#fff';
      for (const s of [-0.45, 0.45]) {
        const a = e.heading + s;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'sprinter': {
      ctx.rotate(e.heading);
      const g = ctx.createLinearGradient(-r, 0, r * 1.3, 0);
      g.addColorStop(0, dk); g.addColorStop(1, lt);
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r, -r * 0.9);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r, r * 0.9);
      ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = dk; ctx.stroke();
      break;
    }
    case 'swarmling': {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = c; ctx.fill();
      ctx.fillStyle = lt;
      ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.25, r * 0.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'brute': {
      ctx.rotate(e.heading);
      ctx.fillStyle = dk;
      ctx.fillRect(-r, -r * 0.85, r * 1.9, r * 1.7);
      ctx.fillStyle = c;
      ctx.fillRect(-r * 0.75, -r * 0.62, r * 1.5, r * 1.24);
      ctx.fillStyle = '#64748b';
      ctx.beginPath(); ctx.arc(-r * 0.45, -r * 0.85, r * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.45, r * 0.85, r * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(r * 0.25, -r * 0.4, r * 0.45, r * 0.8);
      break;
    }
    case 'winged': {
      const flap = 0.6 + 0.5 * Math.sin(time * 12 + e.x * 0.05);
      ctx.rotate(e.heading);
      ctx.fillStyle = lt;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, 0); ctx.lineTo(-r * 1.1, -r * 1.7 * flap); ctx.lineTo(r * 0.5, -r * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, 0); ctx.lineTo(-r * 1.1, r * 1.7 * flap); ctx.lineTo(r * 0.5, r * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = c; ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(r * 0.6, 0, r * 0.18, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'phantom': {
      const w = Math.sin(time * 6) * r * 0.15;
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r, Math.PI, 0);
      ctx.quadraticCurveTo(r * 0.6, r * 0.9 + w, r * 0.2, r * 0.55);
      ctx.quadraticCurveTo(0, r * 0.95 - w, -r * 0.3, r * 0.55);
      ctx.quadraticCurveTo(-r * 0.7, r * 0.9 + w, -r, -r * 0.2);
      ctx.closePath();
      ctx.fillStyle = c; ctx.fill();
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.25, r * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.25, r * 0.16, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'regenerator': {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
      g.addColorStop(0, lt); g.addColorStop(1, c);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = dk; ctx.stroke();
      const p = 0.6 + 0.4 * Math.sin(time * 4);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * p).toFixed(2) + ')';
      ctx.fillRect(-r * 0.15, -r * 0.55, r * 0.3, r * 1.1);
      ctx.fillRect(-r * 0.55, -r * 0.15, r * 1.1, r * 0.3);
      break;
    }
    case 'shellback': {
      ctx.rotate(e.heading);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const px = Math.cos(a) * r * 1.1, py = Math.sin(a) * r * 1.1;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = dk; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const px = Math.cos(a) * r * 0.65, py = Math.sin(a) * r * 0.65;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = c; ctx.fill();
      ctx.fillStyle = lt;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'splitter': {
      for (let i = 0; i < 3; i++) {
        const a = time * 1.5 + i * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = c; ctx.fill();
        ctx.strokeStyle = dk; ctx.stroke();
      }
      break;
    }
    case 'juggernaut': {
      ctx.rotate(time * 0.8);
      ctx.fillStyle = dk;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8;
        const rr = i % 2 ? r : r * 1.3;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill();
      const p = 0.5 + 0.5 * Math.sin(time * 5);
      ctx.fillStyle = 'rgba(255,240,240,' + (0.5 + 0.4 * p).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'wyvern': {
      const flap = 0.6 + 0.5 * Math.sin(time * 8);
      ctx.rotate(e.heading);
      ctx.fillStyle = lt;
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, 0); ctx.lineTo(-r * 1.3, -r * 1.9 * flap); ctx.lineTo(r * 0.6, -r * 0.45);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, 0); ctx.lineTo(-r * 1.3, r * 1.9 * flap); ctx.lineTo(r * 0.6, r * 0.45);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = dk;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, 0); ctx.lineTo(-r * 1.5, -r * 0.3); ctx.lineTo(-r * 1.5, r * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fillStyle = c; ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(r * 0.65, 0, r * 0.16, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = c; ctx.fill();
    }
  }
  ctx.restore();
}

function drawEnemy(ctx, e, time) {
  const stealthHidden = e.def.stealth && !e.revealed;
  const yOff = e.def.flying ? -8 + Math.sin(time * 5 + e.x * 0.03) * 2 : 0;
  const x = e.x, y = e.y + yOff;
  const r = e.def.radius;
  ctx.globalAlpha = stealthHidden ? 0.4 : 1;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + r * 0.8 + 2, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  const spr = Sprites.enemies[e.type];
  if (spr) {
    // sprite art is 3/4-view: keep upright, just mirror when walking left
    const s = r * 3.0;
    ctx.save();
    ctx.translate(x, y);
    if (Math.cos(e.heading) < -0.05) ctx.scale(-1, 1);
    ctx.drawImage(spr, -s / 2, -s / 2, s, s);
    ctx.restore();
  } else {
    drawEnemyBody(ctx, e, x, y, time);
  }
  if (e.def.armor) {
    ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = e.shred >= e.def.armor ? 'rgba(148,163,184,0.25)' : '#94a3b8';
    ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
  }
  if (e.slowT > 0) {
    ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(125,211,252,0.45)'; ctx.fill();
  }
  if (e.poisonT > 0) {
    ctx.beginPath(); ctx.arc(x - r * 0.5, y - r - 3, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#a3e635'; ctx.fill();
  }
  if (e.burnT > 0) {
    ctx.beginPath(); ctx.arc(x + r * 0.5, y - r - 3, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fb923c'; ctx.fill();
  }
  if (e.stunT > 0) {
    ctx.font = '10px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💫', x, y - r - 10);
  }
  const w = e.def.boss ? 40 : 20;
  const frac = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - w / 2, y - r - 8, w, 4);
  ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
  ctx.fillRect(x - w / 2, y - r - 8, w * frac, 4);
  ctx.globalAlpha = 1;
}

// ============ Terrain art: themes + decor ============
const THEMES = {
  grass: {
    ground: ['#5d9648', '#46813a', '#3a7232'],
    mottle: ['#6aa551', '#33652c', '#79b35e', '#2d5c28'],
    blade: 'rgba(20,60,20,0.25)', bladeLight: 'rgba(190,230,140,0.18)',
    pathEdge: '#6e5233', path: '#a8845c', pathLight: '#bf9a6b', pathSpeck: '#8a6a45',
    rock: ['#9aa3ad', '#6b7480'],
    canopy: ['#2f7a33', '#256428', '#3c8f3f'], trunk: '#6b4a2f',
    flowers: ['#ffe066', '#ff8fab', '#f8f9fa', '#c77dff'],
    tuft: '#2c5f27',
  },
  canyon: {
    ground: ['#c9925a', '#b67f4b', '#a86f3f'],
    mottle: ['#d6a169', '#9c6238', '#e0b076', '#8a5630'],
    blade: 'rgba(90,50,20,0.20)', bladeLight: 'rgba(255,230,180,0.15)',
    pathEdge: '#704a2a', path: '#8f6038', pathLight: '#a3744a', pathSpeck: '#5f3e24',
    rock: ['#b3825a', '#7d5638'],
    canopy: ['#7d8f3e', '#697a32', '#92a44b'], trunk: '#5f4126',
    flowers: ['#e85d3d', '#ffd166', '#f4f1de'],
    tuft: '#6f7d36',
  },
  autumn: {
    ground: ['#8f9e44', '#7c8c3a', '#6c7c33'],
    mottle: ['#a3b250', '#5f7029', '#b5c25e', '#556526'],
    blade: 'rgba(60,60,10,0.22)', bladeLight: 'rgba(240,230,150,0.16)',
    pathEdge: '#6b4f2e', path: '#a07b4f', pathLight: '#b78f5e', pathSpeck: '#7d5d3a',
    rock: ['#9b948a', '#6e675e'],
    canopy: ['#d97e30', '#c2562b', '#e8a13c'], trunk: '#5f422c',
    flowers: ['#e63946', '#ffd166', '#f1faee'],
    tuft: '#7a6a2c',
  },
  snow: {
    ground: ['#d8e6ee', '#c5d6e2', '#b4c8d8'],
    mottle: ['#e8f2f8', '#a9bfd0', '#f2f8fc', '#9cb4c8'],
    blade: 'rgba(120,150,175,0.25)', bladeLight: 'rgba(255,255,255,0.30)',
    pathEdge: '#6e6e7c', path: '#8e8d98', pathLight: '#a5a4b0', pathSpeck: '#67677a',
    rock: ['#aebfd2', '#7287a2'],
    canopy: ['#2e5e48', '#234c3a', '#3a7257'], trunk: '#4a3826', snowCap: '#eef6fb',
    flowers: ['#bde0fe', '#e2eafc', '#a2d2ff'],
    tuft: '#8fa8bc',
  },
  twilight: {
    ground: ['#3c4a63', '#33405a', '#2a364e'],
    mottle: ['#475a78', '#283349', '#52688a', '#222c40'],
    blade: 'rgba(10,15,35,0.30)', bladeLight: 'rgba(150,180,255,0.10)',
    pathEdge: '#4a3c55', path: '#6b5878', pathLight: '#7d6a8a', pathSpeck: '#544463',
    rock: ['#5d6b85', '#3c4760'],
    canopy: ['#3f6d62', '#32584f', '#4d8276'], trunk: '#3a3148',
    flowers: ['#9d4edd', '#48bfe3', '#80ffdb'],
    glow: true,
    tuft: '#3e5a52',
  },
};

function drawTuft(x, px, py, theme, rng) {
  x.strokeStyle = theme.tuft;
  x.lineWidth = 1.4;
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.moveTo(px + i * 1.8, py);
    x.quadraticCurveTo(px + i * 2.6, py - 3, px + i * 3.2, py - 5 - rng() * 3);
    x.stroke();
  }
  x.lineWidth = 1;
}

function drawFlower(x, px, py, color, glow) {
  if (glow) {
    const g = x.createRadialGradient(px, py, 0.5, px, py, 7);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = 0.45;
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, 7, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 1;
  }
  x.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    x.beginPath(); x.arc(px + Math.cos(a) * 2.1, py + Math.sin(a) * 2.1, 1.5, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = glow ? '#ffffff' : '#fcd34d';
  x.beginPath(); x.arc(px, py, 1.3, 0, Math.PI * 2); x.fill();
}

function drawBoulder(x, px, py, s, theme) {
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.beginPath(); x.ellipse(px + 1.5, py + s * 0.55, s * 1.1, s * 0.45, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = theme.rock[1];
  x.beginPath();
  x.moveTo(px - s, py + s * 0.5);
  x.lineTo(px - s * 0.7, py - s * 0.4);
  x.lineTo(px - s * 0.1, py - s * 0.8);
  x.lineTo(px + s * 0.7, py - s * 0.45);
  x.lineTo(px + s, py + s * 0.5);
  x.closePath(); x.fill();
  x.fillStyle = theme.rock[0];
  x.beginPath();
  x.moveTo(px - s * 0.7, py - s * 0.4);
  x.lineTo(px - s * 0.1, py - s * 0.8);
  x.lineTo(px + s * 0.7, py - s * 0.45);
  x.lineTo(px + s * 0.15, py - s * 0.1);
  x.closePath(); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.25)';
  x.beginPath(); x.moveTo(px + s * 0.15, py - s * 0.1); x.lineTo(px + s * 0.1, py + s * 0.5); x.stroke();
}

function drawTree(x, px, py, theme, rng) {
  x.fillStyle = 'rgba(0,0,0,0.28)';
  x.beginPath(); x.ellipse(px + 2, py + 7, 11, 4.5, 0, 0, Math.PI * 2); x.fill();
  if (theme.snowCap) {
    x.fillStyle = theme.trunk;
    x.fillRect(px - 1.5, py + 2, 3, 6);
    for (let i = 0; i < 3; i++) {
      const w = 11 - i * 2.5, ty = py + 1 - i * 6;
      x.fillStyle = theme.canopy[i % theme.canopy.length];
      x.beginPath(); x.moveTo(px - w, ty); x.lineTo(px, ty - 9); x.lineTo(px + w, ty); x.closePath(); x.fill();
    }
    x.fillStyle = theme.snowCap;
    x.beginPath(); x.moveTo(px - 4, py - 13); x.lineTo(px, py - 17); x.lineTo(px + 4, py - 13); x.closePath(); x.fill();
  } else {
    x.fillStyle = theme.trunk;
    x.fillRect(px - 2, py, 4, 7);
    for (const [bx, by, br] of [[-5, -4, 7], [5, -4, 7], [0, -9, 8], [0, -2, 9]]) {
      x.fillStyle = theme.canopy[Math.floor(rng() * 2)];
      x.beginPath(); x.arc(px + bx, py + by, br, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = theme.canopy[2];
    x.beginPath(); x.arc(px - 3, py - 9, 5, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(px + 4, py - 6, 4, 0, Math.PI * 2); x.fill();
  }
}

// Stone gate arch where enemies enter (path maps).
function drawSpawnGate(x, px, py, theme) {
  x.fillStyle = 'rgba(0,0,0,0.30)';
  x.beginPath(); x.ellipse(px, py + 16, 20, 6, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = theme.rock[1];
  x.beginPath(); x.arc(px, py, 19, Math.PI, 0); x.lineTo(px + 19, py + 15); x.lineTo(px - 19, py + 15); x.closePath(); x.fill();
  x.fillStyle = theme.rock[0];
  x.beginPath(); x.arc(px, py, 15, Math.PI, 0); x.lineTo(px + 15, py + 15); x.lineTo(px - 15, py + 15); x.closePath(); x.fill();
  x.fillStyle = '#100c18';
  x.beginPath(); x.arc(px, py + 2, 10, Math.PI, 0); x.lineTo(px + 10, py + 15); x.lineTo(px - 10, py + 15); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.3)';
  x.beginPath(); x.arc(px, py, 15, Math.PI, 0); x.stroke();
  x.beginPath(); x.arc(px, py, 19, Math.PI, 0); x.stroke();
  // glowing eyes in the dark
  x.fillStyle = '#f87171';
  x.beginPath(); x.arc(px - 3, py + 5, 1.2, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(px + 3, py + 5, 1.2, 0, Math.PI * 2); x.fill();
}

// The bastion keep that enemies are trying to reach (path maps).
function drawKeep(x, px, py, theme) {
  x.fillStyle = 'rgba(0,0,0,0.30)';
  x.beginPath(); x.ellipse(px, py + 17, 22, 7, 0, 0, Math.PI * 2); x.fill();
  const g = x.createLinearGradient(px - 16, 0, px + 16, 0);
  g.addColorStop(0, theme.rock[0]); g.addColorStop(1, theme.rock[1]);
  x.fillStyle = g;
  x.fillRect(px - 15, py - 12, 30, 30);
  x.strokeStyle = 'rgba(0,0,0,0.25)';
  x.strokeRect(px - 15, py - 12, 30, 30);
  // crenellations
  x.fillStyle = theme.rock[0];
  for (let i = -15; i < 15; i += 8) x.fillRect(px + i, py - 18, 5, 7);
  // stone seams
  x.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 3; i++) {
    x.beginPath(); x.moveTo(px - 15, py - 6 + i * 8); x.lineTo(px + 15, py - 6 + i * 8); x.stroke();
  }
  // arched door
  x.fillStyle = '#3a2a1a';
  x.beginPath(); x.arc(px, py + 10, 6, Math.PI, 0); x.lineTo(px + 6, py + 18); x.lineTo(px - 6, py + 18); x.closePath(); x.fill();
  // window
  x.fillStyle = '#ffe9a3';
  x.fillRect(px - 2, py - 8, 4, 6);
  // banner
  x.strokeStyle = '#caa64a'; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(px, py - 18); x.lineTo(px, py - 30); x.stroke();
  x.lineWidth = 1;
  x.fillStyle = '#dc2626';
  x.beginPath();
  x.moveTo(px, py - 30); x.lineTo(px + 11, py - 27); x.lineTo(px, py - 23);
  x.closePath(); x.fill();
}

// Animated swirl portal (maze spawns/exit), drawn every frame.
function drawPortal(ctx, x, y, rgb, time) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, 16);
  g.addColorStop(0, 'rgba(' + rgb + ',0.55)');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(' + rgb + ',0.9)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const a = time * 2.2 + i * Math.PI * 2 / 3;
    ctx.beginPath(); ctx.arc(x, y, 11, a, a + 1.4); ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
}

// ============ Hero ============
class Hero {
  constructor(game, heroId, x, y) {
    this.game = game;
    this.id = heroId;
    this.def = HEROES[heroId];
    this.x = x; this.y = y;
    this.rally = { x, y };
    this.alive = true;
    this.lvl = 1;
    this.xp = 0;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.cooldown = 0.5;
    this.abilityCd = 4;
    this.respawnT = 0;
    this.engaged = [];
    this.heading = 0;
    this.walking = false;
    this.pending = []; // staggered ability strikes
  }

  get dmg() { return this.def.dmg * (1 + 0.12 * (this.lvl - 1)); }
  get xpNeed() { return 120 * this.lvl; }
  isMelee() { return this.def.range < 50; }
  engagedHas(e) { return this.engaged.includes(e); }

  gainXp(n) {
    if (this.lvl >= 10) return;
    this.xp += n;
    while (this.lvl < 10 && this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.lvl++;
      this.maxHp = Math.round(this.def.hp * (1 + 0.12 * (this.lvl - 1)));
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.4);
      this.game.addFx({ type: 'text', x: this.x, y: this.y - 26, t: 0, dur: 1.2, str: '⬆ LEVEL ' + this.lvl, color: '#fde68a' });
      this.game.addFx({ type: 'ring', x: this.x, y: this.y, t: 0, dur: 0.5, r: 34, color: '#fde68a' });
      Sound.play('upgrade');
    }
  }

  contactDps(e) {
    return e.def.boss ? 26 : clamp(3 + e.maxHp * 0.015, 3, 18);
  }

  update(dt) {
    const g = this.game;
    for (const s of this.pending) {
      s.t -= dt;
      if (s.t <= 0) s.fn();
    }
    this.pending = this.pending.filter(s => s.t > 0);

    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.alive = true;
        this.hp = this.maxHp;
        this.x = this.rally.x; this.y = this.rally.y;
        this.engaged = [];
        g.addFx({ type: 'glowfx', x: this.x, y: this.y, r: 26, rgb: '255,255,255', t: 0, dur: 0.4 });
        g.addFx({ type: 'ring', x: this.x, y: this.y, t: 0, dur: 0.5, r: 30, color: this.def.color });
      }
      return;
    }

    // walk toward rally point
    const rd = dist(this.x, this.y, this.rally.x, this.rally.y);
    this.walking = rd > 4;
    if (this.walking) {
      const sp = this.def.speed * dt;
      this.heading = Math.atan2(this.rally.y - this.y, this.rally.x - this.x);
      if (rd <= sp) { this.x = this.rally.x; this.y = this.rally.y; }
      else { this.x += Math.cos(this.heading) * sp; this.y += Math.sin(this.heading) * sp; }
    }

    // engage nearby ground enemies (blocking)
    const near = g.enemies.filter(e => !e.dead && !e.finished && !e.def.flying && dist2(e.x, e.y, this.x, this.y) < 28 * 28);
    near.sort((a, b) => b.progress - a.progress);
    this.engaged = near.slice(0, this.def.blocks);

    // engaged enemies claw at the hero
    let inCombat = false;
    for (const e of this.engaged) {
      if (e.stunT > 0) continue;
      inCombat = true;
      this.hp -= this.contactDps(e) * dt * (1 - this.def.armorPct);
    }
    if (!inCombat) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.def.regen * dt);
    if (this.hp <= 0) { this.die(); return; }

    // attack
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const target = this.pickTarget();
      if (target) { this.attack(target); this.cooldown = this.def.rate; }
    }

    // auto-cast ability
    if (this.abilityCd > 0) this.abilityCd -= dt;
    if (this.abilityCd <= 0 && this.castAbility()) this.abilityCd = this.def.ability.cd;
  }

  pickTarget() {
    if (this.engaged.length) return this.engaged[0];
    const g = this.game;
    const r2 = this.def.range * this.def.range;
    let best = null, bd = Infinity;
    for (const e of g.enemies) {
      if (e.dead || e.finished) continue;
      if (e.def.flying && this.isMelee()) continue;
      if (e.def.stealth && !e.revealed) continue;
      const d2 = dist2(e.x, e.y, this.x, this.y);
      if (d2 <= r2 && d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  attack(e) {
    const g = this.game;
    this.heading = Math.atan2(e.y - this.y, e.x - this.x);
    let d = this.dmg;
    const crit = this.def.crit && Math.random() < this.def.crit;
    if (crit) d *= 3;
    if (this.def.splash) {
      // explosive shot (magnus / korg)
      const sx = e.x, sy = e.y, r = this.def.splash;
      g.addFx({ type: 'glowfx', x: sx, y: sy, r: r * 1.1, rgb: this.id === 'magnus' ? '255,150,60' : '255,200,110', t: 0, dur: 0.22 });
      g.sparkBurst(sx, sy, 4, '#fdba74', 140);
      for (const t of g.enemies) {
        if (t.dead || t.finished) continue;
        if (t.def.flying && this.isMelee()) continue;
        if (dist2(t.x, t.y, sx, sy) <= (r + t.def.radius) * (r + t.def.radius)) {
          t.damage(d, { pierce: 2, armorShred: this.def.shred || 0 });
          if (this.def.burnDps) t.applyBurn(this.def.burnDps, this.def.burnDur);
        }
      }
    } else if (this.isMelee()) {
      e.damage(d, { pierce: 3 });
      g.sparkBurst(e.x, e.y, crit ? 6 : 3, '#f8fafc', 130, this.heading, 1.6);
      g.addFx({ type: 'glowfx', x: e.x, y: e.y, r: 8, rgb: '255,255,255', t: 0, dur: 0.13 });
    } else {
      // arrow
      e.damage(d, { pierce: 1 });
      g.addFx({ type: 'beam', x1: this.x, y1: this.y - 6, x2: e.x, y2: e.y, t: 0, dur: 0.1, color: crit ? '#fbbf24' : '#d9f99d' });
      g.sparkBurst(e.x, e.y, crit ? 6 : 2, crit ? '#fbbf24' : '#d9f99d', 120);
      if (crit) g.addFx({ type: 'text', x: e.x, y: e.y - 14, t: 0, dur: 0.6, str: 'CRIT!', color: '#fbbf24' });
    }
  }

  castAbility() {
    const g = this.game;
    const lvl = this.lvl;
    const announce = () => {
      g.addFx({ type: 'text', x: this.x, y: this.y - 30, t: 0, dur: 1.0, str: this.def.ability.name.toUpperCase(), color: this.def.color });
    };
    if (this.id === 'aldric') {
      const targets = g.enemies.filter(e => !e.dead && !e.finished && !e.def.flying && dist2(e.x, e.y, this.x, this.y) < 60 * 60);
      if (targets.length < 2) return false;
      announce();
      g.addFx({ type: 'ring', x: this.x, y: this.y, t: 0, dur: 0.4, r: 60, color: '#e2e8f0' });
      g.addGround({ type: 'scorch', x: this.x, y: this.y, r: 28, t: 0, dur: 2 });
      g.sparkBurst(this.x, this.y, 10, '#e2e8f0', 180);
      for (const e of targets) {
        e.damage(30 + 8 * lvl, { pierce: 99 });
        e.stunT = Math.max(e.stunT, 1.2);
      }
      Sound.play('boom');
      return true;
    }
    if (this.id === 'lyra') {
      // densest cluster within long range
      let best = null, bn = 1;
      for (const e of g.enemies) {
        if (e.dead || e.finished || dist2(e.x, e.y, this.x, this.y) > 240 * 240) continue;
        const n = g.enemies.filter(o => !o.dead && !o.finished && dist2(o.x, o.y, e.x, e.y) < 60 * 60).length;
        if (n > bn) { bn = n; best = e; }
      }
      if (!best || bn < 3) return false;
      announce();
      const cx = best.x, cy = best.y;
      for (let i = 0; i < 12; i++) {
        this.pending.push({ t: 0.1 + i * 0.07, fn: () => {
          const cands = g.enemies.filter(o => !o.dead && !o.finished && dist2(o.x, o.y, cx, cy) < 65 * 65);
          const tx = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
          const px = tx ? tx.x : cx + (Math.random() - 0.5) * 90;
          const py = tx ? tx.y : cy + (Math.random() - 0.5) * 70;
          g.addFx({ type: 'beam', x1: px + 14, y1: py - 46, x2: px, y2: py, t: 0, dur: 0.12, color: '#d9f99d' });
          g.sparkBurst(px, py, 2, '#d9f99d', 100);
          if (tx) tx.damage(12 + 3 * lvl, { pierce: 1 });
        } });
      }
      Sound.play('shoot');
      return true;
    }
    if (this.id === 'magnus') {
      let best = null, bn = 1;
      for (const e of g.enemies) {
        if (e.dead || e.finished || dist2(e.x, e.y, this.x, this.y) > 240 * 240) continue;
        const n = g.enemies.filter(o => !o.dead && !o.finished && dist2(o.x, o.y, e.x, e.y) < 55 * 55).length;
        if (n > bn) { bn = n; best = e; }
      }
      if (!best || bn < 3) return false;
      announce();
      const cx = best.x, cy = best.y;
      g.addFx({ type: 'beam', x1: cx + 60, y1: cy - 130, x2: cx, y2: cy, t: 0, dur: 0.5, color: '#fb923c' });
      this.pending.push({ t: 0.45, fn: () => {
        g.addFx({ type: 'boom', x: cx, y: cy, t: 0, dur: 0.4, r: 55, color: '#fdba74' });
        g.addFx({ type: 'glowfx', x: cx, y: cy, r: 60, rgb: '255,170,60', t: 0, dur: 0.35 });
        g.addGround({ type: 'scorch', x: cx, y: cy, r: 42, t: 0, dur: 5 });
        g.sparkBurst(cx, cy, 12, '#fdba74', 230);
        for (const e of g.enemies) {
          if (e.dead || e.finished) continue;
          if (dist2(e.x, e.y, cx, cy) < (55 + e.def.radius) * (55 + e.def.radius)) {
            e.damage(60 + 12 * lvl, { pierce: 5 });
            e.applyBurn(10, 3);
          }
        }
        Sound.play('boom');
      } });
      return true;
    }
    if (this.id === 'mercy') {
      const targets = g.enemies.filter(e => !e.dead && !e.finished && dist2(e.x, e.y, this.x, this.y) < 80 * 80);
      if (this.hp > this.maxHp * 0.6 && targets.length < 3) return false;
      if (!targets.length && this.hp > this.maxHp * 0.6) return false;
      announce();
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.3);
      g.addFx({ type: 'ring', x: this.x, y: this.y, t: 0, dur: 0.5, r: 80, color: '#fde68a' });
      g.addFx({ type: 'glowfx', x: this.x, y: this.y, r: 40, rgb: '253,230,138', t: 0, dur: 0.4 });
      for (const e of targets) {
        e.damage(25 + 6 * lvl, { pierce: 99 });
        e.applySlow(0.3, 2);
        g.addFx({ type: 'glowfx', x: e.x, y: e.y, r: 10, rgb: '253,230,138', t: 0, dur: 0.25 });
      }
      Sound.play('wave');
      return true;
    }
    if (this.id === 'korg') {
      const targets = g.enemies.filter(e => !e.dead && !e.finished && dist2(e.x, e.y, this.x, this.y) < 90 * 90);
      if (targets.length < 2) return false;
      announce();
      for (let i = 0; i < 5; i++) {
        const bx = this.x + (Math.random() - 0.5) * 140;
        const by = this.y + (Math.random() - 0.5) * 110;
        this.pending.push({ t: 0.15 + i * 0.12, fn: () => {
          g.addFx({ type: 'boom', x: bx, y: by, t: 0, dur: 0.3, r: 30, color: '#fca5a5' });
          g.addFx({ type: 'glowfx', x: bx, y: by, r: 32, rgb: '255,200,110', t: 0, dur: 0.25 });
          g.addGround({ type: 'scorch', x: bx, y: by, r: 20, t: 0, dur: 3.5 });
          g.sparkBurst(bx, by, 6, '#fdba74', 180);
          for (const e of g.enemies) {
            if (e.dead || e.finished) continue;
            if (dist2(e.x, e.y, bx, by) < (30 + e.def.radius) * (30 + e.def.radius)) {
              e.damage(32 + 7 * lvl, { pierce: 2, armorShred: 1 });
            }
          }
          Sound.play('boom');
        } });
      }
      return true;
    }
    return false;
  }

  die() {
    const g = this.game;
    this.alive = false;
    this.respawnT = 12;
    this.engaged = [];
    g.addFx({ type: 'text', x: this.x, y: this.y - 20, t: 0, dur: 1.4, str: this.def.name + ' has fallen!', color: '#f87171' });
    g.addFx({ type: 'glowfx', x: this.x, y: this.y, r: 30, rgb: '248,113,113', t: 0, dur: 0.5 });
    g.sparkBurst(this.x, this.y, 10, this.def.color, 140);
    Sound.play('leak');
  }

  draw(ctx, time) {
    const g = this.game;
    if (!this.alive) {
      // respawn ghost at rally point
      ctx.globalAlpha = 0.4 + 0.15 * Math.sin(time * 4);
      ctx.strokeStyle = this.def.color;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(this.rally.x, this.rally.y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(Math.ceil(this.respawnT) + 's', this.rally.x, this.rally.y);
      return;
    }
    const x = this.x, y = this.y;
    // selection ring + rally marker
    if (g.selectedHero) {
      ctx.strokeStyle = '#fde68a';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(x, y, 16, time * 1.5, time * 1.5 + Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (this.walking) {
        ctx.strokeStyle = 'rgba(253,230,138,0.6)';
        ctx.beginPath(); ctx.moveTo(this.rally.x - 6, this.rally.y); ctx.lineTo(this.rally.x + 6, this.rally.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(this.rally.x, this.rally.y - 6); ctx.lineTo(this.rally.x, this.rally.y + 6); ctx.stroke();
      }
    }
    // shadow
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    const bob = this.walking ? Math.sin(time * 14) * 1.5 : 0;
    const spr = Sprites.heroes[this.id];
    if (spr) {
      const s = 36;
      ctx.save();
      ctx.translate(x, y + bob);
      if (Math.cos(this.heading) < -0.05) ctx.scale(-1, 1);
      ctx.drawImage(spr, -s / 2, -s / 2 - 4, s, s);
      ctx.restore();
    } else {
      this.drawVector(ctx, x, y + bob, time);
    }
    // hp bar + level badge
    const frac = clamp(this.hp / this.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 12, y - 20, 24, 4);
    ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
    ctx.fillRect(x - 12, y - 20, 24 * frac, 4);
    ctx.fillStyle = '#1c2433';
    ctx.beginPath(); ctx.arc(x - 15, y - 18, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#caa64a'; ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 7px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.lvl, x - 15, y - 17.6);
  }

  // procedural placeholder until hero art lands in assets/heroes/
  drawVector(ctx, x, y, time) {
    ctx.save();
    ctx.translate(x, y);
    const flip = Math.cos(this.heading) < -0.05 ? -1 : 1;
    ctx.scale(flip, 1);
    const c = this.def.color;
    // legs
    ctx.fillStyle = '#2c3543';
    ctx.fillRect(-4, 4, 3, 6);
    ctx.fillRect(1, 4, 3, 6);
    // torso
    const g2 = ctx.createLinearGradient(0, -8, 0, 6);
    g2.addColorStop(0, c);
    g2.addColorStop(1, shade(c.startsWith('#') ? c : '#888888', -60));
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.ellipse(0, -1, 6.5, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
    // head
    ctx.fillStyle = '#e8c39e';
    ctx.beginPath(); ctx.arc(0, -11, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
    // class gear
    if (this.id === 'aldric') {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-10, -9, 4, 14);           // tower shield
      ctx.strokeStyle = '#475569'; ctx.strokeRect(-10, -9, 4, 14);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(6, -8, 2, 11);             // sword
      ctx.fillRect(4.5, -9.5, 5, 2);
      ctx.fillStyle = '#64748b';               // helmet
      ctx.beginPath(); ctx.arc(0, -12, 4.6, Math.PI, 0); ctx.fill();
    } else if (this.id === 'lyra') {
      ctx.strokeStyle = '#84cc16'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(8, -3, 7, -1.2, 1.2); ctx.stroke(); // bow
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(8 + Math.cos(-1.2) * 7, -3 + Math.sin(-1.2) * 7);
      ctx.lineTo(8 + Math.cos(1.2) * 7, -3 + Math.sin(1.2) * 7); ctx.stroke();
      ctx.fillStyle = '#365314';               // hood
      ctx.beginPath(); ctx.arc(0, -12, 4.8, Math.PI * 0.9, Math.PI * 0.1); ctx.fill();
    } else if (this.id === 'magnus') {
      ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(8, -12); ctx.stroke(); // staff
      ctx.lineWidth = 1;
      const fl = 0.7 + 0.3 * Math.sin(time * 9);
      const fg = ctx.createRadialGradient(8, -14, 0.5, 8, -14, 5 * fl);
      fg.addColorStop(0, '#fef08a'); fg.addColorStop(0.5, '#fb923c'); fg.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(8, -14, 5 * fl, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7c2d12';               // wizard hat
      ctx.beginPath(); ctx.moveTo(-5, -13); ctx.lineTo(0, -21); ctx.lineTo(5, -13); ctx.closePath(); ctx.fill();
    } else if (this.id === 'mercy') {
      const p = 0.5 + 0.5 * Math.sin(time * 3);
      ctx.strokeStyle = 'rgba(253,230,138,' + (0.5 + 0.4 * p).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(0, -16.5, 5, 1.8, 0, 0, Math.PI * 2); ctx.stroke(); // halo
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(6.5, -8, 2.4, 10);          // mace handle
      ctx.beginPath(); ctx.arc(7.7, -9.5, 3, 0, Math.PI * 2); ctx.fill();
    } else if (this.id === 'korg') {
      ctx.fillStyle = '#7f1d1d';               // bomb in hand
      ctx.beginPath(); ctx.arc(8, -4, 4, 0, Math.PI * 2); ctx.fill();
      const fz = 0.5 + 0.5 * Math.sin(time * 12);
      ctx.fillStyle = 'rgba(253,224,71,' + (0.5 + 0.5 * fz).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(9.5, -8.5, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#92400e';               // beard
      ctx.beginPath(); ctx.arc(0, -9, 4, 0.3, Math.PI - 0.3); ctx.fill();
    }
    ctx.restore();
  }
}

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
    this.heading = 0;

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

    // blocked by the hero: stop and fight
    const hb = g.hero;
    if (hb && hb.alive && !this.def.flying && hb.engagedHas(this)) {
      this.heading = Math.atan2(hb.y - this.y, hb.x - this.x);
      return;
    }

    const sp = this.effSpeed() * dt;
    if (!g.isMaze) {
      this.d += sp;
      if (this.d >= g.pathLens[this.pathIndex]) { this.leak(); return; }
      const p = g.pathPosAt(this.pathIndex, this.d);
      if (p.x !== this.x || p.y !== this.y) this.heading = Math.atan2(p.y - this.y, p.x - this.x);
      this.x = p.x; this.y = p.y;
    } else if (this.def.flying) {
      const ex = g.exitPx.x, ey = g.exitPx.y;
      const dd = dist(this.x, this.y, ex, ey);
      if (dd < 6) { this.leak(); return; }
      this.heading = Math.atan2(ey - this.y, ex - this.x);
      this.x += (ex - this.x) / dd * sp;
      this.y += (ey - this.y) / dd * sp;
    } else {
      if (this.tx == null) this.pickNext();
      if (this.tx == null) return;
      const dd = dist(this.x, this.y, this.tx, this.ty);
      if (dd > 0.5) this.heading = Math.atan2(this.ty - this.y, this.tx - this.x);
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
    if (g.hero && g.hero.alive && dist2(this.x, this.y, g.hero.x, g.hero.y) < 140 * 140) {
      g.hero.gainXp(this.maxHp * 0.12 + this.def.bounty);
    }
    g.addFx({ type: 'boom', x: this.x, y: this.y, t: 0, dur: 0.3, r: this.def.radius * 2.2, color: this.def.color });
    // burst into debris
    const n = this.def.boss ? 16 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 50 + Math.random() * 130;
      g.addParticle({
        kind: 'debris', x: this.x, y: this.y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, grav: 220,
        color: i % 2 ? this.def.color : shade(this.def.color, -50),
        size: (this.def.boss ? 3 : 2) + Math.random() * 2,
        rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 10,
        t: 0, dur: 0.4 + Math.random() * 0.3,
      });
    }
    if (this.def.boss) {
      g.addFx({ type: 'ring', x: this.x, y: this.y, t: 0, dur: 0.6, r: 90, color: this.def.color });
      g.addFx({ type: 'glowfx', x: this.x, y: this.y, r: 50, rgb: '255,255,255', t: 0, dur: 0.35 });
    }
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
    this.angle = -Math.PI / 2;
    this.recoil = 0;
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
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (this.fire()) this.cooldown = this.effRate;
    else this.cooldown = 0.05;
  }

  aimAt(e) {
    this.angle = Math.atan2(e.y - this.y, e.x - this.x);
    this.recoil = 1;
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
        g.addFx({ type: 'glowfx', x: e.x, y: e.y, r: 9, rgb: '186,230,253', t: 0, dur: 0.25 });
      }
      g.addFx({ type: 'ring', x: this.x, y: this.y, t: 0, dur: 0.35, r: this.effRange, color: '#7dd3fc' });
      // drifting ice shards
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * (this.effRange - 14);
        g.addParticle({
          kind: 'shard', x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d,
          vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 24, grav: 70,
          size: 2.5 + Math.random() * 2.5, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 6,
          t: 0, dur: 0.45 + Math.random() * 0.3,
        });
      }
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
      let px = this.x, py = this.y - 8;
      for (const e of hit) {
        g.addFx({ type: 'bolt', pts: boltPts(px, py, e.x, e.y), t: 0, dur: 0.16 });
        g.addFx({ type: 'glowfx', x: e.x, y: e.y, r: 13, rgb: '216,180,254', t: 0, dur: 0.22 });
        g.sparkBurst(e.x, e.y, 3, '#e9d5ff', 110);
        if (s.stunCh > 0 && Math.random() < s.stunCh) e.stunT = Math.max(e.stunT, s.stunDur);
        e.damage(this.effDmg, { pierce: s.pierce });
        px = e.x; py = e.y;
      }
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
      this.aimAt(e);
      e.damage(dmg, { pierce: s.pierce });
      const col = crit ? '#fbbf24' : '#fde68a';
      g.addFx({ type: 'beam', x1: this.x, y1: this.y, x2: e.x, y2: e.y, t: 0, dur: 0.12, color: col });
      g.addFx({ type: 'glowfx', x: e.x, y: e.y, r: crit ? 16 : 10, rgb: crit ? '251,191,36' : '253,230,138', t: 0, dur: 0.2 });
      g.sparkBurst(e.x, e.y, crit ? 8 : 4, col, 170, Math.atan2(e.y - this.y, e.x - this.x), 1.8);
      if (crit) g.addFx({ type: 'text', x: e.x, y: e.y - 14, t: 0, dur: 0.7, str: 'CRIT!', color: '#fbbf24' });
      Sound.play('shoot');
      return true;
    }
    // bullet / shell / missile: projectiles
    const n = (k === 'missile') ? s.multishot : 1;
    const shots = (k === 'shell') ? s.multishot : 1;
    const targets = this.acquire(Math.max(n, 1));
    if (!targets.length) return false;
    this.aimAt(targets[0]);
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
    this.d0 = dist(this.x, this.y, target.x, target.y);
    this.smokeT = 0;
  }

  update(dt) {
    const t = this.target;
    if (t && !t.dead && !t.finished) { this.lastX = t.x; this.lastY = t.y; }
    else if (!(this.tower.stats.splash > 0)) { this.dead = true; return; }
    const dd = dist(this.x, this.y, this.lastX, this.lastY);
    const step = this.speed * dt;
    if (this.kind === 'missile') {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.028;
        this.game.addParticle({
          kind: 'smoke', x: this.x, y: this.y,
          vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
          size: 2.2 + Math.random() * 2, t: 0, dur: 0.4 + Math.random() * 0.2,
        });
      }
    }
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
      // fireball, sparks, rising smoke and a lingering scorch mark
      g.addFx({ type: 'glowfx', x: this.lastX, y: this.lastY, r: s.splash * 0.95, rgb: '255,200,110', t: 0, dur: 0.28 });
      g.addFx({ type: 'boom', x: this.lastX, y: this.lastY, t: 0, dur: 0.3, r: s.splash, color: '#fca5a5' });
      g.addGround({ type: 'scorch', x: this.lastX, y: this.lastY, r: s.splash * 0.75, t: 0, dur: 4 });
      g.sparkBurst(this.lastX, this.lastY, 9, '#fdba74', 200);
      for (let i = 0; i < 5; i++) {
        g.addParticle({
          kind: 'smoke', x: this.lastX + (Math.random() - 0.5) * s.splash * 0.6,
          y: this.lastY + (Math.random() - 0.5) * s.splash * 0.4,
          vx: (Math.random() - 0.5) * 16, vy: -18 - Math.random() * 24,
          size: 3.5 + Math.random() * 3.5, t: 0, dur: 0.6 + Math.random() * 0.4,
        });
      }
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
        if (s.poisonDps > 0) {
          // venom splat: drips + a stain on the ground
          const blobs = [];
          for (let i = 0; i < 3; i++) blobs.push([(Math.random() - 0.5) * 10, (Math.random() - 0.5) * 7, 3 + Math.random() * 4]);
          g.addGround({ type: 'splat', x: e.x, y: e.y + e.def.radius * 0.6, blobs, rgb: '101,163,13', t: 0, dur: 2.5 });
          for (let i = 0; i < 5; i++) {
            g.addParticle({
              kind: 'drop', x: e.x, y: e.y, color: '#a3e635',
              vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, grav: 260,
              size: 1.4 + Math.random() * 1.2, t: 0, dur: 0.4 + Math.random() * 0.25,
            });
          }
          g.addFx({ type: 'glowfx', x: e.x, y: e.y, r: 9, rgb: '163,230,53', t: 0, dur: 0.2 });
        } else {
          g.sparkBurst(e.x, e.y, 3, '#fde68a', 120);
          g.addFx({ type: 'glowfx', x: e.x, y: e.y, r: 7, rgb: '253,230,138', t: 0, dur: 0.15 });
        }
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
    this.particles = [];
    this.groundFx = [];
    this.spawnQueue = [];
    this.over = false; this.won = false;
    this.paused = false;
    this.time = 0;
    this.selected = null;
    this.selectedHero = false;
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

    // hero spawns mid-map near the action
    this.hero = null;
    if (opts.heroId && HEROES[opts.heroId]) {
      let hx, hy;
      if (this.isMaze) {
        hx = COLS * CELL * 0.5; hy = ROWS * CELL * 0.5;
      } else {
        const p = this.pathPosAt(0, this.pathLens[0] * 0.45);
        hx = p.x; hy = p.y;
      }
      this.hero = new Hero(this, opts.heroId, hx, hy);
    }
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
      for (const e of this.enemies) {
        e.applySlow(0.6, 5);
        this.addFx({ type: 'glowfx', x: e.x, y: e.y, r: 12, rgb: '186,230,253', t: 0, dur: 0.4 });
      }
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
      this.addFx({ type: 'glowfx', x: ox, y: oy, r: 55, rgb: '255,200,110', t: -i * 0.12, dur: 0.35 });
      this.addGround({ type: 'scorch', x: ox, y: oy, r: 45, t: 0, dur: 5 });
      this.sparkBurst(ox, oy, 8, '#fdba74', 220);
    }
    Sound.play('boom');
  }

  handleClick(px, py) {
    if (this.over) return;
    if (this.armedAbility === 'airstrike') { this.castAirstrike(px, py); return; }
    // hero: click to select, then click anywhere to move
    const h = this.hero;
    if (h && !this.buildType) {
      const hx = h.alive ? h.x : h.rally.x, hy = h.alive ? h.y : h.rally.y;
      if (dist2(px, py, hx, hy) < 20 * 20) {
        this.selectedHero = true;
        this.selected = null;
        return;
      }
      if (this.selectedHero) {
        const tc = Math.floor(px / CELL), tr = Math.floor(py / CELL);
        const tw = this.towerGrid.get(cellKey(tc, tr));
        if (tw) { this.selected = tw; this.selectedHero = false; return; }
        h.rally.x = clamp(px, 12, COLS * CELL - 12);
        h.rally.y = clamp(py, 12, ROWS * CELL - 12);
        return;
      }
    }
    const c = Math.floor(px / CELL), r = Math.floor(py / CELL);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    const t = this.towerGrid.get(cellKey(c, r));
    if (t) { this.selected = t; this.buildType = null; this.selectedHero = false; return; }
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
  addParticle(p) { if (this.particles.length < 400) this.particles.push(p); }
  addGround(f) {
    this.groundFx.push(f);
    if (this.groundFx.length > 60) this.groundFx.shift();
  }
  sparkBurst(x, y, n, color, speed = 150, baseAngle = null, spread = Math.PI * 2) {
    for (let i = 0; i < n; i++) {
      const a = baseAngle != null ? baseAngle + (Math.random() - 0.5) * spread : Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random());
      this.addParticle({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t: 0, dur: 0.16 + Math.random() * 0.14 });
    }
  }

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
    // Sister Mercy's inspiring presence: nearby towers attack faster
    if (this.hero && this.hero.alive && this.hero.def.auraRate) {
      const h = this.hero, hr2 = h.def.auraR * h.def.auraR;
      for (const t of this.towers) {
        if (t.def.kind === 'support' || t.def.kind === 'income') continue;
        if (dist2(h.x, h.y, t.x, t.y) <= hr2) t.aura.rate = Math.max(t.aura.rate, h.def.auraRate);
      }
    }

    if (this.hero) this.hero.update(dt);

    for (const e of this.enemies) { if (!e.dead && !e.finished) e.update(dt); }
    this.enemies = this.enemies.filter(e => !e.dead && !e.finished);

    for (const t of this.towers) t.update(dt);

    for (const p of this.projectiles) { if (!p.dead) p.update(dt); }
    this.projectiles = this.projectiles.filter(p => !p.dead);

    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < f.dur);

    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      if (p.spin) p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter(p => p.t < p.dur);
    for (const f of this.groundFx) f.t += dt;
    this.groundFx = this.groundFx.filter(f => f.t < f.dur);

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
  // Floating panel with the tower's exact effective numbers.
  drawTowerTooltip(ctx, t) {
    const s = t.stats;
    const lines = [];
    if (s.dmg > 0) {
      const shots = Math.max(s.multishot || 1, 1);
      const critMul = 1 + 2 * (s.critCh || 0);
      const dps = (t.effDmg * shots * critMul) / t.effRate;
      lines.push('Damage ' + Math.round(t.effDmg) + (shots > 1 ? ' ×' + shots : '') + (s.critCh > 0 ? '  (crit ×3: ' + Math.round(t.effDmg * 3) + ')' : ''));
      lines.push('Speed ' + (1 / t.effRate).toFixed(2) + '/s   DPS ' + Math.round(dps) + (s.chain > 1 ? ' per target' : ''));
    }
    if (s.range > 0) lines.push('Range ' + Math.round(t.effRange));
    if (s.splash > 0) lines.push('Blast radius ' + Math.round(s.splash));
    if (s.chain > 1) lines.push('Chains to ' + s.chain + ' enemies');
    if (s.slowPct > 0) lines.push('Slow ' + Math.round(s.slowPct * 100) + '% for ' + s.slowDur + 's');
    if (s.poisonDps > 0) lines.push('Poison ' + Math.round(s.poisonDps * s.poisonDur) + ' over ' + s.poisonDur + 's');
    if (s.burnDps > 0) lines.push('Burn ' + Math.round(s.burnDps * s.burnDur) + ' over ' + s.burnDur + 's');
    if (s.stunCh > 0) lines.push('Stun ' + Math.round(s.stunCh * 100) + '% for ' + s.stunDur + 's');
    if (s.armorShred > 0) lines.push('Shreds ' + s.armorShred + ' armor per hit');
    if (s.ignoreArmor) lines.push('Ignores armor');
    if (s.income > 0) lines.push('Income $' + s.income + ' per wave');
    if (s.interestPct > 0) lines.push('Interest ' + (s.interestPct * 100).toFixed(1) + '% of cash per wave');
    if (s.buffDmg > 0) lines.push('Nearby towers +' + Math.round(s.buffDmg * 100) + '% damage');
    if (s.buffRate > 0) lines.push('Nearby towers +' + Math.round(s.buffRate * 100) + '% speed');
    if (s.buffRange > 0) lines.push('Nearby towers +' + Math.round(s.buffRange * 100) + '% range');
    if (!s.canAir) lines.push('Cannot hit air');
    if (s.seesStealth) lines.push('Sees stealth');

    const title = t.def.name + '  ' + t.levels[0] + '/' + t.levels[1];
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    let w = ctx.measureText(title).width;
    ctx.font = '11px "Segoe UI", sans-serif';
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    w += 18;
    const lh = 15, hgt = 24 + lines.length * lh;
    let bx = t.x + 24, by = t.y - hgt / 2;
    if (bx + w > COLS * CELL - 4) bx = t.x - 24 - w;
    by = clamp(by, 4, ROWS * CELL - hgt - 4);
    ctx.fillStyle = 'rgba(10,16,26,0.92)';
    ctx.strokeStyle = TOWER_ACCENT[t.type] || '#fff';
    ctx.beginPath();
    ctx.rect(bx, by, w, hgt);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = TOWER_ACCENT[t.type] || '#fff';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillText(title, bx + 9, by + 6);
    ctx.fillStyle = '#dbe4f0';
    ctx.font = '11px "Segoe UI", sans-serif';
    lines.forEach((l, i) => ctx.fillText(l, bx + 9, by + 22 + i * lh));
  }

  // Painterly terrain, rendered once per match to an offscreen canvas.
  renderTerrain() {
    const W = COLS * CELL, H = ROWS * CELL;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const theme = THEMES[this.map.theme] || THEMES.grass;
    const rng = mulberry32(hashStr('terrain:' + this.map.id));

    // base gradient + soft mottling + fine grass-blade texture
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, theme.ground[0]);
    bg.addColorStop(0.55, theme.ground[1]);
    bg.addColorStop(1, theme.ground[2]);
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 130; i++) {
      const mx = rng() * W, my = rng() * H, mr = 25 + rng() * 70;
      x.globalAlpha = 0.05 + rng() * 0.07;
      x.fillStyle = theme.mottle[Math.floor(rng() * theme.mottle.length)];
      x.beginPath(); x.ellipse(mx, my, mr, mr * (0.5 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    for (let i = 0; i < 1400; i++) {
      const px = rng() * W, py = rng() * H;
      const len = 2 + rng() * 4, a = -0.4 + rng() * 0.8;
      x.strokeStyle = rng() < 0.5 ? theme.blade : theme.bladeLight;
      x.beginPath(); x.moveTo(px, py);
      x.lineTo(px + Math.sin(a) * len, py - Math.cos(a) * len);
      x.stroke();
    }

    if (!this.isMaze) {
      // winding dirt road: dark border, packed-earth fill, worn center
      x.lineCap = 'round'; x.lineJoin = 'round';
      for (const [w, col, al] of [
        [CELL * 0.98, theme.pathEdge, 1],
        [CELL * 0.82, theme.path, 1],
        [CELL * 0.45, theme.pathLight, 0.5],
      ]) {
        x.globalAlpha = al; x.strokeStyle = col; x.lineWidth = w;
        for (const pts of this.pathsPx) {
          x.beginPath();
          pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py));
          x.stroke();
        }
      }
      x.globalAlpha = 1; x.lineWidth = 1;
      // dapples, pebbles and tufts along the road
      for (let pi = 0; pi < this.pathsPx.length; pi++) {
        const len = this.pathLens[pi];
        for (let d = 6; d < len; d += 7 + rng() * 9) {
          const p = this.pathPosAt(pi, d);
          const q = this.pathPosAt(pi, Math.min(len, d + 2));
          let nx = -(q.y - p.y), ny = q.x - p.x;
          const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          const roll = rng();
          if (roll < 0.5) {
            const off = (rng() - 0.5) * CELL * 0.6;
            x.globalAlpha = 0.18 + rng() * 0.15;
            x.fillStyle = rng() < 0.6 ? theme.pathSpeck : theme.pathLight;
            x.beginPath();
            x.ellipse(p.x + nx * off, p.y + ny * off, 2.5 + rng() * 4, 1.5 + rng() * 2.5, rng() * Math.PI, 0, Math.PI * 2);
            x.fill();
            x.globalAlpha = 1;
          } else if (roll < 0.62) {
            const off = (rng() - 0.5) * CELL * 0.65;
            const bx = p.x + nx * off, by = p.y + ny * off, br = 1.4 + rng() * 1.6;
            x.fillStyle = theme.pathSpeck;
            x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill();
            x.fillStyle = 'rgba(255,255,255,0.25)';
            x.beginPath(); x.arc(bx - br * 0.3, by - br * 0.3, br * 0.45, 0, Math.PI * 2); x.fill();
          } else if (roll < 0.78) {
            const side = rng() < 0.5 ? 1 : -1;
            const off = side * (CELL * 0.52 + rng() * 5);
            drawTuft(x, p.x + nx * off, p.y + ny * off, theme, rng);
          }
        }
      }
    } else {
      // open buildable field: whisper-faint checker so tiles stay readable
      x.globalAlpha = 0.05;
      x.fillStyle = '#000';
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if ((c + r) % 2) x.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
      }
      x.globalAlpha = 1;
    }

    // decor scatter on free cells (cosmetic, towers plop right on top)
    const reserved = (c, r) => {
      const k = cellKey(c, r);
      if (this.blockedSet.has(k)) return true;
      if (!this.isMaze) return this.pathCells.has(k);
      if (c === this.exitCell[0] && r === this.exitCell[1]) return true;
      return this.map.spawns.some(s => s[0] === c && s[1] === r);
    };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (reserved(c, r)) continue;
        const roll = rng();
        const px = (c + 0.2 + rng() * 0.6) * CELL, py = (r + 0.25 + rng() * 0.55) * CELL;
        if (roll < 0.045) drawTree(x, px, py, theme, rng);
        else if (roll < 0.085) drawBoulder(x, px, py, 4 + rng() * 3.5, theme);
        else if (roll < 0.16) {
          drawTuft(x, px, py, theme, rng);
          if (rng() < 0.4) drawFlower(x, px + 6, py - 2, theme.flowers[Math.floor(rng() * theme.flowers.length)], theme.glow);
        } else if (roll < 0.21) {
          drawFlower(x, px, py, theme.flowers[Math.floor(rng() * theme.flowers.length)], theme.glow);
        }
      }
    }

    // blocked cells: boulder formations
    for (const k of this.blockedSet) {
      const [c, r] = k.split(',').map(Number);
      const cx = (c + 0.5) * CELL, cy = (r + 0.5) * CELL;
      drawBoulder(x, cx - 7, cy + 6, 9, theme);
      drawBoulder(x, cx + 6, cy + 3, 12, theme);
      drawBoulder(x, cx - 2, cy - 7, 7, theme);
    }

    // spawn gates and the bastion keep (path maps); maze portals animate in render()
    if (!this.isMaze) {
      const seen = new Set();
      for (const pts of this.pathsPx) {
        const a = pts[0], z = pts[pts.length - 1];
        const ax = clamp(a[0], 22, W - 22), ay = clamp(a[1], 24, H - 24);
        const zx = clamp(z[0], 24, W - 24), zy = clamp(z[1], 32, H - 26);
        if (!seen.has('g' + ax + ',' + ay)) { drawSpawnGate(x, ax, ay, theme); seen.add('g' + ax + ',' + ay); }
        if (!seen.has('k' + zx + ',' + zy)) { drawKeep(x, zx, zy, theme); seen.add('k' + zx + ',' + zy); }
      }
    } else {
      // stone pads under the animated portals
      const pad = (px, py) => {
        x.fillStyle = 'rgba(0,0,0,0.25)';
        x.beginPath(); x.ellipse(px, py + 2, 19, 14, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = theme.rock[1];
        x.beginPath(); x.ellipse(px, py, 18, 13.5, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = theme.rock[0];
        x.beginPath(); x.ellipse(px, py, 14, 10.5, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(0,0,0,0.45)';
        x.beginPath(); x.ellipse(px, py, 10, 7.5, 0, 0, Math.PI * 2); x.fill();
      };
      for (const [c, r] of this.map.spawns) pad((c + 0.5) * CELL, (r + 0.5) * CELL);
      pad(this.exitPx.x, this.exitPx.y);
    }

    // lighting: soft key light + vignette
    const lg = x.createRadialGradient(W * 0.3, H * 0.2, 50, W * 0.3, H * 0.2, H * 1.2);
    lg.addColorStop(0, 'rgba(255,250,220,0.10)');
    lg.addColorStop(1, 'rgba(255,250,220,0)');
    x.fillStyle = lg; x.fillRect(0, 0, W, H);
    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
    return cv;
  }

  render(ctx) {
    const W = COLS * CELL, H = ROWS * CELL;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.terrain, 0, 0);

    // maze portals (animated)
    if (this.isMaze) {
      for (const [c, r] of this.map.spawns) drawPortal(ctx, (c + 0.5) * CELL, (r + 0.5) * CELL, '74,222,128', this.time);
      drawPortal(ctx, this.exitPx.x, this.exitPx.y, '192,132,252', -this.time);
    }

    // ground decals: scorch marks, venom stains
    for (const f of this.groundFx) {
      const k = f.t / f.dur;
      if (f.type === 'scorch') {
        ctx.globalAlpha = 0.4 * (1 - k);
        ctx.fillStyle = '#0c0a08';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.3 * (1 - k);
        ctx.fillStyle = '#1c1612';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.55, f.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'splat') {
        ctx.fillStyle = 'rgba(' + f.rgb + ',' + (0.45 * (1 - k)).toFixed(2) + ')';
        for (const [bx, by, br] of f.blobs) {
          ctx.beginPath(); ctx.ellipse(f.x + bx, f.y + by, br, br * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // placement grid, only while building
    if (this.buildType && !this.over) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke(); }
      for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke(); }
    }

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
      drawTower(ctx, t, this.time);
      if (this.selected === t) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, 19, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
      }
      if (this.overclockT > 0 && t.stats.dmg > 0) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, 21, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56,189,248,0.6)';
        ctx.stroke();
      }
    }

    // enemies
    for (const e of this.enemies) drawEnemy(ctx, e, this.time);

    // hero
    if (this.hero) this.hero.draw(ctx, this.time);

    // projectiles
    for (const p of this.projectiles) {
      const ang = Math.atan2(p.lastY - p.y, p.lastX - p.x);
      if (p.kind === 'missile') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        const fl = 5 + Math.sin(this.time * 40 + p.x) * 2;
        const fg = ctx.createLinearGradient(-4 - fl, 0, -3, 0);
        fg.addColorStop(0, 'rgba(251,146,60,0)');
        fg.addColorStop(1, '#fdba74');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(-4 - fl, 0); ctx.lineTo(-3, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-4, -2, 7, 4);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(7, 0); ctx.lineTo(3, 2); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'shell') {
        // lobbed arc: shadow stays on the ground, ball flies high
        const dd = dist(p.x, p.y, p.lastX, p.lastY);
        const prog = p.d0 > 0 ? clamp(1 - dd / p.d0, 0, 1) : 1;
        const lift = Math.min(38, p.d0 * 0.22) * Math.sin(Math.PI * prog);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, 3.5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        const by = p.y - lift;
        ctx.strokeStyle = 'rgba(148,163,184,0.35)';
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(ang) * 8, by - Math.sin(ang) * 8 + lift * 0.15);
        ctx.lineTo(p.x, by);
        ctx.stroke();
        const sg = ctx.createRadialGradient(p.x - 1.4, by - 1.4, 0.5, p.x, by, 4.2);
        sg.addColorStop(0, '#e2e8f0');
        sg.addColorStop(1, '#475569');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(p.x, by, 4, 0, Math.PI * 2); ctx.fill();
      } else {
        const col = p.tower.type === 'venom' ? '163,230,53' : '253,230,138';
        ctx.strokeStyle = 'rgba(' + col + ',0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(ang) * 9, p.y - Math.sin(ang) * 9);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = 'rgb(' + col + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2); ctx.fill();
      }
    }

    // particles
    for (const p of this.particles) {
      const k = 1 - p.t / p.dur;
      if (p.kind === 'spark') {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.kind === 'smoke') {
        ctx.globalAlpha = 0.3 * k;
        ctx.fillStyle = '#8a8f98';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + (1 - k) * 1.6), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'shard') {
        ctx.globalAlpha = k;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = '#cfeffc';
        ctx.beginPath();
        ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.55, 0); ctx.lineTo(0, p.size); ctx.lineTo(-p.size * 0.55, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#7dd3fc'; ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'debris') {
        ctx.globalAlpha = k;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.kind === 'drop') {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

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
      } else if (f.type === 'bolt') {
        ctx.globalAlpha = 1 - k;
        ctx.lineJoin = 'round';
        for (const wc of [[5, 'rgba(168,85,247,0.35)'], [2.2, '#d8b4fe'], [1, '#f5f3ff']]) {
          ctx.lineWidth = wc[0]; ctx.strokeStyle = wc[1];
          ctx.beginPath();
          f.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]));
          ctx.stroke();
        }
        ctx.lineWidth = 1;
      } else if (f.type === 'beam') {
        ctx.globalAlpha = 1 - k;
        for (const wc of [[4.5, 'rgba(253,230,138,0.30)'], [1.4, f.color]]) {
          ctx.lineWidth = wc[0]; ctx.strokeStyle = wc[1];
          ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        }
        ctx.lineWidth = 1;
      } else if (f.type === 'glowfx') {
        const rr = f.r * (0.6 + 0.4 * k);
        const g = ctx.createRadialGradient(f.x, f.y, 0.5, f.x, f.y, rr);
        g.addColorStop(0, 'rgba(' + f.rgb + ',' + (0.75 * (1 - k)).toFixed(2) + ')');
        g.addColorStop(1, 'rgba(' + f.rgb + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.fill();
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

    // hover tooltip: exact numbers for the tower under the cursor
    if (!this.buildType && !this.over) {
      const hc = Math.floor(this.mouse.x / CELL), hr = Math.floor(this.mouse.y / CELL);
      const ht = this.towerGrid.get(cellKey(hc, hr));
      if (ht) this.drawTowerTooltip(ctx, ht);
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
