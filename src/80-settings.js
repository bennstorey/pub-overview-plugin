  // ─── Settings ──────────────────────────────────────────────────────────────
  // localStorage for v1. The load/save pair is the seam for a later
  // SaveUserSettings/GetUserSettings-backed store (settings that roam with
  // the Studio user) — keep all access going through these two functions.
  var SETTINGS_KEY = 'pubOverviewPlugin.settings.v1';

  function loadSettings() {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { /* fresh */ }
    var merged = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      merged[k] = (k in stored) ? stored[k] : DEFAULT_SETTINGS[k];
    });
    return merged;
  }

  function saveSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {
      console.warn(TAG + ' could not persist settings: ' + e.message);
    }
  }
