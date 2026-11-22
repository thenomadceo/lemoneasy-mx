/* Page measurement for the two hotel pages (/hotel/ and /hotel/beratung/).
   Sends anonymous events to the same first-party endpoint the lead form
   already posts to. No name, email, phone or field value is ever sent.

   Always sent (no cookie, id kept in memory only):
     page_view, checkout_click (a package button), cta_click, form_submit.
   Sent only after the visitor accepted the banner (lemoneasy_consent):
     scroll (25, 50, 75, 100), field_focus (field NAME only), page_leave
     (seconds the page was visible), plus the Microsoft Clarity session
     recording. After consent the visit id is kept in
     sessionStorage so /hotel/ and /hotel/beratung/ count as one visit.

   The page sets its slug on <html data-track-page="...">. */
(function () {
  try {
    if (navigator.webdriver === true) return;
    if (/bot|crawl|spider|headless|lighthouse|facebookexternalhit|meta-externalagent/i.test(navigator.userAgent || '')) return;

    var API = 'https://www.founderscale.ceo/api/lp-track';
    var CLIENT_ID = 'client-1782678921521';
    var CONSENT_KEY = 'lemoneasy_consent';
    var SESSION_KEY = 'lemoneasy_visit';
    var slug = document.documentElement.getAttribute('data-track-page') || 'lemoneasy-hotel';

    function consented() {
      try { return localStorage.getItem(CONSENT_KEY) === 'granted'; } catch (e) { return false; }
    }

    var sid = null;
    function sessionId() {
      if (sid) return sid;
      if (consented()) {
        try { sid = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
      }
      if (!sid || !/^[A-Za-z0-9-]{8,64}$/.test(sid)) {
        sid = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24);
      }
      persist();
      return sid;
    }
    function persist() {
      if (!sid || !consented()) return;
      try { sessionStorage.setItem(SESSION_KEY, sid); } catch (e) {}
    }

    var qs = new URLSearchParams(window.location.search);
    function send(event, meta) {
      try {
        var m = {};
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
          var v = qs.get(k);
          if (v) m[k] = v;
        });
        if (meta) for (var k in meta) m[k] = meta[k];
        var body = JSON.stringify({
          pageSlug: slug, clientId: CLIENT_ID, variant: 'A', sessionId: sessionId(), event: event, meta: m
        });
        // keepalive lets the request finish when the visitor leaves the page.
        fetch(API, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: body,
          keepalive: true, credentials: 'omit'
        }).catch(function () {});
      } catch (e) {}
    }
    function sendIfConsented(event, meta) { if (consented()) send(event, meta); }

    send('page_view');

    // Session recording (Microsoft Clarity, the project the other
    // lemoneasy.shop pages already use). Loaded only after consent.
    var clarityLoaded = false;
    function loadClarity() {
      if (clarityLoaded || !consented()) return;
      clarityLoaded = true;
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
      })(window, document, 'clarity', 'script', 'y4jlwestdp');
    }
    loadClarity();

    // How far the page was read.
    var sentDepth = {};
    function onScroll() {
      try {
        var doc = document.documentElement;
        var max = Math.max(doc.scrollHeight - window.innerHeight, 1);
        var pct = Math.min(100, Math.round(((window.pageYOffset || doc.scrollTop || 0) / max) * 100));
        [25, 50, 75, 100].forEach(function (t) {
          if (pct >= t && !sentDepth[t] && consented()) {
            sentDepth[t] = true;
            send('scroll', { scroll_depth: String(t) });
          }
        });
      } catch (e) {}
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // A visitor who accepts mid-visit: keep the id and report where they are.
    var accept = document.getElementById('consent-accept');
    if (accept) accept.addEventListener('click', function () { setTimeout(function () { persist(); onScroll(); loadClarity(); }, 0); });

    // Seconds the page was actually visible, each time it is hidden.
    var shownAt = Date.now(), leaves = 0;
    document.addEventListener('visibilitychange', function () {
      try {
        if (document.visibilityState === 'hidden') {
          if (leaves++ < 5) sendIfConsented('page_leave', { active_s: String(Math.round((Date.now() - shownAt) / 1000)) });
        } else { shownAt = Date.now(); }
      } catch (e) {}
    });

    // First focus of each form field. The field NAME only, never a value.
    var focused = {};
    document.addEventListener('focusin', function (e) {
      try {
        var t = e.target;
        if (!t || !/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
        var name = String(t.name || t.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
        if (!name || name === 'website' || focused[name]) return;
        focused[name] = true;
        sendIfConsented('field_focus', { field: name });
      } catch (err) {}
    }, true);

    // Clicks that matter: a package button, the jump to the packages, Peter.
    function label(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60); }
    document.addEventListener('click', function (e) {
      try {
        var a = e.target && e.target.closest ? e.target.closest('a, button') : null;
        if (!a) return;
        var pack = a.getAttribute('data-hotel-pack');
        if (pack) { send('checkout_click', { element: 'pack-' + pack, text: label(a) }); return; }
        var href = a.getAttribute('href') || '';
        if (/meetings\.hubspot\.com/i.test(href)) { send('cta_click', { element: 'peter-calendar', text: label(a) }); return; }
        if (/beratung/i.test(href)) { send('cta_click', { element: 'peter-page', text: label(a) }); return; }
        if (/^#(shop|gespraech)/i.test(href)) { send('cta_click', { element: href.slice(1), text: label(a) }); return; }
      } catch (err) {}
    }, true);

    // A click on the real submit button (an attempt, before validation).
    document.addEventListener('submit', function () { send('form_submit'); }, true);
  } catch (e) {}
})();
