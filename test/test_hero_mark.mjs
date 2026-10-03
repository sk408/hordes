// HORDES - the hero's marker: a small arrow over the head, up when the hero is
// hurt or stands in a crowd, down again when the crowd thins.
// Run: node test/test_hero_mark.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import { SPRITE_CACHE_TEST } from '../src/sprite_cache.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import { feelOf } from '../src/fx/feel.js';

const s = suite('test_hero_mark');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
st.mode = 'menu'; T.startRun();
SPRITE_CACHE_TEST.forceFakeCanvas();   // the marker is baked through the sprite cache

const crowd = (n) => {
  st.enemies.length = 0;
  const p = st.player;
  for (let i = 0; i < n; i++) st.enemies.push(makeTypedEnemy('CHASER', p.x + 12 + i * 4, p.y + (i % 2 ? 8 : -8), st.time, {}));
};
const draw = () => { T.renderer.render(st, st.cam); return !!T.renderer.heroMark; };

s.check('no marker on an open field', () => {
  crowd(0);
  feelOf(st).hurtT = 0;
  assert.equal(draw(), false);
  crowd(4);
  assert.equal(draw(), false, 'four enemies near the hero are not a crowd');
});

s.check('five enemies around the hero raise it; it stays up until fewer than three are left', () => {
  crowd(5);
  assert.equal(draw(), true);
  crowd(3);
  assert.equal(draw(), true, 'still up at three');
  crowd(2);
  assert.equal(draw(), false, 'down under three');
});

s.check('enemies far from the hero do not count', () => {
  crowd(8);
  for (const e of st.enemies) e.x += 200;
  assert.equal(draw(), false);
});

s.check('a hit raises it at once, crowd or not', () => {
  crowd(0);
  assert.equal(draw(), false);
  feelOf(st).hurtT = 0.2;
  assert.equal(draw(), true);
  feelOf(st).hurtT = 0;
  assert.equal(draw(), false, 'and it drops when the field is clear');
});

SPRITE_CACHE_TEST.reprobe();
s.done();
