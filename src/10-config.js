  // ─── Defaults (user-tunable via the settings section of the dialog) ───────
  var DEFAULT_SETTINGS = {
    // Workflow status names that mean "this page is done / sent to press".
    // Matched case-insensitively against the layout's status name.
    pressStatusNames: ['Complete', 'Sent to press', 'Ready for Press'],
    // Text shown on the badge overlay of pages in a press status.
    badgeLabel: 'PRESS',
    badgeEnabled: true,
    // Colored status accent bar on every page tile (uses the official
    // workflow status color).
    accentsEnabled: true,
    // Pulsing outline on pages whose layout deadline has passed and whose
    // status is not a press status.
    overdueEnabled: true,
    // Page grid density: 'normal' leaves Studio untouched.
    density: 'normal', // 'compact' | 'normal' | 'large'
    // Rendition engine. 'client' merges stored renditions in the browser.
    // 'ids' is reserved for the v2 InDesign Server backend (see
    // IdsRenditionSource) and is not selectable yet.
    engine: 'client',
    // Prefer 'output' (print PDF) renditions; when false, always use JPG
    // previews (debug aid, reachable via window.__pubPdfDebug).
    preferOutput: true,
  };

  var DENSITY_ZOOM = { compact: 0.7, normal: 1, large: 1.35 };
