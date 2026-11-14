### swift-declaration-typegen-bytes

- **Date:** 2026-11-14
- **Kind:** review
- **Said:** "the hymnal dev server rewrites apps/hymnal/native/{feel/Voice,tuner/Listen}.d.swift.ts on boot."
- **Source:** hymnapp/batch-vb-43-findings.md o3 (On base, its third item)
- **Wrong:** The hymnal's committed `Voice.d.swift.ts` and `Listen.d.swift.ts` carried oxfmt's semicolons, and One's typegen writes none, so every dev-server boot left the checkout dirty.
- **Cause:** Both files were committed before oxfmt ignored `**/*.d.swift.ts`, and their guards stripped semicolons and asked only that the file contain the typegen's output, so a formatted copy passed.
- **Guard:** code: `apps/hymnal/src/feel/guard.test.ts` `is byte for byte what One’s typegen writes for Voice.swift, so the dev server’s boot leaves it unchanged`; code: `apps/hymnal/src/tuner/guard.test.ts` `is byte for byte what One’s typegen writes for Listen.swift, so the dev server’s boot leaves it unchanged`
