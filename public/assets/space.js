/* /space/ 宇宙・星空情報ページ
   ・天気：気象庁の予報データを /api/weather?office= 経由で取得（位置情報は使わず、地域を利用者が選択）
   ・月齢・流星群：ページ内計算（トップページと同じ近似式）
   ・オーロラ：NOAA SWPC、今日の宇宙写真：/api/apod（NASA）
   取得できない場合は「未取得」と表示し、推測値・サンプル値は表示しない */
(function () {
  'use strict';
  var track = function (n, p) { if (typeof window.SKLABS_TRACK === 'function') window.SKLABS_TRACK(n, p || {}); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function timeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }
  function getJson(u, ms) { return timeout(fetch(u), ms).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function badge(card, ok) {
    var b = $('[data-badge]', card); if (!b) return;
    b.textContent = ok ? 'LIVE' : '未取得';
    b.className = 'badge ' + (ok ? 'live' : 'na');
  }
  function fail(el, msg, href, label) {
    el.textContent = msg + ' ';
    var a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = label; a.style.textDecoration = 'underline';
    el.appendChild(a);
  }
  track('space_view', {});

  /* 気象庁 府県予報区（office コード） */
  var OFFICES = [['011000','北海道（宗谷）'],['012000','北海道（上川・留萌）'],['013000','北海道（網走・北見・紋別）'],['014030','北海道（十勝）'],['014100','北海道（釧路・根室）'],['015000','北海道（胆振・日高）'],['016000','北海道（石狩・空知・後志）'],['017000','北海道（渡島・檜山）'],['020000','青森県'],['030000','岩手県'],['040000','宮城県'],['050000','秋田県'],['060000','山形県'],['070000','福島県'],['080000','茨城県'],['090000','栃木県'],['100000','群馬県'],['110000','埼玉県'],['120000','千葉県'],['130000','東京都'],['140000','神奈川県'],['150000','新潟県'],['160000','富山県'],['170000','石川県'],['180000','福井県'],['190000','山梨県'],['200000','長野県'],['210000','岐阜県'],['220000','静岡県'],['230000','愛知県'],['240000','三重県'],['250000','滋賀県'],['260000','京都府'],['270000','大阪府'],['280000','兵庫県'],['290000','奈良県'],['300000','和歌山県'],['310000','鳥取県'],['320000','島根県'],['330000','岡山県'],['340000','広島県'],['350000','山口県'],['360000','徳島県'],['370000','香川県'],['380000','愛媛県'],['390000','高知県'],['400000','福岡県'],['410000','佐賀県'],['420000','長崎県'],['430000','熊本県'],['440000','大分県'],['450000','宮崎県'],['460100','鹿児島県'],['460040','鹿児島県（奄美）'],['471000','沖縄県（沖縄本島）'],['472000','沖縄県（大東島）'],['473000','沖縄県（宮古島）'],['474000','沖縄県（八重山）']];
  var wCard = $('[data-sp="weather"]');
  var sel = $('[data-sp-office]', wCard);
  OFFICES.forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); });
  var saved = null; try { saved = localStorage.getItem('sklabs_office'); } catch (e) {}
  sel.value = saved && OFFICES.some(function (o) { return o[0] === saved; }) ? saved : '140000';
  function hint(w) {
    if (/雨|雪/.test(w)) return '星空観測には不向きな予報です。';
    if (/晴/.test(w) && !/くもり|曇/.test(w)) return '晴れ間が期待でき、星空観測の好機です。';
    if (/晴/.test(w)) return '晴れ間があれば星空観測のチャンスがあります。';
    return '雲が多く、星空は見えにくい予報です。';
  }
  function popLabel(p) { var h = new Date(new Date(p.from).getTime() + 9 * 3600000).getUTCHours(); return h + '〜' + ((h + 6) % 24 || 24) + '時 ' + p.pop + '%'; }
  function loadWeather() {
    var main = $('[data-sp-main]', wCard), text = $('[data-sp-text]', wCard), list = $('[data-sp-areas]', wCard), src = $('[data-sp-src]', wCard);
    main.textContent = '—'; text.textContent = '読み込み中…'; list.innerHTML = '';
    getJson('/api/weather?office=' + sel.value, 10000).then(function (d) {
      var areas = (d && d.areas) || [];
      if (!areas.length) throw new Error('empty');
      var a0 = areas[0];
      main.textContent = a0.weather;
      text.textContent = a0.area + '：' + hint(a0.weather) + (a0.pops.length ? '（降水確率 ' + a0.pops.map(popLabel).join('／') + '）' : '');
      areas.slice(1).forEach(function (a) { var li = document.createElement('li'); li.textContent = a.area + '：' + a.weather; list.appendChild(li); });
      src.textContent = '出典：気象庁' + (d.reportDatetime ? '（' + d.reportDatetime.replace('T', ' ').slice(0, 16) + ' 発表）' : '');
      badge(wCard, true);
    }).catch(function () {
      fail(text, '気象庁の予報データを取得できませんでした。', 'https://www.jma.go.jp/bosai/forecast/', '気象庁で見る');
      badge(wCard, false);
    });
  }
  sel.addEventListener('change', function () { try { localStorage.setItem('sklabs_office', sel.value); } catch (e) {} track('space_region_select', { office: sel.value }); loadWeather(); });
  loadWeather();

  /* 月齢・流星群（計算） */
  function moon(ms) {
    var d = (ms - 946728000000) / 86400000;
    var Lm = 218.316 + 13.176396 * d, Mm = (134.963 + 13.064993 * d) * Math.PI / 180;
    var lamM = Lm + 6.289 * Math.sin(Mm) * 180 / Math.PI;
    var Ls = 280.460 + .9856474 * d, Ms = (357.528 + .9856003 * d) * Math.PI / 180;
    var lamS = Ls + 1.915 * Math.sin(Ms) * 180 / Math.PI;
    var el = ((lamM - lamS) % 360 + 360) % 360;
    return { age: el / 360 * 29.53, illum: (1 - Math.cos(el * Math.PI / 180)) / 2, el: el };
  }
  var m = moon(Date.now());
  var names = ['新月', '三日月', '上弦の月', '十三夜月', '満月', '十六夜月', '下弦の月', '二十六夜月'];
  $('[data-sp-moon]').textContent = '月齢 ' + m.age.toFixed(1);
  $('[data-sp-moon-text]').textContent = names[Math.round(m.el / 45) % 8] + '・輝面比' + Math.round(m.illum * 100) + '%。' + (m.illum < .3 ? '月明かりが少なく、暗い星まで見やすい夜です。' : m.illum < .7 ? '月明かりの影響がやや出ます。' : '月明かりが強く、暗い星は見えにくい夜です。');

  var SHOWERS = [['しぶんぎ座流星群', 1, 4, 80], ['4月こと座流星群', 4, 22, 18], ['みずがめ座η流星群', 5, 6, 50], ['みずがめ座δ南流星群', 7, 30, 25], ['ペルセウス座流星群', 8, 13, 100], ['オリオン座流星群', 10, 21, 20], ['しし座流星群', 11, 17, 15], ['ふたご座流星群', 12, 14, 150]];
  var j = new Date(Date.now() + 9 * 3600000), today = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate());
  var up = [];
  SHOWERS.forEach(function (s) { [j.getUTCFullYear(), j.getUTCFullYear() + 1].forEach(function (y) { var pk = Date.UTC(y, s[1] - 1, s[2]); var days = Math.round((pk - today) / 86400000); if (days >= 0) up.push({ n: s[0], m: s[1], d: s[2], zhr: s[3], days: days, pk: pk }); }); });
  up.sort(function (a, b) { return a.days - b.days; });
  var n0 = up[0], mi = moon(n0.pk - 9 * 3600000 + 22 * 3600000).illum;
  $('[data-sp-meteor]').textContent = n0.n;
  $('[data-sp-meteor-text]').textContent = (n0.days === 0 ? '今夜が極大の目安' : '極大 ' + n0.m + '月' + n0.d + '日頃（あと' + n0.days + '日）') + '。条件の良い暗い空で1時間あたり最大' + n0.zhr + '個程度が目安。' + (mi < .3 ? '月明かりの影響が少ない好条件です。' : mi < .7 ? '月明かりの影響がやや出ます。' : '月明かりの影響が大きい条件です。');
  up.slice(1, 3).forEach(function (s) { var li = document.createElement('li'); li.textContent = s.n + '｜' + s.m + '月' + s.d + '日頃（あと' + s.days + '日）'; $('[data-sp-meteor-list]').appendChild(li); });

  /* オーロラ（NOAA SWPC） */
  var aCard = $('[data-sp="aurora"]');
  getJson('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', 8000).then(function (d) {
    var last = d[d.length - 1];
    var kp = last.kp_index;
    $('[data-sp-kp]').textContent = 'Kp ' + kp;
    $('[data-sp-aurora-text]').textContent = kp >= 8 ? '北海道など高緯度で見える可能性があります。' : kp >= 6 ? '低緯度オーロラの可能性はわずかにあります。' : '日本での観測は期待しにくい水準です。';
    if (last.time_tag) $('[data-sp-aurora-src]').textContent = '出典：NOAA SWPC（惑星Kp指数・' + last.time_tag.replace('T', ' ').slice(0, 16) + ' UTC）';
    badge(aCard, true);
  }).catch(function () {
    fail($('[data-sp-aurora-text]'), 'NOAAの公開データを取得できませんでした。', 'https://www.swpc.noaa.gov/products/planetary-k-index', 'NOAA公式で見る');
    badge(aCard, false);
  });

  /* 今日の宇宙写真（NASA APOD、自サイトのEdge Function経由） */
  var pCard = $('[data-sp="apod"]'), img = $('[data-sp-apod-img]'), ptext = $('[data-sp-apod-text]');
  getJson('/api/apod', 10000).then(function (p) {
    if (!p || !p.image) throw new Error('empty');
    img.src = p.image; img.alt = p.title; img.hidden = false;
    ptext.textContent = p.title + '（' + p.date + '）' + (p.copyright ? ' © ' + p.copyright : '') + ' ';
    var a = document.createElement('a'); a.href = p.pageUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'NASAで見る'; a.style.textDecoration = 'underline';
    ptext.appendChild(a);
    badge(pCard, true);
  }).catch(function () {
    fail(ptext, 'NASAの公開サーバーから本日の写真を取得できませんでした。', 'https://apod.nasa.gov/apod/astropix.html', 'NASA公式で見る');
    badge(pCard, false);
  });
})();
