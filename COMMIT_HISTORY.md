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
