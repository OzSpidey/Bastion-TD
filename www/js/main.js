// Bastion TD — UI shell: screens, persistence, HUD, game loop.

const SAVE_KEY = 'bastionTD_save_v1';
let SAVE = loadSave();

function loadSave() {
  const def = {
    rp: 0, perks: {}, stars: {}, ach: {}, bossKills: 0,
    bestEndless: 0, bestMaze: 0, sound: true, music: true, shake: true, dmgNums: true,
    dailyDone: {}, hero: 'aldric', heroXp: {}, dailyStreak: 0, lastDaily: '',
    life: { kills: 0, waves: 0, games: 0, wins: 0 },
    synergiesFound: {}, quests: { date: '', prog: {}, done: {} },
  };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return Object.assign(def, JSON.parse(raw));
  } catch (e) { /* corrupted save: start fresh */ }
  return def;
}
function saveSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage full or blocked */ }
}

function computeBonuses() {
  const b = { startCash: 0, startLives: 0, dmgMul: 1, rangeMul: 1, sellRate: 0.7, interest: 0, bountyMul: 1, cdMul: 1 };
  for (const p of PERKS) {
    const lvl = SAVE.perks[p.id] || 0;
    if (lvl > 0) p.apply(b, lvl);
  }
  return b;
}

function starsTotal() {
  let n = 0;
  for (const k in SAVE.stars) n += SAVE.stars[k];
  return n;
}

// ============ DOM helpers ============
const $ = sel => document.querySelector(sel);
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id).classList.add('active');
}
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
function unlock(id) {
  if (SAVE.ach[id]) return;
  SAVE.ach[id] = true;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (a) toast(`${a.icon} <b>Achievement:</b> ${a.name}`);
  saveSave();
}

// ============ Menu ============
function renderMenu() {
  renderQuests();
  $('#menu-rp').textContent = `(${SAVE.rp} RP)`;
  $('#menu-ach').textContent = `(${Object.keys(SAVE.ach).length}/${ACHIEVEMENTS.length})`;
  const parts = [`⭐ ${starsTotal()}/${CAMPAIGN_MAPS.length * 9} stars`];
  if (SAVE.dailyStreak > 1) parts.push(`🔥 ${SAVE.dailyStreak}-day streak`);
  if (SAVE.bestEndless) parts.push(`♾️ best wave ${SAVE.bestEndless}`);
  if (SAVE.bestMaze) parts.push(`🌀 best wave ${SAVE.bestMaze}`);
  $('#menu-stats').textContent = parts.join('  ·  ');
}

document.querySelectorAll('.menu-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode === 'daily') startDaily();
    else showMaps(mode);
  });
});
$('#btn-research').addEventListener('click', () => { renderResearch(); show('screen-research'); });
$('#btn-achievements').addEventListener('click', () => { renderAch(); show('screen-ach'); });
$('#btn-help').addEventListener('click', () => show('screen-help'));
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { renderMenu(); show('screen-menu'); }));

// ============ Map select ============
function mapUnlocked(mode, idx) {
  if (mode !== 'campaign' || idx === 0) return true;
  const prev = CAMPAIGN_MAPS[idx - 1];
  return DIFFICULTIES.some(d => (SAVE.stars[prev.id + ':' + d.id] || 0) > 0);
}

function drawMiniMap(cv, map) {
  const s = cv.width / COLS;
  const x = cv.getContext('2d');
  const theme = THEMES[map.theme] || THEMES.grass;
  const bg = x.createLinearGradient(0, 0, 0, cv.height);
  bg.addColorStop(0, theme.ground[0]);
  bg.addColorStop(1, theme.ground[2]);
  x.fillStyle = bg;
  x.fillRect(0, 0, cv.width, cv.height);
  if (map.type === 'path') {
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const [w, col] of [[s * 0.95, theme.pathEdge], [s * 0.7, theme.path]]) {
      x.strokeStyle = col;
      x.lineWidth = w;
      for (const wps of map.paths) {
        x.beginPath();
        wps.forEach(([c, r], i) => {
          const px = (c + 0.5) * s, py = (r + 0.5) * s;
          if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
        });
        x.stroke();
      }
    }
    x.lineWidth = 1;
  } else {
    for (const [c, r] of (map.blocked || [])) {
      x.fillStyle = theme.rock[1];
      x.fillRect(c * s + 1, r * s + 1, s - 2, s - 2);
    }
    for (const [c, r] of map.spawns) { x.fillStyle = '#4ade80'; x.fillRect(c * s, r * s, s, s); }
    x.fillStyle = '#f87171';
    x.fillRect(map.exit[0] * s, map.exit[1] * s, s, s);
  }
}

function showMaps(mode) {
  const titles = {
    campaign: '🏰 Campaign', endless: '♾️ Endless', maze: '🌀 Maze',
    bossrush: '💀 Boss Rush', sandbox: '🧪 Sandbox',
  };
  $('#maps-title').textContent = titles[mode] + ' — Select Map';
  $('#daily-banner').classList.add('hidden');
  renderHeroStrip();
  renderCurseStrip();
  const list = mode === 'campaign' || mode === 'endless' || mode === 'bossrush' ? CAMPAIGN_MAPS
    : mode === 'maze' ? MAZE_MAPS : MAPS;
  const grid = $('#maps-grid');
  grid.innerHTML = '';
  list.forEach((map, idx) => {
    const card = document.createElement('div');
    card.className = 'map-card';
    const locked = !mapUnlocked(mode, idx);
    if (locked) card.classList.add('locked');
    const cv = document.createElement('canvas');
    cv.width = 240; cv.height = 240 * ROWS / COLS;
    drawMiniMap(cv, map);
    card.innerHTML = `<h3>${map.name} <small style="color:var(--gold)">${'★'.repeat(map.diffStars)}</small></h3>`;
    card.appendChild(cv);
    const desc = document.createElement('p');
    desc.className = 'map-best';
    desc.textContent = map.desc;
    card.appendChild(desc);
    if (mode === 'campaign') {
      const stars = document.createElement('div');
      stars.className = 'map-stars';
      stars.textContent = DIFFICULTIES.map(d => `${d.name}: ${'★'.repeat(SAVE.stars[map.id + ':' + d.id] || 0) || '—'}`).join('   ');
      card.appendChild(stars);
      const row = document.createElement('div');
      row.className = 'map-diffs';
      DIFFICULTIES.forEach((d, di) => {
        const b = document.createElement('button');
        b.textContent = d.name;
        b.addEventListener('click', () => { if (!locked) startGame({ map, mode, diffIndex: di }); });
        row.appendChild(b);
      });
      card.appendChild(row);
      if (locked) {
        const lk = document.createElement('p');
        lk.className = 'map-best';
        lk.textContent = '🔒 Earn a star on the previous map to unlock';
        card.appendChild(lk);
      }
    } else {
      const b = document.createElement('button');
      b.className = 'map-play';
      b.textContent = '▶ Play';
      b.addEventListener('click', () => startGame({ map, mode }));
      card.appendChild(b);
    }
    grid.appendChild(card);
  });
  show('screen-maps');
}

// ============ Hero select ============
function renderHeroStrip() {
  const strip = $('#hero-strip');
  strip.innerHTML = '<span class="hs-label">Your hero:</span>';
  for (const id of HERO_ORDER) {
    const h = HEROES[id];
    const b = document.createElement('button');
    b.className = 'hero-chip' + (SAVE.hero === id ? ' sel' : '');
    const hlvl = (SAVE.heroXp[id] && SAVE.heroXp[id].lvl) || 1;
    b.innerHTML = `<img class="hc-img" src="assets/heroes/${id}.png?v=2" onerror="this.outerHTML='<span class=hc-icon>${h.icon}</span>'">
      <span class="hc-name">${h.name}</span><span class="hc-title">${h.title} · Lv ${hlvl}</span>`;
    b.title = `${h.desc}\n${h.ability.name}: ${h.ability.desc}`;
    b.addEventListener('click', () => {
      SAVE.hero = id;
      saveSave();
      renderHeroStrip();
    });
    strip.appendChild(b);
  }
}

// ============ Curse contracts picker ============
let selectedCurses = [];
function renderCurseStrip() {
  const strip = $('#curse-strip');
  strip.innerHTML = '<span class="hs-label">\u2620 Curses (optional, +25% RP each):</span>';
  for (const c of CURSES) {
    const b = document.createElement('button');
    const on = selectedCurses.includes(c.id);
    b.className = 'curse-chip' + (on ? ' sel' : '');
    b.innerHTML = `${c.icon} ${c.name}`;
    b.title = c.desc;
    b.addEventListener('click', () => {
      if (on) selectedCurses = selectedCurses.filter(x => x !== c.id);
      else if (selectedCurses.length < 3) selectedCurses.push(c.id);
      renderCurseStrip();
    });
    strip.appendChild(b);
  }
}

// ============ Daily challenge ============
function startDaily() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const seed = hashStr('bastion:' + dateStr);
  const rng = mulberry32(seed);
  const map = MAPS[Math.floor(rng() * MAPS.length)];
  const i1 = Math.floor(rng() * MODIFIERS.length);
  let i2 = Math.floor(rng() * (MODIFIERS.length - 1));
  if (i2 >= i1) i2++;
  const mods = [MODIFIERS[i1], MODIFIERS[i2]];
  const done = SAVE.dailyDone[dateStr];
  toast(`📅 <b>Daily ${dateStr}</b>${done ? ' (already beaten ✓)' : ''}<br>${map.name} · 25 waves<br>⚠ ${mods[0].name}: ${mods[0].desc}<br>⚠ ${mods[1].name}: ${mods[1].desc}`);
  startGame({ map, mode: 'daily', modifierIds: mods.map(m => m.id), seed, dateStr });
}

// ============ Research ============
function renderResearch() {
  $('#rp-balance').textContent = `${SAVE.rp} RP`;
  const list = $('#perks-list');
  list.innerHTML = '';
  for (const p of PERKS) {
    const lvl = SAVE.perks[p.id] || 0;
    const cost = p.baseCost * (lvl + 1);
    const el = document.createElement('div');
    el.className = 'perk';
    const pips = Array.from({ length: p.max }, (_, i) => `<span class="pip${i < lvl ? ' on' : ''}"></span>`).join('');
    el.innerHTML = `
      <span class="perk-icon">${p.icon}</span>
      <div class="perk-info"><h4>${p.name}</h4><p>${p.desc}</p><div class="perk-pips">${pips}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'perk-buy';
    if (lvl >= p.max) {
      btn.textContent = 'MAX';
      btn.classList.add('maxed');
      btn.disabled = true;
    } else {
      btn.textContent = `${cost} RP`;
      btn.disabled = SAVE.rp < cost;
      btn.addEventListener('click', () => {
        if (SAVE.rp < cost) return;
        SAVE.rp -= cost;
        SAVE.perks[p.id] = lvl + 1;
        saveSave();
        Sound.play('upgrade');
        renderResearch();
      });
    }
    el.appendChild(btn);
    list.appendChild(el);
  }
}

// ============ Achievements ============
function renderAch() {
  const grid = $('#ach-grid');
  grid.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const el = document.createElement('div');
    el.className = 'ach' + (SAVE.ach[a.id] ? '' : ' locked');
    el.innerHTML = `<span class="ach-icon">${a.icon}</span><div><h4>${a.name}</h4><p>${a.desc}</p></div>`;
    grid.appendChild(el);
  }
}

// ============ Settings & stats ============
const SETTING_DEFS = [
  ['sound', '🔊 Sound effects'],
  ['music', '🎵 Music'],
  ['shake', '💥 Screen shake'],
  ['dmgNums', '🔢 Damage numbers'],
];
function renderSettings() {
  const list = $('#settings-list');
  list.innerHTML = '';
  for (const [key, label] of SETTING_DEFS) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const b = document.createElement('button');
    b.className = 'toggle' + (SAVE[key] ? ' on' : '');
    b.textContent = SAVE[key] ? 'ON' : 'OFF';
    b.addEventListener('click', () => {
      SAVE[key] = !SAVE[key];
      if (key === 'sound') Sound.on = SAVE.sound;
      if (key === 'music') { Music.on = SAVE.music; if (SAVE.music) Music.start(); else Music.stop(); }
      if (game) game.settings = { shake: SAVE.shake, dmgNums: SAVE.dmgNums };
      saveSave();
      renderSettings();
    });
    row.innerHTML = `<span>${label}</span>`;
    row.appendChild(b);
    list.appendChild(row);
  }
  const L = SAVE.life || { kills: 0, waves: 0, games: 0, wins: 0 };
  const heroLvls = HERO_ORDER.map(id => (SAVE.heroXp[id] && SAVE.heroXp[id].lvl) || 1).reduce((a, b) => a + b, 0);
  $('#stats-grid').innerHTML = [
    ['⚔️ Enemies slain', L.kills], ['🌊 Waves cleared', L.waves],
    ['🎮 Games played', L.games], ['🏆 Victories', L.wins],
    ['💀 Bosses killed', SAVE.bossKills], ['⭐ Stars earned', starsTotal()],
    ['🔬 Research points earned', SAVE.rp], ['🦸 Total hero levels', heroLvls],
    ['♾️ Best endless wave', SAVE.bestEndless || 0], ['🌀 Best maze wave', SAVE.bestMaze || 0],
  ].map(([k, v]) => `<div class="stat-card"><div class="sc-num">${v}</div><div class="sc-label">${k}</div></div>`).join('');
}
$('#btn-settings').addEventListener('click', () => { renderSettings(); show('screen-settings'); });
$('#btn-reset').addEventListener('click', () => {
  if (!confirm('Delete ALL progress: stars, research, hero levels, achievements?')) return;
  if (!confirm('Are you really sure? This cannot be undone.')) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});

// ---- animated menu background: drifting embers over a dark gradient ----
const bgCanvas = $('#menu-bg');
const bgCtx = bgCanvas.getContext('2d');
const bgParticles = [];
for (let i = 0; i < 70; i++) {
  bgParticles.push({
    x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2,
    vy: 0.006 + Math.random() * 0.02, vx: (Math.random() - 0.5) * 0.008,
    hue: Math.random() < 0.6 ? '74,222,128' : Math.random() < 0.5 ? '56,189,248' : '251,191,36',
    a: 0.15 + Math.random() * 0.4, ph: Math.random() * Math.PI * 2,
  });
}
function drawMenuBg(t) {
  const w = bgCanvas.width = window.innerWidth;
  const h = bgCanvas.height = window.innerHeight;
  const g = bgCtx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0d1420');
  g.addColorStop(0.6, '#0c1118');
  g.addColorStop(1, '#0a1622');
  bgCtx.fillStyle = g;
  bgCtx.fillRect(0, 0, w, h);
  const glow = bgCtx.createRadialGradient(w / 2, h * 0.25, 50, w / 2, h * 0.25, h * 0.8);
  glow.addColorStop(0, 'rgba(74,222,128,0.05)');
  glow.addColorStop(1, 'rgba(74,222,128,0)');
  bgCtx.fillStyle = glow;
  bgCtx.fillRect(0, 0, w, h);
  for (const p of bgParticles) {
    p.y -= p.vy * 0.016 * 60 / 60;
    p.x += p.vx + Math.sin(t * 0.001 + p.ph) * 0.0004;
    if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
    const tw = 0.6 + 0.4 * Math.sin(t * 0.002 + p.ph * 3);
    bgCtx.fillStyle = `rgba(${p.hue},${(p.a * tw).toFixed(2)})`;
    bgCtx.beginPath();
    bgCtx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
    bgCtx.fill();
  }
}

// ============ Game session ============
let game = null;
let gameCfg = null;
let speedIdx = 0;
const SPEEDS = [1, 2, 3];
let infoSig = '';

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');

function startGame(cfg) {
  gameCfg = cfg;
  speedIdx = 0;
  infoSig = '';
  tutStep = -1;
  previewSig = '__init__';
  Sound.on = SAVE.sound;
  game = new Game({
    map: cfg.map,
    mode: cfg.mode,
    difficulty: cfg.diffIndex != null ? DIFFICULTIES[cfg.diffIndex] : null,
    bonuses: computeBonuses(),
    modifierIds: cfg.modifierIds,
    seed: cfg.seed,
    heroId: SAVE.hero,
    curseIds: cfg.mode === 'sandbox' ? [] : selectedCurses,
    settings: { shake: SAVE.shake, dmgNums: SAVE.dmgNums },
    events: {
      onEnd: handleEnd,
      onWave: () => announceNewEnemies(),
      onBoonDraft: () => showBoonDraft(),
      onRelic: art => toast(`\ud83d\udc8e <b>Relic claimed: ${art.name}</b><br>${art.desc}`),
      onMutator: m => toast(`\ud83c\udf00 <b>Endless mutator: ${m.name}</b><br>${m.desc}`),
      onSynergy: names => {
        for (const nm of names) {
          if (SAVE.synergiesFound[nm]) continue;
          SAVE.synergiesFound[nm] = true;
          const sy = SYNERGIES.find(s => s.name === nm);
          const found = Object.keys(SAVE.synergiesFound).length;
          toast(`🔗 <b>Synergy discovered (${found}/${SYNERGIES.length}): ${nm}</b><br>${sy.desc}`);
          saveSave();
        }
      },
      onWaveCleared: n => {
        if (cfg.mode === 'endless') {
          if (n > SAVE.bestEndless) { SAVE.bestEndless = n; saveSave(); }
          if (n >= 25) unlock('endless_25');
          if (n >= 50) unlock('endless_50');
        }
        if (cfg.mode === 'maze') {
          if (n > SAVE.bestMaze) { SAVE.bestMaze = n; saveSave(); }
          if (n >= 25) unlock('maze_25');
        }
      },
      onAch: type => {
        if (type === 'bossKill') {
          SAVE.bossKills++;
          saveSave();
          if (SAVE.bossKills >= 10) unlock('boss_10');
        } else if (type === 'rich') unlock('rich');
        else if (type === 'maxTower') unlock('max_tower');
      },
    },
  });
  // restore the hero's persistent level
  if (game.hero) {
    const hx = SAVE.heroXp[SAVE.hero];
    if (hx && hx.lvl > 1) {
      game.hero.lvl = Math.min(10, hx.lvl);
      game.hero.xp = hx.xp || 0;
      game.hero.maxHp = Math.round(game.hero.def.hp * (1 + 0.12 * (game.hero.lvl - 1)));
      game.hero.hp = game.hero.maxHp;
    }
  }
  Music.on = SAVE.music;
  Music.start();
  buildBuildBar();
  buildAbilityBar();
  hideOverlay();
  show('screen-game');
}

function persistHero() {
  if (!game || !game.hero) return;
  const cur = SAVE.heroXp[game.hero.id] || { lvl: 1, xp: 0 };
  if (game.hero.lvl > cur.lvl || (game.hero.lvl === cur.lvl && game.hero.xp > cur.xp)) {
    SAVE.heroXp[game.hero.id] = { lvl: game.hero.lvl, xp: Math.floor(game.hero.xp) };
  }
}

function handleEnd(res) {
  if (res.rp > 0) { SAVE.rp += res.rp; }
  persistHero();
  updateQuests(res);
  SAVE.life.games++;
  SAVE.life.kills += res.kills;
  SAVE.life.waves += res.wavesCleared;
  if (res.won) SAVE.life.wins++;
  if (gameCfg.mode === 'campaign' && res.won) {
    const key = gameCfg.map.id + ':' + DIFFICULTIES[gameCfg.diffIndex].id;
    if (res.stars > (SAVE.stars[key] || 0)) SAVE.stars[key] = res.stars;
    unlock('first_win');
    if (res.noLeaks) unlock('untouchable');
    if (starsTotal() >= 15) unlock('star_15');
  }
  if (gameCfg.mode === 'daily' && res.won) {
    unlock('daily_win');
    if (!SAVE.dailyDone[gameCfg.dateStr]) {
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      SAVE.dailyStreak = SAVE.lastDaily === y ? SAVE.dailyStreak + 1 : 1;
      SAVE.lastDaily = gameCfg.dateStr;
      const extra = Math.min(25, 5 * (SAVE.dailyStreak - 1));
      if (extra > 0) {
        SAVE.rp += extra;
        toast(`🔥 <b>${SAVE.dailyStreak}-day streak!</b> +${extra} bonus RP`);
      }
    }
    SAVE.dailyDone[gameCfg.dateStr] = true;
  }
  saveSave();
  const title = res.won ? '🏆 VICTORY' : '💀 DEFEAT';
  const stars = gameCfg.mode === 'campaign' && res.won
    ? `<div class="stars">${[0, 1, 2].map(i =>
        `<span class="star${i < res.stars ? ' on' : ''}" style="animation-delay:${0.35 + i * 0.3}s">★</span>`).join('')}</div>`
    : '';
  const confetti = res.won
    ? '<div class="confetti">' + Array.from({ length: 26 }, (_, i) =>
        `<i style="left:${Math.random() * 100}%;background:${['#4ade80', '#38bdf8', '#fbbf24', '#f87171', '#c084fc'][i % 5]};animation-delay:${Math.random() * 1.2}s;animation-duration:${1.6 + Math.random() * 1.4}s"></i>`).join('') + '</div>'
    : '';
  showOverlay(`
    ${confetti}
    <div class="overlay-box ${res.won ? 'win' : 'lose'}">
      <h2>${title}</h2>
      ${stars}
      <p>Waves cleared: <b>${res.wavesCleared}</b> · Kills: <b>${res.kills}</b> · Leaks: <b>${res.leaks}</b></p>
      <p class="rp-earned">🔬 +${res.rp} Research Points</p>
      <div class="btn-row">
        <button id="ov-replay">↻ Replay</button>
        ${gameCfg.mode === 'daily' ? '<button id="ov-share">📋 Share</button>' : ''}
        <button id="ov-menu">🏠 Menu</button>
      </div>
    </div>`);
  $('#ov-replay').addEventListener('click', () => startGame(gameCfg));
  $('#ov-menu').addEventListener('click', goMenu);
  const shareBtn = $('#ov-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const hearts = game ? Math.max(0, game.lives) : 0;
      const txt = [
        `\ud83c\udff0 Bastion TD Daily ${gameCfg.dateStr}`,
        `${res.won ? '\ud83c\udfc6' : '\ud83d\udc80'} Wave ${res.wavesCleared}/25 \u00b7 \u2764\ufe0f ${hearts}`,
        `\ud83d\udd25 Best combo x${game ? game.stats.bestCombo : 0} \u00b7 \ud83d\udd17 ${game ? game.stats.maxSynergies : 0} synergies`,
        SAVE.dailyStreak > 1 ? `\ud83d\udd25 ${SAVE.dailyStreak}-day streak` : '',
        'https://ozspidey.github.io/Bastion-TD/',
      ].filter(Boolean).join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
        () => toast('\ud83d\udccb Result copied \u2014 paste it anywhere!'),
        () => toast('Could not copy automatically')
      );
    });
  }
}

function goMenu() {
  game = null;
  hideOverlay();
  renderMenu();
  show('screen-menu');
}

function showOverlay(html) {
  const ov = $('#overlay');
  ov.innerHTML = html;
  ov.classList.remove('hidden');
}
function hideOverlay() {
  $('#overlay').classList.add('hidden');
  $('#overlay').innerHTML = '';
}

// ---- build bar ----
let buildBtns = [];
function buildBuildBar() {
  const bar = $('#build-bar');
  bar.innerHTML = '';
  buildBtns = [];
  TOWER_ORDER.forEach((id, i) => {
    const def = TOWERS[id];
    const b = document.createElement('button');
    b.className = 'build-btn';
    b.innerHTML = `<span class="b-icon">${def.icon}</span><span class="b-name">${def.name}</span><span class="b-cost">$${game.towerCost(id)}</span>`;
    b.addEventListener('click', () => { toggleBuild(id); hideBuildTip(); });
    b.addEventListener('mouseenter', () => showBuildTip(b, id, i));
    b.addEventListener('mouseleave', hideBuildTip);
    bar.appendChild(b);
    buildBtns.push({ id, el: b });
  });
}

// rich hover tooltip with the exact numbers for a build-bar tower
function showBuildTip(btn, id, idx) {
  if (!game) return;
  const def = TOWERS[id];
  const stats = new Tower(game, id, -5, -5, 0).stats;
  const tt = $('#tt');
  tt.innerHTML = `<b>${def.icon} ${def.name}</b> <span class="tt-cost">$${game.towerCost(id)} · [${idx + 1}]</span>
    <div class="tt-desc">${def.desc}</div>
    <div class="tt-stats">${fmtStats(stats, game).split(' · ').join('<br>')}</div>`;
  tt.classList.remove('hidden');
  const r = btn.getBoundingClientRect();
  tt.style.top = Math.min(window.innerHeight - tt.offsetHeight - 8, Math.max(8, r.top)) + 'px';
  tt.style.left = (r.left - tt.offsetWidth - 10) + 'px';
}
function hideBuildTip() { $('#tt').classList.add('hidden'); }
function toggleBuild(id) {
  if (!game || game.over) return;
  game.selected = null;
  game.armedAbility = null;
  game.buildType = game.buildType === id ? null : id;
  infoSig = '';
}

// ---- abilities bar ----
let abilityBtns = [];
function buildAbilityBar() {
  const bar = $('#abilities-bar');
  bar.innerHTML = '';
  abilityBtns = [];
  ABILITIES.forEach((a, i) => {
    const b = document.createElement('button');
    b.className = 'ability-btn';
    b.title = `${a.name} [${'QWE'[i]}] — ${a.desc}`;
    b.innerHTML = `<span class="a-icon">${a.icon}</span><span class="a-name">${a.name}</span><div class="cd-fill"></div>`;
    b.addEventListener('click', () => game && game.useAbility(a.id));
    bar.appendChild(b);
    abilityBtns.push({ id: a.id, el: b, fill: b.querySelector('.cd-fill'), def: a });
  });
}

// ---- info panel ----
function fmtStats(s, g) {
  const out = [];
  if (s.dmg > 0) out.push(`Damage ${Math.round(s.dmg * g.bonuses.dmgMul)}`);
  if (s.rate > 0 && s.dmg > 0) {
    const dps = s.dmg * g.bonuses.dmgMul * Math.max(s.multishot || 1, 1) * (1 + 2 * (s.critCh || 0)) / s.rate;
    out.push(`DPS ${Math.round(dps)}`);
  }
  if (s.range > 0) out.push(`Range ${Math.round(s.range * g.bonuses.rangeMul)}`);
  if (s.rate > 0 && s.dmg > 0) out.push(`Speed ${(1 / s.rate).toFixed(1)}/s`);
  if (s.splash > 0) out.push(`Blast ${Math.round(s.splash)}`);
  if (s.chain > 0) out.push(`Chains ${s.chain}`);
  if (s.slowPct > 0) out.push(`Slow ${Math.round(s.slowPct * 100)}%`);
  if (s.poisonDps > 0) out.push(`Poison ${Math.round(s.poisonDps * s.poisonDur)}`);
  if (s.burnDps > 0) out.push(`Burn ${Math.round(s.burnDps * s.burnDur)}`);
  if (s.income > 0) out.push(`Income $${s.income}/wave`);
  if (s.interestPct > 0) out.push(`Interest ${(s.interestPct * 100).toFixed(1)}%`);
  if (s.buffDmg > 0) out.push(`Aura +${Math.round(s.buffDmg * 100)}% dmg`);
  if (s.buffRate > 0) out.push(`+${Math.round(s.buffRate * 100)}% spd`);
  if (s.critCh > 0) out.push(`Crit ${Math.round(s.critCh * 100)}%`);
  if (!s.canAir) out.push('⛔ no air');
  if (s.seesStealth) out.push('👁 sees stealth');
  if (s.ignoreArmor) out.push('ignores armor');
  return out.join(' · ');
}

function refreshInfoPanel() {
  if (!game) return;
  const sel = game.selected;
  const hero = game.selectedHero && game.hero ? game.hero : null;
  const sig = hero
    ? `h:${hero.lvl}:${Math.ceil(hero.hp / 10)}:${hero.alive ? 1 : Math.ceil(hero.respawnT)}`
    : sel
      ? `t:${sel.cx},${sel.cy}:${sel.levels[0]}:${sel.levels[1]}:${sel.targetMode}:${sel.ascended ? 1 : 0}:${sel.rank}`
      : (game.buildType ? 'b:' + game.buildType : 'none');
  const panel = $('#info-panel');
  if (sig !== infoSig) {
    infoSig = sig;
    panel.innerHTML = '';
    if (hero) {
      const h = hero.def;
      panel.innerHTML = `
        <h3>${h.icon} ${h.name} <small>Lv ${hero.lvl}</small></h3>
        <p class="tstats">${hero.alive
          ? `HP ${Math.ceil(hero.hp)}/${hero.maxHp} · Damage ${Math.round(hero.dmg)} · ${h.blocks > 1 ? 'Blocks ' + h.blocks : 'Blocks 1'}`
          : `☠ Respawns in ${Math.ceil(hero.respawnT)}s`}</p>
        <p class="tstats">XP ${Math.floor(hero.xp)}/${hero.xpNeed}</p>
        <p class="tstats">⚡ <b>${h.ability.name}</b> (auto): ${h.ability.desc}</p>
        <p class="hint">Click anywhere on the battlefield to move ${h.name.split(' ')[0]}. Right-click to deselect.</p>`;
      return;
    }
    if (sel) {
      const head = document.createElement('div');
      const selName = (sel.vetName ? `\u201c${sel.vetName}\u201d ` : '') + sel.def.name + (sel.ascended ? ' \u2728' : '') + (sel.rank ? ' ' + '\u2605'.repeat(sel.rank) : '');
      head.innerHTML = `<h3>${sel.def.icon} ${selName}</h3><p class="tstats">${fmtStats(sel.stats, game)}</p>`;
      panel.appendChild(head);
      sel.def.paths.forEach((path, p) => {
        const wrap = document.createElement('div');
        wrap.className = 'upg-path';
        wrap.innerHTML = `<span class="path-name">${p === 0 ? '🟢' : '🔵'} ${path.name} (${sel.levels[p]}/3)</span>`;
        const lvl = sel.levels[p];
        const btn = document.createElement('button');
        btn.className = 'upg-btn';
        if (lvl >= path.tiers.length) {
          btn.classList.add('maxed');
          btn.textContent = '✓ MAXED';
          btn.disabled = true;
        } else {
          const tier = path.tiers[lvl];
          const cost = Math.round(tier.cost * game.costMul);
          btn.innerHTML = `<b>${tier.name}</b><span class="u-cost">$${cost}</span><br>${tier.desc}`;
          btn.dataset.cost = cost;
          btn.addEventListener('click', () => { if (game.upgrade(sel, p)) infoSig = ''; });
        }
        wrap.appendChild(btn);
        panel.appendChild(wrap);
      });
      if (sel.levels[0] >= 3 && sel.levels[1] >= 3 && !sel.ascended) {
        const ab = document.createElement('button');
        ab.className = 'upg-btn ascend-btn';
        const acost = Math.round(800 * game.costMul);
        ab.innerHTML = `<b>\u2728 ASCEND</b><span class="u-cost">$${acost}</span><br>+30% damage, +18% speed, +15% range, golden aura`;
        ab.dataset.cost = acost;
        ab.addEventListener('click', () => { if (game.ascend(sel)) infoSig = ''; });
        panel.appendChild(ab);
      }
      const row = document.createElement('div');
      row.className = 'info-row';
      if (sel.def.kind !== 'income' && sel.def.kind !== 'support') {
        const oc = document.createElement('button');
        oc.className = 'oc-btn';
        oc.id = 'btn-overcharge';
        oc.title = 'Double attack speed for 6s';
        oc.addEventListener('click', () => { game.overchargeTower(sel); });
        row.appendChild(oc);
        const tg = document.createElement('button');
        tg.textContent = '🎯 ' + TARGET_MODES[sel.targetMode];
        tg.addEventListener('click', () => {
          sel.targetMode = (sel.targetMode + 1) % TARGET_MODES.length;
          infoSig = '';
        });
        row.appendChild(tg);
      }
      const sellBtn = document.createElement('button');
      sellBtn.className = 'sell-btn';
      sellBtn.textContent = `Sell $${Math.floor(sel.spent * game.bonuses.sellRate)}`;
      sellBtn.addEventListener('click', () => { game.sell(sel); infoSig = ''; });
      row.appendChild(sellBtn);
      panel.appendChild(row);
    } else if (game.buildType) {
      const def = TOWERS[game.buildType];
      panel.innerHTML = `<h3>${def.icon} ${def.name} — $${game.towerCost(game.buildType)}</h3>
        <p class="tstats">${def.desc}</p>
        <p class="tstats">${fmtStats(new Tower(game, game.buildType, -5, -5, 0).stats, game)}</p>
        <p class="hint">Click an open tile to place. Click again on the build button to cancel.</p>`;
    } else {
      panel.innerHTML = '<p class="hint">Select a tower type to build, or click a placed tower to manage it.</p>';
    }
  }
  // live affordability on upgrade buttons
  panel.querySelectorAll('.upg-btn[data-cost]').forEach(b => {
    b.disabled = game.cash < +b.dataset.cost;
  });
  const ocBtn = panel.querySelector('#btn-overcharge');
  if (ocBtn && sel) {
    if (sel.overchargeT > 0) { ocBtn.textContent = '⚡ ' + Math.ceil(sel.overchargeT) + 's'; ocBtn.disabled = true; ocBtn.classList.add('active'); }
    else if (sel.ocCd > 0) { ocBtn.textContent = '⚡ ' + Math.ceil(sel.ocCd) + 's'; ocBtn.disabled = true; ocBtn.classList.remove('active'); }
    else { ocBtn.textContent = '⚡ Overcharge $60'; ocBtn.disabled = game.cash < 60; ocBtn.classList.remove('active'); }
  }
}

// ---- wave preview + enemy intros ----
let previewSig = '';
function refreshWavePreview() {
  const el = $('#wave-preview');
  if (!game || game.over || game.waveActive) {
    if (previewSig !== '') { previewSig = ''; el.innerHTML = ''; }
    return;
  }
  const items = game.previewNextWave();
  const nw = game.pendingWave ? game.pendingWave.wave : 0;
  const omen = nw >= 5 && nw % 7 === 0 && nw % 10 !== 0;
  const sig = (omen ? 'O' : '') + items.map(i => i.type + i.n).join(',');
  if (sig === previewSig) return;
  previewSig = sig;
  el.innerHTML = (omen ? '<span class="wp-omen">🌑 OMEN ×2💰</span> ' : '') + 'Next: ' + items.map(i => {
    const d = ENEMIES[i.type];
    const warn = d.flying ? ' ✈' : d.stealth ? ' 👁' : (d.armor || 0) >= 5 ? ' 🛡' : '';
    return `<span class="wp-item" title="${d.name}">${d.icon}×${i.n}${warn}</span>`;
  }).join(' ');
}

function enemyTraits(d) {
  const t = [];
  if (d.boss) t.push('BOSS');
  if (d.flying) t.push("flying — cannons can't hit it");
  if (d.stealth) t.push('stealth — needs a Beacon or Recon Sniper');
  if (d.armor) t.push(`${d.armor} armor — blunts every hit`);
  if (d.regen) t.push('regenerates health');
  if (d.spawnOnDeath) t.push('splits when killed');
  if (d.speed >= 90) t.push('very fast');
  if (d.packs) t.push('attacks in packs');
  return t.length ? t.join(' · ') : 'no special traits';
}
function announceNewEnemies() {
  if (!game) return;
  if (!SAVE.seenEnemies) SAVE.seenEnemies = {};
  const seen = SAVE.seenEnemies;
  const fresh = new Set();
  for (const s of game.spawnQueue) if (!seen[s.type]) fresh.add(s.type);
  let i = 0;
  for (const type of fresh) {
    seen[type] = true;
    const d = ENEMIES[type];
    setTimeout(() => toast(`${d.icon} <b>New enemy: ${d.name}</b><br>${enemyTraits(d)}`), i * 1200);
    i++;
  }
  if (fresh.size) saveSave();
}

// ---- tutorial (first campaign game) ----
let tutStep = -1;
const TUT_STEPS = [
  { text: '🔫 Pick the <b>Gunner</b> below (or press <b>1</b>), then click a grass tile next to the road.', done: g => g.towers.length > 0 },
  { text: '⚔️ Your <b>hero</b> stands on the road. Click them, then click where they should hold the line.', done: g => g.selectedHero || g.towers.length >= 2 },
  { text: '▶ Press <b>Send Wave</b> when ready. Sending early pays bonus gold!', done: g => g.wave > 0 },
  { text: '⬆ Click any tower to open its <b>two upgrade paths</b>. Hover towers to see exact damage.', done: g => g.towers.some(t => t.levels[0] + t.levels[1] > 0) || g.wave >= 3 },
];
function refreshTutorial() {
  const bar = $('#tut-bar');
  if (!game || SAVE.tutorialDone || gameCfg.mode === 'sandbox') { bar.classList.add('hidden'); return; }
  if (tutStep >= TUT_STEPS.length) {
    SAVE.tutorialDone = true;
    saveSave();
    bar.classList.add('hidden');
    return;
  }
  if (tutStep < 0) tutStep = 0;
  const step = TUT_STEPS[tutStep];
  if (step.done(game)) { tutStep++; return; }
  bar.innerHTML = step.text;
  bar.classList.remove('hidden');
}

// ---- boon draft: pick 1 of 3 every 5th wave ----
let boonRerolled = false;
function pickBoons(n) {
  const pool = BOONS.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
function showBoonDraft() {
  if (!game || game.over) return;
  game.paused = true;
  boonRerolled = false;
  renderBoonCards(pickBoons(3));
}
function renderBoonCards(boons) {
  const cards = boons.map((b, i) =>
    `<button class="boon-card" data-i="${i}">
       <span class="bc-icon">${b.icon}</span>
       <span class="bc-name">${b.name}</span>
       <span class="bc-desc">${b.desc}</span>
     </button>`).join('');
  showOverlay(`
    <div class="overlay-box boon-box">
      <h2>⚜️ Choose a Boon</h2>
      <p class="hint">Wave ${game.wave} cleared — pick one bonus for the rest of this run</p>
      <div class="boon-row">${cards}</div>
      <button id="boon-reroll" class="flat-btn" ${boonRerolled ? 'disabled' : ''}>🎲 Reroll (${boonRerolled ? 0 : 1})</button>
    </div>`);
  document.querySelectorAll('.boon-card').forEach(el => {
    el.addEventListener('click', () => {
      const b = boons[+el.dataset.i];
      b.apply(game);
      toast(`${b.icon} <b>${b.name}</b> — ${b.desc}`);
      Sound.play('upgrade');
      hideOverlay();
      game.paused = false;
    });
  });
  $('#boon-reroll').addEventListener('click', () => {
    if (boonRerolled) return;
    boonRerolled = true;
    renderBoonCards(pickBoons(3));
  });
}

// ---- daily quests ----
function dailyQuests() {
  const date = new Date().toISOString().slice(0, 10);
  if (SAVE.quests.date !== date) SAVE.quests = { date, prog: {}, done: {} };
  const rng = mulberry32(hashStr('quests:' + date));
  const pool = QUESTS.slice();
  const picked = [];
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return picked;
}
function updateQuests(res) {
  const qs = dailyQuests();
  for (const q of qs) {
    if (SAVE.quests.done[q.id]) continue;
    SAVE.quests.prog[q.id] = (SAVE.quests.prog[q.id] || 0) + q.count(res, game);
    if (SAVE.quests.prog[q.id] >= q.target) {
      SAVE.quests.done[q.id] = true;
      SAVE.rp += 15;
      toast(`${q.icon} <b>Quest complete: ${q.name}!</b> +15 RP`);
    }
  }
  saveSave();
}
function renderQuests() {
  const qs = dailyQuests();
  $('#menu-quests').innerHTML = '<h4>📜 Today\u2019s quests</h4>' + qs.map(q => {
    const done = SAVE.quests.done[q.id];
    const prog = Math.min(q.target, SAVE.quests.prog[q.id] || 0);
    return `<div class="quest${done ? ' done' : ''}">
      <span class="q-icon">${q.icon}</span>
      <span class="q-text">${q.desc}</span>
      <span class="q-prog">${done ? '✓ +15 RP' : prog + '/' + q.target}</span>
      <div class="q-bar"><i style="width:${(prog / q.target) * 100}%"></i></div>
    </div>`;
  }).join('');
}

// ---- HUD ----
function refreshHUD() {
  if (!game) return;
  $('#hud-lives').textContent = `❤️ ${game.lives}`;
  $('#hud-cash').textContent = `💰 ${Math.floor(game.cash)}`;
  $('#hud-wave').textContent = `🌊 ${game.wave}${game.totalWaves ? '/' + game.totalWaves : ''}`;
  const send = $('#btn-sendwave');
  if (game.over) {
    send.disabled = true; send.textContent = '—';
  } else if (game.waveActive) {
    send.disabled = true;
    send.textContent = `Wave ${game.wave} — ${game.enemies.length + game.spawnQueue.length} left`;
  } else {
    send.disabled = false;
    send.textContent = game.autoTimer > 0
      ? `▶ Send Wave ${game.wave + 1} (${Math.ceil(game.autoTimer)}s, +$${Math.floor(game.autoTimer * 2)})`
      : `▶ Send Wave ${game.wave + 1}`;
  }
  $('#btn-speed').textContent = SPEEDS[speedIdx] + '×';
  $('#btn-pause').textContent = game.paused ? '▶' : '⏸';
  $('#btn-sound').textContent = Sound.on ? '🔊' : '🔇';
  $('#btn-music').classList.toggle('off', !SAVE.music);

  for (const { id, el } of buildBtns) {
    el.classList.toggle('selected', game.buildType === id);
    el.classList.toggle('poor', game.cash < game.towerCost(id));
  }
  for (const a of abilityBtns) {
    const cd = game.cds[a.id];
    const max = a.def.cd * game.bonuses.cdMul;
    a.el.disabled = cd > 0;
    a.fill.style.height = cd > 0 ? `${(cd / max) * 100}%` : '0';
    a.el.classList.toggle('armed', game.armedAbility === a.id);
  }
}

// ---- HUD buttons ----
$('#btn-sendwave').addEventListener('click', () => game && game.startWave());
$('#btn-speed').addEventListener('click', () => { speedIdx = (speedIdx + 1) % SPEEDS.length; });
$('#btn-pause').addEventListener('click', togglePause);
$('#btn-sound').addEventListener('click', () => {
  Sound.on = !Sound.on;
  SAVE.sound = Sound.on;
  saveSave();
});
$('#btn-music').addEventListener('click', () => {
  SAVE.music = !SAVE.music;
  Music.on = SAVE.music;
  if (SAVE.music) Music.start(); else Music.stop();
  saveSave();
});
$('#btn-quit').addEventListener('click', () => {
  if (!game) return;
  persistHero();
  saveSave();
  if (!game.over) {
    if (!confirm('Abandon this run? You keep Research Points for cleared waves.')) return;
    const cleared = game.waveActive ? game.wave - 1 : game.wave;
    if (cleared > 0 && game.mode !== 'sandbox') {
      SAVE.rp += cleared;
      toast(`🔬 +${cleared} Research Points`);
      saveSave();
    }
  }
  goMenu();
});

function togglePause() {
  if (!game || game.over) return;
  game.paused = !game.paused;
  if (game.paused) {
    showOverlay('<div class="overlay-box"><h2>⏸ Paused</h2><p>Press Space or click to resume</p></div>');
    $('#overlay').addEventListener('click', togglePause, { once: true });
  } else hideOverlay();
}

// ---- canvas input (mouse + touch) ----
function canvasPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}
canvas.addEventListener('mousemove', ev => {
  if (!game) return;
  const p = canvasPos(ev.clientX, ev.clientY);
  game.mouse.x = p.x; game.mouse.y = p.y;
});
canvas.addEventListener('click', ev => {
  if (!game || game.paused) return;
  const p = canvasPos(ev.clientX, ev.clientY);
  game.handleClick(p.x, p.y);
  infoSig = '';
});
canvas.addEventListener('touchstart', ev => {
  if (!game) return;
  const t = ev.touches[0];
  const p = canvasPos(t.clientX, t.clientY);
  game.mouse.x = p.x; game.mouse.y = p.y;
}, { passive: true });
canvas.addEventListener('contextmenu', ev => {
  ev.preventDefault();
  if (!game) return;
  game.buildType = null;
  game.selected = null;
  game.selectedHero = false;
  game.armedAbility = null;
  infoSig = '';
});

// ---- hotkeys ----
document.addEventListener('keydown', ev => {
  if (!game || !$('#screen-game').classList.contains('active')) return;
  const k = ev.key.toLowerCase();
  if (k >= '1' && k <= '9') {
    const id = TOWER_ORDER[+k - 1];
    if (id) toggleBuild(id);
  } else if (k === ' ') { ev.preventDefault(); togglePause(); }
  else if (k === 'f') speedIdx = (speedIdx + 1) % SPEEDS.length;
  else if (k === 'n') game.startWave();
  else if (k === 'q') game.useAbility('airstrike');
  else if (k === 'w') game.useAbility('frostnova');
  else if (k === 'e') game.useAbility('overclock');
  else if (k === 't' && game.selected) {
    game.selected.targetMode = (game.selected.targetMode + 1) % TARGET_MODES.length;
    infoSig = '';
  }
  else if (k === 'u' && game.selected) { if (game.upgrade(game.selected, 0)) infoSig = ''; }
  else if (k === 'i' && game.selected) { if (game.upgrade(game.selected, 1)) infoSig = ''; }
  else if (k === 's' && game.selected) { game.sell(game.selected); infoSig = ''; }
  else if (k === 'h' && game.hero) {
    game.selectedHero = true;
    game.selected = null;
    game.buildType = null;
    infoSig = '';
  }
  else if (k === 'escape') {
    game.buildType = null;
    game.selected = null;
    game.selectedHero = false;
    game.armedAbility = null;
    infoSig = '';
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !game.paused && !game.over) togglePause();
});

// ---- main loop ----
const STEP = 1 / 60;
let last = performance.now();
let acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!game) { acc = 0; drawMenuBg(now); return; }
  while (acc >= STEP) {
    for (let i = 0; i < SPEEDS[speedIdx]; i++) game.update(STEP);
    acc -= STEP;
  }
  Music.intensity = game.waveActive ? 1 : 0;
  game.render(ctx);
  refreshHUD();
  refreshInfoPanel();
  refreshWavePreview();
  refreshTutorial();
}

renderMenu();
requestAnimationFrame(loop);
