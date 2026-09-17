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
 * deliberately ships three runtime deps. Server rendering does not run effects
 * or attach handlers, so this is not a substitute for interaction tests. What
 * it does do is execute every component's render body, which is precisely
 * where a bad hook call, a missing import, or an undefined-property access
 * blows up. That is the class of bug that took out the tab.
 *
 * Adding a component here is cheap. Do it whenever a new one lands.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';

import { ThemeProvider } from '../../design/ThemeContext.jsx';
import RadioChannelCard from '../RadioChannelCard.jsx';

/** The tweaks shape ThemeProvider expects, matching App.jsx's defaults. */
const TWEAKS = { mode: 'dark', accent: 'amber', scheme: 'fusion', motion: true, shader: false };

const withTheme = (el) => renderToString(h(ThemeProvider, { tweaks: TWEAKS }, el));

describe('render smoke: RadioChannelCard', () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it('renders with no bridge at all (the pre-connect state)', () => {
    // window.casper undefined -> supported === false. This is what the tab
    // looks like before anything is plugged in, and it must still render.
    const html = withTheme(h(RadioChannelCard, {}));
    expect(html).toContain('RADIO');
    expect(html).toContain('CHANNEL');
  });

  it('renders with a bridge present but no ground station reporting', () => {
    // The state the operator actually sees with the app open and no hardware:
    // the plan arrives from main (async, so still empty at first paint) and
    // the NOW line has no channel to show.
    globalThis.window = {
      casper: {
        cmd_channel: () => {},
        get_channel_plan: () => new Promise(() => {}),
        on_channel_update: () => () => {}
      }
    };
    const html = withTheme(h(RadioChannelCard, { gsChannel: 0 }));
    expect(html).toContain('RADIO');
    // No ground station -> the dash, not a channel number.
    expect(html).toContain('—');
  });

  it('renders a live channel and the de-rated warning together', () => {
    globalThis.window = {
      casper: {
        cmd_channel: () => {},
        get_channel_plan: () => new Promise(() => {}),
        on_channel_update: () => () => {}
      }
    };
    const html = withTheme(h(RadioChannelCard, { gsChannel: 7, imageCalOk: false }));
    expect(html).toContain('CH 7');
    // The image-calibration warning is the one piece of text that tells an
    // operator their receiver is quietly de-rated. It must actually render.
    expect(html).toContain('image calibration');
  });

  it('does not throw for any channel in the plan', () => {
    globalThis.window = {
      casper: {
        cmd_channel: () => {},
        get_channel_plan: () => new Promise(() => {}),
        on_channel_update: () => () => {}
      }
    };
    // 38 channels across two bands; a formatting or lookup bug on one of them
    // would otherwise only show up when an operator selected that one.
    for (let ch = 1; ch <= 38; ch++) {
      expect(() => withTheme(h(RadioChannelCard, { gsChannel: ch }))).not.toThrow();
    }
  });
});
