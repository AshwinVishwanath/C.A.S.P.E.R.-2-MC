// Launcher that removes ELECTRON_RUN_AS_NODE before starting electron-vite.
// VSCode's integrated terminal sets ELECTRON_RUN_AS_NODE=1 (since VSCode is
// itself Electron-based), which causes require('electron') to return the exe
// path instead of the module API. Deleting the key fixes this on all platforms.
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const args = process.argv.slice(2); // forward any extra args (e.g. --preview)
const mode = args.includes('--preview') ? 'preview' : 'dev';
const fwd = args.filter((a) => a !== '--preview');
const cmd = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite';
const child = spawn(cmd, [mode, ...fwd], { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
