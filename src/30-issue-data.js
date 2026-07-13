  // ─── Issue data layer ──────────────────────────────────────────────────────
  // One GetPagesInfo call is the source of truth: it is the same service the
  // Publication Overview itself renders from, and carries both the page grid
  // (PageObjects) and the layout workflow states (LayoutObjects).

  function currentFilter() {
    try { return PoUiSdk.currentFilterSetting() || {}; } catch (e) { return {}; }
  }

  function loadIssueModel(issueId, editionId) {
    return callServer('GetPagesInfo', {
      Issue: { Id: String(issueId), __classname__: 'Issue' },
      IDs: null,
      Edition: editionId ? { Id: String(editionId), __classname__: 'Edition' } : null,
      Category: null,
      State: null,
    }).then(function (r) {
      var model = {
        issueId: String(issueId),
        editionId: editionId ? String(editionId) : null,
        brandName: '',
        issueName: '',
        expectedPages: r.ExpectedPages,
        layouts: {},
        pages: [],
        states: [],
      };

      var los = r.LayoutObjects || [];
      var statesSeen = {};
      for (var i = 0; i < los.length; i++) {
        var lo = los[i];
        var st = lo.State || {};
        model.layouts[String(lo.Id)] = {
          id: String(lo.Id),
          name: lo.Name,
          stateId: st.Id ? String(st.Id) : '',
          stateName: st.Name || '',
          stateColor: st.Color ? ('#' + String(st.Color).replace(/^#/, '')) : '',
          lockedBy: lo.LockedBy || '',
          deadline: null, // filled by loadDeadlines() when styling needs it
        };
        if (st.Id && !statesSeen[st.Id]) {
          statesSeen[st.Id] = true;
          model.states.push({ id: String(st.Id), name: st.Name || '', color: st.Color ? '#' + st.Color : '' });
        }
        if (!model.brandName && lo.Publication && lo.Publication.Name) model.brandName = lo.Publication.Name;
        if (!model.issueName && lo.Target && lo.Target.Issue && lo.Target.Issue.Name) model.issueName = lo.Target.Issue.Name;
      }

      var eps = r.EditionsPages || [];
      for (var e = 0; e < eps.length; e++) {
        var pos = eps[e].PageObjects || [];
        for (var p = 0; p < pos.length; p++) {
          var po = pos[p];
          model.pages.push({
            layoutId: String(po.ParentLayoutId),
            pageNumber: String(po.PageNumber),
            pageOrder: Number(po.PageOrder),
            pageSequence: Number(po.PageSequence),
            width: Number(po.Width),
            height: Number(po.Height),
            outputAvailable: !!po.OutputRenditionAvailable,
          });
        }
      }
      model.pages.sort(function (a, b) { return a.pageOrder - b.pageOrder || a.pageSequence - b.pageSequence; });
      return model;
    });
  }

  // Deadlines are not part of GetPagesInfo's LayoutObjects; fetch them
  // separately and tolerate failure (styling then simply skips overdue marks).
  function loadDeadlines(model) {
    return callServer('QueryObjects', {
      FirstEntry: 1, MaxEntries: 500, Hierarchical: false,
      Params: [
        { Property: 'Type', Operation: '=', Value: 'Layout', __classname__: 'QueryParam' },
        { Property: 'IssueId', Operation: '=', Value: String(model.issueId), __classname__: 'QueryParam' },
      ],
      MinimalProps: ['ID', 'Deadline'],
    }).then(function (r) {
      var cols = (r.Columns || []).map(function (c) { return c.Name; });
      var idIdx = cols.indexOf('ID'), dlIdx = cols.indexOf('Deadline');
      (r.Rows || []).forEach(function (row) {
        var lay = model.layouts[String(row[idIdx])];
        if (lay && dlIdx >= 0 && row[dlIdx]) lay.deadline = row[dlIdx];
      });
      return model;
    }).catch(function (e) {
      console.warn(TAG + ' deadlines unavailable: ' + e.message);
      return model;
    });
  }

  // Brand name, issue name and the issue channel's editions — for the
  // dialog's edition selector and the download filename. GetPagesInfo's
  // LayoutObjects do not carry these names, so resolve them here. Note that
  // GetPublications ignores PublicationIds and returns every brand, so match
  // on the brand id explicitly. Falls back to empty fields on any surprise.
  function loadIssueMeta(brandId, issueId) {
    var empty = { brandName: '', issueName: '', editions: [] };
    return callServer('GetPublications', {
      PublicationIds: [String(brandId)],
      RequestInfo: ['PubChannels', 'Issues', 'Editions'],
    }).then(function (r) {
      var infos = (r && r.Publications) || [];
      for (var i = 0; i < infos.length; i++) {
        if (String(infos[i].Id) !== String(brandId)) continue;
        var chans = infos[i].PubChannels || [];
        for (var c = 0; c < chans.length; c++) {
          var issues = chans[c].Issues || [];
          for (var s = 0; s < issues.length; s++) {
            if (String(issues[s].Id) === String(issueId)) {
              return {
                brandName: infos[i].Name || '',
                issueName: issues[s].Name || '',
                editions: (chans[c].Editions || []).map(function (ed) {
                  return { id: String(ed.Id), name: ed.Name };
                }),
              };
            }
          }
        }
      }
      return empty;
    }).catch(function (e) {
      console.warn(TAG + ' issue meta unavailable: ' + e.message);
      return empty;
    });
  }

  // Parse a page range string like "1-5, 9, 12-14" against the model's
  // pages. Tokens match the visible page number first, then the page order.
  function filterPagesByRange(pages, rangeText) {
    var wanted = {};
    var tokens = String(rangeText).split(',');
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i].trim();
      if (!t) continue;
      var m = t.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var lo = parseInt(m[1], 10), hi = parseInt(m[2], 10);
        if (hi < lo) { var tmp = lo; lo = hi; hi = tmp; }
        for (var n = lo; n <= hi; n++) wanted[n] = true;
      } else if (/^\d+$/.test(t)) {
        wanted[parseInt(t, 10)] = true;
      } else {
        throw new Error('Invalid page range: "' + t + '"');
      }
    }
    return pages.filter(function (p) {
      return wanted[parseInt(p.pageNumber, 10)] || wanted[p.pageOrder];
    });
  }
