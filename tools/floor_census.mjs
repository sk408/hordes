// HORDES floor census (R3 floor item): what lies on the floor, minute by minute,
// over one whole run in the real loop (headless, no canvas).
//   node tools/floor_census.mjs --root <tree> --profile fresh|strong --pilot AUTO_ALL|EXPLORE
//                               --seed <n> [--minutes 15] [--out file.jsonl]
// <root> is the tree to run (the main tree for "before", a worktree for "after"),
// so the same tool measures both. One run per process: the game boots once per
// process. Prints one JSON line: per-minute counts by kind, lifetimes (how long
// each kind lay on the floor and what took it away), XP gained per minute, and the
// run's earnings (gold, items, potions).
// The draft policy varies with the seed (new weapon first / first card / a seeded
// card), so the eight seeds are not one fixed strategy.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(arg('--root', '.'));
const PROFILE = arg('--profile', 'fresh');
const PILOT = arg('--pilot', 'AUTO_ALL');
const SEED = Number(arg('--seed', 1));
const MINUTES = Number(arg('--minutes', 15));
const OUT = arg('--out', null);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

// Seeded random before anything of the game loads.
let rs = SEED >>> 0;
Math.random = () => {
  rs = (rs + 0x6D2B79F5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const { makeProfile, buyUpgrade, SHOP_UPGRADES } = await imp('src/meta.js');
const { TOUR_KEYS } = await imp('src/tour.js');
const { xpForLevel } = await imp('src/config.js');

function profileFor(name) {
  const prof = makeProfile();
  if (name === 'strong') {
    prof.gold = 1_000_000_000;
    for (const def of SHOP_UPGRADES) for (let i = 0; i < def.maxLevel; i++) if (!buyUpgrade(prof, def.id)) break;
  }
  return prof;
}

// DOM shims (the tools/real_loop.mjs pattern).
const noop = () => {};
const fakeCtx = new Proxy({}, { get(t, p) { return (p === 'fillStyle' || p === 'globalAlpha') ? undefined : (typeof p === 'string' ? noop : undefined); }, set() { return true; } });
const fakeEl = () => {
  const el = { textContent: '', style: {}, children: [], onclick: null, click() { if (this.onclick) this.onclick(); }, addEventListener() {} };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html ?? ''; }, set(v) { this._html = v; if (v === '') el.children.length = 0; } });
  el.appendChild = (c) => { el.children.push(c); };
  return el;
};
const elements = {};
globalThis.document = {
  getElementById: (id) => elements[id] ?? (elements[id] = id === 'game' ? { width: 0, height: 0, getContext: () => fakeCtx } : fakeEl()),
  createElement: () => fakeEl(),
};
let keyHandler = null;
globalThis.window = { addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; } };
let now = 0;
globalThis.performance = { now: () => now };
const raf = [];
globalThis.requestAnimationFrame = (cb) => { raf.push(cb); return raf.length; };
globalThis.location = { reload: noop };
const ls = new Map([['hordes_onboarded', '1'], ['hordes_pilot2', PILOT]]);
for (const k of Object.values(TOUR_KEYS)) ls.set(k, '1');
ls.set('hordes_profile_v1', JSON.stringify(profileFor(PROFILE)));
globalThis.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: (k) => { ls.delete(k); } };

const T = (await imp('src/main.js')).__TEST;
{ const pr = T.getProfile(); pr.achievements = pr.achievements || {}; pr.achievements.totals = pr.achievements.totals || {}; pr.achievements.totals.runs = 1; }
const st = T.state;
T.startRun();

const policy = SEED % 3;   // 0: new weapon first, 1: first card, 2: a seeded card
let pick = SEED * 7919;
const kinds = ['gems', 'drops', 'itemDrops', 'chests'];
const born = new Map(kinds.map(k => [k, new Map()]));   // object -> birth time
const life = Object.fromEntries(kinds.map(k => [k, { taken: [], gone: [] }]));
const minutes = [];
let xpTotal = 0, prevXp = st.player.xp, prevLevel = st.player.level, prevNext = st.player.xpNext;
let fullFrames = 0, playFrames = 0, potPicked = 0, itemsPicked = 0, itemsMade = 0;
let prevPot = { hp: 0, mp: 0 };
const pickR = () => {
  const p = st.player;
  return (p.stats.pickup || 30) * (p.stats.pickupMult || 1) * 2.2 + 16;
};
const capFrames = Math.floor(MINUTES * 60 * 60 * 1.6);
let nextMin = 1, frames = 0, maxGems = 0;
const t0 = Date.now();
for (; frames < capFrames; frames++) {
  now += 1000 / 60;
  const cb = raf.shift();
  if (!cb) throw new Error('raf queue died');
  if (process.env.FLOOR_TRACE && frames % 60 === 0) process.stderr.write(st.time.toFixed(0) + ' ' + st.mode + ' g' + st.gems.length + ' i' + st.itemDrops.length + ' c' + st.chests.length + ' d' + st.drops.length + String.fromCharCode(10));
  cb(performance.now());
  const p = st.player;
  // XP gained (levels included).
  if (p.level > prevLevel) { xpTotal += (prevNext - prevXp) + p.xp; for (let l = prevLevel + 1; l < p.level; l++) xpTotal += xpForLevel(l); }
  else if (p.xp > prevXp) xpTotal += p.xp - prevXp;
  prevXp = p.xp; prevLevel = p.level; prevNext = p.xpNext;
  if (st.mode === 'playing' || st.mode === 'finale') {
    playFrames++;
    if (p.potions.hp >= st.potionCap && p.potions.mp >= st.potionCap) fullFrames++;
  }
  // Births and deaths of floor objects.
  const R = pickR();
  if (st.gems.length > maxGems) maxGems = st.gems.length;
  for (const k of kinds) {
    const arr = st[k] || [];
    const m = born.get(k);
    const seen = new Set(arr);
    for (const o of arr) if (!m.has(o)) { m.set(o, { t: st.time, x: o.x, y: o.y }); if (k === 'itemDrops') itemsMade++; }
    for (const [o, b] of m) {
      if (seen.has(o)) { b.x = o.x; b.y = o.y; continue; }
      const near = Math.hypot(b.x - p.x, b.y - p.y) < R;
      (near ? life[k].taken : life[k].gone).push(+(st.time - b.t).toFixed(1));
      if (near && k === 'itemDrops') itemsPicked++;
      m.delete(o);
    }
  }
  for (const k of ['hp', 'mp']) { if (p.potions[k] > prevPot[k] && st.mode !== 'shop') potPicked += 0; prevPot[k] = p.potions[k]; }
  if (st.time >= nextMin * 60 || st.mode === 'dead') {
    const f = st.feel || {};
    minutes.push({
      min: nextMin, t: Math.floor(st.time), xp: Math.round(xpTotal),
      gems: st.gems.length, gemXp: st.gems.reduce((s, g) => s + g.xp, 0),
      drops: st.drops.length, dropPotions: st.drops.reduce((s, d) => s + (d.count || 1), 0),
      itemDrops: st.itemDrops.length, chestRemnants: st.itemDrops.filter(d => d.chest).length,
      chests: st.chests.length, runChest: st.runChest ? 1 : 0,
      corpses: (f.corpses || []).length, puffs: (f.puffs || []).length, sparks: (f.sparks || []).length,
      enemyShots: st.enemyShots.length, projectiles: st.projectiles.length, effects: st.effects.length,
      sitePops: (st.sitePops || []).length, enemies: st.enemies.length,
      carried: { hp: p.potions.hp, mp: p.potions.mp }, items: st.items.length, gold: Math.round(st.runCounts.gold.earned),
    });
    nextMin++;
  }
  if (st.mode === 'dead' || st.runWon || nextMin > MINUTES) break;
  const ov = elements['overlay'];
  const cards = elements['ov-cards'] ? elements['ov-cards'].children : [];
  if (ov && ov.style.display === 'flex' && cards.length > 0 && keyHandler) {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      let k = '1';
      if (policy === 0) { for (const c of cards) if ((c.innerHTML || '').includes('NEW WEAPON')) { k = String(cards.indexOf(c) + 1); break; } }
      else if (policy === 2) { pick = (pick * 1103515245 + 12345) >>> 0; k = String(1 + (pick % Math.min(3, cards.length))); }
      keyHandler({ key: k });
    } else {
      const titled = (t) => cards.find(c => (c.innerHTML || '').includes(t));
      const cont = titled('CONTINUE');
      if (cont) cont.click(); else { const play = titled('PLAY'); if (play) play.click(); else keyHandler({ key: '1' }); }
    }
  }
  if (keyHandler && (st.mode === 'playing' || st.mode === 'finale')) {
    const bossUp = (st.wave.bosses || []).some(b => b && b.hp > 0) || (st.wave.midBosses || []).some(b => b && b.hp > 0) || !!(st.finalBoss && st.finalBoss.hp > 0);
    if (bossUp) { keyHandler({ key: 'q' }); keyHandler({ key: 'e' }); }
  }
}
const sum = (a) => a.reduce((s, x) => s + x, 0);
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { n: s.length, med: s.length ? s[s.length >> 1] : null, p90: s.length ? s[Math.floor(s.length * 0.9)] : null, max: s.length ? s[s.length - 1] : null }; };
const rec = {
  root: path.basename(ROOT), profile: PROFILE, pilot: PILOT, seed: SEED,
  end: { t: Math.floor(st.time), mode: st.mode, dead: st.mode === 'dead', level: st.player.level, kills: st.player.kills },
  gold: Math.round(st.runCounts.gold.earned), xp: Math.round(xpTotal), itemsMade, itemsPicked,
  equipped: st.items.length, chestsOpened: st.runCounts.chests,
  richXp: Math.round(st.runCounts.richXp || 0), richBonusXp: Math.round(st.runCounts.richBonusXp || 0),
  potionsTaken: life.drops.taken.length, maxGems,
  fullCarryShare: +(fullFrames / Math.max(1, playFrames)).toFixed(3),
  life: Object.fromEntries(kinds.map(k => [k, { taken: stats(life[k].taken), gone: stats(life[k].gone), onFloorAtEnd: born.get(k).size }])),
  minutes, wallS: Math.round((Date.now() - t0) / 1000),
};
const line = JSON.stringify(rec);
if (OUT) fs.appendFileSync(OUT, line + '\n');
console.log(line);
process.exit(0);
