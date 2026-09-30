// 公式サイトの公開前チェック：内部リンク・ページ内アンカー・配布PDF・禁止表記を検査する
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
// index-v2.html は旧トップ（現行ルーティングでは配信対象外・保全のみ）のため検査しない
const pages = walk(root).filter((f) => f.endsWith('.html') && !f.endsWith('index-v2.html')).map((f) => path.relative(root, f));
const errors = [];

const resolveInternal = (href) => {
  const p = href.split('#')[0].split('?')[0];
  if (p === '/' || p === '') return 'index.html';
  if (p === '/starter-kit') return 'starter-kit.html';
  if (p.endsWith('/')) return p.replace(/^\//, '') + 'index.html';
  return p.replace(/^\//, '');
};

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, href] of html.matchAll(/\shref="([^"]*)"/g)) {
    if (/^(https?:|mailto:|javascript:)/.test(href)) continue;
    if (href.startsWith('/api/')) continue;
    if (href === '#') continue; // ロゴのページ先頭リンク
    if (href.startsWith('#')) {
      if (!ids.has(href.slice(1))) errors.push(`${page}: アンカー先がありません ${href}`);
      continue;
    }
    const file = resolveInternal(href);
    if (!fs.existsSync(path.join(root, file))) errors.push(`${page}: リンク先ファイルがありません ${href}`);
    const hash = href.includes('#') ? href.split('#')[1] : '';
    if (hash) {
      const target = fs.readFileSync(path.join(root, file), 'utf8');
      if (!target.includes(`id="${hash}"`)) errors.push(`${page}: リンク先のアンカーがありません ${href}`);
    }
  }
  if (/drive\.google\.com/.test(html)) errors.push(`${page}: 非公開のGoogleドライブへのリンクが残っています`);
  if (/（サンプル値）|（サンプル）|'SAMPLE'/.test(html)) errors.push(`${page}: サンプル値表示が残っています`);
  if (/x\.com\/sklabs_jp/.test(html)) errors.push(`${page}: 旧Xアカウント（sklabs_jp）へのリンクがあります`);
}

for (const f of fs.readdirSync(path.join(root, 'downloads'))) {
  const buf = fs.readFileSync(path.join(root, 'downloads', f));
  if (buf.subarray(0, 5).toString() !== '%PDF-') errors.push(`downloads/${f}: PDFではありません`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`サイトチェック合格（${pages.length}ページ）`);
