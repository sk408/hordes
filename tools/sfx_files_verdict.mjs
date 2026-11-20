// HORDES: the pass/fail rules of tools/measure_sfx_files.mjs, apart so a node test can
// prove they fail (test/test_sfx_files.mjs). Input: the result object that tool builds.
// RECORDED may be at most 1 dB louder than SYNTH in the busiest second; nothing
// may reach 0 dBFS (clipping); every file decodes; the pick group works.
export function verdict(r) {
  const out = [];
  const L = r.load || {};
  if (!(L.files > 0)) out.push('no file loaded');
  if ((L.failed || []).length) out.push('decode or fetch failed: ' + L.failed.join(', '));
  const f = r.fight;
  for (const [name, s, rec] of [['busy fight', f.synth, f.recorded], ['busy fight with the R4 cues', f.synthMeaning, f.recordedMeaning]]) {
    const d = rec.busiestSecondLufs - s.busiestSecondLufs;
    if (!(d <= 1)) out.push(name + ': RECORDED is ' + d.toFixed(2) + ' dB louder than SYNTH (limit 1 dB)');
  }
  const peaks = [['busy fight', f.recorded.peakDb], ['busy fight with the R4 cues', f.recordedMeaning.peakDb], ['worst case', r.worst.recorded.peakDb]];
  for (const [slot, s] of Object.entries(r.slots)) for (const [id, c] of Object.entries(s.cands)) peaks.push([slot + ' ' + id + ' in its scene', c.scenePeak]);
  for (const [name, pk] of peaks) if (!(pk < 0)) out.push(name + ': peak ' + pk + ' dBFS clips');
  const ui = r.ui || {};
  const want = /hit=woodtap, kill=synth,/;
  if (!want.test(ui.line || '')) out.push('the picks line does not show the pressed picks: ' + ui.line);
  if (ui.lineAfterReload !== ui.line) out.push('the picks are not remembered after a reload: ' + ui.lineAfterReload);
  if (!ui.copied) out.push('COPY did nothing');
  if (ui.game !== null) out.push('the page changed the game\'s sound source: ' + ui.game);
  if ((ui.played || []).length < 2) out.push('the Alone and In-the-menus buttons did not play');
  if (ui.sideways) out.push('the page scrolls sideways');
  if ((r.errors || []).length) out.push(r.errors.length + ' console errors');
  return out;
}
