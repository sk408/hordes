// Replay preload (not a test; the suite runner takes test_*.mjs only).
// Seeds Math.random so a run that failed at random can be found and then
// replayed exactly:
//   HORDES_RNG=3 node --import ./test/_seed_random.mjs test/test_pilot_nostall.mjs
// To hunt for a failing seed, loop HORDES_RNG over 1..N and keep the ones
// that exit non-zero. Without HORDES_RNG it does nothing.
const seed = Number(process.env.HORDES_RNG || 0);
if (seed) {
  let a = seed | 0;
  Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
