/* SK LABS 共通スクリプト：モバイルメニュー・入口診断・サイト内検索
   計測は measurement.js（GA4）に集約し、ここからは window.SKLABS_TRACK を呼ぶだけにする */
(function () {
  'use strict';
  var track = function (name, params) {
    if (typeof window.SKLABS_TRACK === 'function') window.SKLABS_TRACK(name, params || {});
  };

  /* モバイルメニュー（下層ページ共通ヘッダー） */
  var gh = document.querySelector('.gh');
  var menuBtn = gh && gh.querySelector('.gh-menu');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = gh.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* 入口診断：選択肢ごとに用意済みの結果ブロックを表示するだけ（個人情報は保存しない） */
  document.querySelectorAll('[data-diag-root]').forEach(function (root) {
    var started = false;
    root.querySelectorAll('[data-diag]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-diag');
        if (!started) { started = true; track('diagnosis_start', {}); }
        root.querySelectorAll('[data-diag]').forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
        root.querySelectorAll('[data-diag-result]').forEach(function (r) { r.hidden = r.getAttribute('data-diag-result') !== id; });
        var shown = root.querySelector('[data-diag-result="' + id + '"]');
        track('diagnosis_result', { diagnosis_answer: id });
        if (shown) {
          shown.querySelectorAll('a[href]').forEach(function (a) { a.setAttribute('data-diag-answer', id); });
          shown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
    root.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-diag-answer]');
      if (a) track('diagnosis_click', { diagnosis_answer: a.getAttribute('data-diag-answer'), link_url: a.href });
    });
  });

  /* サイト内検索：/data/search-index.json を読み込み、部分一致で絞り込む */
  var form = document.querySelector('[data-search-form]');
  if (form) {
    var input = form.querySelector('[data-search-input]');
    var status = document.querySelector('[data-search-status]');
    var box = document.querySelector('[data-search-results]');
    var index = null;
    var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var norm = function (s) { return String(s).toLowerCase().normalize('NFKC'); };
    function load() {
      if (index) return Promise.resolve(index);
      return fetch('/data/search-index.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { index = d; return d; });
    }
    function run(q) {
      q = (q || '').trim();
      box.innerHTML = '';
      if (!q) { status.textContent = '記事・無料コンテンツ・AIツール・制作実績・サービスを検索できます。'; return; }
      load().then(function (items) {
        var terms = norm(q).split(/\s+/).filter(Boolean);
        var hits = items.map(function (it) {
          var t = norm(it.title), b = norm(it.text + ' ' + it.type);
          var score = 0;
          for (var i = 0; i < terms.length; i++) {
            if (t.indexOf(terms[i]) >= 0) score += 3; else if (b.indexOf(terms[i]) >= 0) score += 1; else return null;
          }
          return { it: it, score: score };
        }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
        track('search', { search_term: q, results: hits.length });
        if (!hits.length) {
          status.textContent = '「' + q + '」に一致するページは見つかりませんでした。';
          box.innerHTML = '<div class="card"><h3>別の探し方</h3><p>キーワードを短くするか、次のページから探してください。</p><p><a class="btn ghost" href="/articles/">記事一覧</a> <a class="btn ghost" href="/resources/">無料コンテンツ</a> <a class="btn ghost" href="/start/">入口診断</a></p></div>';
          return;
        }
        status.textContent = '「' + q + '」の検索結果：' + hits.length + '件';
        box.innerHTML = hits.map(function (h) {
          var ext = /^https?:/.test(h.it.url);
          return '<article class="card"><span class="tag">' + esc(h.it.type) + '</span><h3><a href="' + esc(h.it.url) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + ' data-track="search_result_click" data-track-label="' + esc(h.it.title) + '">' + esc(h.it.title) + '</a></h3><p>' + esc(h.it.text.slice(0, 120)) + (h.it.text.length > 120 ? '…' : '') + '</p></article>';
        }).join('');
      }).catch(function () {
        status.textContent = '検索データを読み込めませんでした。時間をおいて再度お試しください。';
      });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value;
      history.replaceState(null, '', '/search/?q=' + encodeURIComponent(q));
      run(q);
    });
    var initial = new URLSearchParams(location.search).get('q');
    if (initial) { input.value = initial; run(initial); }
  }
})();
