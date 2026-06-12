// Bastion TD — UI shell: screens, persistence, HUD, game loop.

const SAVE_KEY = 'bastionTD_save_v1';
let SAVE = loadSave();

function loadSave() {
  const def = {
    rp: 0, perks: {}, stars: {}, ach: {}, bossKills: 0,
    bestEndless: 0, bestMaze: 0, sound: true, dailyDone: {},
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
  $('#menu-rp').textContent = `(${SAVE.rp} RP)`;
  $('#menu-ach').textContent = `(${Object.keys(SAVE.ach).length}/${ACHIEVEMENTS.length})`;
  const parts = [`⭐ ${starsTotal()}/45 stars`];
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
  Sound.on = SAVE.sound;
  game = new Game({
    map: cfg.map,
    mode: cfg.mode,
    difficulty: cfg.diffIndex != null ? DIFFICULTIES[cfg.diffIndex] : null,
    bonuses: computeBonuses(),
    modifierIds: cfg.modifierIds,
    seed: cfg.seed,
    events: {
      onEnd: handleEnd,
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
  buildBuildBar();
  buildAbilityBar();
  hideOverlay();
  show('screen-game');
}

function handleEnd(res) {
  if (res.rp > 0) { SAVE.rp += res.rp; }
  if (gameCfg.mode === 'campaign' && res.won) {
    const key = gameCfg.map.id + ':' + DIFFICULTIES[gameCfg.diffIndex].id;
    if (res.stars > (SAVE.stars[key] || 0)) SAVE.stars[key] = res.stars;
    unlock('first_win');
    if (res.noLeaks) unlock('untouchable');
    if (starsTotal() >= 15) unlock('star_15');
  }
  if (gameCfg.mode === 'daily' && res.won) {
    unlock('daily_win');
    SAVE.dailyDone[gameCfg.dateStr] = true;
  }
  saveSave();
  const title = res.won ? '🏆 VICTORY' : '💀 DEFEAT';
  const stars = gameCfg.mode === 'campaign' && res.won ? `<div class="stars">${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)}</div>` : '';
  showOverlay(`
    <div class="overlay-box">
      <h2>${title}</h2>
      ${stars}
      <p>Waves cleared: <b>${res.wavesCleared}</b> · Kills: <b>${res.kills}</b> · Leaks: <b>${res.leaks}</b></p>
      <p class="rp-earned">🔬 +${res.rp} Research Points</p>
      <div class="btn-row">
        <button id="ov-replay">↻ Replay</button>
        <button id="ov-menu">🏠 Menu</button>
      </div>
    </div>`);
  $('#ov-replay').addEventListener('click', () => startGame(gameCfg));
  $('#ov-menu').addEventListener('click', goMenu);
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
    b.title = `${def.name} [${i + 1}] — ${def.desc}`;
    b.innerHTML = `<span class="b-icon">${def.icon}</span><span class="b-name">${def.name}</span><span class="b-cost">$${game.towerCost(id)}</span>`;
    b.addEventListener('click', () => toggleBuild(id));
    bar.appendChild(b);
    buildBtns.push({ id, el: b });
  });
}
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
  const sig = sel
    ? `t:${sel.cx},${sel.cy}:${sel.levels[0]}:${sel.levels[1]}:${sel.targetMode}`
    : (game.buildType ? 'b:' + game.buildType : 'none');
  const panel = $('#info-panel');
  if (sig !== infoSig) {
    infoSig = sig;
    panel.innerHTML = '';
    if (sel) {
      const head = document.createElement('div');
      head.innerHTML = `<h3>${sel.def.icon} ${sel.def.name}</h3><p class="tstats">${fmtStats(sel.stats, game)}</p>`;
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
      const row = document.createElement('div');
      row.className = 'info-row';
      if (sel.def.kind !== 'income' && sel.def.kind !== 'support') {
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
$('#btn-quit').addEventListener('click', () => {
  if (!game) return;
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
  else if (k === 'escape') {
    game.buildType = null;
    game.selected = null;
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
  if (!game) { acc = 0; return; }
  while (acc >= STEP) {
    for (let i = 0; i < SPEEDS[speedIdx]; i++) game.update(STEP);
    acc -= STEP;
  }
  game.render(ctx);
  refreshHUD();
  refreshInfoPanel();
}

renderMenu();
requestAnimationFrame(loop);
