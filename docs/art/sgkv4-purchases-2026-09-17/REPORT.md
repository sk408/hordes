# SGKV4 — PURCHASES ARE OPT-OUT — 2026-09-17

Owner ask (verbatim): "New weapons purchase should already be selected for
load out. Weapons and items should be opt out not opt in".

## 1. Current behaviour (reported before the change)

Three ownership systems, only one of which was opt-IN:

| surface | buy behaviour before |
|---|---|
| CHARACTERS | already one-flow: buy unlocks AND equips (main.js `unlockCharacter` + `equipCharacter` on the same click) |
| WEAPON LOADOUT | **the only opt-in surface**: a buy unlocked the archetype, then the player had to walk to the LOADOUT screen and equip it by hand |
| ELITES / ESCAPE WRIT / ARCADE PASS / stat rows | active on ownership — no equip layer exists to flip |
| in-run weapon REPLACE | exists (draft/seal), but is not a purchase |

Achievement GRANTS (`grantWeapon`) do not route through the new equip either,
deliberately: a grant is not a purchase, and grants fire mid-flow where a
silent loadout edit would be a surprise. Only buys equip.

## 2. The fix — extended the existing path, no second path

`src/meta.js`:

- `equipBoughtWeapon(profile, weaponId)` (new, one function, full disclosure
  comment in-code): the ONE equip seam for purchases. Free slot → appended.
  FULL loadout → the LONGEST-STANDING pick (index 0; adds push) is benched to
  make room, and the return value names it (`{ benched }`) so the CALLER can
  put the displacement on screen. NULL loadout = "no choice" = the default
  kit, whose character starter counts as occupying its slot — the first buy
  rides ALONGSIDE it, so the default kit can never be silently dropped.
- `buyUpgrade`'s `kind: 'weapon'` branch now calls it after `unlockWeapon` —
  NO buy path can skip the equip.
- Shop row copy states the rule itself: "Unlock the X archetype — equipped
  into your LOADOUT on buy."

`src/main.js` (shop screen): after a successful weapon buy the toast is
derived by DIFFING the loadout across the buy — `EQUIPPED Orbit Blade — in
your LOADOUT`, or with a full loadout `EQUIPPED Nova Pulse / BENCHED Orbit
Blade — see LOADOUT`. The displacement is NAMED, never silent.

The bench: ONE TAP on the loadout screen (the existing
`toggleLoadoutWeapon`), and the row now names the action both ways —
`EQUIPPED — tap to BENCH` / `BENCHED — tap to equip` (a full loadout's other
rows read `slots full`). Persistence is the existing save path
(`saveProfile` on buy/toggle; `validateProfile` sanitises on load).

## 3. Tests — through the real seams, failing first

**Node battery** `test/test_sgkv4_purchases.mjs` (13 checks, DOM-shimmed real
loop, the test_g26 pattern; demonstrated RED against the shipped behaviour —
`buying ORBIT equips it ... :: null` — before the fix):

- (e/a) fresh buy through the real shop row click → `["ORBIT"]`, no second
  action, toast names it
- (b) full loadout: third buy still equips; ORBIT (longest-standing) benched;
  toast carries `BENCHED` + the name; the LOADOUT screen reflects both halves
- (c) ONE TAP on the equipped row benches → `["ZAP"]`; re-rendered row says
  `tap to equip`; survives `validateProfile`; the real `startRun()` arms
  `["VOLLEY","ZAP"]`
- (3) WITCH + null loadout buys SCYTHE → `["ZAP","SCYTHE"]` — the kit's
  starter kept, nothing silently dropped
- (d) elite row buy → active on ownership (no opt-in layer exists to flip;
  pinned so one cannot appear silently)
- (6) NO BALANCE CHANGE: ORBIT 200 / ZAP 600000 / NOVA_PULSE 1200000 pinned

**Browser verifier** `tools/verify_sgkv4_purchases.mjs` (390x844 — this is a
FLOW task; the node battery carries layout-blind coverage), entering through
the real UI: CDP-taps the real shop row (scrolled into view — the ladder runs
past the fold), ONE CDP-tap on the real loadout row, a REAL
`location.reload()` round-trip through localStorage, and the next run's kit
read off live run state. 8/8 green, 0 page errors. (The loadout-door coach is
suppressed via its own localStorage flag, same as the node battery — the buys
must not need the coach; unsuppressed its spotlight overlay eats the BACK
tap. Coach flow itself is pinned by test_g26_loadout.)

## 4. Balance

Nothing moved: no price, slot count, damage number or cap changed. The only
new literals are the toast strings and the loadout row labels.
