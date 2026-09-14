// HORDES — VERIFY the skill-button KEY LETTERS at phone size (390x844 CSS,
// dpr 3, coarse pointer) in a REAL headless Chrome, by measurement.
//
// WHY THIS EXISTS: the playtest ask was "put a [Q] and [E] by the timer", and
// the obvious slot — the badge under the label — is already the LIVE cooldown
// readout (RDY / LOW / 8.0s, written by updateTouchHud). There is no vision
// model on this host, so "it looks fine" is not evidence. This probe measures
// the real laid-out DOM instead:
//   1. each skill button carries its key span AND its badge (id intact);
//   2. the badge still prints the live readout and a real tap on the button
//      still drives it to a countdown (the key did not take the badge's job);
//   3. key and badge boxes do NOT overlap (no collision at phone size);
//   4. the key clears the 10px legibility floor;
//   5. both pads keep the IDENTICAL width the index.html layout math assumes
//      (the key must not widen the right pad and push the joystick off-centre).
//
// Usage: node tools/verify_skill_keys.mjs [--json]
import { withPage } from './browser.mjs';

const JSON_OUT = process.argv.includes('--json');

const PAGE = `(async () => {
  const main = await import('/src/main.js');
  const T = main.__TEST;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  T.startRun();
  for (let i = 0; i < 4; i++) await frame();   // chrome on, badges written

  const px = (v) => Math.round(v * 100) / 100;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: px(r.left), y: px(r.top), w: px(r.width), h: px(r.height), r: px(r.right), b: px(r.bottom) }; };
  const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) *
                           Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));

  const out = { viewport: [innerWidth, innerHeight], coarse: matchMedia('(pointer: coarse)').matches, buttons: [], pads: {} };

  const padBox = (sel) => box(document.querySelector(sel));
  const btnWidths = (sel) => Array.from(document.querySelectorAll(sel + ' button'))
    .map((b) => ({ act: b.dataset.act, w: px(b.getBoundingClientRect().width) }));
  out.pads.left = padBox('.pad.left');
  out.pads.right = padBox('.pad.right');
  out.boxSizing = getComputedStyle(document.querySelector('.pad.left button')).boxSizing;
  out.leftButtons = btnWidths('.pad.left');
  out.rightButtons = btnWidths('.pad.right');
  // THE PRE-CHANGE BASELINE: the live layout is the same page with the new key
  // spans hidden (display:none removes them from layout entirely), so this pair
  // isolates exactly what the letters cost.
  const hide = () => document.querySelectorAll('#touch .key').forEach((e) => { e.style.display = 'none'; });
  const show = () => document.querySelectorAll('#touch .key').forEach((e) => { e.style.display = ''; });
  hide();
  void document.body.offsetWidth;
  out.before = { padLeft: padBox('.pad.left').w, padRight: padBox('.pad.right').w,
    leftButtons: btnWidths('.pad.left'), rightButtons: btnWidths('.pad.right') };
  show();
  void document.body.offsetWidth;

  for (const act of ['q', 'w', 'h', 'n']) {
    const btn = document.querySelector('[data-act="' + act + '"]');
    const key = btn.querySelector('.key');
    const badge = btn.querySelector('.badge');
    const rec = {
      act,
      label: btn.childNodes[0] && btn.childNodes[0].nodeType === 3 ? btn.textContent.trim() : '',
      text: btn.textContent,
      btn: box(btn),
      badgeText: badge ? badge.textContent : null,
      badgeId: badge ? badge.id : null,
      badge: badge ? box(badge) : null,
      keyText: key ? key.textContent : null,
      key: key ? box(key) : null,
      keyFontPx: key ? parseFloat(getComputedStyle(key).fontSize) : null,
      keyColor: key ? getComputedStyle(key).color : null,
      keyBeforeLabel: !!(key && btn.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_CONTAINED_BY),
      overlapPx: (key && badge) ? px(overlap(box(key), box(badge))) : null,
    };
    out.buttons.push(rec);
  }

  // THE LAYOUT QUESTION: does the key span widen the skill buttons? Measured
  // directly — the same button, with the key spans shown and then hidden.
  // (index.html's pad math assumes the 68px min-width content box governs; a
  // wider right pad would push the centred joystick off-centre.)
  const qBtn = document.querySelector('[data-act="q"]');
  const wShown = box(qBtn).w, hShown = box(qBtn).h;
  document.querySelectorAll('#touch .key').forEach((e) => { e.style.display = 'none'; });
  void qBtn.offsetWidth;                      // force reflow
  const wHidden = box(qBtn).w, hHidden = box(qBtn).h;
  document.querySelectorAll('#touch .key').forEach((e) => { e.style.display = ''; });
  void qBtn.offsetWidth;
  const beforeRight = out.before.padRight;
  out.keyLayout = { wShown, wHidden, hShown, hHidden,
    rightPadShown: out.pads.right.w, rightPadHidden: beforeRight,
    buttonsUnchanged: wShown === wHidden && hShown === hHidden };

  // The badge MUST still be the live readout: bank the ult's charge, tap the
  // Q button, and read what the badge prints one frame later.
  // RETARGET (N1 slice 3): the default run's Q is the Knight's EARTHSHATTER —
  // kill-charged, NON-mana — so the fixture banks the charge through the
  // PUBLISHED kills field (a mana top-up does nothing for an ult) and the
  // countdown lands on the ult's own cooldown slot. The tap-driven countdown
  // contract itself is unchanged.
  const p = T.state.player;
  p.kills = 40;   // C.SKILLS.EARTHSHATTER.KILLS
  const qr = box(qBtn);
  const cx = qr.x + qr.w / 2, cy = qr.y + qr.h / 2;
  qBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: cx, clientY: cy, pointerType: 'touch' }));
  qBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: cx, clientY: cy, pointerType: 'touch' }));
  await frame(); await frame();
  out.afterTap = {
    cd: T.state.player.skillCd.EARTHSHATTER || 0,
    badgeText: document.querySelector('#tc-q').textContent,
    keyText: document.querySelector('[data-act="q"] .key').textContent,
    overBadgeText: document.querySelector('#tc-w').textContent,
  };

  // ...and a press whose TARGET is the new key SPAN must still route (the touch
  // layer resolves by closest('[data-act]'), so a child span must not swallow
  // the action). The joystick's own routing check proved the base pattern.
  const keySpan = document.querySelector('[data-act="w"] .key');
  const p2 = T.state.player;
  p2.mana = p2.stats.maxMana;
  p2.skillCd.OVERCHARGE = 0;
  keySpan.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, pointerType: 'touch' }));
  await frame(); await frame();
  out.tapOnKeySpan = {
    overchargeCd: T.state.player.skillCd.OVERCHARGE,
    overchargeBuff: T.state.player.buffs.overcharge,
  };

  // The potion badges must still track their own live counts.
  T.state.player.potions.mp = 2;
  T.state.player.potions.hp = 3;
  await frame(); await frame();
  out.potionBadges = {
    hp: document.querySelector('#tc-h').textContent,
    mp: document.querySelector('#tc-n').textContent,
    liveHp: String(T.state.player.potions.hp),
    liveMp: String(T.state.player.potions.mp),
  };
  return out;
})()`;

const r = await withPage({ w: 390, h: 844, dpr: 3, mobile: true }, async (page) => {
  const data = await page.evaluate(PAGE, true);
  return { data, errors: page.errors.slice() };
});

const d = r.data;
const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

console.log('HORDES skill-key letters — real Chrome, ' + d.viewport[0] + 'x' + d.viewport[1] +
  ', coarse pointer=' + d.coarse + ', button box-sizing=' + d.boxSizing);
console.log('BEFORE (key spans hidden, i.e. the shipped layout): padL=' + d.before.padLeft +
  ' padR=' + d.before.padRight +
  '  left=' + JSON.stringify(d.before.leftButtons) +
  '  right=' + JSON.stringify(d.before.rightButtons));
console.log('AFTER  (key spans live):                              padL=' + d.pads.left.w +
  ' padR=' + d.pads.right.w +
  '  left=' + JSON.stringify(d.leftButtons) +
  '  right=' + JSON.stringify(d.rightButtons));

for (const b of d.buttons) {
  const line = 'act ' + b.act + '  btn ' + b.btn.w + 'x' + b.btn.h +
    '  key=' + JSON.stringify(b.keyText) + (b.key ? ' ' + b.key.w + 'x' + b.key.h + ' @' + b.keyFontPx + 'px' : ' (none)') +
    '  badge=' + JSON.stringify(b.badgeText) + '#' + b.badgeId +
    (b.overlapPx === null ? '' : '  key/badge overlap=' + b.overlapPx + 'px');
  console.log(line);
}
console.log('key span layout cost: button ' + d.keyLayout.wShown + 'x' + d.keyLayout.hShown +
  ' with the letters, ' + d.keyLayout.wHidden + 'x' + d.keyLayout.hHidden + ' without');

for (const act of ['q', 'w']) {
  const b = d.buttons.find(x => x.act === act);
  const want = act === 'q' ? '[Q]' : '[E]';
  ok(!!b.key, 'button ' + act + ' must carry a .key span');
  ok(b.keyText === want, 'button ' + act + ' key must read ' + want + ' (got ' + b.keyText + ')');
  ok(b.keyFontPx >= 10, 'button ' + act + ' key must be >= 10px (got ' + b.keyFontPx + ')');
  ok(b.badgeId === 'tc-' + act, 'button ' + act + ' must keep its badge id (got ' + b.badgeId + ')');
  // N1b AUTO_CAST retarget: the badge must print the LIVE readout. Before the
  // pilot could cast, that was always an idle state (RDY/LOW). Now the AUTO
  // pilot itself legitimately puts a skill on cooldown mid-run (the spill rule
  // fires the moment the pool is near full), so a countdown like "11.9s" at
  // scan time is the readout doing its job — the tap checks below still prove
  // the badge counts down from a REAL press.
  ok(b.badgeText === 'RDY' || b.badgeText === 'LOW' || /^\d+\.\d+s$/.test(b.badgeText) ||
    /^\d+\/\d+$/.test(b.badgeText),
    'button ' + act + ' badge must still print the live readout (got ' + b.badgeText + ')');
  // N1 slice 3: an ult's readiness readout is the CHARGE pair (e.g. 0/40),
  // accepted above alongside RDY/LOW/countdown.
  ok(b.overlapPx === 0, 'button ' + act + ' key must not collide with the badge (' + b.overlapPx + 'px)');
  ok(b.keyBeforeLabel === true, 'button ' + act + ' key must be inside the button');
  ok(b.key.x >= b.btn.x && b.key.r <= b.btn.r,
    'button ' + act + ' key must sit inside the button box');
}
ok(d.keyLayout.hShown === d.keyLayout.hHidden,
  'the key letter must not change the button HEIGHT (' + d.keyLayout.hShown + ' vs ' + d.keyLayout.hHidden + ')');
// The pads were NEVER equal in the shipped layout (border-box: the left pad is
// 114.09 driven by its own labels, the right pad was 68) — the index.html math's
// BTN_W = 68+24+4 = 96 is a content-box budget. The meaningful invariant is that
// the letters keep the right pad INSIDE that 96px budget, so the layout math the
// repo documents stays an upper bound rather than an underestimate.
ok(d.pads.right.w <= 96,
  'the right pad must stay inside the 96px button budget the pad math assumes (got ' + d.pads.right.w + ')');
// H1 RETARGET (docs/briefs/H1_PAD_REFLOW.md, ACCEPTANCE item 3): this used to
// pin `left === before` — the old CONTENT-DRIVEN left-pad width — and is the
// one assertion H1 legitimately invalidates: a fixed 96px pad is precisely
// the change the owner asked for. The invariant that now matters (and that
// WAVE-17 always wanted) is left === right === the FIXED 96. Lines 195/199
// and the joystick clearance below are untouched and pass on their own.
ok(d.pads.left.w === 96 && d.pads.right.w === 96 && d.pads.left.w === d.pads.right.w,
  'H1: both pads must be the FIXED 96px, left === right (got left=' + d.pads.left.w +
  ' right=' + d.pads.right.w + ')');
ok(d.pads.right.w >= d.before.padRight,
  'the letters may only widen the right pad, never shrink it (was ' + d.before.padRight + ')');
{
  const gap = (W) => (W - 10 - d.pads.right.w) - (W / 2 + 60);   // right pad vs the 120px joystick
  for (const W of [360, 390]) {
    ok(gap(W) > 0, 'the 120px joystick must still clear the right pad at ' + W + 'px (gap=' + gap(W).toFixed(1) + ')');
  }
  console.log('joystick clearance after the change: ' +
    [360, 390].map((W) => W + 'px right-gap=' + gap(W).toFixed(1) + 'px').join('  ') +
    '  (left-pad gap is pre-existing and unchanged: ' +
    [360, 390].map((W) => W + 'px=' + ((W / 2 - 60) - (10 + d.pads.left.w)).toFixed(1) + 'px').join('  ') + ')');
}
console.log('after a real tap on the Q ult (EARTHSHATTER): cooldown=' + d.afterTap.cd.toFixed(2) +
  's  badge=' + JSON.stringify(d.afterTap.badgeText) +
  '  key=' + JSON.stringify(d.afterTap.keyText));
console.log('after a real press ON the [E] span: overcharge cd=' +
  (d.tapOnKeySpan.overchargeCd || 0).toFixed(2) + 's buff=' +
  (d.tapOnKeySpan.overchargeBuff || 0).toFixed(2) + 's');
console.log('potion badges track their own counts: HP ' + JSON.stringify(d.potionBadges.hp) +
  ' (live ' + d.potionBadges.liveHp + ')  MP ' + JSON.stringify(d.potionBadges.mp) +
  ' (live ' + d.potionBadges.liveMp + ')');

ok(/^\d+\.\d+s$/.test(d.afterTap.badgeText),
  'tapping the Q button must put a live countdown in the badge (got ' + d.afterTap.badgeText + ')');
ok(d.afterTap.keyText === '[Q]', 'the key letter is NOT overwritten by the cooldown');
ok(d.tapOnKeySpan.overchargeCd > 0 && d.tapOnKeySpan.overchargeBuff > 0,
  'a press landing on the [E] span must still fire Overcharge (cd=' +
  d.tapOnKeySpan.overchargeCd + ')');
ok(d.potionBadges.hp === d.potionBadges.liveHp && d.potionBadges.mp === d.potionBadges.liveMp,
  'the potion badges must still print the live counts (' + JSON.stringify(d.potionBadges) + ')');

if (r.errors.length) console.log('page errors: ' + JSON.stringify(r.errors));
ok(r.errors.length === 0, 'no page errors');

if (JSON_OUT) console.log(JSON.stringify(d, null, 2));
console.log(fail.length ? 'VERDICT: FAIL — ' + fail.join(' | ') : 'VERDICT: PASS (' + (d.buttons.length * 7 + 4) + ' measurements)');
process.exit(fail.length ? 1 : 0);
