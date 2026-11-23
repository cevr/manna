### chrome-out-of-keychain

- **Date:** 2026-11-22
- **Kind:** owner
- **Said:** "a Chrome started headless or with a DevTools port and without `--use-mock-keychain --password-store=basic` puts a macOS keychain dialog on the owner's screen; the guard refuses such a launch."
- **Source:** dotfiles AGENTS.md → Environment, Browsers; p5/chrome-keychain/spec.md
- **Wrong:** The film's Chrome (openView's `chromeFlags`), the First the Blade scripts and the browser tests launched Chrome headless without the two keychain flags, so a launch asked the host's keychain or was refused by the host's guard.
- **Cause:** The launchers listed the flags they needed for quiet, sound and the GPU; nothing named the keychain.
- **Guard:** code: `packages/film/src/tools/chrome.test.ts` `keeps Chrome out of the host's keychain on macOS and Linux, whatever keychain flag the caller passes`
