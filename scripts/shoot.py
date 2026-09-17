#!/usr/bin/env python3
"""
shoot.py -- photograph a Mission Control tab, and say what is on it.

WHY THIS EXISTS. Three bugs shipped into the RADIO CHANNEL card in a single
day, past a green test suite, a clean electron-vite build and a clean tsc:

  1. `const { T } = useTheme()` -- the Setup tab rendered black, whole app dead.
  2. `T.panel` / `T.line`, token names that do not exist -- they evaluate to
     undefined, React drops the property, and the dropdown came out as the
     platform default: black text on white, in a dark UI.
  3. Apply enabled with no link attached -- it would stage a change that went
     nowhere and then report "the flight computer did not answer", blaming the
     FC for an unplugged cable.

Only the first is catchable by rendering to a string. The second and third are
invisible to every automated check this project has, because nothing throws:
the styles are simply absent and the button is simply live. They were found by
looking at the screen, so this makes looking at the screen cheap and repeatable.

This is a LOOKING tool, not a test. It asserts nothing and fails nothing. Run it
when you change the UI, open the PNG, and read the printed summary.

USAGE
    python scripts/shoot.py                       # Setup tab -> setup.png
    python scripts/shoot.py --tab FLIGHT          # another tab
    python scripts/shoot.py --out /tmp/x.png      # somewhere else
    python scripts/shoot.py --channel 26          # pretend the GS reports CH 26
    python scripts/shoot.py --connected           # pretend a link is attached
    python scripts/shoot.py --connected --select 7   # ...and move the dropdown

REQUIREMENTS
    The vite dev server must already be up (`npm run dev`), and Playwright must
    be installed for Python:

        pip install playwright && playwright install chromium

    Deliberately NOT added to package.json. Mission Control ships as an offline
    portable exe with three runtime dependencies, and a screenshot tool has no
    business in that tree or on the build path. Nothing here runs in CI.

HOW THE BRIDGE IS FAKED
    The dev server serves the renderer, but not the Electron preload -- so
    window.casper is absent and every card renders its "no bridge" state, which
    is not what an operator sees. The stub below is generated from the REAL
    preload source at run time, so it cannot drift: add a method to
    src/preload/index.ts and it appears here automatically. An earlier
    hand-written stub missed one method and crashed the shell, which looked
    exactly like a bug in the thing being photographed.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRELOAD = ROOT / "src" / "preload" / "index.ts"

# Mirrors the channel plan main builds for CH_GET_CHANNEL_PLAN. Kept here rather
# than imported because this file must run without bundling the app.
PLAN_JS = """
  const EU_FIRST = 1, EU_COUNT = 13, EU_BASE = 863500000, EU_STEP = 500000;
  const US_FIRST = EU_FIRST + EU_COUNT, US_COUNT = 25, US_BASE = 903000000, US_STEP = 1000000;
  const COUNT = EU_COUNT + US_COUNT;
  const hz = (c) => c >= US_FIRST
    ? US_BASE + (c - US_FIRST) * US_STEP
    : EU_BASE + (c - EU_FIRST) * EU_STEP;
  const band = (c) => (c >= US_FIRST ? 'US' : 'EU');
  const fmt = (h) => (h / 1e6).toFixed(3) + ' MHz';
  const plan = [];
  for (let c = EU_FIRST; c <= COUNT; c++) {
    plan.push({ channel: c, hz: hz(c), band: band(c), label: fmt(hz(c)) });
  }
"""


def preload_api_names() -> list:
    """Every key the real preload exposes on window.casper."""
    if not PRELOAD.exists():
        sys.exit(f"shoot: cannot find {PRELOAD}")
    text = PRELOAD.read_text(encoding="utf-8")
    names = list(dict.fromkeys(re.findall(r"^\s{2}([a-z_][a-z0-9_]*)\s*:", text, re.M | re.I)))
    # Guard against a silent scrape failure. A stub with no methods would crash
    # the shell and be read as a bug in the app -- the exact confusion this
    # whole file was written to remove.
    if len(names) < 10:
        sys.exit(f"shoot: only scraped {len(names)} preload methods; the regex has rotted")
    return names


def build_stub(names, channel, connected) -> str:
    return f"""
(() => {{
{PLAN_JS}
  const noop = () => {{}};
  const unsub = () => () => {{}};
  const api = {{}};
  for (const k of {json.dumps(names)}) {{
    api[k] = k.startsWith('on_') ? unsub : (() => Promise.resolve(null));
  }}
  api.get_channel_plan = () => Promise.resolve({{ plan, default_channel: 10 }});
  api.cmd_channel = noop;
  api.scan_ports = noop;

  // A telemetry frame, so cards that read the store show something. The
  // renderer's own defaults fill in everything not named here.
  //
  // fc_conn / gs_conn ride on the TELEMETRY snapshot, not on the port list --
  // useSerial reads the flags there and on_serial_ports only carries the array
  // of available ports. Putting them on the wrong callback is why --connected
  // did nothing on the first run of this script.
  const snap = {{
    gs_channel: {channel},
    gs_channel_hz: 0,
    gs_image_cal_ok: true,
    fc_conn: {str(connected).lower()},
    gs_conn: {str(connected).lower()},
  }};
  api.on_telemetry = (cb) => {{ setTimeout(() => cb(snap), 50); return () => {{}}; }};
  api.on_serial_ports = (cb) => {{ setTimeout(() => cb([]), 50); return () => {{}}; }};
  window.casper = api;
}})();
"""


# Text worth reporting for each tab: the things whose ABSENCE is the bug.
PROBES = {
    "SETUP": ["RADIO", "EU 868", "US 915", "Apply", "connect a link to apply",
              "no channel plan", "failed to render"],
    "FLIGHT": ["RADIO LINK", "CH ", "failed to render"],
    "GPS": ["GPS", "failed to render"],
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tab", default="SETUP", help="sidebar tab label (default: SETUP)")
    ap.add_argument("--out", default="setup.png", help="output PNG path")
    ap.add_argument("--url", default="http://localhost:5173", help="vite dev server")
    ap.add_argument("--channel", type=int, default=0,
                    help="channel the fake ground station reports (0 = none)")
    ap.add_argument("--connected", action="store_true",
                    help="pretend a serial link is attached")
    ap.add_argument("--select", type=int, default=None,
                    help="pick this channel in the dropdown before shooting, so the"
                         " Apply-enabled path is reachable (it is correctly DISABLED"
                         " while the selection equals the channel already in use)")
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("shoot: pip install playwright && playwright install chromium")

    stub = build_stub(preload_api_names(), args.channel, args.connected)
    logs = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1100})
        page.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))

        page.add_init_script(stub)
        try:
            page.goto(args.url, wait_until="networkidle", timeout=20000)
        except Exception as exc:  # noqa: BLE001
            sys.exit(f"shoot: {args.url} did not load -- is `npm run dev` up?\n  {exc}")
        page.wait_for_timeout(1000)

        try:
            page.get_by_text(args.tab, exact=True).first.click(timeout=8000)
            page.wait_for_timeout(1000)
        except Exception as exc:  # noqa: BLE001
            logs.append(f"tab {args.tab!r} not clickable: {exc}")

        if args.select is not None:
            try:
                page.locator("select").first.select_option(str(args.select))
                page.wait_for_timeout(400)
            except Exception as exc:  # noqa: BLE001
                logs.append(f"could not select channel {args.select}: {exc}")

        page.screenshot(path=args.out)

        print(f"\n  tab: {args.tab}    -> {args.out}")
        for probe in PROBES.get(args.tab.upper(), ["failed to render"]):
            print(f"    {probe!r:34} x{page.get_by_text(probe, exact=False).count()}")

        sel = page.locator("select").first
        if sel.count():
            css = sel.evaluate("el => getComputedStyle(el).backgroundColor"
                               " + '  text ' + getComputedStyle(el).color")
            print(f"    first <select> bg {css}")

        # Any control that looks pressable but is not, and vice versa, is worth
        # seeing in text -- that was bug 3.
        for label in ("Apply", "UPLOAD TO FC"):
            btn = page.get_by_text(label, exact=True)
            if btn.count():
                print(f"    button {label!r}: "
                      f"{'DISABLED' if btn.first.is_disabled() else 'enabled'}")

        errs = [line for line in logs if "PAGEERROR" in line or line.startswith("error")]
        print(f"    console errors: {len(errs)}")
        for line in errs[:5]:
            print(f"      {line}")
        browser.close()

    print(f"\n  open {args.out} and LOOK at it -- that is the point.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
