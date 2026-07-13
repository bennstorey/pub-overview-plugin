  // ─── Registration & lifecycle ──────────────────────────────────────────────
  try {
    if (PoUiSdk.hasActions()) PoUiSdk.createAction(); // separator below other plug-ins
    PoUiSdk.createAction({
      label: 'Export PDF…',
      click: function () {
        try { openExportDialog(); }
        catch (e) { console.error(TAG + ' export dialog failed:', e); notify('Export failed to open: ' + e.message, 'error'); }
      },
    });
  } catch (e) {
    console.error(TAG + ' could not register menu action:', e);
  }

  // Styling lifecycle: load the issue model for the current filter and keep
  // it fresh when the user navigates to another issue/edition (the iframe
  // hash changes) — plus a slow safety refresh for state changes made by
  // other users.
  var lastModelKey = '';
  function refreshStylingModel() {
    try {
      var f = currentFilter();
      if (!f.issueId) return;
      var key = f.issueId + '|' + (f.editionId || '');
      if (key === lastModelKey) { styling.refresh(); return; }
      lastModelKey = key;
      loadIssueModel(f.issueId, f.editionId)
        .then(loadDeadlines)
        .then(function (model) { styling.start(model); })
        .catch(function (e) {
          lastModelKey = ''; // retry on next tick
          console.warn(TAG + ' styling model load failed: ' + e.message);
        });
    } catch (e) {
      console.warn(TAG + ' styling refresh failed: ' + e.message);
    }
  }

  window.addEventListener('hashchange', refreshStylingModel);
  setInterval(function () { lastModelKey = ''; refreshStylingModel(); }, 60000);
  refreshStylingModel();

  // Console diagnostics: window.__pubPdfDebug
  window.__pubPdfDebug = {
    version: VERSION,
    selectors: SELECTORS,
    settings: loadSettings,
    saveSettings: saveSettings,
    styling: styling,
    loadIssueModel: loadIssueModel,
    currentFilter: currentFilter,
    openExportDialog: openExportDialog,
  };

  console.info(TAG + ' v' + VERSION + ' loaded');
