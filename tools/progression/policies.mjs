// HORDES progression simulator — NAMED SHOP POLICIES.
//
// A shopper answers one question, repeatedly, after every run: "given this
// profile and my recent income, what do I buy next?" It returns an offer
// { id, cost } or null (nothing affordable / deliberately holding gold).
// Purchases go through the game's real META.buyUpgrade — a policy only CHOOSES.
//
//   cheapest       cheapest affordable row of ANY kind, repeat (impulsive)
//   stats-first    the damage row whenever affordable; HOLD gold when its next
//                  level is within SAVE_UP_RUNS runs of recent income; else the
//                  cheapest affordable COMBAT row (economy rows only once no
//                  combat step is left to buy; the weapon-line rows count
//                  as combat)
//   weapons-first  weapon unlocks (cheapest first), then the weapon-line rows
//                  (split, slots), first affordable in that order; HOLD when
//                  the nearest unaffordable one is within SAVE_UP_RUNS runs of
//                  income; else behave as stats-first
//   balanced       alternate stats-first / weapons-first purchase by purchase
import { SimConfigError } from './catalogue.mjs';

export const SHOP_POLICIES = ['cheapest', 'stats-first', 'weapons-first', 'balanced'];
export const SAVE_UP_RUNS = 5;      // "within ~5 runs of income" => save up
export const INCOME_WINDOW = 5;     // recent runs the income estimate averages

const byCost = (a, b) => a.cost - b.cost || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function estimateIncome(history, fallback) {
  const v = history.slice(-INCOME_WINDOW);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : fallback;
}

// opts: { damageRow, weaponLine: [ids] }. `hold: false` (fixed-build lump sums)
// disables saving up.
export function makeShopper(name, cat, opts = {}) {
  if (!SHOP_POLICIES.includes(name)) {
    throw new SimConfigError(`unknown shop policy '${name}'. Choose one of: ${SHOP_POLICIES.join(', ')}`);
  }
  const damageRow = opts.damageRow || 'dmg';
  const weaponLine = opts.weaponLine || ['split', 'slots'];
  const hold = opts.hold !== false;
  if (name !== 'cheapest') cat.requireRow(damageRow, 'the damage row stats-first buys', '--damage-row');
  if (name === 'weapons-first' || name === 'balanced') {
    for (const id of weaponLine) cat.requireRow(id, 'a weapon-line row weapons-first buys after the unlocks', '--weapon-line');
    if (cat.weaponRows.length === 0) throw new SimConfigError(`SHOP_UPGRADES has no kind:'weapon' rows; weapons-first has nothing to prefer`);
  }

  const cheapest = (prof, all) => all.filter((o) => prof.gold >= o.cost).sort(byCost)[0] || null;

  function statsFirst(prof, income, all) {
    const dmg = all.find((o) => o.id === damageRow);
    if (dmg && prof.gold >= dmg.cost) return dmg;
    if (hold && dmg && dmg.cost - prof.gold <= SAVE_UP_RUNS * income) return null;
    const combatLeft = all.filter((o) => cat.combat.has(o.id) || weaponLine.includes(o.id));
    if (combatLeft.length) return combatLeft.filter((o) => prof.gold >= o.cost).sort(byCost)[0] || null;
    return cheapest(prof, all);
  }

  function weaponsFirst(prof, income, all) {
    const byId = new Map(all.map((o) => [o.id, o]));
    const prefs = [
      ...all.filter((o) => cat.META.SHOP_BY_ID[o.id].kind === 'weapon').sort(byCost),
      ...weaponLine.filter((id) => byId.has(id)).map((id) => byId.get(id)),
    ];
    const can = prefs.find((o) => prof.gold >= o.cost);
    if (can) return can;
    if (hold && prefs.some((o) => o.cost - prof.gold <= SAVE_UP_RUNS * income)) return null;
    return statsFirst(prof, income, all);
  }

  let turn = 0;   // balanced: 0 = stats-first's turn, 1 = weapons-first's
  return {
    name,
    next(prof, income) {
      const all = cat.offers(prof);
      if (name === 'cheapest') return cheapest(prof, all);
      if (name === 'stats-first') return statsFirst(prof, income, all);
      if (name === 'weapons-first') return weaponsFirst(prof, income, all);
      return (turn === 0 ? statsFirst : weaponsFirst)(prof, income, all);
    },
    bought() { turn = 1 - turn; },
  };
}

// Spend until the policy stops. Returns [{ id, cost }] in purchase order.
export function buyAll(prof, shopper, income, cat) {
  const bought = [];
  for (let guard = 0; guard < 2000; guard++) {
    const o = shopper.next(prof, income);
    if (!o) break;
    const before = prof.gold;
    if (!cat.META.buyUpgrade(prof, o.id)) {
      throw new Error(`policy '${shopper.name}' chose '${o.id}' @${o.cost} with ${before} gold but META.buyUpgrade refused it`);
    }
    bought.push({ id: o.id, cost: before - prof.gold });
    shopper.bought();
  }
  return bought;
}
