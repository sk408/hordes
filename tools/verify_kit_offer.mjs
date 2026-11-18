// HORDES - tools/verify_kit_offer.mjs (decision 7: weapons come from drafts).
// Real headless Chrome at 1280x720 (mouse clicks) and 390x844 (touch taps):
//   1. the title's LOADOUT card opens the screen; its sub line says what it does;
//   2. the START card changes the start weapon (real click / tap), a row tap
//      benches a weapon and another adds one;
//   3. nothing on the LOADOUT screen scrolls or overlaps;
//   4. PLAY -> START: the run holds VOLLEY + the start weapon only;
//   5. the first level-up draft offers a NEW card from the loadout; it is
//      picked by a real click / tap; it is the run's first, so it is free:
//      the draft is dealt again with no NEW card and a second real click /
//      tap takes a card from it; then the kit and the HUD show the weapon;
//   6. 0 console errors.
// Screenshots (4 per size) go to the shot dir; the paths are printed.
// Run: HORDES_CHROME=... node tools/verify_kit_offer.mjs
import { withPage } from './browser.mjs';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  localStorage.setItem('hordes_hints_off', '1');
  const keys = ['stage1','hud','pilot','focus','stance','move','skills','potions','stats',
    'cog','draft','edge','chest','portal','arch','shrine','intermission','death','settings','loadout'];
  for (const k of keys) localStorage.setItem('hordes_tour_' + k, '1');
} catch (e) {}`;
const T = "(await import('./src/main.js')).__TEST";
// A card by its name line: exact, or a prefix when the match ends in a space.
const cardCenter = (match) => `(() => {
  const m = ${JSON.stringify(match)};
  const nm = (k) => ((k.querySelector && k.querySelector('.name')) ? k.querySelector('.name').textContent : '').trim();
  const el = [...document.getElementById('ov-cards').children]
    .find(k => m.endsWith(' ') ? nm(k).startsWith(m) : nm(k) === m);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;
// Every visible overlay card inside the viewport, no two overlapping, and the
// page itself not scrollable.
const LAYOUT = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const els = [...document.getElementById('ov-cards').children].filter(e => e.offsetParent !== null);
  const boxes = els.map(e => e.getBoundingClientRect());
  const out = boxes.filter(b => b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1).length;
  let overlap = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) overlap++;
  }
  const se = document.scrollingElement;
  const sub = document.getElementById('ov-sub').getBoundingClientRect();
  return { n: els.length, out, overlap, pageScroll: se.scrollHeight > se.clientHeight + 1,
    subInView: sub.top >= -1 && sub.bottom <= vh + 1 };
})()`;

async function arm(size) {
  const mobile = size.w < 700;
  return withPage({ w: size.w, h: size.h, dpr: mobile ? 3 : 1, mobile, skipTour: false, startupScript: STARTUP }, async (p) => {
    const press = (xy) => (mobile ? p.tap(xy[0], xy[1]) : p.click(xy[0], xy[1]));
    const pressCard = async (match) => {
      const xy = await p.evaluate(cardCenter(match));
      if (!xy) throw new Error(size.tag + ': no card ' + match + ' in ' + JSON.stringify(await p.evaluate(`[...document.getElementById('ov-cards').children].map(e => e.textContent.slice(0, 30))`)));
      await press(xy);
      await p.sleep(200);
    };
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => ${T}.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = ${T}.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    // A progressed save: 4 slots (the volley + 3), five weapons owned.
    await p.evaluate(`(async () => { const t = ${T}; const pr = t.getProfile();
      for (const w of ['ORBIT', 'ZAP', 'BEAM']) if (!pr.unlockedWeapons.includes(w)) pr.unlockedWeapons.push(w);
      pr.purchased.slots = 1; pr.loadout = ['ORBIT', 'BEAM', 'BOOMERANG']; t.showTitle(); })()`);
    await p.sleep(300);
    await pressCard('LOADOUT');
    await p.waitFor(`(async () => ${T}.state.mode === 'loadout')()`, 5000);
    const sub = await p.evaluate(`document.getElementById('ov-sub').textContent`);
    const before = await p.evaluate(`(async () => ${T}.getProfile().loadout)()`);
    await pressCard('START: ');
    const afterStart = await p.evaluate(`(async () => ${T}.getProfile().loadout)()`);
    const names = await p.evaluate(`(async () => (await import('./src/weapons.js')).WEAPON_NAMES)()`);
    await pressCard(names.BOOMERANG);          // bench it
    await pressCard(names.ZAP);                // add it
    const afterRows = await p.evaluate(`(async () => ${T}.getProfile().loadout)()`);
    const startCard = await p.evaluate(`[...document.getElementById('ov-cards').children].map(e => e.textContent).find(t => t.startsWith('START: ')) || ''`);
    const layout = await p.evaluate(LAYOUT);
    const shotLoadout = await p.shot('kit-loadout-' + size.tag);
    // To the run: BACK, PLAY, START.
    await p.sleep(400);
    const backXY = await p.evaluate(cardCenter('BACK'));
    await pressCard('BACK');
    await p.sleep(300);
    if ((await p.evaluate(`(async () => ${T}.state.mode)()`)) !== 'title') {
      throw new Error(size.tag + ': BACK at ' + JSON.stringify(backXY) + ' did not leave; layout ' + JSON.stringify(layout) +
        ' vp ' + JSON.stringify(await p.evaluate('[innerWidth, innerHeight]')) + ' rects ' +
        JSON.stringify(await p.evaluate(`[document.getElementById('ov-title'), document.getElementById('ov-sub'), document.getElementById('ov-cards'), ...document.getElementById('ov-cards').children].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.top), Math.round(r.width), Math.round(r.height), getComputedStyle(e).overflowY]; })`)));
    }
    await p.waitFor(`(async () => ${T}.state.mode === 'title')()`, 5000);
    await pressCard('PLAY');
    await p.waitFor(`(async () => ${T}.state.mode === 'setup')()`, 5000);
    const summary = await p.evaluate(`[...document.getElementById('ov-cards').children].map(e => e.textContent).find(t => t.startsWith('LOADOUT')) || ''`);
    await pressCard('START');
    await p.waitFor(`(async () => { const s = ${T}.state; return s.mode === 'playing' && s.time > 1.5; })()`, 15000, 100);
    const kit0 = await p.evaluate(`(async () => ${T}.state.weapons.map(w => w.type))()`);
    // A level-up draft (the run's first, which always holds a NEW card).
    await p.evaluate(`(async () => { const t = ${T}; t.state.pendingDrafts = 1; t.openDraft(); })()`);
    await p.waitFor(`(async () => ${T}.state.mode === 'draft')()`, 5000);
    await p.sleep(400);
    const offers = await p.evaluate(`[...document.getElementById('ov-cards').children].map(e => e._draftOffer ? e._draftOffer.id : null).filter(Boolean)`);
    const draftLayout = await p.evaluate(LAYOUT);
    const shotDraft = await p.shot('kit-draft-' + size.tag);
    const nw = offers.find(id => id.startsWith('wpn_'));
    const xy = nw && await p.evaluate(`(() => { const el = [...document.getElementById('ov-cards').children].find(e => e._draftOffer && e._draftOffer.id === ${JSON.stringify(nw)});
      const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
    if (xy) await press(xy);
    // The run's first NEW weapon is free: the draft is dealt again without
    // NEW cards, and a second real click / tap takes the level-up card.
    await p.waitFor(`(async () => ${T}.state.kitRedeal === true && ${T}.state.mode === 'draft')()`, 5000);
    await p.sleep(400);
    const redeal = await p.evaluate(`({ ids: [...document.getElementById('ov-cards').children].map(e => e._draftOffer ? e._draftOffer.id : null).filter(Boolean),
      sub: document.getElementById('ov-sub').textContent })`);
    const redealLayout = await p.evaluate(LAYOUT);
    const shotRedeal = await p.shot('kit-redeal-' + size.tag);
    const xy2 = await p.evaluate(`(() => { const el = [...document.getElementById('ov-cards').children].find(e => e._draftOffer);
      const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
    await press(xy2);
    await p.waitFor(`(async () => ${T}.state.mode === 'playing')()`, 5000);
    await p.sleep(1500);
    const kit1 = await p.evaluate(`(async () => ${T}.state.weapons.map(w => w.type + ':' + w.level))()`);
    const hud = await p.evaluate(`(async () => ${T}.state.weapons.length)()`);
    const shotHud = await p.shot('kit-hud-' + size.tag);
    return { sub, before, afterStart, afterRows, startCard, layout, summary, kit0, offers, draftLayout, nw, kit1, hud, redeal, redealLayout,
      shots: [shotLoadout, shotDraft, shotRedeal, shotHud], errors: p.errors };
  });
}

for (const size of [{ w: 1280, h: 720, tag: '1280x720' }, { w: 390, h: 844, tag: '390x844' }]) {
  const o = await arm(size);
  const t = size.tag + ': ';
  check(t + 'the LOADOUT screen says these are the weapons a run can offer, and you start with one',
    /Weapons your run can offer/.test(o.sub) && /start with one/.test(o.sub) && /the first one is a free pick/.test(o.sub), o.sub);
  check(t + 'the START card (real ' + (size.w < 700 ? 'tap' : 'click') + ') moves the start to the next weapon',
    JSON.stringify(o.before) === '["ORBIT","BEAM","BOOMERANG"]' && JSON.stringify(o.afterStart) === '["BEAM","BOOMERANG","ORBIT"]', [o.before, o.afterStart]);
  check(t + 'row taps bench Boomerang and add Chain Zap; the start weapon stays first',
    JSON.stringify(o.afterRows) === '["BEAM","ORBIT","ZAP"]', o.afterRows);
  check(t + 'the START card names the start weapon', /^START: Beam/.test(o.startCard), o.startCard);
  check(t + 'LOADOUT screen: every card in view, none overlap, the page does not scroll',
    o.layout.out === 0 && o.layout.overlap === 0 && !o.layout.pageScroll && o.layout.subInView, o.layout);
  check(t + 'the pre-run LOADOUT card names the start weapon and the draft weapons',
    /Start: Volley \+ Beam\. In drafts: Orbit Blade, Chain Zap/.test(o.summary), o.summary);
  check(t + 'the run starts with VOLLEY + the start weapon only', JSON.stringify(o.kit0) === '["VOLLEY","BEAM"]', o.kit0);
  check(t + 'the first draft offers a NEW card from the loadout', !!o.nw && ['wpn_ORBIT', 'wpn_ZAP'].includes(o.nw), o.offers);
  check(t + 'draft: every card in view, none overlap, the page does not scroll',
    o.draftLayout.out === 0 && o.draftLayout.overlap === 0 && !o.draftLayout.pageScroll, o.draftLayout);
  check(t + 'the free NEW card deals the draft again: no NEW card, and the line says it was free',
    o.redeal.ids.length >= 3 && !o.redeal.ids.some(id => id.startsWith('wpn_')) && /the NEW weapon was free/.test(o.redeal.sub), o.redeal);
  check(t + 'deal again: every card in view, none overlap, the page does not scroll',
    o.redealLayout.out === 0 && o.redealLayout.overlap === 0 && !o.redealLayout.pageScroll, o.redealLayout);
  check(t + 'after the two picks the kit holds the new weapon', o.nw && o.kit1.some(k => k.startsWith(o.nw.slice(4) + ':')), o.kit1);
  check(t + '0 console errors', o.errors.length === 0, o.errors);
  console.log('shots: ' + o.shots.join(' '));
}
const bad = results.filter(r => !r.ok).length;
console.log(bad ? 'VERIFY KIT OFFER: ' + bad + ' FAILED' : 'VERIFY KIT OFFER: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad ? 1 : 0);
