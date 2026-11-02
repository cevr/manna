---
name: bible
description: >
  Generate teaching documents (sermon messages, topical studies, chapter
  readings, structural analyses: one scannable format), Sabbath School
  outlines and Keynote decks from a historic SDA pioneer perspective, and pull
  the source material (KJV verses, EGW writings and Bible Commentary, Strong's,
  SDA Hymnal, Sabbath School lesson PDFs) through the `manna` CLI. Use for:
  a corpus lookup (a bible verse, an EGW reference or quote, a Strong's number,
  a hymn, commentary on a verse, a Sabbath School PDF); a teaching ("generate a
  message/study/reading on X", sermon, structural analysis, chiasm, revising a
  teaching file); a Sabbath School week; a deck, slides or Keynote from a
  teaching; an export of a teaching to Apple Notes.
---

# bible — Content Generation

Generate teaching content in **one universal format** (organized by topic,
not output type) and keep an Apple-Notes copy in sync via the `manna` CLI.

## Pick the reference

```
What is the user asking for?
├─ Any teaching document — message, study, reading,
│  analysis (one format; `kind` is just a tag)     → references/teachings.md
├─ Keynote deck for a teaching document
│  (paintings + verses, full-bleed/split rhythm)   → references/decks.md
└─ Sabbath School week (guided session on one
   present-truth theme, from the lesson PDFs)      → references/sabbath-school.md
```

Both references contain: when-to-use, source-material commands, output shape,
frontmatter spec, and the export workflow. Sabbath School inherits the
teachings voice and markers; only its weekly mechanics differ.

**For every teaching, Sabbath School outline or deck**, the interpretive method is shared:
read [`references/hermeneutic.md`](references/hermeneutic.md) and
[Hermeneutic & Sources](#hermeneutic--sources-canonical--every-reference-inherits-this)
below first. Every output interprets Scripture by **Miller's Rules** and
draws only on the **EGW + SDA-pioneer (incl. William Miller) corpus** —
historic pioneer Adventism, not modern Adventism.

## Corpus, not memory (paramount)

Generate against the corpus, never against training data. Every verse, quote, refcode, date, attribution and every doctrinal framing in an output comes from what the `manna` CLI printed in this session (KJV, EGW, pioneers, commentary, Strong's). Training data carries mainstream and modern framings, misremembered wording and wrong references; the corpus is the pioneer record.

- **Fetch, then write.** Each quote and reference in the output was printed by a `manna` command in this session and is copied verbatim with its refcode.
- **Frame from the corpus.** What a doctrine is and what it includes (for example, whether justification only declares or also makes righteous) comes from the pioneers read in context, never from a familiar summary. Where the familiar summary and the corpus differ, follow the corpus and say so.
- **A gap stays a gap.** What the corpus does not hold is marked unsupported in the output; memory never fills it.
- **Name the speaker the page names.** A periodical or Bulletin hit is tagged with its volume's editor, not its speaker (1893 Bulletin sermons tag "General Conference"; Review hits tag the editor). Look up the issue page and name the speaker only from the sermon heading or signature.

## Topic Index

| File                           | Output            | Output dir                        | Filename pattern  |
| ------------------------------ | ----------------- | --------------------------------- | ----------------- |
| `references/teachings.md`      | Teaching document | `outputs/teachings/<topic-slug>/` | `<slug>.md`       |
| `references/decks.md`          | Keynote deck      | `outputs/decks/<slug>/`           | `<Deck Name>.key` |
| `references/sabbath-school.md` | SS week outline   | `outputs/sabbath-school/`         | `YYYY-QX-WY.md`   |

Not an output type, but used by both:
`references/source-material.md` — the `manna` CLI command surface for pulling
verses, EGW, commentary, Strong's, hymns, and SS PDFs (Phase 1 of the workflow).

Legacy trees (`outputs/{messages,studies,readings,analyses}/`) are frozen —
files stay for their live note IDs; new/regenerated content
goes to `outputs/teachings/`.

`manna` resolves `outputs/` against a build-time-baked CLI root, so commands
work from any cwd.

## Universal workflow (every reference follows this)

1. **Gather the cloud of witnesses** via the `manna` CLI (verses, EGW,
   pioneers, hymns, commentary, Strong's) — see
   [`references/source-material.md`](references/source-material.md).
   Don't paraphrase from memory.
2. **Generate the content yourself** using the format from the reference
   file — `manna` no longer has any AI generation commands.
3. **Write the file** to the reference's output dir with frontmatter
   (`created_at`, `topic`, `kind`, …).
4. **Check every quotation**: `manna check <file>` compares each
   `_Ref._ "…"` bullet with the KJV and each `[SOP]`/`[PIONEER]` line with
   the paragraph its refcode cites, and enforces the witness rules (no
   ellipsis, ≤30 words). It must print `0 problems` (exit 0) before export;
   fix each `file:line` it reports from a fresh `manna verse` / `egw lookup`.
5. **Export to Apple Notes**: `manna export -f <file> --folder "<Topic>"`
   (folder per topic, Title-Cased; reuse an existing folder when one fits —
   Sabbath School goes to `"sabbath school"`). Writes `apple_note_id` back
   into the frontmatter. Export runs the same check first and refuses
   (exit 1, nothing written to Notes) while any problem remains.
6. **Updates**: edit the file in place, then `manna export -f <file>` again
   (it re-checks, then updates the note `apple_note_id` names).

## Hermeneutic & Sources (canonical — every reference inherits this)

All interpretation in every output type follows **William Miller's Rules of
Interpretation**. The reference files set tone, shape, and output format; this
section sets the _method_. When a reference's system prompt and these rules
ever seem to disagree, the rules govern the interpretation.

The stance (literal historicism) and Miller's Rules are in [`references/hermeneutic.md`](references/hermeneutic.md). Read it before generating any teaching, Sabbath School outline or deck.

### Source corpus (in authority order)

- **Scripture (KJV)** — supreme, self-interpreting authority. Quote, don't
  paraphrase. Pull via `manna verse "<ref>" --json`.
- **Spirit of Prophecy (Ellen G. White)** — prophetic voice; a confirming
  witness _in harmony with_ Scripture (Isaiah 8:20), never an independent
  authority. Quote `paragraphs[].text` from `manna egw lookup` / `egw
  commentary`.
- **SDA pioneers — including William Miller**, plus Uriah Smith, J.N. Andrews,
  James White, J.N. Loughborough, and the broader Millerite/early-Advent
  corpus. Use for historicist framing, prophetic chronology, and the pioneer
  voice. Cite the pioneer by name when their reading shapes the take.

Do **not** introduce non-pioneer/non-EGW interpretive frameworks as authority.
EGW and the pioneers (Miller foremost) are the lens; Scripture is the rule.

### Finding EGW + pioneer references

You rarely start with the exact refcode. **Search to find it, then look it up to
quote it** — never recall EGW from memory:

```bash
manna egw search "investigative judgment" --json     # 1. find the refcode (local FTS5)
manna egw search "1844" --remote --json              #    --remote = whole ~17K-para corpus
manna egw lookup "GC 423.1" --json                   # 2. quote the exact paragraph text
manna egw commentary "daniel 8:14" --json            #    verse-keyed commentary
```

`lookup` takes any refcode a search printed, exactly as printed: books
(`GC 423.1`, `GC xii.2`, `LOF_ATJ 104.3`), periodicals
(`PTUK February 4, 1897, page 70.2`, `GCDB March 11, 1891, page 75.13`) and
letters (`11LtMs, Lt 1a, 1896, par. 14`). Most of the 1888 Jones/Waggoner
material is periodical — quote it, don't drop it.

For pioneer voices not in the local DB (Miller, Smith, Andrews, …), find the
book with `manna egw catalog --search "<title>"`, `manna egw download <CODE>`,
then `search` / `lookup` as above.

**Full command surface — flags, JSON shapes, every command — lives in
[`references/source-material.md`](references/source-material.md).** Read it
before pulling source material.

| Step               | Command                                                                             |
| ------------------ | ----------------------------------------------------------------------------------- |
| Fetch verses       | `manna verse "<ref>" --json`                                                        |
| Find EGW reference | `manna egw search "<query>" [--book CODE] [--remote] --json`                        |
| Fetch EGW          | `manna egw lookup "<refcode>" --json` / `manna egw commentary "<verse>" --json`     |
| Fetch hymn         | `manna hymns search "<query>" --json` / `manna hymns get <n> --json`                |
| Fetch Strong's     | `manna concordance H1234 --json`                                                    |
| Fetch SS PDFs      | `manna sabbath-school fetch -y 2026 -q 2 -w 5 --json`                               |
| Write file         | `Write` tool to `outputs/teachings/<topic-slug>/<slug>.md`                          |
| Check quotations   | `manna check <file>` (must report `0 problems` before export)                       |
| Initial export     | `manna export -f outputs/teachings/<topic>/<slug>.md --folder "<Topic>"`            |
| Update note        | `manna export -f outputs/teachings/<topic>/<slug>.md` (re-checks, updates in place) |
| List existing      | `manna <type> list [--json]`                                                        |
| Delete linked note | `manna <type> delete -f <file>`                                                     |

## Apple Notes idempotency contract

Every generated file must have frontmatter. The `apple_note_id` field is
what makes export/sync idempotent:

```yaml
---
created_at: '2026-05-08T14:00:00Z'
topic: 'Choose Ye This Day'
apple_note_id: 'x-coredata://.../ICNote/p1234' # ← written by `manna export`
---
```

- **No `apple_note_id`** → `manna export` creates the note, writes the ID back.
- **Has `apple_note_id`** → `manna export` updates that exact note.
- **Has `apple_note_id` + you want a fresh note** → `manna export -f <file> --force-create`.

## Anti-patterns

- **Don't generate without first pulling source material** through the `manna`
  CLI. The whole point of the toolchain is verse accuracy.
- **Don't paraphrase verses from memory** — quote what `manna verse` returns.
- **Don't paraphrase EGW** — quote `paragraphs[].text` from `manna egw lookup`.
- **Don't invent Strong's numbers or hymn numbers** — look them up.
- **Don't write to disk without frontmatter** — export needs `created_at`
  and uses `apple_note_id` for idempotency.
- **Don't export what `manna check` hasn't passed** — a mismatched or spliced
  quotation in Notes is the error the whole toolchain exists to prevent.
  `manna export` enforces this and refuses; fix the quotation, never work around it.
- **Don't skip the export step** — Cristian uses Apple Notes as the active
  surface. A file on disk that isn't in Notes is invisible.
