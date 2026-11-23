### chrome-keychain-switch-spelling

- **Date:** 2026-11-22
- **Kind:** review
- **Said:** "The filter only recognizes double-dash spellings. … Chromium's POSIX parser accepts one or two dashes and resolves both to the same switch key, so a later caller-supplied value can take precedence"
- **Source:** p5/chrome-keychain/round-2-findings.md M1
- **Wrong:** `chromeFlags` dropped a caller's `--password-store…` and `--use-mock-keychain…` by string prefix, so `-password-store=…`, `-use-mock-keychain` or a whitespace-padded spelling passed through after the launcher's pair and could override it.
- **Cause:** The owned flags were matched as written strings, not as the switch key Chromium reads (ASCII whitespace trimmed, `--` or `-` stripped, the key up to `=`).
- **Guard:** code: `packages/film/src/tools/chrome.test.ts` `keeps Chrome out of the host's keychain on macOS and Linux, whatever keychain flag the caller passes`
