### chrome-launch-mock-keychain

- **Date:** 2026-11-17
- **Kind:** owner
- **Said:** "can we talk to the web tester to use the mock keychain? Because I keep getting spammed that the keychain doesn't exist or whatever"
- **Source:** hymnapp/mock-keychain/spec.md
- **Wrong:** The hymnal-exact web drive and the film launcher started Chrome for the DevTools protocol without `--use-mock-keychain` and `--password-store=basic`, so a run with HOME moved to a scratch folder found no login keychain and macOS asked the owner for one ("A keychain cannot be found") on every launch.
- **Cause:** Playwright adds both flags to its own launches, and Exact's agent passes them, so the launchers written by hand copied Playwright's other flags but not these; nothing read a hand-written launch's arguments.
- **Guard:** lint:manna/chrome-mock-keychain, proof `packages/scripts/lint/chrome-mock-keychain.test.ts` `a DevTools launch without both keychain flags is reported: %s`
