  // ─── PDF engine ────────────────────────────────────────────────────────────
  // pdf-lib is loaded on demand and kept plugin-local per the SDK guidance on
  // managing external dependencies.
  var pdfLibPromise = null;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!pdfLibPromise) {
      pdfLibPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
        s.onload = function () { resolve(window.PDFLib); };
        s.onerror = function () {
          pdfLibPromise = null;
          reject(new Error('Could not load the PDF library (pdf-lib). Check that cdn.jsdelivr.net is reachable.'));
        };
        document.head.appendChild(s);
      });
    }
    return pdfLibPromise;
  }

  // Merge the given pages (in order) into one PDF and return its bytes.
  // Pages are processed sequentially: bounded memory use and honest progress.
  // hooks: { onProgress(done, total, page), isCancelled(), onPageSkipped(page, err) }
  function exportPdf(pages, source, hooks) {
    return loadPdfLib().then(function (PDFLib) {
      return PDFLib.PDFDocument.create().then(function (doc) {
        var skipped = [];
        var chain = Promise.resolve();
        pages.forEach(function (page, i) {
          chain = chain.then(function () {
            if (hooks.isCancelled && hooks.isCancelled()) throw new Error('__cancelled__');
            return source.getPagePdf(page).then(function (res) {
              if (res.kind === 'pdf') {
                return PDFLib.PDFDocument.load(res.bytes, { ignoreEncryption: true }).then(function (src) {
                  // Per-page 'output' renditions are single-page PDFs; if a
                  // multi-page file shows up, take the page matching this
                  // page's sequence within its layout.
                  var idx = Math.min(Math.max(page.pageSequence - 1, 0), src.getPageCount() - 1);
                  return doc.copyPages(src, [idx]).then(function (copied) { doc.addPage(copied[0]); });
                });
              }
              // JPG preview → full-bleed image on a page of the true page size.
              return doc.embedJpg(res.bytes).then(function (img) {
                var pg = doc.addPage([page.width, page.height]);
                pg.drawImage(img, { x: 0, y: 0, width: page.width, height: page.height });
              });
            }).catch(function (err) {
              if (err && err.message === '__cancelled__') throw err;
              console.warn(TAG + ' page ' + page.pageNumber + ' skipped: ' + err.message);
              skipped.push({ page: page, error: err });
              if (hooks.onPageSkipped) hooks.onPageSkipped(page, err);
            }).then(function () {
              if (hooks.onProgress) hooks.onProgress(i + 1, pages.length, page);
            });
          });
        });
        return chain.then(function () {
          if (doc.getPageCount() === 0) throw new Error('No pages could be exported — no stored renditions found.');
          return doc.save().then(function (bytes) {
            return { bytes: bytes, skipped: skipped, pageCount: doc.getPageCount() };
          });
        });
      });
    });
  }

  function sanitizeFilename(name) {
    return String(name).replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  }

  function buildFilename(model, suffixes) {
    var base = (model.brandName || 'Issue') + ' - ' + (model.issueName || model.issueId);
    var extra = (suffixes || []).filter(Boolean).map(function (s) { return ' (' + s + ')'; }).join('');
    return sanitizeFilename(base + extra) + '.pdf';
  }

  function downloadBlob(bytes, filename) {
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }
