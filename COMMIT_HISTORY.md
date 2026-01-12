| commit id | description | question I asked | answer you gave | timestamp |
| --- | --- | --- | --- | --- |
| pending | Use Playwright iPhone device profile for mobile snapshots | try iphone device then | Use Playwright iPhone device defaults; env overrides still apply | 2026-01-11 16:18:38 |
| pending | Mobile stealth matches iPhone platform/vendor/touch | still not mobile. when i open the merriam in a browser and reduce the width to mobile, Iget a mobile site | Make stealth script mobile-aware so it doesn't force Win32/desktop hints | 2026-01-11 19:14:19 |
| pending | Separate persistent profile for mobile snapshots | do any. still shows the side bars that are not present on mobile | Isolate mobile profile data so desktop cookies/flags don't force desktop layout | 2026-01-11 19:18:35 |
| pending | Remove userAgentData for mobile stealth | not working. still get sidebars | Hide Chromium UA-CH to mimic Safari and force UA fallback | 2026-01-11 19:21:51 |
| pending | Strip client hints; sync screen to viewport | maybe it uses the width | Remove sec-ch- headers for mobile and align screen size with viewport | 2026-01-11 19:24:21 |
| pending | Use WebKit for mobile snapshots | switch | Run mobile snapshots with Playwright WebKit instead of Chromium | 2026-01-11 19:29:22 |
| pending | Fix WebKit selection scoping bug | {    "detail": "Snapshot failed. (UnboundLocalError: cannot access local variable 'playwright' where it is not associated with a value)" } | Move browser selection inside Playwright context | 2026-01-11 19:31:20 |
