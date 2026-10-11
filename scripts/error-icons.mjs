#!/usr/bin/env node
// Vẽ hình màn LED của từng mã lỗi cho bảng mã lỗi trong README: images/loi-<mã>.svg và images/loi-x.svg (dấu ✗).
// Đọc thẳng các hình trong `errorImage` của main.ts, nên README luôn khớp với màn LED thật.
// Chạy lại sau khi sửa hình: node scripts/error-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'main.ts'), 'utf8');
const body = source.slice(source.indexOf('function errorImage'), source.indexOf('/* ---------- Khối'));

/** `case 3: return images.createImage(\`…\`)` → mã 3; `default:` là mã 9. */
const icons = new Map();
for (const m of body.matchAll(/(case (\d+)|default):\s*return images\.createImage\(`([^`]*)`\)/g)) {
  const code = m[2] ? Number(m[2]) : 9;
  icons.set(code, m[3].trim().split('\n').map((row) => row.trim().split(/\s+/).map((c) => c === '#')));
}
// Dấu ✗ (IconNames.No) hiện trước chữ số.
icons.set('x', ['# . . . #', '. # . # .', '. . # . .', '. # . # .', '# . . . #'].map((row) => row.split(' ').map((c) => c === '#')));

const svg = (grid) => {
  const dots = grid
    .flatMap((row, y) => row.map((on, x) => `<circle cx="${14 + x * 18}" cy="${14 + y * 18}" r="6" fill="${on ? '#ff3b1f' : '#3a3a3a'}"/>`))
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 100 100"><rect width="100" height="100" rx="12" fill="#1b1b1b"/>${dots}</svg>\n`;
};

mkdirSync(join(root, 'images'), { recursive: true });
for (const [code, grid] of icons) {
  if (grid.length !== 5 || grid.some((row) => row.length !== 5)) throw new Error(`Hình mã ${code} không phải 5×5`);
  writeFileSync(join(root, 'images', `loi-${code}.svg`), svg(grid));
}
console.log(`Đã vẽ ${icons.size} hình: ${[...icons.keys()].join(', ')}`);
