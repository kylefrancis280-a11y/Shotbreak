#!/usr/bin/env python3
"""Run timeline/parser.js smoke tests via embedded JS engine (no node required)."""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSER = ROOT / "timeline" / "parser.js"

SAMPLE = """FADE IN:

INT. ABANDONED WAREHOUSE - NIGHT

Rain hammers the tin roof. Water drips through cracks in the ceiling.

JOHN MERCER (40s, weathered, ex-military) steps through a rusted door, pistol drawn.

JOHN
(whispering)
Sarah... you in here?

SARAH COLE (30s, sharp eyes, athletic) emerges from behind crates, hands raised.

SARAH
Took you long enough.

JOHN
Who did this?

SARAH
(bitter laugh)
Volkov's men. Three of them.

DMITRI VOLKOV (50s, silver hair, tailored suit) steps into light from a skylight.

VOLKOV
Mr. Mercer. I was hoping you'd come.

John pushes Sarah behind him, raising the pistol.

FADE OUT."""

VIKING = """INT. CLIFFTOP - DAY

BRANT
(to the warriors)
We ride at dawn.

RAMSEY launches himself off the cliff.

CRUMB (40s, weathered)
What are you doing?

VOLKOV
Stop them!

JOHN MERCER (40s, weathered)
Everyone calm down."""

NOISE = """INT. FIELD - DAY

RAIN hammers the shields. GERMAN soldiers advance. STOP Look out!"""

TITLE_PAGE = """OPENING SEQUENCE

INT. AIRPORT - DAY

A large jet zooms overhead.

BRANT
We ride."""


def run_js(code: str):
    """Execute JS with quickjs, node, or cscript fallback."""
    for exe in ("node", "qjs", "quickjs"):
        try:
            proc = subprocess.run(
                [exe, "-e", code],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=str(ROOT),
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return json.loads(proc.stdout.strip().splitlines()[-1])
            if proc.returncode != 0 and "not recognized" not in (proc.stderr or "").lower():
                raise RuntimeError(proc.stderr or proc.stdout or f"{exe} failed")
        except FileNotFoundError:
            continue
    raise RuntimeError("No JS runtime (node/qjs) found — install Node.js to run parser tests")


def main():
    parser_src = PARSER.read_text(encoding="utf-8")
    harness = r"""
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(process.argv[1], 'utf8');
const sandbox = { window: {}, console };
vm.runInNewContext(code, sandbox);
const SB = sandbox.window.SBParser;
const SAMPLE = %s;
const VIKING = %s;
const NOISE = %s;
const TITLE_PAGE = %s;

function check(label, result, expected, forbidden) {
  const found = new Set(Object.keys(result.characters || {}));
  const missing = expected.filter(n => !found.has(n));
  const bad = [...found].filter(n => forbidden.some(rx => rx.test(n)));
  if (missing.length || bad.length) {
    console.log(JSON.stringify({ ok: false, label, found: [...found], missing, bad }));
    process.exit(1);
  }
}

check('warehouse', SB.parse(SAMPLE, 5),
  ['JOHN MERCER','JOHN','SARAH COLE','SARAH','DMITRI VOLKOV','VOLKOV'],
  [/^(RAIN|WATER|TIN|WAREHOUSE|HAMMER|DRIP)$/i, /ROOF/i]);
check('viking', SB.parse(VIKING, 5),
  ['BRANT','RAMSEY','CRUMB','VOLKOV','JOHN MERCER'],
  [/^(WARRIORS|STOP|CLIFF|LAUNCH)$/i]);
check('noise', SB.parse(NOISE, 5), [],
  [/^(RAIN|GERMAN|STOP|LOOK|SHIELD|FIELD)$/i]);
check('title-page', SB.parse(TITLE_PAGE, 5), ['BRANT'], [/OPENING|SEQUENCE/i]);

const pdfNorm = SB.normalizeScriptText(SAMPLE.replace(/\n/g, ' '));
const pdfLines = pdfNorm.split('\n').filter(l => l.trim()).length;
const pdfResult = SB.parse(pdfNorm, 5);
if (pdfLines < 8 || Object.keys(pdfResult.characters).length < 3) {
  console.log(JSON.stringify({ ok: false, label: 'pdf', pdfLines, chars: Object.keys(pdfResult.characters) }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, pdfLines, pdfChars: Object.keys(pdfResult.characters).sort() }));
""" % (
        json.dumps(SAMPLE),
        json.dumps(VIKING),
        json.dumps(NOISE),
        json.dumps(TITLE_PAGE),
    )

    try:
        proc = subprocess.run(
            ["node", "-e", harness, str(PARSER)],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(ROOT),
        )
    except FileNotFoundError:
        print("SKIP: node not installed — parser.js tests require Node.js")
        return 0

    if proc.returncode != 0:
        print(proc.stdout)
        print(proc.stderr, file=sys.stderr)
        return 1

    out = json.loads(proc.stdout.strip().splitlines()[-1])
    print("PASS", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())