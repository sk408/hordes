// HORDES — POTION TUNE MEASUREMENT (owner directive 2026-09-17:
// msg_01M2R9CXBYXHQPN06YGC9B37GP drop rate to 1/5 + steeper trail-off, plus
// msg_01M2RE1V8CNZABTQ7W0ETEEPY0 auto-drink threshold = the potion's heal).
//
// One process per stage (the shims cannot be installed twice); the WHOLE loop
// is seeded (mulberry32 replacing Math.random, the economy_ledger --measure
// discipline) so BEFORE/AFTER arms see the same spawn/draft stream. The frame
// loop, overlay auto-pick policy and boss skill-casting policy are
// tools/real_loop.mjs runRealCohort's, copied verbatim — this file only ADDS
// the per-frame potion telemetry that the cohort record cannot carry.
//
// Per run, through the REAL loop with the AUTO_ALL pilot:
//   * potions ON THE GROUND (distinct drops + carried value) at the run
//     MIDPOINT and at the end — the owner's complaint, measured where he
//     saw it;
//   * every DRINK: HP at the drink, the potion's nominal heal (healMult
//     applied), missing HP, and the potential OVERHEAL (heal - missing, >= 0);
//   * potions CARRIED INTO DEATH (the "dying rich" number the threshold
//     fixes);
//   * run length, kills, banked gold (profile gold delta), death cause.
//
// Usage: node tools/measure_potion_tune.mjs <fresh|maxed|partial> [runs] [capSeconds] [seed]
import { pathToFileURL } from 'node:url';

async function main() {
  const stage = process.argv[2] || 'fresh';
  const runs = Number(process.argv[3]) || 3;
  const capS = Number(process.argv[4]) || (stage === 'maxed' ? 300 : 180);
  const seed = Number(process.argv[5]) || 1337;

  const { mulberry32 } = await import('../src/weather.js');
  const rand = Math.random;
  Math.random = mulberry32(seed);
  try {
    const cfg = await import('../src/config.js');
    const C = cfg.CONFIG;
    const { bootReal } = await import('./real_loop.mjs');
    console.log(`# potion-tune stage=${stage} runs=${runs} cap=${capS}s seed=${seed} ` +
      `DROP_CHANCE=${C.POTIONS.DROP_CHANCE} ADAPTIVE=${JSON.stringify(C.POTIONS.ADAPTIVE)} ` +
      `AUTO_DRINK=${JSON.stringify(C.AUTOPILOT.AUTO_DRINK)} MAX_CARRIED=${C.POTIONS.MAX_CARRIED}`);

    const h = await bootReal(stage);
    const st = h.state;
    const dtMs = 1000 / 60;

    for (let r = 1; r <= runs; r++) {
      const goldBefore = h.profile().gold;
      h.startRun();
      const tel = {
        groundMid: null, groundEnd: null, drinks: [], carriedIntoDeath: null,
        kpsPeak: 0, dropEvents: 0,
      };
      let prevHp = st.player.potions.hp, prevMp = st.player.potions.mp, prevHealth = st.player.hp;
      const ground = () => {
        let n = 0, v = 0;
        for (const d of st.drops) {
          if (d.kind === 'hp' || d.kind === 'mp') { n++; v += (d.count || 1); }
        }
        return { n, v };
      };
      let ended = null;
      const capFrames = Math.floor(capS * 60);
      for (let i = 0; i < capFrames; i++) {
        h.dom.advance(dtMs);
        const cb = h.dom.rafQueue.shift();
        if (!cb) throw new Error('raf queue died');
        cb(performance.now());
        // -- telemetry (pure reads) --
        const p = st.player;
        tel.kpsPeak = Math.max(tel.kpsPeak, st.killRateEwma || 0);
        if (i === Math.floor(capFrames / 2)) tel.groundMid = ground();
        const hp = p.potions.hp, mp = p.potions.mp;
        if (hp < prevHp || mp < prevMp) {
          const healMult = ((p.choices && p.choices.potionHealMult) || 1) * (p.stats.potionPower || 1);
          const heal = C.POTIONS.HP_HEAL * healMult;
          // hp BEFORE the heal = the previous frame's health (the drink has
          // already applied by the time the potion count visibly drops).
          const missing = Math.max(0, p.stats.maxHp - prevHealth);
          tel.drinks.push({ kind: hp < prevHp ? 'hp' : 'mp', hpAtDrink: +prevHealth.toFixed(1),
            heal: +heal.toFixed(1), missing: +missing.toFixed(1),
            overheal: +Math.max(0, heal - missing).toFixed(1), boss: !!st.wave.boss });
        }
        prevHp = hp; prevMp = mp; prevHealth = p.hp;
        if (st.mode === 'dead') {
          ended = st.deathBy;
          tel.carriedIntoDeath = { ...p.potions };
          break;
        }
        // -- overlay auto-pick + casting (runRealCohort's policy, verbatim) --
        const ov = h.dom.elements['overlay'];
        const cards = h.dom.elements['ov-cards'] ? h.dom.elements['ov-cards'].children : [];
        const key = h.dom.keyHandler();
        if (ov && ov.style.display === 'flex' && cards.length > 0 && key) {
          if (st.mode === 'draft' || st.mode === 'evolve') {
            let k = '1';
            for (const c of cards) {
              if ((c.innerHTML || '').includes('NEW WEAPON')) { k = String(cards.indexOf(c) + 1); break; }
            }
            key({ key: k });
          } else {
            const titled = (t) => cards.find(c => (c.innerHTML || '').includes(t));
            const cont = titled('CONTINUE');
            if (cont) cont.click();
            else { const play = titled('PLAY'); if (play) play.click(); else key({ key: '1' }); }
          }
        }
        if (key && (st.mode === 'playing' || st.mode === 'finale')) {
          const bossUp = (st.wave.bosses || []).some(b => b && b.hp > 0)
            || (st.wave.midBosses || []).some(b => b && b.hp > 0)
            || !!(st.finalBoss && st.finalBoss.hp > 0);
          if (bossUp) { key({ key: 'q' }); key({ key: 'e' }); }
        }
      }
      tel.groundEnd = ground();
      const gold = h.profile().gold - goldBefore;
      const cause = st.runWon ? 'RUN SURVIVED' : ended
        ? `died@${Math.floor(st.time)}s w${st.wave.num} (${ended.cause || '?'})` : 'TRUNCATED';
      const hpDrinks = tel.drinks.filter(d => d.kind === 'hp');
      const wasted = hpDrinks.reduce((s, d) => s + d.overheal, 0);
      console.log(`RUN ${r}/${runs} ${cause} kills=${st.player.kills} gold=${gold} ` +
        `kpsPeak=${tel.kpsPeak.toFixed(1)} groundMid=${JSON.stringify(tel.groundMid)} ` +
        `groundEnd=${JSON.stringify(tel.groundEnd)} drinks(hp/mp)=${hpDrinks.length}/${tel.drinks.length - hpDrinks.length} ` +
        `overhealSum=${wasted.toFixed(1)} carriedIntoDeath=${JSON.stringify(tel.carriedIntoDeath)}`);
      for (const d of hpDrinks.slice(0, 8)) {
        console.log(`  drink hp@${d.hpAtDrink} heal=${d.heal} missing=${d.missing} overheal=${d.overheal}${d.boss ? ' [boss]' : ''}`);
      }
    }
  } finally {
    Math.random = rand;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().catch(e => { console.error(e); process.exitCode = 1; });
