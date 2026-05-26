// Rasterise assets/icon.svg to multi-size PNGs and pack into assets/icon.ico.
// Run via `npm run build:icon`.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = typeof pngToIcoMod === 'function' ? pngToIcoMod : pngToIcoMod.default;

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'CASPER icon.svg');
const OUT_DIR = path.join(ROOT, 'assets');
const PREVIEW_DIR = path.join(OUT_DIR, 'icon-preview');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const TINT = '#3DD8B0'; // mint, matches v2 design system accent

// Recolor: source SVG is black-fill silhouette. Swap to TINT for transparent-bg icon.
function tint_svg(svg_str) {
  return svg_str
    .replace(/fill="#000000"/g, `fill="${TINT}"`)
    .replace(/fill="#000"/g, `fill="${TINT}"`)
    .replace(/fill="black"/gi, `fill="${TINT}"`);
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Missing source SVG at ${SRC}`);
  }
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const svg_raw = fs.readFileSync(SRC, 'utf8');
  const svg = Buffer.from(tint_svg(svg_raw), 'utf8');

  // Rasterise once at high resolution, then downsample for each size.
  // Keeps the SVG render within sharp's pixel limit and gives consistent anti-aliasing.
  const MASTER = 1024;
  const master_png = await sharp(svg, { density: 300 })
    .resize(MASTER, MASTER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const pngBuffers = [];
  for (const size of SIZES) {
    const buf = await sharp(master_png)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    pngBuffers.push(buf);
    fs.writeFileSync(path.join(PREVIEW_DIR, `icon-${size}.png`), buf);
    console.log(`  ${size}x${size}  (${buf.length} B)`);
  }

  const ico = await pngToIco(pngBuffers);
  const icoPath = path.join(OUT_DIR, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log(`\nwrote ${icoPath}  (${ico.length} B)`);
  console.log(`preview PNGs in ${PREVIEW_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
