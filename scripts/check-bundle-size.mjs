#!/usr/bin/env node
// Presupuesto de tamaño del bundle (gzip con el nivel por defecto de zlib).
//
// Motivo: `CLAUDE.md` documenta que Firebase quedó fijado en ~12.14 porque
// desde 12.15 su chunk suma ~60 kB gzip. Confiar en que alguien lo recuerde en
// cada actualización no escala: este chequeo compara la build real contra los
// presupuestos y falla (exit 1) si alguno se pasa.
//
// Uso: `npm run build && npm run size`
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS_DIR = fileURLToPath(new URL('../dist/assets/', import.meta.url));

// Presupuestos en bytes gzip, con ~20 % de margen sobre el tamaño real al
// momento de escribirlos. Si un cambio legítimo los supera, subilos a mano en
// el mismo PR que explica por qué.
const KB = 1024;
const BUDGETS = [
  { label: 'Firebase (lazy)', match: /^firebase-.*\.js$/, max: 120 * KB },
  { label: 'React (vendor)', match: /^vendor-.*\.js$/, max: 80 * KB },
  { label: 'Entrada (index)', match: /^index-.*\.js$/, max: 50 * KB },
  { label: 'Total de JS', total: true, max: 290 * KB },
];

const kb = (bytes) => `${(bytes / KB).toFixed(2)} kB`;

let files;
try {
  files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`No existe ${ASSETS_DIR}. Corré "npm run build" antes que "npm run size".`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`No hay archivos .js en ${ASSETS_DIR}. Corré "npm run build" primero.`);
  process.exit(1);
}

const sizes = files.map((file) => ({ file, gzip: gzipSync(readFileSync(join(ASSETS_DIR, file))).length }));
const totalGzip = sizes.reduce((sum, s) => sum + s.gzip, 0);

const largestMatching = (pattern) =>
  sizes.reduce((max, s) => (pattern.test(s.file) ? Math.max(max, s.gzip) : max), 0);

console.log('Presupuesto de bundle (gzip):');
let failed = false;
for (const budget of BUDGETS) {
  const value = budget.total ? totalGzip : largestMatching(budget.match);
  const ok = value <= budget.max;
  if (!ok) failed = true;
  const pct = budget.max === 0 ? 0 : Math.round((value / budget.max) * 100);
  console.log(
    `  ${ok ? '✓' : '✗'} ${budget.label.padEnd(16)} ${kb(value).padStart(10)} / ${kb(budget.max).padStart(10)}  (${pct}%)`,
  );
}

if (failed) {
  console.error('\n✗ El bundle superó el presupuesto. Revisá si el aumento es intencional:');
  console.error('  - Si es una dependencia nueva o más pesada, evaluá una alternativa más liviana.');
  console.error('  - Si es intencional, subí el presupuesto en scripts/check-bundle-size.mjs.');
  process.exit(1);
}
console.log('\n✓ Todos los chunks entran en el presupuesto.');
