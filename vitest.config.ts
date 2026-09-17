/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The app builds JSX with @vitejs/plugin-react, which uses React 17+'s
  // AUTOMATIC runtime -- so renderer components import no React symbol and do
  // not need to. vitest loads no plugins, so without this it transformed the
  // same files with the CLASSIC runtime and every one of them died on
  // "React is not defined" the moment a test actually rendered one.
  //
  // esbuild.jsx rather than adding plugin-react: the plugin also installs fast
  // refresh and HMR machinery, which is meaningless in a test run. This is the
  // one setting that matters for transform equivalence.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    // .jsx/.tsx included so a future test can be written next to the component
    // it covers without the runner silently ignoring it.
    include: ['src/**/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  },
})
