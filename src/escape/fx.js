// HORDES — V1b escape FX (docs/briefs/V1B_ESCAPE_ART.md readability pass):
// the pit-fall and the shot-kill as VISIBLE, DISTINCT end states. The sim
// records pure events (sim.events: {type:'pit'|'kill', x, y, t}); this module
// DERIVES the live effect list from (sim, sim.t) alone — no state of its own,
// no clock, no randomness — so the render stays a pure function of the sim and
// the 60/120Hz parity contract is untouched (fx never feeds back into step()).
//
// A pit is a FALL: the body drops on a gravity arc, tumbling (fast frame
// alternation + a sideways wobble), fading as it goes — it happens AT the gap,
// with a dust puff at the lip. A kill is a BURST: the body stays where it was
// and specks fly outward. Two different shapes of the same "enemy is gone";
// that difference is the whole point (brief: "falling must also be
// distinguishable from a shot kill").
export const FX = {
  FALL_LIFE: 0.8,     // s the fall stays on screen
  BURST_LIFE: 0.35,   // s the kill burst lasts
};

// The live effect descriptors for a sim (also the unit-test seam: a pit event
// yields kind 'fall' whose y ADVANCES with sim.t; a kill yields kind 'burst'
// whose y is fixed and whose radius grows — distinct renderable states).
export function effectsFor(sim) {
  const out = [];
  if (!sim || !sim.events) return out;
  for (const e of sim.events) {
    const age = sim.t - e.t;
    if (age < 0 || age > 2) continue;
    if (e.type === 'pit' && age <= FX.FALL_LIFE) {
      // Drop arc: y grows quadratically (gravity ~960), x wobbles (tumble).
      out.push({
        kind: 'fall', age, life: FX.FALL_LIFE, n: e.n,
        x: e.x + Math.round(Math.sin(age * 16 + (e.n % 4)) * 2),
        y: e.y + Math.round(960 * age * age / 2),
      });
    } else if (e.type === 'kill' && age <= FX.BURST_LIFE) {
      out.push({
        kind: 'burst', age, life: FX.BURST_LIFE, n: e.n,
        x: e.x, y: e.y, r: 2 + Math.round(age * 40),
      });
    }
  }
  return out;
}
