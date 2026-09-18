// HORDES — THE CANONICAL CONTROL LIST (per-control introductions, owner
// 2026-09-16: "It's the per button cards. We don't have to have cards,
// really, but at least something that shows people how to use them.")
//
// ONE SOURCE OF TRUTH for what each control IS and DOES: the reference
// screens (HOW TO PLAY / the in-run reference) and the prologue's staged
// tooltips (main.js prologueTipText) both build their lines FROM these rows
// — never a forked string. Each row carries the keyboard trigger(s), the
// TOUCH control name (a phone player is never told to press a key they do
// not have), and a one-line purpose. NO EMOJIS (owner rule).
//
// 2026-09-18: the in-run hint strip (the layer that used to fire these lines
// mid-run) is RETIRED — a tutorial belongs before gameplay, and these rows
// now teach from the manual + the prologue only.
export const CONTROLS = [
  { id: 'potion-hp', keys: ['H'], touch: 'HP',
    purpose: 'drink a health potion to heal' },
  { id: 'potion-mp', keys: ['N'], touch: 'MP',
    purpose: 'drink a mana potion to refuel skills' },
  { id: 'skill-q', keys: ['Q'], touch: 'SKILL',
    // the LIVE key and touch name are class-dependent and are supplied by
    // main.js as overrides (C.SKILLS[classSkillId].KEY / .NAME)
    purpose: 'cast your class skill (mana + cooldown)' },
  { id: 'skill-w', keys: ['E'], touch: 'OVER',
    purpose: 'overdrive every weapon for a burst (mana + cooldown)' },
  // RSS8 MAGNET COLLECTOR: a CARD-granted skill, so unlike the rows above it
  // exists only in runs that drafted the mythic — the touch button is hidden
  // without the card and the key is a no-op without it. Stated in the purpose
  // so the reference never promises a control a run does not hold.
  { id: 'skill-magnet', keys: ['X'], touch: 'MAG',
    purpose: 'sweep every ground drop to you (the Magnet Collector card skill, 30s cooldown)' },
  { id: 'focus', keys: ['TAB'], touch: 'FOCUS',
    purpose: 'choose what the auto-attack targets' },
  { id: 'stance', keys: ['G'], touch: 'STANCE',
    purpose: 'tune the run: SAFE keeps clear, GREEDY banks loot faster' },
  { id: 'pilot', keys: ['O'], touch: 'PILOT',
    purpose: 'switch pilot movement AUTO / MANUAL' },
  { id: 'radar', keys: ['R'], touch: 'RADAR',
    purpose: 'edge blips mark enemies outside the screen' },
  { id: 'map', keys: ['M'], touch: 'MAP',
    purpose: 'open the world map (the fight keeps running)' },
  { id: 'stats', keys: ['I'], touch: 'STATS',
    purpose: 'open the field report for this run' },
  // '?' SUPPLEMENT (2026-09-16) -> HELP MODE (same day, retirement brief):
  // the "?" IS a control — same glyph, same meaning on both input paths,
  // and it now arms the tap-to-learn inspect mode. The reference screen's
  // KEYBOARD card carries this same wording; this row is the source.
  { id: 'help', keys: ['?'], touch: '?',
    purpose: 'help mode: tap any control or object to learn it' },
];

export function controlById(id) {
  return CONTROLS.find(c => c.id === id) || null;
}

// The one-line introduction for a control, built FROM its row (no forked
// strings): "HOW: purpose", where HOW names the TOUCH control on a touch
// path and the key(s) otherwise. `overrides` lets a caller supply the LIVE
// key / touch name for class-dependent slots (the skill buttons).
export function introLine(id, touchPath = false, overrides = {}) {
  const row = controlById(id);
  if (!row) return null;
  const live = { ...row, ...overrides };
  const how = touchPath
    ? live.touch
    : (Array.isArray(live.keys) ? live.keys.join(' / ') : String(live.keys));
  return String(how).toUpperCase() + ': ' + live.purpose;
}
