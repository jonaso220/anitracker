// Genera los íconos de la app desde public/icon.svg:
//
//   icon-192.png, icon-512.png   esquinas redondeadas (purpose "any")
//   icon-maskable-512.png        a sangre, glifo dentro de la zona segura
//   apple-touch-icon.png         a sangre y opaco (iOS aplica su máscara)
//   favicon.ico                  16 (simplificado), 32 y 48 px
//
// No suma dependencias: rasteriza con un Chrome/Chromium instalado en modo
// headless (dibuja el SVG en un <canvas> y devuelve los PNG por --dump-dom).
// Si no lo encuentra solo, pasale la ruta: CHROME_PATH=/ruta/a/chrome npm run icons
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

// El círculo seguro de un ícono maskable mide el 80% del lado. El punto del
// glifo más lejano al centro está a ~221 de 256: al 86% queda a ~190, adentro
// del radio seguro (204,8) con margen.
const MASKABLE_GLYPH_SCALE = 0.86;

const SMALL_GLYPH_SCALE = 1.14;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function replaceOnce(text, search, replacement) {
  if (text.split(search).length !== 2) {
    throw new Error(`icon.svg: se esperaba exactamente un «${search}»`);
  }
  return text.replace(search, replacement);
}

function buildVariants(svg) {
  const fullBleed = replaceOnce(svg, ' rx="116" fill="url(#brand)"/>', ' fill="url(#brand)"/>');
  const maskable = replaceOnce(
    fullBleed,
    '<g id="glyph">',
    `<g id="glyph" transform="translate(256 256) scale(${MASKABLE_GLYPH_SCALE}) translate(-256 -256)">`,
  );
  // A 16 px el destello no llega a un píxel: se saca y se agranda la tele.
  const withoutSparkle = svg.replace(/\s*<path id="sparkle"[^>]*\/>/, '');
  if (withoutSparkle === svg) throw new Error('icon.svg: no se encontró el <path id="sparkle" … />');
  const small = replaceOnce(
    withoutSparkle,
    '<g id="glyph">',
    `<g id="glyph" transform="translate(256 256) scale(${SMALL_GLYPH_SCALE}) translate(-256 -256)">`,
  );
  return { rounded: svg, fullBleed, maskable, small };
}

// Cada trabajo es [nombre, variante, tamaño en px].
const JOBS = [
  ['icon-192', 'rounded', 192],
  ['icon-512', 'rounded', 512],
  ['icon-maskable-512', 'maskable', 512],
  ['apple-touch-icon', 'fullBleed', 180],
  ['favicon-16', 'small', 16],
  ['favicon-32', 'rounded', 32],
  ['favicon-48', 'rounded', 48],
];

function rasterize(variants) {
  const chrome = CHROME_CANDIDATES.find((path) => path && existsSync(path));
  if (!chrome) throw new Error('No se encontró Chrome/Chromium. Pasá su ruta en CHROME_PATH.');

  const jobs = JOBS.map(([name, variant, size]) => ({
    name,
    size,
    src: `data:image/svg+xml;base64,${Buffer.from(variants[variant]).toString('base64')}`,
  }));
  const page = `<!doctype html><meta charset="utf-8"><pre id="out"></pre><script>
const jobs = ${JSON.stringify(jobs)};
Promise.all(jobs.map(({ name, size, src }) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d').drawImage(img, 0, 0, size, size);
    resolve([name, canvas.toDataURL('image/png').split(',')[1]]);
  };
  img.onerror = () => reject(new Error('no se pudo cargar ' + name));
  img.src = src;
}))).then(
  (entries) => { document.getElementById('out').textContent = 'ICONS:' + JSON.stringify(Object.fromEntries(entries)) + ':END'; },
  (error) => { document.getElementById('out').textContent = 'ICONS-ERROR:' + error.message; },
);
</script>`;

  const workDir = mkdtempSync(join(tmpdir(), 'anitracker-icons-'));
  try {
    const pagePath = join(workDir, 'render.html');
    writeFileSync(pagePath, page);
    const dom = execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${join(workDir, 'profile')}`,
      '--virtual-time-budget=10000',
      '--dump-dom',
      pathToFileURL(pagePath).href,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const match = dom.match(/ICONS:(\{.*\}):END/s);
    if (!match) {
      // Lo más común: icon.svg no es XML válido (p. ej. «--» dentro de un comentario).
      const failure = dom.match(/ICONS-ERROR:[^<]*/)?.[0] ?? 'la página no terminó de dibujar';
      throw new Error(`Chrome no devolvió los íconos (${failure})`);
    }
    return Object.fromEntries(
      Object.entries(JSON.parse(match[1])).map(([name, base64]) => [name, recompressPng(Buffer.from(base64, 'base64'))]),
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// Chrome codifica el PNG del canvas con compresión rápida: el de 512 px sale de
// ~240 kB. Volver a comprimir los mismos píxeles al máximo lo deja en ~35 kB.
function recompressPng(png) {
  const SIGNATURE_LENGTH = 8;
  const chunks = [];
  for (let offset = SIGNATURE_LENGTH; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    chunks.push({
      type: png.toString('latin1', offset + 4, offset + 8),
      data: png.subarray(offset + 8, offset + 8 + length),
    });
    offset += 12 + length;
  }
  const pixels = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const output = [
    chunks.find((c) => c.type === 'IHDR'),
    { type: 'IDAT', data: deflateSync(pixels, { level: 9 }) },
    { type: 'IEND', data: Buffer.alloc(0) },
  ].map(({ type, data }) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    body.copy(chunk, 4);
    chunk.writeUInt32BE(crc32(body), 8 + data.length);
    return chunk;
  });
  return Buffer.concat([png.subarray(0, SIGNATURE_LENGTH), ...output]);
}

// Un .ico es un directorio de imágenes; desde Windows Vista cada una puede ser
// un PNG tal cual.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // tipo: ícono
  header.writeUInt16LE(images.length, 4);
  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0); // ancho
    entry.writeUInt8(size, 1); // alto
    entry.writeUInt16LE(1, 4); // planos
    entry.writeUInt16LE(32, 6); // bits por píxel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

const variants = buildVariants(readFileSync(join(PUBLIC_DIR, 'icon.svg'), 'utf8'));
const pngs = rasterize(variants);

const outputs = {
  'icon-192.png': pngs['icon-192'],
  'icon-512.png': pngs['icon-512'],
  'icon-maskable-512.png': pngs['icon-maskable-512'],
  'apple-touch-icon.png': pngs['apple-touch-icon'],
  'favicon.ico': buildIco([16, 32, 48].map((size) => ({ size, png: pngs[`favicon-${size}`] }))),
};
for (const [file, data] of Object.entries(outputs)) {
  writeFileSync(join(PUBLIC_DIR, file), data);
  console.log(`${file.padEnd(24)} ${(data.length / 1024).toFixed(1)} kB`);
}
// Chrome (144+) trata la URL de un ícono como inmutable: sin URL nueva, las
// apps ya instaladas se quedan con el ícono viejo.
console.log('\nSi el ícono cambió: subí el ?v=N de los íconos en public/manifest.json y CACHE_VERSION en public/sw.js.');
