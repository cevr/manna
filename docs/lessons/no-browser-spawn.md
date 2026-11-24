### no-browser-spawn

- **Date:** 2026-11-23
- **Kind:** owner
- **Said:** "advise whoever was opening it to stop using chrome and use a real testing framework"
- **Source:** hymnapp/hy-web-playwright/spec.md
- **Wrong:** The hymnal port's release-site drive (`apps/hymnal-exact/tools/drive-web.ts`) started Chrome for Testing itself through a hand-rolled launcher (`tools/web/chrome.ts`: `Bun.spawn` of the binary with a DevTools port, the protocol spoken over its socket), so an agent's run put a browser of its own making on the owner's machine.
- **Cause:** The drive needed the network's bytes and a profile kept across a close, and the launcher was written to reach the DevTools protocol directly, where Playwright gives both: a persistent context on a profile folder and a DevTools session to the page (`newCDPSession`).
- **Guard:** lint:manna/no-browser-spawn, proof `packages/scripts/lint/no-browser-spawn.test.ts` `a process started on a browser is reported: %s`; lint:manna/no-browser-spawn, proof `packages/scripts/lint/no-browser-spawn.test.ts` `a browser driver other than Playwright is reported, its import and each launch bound to it: %s`
