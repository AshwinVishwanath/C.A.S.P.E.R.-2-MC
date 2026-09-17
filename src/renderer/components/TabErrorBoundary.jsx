import React from 'react';

/**
 * TabErrorBoundary -- contain a render crash to the tab that caused it.
 *
 * WHY. On 2026-09-17 one component did `const { T } = useTheme()` instead of
 * `const T = useTheme()`. T was undefined, the first `T.accent` threw, and
 * because React unmounts the entire tree when a render throws, the whole app
 * went black with no way back short of restarting it. One wrong character in
 * one card took out everything.
 *
 * That is the wrong failure shape for this application. Mission Control is used
 * beside a rocket on a pad, sometimes minutes before a launch, by someone who
 * may not have a terminal open. Losing the telemetry view because the Setup tab
 * has a bug is not an acceptable trade -- and "restart the app" is a
 * particularly bad instruction when the app is the thing showing you the
 * vehicle.
 *
 * So: each tab renders inside its own boundary. A crash costs you that tab and
 * nothing else. The other tabs keep running, the link stays up, and the error
 * is shown rather than swallowed.
 *
 * WHAT THIS DOES NOT CATCH, so nobody reads a green screen as proof of health:
 * error boundaries only catch errors thrown during RENDER, in lifecycle methods
 * and in constructors of the tree below them. They do not catch errors inside
 * event handlers, in async callbacks or promise rejections, or anything thrown
 * in the main process. Those still need their own handling.
 *
 * A class component on purpose: getDerivedStateFromError and componentDidCatch
 * have no hook equivalent. This is the one case React still requires a class.
 */
export default class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the full stack somewhere a developer can actually reach. The
    // renderer console is the only place it survives; the main process never
    // sees renderer exceptions, which is exactly why this class of bug went
    // unnoticed while a log monitor watched main's stdout and stayed silent.
    console.error(
      `[TabErrorBoundary] ${this.props.name || 'tab'} crashed during render:`,
      error,
      info?.componentStack,
    );
  }

  componentDidUpdate(prevProps) {
    // Reset when the tab changes. Without this a crashed boundary stays in its
    // error state forever: switching away and back would re-mount the SAME
    // failed boundary and show the error screen for a tab that is fine. The
    // `name` prop is the reset key.
    if (this.state.error && prevProps.name !== this.props.name) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const T = this.props.theme || {};
    const mono = "'IBM Plex Mono','Menlo',monospace";

    return (
      <div style={{ padding: 32, fontFamily: mono, color: T.strong || '#e6e6e6', maxWidth: 820 }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: T.danger || '#ff6b6b',
            marginBottom: 12,
          }}
        >
          {this.props.name || 'This tab'} failed to render
        </div>

        <div style={{ fontSize: 13, lineHeight: 1.6, color: T.muted || '#9a9a9a', marginBottom: 16 }}>
          The rest of Mission Control is still running — the radio link, the
          telemetry store and every other tab are unaffected. Switch to another
          tab and back to retry this one.
        </div>

        <pre
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            color: T.danger || '#ff6b6b',
            background: T.bgPanel || 'rgba(255,255,255,0.04)',
            border: `1px solid ${T.border || 'rgba(255,255,255,0.12)'}`,
            borderRadius: 6,
            padding: 12,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {String(error && error.stack ? error.stack : error)}
        </pre>

        <div style={{ fontSize: 11, color: T.muted || '#9a9a9a', marginTop: 12 }}>
          The full component stack is in the developer console (Ctrl+Shift+I).
        </div>
      </div>
    );
  }
}
