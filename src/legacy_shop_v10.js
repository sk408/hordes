// HORDES — the stat-row price table as it stood at save schema v10, frozen.
// The v10 -> v11 migration (save.js) refunds every owned level of these rows
// at the price listed here, then resets the row: the M1 rebalance repriced,
// merged or removed every one of them. Do not edit: old saves are valued
// against these numbers. { rowId: [price of level 1, level 2, ...] }
export const LEGACY_SHOP_V10 = Object.freeze({
  dmg: [125, 250, 325, 650, 1200],
  hp: [100, 250, 400, 600, 1000],
  potions: [250, 375, 563],
  regen: [200, 280, 392, 549],
  focus: [200, 320, 512, 819, 1311],
  thrifty: [350, 595, 1011, 1720],
  well: [250, 400, 640, 1024],
  siphon: [500, 850, 1445, 2456],
  xp: [180, 288, 461, 737, 1180],
  crit: [300, 510, 867, 1474, 2506],
  critdmg: [260, 442, 751, 1277, 2172],
  greed: [350, 490, 686, 960, 1345],
  alchemy: [280, 448, 717, 1147],
  scav: [240, 384, 614, 983],
  artifact: [500, 900, 1620],
  luck: [14000, 28000, 56000, 112000, 224000],
  fleetfoot: [65000, 130000, 260000, 520000, 1040000],
  briarmail: [13300, 26600, 53200, 106400, 212800],
  lodestone: [134000, 268000, 536000, 1072000, 2144000],
  hollowpoint: [136000, 272000, 544000, 1088000, 2176000],
  ironheart: [137000, 274000, 548000, 1096000, 2192000],
  hairtrigger: [139000, 278000, 556000, 1112000, 2224000],
  headsman: [141000, 282000, 564000, 1128000, 2256000],
  bloodpact: [143000, 286000, 572000, 1144000, 2288000],
  fanfire: [410000, 1066000, 2771600],
  deepread: [165000, 264000],
  aethertap: [398000],
  grandelixir: [404000],
  deepfont: [406000],
  eagleeye: [412000],
  staticfield: [418000],
  laststand: [4320000],
  split: [400, 540, 729, 984, 1329, 1794, 2421, 3269, 4413, 5957],
  slots: [3000, 8700, 25230],
  arcade: [42000],
  escapeskip: [100000],
  zapchain: [200000, 340000, 578000, 982600, 1670420],
  might: [300, 510, 867, 1474, 2506],
  toughness: [220, 330, 495, 743, 1114],
  cooldown: [320, 544, 925, 1572, 2673],
  marathon: [260, 416, 666, 1065, 1704],
  magnetism: [280, 448, 717, 1147, 1835],
  growth: [200, 320, 512, 819, 1311],
  avarice: [350, 525, 788, 1181, 1772],
  bullseye: [260, 442, 751, 1277, 2172],
  vampire: [400, 680, 1156, 1965, 3341],
  hoarder: [240, 384, 614, 983],
});

// Refund every owned level of a legacy row. PURE: returns the gold owed, the
// number of rows refunded, and a purchased map with those rows removed (ids
// not in the table are kept as they are).
export function refundLegacyShop(purchased) {
  const kept = {};
  let gold = 0, rows = 0;
  for (const [id, lvl] of Object.entries(purchased || {})) {
    const prices = Object.prototype.hasOwnProperty.call(LEGACY_SHOP_V10, id) ? LEGACY_SHOP_V10[id] : null;
    if (!prices) { kept[id] = lvl; continue; }
    const n = Number(lvl);
    const owned = Number.isFinite(n) ? Math.max(0, Math.min(prices.length, Math.floor(n))) : 0;
    if (owned > 0) rows++;
    for (let l = 0; l < owned; l++) gold += prices[l];
  }
  return { gold, rows, purchased: kept };
}
