// HORDES progression simulator — LIVE CATALOGUE READER.
//
// Everything the simulator knows about the shop comes from the game's own
// exports (src/meta.js: SHOP_UPGRADES, WEAPON_PRICES, ELITE_MODIFIERS,
// CHARACTERS, upgradeCost, applyMetaBonuses ...), read at start-up. No price,
// level cap or row list is restated here, so a rebalance that moves numbers,
// adds rows or adds weapons needs no change to this file.
//
// The few ids the POLICIES name (the damage row, the split/slots rows, the
// ONE OF EACH rule) are parameters with defaults; requireRow()/requireIds()
// fail with a message that says which id is gone and which flag replaces it.
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const DEFAULT_TREE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const treeRoot = () => path.resolve(process.env.HORDES_TREE || DEFAULT_TREE);
export const treeUrl = (rel) => pathToFileURL(path.join(treeRoot(), rel)).href;

export class SimConfigError extends Error {}

// Stat fields that do nothing for kill rate / survival of an AUTO-piloted run:
// the mana, potion, gold and pickup economy. A classic row is COMBAT when one
// level of it moves any applyMetaBonuses field that is NOT in this set.
// (Field names, not row ids: new rows that feed an existing field classify
// themselves.)
const ECON_FIELDS = new Set([
  'manaRegen', 'maxMana', 'manaCostMult', 'manaOnKill',
  'goldMult', 'dropBonus', 'potionPower', 'pickupMult', 'luck',
]);

export async function loadCatalogue() {
  let META;
  try {
    META = await import(treeUrl('src/meta.js'));
  } catch (e) {
    throw new SimConfigError(`cannot import src/meta.js from tree ${treeRoot()}: ${e.message}`);
  }
  for (const k of ['SHOP_UPGRADES', 'SHOP_BY_ID', 'WEAPON_PRICES', 'CHARACTERS', 'upgradeCost', 'buyUpgrade']) {
    if (META[k] === undefined) {
      throw new SimConfigError(`src/meta.js no longer exports ${k}; tools/progression/catalogue.mjs needs updating`);
    }
  }
  const ELITES = META.ELITE_MODIFIERS || {};
  const weaponOwned = (prof, id) => (prof.unlockedWeapons || []).includes(id);
  const eliteOwned = (prof, id) => (prof.unlockedElites || []).includes(id);

  // Price of every purchase step still open on a row, cheapest-first order is
  // the level order. Unpriced weapon/elite rows have nothing to sell.
  function stepsLeft(prof, def) {
    if (def.kind === 'weapon') {
      const price = META.WEAPON_PRICES[def.weaponId];
      return price === undefined || (prof && weaponOwned(prof, def.weaponId)) ? [] : [price];
    }
    if (def.kind === 'elite') {
      const price = ELITES[def.eliteId] && ELITES[def.eliteId].cost;
      return price === undefined || (prof && eliteOwned(prof, def.eliteId)) ? [] : [price];
    }
    const lvl = prof ? Math.max(0, Number((prof.purchased || {})[def.id]) || 0) : 0;
    const out = [];
    for (let l = lvl; l < def.maxLevel; l++) out.push(META.upgradeCost(def, l));
    return out;
  }

  const rows = META.SHOP_UPGRADES.filter((d) => d && d.id);
  let totalCost = 0, totalItems = 0;
  for (const d of rows) { const s = stepsLeft(null, d); totalItems += s.length; totalCost += s.reduce((a, b) => a + b, 0); }

  // ---- combat / economy classification, derived from the stat pipeline ----
  const combat = new Set();
  const notes = [];
  const base = { damage: 10, cooldown: 1, maxHp: 100, maxMana: 100, projectiles: 1, pierce: 0, speed: 100 };
  let zero = null;
  try { zero = META.applyMetaBonuses(base, {}); } catch (e) {
    notes.push(`applyMetaBonuses unusable (${e.message}); every classic shop row is treated as a combat row`);
  }
  for (const d of rows) {
    if (d.kind === 'weapon') { combat.add(d.id); continue; }
    if (d.kind === 'elite') continue;
    if (!zero) { combat.add(d.id); continue; }
    let one;
    try { one = META.applyMetaBonuses(base, { [d.id]: 1 }); } catch { combat.add(d.id); continue; }
    for (const k of Object.keys(one)) {
      if (ECON_FIELDS.has(k)) continue;
      if (one[k] !== zero[k] && !(Number.isNaN(one[k]) && Number.isNaN(zero[k]))) { combat.add(d.id); break; }
    }
  }
  try { META.applyMetaBonuses(base, {}); } catch { /* re-publish the level-0 engagement range */ }

  const cat = {
    META, rows, totalCost, totalItems, combat, notes,
    weaponRows: rows.filter((d) => d.kind === 'weapon').map((d) => d.id),
    characters: Object.keys(META.CHARACTERS),
    defaultCharacter: Object.keys(META.CHARACTERS).find((k) => !(META.CHARACTERS[k].unlockCost > 0)) || Object.keys(META.CHARACTERS)[0],
    // Every CURRENTLY buyable offer { id, cost } (same rule as the game's own
    // dev_autoplay.offersFor: owned / maxed / unpriced rows are absent).
    offers(prof) {
      const out = [];
      for (const d of rows) { const s = stepsLeft(prof, d); if (s.length) out.push({ id: d.id, cost: s[0] }); }
      return out;
    },
    remaining(prof) {
      let cost = 0, items = 0;
      for (const d of rows) { const s = stepsLeft(prof, d); items += s.length; cost += s.reduce((a, b) => a + b, 0); }
      return { cost, items };
    },
    requireRow(id, why, flag) {
      if (!META.SHOP_BY_ID[id]) {
        throw new SimConfigError(`shop row '${id}' (${why}) is not in SHOP_UPGRADES any more. ` +
          `Pass ${flag} <row id> to name its replacement. Current rows: ${rows.map((d) => d.id).join(', ')}`);
      }
      return META.SHOP_BY_ID[id];
    },
    requireCharacter(id) {
      if (!META.CHARACTERS[id]) {
        throw new SimConfigError(`character '${id}' is not in CHARACTERS. Available: ${Object.keys(META.CHARACTERS).join(', ')}`);
      }
      return META.CHARACTERS[id];
    },
  };
  return cat;
}

// The ONE OF EACH run rule: its draft offer id is 'rule_' + rule id.
export async function requireRule(ruleId) {
  let R;
  try { R = await import(treeUrl('src/rules.js')); } catch (e) {
    throw new SimConfigError(`cannot import src/rules.js (${e.message}); --once take/never needs the run-rule table`);
  }
  if (!R.RULES || !R.RULES[ruleId]) {
    throw new SimConfigError(`run rule '${ruleId}' is not in RULES any more (have: ${Object.keys(R.RULES || {}).join(', ')}). ` +
      `Pass --once-rule <rule id>, or use --once asis.`);
  }
  return 'rule_' + ruleId;
}
