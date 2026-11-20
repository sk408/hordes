// R5 draft cards in real headless Chrome, at 1280x720 (mouse and keys),
// 844x390 and 390x844 (touch). Each viewport:
//   1. the first draft (NEW cards): the "Pick 1" header, playing cards with
//      ribbon, face, rarity class; the cards, the AUTO-PICK row and the
//      action row on screen, no page scroll;
//   2. a press DURING the deal-in takes the free NEW card: the deal again;
//   3. the detail: the arrow-key cursor opens it (desktop); a real
//      press-and-hold opens it and picks nothing (touch);
//   4. AUTO-PICK ON/OFF and WAIT by real presses; REROLL, BANISH (then a
//      card) and SKIP by real presses;
//   5. a pick by key 2 (desktop) or a tap (touch); a joker offer; a beaten
//      rule's free card; the evolve offer opens with its own look;
//   6. 0 console errors.
// cards2: a flush draft and the longest hand tag inside every card; four
//   offers on screen (rows on an upright phone) and a press on the fourth.
// Run: HORDES_CHROME=... HORDES_SHOT_DIR=... node tools/verify_draft_cards.mjs [1280x720 844x390 390x844]
import { withPage } from './browser.mjs';

const T = "(await import('./src/main.js')).__TEST";
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  localStorage.setItem('hordes_hints_off', '1');
  const keys = ['stage1','hud','pilot','focus','stance','move','skills','potions','stats',
    'cog','draft','edge','chest','portal','arch','shrine','intermission','death','settings','loadout'];
  for (const k of keys) localStorage.setItem('hordes_tour_' + k, '1');
} catch (e) {}`;
const VIEWS = [
  { tag: '1280x720', w: 1280, h: 720, dpr: 1, mobile: false },
  { tag: '844x390', w: 844, h: 390, dpr: 2, mobile: true },
  { tag: '390x844', w: 390, h: 844, dpr: 2, mobile: true },
  // a short upright phone: the rows' height budget (DRAFT_ROWS.CHROME) is
  // tight here, and four offers take the smallest face
  { tag: '375x667', w: 375, h: 667, dpr: 2, mobile: true },
].filter(v => process.argv.length <= 2 || process.argv.slice(2).includes(v.tag));

const FIT = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const inView = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.left >= -1 && b.top >= -1 && b.right <= vw + 1 && b.bottom <= vh + 1; };
  const cards = [...document.getElementById('ov-cards').children];
  const se = document.scrollingElement;
  return { cards: cards.length, cardsIn: cards.every(inView), auto: inView(document.getElementById('draft-autopick')),
    actions: inView(document.getElementById('draft-actions')), pageScroll: se.scrollHeight > se.clientHeight + 1,
    dcard: cards.every(e => /\\bdcard\\b/.test(e.className) && e.querySelector('.face canvas.card-art')),
    ribbons: cards.map(e => (e.querySelector('.ribbon') || {}).textContent),
    // every face line is read in full: none cut by the box it sits in, and
    // none runs out of its card
    fxCut: cards.flatMap(e => [...e.querySelectorAll('.fx')].filter(f => f.scrollHeight > f.clientHeight + 1 || f.scrollWidth > f.clientWidth + 1).map(f => f.textContent)),
    spill: cards.flatMap(e => { const cb = e.getBoundingClientRect(); return [...e.children].filter(c => !/detail|frame/.test(c.className)).filter(c => { const b = c.getBoundingClientRect(); return b.width && (b.bottom > cb.bottom + 1 || b.right > cb.right + 1 || b.left < cb.left - 1); }).map(c => c.className + ':' + c.textContent.slice(0, 24)); }),
    sub: document.getElementById('ov-sub').textContent,
    // the overlay itself must not scroll either (it scrolls inside, not the page)
    ovScroll: (() => { const o = document.getElementById('overlay'); return o.scrollHeight > o.clientHeight + 1; })(),
    rows: /\\brows\\b/.test(document.getElementById('overlay').className),
    // the detail (press-and-hold): opened on each card in turn, none of its
    // text is cut, and on a phone (rows or compact) it stays on the screen
    detailCut: cards.flatMap((e, i) => { e.classList.add('peek'); const d = e.querySelector('.detail'); let bad = null;
      if (d) { const b = d.getBoundingClientRect(); const phone = /\\b(rows|compact)\\b/.test(document.getElementById('overlay').className);
        if (d.scrollHeight > d.clientHeight + 1 || (phone && (b.top < -1 || b.bottom > vh + 1)))
          bad = i + ':' + Math.round(b.top) + '-' + Math.round(b.bottom) + ' sh ' + d.scrollHeight + ' ch ' + d.clientHeight; }
      e.classList.remove('peek'); return bad ? [bad] : []; }) };
})()`;
const READ = (name, f) => [name + ': every face line is whole and inside its card, and the detail is whole',
  !f.fxCut.length && !f.spill.length && !f.detailCut.length, { fxCut: f.fxCut, spill: f.spill, detailCut: f.detailCut }];
// the fullest detail a card can carry: every road line at once
const FULL_DETAIL = `(() => { for (const e of document.getElementById('ov-cards').children) { const d = e.querySelector('.detail'); if (!d) continue;
  d.insertAdjacentHTML('beforeend', '<div class="evo lead">LEAD: +2 LEVELS</div><div class="evo stack">STACKS WITH ITS TWIN</div>' +
    '<div class="evo">evolves with Split Shot at Lv 8</div><div class="evo fuse">fuses with Volley once both are evolved</div>'); } })()`;
const at = (sel) => `(() => { const el = ${sel}; if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; })()`;
const card = (i) => `document.getElementById('ov-cards').children[${i}]`;
const mode = `(async () => ${T}.state.mode)()`;

let failed = 0;
for (const v of VIEWS) {
  const lines = [];
  const ok = (name, cond, detail) => { lines.push((cond ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); if (!cond) failed++; };
  await withPage({ w: v.w, h: v.h, dpr: v.dpr, mobile: v.mobile, skipTour: false, startupScript: STARTUP }, async (p) => {
    const press = async (sel) => {
      const xy = await p.evaluate(at(sel));
      if (!xy) throw new Error(v.tag + ': nothing at ' + sel);
      if (v.mobile) await p.tap(xy[0], xy[1]); else await p.click(xy[0], xy[1]);
    };
    const open = async (extra = '') => {
      await p.evaluate(`(async () => { const t = ${T}; ${extra} t.state.shrineOffer = null; t.state.mode = 'playing'; t.state.pendingDrafts = 1; t.state.draftKind = null; t.openDraft(); })()`);
    };
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => ${T}.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = ${T}.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    await p.evaluate(`(async () => { const t = ${T}; const pr = t.getProfile();
      for (const w of ['ORBIT', 'ZAP', 'BEAM']) if (!pr.unlockedWeapons.includes(w)) pr.unlockedWeapons.push(w);
      pr.purchased.slots = 1; pr.loadout = ['ORBIT', 'BEAM', 'ZAP']; t.jokers.draftWeight = 0; t.startRun(); })()`);
    await p.waitFor(`(async () => { const s = ${T}.state; return s.mode === 'playing' && s.time > 1; })()`, 15000, 100);
    await p.evaluate(`(async () => { const t = ${T}; t.state.draftCharges = { reroll: 2, skip: 1, banish: 1 }; })()`);

    // 1-2. the first draft, pressed during the deal-in
    await open();
    const fit0 = await p.evaluate(FIT);
    const t0 = Date.now();
    await press(`[...document.getElementById('ov-cards').children].find(e => e._draftOffer && e._draftOffer.kitNew)`);
    const pressMs = Date.now() - t0;
    await p.waitFor(`(async () => ${T}.state.kitRedeal === true)()`, 3000).catch(() => {});
    ok('a press ' + pressMs + ' ms after the deal began took the free NEW card: the deal again',
      await p.evaluate(`(async () => ${T}.state.kitRedeal === true && ${T}.state.mode === 'draft')()`));
    await p.sleep(600);
    const fit1 = await p.evaluate(FIT);
    ok(...READ('the first draft (NEW cards)', fit0));
    ok('the deal again: "Pick 1" header and the reason', /Pick 1: /.test(fit1.sub) && /NEW weapon was free/.test(fit1.sub), fit1.sub);
    ok('playing cards on screen, the AUTO-PICK and action rows too, no page or overlay scroll (the reason makes the header two lines on a phone)',
      fit1.dcard && fit1.cardsIn && fit1.auto && fit1.actions && !fit1.pageScroll && !fit1.ovScroll, fit1);
    ok(...READ('the deal again', fit1));
    await p.shot('cards_verify_redeal_' + v.tag);

    // 3. the detail
    if (!v.mobile) {
      await p.key('ArrowRight');
      await p.sleep(150);
      ok('the keyboard cursor opens the detail', await p.evaluate(`getComputedStyle(${card(0)}.querySelector('.detail')).display === 'block'`));
      await p.key('ArrowLeft');
    } else {
      const xy = await p.evaluate(at(card(0)));
      const hold = p.swipe(xy[0], xy[1], 0, 0, 34);          // ~0.6 s still finger
      await p.sleep(480);
      const peek = await p.evaluate(`(() => { const e = ${card(0)}; return [/\\bpeek\\b/.test(e.className), getComputedStyle(e.querySelector('.detail')).display]; })()`);
      await hold;
      await p.sleep(200);
      ok('press-and-hold opens the detail while held', peek[0] && peek[1] === 'block', peek);
      ok('and letting go picks nothing', (await p.evaluate(mode)) === 'draft');
      await p.shot('cards_verify_hold_' + v.tag);
    }

    // 4. AUTO-PICK and WAIT, REROLL, BANISH, SKIP
    const row = () => p.evaluate(`[...document.getElementById('draft-autopick').children].map(e => e.textContent)`);
    const r0 = await row();
    await press(`document.querySelector('#draft-autopick .dap-wait')`);
    await p.sleep(150);
    await press(`document.querySelector('#draft-autopick .dap-on')`);
    await p.sleep(150);
    const r1 = await row();
    await press(`document.querySelector('#draft-autopick .dap-on')`);
    await p.sleep(150);
    const r2 = await row();
    ok('AUTO-PICK countdown, then WAIT 5s and OFF, then ON again by real presses',
      /AUTO-PICK IN/.test(r0[0]) && /WAIT 5s/.test(r1[2]) && /OFF/.test(r1[1]) && /ON/.test(r2[1]), [r0, r1, r2]);
    const ids = () => p.evaluate(`[...document.getElementById('ov-cards').children].map(e => e._draftOffer.id).join(',')`);
    const before = await ids();
    await press(`[...document.querySelectorAll('#draft-actions .dact')].find(e => /REROLL/.test(e.textContent))`);
    await p.sleep(500);
    const ch1 = await p.evaluate(`(async () => ({ ...${T}.state.draftCharges }))()`);
    ok('REROLL: a fresh deal, one charge spent', ch1.reroll === 1 && (await p.evaluate(mode)) === 'draft', { before, after: await ids(), ch1 });
    await press(`[...document.querySelectorAll('#draft-actions .dact')].find(e => /BANISH/.test(e.textContent))`);
    await p.sleep(150);
    const victim = await p.evaluate(`${card(1)}._draftOffer.id`);
    await press(card(1));
    await p.sleep(500);
    const ch2 = await p.evaluate(`(async () => ({ ...${T}.state.draftCharges, banned: [...${T}.state.draftBanned] }))()`);
    ok('BANISH then a card: it is banished and the deal is redrawn', ch2.banish === 0 && ch2.banned.length === 1 && (await p.evaluate(mode)) === 'draft', { victim, ch2 });
    await press(`[...document.querySelectorAll('#draft-actions .dact')].find(e => /SKIP/.test(e.textContent))`);
    await p.sleep(300);
    ok('SKIP: the draft closes', (await p.evaluate(mode)) === 'playing');
    await p.sleep(900);

    // 4b. a press OFF the centre of a card while it flips still picks that
    // card (the card box keeps its size; only its contents turn). Each card
    // is pressed at 25% across, 20 to 130 ms into its own flip. A plain
    // level-up draft (the free NEW card spent) is read in full first.
    await p.evaluate(`(async () => { const t = ${T}; t.state.kitFreeUsed = 99; t.state.spawnTimer = 1e9; t.state.enemies.length = 0;
      t.state.sites = (t.state.sites || []).filter(x => x.kind !== 'shrine'); t.state.shrines = []; t.state.shrine = null; t.state.shrineOffer = null; t.state.player.hp = t.state.player.maxHp = 1e9; })()`);
    await open();
    await p.sleep(500);
    ok(...READ('a plain level-up draft', await p.evaluate(FIT)));
    await p.evaluate(`(async () => { const t = ${T}; t.pickCard(document.getElementById('ov-cards').children[0]._draftOffer); })()`);
    await p.sleep(600);
    const flipLost = [];
    let flipN = 0;
    for (const dt of [20, 55, 90, 130]) {
      for (let i = 0; i < 3; i++) {
        const info = await p.evaluate(`(async () => { const t = ${T}; t.state.weapons.forEach(w => { if (!w.evolutionId) w.level = 1; });
          t.state.shrineOffer = null; t.state.mode = 'playing'; t.state.pendingDrafts = 1; t.state.draftKind = null; window.__picked = [];
          window.__dealAt = performance.now(); t.openDraft();
          const cs = [...document.getElementById('ov-cards').children];
          for (const el of cs) { const o = el.onclick; el.onclick = function (e) { window.__picked.push(el._draftOffer.id); return o && o.call(this, e); }; }
          const e = cs[${i}]; const r = e.getBoundingClientRect();
          return { id: e._draftOffer.id, deal: e.classList.contains('deal'), delay: parseFloat(e.style.getPropertyValue('--deal-delay')) || 0,
            x: Math.round(r.x + r.width * 0.25), y: Math.round(r.y + r.height / 2) }; })()`);
        const lag = await p.evaluate('performance.now() - window.__dealAt');
        const wait = info.delay + dt - lag;
        if (wait > 0) await p.sleep(wait);
        const atMs = Math.round(await p.evaluate('performance.now() - window.__dealAt') - info.delay);
        if (v.mobile) await p.tap(info.x, info.y); else await p.click(info.x, info.y);
        await p.sleep(60);
        const r = await p.evaluate(`(async () => ({ mode: ${T}.state.mode, picked: window.__picked }))()`);
        flipN++;
        if (!info.deal || r.mode === 'draft' || r.picked.length !== 1 || r.picked[0] !== info.id) {
          flipLost.push({ card: i, intoFlipMs: atMs, want: info.id, deal: info.deal, ...r });
          if (r.mode === 'draft') await p.evaluate(`(async () => { const t = ${T}; t.pickCard(document.getElementById('ov-cards').children[0]._draftOffer); })()`);
        }
        await p.sleep(250);
      }
    }
    ok('a ' + (v.mobile ? 'tap' : 'click') + ' at 25% across a card during its flip picks that card (' + flipN + ' presses)', !flipLost.length, flipLost.slice(0, 4));
    await p.sleep(600);

    // 4c. cards2: a hand tag stays inside its card. Three spades held, so one
    // card makes a SPADE FLUSH (a real tag); then every card is given the
    // longest tag the game can make and the spill check runs again.
    const flushAt = await p.evaluate(`(async () => { const t = ${T}; const H = await import('./src/hands.js');
      const pl = t.state.player; pl.handCards = {};
      for (const id of ['lvl_VOLLEY_1', 'wpn_ORBIT', 'wpn_BEAM']) { const c = H.handCardOf(id); if (c) pl.handCards[c.key] = c; }
      let at = -1;
      for (let i = 0; i < 300 && at < 0; i++) {
        t.state.shrineOffer = null; t.state.mode = 'playing'; t.state.pendingDrafts = 1; t.state.draftKind = null; t.openDraft();
        if ([...document.getElementById('ov-cards').children].some(e => /FLUSH/.test(e._draftOffer.handText || ''))) at = i;
      }
      return at; })()`);
    await p.sleep(500);
    const fl = await p.evaluate(FIT);
    const flushTags = await p.evaluate(`[...document.querySelectorAll('#ov-cards .tag')].map(e => e.textContent)`);
    ok('a draft where a card makes a SPADE FLUSH: its tag is shown', flushAt >= 0 && flushTags.some(x => /FLUSH/.test(x)), { flushAt, flushTags });
    ok(...READ('the flush draft', fl));
    await p.shot('cards_verify_flush_' + v.tag);
    const LONGEST = 'makes DIAMOND STRAIGHT FLUSH';
    await p.evaluate(`(() => { for (const e of document.getElementById('ov-cards').children) {
      let g = e.querySelector('.tag'); if (!g) { g = document.createElement('div'); g.className = 'tag hand'; e.insertBefore(g, e.querySelector('.name')); }
      g.textContent = ${JSON.stringify(LONGEST)}; } })()`);
    await p.sleep(100);
    const lt = await p.evaluate(FIT);
    const tagBox = await p.evaluate(`[...document.querySelectorAll('#ov-cards .tag')].map(g => { const b = g.getBoundingClientRect(), c = g.closest('.card').getBoundingClientRect(); return { lines: Math.round(b.height / 14), inside: b.left >= c.left - 1 && b.right <= c.right + 1 }; })`);
    ok('the longest tag ("' + LONGEST + '") stays inside every card', tagBox.every(t => t.inside) && !lt.spill.length, { tagBox, spill: lt.spill });
    await p.shot('cards_verify_longtag_' + v.tag);
    await p.evaluate(`(async () => { const t = ${T}; t.pickCard(document.getElementById('ov-cards').children[0]._draftOffer); })()`);
    await p.sleep(900);
    // 4d. cards2: four offers fit with the header, AUTO-PICK and action rows,
    // no scroll (an upright phone stacks them as rows), and a tap picks.
    await p.evaluate(`(async () => { const t = ${T}; t.state.player.stats.draftOffers = 1; })()`);
    await open();
    await p.sleep(500);
    const four = await p.evaluate(FIT);
    const fourLay = await p.evaluate(`(() => ({ cls: document.getElementById('overlay').className, art: [...document.querySelectorAll('#ov-cards canvas.card-art')].map(c => c.width) }))()`);
    const upright = v.h > v.w;
    ok('four offers: all on screen with the AUTO-PICK and action rows, no page or overlay scroll' + (upright ? ', as rows' : ''),
      four.cards === 4 && four.cardsIn && four.auto && four.actions && !four.pageScroll && !four.ovScroll && !four.fxCut.length && !four.spill.length &&
      (!upright || /\brows\b/.test(fourLay.cls)), { four, fourLay });
    ok(...READ('four offers', four));
    await p.shot('cards_verify_four_' + v.tag);
    // the fullest detail on every card: still whole, still on screen (the
    // smallest rows are 90 px tall at 375x667; the detail grows past its row)
    await p.evaluate(FULL_DETAIL);
    ok(...READ('four offers, each with the fullest detail', await p.evaluate(FIT)));
    if (v.mobile) {
      const xy = await p.evaluate(at(card(1)));
      const hold = p.swipe(xy[0], xy[1], 0, 0, 34);
      await p.sleep(480);
      const held = await p.evaluate(`(() => { const d = ${card(1)}.querySelector('.detail'); const b = d.getBoundingClientRect();
        return { disp: getComputedStyle(d).display, sh: d.scrollHeight, ch: d.clientHeight, top: Math.round(b.top), bottom: Math.round(b.bottom) }; })()`);
      await p.shot('cards_verify_hold4_' + v.tag);
      await hold;
      await p.sleep(200);
      ok('a real press-and-hold on the second of four: the fullest detail opens whole, and letting go picks nothing',
        held.disp === 'block' && held.sh <= held.ch + 1 && held.top >= 0 && held.bottom <= v.h && (await p.evaluate(mode)) === 'draft', held);
    }
    const want4 = await p.evaluate(`${card(3)}._draftOffer.id`);
    await press(card(3));
    await p.sleep(300);
    ok('and a ' + (v.mobile ? 'tap' : 'click') + ' on the fourth takes it (' + want4 + ')', (await p.evaluate(mode)) === 'playing');
    await p.evaluate(`(async () => { const t = ${T}; t.state.player.stats.draftOffers = 0; })()`);
    await p.sleep(900);

    // 5. a pick by key or tap; a joker offer; a rule's free card; the evolve offer
    await open();
    await p.sleep(100);
    const want = await p.evaluate(`${card(1)}._draftOffer.id`);
    if (v.mobile) await press(card(1)); else await p.key('2');
    await p.sleep(300);
    const last = await p.evaluate(`(async () => { const d = ${T}.state.player; return ${T}.state.mode; })()`);
    ok((v.mobile ? 'a tap' : 'key 2') + ' takes the second card (' + want + ')', last === 'playing');
    await p.sleep(900);
    await p.evaluate(`(async () => { const t = ${T}; t.state.shrineOffer = null; t.state.mode = 'playing'; t.jokers.queueOffer(); t.jokers.openOffer(); })()`);
    await p.sleep(500);
    const jk = await p.evaluate(FIT);
    ok('a joker offer: joker cards with the JOKER ribbon, all on screen', jk.ribbons.every(r => r === 'JOKER') && jk.cardsIn &&
      (await p.evaluate(`[...document.getElementById('ov-cards').children].every(e => /r-joker/.test(e.className))`)), jk);
    ok(...READ('the joker offer', jk));
    await p.shot('cards_verify_joker_' + v.tag);
    await press(card(0));
    await p.sleep(900);
    await p.evaluate(`(async () => { const t = ${T}; t.state.shrineOffer = null; t.state.mode = 'playing'; t.state.ruleCards = 1; t.state.pendingDrafts = 1; t.state.draftKind = null; t.openDraft(); })()`);
    await p.sleep(500);
    const title = await p.evaluate(`document.getElementById('ov-title').textContent`);
    const rule = await p.evaluate(FIT);
    ok('a beaten rule\'s free card: FREE CARD, playing cards on screen', title === 'FREE CARD' && rule.dcard && rule.cardsIn, { title, rule });
    ok(...READ('the rule\'s free card', rule));
    await press(card(0));
    await p.sleep(900);
    await p.evaluate(`(async () => { const t = ${T}; const E = (await import('./src/evolutions.js')).EVOLUTION_DEFS;
      const w = t.state.weapons.find(x => x.type === 'VOLLEY'); w.level = 8;
      t.state.player.takenStats = { ...(t.state.player.takenStats || {}), [E.VOLLEY.partner]: 1 }; })()`);
    await p.waitFor(`(async () => ${T}.state.mode === 'evolve')()`, 5000).catch(() => {});
    const evo = await p.evaluate(`(() => { const cs = [...document.getElementById('ov-cards').children];
      return { mode: null, n: cs.length, dcard: cs.some(e => /dcard/.test(e.className)), names: cs.map(e => (e.querySelector('.name') || {}).textContent),
        title: document.getElementById('ov-title').textContent }; })()`);
    evo.mode = await p.evaluate(mode);
    ok('the evolve offer opens with its own cards (not restyled) and NOT NOW', evo.mode === 'evolve' && !evo.dcard && evo.names.includes('NOT NOW'), evo);
    await p.shot('cards_verify_evolve_' + v.tag);
    ok('0 console errors', p.errors.length === 0, p.errors.slice(0, 3));
  });
  console.log('== ' + v.tag + '\n' + lines.join('\n'));
}
console.log(failed ? failed + ' FAILED' : 'all ok');
process.exit(failed ? 1 : 0);
