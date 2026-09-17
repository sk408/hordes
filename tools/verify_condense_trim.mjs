// CONDENSE TRIM MOCK (task VJBFV, 2026-09-17): screenshots the CURRENT title
// + settings screens next to the PROPOSED trimmed versions, at both phone
// sizes. PROPOSE ONLY — nothing in src/ changes; the proposed cards are
// injected into the REAL #ov-cards element so they render with the game's own
// card CSS (the honest "what it would look like"), under an unmistakable
// PROPOSED banner.
// Run: node tools/verify_condense_trim.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/condense-trim-2026-09-17/shots';
mkdirSync(ART, { recursive: true });

// The proposed screens (see CONDENSE_PROPOSAL.md §10 for the item-by-item
// decisions these visualise).
const PROPOSED_TITLE = [
  ['START GAME', 'start a run'],
  ['SHOP', 'upgrades · characters'],
  ['LOADOUT', "pick this run's weapons"],
  ['PROGRESS', 'trophies · bestiary'],
  ['SETUP', 'challenge · stage · night · options'],
  ['HOW TO PLAY', 'the point + every button'],
];
const PROPOSED_SETTINGS_TITLE = [
  ['AUDIO', 'music ON · sfx ON'],
  ['DISPLAY', 'auto · hud text OFF'],
  ['PILOT', 'auto all'],
  ['HOW TO PLAY', 'manual + replay tour'],
  ['SAVE DATA', 'export · import · recovery · reset'],
  ['BACK', ''],
];
const PROPOSED_SETTINGS_RUN = [
  ['AUDIO', 'music ON · sfx ON'],
  ['DISPLAY', 'auto · hud text OFF'],
  ['PILOT', 'auto all'],
  ['HOW TO PLAY', 'manual + replay tour'],
  ['END RUN', 'bank the run and leave'],
  ['BACK', ''],
];

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    const T = `(await import('./src/main.js')).__TEST`;
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(400);

    // ---- CURRENT title.
    let shot = await p.shot('trim-current-title-' + tag);
    copyFileSync(shot, ART + '/current-title-' + tag + '.png');
    const curTitle = await p.evaluate(`document.querySelectorAll('#ov-cards .card').length`);

    // ---- CURRENT settings (the real SETUP -> SETTINGS path).
    const clickCard = (label2) => p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(label2)}));
      if (!el) return false; el.click(); return true; })()`);
    ok(await clickCard('SETUP'), '[' + tag + '] SETUP opened');
    await p.sleep(200);
    ok(await clickCard('SETTINGS'), '[' + tag + '] SETTINGS opened');
    await p.sleep(200);
    const curSettings = await p.evaluate(`document.querySelectorAll('#ov-cards .card').length`);
    shot = await p.shot('trim-current-settings-' + tag);
    copyFileSync(shot, ART + '/current-settings-' + tag + '.png');
    console.log('[' + tag + '] CURRENT: title ' + curTitle + ' cards, settings ' + curSettings + ' cards (photographed)');

    // ---- PROPOSED settings (injected through the real card CSS).
    const inject = (cards, banner) => p.evaluate(`(() => {
      const host = document.getElementById('ov-cards');
      host.innerHTML = '';
      const strip = document.createElement('div');
      strip.style.cssText = 'width:100%;text-align:center;font:700 11px monospace;' +
        'color:#ffd85e;letter-spacing:2px;padding:2px 0 6px;';
      strip.textContent = ${JSON.stringify(banner)};
      host.appendChild(strip);
      for (const [name, desc] of ${JSON.stringify(cards)}) {
        const c = document.createElement('div');
        c.className = 'card';
        c.innerHTML = '<div class="name">' + name + '</div>' +
          (desc ? '<div class="desc">' + desc + '</div>' : '');
        host.appendChild(c);
      }
      return host.querySelectorAll('.card').length; })()`);
    const nPropSettings = await p.inject ? 0 : await p.evaluate(`(() => 0)()`);
    const propSettingsCount = await p.evaluate(`(async () => {
      const host = document.getElementById('ov-cards');
      host.innerHTML = '';
      const strip = document.createElement('div');
      strip.style.cssText = 'width:100%;text-align:center;font:700 11px monospace;color:#ffd85e;letter-spacing:2px;padding:2px 0 6px;';
      strip.textContent = 'PROPOSED — SETTINGS (TRIMMED)';
      host.appendChild(strip);
      for (const [name, desc] of ${JSON.stringify(PROPOSED_SETTINGS_TITLE)}) {
        const c = document.createElement('div');
        c.className = 'card';
        c.innerHTML = '<div class="name">' + name + '</div>' + (desc ? '<div class="desc">' + desc + '</div>' : '');
        host.appendChild(c);
      }
      return host.querySelectorAll('.card').length; })()`);
    await p.sleep(150);
    shot = await p.shot('trim-proposed-settings-' + tag);
    copyFileSync(shot, ART + '/proposed-settings-' + tag + '.png');

    // ---- PROPOSED title (back out to the title DOM first, then replace).
    await p.evaluate(`(async () => { const T2 = ${T}; T2.showTitle(); })()`);
    await p.sleep(200);
    const propTitleCount = await p.evaluate(`(() => {
      const host = document.getElementById('ov-cards');
      host.innerHTML = '';
      const strip = document.createElement('div');
      strip.style.cssText = 'width:100%;text-align:center;font:700 11px monospace;color:#ffd85e;letter-spacing:2px;padding:2px 0 6px;';
      strip.textContent = 'PROPOSED — TITLE (TRIMMED)';
      host.appendChild(strip);
      for (const [name, desc] of ${JSON.stringify(PROPOSED_TITLE)}) {
        const c = document.createElement('div');
        c.className = 'card';
        c.innerHTML = '<div class="name">' + name + '</div>' + (desc ? '<div class="desc">' + desc + '</div>' : '');
        host.appendChild(c);
      }
      return host.querySelectorAll('.card').length; })()`);
    await p.sleep(150);
    shot = await p.shot('trim-proposed-title-' + tag);
    copyFileSync(shot, ART + '/proposed-title-' + tag + '.png');
    console.log('[' + tag + '] PROPOSED: title ' + propTitleCount + ' cards, settings ' + propSettingsCount + ' cards (photographed)');

    ok(propTitleCount < curTitle, 'the proposed title is smaller (' + propTitleCount + ' vs ' + curTitle + ')');
    ok(propSettingsCount < curSettings, 'the proposed settings is smaller (' + propSettingsCount + ' vs ' + curSettings + ')');
    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'VERIFY FAILED: ' + fails : 'verify_condense_trim: ALL SHOTS CAPTURED (both viewports)');
process.exit(fails ? 1 : 0);
