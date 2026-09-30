// 公式サイトの公開前チェック：内部リンク・ページ内アンカー・配布PDF・禁止表記を検査する
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
  if (!page.endsWith('404.html') && !/<meta property="og:image" content="https:\/\/sk-labs\.net\/assets\/og\/[^"]+"/.test(html)) errors.push(`${page}: OGP画像（og:image）がありません`);
  if (page.startsWith('articles/') && page !== 'articles/index.html' && !html.includes('<h2>制作履歴</h2>')) errors.push(`${page}: 制作履歴（元コンテンツ・執筆・公開の日付）がありません`);
  if (/drive\.google\.com/.test(html)) errors.push(`${page}: 非公開のGoogleドライブへのリンクが残っています`);
  if (/（サンプル値）|（サンプル）|'SAMPLE'/.test(html)) errors.push(`${page}: サンプル値表示が残っています`);
  if (/x\.com\/sklabs_jp/.test(html)) errors.push(`${page}: 旧Xアカウント（sklabs_jp）へのリンクがあります`);
  for (const [, text] of html.matchAll(/href="https:\/\/note\.com\/sklabs_official\/?"[^>]*>([^<]*)</g)) {
    if (/商品|noteで見る|購入/.test(text)) errors.push(`${page}: noteトップへのリンクに個別商品と誤認される文言があります「${text.trim()}」`);
  }
}

// 配布PDFは「公開用コピー」だけを置く：台帳（content/site.json の resources[].publicCopy）とハッシュが一致すること、
// 作成ツール名などの内部メタデータ・Driveリンクが残っていないこと
const site = JSON.parse(fs.readFileSync(path.resolve('content/site.json'), 'utf8'));
const ledger = new Map(site.resources.filter((r) => r.url.startsWith('/downloads/')).map((r) => [path.basename(r.url), r.publicCopy]));
for (const f of fs.readdirSync(path.join(root, 'downloads'))) {
  const buf = fs.readFileSync(path.join(root, 'downloads', f));
  if (buf.subarray(0, 5).toString() !== '%PDF-') errors.push(`downloads/${f}: PDFではありません`);
  const entry = ledger.get(f);
  if (!entry) { errors.push(`downloads/${f}: 公開用コピー台帳に登録されていません`); continue; }
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== entry.sha256) errors.push(`downloads/${f}: 台帳のハッシュと一致しません（公開用コピー以外に差し替わっています）`);
  const raw = buf.toString('latin1');
  if (/python-docx|x:xmpmeta|docs\.google\.com|drive\.google\.com/.test(raw)) errors.push(`downloads/${f}: 内部メタデータまたはDriveリンクが残っています`);
}

// 案件のブランド分離：公式サイトに載せるアフィリエイトは所属ブランド必須かつSK LABSのみ
for (const a of site.affiliates) {
  if (a.brand !== site.site.name) errors.push(`affiliates[${a.id}]: 所属ブランドが「${a.brand || '未設定'}」です（SK LABS以外は掲載不可）`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`サイトチェック合格（${pages.length}ページ）`);
