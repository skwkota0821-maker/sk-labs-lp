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

// Drive正本の所在：info@sk-labs.net 所有の新IDを正本として記録し、移管前（skw所有）の旧IDを正本として使わない
const dc = site.driveCanonical;
const ID = /^[A-Za-z0-9_-]{25,}$/;
if (!dc || dc.owner !== 'info@sk-labs.net') errors.push('content/site.json: driveCanonical（正本の所在、所有者 info@sk-labs.net）がありません');
else {
  const ledger = dc.docs.find((x) => x.key === 'dateLedger');
  if (!ledger || !ID.test(ledger.driveId)) errors.push('driveCanonical: 制作履歴台帳（dateLedger）の正本IDがありません');
  for (const x of [...dc.docs, ...dc.archived]) if (!ID.test(x.driveId || '')) errors.push(`driveCanonical: ID形式が不正です（${x.title}）`);
  const current = new Set([...dc.docs, ...dc.archived].map((x) => x.driveId));
  for (const r of dc.retired) {
    if (current.has(r.driveId)) errors.push(`driveCanonical: 旧ID ${r.driveId} が正本として登録されています`);
    if (!current.has(r.replacedBy)) errors.push(`driveCanonical: 旧ID ${r.driveId} の移管先 ${r.replacedBy} が正本一覧にありません`);
  }
  // 旧IDは driveCanonical.retired 以外のどこにも書かない（サイト配信物・スクリプト・データすべて）
  const repoFiles = ['public', 'scripts', 'content', 'netlify'].flatMap((d) => (fs.existsSync(d) ? walk(path.resolve(d)) : []))
    .filter((f) => /\.(html|js|mjs|mts|ts|json|xml|txt|md|toml)$/.test(f));
  for (const f of repoFiles) {
    let txt = fs.readFileSync(f, 'utf8');
    if (f.endsWith(path.join('content', 'site.json'))) txt = JSON.stringify({ ...JSON.parse(txt), driveCanonical: { ...dc, retired: [] } });
    if (f.endsWith(path.join('scripts', 'check-site.mjs'))) continue;
    for (const r of dc.retired) if (txt.includes(r.driveId)) errors.push(`${path.relative(process.cwd(), f)}: 移管前の旧Drive ID ${r.driveId}（${r.was}）を参照しています。正本 ${r.replacedBy} を使ってください`);
  }
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
