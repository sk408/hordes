// HOW TO PLAY restructure — variant model builder (task msg_01M2SWS5FARJQN49V6T9JRPKJC).
// MODELS ONLY: nothing in the game changes. This script extracts the game's
// REAL stylesheet verbatim from index.html (<style> block) and emits two
// standalone variant pages that reuse the game's own card CSS (same .card.ref
// / .rr / .rl / .rv / .subhead / .gotit classes and #overlay.howto rules), so
// what the owner opens on his phone is rendered by the game's own look.
// Run: node docs/art/howtoplay-2026-09-18/build.mjs   (from repo root)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];

// ---- THE REAL MANUAL COPY (verbatim from src/main.js manualGoto + refs) ----
// The LIVE page-2 values read state at open time; the static model carries a
// sample row marked as such.
const LEAD = 'SURVIVE THE WAVES. your pilot auto-fights — you steer the BUILD: draft weapons, bank gold, outlast the finale.';
const row = (l, r, wrap) => `<div class="rr"><div class="rl">${l}</div>` + (r ? `<div class="rv${wrap ? ' wrap' : ''}">${r}</div>` : '') + '</div>';
const sub = (t) => `<div class="subhead">${t}</div>`;

const S_RUN = {
  id: 'run', title: 'HOW A RUN WORKS',
  body: row('every wave: 120s of horde (a mid-boss rings you at half-time), then the wave BOSS spawns — slay it and the PORTAL opens; walk in.')
    + sub('INTERMISSION (between waves)')
    + row('paid chests (40/25/10% nothing), blessings, RAISE THE STAKES (+1 heat = +30% run gold per push, capped) · evolve tokens turn weapons maxed at Lv 8 into something new.')
    + sub('THE FIELD, MID-WAVE')
    + row('DRAFT / upgrade picks on level-up · SHRINE altars sell blessings for run gold · ARCH gates grant a timed buff · CHEST boxes gamble items (walk in, take the roll).')
    + sub('CHALLENGE (title-screen card)')
    + row('rule-constrained runs (ONE WEAPON / NO POTIONS); the HUD names the live mode.')
    + sub('TWO ENDINGS')
    + row('DEATH — the horde claims all, gold banked — or VICTORY: outlast all five waves and slay THE MAW OF THE HORDE.'),
};
const S_OPT = {
  id: 'opt', title: 'OPTIONS AND MODES',
  body: row('the pilot plays · MANUAL: the stick / keys are yours', 'PILOT (O)')
    + row('volley target: NEAREST / TOUGHEST / SWARM / RANGED', 'FOCUS (TAB)')
    + row('risk dial: SAFE / BALANCED / GREEDY', 'STANCE (G)')
    + row('yours right now', 'AUTO · NEAREST · BALANCED', true)
    + '<div class="rl">every lever is on the touch pads too — and in help mode (?), a tap on any control explains it.</div>',
};
const S_CTL = {
  id: 'ctl', title: 'YOUR CONTROLS',
  body: sub('TOUCH CONTROLS')
    + row('move (manual pilot)', 'joystick')
    + row('volley target: NEAREST / TOUGHEST / SWARM / RANGED', 'FOCUS')
    + row('risk dial: SAFE / BALANCED / GREEDY', 'STANCE')
    + row('auto &harr; manual', 'PILOT')
    + row('your build &amp; gear', 'STATS')
    + row('skills', 'FROST / OVER')
    + row('magnet sweep: every drop flies to you (the Magnet Collector card\u2019s skill, 30s cooldown)', 'MAG')
    + row('health potion — restores a carried charge: +35 HP', 'H')
    + row('mana potion — restores a carried charge: +40 MP', 'N')
    + row('help mode: tap any control or object to learn it', 'HELP')
    + row('edge blips mark enemies off-screen', 'RADAR')
    + row('the world map (fight keeps running)', 'MAP')
    + row('settings: zoom, END RUN', 'SETTINGS (cog)')
    + sub('THE ESCAPE (manual)')
    + row('hold to run · LIFT to brake (that is how you time the boss arms)', '\u25C0 / \u25B6')
    + row('leap the gaps (same jump as the auto pilot)', 'JUMP')
    + row('the short speed burst', 'DASH')
    + row('stomp the pursuit pack off your tail (cooldown)', 'KICK')
    + row('switch pilot &harr; manual mid-escape (same O setting)', 'MODE')
    + row('keys work too: A/D move · SPACE jump · X dash · S kick · O mode', 'KEYS')
    + sub('KEYBOARD CONTROLS')
    + row('drink a health potion to heal', 'H')
    + row('drink a mana potion to refuel skills', 'N')
    + row('cast your class skill (mana + cooldown)', 'Q')
    + row('overdrive every weapon for a burst (mana + cooldown)', 'E')
    + row('sweep every ground drop to you (the Magnet Collector card skill, 30s cooldown)', 'X')
    + row('choose what the auto-attack targets', 'TAB')
    + row('tune the run: SAFE keeps clear, GREEDY banks loot faster', 'G')
    + row('switch pilot movement AUTO / MANUAL', 'O')
    + row('edge blips mark enemies outside the screen', 'R')
    + row('open the world map (the fight keeps running)', 'M')
    + row('help mode: tap any control or object to learn it', '?')
    + row('move', 'arrows / WASD')
    + row('I — field report (the ONE stats key) · 1 – 3 — draft cards (1 – 4 in evolve / intermission) · 1 – 6 — stat tabs')
    + row('C — continue · R / T — retry / title')
    + row('+ / - — zoom · mouse — the cog (top-right) opens settings')
    + row('ESC or P — pause in a run · ESC — close menus'),
};
const S_FLD = {
  id: 'fld', title: 'THE FIELD',
  body: row('chests — walk in: item, upgrades… or nothing + a mini-horde')
    + row('portal — walk through to bank the wave')
    + row('arches — cross the gate for a timed buff')
    + row('shrines — walk close, gold buys a blessing')
    + sub('POTIONS — carried charges, not skills')
    + row('enemies drop them (5.0% per kill; rarer in dense swarms) — picked up automatically in pickup range, LEFT ON THE GROUND at your cap (3 of each).')
    + row('a run starts with 1 of each; Travel Pack (shop) adds more.')
    + row('HEALTH potion: +35 HP · MANA potion: +40 MP · never spent at full.')
    + row('AUTO pilot drinks for you: HP under a potion\u2019s heal, MP under 35% of max.')
    + row('boss curse: while the wave boss lives, health potions heal HALF.')
    + sub('THE LIE OF THE LAND — the hollow reads as a map')
    + row('the OLD STUMP marks the arena heart — your flat spawn clearing; twin GATE stones mark each compass wall.')
    + row('the ground rises toward the rim: climbing costs a little speed (foes pay it too), high ground widens your radar reach.'),
};
const SECTIONS = [S_RUN, S_OPT, S_CTL, S_FLD];

const lead = `<div class="doc-lead">${LEAD}</div>`;
const replayRow = `<div class="replay-line" id="replay-tour">MISSED THE GUIDED TOUR? <span>REPLAY TOUR</span> runs it again — a quiet inline row, not a button card.</div>`;
const gotIt = `<div class="card gotit"><div class="t">GOT IT</div><div class="sub">back to the title</div></div>`;

function page(name, extraCss, body, note) {
  return `<!DOCTYPE html>
<!-- HOW TO PLAY RESTRUCTURE — ${name}. A MODEL, not game code (task
     msg_01M2SWS5FARJQN49V6T9JRPKJC). The <style> below is the game's REAL
     stylesheet, extracted verbatim from index.html by build.mjs; the variant
     layout rules come after the GAME-VARIANT CSS banner. ${note} -->
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>HOW TO PLAY — ${name}</title>
<style>${style}</style>
<style>/* -------- GAME-VARIANT CSS (this model only) -------- */
#overlay { display: flex; }
${extraCss}
</style></head>
<body>
<div id="overlay" class="howto">
  <div class="cards">
    <div id="ov-title">HOW TO PLAY</div>
    <div class="sub" id="ov-sub">${LEAD}</div>
${body}
  </div>
</div>
</body></html>`;
}

// ---- VARIANT A: ONE DOCUMENT + TABLE OF CONTENTS ----------------------------
// Mobile: one scrolling column, a compact text jump-list (not cards).
// Desktop (>=900px): TOC sidebar + a content pane that fills the rest.
const tocLinks = SECTIONS.map(s => `<a href="#${s.id}">${s.title}</a>`).join('<i>·</i>');
const aBody = `
    <nav class="jump">${tocLinks}</nav>
    <div class="a-wrap">
      <aside class="a-toc">
        <div class="subhead">CONTENTS</div>
        ${SECTIONS.map(s => `<a href="#${s.id}" class="a-link">${s.title}</a>`).join('')}
        <div class="a-toc-foot">${replayRow}</div>
      </aside>
      <main class="a-pane">
        ${SECTIONS.map(s => `<section class="card ref" id="${s.id}"><div class="t">${s.title}</div><div class="desc">${s.body}</div></section>`).join('\n        ')}
        ${gotIt}
      </main>
    </div>`;
const aCss = `
#overlay.howto .cards { width: 100%; max-width: none; padding: 10px; }
.jump { display: none; }
.doc-lead { display: none; }
.a-wrap { display: block; width: 100%; }
.a-toc { display: none; }
.a-pane { width: 100%; max-width: 680px; margin: 0 auto; }
.a-pane .card.ref { width: 100%; max-width: none; margin-bottom: 10px; }
.a-pane .card.ref .desc { max-height: none; overflow: visible; font-size: 15px; }
.replay-line { font-size: 13px; color: #8888a8; padding: 8px 2px; border-top: 1px solid #4a4a5e; }
.replay-line span { color: #ffd75e; }
#ov-title { font-size: 22px; letter-spacing: 3px; margin: 4px 0 2px; }
#ov-sub { font-size: 13px; line-height: 1.5; margin-bottom: 8px; }
@media (max-width: 899px) {
  .jump { display: block; font-size: 12px; letter-spacing: 1px; color: #8888a8;
    padding: 6px 0 10px; border-bottom: 1px solid #4a4a5e; margin-bottom: 10px; }
  .jump a { color: #ffd75e; text-decoration: none; }
  .jump i { font-style: normal; color: #4a4a5e; padding: 0 6px; }
}
@media (min-width: 900px) {
  #overlay.howto .cards { max-width: 1200px; margin: 0 auto; height: 100vh; }
  .a-wrap { display: grid; grid-template-columns: 220px 1fr; gap: 24px; height: calc(100vh - 90px); }
  .a-toc { display: flex; flex-direction: column; border-right: 1px solid #4a4a5e; padding-right: 16px; }
  .a-link { display: block; color: #8888a8; text-decoration: none; font-size: 14px;
    letter-spacing: 1px; padding: 8px 0; }
  .a-link:hover { color: #ffd75e; }
  .a-toc-foot { margin-top: auto; }
  .a-toc-foot .replay-line { border-top: none; border-bottom: 1px solid #4a4a5e; }
  .a-pane { max-width: none; overflow-y: auto; overscroll-behavior: contain; padding-right: 8px; }
}`;

// ---- VARIANT B: ACCORDION SECTION LIST ---------------------------------------
// Every section is a closed header card; one tap opens exactly one section
// (the others fold). Desktop (>=900px): the four headers sit as a 2x2 grid of
// tabs above one wide pane — a reference-sheet stance, not A re-coloured.
const bBody = `
    <div class="b-grid">
      ${SECTIONS.map((s, i) => `
      <button class="b-tab${i === 0 ? ' open' : ''}" data-i="${i}">${s.title}</button>`).join('')}
    </div>
    ${SECTIONS.map((s, i) => `
    <section class="card ref b-sec${i === 0 ? ' open' : ''}" data-i="${i}">
      <div class="t">${s.title}</div>
      <div class="desc">${s.body}</div>
    </section>`).join('')}
    ${replayRow}
    ${gotIt}`;
const bCss = `
#overlay.howto .cards { width: 100%; max-width: none; padding: 10px; }
#ov-title { font-size: 22px; letter-spacing: 3px; margin: 4px 0 2px; }
#ov-sub { font-size: 13px; line-height: 1.5; margin-bottom: 10px; }
.b-grid { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.b-tab { background: #26263a; color: #8888a8; border: 1px solid #4a4a5e;
  font: 700 13px/1.4 inherit; font-family: inherit; letter-spacing: 1px;
  padding: 10px 12px; min-height: 44px; cursor: pointer; }
.b-tab.open { color: #ffd75e; border-color: #ffd75e; }
.b-sec { display: none; width: 100%; max-width: none; }
.b-sec.open { display: block; }
.b-sec .desc { max-height: none; overflow: visible; }
.replay-line { font-size: 13px; color: #8888a8; padding: 8px 2px; border-top: 1px solid #4a4a5e; margin-top: 4px; }
.replay-line span { color: #ffd75e; }
@media (min-width: 900px) {
  #overlay.howto .cards { max-width: 1100px; margin: 0 auto; }
  .b-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .b-tab { font-size: 15px; padding: 14px; }
  .b-sec.open .desc { columns: 2; column-gap: 28px; font-size: 15px; }
}`;

writeFileSync(path.join(HERE, 'variant-a-toc.html'),
  page('VARIANT A — one document + table of contents', aCss, aBody,
       'Reuses .card.ref/.rr/.rl/.rv/.subhead/.gotit and the #overlay.howto rules from index.html verbatim.'));
writeFileSync(path.join(HERE, 'variant-b-accordion.html'),
  page('VARIANT B — accordion section list (2x2 tab grid on desktop)', bCss, bBody,
       'Reuses the same card CSS; sections fold to one-open, desktop opens a two-column reference sheet.'));
console.log('wrote variant-a-toc.html, variant-b-accordion.html');
