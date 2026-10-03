// A wave boss that dies at the arena rim must not open the portal past the wall,
// where nobody can stand close enough to enter it.
import assert from 'node:assert/strict';
import { boot } from './_harness.mjs';
import { lootLimit } from '../src/entities.js';

const h = await boot();
const T = h.T, st = h.state;
let fails = 0;
const ok = (name, fn) => { try { fn(); console.log('  ok  ' + name); } catch (e) { fails++; console.log('  FAIL ' + name + '\n' + e.message); } };

ok('the portal opens and drifts inside the reachable floor, even from beyond the rim', () => {
  st.mode = 'menu'; T.startRun();
  st.enemies.length = 0; st.spawnTimer = 999;
  const lim = lootLimit();
  st.wave.endsAt = st.time;            // the boss arrives now
  h.pump(2);
  const bosses = (st.wave.bosses || []).filter(b => b.hp > 0);
  assert.ok(bosses.length >= 1, 'a boss is up');
  for (const b of bosses) { b.x = -lim - 60; b.y = lim + 40; }
  st.wave.portalX = -lim - 60; st.wave.portalY = lim + 40;
  for (const b of bosses) b.hp = 0;
  for (let i = 0; i < 4 && !st.portal; i++) h.pump(1);
  assert.ok(st.portal, 'the portal opened');
  assert.ok(Math.abs(st.portal.x) <= lim && Math.abs(st.portal.y) <= lim,
    'portal at ' + st.portal.x.toFixed(1) + ',' + st.portal.y.toFixed(1) + ' inside ±' + lim);
  // The hero walks to it and gets in.
  const wave0 = st.wave.num;
  for (let i = 0; i < 60 * 15 && st.wave.num === wave0 && st.mode !== 'intermission'; i++) {
    st.player.x = st.portal ? st.portal.x : st.player.x; st.player.y = st.portal ? st.portal.y : st.player.y;
    st.player.hp = st.player.stats.maxHp;
    if (st.mode === 'draft' || st.mode === 'evolve' || st.mode === 'chest') h.key('keydown', { key: 'Enter' });
    if (st.mode === 'portal-cine') h.key('keydown', { key: 'Escape' });
    if (st.mode === 'escape') { try { T.escape.skip(); } catch { /* optional */ } }
    h.pump(1);
  }
  assert.ok(st.mode === 'intermission' || st.wave.num > wave0, 'entered the portal (mode ' + st.mode + ')');
});
if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('test_portal_rim: all green');
