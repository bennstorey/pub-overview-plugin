# M0 Discovery Notes — lab-studio.woodwing.cloud (Enterprise 10.64.3, 2026-07-13)

All findings verified live in the browser against the lab instance.

## 1. PoUiSdk — the Publication Overview plugin API

Publication Overview is a **child application** of Studio, served in a same-origin iframe:

```
<iframe id="publication" class="publication" src="https://…/app/publicationoverview/#">
```

It has its own plugin list (`plugins.publicationOverview` in `config.js` on-prem; on Cloud,
register the plugin URL in the Management Console for the Publication Overview application).
Plugin scripts execute **inside the iframe**, where these globals exist:

- `PoUiSdk` — documented in `https://lab-studio.woodwing.cloud/app/sdk/po-ui-sdk.md`
  (local copies of the doc + shipped sample were reviewed):
  - `hasActions()` → boolean
  - `createAction(props)` → actionId — adds an entry to the triple-dot menu (top right)
  - `createSubAction(parentActionId, props)` → actionId
  - `clearSubActions(parentActionId, showLoading)`
  - `changeAction(actionId, props)`
  - `currentSelectedPage()` → IPage metadata of the selected page tile, or null
  - `currentFilterSetting()` → `{ brandId, categoryId, issueId, editionId, stateId }` ← full context, no URL parsing needed
  - Action props: `{ icon, label, disabled, visible, forceSeparator, click(event), onOpen(), symbol }`
    (no icon + no label = separator)
- `ContentStationSdk` — relayed into the PO context: `getInfo()`, `showNotification()`,
  `openModalDialog()` / `closeModalDialog()`, etc.

The main Studio window's `ContentStationSdk` (checked separately) has NO PO-specific
methods — `createAction` there targets the search-results context menu only. The PO
triple-dot menu is exclusively PoUiSdk territory.

## 2. Page data: GetPagesInfo (what Pub Overview itself calls)

`POST /server/index.php?protocol=JSON&method=GetPagesInfo`, cookie session,
header `X-WoodWing-Application: Content Station`, params:

```json
{ "Ticket": null,
  "Issue":   { "Id": "301", "__classname__": "Issue" },
  "IDs": null,
  "Edition": { "Id": "5", "__classname__": "Edition" },
  "Category": null, "State": null }
```

Response (`WflGetPagesInfoResponse`):
- `ReversedReadingOrder`, `ExpectedPages`, `PageOrderMethod`
- `EditionsPages[]` → `{ Edition, PageObjects[] }` where each PageObject has:
  `IssuePagePosition, PageOrder, PageNumber, PageSequence, Height, Width,
   ParentLayoutId, OutputRenditionAvailable, PlacementInfos`
- `LayoutObjects[]` → `{ Id, Name, Category, State {Id, Name, Color}, Version,
   LockedBy, Flag, FlagMsg, Publication, Target }`
- `PlacedObjects`

Notes:
- **`OutputRenditionAvailable`** tells per page whether a print PDF exists. On this
  instance: 26/26 pages of Issue 001 (edition North) have it.
- The PO UI always resolves to a **concrete edition** (navigating with `editionId=All`
  redirects to the first edition).
- `State.Color` is a hex string without `#`, e.g. `FF33FF`.
- No `Deadline` in LayoutObjects — fetch via `QueryObjects` (`MinimalProps: ['ID','Deadline']`) if needed.

## 3. Rendition files: GetPages

`POST …&method=GetPages` params:

```json
{ "Ticket": null,
  "Issue":   { "Id": "301", "__classname__": "Issue" },
  "IDs": ["85485"],
  "Edition": { "Id": "5", "__classname__": "Edition" },
  "Renditions": ["output"],
  "RequestMetaData": true,
  "RequestFiles": true }
```

Response: `ObjectPageInfos[]` → `{ MetaData, Pages[], Messages, MessageList }`;
each Page: `{ Width, Height, PageNumber, PageOrder, PageSequence, Edition,
Files[], Renditions, Orientation, Master, Instance }`;
each File: `{ Rendition: "output", Type: "application/pdf", FileUrl, EditionId, … }`.

`FileUrl` points at `…/server/transferindex.php?fileguid=<guid>&format=application%2Fpdf…`.

**Gotcha:** fetching the FileUrl as-is returns HTTP 400 `Please specify "ticket" param at URL`.
Appending `&ww-app=Content Station` makes the cookie session apply →
HTTP 200, verified real `%PDF-1.4` (cover page was 4.9 MB). Same pattern as the JPG
page previews the PO app itself loads.

### Brand / issue names

GetPagesInfo's `LayoutObjects` do NOT populate `Publication.Name` or
`Target.Issue.Name` (both come back empty), so the download filename can't be
built from the page model alone. Resolve names via `GetPublications`
(`RequestInfo: ['PubChannels','Issues','Editions']`) instead.

**Gotcha:** GetPublications **ignores `PublicationIds`** and returns every
brand (10 on this instance). Match the target brand by `Publication.Id`
explicitly, then walk its `PubChannels[].Issues[]` for the issue and its
`Editions[]`. Verified: brand 27 → "WW AI Testing", issue 301 → "Issue 001",
editions North=5 / South=6.

## 4. Route format (informational — currentFilterSetting() supersedes it)

`https://…/app/#/publication?brandId=27&categoryId=All&issueId=301&editionId=5&stateId=All`

## 5. Tile DOM (styling engine)

Angular components inside the iframe document:

```
po-spread-view > .spread-view > po-spread-component > .po-spread-component
  > po-page-component
      > .page-data-wrapper (contains preview <img class="portrait-image-holder">)
      > po-page-footer-component > .page-footer-wrapper[.right-page]
          > .bar-wrapper.wide-view
              > .page-number-bar > eos-ellipsable-text.page-number > span  ← page number text
              > .icon-bar > .status-icon | .flag-messages-icon | .sticky-notes-icon
                          | .vertical-line | .pdf-download-icon
```

- Tile → page mapping: page-number text ↔ `PageObjects[].PageNumber`.
- Preview `<img src>` does NOT expose a fileguid — don't rely on it for mapping.

## 6. Test bed

Brand "WW AI Testing" (id 27) → "Issue 001" (id 301), PubChannel 25 "Print",
editions North=5 / South=6, layout states Draft=686 / For Review=688 / Complete=689,
pages 820×1020 pt. 26 pages in edition North across 22 layouts.
