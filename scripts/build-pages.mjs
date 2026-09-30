// content/site.json からハブページ・記事ページ・検索索引・新着・sitemap.xml を生成する。
// 使い方: node scripts/build-pages.mjs        … 生成して public/ へ書き込む
//         node scripts/build-pages.mjs --check … 生成結果と public/ の差分があれば失敗（CI用）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/site.json'), 'utf8'));
const SITE = data.site;
const CHECK = process.argv.includes('--check');
const out = new Map(); // 相対パス → 内容

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (p) => (p.startsWith('http') ? p : SITE.url + p);
const jpDate = (d) => { if (!d) return ''; const [y, m, day] = d.split('-').map(Number); return `${y}年${m}月${day}日`; };
// 制作履歴の日付表示：確認できない日付は「未確認」、元コンテンツが無いものは「該当なし」。推測で埋めない
const histDate = (h) => (!h ? '未確認' : h.status === '該当なし' ? '該当なし' : !h.date ? '未確認' : jpDate(h.date) + (h.precision === 'by' ? 'まで' : ''));
const HIST_KEYS = [['conceived', '原案・企画の初出'], ['sourceCreated', '元コンテンツの制作'], ['articleWritten', '記事としての執筆'], ['revised', '改訂'], ['webImplemented', 'このサイトへの実装'], ['published', '公開']];
const hasSource = (a) => !!a.history?.sourceCreated?.date;
const ext = (url) => /^https?:/.test(url);
const linkAttrs = (url, extra = '') => (ext(url) ? ` target="_blank" rel="noopener noreferrer${extra}"` : '');

const siteArticles = data.articles.filter((a) => a.type === 'site');
const articleUrl = (a) => (a.type === 'site' ? `/articles/${a.slug}/` : a.url);
const byId = {
  resource: Object.fromEntries(data.resources.map((r) => [r.id, r])),
  article: Object.fromEntries(data.articles.map((a) => [a.slug, a])),
  product: Object.fromEntries(data.products.map((p) => [p.id, p])),
  affiliate: Object.fromEntries(data.affiliates.map((a) => [a.id, a])),
};

// 案件DBのブランド分離：所属ブランドは必須。SK LABS以外（さやママ・モエ等）の案件は公式サイトへ流用しない
for (const a of data.affiliates) {
  if (!a.brand) throw new Error(`affiliates[${a.id}]: 所属ブランド（brand）が未設定です`);
  if (a.brand !== SITE.name) throw new Error(`affiliates[${a.id}]: ${a.brand}の案件はSK LABS公式サイトへ掲載できません`);
}
// 制作履歴の必須化：GitHubへの追加日・サイト実装日を作成日として扱わないため、6種類の日付を分けて記録する
for (const item of [...data.articles, ...data.resources]) {
  const id = item.slug || item.id;
  if (!item.history) throw new Error(`${id}: 制作履歴（history）がありません`);
  for (const [k] of HIST_KEYS) {
    const v = item.history[k];
    if (v === undefined) throw new Error(`${id}: history.${k} がありません（不明なら date:null で未確認と記録）`);
    for (const e of [].concat(v)) {
      if (e.date && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error(`${id}: history.${k} の日付形式が不正です`);
      if (e.date && !e.source) throw new Error(`${id}: history.${k} に根拠（source）がありません`);
    }
  }
  const pub = item.history.published?.date, src = item.history.sourceCreated?.date;
  if (pub && src && src > pub) throw new Error(`${id}: 元コンテンツの制作日が公開日より後になっています`);
  if (item.type === 'site' && pub !== item.published) throw new Error(`${id}: published と history.published が一致しません`);
}
for (const p of data.products) {
  if (!p.url && !(p.fallbackUrl && p.fallbackCta && p.fallbackNote)) throw new Error(`products[${p.id}]: 個別URL未確定時の送客先・文言・注記が未設定です`);
}

const PAGES = {
  '/start/': '入口診断', '/articles/': '記事', '/resources/': '無料コンテンツ', '/tools/': 'AIツール',
  '/ai-team/': 'AI TEAM', '/works/': '制作実績', '/space/': '宇宙・星空', '/search/': '検索',
};

// 参照（"resource:xxx" 等）→ カード用のリンク情報
function resolveRef(ref) {
  if (ref === 'consult') return { title: '無料相談（メール）', summary: 'AI導入・業務自動化・Web/LP制作・コンテンツ制作のご相談を受け付けています。', url: SITE.consultMail, cta: '無料相談する', kind: '相談', track: 'consult_click' };
  const [type, id] = ref.split(/:(.+)/);
  if (type === 'page') return { title: PAGES[id] || id, summary: '', url: id, cta: 'ページを見る', kind: 'ページ', track: 'internal_click' };
  if (type === 'resource') { const r = byId.resource[id]; return { title: r.title, summary: r.summary, url: r.url, cta: r.cta, kind: '無料資料', track: 'file_download' }; }
  if (type === 'article') { const a = byId.article[id]; return { title: a.title, summary: a.description, url: articleUrl(a), cta: a.type === 'note' ? '記事を読む（note）' : '記事を読む', kind: '記事', track: 'article_click' }; }
  if (type === 'product') {
    const p = byId.product[id];
    // 個別商品URLが未確定の間は、noteトップへ送ることが分かる文言にする（個別商品へ到達すると誤認させない）
    if (p.url) return { title: p.title, summary: p.summary, url: p.url, cta: '商品ページを見る（note）', kind: p.stage, track: 'product_click' };
    return { title: p.title, summary: p.summary, url: p.fallbackUrl, cta: p.fallbackCta, note: p.fallbackNote, kind: p.stage, track: 'product_click' };
  }
  if (type === 'affiliate') { const a = byId.affiliate[id]; return { title: a.label, summary: a.context, url: a.url, cta: 'サイトを見る', kind: 'PR', track: 'affiliate_click', sponsored: true }; }
  throw new Error('未知の参照: ' + ref);
}

function refCard(ref) {
  const r = resolveRef(ref);
  const sponsored = r.sponsored ? ' sponsored nofollow' : '';
  const dl = r.url.startsWith('/downloads/') ? ' download' : '';
  return `<article class="card">${r.sponsored ? '<span><span class="pr">PR</span><span class="tag">広告・アフィリエイトリンク</span></span>' : `<span class="tag">${esc(r.kind)}</span>`}
<h3>${esc(r.title)}</h3>${r.summary ? `<p>${esc(r.summary)}</p>` : ''}
<a class="btn" href="${esc(r.url)}"${linkAttrs(r.url, sponsored)}${dl} data-track="${r.track}" data-track-label="${esc(r.title)}">${esc(r.cta)} →</a>${r.note ? `<p class="cta-note">※${esc(r.note)}</p>` : ''}</article>`;
}

const LOGO = '<svg width="26" height="24" viewBox="0 0 32 30" fill="none" aria-hidden="true"><path d="M16 1L20.5 8.5L16 16L11.5 8.5Z" fill="#8cb8ff"/><path d="M6.5 15L11 22.5L6.5 30L2 22.5Z" fill="#6c9cff"/><path d="M25.5 15L30 22.5L25.5 30L21 22.5Z" fill="#7aa8ff"/></svg>';

function layout({ path: p, title, description, h1, eyebrow, lead, body, crumbs = [], jsonld = [], ogType = 'website', meta = '', scripts = [] }) {
  const url = abs(p);
  const crumbList = [{ name: 'ホーム', url: '/' }, ...crumbs];
  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbList.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.url) })) };
  const nav = Object.entries(PAGES).filter(([u]) => u !== '/start/').map(([u, n]) => `<a href="${u}"${u === p ? ' aria-current="page"' : ''}>${n}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="SK LABS">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://sk-labs.net/assets/og/sklabs-og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="600">
<meta property="og:image:alt" content="SK LABS 公式ロゴ">
<meta name="twitter:image" content="https://sk-labs.net/assets/og/sklabs-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@SK_labs_jp">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="stylesheet" href="/assets/site.css">
<script type="application/ld+json">${JSON.stringify(bc)}</script>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">本文へ移動</a>
<header class="gh"><div class="wrap">
<a class="gh-brand" href="/">${LOGO}<span>SK LABS</span></a>
<nav class="gh-nav" id="ghNav" aria-label="サイト内">${nav}</nav>
<div style="display:flex;gap:8px;align-items:center"><a class="gh-cta" href="${SITE.consultMail}" data-track="consult_click" data-track-label="ヘッダー">無料相談</a><button class="gh-menu" type="button" aria-expanded="false" aria-controls="ghNav">メニュー</button></div>
</div></header>
<nav class="crumbs wrap" aria-label="パンくずリスト"><ol>${crumbList.map((c, i) => `<li>${i === crumbList.length - 1 ? esc(c.name) : `<a href="${c.url}">${esc(c.name)}</a>`}</li>`).join('')}</ol></nav>
<main id="main">
<section class="ph"><div class="wrap"><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(h1)}</h1>${lead ? `<p>${esc(lead)}</p>` : ''}${meta}</div></section>
${body}
</main>
<footer class="gf"><div class="wrap">
<div class="cols">
<div><a class="gh-brand" href="/">${LOGO}<span>SK LABS</span></a><p style="margin-top:8px">AI TEAM DESIGN COMPANY<br>〒231-0032 神奈川県横浜市中区末吉町2丁目26-7<br><a href="mailto:${SITE.email}" style="display:inline">${SITE.email}</a></p></div>
<div><h4>学ぶ</h4><a href="/articles/">記事</a><a href="/resources/">無料コンテンツ</a><a href="/tools/">AIツールの使い分け</a><a href="/ai-team/">AI TEAM</a></div>
<div><h4>知る・探す</h4><a href="/works/">制作実績</a><a href="/space/">宇宙・星空情報</a><a href="/start/">入口診断</a><a href="/search/">サイト内検索</a></div>
<div><h4>つながる</h4><a href="${SITE.consultMail}" data-track="consult_click" data-track-label="フッター">無料相談</a><a href="${SITE.sns.x}" target="_blank" rel="noopener noreferrer">X</a><a href="${SITE.sns.instagram}" target="_blank" rel="noopener noreferrer">Instagram</a><a href="${SITE.sns.note}" target="_blank" rel="noopener noreferrer">note</a></div>
</div>
<small>当サイトの一部のリンクには広告（アフィリエイトリンク）が含まれ、その場合は「PR」と表示しています。掲載しているサービス名・製品名は各社の商標または登録商標です。<br>© SK LABS</small>
</div></footer>
<script src="/assets/site.js" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>
`;
}

const nextBlock = (refs, title = '次のステップ') => `<section class="sec"><div class="wrap"><div class="next"><h2>${esc(title)}</h2><div class="grid g3">${refs.map(refCard).join('')}</div></div></div></section>`;
const ctaRefs = (keys) => keys.map((k) => ({ resources: 'page:/resources/', consult: 'consult', products: 'product:P001', space: 'page:/space/' }[k]));

// ── /resources/ ──
function resourcesPage() {
  const cards = data.resources.map((r) => `<article class="card"><span class="tag">${esc(r.format)}</span><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p>
<dl><dt>対象</dt><dd>${esc(r.audience)}</dd><dt>形式</dt><dd>${esc(r.format)}（登録不要）</dd><dt>資料作成日</dt><dd>${histDate(r.history.sourceCreated)}</dd><dt>サイト掲載</dt><dd>${histDate(r.history.published)}から（2026年9月30日からサイト内で配布）</dd></dl>
<a class="btn" href="${r.url}" download data-track="file_download" data-track-label="${esc(r.title)}">${esc(r.cta)} ↓</a></article>`).join('');
  const arts = data.articles.map((a) => `<article class="card"><span class="tag">${a.type === 'note' ? '無料記事（note）' : '無料記事'}｜${esc(a.category)}</span><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p><a class="btn ghost" href="${articleUrl(a)}"${linkAttrs(articleUrl(a))} data-track="article_click" data-track-label="${esc(a.title)}">記事を読む →</a></article>`).join('');
  const body = `<section class="sec"><div class="wrap"><h2>無料PDF資料（スターターキット2026）</h2><p class="lead">AIの基本から実践、業務への応用、公開前の確認までをまとめた4つのPDFです。メールアドレスの登録なしでダウンロードできます。</p><div class="grid g2">${cards}</div><p class="note">読む順番と使い方は「<a href="/articles/starter-kit-guide/" style="text-decoration:underline">無料スターターキット2026の使い方</a>」で解説しています。</p></div></section>
<section class="sec"><div class="wrap"><h2>無料で読める記事</h2><div class="grid g2">${arts}</div></div></section>
${nextBlock(['page:/tools/', 'product:P001', 'consult'])}`;
  return layout({ path: '/resources/', title: '無料コンテンツ｜SK LABS RESOURCE CENTER', description: 'SK LABSの無料PDF資料（AI活用ガイド・事例集・チェックリスト）と無料記事をまとめたリソースセンターです。登録不要でダウンロードできます。', h1: '無料コンテンツ', eyebrow: 'SK LABS RESOURCE CENTER', lead: 'AI活用ガイド、事例集、チェックリスト、無料記事。SK LABSが公開している無料コンテンツをまとめています。', crumbs: [{ name: '無料コンテンツ', url: '/resources/' }], body,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: '無料コンテンツ', url: abs('/resources/'), hasPart: data.resources.map((r) => ({ '@type': 'DigitalDocument', name: r.title, url: abs(r.url), encodingFormat: 'application/pdf' })) }] });
}

// ── /articles/ と各記事 ──
// 一覧・カードに出す日付：何の日付かを必ず明記する（公開日と元コンテンツの制作日を分ける）
function dateLine(a) {
  const h = a.history;
  if (a.type === 'note') return `noteで公開：${histDate(h.published)}${h.published?.precision === 'by' ? '（正確な日付は未確認）' : ''}`;
  return `このサイトで公開：${histDate(h.published)}／${hasSource(a) ? `元コンテンツ：${histDate(h.sourceCreated)}` : '書き下ろし'}`;
}
function historyTable(a) {
  const rows = HIST_KEYS.map(([k, name]) => {
    const v = a.history[k];
    const list = [].concat(v || []);
    const cell = list.length ? list.map((e) => `${histDate(e)}${e.label ? `（${esc(e.label)}）` : ''}`).join('<br>') : 'なし';
    return `<tr><th scope="row">${name}</th><td>${cell}</td></tr>`;
  }).join('');
  return `<section class="sec"><div class="wrap"><h2>制作履歴</h2><div class="tbl-wrap"><table class="tbl">${rows}</table></div><p class="note">「未確認」は記録で確認できない日付です。推測で埋めていません。</p></div></section>`;
}
function articleCard(a) {
  const url = articleUrl(a);
  const date = `<span class="note" style="margin:0">${dateLine(a)}</span>`;
  return `<article class="card"><span class="tag">${esc(a.category)}${a.type === 'note' ? '｜note' : ''}</span><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p>${date}<a class="btn ghost" href="${url}"${linkAttrs(url)} data-track="article_click" data-track-label="${esc(a.title)}">${a.type === 'note' ? '記事を読む（note）' : '記事を読む'} →</a></article>`;
}
function articlesIndex() {
  const cats = [...new Set(data.articles.map((a) => a.category))];
  const body = cats.map((c) => `<section class="sec"><div class="wrap"><h2>${esc(c)}</h2><div class="grid g2">${data.articles.filter((a) => a.category === c).map(articleCard).join('')}</div></div></section>`).join('')
    + nextBlock(['page:/resources/', 'page:/search/', 'consult']);
  return layout({ path: '/articles/', title: '記事一覧｜SK LABS', description: 'SK LABSのAI活用・無料資料・宇宙と星空に関する記事の一覧です。サイト内の記事とnoteで公開している記事をまとめています。', h1: '記事', eyebrow: 'ARTICLES', lead: 'AI活用、無料資料の使い方、宇宙・星空の情報をまとめています。noteで公開している記事はnoteへご案内します。', crumbs: [{ name: '記事', url: '/articles/' }], body });
}
function renderBody(blocks) {
  return blocks.map(([t, v]) => {
    if (t === 'p') return `<p>${esc(v)}</p>`;
    if (t === 'h2') return `<h2>${esc(v)}</h2>`;
    if (t === 'ul' || t === 'ol') return `<${t}>${v.map((x) => `<li>${esc(x)}</li>`).join('')}</${t}>`;
    throw new Error('未知のブロック ' + t);
  }).join('\n');
}
function articlePage(a) {
  const p = `/articles/${a.slug}/`;
  const share = `<div class="share"><span class="note" style="margin:0 6px 0 0">共有：</span><a href="https://x.com/intent/post?text=${encodeURIComponent(a.title)}&url=${encodeURIComponent(abs(p))}" target="_blank" rel="noopener noreferrer" data-track="share_click" data-track-label="X">Xで共有</a><a href="https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(abs(p))}" target="_blank" rel="noopener noreferrer" data-track="share_click" data-track-label="LINE">LINEで共有</a></div>`;
  const related = (a.related || []).map((s) => byId.article[s]).filter(Boolean);
  const idx = siteArticles.indexOf(a);
  const prev = siteArticles[idx - 1], next = siteArticles[idx + 1];
  const body = `<section class="sec"><div class="wrap"><div class="article">${renderBody(a.body)}${share}</div></div></section>
${related.length ? `<section class="sec"><div class="wrap"><h2>関連記事</h2><div class="grid g2">${related.map(articleCard).join('')}</div></div></section>` : ''}
${historyTable(a)}
${nextBlock(ctaRefs(a.cta || ['resources', 'consult']).concat(a.cta?.includes('consult') ? [] : ['consult']).slice(0, 3))}
<section class="sec"><div class="wrap" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px">${prev ? `<a href="/articles/${prev.slug}/">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="/articles/${next.slug}/">${esc(next.title)} →</a>` : ''}</div></section>`;
  const h = a.history;
  const meta = `<p class="meta">${hasSource(a) ? `元コンテンツ ${histDate(h.sourceCreated)}｜Web記事化 ${histDate(h.articleWritten)}` : `執筆 ${histDate(h.articleWritten)}（書き下ろし）`}｜公開 <time datetime="${a.published}">${jpDate(a.published)}</time>｜${esc(a.category)}</p>`;
  return layout({ path: p, title: `${a.title}｜SK LABS`, description: a.description, h1: a.title, eyebrow: a.category, lead: a.description, meta, ogType: 'article', crumbs: [{ name: '記事', url: '/articles/' }, { name: a.title, url: p }], body,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.description, datePublished: a.published, dateModified: a.updated, dateCreated: h.articleWritten.date, ...(hasSource(a) ? { isBasedOn: { '@type': 'CreativeWork', name: h.sourceCreated.label, dateCreated: h.sourceCreated.date } } : {}), mainEntityOfPage: abs(p), author: { '@type': 'Organization', name: 'SK LABS', url: SITE.url + '/' }, publisher: { '@type': 'Organization', name: 'SK LABS', url: SITE.url + '/' } }] });
}

// ── /tools/ ──
function toolsPage() {
  const t = data.tools;
  const rows = t.items.map((i) => `<tr><th scope="row">${esc(i.name)}</th><td>${esc(i.role)}</td><td>${esc(i.use)}</td><td>${esc(i.flow)}</td><td>${esc(i.caution)}</td></tr>`).join('');
  const cards = t.items.map((i) => `<article class="card"><span class="tag">${esc(i.role)}</span><h3>${esc(i.name)}</h3><p>${esc(i.use)}</p><dl><dt>主な工程</dt><dd>${esc(i.flow)}</dd><dt>注意点</dt><dd>${esc(i.caution)}</dd></dl></article>`).join('');
  const body = `<section class="sec"><div class="wrap"><h2>考え方：「どれが一番か」ではなく「何を任せるか」</h2><p class="lead">SK LABSでは、AIを性能で比べるのではなく、仕事の工程ごとに担当を決めて使い分けています。モデルの仕様・料金・機能は頻繁に変わるため、このページでは固定の性能比較や料金は掲載せず、役割と使い方の基準だけをまとめています。</p><div class="grid g3">${cards}</div></div></section>
<section class="sec"><div class="wrap"><h2>一覧で比べる</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>AI</th><th>SK LABSでの役割</th><th>任せていること</th><th>主な工程</th><th>注意点</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">根拠：${esc(t.basis)}。最終更新 ${jpDate(t.updated)}。</p></div></section>
<section class="sec"><div class="wrap"><h2>関連記事</h2><div class="grid g2">${articleCard(byId.article['ai-team-design'])}${articleCard(byId.article['starter-kit-guide'])}</div></div></section>
${nextBlock(['page:/ai-team/', 'resource:starter-vol2', 'consult'])}`;
  return layout({ path: '/tools/', title: 'AIツールの使い分け｜ChatGPT・Claude・Geminiの役割分担｜SK LABS', description: 'ChatGPT・Claude・Gemini・Copilot・Grok・Canvaを、SK LABSが実務でどう使い分けているか。用途・得意な工程・注意点をまとめています。', h1: 'AIツールの使い分け', eyebrow: 'AI TOOLS', lead: 'ChatGPT・Claude・Geminiなど、SK LABSが実際に使っているAIの役割と使い分けの基準です。', meta: `<p class="meta">最終更新 <time datetime="${t.updated}">${jpDate(t.updated)}</time></p>`, crumbs: [{ name: 'AIツール', url: '/tools/' }], body });
}

// ── /ai-team/ ──
function aiTeamPage() {
  const flow = data.workflow.map((w) => `<li><b>${esc(w.step)}</b><span class="ai">AI：${esc(w.ai)}</span>人：${esc(w.human)}</li>`).join('');
  const body = `<section class="sec"><div class="wrap"><h2>仕事の流れと、AI・人の担当</h2><p class="lead">SK LABSは、調査から改善までの工程ごとに、どのAIが何を担い、どこで人が判断するかを決めて仕事を進めています。</p><ol class="flow">${flow}</ol><p class="note">AIの役割は「SK LABS 全AI共通指示セット v3.2（2026年9月29日）」の定義に基づきます。確認できない情報は推測で埋めず、最終判断は人が行います。</p></div></section>
<section class="sec"><div class="wrap"><h2>運用のルール</h2><div class="grid g3">
<article class="card"><h3>正本は一か所</h3><p>Google Driveを唯一の正本とし、各AIは作業前に正本を確認してから動きます。</p></article>
<article class="card"><h3>推測で埋めない</h3><p>確認できない数字・URL・実績は「確認できない」と扱い、架空の情報を作りません。</p></article>
<article class="card"><h3>判断は人が持つ</h3><p>AIには作業を任せ、公開可否・事実確認・経営判断は人が最終決定します。</p></article>
</div></div></section>
${nextBlock(['page:/tools/', 'article:ai-team-design', 'consult'])}`;
  return layout({ path: '/ai-team/', title: 'AI TEAM：SK LABSがAIを組み合わせて仕事を進める仕組み｜SK LABS', description: '調査・企画・制作・品質確認・公開・計測・改善の各工程で、どのAIが何を担い、人がどこを判断するか。SK LABSのAI TEAMの仕組みを図解します。', h1: 'AI TEAMの仕組み', eyebrow: 'AI TEAM DESIGN', lead: '複数のAIに役割を持たせ、人が判断する。SK LABSの仕事の進め方です。', crumbs: [{ name: 'AI TEAM', url: '/ai-team/' }], body });
}

// ── /works/ ──
function worksPage() {
  const cards = data.works.map((w) => `<article class="card"><span class="tag">${esc(w.kind)}｜${esc(w.category)}</span><h3>${esc(w.title)}</h3><p>${esc(w.summary)}</p><p class="note" style="margin:0">${w.tags.map(esc).join(' / ')}</p>${w.url ? `<a class="btn ghost" href="${w.url}">見る →</a>` : ''}</article>`).join('');
  const body = `<section class="sec"><div class="wrap"><h2>自社プロジェクト</h2><p class="lead">SK LABSは自社プロジェクトを実験場にして、運用で得た知見を次の設計へ戻しています。ここでは公開できる自社プロジェクトのみを掲載しています（顧客事例・成果数値は掲載していません）。</p><div class="grid g2">${cards}</div></div></section>
${nextBlock(['page:/ai-team/', 'resource:starter-vol1', 'consult'], 'SK LABSへの相談')}`;
  return layout({ path: '/works/', title: '制作実績・自社プロジェクト｜SK LABS', description: 'SK LABSが実際に制作・運用している自社プロジェクト（公式サイト、無料資料、note運用基盤、Webアプリ、キャラクターIP、出版）を紹介します。', h1: '制作実績・実例', eyebrow: 'WORKS', lead: 'Web制作、資料制作、AI運用・自動化、コンテンツ制作。SK LABSが実際に作っているものです。', crumbs: [{ name: '制作実績', url: '/works/' }], body });
}

// ── /start/ ──
function diagBlock(idPrefix = 'd') {
  const d = data.diagnosis;
  const opts = d.options.map((o) => `<button type="button" data-diag="${o.id}" aria-pressed="false">${esc(o.label)}</button>`).join('');
  const results = d.options.map((o) => `<div class="diag-result" id="${idPrefix}-${o.id}" data-diag-result="${o.id}" hidden><p class="lead">${esc(o.lead)}</p><div class="grid g3">${o.links.map(refCard).join('')}</div></div>`).join('');
  return `<div class="diag" data-diag-root><p style="font-weight:800;margin-bottom:10px">${esc(d.question)}</p><div class="diag-opts">${opts}</div>${results}</div>`;
}
function startPage() {
  const body = `<section class="sec"><div class="wrap">${diagBlock('d')}<p class="note">選んだ内容はページ内で表示を切り替えるだけで、個人情報は保存しません。</p></div></section>`;
  return layout({ path: '/start/', title: 'あなたに合う入口｜SK LABS', description: 'AIで何をしたいかを選ぶと、SK LABSの無料記事・無料資料・note・相談の中から、最初に見るべきページをご案内します。', h1: 'あなたに合う入口', eyebrow: 'START HERE', lead: '目的を1つ選ぶと、最初に見るべきページをご案内します。', crumbs: [{ name: '入口診断', url: '/start/' }], body });
}

// ── /space/ ──
function spacePage() {
  const body = `<section class="sec"><div class="wrap"><div class="sp-grid">
<article class="card" data-sp="weather"><h3>今夜、星は見える？<span class="badge" data-badge>取得中</span></h3>
<label style="font-size:12.5px;color:#b9c6ff">都道府県（地域）を選択 <select data-sp-office></select></label>
<div class="big" data-sp-main>—</div><p data-sp-text>読み込み中…</p><ul class="plain" data-sp-areas></ul><p class="src" data-sp-src>出典：気象庁</p></article>
<article class="card" data-sp="moon"><h3>今日の月齢<span class="badge">計算値</span></h3><div class="big" data-sp-moon>—</div><p data-sp-moon-text></p><p class="src">本ページ内で計算（近似式）</p></article>
<article class="card" data-sp="meteor"><h3>次の流星群<span class="badge">計算値</span></h3><div class="big" data-sp-meteor>—</div><p data-sp-meteor-text></p><ul class="plain" data-sp-meteor-list></ul><p class="src">極大日は例年の目安（国立天文台・国際流星機構の公表値に基づく）</p></article>
<article class="card" data-sp="aurora"><h3>オーロラ活動<span class="badge" data-badge>取得中</span></h3><div class="big" data-sp-kp>Kp —</div><p data-sp-aurora-text>読み込み中…</p><p class="src" data-sp-aurora-src>出典：NOAA SWPC（惑星Kp指数）</p></article>
<article class="card" data-sp="apod"><h3>今日の宇宙写真<span class="badge" data-badge>取得中</span></h3><img class="apod" data-sp-apod-img alt="" hidden loading="lazy"><p data-sp-apod-text>読み込み中…</p><p class="src">出典：NASA Astronomy Picture of the Day</p></article>
<article class="card" data-sp="spots"><h3>観測スポット<span class="badge">DarkSky認定地</span></h3><ul class="plain">
<li><b>神津島（東京都）</b>星空保護区（2020年認定）</li><li><b>井原市美星町（岡山県）</b>星空保護区（2021年認定）</li><li><b>石垣島・西表島（沖縄県）</b>西表石垣国立公園・星空保護区（2018年認定）</li></ul>
<p class="src">国際ダークスカイ協会（DarkSky International）認定地。上の天気予報で各地域を選ぶと、その日の天気を確認できます（東京都・岡山県・八重山）。</p></article>
</div><p class="note">外部データ（気象庁・NASA・NOAA）を取得できない場合は「未取得」と表示し、推測値やサンプル値は表示しません。位置情報は使用しません。</p></div></section>
<section class="sec"><div class="wrap"><h2>関連記事</h2><div class="grid g2">${articleCard(byId.article['stargazing-checklist'])}${articleCard(byId.article['ai-team-design'])}</div></div></section>
${nextBlock(['article:stargazing-checklist', 'page:/articles/', 'page:/resources/'], 'もっと知る')}`;
  return layout({ path: '/space/', title: '今夜の星空・天気・流星群・オーロラ情報｜SK LABS 宇宙情報', description: '今夜、星は見える？ 都道府県別の天気（気象庁）、月齢、次の流星群、オーロラ活動（NOAA）、NASAの今日の宇宙写真、星空保護区の観測スポットをまとめて確認できます。', h1: '宇宙・星空情報', eyebrow: 'SPACE LIVE', lead: '天気・月齢・流星群・オーロラ・今日の宇宙写真を1ページで。出かける前の確認にどうぞ。', crumbs: [{ name: '宇宙・星空', url: '/space/' }], body, scripts: ['/assets/space.js'] });
}

// ── /search/ ──
function searchPage() {
  const body = `<section class="sec"><div class="wrap"><form class="search-box" role="search" data-search-form action="/search/"><input type="search" name="q" placeholder="例：AI活用ガイド、チェックリスト、流星群" aria-label="サイト内検索" data-search-input><button type="submit">検索</button></form><p class="note" data-search-status>記事・無料コンテンツ・AIツール・制作実績・サービスを検索できます。</p><div class="results" data-search-results></div></div></section>`;
  return layout({ path: '/search/', title: 'サイト内検索｜SK LABS', description: 'SK LABSの記事・無料コンテンツ・AIツール解説・制作実績・サービスを検索できます。', h1: 'サイト内検索', eyebrow: 'SEARCH', crumbs: [{ name: '検索', url: '/search/' }], body });
}

// ── 検索索引・新着 ──
function searchIndex() {
  const items = [];
  data.articles.forEach((a) => items.push({ type: '記事', title: a.title, text: a.description + ' ' + a.category + ' ' + (a.body ? a.body.map((b) => [].concat(b[1]).join(' ')).join(' ') : ''), url: articleUrl(a) }));
  data.resources.forEach((r) => items.push({ type: '無料資料', title: r.title, text: `${r.summary} ${r.audience} ${r.tags.join(' ')}`, url: r.url }));
  data.tools.items.forEach((t) => items.push({ type: 'AIツール', title: `${t.name}（${t.role}）`, text: `${t.use} ${t.flow} ${t.caution}`, url: '/tools/' }));
  data.works.forEach((w) => items.push({ type: '制作実績', title: w.title, text: `${w.summary} ${w.category} ${w.tags.join(' ')}`, url: w.url || '/works/' }));
  data.products.forEach((p) => items.push({ type: p.stage, title: p.url ? p.title : `${p.title}（${p.fallbackCta}）`, text: p.summary, url: p.url || p.fallbackUrl }));
  items.push({ type: 'サービス', title: '無料相談', text: 'AI導入 業務自動化 Web LP制作 コンテンツ制作 SNS運用 事業設計 相談 問い合わせ', url: SITE.consultMail });
  items.push({ type: 'サービス', title: 'AI TEAMの仕組み', text: 'AIチーム 役割分担 工程 調査 企画 制作 品質確認 公開 計測 改善', url: '/ai-team/' });
  items.push({ type: '宇宙情報', title: '宇宙・星空情報', text: '天気 星空 月齢 流星群 オーロラ 宇宙写真 観測スポット 星空保護区', url: '/space/' });
  return items.map((i) => ({ ...i, text: i.text.replace(/\s+/g, ' ').trim() }));
}
function updates() {
  const list = [];
  // date は「このサイトに掲載した日」。元になった原稿・資料の作成日は note に書き、新作に見せない
  siteArticles.forEach((a) => list.push({ date: a.published, dateType: 'サイト掲載日', kind: hasSource(a) ? 'Web記事化' : '新規記事', title: a.title, note: hasSource(a) ? `元コンテンツ：${histDate(a.history.sourceCreated)}` : '', url: articleUrl(a) }));
  list.push({ date: '2026-09-30', dateType: 'サイト掲載日', kind: 'ページ新設', title: '無料コンテンツのまとめページを新設', note: '資料そのものは2026年7月30日作成', url: '/resources/' });
  list.push({ date: '2026-09-30', dateType: 'サイト掲載日', kind: 'ページ新設', title: '宇宙・星空情報を専用ページとして新設（天気・流星群・オーロラ・観測スポット）', note: 'トップの宇宙情報は2026年7月30日から掲載', url: '/space/' });
  list.push({ date: '2026-09-30', dateType: 'サイト掲載日', kind: 'ページ新設', title: 'AIツールの使い分けページを新設', note: '役割分担の元原稿は2026年7月15日', url: '/tools/' });
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

// ── トップページへの差し込み（マーカー間を置換） ──
function topInjections() {
  const news = updates().slice(0, 6).map((u) => `<li><time datetime="${u.date}">${jpDate(u.date)}</time><span class="rh-cat">${esc(u.kind)}</span><a href="${u.url}">${esc(u.title)}</a>${u.note ? `<small class="news-note">（${esc(u.note)}）</small>` : ''}</li>`).join('');
  const tools = data.tools.items.map((i) => `<li><b>${esc(i.name)}</b><span>${esc(i.role)}</span></li>`).join('');
  const flow = data.workflow.map((w) => `<li><b>${esc(w.step)}</b><span>${esc(w.ai)}</span></li>`).join('');
  const works = data.works.slice(0, 4).map((w) => `<article class="rh-card"><span class="rh-cat">${esc(w.kind)}｜${esc(w.category)}</span><h3>${esc(w.title)}</h3><p>${esc(w.summary)}</p></article>`).join('');
  return {
    diagnosis: diagBlock('top-d').replace(/class="card"/g, 'class="rh-card"').replace(/class="btn( ghost)?"/g, 'class="rh-btn"').replace(/class="grid g3"/g, 'class="rh-grid rh-grid-3"'),
    news: `<ul class="news-list">${news}</ul><p class="rh-note">※日付はこのサイトに掲載した日です。元になった原稿・資料の作成日は括弧内と各記事の「制作履歴」に記載しています。</p>`,
    aitools: `<ul class="tool-chips">${tools}</ul><ol class="flow-mini">${flow}</ol>`,
    works: `<div class="rh-grid rh-grid-4">${works}</div>`,
    articles: `<div class="rh-grid rh-grid-3">${siteArticles.map((a) => `<article class="rh-card"><span class="rh-cat">${esc(a.category)}</span><p class="rh-date">${esc(dateLine(a))}</p><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p><a class="rh-btn" href="/articles/${a.slug}/" data-track="article_click" data-track-label="${esc(a.title)}">記事を読む →</a></article>`).join('')}</div><div class="rh-more"><a href="/articles/">記事一覧を見る →</a></div>`,
  };
}

// ── sitemap ──
function sitemap() {
  const urls = ['/', '/starter-kit', ...Object.keys(PAGES), ...siteArticles.map((a) => `/articles/${a.slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${abs(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

out.set('resources/index.html', resourcesPage());
out.set('articles/index.html', articlesIndex());
siteArticles.forEach((a) => out.set(`articles/${a.slug}/index.html`, articlePage(a)));
out.set('tools/index.html', toolsPage());
out.set('ai-team/index.html', aiTeamPage());
out.set('works/index.html', worksPage());
out.set('start/index.html', startPage());
out.set('space/index.html', spacePage());
out.set('search/index.html', searchPage());
out.set('data/search-index.json', JSON.stringify(searchIndex()) + '\n');
out.set('data/updates.json', JSON.stringify(updates(), null, 1) + '\n');
out.set('sitemap.xml', sitemap());

const inj = topInjections();
let top = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
for (const [k, v] of Object.entries(inj)) {
  const re = new RegExp(`(<!-- BUILD:${k} -->)[\\s\\S]*?(<!-- /BUILD:${k} -->)`);
  if (!re.test(top)) throw new Error(`index.html にマーカー BUILD:${k} がありません`);
  top = top.replace(re, `$1\n${v}\n$2`);
}
out.set('index.html', top);

let drift = [];
for (const [rel, content] of out) {
  const f = path.join(PUB, rel);
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  if (cur === content) continue;
  if (CHECK) { drift.push(rel); continue; }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  console.log('生成:', rel);
}
if (CHECK && drift.length) {
  console.error('生成物が content/site.json と一致しません。`node scripts/build-pages.mjs` を実行してください:\n' + drift.join('\n'));
  process.exit(1);
}
console.log(CHECK ? '生成物チェック合格' : '生成完了');
