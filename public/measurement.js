/* SK LABS 計測基盤
 * GA4 Measurement ID が設定されるまで外部通信は行わない。
 * 設定後、ページ表示と主要CTA/SNSクリックをイベント送信する。
 */
(function () {
  'use strict';

  var measurementId = (window.SKLABS_ANALYTICS && window.SKLABS_ANALYTICS.ga4MeasurementId) || '';
  var enabled = /^G-[A-Z0-9]+$/i.test(measurementId);

  function classifyLink(anchor) {
    var href = anchor.getAttribute('href') || '';
    if (/^mailto:info@sk-labs\.net/i.test(href)) {
      return { name: 'contact_click', params: { contact_method: 'email' } };
    }
    if (/^https?:\/\/(www\.)?instagram\.com\//i.test(href)) {
      return { name: 'sns_click', params: { sns_name: 'instagram' } };
    }
    if (/^https?:\/\/(www\.)?x\.com\//i.test(href)) {
      return { name: 'sns_click', params: { sns_name: 'x' } };
    }
    if (/^https?:\/\/note\.com\//i.test(href)) {
      return { name: 'sns_click', params: { sns_name: 'note' } };
    }
    return null;
  }

  window.SKLABS_TRACK = function (eventName, params) {
    if (!enabled || typeof window.gtag !== 'function') return false;
    window.gtag('event', eventName, params || {});
    return true;
  };

  if (!enabled) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId);

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(script);

  document.addEventListener('click', function (event) {
    var anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor) return;
    var tracked = classifyLink(anchor);
    if (!tracked) return;
    tracked.params.link_url = anchor.href;
    tracked.params.link_text = (anchor.textContent || '').trim().slice(0, 100);
    window.SKLABS_TRACK(tracked.name, tracked.params);
  }, true);
})();
