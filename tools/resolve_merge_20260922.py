#!/usr/bin/env python3
"""Merge conflict resolver for port/vs-concepts -> tools/dev-editor.
Policy per file/hunk (owner-approved integration, 2026-09-22):
- .gitignore            : UNION (both sides' ignores)
- src/main.js hunk A    : COMBINED  = rulings' credit gate + dev's sim-clock
- src/main.js hunk B    : HEAD side (devSimSteps call sites) — devSimSteps itself
                          is then EXTENDED below to honor prestige gameSpeed.
- src/meta.js hunk 0    : PORT side (comment must say shipped tables — true post-merge)
- src/meta.js hunks 1-6 : HEAD side (live `get desc()` getters = live-template doctrine)
- test/test_shop_overrides.mjs : PORT side (owner's shipped override tables)
Then extend devSimSteps: dev speed>1 overrides, else prestige gameSpeed drives
substeps (gate-off byte-identical to shipped prestige).
"""
import re, sys

def resolve(path, policy):  # policy: list of 'union'|'head'|'port'|'combined_flash'
    src = open(path).read()
    out, idx, missing = [], 0, 0
    pat = re.compile(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> port/vs-concepts\n', re.S)
    def sub(m):
        nonlocal idx
        head, port = m.group(1), m.group(2)
        pol = policy[idx] if idx < len(policy) else None
        idx += 1
        if pol == 'union':
            lines = head.splitlines(True) + [l for l in port.splitlines(True) if l not in head]
            return ''.join(lines)
        if pol == 'head':
            return head
        if pol == 'port':
            return port
        if pol == 'combined_flash':
            return '      if (credit && shouldFlashDrop(e, p.stats.luck || 0, devCooldownNow(), state.lastFlashAt, Math.random)) {\n'
        raise SystemExit(f'NO POLICY for hunk {idx} in {path}')
    res = pat.sub(sub, src)
    n_left = len(re.findall(r'^<<<<<<< ', res, re.M))
    print(f'{path}: resolved {idx} hunks, markers_left={n_left}')
    if n_left: sys.exit(1)
    if '<<<<<<<' in res: sys.exit(1)
    open(path, 'w').write(res)

resolve('.gitignore', ['union'])
resolve('src/main.js', ['combined_flash', 'head'])
resolve('src/meta.js', ['port'] + ['head'] * 6)
resolve('test/test_shop_overrides.mjs', ['port', 'port'])

# Extend devSimSteps with prestige gameSpeed fallback (NOT a conflict region).
p = 'src/main.js'
s = open(p).read()
old = ('function devSimSteps(dt) {\n'
       '  let n = 1;\n'
       '  if (DEV_GATE && dev) n = devNormSpeed(dev.speed);\n')
new = ('function devSimSteps(dt) {\n'
       '  // MERGE (prestige x dev-speed): dev speed >1 overrides as the\n'
       '  // instrument requires (runner=8x); otherwise prestige\'s gated run\n'
       '  // speeds drive the substeps (gate-off = shipped prestige behaviour).\n'
       '  let n = Math.max(1, state.gameSpeed | 0);\n'
       '  if (DEV_GATE && dev && dev.speed > 1) n = devNormSpeed(dev.speed);\n')
if old not in s: sys.exit('devSimSteps anchor NOT FOUND')
open(p, 'w').write(s.replace(old, new, 1))
print('src/main.js: devSimSteps extended with prestige gameSpeed fallback')
print('ALL RESOLVED')
