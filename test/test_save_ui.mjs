// HORDES — W1 SAVE UI WIRING (integration through the real src/main.js).
//
// Proves the browser-facing half of the save foundation, which the pure
// test_save.mjs cannot: boot TELLS the player when a save is unreadable, the
// session runs on a valid current-version profile, EXIT PATHS AUTOSAVE, and
// the SETTINGS screen offers a working export/import path plus the preserved
// damaged payload.
//
// Run: node test/test_save_ui.mjs   (exit 0 = pass)
import assert from 'node:assert/strict';
import { boot } from './_harness.mjs';

const CORRUPT = '{not json';
const h = await boot({
  storage: [
    ['hordes_profile_v1', CORRUPT],
    ['hordes_onboarded', '1'],   // skip the first-boot HOW TO PLAY pop
  ],
});

// Pump the intro movie out (same 7s budget smoke.mjs uses) until the title.
let frames = 0;
for (; frames < 1200; frames++) {
  h.pump(1);
  const t = h.elements['ov-title'];
  if (t && (t.textContent === 'HORDES' || t.textContent === 'HOW TO PLAY')) break;
}
const T = h.T;

// ---- corrupted save: told, never silently wiped ----
assert.equal(T.save.status, 'corrupt', 'boot reports the corrupt load');
assert.ok(/UNREADABLE/.test(T.save.notice || ''), 'the notice tells the player the save was unreadable');
assert.equal(T.save.version, 2, 'the session runs a valid CURRENT-version profile');
assert.equal(T.getProfile().gold, 0, 'the player starts clean');
assert.ok(h.storage.get('hordes_profile_recovery'),
  'the damaged payload is preserved under the recovery key');
assert.equal(JSON.parse(h.storage.get('hordes_profile_recovery')).raw, CORRUPT,
  'the preserved copy is the exact original payload');
assert.ok(/UNREADABLE/.test(h.elements['ov-sub'].innerHTML || ''),
  'the title screen surfaces the notice (the player is TOLD)');
console.log('corrupt boot: notice shown, payload preserved, fresh profile live');

// ---- autosave on the exit path ----
assert.ok(/UNREADABLE/.test(T.save.notice), 'the notice is still pending before any save');
h.key('pagehide');   // fires the registered window 'pagehide' handler
const flushed = JSON.parse(h.storage.get('hordes_profile_v1'));
assert.equal(flushed.version, 2, 'pagehide AUTOSAVES a current-version profile');
assert.equal(h.storage.get('hordes_profile_recovery') !== null, true,
  'the autosave did not destroy the preserved payload');
h.key('beforeunload');
const flushed2 = JSON.parse(h.storage.get('hordes_profile_v1'));
assert.equal(flushed2.version, 2, 'beforeunload also flushes (second exit path)');
assert.ok(T.save.autosave() === true, 'the autosave seam reports success');
console.log('exit paths: pagehide/beforeunload/autosave all flush the profile');

// ---- title SETTINGS offers export/import + the recovery download ----
const cards = h.elements['ov-cards'];
const byTitle = (t) => Array.from(cards.children).find(c => (c.innerHTML || '').includes(t));
const settings = byTitle('SETTINGS');
assert.ok(settings, 'the title offers SETTINGS');
settings.click();
assert.ok(byTitle('EXPORT SAVE'), 'settings offers EXPORT SAVE');
assert.ok(byTitle('IMPORT SAVE'), 'settings offers IMPORT SAVE');
assert.ok(byTitle('RECOVERY FILE'), 'the preserved damaged save is offered for download');
assert.ok(/UNREADABLE|profile/.test(h.elements['ov-sub'].textContent || ''),
  'the settings sub-line carries the save notice');
console.log('settings: EXPORT SAVE / IMPORT SAVE / RECOVERY FILE present');

// ---- export -> import round trip through the LIVE profile ----
T.getProfile().gold = 4242;
T.getProfile().bestTime = 123;
const exported = T.save.exportText({ at: '2026-01-02T03:04:05.000Z' });
assert.ok(/"format": "hordes-profile"/.test(exported), 'the export carries the format marker');
assert.ok(/"schemaVersion": 2/.test(exported), 'the export carries the schema version');
assert.ok(/"gold"/.test(exported) && /"purchased"/.test(exported) &&
  /"unlockedCharacters"/.test(exported) && /"unlockedWeapons"/.test(exported) &&
  /"unlockedElites"/.test(exported) && /"bestTime"/.test(exported),
  'the export includes every persisted collection (unknown fields too)');

// Dirty the live profile, then restore it from the export.
T.getProfile().gold = 9999;
T.getProfile().bestTime = 1;
const back = T.save.importText(exported);
assert.equal(back.ok, true, 'importing the export succeeds');
assert.equal(T.getProfile().gold, 4242, 'the imported profile replaces the live one (gold restored)');
assert.equal(T.getProfile().bestTime, 123, 'unknown fields survive the live round trip');
assert.ok(/IMPORTED/.test(T.save.notice), 'the player is told the import succeeded');
assert.equal(JSON.parse(h.storage.get('hordes_profile_v1')).gold, 4242,
  'a successful import is persisted immediately');
console.log('round trip: live profile -> export -> import -> identical');

// ---- a bad file can never damage the live profile ----
const goldBefore = T.getProfile().gold;
const bad = T.save.importText('this is not a save');
assert.equal(bad.ok, false, 'a garbage file is refused');
assert.ok(/IMPORT FAILED/.test(T.save.notice), 'the refusal reason is shown to the player');
assert.equal(T.getProfile().gold, goldBefore, 'the live profile is untouched by a failed import');
const future = T.save.importText(JSON.stringify({ version: 99, gold: 999 }));
assert.equal(future.ok, false, 'a newer-version file is refused on import too');
assert.equal(T.getProfile().gold, goldBefore, 'a future-version import cannot touch the live profile');
console.log('import refusals: garbage + future-version both leave the profile intact');

// ---- download helper wired with a fake DOM ----
const env = {
  Blob: class { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  document: { createElement: () => ({ style: {}, setAttribute() {}, click() {}, remove() {} }), body: { appendChild() {} } },
};
const dl = T.save.download(env, { at: '2026-01-02T03:04:05.000Z' });
assert.equal(dl.ok, true, 'the export download path works with a DOM present');
assert.ok(/\.json$/.test(dl.filename), 'the download is a .json file');

// ---- readSaveFile seam (File.text path, as the <input type=file> uses) ----
const read = await T.save.readFile({ text: async () => exported });
assert.equal(read.ok, true, 'the file-read helper reads a picked file');

assert.equal(h.elements['ov-title'].textContent, 'SETTINGS',
  'the settings screen stayed open through the import flow');
console.log(`save-ui: ${frames} intro frames, corrupt-notice + autosave + export/import verified`);
console.log('ALL SAVE UI WIRING TESTS PASSED');
