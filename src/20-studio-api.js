  // ─── Studio Server API (same origin — cookie session) ─────────────────────
  // Studio uses cookie-based sessions on current Studio Server versions:
  // requests authenticate via the session cookie plus the
  // X-WoodWing-Application header (CSRF guard), with Ticket set to null in
  // the payload. On older ticket-based setups getInfo().Ticket is populated
  // and used instead. (Same pattern as the word-digital-article-builder
  // plug-in, proven on this server.)
  var WW_APP = 'Content Station';
  var WW_APP_HEADER = { 'X-WoodWing-Application': WW_APP };

  function getTicket() {
    try {
      var info = ContentStationSdk.getInfo();
      return (info && info.Ticket) || '';
    } catch (e) { return ''; }
  }

  function serverIndexUrl() {
    // The PO iframe lives at /app/publicationoverview/, so a host-absolute
    // path is the safe default; csConfig is used when exposed in this frame.
    var rel = (window.csConfig && window.csConfig.serverUrl) || '/server/index.php';
    return new URL(rel, window.location.href).href;
  }

  function callServer(method, params) {
    params = params || {};
    if (!('Ticket' in params) || !params.Ticket) params.Ticket = getTicket() || null;
    return fetch(serverIndexUrl() + '?protocol=JSON&method=' + encodeURIComponent(method), {
      method: 'POST',
      credentials: 'same-origin',
      headers: Object.assign({ 'Content-Type': 'application/json' }, WW_APP_HEADER),
      body: JSON.stringify({ method: method, id: '1', params: [params], jsonrpc: '2.0' }),
    }).then(function (r) {
      if (!r.ok) throw new Error(method + ' failed: HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (j.error) {
        console.error(TAG + ' ' + method + ' error response:', j.error);
        var e = j.error;
        var parts = [];
        if (e.message) parts.push(e.message);
        if (e.data && e.data.detail && e.data.detail !== e.message) parts.push(e.data.detail);
        if (e.code) parts.push('(code ' + e.code + ')');
        throw new Error(method + ' failed: ' + (parts.join(' — ') || JSON.stringify(e)));
      }
      return j.result;
    });
  }

  // Download a rendition file. FileUrls from GetPages point at the Transfer
  // Server and return HTTP 400 ("Please specify ticket param") unless the
  // ww-app parameter is present, which makes the session cookie apply —
  // verified against this server.
  function fetchBinary(url) {
    if (url.indexOf('ww-app=') === -1) {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'ww-app=' + encodeURIComponent(WW_APP);
    }
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('Rendition download failed: HTTP ' + r.status);
      return r.arrayBuffer();
    });
  }

  function notify(content, type) {
    try {
      ContentStationSdk.showNotification({ content: content, type: type || 'default', timeout: 6000, showX: true });
    } catch (e) {
      console.info(TAG + ' ' + content);
    }
  }
