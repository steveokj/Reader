| commit id | description | question I asked | answer you gave | timestamp |
| --- | --- | --- | --- | --- |
| pending | Use Playwright iPhone device profile for mobile snapshots | try iphone device then | Use Playwright iPhone device defaults; env overrides still apply | 2026-01-11 16:18:38 |
| pending | Mobile stealth matches iPhone platform/vendor/touch | still not mobile. when i open the merriam in a browser and reduce the width to mobile, Iget a mobile site | Make stealth script mobile-aware so it doesn't force Win32/desktop hints | 2026-01-11 19:14:19 |
| pending | Separate persistent profile for mobile snapshots | do any. still shows the side bars that are not present on mobile | Isolate mobile profile data so desktop cookies/flags don't force desktop layout | 2026-01-11 19:18:35 |
| pending | Remove userAgentData for mobile stealth | not working. still get sidebars | Hide Chromium UA-CH to mimic Safari and force UA fallback | 2026-01-11 19:21:51 |
| pending | Strip client hints; sync screen to viewport | maybe it uses the width | Remove sec-ch- headers for mobile and align screen size with viewport | 2026-01-11 19:24:21 |
| pending | Use WebKit for mobile snapshots | switch | Run mobile snapshots with Playwright WebKit instead of Chromium | 2026-01-11 19:29:22 |
| pending | Fix WebKit selection scoping bug | {    "detail": "Snapshot failed. (UnboundLocalError: cannot access local variable 'playwright' where it is not associated with a value)" } | Move browser selection inside Playwright context | 2026-01-11 19:31:20 |
| pending | Inject mobile viewport CSS/meta | add css viewport | Add meta viewport + @viewport CSS for mobile snapshots | 2026-01-11 19:32:55 |
| pending | Log snapshot settings | add a print for sanity check. ;let me see whats going in | Add optional snapshot logging for viewport/UA/settings | 2026-01-11 19:38:40 |
| pending | Load .env before route imports | this is wild! so it is ignoring the vars set. look at the env. | Make main load repo .env before reading envs in routes | 2026-01-11 19:44:14 |
| pending | Keep mobile snapshots on Chromium | keep on chromium | Force Chromium for mobile snapshots to avoid WebKit install | 2026-01-11 19:48:00 |
| pending | Fix stealth script braces | [api] NameError: name 'get' is not defined. Did you mean: 'set'? | Escape JS object braces in init script | 2026-01-11 19:53:53 |
| pending | Allow empty WAIT_MS | [api] ValueError: invalid literal for int() with base 10: '' | Treat empty WAIT_MS as default 800 | 2026-01-11 20:06:20 |
| pending | Force .env override of process env | do it. and tell me more about override | Ensure .env wins over existing env vars | 2026-01-11 20:32:35 |
| pending | Make lookup panel full-screen modal | ok. look at the explore modal that pops up when the explore button is clicked on the navbar. make the modal of this be as full screen and fixed as that. | Switch lookup panel to a full-screen fixed modal like Explore | 2026-01-11 20:52:35 |
| pending | Avoid duplicate full-page captures | no. i want the full page. just dont wantt it twice | Use tall viewport capture mode for full-page screenshots | 2026-01-11 21:14:09 |
| pending | Disable sticky/fixed for full-page | still there. now instead of twice it is 1 page and maybe 10% of the same page | Strip sticky/fixed positioning before full-page capture | 2026-01-11 21:20:01 |
| pending | Element-based full-page capture for Merriam | nope. now it is back to 3x. | Screenshot the main element for Merriam full-page to avoid duplication | 2026-01-11 21:28:32 |
| pending | Use Merriam redesign container for full-page | try this element: <div class="redesign-container"> | Use .redesign-container as the Merriam screenshot element | 2026-01-11 21:42:43 |
| aa7d5e8 | Default lookup provider to Vocabulary | Back to 1.25x. Lets ignnore for now and move from merriam back to vocabulary.com | Switch lookup provider defaults to vocabulary.com | 2026-01-11 21:45:57 |
| pending | Add lookup provider toggle + centered spinner | perfect. add the toggle. also while waiting for it to load, I current get loading snapshot.. in the top left. Instead lets have a spinner in the middle with loading snapshot. | Add provider switcher and centered loading overlay | 2026-01-11 21:50:43 |
| 78c503c | Refine lookup header actions | perfect. for some reason when i hit the toggle from vocab to merriam, i get no 1.25x, and it is normal. some ui changes, the background color of the loading screenshot should match the current psnel setting. change open on merriam, refresh, and close buttons to icons underneath the toggle. | Move actions to icon row under toggle and theme overlay | 2026-01-11 21:58:23 |
| 5cb6d30 | Seed reader theme from stored value | perfect. when i refresh the page, i get white background before the dark settings come in for an book. i think sometime we fixed it by using server cookies or so. the loading screen before a book loads is white before changes are effected. can you look this up | Initialize reader settings theme from dataset/localStorage | 2026-01-11 22:04:27 |
| 9d73827 | Keep html theme in sync | wtf...when i refresh, the settings go away. dark mode is selected but i have the theme of sepia | Always sync html data-reader-theme with selected theme | 2026-01-11 22:11:14 |
| 751bb59 | Auto-reset mismatched theme colors | still shows sepia. i clicked on sepia in settings, refreshed and got sepia. i clicked dark, refreshed and got sepia while dark is still selected | Fix theme color values if they match another theme's defaults | 2026-01-11 22:16:56 |
| b752d0d | Detect theme colors copied from another theme | still happening. look carefully..why does it switch when colors are changed, inline styles right? then how come it is different on reload | Reset theme colors if they match another theme's current colors | 2026-01-11 22:22:26 |
| 06fe7bb | Set initial theme background inline | do 2 | Inline theme background in layout to avoid flash | 2026-01-11 23:39:08 |
| b452b7b | Artifact action menus + explore persistence | saved automatically; use position; double click only | Add artifact menus, auto-save explore responses, child additions | 2026-01-12 17:28:29 |
| pending | Fix artifact menu layering + styling | adjust artifact menu style/position; modals should not be hidden; how to save highlights | Raise z-index, add artifact menu class; markers save instantly | 2026-01-12 18:35:36 |
| pending | Align artifact menu + marker labels | fix artifact menu position/size/colors; artifact markers show as selection | Clamp menu position + style; label addition markers as artifacts | 2026-01-12 18:45:27 |
| pending | Mobile artifact menu style | artifact modal should match mobile action modal | Add mobile variant styling + pass isMobile to artifact menu | 2026-01-12 18:53:53 |
| pending | Center mobile artifact menu + transparency | artifact menu should mirror mobile action modal transparency | Wrap in mobile panel + remove opaque mobile background | 2026-01-12 19:00:51 |
| pending | Show artifact sources in additions | note on explore response shows as selection note | Label additions sourced from artifacts in highlights | 2026-01-12 19:11:47 |
| pending | Cache highlights bundles | keep last bundles in state; refresh in background | Keep cached bundles; only show loading on first load | 2026-01-12 19:18:19 |
| pending | Cache highlights + refresh spinner | keep last bundles; background refresh with spinner | Module cache for highlights + refreshing indicator | 2026-01-12 19:21:46 |
| pending | Refresh highlights on mutation only | use cached bundles; update on server mutations only | Add refresh signals + selection-level updates + refresh spinner | 2026-01-12 19:35:36 |
| pending | Fix highlights refresh loop | infinite refetch after addition | Use refs for bundles/sections to stabilize refresh callbacks | 2026-01-12 19:43:53 |
| pending | Avoid reprocessing refresh signal | reopen highlights re-fetches selection | Track last refresh key to prevent replay on reopen | 2026-01-12 19:46:27 |
| pending | Persist highlights refresh key | reopen replays last refresh signal | Cache last refresh key per document to avoid reprocessing | 2026-01-12 19:49:50 |
| 39652dc | Add highlight detail modal for highlights items | Double-click highlights items to open type-specific detail modal with notes/audio/explore/grammar and markers. | Added highlight detail modal, wired double-click, marker toggles, banner notes/audio, and styling. | 2026-01-12 21:48:09 |
| 5b8a0c3 | Make highlight detail modal fullscreen | nice job. make the highlight detail modal full page like the explore and grammar modal... | Fullscreen highlight detail modal with top header + close icon. | 2026-01-12 21:59:27 |
| bb25547 | Portal highlight detail modal fullscreen | did u make the changes? still the same thing | Portal highlight modal to body; remove card border/shadow for true fullscreen | 2026-01-12 22:05:36 |
| bda8f30 | Prevent highlight modal close on inner click | nice..when i click anywhere on the highlight detail modal it closes. | Only close highlight modal when clicking backdrop, not inner content. | 2026-01-12 22:09:51 |
| 66fc03e | Disable backdrop close for highlight modal | not it should not exit unless i click the x button | Remove backdrop click handler so modal only closes via X. | 2026-01-12 22:11:42 |
| d85bb41 | Keep highlights panel open during detail modal | it still exits.remember, it should exit and the highlights tab shld still be open behind | Block mobile bar auto-close while highlight detail modal is open. | 2026-01-12 22:17:04 |
| 97d6fcb | Refine highlight detail modal layout | nice. move the markers to the top under the close icon... | Move markers into top bar, tighten padding, enable snapshot scroll, match reader colors. | 2026-01-12 22:29:02 |
| 9ce1f1e | Fix highlight detail modal JSX | [web] Parsing ecmascript source code failed ... Unterminated regexp literal | Rewrote highlight modal JSX block to resolve parse error. | 2026-01-12 22:37:21 |
| 09e05bf | Add initial map page shell | map is good. standalone for now. add. global but i want to save searches to a book just like grammar. hold off. | Add /map route with MapLibre shell, search bar, and placeholder panels. | 2026-01-12 23:17:38 |
| e7a88b4 | Bump maplibre-gl to available version | npm install failed (No matching version found for maplibre-gl@^4.7.2). | Update maplibre-gl to ^5.16.0 (latest available). | 2026-01-12 23:28:08 |
| 3b6444a | Add countries dataset to map | ok. next phase | Load countries GeoJSON + layers, add map toast error style, update lockfile. | 2026-01-12 23:32:49 |
| 67655df | Load countries after map init | ----cant see countries | Attach country layer load to map init so data renders. | 2026-01-12 23:37:06 |
| ad65625 | Fix map sizing and world wrap | works now. it starts off small in a way. can see africa twicwe | Disable world copies, constrain bounds, ensure resize + CSS import. | 2026-01-12 23:43:22 |
| 81c227a | Guard map max bounds | Cannot read properties of null (reading '0') ... setMaxBounds | Defer max bounds with try/catch and retry on load. | 2026-01-12 23:44:41 |
| b3a35bc | Guard map resize timing | Cannot read properties of null (reading '0') ... map.resize | Only resize when mapRef exists and not cancelled. | 2026-01-12 23:45:32 |
| 46b78f3 | Remove map resize timeout | Cannot read properties of null (reading '0') ... map.resize | Drop delayed resize and use load/resize handler only. | 2026-01-12 23:46:34 |
| c97cb86 | Add map loading indicator | cant see anything.does it take time to load? | Show loading toast and ensure map canvas fills the shell. | 2026-01-12 23:53:56 |
| 19a60f5 | Add map loading modal | doesnt disappear. give me a loading modal and spinner | Show centered loading modal with spinner overlay. | 2026-01-12 23:57:09 |
| 830355d | Defer map max bounds until load | still spiinning. Map bounds not ready yet TypeError... | Remove pre-load maxBounds call; set bounds only after map load. | 2026-01-13 00:01:22 |
| 008b778 | Guard map resize on load | Cannot read properties of null (reading '0') ... map.resize | Wrap resize in try/catch to avoid maplibre null error. | 2026-01-13 00:04:42 |
| 26f8f73 | Remove map bounds and resize hooks | Map bounds failed on load ... Map resize failed on load | Drop bounds/resize hooks entirely to avoid maplibre null errors. | 2026-01-13 00:06:54 |
| 0626c00 | Add query fit bounds for countries | perfect. can see them now. implement next phase | Parse query, resolve countries, fit bounds, and highlight selections. | 2026-01-13 00:09:19 |
| 02e25cb | Add country label toggles | 1 | Add label layers and toggles (none/selected/all), plus selected-country filters. | 2026-01-13 00:12:43 |
| 2ff1a96 | Normalize map query parsing | ensureLabelLayers is not defined | Clean query normalization + loading label string to avoid non-ASCII artifacts. | 2026-01-13 00:16:01 |
| 226f08f | Deduplicate country labels | yes- | Build label point source per ISO2 to avoid duplicate labels. | 2026-01-13 00:21:04 |
| 54958f1 | Add city labels toggle | Ok. Add cities now | Load city GeoJSON on demand and toggle city labels. | 2026-01-13 00:24:26 |
| ad56af2 | Add city and state label filtering | Nice, city labels should befor only selected country if thats selected. also add state labels too | Filter city labels by selected countries and add US state label toggle. | 2026-01-13 00:30:54 |
| 581a09b | Filter state labels by selection | -I want all states for all countries... | Show global state/province labels and filter by selected countries when needed. | 2026-01-13 00:35:00 |
| 95dd20c | Show global state labels | -I want all states for all countries...if selected only is on... | Make state labels global by default and add loading toasts. | 2026-01-13 00:41:11 |
| d53cd46 | Update states dataset | State labels not working | Replace states dataset with full global admin-1 boundaries. | 2026-01-13 00:48:26 |
| 15a9474 | Add state border lines | perfect. can i get lines now. like demarcation of states just like in google maps | Add state/province border line layer and tie it to the toggle. | 2026-01-13 00:52:13 |
| ccbf3e5 | Keep state borders always visible | yes.always on. cant even see them | Always show state borders while keeping label filter for selection. | 2026-01-13 00:55:55 |


| f547923 | Increase state border contrast | still cant see them. might be the color? | Increase state border contrast for state borders. | 2026-01-13 00:59:24 |
| 82bf598 | Fix state borders source | theres a problem. cant see country borders and state borders. reason why. dont thinl it is opacity or color related as that was changed | Use the full state geometry for borders (not label points) and slightly strengthen country outlines. | 2026-01-13 01:02:56 |
| b92f791 | Use label_x for state labels | 1 | Use Natural Earth label_x/label_y for state label placement with bbox fallback. | 2026-01-13 01:09:55 |
| 1ffe6a8 | Use latitude/longitude for state labels | didnt work. | Use Natural Earth longitude/latitude fields for state label placement (label_x fallback). | 2026-01-13 01:12:50 |
| 7c503e9 | Use country label points dataset | proceed | Add Natural Earth country label points dataset and build label source from ISO3 matches. | 2026-01-13 01:18:09 |
| 8c31093 | Add toggle for state borders | make state lines a toggle but country lines permanent | Add a separate state/province borders toggle and wire visibility to it. | 2026-01-13 01:21:08 |
| 45e8d62 | Tie state borders to labels toggle | yes i want | Tie state borders visibility to the state labels toggle and update toggle text. | 2026-01-13 01:23:42 |
| 1b6dedb | Filter state borders by selection | for selected only..it shows states for selected only but state borders for every county | Apply selected-country filter to state borders alongside state labels. | 2026-01-13 01:25:17 |
| 2b956d4 | Add ocean fill layer | --perfect. can i get oceans? | Add Natural Earth ocean polygons and render a light ocean fill. | 2026-01-13 01:28:20 |
| c3b4133 | Add ocean labels | yes | Add ocean name labels from marine polys and render them on the map. | 2026-01-13 01:34:22 |
| b72af38 | Add seas and gulfs labels | add seas and gulfs. also name positioning sucks | Use marine polys directly for labels (ocean/sea/gulf) so placement uses polygon centroids instead of bbox. | 2026-01-13 01:39:07 |
| bad5106 | Add focus seas toggle | --give mea toggle...Gulf of Mexico and Mediteranen only... | Add a seas focus toggle that filters marine labels to Gulf of Mexico + Mediterranean (oceans still show). | 2026-01-13 01:47:17 |
| a4a19c1 | Adopt Google-style map styling | seas toggle is already done. begin the editing for the google maps styling. dont stop until done | Switched map to OSM Liberty style + Google-like land/water colors; Roboto labels + transparent country fill. | 2026-01-13 02:06:44 |
| 1e91805 | Switch map to Natural Earth raster basemap with relief; point map style URL to new style file; note package.json change was already staged. | Wants arid/green look without roads; focus on countries, states, cities. | Added Natural Earth raster basemap style and updated MapPage; noted unintended package.json change in commit and asked how to proceed; offered next steps for higher-res tiles or tuning. | 2026-01-14 22:11:15 |
| 6f655dc | Boost country border contrast and desaturate/brighten raster basemap to reduce orange tones. | Nice. No country borders in Americas. Also why is Canada orange? | Adjusted country border styling and reduced basemap saturation/contrast to soften orange; asked to verify. | 2026-01-14 22:21:04 |
