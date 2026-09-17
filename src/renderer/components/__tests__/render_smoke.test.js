/**
 * Render smoke tests.
 *
 * WHY THIS FILE EXISTS. On 2026-09-17 the Setup tab rendered as a black screen
 * with no way back, because RadioChannelCard did `const { T } = useTheme()`
 * while useTheme() returns the theme object itself. `T` was undefined, the
 * first `T.accent` threw, and a throw during render unmounts the whole React
 * tree -- so one wrong character took out the entire tab.
 *
 * Every existing check passed: 480 unit tests, a clean electron-vite build, and
 * `tsc --noEmit`. None of them RENDER anything. The suite runs in vitest's
 * `node` environment with no jsdom and no testing-library, so no component had
 * ever been mounted in a test.
 *
 * These use renderToString from react-dom/server, which is ALREADY a
 * dependency -- no jsdom, no testing-library, nothing added to a project that
 * deliberately ships three runtime deps.
 *
 * WHAT THIS CATCHES: anything that throws while a component's render body runs
 * -- a bad hook call, a missing import, an undefined-property access, a broken
 * prop contract. That is the class of bug that took out the tab.
 *
 * WHAT IT DOES NOT: server rendering runs no effects, attaches no handlers and
 * has no DOM. A component whose useEffect throws, or whose click handler is
 * wrong, passes here. Do not read a green run as "the UI works" -- read it as
 * "nothing blanks the app on first paint".
 *
 * Adding a component is cheap. Do it whenever a new one lands.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';

import { ThemeProvider, useTheme } from '../../design/ThemeContext.jsx';
import useTelemetry from '../../hooks/use_telemetry.jsx';

import RadioChannelCard from '../RadioChannelCard.jsx';
import TabErrorBoundary from '../TabErrorBoundary.jsx';
import { AttitudeCard } from '../AttitudeCard.jsx';
import { ConnectionModeIndicator } from '../ConnectionModeIndicator.jsx';
import { EventLog } from '../EventLog.jsx';
import { GsStatusPanel } from '../GsStatusPanel.jsx';
import { SerialPortPicker } from '../SerialPortPicker.jsx';
import { InlineError } from '../InlineError.jsx';
import FlightLogPanel from '../FlightLogPanel.jsx';
import SensorDiagnostics from '../SensorDiagnostics.jsx';

/** The tweaks shape ThemeProvider expects, matching App.jsx's defaults. */
const TWEAKS = { mode: 'dark', accent: 'amber', scheme: 'fusion', motion: true, shader: false };

const withTheme = (el) => renderToString(h(ThemeProvider, { tweaks: TWEAKS }, el));

/**
 * Render `fn(theme, telemetry)` inside the provider, with the REAL default
 * telemetry object rather than a hand-written fixture.
 *
 * useTelemetry() returns its defaults when window.casper is absent, which is
 * exactly the no-hardware state these tests run in. Driving the real hook means
 * the fixture cannot drift from the shape components actually receive -- a
 * copied one would quietly rot the moment a field was added.
 */
function renderProbe(fn) {
  const Probe = () => fn(useTheme(), useTelemetry());
  return withTheme(h(Probe));
}

/** Minimal window.casper for components that check for the bridge. */
const stubBridge = () => {
  globalThis.window = {
    casper: {
      cmd_channel: () => {},
      get_channel_plan: () => new Promise(() => {}),
      on_channel_update: () => () => {},
      on_telemetry: () => () => {},
      scan_ports: () => {},
      on_ports: () => () => {},
    },
  };
};

afterEach(() => {
  delete globalThis.window;
});

// ---------------------------------------------------------------------------
// The component whose crash motivated this file
// ---------------------------------------------------------------------------

describe('render smoke: RadioChannelCard', () => {
  it('renders with no bridge at all (the pre-connect state)', () => {
    const html = withTheme(h(RadioChannelCard, {}));
    expect(html).toContain('RADIO');
    expect(html).toContain('CHANNEL');
  });

  it('renders with a bridge present but no ground station reporting', () => {
    stubBridge();
    const html = withTheme(h(RadioChannelCard, { gsChannel: 0 }));
    expect(html).toContain('RADIO');
    // No ground station -> the dash, not a channel number.
    expect(html).toContain('—');
  });

  it('renders a live channel and the de-rated warning together', () => {
    stubBridge();
    const html = withTheme(h(RadioChannelCard, { gsChannel: 7, imageCalOk: false }));
    expect(html).toContain('CH 7');
    // The one piece of text that tells an operator their receiver is quietly
    // de-rated. It must actually render.
    expect(html).toContain('image calibration');
  });

  it('does not throw for any channel in the plan', () => {
    stubBridge();
    // 38 channels across two bands; a formatting or lookup bug on one of them
    // would otherwise only show up when an operator selected that one.
    for (let ch = 1; ch <= 38; ch++) {
      expect(() => withTheme(h(RadioChannelCard, { gsChannel: ch }))).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// The boundary that stops one of these from blanking the app
// ---------------------------------------------------------------------------

describe('render smoke: TabErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    const html = withTheme(
      h(TabErrorBoundary, { name: 'SETUP' }, h('div', null, 'healthy content')),
    );
    expect(html).toContain('healthy content');
  });

  it('catches a throwing child instead of taking the tree down', () => {
    // Reproduces the original failure exactly: a component that reads a
    // property off an undefined theme.
    const Exploding = () => {
      const T = undefined;
      return h('div', null, T.accent);
    };

    // renderToString does NOT invoke error boundaries -- that is a
    // client-render behaviour -- so assert the two things that are checkable
    // here: the boundary's own machinery produces an error state from a thrown
    // error, and the unguarded render really does throw.
    expect(() => withTheme(h(Exploding))).toThrow();

    const derived = TabErrorBoundary.getDerivedStateFromError(new Error('boom'));
    expect(derived.error).toBeInstanceOf(Error);
    expect(derived.error.message).toBe('boom');
  });

  it('renders the error screen, naming the tab and keeping the stack', () => {
    // Drive the error state directly, since SSR will not trigger the catch.
    const b = new TabErrorBoundary({ name: 'SETUP', theme: {} });
    b.state = { error: new Error('kaboom') };
    const html = renderToString(b.render());
    expect(html).toContain('SETUP');
    expect(html).toContain('kaboom');
    // The reassurance that distinguishes a contained crash from a dead app.
    expect(html).toContain('still running');
  });

  it('clears a latched error when the tab changes, so switching back retries', () => {
    const b = new TabErrorBoundary({ name: 'SETUP' });
    b.state = { error: new Error('boom') };
    const seen = [];
    b.setState = (patch) => seen.push(patch);

    // Same tab -> stay in the error state.
    b.props = { name: 'SETUP' };
    b.componentDidUpdate({ name: 'SETUP' });
    expect(seen).toHaveLength(0);

    // Different tab -> reset, or the boundary shows a stale error forever.
    b.props = { name: 'FLIGHT' };
    b.componentDidUpdate({ name: 'SETUP' });
    expect(seen).toEqual([{ error: null }]);
  });
});

// ---------------------------------------------------------------------------
// Everything else in components/, driven with the real default telemetry
// ---------------------------------------------------------------------------

describe('render smoke: the rest of the renderer components', () => {
  it('AttitudeCard', () => {
    expect(() => renderProbe((T, t) => h(AttitudeCard, { t, theme: T }))).not.toThrow();
  });

  it('ConnectionModeIndicator, in all four link combinations', () => {
    for (const fc of [true, false]) {
      for (const gs of [true, false]) {
        expect(() =>
          renderProbe((T) =>
            h(ConnectionModeIndicator, { fc_connected: fc, gs_connected: gs, theme: T }),
          ),
        ).not.toThrow();
      }
    }
  });

  it('EventLog, empty and populated', () => {
    expect(() => renderProbe((T) => h(EventLog, { events: [], theme: T }))).not.toThrow();
    const events = [
      { t: 1.25, type: 'STATE', text: 'PAD -> BOOST' },
      { t: 12.5, type: 'PYRO', text: 'apogee fired' },
    ];
    expect(() => renderProbe((T) => h(EventLog, { events, theme: T }))).not.toThrow();
  });

  it('GsStatusPanel, with no snapshot and with the default one', () => {
    expect(() => renderProbe((T) => h(GsStatusPanel, { snapshot: null, theme: T }))).not.toThrow();
    expect(() =>
      renderProbe((T, t) => h(GsStatusPanel, { snapshot: t, theme: T })),
    ).not.toThrow();
  });

  it('SerialPortPicker', () => {
    stubBridge();
    const serial = { ports: [], fc_port: null, gs_port: null, connect: () => {}, disconnect: () => {} };
    expect(() => renderProbe((T) => h(SerialPortPicker, { serial, theme: T }))).not.toThrow();
  });

  it('InlineError, silent with no message and visible with one', () => {
    // Renders nothing at all when there is no message -- that is its contract,
    // and a regression here would put an empty error box on every screen.
    expect(renderProbe((T) => h(InlineError, { message: null, theme: T }))).toBe('');
    const html = renderProbe((T) => h(InlineError, { message: 'link lost', theme: T }));
    expect(html).toContain('link lost');
  });

  it('FlightLogPanel', () => {
    stubBridge();
    expect(() => renderProbe((T) => h(FlightLogPanel, { theme: T }))).not.toThrow();
  });

  it('SensorDiagnostics', () => {
    stubBridge();
    expect(() => renderProbe(() => h(SensorDiagnostics))).not.toThrow();
  });
});
