// HORDES — the draft as a deck of pixel playing cards (CARD ART track, NEW FILE).
//
// SCOPE: self-contained by design. Nothing here is imported by the game yet and
// this module is deliberately NOT registered in src/art/index.js's ART_SECTIONS
// (the art-lint counts must not move); the orchestrator does the one wiring hook
// into the draft display after the W7b mechanics slice lands.
//
// THE DESIGN (docs/briefs/CARD_ART_PLAYING_CARDS.md — the owner's motif):
//   RANK = rarity:  number cards = COMMON, face cards (J/Q/K) = RARE,
//                   aces = MYTHIC, the two JOKERS = the two 1/10 chase cards
//                   (Second Wind red, Storm Shards black).
//   SUIT = family:  spades = damage, hearts = survival,
//                   diamonds = economy, clubs = utility.
// "King of Spades" reads as a rare damage card with no legend.
//
// THE FORMAT — the game's native integer-pixel grid, same as every src/art/*
// module: grid = number[][], 0 = TRANSPARENT, 1..9 = palette keys.
// THE DRAWGRID TRAP (house skill, load-bearing): drawGrid does a TRUTHY test on
// each cell, so authoring a frame as STRINGS ('.' for empty) paints every pixel
// with whatever fillStyle was left over — that is how a coin glyph once rendered
// as a solid block. The G() parser below turns digit-STRING rows into INTEGER
// grids at module load; what is painted is always numbers, 0 = empty.
//
// THE TEMPLATE — ONE shared frame, not 13 bespoke frames: 24x34 backing,
// transparent corner pixels (the card silhouette), a 1px ink keyline, a
// parchment body with a bottom-right inner shade line, the rank glyph (3x5) +
// suit pip (5x5) stamped top-left and rotated 180deg bottom-right, and the
// central motif. A future card is a MOTIF entry, not a new frame. The two
// jokers are the only full-art cards: no pips, a dark full-bleed body with an
// accent dotted inner frame, so they read as the most special cards in the deck.
//
// Sizing (brief-mandated, stated): 24x34 px backing, integer 3x display scale
// (72x102 CSS px), image-rendering: pixelated — measured in
// tools/verify_card_art.mjs.
import { makeAsset } from './format.js';

export const CARD_W = 24;
export const CARD_H = 34;

// Digit-string rows -> INTEGER grid. Parser output only; never paint strings.
const G = (...rows) => rows.map((r) => [...r].map((ch) => ch.charCodeAt(0) - 48));

// ---------------------------------------------------------------- ranks -----
// 3x5 glyphs. Number = COMMON, face = RARE, ace = MYTHIC, joker = the chase.
export const RANK_CLASS = { number: 'COMMON', face: 'RARE', ace: 'MYTHIC', joker: 'CHASE' };
const RANK_GLYPHS = {
  '2': G('111', '001', '111', '100', '111'),
  '3': G('111', '001', '111', '001', '111'),
  '4': G('101', '101', '111', '001', '001'),
  '5': G('111', '100', '111', '001', '111'),
  '6': G('111', '100', '111', '101', '111'),
  '7': G('111', '001', '010', '010', '010'),
  '8': G('111', '101', '111', '101', '111'),
  '9': G('111', '101', '111', '001', '111'),
  'J': G('011', '001', '001', '101', '010'),
  'Q': G('111', '101', '101', '111', '001'),
  'K': G('101', '101', '110', '101', '101'),
  'A': G('010', '101', '111', '101', '101'),
};

// ---------------------------------------------------------------- suits -----
// Suit colours on the GAME's palette, not a casino's: spades/clubs a dark
// slate from the ink family, hearts/diamonds the game's own red.
export const SUIT_COLOUR = { dark: '#2e3550', red: '#a02a2a' };
export const SUITS = {
  spades:   { family: 'damage',   colour: 'dark' },
  hearts:   { family: 'survival', colour: 'red'  },
  diamonds: { family: 'economy',  colour: 'red'  },
  clubs:    { family: 'utility',  colour: 'dark' },
};
const SUIT_PIPS = {
  spades:   G('00100', '01110', '11111', '00100', '01110'),
  hearts:   G('01010', '11111', '11111', '01110', '00100'),
  diamonds: G('00100', '01110', '11111', '01110', '00100'),
  clubs:    G('00100', '01110', '11011', '00100', '01110'),
};

// --------------------------------------------------------------- motifs -----
// Authored at natural size, stamped centered. Motif palette keys start at 5
// (1 ink keyline / 2 parchment / 3 shade / 4 suit are the frame's). Each motif
// keeps ink out of the two pip corners (top-left x<=6,y<=12 and the rotated
// bottom-right) so the pips always read.
const MOTIFS = {
  heart: {
    palette: { 5: '#c03a3a', 6: '#e04a4a', 7: '#5c1414' },
    grid: G(
      '055000550',
      '556555575',
      '556555575',
      '555555575',
      '055555750',
      '005555700',
      '000557000',
      '000050000',
    ),
  },
  boot: {
    palette: { 5: '#8a5f2c', 6: '#c89a2a', 7: '#4a3018' },
    grid: G(
      '05550000',
      '05550000',
      '05550000',
      '06660000',
      '05550000',
      '05555000',
      '05555500',
      '05555550',
      '55555555',
      '77777777',
    ),
  },
  gem_magnet: {
    palette: { 5: '#2aa08a', 6: '#7ae0c8', 7: '#9aa4b8', 8: '#c03a3a' },
    grid: G(
      '005555500',
      '056555750',
      '005657500',
      '000575000',
      '000050000',
      '000000000',
      '870000078',
      '870000078',
      '770000077',
      '077000770',
      '007777700',
    ),
  },
  // RSS8 MAGNET COLLECTOR — a HORSESHOE: the classic U with steel pole tips
  // at the opening and the gold it is pulling up between them. NOT gem_magnet
  // (that is the pickup-RADIUS stat card's field-line motif); this is the
  // active sweep's own shape, opening DOWN onto the loot.
  horseshoe: {
    palette: { 5: '#b23a3a', 6: '#e08a8a', 7: '#9aa4b8', 8: '#ffe07a' },
    grid: G(
      '066666660',
      '655555556',
      '650000056',
      '650000056',
      '650000056',
      '650000056',
      '650000056',
      '670000076',
      '670000076',
      '007808700',
      '000787000',
    ),
  },
  spear: {
    palette: { 5: '#9aa4b8', 6: '#e8ecf4', 7: '#8a5f2c' },
    grid: G(
      '0000500000',
      '0005650000',
      '0055555000',
      '0000700000',
      '0000700000',
      '0000700000',
      '0000700000',
      '0000700000',
      '0070707000',
      '0000700000',
    ),
  },
  three_arrows: {
    palette: { 5: '#9aa4b8', 7: '#8a5f2c' },
    grid: G(
      '05000500050',
      '55505550555',
      '07000700070',
      '07000700070',
      '07000700070',
      '07000700070',
      '07000700070',
      '07000700070',
      '70707070707',
      '07000700070',
    ),
  },
  crowned_heart: {
    palette: { 5: '#c03a3a', 6: '#e04a4a', 7: '#5c1414', 8: '#c89a2a', 9: '#ffe07a' },
    grid: G(
      '800080008',
      '880888088',
      '889888988',
      '000000000',
      '055000550',
      '556555575',
      '556555575',
      '555555575',
      '055555750',
      '005555700',
      '000557000',
      '000050000',
    ),
  },
  whetstone: {
    palette: { 5: '#9aa4b8', 6: '#e8ecf4', 7: '#8a5f2c', 8: '#5a5f6e', 9: '#3a3f4c' },
    grid: G(
      '000000000550',
      '000000005650',
      '000000056500',
      '000000565000',
      '000005650000',
      '000056500000',
      '000565000000',
      '005650000000',
      '077708888800',
      '077088888880',
      '008888888880',
      '009999999990',
    ),
  },
  tome: {
    palette: { 5: '#3a5a9a', 6: '#efe6cc', 7: '#c89a2a', 8: '#5a6a8a' },
    grid: G(
      '055550055550',
      '056665566650',
      '056866668650',
      '056666566750',
      '056866668650',
      '056666566650',
      '056665566650',
      '055555555550',
    ),
  },
  coin_palm: {
    palette: { 5: '#d8a878', 6: '#a87848', 7: '#c89a2a', 8: '#ffe07a' },
    grid: G(
      '00007770000',
      '00078877000',
      '00078777000',
      '00077777000',
      '00007770000',
      '00000000000',
      '00555555500',
      '05555555550',
      '55556665550',
      '05555555550',
      '00555555500',
    ),
  },
  red_blade: {
    palette: { 5: '#c03a3a', 6: '#e04a4a', 7: '#c89a2a', 8: '#3a3f4c' },
    grid: G(
      '0000050000',
      '0000565000',
      '0000565000',
      '0000565000',
      '0000565000',
      '0000565000',
      '0000565000',
      '0007777000',
      '0000080000',
      '0000080000',
      '0000880000',
    ),
  },
  card_fan: {
    palette: { 5: '#f4f4f8', 6: '#0a0a0e', 7: '#a02a2a' },
    grid: G(
      '0000666660000',
      '0000655560000',
      '6666655566666',
      '6556657566556',
      '6656657566656',
      '6556655566556',
      '6556655566556',
      '6556666666556',
      '6666000006666',
    ),
  },
  // RED JOKER — a winged heart: gold wings hugging a red heart, glow motes,
  // on a deep maroon full-bleed body.
  winged_heart: {
    palette: { 5: '#1c0f16', 6: '#c03a3a', 7: '#e04a4a', 8: '#f0b45a', 9: '#ffe07a' },
    grid: G(
      '0000000000000000',
      '0000900000090000',
      '0088000000008800',
      '0888000000008880',
      '0898000000008980',
      '0888066006608880',
      '0880676666660880',
      '0880666666660880',
      '0080666666660800',
      '0080066666600800',
      '0000066666600000',
      '0000006666000000',
      '0000000660000000',
      '0000000600000000',
      '0000900000090000',
      '0000000000000000',
    ),
  },
  // BLACK JOKER — a lightning-struck shard: a gold bolt with a white-hot core
  // cracks a steel crystal, chips scattered, on a near-black full-bleed body.
  storm_shard: {
    palette: { 5: '#0e1018', 6: '#5a6a8a', 7: '#9ab8e8', 8: '#ffe07a', 9: '#f4f4f8' },
    grid: G(
      '0980000000000000',
      '0089000000000000',
      '0008900000000000',
      '0000890000000000',
      '0000089000000000',
      '0000000670000000',
      '0000006776000000',
      '0000067776000000',
      '0000067997600000',
      '0000067997600000',
      '0066006776000000',
      '0000006776000000',
      '0000000660006600',
      '0000000000006600',
      '0090000000000900',
      '0000000000000000',
    ),
  },

  // ============================================================ expansion ====
  // CARD ART COVERAGE (docs/briefs/CARD_ART_COVERAGE.md): motifs for the rest
  // of the draft pool — the nine weapon cards, Quick Hands, the G8 rule /
  // perk / rewrite families and the Pocket Frost card, plus the five G21
  // slice 1 keyword rewrites (Rime / Ignite / Live Wire / Aftershock / Wide
  // Orbit). Same discipline as the
  // core motifs: integer grids via G(), palette keys 5..9, ink kept out of
  // the pip corners (TL x<=6,y<=12 and the rotated BR) so the pips read.
  // ORBIT BLADE — a steel blade circling inside its gold orbit ring.
  orbit: {
    palette: { 5: '#9aa4b8', 6: '#e8ecf4', 7: '#c89a2a' },
    grid: G(
      '00007770000',
      '00700000700',
      '07000000070',
      '07000560070',
      '07005600070',
      '70056000007',
      '07056000070',
      '07060000070',
      '07000000070',
      '00700000700',
      '00007770000',
    ),
  },
  // BOOMERANG — the thrown V, wood with a gold leading edge.
  boomerang: {
    palette: { 5: '#8a5f2c', 6: '#c89a2a', 7: '#4a3018' },
    grid: G(
      '5500000055',
      '5660000665',
      '0566006650',
      '0056666500',
      '0005665000',
      '0000550000',
    ),
  },
  // CHAIN ZAP — a gold bolt with a white-hot core, zigzag down the card.
  bolt: {
    palette: { 8: '#ffe07a', 9: '#f4f4f8' },
    grid: G(
      '0080000',
      '0098000',
      '0980000',
      '0980000',
      '9800000',
      '9999980',
      '0000980',
      '0000980',
      '0009800',
      '0009800',
      '0098000',
      '0080000',
    ),
  },
  // SCYTHE — the curved blade sweeping off the top of its haft.
  scythe: {
    palette: { 5: '#9aa4b8', 6: '#e8ecf4', 7: '#8a5f2c' },
    grid: G(
      '0000555550',
      '0005666665',
      '0056500005',
      '0055000000',
      '0007000000',
      '0007000000',
      '0007000000',
      '0007000000',
      '0007000000',
      '0007000000',
      '0007000000',
      '0007000000',
    ),
  },
  // BEAM — a white-core energy column, flared at the muzzle.
  beam: {
    palette: { 5: '#2aa08a', 8: '#7ae0c8', 9: '#f4f4f8' },
    grid: G(
      '00899800',
      '00899800',
      '05899850',
      '00899800',
      '00899800',
      '00899800',
      '00899800',
      '00899800',
      '00899800',
      '00899800',
      '00899800',
      '00899800',
    ),
  },
  // NOVA PULSE — the ring bursting from the player, white-hot core.
  pulse: {
    palette: { 5: '#3a5a9a', 7: '#f4f4f8' },
    grid: G(
      '00005500000',
      '00055550000',
      '00550005500',
      '05500000550',
      '05000700050',
      '05007770050',
      '05000700050',
      '05500000550',
      '00550005500',
      '00055550000',
      '00005500000',
    ),
  },
  // SEEKER — the homing missile climbing its own flame trail.
  seeker: {
    palette: { 5: '#9aa4b8', 7: '#c89a2a', 8: '#c03a3a' },
    grid: G(
      '000080000',
      '000585000',
      '005858500',
      '005555500',
      '005555500',
      '000555000',
      '000050000',
      '000070000',
      '000700000',
      '000070000',
      '000700000',
      '000070000',
    ),
  },
  // MINE LAYER — the spiked mine with its red trigger light.
  mine: {
    palette: { 5: '#5a5f6e', 6: '#9aa4b8', 8: '#c03a3a' },
    grid: G(
      '000060000',
      '060000060',
      '005555500',
      '005585500',
      '605585506',
      '005585500',
      '005555500',
      '060000060',
      '000060000',
    ),
  },
  // QUICK HANDS — the hourglass: gold caps, glass bulbs, sand pooled below.
  hourglass: {
    palette: { 5: '#5a6a8a', 7: '#c89a2a', 8: '#ffe07a' },
    grid: G(
      '77777777',
      '70555507',
      '07055070',
      '00755700',
      '00057000',
      '00057000',
      '00758700',
      '07088070',
      '70888807',
      '77777777',
    ),
  },
  // HORDE BAIT — the chest that is always a horde, keyhole glowing.
  chest: {
    palette: { 5: '#8a5f2c', 6: '#4a3018', 7: '#c89a2a', 8: '#ffe07a' },
    grid: G(
      '077777777770',
      '075555555570',
      '075666666570',
      '077777777770',
      '077708077770',
      '075555555570',
      '075666666570',
      '075555555570',
      '077777777770',
    ),
  },
  // ONE OF EACH — a lone mini card, its red pips at both corners.
  lone_card: {
    palette: { 5: '#3a3f4c', 6: '#efe6cc', 7: '#a02a2a' },
    grid: G(
      '05555550',
      '05666650',
      '05677650',
      '05677650',
      '05666650',
      '05666650',
      '05666650',
      '05677650',
      '05677650',
      '05666650',
      '05555550',
    ),
  },
  // REGROWTH — the sprout that never stops, rooted in dark soil.
  sprout: {
    palette: { 5: '#2a8a4a', 6: '#5ac86a', 7: '#8a5f2c' },
    grid: G(
      '000060000',
      '006000600',
      '066606660',
      '006666600',
      '000060000',
      '000060000',
      '000060000',
      '000060000',
      '000060000',
      '007777700',
      '077777770',
    ),
  },
  // FOCUS — the scrying orb on its gold stand, white-hot centre.
  orb: {
    palette: { 5: '#5a6a8a', 6: '#9ab8e8', 7: '#f4f4f8', 8: '#c89a2a' },
    grid: G(
      '000555000',
      '005666500',
      '056777650',
      '056777650',
      '056666650',
      '005666500',
      '000555000',
      '000050000',
      '000888000',
      '008888800',
    ),
  },
  // THICK SKIN — the shield, steel with a gold boss.
  shield: {
    palette: { 5: '#9aa4b8', 6: '#e8ecf4', 7: '#c89a2a' },
    grid: G(
      '0555555550',
      '0566666650',
      '0566006650',
      '0566006650',
      '0566776650',
      '0566006650',
      '0566666650',
      '0056666500',
      '0005665000',
      '0000550000',
      '0000050000',
    ),
  },
  // POCKET FROST — the snowflake, ice-blue arms around a white heart.
  snowflake: {
    palette: { 6: '#9ab8e8', 7: '#f4f4f8' },
    grid: G(
      '60006000006',
      '06006000060',
      '00606006060',
      '00066666000',
      '00067776000',
      '66667766666',
      '00067776000',
      '00066666000',
      '00606006060',
      '06006000060',
      '60006000006',
    ),
  },
  // CHAIN REACTION — the kill detonation, a gold starburst with a white core.
  blast: {
    palette: { 8: '#ffe07a', 9: '#f4f4f8' },
    grid: G(
      '00000800000',
      '08000800080',
      '00800800800',
      '00088888000',
      '00888988800',
      '08889998880',
      '00888988800',
      '00088888000',
      '00800800800',
      '08000800080',
      '00000800000',
    ),
  },
  // BLOOD HARVEST — the health potion that bites back, red draught in glass.
  potion: {
    palette: { 5: '#9aa4b8', 6: '#c03a3a', 7: '#e04a4a', 8: '#8a5f2c' },
    grid: G(
      '00088000',
      '00088000',
      '00055000',
      '00555500',
      '05577550',
      '05666650',
      '05666650',
      '05667650',
      '05666650',
      '05666650',
      '05555550',
      '00555500',
    ),
  },

  // ---- G21 slice 1: the five KEYWORD rewrite cards -------------------------
  // (docs/briefs/G21_RULE_CARDS.md): one motif per keyword family — FROST /
  // BURN / CONDUCT / CHAIN / ORBIT. Five genuinely NEW grids, never an alias
  // of an existing motif: the expansion's interior-distinctness contract
  // (test/test_card_art_expansion.mjs) is about the ART, so reusing a grid
  // under a new name would defeat it.
  // RIME (FROST) — the chill itself: an ice crystal, white core, frost spikes.
  frost_shard: {
    palette: { 5: '#5a90c8', 6: '#9ad0f4', 7: '#f4f4f8' },
    grid: G(
      '000060000',
      '000060000',
      '000560000',
      '000565000',
      '050565050',
      '005565500',
      '000767000',
      '005565500',
      '050565050',
      '000565000',
      '000050000',
    ),
  },
  // IGNITE (BURN) — the flame: ember body, hot gold heart, tapering wick.
  flame: {
    palette: { 5: '#b03a1a', 6: '#e07828', 7: '#ffe07a' },
    grid: G(
      '000060000',
      '000060000',
      '000560000',
      '005660000',
      '005676000',
      '056776600',
      '056777650',
      '056777650',
      '005667600',
      '000566500',
      '000055000',
    ),
  },
  // LIVE WIRE (CONDUCT) — the spark ACROSS its own gap: a gold conductor
  // between steel clamp plates, white-hot core bursting at the break.
  spark_arc: {
    palette: { 5: '#9aa4b8', 6: '#f4f4f8', 7: '#ffe07a' },
    grid: G(
      '000070000',
      '000070000',
      '005000500',
      '005555500',
      '000606000',
      '006666600',
      '000606000',
      '005555500',
      '005000500',
      '000070000',
      '000070000',
    ),
  },
  // AFTERSHOCK (CHAIN) — the echo: a white-hot core inside a gold detonation
  // ring, inside the wider amber shockwave the first blast leaves behind.
  echo_rings: {
    palette: { 5: '#f0b45a', 6: '#ffe07a', 7: '#f4f4f8' },
    grid: G(
      '000050000',
      '005000500',
      '050000050',
      '500666005',
      '000676000',
      '500666005',
      '050000050',
      '005000500',
      '000050000',
    ),
  },
  // WIDE ORBIT (ORBIT) — the blade ring at full spread: a steel ellipse,
  // wider than the core 'orbit' motif's circle, gold blade tips held at the
  // poles around a glowing core.
  wide_orbit: {
    palette: { 5: '#c89a2a', 6: '#9aa4b8', 7: '#f4f4f8' },
    grid: G(
      '000050000',
      '000050000',
      '006666600',
      '060000060',
      '000777000',
      '060000060',
      '006666600',
      '000050000',
      '000050000',
    ),
  },

  // ---- G21 slice 2: the three CROSS-TAG COMBO cards ------------------------
  // (docs/briefs/G21_SLICE2_COMBOS.md D2). One genuinely NEW grid per combo,
  // never an alias: the interior-distinctness contract is about the ART.
  // THERMAL SHOCK (FROST+BURN) — the ice that catches fire: a shell of light
  // ice crystal, spiked top and bottom, split by the flame bursting from its
  // core (RIME's chill + IGNITE's burn in ONE shape).
  thermal_crack: {
    palette: { 5: '#4a86c8', 6: '#9ad0f4', 7: '#e07828', 8: '#ffe07a' },
    grid: G(
      '00006000000',
      '00006000000',
      '00056650000',
      '00567765000',
      '05678876500',
      '05678876500',
      '00567765000',
      '00056650000',
      '00006000000',
      '00006000000',
    ),
  },
  // STORM REAPER (CONDUCT+CHAIN) — the zap kill: a gold bolt landing on the
  // detonation it leaves behind (a blast diamond ring around a white core).
  thunder_blast: {
    palette: { 5: '#c89a2a', 6: '#ffe07a', 7: '#f4f4f8' },
    grid: G(
      '0000600',
      '0006600',
      '0006600',
      '0066000',
      '0066000',
      '0006600',
      '0006700',
      '0005000',
      '0050500',
      '5507055',
      '0050500',
      '0005000',
    ),
  },
  // GLACIAL ORBIT (ORBIT+FROST) — the icy ring: a frost-blue orbit carrying
  // crystal at its edges and a white core. NOT `orbit` (the steel blade inside
  // its gold ring) and NOT `wide_orbit` (the gold ellipse): a new grid.
  glacier_ring: {
    palette: { 5: '#4a86c8', 6: '#9ad0f4', 7: '#f4f4f8' },
    grid: G(
      '00006000000',
      '00006000000',
      '00065656000',
      '00650005600',
      '06500000560',
      '65000700056',
      '06500000560',
      '00650005600',
      '00065656000',
      '00006000000',
      '00006000000',
    ),
  },
  // ---- G21 slice 2: the three ALWAYS-OFFERED single-tag cards --------------
  // (second card per tag: GLACIER / WILDFIRE / OVERLOAD). These take the three
  // COMMON number slots the combos vacated (7D / 8D / 9D) — see the owner
  // decision in the CARD_EXPANSION header below. One genuinely NEW grid each,
  // never an alias of an existing motif: the interior-distinctness contract is
  // about the ART.
  // GLACIER (FROST) — the ice mass itself: a crystalline peak with a white cap
  // over a blue body, wider and blunter than RIME's `frost_shard` spike.
  glacier_peak: {
    palette: { 5: '#3a6aa8', 6: '#5a90c8', 7: '#f4f4f8' },
    grid: G(
      '00000700000',
      '00000700000',
      '00000770000',
      '00006770000',
      '00067776000',
      '00677777600',
      '06777777760',
      '67776667776',
      '56666666665',
      '55666666655',
      '55555555555',
    ),
  },
  // WILDFIRE (BURN) — the burn LEAVING a corpse: one fire with two flanking
  // tongues and ember sparks rising off them (a spread, not IGNITE's single
  // taper). Its own grid.
  wildfire_spread: {
    palette: { 5: '#b03a1a', 6: '#e07828', 7: '#ffe07a' },
    grid: G(
      '00600000600',
      '00660006600',
      '00666066600',
      '05676667650',
      '05677777650',
      '00567776500',
      '00567776500',
      '00056765000',
      '00005650000',
      '00005500000',
      '00005000000',
    ),
  },
  // OVERLOAD (CONDUCT) — the discharge: gold spokes thrown to the corners off
  // a white-hot core inside a steel ring. NOT `spark_arc` (the clamped gap) and
  // NOT `pulse` (the nova ring): a radial burst of its own.
  overload_nova: {
    palette: { 5: '#9aa4b8', 6: '#ffe07a', 7: '#f4f4f8' },
    grid: G(
      '60000000006',
      '06000000060',
      '00600500600',
      '00065056000',
      '00057775000',
      '06057775060',
      '00057775000',
      '00065056000',
      '00600500600',
      '06000000060',
      '60000000006',
    ),
  },
};

// ---------------------------------------------------------------- deck ------
// THE 13 CARDS (the brief's table; ranks inside a tier are placeholders — the
// contract is tier -> rank CLASS). `id` matches the live draft id in
// src/config.js UPGRADES where one exists today (hp/speed/pickup/pierce/multi/
// dmg); the W7b-only cards get new stable ids for the mechanics builder.
export const CARD_DECK = [
  { id: 'hp',             name: 'Iron Heart +25',    desc: '+25 max HP and heal 25',            rank: '2', suit: 'hearts',   motif: 'heart' },
  { id: 'speed',          name: 'Light Boots',       desc: '+15% move speed',                   rank: '5', suit: 'clubs',    motif: 'boot' },
  { id: 'pickup',         name: 'Gem Magnet',        desc: '+30% pickup radius',                rank: '6', suit: 'diamonds', motif: 'gem_magnet' },
  { id: 'pierce',         name: 'Sharpened Tips',    desc: 'Projectiles pierce +1 enemy',       rank: '7', suit: 'spades',   motif: 'spear' },
  { id: 'multi',          name: 'Split Shot',        desc: '+1 projectile per volley',          rank: '8', suit: 'spades',   motif: 'three_arrows' },
  { id: 'hp_pct',         name: 'Iron Heart +25%',   desc: '+25% max HP and heal 25%',          rank: 'K', suit: 'hearts',   motif: 'crowned_heart' },
  { id: 'dmg',            name: 'Whetstone',         desc: '+15% weapon damage',                rank: 'Q', suit: 'spades',   motif: 'whetstone' },
  { id: 'scholars_stone', name: "Scholar's Stone",   desc: '+20% XP gain',                      rank: 'J', suit: 'clubs',    motif: 'tome' },
  { id: 'gilded_palm',    name: 'Gilded Palm',       desc: '+30% purse gold per kill',          rank: 'Q', suit: 'diamonds', motif: 'coin_palm' },
  { id: 'crimson_edge',   name: 'Crimson Edge',      desc: '+3% lifesteal',                     rank: 'K', suit: 'spades',   motif: 'red_blade' },
  { id: 'full_hand',      name: 'Full Hand',         desc: '+1 draft offer for the run',        rank: 'A', suit: 'clubs',    motif: 'card_fan' },
  { id: 'second_wind',    name: 'Second Wind',       desc: 'Revive once at 50% max HP',         rank: 'JOKER', suit: null,   motif: 'winged_heart', joker: 'red' },
  { id: 'storm_shards',   name: 'Storm Shards',      desc: 'XP pickup deals chip damage',       rank: 'JOKER', suit: null,   motif: 'storm_shard',  joker: 'black' },
];
export const CARD_IDS = CARD_DECK.map((c) => c.id);

// ------------------------------------------------------- expansion deck -----
// CARD ART COVERAGE (docs/briefs/CARD_ART_COVERAGE.md): the rest of the draft
// pool. These live OUTSIDE CARD_DECK/CARD_IDS on purpose — the core-deck
// contract (test_card_art.mjs pins exactly 13) does not move — but they are
// built through the SAME frame/pip/palette pipeline below and registered into
// CARD_ART, so cardArt()/drawCard find them exactly like a core card.
//
// Expansion cards are COMMON-pool content by default, so their rank is a
// NUMBER (rank class IS the rarity: number = COMMON). ONE exception, by owner
// decision 2026-09-15 (see the G21 slice 2 block below): the three CROSS-TAG
// COMBO cards are RARE-tier, so they take FACE ranks (J/Q/K) and declare
// `tier: 'RARE'`. A card's declared tier and its rank class must AGREE —
// test/test_card_art_expansion.mjs derives the expected rank class from the
// declared tier (never a hardcoded id list), so a RARE card on a number rank
// (or a COMMON one on a face rank) goes red. The face/ace/joker ranks stay
// exclusive to the W7b ladder and the two jokers otherwise.
// Suit = family, matched to how the core cards assign suit (spades damage,
// hearts survival, diamonds economy, clubs utility):
//   - weapons are the DAMAGE family (spades), by identity. Two exceptions,
//     both by what the weapon IS: NOVA_PULSE is the self-centred defensive
//     burst (hearts/survival); SEEKER (homing guidance) and MINE (deployed
//     trap) ride the utility suit (clubs).
//   - Quick Hands (cooldown), the G8 run rules/perks and Pocket Frost are
//     utility (clubs), except the survival-flavoured ones: Regrowth, Thick
//     Skin and Blood Harvest (health potions) are hearts, and Horde Bait
//     (chest rarity/gold) is diamonds. Chain Reaction's kill-detonation
//     engine clears the bodies pressing you: hearts, beside Blood Harvest.
//   - VOLLEY reuses three_arrows (it IS the arrow volley Split Shot extends)
//     and PIERCE ALL reuses spear (the pierce identity) — motif reuse across
//     registries, never within one.
// Names join by NAME to the source of truth (WEAPON_NAMES / UPGRADES /
// RULES / SKILL_PERKS / REWRITES / frostCard) — pinned in
// test/test_card_art_expansion.mjs so a rename on either side goes red.
export const CARD_EXPANSION = [
  { id: 'wpn_volley',     name: 'Volley',        desc: 'weapon card',         rank: '2', suit: 'spades',   motif: 'three_arrows' },
  { id: 'wpn_orbit',      name: 'Orbit Blade',   desc: 'weapon card',         rank: '3', suit: 'spades',   motif: 'orbit' },
  { id: 'wpn_boomerang',  name: 'Boomerang',     desc: 'weapon card',         rank: '4', suit: 'spades',   motif: 'boomerang' },
  { id: 'wpn_zap',        name: 'Chain Zap',     desc: 'weapon card',         rank: '5', suit: 'spades',   motif: 'bolt' },
  { id: 'wpn_scythe',     name: 'Scythe',        desc: 'weapon card',         rank: '6', suit: 'spades',   motif: 'scythe' },
  { id: 'wpn_beam',       name: 'Beam',          desc: 'weapon card',         rank: '9', suit: 'spades',   motif: 'beam' },
  { id: 'wpn_nova_pulse', name: 'Nova Pulse',    desc: 'weapon card',         rank: '3', suit: 'hearts',   motif: 'pulse' },
  { id: 'wpn_seeker',     name: 'Seeker',        desc: 'weapon card',         rank: '4', suit: 'clubs',    motif: 'seeker' },
  { id: 'wpn_mine',       name: 'Mine Layer',    desc: 'weapon card',         rank: '2', suit: 'clubs',    motif: 'mine' },
  { id: 'quick_hands',    name: 'Quick Hands',   desc: '-15% attack cooldown', rank: '3', suit: 'clubs',   motif: 'hourglass' },
  { id: 'rule_hordebait', name: 'Horde Bait',    desc: 'run rule card',       rank: '3', suit: 'diamonds', motif: 'chest' },
  { id: 'rule_once',      name: 'One of Each',   desc: 'run rule card',       rank: '8', suit: 'clubs',    motif: 'lone_card' },
  { id: 'skill_regrowth', name: 'Regrowth',      desc: 'skill card',          rank: '4', suit: 'hearts',   motif: 'sprout' },
  { id: 'skill_focus',    name: 'Focus',         desc: 'skill card',          rank: '6', suit: 'clubs',    motif: 'orb' },
  { id: 'skill_thick',    name: 'Thick Skin',    desc: 'skill card',          rank: '5', suit: 'hearts',   motif: 'shield' },
  { id: 'skill_frost',    name: 'Frost Nova',    desc: 'skill card',          rank: '7', suit: 'clubs',    motif: 'snowflake' },
  { id: 'rw_pierceall',   name: 'Pierce All',    desc: 'rewrite card',        rank: '9', suit: 'clubs',    motif: 'spear' },
  { id: 'rw_onkillboom',  name: 'Chain Reaction', desc: 'rewrite card',       rank: '9', suit: 'hearts',   motif: 'blast' },
  { id: 'rw_healthdamage', name: 'Blood Harvest', desc: 'rewrite card',       rank: '6', suit: 'hearts',   motif: 'potion' },
  // G21 slice 1: the five KEYWORD rewrite cards (Rime / Ignite / Live Wire /
  // Aftershock / Wide Orbit), one per REWRITE_TAGS family. SUIT by what the
  // card does in play, like every other expansion card: RIME (chill) and
  // AFTERSHOCK (the CHAIN echo) are the crowd-control reads that keep bodies
  // off you, so they sit in survival beside CHAIN REACTION and Blood Harvest.
  // IGNITE / LIVE WIRE / WIDE ORBIT are weapon riders of the damage family,
  // but every spade AND club number 2..9 is already spoken for (the deck's
  // own rank+suit contract), so they take the one family still open —
  // diamonds. That is a space constraint, NOT a claim burn is economy.
  // Ranks are COMMON pool numbers, chosen to leave no exact rank+suit
  // duplicate anywhere in the deck: 7H / 8H / 2D / 4D / 5D.
  { id: 'rw_rime',        name: 'Rime',          desc: 'rewrite card',        rank: '7', suit: 'hearts',   motif: 'frost_shard' },
  { id: 'rw_ignite',      name: 'Ignite',        desc: 'rewrite card',        rank: '2', suit: 'diamonds', motif: 'flame' },
  { id: 'rw_livewire',    name: 'Live Wire',     desc: 'rewrite card',        rank: '4', suit: 'diamonds', motif: 'spark_arc' },
  { id: 'rw_aftershock',  name: 'Aftershock',    desc: 'rewrite card',        rank: '8', suit: 'hearts',   motif: 'echo_rings' },
  { id: 'rw_wideorbit',   name: 'Wide Orbit',    desc: 'rewrite card',        rank: '5', suit: 'diamonds', motif: 'wide_orbit' },
  // G21 slice 2: the three SECOND-PER-TAG SINGLES (Glacier / Wildfire /
  // Overload — the always-offered cards) plus the three CROSS-TAG COMBOS.
  //
  // CAPACITY ARITHMETIC (measured, and the reason this block is shaped this
  // way). The COMMON number-rank space is `2..9 x 4 suits` = 32 rank+suit
  // pairs, TOTAL. The frozen 13-card core deck pins 5 of them (2H / 5C / 6D /
  // 7S / 8S), so expansion cards can hold at most 27 — and after G21 slice 1 the
  // expansion held 24 of them, leaving exactly THREE free pairs (7D / 8D / 9D).
  // G21 slice 2 adds SIX cards (three singles + three combos), so three of them
  // CANNOT be number cards at all.
  //
  // OWNER DECISION (2026-09-15, approved): the three COMBO cards become
  // FACE-RANK (J/Q/K), RARE-tier, and the three always-offered SINGLES take the
  // three COMMON number slots the combos vacate (7D / 8D / 9D). Rationale: the
  // singles (glacier / wildfire / overload) are offered UNCONDITIONALLY, so they
  // are the visible common cards; the combos (thermalshock / stormreaper /
  // glacialorbit) are prerequisite-gated premium content (both constituents
  // owned) and belong in the rare tier. `rank = rarity` still holds: face rank
  // IS the RARE tier (RANK_CLASS below), and each combo declares `tier: 'RARE'`
  // so the deck states its tier rather than letting it be inferred silently.
  //
  // SUIT/FAMILY for the combos: each sits in the family its constituents live
  // in — THERMAL SHOCK (FROST+BURN) with the frost read in HEARTS (beside Rime
  // 7H and Aftershock 8H), STORM REAPER (CONDUCT+CHAIN) with CONDUCT in
  // DIAMONDS (Live Wire 4D), GLACIAL ORBIT (ORBIT+FROST) with the frost/orbit
  // chill in HEARTS (Q, beside the other frost cards). J H / J D / Q H are free
  // face slots (the W7b ladder holds K H, Q S, J C, Q D, K S) — no exact
  // rank+suit duplicate anywhere in the deck.
  { id: 'rw_glacier',      name: 'Glacier',      desc: 'rewrite card',        rank: '7', suit: 'diamonds', motif: 'glacier_peak' },
  { id: 'rw_wildfire',     name: 'Wildfire',     desc: 'rewrite card',        rank: '8', suit: 'diamonds', motif: 'wildfire_spread' },
  { id: 'rw_overload',     name: 'Overload',     desc: 'rewrite card',        rank: '9', suit: 'diamonds', motif: 'overload_nova' },
  { id: 'rw_thermalshock', name: 'Thermal Shock', desc: 'rewrite card',      rank: 'J', suit: 'hearts',   motif: 'thermal_crack',  tier: 'RARE' },
  { id: 'rw_stormreaper',  name: 'Storm Reaper',  desc: 'rewrite card',      rank: 'J', suit: 'diamonds', motif: 'thunder_blast',  tier: 'RARE' },
  { id: 'rw_glacialorbit', name: 'Glacial Orbit', desc: 'rewrite card',      rank: 'Q', suit: 'hearts',   motif: 'glacier_ring',   tier: 'RARE' },
  // RSS8 MAGNET COLLECTOR (owner 2026-09-17): the 4th MYTHIC chase card, so
  // the expansion tier vocabulary grows a third entry — `tier: 'MYTHIC'` on
  // an ACE rank (the tier is still DERIVED from the rank: ace = MYTHIC, the
  // same RANK_CLASS mapping the core-deck mythics ride). Suit: DIAMONDS, the
  // economy/loot family (the card's whole job is collecting the floor), and
  // the one free ace beside full_hand's A of clubs — no rank+suit duplicate
  // anywhere in the full deck.
  { id: 'magnet_collector', name: 'Magnet Collector', desc: 'SKILL [X]: sweep every drop · 30s cooldown', rank: 'A', suit: 'diamonds', motif: 'horseshoe', tier: 'MYTHIC' },
];
export const EXPANSION_IDS = CARD_EXPANSION.map((c) => c.id);

const RANK_CLASS_OF = (rank) =>
  rank === 'JOKER' ? 'joker' : rank === 'A' ? 'ace' : ('JQK'.includes(rank) ? 'face' : 'number');

// ------------------------------------------------------------- composition --
function blank() {
  return Array.from({ length: CARD_H }, () => new Array(CARD_W).fill(0));
}

// Stamp src into dst at (x, y); only truthy cells are painted (0 = transparent).
function stamp(dst, src, x, y, key = 0) {
  for (let ry = 0; ry < src.length; ry++) {
    for (let rx = 0; rx < src[ry].length; rx++) {
      const v = src[ry][rx];
      if (v) dst[y + ry][x + rx] = key || v;
    }
  }
}

// The bottom-right corner pip: the same glyph rotated 180deg, as on a real card.
function stampRot180(dst, src, x, y, key) {
  const h = src.length, w = src[0].length;
  for (let ry = 0; ry < h; ry++) {
    for (let rx = 0; rx < w; rx++) {
      const v = src[ry][rx];
      if (v) dst[y + (h - 1 - ry)][x + (w - 1 - rx)] = key;
    }
  }
}

// The ONE shared frame: transparent corner silhouette, 1px ink keyline,
// parchment body, bottom-right inner shade line.
function frame() {
  const g = blank();
  for (let x = 1; x < CARD_W - 1; x++) { g[0][x] = 1; g[CARD_H - 1][x] = 1; }
  for (let y = 1; y < CARD_H - 1; y++) { g[y][0] = 1; g[y][CARD_W - 1] = 1; }
  for (let y = 1; y < CARD_H - 1; y++) {
    for (let x = 1; x < CARD_W - 1; x++) g[y][x] = 2;
  }
  for (let y = 2; y < CARD_H - 2; y++) g[y][CARD_W - 2] = 3;
  for (let x = 2; x < CARD_W - 2; x++) g[CARD_H - 2][x] = 3;
  return g;
}

// Full-bleed joker frame: ink keyline, dark body, dotted accent inner frame.
// No rank/suit pips — the jokers are the only full-art cards in the deck.
function jokerFrame(bgKey, accentKey) {
  const g = blank();
  for (let x = 1; x < CARD_W - 1; x++) { g[0][x] = 1; g[CARD_H - 1][x] = 1; }
  for (let y = 1; y < CARD_H - 1; y++) { g[y][0] = 1; g[y][CARD_W - 1] = 1; }
  for (let y = 1; y < CARD_H - 1; y++) {
    for (let x = 1; x < CARD_W - 1; x++) g[y][x] = bgKey;
  }
  for (let y = 3; y < CARD_H - 3; y += 2) { g[y][2] = accentKey; g[y][CARD_W - 3] = accentKey; }
  for (let x = 3; x < CARD_W - 3; x += 2) { g[2][x] = accentKey; g[CARD_H - 3][x] = accentKey; }
  return g;
}

function composeCard(def) {
  const m = MOTIFS[def.motif];
  const mx = Math.floor((CARD_W - m.grid[0].length) / 2);
  const my = Math.floor((CARD_H - m.grid.length) / 2);
  let g;
  if (def.joker) {
    g = jokerFrame(5, 8);
    stamp(g, m.grid, mx, my);
  } else {
    g = frame();
    stamp(g, m.grid, mx, my);
    // Pips LAST so they always read over a motif corner.
    stamp(g, RANK_GLYPHS[def.rank], 2, 2, 4);
    stamp(g, SUIT_PIPS[def.suit], 2, 8, 4);
    stampRot180(g, RANK_GLYPHS[def.rank], CARD_W - 2 - 3, CARD_H - 2 - 5, 4);
    stampRot180(g, SUIT_PIPS[def.suit], CARD_W - 2 - 5, CARD_H - 2 - 5, 4);
  }
  return g;
}

function paletteFor(def) {
  const m = MOTIFS[def.motif];
  const p = { 1: '#0a0a0e', 2: '#eadfc3', 3: '#c9b78f', ...m.palette };
  if (!def.joker) p[4] = SUIT_COLOUR[SUITS[def.suit].colour];
  return p;
}

// ------------------------------------------------------------------ assets --
// CARD_DECK + CARD_EXPANSION build through the ONE pipeline; CARD_ART holds
// both (cardArt() is the only accessor the wired tracks call). CARD_IDS stays
// the 13 core ids — the core-deck lint (test_card_art.mjs) does not move.
export const CARD_ART = {};
for (const def of [...CARD_DECK, ...CARD_EXPANSION]) {
  const a = makeAsset({
    id: def.id,
    name: def.name,
    desc: def.desc,
    grid: composeCard(def),
    palette: paletteFor(def),
  });
  a.rank = def.rank;
  a.rankClass = RANK_CLASS_OF(def.rank);
  a.tier = RANK_CLASS[a.rankClass];            // COMMON / RARE / MYTHIC / CHASE
  // The tier is DERIVED from the rank class (rank IS the rarity) — a def may
  // declare `tier` to state its intent, and test/test_card_art_expansion.mjs
  // pins the declaration AGAINST this derived value, so a card that declares
  // RARE while carrying a number rank goes red.
  a.suit = def.suit;                            // null on the jokers
  a.family = def.suit ? SUITS[def.suit].family : null;
  a.fullArt = !!def.joker;                      // the two jokers are the only ones
  a.joker = def.joker || null;                  // 'red' | 'black' | null
  a.motif = def.motif;
  CARD_ART[def.id] = a;
}

// The accessor the draft display will call: cardArt(id) -> { grid, palette, ... }.
// Returns null for an unknown id (never a thrown art failure mid-draft).
export function cardArt(id) {
  return CARD_ART[id] || null;
}
