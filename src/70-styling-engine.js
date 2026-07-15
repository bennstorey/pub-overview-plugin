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

// ═══════════════════════════════════════════════════════════════════════
//  WATERMARK STYLE — edit this block freely to restyle the overlay.
//
//  Injected per press-status page tile (pointer-events pass through):
//     <div class="ppx-watermark">
//       <span class="ppx-watermark-text">SENT TO PRESS</span>
//     </div>
//  .ppx-watermark is the full-cover container over the thumbnail;
//  .ppx-watermark-text is the label (text comes from the watermarkText
//  setting). Keep the container's `position/inset/pointer-events` unless
//  you know you want otherwise; everything else is yours.
// ═══════════════════════════════════════════════════════════════════════
var WATERMARK_CSS =
  '.ppx-watermark{position:absolute;inset:0;z-index:6;display:flex;' +
  'align-items:center;justify-content:center;overflow:hidden;pointer-events:none}' +
  '.ppx-watermark-text{transform: rotate(-32deg);font: 800 20px / 1 sans-serif;letter-spacing: .12em;text-align: center;text-transform: uppercase;color: rgba(192, 57, 43, .8);border: 3px solid rgba(192, 57, 43, .8);padding: 11px 16px;border-radius: 4px;background-color: rgba(226, 226, 226, .6);}';

// ═══════════════════════════════════════════════════════════════════════
//  DEADLINE STYLE — edit this block freely to restyle deadline highlights.
//
//  Two mutually-exclusive classes are toggled on the page tile
//  (<po-page-component>), only on non-press pages:
//     .ppx-overdue   → hard deadline (Deadline) has passed        → "late"
//     .ppx-due-soon  → soft deadline (DeadlineSoft) passed, hard  → "approaching"
//                       deadline not yet passed
//  "Late" wins if both apply. Defaults: red pulse for late, amber for
//  approaching. Everything here is yours to change.
// ═══════════════════════════════════════════════════════════════════════
var DEADLINE_CSS =
  'po-page-component.ppx-overdue{border-top: 4px solid #f7625e;border-left: 4px solid #f7625e;box-sizing: border-box;animation:ppx-pulse 1.6s ease-in-out infinite}' +
  '@keyframes ppx-pulse{0%,100%{border-color: rgb(254 127 45 / 90%);}50%{border-color: rgb(254 127 45 / 30%);}}' +
  'po-page-component.ppx-due-soon{outline:2px solid #e0a800;outline-offset:-2px}';

var STYLING_CSS =
  'po-page-component.ppx-tile{position:relative}' +
  '.ppx-badge{position:absolute;top:8px;right:8px;z-index:5;background:rgba(46,158,60,.92);color:#fff;' +
  'font-size:10px;font-weight:700;letter-spacing:.08em;padding:3px 8px;border-radius:3px;pointer-events:none;' +
  'box-shadow:0 1px 4px rgba(0,0,0,.3)}' +
  '.ppx-accent-bar{position:absolute;left:0;right:0;bottom:0;height:4px;z-index:4;pointer-events:none}' +
  '[data-ppx-density="compact"] .spread-view{zoom:0.7}' +
  '[data-ppx-density="large"] .spread-view{zoom:1.35}' +
  DEADLINE_CSS +
  WATERMARK_CSS;

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

    // diagonal watermark (same press-status trigger as the badge)
    var watermark = tile.querySelector(':scope > .ppx-watermark');
    var wantWatermark = settings.watermarkEnabled && layout && isPressState(settings, layout.stateName);
    if (wantWatermark && !watermark) {
      watermark = document.createElement('div');
      watermark.className = 'ppx-watermark';
      watermark.appendChild(document.createElement('span')).className = 'ppx-watermark-text';
      tile.appendChild(watermark);
    }
    if (watermark) {
      if (wantWatermark) {
        watermark.firstChild.textContent = settings.watermarkText || 'SENT TO PRESS';
      } else {
        watermark.remove();
      }
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

    // deadline highlights (non-press pages only): hard deadline passed =
    // "late" (wins); else soft deadline passed = "approaching".
    var late = false, dueSoon = false;
    if (layout && !isPressState(settings, layout.stateName)) {
      var now = Date.now();
      var hard = layout.deadline ? new Date(layout.deadline).getTime() : NaN;
      var soft = layout.deadlineSoft ? new Date(layout.deadlineSoft).getTime() : NaN;
      if (settings.overdueEnabled && !isNaN(hard) && hard < now) late = true;
      else if (settings.dueSoonEnabled && !isNaN(soft) && soft < now) dueSoon = true;
    }
    tile.classList.toggle('ppx-overdue', late);
    tile.classList.toggle('ppx-due-soon', dueSoon);
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
      document.querySelectorAll('.ppx-badge,.ppx-accent-bar,.ppx-watermark').forEach(function (n) { n.remove(); });
      document.querySelectorAll('.ppx-overdue,.ppx-due-soon').forEach(function (n) {
        n.classList.remove('ppx-overdue'); n.classList.remove('ppx-due-soon');
      });
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
