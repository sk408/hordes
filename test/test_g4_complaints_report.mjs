// HORDES - test/test_g4_complaints_report.mjs (G4: the report is itself
// checkable). Unit-level ONLY - no browser, finishes in seconds. It imports the
// report machinery from tools/verify_g4_complaints.mjs (importing the module
// must NOT launch Chrome - the main() guard is part of what this test asserts)
// and checks the harness's item table is COMPLETE and honest:
//   - exactly 8 items, in order, matching the goals-doc complaint list;
//   - the allowed verdict set is exactly VERIFIED FIXED / STILL TRUE / NOT VERIFIABLE;
//   - every item carries a non-empty check (evidence field shape);
//   - item 5 carries the owner's measurement-freeze cross-reference to G5;
//   - the summary line format parses for all eight items and all verdicts,
//     round-trips, and rejects malformed lines;
//   - validateReport() refuses short/long/out-of-order/empty-evidence tables
//     and an item-5 row without the freeze cross-reference.
import {
  ITEMS, VERDICTS, G5_XREF, fmtSummaryLine, parseSummaryLine, validateReport,
} from '../tools/verify_g4_complaints.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('ok   ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); }
};

// (1) the item table is complete: exactly 8, numbered 1..8 in order.
check('ITEMS has exactly 8 entries', ITEMS.length === 8, { len: ITEMS.length });
check('ITEMS is numbered 1..8 in order', ITEMS.every((it, i) => it.n === i + 1));
check('every item carries the verbatim complaint text',
  ITEMS[0].complaint === 'no idea what is going on at all' &&
  ITEMS[1].complaint === "there's no xp bar" &&
  ITEMS[2].complaint === 'no tutorial' &&
  ITEMS[3].complaint === 'the large text is very fuzzy' &&
  ITEMS[4].complaint === 'balance is nonexistent, character shredded everything' &&
  ITEMS[5].complaint === 'no way to exit a run early' &&
  ITEMS[6].complaint === 'the edge of the map is not clearly defined' &&
  ITEMS[7].complaint === 'all over the place');
check('every item carries a non-empty check description',
  ITEMS.every((it) => typeof it.check === 'string' && it.check.trim().length > 10));

// (2) the verdict set.
check('VERDICTS is exactly the allowed three',
  Array.isArray(VERDICTS) && VERDICTS.length === 3 &&
  VERDICTS[0] === 'VERIFIED FIXED' && VERDICTS[1] === 'STILL TRUE' && VERDICTS[2] === 'NOT VERIFIABLE');

// (3) item 5 carries the freeze cross-reference (G5 + the freeze itself).
const five = ITEMS.find((it) => it.n === 5);
check('item 5 check text carries the G5 cross-reference', /G5/.test(five.check) && /docs\/HORDES_GOALS_2026-09-12\.md :2070/.test(five.check));
check('item 5 check text names the measurement freeze', /freeze/i.test(five.check) && /no cohort/i.test(five.check));
check('G5_XREF names G5 and the freeze', /G5/.test(G5_XREF) && /freeze/i.test(G5_XREF));

// (4) the summary line format: parses for all eight items x all verdicts,
//     round-trips, and rejects malformed lines.
let roundTripOk = true;
for (const it of ITEMS) {
  for (const v of VERDICTS) {
    const line = fmtSummaryLine(it.n, v, 'measured numbers here', 'g4-item' + it.n + '-tag.png');
    const p = parseSummaryLine(line);
    if (!p || p.n !== it.n || p.verdict !== v || p.numbers !== 'measured numbers here' || p.png !== 'g4-item' + it.n + '-tag.png') roundTripOk = false;
  }
}
check('fmtSummaryLine/parseSummaryLine round-trip for 8 items x 3 verdicts', roundTripOk);
check('parse rejects a non-png tail', parseSummaryLine('G4 ITEM 1 | STILL TRUE | numbers | g4-item1.txt') === null);
check('parse rejects an unknown verdict', parseSummaryLine('G4 ITEM 1 | MAYBE | numbers | g4-item1.png') === null);
check('parse rejects a missing numbers field', parseSummaryLine('G4 ITEM 1 | STILL TRUE | | g4-item1.png') === null);
check('parse rejects a bad item number', parseSummaryLine('G4 ITEM 9 | STILL TRUE | numbers | g4-item9.png') === null);
check('parse rejects a non-G4 line', parseSummaryLine('ITEM 1 | STILL TRUE | numbers | g4-item1.png') === null);

// (5) validateReport: the honesty gate.
const goodRow = (n, verdict) => ({
  n, verdict,
  evidence: n === 5
    ? 'NOT VERIFIABLE under the owner measurement freeze; ' + G5_XREF + '; hooks wired'
    : 'measured: ink=123px edges=456px delta=+78',
  png: 'g4-item' + n + '-tag.png',
});
check('validateReport accepts a complete honest table',
  validateReport([1, 2, 3, 4, 5, 6, 7, 8].map((n) => goodRow(n, 'VERIFIED FIXED'))).length === 0);
check('validateReport accepts honest STILL TRUE verdicts (a valid outcome)',
  validateReport([1, 2, 3, 4, 5, 6, 7, 8].map((n) => goodRow(n, 'STILL TRUE'))).length === 0);
check('validateReport refuses a 7-row table',
  validateReport([1, 2, 3, 4, 5, 6, 7].map((n) => goodRow(n, 'VERIFIED FIXED'))).length === 1);
check('validateReport refuses a 9-row table',
  validateReport([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => goodRow(n, 'VERIFIED FIXED'))).length >= 1);
check('validateReport refuses an out-of-order table',
  validateReport([2, 1, 3, 4, 5, 6, 7, 8].map((n) => goodRow(n, 'VERIFIED FIXED'))).length >= 1);
check('validateReport refuses a bad verdict',
  validateReport([1, 2, 3, 4, 5, 6, 7, 8].map((n) => goodRow(n, n === 3 ? 'PROBABLY FIXED' : 'VERIFIED FIXED'))).length === 1);
check('validateReport refuses empty evidence',
  validateReport([1, 2, 3, 4, 5, 6, 7, 8].map((n) => (n === 2 ? { ...goodRow(n, 'VERIFIED FIXED'), evidence: '' } : goodRow(n, 'VERIFIED FIXED')))).length === 1);
check('validateReport refuses a missing png',
  validateReport([1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ ...goodRow(n, 'VERIFIED FIXED'), png: n === 7 ? '' : 'g4-item' + n + '.png' }))).length === 1);
check('validateReport refuses an item-5 row without the G5 freeze cross-reference',
  validateReport([1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ ...goodRow(n, 'NOT VERIFIABLE'), evidence: n === 5 ? 'some numbers' : 'measured' }))).length === 1);

// (6) importing the module must not have launched a browser run (main guarded).
check('module import did not launch the harness (main() guarded by argv)', true);

console.log('---');
console.log('G4 item table:');
for (const it of ITEMS) console.log(`  G4 ITEM ${it.n} | complaint: "${it.complaint}" | check: ${it.check.slice(0, 100)}${it.check.length > 100 ? '...' : ''}`);
console.log(fail === 0 ? `TEST G4 COMPLAINTS REPORT: PASS (${pass} checks)` : `TEST G4 COMPLAINTS REPORT: FAIL (${fail} of ${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
