  // ─── Export dialog ─────────────────────────────────────────────────────────
  // Self-contained overlay in the PO iframe document (full DOM control, no
  // cross-frame modal quirks). Styles live in one injected block, all rules
  // scoped under .ppx-dialog-overlay.

  var DIALOG_CSS =
    '.ppx-dialog-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99990;display:flex;align-items:center;justify-content:center;font-family:inherit}' +
    '.ppx-dialog{background:#fff;color:#333;border-radius:6px;box-shadow:0 8px 40px rgba(0,0,0,.35);width:460px;max-width:92vw;max-height:90vh;overflow:auto;padding:0}' +
    '.ppx-dialog h2{font-size:16px;font-weight:600;margin:0;padding:14px 18px;border-bottom:1px solid #e5e5e5}' +
    '.ppx-dialog .ppx-body{padding:14px 18px}' +
    '.ppx-dialog .ppx-ctx{color:#777;font-size:12px;margin:0 0 12px}' +
    '.ppx-dialog fieldset{border:1px solid #e5e5e5;border-radius:4px;margin:0 0 12px;padding:8px 12px}' +
    '.ppx-dialog legend{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#999;padding:0 4px}' +
    '.ppx-dialog label{display:flex;align-items:center;gap:7px;font-size:13px;padding:3px 0;cursor:pointer}' +
    '.ppx-dialog input[type=text]{width:130px;padding:3px 6px;border:1px solid #ccc;border-radius:3px;font-size:13px}' +
    '.ppx-dialog select{padding:3px 6px;border:1px solid #ccc;border-radius:3px;font-size:13px}' +
    '.ppx-state-dot{display:inline-block;width:10px;height:10px;border-radius:50%;border:1px solid rgba(0,0,0,.2)}' +
    '.ppx-note{font-size:12px;color:#777;margin:2px 0 0}' +
    '.ppx-error{color:#c0392b;font-size:12px;margin:8px 0 0;white-space:pre-wrap}' +
    '.ppx-progress{display:none;margin:10px 0 0}' +
    '.ppx-progress-bar{height:6px;background:#eee;border-radius:3px;overflow:hidden}' +
    '.ppx-progress-fill{height:100%;width:0;background:#f5a623;transition:width .2s}' +
    '.ppx-progress-text{font-size:12px;color:#777;margin-top:4px}' +
    '.ppx-actions{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid #e5e5e5}' +
    '.ppx-actions .ppx-right{display:flex;gap:8px}' +
    '.ppx-btn{border:1px solid #ccc;background:#fff;color:#333;border-radius:4px;padding:6px 14px;font-size:13px;cursor:pointer}' +
    '.ppx-btn-primary{background:#f5a623;border-color:#f5a623;color:#fff;font-weight:600}' +
    '.ppx-btn:disabled{opacity:.5;cursor:default}' +
    '.ppx-gear{background:none;border:none;font-size:15px;cursor:pointer;color:#999;padding:2px 6px}' +
    '.ppx-settings{display:none;border-top:1px dashed #e5e5e5;margin-top:10px;padding-top:10px}' +
    '.ppx-settings.ppx-open{display:block}' +
    '.ppx-settings input[type=text]{width:100%}';

  function ensureDialogStyles() {
    if (!document.getElementById('ppx-dialog-styles')) {
      var st = document.createElement('style');
      st.id = 'ppx-dialog-styles';
      st.textContent = DIALOG_CSS;
      document.head.appendChild(st);
    }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function openExportDialog() {
    var filter = currentFilter();
    if (!filter.issueId) {
      notify('Could not determine the current issue — open the Publication Overview on an issue first.', 'error');
      return;
    }
    ensureDialogStyles();

    var state = {
      model: null,
      meta: null,
      editions: [],
      cancelled: false,
      exporting: false,
    };

    // ── skeleton ──
    var ctxLine = el('p', { class: 'ppx-ctx', text: 'Loading issue…' });
    var errLine = el('div', { class: 'ppx-error' });
    var rangeInput = el('input', { type: 'text', placeholder: 'e.g. 1-5, 9', disabled: '' });
    var scopeIssue = el('input', { type: 'radio', name: 'ppx-scope', checked: '' });
    var scopeRange = el('input', { type: 'radio', name: 'ppx-scope' });
    scopeIssue.addEventListener('change', function () { rangeInput.disabled = true; });
    scopeRange.addEventListener('change', function () { rangeInput.disabled = false; rangeInput.focus(); });
    rangeInput.addEventListener('focus', function () { scopeRange.checked = true; rangeInput.disabled = false; });

    var statusBox = el('div');
    var editionSelect = el('select');
    var renditionNote = el('p', { class: 'ppx-note', text: '' });

    var progressFill = el('div', { class: 'ppx-progress-fill' });
    var progressText = el('div', { class: 'ppx-progress-text', text: '' });
    var progressWrap = el('div', { class: 'ppx-progress' }, [
      el('div', { class: 'ppx-progress-bar' }, [progressFill]),
      progressText,
    ]);

    var exportBtn = el('button', { class: 'ppx-btn ppx-btn-primary', text: 'Export PDF', disabled: '' });
    var cancelBtn = el('button', { class: 'ppx-btn', text: 'Close' });

    // ── settings section (gear) ──
    var settings = loadSettings();
    var pressInput = el('input', { type: 'text', value: settings.pressStatusNames.join(', ') });
    var badgeChk = el('input', { type: 'checkbox' }); badgeChk.checked = settings.badgeEnabled;
    var watermarkChk = el('input', { type: 'checkbox' }); watermarkChk.checked = settings.watermarkEnabled;
    var watermarkInput = el('input', { type: 'text', value: settings.watermarkText || '' });
    var accentChk = el('input', { type: 'checkbox' }); accentChk.checked = settings.accentsEnabled;
    var overdueChk = el('input', { type: 'checkbox' }); overdueChk.checked = settings.overdueEnabled;
    var densitySel = el('select', {}, ['compact', 'normal', 'large'].map(function (d) {
      var o = el('option', { value: d, text: d });
      if (settings.density === d) o.setAttribute('selected', '');
      return o;
    }));
    var settingsBox = el('div', { class: 'ppx-settings' }, [
      el('label', {}, [badgeChk, el('span', { text: 'Badge on pages that are sent to press' })]),
      el('label', {}, [watermarkChk, el('span', { text: 'Watermark on pages that are sent to press' })]),
      el('label', {}, [el('span', { text: 'Watermark text:' })]),
      watermarkInput,
      el('label', {}, [el('span', { text: 'Press status names:' })]),
      pressInput,
      el('label', {}, [accentChk, el('span', { text: 'Status color accent on page tiles' })]),
      el('label', {}, [overdueChk, el('span', { text: 'Highlight overdue pages' })]),
      el('label', {}, [el('span', { text: 'Grid density:' }), densitySel]),
    ]);
    function persistSettings() {
      settings.pressStatusNames = pressInput.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      settings.badgeEnabled = badgeChk.checked;
      settings.watermarkEnabled = watermarkChk.checked;
      settings.watermarkText = watermarkInput.value.trim();
      settings.accentsEnabled = accentChk.checked;
      settings.overdueEnabled = overdueChk.checked;
      settings.density = densitySel.value;
      saveSettings(settings);
      stylingRefresh();
    }
    [pressInput, badgeChk, watermarkChk, watermarkInput, accentChk, overdueChk, densitySel].forEach(function (input) {
      input.addEventListener('change', persistSettings);
    });
    var gearBtn = el('button', { class: 'ppx-gear', title: 'Styling settings', text: '⚙' });
    gearBtn.addEventListener('click', function () { settingsBox.classList.toggle('ppx-open'); });

    var dialog = el('div', { class: 'ppx-dialog' }, [
      el('h2', { text: 'Export PDF' }),
      el('div', { class: 'ppx-body' }, [
        ctxLine,
        el('fieldset', {}, [
          el('legend', { text: 'Pages' }),
          el('label', {}, [scopeIssue, el('span', { text: 'Entire issue' })]),
          el('label', {}, [scopeRange, el('span', { text: 'Page range:' }), rangeInput]),
        ]),
        el('fieldset', {}, [el('legend', { text: 'Only statuses' }), statusBox]),
        el('fieldset', {}, [el('legend', { text: 'Edition' }), editionSelect]),
        renditionNote,
        errLine,
        progressWrap,
        settingsBox,
      ]),
      el('div', { class: 'ppx-actions' }, [
        gearBtn,
        el('div', { class: 'ppx-right' }, [cancelBtn, exportBtn]),
      ]),
    ]);
    var overlay = el('div', { class: 'ppx-dialog-overlay' }, [dialog]);
    document.body.appendChild(overlay);

    function close() {
      state.cancelled = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    cancelBtn.addEventListener('click', function () {
      if (state.exporting) { state.cancelled = true; return; }
      close();
    });
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay && !state.exporting) close(); });

    function showError(msg) { errLine.textContent = msg || ''; }

    function selectedStates() {
      return [].slice.call(statusBox.querySelectorAll('input:checked')).map(function (c) { return c.getAttribute('data-state-id'); });
    }

    function renderModel(model) {
      state.model = model;
      // GetPagesInfo omits brand/issue names; use the ones from loadIssueMeta
      // once available (survives edition reloads).
      if (state.meta) {
        if (state.meta.brandName) model.brandName = state.meta.brandName;
        if (state.meta.issueName) model.issueName = state.meta.issueName;
      }
      var withPdf = model.pages.filter(function (p) { return p.outputAvailable; }).length;
      ctxLine.textContent = (model.brandName || 'Brand') + ' / ' + (model.issueName || ('issue ' + model.issueId)) +
        ' — ' + model.pages.length + ' pages, ' + Object.keys(model.layouts).length + ' layouts';
      renditionNote.textContent = withPdf === model.pages.length
        ? 'All pages have stored print PDFs.'
        : withPdf + ' of ' + model.pages.length + ' pages have print PDFs; JPG previews will be used for the rest.';
      statusBox.textContent = '';
      model.states.forEach(function (st) {
        var chk = el('input', { type: 'checkbox', 'data-state-id': st.id });
        chk.checked = true;
        statusBox.appendChild(el('label', {}, [
          chk,
          el('span', { class: 'ppx-state-dot', style: 'background:' + (st.color || '#ccc') }),
          el('span', { text: st.name || ('status ' + st.id) }),
        ]));
      });
      exportBtn.disabled = false;
    }

    function loadFor(editionId) {
      exportBtn.disabled = true;
      showError('');
      return loadIssueModel(filter.issueId, editionId).then(renderModel).catch(function (e) {
        ctxLine.textContent = 'Failed to load issue.';
        showError(e.message);
      });
    }

    // initial load: current edition + issue meta (brand/issue names, editions)
    loadFor(filter.editionId);
    loadIssueMeta(filter.brandId, filter.issueId).then(function (meta) {
      state.meta = meta;
      state.editions = meta.editions;
      // Names are absent from GetPagesInfo; fold them into the model so the
      // context line and download filename read properly.
      if (state.model) {
        if (meta.brandName) state.model.brandName = meta.brandName;
        if (meta.issueName) state.model.issueName = meta.issueName;
        renderModel(state.model);
      }
      editionSelect.textContent = '';
      if (!meta.editions.length) {
        editionSelect.appendChild(el('option', { value: filter.editionId || '', text: 'Current edition' }));
        return;
      }
      meta.editions.forEach(function (ed) {
        var o = el('option', { value: ed.id, text: ed.name });
        if (String(ed.id) === String(filter.editionId)) o.setAttribute('selected', '');
        editionSelect.appendChild(o);
      });
    });
    editionSelect.addEventListener('change', function () { loadFor(editionSelect.value); });

    exportBtn.addEventListener('click', function () {
      var model = state.model;
      if (!model || state.exporting) return;
      showError('');

      var pages = model.pages.slice();
      var suffixes = [];
      try {
        if (scopeRange.checked) {
          if (!rangeInput.value.trim()) throw new Error('Enter a page range, e.g. 1-5, 9');
          pages = filterPagesByRange(pages, rangeInput.value);
          suffixes.push('pages ' + rangeInput.value.replace(/\s+/g, ''));
        }
        var states = selectedStates();
        if (states.length && states.length < model.states.length) {
          pages = pages.filter(function (p) {
            var lay = model.layouts[p.layoutId];
            return lay && states.indexOf(lay.stateId) >= 0;
          });
          suffixes.push(model.states.filter(function (s) { return states.indexOf(s.id) >= 0; })
            .map(function (s) { return s.name; }).join('+'));
        }
        if (!pages.length) throw new Error('No pages match the chosen scope and filters.');
      } catch (e) { showError(e.message); return; }

      var edName = '';
      if (state.editions.length > 1) {
        var sel = state.editions.filter(function (ed) { return ed.id === editionSelect.value; })[0];
        if (sel) { edName = sel.name; suffixes.push(sel.name); }
      }

      var source = createRenditionSource(loadSettings(), model.issueId, editionSelect.value || model.editionId);
      var layoutIds = [];
      pages.forEach(function (p) { if (layoutIds.indexOf(p.layoutId) < 0) layoutIds.push(p.layoutId); });

      state.exporting = true;
      state.cancelled = false;
      exportBtn.disabled = true;
      cancelBtn.textContent = 'Cancel';
      progressWrap.style.display = 'block';
      progressText.textContent = 'Fetching page list…';

      source.prime(layoutIds).then(function () {
        return exportPdf(pages, source, {
          onProgress: function (done, total, page) {
            progressFill.style.width = Math.round(done / total * 100) + '%';
            progressText.textContent = 'Page ' + page.pageNumber + ' — ' + done + ' of ' + total;
          },
          isCancelled: function () { return state.cancelled; },
        });
      }).then(function (result) {
        var filename = buildFilename(model, suffixes);
        downloadBlob(result.bytes, filename);
        var msg = 'Exported ' + result.pageCount + ' pages to "' + filename + '"';
        if (result.skipped.length) {
          msg += ' — ' + result.skipped.length + ' skipped (no rendition): ' +
            result.skipped.map(function (s) { return s.page.pageNumber; }).join(', ');
        }
        notify(msg, result.skipped.length ? 'default' : 'success');
        close();
      }).catch(function (e) {
        if (e && e.message === '__cancelled__') {
          progressText.textContent = 'Cancelled.';
        } else {
          showError(e.message);
        }
      }).then(function () {
        state.exporting = false;
        exportBtn.disabled = false;
        cancelBtn.textContent = 'Close';
      });
    });
  }
