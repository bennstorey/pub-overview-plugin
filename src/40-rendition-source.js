  // ─── Rendition sources ─────────────────────────────────────────────────────
  // A rendition source resolves a page of the issue to printable bytes:
  //   prime(layoutIds)        → Promise, fetches/caches file pointers
  //   getPagePdf(page)        → Promise<{ kind: 'pdf'|'jpeg', bytes: ArrayBuffer }>
  // This interface is the seam for the v2 high-quality backend: swap the
  // client source for one that queues InDesign Server jobs without touching
  // the PDF engine or the dialog.

  function ClientRenditionSource(issueId, editionId, preferOutput) {
    // key: layoutId + '|' + pageSequence → { output: url, preview: url }
    var files = {};

    function prime(layoutIds) {
      var chunks = [];
      for (var i = 0; i < layoutIds.length; i += 5) chunks.push(layoutIds.slice(i, i + 5));
      return chunks.reduce(function (p, chunk) {
        return p.then(function () {
          return callServer('GetPages', {
            Issue: { Id: String(issueId), __classname__: 'Issue' },
            IDs: chunk,
            Edition: editionId ? { Id: String(editionId), __classname__: 'Edition' } : null,
            Renditions: ['output', 'preview'],
            RequestMetaData: true,
            RequestFiles: true,
          }).then(function (r) {
            var infos = r.ObjectPageInfos || [];
            for (var oi = 0; oi < infos.length; oi++) {
              var md = infos[oi].MetaData;
              var layoutId = md && md.BasicMetaData ? String(md.BasicMetaData.ID) : null;
              var pages = infos[oi].Pages || [];
              for (var pi = 0; pi < pages.length; pi++) {
                var pg = pages[pi];
                var key = (layoutId || '?') + '|' + Number(pg.PageSequence);
                var rec = files[key] || (files[key] = {});
                var fs = pg.Files || [];
                for (var fi = 0; fi < fs.length; fi++) {
                  var f = fs[fi];
                  if (f.Rendition === 'output' && f.FileUrl) rec.output = f.FileUrl;
                  if (f.Rendition === 'preview' && f.FileUrl) rec.preview = f.FileUrl;
                }
              }
            }
          });
        });
      }, Promise.resolve());
    }

    function getPagePdf(page) {
      var rec = files[page.layoutId + '|' + page.pageSequence] || {};
      var useOutput = preferOutput && rec.output;
      var url = useOutput ? rec.output : rec.preview;
      if (!url) {
        return Promise.reject(new Error('No rendition stored for page ' + page.pageNumber +
          ' (save the layout in InDesign to generate page previews)'));
      }
      return fetchBinary(url).then(function (bytes) {
        return { kind: useOutput ? 'pdf' : 'jpeg', bytes: bytes };
      });
    }

    return { prime: prime, getPagePdf: getPagePdf, kindHint: function (page) {
      var rec = files[page.layoutId + '|' + page.pageSequence] || {};
      return (preferOutput && rec.output) ? 'pdf' : (rec.preview ? 'jpeg' : 'none');
    } };
  }

  // v2 seam — high-quality export via InDesign Server.
  // Contract for the future implementation:
  //  - prime(layoutIds) queues an IDS export job (e.g. via a Studio Server
  //    plug-in endpoint or CreateObjectOperations) for the selected layouts
  //    and polls until the job completes.
  //  - getPagePdf(page) resolves per-page PDFs from the job result. A job
  //    may return one multi-page PDF per layout plus a page map; in that
  //    case getPagePdf slices by the page's sequence within the layout.
  // Selecting engine 'ids' in settings is blocked until this exists.
  function IdsRenditionSource() {
    return {
      prime: function () {
        return Promise.reject(new Error('High-quality InDesign Server export is not implemented yet (v2).'));
      },
      getPagePdf: function () {
        return Promise.reject(new Error('High-quality InDesign Server export is not implemented yet (v2).'));
      },
      kindHint: function () { return 'none'; },
    };
  }

  function createRenditionSource(settings, issueId, editionId) {
    if (settings.engine === 'ids') return IdsRenditionSource();
    return ClientRenditionSource(issueId, editionId, settings.preferOutput !== false);
  }
