  // ─── Styling engine ────────────────────────────────────────────────────────
  // Decorates the Publication Overview page tiles. Deliberately defensive:
  // WoodWing does not document the PO DOM, so every selector lives in the
  // SELECTORS map below (patch here after a Studio upgrade), every pass is
  // wrapped in try/catch, and after 3 consecutive failures the engine turns
  // itself off for the session without touching the export functionality.
  // All decoration is keyed off ppx-* classes so removal fully reverts it.

  var SELECTORS = {
    tile: 'po-page-component',
    footer: '.page-footer-wrapper',
    pageNumber: '.page-number span',
    grid: 'po-spread-view',
  };

  var STYLING_CSS =
    'po-page-component.ppx-tile{position:relative}' +
    '.ppx-badge{position:absolute;top:8px;right:8px;z-index:5;background:rgba(46,158,60,.92);color:#fff;' +
      'font-size:10px;font-weight:700;letter-spacing:.08em;padding:3px 8px;border-radius:3px;pointer-events:none;' +
      'box-shadow:0 1px 4px rgba(0,0,0,.3)}' +
    '.ppx-accent-bar{position:absolute;left:0;right:0;bottom:0;height:4px;z-index:4;pointer-events:none}' +
    'po-page-component.ppx-overdue{outline:2px solid #c0392b;outline-offset:-2px;animation:ppx-pulse 1.6s ease-in-out infinite}' +
    '@keyframes ppx-pulse{0%,100%{outline-color:rgba(192,57,43,.9)}50%{outline-color:rgba(192,57,43,.25)}}' +
    '[data-ppx-density="compact"] .spread-view{zoom:0.7}' +
    '[data-ppx-density="large"] .spread-view{zoom:1.35}';

  var styling = (function () {
    var observer = null;
    var model = null;
    var failures = 0;
    var disabled = false;
    var scheduled = false;

    function injectCss() {
      if (!document.getElementById('ppx-styling-styles')) {
        var st = document.createElement('style');
        st.id = 'ppx-styling-styles';
        st.textContent = STYLING_CSS;
        document.head.appendChild(st);
      }
    }

    function pageByNumber(num) {
      if (!model) return null;
      for (var i = 0; i < model.pages.length; i++) {
        if (model.pages[i].pageNumber === String(num)) return model.pages[i];
      }
      return null;
    }

    function isPressState(settings, stateName) {
      var name = String(stateName || '').toLowerCase();
      return settings.pressStatusNames.some(function (s) { return s.toLowerCase() === name; });
    }

    function decorateTile(tile, settings) {
      var numEl = tile.querySelector(SELECTORS.pageNumber);
      if (!numEl) return;
      var page = pageByNumber(numEl.textContent.trim());
      var layout = page && model.layouts[page.layoutId];

      tile.classList.add('ppx-tile');

      // badge
      var badge = tile.querySelector(':scope > .ppx-badge');
      var wantBadge = settings.badgeEnabled && layout && isPressState(settings, layout.stateName);
      if (wantBadge && !badge) {
        badge = document.createElement('div');
        badge.className = 'ppx-badge';
        tile.appendChild(badge);
      }
      if (badge) {
        if (wantBadge) badge.textContent = settings.badgeLabel || 'PRESS';
        else badge.remove();
      }

      // status accent
      var bar = tile.querySelector(':scope > .ppx-accent-bar');
      var wantBar = settings.accentsEnabled && layout && layout.stateColor;
      if (wantBar && !bar) {
        bar = document.createElement('div');
        bar.className = 'ppx-accent-bar';
        tile.appendChild(bar);
      }
      if (bar) {
        if (wantBar) bar.style.background = layout.stateColor;
        else bar.remove();
      }

      // overdue pulse
      var overdue = false;
      if (settings.overdueEnabled && layout && layout.deadline && !isPressState(settings, layout.stateName)) {
        var dl = new Date(layout.deadline);
        overdue = !isNaN(dl.getTime()) && dl.getTime() < Date.now();
      }
      tile.classList.toggle('ppx-overdue', overdue);
    }

    function pass() {
      scheduled = false;
      if (disabled || !model) return;
      try {
        var settings = loadSettings();
        var tiles = document.querySelectorAll(SELECTORS.tile);
        for (var i = 0; i < tiles.length; i++) decorateTile(tiles[i], settings);
        var grid = document.querySelector(SELECTORS.grid);
        if (grid) {
          if (settings.density && settings.density !== 'normal') grid.setAttribute('data-ppx-density', settings.density);
          else grid.removeAttribute('data-ppx-density');
        }
        failures = 0;
      } catch (e) {
        failures++;
        console.warn(TAG + ' styling pass failed (' + failures + '/3): ' + e.message);
        if (failures >= 3) stop('repeated DOM errors — Studio update? See docs/discovery-notes.md SELECTORS.');
      }
    }

    function schedule() {
      if (scheduled || disabled) return;
      scheduled = true;
      requestAnimationFrame(function () { setTimeout(pass, 100); });
    }

    function start(newModel) {
      model = newModel;
      if (disabled) return;
      injectCss();
      if (!observer) {
        observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true });
      }
      schedule();
    }

    function stop(reason) {
      disabled = true;
      if (observer) { observer.disconnect(); observer = null; }
      try {
        document.querySelectorAll('.ppx-badge,.ppx-accent-bar').forEach(function (n) { n.remove(); });
        document.querySelectorAll('.ppx-overdue').forEach(function (n) { n.classList.remove('ppx-overdue'); });
        var grid = document.querySelector(SELECTORS.grid);
        if (grid) grid.removeAttribute('data-ppx-density');
      } catch (e) { /* best effort */ }
      console.warn(TAG + ' styling disabled: ' + (reason || 'stopped'));
    }

    return {
      start: start,
      stop: stop,
      refresh: schedule,
      setModel: function (m) { model = m; schedule(); },
      _state: function () { return { disabled: disabled, failures: failures, hasModel: !!model }; },
    };
  })();

  function stylingRefresh() { styling.refresh(); }
