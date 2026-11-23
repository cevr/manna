### chrome-out-of-keychain

- **Date:** 2026-11-22
- **Kind:** owner
- **Said:** "a Chrome started headless or with a DevTools port and without `--use-mock-keychain --password-store=basic` puts a macOS keychain dialog on the owner's screen; the guard refuses such a launch."
- **Source:** dotfiles AGENTS.md → Environment, Browsers; p5/chrome-keychain/spec.md
- **Wrong:** The film's `chromeFlags` passed both keychain flags (chrome-launch-mock-keychain) but let a caller's own `--password-store=…` follow them, and Chrome takes the last of a repeated switch, so a caller could send Chrome back to the host's keychain. The First the Blade scripts, the ui and atom-solid browser tests and egw-search's Playwright config did not name either flag.
- **Cause:** The launcher owned only the profile and the debugging transport; the Playwright launchers relied on Playwright's own defaults.
- **Guard:** code: `packages/film/src/tools/chrome.test.ts` `keeps Chrome out of the host's keychain on macOS and Linux, whatever keychain flag the caller passes`
