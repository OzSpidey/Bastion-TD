// Bastion TD — static game data: towers, enemies, maps, perks, achievements.

const CELL = 48, COLS = 20, ROWS = 12;

// Each tower: base stats + two upgrade paths of three tiers.
// Tier mods mutate the computed stats object, applied in purchase order.
const TOWERS = {
  gunner: {
    name: 'Gunner', icon: '🔫', cost: 50, kind: 'bullet',
    desc: 'Cheap rapid turret. Hits ground and air.',
    base: { range: 110, rate: 0.40, dmg: 6, projSpeed: 460, canAir: true },
    paths: [
      { name: 'Rapid Fire', tiers: [
        { name: 'Oiled Trigger', cost: 70, desc: '+33% attack speed', mod: t => { t.rate *= 0.75; } },
        { name: 'Double Tap', cost: 150, desc: '+43% attack speed', mod: t => { t.rate *= 0.70; } },
        { name: 'Minigun', cost: 340, desc: 'Attack speed nearly doubled, +2 dmg', mod: t => { t.rate *= 0.55; t.dmg += 2; } },
      ]},
      { name: 'Heavy Rounds', tiers: [
        { name: 'Hollow Points', cost: 80, desc: '+6 damage', mod: t => { t.dmg += 6; } },
        { name: 'AP Rounds', cost: 170, desc: '+10 dmg, ignores 3 armor', mod: t => { t.dmg += 10; t.pierce += 3; } },
        { name: 'Depleted Core', cost: 400, desc: '+22 dmg, +30 range', mod: t => { t.dmg += 22; t.range += 30; } },
      ]},
    ],
  },
  cannon: {
    name: 'Cannon', icon: '💣', cost: 100, kind: 'shell',
    desc: 'Splash damage in an area. Cannot hit air.',
    base: { range: 125, rate: 1.5, dmg: 16, splash: 42, projSpeed: 300, canAir: false },
    paths: [
      { name: 'Incendiary', tiers: [
        { name: 'Hot Shells', cost: 90, desc: 'Hits burn for 8 dmg over 2s', mod: t => { t.burnDps = 4; t.burnDur = 2; } },
        { name: 'Napalm', cost: 200, desc: 'Burn 24 dmg over 3s, +20% blast', mod: t => { t.burnDps = 8; t.burnDur = 3; t.splash *= 1.2; } },
        { name: 'Firestorm', cost: 430, desc: '+14 dmg, burn 45 over 3s', mod: t => { t.dmg += 14; t.burnDps = 15; } },
      ]},
      { name: 'Demolition', tiers: [
        { name: 'Bigger Bombs', cost: 110, desc: '+10 dmg, +15% blast', mod: t => { t.dmg += 10; t.splash *= 1.15; } },
        { name: 'Cluster Shells', cost: 230, desc: 'Each shot fires 2 shells', mod: t => { t.multishot = 2; } },
        { name: 'Howitzer', cost: 480, desc: '+22 dmg, +40 range, huge blast', mod: t => { t.dmg += 22; t.range += 40; t.splash *= 1.3; } },
      ]},
    ],
  },
  frost: {
    name: 'Frost', icon: '❄️', cost: 80, kind: 'pulse',
    desc: 'Pulses that slow every enemy in range.',
    base: { range: 95, rate: 1.2, dmg: 3, slowPct: 0.35, slowDur: 2.0, canAir: true },
    paths: [
      { name: 'Deep Freeze', tiers: [
        { name: 'Brittle Ice', cost: 80, desc: 'Slow improved to 45%', mod: t => { t.slowPct = 0.45; } },
        { name: 'Permafrost', cost: 170, desc: 'Slow 55%, lasts 3s', mod: t => { t.slowPct = 0.55; t.slowDur = 3; } },
        { name: 'Absolute Zero', cost: 380, desc: '15% chance to freeze 1.5s', mod: t => { t.stunCh = 0.15; t.stunDur = 1.5; } },
      ]},
      { name: 'Frostbite', tiers: [
        { name: 'Ice Shards', cost: 90, desc: '+6 pulse damage', mod: t => { t.dmg += 6; } },
        { name: 'Shatter', cost: 190, desc: '+10 dmg, +15 range', mod: t => { t.dmg += 10; t.range += 15; } },
        { name: 'Glacier', cost: 400, desc: '+20 dmg, faster pulses', mod: t => { t.dmg += 20; t.rate *= 0.75; } },
      ]},
    ],
  },
  barracks: {
    name: 'Barracks', icon: '🛡️', cost: 90, kind: 'barracks',
    desc: 'Trains 3 militia who block the road and fight.',
    base: { range: 95, rate: 0, dmg: 0, mHp: 60, mDmg: 6, mRate: 1.0, mRespawn: 10, mArmor: 0, mRegen: 0 },
    paths: [
      { name: 'Veterans', tiers: [
        { name: 'Drilled Recruits', cost: 80, desc: '+25 militia HP, +3 damage', mod: t => { t.mHp += 25; t.mDmg += 3; } },
        { name: 'Hardened Steel', cost: 180, desc: '+35 militia HP, +5 damage', mod: t => { t.mHp += 35; t.mDmg += 5; } },
        { name: 'Champions', cost: 400, desc: '+60 HP, +10 dmg, 25% faster strikes', mod: t => { t.mHp += 60; t.mDmg += 10; t.mRate *= 0.8; } },
      ]},
      { name: 'Field Medics', tiers: [
        { name: 'Bandages', cost: 70, desc: 'Militia regen 3 HP/s out of combat', mod: t => { t.mRegen = 3; } },
        { name: 'Quick Muster', cost: 160, desc: 'Fallen militia respawn in 6s', mod: t => { t.mRespawn = 6; } },
        { name: 'Tower Shields', cost: 380, desc: 'Militia ignore 40% of damage, +25 HP', mod: t => { t.mArmor = 0.4; t.mHp += 25; } },
      ]},
    ],
  },
  tesla: {
    name: 'Tesla', icon: '⚡', cost: 130, kind: 'chain',
    desc: 'Lightning that chains between enemies.',
    base: { range: 105, rate: 0.95, dmg: 11, chain: 3, chainRange: 95, canAir: true },
    paths: [
      { name: 'Superconductor', tiers: [
        { name: 'Copper Coils', cost: 110, desc: 'Chains to 5 targets', mod: t => { t.chain = 5; } },
        { name: 'Arc Web', cost: 230, desc: 'Chains to 7, +30 jump range', mod: t => { t.chain = 7; t.chainRange += 30; } },
        { name: 'Storm Core', cost: 470, desc: 'Chains to 10, +8 dmg', mod: t => { t.chain = 10; t.dmg += 8; } },
      ]},
      { name: 'Overload', tiers: [
        { name: 'High Voltage', cost: 120, desc: '+8 damage', mod: t => { t.dmg += 8; } },
        { name: 'Stun Circuit', cost: 250, desc: '20% chance to stun 0.8s', mod: t => { t.stunCh = 0.2; t.stunDur = 0.8; } },
        { name: 'Thunderlord', cost: 500, desc: '+16 dmg, faster zaps', mod: t => { t.dmg += 16; t.rate *= 0.75; } },
      ]},
    ],
  },
  venom: {
    name: 'Venom', icon: '🧪', cost: 110, kind: 'bullet',
    desc: 'Poison darts that ignore armor entirely.',
    base: { range: 100, rate: 1.0, dmg: 4, poisonDps: 4, poisonDur: 4, projSpeed: 380, canAir: true, ignoreArmor: true },
    paths: [
      { name: 'Plague', tiers: [
        { name: 'Virulence', cost: 100, desc: 'Poison 32 dmg over 4s', mod: t => { t.poisonDps = 8; } },
        { name: 'Contagion', cost: 210, desc: 'Poisoned enemies that die spread poison', mod: t => { t.spreadOnDeath = true; } },
        { name: 'Black Plague', cost: 440, desc: 'Poison 72 dmg over 4s', mod: t => { t.poisonDps = 18; } },
      ]},
      { name: 'Corrosion', tiers: [
        { name: 'Acid Mix', cost: 100, desc: 'Hits permanently melt 1 armor', mod: t => { t.armorShred = 1; } },
        { name: 'Solvent', cost: 200, desc: 'Melts 2 armor, +20 range', mod: t => { t.armorShred = 2; t.range += 20; } },
        { name: 'Disintegrator', cost: 420, desc: '+12 direct dmg, melts 3 armor', mod: t => { t.dmg += 12; t.armorShred = 3; } },
      ]},
    ],
  },
  sniper: {
    name: 'Sniper', icon: '🎯', cost: 150, kind: 'hitscan',
    desc: 'Huge single hits at very long range. Pierces armor.',
    base: { range: 270, rate: 2.3, dmg: 48, pierce: 99, canAir: true },
    paths: [
      { name: 'Deadeye', tiers: [
        { name: 'Match Barrel', cost: 130, desc: '+30 damage', mod: t => { t.dmg += 30; } },
        { name: 'Killshot', cost: 280, desc: '25% chance to crit for 3x', mod: t => { t.critCh = 0.25; } },
        { name: 'Antimatter Rifle', cost: 560, desc: '+90 damage', mod: t => { t.dmg += 90; } },
      ]},
      { name: 'Recon', tiers: [
        { name: 'Spotter Scope', cost: 120, desc: 'Can target stealth enemies', mod: t => { t.seesStealth = true; } },
        { name: 'Target Marker', cost: 240, desc: 'Marked targets take +15% dmg from everyone', mod: t => { t.markPct = 0.15; t.markDur = 3; } },
        { name: 'Fire Discipline', cost: 480, desc: '40% faster shots, +20 dmg', mod: t => { t.rate *= 0.6; t.dmg += 20; } },
      ]},
    ],
  },
  missile: {
    name: 'Missile', icon: '🚀', cost: 180, kind: 'missile',
    desc: 'Homing rockets, double damage vs air.',
    base: { range: 170, rate: 1.8, dmg: 26, splash: 30, projSpeed: 340, canAir: true, bonusVsAir: 2 },
    paths: [
      { name: 'Swarm', tiers: [
        { name: 'Twin Pods', cost: 150, desc: 'Fires 2 missiles', mod: t => { t.multishot = 2; } },
        { name: 'Rocket Hail', cost: 320, desc: 'Fires 3 missiles', mod: t => { t.multishot = 3; } },
        { name: 'Saturation', cost: 600, desc: 'Fires 4 missiles, faster reload', mod: t => { t.multishot = 4; t.rate *= 0.85; } },
      ]},
      { name: 'Warhead', tiers: [
        { name: 'HE Payload', cost: 160, desc: '+14 dmg, +20% blast', mod: t => { t.dmg += 14; t.splash *= 1.2; } },
        { name: 'Thermobaric', cost: 340, desc: '+24 dmg, +35% blast', mod: t => { t.dmg += 24; t.splash *= 1.35; } },
        { name: 'Tactical Nuke', cost: 650, desc: '+50 dmg, massive blast', mod: t => { t.dmg += 50; t.splash *= 1.5; } },
      ]},
    ],
  },
  bank: {
    name: 'Bank', icon: '🏦', cost: 120, kind: 'income',
    desc: 'Pays cash at the start of every wave.',
    base: { range: 0, rate: 0, dmg: 0, income: 14 },
    paths: [
      { name: 'Investment', tiers: [
        { name: 'Vault', cost: 110, desc: 'Income +14 per wave', mod: t => { t.income += 14; } },
        { name: 'Stock Desk', cost: 230, desc: 'Income +24 per wave', mod: t => { t.income += 24; } },
        { name: 'Federal Reserve', cost: 460, desc: 'Income +48 per wave', mod: t => { t.income += 48; } },
      ]},
      { name: 'Interest', tiers: [
        { name: 'Savings Plan', cost: 120, desc: '+1% of your cash each wave', mod: t => { t.interestPct += 0.01; } },
        { name: 'Hedge Fund', cost: 260, desc: '+2% of your cash each wave', mod: t => { t.interestPct += 0.01; } },
        { name: 'Money Printer', cost: 520, desc: '+3.5% of your cash each wave', mod: t => { t.interestPct += 0.015; } },
      ]},
    ],
  },
  beacon: {
    name: 'Beacon', icon: '📡', cost: 140, kind: 'support',
    desc: 'Buffs nearby towers and reveals stealth.',
    base: { range: 115, rate: 0, dmg: 0, buffDmg: 0.15, buffRate: 0, seesStealth: true },
    paths: [
      { name: 'War Drums', tiers: [
        { name: 'Rally', cost: 130, desc: 'Nearby towers +25% dmg', mod: t => { t.buffDmg = 0.25; } },
        { name: 'Battle Hymn', cost: 270, desc: 'Also +15% attack speed', mod: t => { t.buffRate = 0.15; } },
        { name: 'Warlord', cost: 540, desc: '+40% dmg, +25% attack speed', mod: t => { t.buffDmg = 0.40; t.buffRate = 0.25; } },
      ]},
      { name: 'Antenna', tiers: [
        { name: 'Tall Mast', cost: 110, desc: '+30% aura size', mod: t => { t.range *= 1.3; } },
        { name: 'Relay Net', cost: 220, desc: 'Nearby towers +15% range', mod: t => { t.buffRange = 0.15; } },
        { name: 'Satellite Uplink', cost: 450, desc: 'Aura covers half the map', mod: t => { t.range *= 1.6; t.buffRange = 0.25; } },
      ]},
    ],
  },
};

const TOWER_ORDER = ['gunner', 'cannon', 'frost', 'barracks', 'tesla', 'venom', 'sniper', 'missile', 'bank', 'beacon'];

// ============ Heroes ============
// One hero per match. Walks anywhere, blocks enemies, levels up (kills near
// him grant XP), auto-casts his ability. armorPct = fraction of contact
// damage ignored. Sprite override: www/assets/heroes/<id>.png
const HEROES = {
  aldric: {
    name: 'Sir Aldric', title: 'Bastion Knight', icon: '🛡️', color: '#cbd5e1',
    desc: 'Heavy melee tank. Blocks 3 enemies at once and shrugs off half of all blows.',
    hp: 340, dmg: 15, rate: 0.9, range: 32, speed: 62, blocks: 3, armorPct: 0.5, regen: 0.03,
    ability: { name: 'Heroic Slam', cd: 12, desc: 'Slams the ground: heavy damage and a 1.2s stun around him.' },
  },
  lyra: {
    name: 'Lyra Swiftwind', title: 'Windrunner', icon: '🏹', color: '#a3e635',
    desc: 'Elven archer. Long range, fast arrows, 25% chance to crit for 3x.',
    hp: 175, dmg: 17, rate: 0.55, range: 155, speed: 88, blocks: 1, armorPct: 0, regen: 0.035, crit: 0.25,
    ability: { name: 'Arrow Storm', cd: 15, desc: 'Rains 12 arrows on the thickest crowd of enemies.' },
  },
  magnus: {
    name: 'Magnus Pyre', title: 'Battle Mage', icon: '🔥', color: '#fb923c',
    desc: 'Fire mage. Every bolt explodes in a small blast and sets enemies burning.',
    hp: 165, dmg: 14, rate: 1.0, range: 135, speed: 70, blocks: 1, armorPct: 0, regen: 0.035,
    splash: 22, burnDps: 5, burnDur: 2,
    ability: { name: 'Meteor Call', img: 'spell_meteor', cd: 18, desc: 'Calls a meteor onto the biggest cluster: huge blast + burn.' },
  },
  mercy: {
    name: 'Sister Mercy', title: 'War Cleric', icon: '✨', color: '#fde68a',
    desc: 'Holy fighter. Nearby towers attack 10% faster; regenerates quickly.',
    hp: 230, dmg: 13, rate: 0.8, range: 34, speed: 72, blocks: 1, armorPct: 0.25, regen: 0.05,
    auraRate: 0.10, auraR: 95,
    ability: { name: 'Holy Nova', img: 'spell_healrain', cd: 16, desc: 'Heals herself 30% and blasts + slows every enemy around her.' },
  },
  korg: {
    name: 'Korg Ironhide', title: 'Demolitionist', icon: '💣', color: '#f87171',
    desc: 'Dwarf grenadier. Lobbed bombs splash and permanently shred 1 armor.',
    hp: 250, dmg: 18, rate: 1.4, range: 115, speed: 60, blocks: 2, armorPct: 0.25, regen: 0.035,
    splash: 26, shred: 1,
    ability: { name: 'Dynamite Belt', cd: 16, desc: 'Scatters 5 bombs around him, each with its own blast.' },
  },
  valora: {
    name: 'Valora', title: 'Dawnblade', icon: '\u2694\ufe0f', color: '#fcd34d',
    desc: 'Holy duelist. Deals +50% damage to elites and bosses \u2014 the priority-target killer.',
    hp: 260, dmg: 22, rate: 1.0, range: 34, speed: 68, blocks: 2, armorPct: 0.35, regen: 0.04, eliteSlayer: 1.5,
    ability: { name: 'Radiant Smite', cd: 14, desc: 'Holy fire falls on the thickest crowd: heavy damage and a brief stun.' },
  },
  grimlock: {
    name: 'Grimlock', title: 'Granite Golem', icon: '\ud83d\uddff', color: '#a8a29e',
    desc: 'A living mountain. Blocks 4 enemies at once and shrugs off 60% of all damage. Cannot touch fliers.',
    hp: 520, dmg: 12, rate: 1.6, range: 36, speed: 45, blocks: 4, armorPct: 0.6, regen: 0.025, splash: 26,
    ability: { name: 'Tremor', cd: 15, desc: 'Shakes the earth: damage and a 50% slow to everything around him.' },
  },
  dorin: {
    name: 'Dorin', title: 'Wildkeeper', icon: '\ud83d\udc3b', color: '#86efac',
    desc: 'Druid marksman. Thorn shots mark targets to take +10% damage from all sources.',
    hp: 190, dmg: 15, rate: 0.8, range: 140, speed: 75, blocks: 1, armorPct: 0.1, regen: 0.04,
    markOnHit: { pct: 0.10, dur: 2 },
    ability: { name: 'Root Bind', img: 'spell_rootbind', cd: 16, desc: 'Roots up to 6 nearby enemies in place for 2.5s and poisons them.' },
  },
};
const HERO_ORDER = ['aldric', 'lyra', 'magnus', 'mercy', 'korg', 'valora', 'grimlock', 'dorin'];

// ============ Curse contracts ============
// Optional pre-match debuffs; each accepted curse pays +25% Research Points.
const CURSES = [
  { id: 'chaste', icon: '💨', name: 'Fleet-Footed', desc: 'Enemies move 20% faster', apply: g => { g.speedMul *= 1.20; } },
  { id: 'ciron', icon: '🛡️', name: 'Iron Horde', desc: 'Enemies have 30% more HP', apply: g => { g.hpMul *= 1.3; } },
  { id: 'cinfl', icon: '💸', name: 'War Tax', desc: 'Towers cost 15% more', apply: g => { g.costMul *= 1.15; } },
  { id: 'cswarm', icon: '🐜', name: 'Endless Tide', desc: '30% more enemies per wave', apply: g => { g.countMul *= 1.3; } },
  { id: 'cfog', icon: '🌫️', name: 'Fog of War', desc: 'No next-wave preview', apply: g => { g.cursedNoPreview = true; } },
];

// ============ Map hazards ============
// Tap-to-trigger environmental strikes ($90, 40s cooldown, big blast).
const MAP_HAZARDS = {
  meadow: [[8, 5], [13, 6]],
  riverbend: [[4, 2], [13, 9]],
  switchback: [[9, 4], [9, 7]],
  crossroads: [[10, 4], [15, 6]],
  spiral: [[9, 3], [8, 8]],
  openfield: [[11, 6], [5, 6]],
  twingates: [[8, 5], [12, 6]],
  oasis: [[10, 5], [5, 5]],
  cinderpeak: [[3, 8], [12, 6]],
  ashworks: [[10, 5], [4, 8]],
};

// ============ Tower synergies ============
// Two towers on adjacent tiles (8 directions) link up. Discovered combos
// are remembered in the player's collection. buffA applies to type a,
// buffB to type b. Generic fields: dmgMul, rateMul, rangeMul, splashMul,
// incomeMul, chainAdd, chainRangeAdd, slowOnHit, poisonOnHit.
const SYNERGIES = [
  { a: 'gunner', b: 'sniper', name: 'Spotter Team', desc: 'Gunner +20% range, Sniper fires 15% faster',
    buffA: { rangeMul: 1.20 }, buffB: { rateMul: 1.15 } },
  { a: 'cannon', b: 'frost', name: 'Shatter Rounds', desc: 'Cannon +25% damage',
    buffA: { dmgMul: 1.25 }, buffB: {} },
  { a: 'tesla', b: 'venom', name: 'Conductive Toxin', desc: 'Tesla chains to 2 more, Venom +20% damage',
    buffA: { chainAdd: 2 }, buffB: { dmgMul: 1.20 } },
  { a: 'missile', b: 'beacon', name: 'Guidance Link', desc: 'Missile +20% range and +10% damage',
    buffA: { rangeMul: 1.20, dmgMul: 1.10 }, buffB: {} },
  { a: 'bank', b: 'beacon', name: 'Trade Hub', desc: 'Bank income +25%',
    buffA: { incomeMul: 1.25 }, buffB: {} },
  { a: 'frost', b: 'tesla', name: 'Supercooled Coils', desc: 'Tesla +15% damage, Frost pulses 10% faster',
    buffA: { rateMul: 1.10 }, buffB: { dmgMul: 1.15 } },
  { a: 'sniper', b: 'venom', name: 'Toxic Rounds', desc: 'Sniper shots poison (16 dmg over 2s)',
    buffA: { poisonOnHit: { dps: 8, dur: 2 } }, buffB: {} },
  { a: 'gunner', b: 'gunner', name: 'Crossfire', desc: 'Both Gunners fire 12% faster',
    buffA: { rateMul: 1.12 }, buffB: { rateMul: 1.12 } },
  { a: 'cannon', b: 'missile', name: 'Siege Battery', desc: 'Both gain +15% blast radius',
    buffA: { splashMul: 1.15 }, buffB: { splashMul: 1.15 } },
  { a: 'venom', b: 'frost', name: 'Cryotoxin', desc: 'Venom darts also slow 20% for 1.5s',
    buffA: { slowOnHit: { pct: 0.20, dur: 1.5 } }, buffB: {} },
  { a: 'tesla', b: 'beacon', name: 'Storm Network', desc: 'Tesla arcs jump 30 further',
    buffA: { chainRangeAdd: 30 }, buffB: {} },
  { a: 'sniper', b: 'missile', name: 'Target Uplink', desc: 'Sniper +10%, Missile +15% damage',
    buffA: { dmgMul: 1.10 }, buffB: { dmgMul: 1.15 } },
];

// ============ Draft boons ============
// Every 5th cleared wave: pick 1 of 3 (one reroll allowed). Run-long roguelite layer.
const BOONS = [
  { id: 'warchest', icon: '💰', name: 'War Chest', desc: '+$250 right now', apply: g => { g.cash += 250; } },
  { id: 'sharpen', icon: '⚔️', name: 'Sharpened Steel', desc: 'All towers +8% damage', apply: g => { g.bonuses.dmgMul *= 1.08; } },
  { id: 'optics', icon: '🔭', name: 'Field Optics', desc: 'All towers +7% range', apply: g => { g.bonuses.rangeMul *= 1.07; } },
  { id: 'adrenaline', icon: '⚡', name: 'Adrenaline', desc: 'Abilities recharge 20% faster', apply: g => { g.bonuses.cdMul *= 0.8; } },
  { id: 'bounty', icon: '💵', name: 'Bounty Contracts', desc: '+15% cash from kills', apply: g => { g.bountyMul *= 1.15; } },
  { id: 'reinforce', icon: '❤️', name: 'Reinforcements', desc: '+5 lives', apply: g => { g.lives += 5; } },
  { id: 'veterans', icon: '⭐', name: 'Veteran Corps', desc: 'Every current tower gains 15 kills of rank progress', apply: g => { for (const t of g.towers) { t.kills += 15; t.checkRank(); } } },
  { id: 'training', icon: '🦸', name: 'Hero Training', desc: 'Your hero gains a level', apply: g => { if (g.hero) g.hero.gainXp(g.hero.xpNeed); } },
  { id: 'interest', icon: '🪙', name: 'Compound Bonds', desc: '+1.5% interest on your cash each wave', apply: g => { g.bonuses.interest += 0.015; } },
  { id: 'frostsnap', icon: '❄️', name: 'Frost Snap', desc: 'Every new wave starts 40% slowed for 3s', apply: g => { g.frostSnap = true; } },
];

// ============ Daily quests (3 per day, +15 RP each) ============
const QUESTS = [
  { id: 'kills', icon: '⚔️', name: 'Slayer', desc: 'Kill 250 enemies', target: 250, count: (res, g) => res.kills },
  { id: 'waves', icon: '🌊', name: 'Tide Holder', desc: 'Clear 20 waves', target: 20, count: (res, g) => res.wavesCleared },
  { id: 'win', icon: '🏆', name: 'Champion', desc: 'Win any map', target: 1, count: (res, g) => res.won ? 1 : 0 },
  { id: 'boss', icon: '💀', name: 'Giant Hunter', desc: 'Kill 2 bosses', target: 2, count: (res, g) => g.stats.bossKills },
  { id: 'combo', icon: '🔥', name: 'Chain Reaction', desc: 'Reach a 15-kill combo', target: 1, count: (res, g) => g.stats.bestCombo >= 15 ? 1 : 0 },
  { id: 'syn', icon: '🔗', name: 'Architect', desc: 'Have 4 synergies active at once', target: 1, count: (res, g) => g.stats.maxSynergies >= 4 ? 1 : 0 },
];


// wcost = budget cost when the wave generator buys this enemy.
const ENEMIES = {
  runt:        { icon: '👹', name: 'Runt', hp: 22, speed: 55, bounty: 4, lives: 1, radius: 9, color: '#e05c5c', wcost: 4, minWave: 1 },
  sprinter:    { icon: '🐆', name: 'Sprinter', hp: 15, speed: 105, bounty: 5, lives: 1, radius: 8, color: '#f2a33c', wcost: 5, minWave: 3 },
  swarmling:   { icon: '🐜', name: 'Swarmling', hp: 9, speed: 80, bounty: 2, lives: 1, radius: 6, color: '#d98ce0', wcost: 2, minWave: 5, packs: true },
  brute:       { icon: '🛡', name: 'Brute', hp: 95, speed: 36, armor: 3, bounty: 12, lives: 2, radius: 13, color: '#b04a4a', wcost: 13, minWave: 6 },
  winged:      { icon: '🦅', name: 'Winged', hp: 34, speed: 72, flying: true, bounty: 8, lives: 2, radius: 9, color: '#7ec8e3', wcost: 9, minWave: 8 },
  phantom:     { icon: '👻', name: 'Phantom', hp: 48, speed: 62, stealth: true, bounty: 10, lives: 2, radius: 9, color: '#9b9bd6', wcost: 11, minWave: 10 },
  regenerator: { icon: '🧟', name: 'Regenerator', hp: 85, speed: 46, regen: 7, bounty: 12, lives: 2, radius: 11, color: '#6fce6f', wcost: 13, minWave: 12 },
  shellback:   { icon: '🐢', name: 'Shellback', hp: 75, speed: 30, armor: 8, bounty: 14, lives: 2, radius: 12, color: '#8d9db6', wcost: 16, minWave: 14 },
  splitter:    { icon: '🫧', name: 'Splitter', hp: 55, speed: 55, bounty: 10, lives: 2, radius: 11, color: '#e0c95c', wcost: 12, minWave: 16, spawnOnDeath: { type: 'swarmling', count: 3 } },
  juggernaut:  { icon: '🤖', name: 'Juggernaut', hp: 1600, speed: 22, armor: 10, bounty: 150, lives: 3, radius: 18, color: '#ff5577', boss: true, wcost: 0, minWave: 99 },
  healer:      { icon: '🧙', name: 'Goblin Healer', hp: 70, speed: 52, bounty: 16, lives: 1, radius: 10, color: '#7ec86f', wcost: 18, minWave: 9,
    healAura: { r: 75, pct: 0.12, cd: 3 } },
  wyvern:      { icon: '🐉', name: 'Wyvern', hp: 1000, speed: 36, flying: true, bounty: 150, lives: 3, radius: 16, color: '#66e0ff', boss: true, wcost: 0, minWave: 99 },
};

// Path maps: waypoint lists in cell coords (off-grid endpoints = edge spawn/exit).
// Maze maps: open field, towers form the maze.
const MAPS = [
  { id: 'meadow', name: 'Green Meadow', type: 'path', diffStars: 1, theme: 'grass',
    desc: 'A gentle S-curve. Learn the ropes.',
    paths: [[[-1, 6], [3, 6], [3, 2], [8, 2], [8, 9], [13, 9], [13, 4], [20, 4]]] },
  { id: 'riverbend', name: 'Riverbend', type: 'path', diffStars: 1, theme: 'autumn',
    desc: 'Long straights reward long-range towers.',
    // hand-painted battlefield (assets/maps/riverbend.jpg): the path traces
    // the painted road: cave -> rune plaza -> around the crag -> upper bridge
    // -> winding descent -> ford -> castle.
    paths: [[[2, 1], [3, 2], [4, 3], [6, 3], [7, 4], [9, 4], [10, 3], [10, 2], [11, 1], [13, 1], [14, 2], [15, 2], [16, 3], [16, 4], [14, 6], [13, 6], [13, 9], [14, 10], [16, 10]]],
    blocked: [
      // canyon cliffs / cave structure (north rim)
      [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0],
      [0, 1], [1, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1],
      [0, 2], [1, 2], [2, 2],
      // central crag rocks + waterfall stream
      [7, 2], [8, 2], [9, 2], [7, 3], [8, 3], [9, 3], [6, 2], [6, 4], [6, 5],
      // river: top pool, channel under the upper bridge, main bridge stretch,
      // lower run and the bottom pool
      [11, 0], [12, 0], [13, 0],
      [11, 2], [12, 2], [11, 3], [11, 4],
      [7, 5], [8, 5], [9, 5], [10, 5],
      [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
      [7, 7], [8, 7], [9, 7], [10, 7],
      [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
      [5, 9], [6, 9], [7, 9], [8, 9], [9, 9],
      [4, 10], [5, 10], [6, 10], [7, 10], [8, 10],
      [4, 11], [5, 11], [6, 11],
      // east water branch curling around the castle
      [12, 8], [14, 7], [15, 7], [16, 7], [17, 7], [17, 6], [18, 6],
      // east standing-stone ruins
      [12, 3], [13, 3], [12, 4], [13, 4], [14, 3], [14, 4],
      // west rocks, spire and ruined pillars
      [4, 4], [5, 4], [5, 7], [1, 7], [2, 7], [1, 8], [2, 8], [2, 9], [3, 9],
      // west / northwest cliff edge
      [0, 3], [0, 4], [0, 5],
      // northeast forest and cliffs
      [14, 0], [15, 0], [16, 0], [16, 1],
      [17, 0], [18, 0], [19, 0], [17, 1], [18, 1], [19, 1], [18, 2], [19, 2],
      [17, 2], [18, 3], [19, 3], [18, 4], [19, 4], [17, 5], [18, 5], [19, 5], [18, 6], [19, 6],
      // castle footprint
      [15, 8], [16, 8], [17, 8], [18, 8], [19, 8],
      [16, 9], [17, 9], [18, 9], [19, 9],
      [17, 10], [18, 10], [19, 10],
      [14, 11], [15, 11], [16, 11], [17, 11], [18, 11], [19, 11],
      // southwest forest, bottom pines
      [0, 9], [1, 9], [0, 10], [1, 10], [2, 10], [0, 11], [1, 11], [2, 11], [3, 11],
      [10, 11], [11, 11], [12, 11], [13, 11],
    ] },
  { id: 'switchback', name: 'Switchback Canyon', type: 'path', diffStars: 2, theme: 'canyon',
    desc: 'Four hairpins. The kill zone is yours to pick.',
    paths: [[[-1, 1], [18, 1], [18, 4], [1, 4], [1, 7], [18, 7], [18, 10], [-1, 10]]] },
  { id: 'crossroads', name: 'Crossroads', type: 'path', diffStars: 3, theme: 'autumn',
    desc: 'Two lanes merge into one. Split your defense.',
    paths: [
      [[-1, 2], [10, 2], [10, 6], [20, 6]],
      [[-1, 9], [10, 9], [10, 6], [20, 6]],
    ] },
  { id: 'spiral', name: 'Frozen Spiral', type: 'path', diffStars: 3, theme: 'snow',
    desc: 'A long spiral to a center portal. Hold every ring.',
    paths: [[[-1, 1], [17, 1], [17, 10], [2, 10], [2, 3], [14, 3], [14, 8], [5, 8], [5, 5], [11, 5]]] },
  { id: 'openfield', name: 'Open Field', type: 'maze', diffStars: 2, theme: 'grass',
    desc: 'Pure maze-building. Towers block the way.',
    spawns: [[0, 6]], exit: [19, 6],
    blocked: [[6, 2], [6, 3], [13, 8], [13, 9], [9, 5], [9, 6]] },
  { id: 'twingates', name: 'Twin Gates', type: 'maze', diffStars: 3, theme: 'twilight',
    desc: 'Two spawn gates, one exit. Funnel them together.',
    spawns: [[0, 3], [0, 8]], exit: [19, 6],
    blocked: [[10, 0], [10, 1], [10, 10], [10, 11], [5, 5], [5, 6], [15, 5], [15, 6]] },
  { id: 'oasis', name: 'Sunken Oasis', type: 'path', diffStars: 2, theme: 'oasis',
    desc: 'A winding caravan trail between the dunes and pools.',
    paths: [[[-1, 3], [5, 3], [5, 8], [10, 8], [10, 2], [15, 2], [15, 6], [20, 6]]] },
  { id: 'cinderpeak', name: 'Cinder Peak', type: 'path', diffStars: 4, theme: 'volcanic',
    desc: 'Molten ground and tight corners. The hardest road.',
    paths: [[[-1, 10], [3, 10], [3, 5], [7, 5], [7, 9], [12, 9], [12, 4], [16, 4], [16, 8], [20, 8]]] },
  { id: 'ashworks', name: 'The Ashworks', type: 'maze', diffStars: 4, theme: 'volcanic',
    desc: 'Open volcanic field. Forge a maze between the vents.',
    spawns: [[0, 2], [0, 9]], exit: [19, 5],
    blocked: [[7, 4], [7, 5], [7, 6], [13, 5], [13, 6], [13, 7], [4, 0], [4, 1], [16, 10], [16, 11]] },
];

const CAMPAIGN_MAPS = MAPS.filter(m => m.type === 'path');
const MAZE_MAPS = MAPS.filter(m => m.type === 'maze');

const DIFFICULTIES = [
  { id: 'easy', name: 'Easy', waves: 20, lives: 25, cash: 240, hpMul: 0.9, rp: 10 },
  { id: 'normal', name: 'Normal', waves: 30, lives: 20, cash: 200, hpMul: 1.0, rp: 20 },
  { id: 'hard', name: 'Hard', waves: 40, lives: 15, cash: 180, hpMul: 1.2, rp: 35 },
];

// spellImg points at www/assets/ui/spell_<x>.png art
const ABILITIES = [
  { id: 'airstrike', spellImg: 'spell_meteor', name: 'Airstrike', icon: '💥', cd: 45, desc: 'Click a location: meteor lands 2s later, 200 dmg' },
  { id: 'frostnova', spellImg: 'spell_frostnova', name: 'Frost Nova', icon: '❄️', cd: 60, desc: 'Slow every enemy 60% for 5s' },
  { id: 'overclock', spellImg: 'spell_lightning', name: 'Overclock', icon: '⚙️', cd: 60, desc: 'All towers fire 2x faster for 8s' },
  { id: 'reinforce', name: 'Reinforcements', icon: '🛡️', cd: 45, desc: 'Click a spot: 2 militia hold it for 20s' },
];

// Permanent meta perks bought with Research Points.
const PERKS = [
  { id: 'warchest', name: 'War Chest', icon: '💰', max: 5, baseCost: 8, desc: '+40 starting cash per level', apply: (b, l) => { b.startCash += 40 * l; } },
  { id: 'walls', name: 'Reinforced Walls', icon: '🧱', max: 5, baseCost: 8, desc: '+4 starting lives per level', apply: (b, l) => { b.startLives += 4 * l; } },
  { id: 'steel', name: 'Sharpened Steel', icon: '⚔️', max: 5, baseCost: 12, desc: '+4% tower damage per level', apply: (b, l) => { b.dmgMul += 0.04 * l; } },
  { id: 'optics', name: 'Optics Lab', icon: '🔭', max: 3, baseCost: 12, desc: '+4% tower range per level', apply: (b, l) => { b.rangeMul += 0.04 * l; } },
  { id: 'salvage', name: 'Salvage Crews', icon: '🔩', max: 4, baseCost: 10, desc: '+5% sell refund per level', apply: (b, l) => { b.sellRate += 0.05 * l; } },
  { id: 'interest', name: 'Compound Interest', icon: '🪙', max: 4, baseCost: 14, desc: '+0.5% cash interest each wave per level', apply: (b, l) => { b.interest += 0.005 * l; } },
  { id: 'bounty', name: 'Bounty Hunter', icon: '🎯', max: 5, baseCost: 10, desc: '+4% kill rewards per level', apply: (b, l) => { b.bountyMul += 0.04 * l; } },
  { id: 'response', name: 'Rapid Response', icon: '⚡', max: 4, baseCost: 12, desc: '-8% ability cooldowns per level', apply: (b, l) => { b.cdMul -= 0.08 * l; } },
];

const ACHIEVEMENTS = [
  { id: 'first_win', name: 'First Stand', icon: '🏆', desc: 'Win your first campaign map' },
  { id: 'untouchable', name: 'Untouchable', icon: '🛡️', desc: 'Win a map without losing a single life' },
  { id: 'endless_25', name: 'Marathon', icon: '🏃', desc: 'Reach wave 25 in Endless' },
  { id: 'endless_50', name: 'Ultramarathon', icon: '🔥', desc: 'Reach wave 50 in Endless' },
  { id: 'maze_25', name: 'Labyrinth Architect', icon: '🌀', desc: 'Reach wave 25 in Maze mode' },
  { id: 'boss_10', name: 'Giant Slayer', icon: '💀', desc: 'Defeat 10 bosses (lifetime)' },
  { id: 'rich', name: 'Deep Pockets', icon: '💎', desc: 'Hold $5,000 at once in a match' },
  { id: 'max_tower', name: 'Masterwork', icon: '⭐', desc: 'Fully upgrade both paths of one tower' },
  { id: 'daily_win', name: "Today's Hero", icon: '📅', desc: 'Beat a Daily Challenge' },
  { id: 'star_15', name: 'Constellation', icon: '✨', desc: 'Earn 15 campaign stars' },
  { id: 'iron_1', name: 'Iron Will', icon: '⚔️', desc: 'Clear any Iron Challenge' },
  { id: 'syn_all', name: 'Grand Architect', icon: '🔗', desc: 'Discover all 12 synergies' },
  { id: 'ascend_1', name: 'Transcendent', icon: '✴️', desc: 'Ascend a tower into its golden super-form' },
  { id: 'combo_25', name: 'Massacre', icon: '🩸', desc: 'Reach a 25-kill combo' },
  { id: 'hero_10', name: 'Living Legend', icon: '🦸', desc: 'Raise any hero to level 10' },
  { id: 'relic_5', name: 'Relic Hunter', icon: '💎', desc: 'Claim 5 relics (lifetime)' },
];

// Daily challenge mutators, two are picked by the date seed.
const MODIFIERS = [
  { id: 'haste', name: 'Haste', desc: 'Enemies move 25% faster', apply: g => { g.speedMul *= 1.25; } },
  { id: 'ironhide', name: 'Ironhide', desc: 'Enemies have 30% more HP', apply: g => { g.hpMul *= 1.3; } },
  { id: 'inflation', name: 'Inflation', desc: 'Towers cost 20% more', apply: g => { g.costMul *= 1.2; } },
  { id: 'goldrush', name: 'Gold Rush', desc: 'Kills give 30% more cash', apply: g => { g.bountyMul *= 1.3; } },
  { id: 'austerity', name: 'Austerity', desc: '30% less starting cash', apply: g => { g.cash = Math.round(g.cash * 0.7); } },
  { id: 'horde', name: 'Horde', desc: '40% more enemies per wave', apply: g => { g.countMul *= 1.4; } },
];
